import json
import os
import sqlite3
import time
import random
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple


class PersistentRAGDatabase:
    """
    ACID-compliant SQLite3 (WAL mode) + File Vault storage engine for ClayRAG.
    Persists:
      1. Uploaded Raw Files on disk (data/uploads/)
      2. `documents` table (raw text, cleaned text, OCR telemetry, 5-strategy benchmarks)
      3. `vector_chunks` table (chunk payload, 128-dim vector embeddings, 2D coords, BM25 sparse terms, HNSW neighbors)
      4. `query_runs` table (every executed Agentic RAG run, reshaped prompt, HyDE, retrieved chunks, CRAG grades, metrics)
      5. `saved_findings` table (curated/pinned research findings, user notes, tags, citations, verification audit)
      6. `pipeline_config` table (persistent pipeline settings across server restarts)
    """

    def __init__(self, data_dir: str):
        self.data_dir = os.path.abspath(data_dir)
        self.uploads_dir = os.path.join(self.data_dir, "uploads")
        self.exports_dir = os.path.join(self.data_dir, "exports")
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.uploads_dir, exist_ok=True)
        os.makedirs(self.exports_dir, exist_ok=True)

        self.db_path = os.path.join(self.data_dir, "clayrag_vault.sqlite3")
        self._init_schema()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _init_schema(self):
        with self._get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    stored_file_path TEXT,
                    format TEXT NOT NULL,
                    ingested_at TEXT NOT NULL,
                    raw_text TEXT NOT NULL,
                    cleaned_text TEXT NOT NULL,
                    selected_strategy TEXT NOT NULL,
                    auto_optimized INTEGER NOT NULL DEFAULT 1,
                    extraction_telemetry_json TEXT NOT NULL,
                    strategy_benchmarks_json TEXT NOT NULL,
                    chunk_count INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS vector_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    document_title TEXT NOT NULL,
                    document_format TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    parent_chunk_id TEXT,
                    parent_context TEXT,
                    section_path TEXT NOT NULL,
                    content TEXT NOT NULL,
                    token_count INTEGER NOT NULL,
                    char_count INTEGER NOT NULL,
                    strategy TEXT NOT NULL,
                    coherence_score INTEGER NOT NULL,
                    information_density INTEGER NOT NULL,
                    keywords_json TEXT NOT NULL,
                    embedding_json TEXT NOT NULL,
                    coords_2d_json TEXT NOT NULL,
                    sparse_terms_json TEXT NOT NULL,
                    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON vector_chunks(document_id);

                CREATE TABLE IF NOT EXISTS query_runs (
                    query_id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    original_prompt TEXT NOT NULL,
                    reshaped_primary_query TEXT NOT NULL,
                    detected_intent TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    overall_optimization_index REAL NOT NULL,
                    groundedness_faithfulness REAL NOT NULL,
                    ndcg_at_k REAL NOT NULL,
                    total_latency_ms INTEGER NOT NULL,
                    full_response_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS saved_findings (
                    finding_id TEXT PRIMARY KEY,
                    query_id TEXT,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    reshaped_query TEXT NOT NULL,
                    synthesized_answer TEXT NOT NULL,
                    analyst_notes TEXT NOT NULL DEFAULT '',
                    tags_json TEXT NOT NULL DEFAULT '[]',
                    citations_json TEXT NOT NULL DEFAULT '[]',
                    claim_verifications_json TEXT NOT NULL DEFAULT '[]',
                    metrics_json TEXT NOT NULL DEFAULT '{}',
                    pinned INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS pipeline_config (
                    config_key TEXT PRIMARY KEY,
                    config_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )

    def save_uploaded_raw_file(self, filename: str, file_bytes: bytes) -> str:
        safe_name = f"{int(time.time())}_{os.path.basename(filename)}"
        target_path = os.path.join(self.uploads_dir, safe_name)
        with open(target_path, "wb") as f:
            f.write(file_bytes)
        return target_path

    def upsert_document_and_chunks(
        self,
        doc_record: Dict[str, Any],
        chunks: List[Dict[str, Any]],
        stored_file_path: Optional[str] = None,
    ):
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, title, filename, stored_file_path, format, ingested_at,
                    raw_text, cleaned_text, selected_strategy, auto_optimized,
                    extraction_telemetry_json, strategy_benchmarks_json, chunk_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title=excluded.title,
                    filename=excluded.filename,
                    stored_file_path=COALESCE(excluded.stored_file_path, documents.stored_file_path),
                    format=excluded.format,
                    ingested_at=excluded.ingested_at,
                    raw_text=excluded.raw_text,
                    cleaned_text=excluded.cleaned_text,
                    selected_strategy=excluded.selected_strategy,
                    auto_optimized=excluded.auto_optimized,
                    extraction_telemetry_json=excluded.extraction_telemetry_json,
                    strategy_benchmarks_json=excluded.strategy_benchmarks_json,
                    chunk_count=excluded.chunk_count
                """,
                (
                    doc_record["id"],
                    doc_record["title"],
                    doc_record["filename"],
                    stored_file_path or doc_record.get("storedFilePath"),
                    doc_record["format"],
                    doc_record["ingestedAt"],
                    doc_record["rawText"],
                    doc_record["cleanedText"],
                    doc_record["selectedStrategy"],
                    1 if doc_record.get("autoOptimized") else 0,
                    json.dumps(doc_record["extractionTelemetry"]),
                    json.dumps(doc_record["strategyBenchmarks"]),
                    doc_record["chunkCount"],
                ),
            )

            conn.execute("DELETE FROM vector_chunks WHERE document_id = ?", (doc_record["id"],))
            for ch in chunks:
                conn.execute(
                    """
                    INSERT INTO vector_chunks (
                        id, document_id, document_title, document_format, chunk_index,
                        parent_chunk_id, parent_context, section_path, content,
                        token_count, char_count, strategy, coherence_score,
                        information_density, keywords_json, embedding_json,
                        coords_2d_json, sparse_terms_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ch["id"],
                        ch["documentId"],
                        ch["documentTitle"],
                        ch["documentFormat"],
                        ch["index"],
                        ch.get("parentChunkId"),
                        ch.get("parentContext"),
                        ch["sectionPath"],
                        ch["content"],
                        ch["tokenCount"],
                        ch["charCount"],
                        ch["strategy"],
                        ch["coherenceScore"],
                        ch["informationDensity"],
                        json.dumps(ch["keywords"]),
                        json.dumps(ch["embedding"]),
                        json.dumps(ch["coords2D"]),
                        json.dumps(ch["sparseTerms"]),
                    ),
                )

    def delete_document(self, doc_id: str):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM vector_chunks WHERE document_id = ?", (doc_id,))
            conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))

    def load_all_documents_and_chunks(self) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        docs: List[Dict[str, Any]] = []
        chunks: List[Dict[str, Any]] = []
        with self._get_conn() as conn:
            doc_rows = conn.execute("SELECT * FROM documents ORDER BY ingested_at DESC").fetchall()
            for r in doc_rows:
                docs.append({
                    "id": r["id"],
                    "title": r["title"],
                    "filename": r["filename"],
                    "storedFilePath": r["stored_file_path"],
                    "format": r["format"],
                    "ingestedAt": r["ingested_at"],
                    "rawText": r["raw_text"],
                    "cleanedText": r["cleaned_text"],
                    "selectedStrategy": r["selected_strategy"],
                    "autoOptimized": bool(r["auto_optimized"]),
                    "extractionTelemetry": json.loads(r["extraction_telemetry_json"]),
                    "strategyBenchmarks": json.loads(r["strategy_benchmarks_json"]),
                    "chunkCount": r["chunk_count"],
                })

            chunk_rows = conn.execute("SELECT * FROM vector_chunks ORDER BY chunk_index ASC").fetchall()
            for c in chunk_rows:
                chunks.append({
                    "id": c["id"],
                    "documentId": c["document_id"],
                    "documentTitle": c["document_title"],
                    "documentFormat": c["document_format"],
                    "index": c["chunk_index"],
                    "parentChunkId": c["parent_chunk_id"],
                    "parentContext": c["parent_context"],
                    "sectionPath": c["section_path"],
                    "content": c["content"],
                    "tokenCount": c["token_count"],
                    "charCount": c["char_count"],
                    "strategy": c["strategy"],
                    "coherenceScore": c["coherence_score"],
                    "informationDensity": c["information_density"],
                    "keywords": json.loads(c["keywords_json"]),
                    "embedding": json.loads(c["embedding_json"]),
                    "coords2D": json.loads(c["coords_2d_json"]),
                    "sparseTerms": json.loads(c["sparse_terms_json"]),
                })
        return docs, chunks

    def record_query_run(self, resp_obj: Dict[str, Any]):
        pr = resp_obj["promptReshape"]
        m = resp_obj["metrics"]
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO query_runs (
                    query_id, timestamp, original_prompt, reshaped_primary_query,
                    detected_intent, answer, overall_optimization_index,
                    groundedness_faithfulness, ndcg_at_k, total_latency_ms,
                    full_response_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resp_obj["queryId"],
                    resp_obj["timestamp"],
                    pr["originalPrompt"],
                    pr["reshapedPrimaryQuery"],
                    pr["detectedIntent"],
                    resp_obj["answer"],
                    m["overallOptimizationIndex"],
                    m["groundednessFaithfulness"],
                    m["ndcgAtK"],
                    m["latencyBreakdown"]["totalMs"],
                    json.dumps(resp_obj),
                ),
            )

    def load_query_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT full_response_json FROM query_runs ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            ).fetchall()
            return [json.loads(r["full_response_json"]) for r in rows]

    def save_finding(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        finding_id = payload.get("findingId") or f"fnd_{int(time.time() * 1000)}_{random.randint(100, 999)}"
        created_at = datetime.now(timezone.utc).isoformat()
        title = payload.get("title") or payload.get("prompt", "Research Finding")[:80]
        prompt = payload.get("prompt") or ""
        reshaped_query = payload.get("reshapedQuery") or prompt
        synthesized_answer = payload.get("synthesizedAnswer") or ""
        analyst_notes = payload.get("analystNotes") or ""
        tags = payload.get("tags") or ["VERIFIED_RAG", "HNSW_HYBRID"]
        citations = payload.get("citations") or []
        claims = payload.get("claimVerifications") or []
        metrics = payload.get("metrics") or {}
        query_id = payload.get("queryId")

        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO saved_findings (
                    finding_id, query_id, title, created_at, prompt, reshaped_query,
                    synthesized_answer, analyst_notes, tags_json, citations_json,
                    claim_verifications_json, metrics_json, pinned
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    finding_id,
                    query_id,
                    title,
                    created_at,
                    prompt,
                    reshaped_query,
                    synthesized_answer,
                    analyst_notes,
                    json.dumps(tags),
                    json.dumps(citations),
                    json.dumps(claims),
                    json.dumps(metrics),
                ),
            )

        # Also write a Markdown snapshot into data/exports/ so findings are directly accessible as files on disk
        md_filename = f"{finding_id}.md"
        md_path = os.path.join(self.exports_dir, md_filename)
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(f"# {title}\n\n")
            f.write(f"- **Finding ID**: `{finding_id}`\n")
            f.write(f"- **Saved At**: `{created_at}`\n")
            f.write(f"- **Original Prompt**: {prompt}\n")
            f.write(f"- **Reshaped Query**: `{reshaped_query}`\n")
            if analyst_notes:
                f.write(f"- **Analyst Notes**: {analyst_notes}\n")
            f.write("\n## Synthesized Grounded Answer\n\n")
            f.write(synthesized_answer + "\n")

        return {
            "findingId": finding_id,
            "queryId": query_id,
            "title": title,
            "createdAt": created_at,
            "prompt": prompt,
            "reshapedQuery": reshaped_query,
            "synthesizedAnswer": synthesized_answer,
            "analystNotes": analyst_notes,
            "tags": tags,
            "citations": citations,
            "claimVerifications": claims,
            "metrics": metrics,
            "exportedMarkdownPath": md_path,
        }

    def list_saved_findings(self) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        with self._get_conn() as conn:
            rows = conn.execute("SELECT * FROM saved_findings ORDER BY created_at DESC").fetchall()
            for r in rows:
                fid = r["finding_id"]
                results.append({
                    "findingId": fid,
                    "queryId": r["query_id"],
                    "title": r["title"],
                    "createdAt": r["created_at"],
                    "prompt": r["prompt"],
                    "reshapedQuery": r["reshaped_query"],
                    "synthesizedAnswer": r["synthesized_answer"],
                    "analystNotes": r["analyst_notes"],
                    "tags": json.loads(r["tags_json"]),
                    "citations": json.loads(r["citations_json"]),
                    "claimVerifications": json.loads(r["claim_verifications_json"]),
                    "metrics": json.loads(r["metrics_json"]),
                    "exportedMarkdownPath": os.path.join(self.exports_dir, f"{fid}.md"),
                })
        return results

    def delete_finding(self, finding_id: str) -> bool:
        with self._get_conn() as conn:
            cur = conn.execute("DELETE FROM saved_findings WHERE finding_id = ?", (finding_id,))
            md_path = os.path.join(self.exports_dir, f"{finding_id}.md")
            if os.path.exists(md_path):
                try:
                    os.remove(md_path)
                except Exception:
                    pass
            return cur.rowcount > 0

    def save_pipeline_config(self, cfg: Dict[str, Any]):
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO pipeline_config (config_key, config_json, updated_at)
                VALUES ('active', ?, ?)
                """,
                (json.dumps(cfg), datetime.now(timezone.utc).isoformat()),
            )

    def load_pipeline_config(self) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT config_json FROM pipeline_config WHERE config_key = 'active'"
            ).fetchone()
            return json.loads(row["config_json"]) if row else None

    def get_database_telemetry(self) -> Dict[str, Any]:
        db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
        wal_path = self.db_path + "-wal"
        wal_size = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
        json_index_path = os.path.join(self.data_dir, "hybrid_vectordb.json")
        json_size = os.path.getsize(json_index_path) if os.path.exists(json_index_path) else 0

        upload_files = os.listdir(self.uploads_dir) if os.path.exists(self.uploads_dir) else []
        export_files = os.listdir(self.exports_dir) if os.path.exists(self.exports_dir) else []

        with self._get_conn() as conn:
            doc_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
            chunk_count = conn.execute("SELECT COUNT(*) FROM vector_chunks").fetchone()[0]
            query_count = conn.execute("SELECT COUNT(*) FROM query_runs").fetchone()[0]
            finding_count = conn.execute("SELECT COUNT(*) FROM saved_findings").fetchone()[0]

        return {
            "engine": "SQLite3 (WAL Mode) + Persistent HNSW & BM25+ Hybrid Store",
            "sqliteFilePath": self.db_path,
            "vectorSnapshotPath": json_index_path,
            "uploadsDirPath": self.uploads_dir,
            "exportsDirPath": self.exports_dir,
            "sqliteSizeKb": round((db_size + wal_size) / 1024.0, 2),
            "vectorSnapshotSizeKb": round(json_size / 1024.0, 2),
            "uploadedRawFilesCount": len(upload_files),
            "exportedMarkdownReportsCount": len(export_files),
            "tables": [
                {
                    "tableName": "documents",
                    "rowCount": doc_count,
                    "purpose": "Raw & cleaned document text, format metadata, OCR telemetry, and 5-strategy chunk benchmarks",
                },
                {
                    "tableName": "vector_chunks",
                    "rowCount": chunk_count,
                    "purpose": "Segmented chunks, parent-child links, 128-dim float32 vectors, 2D UMAP coords, and BM25+ terms",
                },
                {
                    "tableName": "query_runs",
                    "rowCount": query_count,
                    "purpose": "Complete audit log of Agentic RAG queries, Small LLM reshaped prompts, HyDE anchors, and metrics",
                },
                {
                    "tableName": "saved_findings",
                    "rowCount": finding_count,
                    "purpose": "Pinned research findings, analyst annotations, verified claim audits, and Markdown report exports",
                },
                {
                    "tableName": "pipeline_config",
                    "rowCount": 1,
                    "purpose": "Persisted LLM providers, local endpoints, offline GGUF model bindings, and RRF/CRAG parameters",
                },
            ],
        }
