export interface PythPriceFeed {
  id: string;
  price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
  ema_price: {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
  };
}

// Well-known Pyth Price Feed IDs for benchmark tracking
export const PYTH_FEED_MAP: Record<string, { id: string; name: string; category: 'equity' | 'crypto' | 'rwa' }> = {
  'AAPL': {
    id: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    name: 'Apple Inc. (US Equity)',
    category: 'equity',
  },
  'NVDA': {
    id: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    name: 'NVIDIA Corp. (US Equity)',
    category: 'equity',
  },
  'MSFT': {
    id: 'd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1',
    name: 'Microsoft Corp. (US Equity)',
    category: 'equity',
  },
  'SOL/USD': {
    id: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    name: 'Solana / USD',
    category: 'crypto',
  },
  'USDC/USD': {
    id: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    name: 'USD Coin / USD',
    category: 'crypto',
  },
};

export async function fetchPythPrices(
  feedIds: string[],
  options?: { throwOnError?: boolean; apiKey?: string }
): Promise<Record<string, number>> {
  if (feedIds.length === 0) return {};

  const isServer = typeof window === 'undefined';
  const apiKey = options?.apiKey || process.env.PYTH_API_KEY;

  try {
    const params = new URLSearchParams();
    feedIds.forEach((id) => params.append('ids[]', id.startsWith('0x') ? id.slice(2) : id));

    const url = isServer
      ? `https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`
      : `/api/pyth?${params.toString()}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'SynthaBasket-Protocol/1.0',
    };

    if (isServer && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorMsg = `Pyth Hermes returned HTTP ${res.status}: ${res.statusText}${
        res.status === 401
          ? ' (Pyth Hermes requires an authenticated API key as of August 2026. Set PYTH_API_KEY in .env.local)'
          : ''
      }`;
      if (options?.throwOnError) {
        throw new Error(errorMsg);
      }
      console.warn(`[Pyth Hermes] ${errorMsg}`);
      return {};
    }

    const data = await res.json();
    const parsedPrices: Record<string, number> = {};

    if (data.parsed && Array.isArray(data.parsed)) {
      for (const item of data.parsed) {
        const rawPrice = Number(item.price.price);
        const expo = item.price.expo;
        const normalized = rawPrice * Math.pow(10, expo);
        parsedPrices[`0x${item.id}`] = normalized;
        parsedPrices[item.id] = normalized;
      }
    }

    return parsedPrices;
  } catch (error: any) {
    if (options?.throwOnError) {
      throw error;
    }
    console.warn('[Pyth Hermes] Failed to fetch prices:', error.message);
    return {};
  }
}

export function computeBasisSpread(
  dexPrice: number,
  pythPrice: number
): {
  spreadBps: number;
  direction: 'solana_premium' | 'solana_discount' | 'parity';
} {
  if (pythPrice <= 0) return { spreadBps: 0, direction: 'parity' };
  const spreadBps = Math.round(((dexPrice - pythPrice) / pythPrice) * 10000);
  let direction: 'solana_premium' | 'solana_discount' | 'parity' = 'parity';
  if (spreadBps > 10) direction = 'solana_premium';
  else if (spreadBps < -10) direction = 'solana_discount';

  return { spreadBps, direction };
}
