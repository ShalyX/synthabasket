'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  Clock,
  Database,
  Layers,
  RefreshCw,
  Route,
  TrendingUp,
} from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BasisMonitorItem } from '../lib/types';
import { AssetAvatar } from './AssetAvatar';

interface BasisMonitorProps {
  items: BasisMonitorItem[];
  status?: 'loading' | 'ready' | 'error';
  lastRefreshedAt?: number | null;
  now?: number;
}

interface MarketHistoryPoint {
  timestamp: number;
  symbol: string;
  provider: string;
  tokenMint: string;
  priceUsd: number;
  impliedValuationUsd?: number;
}

interface VerifiedLiquidityRoute {
  tokenMint: string;
  dexPriceUsd: number;
  quotedUsdc: number;
  quotedTokenAmount: number;
  venueLabels: string[];
  priceImpactPct?: number;
  verifiedAt: number;
  source: 'jupiter_v2';
}

const TIMEFRAMES = [
  { label: '1H', ms: 60 * 60 * 1000 },
  { label: '24H', ms: 24 * 60 * 60 * 1000 },
  { label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

function formatUsd(value?: number, compact = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    ...(compact ? { notation: 'compact', maximumFractionDigits: 2 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  }).format(value);
}

function formatAge(timestamp: number | null | undefined, now: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function underlyingKey(symbol: string) {
  return symbol.replace(/^T-/i, '').toUpperCase();
}

export const BasisMonitor: React.FC<BasisMonitorProps> = ({
  items,
  status = 'ready',
  lastRefreshedAt = null,
  now = Date.now(),
}) => {
  const [selectedMint, setSelectedMint] = useState('');
  const [chartTimeframe, setChartTimeframe] = useState<(typeof TIMEFRAMES)[number]['label']>('24H');
  const [historyPoints, setHistoryPoints] = useState<MarketHistoryPoint[]>([]);
  const [durableHistoryEnabled, setDurableHistoryEnabled] = useState(false);
  const [liquidityRoutes, setLiquidityRoutes] = useState<VerifiedLiquidityRoute[]>([]);

  useEffect(() => {
    if (!selectedMint || !items.some((item) => item.tokenMint === selectedMint)) {
      setSelectedMint(items[0]?.tokenMint || '');
    }
  }, [items, selectedMint]);

  const selectedItem = items.find((item) => item.tokenMint === selectedMint) || items[0];
  const selectedRange = TIMEFRAMES.find((range) => range.label === chartTimeframe) || TIMEFRAMES[1];

  useEffect(() => {
    if (!selectedItem?.tokenMint) {
      setHistoryPoints([]);
      return;
    }

    let cancelled = false;
    async function loadHistory() {
      try {
        const response = await fetch(
          `/api/market-history?tokenMint=${encodeURIComponent(selectedItem.tokenMint)}&rangeMs=${selectedRange.ms}`,
          { cache: 'no-store' }
        );
        const payload = await response.json();
        if (cancelled) return;
        setDurableHistoryEnabled(payload.durable === true);
        setHistoryPoints(
          Array.isArray(payload.points)
            ? payload.points.filter((point: MarketHistoryPoint) => Number.isFinite(point.timestamp) && Number.isFinite(point.priceUsd))
            : []
        );
      } catch {
        if (!cancelled) {
          setDurableHistoryEnabled(false);
          setHistoryPoints([]);
        }
      }
    }

    void loadHistory();
    const id = window.setInterval(loadHistory, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [selectedItem?.tokenMint, selectedRange.ms]);

  useEffect(() => {
    const mints = [...new Set(items.map((item) => item.tokenMint).filter(Boolean))];
    if (mints.length === 0) {
      setLiquidityRoutes([]);
      return;
    }

    let cancelled = false;
    async function loadLiquidity() {
      try {
        const response = await fetch(`/api/market-liquidity?mints=${encodeURIComponent(mints.join(','))}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!cancelled) setLiquidityRoutes(Array.isArray(payload.routes) ? payload.routes : []);
      } catch {
        if (!cancelled) setLiquidityRoutes([]);
      }
    }

    void loadLiquidity();
    const id = window.setInterval(loadLiquidity, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [items]);

  const liveDisplayCount = items.length;
  const providers = new Set(items.map((item) => item.provider)).size;
  const benchmarkedCount = items.filter(
    (item) => typeof item.pythBenchmarkPriceUsd === 'number'
  ).length;

  const comparableGroups = useMemo(() => {
    const grouped = new Map<string, BasisMonitorItem[]>();
    for (const item of items) {
      const key = underlyingKey(item.symbol);
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }

    return Array.from(grouped.entries())
      .map(([key, groupItems]) => {
        const providerSet = new Set(groupItems.map((item) => item.provider));
        const withValuation = groupItems.filter((item) => typeof item.impliedValuationUsd === 'number' && Number.isFinite(item.impliedValuationUsd) && item.impliedValuationUsd! > 0);
        if (providerSet.size < 2 || withValuation.length < 2) return null;
        const valuations = withValuation.map((item) => item.impliedValuationUsd as number);
        const minValuation = Math.min(...valuations);
        const maxValuation = Math.max(...valuations);
        return {
          key,
          items: withValuation,
          dispersionPct: minValuation > 0 ? ((maxValuation - minValuation) / minValuation) * 100 : 0,
        };
      })
      .filter((group): group is { key: string; items: BasisMonitorItem[]; dispersionPct: number } => Boolean(group))
      .sort((a, b) => b.dispersionPct - a.dispersionPct);
  }, [items]);

  const verifiedBasisRows = useMemo(() => {
    return liquidityRoutes
      .map((route) => {
        const item = items.find((candidate) => candidate.tokenMint === route.tokenMint);
        if (!item || item.providerMarkPriceUsd <= 0) return null;
        return {
          item,
          route,
          basisPct: ((route.dexPriceUsd - item.providerMarkPriceUsd) / item.providerMarkPriceUsd) * 100,
        };
      })
      .filter((row): row is { item: BasisMonitorItem; route: VerifiedLiquidityRoute; basisPct: number } => Boolean(row));
  }, [items, liquidityRoutes]);

  const chartChange = useMemo(() => {
    if (historyPoints.length < 2) return null;
    const first = historyPoints[0].priceUsd;
    const last = historyPoints[historyPoints.length - 1].priceUsd;
    return first > 0 ? ((last - first) / first) * 100 : null;
  }, [historyPoints]);

  if (status === 'loading' && items.length === 0) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-brand-primary" /><h2 className="mt-3 text-sm font-bold text-ink-primary">Loading private-market data</h2></div>;
  }

  if (status === 'error' && items.length === 0) {
    return <div className="rounded-xl border border-border bg-surface p-10 text-center"><AlertCircle className="mx-auto h-5 w-5 text-brand-warning" /><h2 className="mt-3 text-sm font-bold text-ink-primary">Market data is temporarily unavailable</h2></div>;
  }

  return (
    <div className="space-y-6 font-sans">
      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface-elevated text-brand-primary"><Activity className="h-4 w-4" /></div>
              <div>
                <h1 className="text-base font-bold uppercase tracking-wider text-ink-primary">Private Markets</h1>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">Provider marks, durable price history, official private-index references, and liquidity signals only when they can be verified.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] text-ink-tertiary">
            <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-brand-primary" />Refreshed {formatAge(lastRefreshedAt, now)}</span>
            <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" />{liveDisplayCount} connected markets</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-4">
          <Metric label="Tracked assets" value={String(items.length)} detail="Connected provider instruments" />
          <Metric label="Providers" value={String(providers)} detail="PreStocks + Tessera" />
          <Metric label="Comparable names" value={String(comparableGroups.length)} detail="2+ valuation marks" />
          <Metric
            label="Pyth reference"
            value={benchmarkedCount > 0 ? String(benchmarkedCount) : '—'}
            detail={benchmarkedCount > 0 ? 'Indicative values available' : 'No value returned'}
          />
        </div>
      </section>

      {selectedItem && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-ink-primary"><TrendingUp className="h-4 w-4 text-brand-primary" />Market-price history</div>
              <p className="mt-1 text-[11px] text-ink-secondary">Live provider observations persisted server-side. Snapshot fallbacks never create chart points.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={selectedMint} onChange={(event) => setSelectedMint(event.target.value)} className="rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-xs text-ink-primary outline-none">
                {items.map((item) => <option key={item.tokenMint} value={item.tokenMint}>{item.symbol} · {item.provider}</option>)}
              </select>
              {TIMEFRAMES.map((range) => <button key={range.label} onClick={() => setChartTimeframe(range.label)} className={chartTimeframe === range.label ? 'text-xs font-semibold text-brand-primary' : 'text-xs text-ink-tertiary hover:text-ink-primary'}>{range.label}</button>)}
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="flex items-center gap-3"><AssetAvatar symbol={selectedItem.symbol} name={selectedItem.name} logoUrl={selectedItem.logoUrl} size="lg" /><div><div className="text-xs text-ink-tertiary">{selectedItem.symbol} · {selectedItem.provider}</div><div className="mt-1 font-mono text-2xl font-bold text-ink-primary">{formatUsd(selectedItem.providerMarkPriceUsd)}</div></div></div>
            {chartChange !== null && <div className={chartChange >= 0 ? 'font-mono text-sm font-semibold text-brand-primary' : 'font-mono text-sm font-semibold text-semantic-negative'}>{chartChange >= 0 ? '+' : ''}{chartChange.toFixed(2)}% {chartTimeframe}</div>}
          </div>

          {historyPoints.length >= 2 ? (
            <>
              <div className="mt-4 h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyPoints} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(value) => new Date(Number(value)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={28} />
                    <YAxis dataKey="priceUsd" domain={['auto', 'auto']} tickFormatter={(value) => `$${Number(value).toFixed(0)}`} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                    <Tooltip labelFormatter={(value) => new Date(Number(value)).toLocaleString()} formatter={(value) => [formatUsd(Number(value)), 'Provider mark']} contentStyle={{ background: 'rgb(var(--surface-rgb))', border: '1px solid rgb(var(--border-rgb))', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="priceUsd" stroke="#00d182" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-ink-tertiary"><span>{historyPoints.length} real observations</span><span>{durableHistoryEnabled ? 'Durable server history' : 'Durable store unavailable'}</span></div>
            </>
          ) : (
            <div className="mt-4 flex h-52 items-center justify-center border-y border-border text-center"><div><p className="text-sm font-medium text-ink-secondary">Collecting live market history</p><p className="mt-1 text-xs text-ink-tertiary">A chart appears after at least two live provider observations. No backfill is fabricated.</p></div></div>
          )}
        </section>
      )}

      {comparableGroups.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="border-b border-border pb-4"><div className="flex items-center gap-2 text-sm font-bold text-ink-primary"><ArrowRightLeft className="h-4 w-4 text-brand-primary" />Cross-provider valuation signals</div><p className="mt-1 text-[11px] text-ink-secondary">Same-company implied valuations are compared where both providers expose a valuation mark. This is provider dispersion, not executable arbitrage.</p></div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {comparableGroups.slice(0, 3).map((group) => <div key={group.key} className="rounded-lg border border-border-subtle bg-surface-subtle p-4"><div className="flex items-start justify-between gap-4"><div><div className="font-mono text-sm font-bold text-ink-primary">{group.key}</div><div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">Implied valuation</div></div><span className="font-mono text-[10px] text-ink-tertiary">{group.dispersionPct.toFixed(1)}% dispersion</span></div><div className="mt-4 space-y-2">{group.items.map((item) => <div key={item.tokenMint} className="flex items-center justify-between gap-3 text-xs"><span className="capitalize text-ink-secondary">{item.provider}</span><span className="font-mono font-semibold text-ink-primary">{formatUsd(item.impliedValuationUsd, true)}</span></div>)}</div></div>)}
          </div>
        </section>
      )}

      {verifiedBasisRows.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="border-b border-border pb-4"><div className="flex items-center gap-2 text-sm font-bold text-ink-primary"><Route className="h-4 w-4 text-brand-primary" />Verified Liquidity / Basis</div><p className="mt-1 text-[11px] text-ink-secondary">This layer appears only when Jupiter returns a real mainnet route for the canonical provider mint. Basis uses a 10 USDC routable quote and is not a guarantee of fill at larger size.</p></div>
          <div className="mt-4 divide-y divide-border md:hidden">
            {verifiedBasisRows.map(({ item, route, basisPct }) => (
              <article key={item.tokenMint} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm font-bold text-ink-primary">{item.symbol}</p>
                    <p className="mt-1 text-[10px] text-ink-tertiary">{route.venueLabels.length ? route.venueLabels.join(' + ') : 'Jupiter route'}</p>
                  </div>
                  <p className={basisPct >= 0 ? 'font-mono text-sm font-semibold text-brand-primary' : 'font-mono text-sm font-semibold text-semantic-negative'}>{basisPct >= 0 ? '+' : ''}{basisPct.toFixed(2)}%</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Provider mark</p><p className="mt-1 font-mono text-xs text-ink-secondary">{formatUsd(item.providerMarkPriceUsd)}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Jupiter quote</p><p className="mt-1 font-mono text-xs text-ink-primary">{formatUsd(route.dexPriceUsd)}</p></div>
                </div>
                <p className="mt-3 text-[10px] text-ink-tertiary">Verified {formatAge(route.verifiedAt, now)}</p>
              </article>
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block"><table className="min-w-[760px] w-full text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-ink-tertiary"><tr><th className="py-2">Asset</th><th className="py-2 text-right">Provider mark</th><th className="py-2 text-right">Jupiter quote</th><th className="py-2 text-right">Basis</th><th className="py-2">Route</th><th className="py-2 text-right">Verified</th></tr></thead><tbody className="divide-y divide-border-subtle">{verifiedBasisRows.map(({ item, route, basisPct }) => <tr key={item.tokenMint}><td className="py-3 font-mono font-semibold text-ink-primary">{item.symbol}</td><td className="py-3 text-right font-mono text-ink-secondary">{formatUsd(item.providerMarkPriceUsd)}</td><td className="py-3 text-right font-mono text-ink-primary">{formatUsd(route.dexPriceUsd)}</td><td className={basisPct >= 0 ? 'py-3 text-right font-mono font-semibold text-brand-primary' : 'py-3 text-right font-mono font-semibold text-semantic-negative'}>{basisPct >= 0 ? '+' : ''}{basisPct.toFixed(2)}%</td><td className="py-3 text-ink-secondary">{route.venueLabels.length ? route.venueLabels.join(' + ') : 'Jupiter route'}</td><td className="py-3 text-right font-mono text-ink-tertiary">{formatAge(route.verifiedAt, now)}</td></tr>)}</tbody></table></div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border bg-surface-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-xs font-bold uppercase tracking-wider text-ink-primary">Provider market board</span><p className="mt-0.5 text-[10px] text-ink-tertiary">Raw token marks remain provider-specific; different token structures are not normalized into fake arbitrage.</p></div><span className="font-mono text-[10px] text-ink-tertiary">Refresh: 30s while active</span></div>
        <div className="divide-y divide-border md:hidden">
          {items.map((item) => {
            const positive = item.change24h > 0;
            const negative = item.change24h < 0;
            return (
              <article key={item.tokenMint} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <AssetAvatar symbol={item.symbol} name={item.name} logoUrl={item.logoUrl} />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-bold text-ink-primary">{item.symbol}</p>
                      <p className="mt-1 truncate text-[10px] capitalize text-ink-tertiary">{item.name} · {item.provider}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase text-brand-primary"><span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />Live</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3">
                  <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Provider mark</p><p className="mt-1 font-mono text-sm font-semibold text-ink-primary">{formatUsd(item.providerMarkPriceUsd)}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">24h</p><p className={positive ? 'mt-1 font-mono text-sm font-semibold text-brand-primary' : negative ? 'mt-1 font-mono text-sm font-semibold text-semantic-negative' : 'mt-1 font-mono text-sm font-semibold text-ink-secondary'}>{item.change24hAvailable ? (positive ? '+' : '') + item.change24h.toFixed(2) + '%' : '—'}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Implied valuation</p><p className="mt-1 font-mono text-xs text-ink-secondary">{formatUsd(item.impliedValuationUsd, true)}</p></div>
                  <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Quote age</p><p className="mt-1 text-xs text-ink-secondary">{formatAge(item.lastUpdated, now)}</p></div>
                </div>
                <p className="mt-3 text-[10px] text-ink-tertiary">{typeof item.pythBenchmarkPriceUsd === 'number' ? 'Pyth reference ' + formatUsd(item.pythBenchmarkPriceUsd) + ' · indicative only' : 'No Pyth reference returned'}</p>
              </article>
            );
          })}
        </div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[1040px] w-full text-left font-mono text-xs"><thead className="border-b border-border bg-surface-subtle font-sans text-[10px] uppercase tracking-wider text-ink-tertiary"><tr><th className="px-5 py-3">Asset</th><th className="px-5 py-3">Provider</th><th className="px-5 py-3 text-right">Provider mark</th><th className="px-5 py-3 text-right">Implied valuation</th><th className="px-5 py-3 text-right">24h</th><th className="px-5 py-3">Source</th><th className="px-5 py-3 text-right">Quote age</th><th className="px-5 py-3 text-right">Pyth reference</th></tr></thead><tbody className="divide-y divide-border-subtle">{items.map((item) => <MarketRow key={item.tokenMint} item={item} now={now} />)}</tbody></table></div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-[11px] leading-relaxed text-ink-secondary"><Layers className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" /><p>Provider marks are market data, not guaranteed liquidity. Pyth reference values are shown only when a supported value is returned; otherwise the table displays —. A liquidity/basis comparison is shown separately and only after the app verifies a live Jupiter route for the provider mint.</p></div>
    </div>
  );
};

const Metric = ({ label, value, detail }: { label: string; value: string; detail: string }) => <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3"><span className="text-[10px] uppercase text-ink-tertiary">{label}</span><div className="mt-1 font-mono text-lg font-bold text-ink-primary">{value}</div><span className="text-[10px] text-ink-secondary">{detail}</span></div>;


const MarketRow = ({ item, now }: { item: BasisMonitorItem; now: number }) => {
  const positive = item.change24h > 0;
  const negative = item.change24h < 0;
  return <tr className="transition-colors hover:bg-surface-elevated/40"><td className="px-5 py-4"><div className="flex items-center gap-3"><AssetAvatar symbol={item.symbol} name={item.name} logoUrl={item.logoUrl} /><div><div className="font-bold text-ink-primary">{item.symbol}</div><div className="mt-0.5 font-sans text-[10px] text-ink-tertiary">{item.name}</div></div></div></td><td className="px-5 py-4"><span className="text-[10px] uppercase tracking-wide text-ink-secondary">{item.provider}</span></td><td className="px-5 py-4 text-right font-semibold text-ink-primary">{formatUsd(item.providerMarkPriceUsd)}</td><td className="px-5 py-4 text-right text-ink-secondary">{formatUsd(item.impliedValuationUsd, true)}</td><td className="px-5 py-4 text-right">{item.change24hAvailable ? <span className={positive ? 'font-semibold text-brand-primary' : negative ? 'font-semibold text-semantic-negative' : 'font-semibold text-ink-secondary'}>{positive ? '+' : ''}{item.change24h.toFixed(2)}%</span> : <span className="text-ink-tertiary">—</span>}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase text-brand-primary"><span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />Live</span></td><td className="px-5 py-4 text-right text-ink-tertiary"><span className="inline-flex items-center gap-1.5"><Clock className="h-3 w-3" />{formatAge(item.lastUpdated, now)}</span></td><td className="px-5 py-4 text-right">{typeof item.pythBenchmarkPriceUsd === 'number' ? <div><div className="font-semibold text-ink-primary">{formatUsd(item.pythBenchmarkPriceUsd)}</div><div className="mt-0.5 font-sans text-[10px] text-ink-tertiary">Indicative Pyth Index · not executable</div></div> : <span className="font-sans text-[10px] text-ink-tertiary">—</span>}</td></tr>;
};
