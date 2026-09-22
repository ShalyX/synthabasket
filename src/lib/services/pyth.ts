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

export interface PythIndexBenchmark {
  underlying: string;
  symbol: string;
  priceUsd: number;
  publishedAt: number;
  source: 'pyth_index';
  indicative: true;
}

// Well-known Pyth Price Feed IDs for benchmark tracking.
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

// Pyth launched these as indicative private-market indices on 2026-09-17.
// Access is separately entitled, so we publish the canonical symbols even when
// the deployment does not yet have an index credential.
export const PYTH_PRIVATE_INDEX_SYMBOLS: Record<string, string> = {
  OPENAI: 'Pyth.Index.OPENAI/USD',
  ANTHROPIC: 'Pyth.Index.ANTHROPIC/USD',
};

export function normalizePrivateMarketUnderlying(symbol: string): string {
  return symbol.replace(/^T-/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function getPythPrivateIndexSymbol(symbol: string): string | undefined {
  return PYTH_PRIVATE_INDEX_SYMBOLS[normalizePrivateMarketUnderlying(symbol)];
}

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

/**
 * Fetches the latest available close from the official Pyth Index history API.
 *
 * These private-company indices are informational, indicative signals with
 * separate commercial terms. They must never be treated as executable prices.
 * We therefore require a dedicated server-only PYTH_INDEX_API_KEY and fail
 * closed when that entitlement is not configured or does not cover the index.
 */
export async function fetchPythPrivateIndexBenchmarks(
  symbols: string[],
  options?: { throwOnError?: boolean; apiKey?: string }
): Promise<Record<string, PythIndexBenchmark>> {
  if (typeof window !== 'undefined') return {};

  const requested = [...new Set(symbols.map(normalizePrivateMarketUnderlying))]
    .filter((underlying) => Boolean(PYTH_PRIVATE_INDEX_SYMBOLS[underlying]));

  if (requested.length === 0) return {};

  const apiKey = options?.apiKey || process.env.PYTH_INDEX_API_KEY;
  if (!apiKey) return {};

  const nowSeconds = Math.floor(Date.now() / 1000);
  const fromSeconds = nowSeconds - 15 * 60;

  const entries = await Promise.all(
    requested.map(async (underlying): Promise<[string, PythIndexBenchmark] | null> => {
      const symbol = PYTH_PRIVATE_INDEX_SYMBOLS[underlying];
      const params = new URLSearchParams({
        symbol,
        from: String(fromSeconds),
        to: String(nowSeconds),
        resolution: '1',
      });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const response = await fetch(
          `https://pyth.dourolabs.app/v1/fixed_rate@1000ms/history?${params.toString()}`,
          {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'User-Agent': 'SynthaBasket-Protocol/1.0',
            },
          }
        );

        if (!response.ok) {
          const message = `Pyth Index ${symbol} returned HTTP ${response.status}.`;
          if (options?.throwOnError) throw new Error(message);
          console.warn(`[Pyth Index] ${message}`);
          return null;
        }

        const payload = await response.json();
        const closes = Array.isArray(payload?.c) ? payload.c : [];
        const timestamps = Array.isArray(payload?.t) ? payload.t : [];
        const lastIndex = closes.length - 1;
        const priceUsd = Number(closes[lastIndex]);
        const publishSeconds = Number(timestamps[lastIndex]);

        if (
          payload?.s !== 'ok' ||
          lastIndex < 0 ||
          !Number.isFinite(priceUsd) ||
          priceUsd <= 0 ||
          !Number.isFinite(publishSeconds)
        ) {
          return null;
        }

        return [
          underlying,
          {
            underlying,
            symbol,
            priceUsd,
            publishedAt: publishSeconds * 1000,
            source: 'pyth_index',
            indicative: true,
          },
        ];
      } catch (error: any) {
        if (options?.throwOnError) throw error;
        console.warn(`[Pyth Index] ${symbol} fetch failed:`, error?.message || error);
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    })
  );

  return Object.fromEntries(entries.filter((entry): entry is [string, PythIndexBenchmark] => Boolean(entry)));
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
