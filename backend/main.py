import json
import os
import random
import re
import time
import urllib.request
from datetime import datetime, timezone
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS

from extractor import extract_document_from_bytes, optimize_and_clean_text
from vectordb import HybridVectorDatabase
from llm_engine import (
    OFFLINE_MODEL_PORTAL_CATALOG,
    reshape_user_prompt,
    scan_local_model_path,
    synthesize_answer_and_verify,
)
from seed_corpus import SEED_CORPUS_DOCUMENTS

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
DATA_DIR = os.path.join(WORKSPACE_ROOT, "data")

app = Flask(__name__)
CORS(app)

vector_db = HybridVectorDatabase(DATA_DIR)
sql_db = vector_db.sql_db

default_config: Dict[str, Any] = {
    "reshaperProvider": "builtin_local",
    "reshaperModel": "Qwen2.5-3B-Instruct-Q5_K_M",
    "generatorProvider": "builtin_local",
    "generatorModel": "Llama-3.1-8B-Instruct-Q4_K_M",
    "apiKeys": {
        "openai": "",
        "gemini": "",
        "anthropic": "",
        "groq": "",
        "openrouter": "",
    },
    "localEndpoints": {
        "ollamaUrl": "http://localhost:11434",
        "lmStudioUrl": "http://localhost:1234/v1",
    },
    "offlineModelPath": os.path.join(WORKSPACE_ROOT, "models", "Qwen2.5-3B-Instruct-Q4_K_M.gguf"),
    "defaultChunkStrategy": "semantic",
    "autoOptimizeChunking": True,
    "targetChunkTokens": 150,
    "chunkOverlapTokens": 30,
    "distanceMetric": "cosine",
    "hybridAlpha": 0.65,
    "mmrLambda": 0.78,
    "topKInitial": 10,
    "topKReranked": 5,
    "enableHyde": True,
    "enableMultiQuery": True,
    "enableStepBack": True,
    "enableCrossEncoderRerank": True,
    "enableCragFilter": True,
    "cragThreshold": 0.34,
}

persisted_cfg = sql_db.load_pipeline_config()
active_config: Dict[str, Any] = {**default_config, **(persisted_cfg or {})}
sql_db.save_pipeline_config(active_config)

query_history: List[Dict[str, Any]] = sql_db.load_query_history(20)


def seed_database_if_empty():
    if vector_db.get_document_count() == 0:
        for seed in SEED_CORPUS_DOCUMENTS:
            cleaned_text, telemetry = optimize_and_clean_text(
                seed["rawText"],
                seed["ocrUsed"],
                seed["ocrConfidence"],
            )
            vector_db.ingest_document(
                title=seed["title"],
                filename=seed["filename"],
                doc_format=seed["format"],
                raw_text=seed["rawText"],
                cleaned_text=cleaned_text,
                extraction_telemetry=telemetry,
                auto_optimize=True,
                target_chunk_tokens=active_config["targetChunkTokens"],
                chunk_overlap_tokens=active_config["chunkOverlapTokens"],
                doc_id=seed["id"],
            )


def execute_rag_pipeline(prompt: str, config_used: Dict[str, Any]) -> Dict[str, Any]:
    all_chunks = vector_db.get_all_chunks()
    corpus_keywords: List[str] = []
    for c in all_chunks:
        for kw in c.get("keywords", []):
            if kw not in corpus_keywords:
                corpus_keywords.append(kw)
    corpus_keywords = corpus_keywords[:50]

    prompt_reshape = reshape_user_prompt(prompt, corpus_keywords, config_used)
    retrieval = vector_db.hybrid_retrieve_and_rerank(
        original_prompt=prompt,
        reshaped_primary_query=prompt_reshape["reshapedPrimaryQuery"],
        sub_queries=prompt_reshape["subQueries"],
        hyde_document=prompt_reshape["hydeDocument"],
        config=config_used,
    )
    synthesis = synthesize_answer_and_verify(
        prompt_reshape=prompt_reshape,
        retrieved_chunks=retrieval["retrievedChunks"],
        pruned_noise_chunks=retrieval["prunedNoiseChunks"],
        config=config_used,
        timings=retrieval["timings"],
    )

    resp_obj = {
        "queryId": f"qry_{int(time.time() * 1000)}_{random.randint(100, 999)}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "promptReshape": prompt_reshape,
        "retrievedChunks": retrieval["retrievedChunks"],
        "prunedNoiseChunks": retrieval["prunedNoiseChunks"],
        "queryCoords2D": retrieval["queryCoords2D"],
        "hydeCoords2D": retrieval["hydeCoords2D"],
        "answer": synthesis["answer"],
        "citations": synthesis["citations"],
        "claimVerifications": synthesis["claimVerifications"],
        "metrics": synthesis["metrics"],
        "activeConfig": dict(config_used),
    }

    sql_db.record_query_run(resp_obj)
    query_history.insert(0, resp_obj)
    if len(query_history) > 25:
        query_history.pop()
    return resp_obj


