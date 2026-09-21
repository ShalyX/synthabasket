import Link from 'next/link';
import {
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  Database,
  Layers,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { LandingHeader } from '../components/LandingHeader';
import { SiteFooter } from '../components/SiteFooter';
import { INITIAL_BASKETS } from '../lib/data/registry';

const featured = INITIAL_BASKETS.filter((basket) => basket.providerMode === 'multi').slice(0, 3);

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background font-sans text-ink-primary">
      <LandingHeader />

      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_42%,rgba(0,209,130,0.10),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:py-28">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Physically backed · Redeemable on-chain
            </div>
            <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.02] tracking-[-0.04em] text-ink-primary sm:text-6xl">
              Private markets.
              <br />
              <span className="text-brand-primary">One basket.</span>
              <br />
              On-chain.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-ink-secondary">
              Build or invest in asset-backed thematic indexes of tokenized private companies on Solana.
              One position, transparent custody, proportional redemption.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02]"
              >
                Explore Baskets
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/app"
                className="rounded-full border border-border-strong bg-surface px-6 py-3 text-sm font-semibold text-ink-primary transition-colors hover:border-brand-primary"
              >
                Create a Basket
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 font-mono text-[10px] uppercase tracking-[0.13em] text-ink-tertiary">
              <span>Anchor vault custody</span>
              <span>Jupiter execution</span>
              <span>Meteora liquidity</span>
              <span>Pyth data</span>
            </div>
          </div>

          <div className="relative flex min-h-[440px] items-center justify-center">
            <div className="absolute h-72 w-72 rounded-full border border-brand-primary/10 bg-brand-primary/[0.03]" />
            <div className="absolute h-52 w-52 rounded-full border border-brand-primary/20" />

            <div className="absolute left-2 top-16 rounded-xl border border-border bg-surface p-3 shadow-xl sm:left-8">
              <span className="font-mono text-[10px] text-ink-tertiary">OPENAI</span>
              <div className="mt-1 font-mono text-sm font-bold text-ink-primary">50%</div>
            </div>
            <div className="absolute right-2 top-28 rounded-xl border border-border bg-surface p-3 shadow-xl sm:right-8">
              <span className="font-mono text-[10px] text-ink-tertiary">ANTHROPIC</span>
              <div className="mt-1 font-mono text-sm font-bold text-ink-primary">30%</div>
            </div>
            <div className="absolute bottom-16 left-10 rounded-xl border border-border bg-surface p-3 shadow-xl sm:left-20">
              <span className="font-mono text-[10px] text-ink-tertiary">KALSHI</span>
              <div className="mt-1 font-mono text-sm font-bold text-ink-primary">20%</div>
            </div>

            <div className="relative z-10 w-64 rounded-2xl border border-brand-primary/40 bg-surface p-6 shadow-[0_0_60px_rgba(0,209,130,0.10)]">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary text-black">
                  <Layers className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-primary">
                  100% backed
                </span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-tertiary">AI Titans</p>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold">$AIT</span>
                <span className="font-mono text-xs font-bold text-brand-primary">+3.82%</span>
              </div>
              <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-surface-elevated">
                <span className="w-1/2 bg-brand-primary" />
                <span className="w-[30%] bg-blue-500" />
                <span className="w-1/5 bg-purple-500" />
              </div>
              <div className="mt-5 flex items-center justify-between text-xs text-ink-secondary">
                <span>Vault-backed</span>
                <span>Redeemable 1:1</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">The product</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Diversification without the brokerage wrapper.</h2>
          </div>
          <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary">
            Open basket marketplace <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {featured.map((basket) => (
            <div key={basket.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs font-bold text-brand-primary">${basket.symbol}</p>
                  <h3 className="mt-2 text-lg font-bold text-ink-primary">{basket.name}</h3>
                </div>
                <span className="rounded-full border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase text-brand-primary">
                  Physically backed
                </span>
              </div>
              <p className="mt-4 min-h-12 text-sm leading-6 text-ink-secondary">{basket.description}</p>
              <div className="mt-6 flex h-2 overflow-hidden rounded-full bg-surface-elevated">
                {basket.constituents.map((constituent, index) => (
                  <span
                    key={constituent.asset.symbol}
                    className={index === 0 ? 'bg-brand-primary' : index === 1 ? 'bg-blue-500' : 'bg-purple-500'}
                    style={{ width: `${constituent.targetWeightBps / 100}%` }}
                  />
                ))}
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-ink-tertiary">Live NAV</p>
                  <p className="mt-1 font-mono text-xl font-extrabold tabular-nums">${basket.navUsd.toFixed(2)}</p>
                </div>
                <p className="font-mono text-sm font-bold text-brand-primary">+${basket.navChange24h.toFixed(2)}%</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">How it works</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">From USDC to a redeemable index position.</h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {[
              { icon: Zap, step: '01', title: 'Allocate', body: 'Deposit USDC and route into the basket constituents through Jupiter.' },
              { icon: Lock, step: '02', title: 'Vault', body: 'Underlying SPL assets settle into program-controlled vault accounts.' },
              { icon: Layers, step: '03', title: 'Own', body: 'Receive basket shares representing proportional ownership of the vault.' },
              { icon: ArrowRightLeft, step: '04', title: 'Redeem', body: 'Burn shares to unlock your proportional claim on the underlying assets.' },
            ].map(({ icon: Icon, step, title, body }) => (
              <div key={step} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="font-mono text-[10px] text-ink-tertiary">{step}</span>
                </div>
                <h3 className="mt-7 text-base font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="protocol" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">Protocol, not a portfolio widget</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Backing and valuation stay separate.</h2>
            <p className="mt-5 text-sm leading-7 text-ink-secondary">
              Market data informs NAV and analytics. Solvency comes from the actual token balances held by the vault.
              Basket shares are minted against physical deposits and redeemed against physical reserves.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Database, title: 'Physical custody', body: 'Program-controlled vault accounts hold the constituent SPL tokens.' },
              { icon: ShieldCheck, title: 'Dilution resistance', body: 'On-chain accounting constrains issuance to proportional deposits.' },
              { icon: BarChart3, title: 'Live market context', body: 'Provider data and Pyth power NAV, performance, and basis analytics.' },
              { icon: Sparkles, title: 'Composable liquidity', body: 'Basket shares can plug into Meteora secondary-liquidity infrastructure.' },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border bg-surface p-5">
                <Icon className="h-5 w-5 text-brand-primary" />
                <h3 className="mt-5 text-sm font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="border-y border-border bg-surface-subtle">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">On-chain proof</p>
            <h2 className="mt-3 text-2xl font-extrabold">The vault lifecycle has confirmed Devnet receipts.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
              Review the recorded mint/deposit and burn/redemption transactions, invariant tests, and implementation notes.
            </p>
          </div>
          <a
            href="https://github.com/ShalyX/synthabasket/blob/main/DEMO_RUN_RECEIPTS.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink-primary hover:border-brand-primary"
          >
            View Devnet Proof
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight">Bundle private-market exposure into one on-chain position.</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-ink-secondary">
          Explore curated indexes or structure your own asset-backed basket.
        </p>
        <Link
          href="/app"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-bold text-black"
        >
          Launch SynthaBasket
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <SiteFooter />
    </main>
  );
}
