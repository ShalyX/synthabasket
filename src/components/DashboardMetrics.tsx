'use client';

import React from 'react';
import { DollarSign, Database, ArrowUpRight, ShieldCheck, Activity } from 'lucide-react';
import { BasketDefinition, ProviderMode } from '../lib/types';

interface DashboardMetricsProps {
  baskets: BasketDefinition[];
  providerMode: ProviderMode;
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({ baskets, providerMode }) => {
  const filteredBaskets = baskets.filter((b) =>
    providerMode === 'prestocks_pure' ? b.providerMode === 'prestocks_pure' : true
  );

  const totalAum = filteredBaskets.reduce((acc, b) => acc + (b.aumUsd || 0), 0);
  const totalShares = filteredBaskets.reduce((acc, b) => acc + (b.totalSharesMinted || 0), 0);
  const avgReturn = filteredBaskets.length > 0
    ? (filteredBaskets.reduce((acc, b) => acc + b.navChange24h, 0) / filteredBaskets.length).toFixed(2)
    : '0.00';
  const isAvgPositive = Number(avgReturn) >= 0;

  return (
    <div className="flex flex-col gap-2 rounded border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between shadow-sm">
      {/* Investor Metrics (Primary Focus) */}
      <div className="flex flex-wrap items-center gap-6 divide-x divide-border font-sans">
        {/* Metric 1: Total AUM */}
        <div className="flex items-center gap-2.5 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-border-strong bg-surface-elevated text-brand-primary">
            <DollarSign className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-ink-tertiary">
              Total Pre-IPO AUM
            </span>
            <span className="font-mono text-base font-bold text-ink-primary tabular-nums">
              ${totalAum.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        {/* Metric 2: Circulating Shares */}
        <div className="flex items-center gap-2.5 pl-6 pr-2">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-border-strong bg-surface-elevated text-ink-secondary">
            <Database className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-ink-tertiary">
              Circulating Shares
            </span>
            <span className="font-mono text-base font-bold text-ink-primary tabular-nums">
              {totalShares.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Metric 3: 24h Performance */}
        <div className="flex items-center gap-2.5 pl-6">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-ink-tertiary">
              24h Index Return (Avg)
            </span>
            <span
              className={`flex items-center font-mono text-base font-bold tabular-nums ${
                isAvgPositive ? 'text-brand-primary' : 'text-semantic-negative'
              }`}
            >
              {isAvgPositive ? '+' : ''}{avgReturn}%
              <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Protocol Proof (Subdued, One Layer Deeper) */}
      <div className="flex items-center gap-3 border-t border-border pt-2 sm:border-t-0 sm:pt-0 font-sans">
        <div className="flex items-center gap-1.5 rounded border border-border bg-surface-subtle px-2.5 py-1 text-[11px] text-ink-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-primary" />
          <span>100% Backed Vault PDA</span>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 rounded border border-border bg-surface-subtle px-2.5 py-1 text-[11px] text-ink-secondary">
          <Activity className="h-3.5 w-3.5 text-brand-primary" />
          <span>Meteora DBC Secondary Active</span>
        </div>
      </div>
    </div>
  );
};
