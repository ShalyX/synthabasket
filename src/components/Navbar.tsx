'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Layers } from 'lucide-react';
import { ProviderMode } from '../lib/types';

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
  activeTab,
  setActiveTab,
  network,
}) => {
  const navItem = (
    tab: 'baskets' | 'basis_monitor' | 'create_studio',
    label: string
  ) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`relative rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
        activeTab === tab
          ? 'bg-surface-elevated text-brand-primary shadow-sm'
          : 'text-ink-secondary hover:text-ink-primary'
      }`}
    >
      {label}
      {activeTab === tab && (
        <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
      )}
    </button>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface text-brand-primary transition-colors group-hover:border-brand-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight text-ink-primary">SYNTHABASKET</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-tertiary">
              Private-market indexes
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-border bg-surface-subtle p-1 md:flex">
          {navItem('baskets', 'Baskets')}
          {navItem('basis_monitor', 'Markets')}
          {navItem('create_studio', 'Create')}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 font-mono text-[11px] text-ink-secondary sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="capitalize">{network}</span>
          </div>
          <div className="wallet-btn-container">
            <WalletMultiButtonDynamic />
          </div>
        </div>
      </div>
    </header>
  );
};
