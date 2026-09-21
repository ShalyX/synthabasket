import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hermesUrl = process.env.PYTH_HERMES_URL || 'https://hermes.pyth.network';
  const apiKey = process.env.PYTH_API_KEY;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'SynthaBasket-Server/1.0',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${hermesUrl}/v2/updates/price/latest?${searchParams.toString()}`, {
      headers,
    });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Pyth Hermes returned ${res.status}: ${res.statusText}`,
          requiresAuth: res.status === 401,
        },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: `Pyth proxy error: ${error.message}` },
      { status: 500 }
    );
  }
}
