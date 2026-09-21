import Link from 'next/link';
import { Github, Layers } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-surface-subtle">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface text-brand-primary">
                <Layers className="h-4 w-4" />
              </div>
              <span className="text-sm font-extrabold tracking-tight text-ink-primary">SYNTHABASKET</span>
            </div>
            <p className="text-sm leading-6 text-ink-secondary">
              Asset-backed thematic indexes for tokenized private markets on Solana.
            </p>
            <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-tertiary">
              Private markets · bundled · redeemable on-chain
            </p>
          </div>

          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-primary">Product</p>
            <div className="space-y-3 text-xs text-ink-secondary">
              <Link className="block hover:text-brand-primary" href="/app">Baskets</Link>
              <Link className="block hover:text-brand-primary" href="/app">Markets</Link>
              <Link className="block hover:text-brand-primary" href="/app">Create Basket</Link>
            </div>
          </div>

          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-primary">Protocol</p>
            <div className="space-y-3 text-xs text-ink-secondary">
              <a className="block hover:text-brand-primary" href="https://github.com/ShalyX/synthabasket#architecture" target="_blank" rel="noreferrer">Architecture</a>
              <a className="block hover:text-brand-primary" href="https://github.com/ShalyX/synthabasket/blob/main/DEMO_RUN_RECEIPTS.md" target="_blank" rel="noreferrer">Devnet Proofs</a>
              <a className="block hover:text-brand-primary" href="https://github.com/ShalyX/synthabasket" target="_blank" rel="noreferrer">Docs</a>
            </div>
          </div>

          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ink-primary">Open source</p>
            <a
              href="https://github.com/ShalyX/synthabasket"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs text-ink-secondary hover:text-brand-primary"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-5 text-[11px] text-ink-tertiary sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 SynthaBasket Protocol.</span>
          <span>Built on Solana · Asset-backed · Redeemable on-chain</span>
        </div>
      </div>
    </footer>
  );
}
