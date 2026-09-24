'use client';

import Link from 'next/link';
import { ExternalLink, X } from 'lucide-react';
import {
  AccountActivity,
  PositionHistorySummary,
} from '../lib/activity';

export interface PositionDetailHolding {
  basketId: string;
  symbol: string;
  name: string;
  shares: number;
  navUsd: number | null;
  valueUsd: number | null;
  basketMint: string;
  vaultPda: string;
  history: PositionHistorySummary;
}

interface PositionDetailsModalProps {
  holding: PositionDetailHolding | null;
  activities: AccountActivity[];
  onClose: () => void;
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function signedUsd(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}$${formatUsd(value)}`;
}

function activityLabel(activity: AccountActivity): string {
  if (activity.type === 'redeem') return 'Redeemed to assets';
  if (activity.type === 'create_basket') return 'Created basket';
  return 'Invested';
}

export function PositionDetailsModal({
  holding,
  activities,
  onClose,
}: PositionDetailsModalProps) {
  if (!holding) return null;

  const history = holding.history;
  const basketActivities = activities
    .filter((activity) => activity.basketId === holding.basketId)
    .sort((left, right) => right.timestamp - left.timestamp);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-4">
      <button
        type="button"
        aria-label="Close position details"
        onClick={onClose}
        className="absolute inset-0"
      />
      <section className="relative h-[100dvh] max-h-[100dvh] w-full max-w-2xl overflow-y-auto bg-surface shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:border sm:border-border">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-background px-5 py-4 sm:px-6">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              Position
            </p>
            <h2 className="mt-1 text-xl font-bold text-ink-primary">
              {holding.name}
            </h2>
            <p className="mt-1 font-mono text-xs font-semibold text-ink-secondary">
              {'$'}{holding.symbol}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-tertiary hover:bg-surface hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                Shares
              </p>
              <p className="mt-2 font-mono text-sm font-bold tabular-nums text-ink-primary">
                {holding.shares.toFixed(6)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                Value
              </p>
              <p className="mt-2 font-mono text-sm font-bold tabular-nums text-ink-primary">
                {holding.valueUsd === null
                  ? '—'
                  : `$${formatUsd(holding.valueUsd)}`}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                Cost basis
              </p>
              <p className="mt-2 font-mono text-sm font-bold tabular-nums text-ink-primary">
                {history.historyComplete &&
                history.netCostBasisUsd !== null
                  ? `$${formatUsd(history.netCostBasisUsd)}`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                Avg entry
              </p>
              <p className="mt-2 font-mono text-sm font-bold tabular-nums text-ink-primary">
                {history.historyComplete &&
                history.averageEntryUsd !== null
                  ? `$${formatUsd(history.averageEntryUsd)}`
                  : '—'}
              </p>
            </div>
          </div>

          {history.historyComplete ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Unrealized P&amp;L
                </p>
                <p
                  className={
                    'mt-2 font-mono text-lg font-bold tabular-nums ' +
                    (history.unrealizedPnlUsd === null
                      ? 'text-ink-tertiary'
                      : history.unrealizedPnlUsd >= 0
                      ? 'text-brand-primary'
                      : 'text-semantic-negative')
                  }
                >
                  {history.unrealizedPnlUsd === null
                    ? '—'
                    : signedUsd(history.unrealizedPnlUsd)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                  Realized P&amp;L
                </p>
                <p
                  className={
                    'mt-2 font-mono text-lg font-bold tabular-nums ' +
                    (history.realizedPnlUsd === null
                      ? 'text-ink-tertiary'
                      : history.realizedPnlUsd >= 0
                      ? 'text-brand-primary'
                      : 'text-semantic-negative')
                  }
                >
                  {history.realizedPnlUsd === null
                    ? '—'
                    : signedUsd(history.realizedPnlUsd)}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-amber-300">
                Position history is partial
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-secondary">
                This wallet already held shares before durable activity indexing
                covered the full position, or shares moved outside indexed
                SynthaBasket actions. Cost basis and P&amp;L are withheld rather
                than inferred from the current balance.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Link
              href={`/app?basket=${encodeURIComponent(
                holding.basketId
              )}&action=mint`}
              className="col-span-2 rounded-lg bg-brand-primary px-3 py-2.5 text-center text-xs font-bold text-black sm:col-span-1"
            >
              Invest more
            </Link>
            <Link
              href={`/app?basket=${encodeURIComponent(
                holding.basketId
              )}&action=redeem`}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center text-xs font-semibold text-ink-primary hover:border-brand-primary"
            >
              Redeem assets
            </Link>
            <Link
              href={`/app?basket=${encodeURIComponent(
                holding.basketId
              )}&action=inspect`}
              className="rounded-lg border border-border bg-surface px-3 py-2.5 text-center text-xs font-semibold text-ink-primary hover:border-brand-primary"
            >
              View basket
            </Link>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-primary">History</h3>
              <span className="text-[10px] text-ink-tertiary">
                {basketActivities.length} indexed event
                {basketActivities.length === 1 ? '' : 's'}
              </span>
            </div>

            {basketActivities.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-xs leading-5 text-ink-tertiary">
                No durable activity is indexed for this position yet.
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-surface px-4">
                {basketActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start justify-between gap-4 py-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink-primary">
                        {activityLabel(activity)}
                      </p>
                      <p className="mt-1 font-mono text-xs tabular-nums text-ink-secondary">
                        {activity.type === 'create_basket'
                          ? activity.basketName
                          : `${Math.abs(
                              Number(activity.sharesDelta || 0)
                            ).toFixed(6)} ${activity.basketSymbol}`}
                        {typeof activity.amountUsd === 'number'
                          ? ` · $${formatUsd(activity.amountUsd)}`
                          : ''}
                      </p>
                      <p className="mt-1 text-[10px] text-ink-tertiary">
                        {new Date(activity.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={`https://explorer.solana.com/tx/${activity.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 shrink-0 text-brand-primary"
                      aria-label="View transaction"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
            <a
              href={`https://explorer.solana.com/address/${holding.basketMint}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-ink-secondary hover:text-brand-primary"
            >
              Share mint <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`https://explorer.solana.com/address/${holding.vaultPda}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-ink-secondary hover:text-brand-primary"
            >
              Vault <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
