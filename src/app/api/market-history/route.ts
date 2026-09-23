import { NextRequest, NextResponse } from 'next/server';
import {
  durableMarketHistoryConfigured,
  readDurableMarketHistory,
} from '../../../lib/server/market_history_store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SOLANA_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(request: NextRequest) {
  const tokenMint = request.nextUrl.searchParams.get('tokenMint') || '';
  const rangeMs = Number(request.nextUrl.searchParams.get('rangeMs') || 24 * 60 * 60 * 1000);

  if (!SOLANA_MINT_RE.test(tokenMint)) {
    return NextResponse.json({ error: 'Valid tokenMint is required.' }, { status: 400 });
  }

  try {
    const durable = durableMarketHistoryConfigured();
    const points = durable ? await readDurableMarketHistory(tokenMint, rangeMs) : [];

    return NextResponse.json(
      { durable, tokenMint, points },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.error('[Market history API]', error);
    return NextResponse.json(
      {
        durable: durableMarketHistoryConfigured(),
        tokenMint,
        points: [],
        error: error?.message || 'Unable to read market history.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
