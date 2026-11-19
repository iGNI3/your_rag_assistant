import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import {
  FileText,
  Scissors,
  Database,
  Cpu,
  Sliders,
  ShieldCheck,
  Play,
  Activity,
} from 'lucide-react';
import { AgenticRagResponse, VectorDbStats } from '../types';

interface PipelineChoreographerProps {
  latestQuery: AgenticRagResponse | null;
  stats: VectorDbStats | null;
  isExecuting: boolean;
  activeStageIndex: number;
  onSelectWorkspaceTab: (tab: 'query' | 'ingest' | 'vectordb' | 'models' | 'metrics') => void;
}

interface StageNodeDef {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  colorVar: string;
  tagClass: string;
  targetTab: 'query' | 'ingest' | 'vectordb' | 'models' | 'metrics';
  icon: React.ComponentType<{ size?: number | string }>;
}

const PIPELINE_STAGES: StageNodeDef[] = [
  {
    id: 'stage-ingest',
    code: 'STAGE 01',
    title: 'INGEST & OCR',
    subtitle: 'PDF / DOCX / XLSX / Image OCR',
    metricLabel: 'CLEANING + OCR',
    colorVar: '#C4684B',
    tagClass: 'clay-tag-terracotta',
    targetTab: 'ingest',
    icon: FileText,
  },
  {
    id: 'stage-chunk',
    code: 'STAGE 02',
    title: 'CHUNK OPTIMIZER',
    subtitle: '5-Strategy Auto-Benchmark',
    metricLabel: 'COHERENCE 95%',
    colorVar: '#C2883B',
    tagClass: 'clay-tag-ochre',
    targetTab: 'ingest',
    icon: Scissors,
  },
  {
    id: 'stage-vectordb',
    code: 'STAGE 03',
    title: 'HNSW + BM25 DB',
    subtitle: '128-Dim Dense + Sparse IDF',
    metricLabel: '3-LAYER HNSW',
    colorVar: '#4B657E',
    tagClass: 'clay-tag-cobalt',
    targetTab: 'vectordb',
    icon: Database,
  },
  {
    id: 'stage-reshaper',
    code: 'STAGE 04',
    title: 'SMALL LLM RESHAPE',
    subtitle: 'Multi-Query + Step-Back + HyDE',
    metricLabel: 'PROMPT LIFT',
    colorVar: '#527965',
    tagClass: 'clay-tag-sage',
    targetTab: 'models',
    icon: Cpu,
  },
  {
    id: 'stage-rerank',
    code: 'STAGE 05',
    title: 'RRF + CRAG RERANK',
    subtitle: 'Cross-Encoder + Noise Gate',
    metricLabel: 'NDCG@K +19%',
    colorVar: '#C4684B',
    tagClass: 'clay-tag-terracotta',
    targetTab: 'query',
    icon: Sliders,
  },
  {
    id: 'stage-verify',
    code: 'STAGE 06',
    title: 'SELF-RAG SYNTHESIS',
    subtitle: 'Cited Answer + Claim Audit',
    metricLabel: 'GROUNDED 96%',
    colorVar: '#527965',
    tagClass: 'clay-tag-sage',
    targetTab: 'metrics',
    icon: ShieldCheck,
  },
];

