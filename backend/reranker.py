import json
import math
import os
import threading
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

try:
    from flashrank import Ranker, RerankRequest  # type: ignore
except ImportError:
    Ranker = None  # type: ignore
    RerankRequest = None  # type: ignore

_FLASHRANK_LOCK = threading.Lock()
_FLASHRANK_INSTANCE: Any = None
_FLASHRANK_FAILED = False


def _http_post_json(
    url: str,
    payload: Dict[str, Any],
    headers: Dict[str, str],
    timeout: float = 12.0,
) -> Optional[Dict[str, Any]]:
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _get_provider_key(provider: str, config: Optional[Dict[str, Any]]) -> str:
    if isinstance(config, dict):
        api_keys = config.get("apiKeys") or {}
        if isinstance(api_keys, dict):
            key = str(api_keys.get(provider) or "").strip()
            if key and not key.startswith("••••"):
                return key
    env_map = {
        "cohere": "COHERE_API_KEY",
        "jina": "JINA_API_KEY",
        "gemini": "GEMINI_API_KEY",
    }
    env_name = env_map.get(provider)
    return (os.environ.get(env_name, "") if env_name else "").strip()


def _get_flashrank_ranker() -> Any:
    """
    Lazy-initializes the ~4 MB ONNX Cross-Encoder (ms-marco-TinyBERT-L-2-v2) once per process.
    Safe for Render 512 MB free-tier instances running --workers 1.
    """
    global _FLASHRANK_INSTANCE, _FLASHRANK_FAILED
    if Ranker is None or _FLASHRANK_FAILED:
        return None
    if _FLASHRANK_INSTANCE is not None:
        return _FLASHRANK_INSTANCE
    with _FLASHRANK_LOCK:
        if _FLASHRANK_INSTANCE is not None:
            return _FLASHRANK_INSTANCE
        if _FLASHRANK_FAILED:
            return None
        try:
            cache_dir = os.environ.get("FLASHRANK_CACHE_DIR") or "/tmp/flashrank_cache"
            _FLASHRANK_INSTANCE = Ranker(model_name="ms-marco-TinyBERT-L-2-v2", cache_dir=cache_dir)
            return _FLASHRANK_INSTANCE
        except Exception:
            _FLASHRANK_FAILED = True
            return None


