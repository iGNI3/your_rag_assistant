import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Send,
  Plus,
  Cpu,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Bookmark,
  Upload,
  Sliders,
  ShieldCheck,
  FileText,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  AgenticRagResponse,
  ChunkStrategyType,
  RagPipelineConfig,
} from '../types';
import { RichMarkdownRenderer } from '../components/RichMarkdownRenderer';

interface ChatHomePageProps {
  queryHistory: AgenticRagResponse[];
  config: RagPipelineConfig;
  isExecuting: boolean;
  onExecuteQuery: (prompt: string) => Promise<void>;
  onUpdateConfig: (partial: Partial<RagPipelineConfig>) => Promise<void>;
  onUploadFiles: (
    files: FileList,
    options: {
      autoOptimize: boolean;
      strategy: ChunkStrategyType;
      targetChunkTokens: number;
      chunkOverlapTokens: number;
    }
  ) => Promise<void>;
  onSaveFindingFromChat: (turn: AgenticRagResponse) => Promise<void>;
  onOpenModelsPage: () => void;
}

const STARTER_PROMPTS = [
  {
    category: 'HNSW & HYBRID RRF',
    text: 'How does HNSW vector indexing work, and how does Reciprocal Rank Fusion (RRF) combine dense and sparse BM25+ search?',
  },
  {
    category: 'SMALL LLM & HYDE',
    text: 'What is HyDE (Hypothetical Document Embedding), how does the Small LLM Prompt Reshaper work, and why do we use it?',
  },
  {
    category: 'CHUNKING BENCHMARK',
    text: 'Compare the 5 adaptive chunking strategies (Semantic, Hierarchical Parent-Child, Propositions, Structural AST, Sliding Window).',
  },
  {
    category: 'OCR & CRAG GATE',
    text: 'How does Corrective RAG (CRAG) prune irrelevant noise chunks, and how does the Python OCR pipeline clean scanned documents?',
  },
];

