'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Layers, ShieldCheck, Activity, PlusCircle, FileText, CheckCircle2 } from 'lucide-react';
import { ProviderMode } from '../lib/types';

// Dynamic import for wallet button to avoid SSR mismatch
const WalletMultiButtonDynamic = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface NavbarProps {
  providerMode: ProviderMode;
  setProviderMode: (mode: ProviderMode) => void;
  activeTab: 'baskets' | 'basis_monitor' | 'create_studio' | 'proof';
  setActiveTab: (tab: 'baskets' | 'basis_monitor' | 'create_studio' | 'proof') => void;
  network: string;
  setNetwork: (network: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  providerMode,
  setProviderMode,
  activeTab,
  setActiveTab,
  network,
  setNetwork,
}) => {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Identity matching reference */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('baskets')}
            className="group flex items-center gap-3 text-left focus:outline-none"
          >
            {/* 3D Layered Isometric Diamond Logo */}
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-strong group-hover:border-brand-primary transition-colors shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none" stroke="currentColor">
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  className="stroke-brand-primary stroke-[1.75]"
                  fill="#00d182"
                  fillOpacity="0.15"
                />
                <path
                  d="M2 12L12 17L22 12"
                  className="stroke-brand-primary stroke-[1.75]"
                />
                <path
                  d="M2 17L12 22L22 17"
                  className="stroke-emerald-400 stroke-[1.75]"
                />
              </svg>
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-sans text-base font-extrabold tracking-tight text-ink-primary">
                  SYNTHABASKET
                </span>
                <span className="rounded bg-brand-primary/15 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-primary border border-brand-primary/30">
                  BETA
                </span>
              </div>
              <span className="font-mono text-[9px] tracking-wider text-ink-tertiary uppercase">
                SOLANA • TOKENIZED PRE-IPO INDEXES
              </span>
            </div>
          </button>
        </div>

        {/* Center: Navigation Pills matching reference */}
        <nav className="hidden md:flex items-center gap-1 rounded-full border border-border bg-surface-subtle p-1 font-sans">
          <button
            onClick={() => setActiveTab('baskets')}
            className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'baskets'
                ? 'bg-surface-elevated text-brand-primary shadow-sm border border-border-strong'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Baskets
            {activeTab === 'baskets' && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('basis_monitor')}
            className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'basis_monitor'
                ? 'bg-surface-elevated text-brand-primary shadow-sm border border-border-strong'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Markets
            {activeTab === 'basis_monitor' && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('create_studio')}
            className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'create_studio'
                ? 'bg-surface-elevated text-brand-primary shadow-sm border border-border-strong'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Create Basket
            {activeTab === 'create_studio' && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('proof')}
            className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
              activeTab === 'proof'
                ? 'bg-surface-elevated text-brand-primary shadow-sm border border-border-strong'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Proof &amp; Audits
            {activeTab === 'proof' && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </button>
        </nav>

        {/* Right: Devnet Badge & Clean Wallet Pill matching reference */}
        <div className="flex items-center gap-3">
          {/* Devnet Pill with pulsating green dot */}
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-ink-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
            <span className="capitalize">{network}</span>
          </div>

          {/* Clean Wallet Adapter Pill Button */}
          <div className="wallet-btn-container">
            <WalletMultiButtonDynamic />
          </div>
        </div>
      </div>
    </header>
  );
};
