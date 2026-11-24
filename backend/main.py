import json
import logging
import os
import random
import re
import secrets
import sys
import threading
import time
import urllib.request
from collections import deque
from datetime import datetime, timezone
from functools import wraps
from typing import Dict, Any, List, Optional, Deque

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from flask import Flask, Response, request, jsonify, g, make_response, stream_with_context
from flask_cors import CORS
from werkzeug.exceptions import RequestEntityTooLarge

from extractor import extract_document_from_bytes, optimize_and_clean_text
from vectordb import HybridVectorDatabase
from llm_engine import (
    OFFLINE_MODEL_PORTAL_CATALOG,
    reshape_user_prompt,
    scan_local_model_path,
    stream_synthesize_answer_and_verify,
    synthesize_answer_and_verify,
    validate_local_endpoint_url,
)
from seed_corpus import SEED_CORPUS_DOCUMENTS

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
security_logger = logging.getLogger("clayrag.security")

WORKSPACE_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
DATA_DIR = os.environ.get("CLAYRAG_DATA_DIR") or os.path.join(WORKSPACE_ROOT, "data")
MAX_UPLOAD_MB = max(1, int(os.environ.get("MAX_UPLOAD_MB", "25")))
MAX_USER_STORAGE_BYTES = max(5, int(os.environ.get("MAX_USER_STORAGE_MB", "100"))) * 1024 * 1024
MAX_USER_DOCS = max(5, int(os.environ.get("MAX_USER_DOCS", "100")))
MAX_PROMPT_CHARS = 4000
SESSION_COOKIE_NAME = "clayrag_session"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

_raw_origins = (os.environ.get("ALLOWED_ORIGINS") or "*").strip()
_cors_origins: Any = "*" if _raw_origins == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]
_cors_supports_credentials = _cors_origins != "*"
if _cors_origins == "*" and os.environ.get("RENDER"):
    security_logger.warning("ALLOWED_ORIGINS is set to '*'; restrict this to your frontend origin in production.")

CORS(
    app,
    resources={r"/api/*": {"origins": _cors_origins}},
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    supports_credentials=_cors_supports_credentials,
)

# Thread-safe sliding-window rate limiter for auth endpoints
_rate_limit_lock = threading.Lock()
_rate_limit_buckets: Dict[str, Deque[float]] = {}


def _get_client_ip() -> str:
    xff = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return xff or (request.remote_addr or "unknown")


def _check_rate_limit(bucket: str, key: str, max_requests: int, window_seconds: int) -> bool:
    if os.environ.get("DISABLE_RATE_LIMIT", "").strip().lower() in ("1", "true", "yes"):
        return True
    now = time.monotonic()
    full_key = f"{bucket}:{key}"
    with _rate_limit_lock:
        q = _rate_limit_buckets.get(full_key)
        if q is None:
            q = deque()
            _rate_limit_buckets[full_key] = q
        cutoff = now - window_seconds
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= max_requests:
            return False
        q.append(now)
        return True


def _is_https_request() -> bool:
    proto = (request.headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    return request.is_secure or proto == "https"


def _attach_session_cookie(resp: Any, token: str) -> Any:
    try:
        ttl_days = max(1, min(30, int(os.environ.get("SESSION_TTL_DAYS", "7"))))
    except ValueError:
        ttl_days = 7
    is_https = _is_https_request()
    resp.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        max_age=ttl_days * 86400,
        httponly=True,
        secure=is_https,
        samesite="None" if (is_https and _cors_supports_credentials) else "Lax",
        path="/",
    )
    return resp


def _clear_session_cookie(resp: Any) -> Any:
    is_https = _is_https_request()
    resp.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=is_https,
        samesite="None" if (is_https and _cors_supports_credentials) else "Lax",
    )
    return resp


@app.after_request
def _add_security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if _is_https_request():
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.errorhandler(RequestEntityTooLarge)
def _handle_file_too_large(_err):
    return jsonify({"error": f"Upload exceeds maximum allowed size of {MAX_UPLOAD_MB} MB."}), 413


vector_db = HybridVectorDatabase(DATA_DIR)
sql_db = vector_db.sql_db


