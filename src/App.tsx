import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  Activity,
  FileText,
  Scissors,
  Compass,
  Terminal,
  BarChart2,
  Database,
  Layers,
  Shield,
  ArrowLeft,
  ArrowRight,
  Palette,
  Settings,
  LogOut,
  User,
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
  UserProfile,
  VectorDbStats,
} from './types';
import {
  authFetch,
  getStoredAuthToken,
  setStoredAuthToken,
} from './api';
import { AppPageId, OverviewPage } from './pages/OverviewPage';
import { AuthPage } from './pages/AuthPage';
import { ChatHomePage } from './pages/ChatHomePage';
import { IngestOcrPage } from './pages/IngestOcrPage';
import { ChunkOptimizerPage } from './pages/ChunkOptimizerPage';
import { AgenticWorkbenchPage } from './pages/AgenticWorkbenchPage';
import { SettingsPage } from './pages/SettingsPage';
import { VectorSpaceCanvas } from './components/VectorSpaceCanvas';
import { MetricsAndEvaluationSuite } from './components/MetricsAndEvaluationSuite';
import { DatabaseAndFindingsVault } from './components/DatabaseAndFindingsVault';
import { SpatialLiquidBackground } from './components/SpatialLiquidBackground';
import { VisionCeramicBackground } from './components/VisionCeramicBackground';
import { ThemeSlideDrawer } from './components/ThemeSlideDrawer';
import { ColorPaletteId, getPaletteById } from './themePalettes';

export type ThemeMode = 'clay' | 'liquid-glass' | 'vision-ceramic';

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
    group: 'AUDIT & INSPECTION',
    title: 'Deep Prompt Reshaper & Reranker Inspector',
    sidebarLabel: 'Prompt & CRAG Inspector',
    subtitle:
      'Inspect raw vs reshaped prompt diffs, Step-Back queries, 3-way sub-queries, HyDE passages, and Cross-Encoder CRAG pruning.',
    icon: Terminal,
  },
  {
    id: 'metrics',
    step: '07',
    group: 'AUDIT & INSPECTION',
    title: 'Comprehensive RAGAS & Latency Evaluation Suite',
    sidebarLabel: 'Evaluation Metrics',
    subtitle:
      'Track Context Relevance, Groundedness, NDCG@K, MRR, Stage Latency Waterfall, and Self-RAG Claim-to-Source Verification.',
    icon: BarChart2,
  },
  {
    id: 'database',
    step: '08',
    group: 'AUDIT & INSPECTION',
    title: 'SQLite3 (WAL) Database & Findings Vault',
    sidebarLabel: 'SQLite DB & Findings',
    subtitle:
      'Inspect your isolated SQLite3 tables, disk storage paths, and commit or export research findings as Markdown & JSON.',
    icon: Database,
  },
  {
    id: 'settings',
    step: '09',
    group: 'SYSTEM & ACCOUNT',
    title: 'Settings: Account, Models, API Keys & Offline Portal',
    sidebarLabel: 'Settings & Account',
    subtitle:
      'Manage your account & password, switch Small LLM & Generator models, configure private API keys, and scan/download offline GGUF models.',
    icon: Settings,
  },
];

function parseHashToPage(): AppPageId {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return 'chat';
  if (raw === 'models' || raw === 'offline-portal') return 'settings';
  const found = PAGE_ROUTES.find((r) => r.id === raw);
  return found ? found.id : 'chat';
}

