import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import anime from 'animejs';
import {
  Compass,
  Layers,
  Sliders,
  Cpu,
  Hash,
  Target,
  Maximize2,
} from 'lucide-react';
import {
  AgenticRagResponse,
  DistanceMetric,
  DocumentChunk,
  RagPipelineConfig,
  VectorDbStats,
} from '../types';

interface VectorSpaceCanvasProps {
  chunks: Array<Omit<DocumentChunk, 'embedding' | 'sparseTerms'>>;
  latestQuery: AgenticRagResponse | null;
  stats: VectorDbStats | null;
  config: RagPipelineConfig;
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
}

const DOC_PIGMENTS = ['#C4684B', '#527965', '#4B657E', '#C2883B', '#78566C'];

export const VectorSpaceCanvas: React.FC<VectorSpaceCanvasProps> = ({
  chunks,
  latestQuery,
  stats,
  config,
  onUpdateConfig,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(
    chunks[0]?.id || null
  );

  useEffect(() => {
    if (!selectedChunkId && chunks.length > 0) {
      setSelectedChunkId(chunks[0].id);
    }
  }, [chunks, selectedChunkId]);

  // Anime.js spring physics animation when chunks or query coordinates update
  useEffect(() => {
    if (!svgRef.current) return;
    anime({
      targets: svgRef.current.querySelectorAll('.anime-vector-node'),
      scale: [0.2, 1],
      opacity: [0, 1],
      delay: anime.stagger(18),
      duration: 680,
      easing: 'easeOutElastic(1, .65)',
    });

    anime({
      targets: svgRef.current.querySelectorAll('.anime-similarity-ray'),
      strokeDashoffset: [anime.setDashoffset, 0],
      opacity: [0.15, 0.85],
      duration: 750,
      delay: anime.stagger(55),
      easing: 'easeOutQuart',
    });
  }, [chunks.length, latestQuery?.queryId]);

  // Map [-1, 1] coords to SVG viewport [40..660, 35..365]
  const toSvgX = (x: number) => Math.round(350 + x * 290);
  const toSvgY = (y: number) => Math.round(200 + y * 155);

  const uniqueDocIds = Array.from(new Set(chunks.map((c) => c.documentId)));
  const retrievedIds = new Set(
    (latestQuery?.retrievedChunks || []).map((r) => r.chunkId)
  );
  const retrievedRankMap = new Map<string, number>();
  (latestQuery?.retrievedChunks || []).forEach((r) =>
    retrievedRankMap.set(r.chunkId, r.finalRank)
  );

  const selectedChunk =
    chunks.find((c) => c.id === selectedChunkId) || chunks[0] || null;
  const selectedRetrievedInfo = latestQuery?.retrievedChunks.find(
    (r) => r.chunkId === selectedChunk?.id
  );

  const qCoords = latestQuery?.queryCoords2D || [0.12, -0.08];
  const hCoords = latestQuery?.hydeCoords2D || [0.22, 0.06];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Vector DB Telemetry Row */}
      <div className="grid-4">
        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 700 }}
          >
            HNSW GRAPH TOPOLOGY
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.55rem', fontWeight: 700, margin: '4px 0' }}
          >
            {stats?.hnswLayers || 3} Layers // {stats?.hnswTotalEdges || 0} Edges
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
            Avg Node Degree M = {stats?.hnswAvgDegree || 6.0} bidirectional links
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 700 }}
          >
            EMBEDDING HYPERSPHERE
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.55rem', fontWeight: 700, margin: '4px 0' }}
          >
            {stats?.vectorDimensions || 128}-Dim Dense + BM25+
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
            {stats?.vocabTermsIndexed || 0} unique stemmed IDF lexical terms
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 700 }}
          >
            QUANTIZATION FOOTPRINT
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.55rem', fontWeight: 700, margin: '4px 0' }}
          >
            {stats?.memoryFootprint.int8QuantizedKb || 0} KB (INT8)
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
            FP32: {stats?.memoryFootprint.fp32Kb || 0} KB | Binary:{' '}
            {stats?.memoryFootprint.binaryQuantizedKb || 0} KB
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 700 }}
          >
            ACTIVE SIMILARITY KERNEL
          </div>
          <div
            className="font-display"
            style={{
              fontSize: '1.55rem',
              fontWeight: 700,
              margin: '4px 0',
              textTransform: 'uppercase',
            }}
          >
            {config.distanceMetric} // RRF α={config.hybridAlpha}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
            MMR Diversity λ = {config.mmrLambda} | Top-K = {config.topKReranked}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.35fr 0.95fr' }}>
        {/* Left: Anime.js 2D Projected Vector Manifold */}
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
                <Compass size={13} />
                <span>ANIME.JS 2D UMAP VECTOR MANIFOLD</span>
              </span>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--ink-secondary)',
                  fontWeight: 600,
                }}
              >
                Click any vector node to inspect its embedding & chunk payload
              </span>
            </div>

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ y: 2 }}
              type="button"
              className="clay-btn"
              style={{ padding: '6px 12px', fontSize: '0.76rem' }}
              onClick={() => {
                if (!svgRef.current) return;
                anime({
                  targets: svgRef.current.querySelectorAll('.anime-vector-node'),
                  scale: [0.3, 1],
                  delay: anime.stagger(20),
                  duration: 600,
                  easing: 'easeOutElastic(1, .5)',
                });
              }}
            >
              <Maximize2 size={13} />
              <span>RE-ANIMATE MANIFOLD</span>
            </motion.button>
          </div>

          <div
            className="clay-well"
            style={{
              padding: 10,
              overflow: 'hidden',
            }}
          >
            <svg
              ref={svgRef}
              viewBox="0 0 700 400"
              style={{
                width: '100%',
                height: 370,
                display: 'block',
                borderRadius: 14,
                backgroundColor: 'var(--vector-canvas-bg)',
              }}
            >
              {/* Coordinate Grid */}
              {[80, 160, 240, 320].map((y) => (
                <line
                  key={`gy-${y}`}
                  x1="20"
                  y1={y}
                  x2="680"
                  y2={y}
                  stroke="var(--vector-grid-stroke)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ))}
              {[140, 280, 420, 560].map((x) => (
                <line
                  key={`gx-${x}`}
                  x1={x}
                  y1="20"
                  x2={x}
                  y2="380"
                  stroke="var(--vector-grid-stroke)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ))}

              {/* HNSW Background Proximity Edges between nearby chunks */}
              {chunks.map((c, idx) => {
                const next = chunks[(idx + 1) % chunks.length];
                if (!next || next.id === c.id) return null;
                return (
                  <line
                    key={`edge-${c.id}-${next.id}`}
                    x1={toSvgX(c.coords2D[0])}
                    y1={toSvgY(c.coords2D[1])}
                    x2={toSvgX(next.coords2D[0])}
                    y2={toSvgY(next.coords2D[1])}
                    stroke="#BFB2A3"
                    strokeWidth="1.2"
                    opacity="0.65"
                  />
                );
              })}

              {/* Similarity Rays from Reshaped Query Vector to Top-K Retrieved Chunks */}
              {chunks
                .filter((c) => retrievedIds.has(c.id))
                .map((c) => (
                  <line
                    key={`ray-${c.id}`}
                    className="anime-similarity-ray"
                    x1={toSvgX(qCoords[0])}
                    y1={toSvgY(qCoords[1])}
                    x2={toSvgX(c.coords2D[0])}
                    y2={toSvgY(c.coords2D[1])}
                    stroke="#C4684B"
                    strokeWidth="2.4"
                    strokeDasharray="6 4"
                  />
                ))}

              {/* HyDE Anchor Vector to Query Vector link */}
              {config.enableHyde && (
                <line
                  x1={toSvgX(qCoords[0])}
                  y1={toSvgY(qCoords[1])}
                  x2={toSvgX(hCoords[0])}
                  y2={toSvgY(hCoords[1])}
                  stroke="#527965"
                  strokeWidth="2.2"
                />
              )}

              {/* Chunk Vector Nodes */}
              {chunks.map((chunk) => {
                const docColorIdx = Math.max(
                  0,
                  uniqueDocIds.indexOf(chunk.documentId)
                );
                const fillPigment =
                  DOC_PIGMENTS[docColorIdx % DOC_PIGMENTS.length];
                const isRetrieved = retrievedIds.has(chunk.id);
                const rank = retrievedRankMap.get(chunk.id);
                const isSelected = selectedChunk?.id === chunk.id;
                const cx = toSvgX(chunk.coords2D[0]);
                const cy = toSvgY(chunk.coords2D[1]);

                return (
                  <g
                    key={chunk.id}
                    className="anime-vector-node"
                    style={{
                      cursor: 'pointer',
                      transformOrigin: `${cx}px ${cy}px`,
                    }}
                    onClick={() => setSelectedChunkId(chunk.id)}
                  >
                    {isRetrieved && (
                      <rect
                        x={cx - 17}
                        y={cy - 17}
                        width="34"
                        height="34"
                        rx="11"
                        fill="none"
                        stroke="#C4684B"
                        strokeWidth="2.5"
                      />
                    )}
                    <rect
                      x={cx - (isSelected ? 13 : 10)}
                      y={cy - (isSelected ? 13 : 10)}
                      width={isSelected ? 26 : 20}
                      height={isSelected ? 26 : 20}
                      rx="7"
                      fill={fillPigment}
                      stroke={isSelected ? '#24211E' : '#FAF6F0'}
                      strokeWidth={isSelected ? '3' : '2'}
                    />
                    <text
                      x={cx}
                      y={cy + 4}
                      textAnchor="middle"
                      fill="#FAF6F0"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                      fontWeight="700"
                    >
                      {rank ? `#${rank}` : `C${chunk.index}`}
                    </text>
                  </g>
                );
              })}

              {/* Query Vector Node */}
              <g
                className="anime-vector-node"
                style={{
                  transformOrigin: `${toSvgX(qCoords[0])}px ${toSvgY(qCoords[1])}px`,
                }}
              >
                <rect
                  x={toSvgX(qCoords[0]) - 36}
                  y={toSvgY(qCoords[1]) - 14}
                  width="72"
                  height="28"
                  rx="9"
                  fill="#24211E"
                  stroke="#FAF6F0"
                  strokeWidth="2.2"
                />
                <text
                  x={toSvgX(qCoords[0])}
                  y={toSvgY(qCoords[1]) + 4}
                  textAnchor="middle"
                  fill="#FAF6F0"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  QUERY VEC
                </text>
              </g>

              {/* HyDE Vector Anchor Node */}
              {config.enableHyde && (
                <g
                  className="anime-vector-node"
                  style={{
                    transformOrigin: `${toSvgX(hCoords[0])}px ${toSvgY(hCoords[1])}px`,
                  }}
                >
                  <rect
                    x={toSvgX(hCoords[0]) - 34}
                    y={toSvgY(hCoords[1]) - 13}
                    width="68"
                    height="26"
                    rx="8"
                    fill="#527965"
                    stroke="#FAF6F0"
                    strokeWidth="2"
                  />
                  <text
                    x={toSvgX(hCoords[0])}
                    y={toSvgY(hCoords[1]) + 4}
                    textAnchor="middle"
                    fill="#FAF6F0"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="700"
                  >
                    HYDE VEC
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* Document Color Legend */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 12,
              alignItems: 'center',
            }}
          >
            {uniqueDocIds.map((docId, i) => {
              const docTitle =
                chunks.find((c) => c.documentId === docId)?.documentTitle ||
                docId;
              return (
                <div
                  key={docId}
                  className="clay-tag"
                  style={{ textTransform: 'none', fontSize: '0.73rem' }}
                >
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 4,
                      backgroundColor: DOC_PIGMENTS[i % DOC_PIGMENTS.length],
                      display: 'inline-block',
                    }}
                  />
                  <span>{docTitle.slice(0, 34)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Vector Chunk Inspector & Hybrid Retrieval Parameter Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Selected Chunk Inspector */}
          <div className="clay-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <span className="clay-tag clay-tag-terracotta">
                <Target size={13} />
                <span>VECTOR NODE INSPECTOR</span>
              </span>
              {selectedChunk && (
                <span className="clay-tag">
                  STRATEGY: {selectedChunk.strategy}
                </span>
              )}
            </div>

            {selectedChunk ? (
              <div>
                <div
                  className="font-display"
                  style={{
                    fontSize: '0.98rem',
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  {selectedChunk.sectionPath}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.73rem',
                    color: 'var(--ink-secondary)',
                    marginBottom: 10,
                  }}
                >
                  ID: {selectedChunk.id} | {selectedChunk.tokenCount} Tokens |
                  Coherence: {selectedChunk.coherenceScore}% | 2D: [
                  {selectedChunk.coords2D[0]}, {selectedChunk.coords2D[1]}]
                </div>

                {selectedRetrievedInfo && (
                  <div
                    className="clay-card-alt"
                    style={{
                      marginBottom: 10,
                      padding: '10px 12px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span className="clay-tag clay-tag-sage">
                      FINAL RANK #{selectedRetrievedInfo.finalRank}
                    </span>
                    <span className="clay-tag">
                      DENSE: {(selectedRetrievedInfo.denseScore * 100).toFixed(1)}%
                    </span>
                    <span className="clay-tag">
                      BM25: {(selectedRetrievedInfo.sparseScore * 100).toFixed(1)}%
                    </span>
                    <span className="clay-tag clay-tag-terracotta">
                      RERANK: {(selectedRetrievedInfo.rerankScore * 100).toFixed(1)}%
                    </span>
                  </div>
                )}

                <div
                  className="clay-well font-mono"
                  style={{
                    fontSize: '0.78rem',
                    maxHeight: 140,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    padding: 12,
                  }}
                >
                  {selectedChunk.content}
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  {selectedChunk.keywords.map((kw) => (
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
            ) : (
              <div style={{ color: 'var(--ink-secondary)', fontSize: '0.88rem' }}>
                No vector chunks indexed. Ingest a document to inspect vector embeddings.
              </div>
            )}
          </div>

          {/* Live Vector DB Similarity & Hybrid Fusion Tuner */}
          <div className="clay-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 14,
              }}
            >
              <span className="clay-tag clay-tag-ochre">
                <Sliders size={13} />
                <span>HNSW + RRF SIMILARITY TUNER</span>
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  className="font-mono"
                  style={{
                    display: 'block',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                >
                  VECTOR SIMILARITY METRIC
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {(['cosine', 'dot', 'euclidean', 'manhattan'] as DistanceMetric[]).map(
                    (metric) => (
                      <button
                        key={metric}
                        type="button"
                        onClick={() => onUpdateConfig({ distanceMetric: metric })}
                        className={`clay-btn ${
                          config.distanceMetric === metric ? 'clay-btn-terracotta' : ''
                        }`}
                        style={{
                          padding: '8px 6px',
                          fontSize: '0.73rem',
                          textTransform: 'uppercase',
                        }}
                      >
                        {metric}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  <span>HYBRID RRF ALPHA (BM25 SPARSE vs HNSW DENSE)</span>
                  <span className="font-mono">{config.hybridAlpha.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  className="clay-slider"
                  min={0}
                  max={1}
                  step={0.05}
                  value={config.hybridAlpha}
                  onChange={(e) =>
                    onUpdateConfig({ hybridAlpha: Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  <span>MMR DIVERSITY LAMBDA (DIVERSITY vs RELEVANCE)</span>
                  <span className="font-mono">{config.mmrLambda.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  className="clay-slider"
                  min={0.2}
                  max={1}
                  step={0.05}
                  value={config.mmrLambda}
                  onChange={(e) =>
                    onUpdateConfig({ mmrLambda: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
