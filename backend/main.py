import json
import os
import random
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from functools import wraps
from typing import Dict, Any, List, Optional

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from flask import Flask, request, jsonify, g
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

WORKSPACE_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
DATA_DIR = os.environ.get("CLAYRAG_DATA_DIR") or os.path.join(WORKSPACE_ROOT, "data")

app = Flask(__name__)

_raw_origins = (os.environ.get("ALLOWED_ORIGINS") or "*").strip()
_cors_origins: Any = "*" if _raw_origins == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]
CORS(
    app,
    resources={r"/api/*": {"origins": _cors_origins}},
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)

vector_db = HybridVectorDatabase(DATA_DIR)
sql_db = vector_db.sql_db


@app.route("/", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "clayrag-python-backend",
        "version": "1.0.0",
        "databaseEngine": "postgresql" if sql_db.is_postgres else "sqlite",
        "dataDir": DATA_DIR,
    })


def get_default_config() -> Dict[str, Any]:
    return {
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


def get_user_config(user_id: str) -> Dict[str, Any]:
    base = get_default_config()
    persisted = sql_db.load_pipeline_config(user_id)
    if not persisted:
        sql_db.save_pipeline_config(base, user_id)
        return base
    merged = {
        **base,
        **persisted,
        "apiKeys": {**base["apiKeys"], **(persisted.get("apiKeys") or {})},
        "localEndpoints": {**base["localEndpoints"], **(persisted.get("localEndpoints") or {})},
    }
    return merged


def seed_user_workspace_if_empty(user_id: str):
    if vector_db.get_document_count(user_id) == 0:
        cfg = get_user_config(user_id)
        for seed in SEED_CORPUS_DOCUMENTS:
            cleaned_text, telemetry = optimize_and_clean_text(
                seed["rawText"],
                seed["ocrUsed"],
                seed["ocrConfidence"],
            )
            scoped_doc_id = f"{user_id}_{seed['id']}"
            vector_db.ingest_document(
                title=seed["title"],
                filename=seed["filename"],
                doc_format=seed["format"],
                raw_text=seed["rawText"],
                cleaned_text=cleaned_text,
                extraction_telemetry=telemetry,
                user_id=user_id,
                auto_optimize=True,
                target_chunk_tokens=cfg["targetChunkTokens"],
                chunk_overlap_tokens=cfg["chunkOverlapTokens"],
                doc_id=scoped_doc_id,
            )


def execute_rag_pipeline(
    prompt: str,
    config_used: Dict[str, Any],
    user_id: str,
    chat_id: Optional[str] = None,
) -> Dict[str, Any]:
    all_chunks = vector_db.get_all_chunks(user_id)
    user_docs = vector_db.get_all_documents(user_id)

    def _is_seed_chunk(c: Dict[str, Any]) -> bool:
        did = str(c.get("documentId") or "").lower()
        dtitle = str(c.get("documentTitle") or "").lower()
        markers = (
            "doc_hnsw_architecture",
            "doc_chunking_optimization",
            "doc_agentic_reshaper_ocr",
            "doc_small_llm_crag_ocr",
            "seed_01",
            "seed_02",
            "seed_03",
            "hnsw vector indexing & hybrid rrf",
            "adaptive chunking strategy benchmark",
            "small llm prompt reshaping, crag & multimodal ocr",
        )
        return any(m in did or m in dtitle for m in markers)

    custom_chunks = [c for c in all_chunks if not _is_seed_chunk(c)]
    active_pool = custom_chunks if custom_chunks else all_chunks

    corpus_keywords: List[str] = []
    for c in active_pool:
        for kw in c.get("keywords", []):
            if kw not in corpus_keywords:
                corpus_keywords.append(kw)
    corpus_keywords = corpus_keywords[:50]

    recent_history = (
        sql_db.load_query_history(user_id, limit=3, chat_id=chat_id)
        if chat_id
        else []
    )

    prompt_reshape = reshape_user_prompt(
        prompt,
        corpus_keywords,
        config_used,
        recent_history=recent_history,
    )
    retrieval = vector_db.hybrid_retrieve_and_rerank(
        original_prompt=prompt,
        reshaped_primary_query=prompt_reshape["reshapedPrimaryQuery"],
        sub_queries=prompt_reshape["subQueries"],
        hyde_document=prompt_reshape["hydeDocument"],
        config=config_used,
        user_id=user_id,
    )
    synthesis = synthesize_answer_and_verify(
        prompt_reshape=prompt_reshape,
        retrieved_chunks=retrieval["retrievedChunks"],
        pruned_noise_chunks=retrieval["prunedNoiseChunks"],
        config=config_used,
        timings=retrieval["timings"],
        user_documents=user_docs,
        recent_history=recent_history,
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

    resolved_chat_id = sql_db.record_query_run(resp_obj, user_id=user_id, chat_id=chat_id)
    resp_obj["chatId"] = resolved_chat_id
    return resp_obj


# Ensure the demo admin account has starter data ready
seed_user_workspace_if_empty("usr_demo_admin")


def _extract_bearer_token() -> Optional[str]:
    auth_hdr = request.headers.get("Authorization", "")
    if auth_hdr.lower().startswith("bearer "):
        return auth_hdr[7:].strip()
    return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_bearer_token()
        user = sql_db.get_user_by_token(token) if token else None
        if not user:
            return jsonify({"error": "Authentication required. Please sign in."}), 401
        g.current_user = user
        g.auth_token = token
        return fn(*args, **kwargs)
    return wrapper


# =============================================================================
# AUTHENTICATION & ACCOUNT MANAGEMENT ENDPOINTS
# =============================================================================

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    body = request.get_json(force=True, silent=True) or {}
    username = str(body.get("username") or "")
    display_name = str(body.get("displayName") or "")
    email = str(body.get("email") or "")
    password = str(body.get("password") or "")
    seed_starter = bool(body.get("seedStarterCorpus", True))

    user, err = sql_db.create_user(username, display_name, email, password)
    if err or not user:
        return jsonify({"error": err or "Registration failed."}), 400

    token = sql_db.create_session(user["userId"])
    if seed_starter:
        seed_user_workspace_if_empty(user["userId"])

    return jsonify({
        "success": True,
        "token": token,
        "user": user,
    })


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    body = request.get_json(force=True, silent=True) or {}
    identifier = str(body.get("identifier") or body.get("username") or body.get("email") or "")
    password = str(body.get("password") or "")

    user, err = sql_db.authenticate_user(identifier, password)
    if err or not user:
        return jsonify({"error": err or "Invalid credentials."}), 401

    token = sql_db.create_session(user["userId"])
    return jsonify({
        "success": True,
        "token": token,
        "user": user,
    })


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    token = _extract_bearer_token()
    if token:
        sql_db.delete_session(token)
    return jsonify({"success": True})


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def auth_me():
    return jsonify({
        "user": g.current_user,
    })


@app.route("/api/account/profile", methods=["POST"])
@require_auth
def update_account_profile():
    body = request.get_json(force=True, silent=True) or {}
    user_id = g.current_user["userId"]
    updated, err = sql_db.update_user_profile(
        user_id=user_id,
        display_name=body.get("displayName"),
        email=body.get("email"),
        username=body.get("username"),
    )
    if err or not updated:
        return jsonify({"error": err or "Could not update profile."}), 400
    return jsonify({"success": True, "user": updated})


@app.route("/api/account/change-password", methods=["POST"])
@require_auth
def update_account_password():
    body = request.get_json(force=True, silent=True) or {}
    user_id = g.current_user["userId"]
    ok, msg = sql_db.change_user_password(
        user_id=user_id,
        current_password=str(body.get("currentPassword") or ""),
        new_password=str(body.get("newPassword") or ""),
    )
    if not ok:
        return jsonify({"error": msg}), 400
    return jsonify({"success": True, "message": msg})


@app.route("/api/account", methods=["DELETE"])
@require_auth
def delete_account():
    user_id = g.current_user["userId"]
    vector_db.purge_user_data_in_memory(user_id)
    deleted = sql_db.delete_user_account(user_id)
    return jsonify({"success": deleted})


# =============================================================================
# USER-SCOPED RAG WORKSPACE ENDPOINTS
# =============================================================================

@app.route("/api/state", methods=["GET"])
@require_auth
def get_state():
    user = g.current_user
    user_id = user["userId"]
    cfg = get_user_config(user_id)
    docs = vector_db.get_all_documents(user_id)
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
        for c in vector_db.get_all_chunks(user_id)
    ]

    history = sql_db.load_query_history(user_id, 80)
    chat_sessions = sql_db.list_chat_sessions(user_id)

    masked_keys = {}
    for k, val in cfg.get("apiKeys", {}).items():
        masked_keys[k] = ("••••••••" + val[-4:]) if val and len(val) >= 4 else ""

    safe_config = {
        **cfg,
        "apiKeys": masked_keys,
    }

    return jsonify({
        "user": user,
        "documents": docs,
        "chunks": chunks,
        "stats": vector_db.get_vectordb_stats(user_id),
        "config": safe_config,
        "latestQuery": history[0] if history else None,
        "queryHistory": history,
        "chatSessions": chat_sessions,
        "savedFindings": sql_db.list_saved_findings(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
        "modelPortalCatalog": OFFLINE_MODEL_PORTAL_CATALOG,
    })


@app.route("/api/ingest/upload", methods=["POST"])
@require_auth
def ingest_upload():
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    auto_opt_raw = request.form.get("autoOptimize")
    if auto_opt_raw is not None:
        auto_opt = str(auto_opt_raw).lower() in ("true", "1", "yes")
    else:
        auto_opt = bool(cfg.get("autoOptimizeChunking", True))

    preferred_strategy = request.form.get("strategy") or cfg.get("defaultChunkStrategy", "semantic")
    target_tokens = int(request.form.get("targetChunkTokens") or cfg.get("targetChunkTokens", 150))
    overlap_tokens = int(request.form.get("chunkOverlapTokens") or cfg.get("chunkOverlapTokens", 30))

    ingested_docs = []
    for f in files:
        file_bytes = f.read()
        orig_name = f.filename or "uploaded_document.txt"
        mime_type = f.mimetype or ""
        stored_path = sql_db.save_uploaded_raw_file(orig_name, file_bytes, user_id=user_id)

        extracted = extract_document_from_bytes(file_bytes, orig_name, mime_type)
        base_title = re.sub(r"[_-]+", " ", os.path.splitext(orig_name)[0]).strip() or orig_name

        doc = vector_db.ingest_document(
            title=base_title,
            filename=orig_name,
            doc_format=extracted["format"],
            raw_text=extracted["rawText"],
            cleaned_text=extracted["cleanedText"],
            extraction_telemetry=extracted["telemetry"],
            user_id=user_id,
            auto_optimize=auto_opt,
            preferred_strategy=preferred_strategy,
            target_chunk_tokens=target_tokens,
            chunk_overlap_tokens=overlap_tokens,
        )
        doc["storedFilePath"] = stored_path
        doc_chunks = [c for c in vector_db.get_all_chunks(user_id) if c["documentId"] == doc["id"]]
        sql_db.upsert_document_and_chunks(doc, doc_chunks, user_id=user_id, stored_file_path=stored_path)
        ingested_docs.append(doc)

    return jsonify({
        "success": True,
        "ingestedDocuments": ingested_docs,
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/ingest/text", methods=["POST"])
@require_auth
def ingest_text():
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    body = request.get_json(force=True, silent=True) or {}
    content = str(body.get("content") or "").strip()
    if not content:
        return jsonify({"error": "Document content is required."}), 400

    title = str(body.get("title") or "").strip() or f"Technical Specification {vector_db.get_document_count(user_id) + 1}"
    doc_format = str(body.get("format") or "MARKDOWN")
    auto_opt = bool(body.get("autoOptimize", cfg.get("autoOptimizeChunking", True)))
    strategy = str(body.get("strategy") or cfg.get("defaultChunkStrategy", "semantic"))
    target_tokens = int(body.get("targetChunkTokens") or cfg.get("targetChunkTokens", 150))
    overlap_tokens = int(body.get("chunkOverlapTokens") or cfg.get("chunkOverlapTokens", 30))

    cleaned_text, telemetry = optimize_and_clean_text(content, False, 100.0)
    filename_slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_") + ".md"
    stored_path = sql_db.save_uploaded_raw_file(filename_slug, content.encode("utf-8"), user_id=user_id)

    doc = vector_db.ingest_document(
        title=title,
        filename=filename_slug,
        doc_format=doc_format,
        raw_text=content,
        cleaned_text=cleaned_text,
        extraction_telemetry=telemetry,
        user_id=user_id,
        auto_optimize=auto_opt,
        preferred_strategy=strategy,
        target_chunk_tokens=target_tokens,
        chunk_overlap_tokens=overlap_tokens,
    )
    doc["storedFilePath"] = stored_path
    doc_chunks = [c for c in vector_db.get_all_chunks(user_id) if c["documentId"] == doc["id"]]
    sql_db.upsert_document_and_chunks(doc, doc_chunks, user_id=user_id, stored_file_path=stored_path)

    return jsonify({
        "success": True,
        "document": doc,
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/documents/<doc_id>/rechunk", methods=["POST"])
@require_auth
def rechunk_doc(doc_id: str):
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    body = request.get_json(force=True, silent=True) or {}
    strategy = str(body.get("strategy") or "semantic")
    target_tokens = int(body.get("targetChunkTokens") or cfg.get("targetChunkTokens", 150))
    overlap_tokens = int(body.get("chunkOverlapTokens") or cfg.get("chunkOverlapTokens", 30))

    updated = vector_db.rechunk_document(
        doc_id, strategy, user_id=user_id, target_chunk_tokens=target_tokens, chunk_overlap_tokens=overlap_tokens
    )
    if not updated:
        return jsonify({"error": "Document not found."}), 404

    return jsonify({
        "success": True,
        "document": updated,
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/documents/<doc_id>", methods=["DELETE"])
@require_auth
def delete_doc(doc_id: str):
    user_id = g.current_user["userId"]
    deleted = vector_db.delete_document(doc_id, user_id=user_id)
    return jsonify({
        "success": deleted,
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/corpus/reset", methods=["POST"])
@require_auth
def reset_corpus():
    user_id = g.current_user["userId"]
    for doc in list(vector_db.get_all_documents(user_id)):
        vector_db.delete_document(doc["id"], user_id=user_id)
    seed_user_workspace_if_empty(user_id)
    return jsonify({
        "success": True,
        "documents": vector_db.get_all_documents(user_id),
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/chats", methods=["GET"])
@require_auth
def get_chats():
    user_id = g.current_user["userId"]
    return jsonify({
        "chatSessions": sql_db.list_chat_sessions(user_id),
    })


@app.route("/api/chats", methods=["POST"])
@require_auth
def create_chat():
    user_id = g.current_user["userId"]
    body = request.get_json(force=True, silent=True) or {}
    title = str(body.get("title") or "New Chat").strip() or "New Chat"
    session = sql_db.create_chat_session(user_id, title=title)
    return jsonify({
        "success": True,
        "chat": session,
        "chatSessions": sql_db.list_chat_sessions(user_id),
    })


@app.route("/api/chats/<chat_id>", methods=["PATCH"])
@require_auth
def rename_chat(chat_id: str):
    user_id = g.current_user["userId"]
    body = request.get_json(force=True, silent=True) or {}
    new_title = str(body.get("title") or "").strip()
    if not new_title:
        return jsonify({"error": "Chat title cannot be empty."}), 400
    updated = sql_db.rename_chat_session(user_id, chat_id, new_title)
    if not updated:
        return jsonify({"error": "Chat session not found."}), 404
    return jsonify({
        "success": True,
        "chat": updated,
        "chatSessions": sql_db.list_chat_sessions(user_id),
    })


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
@require_auth
def remove_chat(chat_id: str):
    user_id = g.current_user["userId"]
    deleted = sql_db.delete_chat_session(user_id, chat_id)
    return jsonify({
        "success": deleted,
        "chatSessions": sql_db.list_chat_sessions(user_id),
        "queryHistory": sql_db.load_query_history(user_id, 80),
    })


@app.route("/api/query", methods=["POST"])
@require_auth
def query_rag():
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    body = request.get_json(force=True, silent=True) or {}
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    chat_id = body.get("chatId")
    if isinstance(chat_id, str):
        chat_id = chat_id.strip() or None
    else:
        chat_id = None

    overrides = body.get("configOverrides") or {}
    merged_config = {
        **cfg,
        **overrides,
        "apiKeys": {
            **cfg.get("apiKeys", {}),
            **(overrides.get("apiKeys") or {}),
        },
        "localEndpoints": {
            **cfg.get("localEndpoints", {}),
            **(overrides.get("localEndpoints") or {}),
        },
    }

    resp_obj = execute_rag_pipeline(prompt, merged_config, user_id=user_id, chat_id=chat_id)
    resp_obj["chatSessions"] = sql_db.list_chat_sessions(user_id)
    return jsonify(resp_obj)


@app.route("/api/query/history", methods=["DELETE"])
@require_auth
def clear_chat_history():
    user_id = g.current_user["userId"]
    chat_id = request.args.get("chatId")
    sql_db.clear_query_history(user_id, chat_id=chat_id)
    return jsonify({
        "success": True,
        "chatSessions": sql_db.list_chat_sessions(user_id),
    })


@app.route("/api/findings", methods=["GET"])
@require_auth
def get_findings():
    user_id = g.current_user["userId"]
    return jsonify({
        "findings": sql_db.list_saved_findings(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/findings", methods=["POST"])
@require_auth
def create_finding():
    user_id = g.current_user["userId"]
    body = request.get_json(force=True, silent=True) or {}
    saved = sql_db.save_finding(body, user_id=user_id)
    return jsonify({
        "success": True,
        "finding": saved,
        "findings": sql_db.list_saved_findings(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/findings/<finding_id>", methods=["DELETE"])
@require_auth
def remove_finding(finding_id: str):
    user_id = g.current_user["userId"]
    deleted = sql_db.delete_finding(finding_id, user_id=user_id)
    return jsonify({
        "success": deleted,
        "findings": sql_db.list_saved_findings(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id),
    })


@app.route("/api/database/telemetry", methods=["GET"])
@require_auth
def get_db_telemetry():
    return jsonify(sql_db.get_database_telemetry(g.current_user["userId"]))


@app.route("/api/config", methods=["POST"])
@require_auth
def update_config():
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    incoming = request.get_json(force=True, silent=True) or {}

    updated_keys = dict(cfg.get("apiKeys", {}))
    if isinstance(incoming.get("apiKeys"), dict):
        for k in ("openai", "gemini", "anthropic", "groq", "openrouter"):
            val = incoming["apiKeys"].get(k)
            if isinstance(val, str) and not val.startswith("••••"):
                updated_keys[k] = val.strip()

    updated_eps = {
        **cfg.get("localEndpoints", {}),
        **(incoming.get("localEndpoints") or {}),
    }

    updated_cfg = {
        **cfg,
        **incoming,
        "apiKeys": updated_keys,
        "localEndpoints": updated_eps,
    }
    sql_db.save_pipeline_config(updated_cfg, user_id=user_id)

    return jsonify({
        "success": True,
        "config": updated_cfg,
    })


@app.route("/api/models/scan-path", methods=["POST"])
@require_auth
def scan_path():
    cfg = get_user_config(g.current_user["userId"])
    body = request.get_json(force=True, silent=True) or {}
    target_path = str(body.get("path") or cfg.get("offlineModelPath") or "")
    result = scan_local_model_path(target_path, WORKSPACE_ROOT)
    return jsonify(result)


@app.route("/api/models/probe-local-daemons", methods=["GET"])
@require_auth
def probe_daemons():
    cfg = get_user_config(g.current_user["userId"])
    status = {
        "ollamaOnline": False,
        "ollamaModels": [],
        "lmStudioOnline": False,
        "lmStudioModels": [],
    }
    eps = cfg.get("localEndpoints", {})
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
    port = int(os.environ.get("PORT", "3001"))
    print(f"Python ClayRAG Multi-User Agentic Engine + SQLite3 Vault listening on http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
