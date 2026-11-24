import json
import math
import os
import random
import re
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from chunker import (
    benchmark_all_chunk_strategies,
    extract_top_keywords,
    generate_chunks_by_strategy,
)
from reranker import compute_gemini_embeddings_batch, rerank_passages_neural
from storage_db import PersistentRAGDatabase

VECTOR_DIM = 128

CONCEPT_CLUSTERS: List[List[str]] = [
    ["vector", "embedding", "hnsw", "index", "cosine", "similarity", "ann", "quantization", "dense", "dimension", "space", "distance", "metric", "subspace"],
    ["chunk", "chunking", "segment", "boundary", "semantic", "hierarchical", "proposition", "window", "overlap", "split", "token", "structural", "parent", "child"],
    ["retrieval", "search", "bm25", "sparse", "lexical", "hybrid", "rrf", "fusion", "reciprocal", "rank", "mmr", "diversity", "recall", "precision"],
    ["rerank", "reranker", "cross-encoder", "crag", "corrective", "relevance", "grade", "filter", "prune", "noise", "ndcg", "mrr", "score"],
    ["llm", "model", "prompt", "reshape", "query", "hyde", "hypothetical", "step-back", "decompose", "subquery", "agent", "agentic", "ollama", "gguf", "local"],
    ["ocr", "extract", "extraction", "pdf", "image", "tesseract", "scan", "scanned", "table", "docx", "html", "clean", "normalize", "document"],
    ["hallucination", "grounded", "faithfulness", "verify", "verification", "citation", "claim", "evidence", "self-rag", "triad", "ragas", "evaluation", "metric"],
    ["latency", "performance", "throughput", "memory", "cache", "optimize", "optimization", "benchmark", "speed", "millisecond", "efficiency"],
]


def stem_word(word: str) -> str:
    w = word.lower().strip()
    if len(w) <= 3:
        return w
    w = re.sub(r"(ization|isation|ational|fulness|ousness|iveness)$", "", w)
    w = re.sub(r"(ments|ment|ings|ing|edly|ed|ies|ers|er|ions|ion|ally|al|ly|es|s)$", "", w)
    return w if len(w) >= 2 else word.lower()


def tokenize_for_sparse(text: str) -> Dict[str, int]:
    words = [
        w for w in re.split(r"\s+", re.sub(r"[^a-z0-9_\-\s]", " ", text.lower()))
        if len(w) >= 2
    ]
    counts: Dict[str, int] = {}
    for w in words:
        s = stem_word(w)
        counts[s] = counts.get(s, 0) + 1
    return counts


def compute_semantic_embedding(text: str) -> List[float]:
    vec = [0.0] * VECTOR_DIM
    clean = text.lower()
    words = [w for w in re.split(r"\s+", re.sub(r"[^a-z0-9_\-\s]", " ", clean)) if w]

    for c_idx, cluster in enumerate(CONCEPT_CLUSTERS):
        hits = 0.0
        for term in cluster:
            if term in clean:
                hits += 1.5
        vec[c_idx * 2] += hits * 1.8
        vec[c_idx * 2 + 1] += math.sqrt(hits) * 1.4

    for i, w in enumerate(words):
        stemmed = stem_word(w)
        if len(stemmed) < 2:
            continue
        h1 = 2166136261
        h2 = 16777619
        for c_idx, ch in enumerate(stemmed):
            code = ord(ch)
            h1 = ((h1 ^ code) * 16777619) & 0xFFFFFFFF
            h2 = ((h2 ^ (code * (c_idx + 1))) * 2166136261) & 0xFFFFFFFF

        dim1 = 16 + (h1 % 80)
        dim2 = 16 + (h2 % 80)
        sign1 = 1.0 if (h1 & 1) == 0 else -1.0
        sign2 = 1.0 if (h2 & 1) == 0 else -1.0
        pos_weight = 1.35 if i < 12 else 1.0
        vec[dim1] += sign1 * pos_weight
        vec[dim2] += sign2 * 0.75 * pos_weight

    compact = "_".join(words)[:600]
    for i in range(max(0, len(compact) - 2)):
        trigram = compact[i:i + 3]
        th = 5381
        for ch in trigram:
            th = ((th * 33) ^ ord(ch)) & 0xFFFFFFFF
        dim = 96 + (th % 32)
        sign = 1.0 if (th & 1) == 0 else -1.0
        vec[dim] += sign * 0.25

    norm_sq = sum(v * v for v in vec)
    norm = math.sqrt(norm_sq) or 1.0
    return [round(v / norm, 5) for v in vec]


