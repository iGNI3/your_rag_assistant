import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import anime from 'animejs';
import {
  BarChart2,
  ShieldCheck,
  Clock,
  TrendingUp,
  Layers,
  Award,
} from 'lucide-react';
import { AgenticRagResponse } from '../types';

interface MetricsAndEvaluationSuiteProps {
  latestQuery: AgenticRagResponse | null;
  queryHistory: AgenticRagResponse[];
  onSelectHistoryQuery: (q: AgenticRagResponse) => void;
}

export const MetricsAndEvaluationSuite: React.FC<
  MetricsAndEvaluationSuiteProps
> = ({ latestQuery, queryHistory, onSelectHistoryQuery }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !latestQuery) return;
    anime({
      targets: containerRef.current.querySelectorAll('.anime-metric-bar'),
      scaleX: [0, 1],
      duration: 720,
      delay: anime.stagger(40),
      easing: 'easeOutElastic(1, .75)',
    });
  }, [latestQuery?.queryId]);

  if (!latestQuery) {
    return (
      <div className="clay-card">
        Execute an agentic query to populate comprehensive RAG evaluation metrics.
      </div>
    );
  }

  const m = latestQuery.metrics;
  const lat = m.latencyBreakdown;

  const triadItems = [
    {
      label: 'OVERALL OPTIMIZATION INDEX',
      value: `${m.overallOptimizationIndex}%`,
      pct: m.overallOptimizationIndex,
      subtitle: 'Composite RAGAS + Retrieval + Chunking Harmony',
      color: '#C4684B',
    },
    {
      label: 'CONTEXT RELEVANCE',
      value: `${(m.contextRelevance * 100).toFixed(1)}%`,
      pct: m.contextRelevance * 100,
      subtitle: 'Signal-to-noise concentration of CRAG-verified chunks',
      color: '#527965',
    },
    {
      label: 'GROUNDEDNESS / FAITHFULNESS',
      value: `${(m.groundednessFaithfulness * 100).toFixed(1)}%`,
      pct: m.groundednessFaithfulness * 100,
      subtitle: `Self-RAG Claim Verification (Hallucination Risk: ${m.hallucinationRiskPct}%)`,
      color: '#4B657E',
    },
    {
      label: 'ANSWER RELEVANCE & LIFT',
      value: `${(m.answerRelevance * 100).toFixed(1)}%`,
      pct: m.answerRelevance * 100,
      subtitle: `Small LLM Prompt Reshaping Lift: +${m.promptReshapingLiftPct}%`,
      color: '#C2883B',
    },
  ];

  const retrievalMetrics = [
    {
      label: 'Context Precision@K',
      val: `${(m.contextPrecisionAtK * 100).toFixed(1)}%`,
      pct: m.contextPrecisionAtK * 100,
      color: '#527965',
    },
    {
      label: 'Context Recall@K',
      val: `${(m.contextRecallAtK * 100).toFixed(1)}%`,
      pct: m.contextRecallAtK * 100,
      color: '#527965',
    },
    {
      label: 'NDCG@K Ranking Quality',
      val: `${(m.ndcgAtK * 100).toFixed(1)}%`,
      pct: m.ndcgAtK * 100,
      color: '#C4684B',
    },
    {
      label: 'Mean Reciprocal Rank (MRR)',
      val: `${(m.mrr * 100).toFixed(1)}%`,
      pct: m.mrr * 100,
      color: '#C4684B',
    },
    {
      label: 'MMR Diversity Score',
      val: `${(m.mmrDiversityScore * 100).toFixed(1)}%`,
      pct: m.mmrDiversityScore * 100,
      color: '#4B657E',
    },
    {
      label: 'Cross-Encoder Promotion Gain',
      val: `${(m.rerankerPromotionGain * 100).toFixed(1)}%`,
      pct: m.rerankerPromotionGain * 100,
      color: '#C2883B',
    },
    {
      label: 'Chunk Semantic Coherence',
      val: `${m.avgChunkCoherence}%`,
      pct: m.avgChunkCoherence,
      color: '#527965',
    },
    {
      label: 'Chunk Boundary Sharpness',
      val: `${m.boundarySharpness}%`,
      pct: m.boundarySharpness,
      color: '#4B657E',
    },
  ];

  const latencyStages = [
    {
      label: '01. Small LLM Prompt Reshape & HyDE',
      ms: lat.promptReshapingMs,
      color: '#527965',
    },
    {
      label: '02. 128-Dim Semantic Vector Embedding',
      ms: lat.embeddingMs,
      color: '#4B657E',
    },
    {
      label: '03. HNSW 3-Layer Dense Graph Traversal',
      ms: lat.hnswDenseSearchMs,
      color: '#4B657E',
    },
    {
      label: '04. BM25+ Lexical Sparse IDF Retrieval',
      ms: lat.bm25SparseSearchMs,
      color: '#C2883B',
    },
    {
      label: '05. Reciprocal Rank Fusion (RRF) + MMR',
      ms: lat.rrfAndMmrMs,
      color: '#C4684B',
    },
    {
      label: '06. Cross-Encoder Reranking & CRAG Gate',
      ms: lat.crossEncoderRerankMs,
      color: '#C4684B',
    },
    {
      label: '07. Grounded Cited Answer Synthesis',
      ms: lat.answerGenerationMs,
      color: '#527965',
    },
    {
      label: '08. Self-RAG Claim-to-Source Audit',
      ms: lat.selfRagVerificationMs,
      color: '#78566C',
    },
  ];

  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: 22 }}
    >
      {/* Top Row: 4 RAG Triad & Optimization Index Cards */}
      <div className="grid-4">
        {triadItems.map((item) => (
          <motion.div
            key={item.label}
            whileHover={{ y: -3 }}
            className="clay-card"
            style={{ padding: '18px 20px' }}
          >
            <div
              className="font-mono"
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
              }}
            >
              {item.label}
            </div>
            <div
              className="font-display"
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: item.color,
                margin: '4px 0 8px',
              }}
            >
              {item.value}
            </div>
            <div className="clay-meter-track" style={{ marginBottom: 8 }}>
              <div
                className="clay-meter-fill anime-metric-bar"
                style={{
                  width: `${Math.min(100, item.pct)}%`,
                  backgroundColor: item.color,
                  transformOrigin: 'left center',
                }}
              />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
              {item.subtitle}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Middle Row: Retrieval & Chunking Precision Matrix + Latency Waterfall */}
      <div className="grid-2">
        {/* Left: Retrieval, Reranking & Chunking Metrics */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <span className="clay-tag clay-tag-terracotta">
              <BarChart2 size={13} />
              <span>RETRIEVAL, RERANKING & CHUNKING METRICS</span>
            </span>
            <span className="clay-tag clay-tag-sage">
              RRF HYBRID LIFT: +{m.rrfHybridLiftPct}%
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 14,
            }}
          >
            {retrievalMetrics.map((rm) => (
              <div key={rm.label} className="clay-card-alt">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.79rem',
                      fontWeight: 700,
                      color: 'var(--ink-primary)',
                    }}
                  >
                    {rm.label}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      color: rm.color,
                    }}
                  >
                    {rm.val}
                  </span>
                </div>
                <div className="clay-meter-track">
                  <div
                    className="clay-meter-fill anime-metric-bar"
                    style={{
                      width: `${Math.min(100, rm.pct)}%`,
                      backgroundColor: rm.color,
                      transformOrigin: 'left center',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Prompt Reshaping Clarity Before/After Box */}
          <div
            className="clay-card-alt"
            style={{
              marginTop: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <div
                className="font-display"
                style={{ fontSize: '0.88rem', fontWeight: 700 }}
              >
                SMALL LLM PROMPT RESHAPING CLARITY GAIN
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
                Raw Prompt Clarity:{' '}
                <strong>{latestQuery.promptReshape.clarityScoreBefore}%</strong>{' '}
                -&gt; Reshaped Pack Clarity:{' '}
                <strong>{latestQuery.promptReshape.clarityScoreAfter}%</strong>
              </div>
            </div>
            <span className="clay-tag clay-tag-ochre">
              <TrendingUp size={12} />
              <span>+{m.promptReshapingLiftPct}% RETRIEVAL LIFT</span>
            </span>
          </div>
        </div>

        {/* Right: Stage-by-Stage Latency Waterfall */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <span className="clay-tag clay-tag-cobalt">
              <Clock size={13} />
              <span>STAGE-BY-STAGE TELEMETRY WATERFALL</span>
            </span>
            <span className="clay-tag">TOTAL: {lat.totalMs} MS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {latencyStages.map((st) => {
              const pct = Math.max(
                8,
                Math.min(100, Math.round((st.ms / Math.max(1, lat.totalMs)) * 160))
              );
              return (
                <div key={st.label}>
                  <div
                    className="font-mono"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    <span>{st.label}</span>
                    <span>{st.ms} ms</span>
                  </div>
                  <div className="clay-meter-track">
                    <div
                      className="clay-meter-fill anime-metric-bar"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: st.color,
                        transformOrigin: 'left center',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row: Self-RAG Claim-by-Claim Verification Matrix & Query Run History */}
      <div className="grid-2" style={{ gridTemplateColumns: '1.35fr 0.85fr' }}>
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span className="clay-tag clay-tag-sage">
              <ShieldCheck size={13} />
              <span>SELF-RAG CLAIM-TO-SOURCE VERIFICATION AUDIT</span>
            </span>
            <span className="clay-tag">
              {latestQuery.claimVerifications.length} CLAIMS VERIFIED
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {latestQuery.claimVerifications.map((cv, idx) => (
              <div key={idx} className="clay-card-alt">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <span
                    className={`clay-tag ${
                      cv.status === 'SUPPORTED'
                        ? 'clay-tag-sage'
                        : 'clay-tag-ochre'
                    }`}
                  >
                    {cv.status} // {(cv.confidence * 100).toFixed(1)}% CONFIDENCE
                  </span>
                  <span className="clay-tag">
                    SOURCE: {cv.supportingDocumentTitle?.slice(0, 28)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  {cv.claim}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.73rem',
                    color: 'var(--ink-secondary)',
                  }}
                >
                  Evidence Excerpt: &quot;{cv.evidenceSnippet}&quot;
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Query Evaluation History */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span className="clay-tag clay-tag-ochre">
              <Award size={13} />
              <span>BENCHMARK RUN HISTORY ({queryHistory.length})</span>
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 380,
              overflowY: 'auto',
            }}
          >
            {queryHistory.map((item) => {
              const isCurrent = item.queryId === latestQuery.queryId;
              return (
                <div
                  key={item.queryId}
                  onClick={() => onSelectHistoryQuery(item)}
                  className="clay-card-alt"
                  style={{
                    cursor: 'pointer',
                    borderColor: isCurrent
                      ? 'var(--clay-terracotta)'
                      : 'var(--clay-border-light)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 4,
                    }}
                  >
                    <span className="clay-tag clay-tag-terracotta">
                      INDEX: {item.metrics.overallOptimizationIndex}%
                    </span>
                    <span className="clay-tag">
                      {item.metrics.latencyBreakdown.totalMs} MS
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      marginBottom: 3,
                    }}
                  >
                    {item.promptReshape.originalPrompt}
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--ink-secondary)',
                    }}
                  >
                    NDCG@K: {(item.metrics.ndcgAtK * 100).toFixed(1)}% |
                    Grounded:{' '}
                    {(item.metrics.groundednessFaithfulness * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
