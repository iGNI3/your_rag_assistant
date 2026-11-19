import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import anime from 'animejs';
import {
  Upload,
  FileText,
  Scissors,
  Trash2,
  RefreshCw,
  Eye,
  Plus,
  Layers,
  Sliders,
} from 'lucide-react';
import {
  ChunkStrategyType,
  DocumentChunk,
  IngestedDocument,
  RagPipelineConfig,
} from '../types';

interface IngestionAndChunkStudioProps {
  documents: IngestedDocument[];
  chunks: Array<Omit<DocumentChunk, 'embedding' | 'sparseTerms'>>;
  config: RagPipelineConfig;
  onUploadFiles: (
    files: FileList,
    options: {
      autoOptimize: boolean;
      strategy: ChunkStrategyType;
      targetChunkTokens: number;
      chunkOverlapTokens: number;
    }
  ) => Promise<void>;
  onIngestRawText: (payload: {
    title: string;
    content: string;
    format: string;
    autoOptimize: boolean;
    strategy: ChunkStrategyType;
    targetChunkTokens: number;
    chunkOverlapTokens: number;
  }) => Promise<void>;
  onRechunkDocument: (
    docId: string,
    strategy: ChunkStrategyType,
    targetTokens: number,
    overlapTokens: number
  ) => Promise<void>;
  onDeleteDocument: (docId: string) => Promise<void>;
  onResetCorpus: () => Promise<void>;
  isBusy: boolean;
}

