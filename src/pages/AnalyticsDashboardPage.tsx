import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart,
  Cpu,
  FileText,
  Layers,
  TrendingUp,
  Scissors,
  RefreshCw,
  Search,
  Sparkles,
  ScanText,
  Clock,
  CheckCircle2,
  ArrowUpRight,
  X,
  Calendar,
} from 'lucide-react';
import {
  RagPipelineConfig,
  UserAnalyticsSummary,
} from '../types';
import { AppPageId } from './OverviewPage';

interface AnalyticsDashboardPageProps {
  analytics: UserAnalyticsSummary | null;
  config: RagPipelineConfig;
  isRefreshing?: boolean;
  onRefresh: (startIso?: string | null, endIso?: string | null) => Promise<void> | void;
  onNavigate: (page: AppPageId) => void;
}

const STRATEGY_META: Record<
  string,
  { label: string; shortLabel: string; color: string }
> = {
  semantic: {
    label: 'Semantic Inflection',
    shortLabel: 'Semantic',
    color: 'var(--clay-terracotta)',
  },
  hierarchical: {
    label: 'Hierarchical Parent-Child',
    shortLabel: 'Hierarchical',
    color: 'var(--clay-cobalt)',
  },
  proposition: {
    label: 'Atomic Propositions',
    shortLabel: 'Proposition',
    color: 'var(--clay-sage)',
  },
  structural: {
    label: 'Structural AST',
    shortLabel: 'Structural',
    color: 'var(--clay-ochre)',
  },
  sliding_window: {
    label: 'Sliding Window',
    shortLabel: 'Sliding',
    color: 'var(--clay-plum)',
  },
};

const PALETTE_SERIES = [
  'var(--clay-terracotta)',
  'var(--clay-cobalt)',
  'var(--clay-sage)',
  'var(--clay-ochre)',
  'var(--clay-plum)',
  'var(--clay-charcoal)',
];

function getStrategyMeta(strategy: string) {
  const key = (strategy || 'semantic').toLowerCase();
  return (
    STRATEGY_META[key] || {
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      shortLabel: key.toUpperCase(),
      color: 'var(--clay-charcoal)',
    }
  );
}

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

interface DonutSlice {
  id: string;
  label: string;
  value: number;
  sublabel?: string;
  color: string;
}