def mask_config_for_client(cfg: Dict[str, Any]) -> Dict[str, Any]:
    masked_keys: Dict[str, str] = {}
    for k, val in (cfg.get("apiKeys") or {}).items():
        if isinstance(val, str) and val.startswith("••••"):
            masked_keys[k] = val
        elif isinstance(val, str) and len(val) >= 4:
            masked_keys[k] = "••••••••" + val[-4:]
        else:
            masked_keys[k] = ""
    return {
        **cfg,
        "apiKeys": masked_keys,
    }


@app.route("/", methods=["GET"])
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "clayrag-python-backend",
        "version": "1.0.0",
        "databaseEngine": "postgresql" if sql_db.is_postgres else "sqlite",
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
        "offlineModelPath": "./models/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
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
        "queryId": f"qry_{int(time.time() * 1000)}_{secrets.token_hex(4)}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "promptReshape": prompt_reshape,
        "retrievedChunks": retrieval["retrievedChunks"],
        "prunedNoiseChunks": retrieval["prunedNoiseChunks"],
        "queryCoords2D": retrieval["queryCoords2D"],
        "hydeCoords2D": retrieval["hydeCoords2D"],
        "answer": synthesis["answer"],
        "citations": synthesis["citations"],
        "claimVerifications": synthesis["claimVerifications"],
        "tokenUsage": synthesis.get("tokenUsage"),
        "metrics": synthesis["metrics"],
        "activeConfig": mask_config_for_client(config_used),
    }

    resolved_chat_id = sql_db.record_query_run(resp_obj, user_id=user_id, chat_id=chat_id)
    resp_obj["chatId"] = resolved_chat_id
    return resp_obj


# Seed demo admin workspace ONLY when demo mode is explicitly enabled
if os.environ.get("ENABLE_DEMO_USER", "").strip().lower() in ("1", "true", "yes"):
    seed_user_workspace_if_empty("usr_demo_admin")


def _extract_bearer_token() -> Optional[str]:
    auth_hdr = request.headers.get("Authorization", "")
    if auth_hdr.lower().startswith("bearer "):
        tok = auth_hdr[7:].strip()
        if tok:
            return tok
    cookie_tok = (request.cookies.get(SESSION_COOKIE_NAME) or "").strip()
    return cookie_tok or None


def _is_current_admin() -> bool:
    user = getattr(g, "current_user", None)
    return bool(user and str(user.get("role") or "").upper() == "ADMIN")


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
    client_ip = _get_client_ip()
    if not _check_rate_limit("register_ip", client_ip, max_requests=5, window_seconds=900):
        security_logger.warning("auth_register rate_limited ip=%s", client_ip)
        return jsonify({"error": "Too many registration attempts. Please try again later."}), 429

    body = request.get_json(force=True, silent=True) or {}
    username = str(body.get("username") or "")
    display_name = str(body.get("displayName") or "")
    email = str(body.get("email") or "")
    password = str(body.get("password") or "")
    seed_starter = bool(body.get("seedStarterCorpus", True))

    user, err = sql_db.create_user(username, display_name, email, password)
    if err or not user:
        security_logger.info(
            "auth_register rejected ip=%s username=%s reason=%s",
            client_ip,
            username.strip().lower()[:32],
            err or "failed",
        )
        return jsonify({"error": err or "Registration failed."}), 400

    token = sql_db.create_session(user["userId"])
    if seed_starter:
        seed_user_workspace_if_empty(user["userId"])

    security_logger.info("auth_register success ip=%s user_id=%s", client_ip, user["userId"])
    resp = make_response(jsonify({
        "success": True,
        "token": token,
        "user": user,
    }))
    return _attach_session_cookie(resp, token)


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    client_ip = _get_client_ip()
    body = request.get_json(force=True, silent=True) or {}
    identifier = str(body.get("identifier") or body.get("username") or body.get("email") or "")
    password = str(body.get("password") or "")
    norm_ident = identifier.strip().lower()[:64]

    if not _check_rate_limit("login_ip", client_ip, max_requests=20, window_seconds=300) or (
        norm_ident and not _check_rate_limit("login_ident", f"{client_ip}:{norm_ident}", max_requests=10, window_seconds=300)
    ):
        security_logger.warning("auth_login rate_limited ip=%s identifier=%s", client_ip, norm_ident)
        return jsonify({"error": "Too many sign-in attempts. Please wait a few minutes and try again."}), 429

    user, err = sql_db.authenticate_user(identifier, password)
    if err or not user:
        security_logger.warning("auth_login failed ip=%s identifier=%s", client_ip, norm_ident)
        return jsonify({"error": err or "Invalid credentials."}), 401

    token = sql_db.create_session(user["userId"])
    security_logger.info("auth_login success ip=%s user_id=%s", client_ip, user["userId"])
    resp = make_response(jsonify({
        "success": True,
        "token": token,
        "user": user,
    }))
    return _attach_session_cookie(resp, token)


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    token = _extract_bearer_token()
    if token:
        sql_db.delete_session(token)
    resp = make_response(jsonify({"success": True}))
    return _clear_session_cookie(resp)


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
    security_logger.info("account_profile_updated user_id=%s", user_id)
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
        keep_token=g.auth_token,
    )
    if not ok:
        security_logger.warning("account_password_change_failed user_id=%s", user_id)
        return jsonify({"error": msg}), 400
    security_logger.info("account_password_changed user_id=%s", user_id)
    return jsonify({"success": True, "message": msg})


