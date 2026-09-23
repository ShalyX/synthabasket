'use client';

import React from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ThemeToggle } from './ThemeToggle';
import { AccountActivityCenter } from './AccountActivityCenter';

const WalletMultiButtonDynamic = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

interface NavbarProps {
  network?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ network = 'devnet' }) => {
  const { connected } = useWallet();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get('view');

  const isActive = (target: 'baskets' | 'markets' | 'create' | 'portfolio') => {
    if (target === 'portfolio') return pathname === '/app/portfolio';
    if (pathname !== '/app') return false;
    if (target === 'markets') return view === 'markets';
    if (target === 'create') return view === 'create';
    return !view;
  };

  const navClass = (active: boolean) =>
    `relative px-1 py-5 text-[13px] font-semibold transition-colors ${
      active
        ? 'text-brand-primary'
        : 'text-ink-secondary hover:text-ink-primary'
    }`;

  const mobileNavClass = (active: boolean) =>
    `relative flex h-10 shrink-0 items-center text-xs font-semibold transition-colors ${active ? 'text-brand-primary' : 'text-ink-secondary hover:text-ink-primary'}`;

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
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

          <span className="hidden font-sans text-base font-extrabold tracking-tight text-ink-primary sm:inline">
            SYNTHABASKET
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 font-sans">
          <Link href="/app" className={navClass(isActive('baskets'))}>
            Baskets
            {isActive('baskets') && (
              <span className="absolute bottom-3 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app?view=markets" className={navClass(isActive('markets'))}>
            Markets
            {isActive('markets') && (
              <span className="absolute bottom-3 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app?view=create" className={navClass(isActive('create'))}>
            Create Basket
            {isActive('create') && (
              <span className="absolute bottom-3 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
          <Link href="/app/portfolio" className={navClass(isActive('portfolio'))}>
            Portfolio
            {isActive('portfolio') && (
              <span className="absolute bottom-3 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-brand-primary" />
            )}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 text-xs text-ink-tertiary sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
            <span className="capitalize">{network}</span>
          </div>
          <ThemeToggle />
          {connected ? (
            <AccountActivityCenter network={network} />
          ) : (
            <div className="wallet-btn-container">
              <WalletMultiButtonDynamic />
            </div>
          )}
        </div>
      </div>

      <nav className="mx-auto flex h-10 max-w-[1440px] items-center gap-6 overflow-x-auto px-4 md:hidden">
        {[
          { href: '/app', label: 'Baskets', target: 'baskets' as const },
          { href: '/app?view=markets', label: 'Markets', target: 'markets' as const },
          { href: '/app?view=create', label: 'Create', target: 'create' as const },
          { href: '/app/portfolio', label: 'Portfolio', target: 'portfolio' as const },
        ].map((item) => (
          <Link key={item.target} href={item.href} className={mobileNavClass(isActive(item.target))}>
            {item.label}
            {isActive(item.target) && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-primary" />
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
};