def rerank_passages_neural(
    query: str,
    candidates: List[Dict[str, Any]],
    config: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[Dict[str, float]], str]:
    """
    3-tier neural Cross-Encoder reranker returning ({chunkId: calibrated_0_to_1_score}, engine_name):
      1. Cohere Rerank v3.5 API (when COHERE_API_KEY / apiKeys.cohere is set)
      2. Jina Reranker v2 API (when JINA_API_KEY / apiKeys.jina is set)
      3. Local FlashRank ONNX Cross-Encoder (ms-marco-TinyBERT-L-2-v2, ~4 MB, CPU, $0)
      4. Graceful fallback -> (None, "deterministic_lexical")
    """
    if not query.strip() or not candidates:
        return None, "deterministic_lexical"

    docs_texts = [str(c.get("content") or "")[:1800] for c in candidates]
    chunk_ids = [str(c.get("id") or "") for c in candidates]

    # Tier 1: Cohere Rerank v3.5 API
    cohere_key = _get_provider_key("cohere", config)
    if cohere_key:
        res = _http_post_json(
            "https://api.cohere.com/v2/rerank",
            {
                "model": "rerank-v3.5",
                "query": query[:1000],
                "documents": docs_texts,
                "top_n": len(docs_texts),
            },
            {"Authorization": f"Bearer {cohere_key}"},
            timeout=10.0,
        )
        results = (res or {}).get("results")
        if isinstance(results, list) and results:
            scores: Dict[str, float] = {}
            for item in results:
                idx = item.get("index")
                rel = item.get("relevance_score")
                if isinstance(idx, int) and 0 <= idx < len(chunk_ids) and isinstance(rel, (int, float)):
                    scores[chunk_ids[idx]] = round(max(0.0, min(1.0, float(rel))), 4)
            if scores:
                return scores, "Cohere Rerank v3.5 (Neural Cross-Encoder API)"

    # Tier 2: Jina Reranker v2 Multilingual API
    jina_key = _get_provider_key("jina", config)
    if jina_key:
        res = _http_post_json(
            "https://api.jina.ai/v1/rerank",
            {
                "model": "jina-reranker-v2-base-multilingual",
                "query": query[:1000],
                "documents": docs_texts,
                "top_n": len(docs_texts),
            },
            {"Authorization": f"Bearer {jina_key}"},
            timeout=10.0,
        )
        results = (res or {}).get("results")
        if isinstance(results, list) and results:
            scores = {}
            for item in results:
                idx = item.get("index")
                rel = item.get("relevance_score")
                if isinstance(idx, int) and 0 <= idx < len(chunk_ids) and isinstance(rel, (int, float)):
                    scores[chunk_ids[idx]] = round(max(0.0, min(1.0, float(rel))), 4)
            if scores:
                return scores, "Jina Reranker v2 (Neural Cross-Encoder API)"

    # Tier 3: Local FlashRank ONNX Cross-Encoder (~4 MB TinyBERT, CPU, 0 API cost)
    ranker = _get_flashrank_ranker()
    if ranker is not None and RerankRequest is not None:
        try:
            passages = [
                {"id": chunk_ids[i], "text": docs_texts[i]}
                for i in range(len(chunk_ids))
            ]
            req = RerankRequest(query=query[:1000], passages=passages)
            ranked = ranker.rank(req)
            if isinstance(ranked, list) and ranked:
                scores = {}
                for item in ranked:
                    cid = str(item.get("id") or "")
                    sc = item.get("score")
                    if cid and isinstance(sc, (int, float)):
                        scores[cid] = round(max(0.0, min(1.0, float(sc))), 4)
                if scores:
                    return scores, "FlashRank ONNX Cross-Encoder (ms-marco-TinyBERT-L-2-v2)"
        except Exception:
            pass

    return None, "deterministic_lexical"


def compute_gemini_embeddings_batch(
    texts: List[str],
    config: Optional[Dict[str, Any]] = None,
    output_dim: int = 128,
    task_type: str = "RETRIEVAL_DOCUMENT",
) -> Optional[List[List[float]]]:
    """
    Calls Google's gemini-embedding-001 REST API via batchEmbedContents with Matryoshka
    outputDimensionality=128 so vectors stay 100% compatible with VECTOR_DIM=128 and compact in Neon Postgres.
    Returns None cleanly if no Gemini API key is configured or on network/rate-limit failure.
    """
    gemini_key = _get_provider_key("gemini", config)
    if not gemini_key or not texts:
        return None

    all_vectors: List[List[float]] = []
    batch_size = 40
    model_slug = "gemini-embedding-001"
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(model_slug)}:batchEmbedContents?key={urllib.parse.quote(gemini_key)}"
    )

    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        requests_payload = [
            {
                "model": f"models/{model_slug}",
                "content": {"parts": [{"text": (t or " ")[:2000]}]},
                "taskType": task_type,
                "outputDimensionality": output_dim,
            }
            for t in batch
        ]
        res = _http_post_json(url, {"requests": requests_payload}, {}, timeout=14.0)
        embeddings = (res or {}).get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(batch):
            return None
        for emb in embeddings:
            vals = emb.get("values") if isinstance(emb, dict) else None
            if not isinstance(vals, list) or len(vals) < output_dim:
                return None
            sliced = [float(v) for v in vals[:output_dim]]
            norm = math.sqrt(sum(v * v for v in sliced)) or 1.0
            all_vectors.append([round(v / norm, 5) for v in sliced])

    return all_vectors