@app.route("/api/account", methods=["DELETE"])
@require_auth
def delete_account():
    user_id = g.current_user["userId"]
    vector_db.purge_user_data_in_memory(user_id)
    deleted = sql_db.delete_user_account(user_id)
    security_logger.info("account_deleted user_id=%s deleted=%s", user_id, deleted)
    resp = make_response(jsonify({"success": deleted}))
    return _clear_session_cookie(resp)


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
    safe_config = mask_config_for_client(cfg)

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
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
        "analytics": sql_db.get_user_analytics(user_id),
        "modelPortalCatalog": OFFLINE_MODEL_PORTAL_CATALOG,
    })


@app.route("/api/analytics", methods=["GET"])
@require_auth
def get_user_analytics_route():
    user_id = g.current_user["userId"]
    return jsonify(sql_db.get_user_analytics(user_id))


@app.route("/api/ingest/upload", methods=["POST"])
@require_auth
def ingest_upload():
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    files = request.files.getlist("files")
    if not files:
        return jsonify({"error": "No files uploaded."}), 400

    existing_doc_count = vector_db.get_document_count(user_id)
    if existing_doc_count + len(files) > MAX_USER_DOCS:
        return jsonify({"error": f"Document quota exceeded (max {MAX_USER_DOCS} documents per account)."}), 400

    auto_opt_raw = request.form.get("autoOptimize")
    if auto_opt_raw is not None:
        auto_opt = str(auto_opt_raw).lower() in ("true", "1", "yes")
    else:
        auto_opt = bool(cfg.get("autoOptimizeChunking", True))

    preferred_strategy = request.form.get("strategy") or cfg.get("defaultChunkStrategy", "semantic")
    target_tokens = max(40, min(1000, int(request.form.get("targetChunkTokens") or cfg.get("targetChunkTokens", 150))))
    overlap_tokens = max(0, min(300, int(request.form.get("chunkOverlapTokens") or cfg.get("chunkOverlapTokens", 30))))

    current_bytes = sql_db.get_user_uploads_bytes(user_id)
    ingested_docs = []
    for f in files:
        file_bytes = f.read()
        if len(file_bytes) > MAX_UPLOAD_MB * 1024 * 1024:
            return jsonify({"error": f"Single file exceeds maximum allowed size of {MAX_UPLOAD_MB} MB."}), 413
        if current_bytes + len(file_bytes) > MAX_USER_STORAGE_BYTES:
            return jsonify({"error": f"Storage quota exceeded (max {MAX_USER_STORAGE_BYTES // (1024 * 1024)} MB per account)."}), 413
        current_bytes += len(file_bytes)

        orig_name = os.path.basename(f.filename or "uploaded_document.txt") or "uploaded_document.txt"
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
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
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
    if vector_db.get_document_count(user_id) >= MAX_USER_DOCS:
        return jsonify({"error": f"Document quota exceeded (max {MAX_USER_DOCS} documents per account)."}), 400
    content_bytes = content.encode("utf-8")
    if sql_db.get_user_uploads_bytes(user_id) + len(content_bytes) > MAX_USER_STORAGE_BYTES:
        return jsonify({"error": f"Storage quota exceeded (max {MAX_USER_STORAGE_BYTES // (1024 * 1024)} MB per account)."}), 413

    title = str(body.get("title") or "").strip()[:140] or f"Technical Specification {vector_db.get_document_count(user_id) + 1}"
    doc_format = str(body.get("format") or "MARKDOWN")
    auto_opt = bool(body.get("autoOptimize", cfg.get("autoOptimizeChunking", True)))
    strategy = str(body.get("strategy") or cfg.get("defaultChunkStrategy", "semantic"))
    target_tokens = max(40, min(1000, int(body.get("targetChunkTokens") or cfg.get("targetChunkTokens", 150))))
    overlap_tokens = max(0, min(300, int(body.get("chunkOverlapTokens") or cfg.get("chunkOverlapTokens", 30))))

    cleaned_text, telemetry = optimize_and_clean_text(content, False, 100.0)
    filename_slug = (re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_") or "document") + ".md"
    stored_path = sql_db.save_uploaded_raw_file(filename_slug, content_bytes, user_id=user_id)

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
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
    })