export const App: React.FC = () => {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('clayrag_theme_mode');
    return saved === 'liquid-glass' ||
      saved === 'clay' ||
      saved === 'vision-ceramic'
      ? saved
      : 'clay';
  });
  const [paletteId, setPaletteId] = useState<ColorPaletteId>(() => {
    const saved = localStorage.getItem('clayrag_color_palette');
    return getPaletteById(saved).id;
  });
  const [spatialFlow, setSpatialFlow] = useState<'calm' | 'dynamic'>('calm');
  const [isThemeDrawerOpen, setIsThemeDrawerOpen] = useState<boolean>(false);

  const activePalette = getPaletteById(paletteId);

  // Multi-user Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

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

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themeMode);
    localStorage.setItem('clayrag_theme_mode', themeMode);
    localStorage.setItem('clayrag_color_palette', paletteId);

    const varsToApply =
      themeMode === 'clay'
        ? activePalette.clayVars
        : themeMode === 'liquid-glass'
          ? activePalette.liquidVars
          : activePalette.ceramicVars;

    // Clear previous overrides first so switching modes stays clean
    const allKnownKeys = new Set([
      ...Object.keys(activePalette.clayVars),
      ...Object.keys(activePalette.liquidVars),
      ...Object.keys(activePalette.ceramicVars),
    ]);
    allKnownKeys.forEach((k) => root.style.removeProperty(k));
    Object.entries(varsToApply).forEach(([k, val]) => {
      root.style.setProperty(k, val);
    });
  }, [themeMode, paletteId, activePalette]);

  const navigateToPage = (page: AppPageId) => {
    window.location.hash = `/${page}`;
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onHashChange = () => setActivePage(parseHashToPage());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const clearWorkspaceState = () => {
    setDocuments([]);
    setChunks([]);
    setStats(null);
    setConfig(null);
    setLatestQuery(null);
    setQueryHistory([]);
    setSavedFindings([]);
    setDatabaseTelemetry(null);
  };

  const fetchFullState = async () => {
    try {
      const resp = await authFetch('/api/state');
      if (resp.status === 401) {
        setStoredAuthToken(null);
        setCurrentUser(null);
        clearWorkspaceState();
        return;
      }
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.user) setCurrentUser(data.user);
      setDocuments(data.documents || []);
      setChunks(data.chunks || []);
      setStats(data.stats || null);
      setConfig(data.config || null);
      setLatestQuery(data.latestQuery || null);
      setQueryHistory(data.queryHistory || []);
      setSavedFindings(data.savedFindings || []);
      setDatabaseTelemetry(data.databaseTelemetry || null);
      setModelCatalog(data.modelPortalCatalog || []);
    } catch (e) {
      console.error('Failed to fetch RAG state:', e);
    }
  };

  // Validate existing session token on initial load
  useEffect(() => {
    const checkSession = async () => {
      const tok = getStoredAuthToken();
      if (!tok) {
        setAuthChecked(true);
        return;
      }
      try {
        const resp = await authFetch('/api/auth/me');
        if (resp.ok) {
          const data = await resp.json();
          setCurrentUser(data.user);
          await fetchFullState();
        } else {
          setStoredAuthToken(null);
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      } finally {
        setAuthChecked(true);
      }
    };
    checkSession();
  }, []);

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredAuthToken(null);
    setCurrentUser(null);
    clearWorkspaceState();
    navigateToPage('chat');
  };

  const handleExecuteQuery = async (prompt: string) => {
    setIsExecuting(true);
    setStatusMessage('RESHAPING PROMPT & TRAVERSING HNSW...');

    for (let s = 3; s <= 5; s++) {
      setActiveStageIndex(s);
    }

    try {
      const resp = await authFetch('/api/query', {
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
    const resp = await authFetch('/api/findings', {
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
    const resp = await authFetch(`/api/findings/${findingId}`, {
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
    const resp = await authFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    if (resp.ok) {
      await fetchFullState();
      setStatusMessage('USER SETTINGS PERSISTED TO SQLITE');
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

      const resp = await authFetch('/api/ingest/upload', {
        method: 'POST',
        body: formData,
      });
      if (resp.ok) {
        await fetchFullState();
        setStatusMessage(`PERSISTED ${files.length} DOC(S) TO YOUR VAULT`);
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
      const resp = await authFetch('/api/ingest/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        await fetchFullState();
        setStatusMessage(
          `COMMITTED "${payload.title.toUpperCase()}" TO YOUR HNSW INDEX`
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
      const resp = await authFetch(`/api/documents/${docId}/rechunk`, {
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
    await authFetch(`/api/documents/${docId}`, { method: 'DELETE' });
    await fetchFullState();
    setStatusMessage('DOCUMENT REMOVED FROM SQLITE & HNSW REBUILT');
  };

  const handleResetCorpus = async () => {
    setIsExecuting(true);
    try {
      await authFetch('/api/corpus/reset', { method: 'POST' });
      await fetchFullState();
      setStatusMessage('STARTER TECHNICAL CORPUS RESTORED IN YOUR VAULT');
    } finally {
      setIsExecuting(false);
    }
  };

  // Show Authentication Screen if not signed in
  if (!authChecked) {
    return (
      <>
        <SpatialLiquidBackground
          active={themeMode === 'liquid-glass'}
          flowIntensity={spatialFlow}
          palette={activePalette}
        />
        <VisionCeramicBackground
          active={themeMode === 'vision-ceramic'}
          palette={activePalette}
        />
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div className="clay-card font-mono">
            VERIFYING USER SESSION...
          </div>
        </div>
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        <SpatialLiquidBackground
          active={themeMode === 'liquid-glass'}
          flowIntensity={spatialFlow}
          palette={activePalette}
        />
        <VisionCeramicBackground
          active={themeMode === 'vision-ceramic'}
          palette={activePalette}
        />
        <AuthPage
          themeMode={themeMode}
          activePaletteName={activePalette.name}
          onOpenThemeDrawer={() => setIsThemeDrawerOpen(true)}
          onAuthSuccess={async (userObj) => {
            setCurrentUser(userObj);
            await fetchFullState();
            navigateToPage('chat');
          }}
        />
        <ThemeSlideDrawer
          isOpen={isThemeDrawerOpen}
          onClose={() => setIsThemeDrawerOpen(false)}
          themeMode={themeMode}
          paletteId={paletteId}
          spatialFlow={spatialFlow}
          onChangeTheme={setThemeMode}
          onChangePalette={setPaletteId}
          onChangeSpatialFlow={setSpatialFlow}
        />
      </>
    );
  }

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
    'AUDIT & INSPECTION',
    'SYSTEM & ACCOUNT',
  ];

  return (
    <>
      <SpatialLiquidBackground
        active={themeMode === 'liquid-glass'}
        flowIntensity={spatialFlow}
        palette={activePalette}
      />
      <VisionCeramicBackground
        active={themeMode === 'vision-ceramic'}
        palette={activePalette}
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
                    : themeMode === 'liquid-glass'
                      ? 'FROSTED CRYSTAL GLASS'
                      : 'VISION CERAMIC STUDIO'}
                </div>
              </div>
            </div>

            {/* Single Clean Theme Button -> Opens Floating Theme Studio Popup */}
            <button
              type="button"
              onClick={() => setIsThemeDrawerOpen(true)}
              className="clay-btn"
              style={{
                width: '100%',
                marginTop: 14,
                padding: '11px 14px',
                justifyContent: 'space-between',
                fontSize: '0.78rem',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Palette size={15} />
                <span>THEME</span>
              </span>
              <span
                className="clay-tag"
                style={{
                  padding: '3px 9px',
                  fontSize: '0.64rem',
                  maxWidth: 155,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {themeMode === 'clay'
                  ? 'CLAY'
                  : themeMode === 'liquid-glass'
                    ? 'GLASS'
                    : 'CERAMIC'}{' '}
                • {activePalette.name.split(' ')[0]}
              </span>
            </button>

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
                          className={`sidebar-nav-item ${isActive ? 'active' : ''
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

          {/* Bottom User Account & Vault Telemetry Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              className="clay-well"
              style={{
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <User size={15} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="font-display"
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {currentUser.displayName}
                    </div>
                    <div
                      className="font-mono"
                      style={{ fontSize: '0.67rem', color: 'var(--ink-muted)' }}
                    >
                      @{currentUser.username}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  title="Sign Out"
                  onClick={handleLogout}
                  className="clay-btn"
                  style={{ padding: '6px 9px', fontSize: '0.7rem' }}
                >
                  <LogOut size={13} />
                </button>
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--clay-border-light)',
                  paddingTop: 6,
                  marginTop: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                }}
                className="font-mono"
              >
                <span>{stats?.totalDocuments || 0} DOCS</span>
                <span>{stats?.totalChunks || 0} VEC</span>
                <span>{savedFindings.length} FINDINGS</span>
              </div>
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
                  PAGE {currentPageDef.step} OF 09 // {currentPageDef.group}
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
              <button
                type="button"
                onClick={() => navigateToPage('settings')}
                className="clay-btn"
                style={{ padding: '10px 14px', fontSize: '0.76rem' }}
              >
                <Settings size={14} />
                <span>SETTINGS</span>
              </button>

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
            <motion.main
              key={activePage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
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
                    onOpenModelsPage={() => navigateToPage('settings')}
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

                {activePage === 'settings' && (
                  <SettingsPage
                    user={currentUser}
                    config={config}
                    modelCatalog={modelCatalog}
                    themeMode={themeMode}
                    spatialFlow={spatialFlow}
                    paletteId={paletteId}
                    onChangeTheme={setThemeMode}
                    onChangeSpatialFlow={setSpatialFlow}
                    onChangePalette={setPaletteId}
                    onUpdateConfig={handleUpdateConfig}
                    onUserUpdated={(u) => setCurrentUser(u)}
                    onLogout={handleLogout}
                    onAccountDeleted={() => {
                      setStoredAuthToken(null);
                      setCurrentUser(null);
                      clearWorkspaceState();
                      navigateToPage('chat');
                    }}
                  />
                )}
              </motion.main>
          )}
        </div>
      </div>

      {/* Global Slide-Over Theme & Color Palette Drawer */}
      <ThemeSlideDrawer
        isOpen={isThemeDrawerOpen}
        onClose={() => setIsThemeDrawerOpen(false)}
        themeMode={themeMode}
        paletteId={paletteId}
        spatialFlow={spatialFlow}
        onChangeTheme={setThemeMode}
        onChangePalette={setPaletteId}
        onChangeSpatialFlow={setSpatialFlow}
      />
    </>
  );
};
