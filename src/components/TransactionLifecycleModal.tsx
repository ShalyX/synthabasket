'use client';

import React from 'react';
import { CheckCircle2, Loader2, AlertCircle, ExternalLink, X, ShieldCheck, Clock3 } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 font-sans">
      <div className="relative w-full max-w-lg rounded border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Header with Signature Basket Composition Bar Motif */}
        <div className="border-b border-border bg-surface-subtle px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-brand-primary animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
                {state.title}
              </h3>
            </div>
            {(state.isCompleted || state.hasError || state.hasPendingConfirmation) && (
              <button
                onClick={onClose}
                className="rounded p-1 text-ink-tertiary hover:bg-surface-elevated hover:text-ink-primary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Signature Basket Composition Bar */}
          <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded bg-surface-elevated">
            <div className="h-full w-2/5 bg-brand-primary" />
            <div className="h-full w-1/4 bg-blue-500" />
            <div className="h-full w-1/5 bg-purple-500" />
            <div className="h-full w-[15%] bg-amber-500" />
          </div>
        </div>

        {/* Steps List */}
        <div className="p-6 space-y-3 font-mono text-xs">
          {state.steps.map((step, idx) => {
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';
            const isFailed = step.status === 'failed';
            const isSubmitted = step.status === 'submitted';
            const isPending = step.status === 'pending';

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 rounded border p-3.5 transition-colors ${
                  isActive
                    ? 'border-brand-primary/50 bg-brand-primary/5'
                    : isCompleted
                    ? 'border-border-subtle bg-surface-subtle'
                    : isFailed
                    ? 'border-semantic-negative/50 bg-semantic-negative/5'
                    : isSubmitted
                    ? 'border-amber-400/40 bg-amber-400/5'
                    : 'border-border-subtle/50 bg-surface-subtle/30 opacity-40'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted && <CheckCircle2 className="h-4 w-4 text-brand-primary" />}
                  {isActive && <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />}
                  {isFailed && <AlertCircle className="h-4 w-4 text-semantic-negative" />}
                  {isSubmitted && <Clock3 className="h-4 w-4 text-amber-400" />}
                  {isPending && (
                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] text-ink-tertiary">
                      {idx + 1}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-semibold ${
                        isActive
                          ? 'text-brand-primary'
                          : isCompleted
                          ? 'text-ink-primary'
                          : isFailed
                          ? 'text-semantic-negative'
                          : isSubmitted
                          ? 'text-amber-300'
                          : 'text-ink-tertiary'
                      }`}
                    >
                      {step.label}
                    </span>
                    {step.txSignature && !step.txSignatures?.length && (
                      <a
                        href={`https://explorer.solana.com/tx/${step.txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-brand-primary hover:underline shrink-0"
                      >
                        Solana Explorer <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-secondary leading-relaxed font-sans">{step.description}</p>
                  {step.txSignatures && step.txSignatures.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-sans">
                      {step.txSignatures.map((signature, signatureIndex) => (
                        <a
                          key={signature}
                          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-primary hover:underline"
                        >
                          Tx {signatureIndex + 1} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                  {step.statusMessage && (
                    <p className="mt-1.5 rounded bg-amber-400/10 p-2 text-[11px] text-amber-300 border border-amber-400/20 font-sans">
                      {step.statusMessage}
                    </p>
                  )}
                  {step.error && (
                    <p className="mt-1.5 rounded bg-semantic-negative/10 p-2 text-[11px] text-semantic-negative border border-semantic-negative/30 font-mono">
                      {step.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {state.hasPendingConfirmation && (
          <div className="border-t border-border p-6 space-y-3 font-sans">
            <div className="rounded border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-300 flex items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0" />
              <span>The transaction was submitted, but its final status is not known yet. Check the linked signature before retrying.</span>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded border border-border bg-surface-subtle py-2.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary"
            >
              Close
            </button>
          </div>
        )}

        {/* Completion Receipt */}
        {state.isCompleted && (
          <div className="border-t border-border p-6 space-y-3 font-sans">
            <div className="rounded border border-brand-primary/30 bg-brand-primary/10 p-3 text-xs text-brand-primary flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                {state.actionType === 'redeem'
                  ? 'Redemption finalized on Solana Devnet. Proportional constituent assets were released from vault custody.'
                  : 'Transaction finalized on Solana Devnet. Assets secured in Vault PDA custody.'}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded border border-border bg-brand-primary py-2.5 text-xs font-bold uppercase tracking-wider text-black transition-opacity hover:opacity-95"
            >
              Acknowledge &amp; Close
            </button>
          </div>
        )}

        {/* Error / Retry State */}
        {state.hasError && (
          <div className="border-t border-border p-6 flex gap-3 font-sans">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex-1 rounded border border-border bg-semantic-negative py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-95"
              >
                Retry Transaction
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded border border-border bg-surface-subtle px-4 py-2.5 text-xs text-ink-secondary hover:border-border-strong hover:text-ink-primary transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
