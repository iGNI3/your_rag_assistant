import json
import math
import os
import random
import re
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple, Optional

from chunker import (
    benchmark_all_chunk_strategies,
    extract_top_keywords,
    generate_chunks_by_strategy,
)
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

    # 1. Concept cluster activations (dims 0..15)
    for c_idx, cluster in enumerate(CONCEPT_CLUSTERS):
        hits = 0.0
        for term in cluster:
            if term in clean:
                hits += 1.5
        vec[c_idx * 2] += hits * 1.8
        vec[c_idx * 2 + 1] += math.sqrt(hits) * 1.4

    # 2. Stemmed word feature hashing across dims 16..95
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

    # 3. Character 3-gram subword hashes (dims 96..127)
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
        self.sql_db = PersistentRAGDatabase(storage_dir)
        self.documents: Dict[str, Dict[str, Any]] = {}
        self.chunks: Dict[str, Dict[str, Any]] = {}
        self.hnsw_layers: Dict[int, Dict[str, List[str]]] = {0: {}, 1: {}, 2: {}}
        self.idf_cache: Dict[str, float] = {}
        self.avg_chunk_len: float = 120.0
        self._load_from_disk()

    def _load_from_disk(self):
        # 1. Load from SQLite3 vault first
        try:
            sql_docs, sql_chunks = self.sql_db.load_all_documents_and_chunks()
            if sql_docs:
                for doc in sql_docs:
                    self.documents[doc["id"]] = doc
                for ch in sql_chunks:
                    self.chunks[ch["id"]] = ch
                self.rebuild_indexes()
                return
        except Exception:
            pass

        # 2. Fallback migration from hybrid_vectordb.json into SQLite3 vault
        if not os.path.exists(self.storage_file):
            return
        try:
            with open(self.storage_file, "r", encoding="utf-8") as f:
                raw = json.load(f)
            for doc in raw.get("documents", []):
                self.documents[doc["id"]] = doc
            for ch in raw.get("chunks", []):
                self.chunks[ch["id"]] = ch
            for doc in self.documents.values():
                doc_chunks = [c for c in self.chunks.values() if c["documentId"] == doc["id"]]
                self.sql_db.upsert_document_and_chunks(doc, doc_chunks)
            self.rebuild_indexes()
        except Exception:
            pass

    def save_to_disk(self):
        try:
            payload = {
                "documents": list(self.documents.values()),
                "chunks": list(self.chunks.values()),
            }
            with open(self.storage_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
        except Exception as e:
            print("Failed to persist VectorDB:", e)

    def get_document_count(self) -> int:
        return len(self.documents)

    def get_all_documents(self) -> List[Dict[str, Any]]:
        return sorted(
            self.documents.values(),
            key=lambda d: d.get("ingestedAt", ""),
            reverse=True,
        )

    def get_all_chunks(self) -> List[Dict[str, Any]]:
        return list(self.chunks.values())

    def rebuild_indexes(self):
        all_chunks = list(self.chunks.values())
        n_chunks = len(all_chunks)
        self.idf_cache.clear()
        self.hnsw_layers = {0: {}, 1: {}, 2: {}}

        if n_chunks == 0:
            return

        doc_freq: Dict[str, int] = {}
        total_terms = 0
        for ch in all_chunks:
            sparse = ch.get("sparseTerms", {})
            total_terms += sum(sparse.values())
            for term in sparse.keys():
                doc_freq[term] = doc_freq.get(term, 0) + 1

        self.avg_chunk_len = max(10.0, total_terms / n_chunks)
        for term, df in doc_freq.items():
            self.idf_cache[term] = math.log(1.0 + (n_chunks - df + 0.5) / (df + 0.5))

        for i, node in enumerate(all_chunks):
            neighbors = sorted(
                (
                    (
                        other["id"],
                        compute_vector_similarity(node["embedding"], other["embedding"], "cosine"),
                    )
                    for other in all_chunks
                    if other["id"] != node["id"]
                ),
                key=lambda x: x[1],
                reverse=True,
            )
            self.hnsw_layers[0][node["id"]] = [nid for nid, _ in neighbors[:6]]
            if i % 2 == 0:
                self.hnsw_layers[1][node["id"]] = [nid for nid, _ in neighbors[:3]]
            if i % 4 == 0:
                self.hnsw_layers[2][node["id"]] = [nid for nid, _ in neighbors[:2]]

    def ingest_document(
        self,
        title: str,
        filename: str,
        doc_format: str,
        raw_text: str,
        cleaned_text: str,
        extraction_telemetry: Dict[str, Any],
        auto_optimize: bool = True,
        preferred_strategy: Optional[str] = None,
        target_chunk_tokens: int = 150,
        chunk_overlap_tokens: int = 30,
        doc_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        final_doc_id = doc_id or f"doc_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"

        # Remove old chunks if re-chunking existing document
        to_delete = [cid for cid, ch in self.chunks.items() if ch["documentId"] == final_doc_id]
        for cid in to_delete:
            del self.chunks[cid]

        benchmarks, optimal_strategy = benchmark_all_chunk_strategies(
            cleaned_text, title, target_chunk_tokens, chunk_overlap_tokens
        )
        chosen_strategy = (
            optimal_strategy
            if auto_optimize
            else (preferred_strategy or optimal_strategy)
        )

        raw_chunks = generate_chunks_by_strategy(
            cleaned_text, title, chosen_strategy, target_chunk_tokens, chunk_overlap_tokens
        )

        for idx, rc in enumerate(raw_chunks):
            chunk_id = f"{final_doc_id}_ch_{idx + 1}"
            embedding = compute_semantic_embedding(rc["content"])
            coords_2d = project_vector_to_2d(embedding)
            sparse_terms = tokenize_for_sparse(rc["content"])

            parent_idx = rc.get("parentIndex")
            chunk_obj = {
                "id": chunk_id,
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
                "coords2D": coords_2d,
                "sparseTerms": sparse_terms,
            }
            self.chunks[chunk_id] = chunk_obj

        doc_record = {
            "id": final_doc_id,
            "title": title,
            "filename": filename,
            "format": doc_format,
            "ingestedAt": datetime.now(timezone.utc).isoformat(),
            "rawText": raw_text,
            "cleanedText": cleaned_text,
            "selectedStrategy": chosen_strategy,
            "autoOptimized": auto_optimize,
            "extractionTelemetry": extraction_telemetry,
            "strategyBenchmarks": benchmarks,
            "chunkCount": len(raw_chunks),
        }

        self.documents[final_doc_id] = doc_record
        doc_chunks = [c for c in self.chunks.values() if c["documentId"] == final_doc_id]
        self.sql_db.upsert_document_and_chunks(doc_record, doc_chunks)
        self.rebuild_indexes()
        self.save_to_disk()
        return doc_record

    def rechunk_document(
        self,
        doc_id: str,
        new_strategy: str,
        target_chunk_tokens: int = 150,
        chunk_overlap_tokens: int = 30,
    ) -> Optional[Dict[str, Any]]:
        existing = self.documents.get(doc_id)
        if not existing:
            return None
        return self.ingest_document(
            title=existing["title"],
            filename=existing["filename"],
            doc_format=existing["format"],
            raw_text=existing["rawText"],
            cleaned_text=existing["cleanedText"],
            extraction_telemetry=existing["extractionTelemetry"],
            auto_optimize=False,
            preferred_strategy=new_strategy,
            target_chunk_tokens=target_chunk_tokens,
            chunk_overlap_tokens=chunk_overlap_tokens,
            doc_id=existing["id"],
        )

    def delete_document(self, doc_id: str) -> bool:
        if doc_id not in self.documents:
            return False
        del self.documents[doc_id]
        to_del = [cid for cid, ch in self.chunks.items() if ch["documentId"] == doc_id]
        for cid in to_del:
            del self.chunks[cid]
        self.sql_db.delete_document(doc_id)
        self.rebuild_indexes()
        self.save_to_disk()
        return True

    def get_vectordb_stats(self) -> Dict[str, Any]:
        all_chunks = list(self.chunks.values())
        layer0 = self.hnsw_layers.get(0, {})
        total_edges = sum(len(edges) for edges in layer0.values())
        fp32_bytes = len(all_chunks) * VECTOR_DIM * 4
        int8_bytes = len(all_chunks) * VECTOR_DIM * 1
        binary_bytes = math.ceil((len(all_chunks) * VECTOR_DIM) / 8.0)

        return {
            "totalDocuments": len(self.documents),
            "totalChunks": len(all_chunks),
            "vectorDimensions": VECTOR_DIM,
            "vocabTermsIndexed": len(self.idf_cache),
            "hnswLayers": 3,
            "hnswTotalEdges": total_edges,
            "hnswAvgDegree": round(total_edges / len(all_chunks), 1) if all_chunks else 0.0,
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
    ) -> Dict[str, Any]:
        all_chunks = list(self.chunks.values())
        t0 = time.time()

        primary_vec = compute_semantic_embedding(reshaped_primary_query)
        hyde_vec = compute_semantic_embedding(hyde_document or reshaped_primary_query)
        sub_vecs = (
            [compute_semantic_embedding(sq) for sq in sub_queries]
            if config.get("enableMultiQuery", True)
            else []
        )

        query_coords_2d = project_vector_to_2d(primary_vec)
        hyde_coords_2d = project_vector_to_2d(hyde_vec)
        embedding_ms = max(2, int(round((time.time() - t0) * 1000)))

        # 2. Dense HNSW Search
        t_dense = time.time()
        metric = config.get("distanceMetric", "cosine")
        dense_scores: Dict[str, float] = {}
        for chunk in all_chunks:
            score = compute_vector_similarity(primary_vec, chunk["embedding"], metric)
            if config.get("enableHyde", True):
                hyde_sim = compute_vector_similarity(hyde_vec, chunk["embedding"], metric)
                score = score * 0.68 + hyde_sim * 0.32
            if sub_vecs:
                max_sub = max(
                    compute_vector_similarity(sv, chunk["embedding"], metric)
                    for sv in sub_vecs
                )
                score = score * 0.75 + max_sub * 0.25
            dense_scores[chunk["id"]] = round(score, 4)
        hnsw_dense_ms = max(3, int(round((time.time() - t_dense) * 1000)))

        # 3. Sparse BM25+ Search
        t_sparse = time.time()
        combined_q = reshaped_primary_query + " " + (
            " ".join(sub_queries) if config.get("enableMultiQuery", True) else ""
        )
        query_terms = tokenize_for_sparse(combined_q)
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
                    idf = self.idf_cache.get(q_term, 1.2)
                    num = tf * (k1 + 1.0)
                    denom = tf + k1 * (1.0 - b + b * (chunk_len / self.avg_chunk_len))
                    bm25 += idf * (num / denom + 1.0)

            sec_lower = chunk["sectionPath"].lower()
            for q_term in query_terms.keys():
                if q_term in sec_lower:
                    bm25 *= 1.22

            if bm25 > max_raw_bm25:
                max_raw_bm25 = bm25
            sparse_scores[chunk["id"]] = bm25
            matched_terms_map[chunk["id"]] = matched

        for cid, val in list(sparse_scores.items()):
            sparse_scores[cid] = round(min(1.0, val / max_raw_bm25), 4)
        bm25_sparse_ms = max(2, int(round((time.time() - t_sparse) * 1000)))

        # 4. Reciprocal Rank Fusion (RRF) + MMR Diversity
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

        top_k_init = max(int(config.get("topKInitial", 10)), int(config.get("topKReranked", 5)) + 3)
        initial_candidates = sorted(
            all_chunks, key=lambda c: rrf_scores.get(c["id"], 0.0), reverse=True
        )[:top_k_init]

        mmr_lambda = float(config.get("mmrLambda", 0.78))
        mmr_selected: List[Dict[str, Any]] = []
        remaining = list(initial_candidates)

        while remaining and len(mmr_selected) < int(config.get("topKInitial", 10)):
            best_idx = 0
            best_val = -1e9
            for i, cand in enumerate(remaining):
                rel = rrf_scores.get(cand["id"], 0.0)
                max_red = 0.0
                for alr in mmr_selected:
                    sim = compute_vector_similarity(cand["embedding"], alr["chunk"]["embedding"], "cosine")
                    if sim > max_red:
                        max_red = sim
                mmr_val = mmr_lambda * rel - (1.0 - mmr_lambda) * max_red * 0.45
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

        # 5. Cross-Encoder Reranking & CRAG Relevance Grader
        t_rerank = time.time()
        query_keywords = extract_top_keywords(f"{original_prompt} {reshaped_primary_query}", 14)
        crag_threshold = float(config.get("cragThreshold", 0.34))

        scored_results: List[Dict[str, Any]] = []
        for item in mmr_selected:
            ch = item["chunk"]
            cid = ch["id"]
            content_lower = ch["content"].lower()
            dense = dense_scores.get(cid, 0.0)
            sparse = sparse_scores.get(cid, 0.0)
            rrf = rrf_scores.get(cid, 0.0)

            exact_hits = sum(1 for kw in query_keywords if kw.lower() in content_lower)
            coverage_ratio = (exact_hits / len(query_keywords)) if query_keywords else 0.5

            phrase_bonus = 0.0
            for i in range(len(query_keywords) - 1):
                pattern = re.escape(query_keywords[i]) + r"[\s\S]{0,45}" + re.escape(query_keywords[i + 1])
                if re.search(pattern, ch["content"], flags=re.IGNORECASE):
                    phrase_bonus += 0.08

            structural_quality = (ch["coherenceScore"] + ch["informationDensity"]) / 200.0
            rerank_score = (
                round(
                    min(
                        0.995,
                        rrf * 0.48 + coverage_ratio * 0.34 + min(0.18, phrase_bonus) + structural_quality * 0.1,
                    ),
                    4,
                )
                if config.get("enableCrossEncoderRerank", True)
                else rrf
            )

            if rerank_score >= max(0.54, crag_threshold + 0.16) or coverage_ratio >= 0.45:
                crag_grade = "HIGHLY_RELEVANT"
                crag_reason = (
                    f"High semantic alignment ({rerank_score * 100:.1f}%) with direct lexical anchor coverage "
                    f"({exact_hits}/{len(query_keywords)} key entities)."
                )
            elif rerank_score >= crag_threshold or exact_hits >= 1:
                crag_grade = "PARTIAL_SUPPORT"
                crag_reason = (
                    f"Contextual support ({rerank_score * 100:.1f}%) providing background on [{ch['sectionPath']}]."
                )
            else:
                crag_grade = "IRRELEVANT_NOISE"
                crag_reason = (
                    f"Below CRAG confidence gate ({rerank_score * 100:.1f}% < {crag_threshold * 100:.0f}%); "
                    f"pruned to prevent context dilution."
                )

            scored_results.append({
                "chunkId": cid,
                "documentId": ch["documentId"],
                "documentTitle": ch["documentTitle"],
                "documentFormat": ch["documentFormat"],
                "sectionPath": ch["sectionPath"],
                "content": ch["content"],
                "parentContext": ch.get("parentContext"),
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

        top_k_reranked = int(config.get("topKReranked", 5))
        if config.get("enableCragFilter", True):
            valid = [r for r in scored_results if r["cragGrade"] != "IRRELEVANT_NOISE"]
            pruned = [r for r in scored_results if r["cragGrade"] == "IRRELEVANT_NOISE"]
            if len(valid) >= 2:
                retrieved_chunks = valid[:top_k_reranked]
            else:
                retrieved_chunks = scored_results[:min(3, top_k_reranked)]
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
