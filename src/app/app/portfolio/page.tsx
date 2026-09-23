'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Navbar } from '../../../components/Navbar';

type MarketDataSource = 'live' | 'snapshot' | 'mixed';

type Holding = {
  basketId: string;
  symbol: string;
  name: string;
  category: string;
  shares: number;
  navUsd: number | null;
  valueUsd: number | null;
  valuationAvailable: boolean;
  navSource: 'onchain_reserves' | 'unavailable';
  marketDataSource: MarketDataSource;
  marketDataUpdatedAt: number | null;
  change24h: number;
  change24hAvailable: boolean;
  basketMint: string;
  vaultPda: string;
  tokenAccountCount: number;
  registrySource: 'curated' | 'custom';
};

type CustomRegistryStatus = 'loaded' | 'not_configured' | 'unavailable';

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAge(timestamp: number | null, now: number): string {
  if (!timestamp) return 'Not synced';

  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return 'Updated ' + seconds + 's ago';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return 'Updated ' + minutes + 'm ago';

  const hours = Math.floor(minutes / 60);
  return 'Updated ' + hours + 'h ago';
}

function marketDataLabel(source: MarketDataSource): string {
  if (source === 'live') return 'LIVE MARKS';
  if (source === 'mixed') return 'MIXED MARKS';
  return 'SNAPSHOT MARKS';
}

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const owner = publicKey?.toBase58() || null;

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [freshnessNow, setFreshnessNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [customRegistryStatus, setCustomRegistryStatus] =
    useState<CustomRegistryStatus>('loaded');
  const [trackedBasketCount, setTrackedBasketCount] = useState(0);
  const [scannedTokenAccountCount, setScannedTokenAccountCount] = useState(0);
  const requestInFlightRef = useRef<Promise<void> | null>(null);
  const lastRefreshStartedRef = useRef(0);

  const loadPortfolio = useCallback(
    async (silent = false) => {
      if (requestInFlightRef.current) {
        return requestInFlightRef.current;
      }

      if (!owner) {
        setHoldings([]);
        setLastUpdated(null);
        setError(null);
        setTrackedBasketCount(0);
        setScannedTokenAccountCount(0);
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      lastRefreshStartedRef.current = Date.now();

      const request = (async () => {
      try {
        const response = await fetch(
          '/api/portfolio?owner=' + encodeURIComponent(owner),
          { cache: 'no-store' }
        );

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error ||
              'Portfolio request failed with HTTP ' + response.status + '.'
          );
        }

        const positions = Array.isArray(payload.positions)
          ? payload.positions
          : [];

        const hydratedHoldings: Holding[] = positions
          .filter((position: any) => Number(position.shares) > 0)
          .map((position: any) => ({
            basketId: String(position.basketId),
            symbol: String(position.symbol),
            name: String(position.name),
            category: String(position.category || 'custom'),
            shares: Number(position.shares),
            navUsd:
              position.navUsd === null || position.navUsd === undefined
                ? null
                : Number(position.navUsd),
            valueUsd:
              position.valueUsd === null || position.valueUsd === undefined
                ? null
                : Number(position.valueUsd),
            valuationAvailable: position.valuationAvailable === true,
            navSource:
              position.navSource === 'onchain_reserves'
                ? 'onchain_reserves'
                : 'unavailable',
            marketDataSource:
              position.marketDataSource === 'live' ||
              position.marketDataSource === 'mixed'
                ? position.marketDataSource
                : 'snapshot',
            marketDataUpdatedAt: Number(position.marketDataUpdatedAt) || null,
            change24h: Number(position.change24h || 0),
            change24hAvailable: position.change24hAvailable === true,
            basketMint: String(position.basketMint),
            vaultPda: String(position.vaultPda),
            tokenAccountCount: Number(position.tokenAccountCount || 0),
            registrySource:
              position.registrySource === 'custom' ? 'custom' : 'curated',
          }));

        setHoldings(hydratedHoldings);
        setLastUpdated(Number(payload.generatedAt) || Date.now());
        setCustomRegistryStatus(
          payload.customRegistryStatus === 'unavailable' ||
            payload.customRegistryStatus === 'not_configured'
            ? payload.customRegistryStatus
            : 'loaded'
        );
        setTrackedBasketCount(Number(payload.trackedBasketCount) || 0);
        setScannedTokenAccountCount(
          Number(payload.scannedTokenAccountCount) || 0
        );
      } catch (err: any) {
        setError(err?.message || 'Unable to load basket balances from Solana.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      })();

      requestInFlightRef.current = request;
      try {
        await request;
      } finally {
        if (requestInFlightRef.current === request) {
          requestInFlightRef.current = null;
        }
      }
    },
    [owner]
  );

  useEffect(() => {
    if (!owner) {
      void loadPortfolio(false);
      return;
    }

    const refreshIfActive = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRefreshStartedRef.current < 5_000) return;
      void loadPortfolio(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfActive();
    };

    void loadPortfolio(false);

    const intervalId = window.setInterval(refreshIfActive, 30_000);
    window.addEventListener('focus', refreshIfActive);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfActive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadPortfolio, owner]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setFreshnessNow(Date.now()),
      15_000
    );
    return () => window.clearInterval(intervalId);
  }, []);

  const valuedHoldings = useMemo(
    () =>
      holdings.filter(
        (holding) =>
          holding.valuationAvailable &&
          holding.valueUsd !== null &&
          Number.isFinite(holding.valueUsd)
      ),
    [holdings]
  );

  const markedPortfolioValue = useMemo(
    () =>
      valuedHoldings.reduce(
        (sum, holding) => sum + (holding.valueUsd || 0),
        0
      ),
    [valuedHoldings]
  );

  const unpricedCount = holdings.length - valuedHoldings.length;

  return (
    <main className="min-h-screen bg-background pb-16 font-sans text-ink-primary">
      <Navbar network="devnet" />

      <div className="mx-auto max-w-[1440px] space-y-9 px-4 pt-10 sm:px-6 sm:pt-12 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              <Wallet className="h-3.5 w-3.5" />
              Wallet portfolio
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Your SynthaBasket positions
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">
              Ownership is read from the connected wallet&apos;s Solana token
              accounts. Dollar marks appear only when the corresponding basket
              vault and reserve valuation hydrate successfully.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {owner && lastUpdated && (
              <span className="text-xs text-ink-tertiary">
                {formatAge(lastUpdated, freshnessNow)} · refreshes every 30s
              </span>
            )}
            <button
              onClick={() => void loadPortfolio(true)}
              disabled={!owner || loading || refreshing}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-semibold text-ink-primary transition-colors hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={
                  'h-3.5 w-3.5 ' +
                  (loading || refreshing ? 'animate-spin' : '')
                }
              />
              Refresh
            </button>
          </div>
        </div>

        {!owner ? (
          <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border bg-surface">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-bold">
                Connect a wallet to view your portfolio
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                SynthaBasket scans the wallet&apos;s SPL token accounts on
                Solana Devnet and matches real basket-share mints. No local
                demo balance is substituted.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Marked portfolio value
                </p>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  {'$'}{formatUsd(markedPortfolioValue)}
                </p>
                <p className="mt-2 text-xs text-ink-tertiary">
                  {unpricedCount > 0
                    ? unpricedCount +
                      ' position' +
                      (unpricedCount === 1 ? '' : 's') +
                      ' awaiting valuation'
                    : 'All visible positions valued'}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Active positions
                </p>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  {holdings.length}
                </p>
                <p className="mt-2 text-xs text-ink-tertiary">
                  {trackedBasketCount} registered basket
                  {trackedBasketCount === 1 ? '' : 's'} checked
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Valuation coverage
                </p>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  {valuedHoldings.length}/{holdings.length}
                </p>
                <p className="mt-2 text-xs text-ink-tertiary">
                  Live vault state required for a dollar mark
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Balance source
                </p>
                <div className="mt-3 flex items-center gap-2 text-lg font-bold text-brand-primary">
                  <ShieldCheck className="h-5 w-5" />
                  Solana wallet
                </div>
                <p className="mt-2 text-xs text-ink-tertiary">
                  {scannedTokenAccountCount} token account
                  {scannedTokenAccountCount === 1 ? '' : 's'} scanned
                </p>
              </div>
            </section>

            <p className="text-xs leading-5 text-ink-tertiary">
              Marked value is not cost basis or realized/unrealized P&amp;L.
              Portfolio performance is intentionally not inferred from wallet
              balances alone.
            </p>

            {customRegistryStatus !== 'loaded' && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {customRegistryStatus === 'not_configured'
                    ? 'The durable custom-basket registry is not configured, so this scan can identify curated basket mints only.'
                    : 'The durable custom-basket registry could not be read, so custom basket positions may be temporarily missing. Curated wallet balances are still scanned on-chain.'}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <section className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold">Positions</h2>
                  <p className="mt-1 text-xs text-ink-tertiary">
                    On-chain basket balances, valued separately from ownership
                  </p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  {owner.slice(0, 6)}...{owner.slice(-6)}
                </span>
              </div>

              {loading && holdings.length === 0 ? (
                <div className="flex min-h-56 items-center justify-center text-sm text-ink-secondary">
                  Scanning wallet basket balances on Solana…
                </div>
              ) : holdings.length === 0 ? (
                <div className="flex min-h-64 items-center justify-center px-6">
                  <div className="max-w-md text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface-elevated text-brand-primary">
                      <Layers className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold">
                      No registered basket positions found
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-ink-secondary">
                      This wallet does not currently hold a recognized
                      SynthaBasket share mint on Devnet. The scan checks actual
                      wallet token accounts rather than cached portfolio state.
                    </p>
                    <Link
                      href="/app"
                      className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2.5 text-xs font-bold text-black"
                    >
                      Explore baskets
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary">
                        <th className="px-5 py-3">Basket</th>
                        <th className="px-5 py-3 text-right">Shares owned</th>
                        <th className="px-5 py-3 text-right">Vault NAV</th>
                        <th className="px-5 py-3 text-right">Marked value</th>
                        <th className="px-5 py-3 text-right">NAV 24h</th>
                        <th className="px-5 py-3">Valuation data</th>
                        <th className="px-5 py-3 text-right">Execution mint</th>
                        <th className="px-5 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {holdings.map((holding) => (
                        <tr
                          key={holding.basketId}
                          className="transition-colors hover:bg-surface-elevated/40"
                        >
                          <td className="px-5 py-4">
                            <div className="font-bold text-ink-primary">
                              {holding.name}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                              <span className="font-semibold text-brand-primary">
                                {'$'}{holding.symbol}
                              </span>
                              <span className="text-ink-tertiary">·</span>
                              <span className="uppercase text-ink-tertiary">
                                {holding.registrySource}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="font-mono text-xs tabular-nums">
                              {holding.shares.toLocaleString(undefined, {
                                maximumFractionDigits: 6,
                              })}
                            </div>
                            <div className="mt-1 text-[10px] text-ink-tertiary">
                              {holding.tokenAccountCount} token account
                              {holding.tokenAccountCount === 1 ? '' : 's'}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {holding.navUsd === null
                              ? '—'
                              : '$' + holding.navUsd.toFixed(2)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs font-bold tabular-nums">
                            {holding.valueUsd === null
                              ? 'Valuation unavailable'
                              : '$' + formatUsd(holding.valueUsd)}
                          </td>
                          <td
                            className={
                              'px-5 py-4 text-right font-mono text-xs font-bold tabular-nums ' +
                              (holding.change24hAvailable
                                ? holding.change24h >= 0
                                  ? 'text-brand-primary'
                                  : 'text-red-400'
                                : 'text-ink-tertiary')
                            }
                          >
                            {holding.change24hAvailable
                              ? (holding.change24h >= 0 ? '+' : '') +
                                holding.change24h.toFixed(2) +
                                '%'
                              : '—'}
                          </td>
                          <td className="px-5 py-4">
                            {holding.valuationAvailable ? (
                              <div>
                                <span
                                  className={
                                    'inline-flex rounded-full border px-2 py-1 font-mono text-[9px] font-bold tracking-wider ' +
                                    (holding.marketDataSource === 'live'
                                      ? 'border-brand-primary/30 bg-brand-primary/5 text-brand-primary'
                                      : 'border-border bg-surface-elevated text-ink-secondary')
                                  }
                                >
                                  {marketDataLabel(holding.marketDataSource)}
                                </span>
                                <div className="mt-1 text-[10px] text-ink-tertiary">
                                  {holding.marketDataUpdatedAt
                                    ? formatAge(
                                        holding.marketDataUpdatedAt,
                                        freshnessNow
                                      )
                                    : 'Provider timestamp unavailable'}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-1 font-mono text-[9px] font-bold tracking-wider text-amber-300">
                                  UNPRICED
                                </span>
                                <div className="mt-1 text-[10px] text-ink-tertiary">
                                  Share balance remains on-chain
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <a
                              href={
                                'https://explorer.solana.com/address/' +
                                holding.basketMint +
                                '?cluster=devnet'
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-secondary hover:text-brand-primary"
                            >
                              {holding.basketMint.slice(0, 5)}...
                              {holding.basketMint.slice(-4)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link
                              href={`/app?basket=${encodeURIComponent(
                                holding.basketId
                              )}&action=redeem`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-ink-primary transition-colors hover:border-brand-primary hover:text-brand-primary"
                            >
                              Redeem
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
