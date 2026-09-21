'use client';

import Link from 'next/link';
import { ArrowRight, Layers } from 'lucide-react';

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface text-brand-primary transition-colors group-hover:border-brand-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight text-ink-primary">SYNTHABASKET</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-tertiary">
              Private-market indexes on Solana
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-xs font-semibold text-ink-secondary md:flex">
          <a href="#product" className="transition-colors hover:text-ink-primary">Product</a>
          <a href="#how-it-works" className="transition-colors hover:text-ink-primary">How it works</a>
          <a href="#protocol" className="transition-colors hover:text-ink-primary">Protocol</a>
          <a href="#proof" className="transition-colors hover:text-ink-primary">Proof</a>
        </nav>

        <Link
          href="/app"
          className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-xs font-bold text-black transition-transform hover:scale-[1.02]"
        >
          Launch App
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
