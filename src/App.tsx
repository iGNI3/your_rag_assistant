import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import {
  MessageSquare,
  Activity,
  FileText,
  Scissors,
  Compass,
  Terminal,
  Cpu,
  HardDrive,
  BarChart2,
  Database,
  Layers,
  Shield,
  ArrowLeft,
  ArrowRight,
  Sun,
  Orbit,
} from 'lucide-react';
import {
  AgenticRagResponse,
  ChunkStrategyType,
  DatabaseTelemetry,
  DocumentChunk,
  IngestedDocument,
  ModelPortalCatalogItem,
  RagPipelineConfig,
  SavedFinding,
  VectorDbStats,
} from './types';
import { AppPageId, OverviewPage } from './pages/OverviewPage';
import { ChatHomePage } from './pages/ChatHomePage';
import { IngestOcrPage } from './pages/IngestOcrPage';
import { ChunkOptimizerPage } from './pages/ChunkOptimizerPage';
import { AgenticWorkbenchPage } from './pages/AgenticWorkbenchPage';
import { ModelRouterPage } from './pages/ModelRouterPage';
import { OfflinePortalPage } from './pages/OfflinePortalPage';
import { VectorSpaceCanvas } from './components/VectorSpaceCanvas';
import { MetricsAndEvaluationSuite } from './components/MetricsAndEvaluationSuite';
import { DatabaseAndFindingsVault } from './components/DatabaseAndFindingsVault';
import { SpatialLiquidBackground } from './components/SpatialLiquidBackground';

export type ThemeMode = 'clay' | 'liquid-glass';

interface PageRouteDef {
  id: AppPageId;
  step: string;
  group: string;
  title: string;
  sidebarLabel: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number | string }>;
}

const PAGE_ROUTES: PageRouteDef[] = [
  {
    id: 'chat',
    step: '01',
    group: 'HOME ASSISTANT',
    title: 'Conversational Agentic RAG Assistant',
    sidebarLabel: 'Chat Assistant (Home)',
    subtitle:
      'Conversational interface with formatted responses, collapsible Agentic Thinking & HyDE trace, interactive source citations, and direct file/OCR attachments.',
    icon: MessageSquare,
  },
  {
    id: 'overview',
    step: '02',
    group: 'HOME ASSISTANT',
    title: 'Pipeline Architecture & Control Center',
    sidebarLabel: 'Pipeline Architecture',
    subtitle:
      'Interactive 6-stage GSAP pipeline choreographer and executive RAG telemetry summary.',
    icon: Activity,
  },
  {
    id: 'ingest',
    step: '03',
    group: 'DATA & VECTOR PIPELINE',
    title: 'Document Ingestion & Python OCR Lab',
    sidebarLabel: 'Document & OCR Ingest',
    subtitle:
      'Upload PDFs, scanned images (Pillow + Tesseract OCR), DOCX, XLSX, CSV, HTML, or compose raw specs.',
    icon: FileText,
  },
  {
    id: 'chunking',
    step: '04',
    group: 'DATA & VECTOR PIPELINE',
    title: '5-Strategy Chunking Optimizer & Slice Reader',
    sidebarLabel: '5-Strategy Chunking',
    subtitle:
      'Benchmark Semantic, Hierarchical Parent-Child, Propositions, Structural AST, and Sliding Window strategies.',
    icon: Scissors,
  },
  {
    id: 'vectordb',
    step: '05',
    group: 'DATA & VECTOR PIPELINE',
    title: 'HNSW + BM25+ Vector Manifold Studio',
    sidebarLabel: '2D Vector Manifold',
    subtitle:
      'Explore 128-dim semantic embeddings in Anime.js 2D projected space and tune distance metrics, RRF alpha, and MMR lambda.',
    icon: Compass,
  },
  {
    id: 'workbench',
    step: '06',
    group: 'AGENTIC INFERENCE & MODELS',
    title: 'Deep Prompt Reshaper & Reranker Inspector',
    sidebarLabel: 'Prompt & CRAG Inspector',
    subtitle:
      'Inspect raw vs reshaped prompt diffs, Step-Back queries, 3-way sub-queries, HyDE passages, and Cross-Encoder CRAG pruning.',
    icon: Terminal,
  },
  {
    id: 'models',
    step: '07',
    group: 'AGENTIC INFERENCE & MODELS',
    title: 'Switchable Small LLM Router & API Key Vault',
    sidebarLabel: 'Small LLM & API Keys',
    subtitle:
      'Switch between Built-in Local Agent, Offline GGUF, Ollama, LM Studio, or Cloud APIs (OpenAI, Gemini, Anthropic, Groq) on demand.',
    icon: Cpu,
  },
  {
    id: 'offline-portal',
    step: '08',
    group: 'AGENTIC INFERENCE & MODELS',
    title: 'Offline Model Path Scanner & Download Portal',
    sidebarLabel: 'Offline GGUF Portal',
    subtitle:
      'Verify local .gguf / .onnx model files with magic-byte header validation or download from the curated HuggingFace GGUF portal.',
    icon: HardDrive,
  },
  {
    id: 'metrics',
    step: '09',
    group: 'AUDIT & SQLITE VAULT',
    title: 'Comprehensive RAGAS & Latency Evaluation Suite',
    sidebarLabel: 'Evaluation Metrics',
    subtitle:
      'Track Context Relevance, Groundedness, NDCG@K, MRR, Stage Latency Waterfall, and Self-RAG Claim-to-Source Verification.',
    icon: BarChart2,
  },
  {
    id: 'database',
    step: '10',
    group: 'AUDIT & SQLITE VAULT',
    title: 'SQLite3 (WAL) Database & Findings Vault',
    sidebarLabel: 'SQLite DB & Findings',
    subtitle:
      'Inspect the 5 persistent SQLite3 tables, disk file paths, and commit or export research findings as Markdown & JSON.',
    icon: Database,
  },
];

