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
  History,
  Layers,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Navbar } from '../../../components/Navbar';
import { PositionDetailsModal } from '../../../components/PositionDetailsModal';
import { AssetAvatar } from '../../../components/AssetAvatar';
import { AccountActivity, PositionHistorySummary } from '../../../lib/activity';

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
  history: PositionHistorySummary;
};

type RedeemedAsset = {
  symbol: string;
  mint: string | null;
  receivedAmount: number;
  receivedValueUsd: number | null;
  currentWalletBalance: number | null;
  markPriceUsd: number | null;
  currentValueUsd: number | null;
  marketDataSource: 'live' | 'last_live' | 'snapshot';
  marketDataUpdatedAt: number | null;
  redemptionCount: number;
  lastReceivedAt: number;
};

type ClosedPosition = {
  basketId: string;
  basketName: string;
  basketSymbol: string;
  closedAt: number;
  lastSignature: string;
  activityCount: number;
  redemptionCount: number;
  totalInvestedUsd: number | null;
  totalRedeemedValueUsd: number | null;
  realizedPnlUsd: number | null;
  historyComplete: boolean;
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
  const [activities, setActivities] = useState<AccountActivity[]>([]);
  const [redeemedAssets, setRedeemedAssets] = useState<RedeemedAsset[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [activityHistoryStatus, setActivityHistoryStatus] = useState<
    'loaded' | 'not_configured' | 'unavailable'
  >('loaded');
  const [selectedPosition, setSelectedPosition] = useState<Holding | null>(null);
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
        setActivities([]);
        setRedeemedAssets([]);
        setClosedPositions([]);
        setSelectedPosition(null);
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
            history: {
              historyComplete: position.history?.historyComplete === true,
              activityCount: Number(position.history?.activityCount || 0),
              lastActivityAt: Number(position.history?.lastActivityAt) || null,
              indexedShares: Number(position.history?.indexedShares || 0),
              totalInvestedUsd:
                position.history?.totalInvestedUsd === null ||
                position.history?.totalInvestedUsd === undefined
                  ? null
                  : Number(position.history.totalInvestedUsd),
              netCostBasisUsd:
                position.history?.netCostBasisUsd === null ||
                position.history?.netCostBasisUsd === undefined
                  ? null
                  : Number(position.history.netCostBasisUsd),
              averageEntryUsd:
                position.history?.averageEntryUsd === null ||
                position.history?.averageEntryUsd === undefined
                  ? null
                  : Number(position.history.averageEntryUsd),
              realizedPnlUsd:
                position.history?.realizedPnlUsd === null ||
                position.history?.realizedPnlUsd === undefined
                  ? null
                  : Number(position.history.realizedPnlUsd),
              unrealizedPnlUsd:
                position.history?.unrealizedPnlUsd === null ||
                position.history?.unrealizedPnlUsd === undefined
                  ? null
                  : Number(position.history.unrealizedPnlUsd),
            },
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
        setActivities(Array.isArray(payload.activities) ? payload.activities : []);
        setRedeemedAssets(
          Array.isArray(payload.redeemedAssets)
            ? payload.redeemedAssets.map((asset: any) => ({
                symbol: String(asset.symbol),
                mint: asset.mint ? String(asset.mint) : null,
                receivedAmount: Number(asset.receivedAmount || 0),
                receivedValueUsd:
                  asset.receivedValueUsd === null ||
                  asset.receivedValueUsd === undefined
                    ? null
                    : Number(asset.receivedValueUsd),
                currentWalletBalance:
                  asset.currentWalletBalance === null ||
                  asset.currentWalletBalance === undefined
                    ? null
                    : Number(asset.currentWalletBalance),
                markPriceUsd:
                  asset.markPriceUsd === null ||
                  asset.markPriceUsd === undefined
                    ? null
                    : Number(asset.markPriceUsd),
                currentValueUsd:
                  asset.currentValueUsd === null ||
                  asset.currentValueUsd === undefined
                    ? null
                    : Number(asset.currentValueUsd),
                marketDataSource:
                  asset.marketDataSource === 'live' ||
                  asset.marketDataSource === 'last_live'
                    ? asset.marketDataSource
                    : 'snapshot',
                marketDataUpdatedAt:
                  Number(asset.marketDataUpdatedAt) || null,
                redemptionCount: Number(asset.redemptionCount || 0),
                lastReceivedAt: Number(asset.lastReceivedAt || 0),
              }))
            : []
        );
        setClosedPositions(
          Array.isArray(payload.closedPositions)
            ? payload.closedPositions.map((position: any) => ({
                basketId: String(position.basketId),
                basketName: String(position.basketName),
                basketSymbol: String(position.basketSymbol),
                closedAt: Number(position.closedAt || 0),
                lastSignature: String(position.lastSignature || ''),
                activityCount: Number(position.activityCount || 0),
                redemptionCount: Number(position.redemptionCount || 0),
                totalInvestedUsd:
                  position.totalInvestedUsd === null ||
                  position.totalInvestedUsd === undefined
                    ? null
                    : Number(position.totalInvestedUsd),
                totalRedeemedValueUsd:
                  position.totalRedeemedValueUsd === null ||
                  position.totalRedeemedValueUsd === undefined
                    ? null
                    : Number(position.totalRedeemedValueUsd),
                realizedPnlUsd:
                  position.realizedPnlUsd === null ||
                  position.realizedPnlUsd === undefined
                    ? null
                    : Number(position.realizedPnlUsd),
                historyComplete: position.historyComplete === true,
              }))
            : []
        );
        setActivityHistoryStatus(
          payload.activityHistoryStatus === 'not_configured' ||
            payload.activityHistoryStatus === 'unavailable'
            ? payload.activityHistoryStatus
            : 'loaded'
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

      <div className="mx-auto max-w-[1440px] space-y-8 px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              <Wallet className="h-3.5 w-3.5" />
              Wallet portfolio
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
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
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-ink-primary shadow-sm transition-colors hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
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
            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
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

              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
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

              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
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

              <div className="rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
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
              {activityHistoryStatus === 'loaded'
                ? 'Cost basis and P&L appear only when indexed activity reconciles exactly with the current on-chain share balance. Older or externally transferred positions remain marked as partial history.'
                : activityHistoryStatus === 'not_configured'
                ? 'Durable activity storage is not configured, so cost basis and P&L are withheld.'
                : 'Activity history is temporarily unavailable. Wallet ownership and current marked value remain on-chain sourced.'}
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
                <>
                  <div className="divide-y divide-border md:hidden">
                    {holdings.map((holding) => (
                      <article key={holding.basketId} className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0"><h3 className="truncate text-sm font-bold text-ink-primary">{holding.name}</h3><p className="mt-1 font-mono text-[10px] font-semibold text-brand-primary">{'$'}{holding.symbol}</p></div>
                          <div className="shrink-0 text-right"><p className="font-mono text-base font-bold tabular-nums text-ink-primary">{holding.valueUsd === null ? '—' : '$' + formatUsd(holding.valueUsd)}</p><p className="mt-1 text-[10px] text-ink-tertiary">marked value</p></div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-3">
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Shares</p><p className="mt-1 font-mono text-xs tabular-nums text-ink-primary">{holding.shares.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Vault NAV</p><p className="mt-1 font-mono text-xs tabular-nums text-ink-primary">{holding.navUsd === null ? '—' : '$' + holding.navUsd.toFixed(2)}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Cost basis</p><p className="mt-1 font-mono text-xs tabular-nums text-ink-primary">{holding.history.historyComplete && holding.history.netCostBasisUsd !== null ? '$' + formatUsd(holding.history.netCostBasisUsd) : '—'}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Unrealized P&amp;L</p><p className={'mt-1 font-mono text-xs font-semibold tabular-nums ' + (holding.history.unrealizedPnlUsd === null ? 'text-ink-tertiary' : holding.history.unrealizedPnlUsd >= 0 ? 'text-brand-primary' : 'text-semantic-negative')}>{holding.history.unrealizedPnlUsd === null ? '—' : (holding.history.unrealizedPnlUsd >= 0 ? '+' : '') + '$' + formatUsd(holding.history.unrealizedPnlUsd)}</p></div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-[10px]"><span className="inline-flex items-center gap-1.5 text-ink-secondary"><span className={'h-1.5 w-1.5 rounded-full ' + (holding.valuationAvailable && holding.marketDataSource === 'live' ? 'bg-brand-primary' : 'bg-amber-500')} />{holding.valuationAvailable ? marketDataLabel(holding.marketDataSource).toLowerCase() : 'unpriced'}</span>{!holding.history.historyComplete && <span className="text-ink-tertiary">Partial history</span>}</div>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <button type="button" onClick={() => setSelectedPosition(holding)} className="rounded-lg border border-border bg-surface-subtle px-2 py-2.5 text-xs font-semibold text-ink-primary">Details</button>
                          <Link href={`/app?basket=${encodeURIComponent(holding.basketId)}&action=mint`} className="rounded-lg border border-border bg-surface-subtle px-2 py-2.5 text-center text-xs font-semibold text-ink-primary">Invest</Link>
                          <Link href={`/app?basket=${encodeURIComponent(holding.basketId)}&action=redeem`} className="rounded-lg bg-brand-primary px-2 py-2.5 text-center text-xs font-bold text-black">Redeem assets</Link>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[1380px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary">
                        <th className="px-5 py-3">Basket</th>
                        <th className="px-5 py-3 text-right">Shares owned</th>
                        <th className="px-5 py-3 text-right">Vault NAV</th>
                        <th className="px-5 py-3 text-right">Marked value</th>
                        <th className="px-5 py-3 text-right">Cost basis</th>
                        <th className="px-5 py-3 text-right">Unrealized P&amp;L</th>
                        <th className="px-5 py-3 text-right">NAV 24h</th>
                        <th className="px-5 py-3">Valuation data</th>
                        <th className="px-5 py-3 text-right">Execution mint</th>
                        <th className="px-5 py-3 text-right">Actions</th>
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

                          <td className="px-5 py-4 text-right">
                            <div className="font-mono text-xs font-semibold tabular-nums text-ink-primary">
                              {holding.history.historyComplete &&
                              holding.history.netCostBasisUsd !== null
                                ? '$' + formatUsd(holding.history.netCostBasisUsd)
                                : '—'}
                            </div>
                            {!holding.history.historyComplete && (
                              <div className="mt-1 text-[10px] text-ink-tertiary">
                                Partial history
                              </div>
                            )}
                          </td>

                          <td
                            className={
                              'px-5 py-4 text-right font-mono text-xs font-bold tabular-nums ' +
                              (holding.history.unrealizedPnlUsd === null
                                ? 'text-ink-tertiary'
                                : holding.history.unrealizedPnlUsd >= 0
                                ? 'text-brand-primary'
                                : 'text-semantic-negative')
                            }
                          >
                            {holding.history.unrealizedPnlUsd === null
                              ? '—'
                              : (holding.history.unrealizedPnlUsd >= 0 ? '+' : '') +
                                '$' +
                                formatUsd(holding.history.unrealizedPnlUsd)}
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
                                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-wider text-ink-secondary">
                                  <span
                                    className={
                                      'h-1.5 w-1.5 rounded-full ' +
                                      (holding.marketDataSource === 'live'
                                        ? 'bg-brand-primary'
                                        : 'bg-amber-500')
                                    }
                                  />
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
                                <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-wider text-amber-300">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
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
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedPosition(holding)}
                                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-ink-primary transition-colors hover:border-brand-primary hover:text-brand-primary"
                              >
                                Details
                              </button>
                              <Link
                                href={`/app?basket=${encodeURIComponent(
                                  holding.basketId
                                )}&action=mint`}
                                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-ink-primary transition-colors hover:border-brand-primary hover:text-brand-primary"
                              >
                                Invest
                              </Link>
                              <Link
                                href={`/app?basket=${encodeURIComponent(
                                  holding.basketId
                                )}&action=redeem`}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-bold text-black transition-opacity hover:opacity-90"
                              >
                                Redeem assets
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </section>

            {redeemedAssets.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <PackageOpen className="h-4 w-4 text-brand-primary" />
                      <h2 className="text-sm font-bold">Redeemed assets</h2>
                    </div>
                    <p className="mt-1 text-xs text-ink-tertiary">
                      Constituents delivered by SynthaBasket redemptions, paired with the wallet&apos;s current on-chain balance.
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                    {redeemedAssets.length} asset{redeemedAssets.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="border-b border-border bg-surface-subtle px-5 py-3 text-xs leading-5 text-ink-secondary">
                  “Received via redemptions” is the durable SynthaBasket ledger. “Wallet balance” is the wallet&apos;s current total for that mint and can include tokens acquired elsewhere.
                </div>

                <>
                  <div className="divide-y divide-border md:hidden">
                    {redeemedAssets.map((asset) => (
                      <article key={asset.mint || asset.symbol} className="p-4">
                        <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><AssetAvatar symbol={asset.symbol} /><div className="min-w-0"><h3 className="truncate font-mono text-sm font-bold text-ink-primary">{asset.symbol}</h3><p className="mt-1 text-[10px] text-ink-tertiary">{asset.redemptionCount} redemption{asset.redemptionCount === 1 ? '' : 's'}</p></div></div><p className="shrink-0 font-mono text-sm font-bold tabular-nums text-ink-primary">{asset.currentValueUsd === null ? '—' : '$' + formatUsd(asset.currentValueUsd)}</p></div>
                        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3 text-xs">
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Wallet balance</p><p className="mt-1 font-mono tabular-nums text-ink-primary">{asset.currentWalletBalance === null ? '—' : asset.currentWalletBalance.toLocaleString(undefined,{maximumFractionDigits:6})}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Received here</p><p className="mt-1 font-mono tabular-nums text-ink-primary">{asset.receivedAmount.toLocaleString(undefined,{maximumFractionDigits:6})}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Current mark</p><p className="mt-1 font-mono tabular-nums text-ink-primary">{asset.markPriceUsd === null ? '—' : '$' + formatUsd(asset.markPriceUsd)}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Last received</p><p className="mt-1 text-ink-secondary">{formatAge(asset.lastReceivedAt, freshnessNow)}</p></div>
                        </div>
                        {asset.mint && <a href={'https://explorer.solana.com/address/' + asset.mint + '?cluster=devnet'} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-brand-primary">View mint <ExternalLink className="h-3 w-3" /></a>}
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[980px] text-left">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wider text-ink-tertiary">
                        <th className="px-5 py-3">Asset</th>
                        <th className="px-5 py-3 text-right">Wallet balance</th>
                        <th className="px-5 py-3 text-right">Received via redemptions</th>
                        <th className="px-5 py-3 text-right">Current mark</th>
                        <th className="px-5 py-3 text-right">Wallet value</th>
                        <th className="px-5 py-3 text-right">Last received</th>
                        <th className="px-5 py-3 text-right">Mint</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {redeemedAssets.map((asset) => (
                        <tr key={asset.mint || asset.symbol} className="hover:bg-surface-elevated/40">
                          <td className="px-5 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <AssetAvatar symbol={asset.symbol} />
                              <div className="min-w-0">
                                <div className="font-bold text-ink-primary">{asset.symbol}</div>
                                <div className="mt-1 text-[10px] text-ink-tertiary">
                                  {asset.redemptionCount} redemption{asset.redemptionCount === 1 ? '' : 's'}
                                  {asset.receivedValueUsd !== null
                                    ? ' · $' + formatUsd(asset.receivedValueUsd) + ' marked when received'
                                    : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {asset.currentWalletBalance === null
                              ? '—'
                              : asset.currentWalletBalance.toLocaleString(undefined, {
                                  maximumFractionDigits: 6,
                                })}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {asset.receivedAmount.toLocaleString(undefined, {
                              maximumFractionDigits: 6,
                            })}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {asset.markPriceUsd === null
                              ? '—'
                              : '$' + formatUsd(asset.markPriceUsd)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs font-bold tabular-nums">
                            {asset.currentValueUsd === null
                              ? '—'
                              : '$' + formatUsd(asset.currentValueUsd)}
                          </td>
                          <td className="px-5 py-4 text-right text-xs text-ink-secondary">
                            {formatAge(asset.lastReceivedAt, freshnessNow)}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {asset.mint ? (
                              <a
                                href={'https://explorer.solana.com/address/' + asset.mint + '?cluster=devnet'}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-secondary hover:text-brand-primary"
                              >
                                {asset.mint.slice(0, 5)}...{asset.mint.slice(-4)}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-ink-tertiary">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              </section>
            )}

            {closedPositions.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-brand-primary" />
                      <h2 className="text-sm font-bold">Closed positions</h2>
                    </div>
                    <p className="mt-1 text-xs text-ink-tertiary">
                      Positions appear here only when indexed mint/redeem history reconciles exactly to zero shares.
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                    {closedPositions.length} closed
                  </span>
                </div>

                <>
                  <div className="divide-y divide-border md:hidden">
                    {closedPositions.map((position) => (
                      <article key={position.basketId} className="p-4">
                        <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-bold text-ink-primary">{position.basketName}</h3><p className="mt-1 font-mono text-[10px] font-semibold text-brand-primary">{'$'}{position.basketSymbol}</p></div><p className="text-[10px] text-ink-tertiary">{formatAge(position.closedAt, freshnessNow)}</p></div>
                        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3">
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Invested</p><p className="mt-1 font-mono text-xs tabular-nums">{position.totalInvestedUsd === null ? '—' : '$' + formatUsd(position.totalInvestedUsd)}</p></div>
                          <div><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Redeemed value</p><p className="mt-1 font-mono text-xs tabular-nums">{position.totalRedeemedValueUsd === null ? '—' : '$' + formatUsd(position.totalRedeemedValueUsd)}</p></div>
                          <div className="col-span-2"><p className="text-[9px] uppercase tracking-wider text-ink-tertiary">Realized P&amp;L</p><p className={'mt-1 font-mono text-sm font-bold tabular-nums ' + (position.realizedPnlUsd === null ? 'text-ink-tertiary' : position.realizedPnlUsd >= 0 ? 'text-brand-primary' : 'text-semantic-negative')}>{position.realizedPnlUsd === null ? '—' : (position.realizedPnlUsd >= 0 ? '+' : '') + '$' + formatUsd(position.realizedPnlUsd)}</p></div>
                        </div>
                        <a href={'https://explorer.solana.com/tx/' + position.lastSignature + '?cluster=devnet'} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-brand-primary">Last transaction <ExternalLink className="h-3 w-3" /></a>
                      </article>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[900px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary">
                        <th className="px-5 py-3">Basket</th>
                        <th className="px-5 py-3 text-right">Closed</th>
                        <th className="px-5 py-3 text-right">Total invested</th>
                        <th className="px-5 py-3 text-right">Redeemed value</th>
                        <th className="px-5 py-3 text-right">Realized P&amp;L</th>
                        <th className="px-5 py-3 text-right">Last transaction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {closedPositions.map((position) => (
                        <tr key={position.basketId} className="hover:bg-surface-elevated/40">
                          <td className="px-5 py-4">
                            <div className="font-bold text-ink-primary">{position.basketName}</div>
                            <div className="mt-1 font-mono text-[10px] font-semibold text-brand-primary">
                              {'$'}{position.basketSymbol}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right text-xs text-ink-secondary">
                            {formatAge(position.closedAt, freshnessNow)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {position.totalInvestedUsd === null
                              ? '—'
                              : '$' + formatUsd(position.totalInvestedUsd)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {position.totalRedeemedValueUsd === null
                              ? '—'
                              : '$' + formatUsd(position.totalRedeemedValueUsd)}
                          </td>
                          <td
                            className={
                              'px-5 py-4 text-right font-mono text-xs font-bold tabular-nums ' +
                              (position.realizedPnlUsd === null
                                ? 'text-ink-tertiary'
                                : position.realizedPnlUsd >= 0
                                ? 'text-brand-primary'
                                : 'text-semantic-negative')
                            }
                          >
                            {position.realizedPnlUsd === null
                              ? '—'
                              : (position.realizedPnlUsd >= 0 ? '+' : '') +
                                '$' +
                                formatUsd(position.realizedPnlUsd)}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <a
                              href={'https://explorer.solana.com/tx/' + position.lastSignature + '?cluster=devnet'}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-brand-primary hover:underline"
                            >
                              View tx <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              </section>
            )}
          </>
        )}
      </div>

      <PositionDetailsModal
        holding={selectedPosition}
        activities={activities}
        onClose={() => setSelectedPosition(null)}
      />
    </main>
  );
}
