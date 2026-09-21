import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jupiterUrl = process.env.JUPITER_API_URL || 'https://api.jup.ag/swap/v2';
  const apiKey = process.env.JUPITER_API_KEY;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'SynthaBasket-Server/1.0',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const endpoint = searchParams.get('endpoint') || 'quote';
    const params = new URLSearchParams(searchParams);
    params.delete('endpoint');

    // Ensure instructionVersion=V2 is set for Jupiter V2 quotes
    if (endpoint === 'quote' && !params.has('instructionVersion')) {
      params.set('instructionVersion', 'V2');
    }

    const res = await fetch(`${jupiterUrl}/${endpoint}?${params.toString()}`, {
      headers,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Jupiter API returned ${res.status}: ${res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: `Jupiter proxy error: ${error.message}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const jupiterUrl = process.env.JUPITER_API_URL || 'https://api.jup.ag/swap/v2';
  const apiKey = process.env.JUPITER_API_KEY;

  try {
    const body = await request.json();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'SynthaBasket-Server/1.0',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const endpoint = body.endpoint || 'build';
    delete body.endpoint;

    const res = await fetch(`${jupiterUrl}/${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Jupiter build failed with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: `Jupiter build proxy error: ${error.message}` },
      { status: 500 }
    );
  }
}
