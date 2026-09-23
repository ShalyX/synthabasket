import Link from 'next/link';
import {
  ArrowRight,
  ArrowRightLeft,
  Layers,
  Lock,
  ShieldCheck,
  Zap,
  Bell,
} from 'lucide-react';
import { ThemeToggle } from '../components/ThemeToggle';
import { ScrollReveal } from '../components/ScrollReveal';
import { INITIAL_BASKETS } from '../lib/data/registry';

const featured = INITIAL_BASKETS.filter((basket) => basket.providerMode === 'multi').slice(0, 3);

export default function Home() {
  return (
    <main className="min-h-screen bg-background font-sans text-ink-primary">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface shadow-sm transition-colors group-hover:border-brand-primary">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none" stroke="currentColor">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" className="stroke-brand-primary stroke-[1.75]" fill="#00d182" fillOpacity="0.15" />
                <path d="M2 12L12 17L22 12" className="stroke-brand-primary stroke-[1.75]" />
                <path d="M2 17L12 22L22 17" className="stroke-emerald-400 stroke-[1.75]" />
              </svg>
            </div>
            <span className="text-base font-extrabold tracking-tight text-ink-primary">SYNTHABASKET</span>
          </Link>

          <nav className="hidden items-center gap-10 text-xs font-semibold text-ink-secondary md:flex">
            <a href="#baskets" className="transition-colors hover:text-ink-primary">Baskets</a>
            <a href="#how-it-works" className="transition-colors hover:text-ink-primary">How it works</a>
            <a href="#protocol" className="transition-colors hover:text-ink-primary">Protocol</a>
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
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-xs font-bold text-black transition-transform hover:scale-[1.02]"
            >
              Launch App
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1600px] grid-cols-1 gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-16 lg:grid-cols-12 lg:items-center lg:px-8 lg:pb-24 lg:pt-20">
        <div className="space-y-6 lg:col-span-7">
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-brand-primary">
            DIVERSIFY EARLY. OWN THE FUTURE.
          </span>
          <h1 className="max-w-5xl text-5xl font-extrabold leading-[1.03] tracking-[-0.04em] text-ink-primary sm:text-6xl">
            <span className="block md:whitespace-nowrap">Tokenized Private Markets.</span>
            <span className="block text-brand-primary">In One Basket.</span>
          </h1>
          <p className="max-w-xl text-base leading-7 text-ink-secondary">
            Build diversified private-market exposure through on-chain basket shares that custody constituent SPL assets when issued.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02]"
            >
              Explore Baskets
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/app?view=create"
              className="rounded-full border border-border-strong bg-surface px-6 py-3 text-sm font-semibold text-ink-primary transition-colors hover:border-brand-primary"
            >
              Create Your Own
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5 flex items-center justify-center lg:justify-end">
          <div className="group/globe relative flex h-[460px] w-[460px] cursor-default items-center justify-center sm:h-[540px] sm:w-[540px] xl:h-[620px] xl:w-[620px]">
            <div className="absolute inset-[10%] rounded-full bg-brand-primary/10 blur-3xl transition-all duration-700 group-hover/globe:scale-110 group-hover/globe:bg-brand-primary/20" />
            <div className="absolute inset-[4%] rounded-full border border-brand-primary/10 transition-all duration-700 group-hover/globe:rotate-6 group-hover/globe:border-brand-primary/30" />
            <div className="absolute inset-[14%] rounded-full border border-brand-primary/15 transition-all duration-700 group-hover/globe:-rotate-6 group-hover/globe:border-brand-primary/30" />

            <div className="absolute left-[13%] top-[25%] h-2.5 w-2.5 rounded-full bg-brand-primary/70 shadow-[0_0_18px_rgba(0,209,130,0.65)] transition-all duration-500 group-hover/globe:-translate-x-2 group-hover/globe:-translate-y-2 group-hover/globe:scale-125" />
            <div className="absolute right-[10%] top-[42%] h-2 w-2 rounded-full bg-brand-primary/60 shadow-[0_0_14px_rgba(0,209,130,0.55)] transition-all duration-500 group-hover/globe:translate-x-2 group-hover/globe:-translate-y-1 group-hover/globe:scale-125" />
            <div className="absolute bottom-[16%] left-[34%] h-2 w-2 rounded-full bg-brand-primary/50 shadow-[0_0_14px_rgba(0,209,130,0.5)] transition-all duration-500 group-hover/globe:translate-y-2 group-hover/globe:scale-125" />

            <svg
              viewBox="0 0 200 200"
              className="relative h-[86%] w-[86%] animate-[spin_60s_linear_infinite] transition-transform duration-700 ease-out group-hover/globe:scale-[1.035]"
              aria-label="SynthaBasket global private markets visualization"
              role="img"
            >
              <circle cx="100" cy="100" r="90" fill="none" stroke="#2f3447" strokeWidth="1" />
              <ellipse cx="100" cy="100" rx="90" ry="30" fill="none" stroke="#00d182" strokeWidth="1.45" strokeOpacity="0.9" strokeDasharray="3 3" />
              <ellipse cx="100" cy="100" rx="90" ry="60" fill="none" stroke="#00d182" strokeWidth="1.25" strokeOpacity="0.6" strokeDasharray="3 3" />
              <ellipse cx="100" cy="100" rx="30" ry="90" fill="none" stroke="#00d182" strokeWidth="1.45" strokeOpacity="0.9" strokeDasharray="3 3" />
              <ellipse cx="100" cy="100" rx="60" ry="90" fill="none" stroke="#00d182" strokeWidth="1.25" strokeOpacity="0.6" strokeDasharray="3 3" />
              <circle cx="100" cy="100" r="5" fill="#00d182" className="transition-all duration-500 group-hover/globe:r-[6]" />
              <circle cx="100" cy="100" r="13" fill="none" stroke="#00d182" strokeWidth="0.9" strokeOpacity="0.55" />
            </svg>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-4 pb-24 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [Lock, 'Vault Custody', 'Issued shares map to constituent SPL assets held in program-controlled vaults.'],
            [Layers, 'Diversified', 'Theme-based exposure across AI, space, fintech and more.'],
            [Zap, 'Solana Native', 'Fast settlement, transparent custody and composable SPL assets.'],
            [ArrowRightLeft, 'Redeemable', 'Burn basket shares for proportional underlying reserves.'],
          ].map(([Icon, title, body], index) => (
            <ScrollReveal key={title as string} delay={index * 70} className="h-full">
              <div className="h-full rounded-2xl border border-border bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-lg">
                {typeof Icon !== 'string' && <Icon className="h-5 w-5 text-brand-primary" />}
                <h3 className="mt-6 text-sm font-bold">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{body as string}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section id="baskets" className="border-y border-border bg-surface-subtle">
        <div className="mx-auto max-w-[1600px] px-4 py-24 sm:px-6 lg:px-8">
          <ScrollReveal className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
                Featured baskets
              </span>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight">Private-market exposure, packaged transparently.</h2>
            </div>
            <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary">
              View marketplace <ArrowRight className="h-4 w-4" />
            </Link>
          </ScrollReveal>

          <div className="grid gap-6 lg:grid-cols-3">
            {featured.map((basket, index) => (
              <ScrollReveal key={basket.id} delay={index * 90} className="h-full">
              <article key={basket.id} className="h-full rounded-2xl border border-border bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs font-bold text-brand-primary">${basket.symbol}</p>
                    <h3 className="mt-2 text-lg font-bold">{basket.name}</h3>
                  </div>
                  <span className="rounded-full border border-brand-primary/30 bg-brand-primary/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase text-brand-primary">
                    On-chain
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
                    <p className="font-mono text-[9px] uppercase tracking-wider text-ink-tertiary">Target mix</p>
                    <p className="mt-1 font-mono text-sm font-bold text-ink-primary">
                      {basket.constituents.length} constituent{basket.constituents.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Link
                    href={`/app?basket=${encodeURIComponent(basket.id)}&action=invest`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
                  >
                    Invest
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-[1600px] px-4 py-24 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-12 max-w-2xl">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">How it works</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight">One position. Real underlying assets.</h2>
        </ScrollReveal>
        <div className="grid gap-5 md:grid-cols-4">
          {[
            ['01', 'Choose', 'Select a curated basket or structure your own.'],
            ['02', 'Allocate', 'USDC is routed toward the target constituent weights.'],
            ['03', 'Vault', 'Underlying assets settle into program-controlled custody.'],
            ['04', 'Redeem', 'Burn shares to release your proportional underlying assets.'],
          ].map(([step, title, body], index) => (
            <ScrollReveal key={step} delay={index * 80} className="h-full">
              <div className="h-full rounded-2xl border border-border bg-surface p-5 transition-all duration-300 hover:-translate-y-1 hover:border-border-strong">
                <span className="font-mono text-[10px] text-brand-primary">{step}</span>
                <h3 className="mt-8 text-base font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-secondary">{body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section id="protocol" className="border-t border-border bg-surface-subtle">
        <div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <ScrollReveal>
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              Program custody
            </span>
            <h2 className="mt-3 text-2xl font-extrabold">Provider marks inform NAV. Program state tracks reserves.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-secondary">
              SynthaBasket separates market valuation from reserve accounting: provider marks power analytics,
              while the on-chain program tracks the constituent reserves associated with issued basket shares.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={120}>
          <div className="flex items-center gap-2 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-primary">
            <ShieldCheck className="h-4 w-4" />
            Vault-backed when issued
          </div>
        </ScrollReveal>
        </div>
      </section>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-8 text-xs text-ink-tertiary sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="font-semibold text-ink-secondary">SYNTHABASKET</span>
          <div className="flex items-center gap-5">
            <a href="https://github.com/ShalyX/synthabasket" target="_blank" rel="noreferrer" className="hover:text-brand-primary">
              GitHub
            </a>
            <Link href="/app" className="hover:text-brand-primary">Launch App</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
