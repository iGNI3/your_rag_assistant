import base64
import hashlib
import hmac
import json
import os
import random
import re
import secrets
import shutil
import sqlite3
import struct
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional, Tuple

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,31}$")
EMAIL_RE = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$")
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{4,80}$")
ENC_PREFIX = "enc:v1:"

try:
    import psycopg
    from psycopg.rows import dict_row as pg_dict_row
except ImportError:
    psycopg = None  # type: ignore
    pg_dict_row = None  # type: ignore


class _DualCursor:
    def __init__(self, raw_cur: Any):
        self._cur = raw_cur

    def fetchone(self) -> Any:
        return self._cur.fetchone()

    def fetchall(self) -> List[Any]:
        return self._cur.fetchall()

    @property
    def rowcount(self) -> int:
        return self._cur.rowcount


class _DualConnection:
    """
    Unified context-managed connection wrapper that speaks the exact same API
    for both SQLite3 (local / Render Disk) and PostgreSQL (Neon / Supabase via DATABASE_URL).
    """

    def __init__(self, conn: Any, is_postgres: bool):
        self._conn = conn
        self.is_postgres = is_postgres

    def __enter__(self) -> "_DualConnection":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()
        return False

    def _adapt_sql(self, sql: str) -> str:
        if self.is_postgres:
            return sql.replace("?", "%s")
        return sql

    def execute(self, sql: str, params: Tuple[Any, ...] = ()) -> _DualCursor:
        adapted = self._adapt_sql(sql)
        cur = self._conn.execute(adapted, params)
        return _DualCursor(cur)


def _is_integrity_error(exc: Exception) -> bool:
    if isinstance(exc, sqlite3.IntegrityError):
        return True
    if psycopg is not None and isinstance(exc, psycopg.IntegrityError):
        return True
    return False


