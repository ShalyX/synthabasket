'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { Bell } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const WalletMultiButtonDynamic = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface NavbarProps {
  network?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ network = 'devnet' }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');

  const isActive = (target: 'baskets' | 'markets' | 'create' | 'portfolio' | 'proof') => {
    if (target === 'portfolio') return pathname === '/app/portfolio';
    if (pathname !== '/app') return false;
    if (target === 'markets') return view === 'markets';
    if (target === 'create') return view === 'create';
    if (target === 'proof') return searchParams.get('proof') === '1';
    return !view && searchParams.get('proof') !== '1';
  };

  const navClass = (active: boolean) =>
    `relative rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
      active
        ? 'bg-surface-elevated text-brand-primary shadow-sm border border-border-strong'
        : 'text-ink-secondary hover:text-ink-primary'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3 text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border-strong group-hover:border-brand-primary transition-colors shadow-sm">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none" stroke="currentColor">
              <path
                d="M12 2L2 7L12 12L22 7L12 2Z"
                className="stroke-brand-primary stroke-[1.75]"
                fill="#00d182"
                fillOpacity="0.15"
              />
              <path d="M2 12L12 17L22 12" className="stroke-brand-primary stroke-[1.75]" />
              <path d="M2 17L12 22L22 17" className="stroke-emerald-400 stroke-[1.75]" />
            </svg>
          </div>

          <span className="font-sans text-base font-extrabold tracking-tight text-ink-primary">
            SYNTHABASKET
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 rounded-full border border-border bg-surface-subtle p-1 font-sans">
          <Link href="/app" className={navClass(isActive('baskets'))}>
            Baskets
            {isActive('baskets') && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app?view=markets" className={navClass(isActive('markets'))}>
            Markets
            {isActive('markets') && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app?view=create" className={navClass(isActive('create'))}>
            Create Basket
            {isActive('create') && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app/portfolio" className={navClass(isActive('portfolio'))}>
            Portfolio
            {isActive('portfolio') && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app?proof=1" className={navClass(isActive('proof'))}>
            Proof &amp; Audits
            {isActive('proof') && (
              <span className="absolute -bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Notifications"
            title="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-ink-secondary transition-colors hover:border-brand-primary hover:text-ink-primary"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-primary ring-2 ring-background" />
          </button>
          <div className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-ink-secondary sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
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
