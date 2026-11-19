import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Database,
  HardDrive,
  FileText,
  Bookmark,
  Download,
  Trash2,
  Plus,
  Layers,
  ShieldCheck,
  Folder,
} from 'lucide-react';
import {
  AgenticRagResponse,
  DatabaseTelemetry,
  IngestedDocument,
  SavedFinding,
} from '../types';
import { RichMarkdownRenderer } from './RichMarkdownRenderer';

interface DatabaseAndFindingsVaultProps {
  databaseTelemetry: DatabaseTelemetry | null;
  savedFindings: SavedFinding[];
  documents: IngestedDocument[];
  latestQuery: AgenticRagResponse | null;
  onSaveFinding: (payload: {
    queryId?: string;
    title: string;
    prompt: string;
    reshapedQuery: string;
    synthesizedAnswer: string;
    analystNotes: string;
    tags: string[];
    citations?: AgenticRagResponse['citations'];
    claimVerifications?: AgenticRagResponse['claimVerifications'];
    metrics?: Partial<AgenticRagResponse['metrics']>;
  }) => Promise<void>;
  onDeleteFinding: (findingId: string) => Promise<void>;
}

export const DatabaseAndFindingsVault: React.FC<
  DatabaseAndFindingsVaultProps
> = ({
  databaseTelemetry,
  savedFindings,
  documents,
  latestQuery,
  onSaveFinding,
  onDeleteFinding,
}) => {
  const [selectedFindingId, setSelectedFindingId] = useState<string>(
    savedFindings[0]?.findingId || ''
  );
  const [customTitle, setCustomTitle] = useState<string>('');
  const [analystNotes, setAnalystNotes] = useState<string>('');
  const [tagInput, setTagInput] = useState<string>(
    'HNSW_VERIFIED, GROUNDED_FINDING'
  );
  const [justSaved, setJustSaved] = useState(false);

  const activeFinding =
    savedFindings.find((f) => f.findingId === selectedFindingId) ||
    savedFindings[0] ||
    null;

  const handleSaveCurrentQueryToVault = async () => {
    if (!latestQuery) return;
    const tags = tagInput
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    await onSaveFinding({
      queryId: latestQuery.queryId,
      title:
        customTitle.trim() ||
        `Finding: ${latestQuery.promptReshape.originalPrompt.slice(0, 68)}`,
      prompt: latestQuery.promptReshape.originalPrompt,
      reshapedQuery: latestQuery.promptReshape.reshapedPrimaryQuery,
      synthesizedAnswer: latestQuery.answer,
      analystNotes:
        analystNotes.trim() ||
        `Verified across ${latestQuery.retrievedChunks.length} HNSW+BM25 chunks (Optimization Index: ${latestQuery.metrics.overallOptimizationIndex}%).`,
      tags: tags.length > 0 ? tags : ['VERIFIED_RAG'],
      citations: latestQuery.citations,
      claimVerifications: latestQuery.claimVerifications,
      metrics: latestQuery.metrics,
    });

    setCustomTitle('');
    setAnalystNotes('');
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2600);
  };

  const handleDownloadFindingReport = (
    finding: SavedFinding,
    format: 'md' | 'json'
  ) => {
    let content = '';
    let mime = 'text/markdown';
    let ext = 'md';

    if (format === 'json') {
      content = JSON.stringify(finding, null, 2);
      mime = 'application/json';
      ext = 'json';
    } else {
      content = [
        `# ${finding.title}`,
        '',
        `- **Finding ID**: \`${finding.findingId}\``,
        `- **Created At**: \`${finding.createdAt}\``,
        `- **Original Prompt**: ${finding.prompt}`,
        `- **Small LLM Reshaped Query**: \`${finding.reshapedQuery}\``,
        `- **Analyst Notes**: ${finding.analystNotes || 'None'}`,
        `- **Tags**: ${finding.tags.join(', ')}`,
        '',
        '## Grounded Synthesized Findings',
        '',
        finding.synthesizedAnswer,
        '',
        '## Supporting Citations',
        ...(finding.citations || []).map(
          (c) =>
            `- **${c.citationTag}** (${c.sectionPath} | Score: ${(
              c.relevanceScore * 100
            ).toFixed(1)}%): ${c.excerpt}`
        ),
      ].join('\n');
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${finding.findingId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Top Row: 4 Storage & Persistence Engine Telemetry Cards */}
      <div className="grid-4">
        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
            }}
          >
            RELATIONAL + VECTOR ENGINE
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.35rem', fontWeight: 700, margin: '4px 0' }}
          >
            SQLite3 WAL + HNSW
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
            ACID transactions + 128-dim binary/JSON vector index
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
            }}
          >
            SQLITE VAULT FOOTPRINT
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.35rem', fontWeight: 700, margin: '4px 0' }}
          >
            {databaseTelemetry?.sqliteSizeKb || 0} KB (SQLite3)
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
            HNSW Snapshot: {databaseTelemetry?.vectorSnapshotSizeKb || 0} KB
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
            }}
          >
            SAVED RESEARCH FINDINGS
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.35rem', fontWeight: 700, margin: '4px 0' }}
          >
            {savedFindings.length} Pinned Reports
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
            Auto-exported to ./data/exports/*.md
          </div>
        </div>

        <div className="clay-card-alt">
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
            }}
          >
            RAW FILE ARCHIVE VAULT
          </div>
          <div
            className="font-display"
            style={{ fontSize: '1.35rem', fontWeight: 700, margin: '4px 0' }}
          >
            {documents.length} Indexed Docs
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
            {databaseTelemetry?.uploadedRawFilesCount || 0} binary files in
            ./data/uploads/
          </div>
        </div>
      </div>

      {/* Middle Row: SQLite3 Table Schema & Disk Paths + Save Current Query Finding Box */}
      <div className="grid-2">
        {/* Left: Live SQLite3 Table & Disk Path Inspector */}
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
              <Database size={13} />
              <span>SQLITE3 (WAL) DATABASE TABLES & DISK LOCATIONS</span>
            </span>
            <span className="clay-tag clay-tag-sage">ACID PERSISTENT</span>
          </div>

          {databaseTelemetry && (
            <>
              <div
                className="clay-well font-mono"
                style={{
                  fontSize: '0.73rem',
                  marginBottom: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div>
                  <strong>SQLite3 Vault DB:</strong>{' '}
                  {databaseTelemetry.sqliteFilePath}
                </div>
                <div>
                  <strong>HNSW Vector Index:</strong>{' '}
                  {databaseTelemetry.vectorSnapshotPath}
                </div>
                <div>
                  <strong>Raw Uploads Archive:</strong>{' '}
                  {databaseTelemetry.uploadsDirPath}
                </div>
                <div>
                  <strong>Findings Markdown Exports:</strong>{' '}
                  {databaseTelemetry.exportsDirPath}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {databaseTelemetry.tables.map((tbl) => (
                  <div
                    key={tbl.tableName}
                    className="clay-card-alt"
                    style={{
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: 'var(--ink-primary)',
                        }}
                      >
                        TABLE: {tbl.tableName}
                      </div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--ink-secondary)',
                        }}
                      >
                        {tbl.purpose}
                      </div>
                    </div>
                    <span className="clay-tag clay-tag-terracotta">
                      {tbl.rowCount} ROWS
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: Pin / Persist Current Agentic Query Finding to SQLite & Disk */}
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
              <Bookmark size={13} />
              <span>COMMIT LATEST RAG FINDING TO SQLITE VAULT</span>
            </span>
            {justSaved && (
              <span className="clay-tag clay-tag-sage">
                SAVED TO SQLITE & EXPORTED .MD
              </span>
            )}
          </div>

          {latestQuery ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="clay-card-alt">
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.69rem',
                    fontWeight: 700,
                    color: 'var(--ink-muted)',
                  }}
                >
                  ACTIVE QUERY RUN ({latestQuery.queryId})
                </div>
                <div
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 700,
                    marginTop: 2,
                  }}
                >
                  {latestQuery.promptReshape.originalPrompt}
                </div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--ink-secondary)',
                    marginTop: 4,
                  }}
                >
                  Optimization Index:{' '}
                  {latestQuery.metrics.overallOptimizationIndex}% |
                  Groundedness:{' '}
                  {(
                    latestQuery.metrics.groundednessFaithfulness * 100
                  ).toFixed(1)}
                  % | Verified Claims: {latestQuery.claimVerifications.length}
                </div>
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
                  FINDING REPORT TITLE
                </label>
                <input
                  type="text"
                  className="clay-input"
                  placeholder={`Finding: ${latestQuery.promptReshape.originalPrompt.slice(
                    0,
                    55
                  )}...`}
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
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
                  ANALYST ANNOTATIONS & VERIFICATION NOTES
                </label>
                <textarea
                  className="clay-input"
                  rows={3}
                  placeholder="Add engineering notes, conclusions, or audit observations to store alongside the cited RAG synthesis..."
                  value={analystNotes}
                  onChange={(e) => setAnalystNotes(e.target.value)}
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
                  INDEXING TAGS (COMMA SEPARATED)
                </label>
                <input
                  type="text"
                  className="clay-input font-mono"
                  style={{ fontSize: '0.79rem' }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                />
              </div>

              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ y: 2 }}
                type="button"
                className="clay-btn clay-btn-terracotta"
                style={{ width: '100%', padding: '12px 18px' }}
                onClick={handleSaveCurrentQueryToVault}
              >
                <Plus size={15} />
                <span>
                  COMMIT FINDING TO SQLITE `saved_findings` &amp; WRITE MARKDOWN
                  FILE
                </span>
              </motion.button>
            </div>
          ) : (
            <div>Run a query first to commit findings into the vault.</div>
          )}
        </div>
      </div>

      {/* Bottom Row: Saved Findings Browser & Full Inspector */}
      <div className="grid-2" style={{ gridTemplateColumns: '0.88fr 1.32fr' }}>
        {/* Left: Saved Research Findings List */}
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
              <Folder size={13} />
              <span>SAVED FINDINGS ARCHIVE ({savedFindings.length})</span>
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 460,
              overflowY: 'auto',
            }}
          >
            {savedFindings.map((fnd) => {
              const isSelected = activeFinding?.findingId === fnd.findingId;
              return (
                <div
                  key={fnd.findingId}
                  onClick={() => setSelectedFindingId(fnd.findingId)}
                  className="clay-card-alt"
                  style={{
                    cursor: 'pointer',
                    borderColor: isSelected
                      ? 'var(--clay-terracotta)'
                      : 'var(--clay-border-light)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 5,
                    }}
                  >
                    <span className="clay-tag clay-tag-sage">
                      ID: {fnd.findingId}
                    </span>
                    <button
                      type="button"
                      className="clay-btn"
                      style={{ padding: '4px 8px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFinding(fnd.findingId);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  <div
                    className="font-display"
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {fnd.title}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--ink-secondary)',
                      marginBottom: 8,
                    }}
                  >
                    {fnd.analystNotes}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {fnd.tags.map((t) => (
                      <span
                        key={t}
                        className="clay-tag"
                        style={{ fontSize: '0.64rem', padding: '2px 7px' }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Active Saved Finding Detailed Report & Export Actions */}
        <div className="clay-card">
          {activeFinding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  <span className="clay-tag clay-tag-sage">
                    <ShieldCheck size={13} />
                    <span>PERSISTED SQLITE FINDING RECORD</span>
                  </span>
                  <h3
                    className="font-display"
                    style={{ fontSize: '1.12rem', marginTop: 6 }}
                  >
                    {activeFinding.title}
                  </h3>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="clay-btn clay-btn-cobalt"
                    style={{ padding: '7px 12px', fontSize: '0.74rem' }}
                    onClick={() =>
                      handleDownloadFindingReport(activeFinding, 'md')
                    }
                  >
                    <Download size={13} />
                    <span>EXPORT .MD</span>
                  </button>
                  <button
                    type="button"
                    className="clay-btn"
                    style={{ padding: '7px 12px', fontSize: '0.74rem' }}
                    onClick={() =>
                      handleDownloadFindingReport(activeFinding, 'json')
                    }
                  >
                    <Download size={13} />
                    <span>EXPORT .JSON</span>
                  </button>
                </div>
              </div>

              {activeFinding.exportedMarkdownPath && (
                <div
                  className="clay-card-alt font-mono"
                  style={{ fontSize: '0.73rem' }}
                >
                  <strong>Disk File Location:</strong>{' '}
                  {activeFinding.exportedMarkdownPath}
                </div>
              )}

              <div
                className="clay-well"
                style={{
                  maxHeight: 340,
                  overflowY: 'auto',
                }}
              >
                <RichMarkdownRenderer
                  content={activeFinding.synthesizedAnswer}
                />
              </div>

              <div className="clay-card-alt">
                <div
                  className="font-mono"
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    marginBottom: 4,
                    color: 'var(--ink-muted)',
                  }}
                >
                  ANALYST NOTES &amp; VERIFIED CITATIONS (
                  {activeFinding.citations?.length || 0})
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    marginBottom: 8,
                    color: 'var(--ink-primary)',
                  }}
                >
                  {activeFinding.analystNotes}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(activeFinding.citations || []).map((c) => (
                    <span
                      key={c.chunkId}
                      className="clay-tag"
                      style={{ fontSize: '0.67rem' }}
                    >
                      {c.citationTag} ({(c.relevanceScore * 100).toFixed(1)}%)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>No saved findings in vault yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