@app.route("/api/documents/<doc_id>/rechunk", methods=["POST"])
@require_auth
def rechunk_doc(doc_id: str):
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    body = request.get_json(force=True, silent=True) or {}
    strategy = str(body.get("strategy") or "semantic")
    target_tokens = max(40, min(1000, int(body.get("targetChunkTokens") or cfg.get("targetChunkTokens", 150))))
    overlap_tokens = max(0, min(300, int(body.get("chunkOverlapTokens") or cfg.get("chunkOverlapTokens", 30))))

    updated = vector_db.rechunk_document(
        doc_id, strategy, user_id=user_id, target_chunk_tokens=target_tokens, chunk_overlap_tokens=overlap_tokens
    )
    if not updated:
        return jsonify({"error": "Document not found."}), 404

    return jsonify({
        "success": True,
        "document": updated,
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
    })


@app.route("/api/documents/<doc_id>", methods=["DELETE"])
@require_auth
def delete_doc(doc_id: str):
    user_id = g.current_user["userId"]
    deleted = vector_db.delete_document(doc_id, user_id=user_id)
    return jsonify({
        "success": deleted,
        "stats": vector_db.get_vectordb_stats(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
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
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
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
    if len(prompt) > MAX_PROMPT_CHARS:
        return jsonify({"error": f"Prompt exceeds maximum length of {MAX_PROMPT_CHARS} characters."}), 400

    chat_id = body.get("chatId")
    if isinstance(chat_id, str):
        chat_id = chat_id.strip() or None
    else:
        chat_id = None

    overrides = body.get("configOverrides") if isinstance(body.get("configOverrides"), dict) else {}
    merged_keys = dict(cfg.get("apiKeys", {}))
    if isinstance(overrides.get("apiKeys"), dict):
        for k in ("openai", "gemini", "anthropic", "groq", "openrouter"):
            v = overrides["apiKeys"].get(k)
            if isinstance(v, str) and v.strip() and not v.startswith("••••"):
                merged_keys[k] = v.strip()

    merged_eps = dict(cfg.get("localEndpoints", {}))
    if isinstance(overrides.get("localEndpoints"), dict):
        for ep_key in ("ollamaUrl", "lmStudioUrl"):
            raw_ep = overrides["localEndpoints"].get(ep_key)
            if isinstance(raw_ep, str) and raw_ep.strip():
                validated_ep = validate_local_endpoint_url(raw_ep)
                if not validated_ep:
                    return jsonify({"error": f"Invalid or disallowed local endpoint URL for {ep_key}."}), 400
                merged_eps[ep_key] = validated_ep

    merged_config = {
        **cfg,
        **overrides,
        "apiKeys": merged_keys,
        "localEndpoints": merged_eps,
    }

    resp_obj = execute_rag_pipeline(prompt, merged_config, user_id=user_id, chat_id=chat_id)
    resp_obj["chatSessions"] = sql_db.list_chat_sessions(user_id)
    resp_obj["analytics"] = sql_db.get_user_analytics(user_id)
    return jsonify(resp_obj)


def _format_sse_event(event_name: str, data_obj: Any) -> str:
    return f"event: {event_name}\ndata: {json.dumps(data_obj, ensure_ascii=False)}\n\n"


@app.route("/api/query/stream", methods=["POST"])
@require_auth
def query_rag_stream():
    user_id = g.current_user["userId"]
    cfg = get_user_config(user_id)
    body = request.get_json(force=True, silent=True) or {}
    prompt = str(body.get("prompt") or "").strip()
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400
    if len(prompt) > MAX_PROMPT_CHARS:
        return jsonify({"error": f"Prompt exceeds maximum length of {MAX_PROMPT_CHARS} characters."}), 400

    chat_id = body.get("chatId")
    if isinstance(chat_id, str):
        chat_id = chat_id.strip() or None
    else:
        chat_id = None

    overrides = body.get("configOverrides") if isinstance(body.get("configOverrides"), dict) else {}
    merged_keys = dict(cfg.get("apiKeys", {}))
    if isinstance(overrides.get("apiKeys"), dict):
        for k in ("openai", "gemini", "anthropic", "groq", "openrouter"):
            v = overrides["apiKeys"].get(k)
            if isinstance(v, str) and v.strip() and not v.startswith("••••"):
                merged_keys[k] = v.strip()

    merged_eps = dict(cfg.get("localEndpoints", {}))
    if isinstance(overrides.get("localEndpoints"), dict):
        for ep_key in ("ollamaUrl", "lmStudioUrl"):
            raw_ep = overrides["localEndpoints"].get(ep_key)
            if isinstance(raw_ep, str) and raw_ep.strip():
                validated_ep = validate_local_endpoint_url(raw_ep)
                if not validated_ep:
                    return jsonify({"error": f"Invalid or disallowed local endpoint URL for {ep_key}."}), 400
                merged_eps[ep_key] = validated_ep

    merged_config = {
        **cfg,
        **overrides,
        "apiKeys": merged_keys,
        "localEndpoints": merged_eps,
    }

    def event_stream():
        try:
            yield _format_sse_event("stage", {
                "stage": 1,
                "label": "Stage 01 // Small LLM Reshaping Prompt & Expanding Domain Concepts...",
            })

            all_chunks = vector_db.get_all_chunks(user_id)
            user_docs = vector_db.get_all_documents(user_id)

            def _is_seed(c: Dict[str, Any]) -> bool:
                did = str(c.get("documentId") or "").lower()
                dtitle = str(c.get("documentTitle") or "").lower()
                markers = (
                    "doc_hnsw_architecture", "doc_chunking_optimization",
                    "doc_agentic_reshaper_ocr", "doc_small_llm_crag_ocr",
                    "seed_01", "seed_02", "seed_03",
                    "hnsw vector indexing & hybrid rrf",
                    "adaptive chunking strategy benchmark",
                    "small llm prompt reshaping, crag & multimodal ocr",
                )
                return any(m in did or m in dtitle for m in markers)

            custom_chunks = [c for c in all_chunks if not _is_seed(c)]
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
                merged_config,
                recent_history=recent_history,
            )

            yield _format_sse_event("stage", {
                "stage": 2,
                "label": "Stage 02 // Searching 3-Layer HNSW Graph + BM25+ Lexical Index...",
            })

            retrieval = vector_db.hybrid_retrieve_and_rerank(
                original_prompt=prompt,
                reshaped_primary_query=prompt_reshape["reshapedPrimaryQuery"],
                sub_queries=prompt_reshape["subQueries"],
                hyde_document=prompt_reshape["hydeDocument"],
                config=merged_config,
                user_id=user_id,
            )

            yield _format_sse_event("stage", {
                "stage": 3,
                "label": "Stage 03 // Cross-Encoder Reranking & CRAG Relevance Gating...",
            })

            yield _format_sse_event("retrieval", {
                "chunkCount": len(retrieval["retrievedChunks"]),
                "prunedCount": len(retrieval["prunedNoiseChunks"]),
                "detectedIntent": prompt_reshape.get("detectedIntent"),
            })

            yield _format_sse_event("stage", {
                "stage": 4,
                "label": f"Stage 04 // Streaming Grounded Answer via {merged_config.get('generatorModel', 'LLM')}...",
            })

            synthesis: Optional[Dict[str, Any]] = None
            for ev_type, ev_val in stream_synthesize_answer_and_verify(
                prompt_reshape=prompt_reshape,
                retrieved_chunks=retrieval["retrievedChunks"],
                pruned_noise_chunks=retrieval["prunedNoiseChunks"],
                config=merged_config,
                timings=retrieval["timings"],
                user_documents=user_docs,
                recent_history=recent_history,
            ):
                if ev_type == "token":
                    yield _format_sse_event("token", {"delta": ev_val})
                elif ev_type == "result":
                    synthesis = ev_val

            if synthesis is None:
                raise RuntimeError("Synthesis stream completed without final payload.")

            resp_obj = {
                "queryId": f"qry_{int(time.time() * 1000)}_{secrets.token_hex(4)}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "promptReshape": prompt_reshape,
                "retrievedChunks": retrieval["retrievedChunks"],
                "prunedNoiseChunks": retrieval["prunedNoiseChunks"],
                "queryCoords2D": retrieval["queryCoords2D"],
                "hydeCoords2D": retrieval["hydeCoords2D"],
                "answer": synthesis["answer"],
                "citations": synthesis["citations"],
                "claimVerifications": synthesis["claimVerifications"],
                "tokenUsage": synthesis.get("tokenUsage"),
                "metrics": synthesis["metrics"],
                "activeConfig": mask_config_for_client(merged_config),
            }
            resolved_chat_id = sql_db.record_query_run(resp_obj, user_id=user_id, chat_id=chat_id)
            resp_obj["chatId"] = resolved_chat_id
            resp_obj["chatSessions"] = sql_db.list_chat_sessions(user_id)
            resp_obj["analytics"] = sql_db.get_user_analytics(user_id)

            yield _format_sse_event("done", resp_obj)
        except Exception as exc:
            security_logger.exception("SSE query stream error")
            yield _format_sse_event("error", {"error": str(exc) or "Streaming synthesis failed."})

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
    })


