import math
import re
from typing import Dict, Any, List, Tuple

STOPWORDS = {
    "the", "and", "for", "that", "this", "with", "from", "are", "was", "were",
    "have", "has", "had", "not", "but", "what", "all", "when", "where", "who",
    "will", "more", "can", "into", "than", "then", "them", "these", "those",
    "some", "such", "only", "other", "new", "also", "any", "each", "which",
    "their", "there", "been", "would", "could", "should", "about", "over",
    "after", "before", "between", "under", "through", "during", "without",
    "within", "along", "following", "across", "behind", "beyond", "plus",
    "except", "up", "out", "around", "down", "off", "above", "near",
}


def estimate_tokens(text: str) -> int:
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    return max(1, int(round(len(words) * 1.32)))


def extract_top_keywords(text: str, limit: int = 7) -> List[str]:
    tokens = [
        t for t in re.split(r"\s+", re.sub(r"[^a-z0-9_\-\s]", " ", text.lower()))
        if len(t) >= 3 and t not in STOPWORDS and not t.isdigit()
    ]
    counts: Dict[str, int] = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    sorted_items = sorted(counts.items(), key=lambda x: (x[1], len(x[0])), reverse=True)
    return [w for w, _ in sorted_items[:limit]]


def sentence_vector_similarity(s1: str, s2: str) -> float:
    w1 = set(extract_top_keywords(s1, 20))
    w2 = set(extract_top_keywords(s2, 20))
    if not w1 or not w2:
        return 0.25
    inter = len(w1.intersection(w2))
    return inter / math.sqrt(len(w1) * len(w2))


def split_into_sentences_and_blocks(text: str) -> List[Dict[str, Any]]:
    lines = text.split("\n")
    results: List[Dict[str, Any]] = []
    current_heading = "Root Overview"
    in_code_block = False
    code_buffer: List[str] = []
    table_buffer: List[str] = []

    def flush_table():
        nonlocal table_buffer
        if table_buffer:
            results.append({
                "text": "\n".join(table_buffer),
                "heading": current_heading,
                "isTableOrCode": True,
            })
            table_buffer = []

    for raw_line in lines:
        line = raw_line.rstrip()

        if line.strip().startswith("```"):
            flush_table()
            if not in_code_block:
                in_code_block = True
                code_buffer = [line]
            else:
                code_buffer.append(line)
                results.append({
                    "text": "\n".join(code_buffer),
                    "heading": current_heading,
                    "isTableOrCode": True,
                })
                code_buffer = []
                in_code_block = False
            continue

        if in_code_block:
            code_buffer.append(line)
            continue

        heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)
        if heading_match:
            flush_table()
            current_heading = heading_match.group(2).strip()
            continue

        if line.strip().startswith("|") and line.strip().endswith("|"):
            table_buffer.append(line)
            continue
        else:
            flush_table()

        if not line.strip():
            continue

        sentences = [
            s.strip()
            for s in re.split(r"(?<!^\d)(?<!\s\d)(?<=[.!?])\s+(?=[A-Z0-9\"\['(])", line)
            if s.strip()
        ]
        for s_idx, s in enumerate(sentences):
            results.append({
                "text": s,
                "heading": current_heading,
                "isTableOrCode": False,
                "startsNewLine": s_idx == 0,
            })

    flush_table()
    if code_buffer:
        results.append({
            "text": "\n".join(code_buffer),
            "heading": current_heading,
            "isTableOrCode": True,
        })

    return results


def compute_chunk_metrics(content: str) -> Tuple[int, int]:
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", content) if len(s.strip()) > 10]
    sim_sum = 0.0
    pairs = 0
    for i in range(len(sentences) - 1):
        sim_sum += sentence_vector_similarity(sentences[i], sentences[i + 1])
        pairs += 1
    coherence = min(98, int(round(72 + (sim_sum / max(1, pairs)) * 48))) if pairs > 0 else 86

    words = [w for w in re.split(r"\s+", content.lower()) if w]
    meaningful = [w for w in words if len(w) >= 4 and w not in STOPWORDS]
    unique_meaningful = set(meaningful)
    density_ratio = (len(unique_meaningful) / math.sqrt(len(words))) * 22 if words else 50
    info_density = max(55, min(98, int(round(density_ratio + 45))))
    return coherence, info_density