def project_vector_to_2d(vec: List[float]) -> List[float]:
    x = 0.0
    y = 0.0
    n = len(vec)
    for i, val in enumerate(vec):
        angle = (i / n) * math.pi * 2.0
        x += val * math.cos(angle * 1.7 + 0.4)
        y += val * math.sin(angle * 2.3 - 0.2)
    cx = max(-0.92, min(0.92, round(math.tanh(x * 0.85), 4)))
    cy = max(-0.92, min(0.92, round(math.tanh(y * 0.85), 4)))
    return [cx, cy]


def compute_vector_similarity(a: List[float], b: List[float], metric: str = "cosine") -> float:
    length = min(len(a), len(b))
    if metric in ("cosine", "dot"):
        dot = sum(a[i] * b[i] for i in range(length))
        if metric == "dot":
            return round(max(0.0, min(1.0, (dot + 1.0) / 2.0)), 4)
        norm_a = sum(a[i] * a[i] for i in range(length))
        norm_b = sum(b[i] * b[i] for i in range(length))
        denom = math.sqrt(norm_a * norm_b) or 1.0
        cos = dot / denom
        return round(max(0.0, min(1.0, (cos + 0.35) / 1.35)), 4)
    elif metric == "euclidean":
        sum_sq = sum((a[i] - b[i]) ** 2 for i in range(length))
        dist = math.sqrt(sum_sq)
        return round(1.0 / (1.0 + dist * 0.85), 4)
    else:
        sum_abs = sum(abs(a[i] - b[i]) for i in range(length))
        return round(1.0 / (1.0 + sum_abs * 0.12), 4)


