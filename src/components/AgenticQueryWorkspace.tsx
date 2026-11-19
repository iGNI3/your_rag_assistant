import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  Cpu,
  Sliders,
  ArrowUpRight,
  Layers,
  ShieldCheck,
  FileText,
  Filter,
  Terminal,
} from 'lucide-react';
import { AgenticRagResponse, RagPipelineConfig } from '../types';

interface AgenticQueryWorkspaceProps {
  latestQuery: AgenticRagResponse | null;
  config: RagPipelineConfig;
  isExecuting: boolean;
  onExecuteQuery: (prompt: string) => Promise<void>;
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
  onQuickSaveFinding?: () => Promise<void>;
}

const PRESET_QUERIES = [
  'How does HNSW vector indexing combine with Reciprocal Rank Fusion (RRF) and MMR diversity control?',
  'Compare the 5 adaptive chunking strategies (Semantic, Hierarchical Parent-Child, Propositions, Structural AST, Sliding Window).',
  'How does the Small LLM Prompt Reshaper use HyDE, Multi-Query expansion, and CRAG noise pruning to prevent hallucinations?',
  'How does the Python OCR and document extraction pipeline clean scanned images, PDFs, DOCX, and XLSX tables?',
];

export const AgenticQueryWorkspace: React.FC<AgenticQueryWorkspaceProps> = ({
  latestQuery,
  config,
  isExecuting,
  onExecuteQuery,
  onUpdateConfig,
  onQuickSaveFinding,
}) => {
  const [promptInput, setPromptInput] = useState<string>(
    latestQuery?.promptReshape.originalPrompt || PRESET_QUERIES[0]
  );
  const [showPrunedDrawer, setShowPrunedDrawer] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isExecuting) return;
    await onExecuteQuery(promptInput.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Top Prompt Console Card */}
      <div className="clay-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="clay-tag clay-tag-terracotta">
              <Terminal size={13} />
              <span>AGENTIC RAG QUERY CONSOLE</span>
            </span>
            <span className="clay-tag">
              SMALL LLM RESHAPER: {config.reshaperModel} (
              {config.reshaperProvider.toUpperCase()})
            </span>
          </div>

          {/* Pipeline Feature Switches */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              {
                key: 'enableHyde' as const,
                label: 'HYDE ANCHOR',
                val: config.enableHyde,
              },
              {
                key: 'enableMultiQuery' as const,
                label: '3-WAY MULTI-QUERY',
                val: config.enableMultiQuery,
              },
              {
                key: 'enableCrossEncoderRerank' as const,
                label: 'CROSS-ENCODER RERANK',
                val: config.enableCrossEncoderRerank,
              },
              {
                key: 'enableCragFilter' as const,
                label: 'CRAG NOISE GATE',
                val: config.enableCragFilter,
              },
            ].map((sw) => (
              <button
                key={sw.key}
                type="button"
                className={`clay-btn ${sw.val ? 'clay-btn-sage' : ''}`}
                style={{ padding: '5px 11px', fontSize: '0.71rem' }}
                onClick={() => onUpdateConfig({ [sw.key]: !sw.val })}
              >
                <span>{sw.label}:</span>
                <strong>{sw.val ? 'ON' : 'OFF'}</strong>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <input
              type="text"
              className="clay-input"
              placeholder="Ask any complex technical question across your ingested PDFs, OCR scans, spreadsheets, or specs..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
            />
            <motion.button
              whileHover={{ y: -2, scale: 1.01 }}
              whileTap={{ y: 2, scale: 0.98 }}
              type="submit"
              disabled={isExecuting || !promptInput.trim()}
              className="clay-btn clay-btn-terracotta"
              style={{ padding: '12px 24px', fontSize: '0.9rem' }}
            >
              <Send size={15} />
              <span>
                {isExecuting
                  ? 'EXECUTING AGENTIC PIPELINE...'
                  : 'RUN AGENTIC RAG WORKFLOW'}
              </span>
            </motion.button>
          </div>
        </form>

        {/* Quick Preset Technical Prompts */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
            }}
          >
            BENCHMARK QUERIES:
          </span>
          {PRESET_QUERIES.map((pq, i) => (
            <button
              key={i}
              type="button"
              className="clay-btn"
              style={{
                padding: '5px 11px',
                fontSize: '0.73rem',
                fontWeight: 600,
              }}
              onClick={() => {
                setPromptInput(pq);
                onExecuteQuery(pq);
              }}
            >
              {pq.slice(0, 58)}...
            </button>
          ))}
        </div>
      </div>

      {latestQuery && (
        <>
          {/* Middle Row: Stage 1 Small LLM Prompt Reshaper Output + Stage 4/6 Grounded Cited Answer */}
          <div className="grid-2" style={{ gridTemplateColumns: '0.95fr 1.25fr' }}>
            {/* Left: Small LLM Prompt Reshaping & HyDE Inspector */}
            <div className="clay-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <span className="clay-tag clay-tag-sage">
                  <Cpu size={13} />
                  <span>SMALL LLM PROMPT RESHAPER & HYDE TRACE</span>
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span className="clay-tag">
                    INTENT: {latestQuery.promptReshape.detectedIntent}
                  </span>
                  <span className="clay-tag clay-tag-ochre">
                    CLARITY: {latestQuery.promptReshape.clarityScoreBefore}% -&gt;{' '}
                    {latestQuery.promptReshape.clarityScoreAfter}%
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 11,
                }}
              >
                {/* Original vs Reshaped Query */}
                <div className="clay-card-alt">
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--ink-muted)',
                      marginBottom: 3,
                    }}
                  >
                    RAW USER PROMPT
                  </div>
                  <div
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--ink-secondary)',
                      marginBottom: 8,
                    }}
                  >
                    &quot;{latestQuery.promptReshape.originalPrompt}&quot;
                  </div>

                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--clay-terracotta)',
                      marginBottom: 3,
                    }}
                  >
                    RESHAPED PRIMARY VECTOR QUERY
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {latestQuery.promptReshape.reshapedPrimaryQuery}
                  </div>
                </div>

                {/* Step-Back & Multi-Query Decomposition */}
                <div className="clay-card-alt">
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--clay-cobalt)',
                      marginBottom: 4,
                    }}
                  >
                    STEP-BACK ABSTRACTION & 3-WAY SUB-QUERY DECOMPOSITION
                  </div>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      marginBottom: 6,
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    Step-Back: {latestQuery.promptReshape.stepBackQuery}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {latestQuery.promptReshape.subQueries.map((sq, idx) => (
                      <div
                        key={idx}
                        className="font-mono"
                        style={{
                          fontSize: '0.73rem',
                          backgroundColor: 'var(--clay-well)',
                          padding: '5px 9px',
                          borderRadius: 9,
                        }}
                      >
                        Q{idx + 1}: {sq}
                      </div>
                    ))}
                  </div>
                </div>

                {/* HyDE Anchor Passage */}
                <div className="clay-card-alt">
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--clay-sage)',
                      marginBottom: 4,
                    }}
                  >
                    HYDE (HYPOTHETICAL DOCUMENT EMBEDDING) ANCHOR
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.74rem',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    {latestQuery.promptReshape.hydeDocument}
                  </div>
                </div>

                {/* Agent Reasoning Trace */}
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--ink-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  <span>{latestQuery.promptReshape.reasoningTrace}</span>
                  <span className="font-mono" style={{ fontWeight: 700 }}>
                    [{latestQuery.promptReshape.latencyMs} ms]
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Grounded Answer Synthesis & Inline Citations */}
            <div className="clay-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                <span className="clay-tag clay-tag-terracotta">
                  <ShieldCheck size={13} />
                  <span>GROUNDED ANSWER SYNTHESIS & CITATIONS</span>
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="clay-tag clay-tag-sage">
                    FAITHFULNESS:{' '}
                    {(
                      latestQuery.metrics.groundednessFaithfulness * 100
                    ).toFixed(1)}
                    %
                  </span>
                  <span className="clay-tag clay-tag-cobalt">
                    NDCG@K: {(latestQuery.metrics.ndcgAtK * 100).toFixed(1)}%
                  </span>
                  {onQuickSaveFinding && (
                    <button
                      type="button"
                      className={`clay-btn ${
                        savedNotice ? 'clay-btn-sage' : 'clay-btn-charcoal'
                      }`}
                      style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                      onClick={async () => {
                        await onQuickSaveFinding();
                        setSavedNotice(true);
                        setTimeout(() => setSavedNotice(false), 2200);
                      }}
                    >
                      {savedNotice
                        ? 'SAVED TO SQLITE VAULT'
                        : 'SAVE FINDING TO DB'}
                    </button>
                  )}
                </div>
              </div>

              {/* Synthesized Grounded Response Well */}
              <div
                className="clay-well"
                style={{
                  padding: '16px 18px',
                  marginBottom: 14,
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.88rem',
                  lineHeight: 1.62,
                  maxHeight: 330,
                  overflowY: 'auto',
                }}
              >
                {latestQuery.answer}
              </div>

              {/* Supporting Inline Citations Row */}
              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.71rem',
                    fontWeight: 700,
                    color: 'var(--ink-muted)',
                    marginBottom: 8,
                  }}
                >
                  VERIFIED SOURCE CITATIONS ({latestQuery.citations.length})
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                  }}
                >
                  {latestQuery.citations.slice(0, 4).map((cit) => (
                    <div
                      key={cit.chunkId}
                      className="clay-card-alt"
                      style={{ padding: '10px 12px' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          className="clay-tag clay-tag-terracotta"
                          style={{ fontSize: '0.65rem', padding: '2px 7px' }}
                        >
                          {cit.citationTag}
                        </span>
                        <span
                          className="font-mono"
                          style={{ fontSize: '0.7rem', fontWeight: 700 }}
                        >
                          {(cit.relevanceScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          marginBottom: 2,
                        }}
                      >
                        {cit.sectionPath}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        {cit.excerpt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Hybrid RRF + Cross-Encoder Reranking & CRAG Relevance Grader Matrix */}
          <div className="clay-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="clay-tag clay-tag-cobalt">
                  <Sliders size={13} />
                  <span>
                    HYBRID HNSW + BM25+ RETRIEVAL, CROSS-ENCODER RERANKING &
                    CRAG GATE
                  </span>
                </span>
                <span className="clay-tag">
                  RETAINED: {latestQuery.retrievedChunks.length} CHUNKS
                </span>
              </div>

              {latestQuery.prunedNoiseChunks.length > 0 && (
                <button
                  type="button"
                  className="clay-btn"
                  style={{ padding: '6px 12px', fontSize: '0.74rem' }}
                  onClick={() => setShowPrunedDrawer(!showPrunedDrawer)}
                >
                  <Filter size={13} />
                  <span>
                    {showPrunedDrawer ? 'HIDE' : 'INSPECT'} CRAG-PRUNED NOISE
                    CHUNKS ({latestQuery.prunedNoiseChunks.length})
                  </span>
                </button>
              )}
            </div>

            <div className="grid-3">
              {latestQuery.retrievedChunks.map((ch) => (
                <motion.div
                  key={ch.chunkId}
                  whileHover={{ y: -2 }}
                  className="clay-card-alt"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      <span className="clay-tag clay-tag-terracotta">
                        RANK #{ch.finalRank}{' '}
                        {ch.rankDelta > 0
                          ? `(PROMOTED +${ch.rankDelta})`
                          : ch.rankDelta < 0
                          ? `(${ch.rankDelta})`
                          : '(HELD)'}
                      </span>
                      <span
                        className={`clay-tag ${
                          ch.cragGrade === 'HIGHLY_RELEVANT'
                            ? 'clay-tag-sage'
                            : 'clay-tag-ochre'
                        }`}
                      >
                        {ch.cragGrade}
                      </span>
                    </div>

                    <div
                      className="font-display"
                      style={{
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        marginBottom: 3,
                      }}
                    >
                      {ch.sectionPath}
                    </div>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '0.69rem',
                        color: 'var(--ink-muted)',
                        marginBottom: 8,
                      }}
                    >
                      Strategy: {ch.strategy} | {ch.tokenCount} Tokens | Format:{' '}
                      {ch.documentFormat}
                    </div>

                    {/* 4 Score Decomposition Badges */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {[
                        {
                          label: 'DENSE',
                          val: `${(ch.denseScore * 100).toFixed(0)}%`,
                        },
                        {
                          label: 'BM25+',
                          val: `${(ch.sparseScore * 100).toFixed(0)}%`,
                        },
                        {
                          label: 'RRF',
                          val: `${(ch.rrfScore * 100).toFixed(0)}%`,
                        },
                        {
                          label: 'RERANK',
                          val: `${(ch.rerankScore * 100).toFixed(1)}%`,
                        },
                      ].map((s) => (
                        <div
                          key={s.label}
                          className="clay-well font-mono"
                          style={{
                            padding: '5px 4px',
                            textAlign: 'center',
                            borderRadius: 10,
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.62rem',
                              color: 'var(--ink-muted)',
                            }}
                          >
                            {s.label}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                            {s.val}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      className="clay-well font-mono"
                      style={{
                        padding: 10,
                        fontSize: '0.73rem',
                        maxHeight: 115,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {ch.content}
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    <strong>CRAG Audit:</strong> {ch.cragReasoning}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Expandable CRAG-Pruned Noise Chunks Drawer */}
            {showPrunedDrawer && latestQuery.prunedNoiseChunks.length > 0 && (
              <div
                className="clay-well"
                style={{ marginTop: 14, padding: 14 }}
              >
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    marginBottom: 10,
                    color: 'var(--clay-terracotta)',
                  }}
                >
                  CRAG-PRUNED LOW-RELEVANCE CANDIDATES (EXCLUDED FROM LLM
                  GENERATION CONTEXT)
                </div>
                <div className="grid-3">
                  {latestQuery.prunedNoiseChunks.map((p) => (
                    <div key={p.chunkId} className="clay-card-alt">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <span className="clay-tag">{p.cragGrade}</span>
                        <span className="font-mono" style={{ fontSize: '0.72rem' }}>
                          Score: {(p.rerankScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {p.sectionPath}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        {p.cragReasoning}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
