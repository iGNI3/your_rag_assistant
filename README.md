# CLAYRAG // End-to-End Agentic RAG Workflow Studio

An end-to-end **Agentic Retrieval-Augmented Generation (RAG) Workflow & Optimization Studio** powered by a **Python RAG + SQLite3 (WAL) Backend** and a **TypeScript Multi-Page Frontend** with dual switchable themes (**Tactile Claymorphism** and **Spatial Liquid Glass**), featuring **Framer Motion**, **GSAP**, and **Anime.js**.

---

## Core Architecture

### 1. Python Agentic RAG Engine (`backend/`)
- **Multi-Format Document & OCR Extractor** (`backend/extractor.py`): Parses PDF (`pypdf` + scanned-page OCR fallback), Images (`PNG`, `JPG`, `JPEG`, `WEBP`, `BMP`, `TIFF` via `Pillow` + `pytesseract` OCR), Word (`python-docx`), Excel/CSV (`openpyxl`), HTML/XML (`BeautifulSoup`), JSON, Markdown, and Plain Text with automated de-hyphenation, Unicode ligature normalization, and noise pruning.
- **5-Strategy Chunking Optimizer** (`backend/chunker.py`): Benchmarks and auto-selects across **Semantic Inflection**, **Hierarchical Parent-Child**, **Atomic Fact Propositions**, **Structural AST & Table**, and **Header-Injected Sliding Window**.
- **Hybrid HNSW + BM25+ Vector Database** (`backend/vectordb.py`): 128-dimensional dense semantic embeddings, 2D UMAP/PCA manifold projections, 3-layer HNSW proximity graph (`cosine`, `dot`, `euclidean`, `manhattan`), BM25+ sparse lexical index, Reciprocal Rank Fusion (RRF), Maximal Marginal Relevance (MMR), Cross-Encoder Reranking, and Corrective RAG (CRAG) noise pruning.
- **Switchable Small LLM Prompt Reshaper & Offline Model Portal** (`backend/llm_engine.py`): Performs intent classification, query reshaping, Step-Back prompting, 3-way sub-query decomposition, HyDE anchor synthesis, grounded answer generation, and Self-RAG claim verification. Supports Built-in Local Agent, Offline `.gguf`/`.onnx` models (with magic-byte header scanner), Ollama, LM Studio, OpenAI, Google Gemini, Anthropic Claude, Groq, and OpenRouter.
- **Persistent SQLite3 (WAL) Storage Vault** (`backend/storage_db.py`): Persists `documents`, `vector_chunks`, `query_runs`, `saved_findings` (plus auto-exported `.md` reports), and `pipeline_config` in `data/clayrag_vault.sqlite3`.

### 2. TypeScript Multi-Page Frontend (`src/`)
- **10 Dedicated Task Pages**: Conversational Chat Assistant (Home), Pipeline Architecture DAG (GSAP), Document & OCR Lab, 5-Strategy Chunking Optimizer, 2D HNSW Vector Manifold (Anime.js), Deep Prompt & CRAG Inspector, Switchable Small LLM Router, Offline GGUF Portal, Comprehensive RAGAS Metrics Suite, and SQLite3 Database & Findings Vault.
- **Dual Switchable Themes**: **Tactile Claymorphism** and **Spatial Liquid Glass** (with 3D glossy liquid glass droplets and cyan-violet rim refraction).

---

## Quick Start

### 1. Install Python Backend Dependencies
```bash
pip install -r requirements.txt
```

### 2. Install Frontend Dependencies
```bash
npm install
```

### 3. Run Backend & Frontend
In Terminal 1 (Python Agentic RAG Engine on `http://localhost:3001`):
```bash
python backend/main.py
```

In Terminal 2 (TypeScript Vite Studio on `http://localhost:5173`):
```bash
npm run dev:frontend
```
