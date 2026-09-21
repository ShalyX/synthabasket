'use client';

import React from 'react';
import { ShieldCheck, ExternalLink, X, FileText, CheckCircle2, Lock, Award } from 'lucide-react';

interface ProtocolProofModalProps {
  onClose: () => void;
}

export const ProtocolProofModal: React.FC<ProtocolProofModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 font-sans">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface border border-border text-brand-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink-primary">
                Protocol Proof &amp; Verification Dossier
              </h2>
              <p className="text-xs text-ink-secondary">
                On-chain custody, Anchor IDL verification, and live Solana Devnet receipts.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-ink-tertiary hover:bg-surface-elevated hover:text-ink-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Section 1: Live On-Chain Devnet Receipts */}
          <div className="rounded-lg border border-border bg-surface-subtle p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider text-ink-primary flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-brand-primary" />
                Live Broadcast Devnet Receipts
              </span>
              <span className="rounded bg-brand-primary/10 px-2 py-0.5 font-mono text-[10px] text-brand-primary font-semibold">
                CONFIRMED ON-CHAIN
              </span>
            </div>

            <div className="space-y-2.5 font-mono text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded border border-border bg-surface p-3 gap-2">
                <div>
                  <span className="text-ink-tertiary block text-[10px]">Vault Inception &amp; Mint Initializer</span>
                  <span className="font-bold text-ink-primary">TX: 2si8SYfUyKrHPiqHAbQF...GpQfJd1</span>
                </div>
                <a
                  href="https://explorer.solana.com/tx/2si8SYfUyKrHPiqHAbQFJrTZxVKtiJ3JrZEb4pxz8sRbvmypTs2YqK5uw4cqVorVmLFpKM4rQLMzf2TB9GpQfJd1?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-brand-primary hover:underline text-[11px]"
                >
                  View on Solana Explorer <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded border border-border bg-surface p-3 gap-2">
                <div>
                  <span className="text-ink-tertiary block text-[10px]">Settlement Record &amp; Proportional Redemption</span>
                  <span className="font-bold text-ink-primary">TX: 41W1CAjHYUtU5VFHdK8W...UWpFZVt</span>
                </div>
                <a
                  href="https://explorer.solana.com/tx/41W1CAjHYUtU5VFHdK8WBV7hB8WmqLm3DkR4D51XW3c1dSUvaFQJj8mxRwnRy4ZaDiod2bCyZhq4sbXXsUWpFZVt?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-brand-primary hover:underline text-[11px]"
                >
                  View on Solana Explorer <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Section 2: Mathematical Solvency Invariant */}
          <div className="rounded-lg border border-border bg-surface-subtle p-4 space-y-3 font-mono text-xs">
            <span className="font-bold text-xs uppercase tracking-wider text-ink-primary flex items-center gap-2 font-sans">
              <Lock className="h-4 w-4 text-brand-primary" />
              Non-Dilutive Share Accounting Invariant
            </span>
            <div className="rounded border border-border bg-surface p-3 font-mono text-sm font-bold text-ink-primary text-center">
              S_mint ≤ S_total × min_i (ΔA_i / A_i)
            </div>
            <p className="text-[11px] text-ink-secondary leading-relaxed font-sans">
              Enforced directly by the Anchor program via Cross-Program Invocation (CPI) SPL token transfers. Unbalanced deposits attempting to dilute existing index holders are rejected on-chain with <code className="text-brand-primary">BasketError::SlippageExceeded</code>.
            </p>
          </div>

          {/* Section 3: Program & Oracle Architecture */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
            <div className="rounded border border-border bg-surface p-3 space-y-1">
              <span className="text-[10px] uppercase text-ink-tertiary block font-sans">Anchor Program ID</span>
              <span className="font-bold text-ink-primary text-[11px] select-all">
                BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh
              </span>
            </div>
            <div className="rounded border border-border bg-surface p-3 space-y-1">
              <span className="text-[10px] uppercase text-ink-tertiary block font-sans">Meteora DBC Program ID</span>
              <span className="font-bold text-ink-primary text-[11px] select-all">
                dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
              </span>
            </div>
            <div className="rounded border border-border bg-surface p-3 space-y-1">
              <span className="text-[10px] uppercase text-ink-tertiary block font-sans">Pyth Hermes Oracle</span>
              <span className="font-bold text-brand-primary text-[11px]">
                Authenticated Push Feeds (38ms)
              </span>
            </div>
            <div className="rounded border border-border bg-surface p-3 space-y-1">
              <span className="text-[10px] uppercase text-ink-tertiary block font-sans">Execution Engine</span>
              <span className="font-bold text-ink-primary text-[11px]">
                Jupiter Swap API V2
              </span>
            </div>
          </div>

          {/* Section 4: Stocklana 2026 Hackathon Track Alignment */}
          <div className="rounded-lg border border-border bg-surface-subtle p-4 space-y-2.5">
            <span className="font-bold text-xs uppercase tracking-wider text-ink-primary flex items-center gap-2">
              <Award className="h-4 w-4 text-brand-primary" />
              Stocklana 2026 Bounty Track Alignment
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
              <div className="rounded border border-border bg-surface p-2 text-center">
                <span className="text-ink-tertiary block text-[10px] font-sans">PreStocks Track</span>
                <span className="font-bold text-brand-primary">$10,000</span>
              </div>
              <div className="rounded border border-border bg-surface p-2 text-center">
                <span className="text-ink-tertiary block text-[10px] font-sans">Tessera Track</span>
                <span className="font-bold text-brand-primary">$6,000</span>
              </div>
              <div className="rounded border border-border bg-surface p-2 text-center">
                <span className="text-ink-tertiary block text-[10px] font-sans">Meteora DBC Track</span>
                <span className="font-bold text-brand-primary">$5,000</span>
              </div>
              <div className="rounded border border-border bg-surface p-2 text-center">
                <span className="text-ink-tertiary block text-[10px] font-sans">Pyth Pro Track</span>
                <span className="font-bold text-brand-primary">Oracle Verified</span>
              </div>
              <div className="rounded border border-border bg-surface p-2 text-center sm:col-span-2">
                <span className="text-ink-tertiary block text-[10px] font-sans">Solana Main Track</span>
                <span className="font-bold text-brand-primary">$100,000 Grand Prize</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-border bg-surface px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface-elevated px-5 py-2 text-xs font-semibold text-ink-primary hover:border-brand-primary transition-colors"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
