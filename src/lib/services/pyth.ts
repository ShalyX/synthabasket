export interface PythIndexBenchmark {
  underlying: string;
  symbol: string;
  priceUsd: number;
  publishedAt: number;
  source: 'pyth_index';
  indicative: true;
}

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

