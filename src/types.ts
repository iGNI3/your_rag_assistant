export type ChunkStrategyType =
  | 'semantic'
  | 'hierarchical'
  | 'proposition'
  | 'structural'
  | 'sliding_window';

export type DistanceMetric = 'cosine' | 'dot' | 'euclidean' | 'manhattan';

export interface ExtractionTelemetry {
  originalSizeChars: number;
  cleanedSizeChars: number;
  noiseRemovedPct: number;
  ocrUsed: boolean;
  ocrConfidence: number;
  detectedTables: number;
  detectedHeadings: number;
  detectedCodeBlocks: number;
  estimatedTokens: number;
  extractionTimeMs: number;
  cleaningOperations: string[];
}

export interface StrategyBenchmark {
  strategy: ChunkStrategyType;
  label: string;
  description: string;
  chunkCount: number;
  avgChunkTokens: number;
  tokenStdDev: number;
  semanticCoherenceScore: number;
  boundarySharpnessScore: number;
  informationDensityScore: number;
  sizeUniformityScore: number;
  overlapEfficiencyScore: number;
  compositeScore: number;
  recommended: boolean;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  documentFormat: string;
  index: number;
  parentChunkId?: string;
  parentContext?: string;
  sectionPath: string;
  content: string;
  tokenCount: number;
  charCount: number;
  strategy: ChunkStrategyType;
  coherenceScore: number;
  informationDensity: number;
  keywords: string[];
  embedding?: number[];
  coords2D: [number, number];
  sparseTerms?: Record<string, number>;
}

export interface IngestedDocument {
  id: string;
  title: string;
  filename: string;
  format: string;
  ingestedAt: string;
  rawText: string;
  cleanedText: string;
  selectedStrategy: ChunkStrategyType;
  autoOptimized: boolean;
  extractionTelemetry: ExtractionTelemetry;
  strategyBenchmarks: StrategyBenchmark[];
  chunkCount: number;
}

export interface PromptReshapeResult {
  originalPrompt: string;
  detectedIntent:
    | 'FACTUAL_LOOKUP'
    | 'ANALYTICAL_SYNTHESIS'
    | 'COMPARATIVE_AUDIT'
    | 'PROCEDURAL_HOWTO'
    | 'TROUBLESHOOTING';
  complexityLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  reshapedPrimaryQuery: string;
  stepBackQuery: string;
  subQueries: string[];
  hydeDocument: string;
  extractedEntities: string[];
  reasoningTrace: string;
  modelUsed: string;
  providerUsed: string;
  latencyMs: number;
  clarityScoreBefore: number;
  clarityScoreAfter: number;
}

export interface RetrievedChunkResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentFormat: string;
  sectionPath: string;
  content: string;
  parentContext?: string;
  tokenCount: number;
  strategy: ChunkStrategyType;
  denseScore: number;
  sparseScore: number;
  rrfScore: number;
  mmrScore: number;
  initialRank: number;
  rerankScore: number;
  finalRank: number;
  rankDelta: number;
  cragGrade: 'HIGHLY_RELEVANT' | 'PARTIAL_SUPPORT' | 'IRRELEVANT_NOISE';
  cragReasoning: string;
  matchedTerms: string[];
  coords2D: [number, number];
}

export interface ClaimVerification {
  claim: string;
  status: 'SUPPORTED' | 'PARTIALLY_SUPPORTED' | 'CONTRADICTED' | 'UNVERIFIED';
  supportingChunkId?: string;
  supportingDocumentTitle?: string;
  confidence: number;
  evidenceSnippet: string;
}

