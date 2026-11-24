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
  X,
  Eye,
  Compass,
  Pencil,
} from 'lucide-react';
import {
  AgenticRagResponse,
  ChatSession,
  ChunkStrategyType,
  DocumentChunk,
  IngestedDocument,
  RagPipelineConfig,
} from '../types';
import { RichMarkdownRenderer } from '../components/RichMarkdownRenderer';

interface ChatHomePageProps {
  queryHistory: AgenticRagResponse[];
  chatSessions?: ChatSession[];
  activeChatId?: string | null;
  config: RagPipelineConfig;
  documents?: IngestedDocument[];
  chunks?: Array<Omit<DocumentChunk, 'embedding' | 'sparseTerms'>>;
  isExecuting: boolean;
  streamingState?: {
    stage: number;
    stageLabel: string;
    partialAnswer: string;
    chunkCount: number;
  } | null;
  onExecuteQuery: (prompt: string) => Promise<void>;
  onCreateChat?: (initialTitle?: string) => Promise<void>;
  onSelectChat?: (chatId: string) => void;
  onRenameChat?: (chatId: string, newTitle: string) => Promise<void>;
  onDeleteChat?: (chatId: string) => Promise<void>;
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
  onClearHistory?: () => Promise<void>;
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
  chatSessions = [],
  activeChatId = null,
  config,
  documents = [],
  chunks = [],
  isExecuting,
  streamingState = null,
  onExecuteQuery,
  onCreateChat,
  onRenameChat,
  onUpdateConfig,
  onUploadFiles,
  onSaveFindingFromChat,
  onOpenModelsPage,
}) => {
  const [promptInput, setPromptInput] = useState<string>('');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [expandedTraceIds, setExpandedTraceIds] = useState<Record<string, boolean>>({});
  const [selectedCitationByTurn, setSelectedCitationByTurn] = useState<
    Record<string, string | null>
  >({});
  const [previewModal, setPreviewModal] = useState<{
    turn: AgenticRagResponse;
    sourceIndex: number;
  } | null>(null);
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);
  const [savedTurnId, setSavedTurnId] = useState<string | null>(null);
  const [isRenamingHeader, setIsRenamingHeader] = useState<boolean>(false);
  const [headerRenameDraft, setHeaderRenameDraft] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const highlightedChunkRef = useRef<HTMLElement | null>(null);

  const activeChatSession = chatSessions.find(
    (cs) => cs.chatId === activeChatId
  );

  useEffect(() => {
    setIsRenamingHeader(false);
  }, [activeChatId]);

  // Order history chronologically (oldest -> newest) scoped to the active chat session
  const visibleTurns = [...queryHistory]
    .filter((q) => {
      if (!activeChatId) return false;
      return q.chatId === activeChatId;
    })
    .reverse();

  // Live elapsed timer & stage progression while LLM is generating an answer
  useEffect(() => {
    if (!isExecuting) {
      setPendingPrompt(null);
      setElapsedMs(0);
      return;
    }
    const t0 = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - t0);
    }, 150);
    return () => window.clearInterval(timer);
  }, [isExecuting]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: streamingState?.partialAnswer ? 'auto' : 'smooth',
      });
    }
  }, [
    visibleTurns.length,
    isExecuting,
    pendingPrompt,
    streamingState?.partialAnswer,
  ]);

  // Auto-scroll the Floating Document Preview Window directly to the highlighted passage first
  useEffect(() => {
    if (!previewModal) return;
    // Immediate jump so the user sees the highlighted passage first on open
    const tFast = window.setTimeout(() => {
      highlightedChunkRef.current?.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      });
    }, 15);
    // Smooth fine-tune once modal layout settles
    const tSmooth = window.setTimeout(() => {
      highlightedChunkRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 110);
    return () => {
      window.clearTimeout(tFast);
      window.clearTimeout(tSmooth);
    };
  }, [previewModal]);

  const openSourcePreviewModal = (
    turn: AgenticRagResponse,
    tagOrIdx: string | number
  ) => {
    let resolvedIdx = 0;
    if (typeof tagOrIdx === 'number') {
      resolvedIdx = tagOrIdx;
    } else {
      const numMatch = tagOrIdx.match(/Source\s+(\d+)/i);
      if (numMatch) {
        resolvedIdx = Math.max(
          0,
          Math.min(turn.citations.length - 1, parseInt(numMatch[1], 10) - 1)
        );
      } else {
        const found = turn.citations.findIndex(
          (c) =>
            c.citationTag.includes(tagOrIdx) ||
            tagOrIdx.includes(c.documentTitle)
        );
        if (found >= 0) resolvedIdx = found;
      }
    }
    if (turn.citations[resolvedIdx]) {
      setSelectedCitationByTurn((prev) => ({
        ...prev,
        [turn.queryId]: turn.citations[resolvedIdx].citationTag,
      }));
      setPreviewModal({ turn, sourceIndex: resolvedIdx });
    }
  };

  const triggerQuery = async (text: string) => {
    if (!text.trim() || isExecuting) return;
    const clean = text.trim();
    setPendingPrompt(clean);
    await onExecuteQuery(clean);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptInput.trim() || isExecuting) return;
    const toSend = promptInput.trim();
    setPromptInput('');
    await triggerQuery(toSend);
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
    <div className="chat-page-shell">
      {/* Top Bar: Active Model Switch Pill & New Chat Session Button */}
      <div
        className="clay-card"
        style={{
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {activeChatSession && (
            isRenamingHeader ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  autoFocus
                  value={headerRenameDraft}
                  onChange={(e) => setHeaderRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && onRenameChat) {
                      onRenameChat(activeChatSession.chatId, headerRenameDraft);
                      setIsRenamingHeader(false);
                    } else if (e.key === 'Escape') {
                      setIsRenamingHeader(false);
                    }
                  }}
                  className="clay-input"
                  style={{
                    padding: '5px 10px',
                    fontSize: '0.78rem',
                    width: 210,
                    borderRadius: 10,
                  }}
                />
                <button
                  type="button"
                  className="clay-btn clay-btn-terracotta"
                  style={{ padding: '6px 10px', fontSize: '0.72rem' }}
                  onClick={() => {
                    if (onRenameChat) {
                      onRenameChat(activeChatSession.chatId, headerRenameDraft);
                    }
                    setIsRenamingHeader(false);
                  }}
                >
                  <Check size={13} />
                  <span>SAVE</span>
                </button>
                <button
                  type="button"
                  className="clay-btn"
                  style={{ padding: '6px 8px', fontSize: '0.72rem' }}
                  onClick={() => setIsRenamingHeader(false)}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="clay-tag clay-tag-terracotta"
                  style={{
                    maxWidth: 230,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={activeChatSession.title}
                >
                  {activeChatSession.title}
                </span>
                {onRenameChat && (
                  <button
                    type="button"
                    className="clay-btn"
                    title="Rename this chat conversation"
                    style={{ padding: '5px 9px', fontSize: '0.7rem' }}
                    onClick={() => {
                      setHeaderRenameDraft(activeChatSession.title);
                      setIsRenamingHeader(true);
                    }}
                  >
                    <Pencil size={12} />
                    <span>RENAME</span>
                  </button>
                )}
              </div>
            )
          )}

          <button
            type="button"
            onClick={onOpenModelsPage}
            className="clay-btn"
            style={{ padding: '7px 12px', fontSize: '0.74rem' }}
          >
            <Layers size={13} />
            <span>
              {config.generatorModel} ({config.generatorProvider.toUpperCase()})
            </span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="clay-btn clay-btn-terracotta"
            style={{ padding: '7px 14px', fontSize: '0.75rem' }}
            onClick={async () => {
              if (onCreateChat) {
                await onCreateChat('New Chat');
              }
            }}
          >
            <Plus size={13} />
            <span>NEW CHAT</span>
          </button>
        </div>
      </div>

      {/* Center Conversational Chat Thread (Dedicated Independent Scroll Viewport) */}
      <div ref={chatScrollRef} className="chat-thread-scroll">
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
                  onClick={() => triggerQuery(sp.text)}
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
                      onSelectCitationTag={(tag) =>
                        openSourcePreviewModal(turn, tag)
                      }
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
                            data-tooltip={`Click to open Source #${cIdx + 1} (${cit.sectionPath}) in Document Preview & highlight`}
                            onClick={() => openSourcePreviewModal(turn, cIdx)}
                            className={`clay-btn source-citation-pill ${
                              isCitOpen ? 'clay-btn-terracotta' : ''
                            }`}
                            style={{
                              padding: '5px 11px',
                              fontSize: '0.72rem',
                            }}
                          >
                            <Eye size={12} />
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

        {/* Live Pending User Bubble + Multi-Stage LLM Answering Animation when executing */}
        {isExecuting && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pendingPrompt && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                    {pendingPrompt}
                  </div>
                </div>
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="clay-card"
              style={{
                padding: '22px 26px',
                borderRadius: '26px 26px 26px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {/* Top Row: Animated Equalizer Wave + Live Stage Label + Elapsed Timer */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="answering-wave-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div>
                    <div
                      className="font-display"
                      style={{ fontSize: '0.98rem', fontWeight: 700 }}
                    >
                      {streamingState?.stageLabel
                        ? streamingState.stageLabel
                        : elapsedMs < 850
                        ? `Stage 01 // Small LLM Reshaping Prompt & Expanding Domain Concepts...`
                        : elapsedMs < 1700
                        ? `Stage 02 // Searching 3-Layer HNSW Graph + BM25+ Lexical Index...`
                        : elapsedMs < 2500
                        ? `Stage 03 // Cross-Encoder Reranking & CRAG Relevance Gating...`
                        : `Stage 04 // Synthesizing Grounded Answer via ${config.generatorModel}...`}
                    </div>
                    <div
                      className="font-mono"
                      style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}
                    >
                      {streamingState?.partialAnswer
                        ? `LIVE SSE STREAMING${
                            streamingState.chunkCount > 0
                              ? ` • ${streamingState.chunkCount} VERIFIED CHUNKS`
                              : ''
                          }`
                        : 'RAG_BUDDY IS GENERATING YOUR CITED RESPONSE'}
                    </div>
                  </div>
                </div>

                <span className="clay-tag clay-tag-terracotta">
                  {streamingState?.partialAnswer ? 'STREAMING' : 'GENERATING'} •{' '}
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              </div>

              {/* 4-Step Pipeline Stage Progress Pills */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 8,
                }}
              >
                {[
                  { label: '01 RESHAPE', stageNum: 1, threshold: 0 },
                  { label: '02 HNSW + BM25+', stageNum: 2, threshold: 850 },
                  { label: '03 CRAG RERANK', stageNum: 3, threshold: 1700 },
                  { label: '04 SSE STREAM', stageNum: 4, threshold: 2500 },
                ].map((st, sIdx) => {
                  const isActiveOrDone = streamingState
                    ? streamingState.stage >= st.stageNum
                    : elapsedMs >= st.threshold;
                  return (
                    <div
                      key={sIdx}
                      className="font-mono"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        fontSize: '0.66rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        backgroundColor: isActiveOrDone
                          ? 'var(--clay-terracotta)'
                          : 'var(--clay-well)',
                        color: isActiveOrDone
                          ? 'var(--ink-on-accent)'
                          : 'var(--ink-muted)',
                        transition: 'background-color 0.2s ease, color 0.2s ease',
                      }}
                    >
                      {st.label}
                    </div>
                  );
                })}
              </div>

              {/* Live Streamed Markdown Tokens OR Shimmer Skeleton Lines while retrieving */}
              {streamingState?.partialAnswer ? (
                <div
                  style={{
                    paddingTop: 6,
                    borderTop: '1px solid var(--clay-border-light)',
                  }}
                >
                  <RichMarkdownRenderer content={streamingState.partialAnswer} />
                  <span className="sse-streaming-cursor" aria-hidden="true" />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div className="answering-shimmer-line" style={{ width: '92%' }} />
                  <div className="answering-shimmer-line" style={{ width: '78%' }} />
                  <div className="answering-shimmer-line" style={{ width: '64%' }} />
                </div>
              )}
            </motion.div>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Bottom Docked ChatGPT / Gemini Style Clay / Liquid Glass Capsule Prompt Composer */}
      <div
        className="clay-card liquid-capsule-dock"
        style={{
          padding: '16px 22px',
          flexShrink: 0,
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
              <span>{isExecuting ? 'GENERATING...' : 'SEND'}</span>
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
                onClick={() => triggerQuery(sp.text)}
              >
                Ask: {sp.category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Floating Document Preview Modal Window with Highlighted Cited Passage */}
      <AnimatePresence>
        {previewModal && (() => {
          const { turn, sourceIndex } = previewModal;
          const activeCit = turn.citations[sourceIndex] || turn.citations[0];
          const activeRetrievedChunk =
            turn.retrievedChunks.find((rc) => rc.chunkId === activeCit?.chunkId) ||
            turn.retrievedChunks[sourceIndex] ||
            turn.retrievedChunks[0];

          if (!activeCit || !activeRetrievedChunk) return null;

          const docId = activeRetrievedChunk.documentId;
          const docChunks = chunks
            .filter((c) => c.documentId === docId)
            .sort((a, b) => a.index - b.index);
          const matchedDoc = documents.find((d) => d.id === docId);

          const renderSections =
            docChunks.length > 0
              ? docChunks.map((dc) => ({
                  id: dc.id,
                  index: dc.index,
                  sectionPath: dc.sectionPath,
                  content: dc.content,
                  tokenCount: dc.tokenCount,
                  strategy: dc.strategy,
                }))
              : [
                  {
                    id: activeRetrievedChunk.chunkId,
                    index: 1,
                    sectionPath: activeRetrievedChunk.sectionPath,
                    content: activeRetrievedChunk.content,
                    tokenCount: activeRetrievedChunk.tokenCount,
                    strategy: activeRetrievedChunk.strategy,
                  },
                ];

          const stripSyntheticChunkHeader = (raw: string): string => {
            return raw
              .replace(/^\[[^\]]+\]\s*\r?\n?/, '')
              .replace(/^###\s+[^\r\n]+\r?\n?/, '')
              .replace(/\r?\n?\[Adjacent Document Continuation\]:[\s\S]*$/, '')
              .trim();
          };

          const extractCleanHeading = (sectionPath: string, docTitle: string): string => {
            if (!sectionPath) return '';
            const parts = sectionPath.split('>').map((p) => p.trim());
            if (parts.length > 1) {
              return parts.slice(1).join(' › ');
            }
            return sectionPath === docTitle ? '' : sectionPath;
          };

          // Restores original document line breaks, unwraps multi-line vertical PDF table cell labels,
          // and formats numbered rows, clauses, and headings
          const restoreDocumentStructure = (raw: string): string => {
            let t = raw.replace(/\r\n/g, '\n');

            // 1. Unwrap vertical multi-line broken CIS / Schedule cell titles from pypdf
            t = t.replace(
              /Sl\.[\s\n]+No\.[\s\n]+Title[\s\n]+Description[^\n]*/gi,
              '\nSl. No. Title Description Policy Clause Number\n'
            );
            t = t.replace(
              /(?:^|\n)\s*1\.[\s\n]+Name of[\s\n]+Insurance[\s\n]+Product\/[\s\n]+Policy[\s\n]+([^\n]+)/gi,
              '\n1. Name of Insurance Product/ Policy: $1'
            );
            t = t.replace(
              /(?:^|\n)\s*2\.[\s\n]+Policy[\s\n]+Number[\s\n]+([^\n]+)/gi,
              '\n2. Policy Number: $1'
            );
            t = t.replace(
              /(?:^|\n)\s*3\.[\s\n]+Type of[\s\n]+Insurance[\s\n]+Product\/[\s\n]+Policy[\s\n]+([^\n]+)/gi,
              '\n3. Type of Insurance Product/ Policy: $1'
            );
            t = t.replace(
              /(?:^|\n)\s*4\.[\s\n]+Sum[\s\n]+Insured[\s\n]+\(Basis\)[\s\n]+([^\n]+)/gi,
              '\n4. Sum Insured (Basis): $1'
            );
            t = t.replace(
              /(?:^|\n)\s*5\.[\s\n]+Policy[\s\n]+Coverage[\s\n]+\(What the[\s\n]+Policy[\s\n]+Covers\)[\s\n]*/gi,
              '\n5. Policy Coverage (What the Policy Covers): '
            );
            t = t.replace(
              /(?:^|\n)\s*6\.[\s\n]+Exclusion[\s\n]*s[\s\n]+\(What[\s\n]+the policy[\s\n]+does not[\s\n]+cover\)[\s\n]*/gi,
              '\n6. Exclusions (What the policy does not cover): '
            );
            t = t.replace(
              /(?:^|\n)\s*7\.[\s\n]+Waitin[\s\n]*g[\s\n]+period[\s\n]*/gi,
              '\n7. Waiting period: '
            );
            t = t.replace(
              /(?:^|\n)\s*8\.[\s\n]+Financial[\s\n]+Limits of[\s\n]+the[\s\n]+Coverag[\s\n]*e[\s\n]*/gi,
              '\n8. Financial Limits of the Coverage: '
            );
            t = t.replace(
              /(?:^|\n)\s*9\.[\s\n]+Claims\/[\s\n]+Claims[\s\n]+Procedure[\s\n]*/gi,
              '\n9. Claims/ Claims Procedure: '
            );
            t = t.replace(
              /(?:^|\n)\s*10\.[\s\n]+Policy[\s\n]+Servicing[\s\n]*/gi,
              '\n10. Policy Servicing: '
            );
            t = t.replace(
              /(?:^|\n)\s*11\.[\s\n]+Grievances\/[\s\n]+Complaints[\s\n]*/gi,
              '\n11. Grievances/ Complaints: '
            );
            t = t.replace(
              /(?:^|\n)\s*12\.[\s\n]+Things to[\s\n]+remember[\s\n]*/gi,
              '\n12. Things to remember: '
            );
            t = t.replace(
              /(?:^|\n)\s*13\.[\s\n]+Your Obligations[\s\n]+/gi,
              '\n13. Your Obligations: '
            );

            // 2. Unwrap vertical multi-line broken Schedule of Benefits / Policyholder table labels (Pages 1, 9, 10)
            t = t.replace(
              /No of Primary Insured Persons[\s\n]+covered[\s\n]+(\d+)/gi,
              'No of Primary Insured Persons covered: $1'
            );
            t = t.replace(
              /Total No of Insured Persons[\s\n]+Covered[\s\n]+(\d+)/gi,
              'Total No of Insured Persons Covered: $1'
            );
            t = t.replace(
              /Address[\s\n]+(49A[^\n]+)[\s\n]+(NORTH WEST[^\n]+)[\s\n]+(City:[^\n]+)[\s\n]+(Pin-code:[^\n]+)/gi,
              'Address: $1, $2, $3, $4'
            );
            t = t.replace(
              /Intermediary Name\s+(.+?)\s+Intermediary Code\s+(\S+)/gi,
              'Intermediary Name: $1\nIntermediary Code: $2'
            );
            t = t.replace(
              /Master Policy No:\s*(\S+)\s+Servicing Branch Office:\s*(.+?)\s+Issue Date:\s*(\S+)/gi,
              'Master Policy No: $1\nServicing Branch Office: $2\nIssue Date: $3'
            );

            t = t.replace(
              /Alternative Treatment Inpatient[\s\n]+expenses[\s\n]+(AYUSH[^\n]+(?:[\s\n]+(?:and subject|government and|Health)[^\n]*)*)/gi,
              (_m, p1) =>
                `Alternative Treatment Inpatient expenses: ${String(p1).replace(
                  /\s*\n\s*/g,
                  ' '
                )}`
            );
            t = t.replace(
              /Pre-hospitalization Medical[\s\n]+expenses[\s\n]+(Covered[^\n]+)/gi,
              'Pre-hospitalization Medical expenses: $1'
            );
            t = t.replace(
              /Post-hospitalization Medical[\s\n]+expenses[\s\n]+(Covered[^\n]+)/gi,
              'Post-hospitalization Medical expenses: $1'
            );
            t = t.replace(
              /Room Rent Capping[\s\n]+(No Room rent[^\n]+)/gi,
              'Room Rent Capping: $1'
            );
            t = t.replace(
              /Waiting period for Pre-\s*Existing[\s\n]+Diseases \(PED\)[\s\n]+(Pre-\s*Existing[^\n]+)/gi,
              'Waiting period for Pre-Existing Diseases (PED): $1'
            );
            t = t.replace(
              /Wellness\/Health check up\/OPD[\s\n]+Discount[\s\n]+(Not Applicable[^\n]*)/gi,
              'Wellness/Health check up/OPD Discount: $1'
            );
            t = t.replace(
              /Dieasewise capping \(Per[\s\n]+incidence limit\)[\s\n]+(Not Applicable[^\n]*)/gi,
              'Diseasewise capping (Per incidence limit): $1'
            );
            t = t.replace(
              /New Born Baby Cover from Day[\s\n]+1[\s\n]+(Baby not covered[^\n]*)/gi,
              'New Born Baby Cover from Day 1: $1'
            );
            t = t.replace(
              /Infertility Cover and Surrogacy[\s\n]+Cover[\s\n]+(Not Covered[^\n]*)/gi,
              'Infertility Cover and Surrogacy Cover: $1'
            );
            t = t.replace(
              /L\.\s*Stem Cell Therapy:([^\n]+)\n(conditions to be covered\.)/gi,
              'L. Stem Cell Therapy:$1 $2'
            );

            // 3. Also handle flattened single-line text (if reconstructed from chunks)
            t = t.replace(/\s*\*{3,}\s*/g, '\n\n***\n\n');
            t = t.replace(/([A-Z0-9]{6,})\s+(Tollfree\s*:)/g, '$1\n$2');
            t = t.replace(
              /(\.[a-z]{2,4}(?:\/[^\s]*)?)\s+([A-Z]{3,}(?:\s+[A-Z]{2,})+)/g,
              '$1\n\n$2'
            );
            t = t.replace(
              /(GROUP MEDICLAIM POLICY\s+CUSTOMER INFORMATION SHEET|CUSTOMER INFORMATION SHEET|GROUP MEDICLAIM POLICY)\s+([A-Z][a-z])/g,
              '$1\n\n$2'
            );
            t = t.replace(/([.!?])\s+(Sl\.\s*No\.)/g, '$1\n\n$2');
            t = t.replace(/(Policy Clause Number)\s+(?=\d)/g, '$1\n');
            t = t.replace(/\s+("?Following are covered)/g, '\n$1');
            t = t.replace(/\s+(Section\s+[A-Z]\s*[-–:])/g, '\n\n$1');
            t = t.replace(
              /([A-Za-z0-9)"'\]%])\s+"?((?:[1-9]|1\d|2[0-5])\.\s+[A-Z"(])/g,
              '$1\n$2'
            );
            t = t.replace(
              /(Cover|[.!?])\s+([1-9]\s+(?:Modification|Emergency|Air|External|Inpatient|Organ|Day|Pre-|Post-|Modern|Initial|Specified|Domiciliary|Maternity|Ambulance|Ayush|Bariatric)[A-Za-z\s])/g,
              '$1\n$2'
            );
            t = t.replace(
              /([A-Za-z]{3,})\s+([2-9]\s+(?:Modification|Emergency|Air|External|Inpatient|Organ|Day|Pre-|Post-|Modern|Initial|Specified|Domiciliary|Maternity|Ambulance|Ayush|Bariatric)[A-Za-z\s])/g,
              '$1\n$2'
            );
            t = t.replace(
              /([.!?)"']|\bProcedure|\bhospital)\s+([a-f]\.\s+[A-Z])/g,
              '$1\n$2'
            );
            t = t.replace(/([.!?)"'])\s+(Note\s*:)/g, '$1\n\n$2');
            t = t.replace(
              /([.!?)"'])\s+(Waiting period and exclusions)/gi,
              '$1\n\n$2'
            );
            t = t.replace(
              /(Waiting period and exclusions)\s+(?=\d)/gi,
              '$1\n'
            );
            t = t.replace(
              /([.!?)"'])\s+(Financial Limits of the Coverage|Financial Limits of the Coverag\s*e)/gi,
              '$1\n\n$2'
            );
            t = t.replace(/\n{3,}/g, '\n\n');
            return t.trim();
          };

          interface OffsetLine {
            text: string;
            trimmed: string;
            start: number;
            end: number;
          }

          interface ParsedTableRow {
            cells: string[];
            start: number;
            end: number;
          }

          type PageContentBlock =
            | {
                kind: 'paragraph';
                lines: OffsetLine[];
              }
            | {
                kind: 'table';
                headers: string[];
                rows: ParsedTableRow[];
              };

          const SCHEDULE_KEY_VALUE_REGEX =
            /^(Master Policy No|Servicing Branch Office|Issue Date|Customer ID|Policy Number|Servicing Branch Address|Intermediary Name|Intermediary Code|Contact Details|Name of Policyholder|Address|Administrator\s*\/\s*TPA Name|Coinsurance applicable|PAN No|GSTN No|Email|Previous Policy No|Period of Insurance|No of Primary Insured Persons covered|Total No of Insured Persons Covered|Total Sum Insured|Net Premium|CGST|SGST|IGST|Final Premium\s*\(inclusive of taxes\)|Toll-Free number|Website|Fax No|SMS|Modern Treatments|Alternative Treatment Inpatient expenses|Day Care Treatment|Pre-hospitalization Medical expenses|Post-hospitalization Medical expenses|Room Rent Capping|Organ Donor Cover|Waiting period for Pre-?\s*Existing Diseases\s*\(PED\)|Initial Waiting Period\s*-\s*30 days|Disesase Specific Waiting Period|Disease Specific Waiting Period|Family Definition|Min and Max Entry Age\s*-\s*Adult|Min and Max Entry Age\s*-\s*Child|Scope of Cover|Base Sum Insured|Sum Insured Basis|Hospitlization related to terrorism|Hospitalization related to terrorism|Cochlear Implant|External Congenital Diseases|Emergency Ground Ambulance|Wellness\/Health check up\/OPD Discount|Treatment for Refractive Error|Air Ambulance|No deductions in case of death|Diseasewise capping\s*\(Per incidence limit\)|Dieasewise capping\s*\(Per incidence limit\)|Co-payment|Corporate Floater|Internal Congenital Diseases|Maternity Expenses|New Born Baby Cover from Day 1|Infertility Cover and Surrogacy Cover|Domiciliary Hospitalization|Group to Retail portability clause)\s*:?\s*(.*)$/i;

          const parseStructuredTableRow = (
            trimmed: string
          ): {
            cells: string[];
            headersHint: string[];
            allowMultilineContinuation?: boolean;
          } | null => {
            if (!trimmed) return null;

            // 1. CIS / Policy Schedule Known Field Rows (e.g. "1. Name of Insurance Product/ Policy: Group Mediclaim Policy")
            const cisMatch = trimmed.match(
              /^["']?(\d{1,2})\.\s+(Name of Insurance Product\/\s*Policy|Policy Number|Type of Insurance Product\/\s*Policy|Sum Insured\s*\(Basis\)|Policy Coverage\s*\(What the Policy Covers\)|Policy Coverage|Exclusions\s*\(what the policy does not cover\)|Waitin\s*g\s*period|Waiting\s*period|Financial Limits of the\s*Coverag\s*e|Financial Limits of the\s*Coverage|Claims\/\s*Claims Procedure|Policy Servicing|Grievances\/\s*Complaints|Things to remember|Your Obligations)\s*:?\s*(.*)$/i
            );
            if (cisMatch) {
              const num = `${cisMatch[1]}.`;
              const fieldTitle = cisMatch[2].replace(/\s+/g, ' ').trim();
              const desc =
                cisMatch[3].replace(/^["']+|["']+$/g, '').trim() ||
                'See detailed sub-clauses below';
              return {
                cells: [num, fieldTitle, desc],
                headersHint: [
                  'Sl. No.',
                  'Policy Clause / Title',
                  'Description & Coverage Details',
                ],
                allowMultilineContinuation: false,
              };
            }

            // 2. Co-Insurance 6-Column Numeric Table Rows
            const coinsRow = trimmed.match(
              /^(\d+|Total)\s+(?:([A-Za-z0-9.\-\s]+?)\s+)?(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})$/
            );
            if (coinsRow) {
              return {
                cells: [
                  coinsRow[1],
                  (coinsRow[2] || 'Total').trim(),
                  coinsRow[3],
                  coinsRow[4],
                  coinsRow[5],
                  coinsRow[6],
                ],
                headersHint: [
                  'Sr No',
                  'Name of the Insurance Company',
                  'Co-Insurance Share (%)',
                  'Base Premium (INR)',
                  'Tax (INR)',
                  'Final Premium (INR)',
                ],
                allowMultilineContinuation: false,
              };
            }

            // 3. Instalment 5-Column Numeric Table Rows
            const instRow = trimmed.match(
              /^(\d+)\s+(\d{2}-\d{2}-\d{4})\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})$/
            );
            if (instRow) {
              return {
                cells: [
                  instRow[1],
                  instRow[2],
                  instRow[3],
                  instRow[4],
                  instRow[5],
                ],
                headersHint: [
                  'Sr No',
                  'Installment Date',
                  'Net Premium (INR)',
                  'Taxes (INR)',
                  'Total Premium (INR)',
                ],
                allowMultilineContinuation: false,
              };
            }

            // 4. Numbered, Lettered, or Roman Numeral Colon/Dash-Separated Clause / Exclusion / Waiting Period / TAT Rows
            const colonRowMatch = trimmed.match(
              /^["']?((?:[1-9]|1\d|2[0-5])\.|[a-f]\.|[ivx]{1,4}\.)\s+([^:–\-]{2,85}?)(?::|\s+-\s+)\s*(.+)$/
            );
            if (colonRowMatch) {
              const num = colonRowMatch[1];
              const clauseTitle = colonRowMatch[2].trim();
              const details = colonRowMatch[3]
                .replace(/^["']+|["']+$/g, '')
                .trim();
              return {
                cells: [num, clauseTitle, details],
                headersHint: ['No.', 'Clause / Category', 'Rule / Details'],
                allowMultilineContinuation: true,
              };
            }

            // 5. Uppercase Lettered List Rows (e.g. "A. Uterine Artery Embolization...", "B. Balloon Sinuplasty")
            const upperLetterMatch = trimmed.match(/^([A-L])\.\s+(.+)$/);
            if (upperLetterMatch) {
              return {
                cells: [
                  `${upperLetterMatch[1]}.`,
                  upperLetterMatch[2].trim(),
                ],
                headersHint: ['Code', 'Covered Modern Treatment / Procedure'],
                allowMultilineContinuation: false,
              };
            }

            // 6. Numbered Benefit / Provision Item Rows (e.g. "1. Inpatient care", "1 Modification...", "1. Nursing charges...")
            const numItemMatch = trimmed.match(
              /^["']?(?:((?:[1-9]|1\d|2[0-5])\.)|([1-9])(?=\s+(?:Modification|Emergency|Air|External|Inpatient|Organ|Day|Pre-|Post-|Modern|Initial|Specified|Domiciliary|Maternity|Ambulance|Ayush|Bariatric)\b))\s+(.+)$/
            );
            if (numItemMatch && trimmed.length <= 165) {
              const num = numItemMatch[1] || `${numItemMatch[2]}.`;
              const itemText = numItemMatch[3]
                .replace(/^["']+|["']+$/g, '')
                .trim();
              return {
                cells: [num, itemText],
                headersHint: ['No.', 'Covered Benefit / Policy Provision'],
                allowMultilineContinuation: false,
              };
            }

            // 7. Schedule of Benefits / Policyholder / Premium / Contact 2-Column Key-Value Rows
            const kvMatch = trimmed.match(SCHEDULE_KEY_VALUE_REGEX);
            if (kvMatch) {
              const field = kvMatch[1].replace(/\s+/g, ' ').trim();
              const val = kvMatch[2].replace(/^[:\s,]+/, '').trim() || '—';
              return {
                cells: [field, val],
                headersHint: [
                  'Policy Field / Coverage Head',
                  'Specification / Limit Applicable',
                ],
                allowMultilineContinuation: false,
              };
            }

            return null;
          };

          const isStandaloneSectionBoundary = (s: string): boolean =>
            /^(Sl\.\s*No\.|Sr\s+No|Coverages\s+Coverage Description|Section\s+[A-Z]\s*[-–:]|Note\s*:|Waiting period and exclusions|Scope of Cover|General terms and clauses|Declaration by the Policy Holder|Turn Around Time|List of Modern Treatments|Inpatient care|Other Terms|INTERMEDIARY DETAILS|POLICY HOLDER DETAILS|PREMIUM DETAILS|Co-Insurance Details|INSTALMENT DETAILS|CONTACT DETAILS|FOR HEALTH CLAIM|Stage\s+\d|\*{3,}|•)/i.test(
              s
            );

          const parsePageIntoBlocks = (body: string): PageContentBlock[] => {
            const offsetLines: OffsetLine[] = [];
            let cursor = 0;
            const rawLines = body.split('\n');
            for (const ln of rawLines) {
              const start = cursor;
              const end = cursor + ln.length;
              offsetLines.push({
                text: ln,
                trimmed: ln.trim(),
                start,
                end,
              });
              cursor = end + 1;
            }

            const blocks: PageContentBlock[] = [];
            let paraBuffer: OffsetLine[] = [];

            const flushPara = () => {
              if (paraBuffer.length > 0) {
                blocks.push({ kind: 'paragraph', lines: paraBuffer });
                paraBuffer = [];
              }
            };

            let idx = 0;
            while (idx < offsetLines.length) {
              const cur = offsetLines[idx];

              // Skip raw column header lines that immediately precede a parsed structured table
              if (
                /^(Sr\s+No\s+Name of the Insurance Company|Sr\s+No\s+Installment Date|Coverages\s+Coverage Description)/i.test(
                  cur.trimmed
                ) &&
                idx + 1 < offsetLines.length &&
                parseStructuredTableRow(offsetLines[idx + 1].trimmed)
              ) {
                idx++;
                continue;
              }

              // Case 1: Markdown Pipe Table (| Col 1 | Col 2 |)
              if (
                cur.trimmed.startsWith('|') &&
                cur.trimmed.includes('|', 1)
              ) {
                const pipeLines: OffsetLine[] = [];
                while (
                  idx < offsetLines.length &&
                  offsetLines[idx].trimmed.startsWith('|')
                ) {
                  pipeLines.push(offsetLines[idx]);
                  idx++;
                }
                if (pipeLines.length >= 2) {
                  flushPara();
                  const splitPipe = (s: string) =>
                    s
                      .replace(/^\|/, '')
                      .replace(/\|$/, '')
                      .split('|')
                      .map((c) => c.trim());
                  const headers = splitPipe(pipeLines[0].trimmed);
                  const rows: ParsedTableRow[] = pipeLines
                    .slice(1)
                    .filter((pl) => !/^\|[\s\-:|]+\|$/.test(pl.trimmed))
                    .map((pl) => ({
                      cells: splitPipe(pl.trimmed),
                      start: pl.start,
                      end: pl.end,
                    }));
                  blocks.push({ kind: 'table', headers, rows });
                  continue;
                } else {
                  paraBuffer.push(...pipeLines);
                  continue;
                }
              }

              // Case 2: CIS Table Header Line ("Sl. No. Title Description ... Policy Clause Number")
              const isCisHeaderLine = /^Sl\.\s*No\.\s+Title\s+Description/i.test(
                cur.trimmed
              );
              if (isCisHeaderLine) {
                const tableRows: ParsedTableRow[] = [];
                let look = idx + 1;
                while (look < offsetLines.length) {
                  const candidate = offsetLines[look];
                  if (!candidate.trimmed) {
                    look++;
                    continue;
                  }
                  const parsed = parseStructuredTableRow(candidate.trimmed);
                  if (parsed && parsed.headersHint[0] === 'Sl. No.') {
                    tableRows.push({
                      cells: [...parsed.cells],
                      start: candidate.start,
                      end: candidate.end,
                    });
                    look++;
                  } else {
                    break;
                  }
                }
                if (tableRows.length >= 1) {
                  flushPara();
                  tableRows[0].start = Math.min(cur.start, tableRows[0].start);
                  blocks.push({
                    kind: 'table',
                    headers: [
                      'Sl. No.',
                      'Policy Clause / Title',
                      'Description & Coverage Details',
                    ],
                    rows: tableRows,
                  });
                  idx = look;
                  continue;
                }
              }

              // Case 3: Structured Table Rows (CIS, Co-Insurance, Instalment, Exclusions, Waiting Periods, Benefits, Schedule Key-Values)
              const firstParsed = parseStructuredTableRow(cur.trimmed);
              if (firstParsed) {
                const collected: Array<{
                  cells: string[];
                  headersHint: string[];
                  allowMultilineContinuation?: boolean;
                  start: number;
                  end: number;
                }> = [
                  {
                    cells: [...firstParsed.cells],
                    headersHint: firstParsed.headersHint,
                    allowMultilineContinuation:
                      firstParsed.allowMultilineContinuation,
                    start: cur.start,
                    end: cur.end,
                  },
                ];
                let look = idx + 1;
                while (look < offsetLines.length) {
                  const nextLn = offsetLines[look];
                  if (!nextLn.trimmed) {
                    // Peek ahead 1 line to see if another matching table row continues after a blank line
                    if (look + 1 < offsetLines.length) {
                      const afterBlank = parseStructuredTableRow(
                        offsetLines[look + 1].trimmed
                      );
                      if (
                        afterBlank &&
                        afterBlank.cells.length === firstParsed.cells.length
                      ) {
                        look++;
                        continue;
                      }
                    }
                    break;
                  }

                  const nextParsed = parseStructuredTableRow(nextLn.trimmed);
                  if (
                    nextParsed &&
                    nextParsed.cells.length === firstParsed.cells.length
                  ) {
                    collected.push({
                      cells: [...nextParsed.cells],
                      headersHint: nextParsed.headersHint,
                      allowMultilineContinuation:
                        nextParsed.allowMultilineContinuation,
                      start: nextLn.start,
                      end: nextLn.end,
                    });
                    look++;
                    continue;
                  }

                  // Check if nextLn is a wrapped continuation line of the current table row
                  const prevRow = collected[collected.length - 1];
                  if (
                    !nextParsed &&
                    prevRow.allowMultilineContinuation &&
                    !isStandaloneSectionBoundary(nextLn.trimmed)
                  ) {
                    prevRow.cells[prevRow.cells.length - 1] = `${
                      prevRow.cells[prevRow.cells.length - 1]
                    } ${nextLn.trimmed}`.trim();
                    prevRow.end = nextLn.end;
                    look++;
                    continue;
                  }

                  break;
                }

                if (
                  collected.length >= 2 ||
                  firstParsed.headersHint[0] === 'Sl. No.' ||
                  firstParsed.headersHint[0] === 'Sr No' ||
                  firstParsed.cells.length >= 3 ||
                  firstParsed.headersHint[0] === 'Policy Field / Coverage Head'
                ) {
                  flushPara();
                  blocks.push({
                    kind: 'table',
                    headers: firstParsed.headersHint,
                    rows: collected.map((c) => ({
                      cells: c.cells,
                      start: c.start,
                      end: c.end,
                    })),
                  });
                  idx = look;
                  continue;
                }
              }

              paraBuffer.push(cur);
              idx++;
            }

            flushPara();
            return blocks;
          };

          // Word-token sequence locator that finds the exact [charStart, charEnd] of a cited chunk
          // inside the formatted original document text while preserving 100% of original newlines
          const findPassageCharRange = (
            formattedDocText: string,
            rawChunkText: string
          ): [number, number] | null => {
            const cleanTarget = stripSyntheticChunkHeader(rawChunkText).replace(
              /\(Context:[^)]+\)/gi,
              ''
            );
            const wordRegex = /[A-Za-z0-9]+/g;
            const docTokens: Array<{ w: string; start: number; end: number }> = [];
            let m: RegExpExecArray | null;
            while ((m = wordRegex.exec(formattedDocText)) !== null) {
              docTokens.push({
                w: m[0].toLowerCase(),
                start: m.index,
                end: m.index + m[0].length,
              });
            }
            const targetWords = (cleanTarget.match(/[A-Za-z0-9]+/g) || []).map((w) =>
              w.toLowerCase()
            );
            if (docTokens.length === 0 || targetWords.length === 0) return null;

            const firstWord = targetWords[0];
            const secondWord = targetWords[1];
            let bestStartIdx = -1;
            let bestEndIdx = -1;
            let bestScore = 0;

            for (let i = 0; i < docTokens.length; i++) {
              if (
                docTokens[i].w !== firstWord &&
                (!secondWord || docTokens[i].w !== secondWord)
              ) {
                continue;
              }
              let matchedCount = 0;
              let lastMatchedDocIdx = i;
              let tCursor = docTokens[i].w === firstWord ? 0 : 1;
              const maxScan = Math.min(
                docTokens.length,
                i + targetWords.length + 14
              );

              for (
                let dIdx = i;
                dIdx < maxScan && tCursor < targetWords.length;
                dIdx++
              ) {
                if (docTokens[dIdx].w === targetWords[tCursor]) {
                  matchedCount++;
                  lastMatchedDocIdx = dIdx;
                  tCursor++;
                } else if (
                  tCursor + 1 < targetWords.length &&
                  docTokens[dIdx].w === targetWords[tCursor + 1]
                ) {
                  matchedCount++;
                  lastMatchedDocIdx = dIdx;
                  tCursor += 2;
                }
              }

              const score = matchedCount / targetWords.length;
              if (score > bestScore) {
                bestScore = score;
                bestStartIdx = i;
                bestEndIdx = lastMatchedDocIdx;
                if (score >= 0.96) break;
              }
            }

            if (bestStartIdx < 0 || bestScore < 0.45) return null;
            const charStart = docTokens[bestStartIdx].start;
            let charEnd = docTokens[bestEndIdx].end;
            while (
              charEnd < formattedDocText.length &&
              /[.)"'\];:,]/.test(formattedDocText[charEnd])
            ) {
              charEnd++;
            }
            return [charStart, charEnd];
          };

          const activeCleanHeading = extractCleanHeading(
            activeRetrievedChunk.sectionPath,
            activeRetrievedChunk.documentTitle
          );

          // Build pages directly from matchedDoc.cleanedText || matchedDoc.rawText (preserving original newlines!)
          // with fallback to sequential chunks if matchedDoc is unavailable
          const fullOriginalText =
            matchedDoc?.cleanedText || matchedDoc?.rawText || '';

          const parsedOriginalPages: Array<{
            heading: string;
            formattedBody: string;
          }> = [];

          if (fullOriginalText.trim().length > 0) {
            const lines = fullOriginalText.replace(/\r\n/g, '\n').split('\n');
            let currentHeading = '';
            let currentLines: string[] = [];

            const flushPage = () => {
              const rawJoined = currentLines.join('\n').trim();
              if (rawJoined) {
                parsedOriginalPages.push({
                  heading: currentHeading,
                  formattedBody: restoreDocumentStructure(rawJoined),
                });
              }
              currentLines = [];
            };

            for (const line of lines) {
              const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
              if (headingMatch) {
                flushPage();
                const hText = headingMatch[2].trim();
                currentHeading =
                  hText === activeRetrievedChunk.documentTitle ? '' : hText;
              } else {
                currentLines.push(line);
              }
            }
            flushPage();
          }

          if (parsedOriginalPages.length === 0) {
            const rawByHeading: Array<{ heading: string; parts: string[] }> = [];
            for (const sec of renderSections) {
              const cleanHeading = extractCleanHeading(
                sec.sectionPath,
                activeRetrievedChunk.documentTitle
              );
              const cleanText = stripSyntheticChunkHeader(sec.content);
              if (!cleanText) continue;
              const last = rawByHeading[rawByHeading.length - 1];
              if (!last || last.heading !== cleanHeading) {
                rawByHeading.push({
                  heading: cleanHeading,
                  parts: [cleanText],
                });
              } else {
                last.parts.push(cleanText);
              }
            }
            for (const grp of rawByHeading) {
              parsedOriginalPages.push({
                heading: grp.heading,
                formattedBody: restoreDocumentStructure(grp.parts.join(' ')),
              });
            }
          }

          // Locate which page contains the highlighted passage and its exact [charStart, charEnd]
          let matchedPageIdx = -1;
          let matchedCharRange: [number, number] | null = null;

          // First try the page matching activeCleanHeading
          for (let pIdx = 0; pIdx < parsedOriginalPages.length; pIdx++) {
            const pg = parsedOriginalPages[pIdx];
            if (
              activeCleanHeading &&
              (pg.heading === activeCleanHeading ||
                activeCleanHeading.includes(pg.heading) ||
                pg.heading.includes(activeCleanHeading))
            ) {
              const range = findPassageCharRange(
                pg.formattedBody,
                activeRetrievedChunk.content
              );
              if (range) {
                matchedPageIdx = pIdx;
                matchedCharRange = range;
                break;
              }
            }
          }

          // Fallback: scan all pages in the document
          if (!matchedCharRange) {
            for (let pIdx = 0; pIdx < parsedOriginalPages.length; pIdx++) {
              const range = findPassageCharRange(
                parsedOriginalPages[pIdx].formattedBody,
                activeRetrievedChunk.content
              );
              if (range) {
                matchedPageIdx = pIdx;
                matchedCharRange = range;
                break;
              }
            }
          }

          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 120,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
              }}
            >
              {/* Click-outside backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14 }}
                onClick={() => setPreviewModal(null)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  backgroundColor: 'rgba(12, 15, 22, 0.48)',
                }}
              />

              {/* Floating Full Document Reader Window */}
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                className="clay-card theme-popup-card"
                style={{
                  position: 'relative',
                  zIndex: 121,
                  width: '100%',
                  maxWidth: 940,
                  maxHeight: '88vh',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '22px 26px',
                  overflow: 'hidden',
                  backgroundColor: 'var(--clay-surface-alt)',
                }}
              >
                {/* Modal Top Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    paddingBottom: 14,
                    marginBottom: 12,
                    borderBottom: '1.5px solid var(--clay-border-light)',
                    flexShrink: 0,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span className="clay-tag clay-tag-terracotta">
                        FULL DOCUMENT READER // SOURCE #{sourceIndex + 1}
                      </span>
                      <span className="clay-tag clay-tag-sage">
                        MATCH CONFIDENCE:{' '}
                        {(activeRetrievedChunk.rerankScore * 100).toFixed(1)}%
                      </span>
                      {matchedDoc && (
                        <span className="clay-tag">
                          {matchedDoc.format} • FULL CONTINUOUS DOCUMENT
                        </span>
                      )}
                    </div>
                    <h3
                      className="font-display"
                      style={{ fontSize: '1.22rem', fontWeight: 700 }}
                    >
                      {activeRetrievedChunk.documentTitle}
                    </h3>
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '0.73rem',
                        color: 'var(--ink-secondary)',
                        marginTop: 2,
                      }}
                    >
                      Showing highlighted citation first
                      {activeCleanHeading ? ` (${activeCleanHeading})` : ''} — scroll
                      up or down to read the full document context
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="clay-btn"
                      style={{ padding: '7px 12px', fontSize: '0.73rem' }}
                      onClick={() =>
                        highlightedChunkRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'center',
                        })
                      }
                    >
                      <Compass size={14} />
                      <span>CENTER ON HIGHLIGHT</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewModal(null)}
                      className="clay-btn"
                      style={{ padding: '8px 10px' }}
                      aria-label="Close Document Preview"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Source Tabs Bar (Switch between all cited sources in this answer) */}
                {turn.citations.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 12,
                      flexShrink: 0,
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
                      JUMP TO CITED PASSAGE:
                    </span>
                    {turn.citations.map((cit, idx) => (
                      <button
                        key={cit.chunkId}
                        type="button"
                        onClick={() =>
                          setPreviewModal({ turn, sourceIndex: idx })
                        }
                        className={`clay-btn ${
                          idx === sourceIndex ? 'clay-btn-terracotta' : ''
                        }`}
                        style={{ padding: '5px 11px', fontSize: '0.72rem' }}
                      >
                        <FileText size={12} />
                        <span>
                          SOURCE #{idx + 1} (
                          {(cit.relevanceScore * 100).toFixed(0)}%)
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Continuous Full Document Reader Sheet (Single Unified Document Page, Inline Highlighting) */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    paddingRight: 6,
                  }}
                >
                  <article className="full-document-sheet">
                    {parsedOriginalPages.map((pageGroup, gIdx) => {
                      const isTargetPage =
                        gIdx === matchedPageIdx && matchedCharRange !== null;
                      const body = pageGroup.formattedBody;
                      const pageBlocks = parsePageIntoBlocks(body);
                      let highlightRefAttached = false;
                      let highlightBadgeAttached = false;

                      return (
                        <section
                          key={`${pageGroup.heading}-${gIdx}`}
                          className="full-document-page-section"
                        >
                          {pageGroup.heading && (
                            <div className="full-document-section-heading">
                              <span>{pageGroup.heading}</span>
                            </div>
                          )}

                          {pageBlocks.map((block, bIdx) => {
                            if (block.kind === 'table') {
                              return (
                                <div
                                  key={`tbl-${bIdx}`}
                                  className="doc-reader-table-wrap"
                                >
                                  <table className="doc-reader-table">
                                    <thead>
                                      <tr>
                                        {block.headers.map((h, hIdx) => (
                                          <th key={hIdx}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {block.rows.map((row, rIdx) => {
                                        const isRowHighlighted =
                                          isTargetPage &&
                                          matchedCharRange !== null &&
                                          row.end > matchedCharRange[0] &&
                                          row.start < matchedCharRange[1];

                                        let attachRowRef = false;
                                        let showBadgeInRow = false;
                                        if (isRowHighlighted) {
                                          if (!highlightRefAttached) {
                                            attachRowRef = true;
                                            highlightRefAttached = true;
                                          }
                                          if (!highlightBadgeAttached) {
                                            showBadgeInRow = true;
                                            highlightBadgeAttached = true;
                                          }
                                        }

                                        return (
                                          <tr
                                            key={rIdx}
                                            ref={(el) => {
                                              if (attachRowRef && el) {
                                                (
                                                  highlightedChunkRef as React.MutableRefObject<HTMLElement | null>
                                                ).current = el;
                                              }
                                            }}
                                            className={
                                              isRowHighlighted
                                                ? 'doc-table-row-highlighted'
                                                : undefined
                                            }
                                          >
                                            {block.headers.map((_, cIdx) => (
                                              <td
                                                key={cIdx}
                                                style={{
                                                  fontWeight:
                                                    cIdx === 0 ? 700 : undefined,
                                                  whiteSpace:
                                                    cIdx === 0
                                                      ? 'nowrap'
                                                      : undefined,
                                                }}
                                              >
                                                {cIdx === 0 &&
                                                  showBadgeInRow && (
                                                    <span className="doc-inline-highlight-badge">
                                                      SOURCE #{sourceIndex + 1}
                                                    </span>
                                                  )}
                                                {row.cells[cIdx] || ''}
                                              </td>
                                            ))}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            }

                            // Paragraph block
                            const bStart = block.lines[0].start;
                            const bEnd =
                              block.lines[block.lines.length - 1].end;
                            const blockText = body.slice(bStart, bEnd);
                            const overlapsHighlight =
                              isTargetPage &&
                              matchedCharRange !== null &&
                              bEnd > matchedCharRange[0] &&
                              bStart < matchedCharRange[1];

                            if (overlapsHighlight && matchedCharRange) {
                              const relStart = Math.max(
                                0,
                                matchedCharRange[0] - bStart
                              );
                              const relEnd = Math.min(
                                blockText.length,
                                matchedCharRange[1] - bStart
                              );
                              let attachMarkRef = false;
                              let showBadgeInMark = false;
                              if (!highlightRefAttached) {
                                attachMarkRef = true;
                                highlightRefAttached = true;
                              }
                              if (!highlightBadgeAttached) {
                                showBadgeInMark = true;
                                highlightBadgeAttached = true;
                              }

                              return (
                                <div
                                  key={`para-${bIdx}`}
                                  className="full-document-continuous-prose"
                                >
                                  <span>{blockText.slice(0, relStart)}</span>
                                  <mark
                                    ref={(el) => {
                                      if (attachMarkRef && el) {
                                        highlightedChunkRef.current = el;
                                      }
                                    }}
                                    className="doc-inline-highlight"
                                  >
                                    {showBadgeInMark && (
                                      <span className="doc-inline-highlight-badge">
                                        SOURCE #{sourceIndex + 1}
                                      </span>
                                    )}
                                    {blockText.slice(relStart, relEnd)}
                                  </mark>
                                  <span>{blockText.slice(relEnd)}</span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={`para-${bIdx}`}
                                className="full-document-continuous-prose"
                              >
                                <span>{blockText}</span>
                              </div>
                            );
                          })}
                        </section>
                      );
                    })}
                  </article>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};