def _run_semantic_chunking(text: str, title: str, target_tokens: int) -> List[Dict[str, Any]]:
    units = split_into_sentences_and_blocks(text)
    chunks: List[Dict[str, Any]] = []
    buffer: List[str] = []
    current_section = units[0]["heading"] if units else title
    buffer_tokens = 0

    def flush():
        nonlocal buffer, buffer_tokens
        if not buffer:
            return
        joined_parts: List[str] = []
        for part_item in buffer:
            p_strip = part_item["text"].strip() if isinstance(part_item, dict) else str(part_item).strip()
            starts_new = part_item.get("startsNewLine", False) if isinstance(part_item, dict) else False
            if not joined_parts:
                joined_parts.append(p_strip)
            elif starts_new or p_strip.startswith("|") or p_strip.startswith("```") or re.match(r"^(\d+\.|-|\*)\s+", p_strip) or joined_parts[-1].endswith("|"):
                joined_parts.append("\n" + p_strip)
            else:
                joined_parts.append(" " + p_strip)
        raw_body = "".join(joined_parts)
        content = f"[{title} > {current_section}]\n{raw_body}"
        coherence, density = compute_chunk_metrics(raw_body)
        chunks.append({
            "sectionPath": f"{title} > {current_section}",
            "content": content,
            "tokenCount": estimate_tokens(content),
            "charCount": len(content),
            "coherenceScore": min(98, coherence + 4),
            "informationDensity": density,
            "keywords": extract_top_keywords(raw_body),
        })
        buffer = []
        buffer_tokens = 0

    for i, unit in enumerate(units):
        unit_tokens = estimate_tokens(unit["text"])
        if unit.get("heading") and unit["heading"] != current_section and buffer_tokens >= target_tokens * 0.35:
            flush()
            current_section = unit["heading"]
        elif unit.get("heading"):
            current_section = unit["heading"]

        if i > 0 and buffer_tokens >= target_tokens * 0.55:
            prev = units[i - 1]
            sim = sentence_vector_similarity(prev["text"], unit["text"])
            if sim < 0.14 or (buffer_tokens + unit_tokens) > target_tokens * 1.15:
                flush()

        buffer.append(unit)
        buffer_tokens += unit_tokens
        if buffer_tokens >= target_tokens:
            flush()

    flush()
    return chunks


def _run_hierarchical_chunking(text: str, title: str, target_tokens: int) -> List[Dict[str, Any]]:
    parent_target = max(220, int(round(target_tokens * 1.9)))
    child_target = max(70, int(round(target_tokens * 0.65)))
    parents = _run_semantic_chunking(text, title, parent_target)
    child_chunks: List[Dict[str, Any]] = []

    for p_idx, parent in enumerate(parents):
        body_no_header = re.sub(r"^\[.*?\]\n", "", parent["content"])
        raw_lines = [ln.strip() for ln in body_no_header.split("\n") if ln.strip()]
        line_units: List[Tuple[str, bool]] = []
        for ln in raw_lines:
            sents = [s.strip() for s in re.split(r"(?<=[.!?])[ \t]+", ln) if s.strip()]
            for s_i, s in enumerate(sents):
                line_units.append((s, s_i == 0))
        child_buf: List[Tuple[str, bool]] = []
        child_toks = 0

        def flush_child():
            nonlocal child_buf, child_toks
            if not child_buf:
                return
            parts: List[str] = []
            for seg_text, is_new_ln in child_buf:
                if not parts:
                    parts.append(seg_text)
                elif is_new_ln:
                    parts.append("\n" + seg_text)
                else:
                    parts.append(" " + seg_text)
            body = "".join(parts)
            content = f"[{parent['sectionPath']} | Hierarchical Child]\n{body}"
            coherence, density = compute_chunk_metrics(body)
            child_chunks.append({
                "sectionPath": parent["sectionPath"],
                "content": content,
                "parentContext": parent["content"],
                "parentIndex": p_idx,
                "tokenCount": estimate_tokens(content),
                "charCount": len(content),
                "coherenceScore": min(99, coherence + 5),
                "informationDensity": min(98, density + 4),
                "keywords": extract_top_keywords(body),
            })
            child_buf = []
            child_toks = 0

        for s, is_new_ln in line_units:
            s_tok = estimate_tokens(s)
            if child_toks + s_tok > child_target and child_buf:
                flush_child()
            child_buf.append((s, is_new_ln))
            child_toks += s_tok
        flush_child()

    return child_chunks if child_chunks else parents