export const ChatHomePage: React.FC<ChatHomePageProps> = ({
  queryHistory,
  config,
  isExecuting,
  onExecuteQuery,
  onUpdateConfig,
  onUploadFiles,
  onSaveFindingFromChat,
  onOpenModelsPage,
}) => {
  const [promptInput, setPromptInput] = useState<string>('');
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({});
  const [selectedCitationByTurn, setSelectedCitationByTurn] = useState<
    Record<string, string | null>
  >({});
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [savedTurnId, setSavedTurnId] = useState<string | null>(null);
  const [clearedAfterTimestamp, setClearedAfterTimestamp] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Order history chronologically (oldest -> newest) like ChatGPT / Gemini
  const visibleTurns = [...queryHistory]
    .filter((q) => new Date(q.timestamp).getTime() > clearedAfterTimestamp)
    .reverse();

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleTurns.length, isExecuting]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim() || isExecuting) return;
    const toSend = promptInput.trim();
    setPromptInput('');
    await onExecuteQuery(toSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleTrace = (queryId: string) => {
    setExpandedTraceIds((prev) => ({
      ...prev,
      [queryId]: !prev[queryId],
    }));
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await onUploadFiles(e.target.files, {
        autoOptimize: config.autoOptimizeChunking,
        strategy: config.defaultChunkStrategy,
        targetChunkTokens: config.targetChunkTokens,
        chunkOverlapTokens: config.chunkOverlapTokens,
      });
      e.target.value = '';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        minHeight: 'calc(100vh - 210px)',
        justifyContent: 'space-between',
      }}
    >
      {/* Top Bar: Active Model Switch Pill & New Chat Session Button */}
      <div
        className="clay-card"
        style={{
          padding: '14px 22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onOpenModelsPage}
            className="clay-btn"
            style={{ padding: '7px 14px', fontSize: '0.78rem' }}
          >
            <Cpu size={14} />
            <span>
              RESHAPER: {config.reshaperModel} (
              {config.reshaperProvider.toUpperCase()})
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenModelsPage}
            className="clay-btn"
            style={{ padding: '7px 14px', fontSize: '0.78rem' }}
          >
            <Layers size={14} />
            <span>
              SYNTHESIZER: {config.generatorModel} (
              {config.generatorProvider.toUpperCase()})
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="clay-btn"
            style={{ padding: '7px 14px', fontSize: '0.76rem' }}
            onClick={() => setClearedAfterTimestamp(Date.now())}
          >
            <RotateCcw size={13} />
            <span>NEW CHAT VIEW</span>
          </button>
        </div>
      </div>

      {/* Center Conversational Chat Thread */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          flex: 1,
        }}
      >
        {visibleTurns.length === 0 && !isExecuting ? (
          /* Empty Chat Starter Grid (Like ChatGPT / Gemini Home Screen) */
          <div
            className="clay-card"
            style={{
              padding: '38px 34px',
              textAlign: 'center',
              margin: 'auto 0',
            }}
          >
            <span className="clay-tag clay-tag-terracotta">
              AGENTIC RAG CONVERSATIONAL ASSISTANT
            </span>
            <h2
              className="font-display"
              style={{ fontSize: '1.75rem', marginTop: 12, marginBottom: 8 }}
            >
              Ask Anything Across Your Indexed Knowledge Base
            </h2>
            <p
              style={{
                fontSize: '0.94rem',
                color: 'var(--ink-secondary)',
                maxWidth: 640,
                margin: '0 auto 26px',
              }}
            >
              Every question is automatically reshaped by the Small LLM Agent
              (Step-Back + 3 Sub-Queries + HyDE), matched across HNSW + BM25+
              RRF, reranked by the Cross-Encoder CRAG gate, and formatted into a
              cited response.
            </p>

            <div className="grid-2" style={{ textAlign: 'left' }}>
              {STARTER_PROMPTS.map((sp, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -3 }}
                  whileTap={{ y: 1 }}
                  onClick={() => onExecuteQuery(sp.text)}
                  className="clay-card-alt"
                  style={{ cursor: 'pointer', padding: '18px 20px' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span className="clay-tag clay-tag-cobalt">
                      {sp.category}
                    </span>
                    <span
                      className="font-mono"
                      style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}
                    >
                      CLICK TO ASK -&gt;
                    </span>
                  </div>
                  <div
                    className="font-display"
                    style={{ fontSize: '0.95rem', fontWeight: 600 }}
                  >
                    {sp.text}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          visibleTurns.map((turn) => {
            const isTraceOpen = Boolean(expandedTraceIds[turn.queryId]);
            const activeCitTag = selectedCitationByTurn[turn.queryId];
            const activeCitationObj = turn.citations.find((c) =>
              activeCitTag ? c.citationTag.includes(activeCitTag) || activeCitTag.includes(c.documentTitle) : false
            );

            return (
              <div
                key={turn.queryId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                {/* 1. User Message Bubble (Right-Aligned Sculpted Clay Bubble) */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    className="clay-card-alt"
                    style={{
                      maxWidth: '78%',
                      backgroundColor: 'var(--clay-charcoal)',
                      color: 'var(--ink-on-accent)',
                      borderColor: 'rgba(255, 255, 255, 0.18)',
                      boxShadow: 'var(--shadow-clay-charcoal)',
                      padding: '16px 22px',
                      borderRadius: '24px 24px 6px 24px',
                    }}
                  >
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '0.68rem',
                        opacity: 0.72,
                        marginBottom: 4,
                        letterSpacing: '0.04em',
                      }}
                    >
                      USER PROMPT
                    </div>
                    <div
                      style={{
                        fontSize: '0.98rem',
                        fontWeight: 600,
                        lineHeight: 1.5,
                      }}
                    >
                      {turn.promptReshape.originalPrompt}
                    </div>
                  </div>
                </div>

                {/* 2. Assistant Response Slab (Gemini / ChatGPT Style Rich Formatted Response) */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="clay-card"
                  style={{
                    padding: '24px 28px',
                    borderRadius: '26px 26px 26px 8px',
                  }}
                >
                  {/* Top Collapsible "Agentic Thinking & Retrieval Process" Bar (Like Gemini "Show Thinking") */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                      paddingBottom: 14,
                      marginBottom: 18,
                      borderBottom: '2px solid rgba(164, 152, 138, 0.22)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTrace(turn.queryId)}
                      className="clay-btn"
                      style={{
                        padding: '7px 14px',
                        fontSize: '0.76rem',
                        backgroundColor: isTraceOpen
                          ? 'var(--clay-well)'
                          : 'var(--clay-surface-alt)',
                      }}
                    >
                      <Cpu size={14} />
                      <span>
                        AGENTIC THINKING &amp; RETRIEVAL PROCESS (
                        {turn.metrics.latencyBreakdown.totalMs} ms • +
                        {turn.metrics.promptReshapingLiftPct}% Prompt Lift •{' '}
                        {turn.retrievedChunks.length} Verified Chunks)
                      </span>
                      {isTraceOpen ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span className="clay-tag clay-tag-sage">
                        <ShieldCheck size={12} />
                        <span>
                          GROUNDED:{' '}
                          {(
                            turn.metrics.groundednessFaithfulness * 100
                          ).toFixed(1)}
                          %
                        </span>
                      </span>
                      <span className="clay-tag clay-tag-cobalt">
                        NDCG@K: {(turn.metrics.ndcgAtK * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Expandable Thinking & Reranking Accordion */}
                  <AnimatePresence>
                    {isTraceOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ overflow: 'hidden', marginBottom: 20 }}
                      >
                        <div
                          className="clay-well"
                          style={{
                            padding: '18px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 14,
                          }}
                        >
                          <div className="grid-2" style={{ gap: 14 }}>
                            <div className="clay-card-alt">
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  color: 'var(--clay-terracotta)',
                                  marginBottom: 4,
                                }}
                              >
                                STAGE 01 // SMALL LLM RESHAPED QUERY (
                                {turn.promptReshape.modelUsed})
                              </div>
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  marginBottom: 8,
                                }}
                              >
                                {turn.promptReshape.reshapedPrimaryQuery}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.76rem',
                                  color: 'var(--ink-secondary)',
                                }}
                              >
                                <strong>Sub-Queries:</strong>{' '}
                                {turn.promptReshape.subQueries.join(' | ')}
                              </div>
                            </div>

                            <div className="clay-card-alt">
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  color: 'var(--clay-sage)',
                                  marginBottom: 4,
                                }}
                              >
                                STAGE 02 // HYDE HYPOTHETICAL ANSWER ANCHOR
                              </div>
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: '0.78rem',
                                  color: 'var(--ink-secondary)',
                                }}
                              >
                                {turn.promptReshape.hydeDocument}
                              </div>
                            </div>
                          </div>

                          {/* Top Reranked Chunks Summary Table */}
                          <div>
                            <div
                              className="font-mono"
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                marginBottom: 6,
                                color: 'var(--ink-muted)',
                              }}
                            >
                              STAGE 03 // HYBRID RRF + CROSS-ENCODER RERANKED
                              CHUNKS
                            </div>
                            <div className="grid-3" style={{ gap: 10 }}>
                              {turn.retrievedChunks.slice(0, 3).map((rc) => (
                                <div
                                  key={rc.chunkId}
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
                                    <span className="clay-tag clay-tag-terracotta">
                                      RANK #{rc.finalRank}
                                    </span>
                                    <span className="clay-tag clay-tag-sage">
                                      {(rc.rerankScore * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {rc.sectionPath}
                                  </div>
                                  <div
                                    className="font-mono"
                                    style={{
                                      fontSize: '0.68rem',
                                      color: 'var(--ink-secondary)',
                                    }}
                                  >
                                    Dense: {(rc.denseScore * 100).toFixed(0)}% •
                                    BM25+: {(rc.sparseScore * 100).toFixed(0)}%
                                    • Strategy: {rc.strategy}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Rich Formatted Response Body (Like Gemini & ChatGPT - Headings, Tables, Lists, Code, Citations) */}
                  <div style={{ padding: '4px 2px 14px' }}>
                    <RichMarkdownRenderer
                      content={turn.answer}
                      onSelectCitationTag={(tag) => {
                        setSelectedCitationByTurn((prev) => ({
                          ...prev,
                          [turn.queryId]:
                            prev[turn.queryId] === tag ? null : tag,
                        }));
                      }}
                    />
                  </div>

                  {/* Interactive Source Citations Chips Bar + Actions */}
                  <div
                    style={{
                      paddingTop: 14,
                      borderTop: '2px solid rgba(164, 152, 138, 0.22)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
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
                        SOURCES:
                      </span>
                      {turn.citations.map((cit, cIdx) => {
                        const isCitOpen =
                          selectedCitationByTurn[turn.queryId] ===
                          cit.citationTag;
                        return (
                          <button
                            key={cit.chunkId}
                            type="button"
                            onClick={() =>
                              setSelectedCitationByTurn((prev) => ({
                                ...prev,
                                [turn.queryId]: isCitOpen
                                  ? null
                                  : cit.citationTag,
                              }))
                            }
                            className={`clay-btn ${
                              isCitOpen ? 'clay-btn-terracotta' : ''
                            }`}
                            style={{
                              padding: '5px 11px',
                              fontSize: '0.72rem',
                            }}
                          >
                            <FileText size={12} />
                            <span>
                              [{cIdx + 1}] {cit.documentTitle.slice(0, 26)} (
                              {(cit.relevanceScore * 100).toFixed(0)}%)
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Response Utility Actions (Copy & Save to SQLite Vault) */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="clay-btn"
                        style={{ padding: '6px 12px', fontSize: '0.74rem' }}
                        onClick={() => {
                          navigator.clipboard.writeText(turn.answer);
                          setCopiedTurnId(turn.queryId);
                          setTimeout(() => setCopiedTurnId(null), 1800);
                        }}
                      >
                        {copiedTurnId === turn.queryId ? (
                          <>
                            <Check size={13} />
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>COPY</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className={`clay-btn ${
                          savedTurnId === turn.queryId
                            ? 'clay-btn-sage'
                            : 'clay-btn-charcoal'
                        }`}
                        style={{ padding: '6px 13px', fontSize: '0.74rem' }}
                        onClick={async () => {
                          await onSaveFindingFromChat(turn);
                          setSavedTurnId(turn.queryId);
                          setTimeout(() => setSavedTurnId(null), 2200);
                        }}
                      >
                        <Bookmark size={13} />
                        <span>
                          {savedTurnId === turn.queryId
                            ? 'SAVED TO SQLITE VAULT'
                            : 'SAVE FINDING'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Source Excerpt Drawer when a Source Chip is clicked */}
                  {activeCitationObj && (
                    <div
                      className="clay-well"
                      style={{ marginTop: 12, padding: '14px 18px' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 6,
                        }}
                      >
                        <span className="clay-tag clay-tag-terracotta">
                          {activeCitationObj.citationTag}
                        </span>
                        <span className="clay-tag clay-tag-sage">
                          RERANK CONFIDENCE:{' '}
                          {(activeCitationObj.relevanceScore * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        className="font-display"
                        style={{
                          fontSize: '0.92rem',
                          fontWeight: 700,
                          marginBottom: 4,
                        }}
                      >
                        Section: {activeCitationObj.sectionPath}
                      </div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        {activeCitationObj.excerpt}
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })
        )}

        {/* Live Thinking Skeleton when executing */}
        {isExecuting && (
          <div className="clay-card" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="clay-tag clay-tag-terracotta">
                AGENTIC PIPELINE ACTIVE
              </span>
              <span
                className="font-display"
                style={{ fontSize: '0.95rem', fontWeight: 700 }}
              >
                Small LLM reshaping prompt -&gt; HNSW + BM25+ RRF retrieval
                -&gt; Cross-Encoder CRAG reranking -&gt; Synthesizing response...
              </span>
            </div>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Bottom Docked ChatGPT / Gemini Style Clay / Liquid Glass Capsule Prompt Composer */}
      <div
        className="clay-card liquid-capsule-dock"
        style={{
          padding: '18px 24px',
          position: 'sticky',
          bottom: 16,
          zIndex: 10,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.tif,.docx,.xlsx,.xls,.csv,.tsv,.html,.htm,.xml,.md,.txt,.json"
          style={{ display: 'none' }}
          onChange={handleFileAttach}
        />

        <form onSubmit={handleSubmit}>
          <div className="chat-composer-grid">
            {/* Direct File / OCR Image Upload Button inside Chat Bar */}
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ y: 1 }}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="clay-btn chat-composer-attach"
              title="Attach PDF, Scanned Image for OCR, DOCX, XLSX, CSV, HTML, or Markdown"
              style={{ padding: '14px 16px' }}
            >
              <Upload size={17} />
              <span>ATTACH DOC / OCR</span>
            </motion.button>

            <textarea
              rows={2}
              className="clay-input chat-composer-input"
              placeholder="Message RAG_BUDDY Assistant... (Press Enter to send, Shift+Enter for new line)"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                resize: 'none',
                padding: '12px 18px',
                fontSize: '0.96rem',
              }}
            />

            <motion.button
              whileHover={{ y: -2, scale: 1.02 }}
              whileTap={{ y: 2, scale: 0.98 }}
              type="submit"
              disabled={isExecuting || !promptInput.trim()}
              className="clay-btn clay-btn-terracotta liquid-orb-send-btn chat-composer-send"
              style={{ padding: '15px 28px', fontSize: '0.94rem' }}
            >
              <Send size={17} />
              <span>SEND</span>
            </motion.button>
          </div>
        </form>

        {/* Bottom Composer Pipeline Switches & Quick Starters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              {
                key: 'enableHyde' as const,
                label: 'HyDE Anchor',
                val: config.enableHyde,
              },
              {
                key: 'enableMultiQuery' as const,
                label: '3-Way Multi-Query',
                val: config.enableMultiQuery,
              },
              {
                key: 'enableCrossEncoderRerank' as const,
                label: 'Cross-Encoder Rerank',
                val: config.enableCrossEncoderRerank,
              },
              {
                key: 'enableCragFilter' as const,
                label: 'CRAG Noise Gate',
                val: config.enableCragFilter,
              },
            ].map((sw) => (
              <button
                key={sw.key}
                type="button"
                className={`clay-btn ${sw.val ? 'clay-btn-sage' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.71rem' }}
                onClick={() => onUpdateConfig({ [sw.key]: !sw.val })}
              >
                <span>{sw.label}:</span>
                <strong>{sw.val ? 'ON' : 'OFF'}</strong>
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {STARTER_PROMPTS.slice(0, 2).map((sp, idx) => (
              <button
                key={idx}
                type="button"
                className="clay-btn"
                style={{ padding: '4px 10px', fontSize: '0.71rem' }}
                onClick={() => onExecuteQuery(sp.text)}
              >
                Ask: {sp.category}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
