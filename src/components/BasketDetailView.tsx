'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BasketDefinition, BasketMintQuote, BasketRedeemQuote } from '../lib/types';
import { calculateMintQuote, calculateRedeemQuote } from '../lib/services/valuation_engine';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getHistoryForRange, NavHistoryPoint } from '../lib/client/nav_history';

interface BasketDetailViewProps {
  basket: BasketDefinition;
  initialTab?: 'mint' | 'redeem' | 'inspect';
  onClose: () => void;
  onExecuteMint: (basket: BasketDefinition, quote: BasketMintQuote) => void;
  onExecuteRedeem: (basket: BasketDefinition, quote: BasketRedeemQuote) => void;
  navHistory?: NavHistoryPoint[];
}

const TIMEFRAMES = [
  { label: '1H', ms: 60 * 60 * 1000 },
  { label: '24H', ms: 24 * 60 * 60 * 1000 },
  { label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

export const BasketDetailView: React.FC<BasketDetailViewProps> = ({
  basket,
  initialTab = 'mint',
  onClose,
  onExecuteMint,
  onExecuteRedeem,
  navHistory = [],
}) => {
  const [activeTab, setActiveTab] = useState<'mint' | 'redeem'>(
    initialTab === 'redeem' ? 'redeem' : 'mint'
  );
  const [usdcAmount, setUsdcAmount] = useState<number>(100);
  const [redeemShares, setRedeemShares] = useState<number>(0.1);
  const [chartTimeframe, setChartTimeframe] =
    useState<(typeof TIMEFRAMES)[number]['label']>('1H');
  const [durableHistory, setDurableHistory] = useState<NavHistoryPoint[]>([]);
  const [durableHistoryEnabled, setDurableHistoryEnabled] = useState(false);

  const mintQuote = calculateMintQuote(basket, usdcAmount || 0);
  const redeemQuote = calculateRedeemQuote(basket, redeemShares || 0);
  const isPositive = basket.navChange24h >= 0;

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
    const merged = new Map<number, NavHistoryPoint>();

    for (const point of durableHistory) merged.set(point.timestamp, point);
    for (const point of navHistory) merged.set(point.timestamp, point);

    return getHistoryForRange(
      [...merged.values()].sort((a, b) => a.timestamp - b.timestamp),
      selectedRange.ms
    ).map((point) => ({
      timestamp: point.timestamp,
      navUsd: point.navUsd,
    }));
  }, [durableHistory, navHistory, selectedRange.ms]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="truncate text-base font-bold text-ink-primary sm:text-lg">
                {basket.name}
              </h2>
              <span className="font-mono text-xs font-semibold text-brand-primary">
                $ {basket.symbol}
              </span>
            </div>
            <span className="text-xs text-ink-tertiary">Solana Devnet</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close basket details"
            className="rounded-md p-1.5 text-ink-tertiary transition-colors hover:bg-surface-elevated hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-7 border-b border-border p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs text-ink-tertiary">NAV</p>
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
            </div>

            <section>
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink-primary">NAV history</h3>
                  <p className="mt-0.5 text-xs text-ink-tertiary">
                    {durableHistoryEnabled
                      ? 'Protocol NAV observations stored server-side.'
                      : 'Real observations from live basket refreshes on this device.'}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs">
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
                  <div className="h-44 w-full">
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
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${getSegmentColor(index)}`} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink-primary">
                          {constituent.asset.symbol}
                        </div>
                        <div className="truncate text-xs text-ink-tertiary">
                          {constituent.asset.name} · {constituent.asset.provider}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                        {constituent.targetWeightBps / 100}%
                      </div>
                      <div className="text-[11px] text-ink-tertiary">weight</div>
                    </div>
                    <div className="w-20 text-right font-mono text-sm tabular-nums text-ink-secondary">
                      $ {constituent.asset.priceUsd.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="border-t border-border pt-4 text-xs text-ink-tertiary">
              Market prices inform NAV. Your transaction verifies the live vault before funds move.
            </div>
          </div>

          <div className="bg-surface-subtle p-5 sm:p-6">
            <div className="flex border-b border-border">
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
                Redeem
              </button>
            </div>

            {activeTab === 'mint' && (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-xs font-medium text-ink-secondary">Amount</label>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
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
                      className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
                    >
                      {amount}
                    </button>
                  ))}
                </div>

                <div className="border-y border-border py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-secondary">Estimated shares</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                      {mintQuote.expectedBasketTokens} {basket.symbol}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-ink-tertiary">
                    <span>Underlying assets</span>
                    <span>{basket.constituents.length}</span>
                  </div>
                </div>

                <button
                  onClick={() => onExecuteMint(basket, mintQuote)}
                  disabled={!usdcAmount || usdcAmount <= 0}
                  className="w-full rounded-lg bg-brand-primary py-3 text-sm font-semibold text-black transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Invest {usdcAmount || 0} USDC
                </button>
              </div>
            )}

            {activeTab === 'redeem' && (
              <div className="mt-6 space-y-5">
                <div>
                  <label className="text-xs font-medium text-ink-secondary">Shares</label>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={redeemShares}
                      onChange={(e) => setRedeemShares(Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-surface px-3.5 py-3 pr-16 font-mono text-lg font-semibold tabular-nums text-ink-primary outline-none transition-colors focus:border-brand-primary"
                    />
                    <span className="absolute right-3.5 top-3.5 font-mono text-xs text-ink-tertiary">
                      {basket.symbol}
                    </span>
                  </div>
                </div>

                <div className="border-y border-border py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-secondary">Estimated value</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                      $ {redeemQuote.expectedUsdcValue.toFixed(2)}
                    </span>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 text-xs font-medium text-ink-secondary">Estimated return</p>
                    <div className="space-y-2">
                      {redeemQuote.constituentsToReturn.map((item) => (
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
                </div>

                <button
                  onClick={() => onExecuteRedeem(basket, redeemQuote)}
                  disabled={!redeemShares || redeemShares <= 0}
                  className="w-full rounded-lg bg-ink-primary py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Redeem {redeemShares || 0} {basket.symbol}
                </button>

                <p className="text-center text-xs text-ink-tertiary">
                  Redemption returns the underlying assets to your wallet, not USDC.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
