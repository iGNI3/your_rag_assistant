import React from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  FileText,
  Scissors,
  Compass,
  Terminal,
  Cpu,
  HardDrive,
  BarChart2,
  Database,
} from 'lucide-react';
import {
  AgenticRagResponse,
  DatabaseTelemetry,
  RagPipelineConfig,
  SavedFinding,
  VectorDbStats,
} from '../types';
import { PipelineChoreographer } from '../components/PipelineChoreographer';

export type AppPageId =
  | 'chat'
  | 'analytics'
  | 'overview'
  | 'ingest'
  | 'chunking'
  | 'vectordb'
  | 'workbench'
  | 'metrics'
  | 'database'
  | 'settings';

interface OverviewPageProps {
  latestQuery: AgenticRagResponse | null;
  stats: VectorDbStats | null;
  config: RagPipelineConfig;
  databaseTelemetry: DatabaseTelemetry | null;
  savedFindings: SavedFinding[];
  isExecuting: boolean;
  activeStageIndex: number;
  onNavigate: (page: AppPageId) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({
  latestQuery,
  stats,
  config,
  databaseTelemetry,
  savedFindings,
  isExecuting,
  activeStageIndex,
  onNavigate,
}) => {
  const workflowCards: Array<{
    page: AppPageId;
    step: string;
    title: string;
    desc: string;
    badge: string;
    tagClass: string;
    icon: React.ComponentType<{ size?: number | string }>;
  }> = [
    {
      page: 'ingest',
      step: 'PAGE 02',
      title: 'Document Ingestion & Python OCR Lab',
      desc: 'Upload PDFs, scanned images (PNG/JPG/TIFF via OCR), DOCX, XLSX, CSV, HTML, or compose specs with automated de-hyphenation and noise cleaning.',
      badge: `${stats?.totalDocuments || 0} DOCS INDEXED`,
      tagClass: 'clay-tag-terracotta',
      icon: FileText,
    },
    {
      page: 'chunking',
      step: 'PAGE 03',
      title: '5-Strategy Chunking Optimizer',
      desc: 'Benchmark Semantic Inflection, Hierarchical Parent-Child, Atomic Propositions, Structural AST, and Sliding Window strategies.',
      badge: `AUTO-OPTIMIZER ACTIVE`,
      tagClass: 'clay-tag-ochre',
      icon: Scissors,
    },
    {
      page: 'vectordb',
      step: 'PAGE 04',
      title: '2D HNSW + BM25+ Vector Manifold',
      desc: 'Inspect 128-dim semantic embeddings in Anime.js 2D projected space and tune Cosine/Dot/L2 distance kernels, RRF alpha, and MMR lambda.',
      badge: `${stats?.totalChunks || 0} VECTORS // ${stats?.hnswTotalEdges || 0} EDGES`,
      tagClass: 'clay-tag-cobalt',
      icon: Compass,
    },
    {
      page: 'workbench',
      step: 'PAGE 05',
      title: 'Agentic Query & Prompt Reshaper Studio',
      desc: 'Execute end-to-end queries with Small LLM prompt reshaping, Step-Back, 3-way sub-queries, HyDE anchors, Cross-Encoder reranking, and CRAG filtering.',
      badge: latestQuery
        ? `${latestQuery.metrics.latencyBreakdown.totalMs} MS LATENCY`
        : 'READY',
      tagClass: 'clay-tag-sage',
      icon: Terminal,
    },
    {
      page: 'settings',
      step: 'SETTINGS',
      title: 'Settings: Account, Models, API Keys & Offline Portal',
      desc: 'Manage your user account & password, switch Small LLM & Generator models, store private API keys, and scan/download offline GGUF models.',
      badge: `${config.reshaperProvider.toUpperCase()}`,
      tagClass: 'clay-tag-terracotta',
      icon: Cpu,
    },
    {
      page: 'database',
      step: 'PAGE 08 & 09',
      title: 'Evaluation Metrics & SQLite3 Findings Vault',
      desc: 'Audit RAG Triad scores, NDCG@K, Self-RAG claim verifications, and inspect the 5 persistent SQLite3 WAL tables and exported Markdown reports.',
      badge: `${savedFindings.length} SAVED FINDINGS`,
      tagClass: 'clay-tag-cobalt',
      icon: Database,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* Dedicated GSAP Pipeline DAG Canvas */}
      <PipelineChoreographer
        latestQuery={latestQuery}
        stats={stats}
        isExecuting={isExecuting}
        activeStageIndex={activeStageIndex}
        onSelectWorkspaceTab={(tab) => {
          if (tab === 'query') onNavigate('workbench');
          else if (tab === 'ingest') onNavigate('ingest');
          else if (tab === 'vectordb') onNavigate('vectordb');
          else if (tab === 'models') onNavigate('settings');
          else if (tab === 'metrics') onNavigate('metrics');
        }}
      />

      {/* 3 Executive Telemetry Slabs */}
      <div className="grid-3">
        <div className="clay-card">
          <span className="clay-tag clay-tag-terracotta">
            OPTIMIZATION HARMONY
          </span>
          <div
            className="font-display"
            style={{ fontSize: '2.3rem', fontWeight: 700, margin: '10px 0 4px' }}
          >
            {latestQuery
              ? `${latestQuery.metrics.overallOptimizationIndex}%`
              : '91.4%'}
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
            Composite RAGAS Index combining Context Precision@K, Cross-Encoder
            NDCG@K, and Self-RAG Claim Groundedness.
          </div>
        </div>

        <div className="clay-card">
          <span className="clay-tag clay-tag-sage">
            ACTIVE SMALL LLM &amp; GENERATOR
          </span>
          <div
            className="font-display"
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              margin: '12px 0 6px',
            }}
          >
            {config.reshaperModel}
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
            Provider: <strong>{config.reshaperProvider.toUpperCase()}</strong> •
            HyDE Anchor: <strong>{config.enableHyde ? 'ON' : 'OFF'}</strong> •
            CRAG Gate: <strong>{config.enableCragFilter ? 'ON' : 'OFF'}</strong>
          </div>
        </div>