export interface ComprehensiveMetrics {
  contextPrecisionAtK: number;
  contextRecallAtK: number;
  mrr: number;
  ndcgAtK: number;
  hitRate: number;
  avgDenseSimilarity: number;
  rrfHybridLiftPct: number;
  mmrDiversityScore: number;
  rerankerPromotionGain: number;
  avgChunkCoherence: number;
  boundarySharpness: number;
  tokenUtilizationEfficiency: number;
  cragPruningRatioPct: number;
  contextRelevance: number;
  groundednessFaithfulness: number;
  answerRelevance: number;
  hallucinationRiskPct: number;
  promptReshapingLiftPct: number;
  overallOptimizationIndex: number;
  latencyBreakdown: {
    promptReshapingMs: number;
    embeddingMs: number;
    hnswDenseSearchMs: number;
    bm25SparseSearchMs: number;
    rrfAndMmrMs: number;
    crossEncoderRerankMs: number;
    answerGenerationMs: number;
    selfRagVerificationMs: number;
    totalMs: number;
  };
}

export interface ChatSession {
  chatId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastPrompt: string;
}

export interface AgenticRagResponse {
  queryId: string;
  chatId?: string;
  timestamp: string;
  promptReshape: PromptReshapeResult;
  retrievedChunks: RetrievedChunkResult[];
  prunedNoiseChunks: RetrievedChunkResult[];
  queryCoords2D: [number, number];
  hydeCoords2D: [number, number];
  answer: string;
  citations: Array<{
    citationTag: string;
    chunkId: string;
    documentTitle: string;
    sectionPath: string;
    excerpt: string;
    relevanceScore: number;
  }>;
  claimVerifications: ClaimVerification[];
  tokenUsage?: QueryTokenUsage;
  metrics: ComprehensiveMetrics;
  activeConfig: RagPipelineConfig;
}

export interface StageTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider: string;
  model: string;
  source: 'provider_api' | 'estimated';
}

export interface QueryTokenUsage {
  reshaper: StageTokenUsage;
  generator: StageTokenUsage;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
}

export interface RagPipelineConfig {
  reshaperProvider:
    | 'builtin_local'
    | 'ollama'
    | 'lmstudio'
    | 'offline_gguf'
    | 'openai'
    | 'gemini'
    | 'anthropic'
    | 'groq'
    | 'openrouter';
  reshaperModel: string;
  generatorProvider:
    | 'builtin_local'
    | 'ollama'
    | 'lmstudio'
    | 'offline_gguf'
    | 'openai'
    | 'gemini'
    | 'anthropic'
    | 'groq'
    | 'openrouter';
  generatorModel: string;
  apiKeys: {
    openai?: string;
    gemini?: string;
    anthropic?: string;
    groq?: string;
    openrouter?: string;
    cohere?: string;
    jina?: string;
  };
  localEndpoints: {
    ollamaUrl: string;
    lmStudioUrl: string;
    customBaseUrl?: string;
  };
  offlineModelPath: string;
  defaultChunkStrategy: ChunkStrategyType;
  autoOptimizeChunking: boolean;
  targetChunkTokens: number;
  chunkOverlapTokens: number;
  distanceMetric: DistanceMetric;
  hybridAlpha: number;
  mmrLambda: number;
  topKInitial: number;
  topKReranked: number;
  enableHyde: boolean;
  enableMultiQuery: boolean;
  enableStepBack: boolean;
  enableCrossEncoderRerank: boolean;
  enableCragFilter: boolean;
  cragThreshold: number;
}

export interface OfflineModelFileInfo {
  name: string;
  fullPath: string;
  sizeBytes: number;
  sizeFormatted: string;
  format: 'GGUF' | 'ONNX' | 'SAFETENSORS' | 'BIN' | 'UNKNOWN';
  quantization: string;
  headerValid: boolean;
  architectureHint: string;
  lastModified: string;
}

