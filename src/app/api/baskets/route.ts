import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { INITIAL_BASKETS } from '../../../lib/data/registry';
import { getUnifiedAssetQuotes } from '../../../lib/services/valuation_engine';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    const assets = await getUnifiedAssetQuotes('multi');
    const baskets = await hydrateBaskets(
      connection,
      INITIAL_BASKETS,
      assets,
      true
    );

    return NextResponse.json(
      {
        generatedAt: Date.now(),
        network: 'devnet',
        assets,
        baskets,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Unable to hydrate basket data.',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  }
}
