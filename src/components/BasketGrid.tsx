'use client';

import React, { useState } from 'react';
import {
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  ShieldCheck,
  ChevronRight,
  Table as TableIcon,
  LayoutGrid,
  ExternalLink,
  Lock,
  ArrowRightLeft,
} from 'lucide-react';
import { BasketDefinition, ProviderMode } from '../lib/types';

interface BasketGridProps {
  baskets: BasketDefinition[];
  providerMode: ProviderMode;
  onSelectBasket: (basket: BasketDefinition, mode: 'mint' | 'redeem' | 'inspect') => void;
  onOpenCreateStudio: () => void;
}

export const BasketGrid: React.FC<BasketGridProps> = ({
  baskets,
  providerMode,
  onSelectBasket,
  onOpenCreateStudio,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Default to Cards view as the primary investor showcase
  const [viewMode, setViewMode] = useState<'cards' | 'ledger'>('cards');

  const filteredBaskets = baskets.filter((b) => {
    if (providerMode === 'prestocks_pure' && b.providerMode !== 'prestocks_pure') {
      return false;
    }
    if (selectedCategory !== 'all' && b.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        b.symbol.toLowerCase().includes(q) ||
        b.constituents.some((c) => c.asset.name.toLowerCase().includes(q) || c.asset.symbol.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getSegmentColor = (idx: number) => {
    const palette = ['bg-brand-primary', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-400', 'bg-cyan-500'];
    return palette[idx % palette.length];
  };

  return (
    <div className="space-y-5">
      {/* Action and Filter Control Bar */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between font-sans">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          {['all', 'ai', 'space_defense', 'fintech', 'custom'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-surface-elevated text-brand-primary border border-border-strong font-semibold'
                  : 'bg-surface text-ink-secondary hover:bg-surface-hover hover:text-ink-primary border border-border'
              }`}
            >
              {cat === 'all' ? 'All Thematic Baskets' : cat.replace('_', ' & ')}
            </button>
          ))}
        </div>

        {/* View Mode Toggle + Search + New Index */}
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex items-center rounded border border-border bg-surface-subtle p-0.5 font-sans">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'cards'
                  ? 'bg-surface-elevated text-ink-primary font-semibold border border-border-strong shadow-sm'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
              title="Cards View (Investor Showcase)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              onClick={() => setViewMode('ledger')}
              className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === 'ledger'
                  ? 'bg-surface-elevated text-ink-primary font-semibold border border-border-strong shadow-sm'
                  : 'text-ink-tertiary hover:text-ink-secondary'
              }`}
              title="Ledger Table View"
            >
              <TableIcon className="h-3.5 w-3.5" />
              Ledger
            </button>
          </div>

          <input
            type="text"
            placeholder="Search index or ticker..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 rounded border border-border bg-surface px-2.5 py-1 text-xs text-ink-primary placeholder-ink-tertiary focus:border-brand-primary focus:outline-none font-sans"
          />

          <button
            onClick={onOpenCreateStudio}
            className="flex items-center gap-1 rounded border border-brand-primary/40 bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary/20 hover:border-brand-primary font-sans"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Basket
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: HERO BASKET CARDS (DEFAULT) */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredBaskets.map((basket) => {
            const isPositive = basket.navChange24h >= 0;

            return (
              <div
                key={basket.id}
                className="group flex flex-col justify-between rounded border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-lg"
              >
                <div>
                  {/* Card Header: Ticker, Name, and Trust Badges */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded border border-border-strong bg-surface-elevated font-mono text-xs font-bold text-brand-primary group-hover:border-brand-primary transition-colors">
                        ${basket.symbol}
                      </div>
                      <div>
                        <h3 className="font-sans text-sm font-bold text-ink-primary group-hover:text-brand-primary transition-colors">
                          {basket.name}
                        </h3>
                        <span className="font-sans text-[11px] text-ink-tertiary">
                          {basket.category.replace('_', ' & ')}
                        </span>
                      </div>
                    </div>

                    {basket.providerMode === 'prestocks_pure' && (
                      <span className="flex items-center gap-1 rounded border border-brand-primary/40 bg-brand-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-brand-primary font-semibold">
                        <ShieldCheck className="h-3 w-3" />
                        Pure
                      </span>
                    )}
                  </div>

                  {/* Prominent Trust Signals: Physically Backed & Redeemable 1:1 */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded border border-brand-primary/30 bg-brand-primary/5 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-brand-primary font-semibold">
                      <Lock className="h-2.5 w-2.5" />
                      PHYSICALLY BACKED
                    </span>
                    <span className="inline-flex items-center gap-1 rounded border border-border bg-surface-elevated px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-ink-secondary font-semibold">
                      <ArrowRightLeft className="h-2.5 w-2.5 text-brand-primary" />
                      REDEEMABLE 1:1
                    </span>
                  </div>

                  {/* Thesis / Description in clean Inter */}
                  <p className="mt-3 line-clamp-2 font-sans text-xs leading-relaxed text-ink-secondary">
                    {basket.description}
                  </p>

                  {/* Hero Numbers: Live NAV & 24h Return */}
                  <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
                    <div>
                      <span className="block font-sans text-[10px] uppercase tracking-wider text-ink-tertiary">
                        Live Net Asset Value
                      </span>
                      <div className="font-mono text-xl font-bold text-ink-primary tabular-nums">
                        ${basket.navUsd.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block font-sans text-[10px] uppercase tracking-wider text-ink-tertiary">
                        24h Return
                      </span>
                      <div
                        className={`flex items-center justify-end font-mono text-sm font-bold tabular-nums ${
                          isPositive ? 'text-brand-primary' : 'text-semantic-negative'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {basket.navChange24h.toFixed(2)}%
                        {isPositive ? (
                          <ArrowUpRight className="h-3.5 w-3.5 ml-0.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5 ml-0.5" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Signature Visual Motif: Basket Composition Bar */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between font-sans text-[11px] text-ink-tertiary">
                      <span className="font-medium">Portfolio Composition</span>
                      <span className="font-mono text-[10px] text-brand-primary">100% Backed</span>
                    </div>

                    {/* The Segmented Composition Bar */}
                    <div className="flex h-2 w-full overflow-hidden rounded bg-surface-elevated">
                      {basket.constituents.map((c, idx) => (
                        <div
                          key={c.asset.tokenMint}
                          style={{ width: `${c.targetWeightBps / 100}%` }}
                          className={`${getSegmentColor(idx)} h-full transition-all`}
                          title={`${c.asset.symbol}: ${c.targetWeightBps / 100}%`}
                        />
                      ))}
                    </div>

                    {/* Constituent breakdown chips */}
                    <div className="flex flex-wrap gap-1.5 pt-1 font-mono text-[10px]">
                      {basket.constituents.map((c, idx) => (
                        <span
                          key={c.asset.tokenMint}
                          className="flex items-center gap-1 rounded border border-border bg-surface-subtle px-1.5 py-0.5 text-ink-secondary"
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${getSegmentColor(idx)}`} />
                          <span className="font-semibold text-ink-primary">{c.asset.symbol}</span>
                          <span className="text-ink-tertiary tabular-nums">{c.targetWeightBps / 100}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons: Strong 'Invest' CTA & 'Inspect' */}
                <div className="mt-5 space-y-2 border-t border-border pt-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectBasket(basket, 'mint')}
                      className="flex-1 rounded border border-brand-primary/40 bg-brand-primary/10 py-2 font-sans text-xs font-bold uppercase tracking-wider text-brand-primary transition-all hover:bg-brand-primary hover:text-black shadow-sm"
                    >
                      Invest
                    </button>
                    <button
                      onClick={() => onSelectBasket(basket, 'inspect')}
                      className="flex items-center justify-center rounded border border-border bg-surface-elevated px-3 py-2 font-sans text-xs font-semibold text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
                      title="Inspect Index & Solvency"
                    >
                      Inspect
                      <ChevronRight className="h-3.5 w-3.5 ml-1 text-ink-tertiary" />
                    </button>
                  </div>
                  <p className="text-center font-sans text-[10px] text-ink-tertiary">
                    USDC → underlying assets → basket shares
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: HIGH-DENSITY INSTITUTIONAL LEDGER (TOGGLEABLE) */}
      {viewMode === 'ledger' && (
        <div className="overflow-x-auto rounded border border-border bg-surface">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-subtle text-[11px] uppercase tracking-wider text-ink-tertiary font-sans">
                <th className="px-4 py-2.5 font-medium">Ticker</th>
                <th className="px-4 py-2.5 font-medium">Index Name</th>
                <th className="px-4 py-2.5 font-medium text-right font-mono">Live NAV</th>
                <th className="px-4 py-2.5 font-medium text-right font-mono">24h Delta</th>
                <th className="px-4 py-2.5 font-medium">Backing Proof</th>
                <th className="px-4 py-2.5 font-medium">Composition</th>
                <th className="px-4 py-2.5 font-medium">Secondary Pool</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredBaskets.map((basket) => {
                const isPositive = basket.navChange24h >= 0;
                return (
                  <tr
                    key={basket.id}
                    className="hover:bg-surface-hover transition-colors group cursor-pointer"
                    onClick={() => onSelectBasket(basket, 'inspect')}
                  >
                    {/* Ticker */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-ink-primary group-hover:text-brand-primary transition-colors">
                          ${basket.symbol}
                        </span>
                        {basket.providerMode === 'prestocks_pure' && (
                          <span className="rounded border border-brand-primary/30 bg-brand-primary/10 px-1 text-[9px] text-brand-primary font-semibold">
                            PURE
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 whitespace-nowrap font-sans text-ink-secondary">
                      {basket.name}
                    </td>

                    {/* Live NAV */}
                    <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-ink-primary tabular-nums">
                      ${basket.navUsd.toFixed(2)}
                    </td>

                    {/* 24h Delta */}
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums">
                      <span
                        className={`inline-flex items-center font-semibold ${
                          isPositive ? 'text-brand-primary' : 'text-semantic-negative'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {basket.navChange24h.toFixed(2)}%
                        {isPositive ? (
                          <ArrowUpRight className="h-3 w-3 ml-0.5" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3 ml-0.5" />
                        )}
                      </span>
                    </td>

                    {/* Backing Proof */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded bg-brand-primary/10 px-2 py-0.5 text-[10px] text-brand-primary font-semibold font-mono">
                        <ShieldCheck className="h-3 w-3" />
                        100% Backed
                      </span>
                    </td>

                    {/* Composition with mini bar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-1.5 w-16 overflow-hidden rounded bg-surface-elevated">
                          {basket.constituents.map((c, idx) => (
                            <div
                              key={c.asset.tokenMint}
                              style={{ width: `${c.targetWeightBps / 100}%` }}
                              className={`${getSegmentColor(idx)} h-full`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-ink-tertiary">
                          {basket.constituents.length} assets
                        </span>
                      </div>
                    </td>

                    {/* Secondary Pool */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {basket.meteoraGraduated ? (
                        <span className="rounded border border-brand-primary/40 bg-brand-primary/10 px-1.5 py-0.5 text-[10px] text-brand-primary">
                          DAMM v2 Graduated
                        </span>
                      ) : (
                        <span className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] text-ink-secondary">
                          Meteora DBC 1.5.12
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap text-right font-sans" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSelectBasket(basket, 'mint')}
                          className="rounded border border-brand-primary/40 bg-brand-primary/10 px-2.5 py-1 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary hover:text-black"
                        >
                          Invest
                        </button>
                        <button
                          onClick={() => onSelectBasket(basket, 'inspect')}
                          className="rounded border border-border bg-surface px-2 py-1 text-ink-secondary transition-colors hover:text-ink-primary hover:border-border-strong"
                          title="Inspect Index"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
