'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  X,
} from 'lucide-react';
import { AccountActivity } from '../lib/activity';
import { SynthaBasketVaultClient } from '../lib/execution/vault_client';
import { ActivityNotification } from '../lib/client/activity';

interface AccountActivityCenterProps {
  network?: string;
}

const DEVNET_USDC_MINT = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function formatUsd(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAge(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function activityTitle(activity: AccountActivity): string {
  if (activity.type === 'redeem') return `Redeemed ${activity.basketSymbol}`;
  if (activity.type === 'create_basket') return `Created ${activity.basketSymbol}`;
  return `Invested in ${activity.basketSymbol}`;
}

function activityDetail(activity: AccountActivity): string {
  if (activity.type === 'create_basket') return activity.basketName;
  const shares = Math.abs(Number(activity.sharesDelta || 0));
  const shareText =
    shares > 0 ? `${shares.toFixed(6)} ${activity.basketSymbol}` : '';

  if (activity.type === 'redeem') {
    const assetCount = activity.assets?.length || 0;
    const assetText =
      assetCount > 0
        ? `${assetCount} asset${assetCount === 1 ? '' : 's'} returned`
        : 'underlying assets returned';
    const closed =
      activity.positionClosed === true ||
      (typeof activity.resultingShareBalance === 'number' &&
        activity.resultingShareBalance <= 0.000001);
    return `${shareText ? shareText + ' burned · ' : ''}${assetText}${
      closed ? ' · position closed' : ''
    }`;
  }

  if (typeof activity.amountUsd === 'number') {
    return `$${formatUsd(activity.amountUsd)} · ${shareText}`;
  }
  return shareText || activity.basketName;
}

export function AccountActivityCenter({
  network = 'devnet',
}: AccountActivityCenterProps) {
  const { connection } = useConnection();
  const { publicKey, disconnect } = useWallet();
  const owner = publicKey?.toBase58() || null;

  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [activities, setActivities] = useState<AccountActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [positionCount, setPositionCount] = useState(0);
  const [unpricedCount, setUnpricedCount] = useState(0);
  const [storageStatus, setStorageStatus] = useState<
    'loaded' | 'not_configured' | 'unavailable'
  >('loaded');
  const [lastSeenAt, setLastSeenAt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<ActivityNotification | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!owner) {
      setActivities([]);
      setUsdcBalance(null);
      setPortfolioValue(null);
      setPositionCount(0);
      setUnpricedCount(0);
      setLastSeenAt(0);
      setOpen(false);
      return;
    }

    const saved = window.localStorage.getItem(
      `synthabasket:activity-seen:${owner}`
    );
    setLastSeenAt(Number(saved) || 0);
  }, [owner]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const refresh = useCallback(async () => {
    if (!publicKey || !owner) return;
    setLoading(true);

    try {
      const vaultClient = new SynthaBasketVaultClient(connection);
      const [activityResponse, portfolioResponse, usdc] = await Promise.all([
        fetch(`/api/activity?owner=${encodeURIComponent(owner)}`, {
          cache: 'no-store',
        }),
        fetch(`/api/portfolio?owner=${encodeURIComponent(owner)}`, {
          cache: 'no-store',
        }),
        vaultClient
          .getUserTokenBalance(publicKey, DEVNET_USDC_MINT)
          .catch(() => null),
      ]);

      const activityPayload = await activityResponse.json().catch(() => ({}));
      const portfolioPayload = await portfolioResponse.json().catch(() => ({}));

      if (activityResponse.ok && Array.isArray(activityPayload.activities)) {
        setActivities(activityPayload.activities);
        setStorageStatus(
          activityPayload.storageStatus === 'not_configured'
            ? 'not_configured'
            : 'loaded'
        );
      } else {
        setStorageStatus('unavailable');
      }

      if (portfolioResponse.ok && Array.isArray(portfolioPayload.positions)) {
        const positions = portfolioPayload.positions;
        const valued = positions.filter(
          (position: any) =>
            position.valueUsd !== null &&
            Number.isFinite(Number(position.valueUsd))
        );
        setPortfolioValue(
          valued.reduce(
            (sum: number, position: any) => sum + Number(position.valueUsd || 0),
            0
          )
        );
        setPositionCount(positions.length);
        setUnpricedCount(positions.length - valued.length);
      }

      setUsdcBalance(usdc);
    } finally {
      setLoading(false);
    }
  }, [connection, owner, publicKey]);

  useEffect(() => {
    if (owner) void refresh();
  }, [owner, refresh]);

  useEffect(() => {
    const handleRecorded = () => {
      void refresh();
    };
    const handleNotification = (event: Event) => {
      const detail = (event as CustomEvent<ActivityNotification>).detail;
      if (!detail) return;
      setToast(detail);
      window.setTimeout(() => setToast(null), 4200);
    };

    window.addEventListener('synthabasket:activity-recorded', handleRecorded);
    window.addEventListener('synthabasket:notification', handleNotification);
    return () => {
      window.removeEventListener(
        'synthabasket:activity-recorded',
        handleRecorded
      );
      window.removeEventListener(
        'synthabasket:notification',
        handleNotification
      );
    };
  }, [refresh]);

  const unreadCount = useMemo(
    () => activities.filter((activity) => activity.timestamp > lastSeenAt).length,
    [activities, lastSeenAt]
  );

  const openPanel = () => {
    setOpen(true);
    const newest = activities[0]?.timestamp || Date.now();
    if (owner) {
      window.localStorage.setItem(
        `synthabasket:activity-seen:${owner}`,
        String(newest)
      );
      setLastSeenAt(newest);
    }
    void refresh();
  };

  const handleCopy = async () => {
    if (!owner) return;
    await navigator.clipboard.writeText(owner);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  if (!owner) return null;

  const portalContent =
    portalReady &&
    createPortal(
      <>
        {toast && (
          <div className="fixed right-4 top-20 z-[110] w-[calc(100vw-2rem)] max-w-sm rounded-xl border border-border bg-surface p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div
                className={
                  'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ' +
                  (toast.kind === 'error'
                    ? 'bg-semantic-negative'
                    : 'bg-brand-primary')
                }
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-primary">
                  {toast.title}
                </p>
                {toast.message && (
                  <p className="mt-1 text-xs leading-5 text-ink-secondary">
                    {toast.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {open && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <button
              type="button"
              aria-label="Close account panel"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
            />

            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Account"
              className="relative flex h-[100dvh] w-full max-w-[420px] flex-col border-l border-border bg-surface shadow-2xl"
            >
              <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink-primary">Account</p>
                    <span className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-tertiary">
                      {network}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-tertiary">
                    Wallet, positions and confirmed activity
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-2 text-ink-tertiary transition-colors hover:bg-surface-hover hover:text-ink-primary"
                  aria-label="Close account panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="shrink-0 border-b border-border px-5 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-bold text-ink-primary">
                      {shortAddress(owner)}
                    </p>
                    <p className="mt-1 truncate font-mono text-[10px] text-ink-tertiary">
                      {owner}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopy()}
                      className="rounded-lg border border-border bg-background p-2.5 text-ink-secondary transition-colors hover:border-brand-primary hover:text-brand-primary"
                      aria-label="Copy wallet address"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <a
                      href={`https://explorer.solana.com/address/${owner}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border bg-background p-2.5 text-ink-secondary transition-colors hover:border-brand-primary hover:text-brand-primary"
                      aria-label="Open wallet in Solana Explorer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-background">
                  <div className="px-3 py-3.5">
                    <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                      USDC
                    </p>
                    <p className="mt-1.5 font-mono text-sm font-bold tabular-nums text-ink-primary">
                      {usdcBalance === null ? '—' : usdcBalance.toFixed(2)}
                    </p>
                  </div>
                  <div className="border-x border-border px-3 py-3.5">
                    <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                      Portfolio
                    </p>
                    <p className="mt-1.5 font-mono text-sm font-bold tabular-nums text-ink-primary">
                      {portfolioValue === null
                        ? '—'
                        : `$${formatUsd(portfolioValue)}`}
                    </p>
                  </div>
                  <div className="px-3 py-3.5">
                    <p className="text-[9px] uppercase tracking-wider text-ink-tertiary">
                      Positions
                    </p>
                    <p className="mt-1.5 font-mono text-sm font-bold tabular-nums text-ink-primary">
                      {positionCount}
                    </p>
                  </div>
                </div>

                {unpricedCount > 0 && (
                  <p className="mt-3 text-xs leading-5 text-amber-500">
                    {unpricedCount} position
                    {unpricedCount === 1 ? '' : 's'} currently lack a live vault
                    valuation.
                  </p>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col bg-surface">
                <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-ink-primary">Activity</h2>
                    {activities.length > 0 && (
                      <span className="rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[9px] font-semibold text-ink-tertiary">
                        {activities.length}
                      </span>
                    )}
                  </div>
                  {loading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-tertiary" />
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                  {storageStatus === 'not_configured' && (
                    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-5 text-amber-500">
                      Activity storage is not configured, so account history cannot
                      persist across sessions.
                    </div>
                  )}

                  {storageStatus === 'unavailable' && (
                    <div className="mb-3 rounded-xl border border-border bg-background p-3 text-xs leading-5 text-ink-secondary">
                      Activity is temporarily unavailable. Wallet balances remain
                      on-chain and unaffected.
                    </div>
                  )}

                  {activities.length === 0 && !loading ? (
                    <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-border bg-background px-6 py-8 text-center">
                      <div>
                        <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-subtle">
                          <Bell className="h-4 w-4 text-ink-tertiary" />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-ink-primary">
                          No activity yet
                        </p>
                        <p className="mx-auto mt-1 max-w-[270px] text-xs leading-5 text-ink-tertiary">
                          New confirmed investments, redemptions and basket
                          creations will appear here.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border bg-background">
                      {activities.map((activity, index) => (
                        <div
                          key={activity.id}
                          className={
                            'px-4 py-4 ' +
                            (index > 0 ? 'border-t border-border' : '')
                          }
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink-primary">
                                {activityTitle(activity)}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-ink-secondary">
                                {activityDetail(activity)}
                              </p>

                              {activity.type === 'redeem' &&
                                activity.assets &&
                                activity.assets.length > 0 && (
                                  <div className="mt-2 rounded-lg border border-border bg-surface px-3 py-2">
                                    {activity.assets.map((asset) => (
                                      <div
                                        key={asset.mint || asset.symbol}
                                        className="flex items-center justify-between gap-3 py-0.5 text-[11px]"
                                      >
                                        <span className="text-ink-secondary">
                                          {asset.symbol}
                                        </span>
                                        <span className="font-mono tabular-nums text-ink-primary">
                                          +{asset.amount.toFixed(6)}
                                          {typeof asset.valueUsd === 'number'
                                            ? ' · $' + formatUsd(asset.valueUsd)
                                            : ''}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                              {activity.type === 'redeem' &&
                                typeof activity.amountUsd === 'number' && (
                                  <p className="mt-2 text-[10px] text-ink-tertiary">
                                    Marked value at redemption · {'$'}
                                    {formatUsd(activity.amountUsd)}
                                    {typeof activity.resultingShareBalance ===
                                    'number'
                                      ? activity.positionClosed
                                        ? ' · Position closed'
                                        : ` · ${activity.resultingShareBalance.toFixed(
                                            6
                                          )} ${activity.basketSymbol} remaining`
                                      : ''}
                                  </p>
                                )}

                              <p className="mt-1 text-[10px] text-ink-tertiary">
                                Confirmed · {formatAge(activity.timestamp)}
                              </p>
                            </div>
                            <a
                              href={`https://explorer.solana.com/tx/${activity.signature}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 shrink-0 rounded-md p-1.5 text-brand-primary transition-colors hover:bg-surface-hover"
                              aria-label="View transaction"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t border-border bg-surface px-5 py-4">
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:border-semantic-negative/40 hover:text-semantic-negative"
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect wallet
                </button>
              </div>
            </aside>
          </div>
        )}
      </>,
      document.body
    );

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="relative inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-ink-primary transition-colors hover:border-brand-primary"
        aria-label="Open account activity"
      >
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">{shortAddress(owner)}</span>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 font-mono text-[9px] font-bold text-black">
            {Math.min(unreadCount, 9)}
            {unreadCount > 9 ? '+' : ''}
          </span>
        )}
      </button>

      {portalContent}
    </>
  );
}
