from typing import List, Dict, Any

SEED_CORPUS_DOCUMENTS: List[Dict[str, Any]] = [
    {
        "id": "doc_hnsw_architecture",
        "title": "HNSW Vector Indexing & Hybrid RRF Retrieval Specification",
        "filename": "hnsw_hybrid_retrieval_spec.pdf",
        "format": "PDF",
        "ocrUsed": False,
        "ocrConfidence": 100.0,
        "rawText": """# HNSW Vector Indexing & Hybrid RRF Retrieval Specification

## 1. Hierarchical Navigable Small World (HNSW) Topology
Hierarchical Navigable Small World (HNSW) graphs organize dense vector embeddings across multi-layered proximity graphs. Layer 0 contains the complete set of indexed document chunks with maximum degree M = 16 bidirectional links per node. Upper layers act as exponentially decaying express routing highways, enabling logarithmic search complexity O(log N) during approximate nearest neighbor (ANN) traversal.

When indexing 128-dimensional or 768-dimensional unit-normalized embeddings, HNSW construction uses efConstruction = 200 to maintain high graph recall above 98.4%. Vector quantization using INT8 scalar quantization compresses memory footprint by 75% (from 4 bytes per float32 dimension down to 1 byte) while retaining 99.1% cosine similarity fidelity. Binary quantization reduces memory by 96.8% for massive multi-million chunk collections.

## 2. Hybrid Retrieval & Reciprocal Rank Fusion (RRF)
Pure dense vector search excels at semantic paraphrase matching but can miss exact alphanumeric identifiers, part serials, or domain acronyms. Conversely, BM25+ lexical sparse retrieval guarantees exact term matching with inverse document frequency (IDF) weighting and document length normalization (k1 = 1.5, b = 0.75).

Reciprocal Rank Fusion (RRF) combines dense HNSW rankings and sparse BM25+ rankings without requiring score calibration across incompatible distributions:
RRF_Score(d) = alpha / (k + Rank_Dense(d)) + (1 - alpha) / (k + Rank_Sparse(d))
Setting the hybrid alpha parameter to 0.65 favors semantic vector density while preserving 35% lexical anchor precision. Empirical evaluations demonstrate a +19.4% NDCG@5 improvement over single-modality vector retrieval.

## 3. Maximal Marginal Relevance (MMR) Diversity Control
After RRF candidate selection, Maximal Marginal Relevance (MMR) iteratively selects chunks that maximize relevance to the reshaped query while penalizing pairwise cosine redundancy against already-selected chunks. A lambda setting of 0.78 balances factual coverage and context window token efficiency.""",
    },
    {
        "id": "doc_chunking_optimization",
        "title": "Adaptive Chunking Strategy Benchmark & Boundary Optimization",
        "filename": "adaptive_chunking_benchmarks.md",
        "format": "MARKDOWN",
        "ocrUsed": False,
        "ocrConfidence": 100.0,
        "rawText": """# Adaptive Chunking Strategy Benchmark & Boundary Optimization

## 1. Comparative Analysis of Chunking Strategies
Selecting an optimal chunking strategy directly governs retrieval precision and downstream answer groundedness. Fixed sliding windows often slice mid-sentence or fracture Markdown tables, whereas structure-aware and semantic chunkers align cuts with topic transitions.

| Strategy Name | Optimal Use Case | Avg Coherence | Boundary Sharpness | Context Preservation |
| --- | --- | --- | --- | --- |
| Semantic Inflection | Technical prose & whitepapers | 95.2% | 96.4% | High topic isolation |
| Hierarchical Parent-Child | Long multi-section manuals | 96.8% | 94.1% | Macro parent + child precision |
| Atomic Fact Propositions | Dense legal & regulatory specs | 94.5% | 97.8% | Self-contained entity facts |
| Structural AST & Table | Spreadsheets, HTML, Markdown | 93.9% | 98.5% | Zero broken tables or code |
| Sliding Window | Unstructured raw transcripts | 79.4% | 71.2% | Uniform token overlap |

## 2. Hierarchical Parent-Child Architecture
In Hierarchical Parent-Child chunking, documents are segmented into two linked tiers:
1. Parent Macro Chunks (320 to 512 tokens) capture full section arguments and surrounding context.
2. Child Retrieval Chunks (90 to 160 tokens) are embedded into the HNSW vector index for pinpoint cosine matching.
During retrieval, child chunks match the query vector with high specificity without topic dilution, and their linked parent context is supplied to the answer generator.

## 3. Atomic Proposition Decomposition
Proposition chunking rewrites compound paragraphs into atomic, self-contained factual statements and resolves ambiguous pronouns (such as replacing "It" or "They" with the explicit section entity). This raises Context Precision@K by 14.2% on multi-hop analytical queries.""",
    },
    {
        "id": "doc_agentic_reshaper_ocr",
        "title": "Small LLM Prompt Reshaping, CRAG & Multimodal OCR Pipeline",
        "filename": "scanned_agentic_pipeline_blueprint.png",
        "format": "IMAGE_OCR",
        "ocrUsed": True,
        "ocrConfidence": 96.4,
        "rawText": """# Small LLM Prompt Reshaping, CRAG & Multimodal OCR Pipeline

## 1. Small LLM Query Reshaping & HyDE Transformation
Raw user prompts are frequently underspecified, conversational, or ambiguous. Deploying a compact 2B to 8B parameter Small LLM (such as Qwen2.5-3B-Instruct, Phi-3.5-Mini, or Llama-3.1-8B in Q4_K_M GGUF quantization) at the ingress stage performs four transformations before vector search:
1. Conversational Noise Stripping & Entity Anchoring: Extracts domain keywords and expands technical synonyms.
2. Step-Back Prompting: Formulates a broader foundational query to retrieve governing principles alongside specific facts.
3. Multi-Query Decomposition: Splits complex compound prompts into 3 orthogonal sub-queries executed in parallel across the HNSW index.
4. Hypothetical Document Embedding (HyDE): Synthesizes an ideal hypothetical technical passage that bridges the lexical gap between short questions and declarative document chunks.

## 2. Cross-Encoder Reranking & Corrective RAG (CRAG) Gate
Initial bi-encoder vector search retrieves Top-K candidates (e.g. K = 10). A Cross-Encoder Reranker evaluates fine-grained token-level attention and bi-gram proximity between the query and each candidate chunk, promoting deeply relevant passages to Rank #1.
Subsequently, the Corrective RAG (CRAG) relevance grader classifies every chunk into three tiers:
- HIGHLY_RELEVANT: Directly answers the core entities and technical constraints.
- PARTIAL_SUPPORT: Supplies corroborating context or architectural background.
- IRRELEVANT_NOISE: Falls below the CRAG confidence threshold and is automatically pruned before LLM generation, eliminating context poisoning and reducing token cost by up to 40%.

## 3. Neural OCR & Multi-Format Ingestion Optimization
Scanned PDFs and raster images (PNG, JPEG, TIFF, WEBP) pass through an automated Python OCR recognition and layout cleaning pipeline. De-hyphenation repairs words split across line wraps, ligature normalization restores standard UTF-8 characters, and tabular structures are converted into normalized Markdown grids.""",
    },
]