function parseHashToPage(): AppPageId {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return 'chat';
  const found = PAGE_ROUTES.find((r) => r.id === raw);
  return found ? found.id : 'chat';
}

export const App: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('clayrag_theme_mode');
    return saved === 'liquid-glass' || saved === 'clay' ? saved : 'clay';
  });
  const [spatialFlow, setSpatialFlow] = useState<'calm' | 'dynamic'>('dynamic');

  const [activePage, setActivePage] = useState<AppPageId>(() =>
    parseHashToPage()
  );
  const [focusedDocId, setFocusedDocId] = useState<string | undefined>(
    undefined
  );

  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [chunks, setChunks] = useState<
    Array<Omit<DocumentChunk, 'embedding' | 'sparseTerms'>>
  >([]);
  const [stats, setStats] = useState<VectorDbStats | null>(null);
  const [config, setConfig] = useState<RagPipelineConfig | null>(null);
  const [latestQuery, setLatestQuery] = useState<AgenticRagResponse | null>(
    null
  );
  const [queryHistory, setQueryHistory] = useState<AgenticRagResponse[]>([]);
  const [savedFindings, setSavedFindings] = useState<SavedFinding[]>([]);
  const [databaseTelemetry, setDatabaseTelemetry] =
    useState<DatabaseTelemetry | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelPortalCatalogItem[]>(
    []
  );

  const [isExecuting, setIsExecuting] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>(
    'SQLITE3 WAL + HNSW SYNCED'
  );

  // Apply data-theme attribute and trigger GSAP smooth spatial transition
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    localStorage.setItem('clayrag_theme_mode', themeMode);

    gsap.fromTo(
      '.clay-card, .page-header-banner, .clay-sidebar',
      {
        y: 6,
        scale: 0.992,
      },
      {
        y: 0,
        scale: 1,
        duration: 0.48,
        stagger: 0.03,
        ease: 'power3.out',
      }
    );
  }, [themeMode]);

  const navigateToPage = (page: AppPageId) => {
    window.location.hash = `/${page}`;
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(parseHashToPage());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const fetchFullState = async () => {
    try {
      const resp = await fetch('/api/state');
      if (!resp.ok) return;
      const data = await resp.json();
      setDocuments(data.documents || []);
      setChunks(data.chunks || []);
      setStats(data.stats || null);
      setConfig(data.config || null);
      if (data.latestQuery) setLatestQuery(data.latestQuery);
      setQueryHistory(data.queryHistory || []);
      setSavedFindings(data.savedFindings || []);
      setDatabaseTelemetry(data.databaseTelemetry || null);
      setModelCatalog(data.modelPortalCatalog || []);
    } catch (e) {
      console.error('Failed to fetch RAG state:', e);
    }
  };

  useEffect(() => {
    fetchFullState();
  }, []);

  const handleExecuteQuery = async (prompt: string) => {
    setIsExecuting(true);
    setStatusMessage('RESHAPING PROMPT & TRAVERSING HNSW...');

    for (let s = 3; s <= 5; s++) {
      setActiveStageIndex(s);
    }

    try {
      const resp = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (resp.ok) {
        const result: AgenticRagResponse = await resp.json();
        setLatestQuery(result);
        setQueryHistory((prev) => [result, ...prev.slice(0, 14)]);
        await fetchFullState();
        setStatusMessage(
          `ANSWER SYNTHESIZED IN ${result.metrics.latencyBreakdown.totalMs} MS`
        );
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSaveFinding = async (payload: {
    queryId?: string;
    title: string;
    prompt: string;
    reshapedQuery: string;
    synthesizedAnswer: string;
    analystNotes: string;
    tags: string[];
    citations?: AgenticRagResponse['citations'];
    claimVerifications?: AgenticRagResponse['claimVerifications'];
    metrics?: Partial<AgenticRagResponse['metrics']>;
  }) => {
    const resp = await fetch('/api/findings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = await resp.json();
      setSavedFindings(data.findings || []);
      if (data.databaseTelemetry) setDatabaseTelemetry(data.databaseTelemetry);
      setStatusMessage('FINDING COMMITTED TO SQLITE & EXPORTED TO .MD');
    }
  };

  const handleDeleteFinding = async (findingId: string) => {
    const resp = await fetch(`/api/findings/${findingId}`, {
      method: 'DELETE',
    });
    if (resp.ok) {
      const data = await resp.json();
      setSavedFindings(data.findings || []);
      if (data.databaseTelemetry) setDatabaseTelemetry(data.databaseTelemetry);
      setStatusMessage('FINDING REMOVED FROM SQLITE VAULT');
    }
  };

  const handleUpdateConfig = async (partial: Partial<RagPipelineConfig>) => {
    if (!config) return;
    const optimistic = { ...config, ...partial };
    setConfig(optimistic);
    const resp = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (resp.ok) {
      await fetchFullState();
      setStatusMessage('PIPELINE CONFIG PERSISTED TO SQLITE');
    }
  };

  const handleUploadFiles = async (
    files: FileList,
    options: {
      autoOptimize: boolean;
      strategy: ChunkStrategyType;
      targetChunkTokens: number;
      chunkOverlapTokens: number;
    }
  ) => {
    setIsExecuting(true);
    setActiveStageIndex(0);
    setStatusMessage('EXTRACTING, RUNNING OCR & SAVING TO SQLITE...');

    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append('files', f));
      formData.append('autoOptimize', String(options.autoOptimize));
      formData.append('strategy', options.strategy);
      formData.append('targetChunkTokens', String(options.targetChunkTokens));
      formData.append('chunkOverlapTokens', String(options.chunkOverlapTokens));

      const resp = await fetch('/api/ingest/upload', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        await fetchFullState();
        setStatusMessage(
          `PERSISTED ${files.length} DOC(S) TO SQLITE & ./data/uploads`
        );
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const handleIngestRawText = async (payload: {
    title: string;
    content: string;
    format: string;
    autoOptimize: boolean;
    strategy: ChunkStrategyType;
    targetChunkTokens: number;
    chunkOverlapTokens: number;
  }) => {
    setIsExecuting(true);
    setActiveStageIndex(1);
    setStatusMessage('BENCHMARKING 5 CHUNKING STRATEGIES & COMMITTING TO DB...');
    try {
      const resp = await fetch('/api/ingest/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        await fetchFullState();
        setStatusMessage(
          `COMMITTED "${payload.title.toUpperCase()}" TO SQLITE & HNSW`
        );
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRechunkDocument = async (
    docId: string,
    strategy: ChunkStrategyType,
    targetTokens: number,
    overlapTokens: number
  ) => {
    setIsExecuting(true);
    setActiveStageIndex(1);
    setStatusMessage(`RE-SLICING CHUNKS WITH ${strategy.toUpperCase()}...`);
    try {
      const resp = await fetch(`/api/documents/${docId}/rechunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy,
          targetChunkTokens: targetTokens,
          chunkOverlapTokens: overlapTokens,
        }),
      });
      if (resp.ok) {
        await fetchFullState();
        setStatusMessage(
          `SQLITE & HNSW RE-INDEXED WITH ${strategy.toUpperCase()}`
        );
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
    await fetchFullState();
    setStatusMessage('DOCUMENT REMOVED FROM SQLITE & HNSW REBUILT');
  };

  const handleResetCorpus = async () => {
    setIsExecuting(true);
    try {
      await fetch('/api/corpus/reset', { method: 'POST' });
      await fetchFullState();
      setStatusMessage('SEED TECHNICAL CORPUS RESTORED IN SQLITE');
    } finally {
      setIsExecuting(false);
    }
  };

  const currentPageIdx = PAGE_ROUTES.findIndex((p) => p.id === activePage);
  const currentPageDef = PAGE_ROUTES[currentPageIdx] || PAGE_ROUTES[0];
  const prevPageDef =
    currentPageIdx > 0 ? PAGE_ROUTES[currentPageIdx - 1] : null;
  const nextPageDef =
    currentPageIdx < PAGE_ROUTES.length - 1
      ? PAGE_ROUTES[currentPageIdx + 1]
      : null;

  const routeGroups = [
    'HOME ASSISTANT',
    'DATA & VECTOR PIPELINE',
    'AGENTIC INFERENCE & MODELS',
    'AUDIT & SQLITE VAULT',
  ];

  return (
    <>
      {/* Spatial Deep-Space & Volumetric Light Canvas (Active in Apple Liquid Glass Theme) */}
      <SpatialLiquidBackground
        active={themeMode === 'liquid-glass'}
        flowIntensity={spatialFlow}
      />

      <div className="app-multi-page-shell">
        {/* Left Sculpted Clay / Liquid Glass Sidebar */}
        <aside className="clay-sidebar">
          <div>
            <div
              onClick={() => navigateToPage('chat')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                padding: '4px 6px 16px',
                borderBottom: '1.5px solid var(--clay-border-light)',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 15,
                  backgroundColor: 'var(--clay-terracotta)',
                  color: '#FAF6F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-clay-terracotta)',
                  flexShrink: 0,
                }}
              >
                <Layers size={22} />
              </div>
              <div>
                <div
                  className="font-display"
                  style={{ fontSize: '1.16rem', fontWeight: 700 }}
                >
                  CLAYRAG STUDIO
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    color: 'var(--ink-muted)',
                  }}
                >
                  {themeMode === 'clay'
                    ? 'TACTILE CLAY EDITION'
                    : 'SPATIAL LIQUID GLASS'}
                </div>
              </div>
            </div>

            {/* Dual Theme Switcher Capsule inside Sidebar */}
            <div
              className="clay-well"
              style={{
                marginTop: 14,
                padding: 6,
                borderRadius: 18,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setThemeMode('clay')}
                className={`clay-btn ${
                  themeMode === 'clay' ? 'clay-btn-terracotta' : ''
                }`}
                style={{
                  padding: '8px 10px',
                  fontSize: '0.73rem',
                  borderRadius: 13,
                }}
              >
                <Sun size={13} />
                <span>CLAY</span>
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('liquid-glass')}
                className={`clay-btn ${
                  themeMode === 'liquid-glass' ? 'clay-btn-cobalt' : ''
                }`}
                style={{
                  padding: '8px 10px',
                  fontSize: '0.73rem',
                  borderRadius: 13,
                }}
              >
                <Orbit size={13} />
                <span>LIQUID GLASS</span>
              </button>
            </div>

            <nav style={{ marginTop: 4 }}>
              {routeGroups.map((grp) => (
                <div key={grp}>
                  <div className="sidebar-group-title">{grp}</div>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    {PAGE_ROUTES.filter((r) => r.group === grp).map((route) => {
                      const IconComp = route.icon;
                      const isActive = activePage === route.id;
                      return (
                        <button
                          key={route.id}
                          type="button"
                          onClick={() => navigateToPage(route.id)}
                          className={`sidebar-nav-item ${
                            isActive ? 'active' : ''
                          }`}
                        >
                          <span className="sidebar-step-badge">
                            {route.step}
                          </span>
                          <IconComp size={16} />
                          <span
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {route.sidebarLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div
            className="clay-well"
            style={{
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
              }}
            >
              LIVE ENGINE TELEMETRY
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <span>Indexed Documents</span>
              <span className="font-mono">{stats?.totalDocuments || 0}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <span>HNSW Vector Chunks</span>
              <span className="font-mono">{stats?.totalChunks || 0}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              <span>Saved SQLite Findings</span>
              <span className="font-mono">{savedFindings.length}</span>
            </div>
          </div>
        </aside>

        {/* Main Dedicated Page Stage */}
        <div className="page-stage">
          <header className="page-header-banner">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <span className="clay-tag clay-tag-terracotta">
                  PAGE {currentPageDef.step} OF 10 // {currentPageDef.group}
                </span>
                <span className="clay-tag clay-tag-sage">
                  <Shield size={12} />
                  <span>{statusMessage}</span>
                </span>
              </div>
              <h1
                className="font-display"
                style={{ fontSize: '1.62rem', fontWeight: 700 }}
              >
                {currentPageDef.title}
              </h1>
              <p
                style={{
                  fontSize: '0.88rem',
                  color: 'var(--ink-secondary)',
                  marginTop: 4,
                }}
              >
                {currentPageDef.subtitle}
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              {/* Top Theme & Spatial Flow Controls */}
              <button
                type="button"
                onClick={() =>
                  setThemeMode(themeMode === 'clay' ? 'liquid-glass' : 'clay')
                }
                className={`clay-btn ${
                  themeMode === 'liquid-glass'
                    ? 'clay-btn-cobalt'
                    : 'clay-btn-charcoal'
                }`}
                style={{ padding: '10px 16px', fontSize: '0.78rem' }}
              >
                {themeMode === 'clay' ? (
                  <>
                    <Orbit size={15} />
                    <span>SWITCH TO LIQUID GLASS</span>
                  </>
                ) : (
                  <>
                    <Sun size={15} />
                    <span>SWITCH TO TACTILE CLAY</span>
                  </>
                )}
              </button>

              {themeMode === 'liquid-glass' && (
                <button
                  type="button"
                  onClick={() =>
                    setSpatialFlow(
                      spatialFlow === 'dynamic' ? 'calm' : 'dynamic'
                    )
                  }
                  className="clay-btn"
                  style={{ padding: '10px 14px', fontSize: '0.75rem' }}
                >
                  <span>
                    SPACE FLOW: {spatialFlow.toUpperCase()}
                  </span>
                </button>
              )}

              {prevPageDef && (
                <button
                  type="button"
                  className="clay-btn"
                  onClick={() => navigateToPage(prevPageDef.id)}
                >
                  <ArrowLeft size={15} />
                  <span>STEP {prevPageDef.step}</span>
                </button>
              )}
              {nextPageDef && (
                <button
                  type="button"
                  className="clay-btn clay-btn-terracotta"
                  onClick={() => navigateToPage(nextPageDef.id)}
                >
                  <span>NEXT: STEP {nextPageDef.step}</span>
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </header>

          {config && (
            <AnimatePresence mode="wait">
              <motion.main
                key={activePage}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              >
                {activePage === 'chat' && (
                  <ChatHomePage
                    queryHistory={queryHistory}
                    config={config}
                    isExecuting={isExecuting}
                    onExecuteQuery={handleExecuteQuery}
                    onUpdateConfig={handleUpdateConfig}
                    onUploadFiles={handleUploadFiles}
                    onSaveFindingFromChat={async (turn) => {
                      await handleSaveFinding({
                        queryId: turn.queryId,
                        title: `Chat Finding: ${turn.promptReshape.originalPrompt.slice(
                          0,
                          68
                        )}`,
                        prompt: turn.promptReshape.originalPrompt,
                        reshapedQuery: turn.promptReshape.reshapedPrimaryQuery,
                        synthesizedAnswer: turn.answer,
                        analystNotes: `Saved from Conversational Chat Assistant (Optimization Index: ${turn.metrics.overallOptimizationIndex}%).`,
                        tags: ['CHAT_ASSISTANT', 'HNSW_VERIFIED'],
                        citations: turn.citations,
                        claimVerifications: turn.claimVerifications,
                        metrics: turn.metrics,
                      });
                    }}
                    onOpenModelsPage={() => navigateToPage('models')}
                  />
                )}

                {activePage === 'overview' && (
                  <OverviewPage
                    latestQuery={latestQuery}
                    stats={stats}
                    config={config}
                    databaseTelemetry={databaseTelemetry}
                    savedFindings={savedFindings}
                    isExecuting={isExecuting}
                    activeStageIndex={activeStageIndex}
                    onNavigate={navigateToPage}
                  />
                )}

                {activePage === 'ingest' && (
                  <IngestOcrPage
                    documents={documents}
                    config={config}
                    onUploadFiles={handleUploadFiles}
                    onIngestRawText={handleIngestRawText}
                    onDeleteDocument={handleDeleteDocument}
                    onResetCorpus={handleResetCorpus}
                    onGoToChunkOptimizer={(docId) => {
                      setFocusedDocId(docId);
                      navigateToPage('chunking');
                    }}
                    isBusy={isExecuting}
                  />
                )}

                {activePage === 'chunking' && (
                  <ChunkOptimizerPage
                    documents={documents}
                    chunks={chunks}
                    config={config}
                    initialSelectedDocId={focusedDocId}
                    onRechunkDocument={handleRechunkDocument}
                    isBusy={isExecuting}
                  />
                )}

                {activePage === 'vectordb' && (
                  <VectorSpaceCanvas
                    chunks={chunks}
                    latestQuery={latestQuery}
                    stats={stats}
                    config={config}
                    onUpdateConfig={handleUpdateConfig}
                  />
                )}

                {activePage === 'workbench' && (
                  <AgenticWorkbenchPage
                    latestQuery={latestQuery}
                    config={config}
                    isExecuting={isExecuting}
                    onExecuteQuery={handleExecuteQuery}
                    onUpdateConfig={handleUpdateConfig}
                    onQuickSaveFinding={async () => {
                      if (!latestQuery) return;
                      await handleSaveFinding({
                        queryId: latestQuery.queryId,
                        title: `Finding: ${latestQuery.promptReshape.originalPrompt.slice(
                          0,
                          68
                        )}`,
                        prompt: latestQuery.promptReshape.originalPrompt,
                        reshapedQuery:
                          latestQuery.promptReshape.reshapedPrimaryQuery,
                        synthesizedAnswer: latestQuery.answer,
                        analystNotes: `Quick-saved from Prompt & CRAG Inspector (Optimization Index: ${latestQuery.metrics.overallOptimizationIndex}%).`,
                        tags: ['WORKBENCH_FINDING', 'HNSW_VERIFIED'],
                        citations: latestQuery.citations,
                        claimVerifications: latestQuery.claimVerifications,
                        metrics: latestQuery.metrics,
                      });
                    }}
                  />
                )}

                {activePage === 'models' && (
                  <ModelRouterPage
                    config={config}
                    onUpdateConfig={handleUpdateConfig}
                    onGoToOfflinePortal={() => navigateToPage('offline-portal')}
                  />
                )}

                {activePage === 'offline-portal' && (
                  <OfflinePortalPage
                    config={config}
                    modelCatalog={modelCatalog}
                    onUpdateConfig={handleUpdateConfig}
                  />
                )}

                {activePage === 'metrics' && (
                  <MetricsAndEvaluationSuite
                    latestQuery={latestQuery}
                    queryHistory={queryHistory}
                    onSelectHistoryQuery={(q) => setLatestQuery(q)}
                  />
                )}

                {activePage === 'database' && (
                  <DatabaseAndFindingsVault
                    databaseTelemetry={databaseTelemetry}
                    savedFindings={savedFindings}
                    documents={documents}
                    latestQuery={latestQuery}
                    onSaveFinding={handleSaveFinding}
                    onDeleteFinding={handleDeleteFinding}
                  />
                )}
              </motion.main>
            </AnimatePresence>
          )}
        </div>
      </div>
    </>
  );
};
