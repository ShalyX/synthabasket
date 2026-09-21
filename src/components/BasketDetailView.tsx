'use client';

import React, { useState } from 'react';
import {
  X,
  ArrowRightLeft,
  ShieldCheck,
  Activity,
  BarChart3,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  Layers,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { BasketDefinition, BasketMintQuote, BasketRedeemQuote } from '../lib/types';
import { calculateMintQuote, calculateRedeemQuote } from '../lib/services/valuation_engine';

interface BasketDetailViewProps {
  basket: BasketDefinition;
  initialTab?: 'mint' | 'redeem' | 'inspect';
  onClose: () => void;
  onExecuteMint: (basket: BasketDefinition, quote: BasketMintQuote) => void;
  onExecuteRedeem: (basket: BasketDefinition, quote: BasketRedeemQuote) => void;
}

export const BasketDetailView: React.FC<BasketDetailViewProps> = ({
  basket,
  initialTab = 'mint',
  onClose,
  onExecuteMint,
  onExecuteRedeem,
}) => {
  const [activeTab, setActiveTab] = useState<'mint' | 'redeem'>(
    initialTab === 'redeem' ? 'redeem' : 'mint'
  );
  const [timeframe, setTimeframe] = useState<'24H' | '7D' | '30D' | 'ALL'>('7D');
  const [usdcAmount, setUsdcAmount] = useState<number>(100);
  const [redeemShares, setRedeemShares] = useState<number>(0.1);

  const mintQuote = calculateMintQuote(basket, usdcAmount || 0);
  const redeemQuote = calculateRedeemQuote(basket, redeemShares || 0);

  const isPositive = basket.navChange24h >= 0;
  const explorerVaultUrl = `https://explorer.solana.com/address/${basket.vaultPda}?cluster=devnet`;
  const explorerMintUrl = `https://explorer.solana.com/address/${basket.basketMint}?cluster=devnet`;

  const getSegmentColor = (idx: number) => {
    const palette = ['bg-brand-primary', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-400', 'bg-cyan-500'];
    return palette[idx % palette.length];
  };

  // Mock performance points based on current NAV for clean SVG trendline
  const chartPoints = [
    { x: 0, y: basket.navUsd * 0.94 },
    { x: 50, y: basket.navUsd * 0.955 },
    { x: 100, y: basket.navUsd * 0.948 },
    { x: 150, y: basket.navUsd * 0.965 },
    { x: 200, y: basket.navUsd * 0.98 },
    { x: 250, y: basket.navUsd * 0.975 },
    { x: 300, y: basket.navUsd * 0.99 },
    { x: 350, y: basket.navUsd * 1.0 },
  ];

  const minY = Math.min(...chartPoints.map((p) => p.y)) * 0.99;
  const maxY = Math.max(...chartPoints.map((p) => p.y)) * 1.01;
  const rangeY = maxY - minY || 1;

  const svgPath = chartPoints
    .map((p, idx) => {
      const px = (p.x / 350) * 460;
      const py = 120 - ((p.y - minY) / rangeY) * 100;
      return `${idx === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(' ');

  const areaPath = `${svgPath} L 460 120 L 0 120 Z`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded border border-border bg-background shadow-2xl">
        {/* Header Strip: Title, Ticker, Trust Pill, Close */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded border border-border-strong bg-surface-elevated font-mono text-sm font-bold text-brand-primary">
              ${basket.symbol}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-sans text-base font-bold text-ink-primary">
                  {basket.name} <span className="font-mono text-sm text-ink-secondary">/ ${basket.symbol}</span>
                </h2>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded border border-brand-primary/40 bg-brand-primary/10 px-2 py-0.5 font-mono text-[10px] text-brand-primary font-semibold">
                    <Lock className="h-2.5 w-2.5" />
                    Physically Backed
                  </span>
                  <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-ink-secondary">
                    <ArrowRightLeft className="h-2.5 w-2.5 text-brand-primary" />
                    Redeemable 1:1
                  </span>
                  <span className="rounded border border-border bg-surface-subtle px-2 py-0.5 font-mono text-[10px] text-ink-tertiary">
                    Solana Devnet
                  </span>
                </div>
              </div>
              <p className="font-sans text-xs text-ink-secondary mt-0.5">
                {basket.description}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded p-1.5 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body: 2-Column Split (Left: Asset Details & Proof, Right: Execution Console) */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.3fr_0.9fr]">
          {/* Left Column: Hero Metrics, Performance Chart, Composition, Backing, Secondary Market */}
          <div className="border-b border-border p-6 space-y-6 lg:border-b-0 lg:border-r">
            {/* Hero Stats Row */}
            <div className="flex flex-wrap items-baseline justify-between border-b border-border pb-4">
              <div>
                <span className="block font-sans text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Current Net Asset Value (NAV)
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-3xl font-bold text-ink-primary tabular-nums">
                    ${basket.navUsd.toFixed(2)}
                  </span>
                  <span
                    className={`inline-flex items-center font-mono text-sm font-bold tabular-nums ${
                      isPositive ? 'text-brand-primary' : 'text-semantic-negative'
                    }`}
                  >
                    {isPositive ? '+' : ''}{basket.navChange24h.toFixed(2)}%
                    {isPositive ? (
                      <ArrowUpRight className="h-4 w-4 ml-0.5" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 ml-0.5" />
                    )}
                    <span className="font-sans text-[10px] font-normal text-ink-tertiary ml-1">(24h)</span>
                  </span>
                </div>
              </div>

              {/* Timeframe Selectors */}
              <div className="flex items-center rounded border border-border bg-surface-subtle p-0.5 font-mono text-[11px]">
                {(['24H', '7D', '30D', 'ALL'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`rounded px-2.5 py-1 transition-colors ${
                      timeframe === tf
                        ? 'bg-surface-elevated text-brand-primary font-bold border border-border-strong'
                        : 'text-ink-tertiary hover:text-ink-secondary'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Performance Chart */}
            <div className="rounded border border-border bg-surface p-4">
              <div className="flex items-center justify-between font-sans text-xs text-ink-tertiary mb-2">
                <span className="flex items-center gap-1.5 font-medium">
                  <TrendingUp className="h-3.5 w-3.5 text-brand-primary" />
                  Historical NAV Trajectory ({timeframe})
                </span>
                <span className="font-mono text-[10px] text-ink-secondary">
                  High: ${(basket.navUsd * 1.0).toFixed(2)} • Low: ${(basket.navUsd * 0.94).toFixed(2)}
                </span>
              </div>
              <div className="h-32 w-full">
                <svg viewBox="0 0 460 120" className="h-full w-full overflow-visible">
                  <defs>
                    <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00d182" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#00d182" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Subtle Gridlines */}
                  <line x1="0" y1="30" x2="460" y2="30" stroke="#222636" strokeDasharray="3 3" />
                  <line x1="0" y1="70" x2="460" y2="70" stroke="#222636" strokeDasharray="3 3" />
                  <line x1="0" y1="110" x2="460" y2="110" stroke="#222636" strokeDasharray="3 3" />
                  {/* Area fill */}
                  <path d={areaPath} fill="url(#navGradient)" />
                  {/* Trend line */}
                  <path d={svgPath} fill="none" stroke="#00d182" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            {/* Signature Composition Motif: Bar & Constituent Ledger */}
            <div className="space-y-3">
              <div className="flex items-center justify-between font-sans text-xs">
                <span className="font-bold text-ink-primary uppercase tracking-wider">
                  Portfolio Composition & Target Weights
                </span>
                <span className="font-mono text-[11px] text-brand-primary font-semibold">
                  ● Pyth Hermes Synchronized
                </span>
              </div>

              {/* Segmented Composition Bar */}
              <div className="flex h-2.5 w-full overflow-hidden rounded bg-surface-elevated">
                {basket.constituents.map((c, idx) => (
                  <div
                    key={c.asset.tokenMint}
                    style={{ width: `${c.targetWeightBps / 100}%` }}
                    className={`${getSegmentColor(idx)} h-full transition-all`}
                    title={`${c.asset.symbol}: ${c.targetWeightBps / 100}%`}
                  />
                ))}
              </div>

              {/* Constituent Table */}
              <div className="overflow-hidden rounded border border-border bg-surface font-mono text-xs">
                <table className="w-full text-left">
                  <thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary font-sans">
                    <tr>
                      <th className="px-3.5 py-2">Constituent</th>
                      <th className="px-3.5 py-2">Provider</th>
                      <th className="px-3.5 py-2 text-right">Target Weight</th>
                      <th className="px-3.5 py-2 text-right">Pyth Benchmark</th>
                      <th className="px-3.5 py-2 text-right">Solana Spot</th>
                      <th className="px-3.5 py-2 text-right">Basis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-[11px]">
                    {basket.constituents.map((c, idx) => {
                      const basisSpread = c.asset.basisSpreadBps || 0;
                      return (
                        <tr key={c.asset.tokenMint} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="px-3.5 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className={`h-2 w-2 rounded-full ${getSegmentColor(idx)}`} />
                              <span className="font-bold text-ink-primary">{c.asset.symbol}</span>
                              <span className="text-[10px] text-ink-tertiary font-sans">{c.asset.name}</span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5">
                            <span className="rounded border border-border bg-surface-subtle px-1.5 py-0.2 text-[9px] uppercase text-ink-secondary">
                              {c.asset.provider}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-bold text-ink-primary tabular-nums">
                            {c.targetWeightBps / 100}%
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-ink-secondary tabular-nums">
                            ${c.asset.pythBenchmarkPriceUsd ? c.asset.pythBenchmarkPriceUsd.toFixed(2) : c.asset.priceUsd.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-semibold text-ink-primary tabular-nums">
                            ${c.asset.priceUsd.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums">
                            <span
                              className={`font-semibold ${
                                basisSpread > 50 ? 'text-brand-warning' : 'text-brand-primary'
                              }`}
                            >
                              {basisSpread > 0 ? `+${basisSpread}` : basisSpread} bps
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Backing & Solvency Proof Panel */}
            <div className="rounded border border-border bg-surface p-4 font-sans text-xs space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-ink-primary uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-brand-primary" />
                  On-Chain Backing & Solvency Proof
                </span>
                <span className="font-mono text-[10px] text-brand-primary font-bold">100.00% Fully Reserved</span>
              </div>

              <div className="grid grid-cols-2 gap-4 font-mono text-[11px] sm:grid-cols-4">
                <div>
                  <span className="text-ink-tertiary block text-[10px]">Vault PDA</span>
                  <a
                    href={explorerVaultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-semibold text-brand-primary hover:underline truncate"
                  >
                    <span>{basket.vaultPda.slice(0, 6)}...{basket.vaultPda.slice(-4)}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>

                <div>
                  <span className="text-ink-tertiary block text-[10px]">Backing Ratio</span>
                  <span className="font-bold text-brand-primary tabular-nums">100.00%</span>
                </div>

                <div>
                  <span className="text-ink-tertiary block text-[10px]">Outstanding Shares</span>
                  <span className="font-bold text-ink-primary tabular-nums">
                    {basket.totalSharesMinted.toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-ink-tertiary block text-[10px]">Total Liquidity</span>
                  <span className="font-bold text-ink-primary tabular-nums">
                    ${basket.aumUsd.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Execution Route Visual Flow */}
            <div className="rounded border border-border bg-surface-subtle p-3.5 font-mono text-[11px] space-y-2">
              <span className="font-sans text-[11px] font-bold text-ink-primary uppercase tracking-wider block">
                Execution Route Architecture
              </span>
              <div className="flex flex-wrap items-center gap-2 text-ink-secondary">
                <span className="rounded border border-border bg-surface px-2 py-1 text-ink-primary font-bold">
                  USDC
                </span>
                <span>→</span>
                <span className="rounded border border-border bg-surface px-2 py-1 text-brand-primary font-bold">
                  Jupiter Swap API V2
                </span>
                <span>→</span>
                <span className="rounded border border-border bg-surface px-2 py-1 text-ink-primary">
                  Constituent Tokens
                </span>
                <span>→</span>
                <span className="rounded border border-border bg-surface px-2 py-1 text-brand-primary font-bold">
                  Vault PDA Custody
                </span>
                <span>→</span>
                <span className="rounded border border-border bg-surface px-2 py-1 text-brand-primary font-bold">
                  ${basket.symbol} Shares
                </span>
              </div>
            </div>

            {/* Secondary Market: Meteora DBC 1.5.12 */}
            <div className="rounded border border-border bg-surface p-4 font-sans text-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink-primary uppercase tracking-wider flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-solana-purple" />
                  Secondary Market: Meteora DBC 1.5.12
                </span>
                <span className="rounded border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 font-mono text-[10px] text-brand-primary font-semibold">
                  Status: Active
                </span>
              </div>

              {/* Graduation Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-ink-secondary">Bonding Curve Progress</span>
                  <span className="font-bold text-brand-primary tabular-nums">63% to DAMM v2</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-surface-elevated">
                  <div className="h-full bg-brand-primary" style={{ width: '63%' }} />
                </div>
                <div className="flex justify-between font-mono text-[10px] text-ink-tertiary">
                  <span>Curve Launch ($10k Cap)</span>
                  <span className="text-brand-primary">Migration Target ($2,000,000 Cap)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Dedicated Investment & Redemption Console */}
          <div className="flex flex-col justify-between p-6 bg-surface-subtle">
            <div>
              {/* Tab Selector: Invest vs Redeem */}
              <div className="flex rounded border border-border bg-surface p-0.5 font-sans text-xs">
                <button
                  onClick={() => setActiveTab('mint')}
                  className={`flex-1 rounded py-2 font-semibold transition-colors ${
                    activeTab === 'mint'
                      ? 'bg-surface-elevated text-brand-primary border border-border-strong shadow-sm'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  Invest
                </button>
                <button
                  onClick={() => setActiveTab('redeem')}
                  className={`flex-1 rounded py-2 font-semibold transition-colors ${
                    activeTab === 'redeem'
                      ? 'bg-surface-elevated text-ink-primary border border-border-strong shadow-sm'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  Burn & Redeem
                </button>
              </div>

              {/* TAB 1: Invest Console */}
              {activeTab === 'mint' && (
                <div className="mt-6 space-y-5 font-sans">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                      Deposit Amount (USDC)
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={usdcAmount}
                        onChange={(e) => setUsdcAmount(Number(e.target.value))}
                        className="w-full rounded border border-border bg-surface px-3.5 py-2.5 font-mono text-base font-bold text-ink-primary tabular-nums focus:border-brand-primary focus:outline-none"
                      />
                      <span className="absolute right-3.5 top-3 font-mono text-xs font-semibold text-ink-tertiary">
                        USDC
                      </span>
                    </div>
                  </div>

                  {/* Preset Amount Chips */}
                  <div className="flex gap-2 font-mono text-xs">
                    {[50, 100, 250, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setUsdcAmount(amt)}
                        className={`flex-1 rounded border py-1.5 font-semibold tabular-nums transition-colors ${
                          usdcAmount === amt
                            ? 'bg-surface-elevated text-brand-primary border-brand-primary'
                            : 'bg-surface text-ink-secondary border-border hover:border-border-strong hover:text-ink-primary'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>

                  {/* Execution Breakdown */}
                  <div className="space-y-2.5 rounded border border-border bg-surface p-4 font-sans text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-tertiary">Expected Basket Shares:</span>
                      <span className="font-mono font-bold text-ink-primary tabular-nums">
                        {mintQuote.expectedBasketTokens} ${basket.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-tertiary">Creation Fee (0.25%):</span>
                      <span className="font-mono text-ink-secondary tabular-nums">${mintQuote.protocolFeeUsdc} USDC</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 text-[11px]">
                      <span className="text-ink-tertiary">Execution Engine:</span>
                      <span className="font-mono font-semibold text-brand-primary">Jupiter Swap API V2</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-ink-tertiary">Custody Destination:</span>
                      <span className="font-mono text-ink-secondary">Vault PDA (100% physically backed)</span>
                    </div>
                  </div>

                  <button
                    onClick={() => onExecuteMint(basket, mintQuote)}
                    className="w-full rounded border border-brand-primary/40 bg-brand-primary py-3 font-sans text-xs font-bold uppercase tracking-wider text-black transition-opacity hover:opacity-95 shadow-sm"
                  >
                    Invest in ${basket.symbol}
                  </button>

                  <p className="text-center font-sans text-[11px] text-ink-tertiary leading-relaxed">
                    1-click atomic settlement: USDC is split via Jupiter V2 routes into underlying tokens and deposited into the on-chain Vault PDA.
                  </p>
                </div>
              )}

              {/* TAB 2: Burn & Redeem Console */}
              {activeTab === 'redeem' && (
                <div className="mt-6 space-y-5 font-sans">
                  <div>
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                      Shares to Burn (${basket.symbol})
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={redeemShares}
                        onChange={(e) => setRedeemShares(Number(e.target.value))}
                        className="w-full rounded border border-border bg-surface px-3.5 py-2.5 font-mono text-base font-bold text-ink-primary tabular-nums focus:border-brand-primary focus:outline-none"
                      />
                      <span className="absolute right-3.5 top-3 font-mono text-xs font-semibold text-ink-tertiary">
                        ${basket.symbol}
                      </span>
                    </div>
                  </div>

                  {/* Redemption Breakdown */}
                  <div className="space-y-2.5 rounded border border-border bg-surface p-4 font-sans text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-tertiary">Estimated Value Released:</span>
                      <span className="font-mono font-bold text-ink-primary tabular-nums">
                        ${redeemQuote.expectedUsdcValue.toFixed(2)} USD
                      </span>
                    </div>
                    <div className="border-t border-border pt-2">
                      <span className="text-ink-tertiary block mb-1.5 text-[11px]">
                        Proportional Constituents Released to Wallet:
                      </span>
                      {redeemQuote.constituentsToReturn.map((item) => (
                        <div key={item.asset.tokenMint} className="flex justify-between font-mono text-[11px] text-ink-secondary py-0.5">
                          <span>{item.asset.symbol}:</span>
                          <span className="tabular-nums font-semibold text-ink-primary">
                            {item.tokenAmount.toFixed(4)} (${item.valueUsd.toFixed(2)})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => onExecuteRedeem(basket, redeemQuote)}
                    className="w-full rounded border border-border-strong bg-surface-elevated py-3 font-sans text-xs font-bold uppercase tracking-wider text-ink-primary transition-colors hover:border-brand-primary hover:text-brand-primary"
                  >
                    Burn Shares & Redeem Base Assets
                  </button>

                  <p className="text-center font-sans text-[11px] text-ink-tertiary leading-relaxed">
                    Zero-dust invariant: burning basket shares unlocks the exact proportional underlying tokens directly from the Vault PDA back to your wallet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