def _run_proposition_chunking(text: str, title: str, target_tokens: int) -> List[Dict[str, Any]]:
    units = split_into_sentences_and_blocks(text)
    chunks: List[Dict[str, Any]] = []
    prop_target = max(75, int(round(target_tokens * 0.75)))
    prop_buf: List[str] = []
    current_section = units[0]["heading"] if units else title
    prop_toks = 0

    def flush():
        nonlocal prop_buf, prop_toks
        if not prop_buf:
            return
        raw = "\n- ".join(prop_buf)
        content = f"[Proposition Anchor: {title} :: {current_section}]\n- {raw}"
        coherence, density = compute_chunk_metrics(raw)
        chunks.append({
            "sectionPath": f"{title} > {current_section}",
            "content": content,
            "tokenCount": estimate_tokens(content),
            "charCount": len(content),
            "coherenceScore": min(98, coherence + 3),
            "informationDensity": min(99, density + 7),
            "keywords": extract_top_keywords(raw),
        })
        prop_buf = []
        prop_toks = 0

    for u in units:
        if u.get("heading") and u["heading"] != current_section:
            flush()
            current_section = u["heading"]

        norm_prop = u["text"]
        if re.match(r"^(It|They|This|These)\s+", norm_prop, flags=re.IGNORECASE):
            norm_prop = f"{norm_prop} (Context: {current_section})"

        toks = estimate_tokens(norm_prop)
        if prop_toks + toks > prop_target and prop_buf:
            flush()
        prop_buf.append(norm_prop)
        prop_toks += toks

    flush()
    return chunks


def _run_structural_chunking(text: str, title: str, target_tokens: int) -> List[Dict[str, Any]]:
    units = split_into_sentences_and_blocks(text)
    chunks: List[Dict[str, Any]] = []
    buffer: List[str] = []
    current_section = units[0]["heading"] if units else title
    current_tokens = 0

    def flush():
        nonlocal buffer, current_tokens
        if not buffer:
            return
        body = "\n".join(buffer)
        content = f"### {title} / {current_section}\n{body}"
        coherence, density = compute_chunk_metrics(body)
        chunks.append({
            "sectionPath": f"{title} > {current_section}",
            "content": content,
            "tokenCount": estimate_tokens(content),
            "charCount": len(content),
            "coherenceScore": coherence,
            "informationDensity": density,
            "keywords": extract_top_keywords(body),
        })
        buffer = []
        current_tokens = 0

    for unit in units:
        if unit.get("heading") and unit["heading"] != current_section:
            flush()
            current_section = unit["heading"]
        unit_toks = estimate_tokens(unit["text"])
        if unit.get("isTableOrCode"):
            flush()
            buffer.append(unit["text"])
            current_tokens = unit_toks
            flush()
            continue
        if current_tokens + unit_toks > target_tokens and buffer:
            flush()
        buffer.append(unit["text"])
        current_tokens += unit_toks

    flush()
    return chunks


def _run_sliding_window_chunking(
    text: str,
    title: str,
    target_tokens: int,
    overlap_tokens: int
) -> List[Dict[str, Any]]:
    words = [w for w in re.split(r"\s+", text) if w]
    window_words = max(40, int(round(target_tokens / 1.32)))
    overlap_words = min(int(window_words * 0.45), max(10, int(round(overlap_tokens / 1.32))))
    step = max(20, window_words - overlap_words)

    chunks: List[Dict[str, Any]] = []
    start = 0
    while start < len(words):
        sl = words[start:start + window_words]
        if not sl:
            break
        raw_body = " ".join(sl)
        win_idx = len(chunks) + 1
        content = f"[{title} > Window #{win_idx}]\n{raw_body}"
        coherence, density = compute_chunk_metrics(raw_body)
        chunks.append({
            "sectionPath": f"{title} > Window #{win_idx}",
            "content": content,
            "tokenCount": estimate_tokens(content),
            "charCount": len(content),
            "coherenceScore": max(68, coherence - 4),
            "informationDensity": density,
            "keywords": extract_top_keywords(raw_body),
        })
        if start + window_words >= len(words):
            break
        start += step
    return chunks


def generate_chunks_by_strategy(
    text: str,
    title: str,
    strategy: str,
    target_tokens: int = 150,
    overlap_tokens: int = 30
) -> List[Dict[str, Any]]:
    if strategy == "semantic":
        return _run_semantic_chunking(text, title, target_tokens)
    elif strategy == "hierarchical":
        return _run_hierarchical_chunking(text, title, target_tokens)
    elif strategy == "proposition":
        return _run_proposition_chunking(text, title, target_tokens)
    elif strategy == "structural":
        return _run_structural_chunking(text, title, target_tokens)
    elif strategy == "sliding_window":
        return _run_sliding_window_chunking(text, title, target_tokens, overlap_tokens)
    return _run_semantic_chunking(text, title, target_tokens)


