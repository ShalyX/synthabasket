import { NextRequest, NextResponse } from 'next/server';
import {
  durableNavHistoryConfigured,
  readDurableNavHistory,
} from '../../../lib/server/nav_history_store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const basketId = request.nextUrl.searchParams.get('basketId') || '';
  const rangeMs = Number(request.nextUrl.searchParams.get('rangeMs') || 60 * 60 * 1000);

  if (!basketId || !/^[a-z0-9-]+$/i.test(basketId)) {
    return NextResponse.json({ error: 'Valid basketId is required.' }, { status: 400 });
  }

  try {
    const durable = durableNavHistoryConfigured();
    const points = durable
      ? await readDurableNavHistory(basketId, rangeMs)
      : [];

    return NextResponse.json(
      {
        durable,
        basketId,
        points,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.error('[NAV history API]', error);
    return NextResponse.json(
      {
        durable: durableNavHistoryConfigured(),
        basketId,
        points: [],
        error: error?.message || 'Unable to read NAV history.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
