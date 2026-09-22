import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { INITIAL_BASKETS } from '../../../lib/data/registry';
import { getUnifiedAssetQuotes } from '../../../lib/services/valuation_engine';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
      return NextResponse.json({ error: 'owner is not a valid Solana address' }, { status: 400 });
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );

    const assets = await getUnifiedAssetQuotes('multi');
    const baskets = await hydrateBaskets(connection, INITIAL_BASKETS, assets, true);

    const positions = await Promise.all(
      baskets.map(async (basket) => {
        const mint = new PublicKey(basket.basketMint);
        const ata = getAssociatedTokenAddressSync(mint, owner);
        const balance = await connection
          .getTokenAccountBalance(ata, 'confirmed')
          .catch(() => null);

        const shares = balance ? Number(balance.value.uiAmountString || '0') : 0;

        return {
          basketId: basket.id,
          symbol: basket.symbol,
          name: basket.name,
          shares,
          rawShares: balance?.value.amount || '0',
          decimals: balance?.value.decimals ?? 6,
          navUsd: basket.navUsd,
          valueUsd: shares * basket.navUsd,
          change24h: basket.navChange24h,
          change24hAvailable: basket.navChange24hAvailable === true,
          basketMint: basket.basketMint,
          basketAta: ata.toBase58(),
          vaultPda: basket.vaultPda,
          accountExists: Boolean(balance),
        };
      })
    );

    return NextResponse.json(
      {
        owner: owner.toBase58(),
        network: 'devnet',
        generatedAt: Date.now(),
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
