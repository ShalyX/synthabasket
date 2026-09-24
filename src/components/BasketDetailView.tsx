'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowUpRight, ArrowDownRight, ExternalLink, ShieldCheck } from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { BasketDefinition, BasketMintQuote, BasketRedeemQuote } from '../lib/types';
import { calculateMintQuote } from '../lib/services/valuation_engine';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getHistoryForRange, NavHistoryPoint } from '../lib/client/nav_history';
import { SYNTHABASKET_PROGRAM_ID, SynthaBasketVaultClient } from '../lib/execution/vault_client';
import { AllocationRouter } from '../lib/execution/allocation_router';
import { explainTransactionError } from '../lib/client/transaction_errors';
import { AssetAvatar } from './AssetAvatar';

interface BasketDetailViewProps {
  basket: BasketDefinition;
  initialTab?: 'mint' | 'redeem' | 'inspect';
  onClose: () => void;
  onExecuteMint: (basket: BasketDefinition, quote: BasketMintQuote) => void;
  onExecuteRedeem: (basket: BasketDefinition, quote: BasketRedeemQuote) => void;
  navHistory?: NavHistoryPoint[];
  lastUpdatedAt?: number;
  dataIsStale?: boolean;
}

const TIMEFRAMES = [
  { label: '1H', ms: 60 * 60 * 1000 },
  { label: '24H', ms: 24 * 60 * 60 * 1000 },
  { label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

function providerLabel(provider: string) {
  if (provider === 'prestocks') return 'PreStocks';
  if (provider === 'tessera') return 'Tessera';
  return provider;
}

export const BasketDetailView: React.FC<BasketDetailViewProps> = ({
  basket,
  initialTab = 'mint',
  onClose,
  onExecuteMint,
  onExecuteRedeem,
  navHistory = [],
  lastUpdatedAt,
  dataIsStale = false,
}) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [activeTab, setActiveTab] = useState<'inspect' | 'mint' | 'redeem'>(
    initialTab
  );
  const [usdcAmount, setUsdcAmount] = useState<number>(100);
  const [redeemShares, setRedeemShares] = useState<number>(0);
  const [chartTimeframe, setChartTimeframe] =
    useState<(typeof TIMEFRAMES)[number]['label']>('1H');
  const [durableHistory, setDurableHistory] = useState<NavHistoryPoint[]>([]);
  const [durableHistoryEnabled, setDurableHistoryEnabled] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [basketBalance, setBasketBalance] = useState<number | null>(null);
  const [balanceStatus, setBalanceStatus] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [liveMintQuote, setLiveMintQuote] = useState<BasketMintQuote | null>(null);
  const [mintQuoteLoading, setMintQuoteLoading] = useState(false);
  const [mintQuoteError, setMintQuoteError] = useState<string | null>(null);
  const [liveRedeemQuote, setLiveRedeemQuote] = useState<BasketRedeemQuote | null>(null);
  const [redeemQuoteLoading, setRedeemQuoteLoading] = useState(false);
  const [redeemQuoteError, setRedeemQuoteError] = useState<string | null>(null);
  const [balanceRefreshNonce, setBalanceRefreshNonce] = useState(0);
  const [mintQuoteRefreshNonce, setMintQuoteRefreshNonce] = useState(0);
  const [redeemQuoteRefreshNonce, setRedeemQuoteRefreshNonce] = useState(0);
  const [mintQuoteUpdatedAt, setMintQuoteUpdatedAt] = useState<number | null>(null);
  const [redeemQuoteUpdatedAt, setRedeemQuoteUpdatedAt] = useState<number | null>(null);
  const [quoteNow, setQuoteNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setQuoteNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const mintQuoteStale =
    mintQuoteUpdatedAt !== null && quoteNow - mintQuoteUpdatedAt > 20_000;
  const redeemQuoteStale =
    redeemQuoteUpdatedAt !== null && quoteNow - redeemQuoteUpdatedAt > 20_000;
  const hydrationAgeSeconds =
    lastUpdatedAt === undefined
      ? null
      : Math.max(0, Math.floor((quoteNow - lastUpdatedAt) / 1000));
  const unfundedVault =
    basket.onChainStateLoaded === true && basket.totalSharesMinted <= 0;
  const vaultStateLabel = basket.onChainStateLoaded
    ? unfundedVault
      ? 'Verified · unfunded vault'
      : 'Verified · live vault'
    : 'Vault unavailable';
  const marketStateLabel =
    basket.marketDataSource === 'live'
      ? 'Live market data'
      : basket.marketDataSource === 'mixed'
      ? 'Mixed live + fallback pricing'
      : 'Fallback snapshot pricing';

  const mintQuote = useMemo(
    () => calculateMintQuote(basket, usdcAmount || 0),
    [basket, usdcAmount]
  );
  const isPositive = basket.navChange24h >= 0;

  const executionVerification = useMemo(() => {
    const vaultClient = new SynthaBasketVaultClient(connection);
    const executionSymbol =
      basket.devnetExecutionSymbol || `${basket.symbol}D`;
    const [expectedVaultPda] = vaultClient.getBasketPda(executionSymbol);
    const [expectedBasketMint] = vaultClient.getBasketMintPda(executionSymbol);
    const vaultPda = expectedVaultPda.toBase58();
    const basketMint = expectedBasketMint.toBase58();

    return {
      executionSymbol,
      vaultPda,
      basketMint,
      programId: SYNTHABASKET_PROGRAM_ID.toBase58(),
      verified:
        basket.onChainStateLoaded === true &&
        basket.vaultPda === vaultPda &&
        basket.basketMint === basketMint,
    };
  }, [basket, connection]);

  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;

    async function loadWalletBalances() {
      if (!publicKey) {
        if (!cancelled) {
          setUsdcBalance(null);
          setBasketBalance(null);
          setBalanceStatus('idle');
          setBalanceError(null);
        }
        return;
      }

      if (requestInFlight) return;
      requestInFlight = true;
      if (!cancelled) setBalanceStatus('loading');

      try {
        const vaultClient = new SynthaBasketVaultClient(connection);
        const devnetUsdcMint = new PublicKey(
          '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
        );

        const [usdc, shares] = await Promise.all([
          vaultClient.getUserTokenBalance(publicKey, devnetUsdcMint),
          vaultClient.getUserBasketBalance(publicKey, basket, true),
        ]);

        if (!cancelled) {
          setUsdcBalance(usdc);
          setBasketBalance(shares);
          setBalanceStatus('ready');
          setBalanceError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          const message = String(error?.message || error || '');
          setBalanceStatus('error');
          setBalanceError(
            /429|rate limit|too many requests/i.test(message)
              ? 'Solana Devnet is rate-limiting balance reads. Existing balances are preserved and are not replaced with zero.'
              : 'Wallet balances could not be refreshed from Solana. Existing balances are preserved until a confirmed read succeeds.'
          );
        }
      } finally {
        requestInFlight = false;
      }
    }

    const refreshIfActive = () => {
      if (document.visibilityState === 'visible') {
        void loadWalletBalances();
      }
    };

    void loadWalletBalances();
    const id = window.setInterval(refreshIfActive, 30_000);
    window.addEventListener('focus', refreshIfActive);
    document.addEventListener('visibilitychange', refreshIfActive);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', refreshIfActive);
      document.removeEventListener('visibilitychange', refreshIfActive);
    };
  }, [basket, balanceRefreshNonce, connection, publicKey]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      if (
        !publicKey ||
        !usdcAmount ||
        usdcAmount <= 0 ||
        (usdcBalance !== null && usdcAmount > usdcBalance)
      ) {
        if (!cancelled) {
          setLiveMintQuote(null);
          setMintQuoteUpdatedAt(null);
          setMintQuoteError(null);
          setMintQuoteLoading(false);
        }
        return;
      }

      setMintQuoteLoading(true);
      setMintQuoteError(null);

      try {
        const router = new AllocationRouter(connection);
        const allocationPlan = await router.prepareAllocationSwaps(
          publicKey,
          mintQuote,
          true
        );

        if (allocationPlan.unavailable.length > 0) {
          throw new Error(
            allocationPlan.unavailable.map((item) => item.reason).join(' ')
          );
        }
        if (allocationPlan.executionTransactions.length < 1) {
          throw new Error('No executable acquisition route is available.');
        }

        const executionQuote: BasketMintQuote = {
          ...mintQuote,
          allocations: mintQuote.allocations.map((allocation) => {
            const executed = allocationPlan.breakdown.find(
              (item) => item.symbol === allocation.asset.symbol
            );
            if (!executed?.rawOutAmount || executed.actualQuotedOutAmount === null) {
              throw new Error(
                `Missing executable amount for ${allocation.asset.symbol}.`
              );
            }
            return {
              ...allocation,
              estimatedTokensReceived: executed.actualQuotedOutAmount,
              rawTokenAmount: executed.rawOutAmount,
            };
          }),
        };

        const vaultClient = new SynthaBasketVaultClient(connection);
        await vaultClient.verifyBasketExecutionState(basket, true);
        const proportionalQuote = await vaultClient.prepareProportionalMintQuote(
          basket,
          executionQuote,
          true
        );

        if (!cancelled) {
          setLiveMintQuote(proportionalQuote);
          setMintQuoteUpdatedAt(Date.now());
        }
      } catch (error: any) {
        if (!cancelled) {
          const explained = explainTransactionError(error, 'quote');
          setLiveMintQuote(null);
          setMintQuoteUpdatedAt(null);
          setMintQuoteError(`${explained.message} ${explained.recoveryAction}`);
        }
      } finally {
        if (!cancelled) setMintQuoteLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [basket, connection, mintQuote, mintQuoteRefreshNonce, publicKey, usdcAmount, usdcBalance]);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setRedeemQuoteError(null);

      if (!redeemShares || redeemShares <= 0) {
        if (!cancelled) {
          setLiveRedeemQuote(null);
          setRedeemQuoteUpdatedAt(null);
          setRedeemQuoteLoading(false);
        }
        return;
      }

      if (
        basketBalance !== null &&
        redeemShares > basketBalance + 0.0000005
      ) {
        if (!cancelled) {
          setLiveRedeemQuote(null);
          setRedeemQuoteLoading(false);
          setRedeemQuoteError(
            `You own ${basketBalance.toFixed(6)} ${basket.symbol}. Enter that amount or less.`
          );
        }
        return;
      }

      setRedeemQuoteLoading(true);
      try {
        const vaultClient = new SynthaBasketVaultClient(connection);
        const quote = await vaultClient.prepareLiveRedeemQuote(
          basket,
          redeemShares,
          true
        );
        if (!cancelled) {
          setLiveRedeemQuote(quote);
          setRedeemQuoteUpdatedAt(Date.now());
          setRedeemQuoteError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          const explained = explainTransactionError(error, 'quote');
          setLiveRedeemQuote(null);
          setRedeemQuoteUpdatedAt(null);
          setRedeemQuoteError(`${explained.message} ${explained.recoveryAction}`);
        }
      } finally {
        if (!cancelled) setRedeemQuoteLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [basket, basketBalance, connection, redeemQuoteRefreshNonce, redeemShares]);

  const selectedRange =
    TIMEFRAMES.find((timeframe) => timeframe.label === chartTimeframe) ||
    TIMEFRAMES[0];

  useEffect(() => {
    let cancelled = false;

    async function loadDurableHistory() {
      try {
        const response = await fetch(
          `/api/nav-history?basketId=${encodeURIComponent(
            basket.id
          )}&rangeMs=${selectedRange.ms}`,
          { cache: 'no-store' }
        );
        const payload = await response.json();
        if (cancelled) return;

        setDurableHistoryEnabled(payload.durable === true);
        setDurableHistory(
          Array.isArray(payload.points)
            ? payload.points.filter(
                (point: NavHistoryPoint) =>
                  Number.isFinite(point.timestamp) &&
                  Number.isFinite(point.navUsd)
              )
            : []
        );
      } catch {
        if (!cancelled) {
          setDurableHistoryEnabled(false);
          setDurableHistory([]);
        }
      }
    }

    void loadDurableHistory();
    const intervalId = window.setInterval(loadDurableHistory, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [basket.id, selectedRange.ms]);

  const chartPoints = useMemo(() => {
    // When durable storage is configured it is authoritative. Session-local
    // observations are only a fallback when durable history is unavailable.
    const source = durableHistoryEnabled ? durableHistory : navHistory;

    return getHistoryForRange(
      [...source].sort((a, b) => a.timestamp - b.timestamp),
      selectedRange.ms
    ).map((point) => ({
      timestamp: point.timestamp,
      navUsd: point.navUsd,
    }));
  }, [durableHistory, durableHistoryEnabled, navHistory, selectedRange.ms]);

  const localRangeChange = useMemo(() => {
    if (chartPoints.length < 2) return null;
    const first = chartPoints[0].navUsd;
    const last = chartPoints[chartPoints.length - 1].navUsd;
    if (!Number.isFinite(first) || first <= 0) return null;
    return ((last - first) / first) * 100;
  }, [chartPoints]);

  const formatChartTime = (timestamp: number) => {
    const date = new Date(timestamp);
    if (chartTimeframe === '1H' || chartTimeframe === '24H') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getSegmentColor = (idx: number) => {
    const palette = [
      'bg-brand-primary',
      'bg-blue-500',
      'bg-purple-500',
      'bg-amber-500',
      'bg-emerald-400',
      'bg-cyan-500',
    ];
    return palette[idx % palette.length];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-6">
      <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-4xl flex-col overflow-hidden bg-surface shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-xl sm:border sm:border-border">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-ink-primary sm:text-lg">
              {basket.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-tertiary">
              <span className="font-mono font-semibold text-brand-primary">
                {basket.symbol}
              </span>
              <span>·</span>
              <span>Solana Devnet</span>
              <span>·</span>
              <span>{vaultStateLabel}</span>
              <span>·</span>
              <span>{marketStateLabel}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close basket details"
            className="rounded-md p-1.5 text-ink-tertiary transition-colors hover:bg-surface-elevated hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
          <div className="order-2 space-y-7 border-t border-border p-4 sm:p-6 lg:order-1 lg:border-r lg:border-t-0">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-ink-tertiary">
                    {basket.navSource === 'onchain_reserves' ? 'Vault NAV' : 'Indicative NAV'}
                  </p>
                  <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-ink-primary">
                    $ {basket.navUsd.toFixed(2)}
                  </p>
                </div>
                {basket.navChange24hAvailable ? (
                  <div
                    className={`flex items-center font-mono text-sm font-semibold tabular-nums ${
                      isPositive ? 'text-brand-primary' : 'text-semantic-negative'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {basket.navChange24h.toFixed(2)}%
                    {isPositive ? (
                      <ArrowUpRight className="ml-0.5 h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="ml-0.5 h-4 w-4" />
                    )}
                    <span className="ml-1 font-sans text-xs font-normal text-ink-tertiary">24h</span>
                  </div>
                ) : (
                  <span className="text-xs text-ink-tertiary">24h change unavailable</span>
                )}
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-ink-secondary">
                {basket.description}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${dataIsStale ? 'bg-amber-500' : 'bg-brand-primary'}`} />
                  {dataIsStale
                    ? 'Last known snapshot'
                    : hydrationAgeSeconds === null
                    ? 'Freshness unavailable'
                    : hydrationAgeSeconds < 5
                    ? 'Updated just now'
                    : `Updated ${hydrationAgeSeconds}s ago`}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${basket.onChainStateLoaded ? 'bg-brand-primary' : 'bg-amber-500'}`} />
                  {vaultStateLabel}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${basket.marketDataSource === 'live' ? 'bg-brand-primary' : 'bg-amber-500'}`} />
                  {marketStateLabel}
                </span>
              </div>
              {(unfundedVault || !basket.onChainStateLoaded || basket.marketDataSource !== 'live' || dataIsStale) && (
                <p className="mt-3 text-xs leading-5 text-amber-300">
                  {dataIsStale
                    ? 'The latest refresh failed, so this view is showing the last known snapshot. Trading still performs a fresh on-chain verification before signing.'
                    : unfundedVault
                    ? 'The vault is verified but has no share supply yet. NAV is target-weight indicative until the basket receives its first funding.'
                    : !basket.onChainStateLoaded
                    ? 'Live vault state was unavailable in this refresh. Values are indicative; investing and asset redemption remain gated by a fresh on-chain verification.'
                    : 'One or more constituent prices are using verified fallback data rather than a fully live provider response.'}
                </p>
              )}
            </div>

            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink-primary">NAV history</h3>
                  <p className="mt-0.5 text-xs text-ink-tertiary">
                    {durableHistoryEnabled
                      ? 'Durable server-side NAV observations. No synthetic backfill.'
                      : 'Durable history is unavailable; showing session-only live observations from this device.'}
                  </p>
                </div>

                <div className="flex items-center gap-4 overflow-x-auto text-xs">
                  {TIMEFRAMES.map((timeframe) => (
                    <button
                      key={timeframe.label}
                      onClick={() => setChartTimeframe(timeframe.label)}
                      className={
                        chartTimeframe === timeframe.label
                          ? 'font-semibold text-brand-primary'
                          : 'text-ink-tertiary transition-colors hover:text-ink-primary'
                      }
                    >
                      {timeframe.label}
                    </button>
                  ))}
                </div>
              </div>

              {chartPoints.length >= 2 ? (
                <>
                  <div className="h-40 w-full sm:h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartPoints}
                        margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
                      >
                        <XAxis
                          dataKey="timestamp"
                          type="number"
                          domain={['dataMin', 'dataMax']}
                          scale="time"
                          tickFormatter={formatChartTime}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={28}
                        />
                        <YAxis
                          dataKey="navUsd"
                          domain={['auto', 'auto']}
                          tickFormatter={(value) => '$' + Number(value).toFixed(0)}
                          tick={{ fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          width={46}
                        />
                        <Tooltip
                          labelFormatter={(value) =>
                            new Date(Number(value)).toLocaleString()
                          }
                          formatter={(value) => [
                            '$' + Number(value).toFixed(2),
                            'NAV',
                          ]}
                          contentStyle={{
                            background: 'rgb(var(--surface-rgb))',
                            border: '1px solid rgb(var(--border-rgb))',
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="navUsd"
                          stroke="#00d182"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 3 }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-ink-tertiary">
                      {chartPoints.length} real observations
                    </span>
                    {localRangeChange !== null && (
                      <span
                        className={
                          'font-mono font-semibold tabular-nums ' +
                          (localRangeChange >= 0
                            ? 'text-brand-primary'
                            : 'text-semantic-negative')
                        }
                      >
                        {localRangeChange >= 0 ? '+' : ''}
                        {localRangeChange.toFixed(2)}% {chartTimeframe}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex h-44 items-center justify-center border-y border-border text-center">
                  <div>
                    <p className="text-sm font-medium text-ink-secondary">
                      Collecting live NAV history
                    </p>
                    <p className="mt-1 text-xs text-ink-tertiary">
                      The next point is recorded on the 30-second refresh.
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-primary">Composition</h3>
                <span className="text-xs text-ink-tertiary">{basket.constituents.length} assets</span>
              </div>

              <div className="mb-4 flex h-1.5 overflow-hidden rounded-full bg-surface-elevated">
                {basket.constituents.map((constituent, index) => (
                  <span
                    key={constituent.asset.tokenMint}
                    className={getSegmentColor(index)}
                    style={{ width: `${constituent.targetWeightBps / 100}%` }}
                  />
                ))}
              </div>

              <div className="divide-y divide-border">
                {basket.constituents.map((constituent, index) => (
                  <div
                    key={constituent.asset.tokenMint}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${getSegmentColor(index)}`} />
                      <AssetAvatar
                        symbol={constituent.asset.symbol}
                        name={constituent.asset.name}
                        logoUrl={constituent.asset.logoUrl}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink-primary">
                          {constituent.asset.symbol}
                        </div>
                        <div className="truncate text-xs text-ink-tertiary">
                          {constituent.asset.name} · {providerLabel(constituent.asset.provider)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                        {constituent.targetWeightBps / 100}%
                      </div>
                      <div className="text-[11px] text-ink-tertiary">weight</div>
                    </div>
                    <div className="hidden w-20 text-right font-mono text-sm tabular-nums text-ink-secondary sm:block">
                      $ {constituent.asset.priceUsd.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-y border-border py-4">
              <div className="flex items-start gap-2.5">
                <ShieldCheck
                  className={
                    'mt-0.5 h-4 w-4 shrink-0 ' +
                    (executionVerification.verified ? 'text-brand-primary' : 'text-ink-tertiary')
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-sm font-semibold text-ink-primary">On-chain verification</h3>
                    <span className={'inline-flex items-center gap-1.5 text-[10px] font-semibold ' + (executionVerification.verified ? 'text-brand-primary' : 'text-ink-tertiary')}>
                      <span className={'h-1.5 w-1.5 rounded-full ' + (executionVerification.verified ? 'bg-brand-primary' : 'bg-ink-tertiary')} />
                      {executionVerification.verified ? 'Verified live' : 'Not verified'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    {executionVerification.verified
                      ? `This refresh verified the ${executionVerification.executionSymbol} Devnet vault, deterministic share mint, and live reserve state.`
                      : 'The deterministic execution addresses are shown below, but live basket state was not verified in this refresh. Investing and asset redemption remain gated by a fresh on-chain verification before signing.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 divide-y divide-border text-[11px]">
                {[
                  { label: 'Program', value: executionVerification.programId, address: executionVerification.programId },
                  { label: executionVerification.verified ? 'Vault PDA' : 'Expected vault PDA', value: executionVerification.vaultPda, address: executionVerification.vaultPda },
                  { label: executionVerification.verified ? 'Share mint' : 'Expected share mint', value: executionVerification.basketMint, address: executionVerification.basketMint },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={`https://explorer.solana.com/address/${item.address}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 transition-colors hover:text-brand-primary"
                  >
                    <span className="font-medium text-ink-tertiary">{item.label}</span>
                    <span className="truncate font-mono text-ink-secondary">{item.value.slice(0, 8)}...{item.value.slice(-6)}</span>
                    <ExternalLink className="h-3 w-3 text-ink-tertiary" />
                  </a>
                ))}
              </div>

              <a
                href="https://github.com/ShalyX/synthabasket/blob/main/DEMO_RUN_RECEIPTS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
              >
                Historical Devnet execution receipts
                <ExternalLink className="h-3 w-3" />
              </a>
            </section>

            <div className="border-t border-border pt-4 text-xs text-ink-tertiary">
              {basket.navSource === 'onchain_reserves'
                ? 'NAV uses live vault reserves and current constituent prices.'
                : 'NAV uses current constituent prices and target weights until the basket has live reserves.'}
            </div>
          </div>

          <div className="order-1 bg-surface-subtle p-4 sm:p-6 lg:order-2">
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('inspect')}
                className={`flex-1 border-b-2 px-2 pb-3 text-sm font-semibold transition-colors ${
                  activeTab === 'inspect'
                    ? 'border-brand-primary text-ink-primary'
                    : 'border-transparent text-ink-tertiary hover:text-ink-primary'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('mint')}
                className={`flex-1 border-b-2 px-2 pb-3 text-sm font-semibold transition-colors ${
                  activeTab === 'mint'
                    ? 'border-brand-primary text-ink-primary'
                    : 'border-transparent text-ink-tertiary hover:text-ink-primary'
                }`}
              >
                Invest
              </button>
              <button
                onClick={() => setActiveTab('redeem')}
                className={`flex-1 border-b-2 px-2 pb-3 text-sm font-semibold transition-colors ${
                  activeTab === 'redeem'
                    ? 'border-brand-primary text-ink-primary'
                    : 'border-transparent text-ink-tertiary hover:text-ink-primary'
                }`}
              >
                Redeem assets
              </button>
            </div>

            {activeTab === 'inspect' && (
              <div className="mt-6 space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-ink-primary">
                    Execution snapshot
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-ink-tertiary">
                    This panel separates current on-chain state from indicative market pricing.
                  </p>
                </div>

                <div className="divide-y divide-border rounded-lg border border-border bg-surface px-4">
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-ink-secondary">Vault state</span>
                    <span className={executionVerification.verified ? 'font-medium text-brand-primary' : 'text-ink-tertiary'}>
                      {executionVerification.verified ? 'Verified this refresh' : 'Fresh verification required'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-ink-secondary">Share supply</span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      {basket.onChainStateLoaded
                        ? basket.totalSharesMinted.toLocaleString(undefined, { maximumFractionDigits: 6 })
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-ink-secondary">Your shares</span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      {!publicKey
                        ? 'Connect wallet'
                        : balanceStatus === 'loading' && basketBalance === null
                        ? 'Loading…'
                        : basketBalance === null
                        ? '—'
                        : basketBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-ink-secondary">Secondary liquidity</span>
                    <span className="text-ink-tertiary">Not advertised</span>
                  </div>
                </div>

                {balanceError && (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                    <p className="text-xs leading-5 text-amber-300">{balanceError}</p>
                    <button
                      onClick={() => setBalanceRefreshNonce((value) => value + 1)}
                      className="shrink-0 text-xs font-semibold text-ink-primary hover:text-brand-primary"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <p className="text-xs leading-5 text-ink-tertiary">
                  Investing acquires the underlying constituents and deposits them into the program vault.
                  Redeem to assets burns basket shares for the current pro-rata underlying assets. No secondary pool
                  is presented as active unless a compatible venue is actually verified.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setActiveTab('mint')} className="rounded-lg bg-brand-primary py-2.5 text-sm font-semibold text-black">
                    Invest
                  </button>
                  <button onClick={() => setActiveTab('redeem')} className="rounded-lg border border-border bg-surface py-2.5 text-sm font-semibold text-ink-primary transition-colors hover:border-border-strong">
                    Redeem assets
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'mint' && (
              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-ink-secondary">Amount</label>
                    {usdcBalance !== null && (
                      <button
                        onClick={() => setUsdcAmount(Number(usdcBalance.toFixed(6)))}
                        className="text-xs text-ink-tertiary hover:text-brand-primary"
                      >
                        Balance {usdcBalance.toFixed(2)} USDC · Max
                      </button>
                    )}
                  </div>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={usdcBalance ?? undefined}
                      value={usdcAmount}
                      onChange={(e) => setUsdcAmount(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-surface px-3.5 py-3 pr-16 font-mono text-lg font-semibold tabular-nums text-ink-primary outline-none transition-colors focus:border-brand-primary"
                    />
                    <span className="absolute right-3.5 top-3.5 font-mono text-xs text-ink-tertiary">
                      USDC
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  {[10, 25, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setUsdcAmount(amount)}
                      disabled={usdcBalance !== null && amount > usdcBalance}
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {amount}
                    </button>
                  ))}
                </div>

                {balanceError && (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
                    <p className="text-xs leading-5 text-amber-300">{balanceError}</p>
                    <button
                      onClick={() => setBalanceRefreshNonce((value) => value + 1)}
                      className="shrink-0 text-xs font-semibold text-ink-primary hover:text-brand-primary"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div className="border-y border-border py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-secondary">
                      {mintQuoteLoading ? 'Preparing executable quote…' : 'Executable shares'}
                    </span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                      {liveMintQuote
                        ? `${liveMintQuote.expectedBasketTokens.toFixed(6)} ${basket.symbol}`
                        : '—'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-tertiary">
                    <span>Live vault + current acquisition route</span>
                    <span>
                      {mintQuoteUpdatedAt
                        ? mintQuoteStale
                          ? 'Quote expired · refresh required'
                          : `Quoted ${Math.max(0, Math.floor((quoteNow - mintQuoteUpdatedAt) / 1000))}s ago`
                        : `${basket.constituents.length} assets`}
                    </span>
                  </div>
                  {mintQuoteStale && (
                    <p className="mt-2 text-xs leading-5 text-amber-300">
                      This executable quote is over 20 seconds old. Refresh it before signing.
                    </p>
                  )}
                  {liveMintQuote && (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="mb-2 text-xs text-ink-tertiary">Vault deposit</p>
                      <div className="space-y-1.5">
                        {liveMintQuote.allocations.map((allocation) => (
                          <div
                            key={allocation.asset.tokenMint}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-ink-secondary">
                              {allocation.asset.symbol}
                            </span>
                            <span className="font-mono tabular-nums text-ink-primary">
                              {allocation.estimatedTokensReceived.toFixed(6)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {mintQuoteError && (
                    <div className="mt-2 flex items-start justify-between gap-3">
                      <p className="text-xs leading-5 text-semantic-negative">
                        {mintQuoteError}
                      </p>
                      <button
                        onClick={() => setMintQuoteRefreshNonce((value) => value + 1)}
                        className="shrink-0 text-xs font-semibold text-ink-primary hover:text-brand-primary"
                      >
                        Retry quote
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (!publicKey) {
                      setWalletModalVisible(true);
                      return;
                    }
                    if (mintQuoteStale) {
                      setMintQuoteRefreshNonce((value) => value + 1);
                      return;
                    }
                    if (liveMintQuote) {
                      onExecuteMint(basket, liveMintQuote);
                    }
                  }}
                  disabled={
                    publicKey
                      ? mintQuoteLoading ||
                        !liveMintQuote ||
                        !usdcAmount ||
                        usdcAmount <= 0 ||
                        (usdcBalance !== null && usdcAmount > usdcBalance)
                      : false
                  }
                  className="w-full rounded-lg bg-brand-primary py-3 text-sm font-semibold text-black transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {publicKey
                    ? mintQuoteLoading
                      ? 'Refreshing executable quote…'
                      : mintQuoteStale
                      ? 'Refresh quote before investing'
                      : `Invest ${usdcAmount || 0} USDC`
                    : 'Connect wallet to invest'}
                </button>
              </div>
            )}

            {activeTab === 'redeem' && (
              <div className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-ink-secondary">
                      Shares to redeem
                    </label>
                    {basketBalance !== null && (
                      <button
                        onClick={() => setRedeemShares(basketBalance)}
                        disabled={basketBalance <= 0}
                        className="text-xs text-ink-tertiary hover:text-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        You own {basketBalance.toFixed(6)} {basket.symbol} · Max
                      </button>
                    )}
                  </div>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      min="0"
                      step="0.000001"
                      value={redeemShares || ''}
                      placeholder="0.000000"
                      onChange={(e) => setRedeemShares(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-surface px-3.5 py-3 pr-16 font-mono text-lg font-semibold tabular-nums text-ink-primary outline-none transition-colors focus:border-brand-primary"
                    />
                    <span className="absolute right-3.5 top-3.5 font-mono text-xs text-ink-tertiary">
                      {basket.symbol}
                    </span>
                  </div>
                </div>

                {balanceError && (
                  <p className="text-xs leading-5 text-amber-300">{balanceError}</p>
                )}

                <div className="border-y border-border py-4">
                  {!redeemShares || redeemShares <= 0 ? (
                    <p className="text-sm leading-6 text-ink-secondary">
                      Enter the number of {basket.symbol} shares you want to redeem to underlying assets, or use Max.
                      We’ll show the exact current vault assets before you sign.
                    </p>
                  ) : redeemQuoteLoading ? (
                    <p className="text-sm text-ink-secondary">Calculating from the live vault…</p>
                  ) : redeemQuoteError ? (
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-6 text-semantic-negative">
                        {redeemQuoteError}
                      </p>
                      <button
                        onClick={() => setRedeemQuoteRefreshNonce((value) => value + 1)}
                        className="shrink-0 text-xs font-semibold text-ink-primary hover:text-brand-primary"
                      >
                        Retry quote
                      </button>
                    </div>
                  ) : liveRedeemQuote ? (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-tertiary">
                        <span>Current pro-rata vault output</span>
                        <span>
                          {redeemQuoteUpdatedAt
                            ? redeemQuoteStale
                              ? 'Quote expired · refresh required'
                              : `Quoted ${Math.max(0, Math.floor((quoteNow - redeemQuoteUpdatedAt) / 1000))}s ago`
                            : 'Fresh quote'}
                        </span>
                      </div>
                      {redeemQuoteStale && (
                        <p className="mb-3 text-xs leading-5 text-amber-300">
                          This redemption quote is over 20 seconds old. Refresh it before signing.
                        </p>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-ink-secondary">Estimated asset value</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                          ${liveRedeemQuote.expectedUsdcValue.toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium text-ink-secondary">
                          You’ll receive
                        </p>
                        <div className="space-y-2">
                          {liveRedeemQuote.constituentsToReturn.map((item) => (
                            <div
                              key={item.asset.tokenMint}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-ink-secondary">{item.asset.symbol}</span>
                              <span className="font-mono tabular-nums text-ink-primary">
                                {item.tokenAmount.toFixed(6)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-ink-secondary">
                      Waiting for the live vault quote…
                    </p>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (!publicKey) {
                      setWalletModalVisible(true);
                      return;
                    }
                    if (redeemQuoteStale) {
                      setRedeemQuoteRefreshNonce((value) => value + 1);
                      return;
                    }
                    if (liveRedeemQuote) {
                      onExecuteRedeem(basket, liveRedeemQuote);
                    }
                  }}
                  disabled={
                    publicKey
                      ? redeemQuoteLoading ||
                        !liveRedeemQuote ||
                        !redeemShares ||
                        redeemShares <= 0 ||
                        (basketBalance !== null &&
                          redeemShares > basketBalance)
                      : false
                  }
                  className="w-full rounded-lg bg-ink-primary py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {publicKey
                    ? redeemQuoteLoading
                      ? 'Refreshing redemption quote…'
                      : redeemQuoteStale
                      ? 'Refresh quote before redeeming'
                      : redeemShares > 0
                      ? `Redeem ${redeemShares} ${basket.symbol} to assets`
                      : `Enter ${basket.symbol} amount`
                    : 'Connect wallet to redeem assets'}
                </button>

                <p className="text-center text-xs text-ink-tertiary">
                  You receive the underlying constituent tokens, not USDC.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