export const PipelineChoreographer: React.FC<PipelineChoreographerProps> = ({
  latestQuery,
  stats,
  isExecuting,
  activeStageIndex,
  onSelectWorkspaceTab,
}) => {
  const stageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const packetRefs = useRef<Array<SVGRectElement | null>>([]);
  const [pulseCount, setPulseCount] = useState(0);

  const latencies = latestQuery?.metrics.latencyBreakdown;
  const stageTimingLabels = [
    stats ? `${stats.totalDocuments} DOCS` : 'READY',
    stats ? `${stats.totalChunks} CHUNKS` : 'AUTO',
    latencies ? `${latencies.hnswDenseSearchMs + latencies.bm25SparseSearchMs} ms` : 'HNSW',
    latencies ? `${latencies.promptReshapingMs} ms` : 'HYDE',
    latencies ? `${latencies.rrfAndMmrMs + latencies.crossEncoderRerankMs} ms` : 'CRAG',
    latencies ? `${latencies.answerGenerationMs + latencies.selfRagVerificationMs} ms` : 'VERIFIED',
  ];

  // GSAP Sequential Pipeline Choreography when query runs or user triggers pulse
  useEffect(() => {
    const validNodes = stageRefs.current.filter(Boolean) as HTMLDivElement[];
    const validPackets = packetRefs.current.filter(Boolean) as SVGRectElement[];
    if (validNodes.length === 0) return;

    const tl = gsap.timeline();

    // Reset packets
    gsap.set(validPackets, { attr: { x: 4 }, opacity: 0 });

    validNodes.forEach((node, idx) => {
      tl.to(
        node,
        {
          y: -5,
          scale: 1.025,
          duration: 0.16,
          ease: 'back.out(2.2)',
        },
        idx * 0.14
      ).to(
        node,
        {
          y: 0,
          scale: 1,
          duration: 0.22,
          ease: 'power2.out',
        },
        idx * 0.14 + 0.16
      );

      if (idx < validPackets.length && validPackets[idx]) {
        tl.fromTo(
          validPackets[idx],
          { attr: { x: 4 }, opacity: 1 },
          {
            attr: { x: 42 },
            opacity: 0,
            duration: 0.24,
            ease: 'power1.inOut',
          },
          idx * 0.14 + 0.06
        );
      }
    });

    return () => {
      tl.kill();
    };
  }, [latestQuery?.queryId, pulseCount, isExecuting]);

  return (
    <div className="clay-card" style={{ marginBottom: 22, padding: '18px 22px' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="clay-tag clay-tag-charcoal"
            style={{
              backgroundColor: 'var(--clay-charcoal)',
              color: 'var(--ink-on-accent)',
              padding: '6px 12px',
            }}
          >
            <Activity size={14} />
            <span>GSAP PIPELINE DAG CHOREOGRAPHER</span>
          </div>
          <span
            style={{
              fontSize: '0.84rem',
              fontWeight: 600,
              color: 'var(--ink-secondary)',
            }}
          >
            Click any physical stage block to inspect or tune its engine parameters
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {latencies && (
            <span className="clay-tag">
              END-TO-END LATENCY: {latencies.totalMs} MS
            </span>
          )}
          <motion.button
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ y: 2, scale: 0.98 }}
            type="button"
            className="clay-btn"
            style={{ padding: '7px 14px', fontSize: '0.78rem' }}
            onClick={() => setPulseCount((c) => c + 1)}
          >
            <Play size={13} />
            <span>PULSE PIPELINE DAG</span>
          </motion.button>
        </div>
      </div>

      {/* 6-Stage Claymorphic DAG Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        {PIPELINE_STAGES.map((stage, idx) => {
          const IconComponent = stage.icon;
          const isHighlighted = isExecuting && activeStageIndex === idx;

          return (
            <div
              key={stage.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                position: 'relative',
              }}
            >
              <motion.div
                ref={(el) => {
                  stageRefs.current[idx] = el;
                }}
                whileHover={{ y: -3, scale: 1.015 }}
                whileTap={{ y: 2, scale: 0.985 }}
                transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                onClick={() => onSelectWorkspaceTab(stage.targetTab)}
                className="clay-card-alt"
                style={{
                  width: '100%',
                  cursor: 'pointer',
                  padding: '13px 14px',
                  borderColor: isHighlighted
                    ? stage.colorVar
                    : 'var(--clay-border-light)',
                  backgroundColor: isHighlighted
                    ? 'var(--clay-surface)'
                    : 'var(--clay-surface-alt)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--ink-muted)',
                    }}
                  >
                    {stage.code}
                  </span>
                  <span
                    className={`clay-tag ${stage.tagClass}`}
                    style={{ padding: '2px 8px', fontSize: '0.66rem' }}
                  >
                    {stageTimingLabels[idx]}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    marginBottom: 5,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 11,
                      backgroundColor: stage.colorVar,
                      color: '#FAF6F0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow:
                        'inset 2px 2px 4px rgba(255,255,255,0.45), inset -2px -2px 4px rgba(0,0,0,0.35)',
                    }}
                  >
                    <IconComponent size={16} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="font-display"
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: 'var(--ink-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {stage.title}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--ink-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {stage.subtitle}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* GSAP Animated Conduit Packet between stages */}
              {idx < PIPELINE_STAGES.length - 1 && (
                <svg
                  width="18"
                  height="24"
                  viewBox="0 0 56 24"
                  style={{
                    position: 'absolute',
                    right: -15,
                    zIndex: 4,
                    pointerEvents: 'none',
                  }}
                >
                  <rect
                    x="2"
                    y="9"
                    width="52"
                    height="6"
                    rx="3"
                    fill="#D5CABB"
                  />
                  <rect
                    ref={(el) => {
                      packetRefs.current[idx] = el;
                    }}
                    x="4"
                    y="7"
                    width="14"
                    height="10"
                    rx="5"
                    fill={stage.colorVar}
                    opacity="0"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
