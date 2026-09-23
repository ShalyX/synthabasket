'use client';

import React from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  X,
  Clock3,
} from 'lucide-react';
import { TxLifecycleState } from '../lib/types';

interface TransactionLifecycleModalProps {
  state: TxLifecycleState;
  onClose: () => void;
  onRetry?: () => void;
}

export const TransactionLifecycleModal: React.FC<TransactionLifecycleModalProps> = ({
  state,
  onClose,
  onRetry,
}) => {
  if (!state.isOpen) return null;

  const redemptionClosed =
    state.actionType === 'redeem' &&
    (state.receipt?.positionClosed === true ||
      (typeof state.receipt?.resultingShareBalance === 'number' &&
        state.receipt.resultingShareBalance <= 0.000001));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-4">
      <div className="relative h-[100dvh] max-h-[100dvh] w-full max-w-lg overflow-y-auto overscroll-contain bg-surface shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl sm:border sm:border-border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-5 py-4">
          <h3 className="text-sm font-semibold text-ink-primary">{state.title}</h3>
          {(state.isCompleted || state.hasError || state.hasPendingConfirmation) && (
            <button
              onClick={onClose}
              aria-label="Close transaction"
              className="rounded-md p-1.5 text-ink-tertiary transition-colors hover:bg-surface-elevated hover:text-ink-primary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="px-5 py-3">
          {state.steps.map((step, idx) => {
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';
            const isFailed = step.status === 'failed';
            const isSubmitted = step.status === 'submitted';

            return (
              <div
                key={step.id}
                className={`grid grid-cols-[20px_minmax(0,1fr)] gap-3 border-b border-border/70 py-4 last:border-b-0 ${
                  step.status === 'pending' ? 'opacity-40' : ''
                }`}
              >
                <div className="pt-0.5">
                  {isCompleted && <CheckCircle2 className="h-4 w-4 text-brand-primary" />}
                  {isActive && <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />}
                  {isFailed && <AlertCircle className="h-4 w-4 text-semantic-negative" />}
                  {isSubmitted && <Clock3 className="h-4 w-4 text-amber-400" />}
                  {step.status === 'pending' && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px] text-ink-tertiary">
                      {idx + 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`text-sm font-medium ${
                        isFailed
                          ? 'text-semantic-negative'
                          : isActive || isSubmitted
                          ? 'text-ink-primary'
                          : 'text-ink-secondary'
                      }`}
                    >
                      {step.label}
                    </span>

                    {step.txSignature && !step.txSignatures?.length && (
                      <a
                        href={`https://explorer.solana.com/tx/${step.txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[11px] text-brand-primary hover:underline"
                      >
                        View tx <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {(isActive || isSubmitted || isFailed) && step.description && (
                    <p className="mt-1 text-xs leading-5 text-ink-tertiary">{step.description}</p>
                  )}

                  {step.txSignatures && step.txSignatures.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {step.txSignatures.map((signature, signatureIndex) => (
                        <a
                          key={signature}
                          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-brand-primary hover:underline"
                        >
                          Tx {signatureIndex + 1} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}

                  {step.statusMessage && (
                    <p className="mt-2 break-words text-xs leading-5 text-amber-300">{step.statusMessage}</p>
                  )}

                  {step.error && (
                    <div className="mt-2 rounded-lg border border-semantic-negative/20 bg-semantic-negative/5 p-3">
                      <p className="break-words text-xs font-medium leading-5 text-semantic-negative">
                        {step.error}
                      </p>
                      {step.recoveryAction && (
                        <p className="mt-2 text-xs leading-5 text-ink-secondary">
                          <span className="font-semibold text-ink-primary">What to do:</span>{' '}
                          {step.recoveryAction}
                        </p>
                      )}
                      {step.technicalError && (
                        <details className="mt-2 text-[11px] text-ink-tertiary">
                          <summary className="cursor-pointer select-none hover:text-ink-secondary">
                            Technical details
                          </summary>
                          <p className="mt-2 break-words rounded border border-border bg-background/60 p-2 font-mono leading-5">
                            {step.technicalError}
                          </p>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {state.hasPendingConfirmation && (
          <div className="border-t border-border px-5 py-4">
            <p className="text-xs leading-5 text-amber-300">
              This transaction was submitted, but Solana has not returned a definitive status yet.
              Check the signature before trying again; do not resubmit while its status is unknown.
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-lg border border-border py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary"
            >
              Close
            </button>
          </div>
        )}

        {state.isCompleted && (
          <div className="border-t border-border px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div>
              <p className="text-base font-semibold text-ink-primary">
                {state.actionType === 'redeem'
                  ? redemptionClosed
                    ? 'Redemption complete — position closed'
                    : 'Redemption complete — assets delivered'
                  : 'Investment complete'}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-secondary">
                {state.actionType === 'redeem'
                  ? redemptionClosed
                    ? 'Your basket shares were fully burned. The returned constituent assets now sit in your wallet and this basket moves to closed-position history.'
                    : 'Your redeemed constituent assets are now in your wallet. The remaining basket shares stay active in your portfolio.'
                  : 'Your underlying assets are in the basket vault and your new shares are in your wallet.'}
              </p>
            </div>

            {state.receipt && (
              <div className="mt-4 border-y border-border py-4 text-sm">
                {typeof state.receipt.spentUsdc === 'number' && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-ink-secondary">USDC spent this attempt</span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      {state.receipt.spentUsdc.toFixed(6)} USDC
                    </span>
                  </div>
                )}

                {typeof state.receipt.sharesReceived === 'number' && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-ink-secondary">Shares received</span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      +{state.receipt.sharesReceived.toFixed(6)}{state.receipt.basketSymbol ? ` ${state.receipt.basketSymbol}` : ''}
                    </span>
                  </div>
                )}

                {typeof state.receipt.sharesBurned === 'number' && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-ink-secondary">Shares burned</span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      -{state.receipt.sharesBurned.toFixed(6)}{state.receipt.basketSymbol ? ` ${state.receipt.basketSymbol}` : ''}
                    </span>
                  </div>
                )}

                {typeof state.receipt.redemptionValueUsd === 'number' && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-ink-secondary">Marked value returned</span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      {'$'}{state.receipt.redemptionValueUsd.toFixed(2)}
                    </span>
                  </div>
                )}

                {state.receipt.assetsDeposited &&
                  state.receipt.assetsDeposited.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-2 text-xs text-ink-tertiary">Deposited to vault</p>
                      {state.receipt.assetsDeposited.map((asset) => (
                        <div
                          key={asset.symbol}
                          className="flex items-center justify-between py-1"
                        >
                          <span className="text-ink-secondary">{asset.symbol}</span>
                          <span className="font-mono tabular-nums text-ink-primary">
                            {asset.amount.toFixed(6)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                {state.receipt.assetsReturned &&
                  state.receipt.assetsReturned.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-2 text-xs text-ink-tertiary">Returned to wallet</p>
                      {state.receipt.assetsReturned.map((asset) => (
                        <div
                          key={asset.mint || asset.symbol}
                          className="flex items-center justify-between gap-4 py-1"
                        >
                          <span className="text-ink-secondary">{asset.symbol}</span>
                          <div className="text-right">
                            <div className="font-mono tabular-nums text-ink-primary">
                              +{asset.amount.toFixed(6)}
                            </div>
                            {typeof asset.valueUsd === 'number' && (
                              <div className="mt-0.5 font-mono text-[10px] tabular-nums text-ink-tertiary">
                                {'$'}{asset.valueUsd.toFixed(2)} at redemption
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {typeof state.receipt.resultingShareBalance === 'number' && (
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-ink-secondary">
                      {redemptionClosed ? 'Position status' : 'Remaining shares'}
                    </span>
                    <span className="font-mono tabular-nums text-ink-primary">
                      {redemptionClosed
                        ? 'Closed'
                        : state.receipt.resultingShareBalance.toFixed(6) +
                          (state.receipt.basketSymbol
                            ? ` ${state.receipt.basketSymbol}`
                            : '')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {state.finalSignature && (
              <a
                href={`https://explorer.solana.com/tx/${state.finalSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
              >
                View transaction <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            {state.actionType === 'mint' || state.actionType === 'redeem' ? (
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <a
                  href="/app/portfolio"
                  className="flex-1 rounded-lg bg-brand-primary py-2.5 text-center text-sm font-semibold text-black transition-opacity hover:opacity-95"
                >
                  View portfolio
                </a>
                <button
                  onClick={onClose}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:text-ink-primary"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                onClick={onClose}
                className="mt-5 w-full rounded-lg bg-brand-primary py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-95"
              >
                Done
              </button>
            )}
          </div>
        )}

        {state.hasError && (
          <div className="grid grid-cols-1 gap-2 border-t border-border px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-[1fr_auto]">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 rounded-lg bg-ink-primary py-2.5 text-sm font-semibold text-background"
              >
                Try again
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-ink-secondary transition-colors hover:text-ink-primary"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