seed_database_if_empty()

if not query_history:
    boot_resp = execute_rag_pipeline(
        "How does HNSW vector indexing combine with Reciprocal Rank Fusion (RRF), adaptive chunking strategies, and Small LLM HyDE prompt reshaping to improve retrieval precision?",
        active_config,
    )
    if not sql_db.list_saved_findings():
        sql_db.save_finding({
            "findingId": "fnd_seed_hnsw_benchmark",
            "queryId": boot_resp["queryId"],
            "title": "HNSW + RRF Hybrid Retrieval & Adaptive Chunking Benchmark Audit",
            "prompt": boot_resp["promptReshape"]["originalPrompt"],
            "reshapedQuery": boot_resp["promptReshape"]["reshapedPrimaryQuery"],
            "synthesizedAnswer": boot_resp["answer"],
            "analystNotes": "Baseline benchmark validating 3-layer HNSW + BM25+ RRF (alpha=0.65) and Small LLM HyDE prompt reshaping.",
            "tags": ["HNSW_INDEX", "RRF_FUSION", "HYDE_RESHAPER", "BENCHMARK"],
            "citations": boot_resp["citations"],
            "claimVerifications": boot_resp["claimVerifications"],
            "metrics": boot_resp["metrics"],
        })


@app.route("/api/state", methods=["GET"])
def get_state():
    docs = vector_db.get_all_documents()
    chunks = [
        {
            "id": c["id"],
            "documentId": c["documentId"],
            "documentTitle": c["documentTitle"],
            "documentFormat": c["documentFormat"],
            "index": c["index"],
            "parentChunkId": c.get("parentChunkId"),
            "parentContext": c.get("parentContext"),
            "sectionPath": c["sectionPath"],
            "content": c["content"],
            "tokenCount": c["tokenCount"],
            "charCount": c["charCount"],
            "strategy": c["strategy"],
            "coherenceScore": c["coherenceScore"],
            "informationDensity": c["informationDensity"],
            "keywords": c["keywords"],
            "coords2D": c["coords2D"],
        }
        for c in vector_db.get_all_chunks()
    ]

    masked_keys = {}
    for k, val in active_config.get("apiKeys", {}).items():
        masked_keys[k] = ("••••••••" + val[-4:]) if val and len(val) >= 4 else ""

    safe_config = {
        **active_config,
        "apiKeys": masked_keys,
    }

    return jsonify({
        "documents": docs,
        "chunks": chunks,
        "stats": vector_db.get_vectordb_stats(),
        "config": safe_config,
        "latestQuery": query_history[0] if query_history else None,
        "queryHistory": query_history[:15],
        "savedFindings": sql_db.list_saved_findings(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
        "modelPortalCatalog": OFFLINE_MODEL_PORTAL_CATALOG,
    })


@app.route("/api/ingest/upload", methods=["POST"])
def ingest_upload():
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    auto_opt_raw = request.form.get("autoOptimize")
    if auto_opt_raw is not None:
        auto_opt = str(auto_opt_raw).lower() in ("true", "1", "yes")
    else:
        auto_opt = bool(active_config.get("autoOptimizeChunking", True))

    preferred_strategy = request.form.get("strategy") or active_config.get("defaultChunkStrategy", "semantic")
    target_tokens = int(request.form.get("targetChunkTokens") or active_config.get("targetChunkTokens", 150))
    overlap_tokens = int(request.form.get("chunkOverlapTokens") or active_config.get("chunkOverlapTokens", 30))

    ingested_docs = []
    for f in files:
        file_bytes = f.read()
        orig_name = f.filename or "uploaded_document.txt"
        mime_type = f.mimetype or ""
        stored_path = sql_db.save_uploaded_raw_file(orig_name, file_bytes)

        extracted = extract_document_from_bytes(file_bytes, orig_name, mime_type)
        base_title = re.sub(r"[_-]+", " ", os.path.splitext(orig_name)[0]).strip() or orig_name

        doc = vector_db.ingest_document(
            title=base_title,
            filename=orig_name,
            doc_format=extracted["format"],
            raw_text=extracted["rawText"],
            cleaned_text=extracted["cleanedText"],
            extraction_telemetry=extracted["telemetry"],
            auto_optimize=auto_opt,
            preferred_strategy=preferred_strategy,
            target_chunk_tokens=target_tokens,
            chunk_overlap_tokens=overlap_tokens,
        )
        doc["storedFilePath"] = stored_path
        doc_chunks = [c for c in vector_db.get_all_chunks() if c["documentId"] == doc["id"]]
        sql_db.upsert_document_and_chunks(doc, doc_chunks, stored_file_path=stored_path)
        ingested_docs.append(doc)

    return jsonify({
        "success": True,
        "ingestedDocuments": ingested_docs,
        "stats": vector_db.get_vectordb_stats(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/ingest/text", methods=["POST"])
def ingest_text():
    body = request.get_json(force=True, silent=True) or {}
    content = str(body.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Document content is required."}), 400

    title = str(body.get("title") or "").strip() or f"Technical Specification {vector_db.get_document_count() + 1}"
    doc_format = str(body.get("format") or "MARKDOWN")
    auto_opt = bool(body.get("autoOptimize", active_config.get("autoOptimizeChunking", True)))
    strategy = str(body.get("strategy") or active_config.get("defaultChunkStrategy", "semantic"))
    target_tokens = int(body.get("targetChunkTokens") or active_config.get("targetChunkTokens", 150))
    overlap_tokens = int(body.get("chunkOverlapTokens") or active_config.get("chunkOverlapTokens", 30))

    cleaned_text, telemetry = optimize_and_clean_text(content, False, 100.0)
    filename_slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_") + ".md"
    stored_path = sql_db.save_uploaded_raw_file(filename_slug, content.encode("utf-8"))

    doc = vector_db.ingest_document(
        title=title,
        filename=filename_slug,
        doc_format=doc_format,
        raw_text=content,
        cleaned_text=cleaned_text,
        extraction_telemetry=telemetry,
        auto_optimize=auto_opt,
        preferred_strategy=strategy,
        target_chunk_tokens=target_tokens,
        chunk_overlap_tokens=overlap_tokens,
    )
    doc["storedFilePath"] = stored_path
    doc_chunks = [c for c in vector_db.get_all_chunks() if c["documentId"] == doc["id"]]
    sql_db.upsert_document_and_chunks(doc, doc_chunks, stored_file_path=stored_path)

    return jsonify({
        "success": True,
        "document": doc,
        "stats": vector_db.get_vectordb_stats(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/documents/<doc_id>/rechunk", methods=["POST"])
def rechunk_doc(doc_id: str):
    body = request.get_json(force=True, silent=True) or {}
    strategy = str(body.get("strategy") or "semantic")
    target_tokens = int(body.get("targetChunkTokens") or active_config.get("targetChunkTokens", 150))
    overlap_tokens = int(body.get("chunkOverlapTokens") or active_config.get("chunkOverlapTokens", 30))

    updated = vector_db.rechunk_document(doc_id, strategy, target_tokens, overlap_tokens)
    if not updated:
        return jsonify({"error": "Document not found."}), 404

    return jsonify({
        "success": True,
        "document": updated,
        "stats": vector_db.get_vectordb_stats(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/documents/<doc_id>", methods=["DELETE"])
def delete_doc(doc_id: str):
    deleted = vector_db.delete_document(doc_id)
    return jsonify({
        "success": deleted,
        "stats": vector_db.get_vectordb_stats(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/corpus/reset", methods=["POST"])
def reset_corpus():
    for doc in list(vector_db.get_all_documents()):
        vector_db.delete_document(doc["id"])
    seed_database_if_empty()
    return jsonify({
        "success": True,
        "documents": vector_db.get_all_documents(),
        "stats": vector_db.get_vectordb_stats(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/query", methods=["POST"])
def query_rag():
    body = request.get_json(force=True, silent=True) or {}
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    overrides = body.get("configOverrides") or {}
    merged_config = {
        **active_config,
        **overrides,
        "apiKeys": {
            **active_config.get("apiKeys", {}),
            **(overrides.get("apiKeys") or {}),
        },
        "localEndpoints": {
            **active_config.get("localEndpoints", {}),
            **(overrides.get("localEndpoints") or {}),
        },
    }

    resp_obj = execute_rag_pipeline(prompt, merged_config)
    return jsonify(resp_obj)


@app.route("/api/findings", methods=["GET"])
def get_findings():
    return jsonify({
        "findings": sql_db.list_saved_findings(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/findings", methods=["POST"])
def create_finding():
    body = request.get_json(force=True, silent=True) or {}
    saved = sql_db.save_finding(body)
    return jsonify({
        "success": True,
        "finding": saved,
        "findings": sql_db.list_saved_findings(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/findings/<finding_id>", methods=["DELETE"])
def remove_finding(finding_id: str):
    deleted = sql_db.delete_finding(finding_id)
    return jsonify({
        "success": deleted,
        "findings": sql_db.list_saved_findings(),
        "databaseTelemetry": sql_db.get_database_telemetry(),
    })


@app.route("/api/database/telemetry", methods=["GET"])
def get_db_telemetry():
    return jsonify(sql_db.get_database_telemetry())


@app.route("/api/config", methods=["POST"])
def update_config():
    global active_config
    incoming = request.get_json(force=True, silent=True) or {}

    updated_keys = dict(active_config.get("apiKeys", {}))
    if isinstance(incoming.get("apiKeys"), dict):
        for k in ("openai", "gemini", "anthropic", "groq", "openrouter"):
            val = incoming["apiKeys"].get(k)
            if isinstance(val, str) and not val.startswith("••••"):
                updated_keys[k] = val.strip()

    updated_eps = {
        **active_config.get("localEndpoints", {}),
        **(incoming.get("localEndpoints") or {}),
    }

    active_config = {
        **active_config,
        **incoming,
        "apiKeys": updated_keys,
        "localEndpoints": updated_eps,
    }
    sql_db.save_pipeline_config(active_config)

    return jsonify({
        "success": True,
        "config": active_config,
    })


@app.route("/api/models/scan-path", methods=["POST"])
def scan_path():
    body = request.get_json(force=True, silent=True) or {}
    target_path = str(body.get("path") or active_config.get("offlineModelPath") or "")
    result = scan_local_model_path(target_path, WORKSPACE_ROOT)
    return jsonify(result)


@app.route("/api/models/probe-local-daemons", methods=["GET"])
def probe_daemons():
    status = {
        "ollamaOnline": False,
        "ollamaModels": [],
        "lmStudioOnline": False,
        "lmStudioModels": [],
    }
    eps = active_config.get("localEndpoints", {})
    ollama_url = (eps.get("ollamaUrl") or "http://localhost:11434").rstrip("/")
    lm_url = (eps.get("lmStudioUrl") or "http://localhost:1234/v1").rstrip("/")

    try:
        with urllib.request.urlopen(f"{ollama_url}/api/tags", timeout=1.5) as r1:
            data = json.loads(r1.read().decode("utf-8"))
            status["ollamaOnline"] = True
            status["ollamaModels"] = [m.get("name") for m in data.get("models", []) if m.get("name")]
    except Exception:
        status["ollamaOnline"] = False

    try:
        with urllib.request.urlopen(f"{lm_url}/models", timeout=1.5) as r2:
            data = json.loads(r2.read().decode("utf-8"))
            status["lmStudioOnline"] = True
            status["lmStudioModels"] = [m.get("id") for m in data.get("data", []) if m.get("id")]
    except Exception:
        status["lmStudioOnline"] = False

    return jsonify(status)


if __name__ == "__main__":
    print("Python ClayRAG Agentic Engine + SQLite3 Vault listening on http://localhost:3001")
    app.run(host="0.0.0.0", port=3001, debug=False)
