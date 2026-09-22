'use client';

import React from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { BasisMonitorItem } from '../lib/types';

interface BasisMonitorProps {
  items: BasisMonitorItem[];
  status?: 'loading' | 'ready' | 'error';
  lastRefreshedAt?: number | null;
  now?: number;
}

function formatUsd(value?: number, compact = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';

  if (compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAge(timestamp: number | null | undefined, now: number) {
  if (!timestamp || !Number.isFinite(timestamp)) return 'Unknown';

  const deltaSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (deltaSeconds < 10) return 'Just now';
  if (deltaSeconds < 60) return String(deltaSeconds) + 's ago';

  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return String(minutes) + 'm ago';

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return String(hours) + 'h ago';

  const days = Math.floor(hours / 24);
  return String(days) + 'd ago';
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
  const liveCount = items.filter((item) => item.quoteSource === 'live').length;
  const snapshotCount = items.length - liveCount;
  const providers = new Set(items.map((item) => item.provider)).size;
  const benchmarkedCount = items.filter(
    (item) => typeof item.pythBenchmarkPriceUsd === 'number'
  ).length;

  const grouped = new Map<string, BasisMonitorItem[]>();
  for (const item of items) {
    const key = underlyingKey(item.symbol);
    grouped.set(key, [...(grouped.get(key) || []), item]);
  }

  const comparableGroups = Array.from(grouped.entries())
    .map(([key, groupItems]) => {
      const providerSet = new Set(groupItems.map((item) => item.provider));
      const withValuation = groupItems.filter(
        (item) =>
          typeof item.impliedValuationUsd === 'number' &&
          Number.isFinite(item.impliedValuationUsd) &&
          item.impliedValuationUsd > 0
      );

      if (providerSet.size < 2 || withValuation.length < 2) return null;

      const valuations = withValuation.map((item) => item.impliedValuationUsd as number);
      const minValuation = Math.min(...valuations);
      const maxValuation = Math.max(...valuations);
      const dispersionPct =
        minValuation > 0 ? ((maxValuation - minValuation) / minValuation) * 100 : 0;

      return {
        key,
        items: withValuation,
        dispersionPct,
      };
    })
    .filter(
      (
        group
      ): group is {
        key: string;
        items: BasisMonitorItem[];
        dispersionPct: number;
      } => Boolean(group)
    )
    .sort((a, b) => b.dispersionPct - a.dispersionPct);

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center">
        <RefreshCw className="mx-auto h-5 w-5 animate-spin text-brand-primary" />
        <h2 className="mt-3 text-sm font-bold text-ink-primary">Loading private-market data</h2>
        <p className="mt-1 text-xs text-ink-secondary">
          Fetching connected provider quotes and valuation metadata.
        </p>
      </div>
    );
  }

  if (status === 'error' && items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-10 text-center">
        <AlertCircle className="mx-auto h-5 w-5 text-brand-warning" />
        <h2 className="mt-3 text-sm font-bold text-ink-primary">Market data is temporarily unavailable</h2>
        <p className="mt-1 text-xs text-ink-secondary">
          The page could not load a complete provider snapshot. No stale numbers are being promoted as live.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface-elevated text-brand-primary">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <h1 className="text-base font-bold uppercase tracking-wider text-ink-primary">
                  Private Markets
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  Provider marks, implied valuations, quote provenance, and comparable private-market signals across PreStocks and Tessera.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 py-1.5 text-ink-secondary">
              <RefreshCw className="h-3.5 w-3.5 text-brand-primary" />
              Refreshed {formatAge(lastRefreshedAt, now)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-3 py-1.5 text-ink-secondary">
              <Database className="h-3.5 w-3.5 text-ink-tertiary" />
              {liveCount} live / {snapshotCount} snapshot
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-4">
          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Tracked assets</span>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-ink-primary">
              {items.length}
            </div>
            <span className="text-[10px] text-ink-secondary">Connected provider instruments</span>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Providers</span>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-ink-primary">
              {providers}
            </div>
            <span className="text-[10px] text-ink-secondary">PreStocks + Tessera</span>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Comparable names</span>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-ink-primary">
              {comparableGroups.length}
            </div>
            <span className="text-[10px] text-ink-secondary">Valuation marks from 2+ providers</span>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Pyth references</span>
            <div className="mt-1 font-mono text-lg font-bold tabular-nums text-ink-primary">
              {benchmarkedCount}
            </div>
            <span className="text-[10px] text-ink-secondary">Only when a real benchmark is attached</span>
          </div>
        </div>
      </section>

      {snapshotCount > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-brand-warning/30 bg-brand-warning/5 p-4 text-xs">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-warning" />
          <div>
            <div className="font-semibold text-ink-primary">Fallback snapshots are visible, not disguised as live data</div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">
              {snapshotCount} quote{snapshotCount === 1 ? '' : 's'} currently use the verified provider fallback snapshot. Source and age are shown per row so stale data is explicit.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-brand-primary/25 bg-brand-primary/5 p-4 text-xs">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
          <div>
            <div className="font-semibold text-ink-primary">All provider quotes loaded from live endpoints</div>
            <p className="mt-1 text-[11px] text-ink-secondary">
              Freshness is based on the provider fetch time; this page does not claim tick-by-tick exchange streaming.
            </p>
          </div>
        </div>
      )}

      {comparableGroups.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-ink-primary">
                <ArrowRightLeft className="h-4 w-4 text-brand-primary" />
                Cross-provider valuation signals
              </div>
              <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-ink-secondary">
                Same-company implied valuations are compared where both providers expose a valuation mark. This is provider dispersion, not an executable arbitrage spread.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {comparableGroups.slice(0, 3).map((group) => (
              <div key={group.key} className="rounded-lg border border-border-subtle bg-surface-subtle p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-mono text-sm font-bold text-ink-primary">{group.key}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Implied valuation
                    </div>
                  </div>
                  <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
                    {group.dispersionPct.toFixed(1)}% dispersion
                  </span>
                </div>

                <div className="mt-4 space-y-2">
                  {group.items.map((item) => (
                    <div key={item.tokenMint} className="flex items-center justify-between gap-3 text-xs">
                      <span className="capitalize text-ink-secondary">{item.provider}</span>
                      <span className="font-mono font-semibold tabular-nums text-ink-primary">
                        {formatUsd(item.impliedValuationUsd, true)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-col gap-2 border-b border-border bg-surface-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-primary">
              Provider market board
            </span>
            <p className="mt-0.5 text-[10px] text-ink-tertiary">
              Raw token marks are shown per provider; they are not directly normalized across different token structures.
            </p>
          </div>
          <span className="font-mono text-[10px] text-ink-tertiary">
            Server refresh cadence: 30s while active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left font-mono text-xs">
            <thead className="border-b border-border bg-surface-subtle font-sans text-[10px] uppercase tracking-wider text-ink-tertiary">
              <tr>
                <th className="px-5 py-3">Asset</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3 text-right">Provider mark</th>
                <th className="px-5 py-3 text-right">Implied valuation</th>
                <th className="px-5 py-3 text-right">24h</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3 text-right">Quote age</th>
                <th className="px-5 py-3 text-right">Pyth reference</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border-subtle">
              {items.map((item) => {
                const changePositive = item.change24h > 0;
                const changeNegative = item.change24h < 0;

                return (
                  <tr key={item.tokenMint} className="transition-colors hover:bg-surface-elevated/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-subtle font-sans text-[10px] font-bold text-ink-secondary">
                          {underlyingKey(item.symbol).slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-ink-primary">{item.symbol}</div>
                          <div className="mt-0.5 font-sans text-[10px] text-ink-tertiary">{item.name}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded border border-border bg-surface-subtle px-2 py-0.5 text-[10px] uppercase text-ink-secondary">
                        {item.provider}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-ink-primary">
                      {formatUsd(item.providerMarkPriceUsd)}
                    </td>

                    <td className="px-5 py-4 text-right tabular-nums text-ink-secondary">
                      {formatUsd(item.impliedValuationUsd, true)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      {item.change24hAvailable ? (
                        <span
                          className={
                            'font-semibold tabular-nums ' +
                            (changePositive
                              ? 'text-brand-primary'
                              : changeNegative
                              ? 'text-semantic-negative'
                              : 'text-ink-secondary')
                          }
                        >
                          {changePositive ? '+' : ''}
                          {item.change24h.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide ' +
                          (item.quoteSource === 'live'
                            ? 'border-brand-primary/25 bg-brand-primary/5 text-brand-primary'
                            : 'border-brand-warning/30 bg-brand-warning/5 text-brand-warning')
                        }
                      >
                        <span
                          className={
                            'h-1.5 w-1.5 rounded-full ' +
                            (item.quoteSource === 'live' ? 'bg-brand-primary' : 'bg-brand-warning')
                          }
                        />
                        {item.quoteSource}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right tabular-nums text-ink-tertiary">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {formatAge(item.lastUpdated, now)}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      {typeof item.pythBenchmarkPriceUsd === 'number' ? (
                        <div>
                          <div className="font-semibold tabular-nums text-ink-primary">
                            {formatUsd(item.pythBenchmarkPriceUsd)}
                          </div>
                          {typeof item.benchmarkSpreadBps === 'number' && (
                            <div className="mt-0.5 text-[10px] tabular-nums text-ink-tertiary">
                              {item.benchmarkSpreadBps > 0 ? '+' : ''}
                              {item.benchmarkSpreadBps} bps vs mark
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-sans text-[10px] text-ink-tertiary">Not connected</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-[11px] leading-relaxed text-ink-secondary">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
        <p>
          Market marks are provider data, not a claim of guaranteed secondary-market liquidity. Different token structures can represent different economic units, so SynthaBasket does not infer cross-provider arbitrage from raw token prices. A Pyth comparison appears only when an actual benchmark is attached to that asset.
        </p>
      </div>
    </div>
  );
};
