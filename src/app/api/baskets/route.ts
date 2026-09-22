import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { INITIAL_BASKETS } from '../../../lib/data/registry';
import { getUnifiedAssetQuotes } from '../../../lib/services/valuation_engine';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';
import {
  durableNavHistoryConfigured,
  recordDurableNavHistory,
} from '../../../lib/server/nav_history_store';

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

    const generatedAt = Date.now();
    let durableHistory = false;
    try {
      durableHistory = await recordDurableNavHistory(baskets, generatedAt);
    } catch (error) {
      console.warn('[Basket hydration] Durable NAV history write failed:', error);
      durableHistory = durableNavHistoryConfigured();
    }

    return NextResponse.json(
      {
        generatedAt,
        network: 'devnet',
        assets,
        baskets,
        durableHistory,
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
