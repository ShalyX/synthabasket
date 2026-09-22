'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import {
  ArrowRight,
  ExternalLink,
  Layers,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Navbar } from '../../../components/Navbar';
import { SynthaBasketVaultClient } from '../../../lib/execution/vault_client';
import { BasketDefinition } from '../../../lib/types';

type Holding = {
  basketId: string;
  symbol: string;
  name: string;
  shares: number;
  navUsd: number;
  valueUsd: number;
  change24h: number;
  change24hAvailable: boolean;
  basketMint: string;
  vaultPda: string;
};

export default function PortfolioPage() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPortfolio = useCallback(async () => {
    if (!publicKey) {
      setHoldings([]);
      setLastUpdated(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/baskets', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Basket hydration request failed with HTTP ${response.status}.`);
      }
      const payload = await response.json();
      const hydratedBaskets: BasketDefinition[] = Array.isArray(payload.baskets)
        ? payload.baskets
        : [];
      if (hydratedBaskets.length === 0) {
        throw new Error('Hydrated basket response contained no baskets.');
      }

      const vaultClient = new SynthaBasketVaultClient(connection);
      const results = await Promise.all(
        hydratedBaskets.map(async (basket) => {
          try {
            const executionSymbol = basket.devnetExecutionSymbol || `${basket.symbol}D`;
            const [mint] = vaultClient.getBasketMintPda(executionSymbol);
            const [vaultPda] = vaultClient.getBasketPda(executionSymbol);
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { mint });

            const shares = tokenAccounts.value.reduce((total, account) => {
              const parsed = account.account.data.parsed;
              const amount = Number(parsed?.info?.tokenAmount?.uiAmountString ?? parsed?.info?.tokenAmount?.uiAmount ?? 0);
              return total + (Number.isFinite(amount) ? amount : 0);
            }, 0);

            return {
              basketId: basket.id,
              symbol: basket.symbol,
              name: basket.name,
              shares,
              navUsd: basket.navUsd,
              valueUsd: shares * basket.navUsd,
              change24h: basket.navChange24h,
              change24hAvailable: basket.navChange24hAvailable === true,
              basketMint: mint.toBase58(),
              vaultPda: vaultPda.toBase58(),
            } satisfies Holding;
          } catch {
            return null;
          }
        })
      );

      setHoldings(results.filter((holding): holding is Holding => Boolean(holding && holding.shares > 0)));
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || 'Unable to load basket balances from Solana.');
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  const totalValue = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.valueUsd, 0),
    [holdings]
  );

  const totalShares = useMemo(
    () => holdings.reduce((sum, holding) => sum + holding.shares, 0),
    [holdings]
  );

  return (
    <main className="min-h-screen bg-background pb-16 font-sans text-ink-primary">
      <Navbar network="devnet" />

      <div className="mx-auto max-w-[1600px] space-y-8 px-4 pt-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              <Wallet className="h-3.5 w-3.5" />
              Wallet portfolio
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Your SynthaBasket positions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
              Basket balances are read directly from the connected wallet and valued against the current basket NAV.
            </p>
          </div>

          <button
            onClick={loadPortfolio}
            disabled={!publicKey || loading}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-semibold text-ink-primary transition-colors hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh balances
          </button>
        </div>

        {!publicKey ? (
          <section className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border bg-surface">
            <div className="max-w-md px-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                <Wallet className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-lg font-bold">Connect a wallet to view your portfolio</h2>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                SynthaBasket will read your basket-token balances from Solana Devnet. No portfolio balances are fabricated locally.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">Portfolio value</p>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="mt-2 text-xs text-ink-tertiary">NAV-marked basket positions</p>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">Basket shares</p>
                <p className="mt-3 font-mono text-3xl font-extrabold tabular-nums">
                  {totalShares.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </p>
                <p className="mt-2 text-xs text-ink-tertiary">{holdings.length} active basket position{holdings.length === 1 ? '' : 's'}</p>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">Custody</p>
                <div className="mt-3 flex items-center gap-2 text-lg font-bold text-brand-primary">
                  <ShieldCheck className="h-5 w-5" />
                  Vault-backed
                </div>
                <p className="mt-2 text-xs text-ink-tertiary">
                  {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for balance sync'}
                </p>
              </div>
            </section>

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <section className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold">Positions</h2>
                  <p className="mt-1 text-xs text-ink-tertiary">Connected wallet basket balances</p>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-tertiary">
                  {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-6)}
                </span>
              </div>

              {loading ? (
                <div className="flex min-h-56 items-center justify-center text-sm text-ink-secondary">
                  Reading basket balances from Solana…
                </div>
              ) : holdings.length === 0 ? (
                <div className="flex min-h-64 items-center justify-center px-6">
                  <div className="max-w-md text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface-elevated text-brand-primary">
                      <Layers className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-base font-bold">No SynthaBasket positions found</h3>
                    <p className="mt-2 text-sm leading-6 text-ink-secondary">
                      This wallet does not currently hold any of the registered basket mints on the connected cluster.
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
                  <table className="w-full min-w-[820px] text-left">
                    <thead>
                      <tr className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary">
                        <th className="px-5 py-3">Basket</th>
                        <th className="px-5 py-3 text-right">Shares</th>
                        <th className="px-5 py-3 text-right">NAV</th>
                        <th className="px-5 py-3 text-right">Position value</th>
                        <th className="px-5 py-3 text-right">24h</th>
                        <th className="px-5 py-3 text-right">Mint</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {holdings.map((holding) => (
                        <tr key={holding.basketId} className="transition-colors hover:bg-surface-elevated/40">
                          <td className="px-5 py-4">
                            <div className="font-bold text-ink-primary">{holding.name}</div>
                            <div className="mt-1 font-mono text-[10px] text-brand-primary">${holding.symbol}</div>
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            {holding.shares.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs tabular-nums">
                            ${holding.navUsd.toFixed(2)}
                          </td>
                          <td className="px-5 py-4 text-right font-mono text-xs font-bold tabular-nums">
                            ${holding.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className={`px-5 py-4 text-right font-mono text-xs font-bold tabular-nums ${holding.change24hAvailable ? (holding.change24h >= 0 ? 'text-brand-primary' : 'text-red-400') : 'text-ink-tertiary'}`}>
                            {holding.change24hAvailable
                              ? `${holding.change24h >= 0 ? '+' : ''}${holding.change24h.toFixed(2)}%`
                              : '—'}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <a
                              href={`https://explorer.solana.com/address/${holding.basketMint}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-secondary hover:text-brand-primary"
                            >
                              {holding.basketMint.slice(0, 5)}...{holding.basketMint.slice(-4)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
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