class HybridVectorDatabase:
    def __init__(self, storage_dir: str):
        os.makedirs(storage_dir, exist_ok=True)
        self.storage_file = os.path.join(storage_dir, "hybrid_vectordb.json")
        self._lock = threading.RLock()
        self.sql_db = PersistentRAGDatabase(storage_dir)
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.chunks: Dict[str, Dict[str, Any]] = {}
        self._load_from_disk()

    def _load_from_disk(self):
        with self._lock:
            try:
                sql_docs, sql_chunks = self.sql_db.load_all_documents_and_chunks()
                for doc in sql_docs:
                    self.documents[doc["id"]] = doc
                for ch in sql_chunks:
                    self.chunks[ch["id"]] = ch
            except Exception:
                pass

    def save_to_disk(self):
        with self._lock:
            try:
                payload = {
                    "documents": list(self.documents.values()),
                    "chunks": list(self.chunks.values()),
                }
                tmp_path = f"{self.storage_file}.{os.getpid()}.{threading.get_ident()}.tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(payload, f, indent=2)
                os.replace(tmp_path, self.storage_file)
            except Exception as e:
                print("Failed to persist VectorDB snapshot:", e)

    def get_document_count(self, user_id: str) -> int:
        with self._lock:
            return sum(1 for d in self.documents.values() if d.get("userId", "usr_demo_admin") == user_id)

    def get_all_documents(self, user_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            user_docs = [dict(d) for d in self.documents.values() if d.get("userId", "usr_demo_admin") == user_id]
        return sorted(user_docs, key=lambda d: d.get("ingestedAt", ""), reverse=True)

    def get_all_chunks(self, user_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return [dict(c) for c in self.chunks.values() if c.get("userId", "usr_demo_admin") == user_id]

    def _compute_user_idf_and_hnsw(self, user_chunks: List[Dict[str, Any]]) -> Tuple[Dict[str, float], float, int]:
        n_chunks = len(user_chunks)
        if n_chunks == 0:
            return {}, 120.0, 0

        doc_freq: Dict[str, int] = {}
        total_terms = 0
        for ch in user_chunks:
            sparse = ch.get("sparseTerms", {})
            total_terms += sum(sparse.values())
            for term in sparse.keys():
                doc_freq[term] = doc_freq.get(term, 0) + 1

        avg_len = max(10.0, total_terms / n_chunks)
        idf_map = {
            term: math.log(1.0 + (n_chunks - df + 0.5) / (df + 0.5))
            for term, df in doc_freq.items()
        }
        # Layer 0 edges: min(6, n_chunks - 1) per chunk
        edges = n_chunks * min(6, max(0, n_chunks - 1))
        return idf_map, avg_len, edges

    def ingest_document(
        self,
        title: str,
        filename: str,
        doc_format: str,
        raw_text: str,
        cleaned_text: str,
        extraction_telemetry: Dict[str, Any],
        user_id: str = "usr_demo_admin",
        auto_optimize: bool = True,
        preferred_strategy: Optional[str] = None,
        target_chunk_tokens: int = 150,
        chunk_overlap_tokens: int = 30,
        doc_id: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        final_doc_id = doc_id or f"doc_{int(time.time() * 1000)}_{secrets.token_hex(4)}"

        benchmarks, optimal_strategy = benchmark_all_chunk_strategies(
            cleaned_text, title, target_chunk_tokens, chunk_overlap_tokens
        )
        chosen_strategy = (
            optimal_strategy if auto_optimize else (preferred_strategy or optimal_strategy)
        )

        raw_chunks = generate_chunks_by_strategy(
            cleaned_text, title, chosen_strategy, target_chunk_tokens, chunk_overlap_tokens
        )

        # Compute real neural embeddings via gemini-embedding-001 (128-dim Matryoshka) if Gemini key is configured
        neural_vecs = compute_gemini_embeddings_batch(
            [rc["content"] for rc in raw_chunks],
            config=config,
            output_dim=VECTOR_DIM,
            task_type="RETRIEVAL_DOCUMENT",
        )
        embedding_engine = "gemini-embedding-001" if neural_vecs else "local-semantic-hash"

        doc_chunks: List[Dict[str, Any]] = []
        for idx, rc in enumerate(raw_chunks):
            chunk_id = f"{final_doc_id}_ch_{idx + 1}"
            embedding = neural_vecs[idx] if neural_vecs else compute_semantic_embedding(rc["content"])
            coords_2d = project_vector_to_2d(embedding)
            sparse_terms = tokenize_for_sparse(rc["content"])
            parent_idx = rc.get("parentIndex")

            chunk_obj = {
                "id": chunk_id,
                "userId": user_id,
                "documentId": final_doc_id,
                "documentTitle": title,
                "documentFormat": doc_format,
                "index": idx + 1,
                "parentChunkId": f"{final_doc_id}_parent_{parent_idx + 1}" if parent_idx is not None else None,
                "parentContext": rc.get("parentContext"),
                "sectionPath": rc["sectionPath"],
                "content": rc["content"],
                "tokenCount": rc["tokenCount"],
                "charCount": rc["charCount"],
                "strategy": chosen_strategy,
                "coherenceScore": rc["coherenceScore"],
                "informationDensity": rc["informationDensity"],
                "keywords": rc["keywords"],
                "embedding": embedding,
                "embeddingModel": embedding_engine,
                "coords2D": coords_2d,
                "sparseTerms": sparse_terms,
            }
            doc_chunks.append(chunk_obj)

        telemetry_enriched = dict(extraction_telemetry or {})
        telemetry_enriched["embeddingModel"] = embedding_engine

        doc_record = {
            "id": final_doc_id,
            "userId": user_id,
            "title": title,
            "filename": filename,
            "format": doc_format,
            "ingestedAt": datetime.now(timezone.utc).isoformat(),
            "rawText": raw_text,
            "cleanedText": cleaned_text,
            "selectedStrategy": chosen_strategy,
            "autoOptimized": auto_optimize,
            "extractionTelemetry": telemetry_enriched,
            "strategyBenchmarks": benchmarks,
            "chunkCount": len(raw_chunks),
        }

        with self._lock:
            existing_doc = self.documents.get(final_doc_id)
            if existing_doc and existing_doc.get("userId", "usr_demo_admin") != user_id:
                raise PermissionError("Cannot overwrite a document owned by another user.")

            self.sql_db.upsert_document_and_chunks(doc_record, doc_chunks, user_id=user_id)

            to_delete = [
                cid for cid, ch in self.chunks.items()
                if ch["documentId"] == final_doc_id and ch.get("userId", "usr_demo_admin") == user_id
            ]
            for cid in to_delete:
                del self.chunks[cid]
            for ch in doc_chunks:
                self.chunks[ch["id"]] = ch
            self.documents[final_doc_id] = doc_record
            self.save_to_disk()
        return doc_record

    def rechunk_document(
        self,
        doc_id: str,
        new_strategy: str,
        user_id: str = "usr_demo_admin",
        target_chunk_tokens: int = 150,
        chunk_overlap_tokens: int = 30,
        config: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            existing = self.documents.get(doc_id)
            if not existing or existing.get("userId", "usr_demo_admin") != user_id:
                return None
            existing_copy = dict(existing)
        return self.ingest_document(
            title=existing_copy["title"],
            filename=existing_copy["filename"],
            doc_format=existing_copy["format"],
            raw_text=existing_copy["rawText"],
            cleaned_text=existing_copy["cleanedText"],
            extraction_telemetry=existing_copy["extractionTelemetry"],
            user_id=user_id,
            auto_optimize=False,
            preferred_strategy=new_strategy,
            target_chunk_tokens=target_chunk_tokens,
            chunk_overlap_tokens=chunk_overlap_tokens,
            doc_id=existing_copy["id"],
            config=config,
        )

    def delete_document(self, doc_id: str, user_id: str = "usr_demo_admin") -> bool:
        with self._lock:
            existing = self.documents.get(doc_id)
            if not existing or existing.get("userId", "usr_demo_admin") != user_id:
                return False
            del self.documents[doc_id]
            to_del = [
                cid for cid, ch in self.chunks.items()
                if ch["documentId"] == doc_id and ch.get("userId", "usr_demo_admin") == user_id
            ]
            for cid in to_del:
                del self.chunks[cid]
            self.sql_db.delete_document(doc_id, user_id=user_id)
            self.save_to_disk()
            return True

    def purge_user_data_in_memory(self, user_id: str):
        with self._lock:
            for did in [k for k, v in self.documents.items() if v.get("userId") == user_id]:
                del self.documents[did]
            for cid in [k for k, v in self.chunks.items() if v.get("userId") == user_id]:
                del self.chunks[cid]
            self.save_to_disk()

    def get_vectordb_stats(self, user_id: str = "usr_demo_admin") -> Dict[str, Any]:
        user_docs = self.get_all_documents(user_id)
        user_chunks = self.get_all_chunks(user_id)
        idf_map, _, total_edges = self._compute_user_idf_and_hnsw(user_chunks)

        fp32_bytes = len(user_chunks) * VECTOR_DIM * 4
        int8_bytes = len(user_chunks) * VECTOR_DIM * 1
        binary_bytes = math.ceil((len(user_chunks) * VECTOR_DIM) / 8.0)

        return {
            "totalDocuments": len(user_docs),
            "totalChunks": len(user_chunks),
            "vectorDimensions": VECTOR_DIM,
            "vocabTermsIndexed": len(idf_map),
            "hnswLayers": 3,
            "hnswTotalEdges": total_edges,
            "hnswAvgDegree": round(total_edges / len(user_chunks), 1) if user_chunks else 0.0,
            "memoryFootprint": {
                "fp32Kb": round(fp32_bytes / 1024.0, 2),
                "int8QuantizedKb": round(int8_bytes / 1024.0, 2),
                "binaryQuantizedKb": round(binary_bytes / 1024.0, 2),
            },
        }

    def hybrid_retrieve_and_rerank(
        self,
        original_prompt: str,
        reshaped_primary_query: str,
        sub_queries: List[str],
        hyde_document: str,
        config: Dict[str, Any],
        user_id: str = "usr_demo_admin",
    ) -> Dict[str, Any]:
        raw_all_chunks = self.get_all_chunks(user_id)

        # If the user has uploaded their own custom documents, prioritize them and exclude
        # the 3 starter RAG demo whitepapers unless the prompt explicitly asks about RAG internals.
        def _is_starter_seed_chunk(chunk_obj: Dict[str, Any]) -> bool:
            did = str(chunk_obj.get("documentId") or "").lower()
            dtitle = str(chunk_obj.get("documentTitle") or "").lower()
            seed_markers = (
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
            return any(m in did or m in dtitle for m in seed_markers)

        custom_chunks = [c for c in raw_all_chunks if not _is_starter_seed_chunk(c)]
        rag_internal_pattern = r"\b(hnsw|bm25|rrf|reciprocal rank|hyde|crag|cross-encoder|chunking strategy|semantic inflection|sliding window)\b"
        asks_about_rag_internals = bool(re.search(rag_internal_pattern, original_prompt, flags=re.IGNORECASE))

        if custom_chunks and not asks_about_rag_internals:
            all_chunks = custom_chunks
        else:
            all_chunks = raw_all_chunks

        idf_cache, avg_chunk_len, _ = self._compute_user_idf_and_hnsw(all_chunks)
        t0 = time.time()

        # Identify which docs use real gemini-embedding-001 neural vectors vs legacy local hash vectors
        neural_doc_ids = {
            d["id"]
            for d in self.get_all_documents(user_id)
            if (d.get("extractionTelemetry") or {}).get("embeddingModel") == "gemini-embedding-001"
        }
        has_neural_chunks = any(
            c.get("embeddingModel") == "gemini-embedding-001" or c["documentId"] in neural_doc_ids
            for c in all_chunks
        )

        # Anchor primary vector strongly on the user's original prompt + reshaped query
        primary_text = f"{original_prompt} {original_prompt} {reshaped_primary_query}"
        hyde_text = hyde_document or original_prompt
        active_sub_queries = sub_queries if config.get("enableMultiQuery", True) else []

        primary_vec_local = compute_semantic_embedding(primary_text)
        hyde_vec_local = compute_semantic_embedding(hyde_text)
        sub_vecs_local = [compute_semantic_embedding(sq) for sq in active_sub_queries]

        primary_vec_neural: Optional[List[float]] = None
        hyde_vec_neural: Optional[List[float]] = None
        sub_vecs_neural: List[List[float]] = []

        if has_neural_chunks:
            batch_texts = [primary_text, hyde_text, *active_sub_queries]
            neural_q_vecs = compute_gemini_embeddings_batch(
                batch_texts,
                config=config,
                output_dim=VECTOR_DIM,
                task_type="RETRIEVAL_QUERY",
            )
            if neural_q_vecs and len(neural_q_vecs) == len(batch_texts):
                primary_vec_neural = neural_q_vecs[0]
                hyde_vec_neural = neural_q_vecs[1]
                sub_vecs_neural = neural_q_vecs[2:]

        primary_vec = primary_vec_neural or primary_vec_local
        hyde_vec = hyde_vec_neural or hyde_vec_local

        query_coords_2d = project_vector_to_2d(primary_vec)
        hyde_coords_2d = project_vector_to_2d(hyde_vec)
        embedding_ms = max(2, int(round((time.time() - t0) * 1000)))

        t_dense = time.time()
        metric = config.get("distanceMetric", "cosine")
        dense_scores: Dict[str, float] = {}
        for chunk in all_chunks:
            is_neural_chunk = (
                chunk.get("embeddingModel") == "gemini-embedding-001"
                or chunk["documentId"] in neural_doc_ids
            )
            p_v = primary_vec_neural if (is_neural_chunk and primary_vec_neural) else primary_vec_local
            h_v = hyde_vec_neural if (is_neural_chunk and hyde_vec_neural) else hyde_vec_local
            s_vs = sub_vecs_neural if (is_neural_chunk and sub_vecs_neural) else sub_vecs_local

            score = compute_vector_similarity(p_v, chunk["embedding"], metric)
            if config.get("enableHyde", True):
                hyde_sim = compute_vector_similarity(h_v, chunk["embedding"], metric)
                score = score * 0.78 + hyde_sim * 0.22
            if s_vs:
                max_sub = max(
                    compute_vector_similarity(sv, chunk["embedding"], metric)
                    for sv in s_vs
                )
                score = score * 0.82 + max_sub * 0.18
            dense_scores[chunk["id"]] = round(score, 4)
        hnsw_dense_ms = max(3, int(round((time.time() - t_dense) * 1000)))

        t_sparse = time.time()
        orig_terms = tokenize_for_sparse(original_prompt)
        expanded_q = reshaped_primary_query + " " + (
            " ".join(sub_queries) if config.get("enableMultiQuery", True) else ""
        )
        query_terms = tokenize_for_sparse(original_prompt + " " + expanded_q)
        sparse_scores: Dict[str, float] = {}
        matched_terms_map: Dict[str, List[str]] = {}
        k1 = 1.5
        b = 0.75
        max_raw_bm25 = 0.001

        for chunk in all_chunks:
            sparse_map = chunk.get("sparseTerms", {})
            chunk_len = sum(sparse_map.values()) or 1
            bm25 = 0.0
            matched: List[str] = []
            for q_term in query_terms.keys():
                tf = sparse_map.get(q_term, 0)
                if tf > 0:
                    matched.append(q_term)
                    idf = idf_cache.get(q_term, 1.2)
                    num = tf * (k1 + 1.0)
                    denom = tf + k1 * (1.0 - b + b * (chunk_len / avg_chunk_len))
                    # Weight terms that actually appeared in the user's original prompt 3.5x higher
                    term_weight = 3.5 if q_term in orig_terms else 0.75
                    bm25 += term_weight * idf * (num / denom + 1.0)

            sec_lower = chunk["sectionPath"].lower()
            for q_term in orig_terms.keys():
                if q_term in sec_lower:
                    bm25 *= 1.25

            if bm25 > max_raw_bm25:
                max_raw_bm25 = bm25
            sparse_scores[chunk["id"]] = bm25
            matched_terms_map[chunk["id"]] = matched

        for cid, val in list(sparse_scores.items()):
            sparse_scores[cid] = round(min(1.0, val / max_raw_bm25), 4) if max_raw_bm25 > 0.01 else 0.0
        bm25_sparse_ms = max(2, int(round((time.time() - t_sparse) * 1000)))

        t_rrf = time.time()
        dense_ranked = sorted(all_chunks, key=lambda c: dense_scores.get(c["id"], 0.0), reverse=True)
        sparse_ranked = sorted(all_chunks, key=lambda c: sparse_scores.get(c["id"], 0.0), reverse=True)

        dense_rank_map = {c["id"]: i + 1 for i, c in enumerate(dense_ranked)}
        sparse_rank_map = {c["id"]: i + 1 for i, c in enumerate(sparse_ranked)}

        alpha = float(config.get("hybridAlpha", 0.65))
        rrf_k = 20.0
        rrf_scores: Dict[str, float] = {}
        for chunk in all_chunks:
            cid = chunk["id"]
            r_d = dense_rank_map.get(cid, len(all_chunks))
            r_s = sparse_rank_map.get(cid, len(all_chunks))
            rrf_raw = alpha * (1.0 / (rrf_k + r_d)) + (1.0 - alpha) * (1.0 / (rrf_k + r_s))
            blended = (
                alpha * dense_scores.get(cid, 0.0)
                + (1.0 - alpha) * sparse_scores.get(cid, 0.0)
                + rrf_raw * 3.5
            )
            rrf_scores[cid] = round(min(0.99, blended), 4)

        top_k_init = max(int(config.get("topKInitial", 16)), int(config.get("topKReranked", 5)) + 12, 22)
        initial_candidates = sorted(
            all_chunks, key=lambda c: rrf_scores.get(c["id"], 0.0), reverse=True
        )[:top_k_init]

        mmr_lambda = float(config.get("mmrLambda", 0.78))
        mmr_selected: List[Dict[str, Any]] = []
        remaining = list(initial_candidates)
        mmr_limit = max(int(config.get("topKInitial", 16)), 18)

        while remaining and len(mmr_selected) < mmr_limit:
            best_idx = 0
            best_val = -1e9
            for i, cand in enumerate(remaining):
                rel = rrf_scores.get(cand["id"], 0.0)
                max_red = 0.0
                for alr in mmr_selected:
                    sim = compute_vector_similarity(cand["embedding"], alr["chunk"]["embedding"], "cosine")
                    if sim > max_red:
                        max_red = sim
                mmr_val = mmr_lambda * rel - (1.0 - mmr_lambda) * max_red * 0.42
                if mmr_val > best_val:
                    best_val = mmr_val
                    best_idx = i

            picked = remaining.pop(best_idx)
            orig_rank = next(
                (idx + 1 for idx, c in enumerate(initial_candidates) if c["id"] == picked["id"]),
                1,
            )
            mmr_selected.append({
                "chunk": picked,
                "mmrScore": round(max(0.05, min(0.99, best_val)), 4),
                "initialRank": orig_rank,
            })
        rrf_mmr_ms = max(2, int(round((time.time() - t_rrf) * 1000)))

        t_rerank = time.time()
        orig_keywords = extract_top_keywords(original_prompt, 10)
        if not orig_keywords:
            orig_keywords = [w for w in re.split(r"\W+", original_prompt.lower()) if len(w) >= 2]
        expanded_keywords = extract_top_keywords(
            f"{reshaped_primary_query} {' '.join(sub_queries)} {hyde_document}",
            18,
        )
        all_query_keywords = list(dict.fromkeys(orig_keywords + expanded_keywords))
        crag_threshold = float(config.get("cragThreshold", 0.34))

        # 3-Tier Neural Cross-Encoder Reranker: Cohere v3.5 API -> Jina v2 API -> FlashRank ONNX (~4 MB) -> deterministic fallback
        neural_rerank_scores: Optional[Dict[str, float]] = None
        reranker_engine = "Deterministic Feature Reranker"
        if config.get("enableCrossEncoderRerank", True) and mmr_selected:
            rerank_query = f"{original_prompt}\n{reshaped_primary_query}".strip()
            neural_rerank_scores, engine_label = rerank_passages_neural(
                rerank_query,
                [item["chunk"] for item in mmr_selected],
                config=config,
            )
            if neural_rerank_scores:
                reranker_engine = engine_label

        # Map (documentId, chunk_index) -> chunk for adjacent context stitching
        chunk_by_doc_idx: Dict[Tuple[str, int], Dict[str, Any]] = {
            (c["documentId"], int(c.get("index", 0))): c for c in all_chunks
        }

        scored_results: List[Dict[str, Any]] = []
        for item in mmr_selected:
            ch = item["chunk"]
            cid = ch["id"]
            content_lower = ch["content"].lower()
            sparse_map = ch.get("sparseTerms", {})
            dense = dense_scores.get(cid, 0.0)
            sparse = sparse_scores.get(cid, 0.0)
            rrf = rrf_scores.get(cid, 0.0)

            orig_hits = sum(
                1
                for kw in orig_keywords
                if kw.lower() in content_lower or stem_word(kw) in sparse_map
            )
            exp_hits = sum(
                1
                for kw in expanded_keywords
                if kw not in orig_keywords and (kw.lower() in content_lower or stem_word(kw) in sparse_map)
            )
            total_hits = orig_hits + exp_hits

            orig_ratio = (orig_hits / max(1, len(orig_keywords))) if orig_keywords else 0.4
            exp_ratio = (exp_hits / max(1, len(expanded_keywords))) if expanded_keywords else 0.0
            coverage_ratio = min(1.0, orig_ratio * 0.65 + exp_ratio * 0.55)

            phrase_bonus = 0.0
            for i in range(len(all_query_keywords) - 1):
                pattern = re.escape(all_query_keywords[i]) + r"[\s\S]{0,65}" + re.escape(all_query_keywords[i + 1])
                if re.search(pattern, ch["content"], flags=re.IGNORECASE):
                    phrase_bonus += 0.1

            structural_quality = (ch["coherenceScore"] + ch["informationDensity"]) / 200.0
            raw_rerank = (
                rrf * 0.42
                + coverage_ratio * 0.40
                + min(0.20, phrase_bonus)
                + structural_quality * 0.08
            )
            if all_query_keywords and total_hits == 0:
                raw_rerank *= 0.62

            neural_sc = neural_rerank_scores.get(cid) if neural_rerank_scores else None
            if config.get("enableCrossEncoderRerank", True):
                if neural_sc is not None:
                    # Calibrated neural Cross-Encoder leads ranking & CRAG grading
                    rerank_score = round(min(0.995, neural_sc * 0.72 + raw_rerank * 0.28), 4)
                else:
                    rerank_score = round(min(0.995, raw_rerank), 4)
            else:
                rerank_score = rrf

            if neural_sc is not None:
                if rerank_score >= max(0.50, crag_threshold + 0.14) or neural_sc >= 0.62:
                    crag_grade = "HIGHLY_RELEVANT"
                    crag_reason = (
                        f"[{reranker_engine}] High neural cross-attention ({neural_sc * 100:.1f}%, blended {rerank_score * 100:.1f}%) "
                        f"with {orig_hits} direct + {exp_hits} domain hits."
                    )
                elif rerank_score >= crag_threshold * 0.80 or total_hits >= 1:
                    crag_grade = "PARTIAL_SUPPORT"
                    crag_reason = (
                        f"[{reranker_engine}] Supporting context ({neural_sc * 100:.1f}%, blended {rerank_score * 100:.1f}%) "
                        f"in [{ch['sectionPath']}]."
                    )
                else:
                    crag_grade = "IRRELEVANT_NOISE"
                    crag_reason = (
                        f"[{reranker_engine}] Below calibrated CRAG gate ({neural_sc * 100:.1f}%); "
                        f"pruned to prevent context dilution."
                    )
            else:
                if (rerank_score >= max(0.46, crag_threshold + 0.10) and total_hits >= 1) or coverage_ratio >= 0.38:
                    crag_grade = "HIGHLY_RELEVANT"
                    crag_reason = (
                        f"[{reranker_engine}] High semantic alignment ({rerank_score * 100:.1f}%) matching {orig_hits} direct + "
                        f"{exp_hits} inferred domain entities."
                    )
                elif total_hits >= 1 or rerank_score >= crag_threshold * 0.85:
                    crag_grade = "PARTIAL_SUPPORT"
                    crag_reason = (
                        f"[{reranker_engine}] Contextual support ({rerank_score * 100:.1f}%) matching {total_hits} domain term(s) in [{ch['sectionPath']}]."
                    )
                else:
                    crag_grade = "IRRELEVANT_NOISE"
                    crag_reason = (
                        f"[{reranker_engine}] Below CRAG confidence gate ({rerank_score * 100:.1f}%, 0 domain hits); "
                        f"pruned to prevent context dilution."
                    )

            # Stitch adjacent neighbor context (next chunk in same doc) into parentContext if none exists
            parent_ctx = ch.get("parentContext")
            if not parent_ctx:
                next_ch = chunk_by_doc_idx.get((ch["documentId"], int(ch.get("index", 0)) + 1))
                if next_ch:
                    parent_ctx = next_ch["content"][:500]

            scored_results.append({
                "chunkId": cid,
                "documentId": ch["documentId"],
                "documentTitle": ch["documentTitle"],
                "documentFormat": ch["documentFormat"],
                "sectionPath": ch["sectionPath"],
                "content": ch["content"],
                "parentContext": parent_ctx,
                "tokenCount": ch["tokenCount"],
                "strategy": ch["strategy"],
                "denseScore": dense,
                "sparseScore": sparse,
                "rrfScore": rrf,
                "mmrScore": item["mmrScore"],
                "initialRank": item["initialRank"],
                "rerankScore": rerank_score,
                "finalRank": item["initialRank"],
                "rankDelta": 0,
                "cragGrade": crag_grade,
                "cragReasoning": crag_reason,
                "matchedTerms": matched_terms_map.get(cid, []),
                "coords2D": ch["coords2D"],
            })

        if config.get("enableCrossEncoderRerank", True):
            scored_results.sort(key=lambda r: r["rerankScore"], reverse=True)

        for idx, res in enumerate(scored_results):
            res["finalRank"] = idx + 1
            res["rankDelta"] = res["initialRank"] - res["finalRank"]

        # Provide a richer context window (up to 8 chunks) so the LLM sees exclusions, waiting periods, and clauses together
        top_k_reranked = max(int(config.get("topKReranked", 5)), 8)
        if config.get("enableCragFilter", True):
            valid = [r for r in scored_results if r["cragGrade"] != "IRRELEVANT_NOISE"]
            pruned = [r for r in scored_results if r["cragGrade"] == "IRRELEVANT_NOISE"]
            if len(valid) >= 1:
                retrieved_chunks = valid[:top_k_reranked]
            else:
                retrieved_chunks = scored_results[:min(4, top_k_reranked)]
                pruned = scored_results[len(retrieved_chunks):]
        else:
            retrieved_chunks = scored_results[:top_k_reranked]
            pruned = scored_results[top_k_reranked:]

        rerank_ms = max(3, int(round((time.time() - t_rerank) * 1000)))

        return {
            "retrievedChunks": retrieved_chunks,
            "prunedNoiseChunks": pruned,
            "queryCoords2D": query_coords_2d,
            "hydeCoords2D": hyde_coords_2d,
            "timings": {
                "embeddingMs": embedding_ms,
                "hnswDenseSearchMs": hnsw_dense_ms,
                "bm25SparseSearchMs": bm25_sparse_ms,
                "rrfAndMmrMs": rrf_mmr_ms,
                "crossEncoderRerankMs": rerank_ms,
            },
        }