export const IngestionAndChunkStudio: React.FC<IngestionAndChunkStudioProps> = ({
  documents,
  chunks,
  config,
  onUploadFiles,
  onIngestRawText,
  onRechunkDocument,
  onDeleteDocument,
  onResetCorpus,
  isBusy,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const benchmarkRef = useRef<HTMLDivElement | null>(null);

  const [selectedDocId, setSelectedDocId] = useState<string>(
    documents[0]?.id || ''
  );
  const [autoOptimize, setAutoOptimize] = useState<boolean>(
    config.autoOptimizeChunking
  );
  const [preferredStrategy, setPreferredStrategy] = useState<ChunkStrategyType>(
    config.defaultChunkStrategy
  );
  const [targetTokens, setTargetTokens] = useState<number>(
    config.targetChunkTokens
  );
  const [overlapTokens, setOverlapTokens] = useState<number>(
    config.chunkOverlapTokens
  );

  // Raw Text / Markdown / Technical Document Composer state
  const [composerTitle, setComposerTitle] = useState<string>('');
  const [composerFormat, setComposerFormat] = useState<string>('MARKDOWN');
  const [composerContent, setComposerContent] = useState<string>('');

  useEffect(() => {
    if (!documents.some((d) => d.id === selectedDocId) && documents.length > 0) {
      setSelectedDocId(documents[0].id);
    }
  }, [documents, selectedDocId]);

  const activeDoc =
    documents.find((d) => d.id === selectedDocId) || documents[0] || null;
  const activeDocChunks = chunks.filter((c) => c.documentId === activeDoc?.id);

  // Animate strategy benchmark bars with Anime.js when active document changes
  useEffect(() => {
    if (!benchmarkRef.current) return;
    anime({
      targets: benchmarkRef.current.querySelectorAll('.anime-bench-bar'),
      scaleX: [0, 1],
      duration: 620,
      delay: anime.stagger(55),
      easing: 'easeOutExpo',
    });
  }, [activeDoc?.id, activeDoc?.selectedStrategy]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files, {
        autoOptimize,
        strategy: preferredStrategy,
        targetChunkTokens: targetTokens,
        chunkOverlapTokens: overlapTokens,
      });
      e.target.value = '';
    }
  };

  const handleLoadSampleSpec = () => {
    setComposerTitle('Multimodal Enterprise Financial Table & OCR Audit Report');
    setComposerFormat('MARKDOWN');
    setComposerContent(`# Multimodal Enterprise Financial Table & OCR Audit Report

## 1. Automated Document Extraction & OCR Telemetry
Enterprise financial filings combine multi-column PDF typography, embedded spreadsheet tables, and scanned receipt attachments. The Python extraction pipeline runs layout de-hyphenation, Unicode ligature normalization, and adaptive Pillow + Tesseract OCR recognition with 95.8% character accuracy.

| Document Category | Ingestion Engine | Recommended Chunk Strategy | Retrieval Recall@5 |
| --- | --- | --- | --- |
| Scanned Invoices (PNG/TIFF) | Python Pillow + OCR | Atomic Fact Propositions | 96.4% |
| Quarterly Balance Sheets (XLSX) | OpenPyXL Markdown Grid | Structural AST & Table Aware | 98.1% |
| Legal Contracts (PDF/DOCX) | PyPDF + Python-Docx | Hierarchical Parent-Child | 95.7% |

## 2. Quantization & Latency Targets
Deploying INT8 scalar vector quantization reduces HNSW index RAM consumption by 75% while keeping end-to-end hybrid RRF + Cross-Encoder reranking latency under 45 milliseconds.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Top Row: Multi-Format File Dropzone + Raw Document Composer */}
      <div className="grid-2">
        {/* Left: Multi-Format File Upload & OCR Ingestion Parameters */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span className="clay-tag clay-tag-terracotta">
              <Upload size={13} />
              <span>MULTI-FORMAT & OCR DOCUMENT INGESTION</span>
            </span>
            <span className="clay-tag">PYTHON EXTRACTOR + OCR</span>
          </div>

          <div
            className="clay-well"
            onClick={() => fileInputRef.current?.click()}
            style={{
              cursor: 'pointer',
              textAlign: 'center',
              padding: '24px 18px',
              marginBottom: 16,
              border: '2px dashed #B5A797',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif,.docx,.xlsx,.xls,.csv,.tsv,.html,.htm,.xml,.md,.txt,.json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <div
              className="font-display"
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              CLICK TO SELECT OR DROP DOCUMENTS & IMAGES FOR OCR
            </div>
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--ink-secondary)',
                marginBottom: 12,
              }}
            >
              Supported: PDF, Scanned Images (PNG, JPG, WEBP, TIFF, BMP via
              Python OCR), Word (DOCX), Excel/CSV (XLSX, CSV), HTML, Markdown,
              JSON, Text
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {[
                'PDF STREAM + OCR',
                'IMAGE OCR',
                'DOCX TABLES',
                'XLSX / CSV GRIDS',
                'HTML DOM',
                'MD / JSON',
              ].map((fmt) => (
                <span
                  key={fmt}
                  className="clay-tag"
                  style={{ fontSize: '0.67rem', padding: '3px 8px' }}
                >
                  {fmt}
                </span>
              ))}
            </div>
          </div>

          {/* Chunking Optimizer Ingestion Controls */}
          <div
            className="clay-card-alt"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  className="font-display"
                  style={{ fontSize: '0.86rem', fontWeight: 700 }}
                >
                  AUTO-SELECT WINNING CHUNKING STRATEGY
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-secondary)' }}>
                  Benchmarks all 5 strategies on ingestion and picks the highest
                  composite score
                </div>
              </div>
              <div
                className={`clay-switch ${autoOptimize ? 'on' : ''}`}
                onClick={() => setAutoOptimize(!autoOptimize)}
              >
                <div className="clay-switch-knob" />
              </div>
            </div>

            <div className="grid-3" style={{ gap: 10 }}>
              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  FALLBACK STRATEGY
                </label>
                <select
                  className="clay-select"
                  value={preferredStrategy}
                  disabled={autoOptimize}
                  onChange={(e) =>
                    setPreferredStrategy(e.target.value as ChunkStrategyType)
                  }
                >
                  <option value="semantic">Semantic Inflection</option>
                  <option value="hierarchical">Hierarchical Parent-Child</option>
                  <option value="proposition">Atomic Propositions</option>
                  <option value="structural">Structural AST & Table</option>
                  <option value="sliding_window">Sliding Window</option>
                </select>
              </div>

              <div>
                <label
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  TARGET TOKENS ({targetTokens})
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
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  OVERLAP TOKENS ({overlapTokens})
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
            </div>
          </div>
        </div>

        {/* Right: Direct Technical Document / Table / Spec Composer */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span className="clay-tag clay-tag-sage">
              <Plus size={13} />
              <span>DIRECT STREAM / TECHNICAL DOCUMENT COMPOSER</span>
            </span>
            <button
              type="button"
              className="clay-btn"
              style={{ padding: '5px 11px', fontSize: '0.74rem' }}
              onClick={handleLoadSampleSpec}
            >
              LOAD SAMPLE ENTERPRISE TABLE SPEC
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 150px',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <input
              type="text"
              className="clay-input"
              placeholder="Document Title (e.g. Architecture Specification v2)"
              value={composerTitle}
              onChange={(e) => setComposerTitle(e.target.value)}
            />
            <select
              className="clay-select"
              value={composerFormat}
              onChange={(e) => setComposerFormat(e.target.value)}
            >
              <option value="MARKDOWN">MARKDOWN</option>
              <option value="TEXT">PLAIN TEXT</option>
              <option value="HTML">HTML</option>
              <option value="CSV">CSV TABLE</option>
              <option value="JSON">JSON</option>
            </select>
          </div>

          <textarea
            className="clay-input font-mono"
            rows={6}
            placeholder="Paste raw text, Markdown specification, CSV rows, or HTML source to optimize extraction, benchmark chunking strategies, and index into Python HNSW Vector DB..."
            value={composerContent}
            onChange={(e) => setComposerContent(e.target.value)}
            style={{ marginBottom: 12, fontSize: '0.8rem', resize: 'vertical' }}
          />

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ y: 2 }}
            type="button"
            disabled={isBusy || !composerContent.trim()}
            className="clay-btn clay-btn-terracotta"
            style={{ width: '100%', padding: '12px 18px' }}
            onClick={async () => {
              await onIngestRawText({
                title: composerTitle || 'Custom Ingested Specification',
                content: composerContent,
                format: composerFormat,
                autoOptimize,
                strategy: preferredStrategy,
                targetChunkTokens: targetTokens,
                chunkOverlapTokens: overlapTokens,
              });
              setComposerTitle('');
              setComposerContent('');
            }}
          >
            <Scissors size={15} />
            <span>
              OPTIMIZE EXTRACTION, BENCHMARK 5 STRATEGIES & INDEX INTO HNSW DB
            </span>
          </motion.button>
        </div>
      </div>

      {/* Bottom Section: Indexed Corpus Catalog + 5-Strategy Chunking Benchmark Comparator */}
      <div className="grid-2" style={{ gridTemplateColumns: '0.9fr 1.4fr' }}>
        {/* Left: Ingested Document List & Extraction Telemetry */}
        <div className="clay-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <span className="clay-tag clay-tag-cobalt">
              <FileText size={13} />
              <span>INDEXED CORPUS ({documents.length} DOCS)</span>
            </span>
            <button
              type="button"
              className="clay-btn"
              style={{ padding: '5px 10px', fontSize: '0.72rem' }}
              onClick={onResetCorpus}
            >
              <RefreshCw size={12} />
              <span>RESET SEED CORPUS</span>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxHeight: 540,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {documents.map((doc) => {
              const isSelected = activeDoc?.id === doc.id;
              return (
                <motion.div
                  key={doc.id}
                  whileHover={{ y: -2 }}
                  onClick={() => setSelectedDocId(doc.id)}
                  className="clay-card-alt"
                  style={{
                    cursor: 'pointer',
                    borderColor: isSelected
                      ? 'var(--clay-terracotta)'
                      : 'var(--clay-border-light)',
                    backgroundColor: isSelected
                      ? '#F7F2EB'
                      : 'var(--clay-surface-alt)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    <span className="clay-tag clay-tag-terracotta">
                      {doc.format}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="clay-tag">
                        {doc.chunkCount} CHUNKS // {doc.selectedStrategy}
                      </span>
                      <button
                        type="button"
                        className="clay-btn"
                        style={{ padding: '4px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteDocument(doc.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div
                    className="font-display"
                    style={{
                      fontSize: '0.94rem',
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {doc.title}
                  </div>

                  <div
                    className="font-mono"
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--ink-secondary)',
                      marginBottom: 8,
                    }}
                  >
                    File: {doc.filename} | {doc.extractionTelemetry.estimatedTokens}{' '}
                    Tokens | Extraction: {doc.extractionTelemetry.extractionTimeMs}{' '}
                    ms
                    {doc.extractionTelemetry.ocrUsed
                      ? ` | OCR Confidence: ${doc.extractionTelemetry.ocrConfidence}%`
                      : ''}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {doc.extractionTelemetry.cleaningOperations.map((op, i) => (
                      <span
                        key={i}
                        className="clay-tag"
                        style={{
                          fontSize: '0.65rem',
                          textTransform: 'none',
                          padding: '2px 7px',
                        }}
                      >
                        {op}
                      </span>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right: 5-Strategy Chunking Benchmark Comparator & Live Chunk Slice Viewer */}
        <div
          ref={benchmarkRef}
          className="clay-card"
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {activeDoc ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <span className="clay-tag clay-tag-ochre">
                    <Sliders size={13} />
                    <span>5-STRATEGY CHUNKING OPTIMIZER & BENCHMARK</span>
                  </span>
                  <h3
                    className="font-display"
                    style={{ fontSize: '1.12rem', marginTop: 6 }}
                  >
                    {activeDoc.title}
                  </h3>
                </div>
                <span className="clay-tag clay-tag-sage">
                  ACTIVE STRATEGY: {activeDoc.selectedStrategy.toUpperCase()}
                </span>
              </div>

              {/* Strategy Comparison Matrix */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activeDoc.strategyBenchmarks.map((bench) => {
                  const isCurrent =
                    activeDoc.selectedStrategy === bench.strategy;
                  return (
                    <div
                      key={bench.strategy}
                      className="clay-card-alt"
                      style={{
                        padding: '12px 14px',
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
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <span
                            className="font-display"
                            style={{ fontWeight: 700, fontSize: '0.9rem' }}
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
                              INDEXED IN HNSW
                            </span>
                          )}
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            disabled={isBusy}
                            className="clay-btn"
                            style={{ padding: '4px 10px', fontSize: '0.73rem' }}
                            onClick={() =>
                              onRechunkDocument(
                                activeDoc.id,
                                bench.strategy,
                                targetTokens,
                                overlapTokens
                              )
                            }
                          >
                            APPLY & RE-INDEX ({bench.chunkCount} CHUNKS)
                          </button>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: 'var(--ink-secondary)',
                          marginBottom: 8,
                        }}
                      >
                        {bench.description}
                      </div>

                      {/* 4 Sub-metric Bars */}
                      <div className="grid-4" style={{ gap: 10 }}>
                        {[
                          {
                            label: 'COHERENCE',
                            val: bench.semanticCoherenceScore,
                            color: '#527965',
                          },
                          {
                            label: 'BOUNDARY SHARPNESS',
                            val: bench.boundarySharpnessScore,
                            color: '#C4684B',
                          },
                          {
                            label: 'INFO DENSITY',
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
                                fontSize: '0.67rem',
                                fontWeight: 700,
                                marginBottom: 3,
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

              {/* Generated Chunks Preview */}
              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    marginBottom: 8,
                    color: 'var(--ink-secondary)',
                  }}
                >
                  GENERATED CHUNK SLICES ({activeDocChunks.length} CHUNKS USING{' '}
                  {activeDoc.selectedStrategy.toUpperCase()})
                </div>
                <div
                  className="clay-well"
                  style={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {activeDocChunks.map((ch) => (
                    <div
                      key={ch.id}
                      className="clay-card-alt"
                      style={{ padding: '10px 12px' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                          fontSize: '0.72rem',
                        }}
                        className="font-mono"
                      >
                        <strong>
                          CHUNK #{ch.index} // {ch.sectionPath}
                        </strong>
                        <span>
                          {ch.tokenCount} TOKENS | COHERENCE: {ch.coherenceScore}%
                        </span>
                      </div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--ink-secondary)',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {ch.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div>Select or ingest a document to inspect chunking benchmarks.</div>
          )}
        </div>
      </div>
    </div>
  );
};
