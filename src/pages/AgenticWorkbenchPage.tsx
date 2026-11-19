import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  Cpu,
  Sliders,
  ShieldCheck,
  Filter,
  Terminal,
  Bookmark,
} from 'lucide-react';
import { AgenticRagResponse, RagPipelineConfig } from '../types';
import { RichMarkdownRenderer } from '../components/RichMarkdownRenderer';

interface AgenticWorkbenchPageProps {
  latestQuery: AgenticRagResponse | null;
  config: RagPipelineConfig;
  isExecuting: boolean;
  onExecuteQuery: (prompt: string) => Promise<void>;
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
  onQuickSaveFinding: () => Promise<void>;
}

const PRESET_QUERIES = [
  'How does HNSW vector indexing combine with Reciprocal Rank Fusion (RRF) and MMR diversity control?',
  'Compare the 5 adaptive chunking strategies (Semantic, Hierarchical Parent-Child, Propositions, Structural AST, Sliding Window).',
  'How does the Small LLM Prompt Reshaper use HyDE, Multi-Query expansion, and CRAG noise pruning to prevent hallucinations?',
  'How does the Python OCR and document extraction pipeline clean scanned images, PDFs, DOCX, and XLSX tables?',
];

export const AgenticWorkbenchPage: React.FC<AgenticWorkbenchPageProps> = ({
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
  const [activeSubView, setActiveSubView] = useState<
    'answer' | 'reshaper' | 'reranker'
  >('answer');
  const [showPrunedDrawer, setShowPrunedDrawer] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isExecuting) return;
    await onExecuteQuery(promptInput.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Prompt Console Slab */}
      <div className="clay-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="clay-tag clay-tag-terracotta">
              <Terminal size={14} />
              <span>AGENTIC RAG QUERY CONSOLE</span>
            </span>
            <span className="clay-tag">
              SMALL LLM: {config.reshaperModel} (
              {config.reshaperProvider.toUpperCase()})
            </span>
          </div>

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
                style={{ padding: '6px 12px', fontSize: '0.73rem' }}
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
              gap: 14,
              marginBottom: 14,
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
              style={{ padding: '14px 28px', fontSize: '0.92rem' }}
            >
              <Send size={16} />
              <span>
                {isExecuting
                  ? 'EXECUTING AGENTIC WORKFLOW...'
                  : 'RUN AGENTIC RAG WORKFLOW'}
              </span>
            </motion.button>
          </div>
        </form>

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
              fontSize: '0.72rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
            }}
          >
            PRESET BENCHMARK QUERIES:
          </span>
          {PRESET_QUERIES.map((pq, i) => (
            <button
              key={i}
              type="button"
              className="clay-btn"
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
              onClick={() => {
                setPromptInput(pq);
                onExecuteQuery(pq);
              }}
            >
              {pq.slice(0, 56)}...
            </button>
          ))}
        </div>
      </div>

      {latestQuery && (
        <>
          {/* Clean 3-Stage Sub-View Selector Bar */}
          <div
            className="clay-card"
            style={{
              padding: '12px 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveSubView('answer')}
              className={`clay-btn ${
                activeSubView === 'answer' ? 'clay-btn-terracotta' : ''
              }`}
              style={{ padding: '12px 16px' }}
            >
              <ShieldCheck size={16} />
              <span>
                1. GROUNDED ANSWER &amp; CITATIONS (
                {latestQuery.citations.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('reshaper')}
              className={`clay-btn ${
                activeSubView === 'reshaper' ? 'clay-btn-terracotta' : ''
              }`}
              style={{ padding: '12px 16px' }}
            >
              <Cpu size={16} />
              <span>
                2. SMALL LLM PROMPT RESHAPER &amp; HYDE (+
                {latestQuery.metrics.promptReshapingLiftPct}% LIFT)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubView('reranker')}
              className={`clay-btn ${
                activeSubView === 'reranker' ? 'clay-btn-terracotta' : ''
              }`}
              style={{ padding: '12px 16px' }}
            >
              <Sliders size={16} />
              <span>
                3. HYBRID RRF + CROSS-ENCODER RERANK &amp; CRAG (
                {latestQuery.retrievedChunks.length} CHUNKS)
              </span>
            </button>
          </div>

          {/* SUB-VIEW 1: Spacious Grounded Answer Synthesis & Verified Source Citations */}
          {activeSubView === 'answer' && (
            <div className="clay-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="clay-tag clay-tag-terracotta">
                    <ShieldCheck size={14} />
                    <span>GROUNDED TECHNICAL SYNTHESIS</span>
                  </span>
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
                </div>

                <button
                  type="button"
                  className={`clay-btn ${
                    savedNotice ? 'clay-btn-sage' : 'clay-btn-charcoal'
                  }`}
                  style={{ padding: '8px 16px', fontSize: '0.78rem' }}
                  onClick={async () => {
                    await onQuickSaveFinding();
                    setSavedNotice(true);
                    setTimeout(() => setSavedNotice(false), 2400);
                  }}
                >
                  <Bookmark size={14} />
                  <span>
                    {savedNotice
                      ? 'COMMITTED TO SQLITE VAULT & .MD'
                      : 'SAVE FINDING TO SQLITE VAULT'}
                  </span>
                </button>
              </div>

              <div
                className="clay-well"
                style={{
                  padding: '24px 28px',
                  marginBottom: 22,
                }}
              >
                <RichMarkdownRenderer content={latestQuery.answer} />
              </div>

              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: 'var(--ink-muted)',
                    marginBottom: 12,
                  }}
                >
                  SUPPORTING INLINE SOURCE CITATIONS ({latestQuery.citations.length})
                </div>
                <div className="grid-2">
                  {latestQuery.citations.map((cit) => (
                    <div key={cit.chunkId} className="clay-card-alt">
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <span className="clay-tag clay-tag-terracotta">
                          {cit.citationTag}
                        </span>
                        <span className="clay-tag clay-tag-sage">
                          RERANK SCORE: {(cit.relevanceScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className="font-display"
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          marginBottom: 6,
                        }}
                      >
                        {cit.sectionPath}
                      </div>
                      <div
                        style={{
                          fontSize: '0.82rem',
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
          )}

          {/* SUB-VIEW 2: Focused Small LLM Prompt Reshaper & HyDE Transformation Diff */}
          {activeSubView === 'reshaper' && (
            <div className="clay-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <span className="clay-tag clay-tag-sage">
                  <Cpu size={14} />
                  <span>SMALL LLM PROMPT RESHAPER &amp; HYDE TRACE</span>
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="clay-tag">
                    INTENT: {latestQuery.promptReshape.detectedIntent}
                  </span>
                  <span className="clay-tag clay-tag-ochre">
                    CLARITY LIFT: {latestQuery.promptReshape.clarityScoreBefore}%
                    -&gt; {latestQuery.promptReshape.clarityScoreAfter}%
                  </span>
                  <span className="clay-tag">
                    LATENCY: {latestQuery.promptReshape.latencyMs} MS
                  </span>
                </div>
              </div>

              <div className="grid-2" style={{ marginBottom: 20 }}>
                <div className="clay-card-alt">
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--ink-muted)',
                      marginBottom: 6,
                    }}
                  >
                    BEFORE // RAW USER PROMPT
                  </div>
                  <div
                    style={{
                      fontSize: '0.96rem',
                      color: 'var(--ink-secondary)',
                      marginBottom: 14,
                    }}
                  >
                    &quot;{latestQuery.promptReshape.originalPrompt}&quot;
                  </div>

                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--clay-terracotta)',
                      marginBottom: 6,
                    }}
                  >
                    AFTER // RESHAPED PRIMARY VECTOR QUERY
                  </div>
                  <div
                    className="clay-well font-mono"
                    style={{ fontSize: '0.86rem', fontWeight: 600 }}
                  >
                    {latestQuery.promptReshape.reshapedPrimaryQuery}
                  </div>
                </div>

                <div className="clay-card-alt">
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: 'var(--clay-sage)',
                      marginBottom: 6,
                    }}
                  >
                    HYDE (HYPOTHETICAL DOCUMENT EMBEDDING) ANCHOR PASSAGE
                  </div>
                  <div
                    className="clay-well font-mono"
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--ink-primary)',
                      marginBottom: 14,
                    }}
                  >
                    {latestQuery.promptReshape.hydeDocument}
                  </div>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    <strong>Agent Reasoning:</strong>{' '}
                    {latestQuery.promptReshape.reasoningTrace}
                  </div>
                </div>
              </div>

              <div className="clay-card-alt">
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'var(--clay-cobalt)',
                    marginBottom: 8,
                  }}
                >
                  STEP-BACK ABSTRACTION &amp; 3-WAY ORTHOGONAL SUB-QUERIES
                </div>
                <div
                  style={{
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    marginBottom: 12,
                  }}
                >
                  Step-Back Query: {latestQuery.promptReshape.stepBackQuery}
                </div>
                <div className="grid-3">
                  {latestQuery.promptReshape.subQueries.map((sq, idx) => (
                    <div
                      key={idx}
                      className="clay-well font-mono"
                      style={{ fontSize: '0.79rem' }}
                    >
                      <strong>SUB-QUERY #{idx + 1}</strong>
                      <div style={{ marginTop: 4 }}>{sq}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUB-VIEW 3: Focused Hybrid RRF + Cross-Encoder Reranking & CRAG Relevance Gate */}
          {activeSubView === 'reranker' && (
            <div className="clay-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="clay-tag clay-tag-cobalt">
                    <Sliders size={14} />
                    <span>
                      HYBRID HNSW + BM25+ RETRIEVAL, CROSS-ENCODER RERANKING
                      &amp; CRAG GATE
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
                    style={{ padding: '7px 14px', fontSize: '0.76rem' }}
                    onClick={() => setShowPrunedDrawer(!showPrunedDrawer)}
                  >
                    <Filter size={14} />
                    <span>
                      {showPrunedDrawer ? 'HIDE' : 'SHOW'} CRAG-PRUNED NOISE
                      CHUNKS ({latestQuery.prunedNoiseChunks.length})
                    </span>
                  </button>
                )}
              </div>

              <div className="grid-2">
                {latestQuery.retrievedChunks.map((ch) => (
                  <div
                    key={ch.chunkId}
                    className="clay-card-alt"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 8,
                          marginBottom: 10,
                        }}
                      >
                        <span className="clay-tag clay-tag-terracotta">
                          RANK #{ch.finalRank}{' '}
                          {ch.rankDelta > 0
                            ? `(PROMOTED +${ch.rankDelta} FROM #${ch.initialRank})`
                            : ch.rankDelta < 0
                            ? `(${ch.rankDelta})`
                            : '(HELD RANK)'}
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

                      <h3
                        className="font-display"
                        style={{
                          fontSize: '0.98rem',
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        {ch.sectionPath}
                      </h3>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.73rem',
                          color: 'var(--ink-muted)',
                          marginBottom: 10,
                        }}
                      >
                        Strategy: {ch.strategy} • {ch.tokenCount} Tokens •
                        Format: {ch.documentFormat}
                      </div>

                      <div
                        className="grid-4"
                        style={{ gap: 8, marginBottom: 10 }}
                      >
                        {[
                          {
                            label: 'DENSE HNSW',
                            val: `${(ch.denseScore * 100).toFixed(0)}%`,
                          },
                          {
                            label: 'BM25+ SPARSE',
                            val: `${(ch.sparseScore * 100).toFixed(0)}%`,
                          },
                          {
                            label: 'RRF FUSION',
                            val: `${(ch.rrfScore * 100).toFixed(0)}%`,
                          },
                          {
                            label: 'RERANKER',
                            val: `${(ch.rerankScore * 100).toFixed(1)}%`,
                          },
                        ].map((s) => (
                          <div
                            key={s.label}
                            className="clay-well font-mono"
                            style={{
                              padding: '7px 6px',
                              textAlign: 'center',
                              borderRadius: 12,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.64rem',
                                color: 'var(--ink-muted)',
                              }}
                            >
                              {s.label}
                            </div>
                            <div
                              style={{ fontSize: '0.82rem', fontWeight: 700 }}
                            >
                              {s.val}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div
                        className="clay-well font-mono"
                        style={{
                          padding: 12,
                          fontSize: '0.78rem',
                          maxHeight: 140,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {ch.content}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--ink-secondary)',
                      }}
                    >
                      <strong>CRAG Gate Audit:</strong> {ch.cragReasoning}
                    </div>
                  </div>
                ))}
              </div>

              {showPrunedDrawer && latestQuery.prunedNoiseChunks.length > 0 && (
                <div
                  className="clay-well"
                  style={{ marginTop: 18, padding: 18 }}
                >
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      marginBottom: 12,
                      color: 'var(--clay-terracotta)',
                    }}
                  >
                    CRAG-PRUNED LOW-RELEVANCE CANDIDATES (EXCLUDED FROM LLM
                    CONTEXT)
                  </div>
                  <div className="grid-3">
                    {latestQuery.prunedNoiseChunks.map((p) => (
                      <div key={p.chunkId} className="clay-card-alt">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 6,
                          }}
                        >
                          <span className="clay-tag">{p.cragGrade}</span>
                          <span
                            className="font-mono"
                            style={{ fontSize: '0.74rem' }}
                          >
                            Score: {(p.rerankScore * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            marginBottom: 4,
                          }}
                        >
                          {p.sectionPath}
                        </div>
                        <div
                          style={{
                            fontSize: '0.76rem',
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
          )}
        </>
      )}
    </div>
  );
};