        <div className="clay-card">
          <span className="clay-tag clay-tag-cobalt">
            SQLITE3 WAL + HNSW STORAGE VAULT
          </span>
          <div
            className="font-display"
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              margin: '12px 0 6px',
            }}
          >
            {databaseTelemetry?.sqliteSizeKb || 320} KB Persisted Vault
          </div>
          <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
            {stats?.totalDocuments || 0} Documents • {stats?.totalChunks || 0}{' '}
            Vector Chunks • {savedFindings.length} Pinned Research Findings in{' '}
            <code>clayrag_vault.sqlite3</code>
          </div>
        </div>
      </div>

      {/* Guided Multi-Page Task Directory */}
      <div className="clay-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <div>
            <span className="clay-tag clay-tag-charcoal">
              DEDICATED TASK PAGES
            </span>
            <h2
              className="font-display"
              style={{ fontSize: '1.3rem', marginTop: 8 }}
            >
              Select Any Dedicated Task Workspace Below
            </h2>
          </div>
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            className="clay-btn clay-btn-terracotta"
            onClick={() => onNavigate('workbench')}
          >
            <span>OPEN AGENTIC QUERY WORKBENCH</span>
            <ArrowRight size={15} />
          </motion.button>
        </div>

        <div className="grid-3">
          {workflowCards.map((card) => {
            const IconComp = card.icon;
            return (
              <motion.div
                key={card.title}
                whileHover={{ y: -4 }}
                onClick={() => onNavigate(card.page)}
                className="clay-card-alt"
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <span
                      className="font-mono"
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--ink-muted)',
                      }}
                    >
                      {card.step}
                    </span>
                    <span className={`clay-tag ${card.tagClass}`}>
                      {card.badge}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <IconComp size={20} />
                    <h3
                      className="font-display"
                      style={{ fontSize: '1.04rem', fontWeight: 700 }}
                    >
                      {card.title}
                    </h3>
                  </div>

                  <p
                    style={{
                      fontSize: '0.83rem',
                      color: 'var(--ink-secondary)',
                      lineHeight: 1.55,
                    }}
                  >
                    {card.desc}
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--clay-terracotta)',
                  }}
                >
                  <span>OPEN WORKSPACE PAGE</span>
                  <ArrowRight size={14} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