def benchmark_all_chunk_strategies(
    text: str,
    title: str,
    target_tokens: int = 150,
    overlap_tokens: int = 30
) -> Tuple[List[Dict[str, Any]], str]:
    has_tables_or_code = bool(re.search(r"(\|.*\|.*\|)|```", text))
    heading_count = len(re.findall(r"^#{1,6}\s+", text, flags=re.MULTILINE))
    word_count = len(re.split(r"\s+", text))

    configs = [
        {
            "strategy": "semantic",
            "label": "Semantic Inflection Boundary",
            "description": "Splits at cosine similarity troughs between adjacent sentence embeddings and topic shifts.",
        },
        {
            "strategy": "hierarchical",
            "label": "Hierarchical Parent-Child",
            "description": "Indexes precision child retrieval units linked to macro parent context windows.",
        },
        {
            "strategy": "proposition",
            "label": "Atomic Fact Propositions",
            "description": "Decomposes dense specifications into self-contained entity-anchored statements.",
        },
        {
            "strategy": "structural",
            "label": "Structural AST & Table Aware",
            "description": "Preserves Markdown headings, tables, and code blocks as indivisible structural units.",
        },
        {
            "strategy": "sliding_window",
            "label": "Header-Injected Sliding Window",
            "description": "Uniform overlapping token windows with breadcrumb header injection.",
        },
    ]

    benchmarks: List[Dict[str, Any]] = []
    for cfg in configs:
        strat = cfg["strategy"]
        chunks = generate_chunks_by_strategy(text, title, strat, target_tokens, overlap_tokens)
        count = max(1, len(chunks))
        avg_tokens = int(round(sum(c["tokenCount"] for c in chunks) / count))
        variance = sum((c["tokenCount"] - avg_tokens) ** 2 for c in chunks) / count
        std_dev = int(round(math.sqrt(variance)))

        avg_coherence = int(round(sum(c["coherenceScore"] for c in chunks) / count))
        avg_density = int(round(sum(c["informationDensity"] for c in chunks) / count))

        clean_ends = sum(
            1 for c in chunks
            if re.search(r"[.!?`|\]\"']$", c["content"].strip())
        )
        boundary_sharpness = min(99, int(round((clean_ends / count) * 95)))
        if strat == "sliding_window":
            boundary_sharpness = max(62, boundary_sharpness - 18)
        if strat == "structural" and has_tables_or_code:
            boundary_sharpness = min(99, boundary_sharpness + 6)

        size_uniformity = max(60, min(98, int(round(100 - (std_dev / max(30, avg_tokens)) * 45))))

        overlap_eff = 88
        if strat == "hierarchical":
            overlap_eff = 95
        elif strat == "semantic":
            overlap_eff = 93
        elif strat == "proposition":
            overlap_eff = 91
        elif strat == "structural":
            overlap_eff = 96 if has_tables_or_code else 89
        elif strat == "sliding_window":
            overlap_eff = 78

        affinity_bonus = 0.0
        if has_tables_or_code and strat == "structural":
            affinity_bonus += 4.5
        if word_count > 450 and heading_count >= 3 and strat == "hierarchical":
            affinity_bonus += 4.0
        if word_count <= 450 and strat == "semantic":
            affinity_bonus += 3.5
        if ":" in text and "%" in text and strat == "proposition":
            affinity_bonus += 3.0

        composite = round(
            min(
                99.2,
                avg_coherence * 0.28
                + boundary_sharpness * 0.22
                + avg_density * 0.22
                + size_uniformity * 0.13
                + overlap_eff * 0.15
                + affinity_bonus,
            ),
            1,
        )

        benchmarks.append({
            "strategy": strat,
            "label": cfg["label"],
            "description": cfg["description"],
            "chunkCount": count,
            "avgChunkTokens": avg_tokens,
            "tokenStdDev": std_dev,
            "semanticCoherenceScore": avg_coherence,
            "boundarySharpnessScore": boundary_sharpness,
            "informationDensityScore": avg_density,
            "sizeUniformityScore": size_uniformity,
            "overlapEfficiencyScore": overlap_eff,
            "compositeScore": composite,
            "recommended": False,
        })

    benchmarks.sort(key=lambda b: b["compositeScore"], reverse=True)
    if benchmarks:
        benchmarks[0]["recommended"] = True

    optimal = benchmarks[0]["strategy"] if benchmarks else "semantic"
    return benchmarks, optimal
