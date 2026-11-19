import hashlib
import hmac
import json
import os
import random
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple


class PersistentRAGDatabase:
    """
    Multi-User ACID-compliant SQLite3 (WAL mode) + File Vault storage engine for ClayRAG.
    Persists per-user isolated data across:
      1. `users` & `sessions` tables (PBKDF2-HMAC-SHA256 salted password auth + Bearer tokens)
      2. `documents` table (raw text, cleaned text, OCR telemetry, 5-strategy benchmarks, per user_id)
      3. `vector_chunks` table (chunk payload, 128-dim vector embeddings, 2D coords, BM25 sparse terms, per user_id)
      4. `query_runs` table (Agentic RAG chat runs, reshaped prompts, HyDE, retrieved chunks, CRAG grades, per user_id)
      5. `saved_findings` table (pinned research findings, analyst notes, tags, citations, per user_id)
      6. `pipeline_config` table (per-user API keys, LLM provider/model selections, offline GGUF path, RRF/CRAG tuning)
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
        self._ensure_demo_user()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return conn

    def _hash_password(self, password: str, salt_hex: Optional[str] = None) -> Tuple[str, str]:
        salt = salt_hex or secrets.token_hex(16)
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            200_000,
        )
        return salt, dk.hex()

    def _verify_password(self, password: str, salt_hex: str, expected_hash: str) -> bool:
        _, computed = self._hash_password(password, salt_hex)
        return hmac.compare_digest(computed, expected_hash)

    def _add_column_if_missing(self, conn: sqlite3.Connection, table: str, column: str, col_def: str):
        cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")

    def _init_schema(self):
        with self._get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_salt TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'USER',
                    created_at TEXT NOT NULL,
                    last_login_at TEXT
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'usr_demo_admin',
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
                    user_id TEXT NOT NULL DEFAULT 'usr_demo_admin',
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

                CREATE TABLE IF NOT EXISTS query_runs (
                    query_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'usr_demo_admin',
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
                    user_id TEXT NOT NULL DEFAULT 'usr_demo_admin',
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

            # Safe migrations if upgrading an existing clayrag_vault.sqlite3
            self._add_column_if_missing(conn, "documents", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            self._add_column_if_missing(conn, "vector_chunks", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            self._add_column_if_missing(conn, "query_runs", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            self._add_column_if_missing(conn, "saved_findings", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")

            conn.execute("CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_user_doc ON vector_chunks(user_id, document_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_user ON query_runs(user_id, timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_findings_user ON saved_findings(user_id, created_at)")

    def _ensure_demo_user(self):
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT user_id FROM users WHERE user_id = 'usr_demo_admin' OR username = 'admin'"
            ).fetchone()
            if not row:
                salt, pw_hash = self._hash_password("admin123")
                now = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    """
                    INSERT INTO users (
                        user_id, username, display_name, email, password_salt,
                        password_hash, role, created_at, last_login_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "usr_demo_admin",
                        "admin",
                        "Studio Administrator",
                        "admin@clayrag.local",
                        salt,
                        pw_hash,
                        "ADMIN",
                        now,
                        now,
                    ),
                )

    def _serialize_user(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "userId": row["user_id"],
            "username": row["username"],
            "displayName": row["display_name"],
            "email": row["email"],
            "role": row["role"],
            "createdAt": row["created_at"],
            "lastLoginAt": row["last_login_at"],
        }

    # =========================================================================
    # USER AUTHENTICATION & ACCOUNT MANAGEMENT
    # =========================================================================

    def create_user(
        self,
        username: str,
        display_name: str,
        email: str,
        password: str,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        clean_user = username.strip().lower()
        clean_email = email.strip().lower()
        clean_name = display_name.strip() or clean_user

        if len(clean_user) < 3:
            return None, "Username must be at least 3 characters."
        if "@" not in clean_email or "." not in clean_email:
            return None, "Please enter a valid email address."
        if len(password) < 6:
            return None, "Password must be at least 6 characters."

        user_id = f"usr_{int(time.time() * 1000)}_{secrets.token_hex(3)}"
        salt, pw_hash = self._hash_password(password)
        now = datetime.now(timezone.utc).isoformat()

        try:
            with self._get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO users (
                        user_id, username, display_name, email, password_salt,
                        password_hash, role, created_at, last_login_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 'USER', ?, ?)
                    """,
                    (user_id, clean_user, clean_name, clean_email, salt, pw_hash, now, now),
                )
                row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
                return self._serialize_user(row), None
        except sqlite3.IntegrityError as e:
            err_msg = str(e).lower()
            if "username" in err_msg:
                return None, "That username is already taken. Try signing in or choose another."
            if "email" in err_msg:
                return None, "An account with that email already exists. Try signing in."
            return None, "Account already exists."

    def authenticate_user(self, identifier: str, password: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        ident = identifier.strip().lower()
        if not ident or not password:
            return None, "Username/email and password are required."

        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?",
                (ident, ident),
            ).fetchone()
            if not row:
                return None, "Invalid username/email or password."

            if not self._verify_password(password, row["password_salt"], row["password_hash"]):
                return None, "Invalid username/email or password."

            now = datetime.now(timezone.utc).isoformat()
            conn.execute("UPDATE users SET last_login_at = ? WHERE user_id = ?", (now, row["user_id"]))
            updated = conn.execute("SELECT * FROM users WHERE user_id = ?", (row["user_id"],)).fetchone()
            return self._serialize_user(updated), None

    def create_session(self, user_id: str) -> str:
        token = secrets.token_hex(32)
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=30)
        with self._get_conn() as conn:
            conn.execute(
                "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (token, user_id, now.isoformat(), expires.isoformat()),
            )
        return token

    def get_user_by_token(self, token: str) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                """
                SELECT u.*, s.expires_at
                FROM sessions s
                JOIN users u ON u.user_id = s.user_id
                WHERE s.token = ?
                """,
                (token.strip(),),
            ).fetchone()
            if not row:
                return None
            try:
                exp = datetime.fromisoformat(row["expires_at"])
                if exp < datetime.now(timezone.utc):
                    conn.execute("DELETE FROM sessions WHERE token = ?", (token.strip(),))
                    return None
            except Exception:
                pass
            return self._serialize_user(row)

    def delete_session(self, token: str):
        if not token:
            return
        with self._get_conn() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token.strip(),))

    def update_user_profile(
        self,
        user_id: str,
        display_name: Optional[str] = None,
        email: Optional[str] = None,
        username: Optional[str] = None,
    ) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            with self._get_conn() as conn:
                row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
                if not row:
                    return None, "User not found."

                new_name = display_name.strip() if display_name and display_name.strip() else row["display_name"]
                new_email = email.strip().lower() if email and email.strip() else row["email"]
                new_username = username.strip().lower() if username and username.strip() else row["username"]

                if len(new_username) < 3:
                    return None, "Username must be at least 3 characters."
                if "@" not in new_email:
                    return None, "Invalid email address."

                conn.execute(
                    "UPDATE users SET display_name = ?, email = ?, username = ? WHERE user_id = ?",
                    (new_name, new_email, new_username, user_id),
                )
                updated = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
                return self._serialize_user(updated), None
        except sqlite3.IntegrityError:
            return None, "Username or email is already used by another account."

    def change_user_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str,
    ) -> Tuple[bool, str]:
        if len(new_password) < 6:
            return False, "New password must be at least 6 characters."
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            if not row:
                return False, "User not found."
            if not self._verify_password(current_password, row["password_salt"], row["password_hash"]):
                return False, "Current password is incorrect."
            new_salt, new_hash = self._hash_password(new_password)
            conn.execute(
                "UPDATE users SET password_salt = ?, password_hash = ? WHERE user_id = ?",
                (new_salt, new_hash, user_id),
            )
            return True, "Password updated successfully."

    def delete_user_account(self, user_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM vector_chunks WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM documents WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM query_runs WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM saved_findings WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM pipeline_config WHERE config_key = ?", (f"user_{user_id}",))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            cur = conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            return cur.rowcount > 0

    def list_users_summary(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT user_id, username, display_name, email, role, created_at, last_login_at FROM users ORDER BY created_at DESC"
            ).fetchall()
            return [self._serialize_user(r) for r in rows]

    # =========================================================================
    # USER-SCOPED DOCUMENTS, CHUNKS, QUERIES, FINDINGS & CONFIG
    # =========================================================================

    def save_uploaded_raw_file(self, filename: str, file_bytes: bytes, user_id: str = "usr_demo_admin") -> str:
        user_dir = os.path.join(self.uploads_dir, user_id)
        os.makedirs(user_dir, exist_ok=True)
        safe_name = f"{int(time.time())}_{os.path.basename(filename)}"
        target_path = os.path.join(user_dir, safe_name)
        with open(target_path, "wb") as f:
            f.write(file_bytes)
        return target_path

    def upsert_document_and_chunks(
        self,
        doc_record: Dict[str, Any],
        chunks: List[Dict[str, Any]],
        user_id: str = "usr_demo_admin",
        stored_file_path: Optional[str] = None,
    ):
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, user_id, title, filename, stored_file_path, format, ingested_at,
                    raw_text, cleaned_text, selected_strategy, auto_optimized,
                    extraction_telemetry_json, strategy_benchmarks_json, chunk_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id=excluded.user_id,
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
                    user_id,
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

            conn.execute("DELETE FROM vector_chunks WHERE document_id = ? AND user_id = ?", (doc_record["id"], user_id))
            for ch in chunks:
                conn.execute(
                    """
                    INSERT INTO vector_chunks (
                        id, user_id, document_id, document_title, document_format, chunk_index,
                        parent_chunk_id, parent_context, section_path, content,
                        token_count, char_count, strategy, coherence_score,
                        information_density, keywords_json, embedding_json,
                        coords_2d_json, sparse_terms_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ch["id"],
                        user_id,
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

    def delete_document(self, doc_id: str, user_id: str = "usr_demo_admin"):
        with self._get_conn() as conn:
            conn.execute("DELETE FROM vector_chunks WHERE document_id = ? AND user_id = ?", (doc_id, user_id))
            conn.execute("DELETE FROM documents WHERE id = ? AND user_id = ?", (doc_id, user_id))

    def load_all_documents_and_chunks(
        self, user_id: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        docs: List[Dict[str, Any]] = []
        chunks: List[Dict[str, Any]] = []
        with self._get_conn() as conn:
            if user_id:
                doc_rows = conn.execute(
                    "SELECT * FROM documents WHERE user_id = ? ORDER BY ingested_at DESC",
                    (user_id,),
                ).fetchall()
                chunk_rows = conn.execute(
                    "SELECT * FROM vector_chunks WHERE user_id = ? ORDER BY chunk_index ASC",
                    (user_id,),
                ).fetchall()
            else:
                doc_rows = conn.execute("SELECT * FROM documents ORDER BY ingested_at DESC").fetchall()
                chunk_rows = conn.execute("SELECT * FROM vector_chunks ORDER BY chunk_index ASC").fetchall()

            for r in doc_rows:
                docs.append({
                    "id": r["id"],
                    "userId": r["user_id"],
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

            for c in chunk_rows:
                chunks.append({
                    "id": c["id"],
                    "userId": c["user_id"],
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

    def record_query_run(self, resp_obj: Dict[str, Any], user_id: str = "usr_demo_admin"):
        pr = resp_obj["promptReshape"]
        m = resp_obj["metrics"]
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO query_runs (
                    query_id, user_id, timestamp, original_prompt, reshaped_primary_query,
                    detected_intent, answer, overall_optimization_index,
                    groundedness_faithfulness, ndcg_at_k, total_latency_ms,
                    full_response_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    resp_obj["queryId"],
                    user_id,
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

    def load_query_history(self, user_id: str = "usr_demo_admin", limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT full_response_json FROM query_runs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
            return [json.loads(r["full_response_json"]) for r in rows]

    def save_finding(self, payload: Dict[str, Any], user_id: str = "usr_demo_admin") -> Dict[str, Any]:
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
                    finding_id, user_id, query_id, title, created_at, prompt, reshaped_query,
                    synthesized_answer, analyst_notes, tags_json, citations_json,
                    claim_verifications_json, metrics_json, pinned
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    finding_id,
                    user_id,
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

        user_export_dir = os.path.join(self.exports_dir, user_id)
        os.makedirs(user_export_dir, exist_ok=True)
        md_path = os.path.join(user_export_dir, f"{finding_id}.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(f"# {title}\n\n")
            f.write(f"- **Finding ID**: `{finding_id}`\n")
            f.write(f"- **Owner User ID**: `{user_id}`\n")
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

    def list_saved_findings(self, user_id: str = "usr_demo_admin") -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM saved_findings WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
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
                    "exportedMarkdownPath": os.path.join(self.exports_dir, user_id, f"{fid}.md"),
                })
        return results

    def delete_finding(self, finding_id: str, user_id: str = "usr_demo_admin") -> bool:
        with self._get_conn() as conn:
            cur = conn.execute(
                "DELETE FROM saved_findings WHERE finding_id = ? AND user_id = ?",
                (finding_id, user_id),
            )
            md_path = os.path.join(self.exports_dir, user_id, f"{finding_id}.md")
            if os.path.exists(md_path):
                try:
                    os.remove(md_path)
                except Exception:
                    pass
            return cur.rowcount > 0

    def save_pipeline_config(self, cfg: Dict[str, Any], user_id: str = "usr_demo_admin"):
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO pipeline_config (config_key, config_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (f"user_{user_id}", json.dumps(cfg), datetime.now(timezone.utc).isoformat()),
            )

    def load_pipeline_config(self, user_id: str = "usr_demo_admin") -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT config_json FROM pipeline_config WHERE config_key = ?",
                (f"user_{user_id}",),
            ).fetchone()
            if not row:
                row = conn.execute(
                    "SELECT config_json FROM pipeline_config WHERE config_key = 'active'"
                ).fetchone()
            return json.loads(row["config_json"]) if row else None

    def get_database_telemetry(self, user_id: str = "usr_demo_admin") -> Dict[str, Any]:
        db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
        wal_path = self.db_path + "-wal"
        wal_size = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
        json_index_path = os.path.join(self.data_dir, "hybrid_vectordb.json")
        json_size = os.path.getsize(json_index_path) if os.path.exists(json_index_path) else 0

        user_uploads_dir = os.path.join(self.uploads_dir, user_id)
        user_exports_dir = os.path.join(self.exports_dir, user_id)
        upload_files = os.listdir(user_uploads_dir) if os.path.exists(user_uploads_dir) else []
        export_files = os.listdir(user_exports_dir) if os.path.exists(user_exports_dir) else []

        with self._get_conn() as conn:
            user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            doc_count = conn.execute("SELECT COUNT(*) FROM documents WHERE user_id = ?", (user_id,)).fetchone()[0]
            chunk_count = conn.execute("SELECT COUNT(*) FROM vector_chunks WHERE user_id = ?", (user_id,)).fetchone()[0]
            query_count = conn.execute("SELECT COUNT(*) FROM query_runs WHERE user_id = ?", (user_id,)).fetchone()[0]
            finding_count = conn.execute("SELECT COUNT(*) FROM saved_findings WHERE user_id = ?", (user_id,)).fetchone()[0]

        return {
            "engine": "Multi-Tenant SQLite3 (WAL Mode) + Per-User HNSW & BM25+ Store",
            "sqliteFilePath": self.db_path,
            "vectorSnapshotPath": json_index_path,
            "uploadsDirPath": user_uploads_dir,
            "exportsDirPath": user_exports_dir,
            "sqliteSizeKb": round((db_size + wal_size) / 1024.0, 2),
            "vectorSnapshotSizeKb": round(json_size / 1024.0, 2),
            "uploadedRawFilesCount": len(upload_files),
            "exportedMarkdownReportsCount": len(export_files),
            "tables": [
                {
                    "tableName": "users",
                    "rowCount": user_count,
                    "purpose": "Registered user accounts with PBKDF2-HMAC-SHA256 salted password hashes & active sessions",
                },
                {
                    "tableName": "documents",
                    "rowCount": doc_count,
                    "purpose": "Your personal raw & cleaned document text, OCR telemetry, and 5-strategy chunk benchmarks",
                },
                {
                    "tableName": "vector_chunks",
                    "rowCount": chunk_count,
                    "purpose": "Your isolated chunks, parent-child links, 128-dim embeddings, 2D coords, and BM25+ terms",
                },
                {
                    "tableName": "query_runs",
                    "rowCount": query_count,
                    "purpose": "Your private chat history, Small LLM reshaped prompts, HyDE anchors, and metrics",
                },
                {
                    "tableName": "saved_findings",
                    "rowCount": finding_count,
                    "purpose": "Your pinned research findings, analyst notes, verified claims, and Markdown report exports",
                },
                {
                    "tableName": "pipeline_config",
                    "rowCount": 1,
                    "purpose": "Your private API keys, LLM provider/model choices, offline GGUF path, and RRF/CRAG tuning",
                },
            ],
        }
