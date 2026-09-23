import { NextResponse } from 'next/server';
import { getUnifiedAssetQuotes } from '../../../lib/server/provider_quotes';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const assets = await getUnifiedAssetQuotes('multi');

    return NextResponse.json(
      {
        generatedAt: Date.now(),
        assets,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=30',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Unable to load market data.',
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