class PersistentRAGDatabase:
    """
    Dual-Engine Multi-User ACID Storage Vault for ClayRAG.
    - When `DATABASE_URL` env var is set (e.g. Neon or Supabase PostgreSQL):
      persists all 7 tables permanently in Cloud PostgreSQL across Render sleeps/redeploys.
    - Otherwise (local development or Render Persistent Disk):
      persists in ACID SQLite3 (WAL mode) at `<data_dir>/clayrag_vault.sqlite3`.
    """

    def __init__(self, data_dir: str):
        self.data_dir = os.path.abspath(data_dir)
        self.uploads_dir = os.path.join(self.data_dir, "uploads")
        self.exports_dir = os.path.join(self.data_dir, "exports")
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.uploads_dir, exist_ok=True)
        os.makedirs(self.exports_dir, exist_ok=True)

        raw_db_url = (os.environ.get("DATABASE_URL") or "").strip()
        if raw_db_url.startswith("postgres://"):
            raw_db_url = "postgresql://" + raw_db_url[len("postgres://"):]

        self.database_url: Optional[str] = raw_db_url if raw_db_url.startswith("postgresql://") else None
        self.is_postgres: bool = bool(self.database_url and psycopg is not None)
        if self.database_url and psycopg is None:
            print("WARNING: DATABASE_URL is set but psycopg is not installed; falling back to SQLite3.")

        self.db_path = os.path.join(self.data_dir, "clayrag_vault.sqlite3")
        self._vault_master_key = self._load_or_create_vault_key()
        self._init_schema()
        self._ensure_demo_user()
        self._migrate_legacy_active_config()

    def _load_or_create_vault_key(self) -> bytes:
        env_key = (os.environ.get("CLAYRAG_ENCRYPTION_KEY") or "").strip()
        if env_key:
            return hashlib.sha256(env_key.encode("utf-8")).digest()
        key_path = os.path.join(self.data_dir, ".vault_key")
        if os.path.exists(key_path):
            try:
                with open(key_path, "rb") as f:
                    raw = f.read().strip()
                if len(raw) >= 32:
                    return hashlib.sha256(raw).digest()
            except Exception:
                pass
        fresh = secrets.token_bytes(32)
        try:
            with open(key_path, "wb") as f:
                f.write(fresh)
            if os.name != "nt":
                os.chmod(key_path, 0o600)
        except Exception:
            pass
        return hashlib.sha256(fresh).digest()

    def _derive_aead_subkeys(self) -> Tuple[bytes, bytes]:
        enc_key = hmac.new(self._vault_master_key, b"clayrag-enc-v1", hashlib.sha256).digest()
        mac_key = hmac.new(self._vault_master_key, b"clayrag-mac-v1", hashlib.sha256).digest()
        return enc_key, mac_key

    def _encrypt_secret(self, plaintext: str) -> str:
        if not plaintext or plaintext.startswith(ENC_PREFIX):
            return plaintext
        enc_key, mac_key = self._derive_aead_subkeys()
        nonce = secrets.token_bytes(16)
        pt = plaintext.encode("utf-8")
        ct = bytearray(len(pt))
        block_idx = 0
        offset = 0
        while offset < len(pt):
            ks = hmac.new(enc_key, nonce + struct.pack(">I", block_idx), hashlib.sha256).digest()
            take = min(len(ks), len(pt) - offset)
            for i in range(take):
                ct[offset + i] = pt[offset + i] ^ ks[i]
            offset += take
            block_idx += 1
        tag = hmac.new(mac_key, nonce + bytes(ct), hashlib.sha256).digest()
        token = base64.urlsafe_b64encode(nonce + bytes(ct) + tag).decode("ascii")
        return f"{ENC_PREFIX}{token}"

    def _decrypt_secret(self, value: str) -> str:
        if not isinstance(value, str) or not value.startswith(ENC_PREFIX):
            return value if isinstance(value, str) else ""
        try:
            raw = base64.urlsafe_b64decode(value[len(ENC_PREFIX):].encode("ascii"))
            if len(raw) < 48:
                return ""
            nonce = raw[:16]
            tag = raw[-32:]
            ct = raw[16:-32]
            enc_key, mac_key = self._derive_aead_subkeys()
            expected_tag = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()
            if not hmac.compare_digest(tag, expected_tag):
                return ""
            pt = bytearray(len(ct))
            block_idx = 0
            offset = 0
            while offset < len(ct):
                ks = hmac.new(enc_key, nonce + struct.pack(">I", block_idx), hashlib.sha256).digest()
                take = min(len(ks), len(ct) - offset)
                for i in range(take):
                    pt[offset + i] = ct[offset + i] ^ ks[i]
                offset += take
                block_idx += 1
            return bytes(pt).decode("utf-8")
        except Exception:
            return ""

    def _safe_child_path(self, base_dir: str, *parts: str) -> str:
        base_abs = os.path.abspath(base_dir)
        target_abs = os.path.abspath(os.path.join(base_abs, *parts))
        if os.path.commonpath([base_abs, target_abs]) != base_abs:
            raise ValueError("Path escapes allowed directory.")
        return target_abs

    def _get_conn(self) -> _DualConnection:
        if self.is_postgres and self.database_url and psycopg is not None:
            conn = psycopg.connect(
                self.database_url,
                row_factory=pg_dict_row,
                connect_timeout=15,
            )
            return _DualConnection(conn, is_postgres=True)

        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        return _DualConnection(conn, is_postgres=False)

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

    def _add_column_if_missing_sqlite(self, conn: _DualConnection, table: str, column: str, col_def: str):
        if conn.is_postgres:
            return
        cols = [r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")

    def _init_schema(self):
        ddl_statements = [
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
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
            """,
            """
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
            )
            """,
            """
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
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS chat_sessions (
                chat_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS query_runs (
                query_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'usr_demo_admin',
                chat_id TEXT,
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
            )
            """,
            """
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
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS pipeline_config (
                config_key TEXT PRIMARY KEY,
                config_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """,
        ]

        with self._get_conn() as conn:
            for stmt in ddl_statements:
                conn.execute(stmt)

            # Safe migrations if upgrading an existing local clayrag_vault.sqlite3 or Neon PostgreSQL
            self._add_column_if_missing_sqlite(conn, "documents", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            self._add_column_if_missing_sqlite(conn, "vector_chunks", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            self._add_column_if_missing_sqlite(conn, "query_runs", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            self._add_column_if_missing_sqlite(conn, "query_runs", "chat_id", "TEXT")
            self._add_column_if_missing_sqlite(conn, "saved_findings", "user_id", "TEXT NOT NULL DEFAULT 'usr_demo_admin'")
            if conn.is_postgres:
                conn.execute("ALTER TABLE query_runs ADD COLUMN IF NOT EXISTS chat_id TEXT")

            conn.execute("CREATE INDEX IF NOT EXISTS idx_docs_user ON documents(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chunks_user_doc ON vector_chunks(user_id, document_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_chats_user ON chat_sessions(user_id, updated_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_user ON query_runs(user_id, timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_chat ON query_runs(user_id, chat_id, timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_findings_user ON saved_findings(user_id, created_at)")

    def _ensure_demo_user(self):
        if os.environ.get("ENABLE_DEMO_USER", "").strip().lower() not in ("1", "true", "yes"):
            return
        demo_pw = (os.environ.get("DEMO_ADMIN_PASSWORD") or "admin123").strip() or "admin123"
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT user_id FROM users WHERE user_id = 'usr_demo_admin' OR username = 'admin'"
            ).fetchone()
            if not row:
                salt, pw_hash = self._hash_password(demo_pw)
                now = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    """
                    INSERT INTO users (
                        user_id, username, display_name, email, password_salt,
                        password_hash, role, created_at, last_login_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (user_id) DO NOTHING
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

    def _migrate_legacy_active_config(self):
        """
        One-time migration: if a legacy global 'active' config exists, move it strictly
        to usr_demo_admin (only if that user exists and lacks a user-scoped config)
        and remove the global 'active' row so new users can never inherit shared API keys.
        """
        with self._get_conn() as conn:
            legacy = conn.execute(
                "SELECT config_json, updated_at FROM pipeline_config WHERE config_key = 'active'"
            ).fetchone()
            if not legacy:
                return
            demo = conn.execute("SELECT user_id FROM users WHERE user_id = 'usr_demo_admin'").fetchone()
            if demo:
                existing_demo_cfg = conn.execute(
                    "SELECT config_key FROM pipeline_config WHERE config_key = 'user_usr_demo_admin'"
                ).fetchone()
                if not existing_demo_cfg:
                    conn.execute(
                        "INSERT INTO pipeline_config (config_key, config_json, updated_at) VALUES (?, ?, ?)",
                        ("user_usr_demo_admin", legacy["config_json"], legacy["updated_at"]),
                    )
            conn.execute("DELETE FROM pipeline_config WHERE config_key = 'active'")

    def _serialize_user(self, row: Any) -> Dict[str, Any]:
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
        clean_name = display_name.strip()[:80] or clean_user

        if not USERNAME_RE.match(clean_user):
            return (
                None,
                "Username must be 3-32 characters using only lowercase letters, numbers, '.', '_', or '-' (no spaces or '@').",
            )
        if len(clean_email) > 254 or not EMAIL_RE.match(clean_email):
            return None, "Please enter a valid email address."
        if len(password) < 8:
            return None, "Password must be at least 8 characters."

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
        except Exception as e:
            if _is_integrity_error(e):
                err_msg = str(e).lower()
                if "username" in err_msg:
                    return None, "That username is already taken. Try signing in or choose another."
                if "email" in err_msg:
                    return None, "An account with that email already exists. Try signing in."
                return None, "Account already exists."
            raise

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
        try:
            ttl_days = max(1, min(30, int(os.environ.get("SESSION_TTL_DAYS", "7"))))
        except ValueError:
            ttl_days = 7
        expires = now + timedelta(days=ttl_days)
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

                new_name = (display_name.strip()[:80]) if display_name and display_name.strip() else row["display_name"]
                new_email = email.strip().lower() if email and email.strip() else row["email"]
                new_username = username.strip().lower() if username and username.strip() else row["username"]

                if new_username != row["username"] and not USERNAME_RE.match(new_username):
                    return (
                        None,
                        "Username must be 3-32 characters using only lowercase letters, numbers, '.', '_', or '-' (no spaces or '@').",
                    )
                if len(new_email) > 254 or not EMAIL_RE.match(new_email):
                    return None, "Please enter a valid email address."

                conn.execute(
                    "UPDATE users SET display_name = ?, email = ?, username = ? WHERE user_id = ?",
                    (new_name, new_email, new_username, user_id),
                )
                updated = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
                return self._serialize_user(updated), None
        except Exception as e:
            if _is_integrity_error(e):
                return None, "Username or email is already used by another account."
            raise

    def change_user_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str,
        keep_token: Optional[str] = None,
    ) -> Tuple[bool, str]:
        if len(new_password) < 8:
            return False, "New password must be at least 8 characters."
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
            if keep_token:
                conn.execute(
                    "DELETE FROM sessions WHERE user_id = ? AND token != ?",
                    (user_id, keep_token.strip()),
                )
            else:
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            return True, "Password updated successfully. Other active sessions have been signed out."

    def delete_user_account(self, user_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM vector_chunks WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM documents WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM query_runs WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM chat_sessions WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM saved_findings WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM pipeline_config WHERE config_key = ?", (f"user_{user_id}",))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            cur = conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
            deleted = cur.rowcount > 0

        if deleted:
            for base_dir in (self.uploads_dir, self.exports_dir):
                try:
                    user_dir = self._safe_child_path(base_dir, user_id)
                    if os.path.isdir(user_dir):
                        shutil.rmtree(user_dir, ignore_errors=True)
                except ValueError:
                    pass
        return deleted

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
        user_dir = self._safe_child_path(self.uploads_dir, user_id)
        os.makedirs(user_dir, exist_ok=True)
        raw_base = os.path.basename(filename or "document.txt")
        stem, ext = os.path.splitext(raw_base)
        clean_stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem).strip("._-")[:80] or "document"
        clean_ext = re.sub(r"[^a-zA-Z0-9.]+", "", ext)[:12]
        safe_name = f"{int(time.time())}_{secrets.token_hex(3)}_{clean_stem}{clean_ext}"
        target_path = self._safe_child_path(user_dir, safe_name)
        with open(target_path, "wb") as f:
            f.write(file_bytes)
        return target_path

    def get_user_uploads_bytes(self, user_id: str) -> int:
        try:
            user_dir = self._safe_child_path(self.uploads_dir, user_id)
        except ValueError:
            return 0
        if not os.path.isdir(user_dir):
            return 0
        total = 0
        for fn in os.listdir(user_dir):
            fp = os.path.join(user_dir, fn)
            if os.path.isfile(fp):
                try:
                    total += os.path.getsize(fp)
                except OSError:
                    pass
        return total

    def upsert_document_and_chunks(
        self,
        doc_record: Dict[str, Any],
        chunks: List[Dict[str, Any]],
        user_id: str = "usr_demo_admin",
        stored_file_path: Optional[str] = None,
    ):
        with self._get_conn() as conn:
            existing_owner = conn.execute(
                "SELECT user_id FROM documents WHERE id = ?",
                (doc_record["id"],),
            ).fetchone()
            if existing_owner and existing_owner["user_id"] != user_id:
                raise PermissionError("Cannot overwrite a document owned by another user.")

            conn.execute(
                """
                INSERT INTO documents (
                    id, user_id, title, filename, stored_file_path, format, ingested_at,
                    raw_text, cleaned_text, selected_strategy, auto_optimized,
                    extraction_telemetry_json, strategy_benchmarks_json, chunk_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def _make_auto_chat_title(self, prompt_text: str) -> str:
        clean = " ".join((prompt_text or "").strip().split())
        if not clean:
            return "New Chat"
        if len(clean) <= 48:
            return clean
        return clean[:45].rstrip(" ,.;:-") + "..."

    def _ensure_legacy_runs_have_chat_session(self, conn: _DualConnection, user_id: str):
        orphan = conn.execute(
            "SELECT query_id, timestamp, original_prompt FROM query_runs WHERE user_id = ? AND (chat_id IS NULL OR chat_id = '') ORDER BY timestamp ASC",
            (user_id,),
        ).fetchall()
        if not orphan:
            return
        legacy_chat_id = f"chat_legacy_{user_id[-8:]}"
        first_ts = orphan[0]["timestamp"]
        last_ts = orphan[-1]["timestamp"]
        title = self._make_auto_chat_title(orphan[0]["original_prompt"])
        conn.execute(
            """
            INSERT INTO chat_sessions (chat_id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(chat_id) DO NOTHING
            """,
            (legacy_chat_id, user_id, title, first_ts, last_ts),
        )
        conn.execute(
            "UPDATE query_runs SET chat_id = ? WHERE user_id = ? AND (chat_id IS NULL OR chat_id = '')",
            (legacy_chat_id, user_id),
        )

    def create_chat_session(self, user_id: str, title: str = "New Chat") -> Dict[str, Any]:
        clean_title = (title or "New Chat").strip()[:80] or "New Chat"
        chat_id = f"chat_{int(time.time() * 1000)}_{secrets.token_hex(3)}"
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO chat_sessions (chat_id, user_id, title, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (chat_id, user_id, clean_title, now, now),
            )
        return {
            "chatId": chat_id,
            "title": clean_title,
            "createdAt": now,
            "updatedAt": now,
            "messageCount": 0,
            "lastPrompt": "",
        }

    def list_chat_sessions(self, user_id: str = "usr_demo_admin") -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        with self._get_conn() as conn:
            self._ensure_legacy_runs_have_chat_session(conn, user_id)
            rows = conn.execute(
                """
                SELECT
                    cs.chat_id,
                    cs.title,
                    cs.created_at,
                    cs.updated_at,
                    COUNT(qr.query_id) AS msg_count,
                    MAX(qr.timestamp) AS last_msg_ts
                FROM chat_sessions cs
                LEFT JOIN query_runs qr
                    ON qr.chat_id = cs.chat_id AND qr.user_id = cs.user_id
                WHERE cs.user_id = ?
                GROUP BY cs.chat_id, cs.title, cs.created_at, cs.updated_at
                ORDER BY cs.updated_at DESC
                """,
                (user_id,),
            ).fetchall()
            for r in rows:
                cid = r["chat_id"]
                last_row = conn.execute(
                    "SELECT original_prompt FROM query_runs WHERE user_id = ? AND chat_id = ? ORDER BY timestamp DESC LIMIT 1",
                    (user_id, cid),
                ).fetchone()
                results.append({
                    "chatId": cid,
                    "title": r["title"],
                    "createdAt": r["created_at"],
                    "updatedAt": r["updated_at"],
                    "messageCount": int(r["msg_count"] or 0),
                    "lastPrompt": last_row["original_prompt"] if last_row else "",
                })
        return results

    def rename_chat_session(self, user_id: str, chat_id: str, new_title: str) -> Optional[Dict[str, Any]]:
        clean_title = (new_title or "").strip()[:80]
        if not clean_title:
            return None
        now = datetime.now(timezone.utc).isoformat()
        with self._get_conn() as conn:
            cur = conn.execute(
                "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE chat_id = ? AND user_id = ?",
                (clean_title, now, chat_id, user_id),
            )
            if cur.rowcount == 0:
                return None
            row = conn.execute(
                "SELECT chat_id, title, created_at, updated_at FROM chat_sessions WHERE chat_id = ? AND user_id = ?",
                (chat_id, user_id),
            ).fetchone()
            cnt_row = conn.execute(
                "SELECT COUNT(*) AS c FROM query_runs WHERE user_id = ? AND chat_id = ?",
                (user_id, chat_id),
            ).fetchone()
            last_row = conn.execute(
                "SELECT original_prompt FROM query_runs WHERE user_id = ? AND chat_id = ? ORDER BY timestamp DESC LIMIT 1",
                (user_id, chat_id),
            ).fetchone()
            return {
                "chatId": row["chat_id"],
                "title": row["title"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "messageCount": int(cnt_row["c"] or 0),
                "lastPrompt": last_row["original_prompt"] if last_row else "",
            }

    def delete_chat_session(self, user_id: str, chat_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute(
                "DELETE FROM query_runs WHERE user_id = ? AND chat_id = ?",
                (user_id, chat_id),
            )
            cur = conn.execute(
                "DELETE FROM chat_sessions WHERE user_id = ? AND chat_id = ?",
                (user_id, chat_id),
            )
            return cur.rowcount > 0

    def record_query_run(
        self,
        resp_obj: Dict[str, Any],
        user_id: str = "usr_demo_admin",
        chat_id: Optional[str] = None,
    ) -> str:
        pr = resp_obj["promptReshape"]
        m = resp_obj["metrics"]
        ts = resp_obj["timestamp"]
        orig_prompt = pr["originalPrompt"]

        with self._get_conn() as conn:
            target_chat_id = (chat_id or "").strip() or None
            if target_chat_id:
                existing = conn.execute(
                    "SELECT chat_id, title FROM chat_sessions WHERE chat_id = ? AND user_id = ?",
                    (target_chat_id, user_id),
                ).fetchone()
                if not existing:
                    target_chat_id = None
                else:
                    # Auto-name a "New Chat" session from the user's first message
                    new_title = (
                        self._make_auto_chat_title(orig_prompt)
                        if (existing["title"] or "").strip().lower() in ("new chat", "untitled chat", "")
                        else existing["title"]
                    )
                    conn.execute(
                        "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE chat_id = ? AND user_id = ?",
                        (new_title, ts, target_chat_id, user_id),
                    )

            if not target_chat_id:
                target_chat_id = f"chat_{int(time.time() * 1000)}_{secrets.token_hex(3)}"
                auto_title = self._make_auto_chat_title(orig_prompt)
                conn.execute(
                    """
                    INSERT INTO chat_sessions (chat_id, user_id, title, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (target_chat_id, user_id, auto_title, ts, ts),
                )

            resp_obj["chatId"] = target_chat_id

            conn.execute(
                """
                INSERT INTO query_runs (
                    query_id, user_id, chat_id, timestamp, original_prompt, reshaped_primary_query,
                    detected_intent, answer, overall_optimization_index,
                    groundedness_faithfulness, ndcg_at_k, total_latency_ms,
                    full_response_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(query_id) DO UPDATE SET
                    chat_id=excluded.chat_id,
                    timestamp=excluded.timestamp,
                    original_prompt=excluded.original_prompt,
                    reshaped_primary_query=excluded.reshaped_primary_query,
                    detected_intent=excluded.detected_intent,
                    answer=excluded.answer,
                    overall_optimization_index=excluded.overall_optimization_index,
                    groundedness_faithfulness=excluded.groundedness_faithfulness,
                    ndcg_at_k=excluded.ndcg_at_k,
                    total_latency_ms=excluded.total_latency_ms,
                    full_response_json=excluded.full_response_json
                """,
                (
                    resp_obj["queryId"],
                    user_id,
                    target_chat_id,
                    ts,
                    orig_prompt,
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
        return target_chat_id

    def load_query_history(
        self,
        user_id: str = "usr_demo_admin",
        limit: int = 50,
        chat_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            self._ensure_legacy_runs_have_chat_session(conn, user_id)
            if chat_id:
                rows = conn.execute(
                    "SELECT chat_id, full_response_json FROM query_runs WHERE user_id = ? AND chat_id = ? ORDER BY timestamp DESC LIMIT ?",
                    (user_id, chat_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT chat_id, full_response_json FROM query_runs WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?",
                    (user_id, limit),
                ).fetchall()
            out: List[Dict[str, Any]] = []
            for r in rows:
                obj = json.loads(r["full_response_json"])
                if r["chat_id"] and not obj.get("chatId"):
                    obj["chatId"] = r["chat_id"]
                active_cfg = obj.get("activeConfig")
                if isinstance(active_cfg, dict) and isinstance(active_cfg.get("apiKeys"), dict):
                    active_cfg["apiKeys"] = {
                        k: (
                            v
                            if (isinstance(v, str) and v.startswith("••••"))
                            else (("••••••••" + v[-4:]) if isinstance(v, str) and len(v) >= 4 else "")
                        )
                        for k, v in active_cfg["apiKeys"].items()
                    }
                out.append(obj)
            return out

    def clear_query_history(self, user_id: str = "usr_demo_admin", chat_id: Optional[str] = None):
        with self._get_conn() as conn:
            if chat_id:
                conn.execute("DELETE FROM query_runs WHERE user_id = ? AND chat_id = ?", (user_id, chat_id))
            else:
                conn.execute("DELETE FROM query_runs WHERE user_id = ?", (user_id,))
                conn.execute("DELETE FROM chat_sessions WHERE user_id = ?", (user_id,))

    def save_finding(self, payload: Dict[str, Any], user_id: str = "usr_demo_admin") -> Dict[str, Any]:
        raw_fid = str(payload.get("findingId") or "").strip()
        if raw_fid:
            if not SAFE_ID_RE.match(raw_fid):
                raise ValueError("Invalid findingId format.")
            finding_id = raw_fid
        else:
            finding_id = f"fnd_{int(time.time() * 1000)}_{secrets.token_hex(4)}"

        created_at = datetime.now(timezone.utc).isoformat()
        title = str(payload.get("title") or payload.get("prompt", "Research Finding"))[:120]
        prompt = str(payload.get("prompt") or "")[:4000]
        reshaped_query = str(payload.get("reshapedQuery") or prompt)[:4000]
        synthesized_answer = str(payload.get("synthesizedAnswer") or "")
        analyst_notes = str(payload.get("analystNotes") or "")[:4000]
        tags = payload.get("tags") or ["VERIFIED_RAG", "HNSW_HYBRID"]
        citations = payload.get("citations") or []
        claims = payload.get("claimVerifications") or []
        metrics = payload.get("metrics") or {}
        query_id = payload.get("queryId")

        with self._get_conn() as conn:
            existing = conn.execute(
                "SELECT user_id FROM saved_findings WHERE finding_id = ?",
                (finding_id,),
            ).fetchone()
            if existing and existing["user_id"] != user_id:
                raise PermissionError("Cannot modify a finding owned by another user.")

            conn.execute(
                """
                INSERT INTO saved_findings (
                    finding_id, user_id, query_id, title, created_at, prompt, reshaped_query,
                    synthesized_answer, analyst_notes, tags_json, citations_json,
                    claim_verifications_json, metrics_json, pinned
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(finding_id) DO UPDATE SET
                    query_id=excluded.query_id,
                    title=excluded.title,
                    created_at=excluded.created_at,
                    prompt=excluded.prompt,
                    reshaped_query=excluded.reshaped_query,
                    synthesized_answer=excluded.synthesized_answer,
                    analyst_notes=excluded.analyst_notes,
                    tags_json=excluded.tags_json,
                    citations_json=excluded.citations_json,
                    claim_verifications_json=excluded.claim_verifications_json,
                    metrics_json=excluded.metrics_json,
                    pinned=1
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

        user_export_dir = self._safe_child_path(self.exports_dir, user_id)
        os.makedirs(user_export_dir, exist_ok=True)
        md_path = self._safe_child_path(user_export_dir, f"{finding_id}.md")
        try:
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
        except Exception:
            pass

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
            "exportedMarkdownPath": f"vault://exports/{finding_id}.md",
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
                    "exportedMarkdownPath": f"vault://exports/{fid}.md",
                })
        return results

    def delete_finding(self, finding_id: str, user_id: str = "usr_demo_admin") -> bool:
        if not SAFE_ID_RE.match(finding_id or ""):
            return False
        with self._get_conn() as conn:
            cur = conn.execute(
                "DELETE FROM saved_findings WHERE finding_id = ? AND user_id = ?",
                (finding_id, user_id),
            )
            deleted = cur.rowcount > 0
        if deleted:
            try:
                user_export_dir = self._safe_child_path(self.exports_dir, user_id)
                md_path = self._safe_child_path(user_export_dir, f"{finding_id}.md")
                if os.path.isfile(md_path):
                    os.remove(md_path)
            except Exception:
                pass
        return deleted

    def save_pipeline_config(self, cfg: Dict[str, Any], user_id: str = "usr_demo_admin"):
        to_store = dict(cfg)
        raw_keys = cfg.get("apiKeys")
        if isinstance(raw_keys, dict):
            enc_keys = {}
            for k, v in raw_keys.items():
                if isinstance(v, str) and v.strip():
                    enc_keys[k] = self._encrypt_secret(v.strip())
                else:
                    enc_keys[k] = ""
            to_store["apiKeys"] = enc_keys

        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO pipeline_config (config_key, config_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(config_key) DO UPDATE SET
                    config_json=excluded.config_json,
                    updated_at=excluded.updated_at
                """,
                (f"user_{user_id}", json.dumps(to_store), datetime.now(timezone.utc).isoformat()),
            )

    def load_pipeline_config(self, user_id: str = "usr_demo_admin") -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT config_json FROM pipeline_config WHERE config_key = ?",
                (f"user_{user_id}",),
            ).fetchone()
            if not row:
                return None
            cfg = json.loads(row["config_json"])
            raw_keys = cfg.get("apiKeys")
            if isinstance(raw_keys, dict):
                cfg["apiKeys"] = {
                    k: self._decrypt_secret(v) if isinstance(v, str) else ""
                    for k, v in raw_keys.items()
                }
            return cfg

    def _count_scalar(self, conn: _DualConnection, sql: str, params: Tuple[Any, ...] = ()) -> int:
        row = conn.execute(sql, params).fetchone()
        if row is None:
            return 0
        if isinstance(row, dict):
            return int(next(iter(row.values())))
        return int(row[0])

    def get_database_telemetry(
        self, user_id: str = "usr_demo_admin", is_admin: bool = False
    ) -> Dict[str, Any]:
        user_uploads_dir = self._safe_child_path(self.uploads_dir, user_id)
        user_exports_dir = self._safe_child_path(self.exports_dir, user_id)
        upload_files = os.listdir(user_uploads_dir) if os.path.isdir(user_uploads_dir) else []
        export_files = os.listdir(user_exports_dir) if os.path.isdir(user_exports_dir) else []

        with self._get_conn() as conn:
            doc_count = self._count_scalar(conn, "SELECT COUNT(*) FROM documents WHERE user_id = ?", (user_id,))
            chunk_count = self._count_scalar(conn, "SELECT COUNT(*) FROM vector_chunks WHERE user_id = ?", (user_id,))
            query_count = self._count_scalar(conn, "SELECT COUNT(*) FROM query_runs WHERE user_id = ?", (user_id,))
            finding_count = self._count_scalar(conn, "SELECT COUNT(*) FROM saved_findings WHERE user_id = ?", (user_id,))

            if is_admin:
                user_count = self._count_scalar(conn, "SELECT COUNT(*) FROM users")
                json_index_path = os.path.join(self.data_dir, "hybrid_vectordb.json")
                json_size = os.path.getsize(json_index_path) if os.path.exists(json_index_path) else 0
                if self.is_postgres:
                    try:
                        db_bytes = self._count_scalar(conn, "SELECT pg_database_size(current_database())")
                    except Exception:
                        db_bytes = 0
                    size_kb = round(db_bytes / 1024.0, 2)
                    engine_label = "PostgreSQL Cloud Vault (Permanent) + Per-User HNSW & BM25+ Store"
                    storage_location = "Cloud PostgreSQL (via DATABASE_URL)"
                else:
                    db_size = os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0
                    wal_path = self.db_path + "-wal"
                    wal_size = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
                    size_kb = round((db_size + wal_size) / 1024.0, 2)
                    engine_label = "Multi-Tenant SQLite3 (WAL Mode) + Per-User HNSW & BM25+ Store"
                    storage_location = self.db_path
                vector_loc = json_index_path
                uploads_loc = user_uploads_dir
                exports_loc = user_exports_dir
                vector_kb = round(json_size / 1024.0, 2)
            else:
                user_count = 1
                doc_bytes = self._count_scalar(
                    conn,
                    "SELECT COALESCE(SUM(LENGTH(raw_text) + LENGTH(cleaned_text)), 0) FROM documents WHERE user_id = ?",
                    (user_id,),
                )
                chunk_bytes = self._count_scalar(
                    conn,
                    "SELECT COALESCE(SUM(LENGTH(content) + LENGTH(embedding_json)), 0) FROM vector_chunks WHERE user_id = ?",
                    (user_id,),
                )
                run_bytes = self._count_scalar(
                    conn,
                    "SELECT COALESCE(SUM(LENGTH(full_response_json)), 0) FROM query_runs WHERE user_id = ?",
                    (user_id,),
                )
                size_kb = round((doc_bytes + chunk_bytes + run_bytes) / 1024.0, 2)
                vector_kb = round(chunk_bytes / 1024.0, 2)
                engine_label = (
                    "PostgreSQL Cloud Vault (Isolated Per-User Scope)"
                    if self.is_postgres
                    else "SQLite3 WAL Vault (Isolated Per-User Scope)"
                )
                storage_location = "vault://database/per-user-scope"
                vector_loc = "vault://vector-index/per-user-scope"
                uploads_loc = "vault://uploads/per-user-scope"
                exports_loc = "vault://exports/per-user-scope"

        return {
            "engine": engine_label,
            "sqliteFilePath": storage_location,
            "vectorSnapshotPath": vector_loc,
            "uploadsDirPath": uploads_loc,
            "exportsDirPath": exports_loc,
            "sqliteSizeKb": size_kb,
            "vectorSnapshotSizeKb": vector_kb,
            "uploadedRawFilesCount": len(upload_files),
            "exportedMarkdownReportsCount": len(export_files),
            "tables": [
                {
                    "tableName": "users",
                    "rowCount": user_count,
                    "purpose": (
                        "Registered user accounts with PBKDF2-HMAC-SHA256 salted password hashes & active sessions"
                        if is_admin
                        else "Your isolated account record with PBKDF2-HMAC-SHA256 salted password hash & active sessions"
                    ),
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
                    "purpose": "Your encrypted private API keys, LLM provider/model choices, and RRF/CRAG tuning",
                },
            ],
        }

    @staticmethod
    def _parse_utc_datetime(raw_val: Optional[str], end_of_day_if_date_only: bool = False) -> Optional[datetime]:
        if raw_val is None:
            return None
        s = str(raw_val).strip()
        if not s:
            return None
        date_only = bool(re.match(r"^\d{4}-\d{2}-\d{2}$", s))
        if date_only:
            dt = datetime.fromisoformat(s + ("T23:59:59.999999+00:00" if end_of_day_if_date_only else "T00:00:00+00:00"))
            return dt.astimezone(timezone.utc)
        norm = s[:-1] + "+00:00" if s.endswith(("Z", "z")) else s
        dt = datetime.fromisoformat(norm)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def get_user_analytics(
        self,
        user_id: str = "usr_demo_admin",
        start_at: Optional[str] = None,
        end_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Computes strictly per-user corpus, chunking technique, extraction/OCR, and
        LLM token usage analytics across documents, vector_chunks, and query_runs,
        optionally filtered to a [start_at, end_at] UTC date/time window.
        """
        start_dt = self._parse_utc_datetime(start_at, end_of_day_if_date_only=False)
        end_dt = self._parse_utc_datetime(end_at, end_of_day_if_date_only=True)
        if start_dt and end_dt and start_dt > end_dt:
            raise ValueError("Start date/time must be earlier than or equal to end date/time.")

        def _in_range(ts_raw: Optional[str]) -> bool:
            if not start_dt and not end_dt:
                return True
            try:
                dt = self._parse_utc_datetime(ts_raw)
            except Exception:
                return False
            if dt is None:
                return False
            if start_dt and dt < start_dt:
                return False
            if end_dt and dt > end_dt:
                return False
            return True

        def _est_tok(txt: str) -> int:
            s = (txt or "").strip()
            return max(1, (len(s) + 3) // 4) if s else 0

        with self._get_conn() as conn:
            all_doc_rows = conn.execute(
                """
                SELECT id, title, filename, format, ingested_at, selected_strategy,
                       auto_optimized, extraction_telemetry_json, chunk_count
                FROM documents
                WHERE user_id = ?
                ORDER BY ingested_at DESC
                """,
                (user_id,),
            ).fetchall()

            all_chunk_rows = conn.execute(
                """
                SELECT document_id, token_count, coherence_score, information_density, strategy
                FROM vector_chunks
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchall()

            all_run_rows = conn.execute(
                """
                SELECT query_id, timestamp, original_prompt, answer, total_latency_ms,
                       groundedness_faithfulness, full_response_json
                FROM query_runs
                WHERE user_id = ?
                ORDER BY timestamp ASC
                """,
                (user_id,),
            ).fetchall()

        doc_rows = [d for d in all_doc_rows if _in_range(d["ingested_at"])]
        matched_doc_ids = {d["id"] for d in doc_rows}
        chunk_rows = (
            [ch for ch in all_chunk_rows if ch["document_id"] in matched_doc_ids]
            if (start_dt or end_dt)
            else all_chunk_rows
        )
        run_rows = [r for r in all_run_rows if _in_range(r["timestamp"])]

        # Aggregate chunk stats per document
        doc_chunk_agg: Dict[str, Dict[str, Any]] = {}
        total_indexed_tokens = 0
        for ch in chunk_rows:
            did = ch["document_id"]
            toks = int(ch["token_count"] or 0)
            total_indexed_tokens += toks
            entry = doc_chunk_agg.get(did)
            if entry is None:
                entry = {"count": 0, "tokens": 0, "coherenceSum": 0.0, "densitySum": 0.0}
                doc_chunk_agg[did] = entry
            entry["count"] += 1
            entry["tokens"] += toks
            entry["coherenceSum"] += float(ch["coherence_score"] or 0.0)
            entry["densitySum"] += float(ch["information_density"] or 0.0)

        strategy_map: Dict[str, Dict[str, Any]] = {}
        format_map: Dict[str, Dict[str, Any]] = {}
        per_document_metrics: List[Dict[str, Any]] = []
        ocr_doc_count = 0
        auto_opt_doc_count = 0

        for d in doc_rows:
            did = d["id"]
            agg = doc_chunk_agg.get(did, {"count": int(d["chunk_count"] or 0), "tokens": 0, "coherenceSum": 0.0, "densitySum": 0.0})
            c_count = agg["count"] or int(d["chunk_count"] or 0)
            d_tokens = agg["tokens"]
            avg_tok = round(d_tokens / c_count, 1) if c_count > 0 else 0.0
            avg_coh = round(agg["coherenceSum"] / agg["count"], 1) if agg["count"] > 0 else 0.0
            avg_den = round(agg["densitySum"] / agg["count"], 1) if agg["count"] > 0 else 0.0

            try:
                tel = json.loads(d["extraction_telemetry_json"] or "{}")
            except Exception:
                tel = {}
            ocr_used = bool(tel.get("ocrUsed"))
            if ocr_used:
                ocr_doc_count += 1
            auto_opt = bool(d["auto_optimized"])
            if auto_opt:
                auto_opt_doc_count += 1

            strategy = str(d["selected_strategy"] or "semantic").strip().lower()
            fmt = str(d["format"] or "TXT").strip().upper()

            s_ent = strategy_map.setdefault(strategy, {"strategy": strategy, "documentCount": 0, "chunkCount": 0, "indexedTokens": 0})
            s_ent["documentCount"] += 1
            s_ent["chunkCount"] += c_count
            s_ent["indexedTokens"] += d_tokens

            f_ent = format_map.setdefault(fmt, {"format": fmt, "documentCount": 0, "chunkCount": 0, "indexedTokens": 0})
            f_ent["documentCount"] += 1
            f_ent["chunkCount"] += c_count
            f_ent["indexedTokens"] += d_tokens

            per_document_metrics.append({
                "documentId": did,
                "title": d["title"],
                "filename": d["filename"],
                "format": fmt,
                "ingestedAt": d["ingested_at"],
                "chunkCount": c_count,
                "indexedTokens": d_tokens,
                "avgTokensPerChunk": avg_tok,
                "selectedStrategy": strategy,
                "autoOptimized": auto_opt,
                "ocrUsed": ocr_used,
                "ocrConfidence": float(tel.get("ocrConfidence") or 100.0),
                "noiseReductionPct": float(tel.get("noiseReductionPct") or tel.get("reductionPct") or 0.0),
                "extractionOperations": list(tel.get("operations") or [])[:5],
                "avgCoherence": avg_coh,
                "avgInfoDensity": avg_den,
            })

        # Aggregate LLM token usage across all query_runs (with legacy fallback estimation)
        reshaper_in = 0
        reshaper_out = 0
        gen_in = 0
        gen_out = 0
        provider_api_queries = 0
        estimated_queries = 0
        latency_sum = 0.0
        grounded_sum = 0.0
        provider_map: Dict[str, Dict[str, Any]] = {}
        timeline: List[Dict[str, Any]] = []

        for r in run_rows:
            try:
                full_obj = json.loads(r["full_response_json"] or "{}")
            except Exception:
                full_obj = {}

            tu = full_obj.get("tokenUsage") if isinstance(full_obj.get("tokenUsage"), dict) else None
            if tu and isinstance(tu.get("reshaper"), dict) and isinstance(tu.get("generator"), dict):
                r_in = int(tu["reshaper"].get("inputTokens") or 0)
                r_out = int(tu["reshaper"].get("outputTokens") or 0)
                g_in = int(tu["generator"].get("inputTokens") or 0)
                g_out = int(tu["generator"].get("outputTokens") or 0)
                g_prov = str(tu["generator"].get("provider") or "builtin_local")
                g_model = str(tu["generator"].get("model") or "local")
                r_src = str(tu["reshaper"].get("source") or "estimated")
                g_src = str(tu["generator"].get("source") or "estimated")
                is_exact = (r_src == "provider_api" or g_src == "provider_api")
            else:
                # Legacy query run recorded before real token tracking: estimate cleanly
                orig_p = str(r["original_prompt"] or "")
                ans = str(r["answer"] or "")
                pr_obj = full_obj.get("promptReshape") or {}
                ret_chunks = full_obj.get("retrievedChunks") or []
                ctx_tokens = sum(_est_tok(str(c.get("content") or "")) for c in ret_chunks)
                r_in = _est_tok(orig_p) + 120
                r_out = _est_tok(str(pr_obj.get("reshapedPrimaryQuery") or orig_p)) + _est_tok(str(pr_obj.get("hydeDocument") or ""))
                g_in = _est_tok(orig_p) + ctx_tokens + 180
                g_out = _est_tok(ans)
                active_cfg = full_obj.get("activeConfig") or {}
                g_prov = str(active_cfg.get("generatorProvider") or "builtin_local")
                g_model = str(active_cfg.get("generatorModel") or "local")
                is_exact = False

            if is_exact:
                provider_api_queries += 1
            else:
                estimated_queries += 1

            reshaper_in += r_in
            reshaper_out += r_out
            gen_in += g_in
            gen_out += g_out

            q_in = r_in + g_in
            q_out = r_out + g_out
            q_tot = q_in + q_out
            lat_ms = int(r["total_latency_ms"] or 0)
            gnd = float(r["groundedness_faithfulness"] or 0.0)
            latency_sum += lat_ms
            grounded_sum += gnd

            p_key = f"{g_prov}::{g_model}"
            p_ent = provider_map.setdefault(
                p_key,
                {
                    "provider": g_prov,
                    "model": g_model,
                    "queries": 0,
                    "inputTokens": 0,
                    "outputTokens": 0,
                    "totalTokens": 0,
                },
            )
            p_ent["queries"] += 1
            p_ent["inputTokens"] += q_in
            p_ent["outputTokens"] += q_out
            p_ent["totalTokens"] += q_tot

            ts_str = str(r["timestamp"] or "")
            short_label = ts_str[5:16].replace("T", " ") if len(ts_str) >= 16 else ts_str
            prompt_preview = " ".join(str(r["original_prompt"] or "").split())[:68]
            timeline.append({
                "queryId": r["query_id"],
                "timestamp": ts_str,
                "label": short_label,
                "promptPreview": prompt_preview,
                "inputTokens": q_in,
                "outputTokens": q_out,
                "totalTokens": q_tot,
                "reshaperTokens": r_in + r_out,
                "generatorTokens": g_in + g_out,
                "provider": g_prov,
                "model": g_model,
                "source": "provider_api" if is_exact else "estimated",
                "latencyMs": lat_ms,
                "groundedness": round(gnd, 3),
            })

        total_queries = len(run_rows)
        total_in = reshaper_in + gen_in
        total_out = reshaper_out + gen_out
        total_tok = total_in + total_out

        strategy_dist = sorted(strategy_map.values(), key=lambda x: (-x["chunkCount"], -x["documentCount"]))
        format_dist = sorted(format_map.values(), key=lambda x: (-x["documentCount"], -x["chunkCount"]))
        provider_breakdown = sorted(provider_map.values(), key=lambda x: -x["totalTokens"])

        return {
            "appliedRange": {
                "startAt": start_dt.isoformat() if start_dt else None,
                "endAt": end_dt.isoformat() if end_dt else None,
            },
            "corpusTotals": {
                "totalDocuments": len(doc_rows),
                "totalChunks": len(chunk_rows),
                "totalIndexedTokens": total_indexed_tokens,
                "avgChunksPerDocument": round(len(chunk_rows) / len(doc_rows), 1) if doc_rows else 0.0,
                "avgTokensPerChunk": round(total_indexed_tokens / len(chunk_rows), 1) if chunk_rows else 0.0,
                "ocrDocumentCount": ocr_doc_count,
                "nativeDocumentCount": max(0, len(doc_rows) - ocr_doc_count),
                "autoOptimizedCount": auto_opt_doc_count,
                "manualStrategyCount": max(0, len(doc_rows) - auto_opt_doc_count),
                "dominantStrategy": strategy_dist[0]["strategy"] if strategy_dist else "none",
            },
            "tokenTotals": {
                "totalInputTokens": total_in,
                "totalOutputTokens": total_out,
                "totalTokens": total_tok,
                "reshaperInputTokens": reshaper_in,
                "reshaperOutputTokens": reshaper_out,
                "reshaperTotalTokens": reshaper_in + reshaper_out,
                "generatorInputTokens": gen_in,
                "generatorOutputTokens": gen_out,
                "generatorTotalTokens": gen_in + gen_out,
                "avgTokensPerQuery": round(total_tok / total_queries, 1) if total_queries else 0.0,
                "avgLatencyMs": round(latency_sum / total_queries, 1) if total_queries else 0.0,
                "avgGroundedness": round(grounded_sum / total_queries, 3) if total_queries else 0.0,
                "totalQueries": total_queries,
                "providerApiQueries": provider_api_queries,
                "estimatedQueries": estimated_queries,
            },
            "strategyDistribution": strategy_dist,
            "formatDistribution": format_dist,
            "providerBreakdown": provider_breakdown,
            "perDocumentMetrics": per_document_metrics,
            "queryTokenTimeline": timeline[-30:],
        }
