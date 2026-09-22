'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';

interface ProtocolProofModalProps {
  onClose: () => void;
}

export const ProtocolProofModal: React.FC<ProtocolProofModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 font-sans">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-brand-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-primary">
                Protocol Proof &amp; Verification
              </h2>
              <p className="text-xs text-ink-secondary">
                Execution evidence is shown only when the claimed operation itself confirmed on-chain.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-ink-tertiary transition-colors hover:bg-surface-elevated hover:text-ink-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto p-6">
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-ink-primary">
                    Devnet receipts are being re-verified
                  </h3>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    PROOF PENDING
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-ink-secondary">
                  An execution audit found that the previous public receipt set used setup/self-transfer
                  signatures while the actual Anchor deposit and redemption instructions were only simulated.
                  Those signatures have been retired as protocol execution proof.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface-subtle p-4">
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
                Replacement proof standard
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Underlying acquisition', 'The actual USDC → constituent acquisition transaction must confirm.'],
                ['Vault deposit & mint', 'The actual Anchor deposit_and_mint transaction must confirm.'],
                ['Burn & redemption', 'The actual Anchor burn_and_redeem transaction must confirm.'],
                ['No proxy receipts', 'Simulations, route estimates, setup transfers and self-transfers never count as execution proof.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg bg-surface p-3">
                  <div className="text-xs font-semibold text-ink-primary">{title}</div>
                  <p className="mt-1 text-[11px] leading-5 text-ink-secondary">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface-subtle p-4">
            <div className="mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4 text-brand-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
                On-chain solvency invariant
              </h3>
            </div>
            <div className="rounded-lg bg-surface p-3 text-center font-mono text-sm font-bold text-ink-primary">
              S_mint ≤ S_total × min_i (ΔA_i / A_i)
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ink-secondary">
              The repaired Anchor program also validates that every dynamic token account uses the configured
              constituent mint and that vault token accounts are controlled by the basket PDA before any
              constituent transfer is accepted.
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Anchor Program</div>
              <div className="mt-2 break-all font-mono text-[11px] font-semibold text-ink-primary">
                BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Execution</div>
              <div className="mt-2 text-xs font-semibold text-ink-primary">
                Jupiter V2 on supported mainnet routes
              </div>
              <div className="mt-1 text-[11px] text-ink-secondary">
                Explicit USDC-backed mirror adapter on Devnet
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Market data</div>
              <div className="mt-2 text-xs font-semibold text-ink-primary">
                PreStocks + Tessera + authenticated Pyth
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-tertiary">Liquidity integration</div>
              <div className="mt-2 text-xs font-semibold text-ink-primary">
                Meteora DBC configuration path
              </div>
              <div className="mt-1 text-[11px] text-ink-secondary">
                No pool is labeled active until its deployment transaction is verified.
              </div>
            </div>
          </section>

          <a
            href="https://github.com/ShalyX/synthabasket/blob/main/DEMO_RUN_RECEIPTS.md"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 transition-colors hover:border-brand-primary"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-brand-primary" />
              <div>
                <div className="text-xs font-semibold text-ink-primary">Execution proof log</div>
                <div className="mt-0.5 text-[11px] text-ink-tertiary">
                  Review the retired receipts and replacement proof requirements.
                </div>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-ink-tertiary" />
          </a>
        </div>

        <div className="flex justify-end border-t border-border bg-surface px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-elevated px-5 py-2 text-xs font-semibold text-ink-primary transition-colors hover:text-brand-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
