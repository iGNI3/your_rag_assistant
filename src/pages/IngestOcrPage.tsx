import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  Plus,
  Scissors,
  ArrowRight,
} from 'lucide-react';
import {
  ChunkStrategyType,
  IngestedDocument,
  RagPipelineConfig,
} from '../types';

interface IngestOcrPageProps {
  documents: IngestedDocument[];
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
  onDeleteDocument: (docId: string) => Promise<void>;
  onResetCorpus: () => Promise<void>;
  onGoToChunkOptimizer: (docId?: string) => void;
  isBusy: boolean;
}

export const IngestOcrPage: React.FC<IngestOcrPageProps> = ({
  documents,
  config,
  onUploadFiles,
  onIngestRawText,
  onDeleteDocument,
  onResetCorpus,
  onGoToChunkOptimizer,
  isBusy,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ingestMode, setIngestMode] = useState<'upload' | 'compose'>('upload');

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

  const [composerTitle, setComposerTitle] = useState<string>('');
  const [composerFormat, setComposerFormat] = useState<string>('MARKDOWN');
  const [composerContent, setComposerContent] = useState<string>('');

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
    <div className="grid-2" style={{ gridTemplateColumns: '1.08fr 0.92fr' }}>
      {/* Left Column: Focused Ingestion Console (Toggle between File Upload & Direct Composer) */}
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
          <span className="clay-tag clay-tag-terracotta">
            <Upload size={14} />
            <span>DOCUMENT &amp; OCR INGESTION ENGINE</span>
          </span>

          {/* Clean Sub-Mode Switcher so Upload and Composer don't crowd each other */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`clay-btn ${
                ingestMode === 'upload' ? 'clay-btn-terracotta' : ''
              }`}
              style={{ padding: '7px 14px', fontSize: '0.76rem' }}
              onClick={() => setIngestMode('upload')}
            >
              FILE &amp; OCR UPLOAD
            </button>
            <button
              type="button"
              className={`clay-btn ${
                ingestMode === 'compose' ? 'clay-btn-terracotta' : ''
              }`}
              style={{ padding: '7px 14px', fontSize: '0.76rem' }}
              onClick={() => setIngestMode('compose')}
            >
              DIRECT SPEC COMPOSER
            </button>
          </div>
        </div>

        {ingestMode === 'upload' ? (
          <div
            className="clay-well"
            onClick={() => fileInputRef.current?.click()}
            style={{
              cursor: 'pointer',
              textAlign: 'center',
              padding: '38px 24px',
              marginBottom: 20,
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
                fontSize: '1.15rem',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              CLICK TO SELECT OR DROP FILES &amp; SCANNED IMAGES
            </div>
            <div
              style={{
                fontSize: '0.86rem',
                color: 'var(--ink-secondary)',
                maxWidth: 500,
                margin: '0 auto 18px',
              }}
            >
              Automatically extracts and cleans PDF streams, runs Python Pillow
              + Tesseract OCR on images/scans, converts DOCX &amp; XLSX/CSV
              into Markdown tables, and strips HTML boilerplate.
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {[
                'PDF + OCR FALLBACK',
                'PNG / JPG / TIFF OCR',
                'DOCX PARSER',
                'XLSX / CSV TABLES',
                'HTML / XML DOM',
                'MARKDOWN / JSON',
              ].map((fmt) => (
                <span key={fmt} className="clay-tag">
                  {fmt}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
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
                style={{ fontSize: '0.74rem', fontWeight: 700 }}
              >
                COMPOSE OR PASTE RAW TECHNICAL DOCUMENT
              </span>
              <button
                type="button"
                className="clay-btn"
                style={{ padding: '6px 12px', fontSize: '0.74rem' }}
                onClick={handleLoadSampleSpec}
              >
                LOAD SAMPLE FINANCIAL &amp; OCR TABLE
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 160px',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <input
                type="text"
                className="clay-input"
                placeholder="Document Title..."
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
              rows={7}
              placeholder="Paste raw text, Markdown tables, CSV rows, or HTML..."
              value={composerContent}
              onChange={(e) => setComposerContent(e.target.value)}
              style={{ marginBottom: 14, fontSize: '0.82rem' }}
            />

            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ y: 2 }}
              type="button"
              disabled={isBusy || !composerContent.trim()}
              className="clay-btn clay-btn-terracotta"
              style={{ width: '100%', padding: '14px 20px' }}
              onClick={async () => {
                await onIngestRawText({
                  title: composerTitle || 'Custom Technical Specification',
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
              <Plus size={16} />
              <span>EXTRACT, BENCHMARK 5 STRATEGIES &amp; SAVE TO SQLITE</span>
            </motion.button>
          </div>
        )}

        {/* Ingestion Pre-Optimization Settings */}
        <div
          className="clay-card-alt"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
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
                style={{ fontSize: '0.92rem', fontWeight: 700 }}
              >
                Auto-Select Winning Chunking Strategy on Ingest
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
                Benchmarks all 5 strategies and automatically indexes with the
                highest composite score
              </div>
            </div>
            <div
              className={`clay-switch ${autoOptimize ? 'on' : ''}`}
              onClick={() => setAutoOptimize(!autoOptimize)}
            >
              <div className="clay-switch-knob" />
            </div>
          </div>

          <div className="grid-2" style={{ gap: 14 }}>
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
                WINDOW OVERLAP ({overlapTokens} TOKENS)
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

      {/* Right Column: Clean Indexed Corpus Library & Extraction Telemetry */}
      <div className="clay-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 18,
          }}
        >
          <span className="clay-tag clay-tag-cobalt">
            <FileText size={14} />
            <span>INDEXED DOCUMENT LIBRARY ({documents.length})</span>
          </span>
          <button
            type="button"
            className="clay-btn"
            style={{ padding: '6px 12px', fontSize: '0.74rem' }}
            onClick={onResetCorpus}
          >
            <RefreshCw size={13} />
            <span>RESTORE SEED CORPUS</span>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            maxHeight: 520,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {documents.map((doc) => (
            <div key={doc.id} className="clay-card-alt">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="clay-tag clay-tag-terracotta">
                    {doc.format}
                  </span>
                  <span className="clay-tag clay-tag-sage">
                    {doc.chunkCount} CHUNKS // {doc.selectedStrategy}
                  </span>
                </div>
                <button
                  type="button"
                  className="clay-btn"
                  style={{ padding: '5px 9px' }}
                  onClick={() => onDeleteDocument(doc.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <h3
                className="font-display"
                style={{ fontSize: '1.02rem', fontWeight: 700, marginBottom: 4 }}
              >
                {doc.title}
              </h3>

              <div
                className="font-mono"
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--ink-secondary)',
                  marginBottom: 10,
                }}
              >
                File: {doc.filename} • {doc.extractionTelemetry.estimatedTokens}{' '}
                Tokens • Cleaned in {doc.extractionTelemetry.extractionTimeMs} ms
                {doc.extractionTelemetry.ocrUsed
                  ? ` • OCR Confidence: ${doc.extractionTelemetry.ocrConfidence}%`
                  : ''}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                {doc.extractionTelemetry.cleaningOperations.map((op, i) => (
                  <span
                    key={i}
                    className="clay-tag"
                    style={{
                      fontSize: '0.67rem',
                      textTransform: 'none',
                      padding: '3px 9px',
                    }}
                  >
                    {op}
                  </span>
                ))}
              </div>

              <button
                type="button"
                className="clay-btn"
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  fontSize: '0.76rem',
                }}
                onClick={() => onGoToChunkOptimizer(doc.id)}
              >
                <Scissors size={13} />
                <span>INSPECT 5-STRATEGY CHUNK BENCHMARK FOR THIS DOC</span>
                <ArrowRight size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
