import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BasketDefinition } from '../../../lib/types';
import { SynthaBasketVaultClient } from '../../../lib/execution/vault_client';
import { getDevnetConnection } from '../../../lib/server/devnet_connection';
import { getBasketSnapshot } from '../../../lib/server/basket_snapshot';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type WalletMintBalance = {
  rawAmount: bigint;
  decimals: number;
  accountCount: number;
};

function aggregateWalletTokenBalances(
  tokenAccounts: Awaited<ReturnType<Connection['getParsedTokenAccountsByOwner']>>
): Map<string, WalletMintBalance> {
  const balances = new Map<string, WalletMintBalance>();

  for (const item of tokenAccounts.value) {
    const parsed = item.account.data as any;
    const info = parsed?.parsed?.info;
    const mint = String(info?.mint || '');
    const tokenAmount = info?.tokenAmount;

    if (!mint || !tokenAmount?.amount) continue;

    let rawAmount: bigint;
    try {
      rawAmount = BigInt(String(tokenAmount.amount));
    } catch {
      continue;
    }

    const decimals = Number(tokenAmount.decimals);
    if (!Number.isInteger(decimals) || decimals < 0) continue;

    const existing = balances.get(mint);
    if (!existing) {
      balances.set(mint, {
        rawAmount,
        decimals,
        accountCount: 1,
      });
      continue;
    }

    balances.set(mint, {
      rawAmount: existing.rawAmount + rawAmount,
      decimals: existing.decimals,
      accountCount: existing.accountCount + 1,
    });
  }

  return balances;
}

export async function GET(request: NextRequest) {
  try {
    const ownerParam = request.nextUrl.searchParams.get('owner');
    if (!ownerParam) {
      return NextResponse.json({ error: 'owner is required' }, { status: 400 });
    }

    let owner: PublicKey;
    try {
      owner = new PublicKey(ownerParam);
    } catch {
      return NextResponse.json(
        { error: 'owner is not a valid Solana address' },
        { status: 400 }
      );
    }

    const connection = getDevnetConnection();
    // Portfolio ownership is scanned from the wallet every 30s, while
    // wallet-independent vault state can safely be reused for up to 60s.
    // This avoids re-reading every basket reserve on every portfolio tick.
    const snapshot = await getBasketSnapshot({ maxAgeMs: 60_000 });
    const {
      definitions,
      customDefinitions,
      baskets: hydratedBaskets,
      customRegistryStatus,
    } = snapshot;
    const hydratedById = new Map(
      hydratedBaskets.map((basket) => [basket.id, basket])
    );

    // Ownership discovery is deliberately independent from basket hydration.
    // One wallet scan covers every SPL Token Program account owned by the
    // connected address, so a temporary NAV/vault hydration failure cannot
    // make a real basket balance disappear.
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_PROGRAM_ID },
      'confirmed'
    );
    const walletBalances = aggregateWalletTokenBalances(tokenAccounts);
    const vaultClient = new SynthaBasketVaultClient(connection);

    // A wallet balance can become visible before the shared basket snapshot
    // refreshes after settlement. Freshen only owned baskets that would
    // otherwise render as unpriced; do not rehydrate the whole registry.
    const ownedUnpricedDefinitions = definitions.filter((definition) => {
      const executionSymbol =
        definition.devnetExecutionSymbol || definition.symbol + 'D';
      const [executionMint] =
        vaultClient.getBasketMintPda(executionSymbol);
      const walletBalance = walletBalances.get(
        executionMint.toBase58()
      );
      if (!walletBalance || walletBalance.rawAmount <= 0n) return false;

      const hydrated =
        hydratedById.get(definition.id) || definition;
      return !(
        hydrated.onChainStateLoaded === true &&
        hydrated.navSource === 'onchain_reserves' &&
        Number.isFinite(hydrated.navUsd)
      );
    });

    if (ownedUnpricedDefinitions.length > 0) {
      const refreshedOwned = await hydrateBaskets(
        connection,
        ownedUnpricedDefinitions,
        snapshot.assets,
        true
      );
      for (const refreshed of refreshedOwned) {
        hydratedById.set(refreshed.id, refreshed);
      }
    }

    const customIds = new Set(customDefinitions.map((basket) => basket.id));

    const positions = definitions
      .map((definition) => {
        const hydrated = hydratedById.get(definition.id) || definition;
        const executionSymbol =
          definition.devnetExecutionSymbol || definition.symbol + 'D';
        const [executionMint] = vaultClient.getBasketMintPda(executionSymbol);
        const [executionVault] = vaultClient.getBasketPda(executionSymbol);
        const executionMintAddress = executionMint.toBase58();
        const walletBalance = walletBalances.get(executionMintAddress);

        const shares = walletBalance
          ? Number(walletBalance.rawAmount) / 10 ** walletBalance.decimals
          : 0;

        const valuationAvailable =
          hydrated.onChainStateLoaded === true &&
          hydrated.navSource === 'onchain_reserves' &&
          Number.isFinite(hydrated.navUsd);

        const navUsd = valuationAvailable ? hydrated.navUsd : null;
        const valueUsd =
          navUsd === null ? null : Number((shares * navUsd).toFixed(2));

        const constituentUpdateTimes = hydrated.constituents
          .map((constituent) => Number(constituent.asset.lastUpdated || 0))
          .filter((timestamp) => timestamp > 0);

        const marketDataUpdatedAt =
          constituentUpdateTimes.length > 0
            ? Math.min(...constituentUpdateTimes)
            : null;

        return {
          basketId: definition.id,
          symbol: definition.symbol,
          name: definition.name,
          category: definition.category,
          shares,
          rawShares: walletBalance?.rawAmount.toString() || '0',
          decimals: walletBalance?.decimals ?? 6,
          tokenAccountCount: walletBalance?.accountCount ?? 0,
          navUsd,
          valueUsd,
          valuationAvailable,
          navSource: valuationAvailable ? 'onchain_reserves' : 'unavailable',
          marketDataSource: hydrated.marketDataSource || 'snapshot',
          marketDataUpdatedAt,
          change24h: valuationAvailable ? hydrated.navChange24h : 0,
          change24hAvailable:
            valuationAvailable && hydrated.navChange24hAvailable === true,
          basketMint: executionMintAddress,
          vaultPda: executionVault.toBase58(),
          onChainStateLoaded: hydrated.onChainStateLoaded === true,
          registrySource: customIds.has(definition.id) ? 'custom' : 'curated',
        };
      })
      .filter((position) => position.shares > 0)
      .sort((left, right) => {
        if (left.valueUsd === null && right.valueUsd === null) {
          return left.symbol.localeCompare(right.symbol);
        }
        if (left.valueUsd === null) return 1;
        if (right.valueUsd === null) return -1;
        return right.valueUsd - left.valueUsd;
      });

    return NextResponse.json(
      {
        owner: owner.toBase58(),
        network: 'devnet',
        generatedAt: Date.now(),
        trackedBasketCount: definitions.length,
        scannedTokenAccountCount: tokenAccounts.value.length,
        customRegistryStatus,
        positions,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.error('[Portfolio API]', error);
    return NextResponse.json(
      { error: error?.message || 'Unable to load portfolio.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
