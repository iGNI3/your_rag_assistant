import React, { useEffect, useRef, useState } from 'react';
import anime from 'animejs';
import {
  Scissors,
  Sliders,
  Layers,
  Hash,
  FileText,
} from 'lucide-react';
import {
  ChunkStrategyType,
  DocumentChunk,
  IngestedDocument,
  RagPipelineConfig,
} from '../types';

interface ChunkOptimizerPageProps {
  documents: IngestedDocument[];
  chunks: Array<Omit<DocumentChunk, 'embedding' | 'sparseTerms'>>;
  config: RagPipelineConfig;
  initialSelectedDocId?: string;
  onRechunkDocument: (
    docId: string,
    strategy: ChunkStrategyType,
    targetTokens: number,
    overlapTokens: number
  ) => Promise<void>;
  isBusy: boolean;
}

export const ChunkOptimizerPage: React.FC<ChunkOptimizerPageProps> = ({
  documents,
  chunks,
  config,
  initialSelectedDocId,
  onRechunkDocument,
  isBusy,
}) => {
  const benchmarkRef = useRef<HTMLDivElement | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string>(
    initialSelectedDocId || documents[0]?.id || ''
  );
  const [viewMode, setViewMode] = useState<'benchmarks' | 'slices'>(
    'benchmarks'
  );
  const [targetTokens, setTargetTokens] = useState<number>(
    config.targetChunkTokens
  );
  const [overlapTokens, setOverlapTokens] = useState<number>(
    config.chunkOverlapTokens
  );

  useEffect(() => {
    if (
      initialSelectedDocId &&
      documents.some((d) => d.id === initialSelectedDocId)
    ) {
      setSelectedDocId(initialSelectedDocId);
    } else if (
      !documents.some((d) => d.id === selectedDocId) &&
      documents.length > 0
    ) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, initialSelectedDocId, selectedDocId]);

  const activeDoc =
    documents.find((d) => d.id === selectedDocId) || documents[0] || null;
  const activeDocChunks = chunks.filter((c) => c.documentId === activeDoc?.id);

  useEffect(() => {
    if (!benchmarkRef.current || viewMode !== 'benchmarks') return;
    anime({
      targets: benchmarkRef.current.querySelectorAll('.anime-bench-bar'),
      scaleX: [0, 1],
      duration: 640,
      delay: anime.stagger(50),
      easing: 'easeOutExpo',
    });
  }, [activeDoc?.id, activeDoc?.selectedStrategy, viewMode]);

  if (!activeDoc) {
    return (
      <div className="clay-card">
        No documents available. Ingest a document on Page 02 first.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Top Control Slab: Document Selector + Token Window Sliders + View Toggle */}
      <div className="clay-card">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.7fr 0.7fr auto',
            gap: 20,
            alignItems: 'end',
          }}
        >
          <div>
            <label
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'block',
                marginBottom: 6,
              }}
            >
              SELECT DOCUMENT TO BENCHMARK OR RE-CHUNK
            </label>
            <select
              className="clay-select"
              value={activeDoc.id}
              onChange={(e) => setSelectedDocId(e.target.value)}
            >
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  [{doc.format}] {doc.title} ({doc.chunkCount} chunks //{' '}
                  {doc.selectedStrategy})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'block',
                marginBottom: 6,
              }}
            >
              TARGET CHUNK SIZE ({targetTokens} TOKENS)
            </label>
            <input
              type="range"
              className="clay-slider"
              min={80}
              max={320}
              step={10}
              value={targetTokens}
              onChange={(e) => setTargetTokens(Number(e.target.value))}
            />
          </div>

          <div>
            <label
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'block',
                marginBottom: 6,
              }}
            >
              OVERLAP WINDOW ({overlapTokens} TOKENS)
            </label>
            <input
              type="range"
              className="clay-slider"
              min={10}
              max={80}
              step={5}
              value={overlapTokens}
              onChange={(e) => setOverlapTokens(Number(e.target.value))}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className={`clay-btn ${
                viewMode === 'benchmarks' ? 'clay-btn-terracotta' : ''
              }`}
              onClick={() => setViewMode('benchmarks')}
            >
              <Sliders size={15} />
              <span>5-STRATEGY MATRIX</span>
            </button>
            <button
              type="button"
              className={`clay-btn ${
                viewMode === 'slices' ? 'clay-btn-terracotta' : ''
              }`}
              onClick={() => setViewMode('slices')}
            >
              <Layers size={15} />
              <span>CHUNK SLICES ({activeDocChunks.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Focused Sub-View 1: 5-Strategy Chunking Benchmark Comparator */}
      {viewMode === 'benchmarks' ? (
        <div ref={benchmarkRef} className="clay-card">
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
            <div>
              <span className="clay-tag clay-tag-ochre">
                <Scissors size={14} />
                <span>5-STRATEGY CHUNKING BENCHMARK COMPARATOR</span>
              </span>
              <h2
                className="font-display"
                style={{ fontSize: '1.32rem', marginTop: 8 }}
              >
                {activeDoc.title}
              </h2>
            </div>

            <span className="clay-tag clay-tag-sage">
              ACTIVE INDEXED STRATEGY:{' '}
              {activeDoc.selectedStrategy.toUpperCase()} ({activeDoc.chunkCount}{' '}
              CHUNKS)
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeDoc.strategyBenchmarks.map((bench) => {
              const isCurrent = activeDoc.selectedStrategy === bench.strategy;
              return (
                <div
                  key={bench.strategy}
                  className="clay-card-alt"
                  style={{
                    borderColor: isCurrent
                      ? 'var(--clay-sage)'
                      : 'var(--clay-border-light)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        className="font-display"
                        style={{ fontSize: '1.04rem', fontWeight: 700 }}
                      >
                        {bench.label}
                      </span>
                      {bench.recommended && (
                        <span className="clay-tag clay-tag-terracotta">
                          OPTIMIZER WINNER ({bench.compositeScore}%)
                        </span>
                      )}
                      {isCurrent && (
                        <span className="clay-tag clay-tag-sage">
                          CURRENTLY INDEXED IN SQLITE &amp; HNSW
                        </span>
                      )}
                      <span className="clay-tag">
                        {bench.chunkCount} CHUNKS // AVG {bench.avgChunkTokens}{' '}
                        TOKENS
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      className={`clay-btn ${
                        isCurrent ? 'clay-btn-sage' : 'clay-btn-charcoal'
                      }`}
                      style={{ padding: '8px 16px', fontSize: '0.78rem' }}
                      onClick={() =>
                        onRechunkDocument(
                          activeDoc.id,
                          bench.strategy,
                          targetTokens,
                          overlapTokens
                        )
                      }
                    >
                      {isCurrent
                        ? 'RE-RUN WITH UPDATED TOKEN WINDOW'
                        : `APPLY ${bench.strategy.toUpperCase()} & RE-INDEX HNSW`}
                    </button>
                  </div>

                  <p
                    style={{
                      fontSize: '0.84rem',
                      color: 'var(--ink-secondary)',
                      marginBottom: 14,
                    }}
                  >
                    {bench.description}
                  </p>

                  <div className="grid-4">
                    {[
                      {
                        label: 'SEMANTIC COHERENCE',
                        val: bench.semanticCoherenceScore,
                        color: '#527965',
                      },
                      {
                        label: 'BOUNDARY SHARPNESS',
                        val: bench.boundarySharpnessScore,
                        color: '#C4684B',
                      },
                      {
                        label: 'INFORMATION DENSITY',
                        val: bench.informationDensityScore,
                        color: '#4B657E',
                      },
                      {
                        label: 'COMPOSITE SCORE',
                        val: bench.compositeScore,
                        color: '#C2883B',
                      },
                    ].map((m) => (
                      <div key={m.label}>
                        <div
                          className="font-mono"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            marginBottom: 5,
                          }}
                        >
                          <span>{m.label}</span>
                          <span>{m.val}%</span>
                        </div>
                        <div className="clay-meter-track">
                          <div
                            className="clay-meter-fill anime-bench-bar"
                            style={{
                              width: `${m.val}%`,
                              backgroundColor: m.color,
                              transformOrigin: 'left center',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Focused Sub-View 2: Segmented Chunk Slice Reader */
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
              <span className="clay-tag clay-tag-cobalt">
                <FileText size={14} />
                <span>
                  SEGMENTED CHUNK SLICE READER ({activeDocChunks.length} CHUNKS)
                </span>
              </span>
              <h2
                className="font-display"
                style={{ fontSize: '1.3rem', marginTop: 8 }}
              >
                {activeDoc.title} — Sliced via{' '}
                {activeDoc.selectedStrategy.toUpperCase()}
              </h2>
            </div>
          </div>

          <div className="grid-2">
            {activeDocChunks.map((ch) => (
              <div
                key={ch.id}
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
                      marginBottom: 8,
                    }}
                  >
                    <span className="clay-tag clay-tag-terracotta">
                      CHUNK #{ch.index}
                    </span>
                    <span className="clay-tag">
                      {ch.tokenCount} TOKENS // COHERENCE {ch.coherenceScore}%
                    </span>
                  </div>

                  <div
                    className="font-display"
                    style={{
                      fontSize: '0.96rem',
                      fontWeight: 700,
                      marginBottom: 8,
                    }}
                  >
                    {ch.sectionPath}
                  </div>

                  <div
                    className="clay-well font-mono"
                    style={{
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 190,
                      overflowY: 'auto',
                    }}
                  >
                    {ch.content}
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ch.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="clay-tag"
                      style={{ fontSize: '0.67rem', padding: '2px 8px' }}
                    >
                      <Hash size={10} />
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