const InteractiveDonutChart: React.FC<{
  slices: DonutSlice[];
  centerCaption: string;
  emptyText: string;
  selectedId?: string | null;
  onSelectSlice?: (id: string) => void;
}> = ({ slices, centerCaption, emptyText, selectedId, onSelectSlice }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const validSlices = useMemo(
    () => slices.filter((s) => s.value > 0),
    [slices]
  );
  const total = useMemo(
    () => validSlices.reduce((acc, s) => acc + s.value, 0),
    [validSlices]
  );

  const radius = 64;
  const circumference = 2 * Math.PI * radius;

  const activeSlice =
    validSlices.find((s) => s.id === (hoveredId || selectedId)) || null;

  if (total <= 0) {
    return (
      <div
        className="clay-well"
        style={{
          padding: '28px 18px',
          borderRadius: 18,
          textAlign: 'center',
          color: 'var(--ink-muted)',
          fontSize: '0.84rem',
        }}
      >
        {emptyText}
      </div>
    );
  }

  let runningFrac = 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(168px, 190px) minmax(0, 1fr)',
        gap: 18,
        alignItems: 'center',
      }}
    >
      {/* SVG Ring */}
      <div
        style={{
          position: 'relative',
          width: 176,
          height: 176,
          margin: '0 auto',
        }}
      >
        <svg
          viewBox="0 0 176 176"
          width="176"
          height="176"
          style={{ display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={centerCaption}
        >
          {/* Base track */}
          <circle
            cx="88"
            cy="88"
            r={radius}
            fill="none"
            stroke="var(--clay-well-deep)"
            strokeWidth="22"
            opacity="0.45"
          />
          {validSlices.map((slice) => {
            const frac = slice.value / total;
            const segLen = Math.max(2, frac * circumference);
            const gap = validSlices.length > 1 ? 2.4 : 0;
            const dashLen = Math.max(1, segLen - gap);
            const dashOffset = -runningFrac * circumference;
            runningFrac += frac;
            const isHighlighted =
              hoveredId === slice.id || selectedId === slice.id;

            return (
              <circle
                key={slice.id}
                cx="88"
                cy="88"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHighlighted ? 26 : 21}
                strokeDasharray={`${dashLen} ${circumference}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                transform="rotate(-90 88 88)"
                style={{
                  cursor: onSelectSlice ? 'pointer' : 'default',
                  transition: 'stroke-width 0.18s ease, opacity 0.18s ease',
                  opacity:
                    (hoveredId && hoveredId !== slice.id) ||
                    (selectedId && selectedId !== slice.id && !hoveredId)
                      ? 0.45
                      : 1,
                }}
                onMouseEnter={() => setHoveredId(slice.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSelectSlice && onSelectSlice(slice.id)}
              />
            );
          })}
        </svg>

        {/* Center KPI Readout */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            padding: '0 22px',
            textAlign: 'center',
          }}
        >
          <div
            className="font-display"
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--ink-primary)',
              lineHeight: 1.1,
            }}
          >
            {activeSlice
              ? `${((activeSlice.value / total) * 100).toFixed(0)}%`
              : formatCompactNumber(total)}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.62rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
              marginTop: 4,
              maxWidth: 108,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {activeSlice ? activeSlice.label : centerCaption}
          </div>
        </div>
      </div>

      {/* Interactive Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {validSlices.map((slice) => {
          const pct = ((slice.value / total) * 100).toFixed(1);
          const isSelected = selectedId === slice.id;
          const isHovered = hoveredId === slice.id;
          return (
            <button
              key={slice.id}
              type="button"
              onMouseEnter={() => setHoveredId(slice.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectSlice && onSelectSlice(slice.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 12,
                border: isSelected
                  ? '1.5px solid var(--clay-terracotta)'
                  : '1px solid transparent',
                backgroundColor:
                  isSelected || isHovered
                    ? 'var(--clay-well)'
                    : 'transparent',
                cursor: onSelectSlice ? 'pointer' : 'default',
                textAlign: 'left',
                transition: 'background-color 0.14s ease',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    backgroundColor: slice.color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.79rem',
                      fontWeight: 600,
                      color: 'var(--ink-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {slice.label}
                  </div>
                  {slice.sublabel && (
                    <div
                      className="font-mono"
                      style={{
                        fontSize: '0.64rem',
                        color: 'var(--ink-muted)',
                      }}
                    >
                      {slice.sublabel}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  color: 'var(--ink-secondary)',
                  flexShrink: 0,
                }}
              >
                {formatCompactNumber(slice.value)}{' '}
                <span style={{ color: 'var(--ink-muted)', fontWeight: 500 }}>
                  ({pct}%)
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

function toLocalDateTimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function formatReadableRange(startIso: string | null, endIso: string | null): string {
  const fmt = (iso: string) => {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  if (startIso && endIso) return `${fmt(startIso)} → ${fmt(endIso)}`;
  if (startIso) return `From ${fmt(startIso)}`;
  if (endIso) return `Until ${fmt(endIso)}`;
  return 'All Time';
}

type DatePresetId = 'all' | 'today' | '24h' | '7d' | '30d' | 'custom';

export const AnalyticsDashboardPage: React.FC<AnalyticsDashboardPageProps> = ({
  analytics,
  config,
  isRefreshing = false,
  onRefresh,
  onNavigate,
}) => {
  const [datePreset, setDatePreset] = useState<DatePresetId>('all');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [appliedStartIso, setAppliedStartIso] = useState<string | null>(null);
  const [appliedEndIso, setAppliedEndIso] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const [strategyMetricMode, setStrategyMetricMode] = useState<'docs' | 'chunks'>(
    'chunks'
  );
  const [tokenPieMode, setTokenPieMode] = useState<'stages' | 'providers'>(
    'stages'
  );
  const [fileBarMode, setFileBarMode] = useState<'chunks' | 'tokens'>('chunks');
  const [selectedStrategyFilter, setSelectedStrategyFilter] = useState<
    string | null
  >(null);
  const [docSearch, setDocSearch] = useState('');
  const [docSortBy, setDocSortBy] = useState<
    'newest' | 'chunks' | 'tokens' | 'coherence'
  >('chunks');
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);

  const applyDatePreset = (preset: DatePresetId) => {
    setRangeError(null);
    setDatePreset(preset);
    if (preset === 'custom') {
      if (!customStart) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        setCustomStart(toLocalDateTimeInputValue(startOfToday));
      }
      if (!customEnd) {
        setCustomEnd(toLocalDateTimeInputValue(new Date()));
      }
      return;
    }

    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (preset === 'today') {
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      end = now;
    } else if (preset === '24h') {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      end = now;
    } else if (preset === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      end = now;
    } else if (preset === '30d') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = now;
    }

    const sIso = start ? start.toISOString() : null;
    const eIso = end ? end.toISOString() : null;
    setAppliedStartIso(sIso);
    setAppliedEndIso(eIso);
    if (start) setCustomStart(toLocalDateTimeInputValue(start));
    if (end) setCustomEnd(toLocalDateTimeInputValue(end));
    onRefresh(sIso, eIso);
  };

  const handleApplyCustomRange = (e: React.FormEvent) => {
    e.preventDefault();
    setRangeError(null);
    const startDt = customStart ? new Date(customStart) : null;
    const endDt = customEnd ? new Date(customEnd) : null;

    if (startDt && Number.isNaN(startDt.getTime())) {
      setRangeError('Please enter a valid start date & time.');
      return;
    }
    if (endDt && Number.isNaN(endDt.getTime())) {
      setRangeError('Please enter a valid end date & time.');
      return;
    }
    if (startDt && endDt && startDt.getTime() > endDt.getTime()) {
      setRangeError('Start date/time must be earlier than end date/time.');
      return;
    }

    const sIso = startDt ? startDt.toISOString() : null;
    const eIso = endDt ? endDt.toISOString() : null;
    setDatePreset(sIso || eIso ? 'custom' : 'all');
    setAppliedStartIso(sIso);
    setAppliedEndIso(eIso);
    onRefresh(sIso, eIso);
  };

  const corpus = analytics?.corpusTotals || {
    totalDocuments: 0,
    totalChunks: 0,
    totalIndexedTokens: 0,
    avgChunksPerDocument: 0,
    avgTokensPerChunk: 0,
    ocrDocumentCount: 0,
    nativeDocumentCount: 0,
    autoOptimizedCount: 0,
    manualStrategyCount: 0,
    dominantStrategy: 'none',
  };

  const tokens = analytics?.tokenTotals || {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    reshaperInputTokens: 0,
    reshaperOutputTokens: 0,
    reshaperTotalTokens: 0,
    generatorInputTokens: 0,
    generatorOutputTokens: 0,
    generatorTotalTokens: 0,
    avgTokensPerQuery: 0,
    avgLatencyMs: 0,
    avgGroundedness: 0,
    totalQueries: 0,
    providerApiQueries: 0,
    estimatedQueries: 0,
  };

  const strategySlices: DonutSlice[] = useMemo(() => {
    const items = analytics?.strategyDistribution || [];
    return items.map((item) => {
      const meta = getStrategyMeta(item.strategy);
      return {
        id: item.strategy,
        label: meta.label,
        value:
          strategyMetricMode === 'docs' ? item.documentCount : item.chunkCount,
        sublabel: `${item.documentCount} doc${item.documentCount === 1 ? '' : 's'} • ${formatCompactNumber(item.indexedTokens)} tok`,
        color: meta.color,
      };
    });
  }, [analytics?.strategyDistribution, strategyMetricMode]);

  const tokenPieSlices: DonutSlice[] = useMemo(() => {
    if (tokenPieMode === 'stages') {
      return [
        {
          id: 'gen_in',
          label: 'Generator Input (Context)',
          value: tokens.generatorInputTokens,
          sublabel: 'Retrieved chunks + prompt',
          color: 'var(--clay-terracotta)',
        },
        {
          id: 'gen_out',
          label: 'Generator Output (Answers)',
          value: tokens.generatorOutputTokens,
          sublabel: 'Synthesized grounded replies',
          color: 'var(--clay-sage)',
        },
        {
          id: 'reshaper_in',
          label: 'Reshaper Input',
          value: tokens.reshaperInputTokens,
          sublabel: 'Small LLM query analysis',
          color: 'var(--clay-cobalt)',
        },
        {
          id: 'reshaper_out',
          label: 'Reshaper Output',
          value: tokens.reshaperOutputTokens,
          sublabel: 'HyDE + 3-way sub-queries',
          color: 'var(--clay-ochre)',
        },
      ];
    }
    return (analytics?.providerBreakdown || []).map((p, idx) => ({
      id: `${p.provider}-${p.model}`,
      label: `${p.provider.toUpperCase()} • ${p.model}`,
      value: p.totalTokens,
      sublabel: `${p.queries} quer${p.queries === 1 ? 'y' : 'ies'} • In ${formatCompactNumber(p.inputTokens)} / Out ${formatCompactNumber(p.outputTokens)}`,
      color: PALETTE_SERIES[idx % PALETTE_SERIES.length],
    }));
  }, [tokenPieMode, tokens, analytics?.providerBreakdown]);

  const sortedFileBars = useMemo(() => {
    const docs = [...(analytics?.perDocumentMetrics || [])];
    docs.sort((a, b) =>
      fileBarMode === 'chunks'
        ? b.chunkCount - a.chunkCount
        : b.indexedTokens - a.indexedTokens
    );
    return docs.slice(0, 12);
  }, [analytics?.perDocumentMetrics, fileBarMode]);

  const maxFileBarVal = useMemo(() => {
    if (!sortedFileBars.length) return 1;
    return Math.max(
      1,
      ...sortedFileBars.map((d) =>
        fileBarMode === 'chunks' ? d.chunkCount : d.indexedTokens
      )
    );
  }, [sortedFileBars, fileBarMode]);

  const filteredDocuments = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    const rows = (analytics?.perDocumentMetrics || []).filter((doc) => {
      if (
        selectedStrategyFilter &&
        doc.selectedStrategy !== selectedStrategyFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.filename.toLowerCase().includes(q) ||
        doc.format.toLowerCase().includes(q) ||
        doc.selectedStrategy.toLowerCase().includes(q)
      );
    });
    rows.sort((a, b) => {
      if (docSortBy === 'chunks') return b.chunkCount - a.chunkCount;
      if (docSortBy === 'tokens') return b.indexedTokens - a.indexedTokens;
      if (docSortBy === 'coherence') return b.avgCoherence - a.avgCoherence;
      return b.ingestedAt.localeCompare(a.ingestedAt);
    });
    return rows;
  }, [
    analytics?.perDocumentMetrics,
    docSearch,
    docSortBy,
    selectedStrategyFilter,
  ]);

  const timeline = analytics?.queryTokenTimeline || [];
  const activeTrendPoint =
    hoveredTrendIdx !== null && timeline[hoveredTrendIdx]
      ? timeline[hoveredTrendIdx]
      : timeline.length > 0
      ? timeline[timeline.length - 1]
      : null;

  // Build SVG coordinates for Token Trend Chart
  const trendChartGeometry = useMemo(() => {
    const W = 680;
    const H = 200;
    const padL = 44;
    const padR = 16;
    const padT = 16;
    const padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const maxVal = Math.max(
      100,
      ...timeline.map((p) => Math.max(p.totalTokens, p.inputTokens, p.outputTokens))
    );
    const n = timeline.length;
    const points = timeline.map((pt, i) => {
      const x =
        n === 1 ? padL + plotW / 2 : padL + (i / Math.max(1, n - 1)) * plotW;
      const yTotal = padT + plotH - (pt.totalTokens / maxVal) * plotH;
      const yIn = padT + plotH - (pt.inputTokens / maxVal) * plotH;
      const yOut = padT + plotH - (pt.outputTokens / maxVal) * plotH;
      return { x, yTotal, yIn, yOut, pt };
    });

    const toLine = (coords: Array<[number, number]>) =>
      coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const toArea = (coords: Array<[number, number]>) => {
      if (!coords.length) return '';
      const baseY = padT + plotH;
      return `${toLine(coords)} L${coords[coords.length - 1][0].toFixed(1)},${baseY} L${coords[0][0].toFixed(1)},${baseY} Z`;
    };

    const inCoords = points.map((p): [number, number] => [p.x, p.yIn]);
    const outCoords = points.map((p): [number, number] => [p.x, p.yOut]);
    const totCoords = points.map((p): [number, number] => [p.x, p.yTotal]);

    return {
      W,
      H,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      maxVal,
      points,
      inLine: toLine(inCoords),
      inArea: toArea(inCoords),
      outLine: toLine(outCoords),
      outArea: toArea(outCoords),
      totLine: toLine(totCoords),
    };
  }, [timeline]);

  const formatDist = analytics?.formatDistribution || [];
  const totalFormatDocs = Math.max(
    1,
    formatDist.reduce((acc, f) => acc + f.documentCount, 0)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Action & Status Strip */}
      <div
        className="clay-card-alt"
        style={{
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="clay-tag clay-tag-terracotta">
            <PieChart size={12} />
            <span>LIVE PER-USER TELEMETRY</span>
          </span>
          <span className="clay-tag">
            <Cpu size={12} />
            <span>
              ACTIVE LLM: {config.generatorProvider.toUpperCase()} /{' '}
              {config.generatorModel}
            </span>
          </span>
          {tokens.providerApiQueries > 0 ? (
            <span className="clay-tag clay-tag-sage">
              <CheckCircle2 size={12} />
              <span>
                {tokens.providerApiQueries} EXACT API METERED RUNS
              </span>
            </span>
          ) : (
            <span className="clay-tag">
              <span>ESTIMATED TOKEN METERING</span>
            </span>
          )}
        </div>

        <button
          type="button"
          className="clay-btn"
          style={{ padding: '7px 14px', fontSize: '0.76rem' }}
          onClick={() => onRefresh(appliedStartIso, appliedEndIso)}
          disabled={isRefreshing}
        >
          <RefreshCw
            size={13}
            style={{
              animation: isRefreshing ? 'spin 1s linear infinite' : undefined,
            }}
          />
          <span>{isRefreshing ? 'REFRESHING...' : 'REFRESH METRICS'}</span>
        </button>
      </div>

      {/* Date & Time Range Filter Bar */}
      <div
        className="clay-card"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="font-mono"
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                color: 'var(--ink-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Calendar size={14} />
              <span>DATE &amp; TIME FILTER</span>
            </span>
            <span className="clay-tag" style={{ fontSize: '0.66rem' }}>
              {formatReadableRange(
                analytics?.appliedRange?.startAt ?? appliedStartIso,
                analytics?.appliedRange?.endAt ?? appliedEndIso
              )}
            </span>
          </div>

          <div
            className="clay-well"
            style={{
              padding: 4,
              borderRadius: 999,
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {(
              [
                { id: 'all', label: 'ALL TIME' },
                { id: 'today', label: 'TODAY' },
                { id: '24h', label: 'LAST 24H' },
                { id: '7d', label: 'LAST 7D' },
                { id: '30d', label: 'LAST 30D' },
                { id: 'custom', label: 'CUSTOM' },
              ] as Array<{ id: DatePresetId; label: string }>
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`clay-btn ${
                  datePreset === p.id ? 'clay-btn-terracotta' : ''
                }`}
                style={{ padding: '5px 11px', fontSize: '0.68rem' }}
                onClick={() => applyDatePreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleApplyCustomRange}
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 210px', minWidth: 190 }}>
            <label
              className="font-mono"
              style={{
                display: 'block',
                fontSize: '0.66rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
                marginBottom: 4,
              }}
            >
              FROM (DATE &amp; TIME)
            </label>
            <input
              type="datetime-local"
              className="clay-input font-mono"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setDatePreset('custom');
                setRangeError(null);
              }}
              style={{ padding: '7px 10px', fontSize: '0.76rem' }}
            />
          </div>

          <div style={{ flex: '1 1 210px', minWidth: 190 }}>
            <label
              className="font-mono"
              style={{
                display: 'block',
                fontSize: '0.66rem',
                fontWeight: 700,
                color: 'var(--ink-muted)',
                marginBottom: 4,
              }}
            >
              TO (DATE &amp; TIME)
            </label>
            <input
              type="datetime-local"
              className="clay-input font-mono"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setDatePreset('custom');
                setRangeError(null);
              }}
              style={{ padding: '7px 10px', fontSize: '0.76rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="clay-btn clay-btn-terracotta"
              style={{ padding: '8px 16px', fontSize: '0.74rem' }}
              disabled={isRefreshing}
            >
              APPLY RANGE
            </button>
            {(appliedStartIso || appliedEndIso || customStart || customEnd) && (
              <button
                type="button"
                className="clay-btn"
                style={{ padding: '8px 12px', fontSize: '0.74rem' }}
                onClick={() => {
                  setCustomStart('');
                  setCustomEnd('');
                  applyDatePreset('all');
                }}
              >
                <X size={13} />
                <span>CLEAR</span>
              </button>
            )}
          </div>
        </form>

        {rangeError && (
          <div
            className="font-mono"
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--clay-terracotta)',
            }}
          >
            {rangeError}
          </div>
        )}
      </div>

      {/* Top 4 Bento KPI Cards */}
      <div className="grid-4" style={{ gap: 16 }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="clay-card"
          style={{ padding: '18px 20px' }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sparkles size={13} />
            <span>TOTAL TOKENS USED</span>
          </div>
          <div
            className="font-display"
            style={{
              fontSize: '1.85rem',
              fontWeight: 700,
              marginTop: 6,
              color: 'var(--ink-primary)',
            }}
          >
            {formatCompactNumber(tokens.totalTokens)}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              color: 'var(--ink-secondary)',
              marginTop: 6,
            }}
          >
            In {formatCompactNumber(tokens.totalInputTokens)} • Out{' '}
            {formatCompactNumber(tokens.totalOutputTokens)}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="clay-card"
          style={{ padding: '18px 20px' }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={13} />
            <span>CORPUS &amp; CHUNKS</span>
          </div>
          <div
            className="font-display"
            style={{
              fontSize: '1.85rem',
              fontWeight: 700,
              marginTop: 6,
              color: 'var(--ink-primary)',
            }}
          >
            {corpus.totalChunks.toLocaleString()}{' '}
            <span
              style={{
                fontSize: '0.88rem',
                fontWeight: 600,
                color: 'var(--ink-muted)',
              }}
            >
              chunks
            </span>
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              color: 'var(--ink-secondary)',
              marginTop: 6,
            }}
          >
            {corpus.totalDocuments} docs •{' '}
            {formatCompactNumber(corpus.totalIndexedTokens)} indexed tok
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="clay-card"
          style={{ padding: '18px 20px' }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Clock size={13} />
            <span>AVG TOKENS / QUERY</span>
          </div>
          <div
            className="font-display"
            style={{
              fontSize: '1.85rem',
              fontWeight: 700,
              marginTop: 6,
              color: 'var(--ink-primary)',
            }}
          >
            {formatCompactNumber(tokens.avgTokensPerQuery)}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              color: 'var(--ink-secondary)',
              marginTop: 6,
            }}
          >
            {tokens.totalQueries} runs • {Math.round(tokens.avgLatencyMs)} ms avg
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="clay-card"
          style={{ padding: '18px 20px' }}
        >
          <div
            className="font-mono"
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'var(--ink-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Scissors size={13} />
            <span>DOMINANT TECHNIQUE</span>
          </div>
          <div
            className="font-display"
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              marginTop: 10,
              color: 'var(--ink-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {corpus.dominantStrategy === 'none'
              ? 'No Docs Yet'
              : getStrategyMeta(corpus.dominantStrategy).shortLabel}
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: '0.7rem',
              color: 'var(--ink-secondary)',
              marginTop: 8,
            }}
          >
            Auto: {corpus.autoOptimizedCount} • OCR: {corpus.ocrDocumentCount}
          </div>
        </motion.div>
      </div>

      {/* Row 1: Two Interactive Pie / Donut Charts */}
      <div className="grid-2" style={{ gap: 20 }}>
        {/* Pie 1: Chunking Techniques */}
        <div className="clay-card" style={{ padding: '22px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                className="font-display"
                style={{ fontSize: '1.05rem', fontWeight: 700 }}
              >
                Chunking Technique Distribution
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                Click any slice to filter the document table below
              </p>
            </div>
            <div className="clay-well" style={{ padding: 3, borderRadius: 999, display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={`clay-btn ${strategyMetricMode === 'chunks' ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                onClick={() => setStrategyMetricMode('chunks')}
              >
                BY CHUNKS
              </button>
              <button
                type="button"
                className={`clay-btn ${strategyMetricMode === 'docs' ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                onClick={() => setStrategyMetricMode('docs')}
              >
                BY DOCS
              </button>
            </div>
          </div>

          <InteractiveDonutChart
            slices={strategySlices}
            centerCaption={
              strategyMetricMode === 'docs' ? 'TOTAL DOCS' : 'TOTAL CHUNKS'
            }
            emptyText="Upload documents in Document & OCR Ingest to visualize chunking strategies."
            selectedId={selectedStrategyFilter}
            onSelectSlice={(id) =>
              setSelectedStrategyFilter((prev) => (prev === id ? null : id))
            }
          />
        </div>

        {/* Pie 2: Token Usage Breakdown */}
        <div className="clay-card" style={{ padding: '22px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                className="font-display"
                style={{ fontSize: '1.05rem', fontWeight: 700 }}
              >
                Token Consumption Breakdown
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                Small LLM Reshaper vs Main Generator &amp; provider share
              </p>
            </div>
            <div className="clay-well" style={{ padding: 3, borderRadius: 999, display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={`clay-btn ${tokenPieMode === 'stages' ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                onClick={() => setTokenPieMode('stages')}
              >
                BY STAGE
              </button>
              <button
                type="button"
                className={`clay-btn ${tokenPieMode === 'providers' ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                onClick={() => setTokenPieMode('providers')}
              >
                BY MODEL
              </button>
            </div>
          </div>

          <InteractiveDonutChart
            slices={tokenPieSlices}
            centerCaption="TOTAL TOKENS"
            emptyText="Run a query in Chat Assistant to populate real-time token consumption."
          />
        </div>
      </div>

      {/* Row 2: Token Usage Trend Graph + Chunks per File Bar Chart */}
      <div className="grid-2" style={{ gap: 20 }}>
        {/* Area/Line Graph: Token Trend Over Queries */}
        <div className="clay-card" style={{ padding: '22px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                className="font-display"
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <TrendingUp size={17} />
                <span>Token Usage Trend (Last {timeline.length} Runs)</span>
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                Hover any point to inspect input vs output tokens per query
              </p>
            </div>
            <div
              className="font-mono"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: '0.68rem',
                fontWeight: 700,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    backgroundColor: 'var(--clay-cobalt)',
                  }}
                />
                INPUT
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    backgroundColor: 'var(--clay-terracotta)',
                  }}
                />
                OUTPUT
              </span>
            </div>
          </div>

          {timeline.length === 0 ? (
            <div
              className="clay-well"
              style={{
                padding: '32px 18px',
                borderRadius: 18,
                textAlign: 'center',
                color: 'var(--ink-muted)',
                fontSize: '0.84rem',
              }}
            >
              No queries recorded yet. Ask a question in Chat Assistant to see your token trend graph.
            </div>
          ) : (
            <>
              <div
                className="clay-well"
                style={{ padding: '12px 10px 6px', borderRadius: 18 }}
              >
                <svg
                  viewBox={`0 0 ${trendChartGeometry.W} ${trendChartGeometry.H}`}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  role="img"
                  aria-label="Token usage trend graph"
                >
                  {/* Horizontal Gridlines & Y Labels */}
                  {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                    const y =
                      trendChartGeometry.padT +
                      trendChartGeometry.plotH * (1 - frac);
                    const val = Math.round(trendChartGeometry.maxVal * frac);
                    return (
                      <g key={frac}>
                        <line
                          x1={trendChartGeometry.padL}
                          y1={y}
                          x2={trendChartGeometry.W - trendChartGeometry.padR}
                          y2={y}
                          stroke="var(--ink-muted)"
                          strokeOpacity="0.18"
                          strokeDasharray="3 4"
                        />
                        <text
                          x={trendChartGeometry.padL - 6}
                          y={y + 3}
                          textAnchor="end"
                          fill="var(--ink-muted)"
                          fontSize="9.5"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {formatCompactNumber(val)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Input & Output Areas/Lines */}
                  {trendChartGeometry.points.length > 1 && (
                    <>
                      <path
                        d={trendChartGeometry.inArea}
                        fill="var(--clay-cobalt)"
                        fillOpacity="0.14"
                      />
                      <path
                        d={trendChartGeometry.outArea}
                        fill="var(--clay-terracotta)"
                        fillOpacity="0.18"
                      />
                      <path
                        d={trendChartGeometry.inLine}
                        fill="none"
                        stroke="var(--clay-cobalt)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d={trendChartGeometry.outLine}
                        fill="none"
                        stroke="var(--clay-terracotta)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  )}

                  {/* Interactive Points */}
                  {trendChartGeometry.points.map((p, idx) => {
                    const isActive =
                      hoveredTrendIdx === idx ||
                      (hoveredTrendIdx === null &&
                        idx === trendChartGeometry.points.length - 1);
                    return (
                      <g
                        key={p.pt.queryId || idx}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHoveredTrendIdx(idx)}
                        onMouseLeave={() => setHoveredTrendIdx(null)}
                      >
                        {isActive && (
                          <line
                            x1={p.x}
                            y1={trendChartGeometry.padT}
                            x2={p.x}
                            y2={
                              trendChartGeometry.padT +
                              trendChartGeometry.plotH
                            }
                            stroke="var(--ink-muted)"
                            strokeOpacity="0.35"
                            strokeDasharray="2 3"
                          />
                        )}
                        <circle
                          cx={p.x}
                          cy={p.yIn}
                          r={isActive ? 5 : 3.2}
                          fill="var(--clay-cobalt)"
                          stroke="var(--clay-surface-alt)"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={p.x}
                          cy={p.yOut}
                          r={isActive ? 5 : 3.2}
                          fill="var(--clay-terracotta)"
                          stroke="var(--clay-surface-alt)"
                          strokeWidth="1.5"
                        />
                        {/* Larger invisible hit zone */}
                        <rect
                          x={p.x - 10}
                          y={trendChartGeometry.padT}
                          width={20}
                          height={trendChartGeometry.plotH}
                          fill="transparent"
                        />
                      </g>
                    );
                  })}

                  {/* X-axis Start / Mid / End labels */}
                  {trendChartGeometry.points.length > 0 &&
                    Array.from(
                      new Set([
                        0,
                        Math.floor((trendChartGeometry.points.length - 1) / 2),
                        trendChartGeometry.points.length - 1,
                      ])
                    ).map((idx) => {
                      const p = trendChartGeometry.points[idx];
                      return (
                        <text
                          key={idx}
                          x={p.x}
                          y={trendChartGeometry.H - 7}
                          textAnchor="middle"
                          fill="var(--ink-muted)"
                          fontSize="9"
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {p.pt.label || `#${idx + 1}`}
                        </text>
                      );
                    })}
                </svg>
              </div>

              {/* Active Point Inspector Strip */}
              {activeTrendPoint && (
                <div
                  className="clay-card-alt"
                  style={{
                    marginTop: 12,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    fontSize: '0.76rem',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: 'var(--ink-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      “{activeTrendPoint.promptPreview || 'Query Run'}”
                    </div>
                    <div
                      className="font-mono"
                      style={{ fontSize: '0.67rem', color: 'var(--ink-muted)' }}
                    >
                      {activeTrendPoint.provider.toUpperCase()} /{' '}
                      {activeTrendPoint.model} • {activeTrendPoint.latencyMs}ms
                      • {activeTrendPoint.source === 'provider_api' ? 'Exact API' : 'Estimated'}
                    </div>
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      display: 'flex',
                      gap: 10,
                      fontSize: '0.71rem',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ color: 'var(--clay-cobalt)' }}>
                      IN: {formatCompactNumber(activeTrendPoint.inputTokens)}
                    </span>
                    <span style={{ color: 'var(--clay-terracotta)' }}>
                      OUT: {formatCompactNumber(activeTrendPoint.outputTokens)}
                    </span>
                    <span style={{ color: 'var(--ink-primary)' }}>
                      TOT: {formatCompactNumber(activeTrendPoint.totalTokens)}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Horizontal Bar Chart: Chunks / Indexed Tokens per File */}
        <div className="clay-card" style={{ padding: '22px 24px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 14,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                className="font-display"
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <FileText size={17} />
                <span>Chunks &amp; Tokens per Uploaded File</span>
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                Color-coded by the chunking technique applied to each file
              </p>
            </div>
            <div className="clay-well" style={{ padding: 3, borderRadius: 999, display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={`clay-btn ${fileBarMode === 'chunks' ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                onClick={() => setFileBarMode('chunks')}
              >
                CHUNKS
              </button>
              <button
                type="button"
                className={`clay-btn ${fileBarMode === 'tokens' ? 'clay-btn-terracotta' : ''}`}
                style={{ padding: '4px 10px', fontSize: '0.68rem' }}
                onClick={() => setFileBarMode('tokens')}
              >
                TOKENS
              </button>
            </div>
          </div>

          {sortedFileBars.length === 0 ? (
            <div
              className="clay-well"
              style={{
                padding: '32px 18px',
                borderRadius: 18,
                textAlign: 'center',
                color: 'var(--ink-muted)',
                fontSize: '0.84rem',
              }}
            >
              No files uploaded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {sortedFileBars.map((doc) => {
                const val =
                  fileBarMode === 'chunks' ? doc.chunkCount : doc.indexedTokens;
                const pct = Math.max(4, Math.round((val / maxFileBarVal) * 100));
                const sMeta = getStrategyMeta(doc.selectedStrategy);
                return (
                  <div key={doc.documentId}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: 'var(--ink-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={`${doc.filename} (${doc.format} • ${sMeta.label})`}
                      >
                        {doc.title}
                      </div>
                      <div
                        className="font-mono"
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: 'var(--ink-secondary)',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.62rem',
                            padding: '1px 6px',
                            borderRadius: 999,
                            backgroundColor: 'var(--clay-well)',
                            color: 'var(--ink-muted)',
                          }}
                        >
                          {sMeta.shortLabel}
                        </span>
                        <span>
                          {formatCompactNumber(val)}{' '}
                          {fileBarMode === 'chunks' ? 'ch' : 'tok'}
                        </span>
                      </div>
                    </div>
                    <div
                      className="clay-well"
                      style={{
                        height: 11,
                        borderRadius: 999,
                        overflow: 'hidden',
                        padding: 0,
                      }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.45, ease: 'easeOut' }}
                        style={{
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: sMeta.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Format & Extraction Mix Bar */}
      <div className="clay-card" style={{ padding: '20px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanText size={17} />
            <h3 className="font-display" style={{ fontSize: '1rem', fontWeight: 700 }}>
              Document Format &amp; Extraction Mix
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="clay-tag clay-tag-sage">
              NATIVE PARSED: {corpus.nativeDocumentCount}
            </span>
            <span className="clay-tag clay-tag-ochre">
              OCR PROCESSED: {corpus.ocrDocumentCount}
            </span>
            <span className="clay-tag clay-tag-cobalt">
              AUTO-OPTIMIZED: {corpus.autoOptimizedCount} / {corpus.totalDocuments}
            </span>
          </div>
        </div>

        {formatDist.length > 0 ? (
          <>
            <div
              className="clay-well"
              style={{
                height: 16,
                borderRadius: 999,
                overflow: 'hidden',
                display: 'flex',
                padding: 0,
              }}
            >
              {formatDist.map((f, idx) => {
                const widthPct = (f.documentCount / totalFormatDocs) * 100;
                return (
                  <div
                    key={f.format}
                    title={`${f.format}: ${f.documentCount} docs, ${f.chunkCount} chunks`}
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor:
                        PALETTE_SERIES[idx % PALETTE_SERIES.length],
                      transition: 'width 0.3s ease',
                    }}
                  />
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                gap: 14,
                flexWrap: 'wrap',
                marginTop: 10,
              }}
            >
              {formatDist.map((f, idx) => (
                <div
                  key={f.format}
                  className="font-mono"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.72rem',
                    color: 'var(--ink-secondary)',
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      backgroundColor:
                        PALETTE_SERIES[idx % PALETTE_SERIES.length],
                    }}
                  />
                  <strong>{f.format}</strong>
                  <span style={{ color: 'var(--ink-muted)' }}>
                    {f.documentCount} doc{f.documentCount === 1 ? '' : 's'} (
                    {f.chunkCount} ch)
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            No documents indexed yet.
          </div>
        )}
      </div>

      {/* Row 4: Full Per-Document Technique & Chunk Audit Table */}
      <div className="clay-card" style={{ padding: '22px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h3 className="font-display" style={{ fontSize: '1.08rem', fontWeight: 700 }}>
              Per-Document Technique, Chunks &amp; Token Breakdown
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
              Complete audit of extraction pipeline, chunking algorithm, chunk count, and indexed tokens per uploaded file
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {selectedStrategyFilter && (
              <button
                type="button"
                className="clay-btn clay-btn-terracotta"
                style={{ padding: '6px 11px', fontSize: '0.7rem' }}
                onClick={() => setSelectedStrategyFilter(null)}
              >
                <span>
                  FILTER: {getStrategyMeta(selectedStrategyFilter).shortLabel}
                </span>
                <X size={12} />
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <Search
                size={13}
                style={{
                  position: 'absolute',
                  left: 11,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                className="clay-input"
                placeholder="Search file or strategy..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                style={{
                  paddingLeft: 30,
                  paddingTop: 7,
                  paddingBottom: 7,
                  fontSize: '0.78rem',
                  width: 205,
                }}
              />
            </div>
            <select
              className="clay-select"
              value={docSortBy}
              onChange={(e) =>
                setDocSortBy(
                  e.target.value as 'newest' | 'chunks' | 'tokens' | 'coherence'
                )
              }
              style={{ padding: '7px 12px', fontSize: '0.76rem', width: 'auto' }}
            >
              <option value="chunks">Sort: Most Chunks</option>
              <option value="tokens">Sort: Most Tokens</option>
              <option value="coherence">Sort: Highest Coherence</option>
              <option value="newest">Sort: Newest First</option>
            </select>
          </div>
        </div>

        {filteredDocuments.length === 0 ? (
          <div
            className="clay-well"
            style={{
              padding: '26px 18px',
              borderRadius: 16,
              textAlign: 'center',
              color: 'var(--ink-muted)',
              fontSize: '0.84rem',
            }}
          >
            No documents match the current filter.
          </div>
        ) : (
          <div className="doc-reader-table-wrap" style={{ margin: 0 }}>
            <table className="doc-reader-table">
              <thead>
                <tr>
                  <th>Document / File</th>
                  <th>Format</th>
                  <th>Extraction Technique</th>
                  <th>Chunking Technique</th>
                  <th>Chunks</th>
                  <th>Indexed Tokens</th>
                  <th>Coherence</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => {
                  const sMeta = getStrategyMeta(doc.selectedStrategy);
                  return (
                    <tr key={doc.documentId}>
                      <td>
                        <div
                          style={{
                            fontWeight: 700,
                            color: 'var(--ink-primary)',
                            maxWidth: 230,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={doc.filename}
                        >
                          {doc.title}
                        </div>
                        <div
                          className="font-mono"
                          style={{
                            fontSize: '0.67rem',
                            color: 'var(--ink-muted)',
                            maxWidth: 230,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {doc.filename}
                        </div>
                      </td>
                      <td>
                        <span className="clay-tag" style={{ fontSize: '0.66rem' }}>
                          {doc.format}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                          {doc.ocrUsed
                            ? `Tesseract OCR (${doc.ocrConfidence.toFixed(0)}%)`
                            : 'Native Text Parser'}
                        </div>
                        {doc.noiseReductionPct > 0 && (
                          <div
                            className="font-mono"
                            style={{
                              fontSize: '0.66rem',
                              color: 'var(--ink-muted)',
                            }}
                          >
                            -{doc.noiseReductionPct.toFixed(1)}% noise cleaned
                          </div>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              backgroundColor: sMeta.color,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>
                            {sMeta.label}
                          </span>
                        </div>
                        <div
                          className="font-mono"
                          style={{
                            fontSize: '0.65rem',
                            color: 'var(--ink-muted)',
                            marginTop: 2,
                          }}
                        >
                          {doc.autoOptimized ? 'AUTO-OPTIMIZED' : 'MANUAL'}
                        </div>
                      </td>
                      <td className="font-mono" style={{ fontWeight: 700 }}>
                        {doc.chunkCount}
                        <div
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 500,
                            color: 'var(--ink-muted)',
                          }}
                        >
                          ~{doc.avgTokensPerChunk} tok/ch
                        </div>
                      </td>
                      <td className="font-mono" style={{ fontWeight: 700 }}>
                        {doc.indexedTokens.toLocaleString()}
                      </td>
                      <td className="font-mono" style={{ fontWeight: 700 }}>
                        {doc.avgCoherence > 0 ? `${doc.avgCoherence}%` : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="clay-btn"
                          style={{ padding: '5px 10px', fontSize: '0.68rem' }}
                          onClick={() => onNavigate('chunking')}
                        >
                          <span>Re-Chunk</span>
                          <ArrowUpRight size={11} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