@app.route("/api/findings", methods=["POST"])
@require_auth
def create_finding():
    user_id = g.current_user["userId"]
    body = request.get_json(force=True, silent=True) or {}
    try:
        saved = sql_db.save_finding(body, user_id=user_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    return jsonify({
        "success": True,
        "finding": saved,
        "findings": sql_db.list_saved_findings(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
    })


@app.route("/api/findings/<finding_id>", methods=["DELETE"])
@require_auth
def remove_finding(finding_id: str):
    user_id = g.current_user["userId"]
    deleted = sql_db.delete_finding(finding_id, user_id=user_id)
    return jsonify({
        "success": deleted,
        "findings": sql_db.list_saved_findings(user_id),
        "databaseTelemetry": sql_db.get_database_telemetry(user_id, is_admin=_is_current_admin()),
    })


@app.route("/api/database/telemetry", methods=["GET"])
@require_auth
def get_db_telemetry():
    return jsonify(sql_db.get_database_telemetry(g.current_user["userId"], is_admin=_is_current_admin()))


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

    updated_eps = dict(cfg.get("localEndpoints", {}))
    if isinstance(incoming.get("localEndpoints"), dict):
        for ep_key, default_ep in (("ollamaUrl", "http://localhost:11434"), ("lmStudioUrl", "http://localhost:1234/v1")):
            raw_ep = incoming["localEndpoints"].get(ep_key)
            if isinstance(raw_ep, str) and raw_ep.strip():
                norm_ep = raw_ep.strip().rstrip("/")
                if norm_ep != default_ep and norm_ep != (updated_eps.get(ep_key) or "").rstrip("/"):
                    validated_ep = validate_local_endpoint_url(norm_ep)
                    if not validated_ep:
                        return jsonify({
                            "error": f"Disallowed endpoint URL for {ep_key}. Only loopback http(s)://localhost or 127.0.0.1 endpoints are permitted in local mode."
                        }), 400
                    updated_eps[ep_key] = validated_ep
                else:
                    updated_eps[ep_key] = norm_ep

    updated_cfg = {
        **cfg,
        **incoming,
        "apiKeys": updated_keys,
        "localEndpoints": updated_eps,
    }
    sql_db.save_pipeline_config(updated_cfg, user_id=user_id)

    return jsonify({
        "success": True,
        "config": mask_config_for_client(updated_cfg),
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
    ollama_url = validate_local_endpoint_url(eps.get("ollamaUrl") or "http://localhost:11434")
    lm_url = validate_local_endpoint_url(eps.get("lmStudioUrl") or "http://localhost:1234/v1")

    if ollama_url:
        try:
            with urllib.request.urlopen(f"{ollama_url}/api/tags", timeout=1.5) as r1:
                data = json.loads(r1.read().decode("utf-8"))
                status["ollamaOnline"] = True
                status["ollamaModels"] = [m.get("name") for m in data.get("models", []) if m.get("name")]
        except Exception:
            status["ollamaOnline"] = False

    if lm_url:
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