export interface ModelPortalCatalogItem {
  id: string;
  name: string;
  family: string;
  parameterSize: string;
  recommendedQuant: string;
  fileSizeGb: string;
  minRamGb: number;
  role: 'PROMPT_RESHAPER' | 'ANSWER_GENERATOR' | 'DUAL_PURPOSE' | 'RERANKER_EMBEDDING';
  description: string;
  huggingFaceUrl: string;
  directGgufPortalUrl: string;
  ollamaCommand: string;
  hfCliCommand: string;
}

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface VectorDbStats {
  totalDocuments: number;
  totalChunks: number;
  vectorDimensions: number;
  vocabTermsIndexed: number;
  hnswLayers: number;
  hnswTotalEdges: number;
  hnswAvgDegree: number;
  memoryFootprint: {
    fp32Kb: number;
    int8QuantizedKb: number;
    binaryQuantizedKb: number;
  };
}

export interface SavedFinding {
  findingId: string;
  queryId?: string;
  title: string;
  createdAt: string;
  prompt: string;
  reshapedQuery: string;
  synthesizedAnswer: string;
  analystNotes: string;
  tags: string[];
  citations: AgenticRagResponse['citations'];
  claimVerifications: ClaimVerification[];
  metrics: Partial<ComprehensiveMetrics>;
  exportedMarkdownPath?: string;
}

export interface DatabaseTelemetry {
  engine: string;
  sqliteFilePath: string;
  vectorSnapshotPath: string;
  uploadsDirPath: string;
  exportsDirPath: string;
  sqliteSizeKb: number;
  vectorSnapshotSizeKb: number;
  uploadedRawFilesCount: number;
  exportedMarkdownReportsCount: number;
  tables: Array<{
    tableName: string;
    rowCount: number;
    purpose: string;
  }>;
}

export interface StrategyDistributionItem {
  strategy: string;
  documentCount: number;
  chunkCount: number;
  indexedTokens: number;
}

export interface FormatDistributionItem {
  format: string;
  documentCount: number;
  chunkCount: number;
  indexedTokens: number;
}

export interface ProviderUsageItem {
  provider: string;
  model: string;
  queries: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface DocumentAnalyticsRow {
  documentId: string;
  title: string;
  filename: string;
  format: string;
  ingestedAt: string;
  chunkCount: number;
  indexedTokens: number;
  avgTokensPerChunk: number;
  selectedStrategy: string;
  autoOptimized: boolean;
  ocrUsed: boolean;
  ocrConfidence: number;
  noiseReductionPct: number;
  extractionOperations: string[];
  avgCoherence: number;
  avgInfoDensity: number;
}

export interface QueryTokenTimelinePoint {
  queryId: string;
  timestamp: string;
  label: string;
  promptPreview: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reshaperTokens: number;
  generatorTokens: number;
  provider: string;
  model: string;
  source: 'provider_api' | 'estimated';
  latencyMs: number;
  groundedness: number;
}

export interface UserAnalyticsSummary {
  appliedRange?: {
    startAt: string | null;
    endAt: string | null;
  };
  corpusTotals: {
    totalDocuments: number;
    totalChunks: number;
    totalIndexedTokens: number;
    avgChunksPerDocument: number;
    avgTokensPerChunk: number;
    ocrDocumentCount: number;
    nativeDocumentCount: number;
    autoOptimizedCount: number;
    manualStrategyCount: number;
    dominantStrategy: string;
  };
  tokenTotals: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    reshaperInputTokens: number;
    reshaperOutputTokens: number;
    reshaperTotalTokens: number;
    generatorInputTokens: number;
    generatorOutputTokens: number;
    generatorTotalTokens: number;
    avgTokensPerQuery: number;
    avgLatencyMs: number;
    avgGroundedness: number;
    totalQueries: number;
    providerApiQueries: number;
    estimatedQueries: number;
  };
  strategyDistribution: StrategyDistributionItem[];
  formatDistribution: FormatDistributionItem[];
  providerBreakdown: ProviderUsageItem[];
  perDocumentMetrics: DocumentAnalyticsRow[];
  queryTokenTimeline: QueryTokenTimelinePoint[];
}

