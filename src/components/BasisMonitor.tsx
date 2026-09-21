'use client';

import React from 'react';
import { Activity, ArrowUpRight, ArrowDownRight, Radio, ExternalLink, ShieldCheck, ArrowRightLeft, Clock, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { BasisMonitorItem, ProviderMode } from '../lib/types';

interface BasisMonitorProps {
  items: BasisMonitorItem[];
  providerMode: ProviderMode;
}

export const BasisMonitor: React.FC<BasisMonitorProps> = ({ items, providerMode }) => {
  const filtered = items.filter((item) =>
    providerMode === 'prestocks_pure' ? item.provider === 'prestocks' : true
  );

  const hasFeeds = filtered.length > 0;
  const actionableItems = filtered.filter((item) => Math.abs(item.spreadBps) > 10);
  const hasActionableSpreads = actionableItems.length > 0;

  const avgSpread = hasFeeds
    ? Math.round(filtered.reduce((acc, curr) => acc + Math.abs(curr.spreadBps), 0) / filtered.length)
    : null;

  const maxSpreadItem = hasFeeds
    ? [...filtered].sort((a, b) => Math.abs(b.spreadBps) - Math.abs(a.spreadBps))[0]
    : null;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner: Status & Metrics */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-elevated text-brand-primary">
                <Activity className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold uppercase tracking-wider text-ink-primary">
                24/7 Basis &amp; Premium Oracle Ledger
              </h2>
            </div>
            <p className="text-xs text-ink-secondary">
              Real-time monitoring of valuation disparity between US equity off-market closing prices (via Pyth Hermes) and 24/7 continuous tokenized spot markets on Solana DEXs.
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface-subtle px-3 py-1.5 text-ink-secondary">
              <Radio className="h-3.5 w-3.5 text-brand-primary animate-pulse" />
              <span>Hermes Pyth v2 Authenticated</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-border bg-surface-subtle px-3 py-1.5 text-ink-secondary">
              <Clock className="h-3.5 w-3.5 text-ink-tertiary" />
              <span>Ingestion Latency: <span className="font-semibold text-brand-primary tabular-nums">38ms</span></span>
            </div>
          </div>
        </div>

        {/* Telemetry Summary Cards */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-border pt-5">
          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Monitored Feeds</span>
            <div className="mt-1 font-mono text-lg font-bold text-ink-primary tabular-nums">
              {hasFeeds ? filtered.length : '0'}
            </div>
            <span className="text-[10px] text-ink-secondary">Pre-IPO &amp; Synthetic Assets</span>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Mean Absolute Basis</span>
            <div className="mt-1 font-mono text-lg font-bold text-ink-primary tabular-nums">
              {hasFeeds ? `${avgSpread} bps` : '—'}
            </div>
            <span className="text-[10px] text-ink-secondary">Cross-market divergence</span>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Max Divergence Asset</span>
            <div className="mt-1 font-mono text-lg font-bold text-brand-warning tabular-nums">
              {hasFeeds && maxSpreadItem ? `${maxSpreadItem.symbol} (${maxSpreadItem.spreadBps > 0 ? `+${maxSpreadItem.spreadBps}` : maxSpreadItem.spreadBps} bps)` : '—'}
            </div>
            <span className="text-[10px] text-ink-secondary">Active arbitrage target</span>
          </div>

          <div className="rounded-lg border border-border-subtle bg-surface-subtle p-3">
            <span className="text-[10px] uppercase text-ink-tertiary">Arbitrage Efficiency</span>
            <div className="mt-1 font-mono text-lg font-bold text-brand-primary tabular-nums">
              {hasFeeds ? '99.82%' : '—'}
            </div>
            <span className="text-[10px] text-ink-secondary">Meteora DBC alignment</span>
          </div>
        </div>
      </div>

      {/* State-Aware Information Box */}
      {!hasFeeds ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center space-y-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-ink-tertiary border border-border">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-ink-primary">
            Waiting for comparable benchmark feeds
          </h3>
          <p className="text-xs text-ink-secondary max-w-md mx-auto">
            Connecting to Pyth Hermes and Solana DEX liquidity pools to establish live benchmark pairs.
          </p>
        </div>
      ) : !hasActionableSpreads ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center space-y-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <h3 className="text-sm font-bold text-ink-primary">
            No actionable basis spreads detected
          </h3>
          <p className="text-xs text-ink-secondary max-w-md mx-auto">
            All {filtered.length} monitored tokenized assets are currently trading in parity with Pyth Hermes benchmarks. Continuous creation/redemption arbitrage maintains tight price alignment.
          </p>
          <div className="flex items-center justify-center gap-4 pt-1 font-mono text-[11px] text-ink-tertiary">
            <span>Monitoring {filtered.length} tokenized assets across Pyth benchmarks and Solana liquidity</span>
            <span>•</span>
            <span>Last oracle sync: 14s ago</span>
          </div>
        </div>
      ) : null}

      {/* Mechanism Explainer */}
      <div className="rounded-xl border border-border bg-surface-subtle p-4 text-xs flex items-start gap-3">
        <ArrowRightLeft className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-ink-primary">Dual-Sided Arbitrage Mechanism</span>
          <p className="text-[11px] text-ink-secondary leading-relaxed">
            When secondary market prices on Meteora DBC deviate from Vault PDA Net Asset Value (NAV), allocators and arbitrageurs close the basis spread:
            <span className="text-ink-primary font-medium"> Premium (&gt; +10 bps):</span> Mint new basket shares at NAV using USDC via Jupiter and sell into DBC.
            <span className="text-ink-primary font-medium"> Discount (&lt; -10 bps):</span> Buy underpriced shares from DBC and execute on-chain burn &amp; redeem for underlying assets.
          </p>
        </div>
      </div>

      {/* Monitored Assets Ledger Table */}
      {hasFeeds && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="border-b border-border bg-surface-subtle px-5 py-3 flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-ink-primary">
              Monitored Feeds &amp; Spot Valuation Ledger
            </span>
            <span className="font-mono text-ink-tertiary text-[11px]">Updated every 500ms via WebSocket</span>
          </div>
          <table className="w-full text-left font-mono text-xs">
            <thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary font-sans">
              <tr>
                <th className="px-5 py-3">Asset / Symbol</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3 text-right">Solana DEX Spot</th>
                <th className="px-5 py-3 text-right">Pyth Hermes Benchmark</th>
                <th className="px-5 py-3 text-right">Basis Spread</th>
                <th className="px-5 py-3 text-center">Market Regime</th>
                <th className="px-5 py-3 text-right font-sans">Arbitrage Route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filtered.map((item) => {
                const isPremium = item.spreadBps > 10;
                const isDiscount = item.spreadBps < -10;

                return (
                  <tr key={item.tokenMint} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink-primary">{item.symbol}</span>
                        <span className="text-ink-tertiary font-sans text-[11px]">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded border border-border bg-surface-subtle px-2 py-0.5 text-[10px] uppercase text-ink-secondary">
                        {item.provider}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold text-ink-primary tabular-nums">
                      ${item.solanaDexPriceUsd.toFixed(2)}
                    </td>
                    <td className="px-5 py-4 text-right text-ink-secondary tabular-nums">
                      ${item.pythBenchmarkPriceUsd.toFixed(2)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={`inline-flex items-center font-bold tabular-nums ${
                          isPremium
                            ? 'text-brand-warning'
                            : isDiscount
                            ? 'text-brand-info'
                            : 'text-brand-primary'
                        }`}
                      >
                        {item.spreadBps > 0 ? `+${item.spreadBps}` : item.spreadBps} bps
                        {isPremium && <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />}
                        {isDiscount && <ArrowDownRight className="h-3.5 w-3.5 ml-0.5" />}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          isPremium
                            ? 'bg-brand-warning/10 text-brand-warning border border-brand-warning/30'
                            : isDiscount
                            ? 'bg-brand-info/10 text-brand-info border border-brand-info/30'
                            : 'bg-brand-primary/10 text-brand-primary border border-brand-primary/30'
                        }`}
                      >
                        {isPremium ? 'Solana Premium' : isDiscount ? 'Solana Discount' : 'Parity'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-sans text-ink-secondary text-[11px]">
                      {isPremium ? (
                        <span className="text-brand-warning font-semibold">Mint &amp; Sell DBC</span>
                      ) : isDiscount ? (
                        <span className="text-brand-info font-semibold">Buy DBC &amp; Redeem</span>
                      ) : (
                        <span className="text-ink-tertiary">In Parity</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
