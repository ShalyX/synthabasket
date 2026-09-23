export interface PythIndexBenchmark {
  underlying: string;
  symbol: string;
  priceUsd: number;
  publishedAt: number;
  source: 'pyth_index';
  indicative: true;
}

export type PythPrivateIndexAccessStatus =
  | 'available'
  | 'index_access_required'
  | 'pro_key_missing'
  | 'catalog_unavailable'
  | 'request_failed';

export interface PythPrivateIndexResolution {
  benchmarks: Record<string, PythIndexBenchmark>;
  status: PythPrivateIndexAccessStatus;
  detail?: string;
}

// Pyth launched these as indicative private-market indices on 2026-09-17.
// Pyth's own launch material describes Pyth Indices as a separate product line
// with separate commercial terms from Pyth Pro.
export const PYTH_PRIVATE_INDEX_SYMBOLS: Record<string, string> = {
  OPENAI: 'Pyth.Index.OPENAI/USD',
  ANTHROPIC: 'Pyth.Index.ANTHROPIC/USD',
};

const PYTH_PRO_HISTORY_BASE = 'https://pyth.dourolabs.app/v1';
const PYTH_PRO_REST_BASE = 'https://pyth-lazer.dourolabs.app';
const CACHE_MS = 60_000;
const DISCOVERY_CACHE_MS = 10 * 60_000;

let resolutionCache:
  | {
      key: string;
      value: PythPrivateIndexResolution;
      expiresAt: number;
    }
  | null = null;

const discoveryCache = new Map<
  string,
  { feedId: number | null; expiresAt: number }
>();

export function normalizePrivateMarketUnderlying(symbol: string): string {
  return symbol.replace(/^T-/i, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function getPythPrivateIndexSymbol(symbol: string): string | undefined {
  return PYTH_PRIVATE_INDEX_SYMBOLS[normalizePrivateMarketUnderlying(symbol)];
}

function extractRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.symbols)) return payload.symbols;
  return [];
}

function extractFeedId(row: any): number | null {
  const candidates = [
    row?.pyth_lazer_id,
    row?.pythLazerId,
    row?.price_feed_id,
    row?.priceFeedId,
    row?.id,
  ];
  for (const value of candidates) {
    const id = Number(value);
    if (Number.isInteger(id) && id >= 0) return id;
  }
  return null;
}

async function discoverProFeedId(
  symbol: string
): Promise<number | null> {
  const now = Date.now();
  const cached = discoveryCache.get(symbol);
  if (cached && cached.expiresAt > now) return cached.feedId;

  const query = symbol.split('.').pop()?.split('/')[0] || symbol;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${PYTH_PRO_HISTORY_BASE}/symbols?query=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SynthaBasket-Protocol/1.0',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Pyth Pro symbol catalog returned HTTP ${response.status}.`);
    }

    const rows = extractRows(await response.json());
    const exact = rows.find(
      (row) =>
        String(row?.symbol || '').toUpperCase() === symbol.toUpperCase()
    );
    const feedId = exact ? extractFeedId(exact) : null;

    discoveryCache.set(symbol, {
      feedId,
      expiresAt: now + DISCOVERY_CACHE_MS,
    });
    return feedId;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseLatestPricePayload(
  payload: any,
  feedIdToUnderlying: Map<number, string>
): Record<string, PythIndexBenchmark> {
  const parsed = payload?.parsed || payload?.data?.parsed || payload;
  const rows = Array.isArray(parsed?.priceFeeds)
    ? parsed.priceFeeds
    : Array.isArray(parsed?.price_feeds)
    ? parsed.price_feeds
    : [];

  const benchmarks: Record<string, PythIndexBenchmark> = {};

  for (const row of rows) {
    const feedId = Number(row?.priceFeedId ?? row?.price_feed_id ?? row?.id);
    const underlying = feedIdToUnderlying.get(feedId);
    if (!underlying) continue;

    const rawPrice = Number(row?.price);
    const exponent = Number(row?.exponent ?? 0);
    const timestampUs = Number(
      row?.feedUpdateTimestamp ??
        row?.feed_update_timestamp ??
        parsed?.timestampUs ??
        parsed?.timestamp_us
    );

    const priceUsd = rawPrice * 10 ** exponent;
    if (
      !Number.isFinite(priceUsd) ||
      priceUsd <= 0 ||
      !Number.isFinite(timestampUs)
    ) {
      continue;
    }

    benchmarks[underlying] = {
      underlying,
      symbol: PYTH_PRIVATE_INDEX_SYMBOLS[underlying],
      priceUsd,
      publishedAt: Math.floor(timestampUs / 1000),
      source: 'pyth_index',
      indicative: true,
    };
  }

  return benchmarks;
}

/**
 * Resolve private-company Pyth Index values without assuming Pyth Indices are
 * ordinary Pyth Pro feeds.
 *
 * 1. Discover the exact symbol in Pyth's public Pro catalog.
 * 2. Only if the symbol resolves there, call the documented Pyth Pro latest
 *    price REST endpoint by numeric feed ID.
 * 3. If it does not resolve, classify it as separately entitled Pyth Indices
 *    access rather than generating a misleading History API 404.
 */
export async function resolvePythPrivateIndexBenchmarks(
  symbols: string[],
  options?: { throwOnError?: boolean; apiKey?: string }
): Promise<PythPrivateIndexResolution> {
  if (typeof window !== 'undefined') {
    return { benchmarks: {}, status: 'request_failed', detail: 'server_only' };
  }

  const requested = [
    ...new Set(symbols.map(normalizePrivateMarketUnderlying)),
  ].filter((underlying) => Boolean(PYTH_PRIVATE_INDEX_SYMBOLS[underlying]));

  if (requested.length === 0) {
    return { benchmarks: {}, status: 'index_access_required' };
  }

  const cacheKey = requested.slice().sort().join(',');
  const now = Date.now();
  if (
    !options?.throwOnError &&
    resolutionCache &&
    resolutionCache.key === cacheKey &&
    resolutionCache.expiresAt > now
  ) {
    return resolutionCache.value;
  }

  try {
    const discovered = await Promise.all(
      requested.map(async (underlying) => ({
        underlying,
        symbol: PYTH_PRIVATE_INDEX_SYMBOLS[underlying],
        feedId: await discoverProFeedId(PYTH_PRIVATE_INDEX_SYMBOLS[underlying]),
      }))
    );

    const proFeeds = discovered.filter(
      (entry): entry is { underlying: string; symbol: string; feedId: number } =>
        entry.feedId !== null
    );

    if (proFeeds.length === 0) {
      const value: PythPrivateIndexResolution = {
        benchmarks: {},
        status: 'index_access_required',
        detail:
          'OpenAI/Anthropic Pyth Indices are not present in the public Pyth Pro catalog; dedicated Pyth Indices access is required.',
      };
      if (!options?.throwOnError) {
        resolutionCache = {
          key: cacheKey,
          value,
          expiresAt: now + CACHE_MS,
        };
      }
      return value;
    }

    const apiKey =
      options?.apiKey ||
      process.env.PYTH_PRO_API_KEY ||
      process.env.PYTH_INDEX_API_KEY;

    if (!apiKey) {
      return {
        benchmarks: {},
        status: 'pro_key_missing',
        detail: 'A server-side Pyth Pro API key is required for Pro REST reads.',
      };
    }

    const feedIdToUnderlying = new Map(
      proFeeds.map((entry) => [entry.feedId, entry.underlying])
    );

    const response = await fetch(`${PYTH_PRO_REST_BASE}/v1/latest_price`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SynthaBasket-Protocol/1.0',
      },
      body: JSON.stringify({
        priceFeedIds: proFeeds.map((entry) => entry.feedId),
        properties: ['price', 'exponent', 'feedUpdateTimestamp'],
        formats: ['leUnsigned'],
        channel: 'fixed_rate@1000ms',
        ignoreInvalidFeeds: false,
      }),
    });

    if (!response.ok) {
      const detail = `Pyth Pro latest-price request returned HTTP ${response.status}.`;
      if (response.status === 403) {
        return {
          benchmarks: {},
          status: 'index_access_required',
          detail,
        };
      }
      if (options?.throwOnError) throw new Error(detail);
      return { benchmarks: {}, status: 'request_failed', detail };
    }

    const benchmarks = parseLatestPricePayload(
      await response.json(),
      feedIdToUnderlying
    );
    const value: PythPrivateIndexResolution = {
      benchmarks,
      status:
        Object.keys(benchmarks).length > 0 ? 'available' : 'request_failed',
      detail:
        Object.keys(benchmarks).length > 0
          ? undefined
          : 'Pyth Pro returned no parseable price values for the resolved feeds.',
    };

    if (!options?.throwOnError) {
      resolutionCache = {
        key: cacheKey,
        value,
        expiresAt: now + CACHE_MS,
      };
    }
    return value;
  } catch (error: any) {
    if (options?.throwOnError) throw error;
    return {
      benchmarks: {},
      status: 'catalog_unavailable',
      detail: String(error?.message || error),
    };
  }
}

export async function fetchPythPrivateIndexBenchmarks(
  symbols: string[],
  options?: { throwOnError?: boolean; apiKey?: string }
): Promise<Record<string, PythIndexBenchmark>> {
  const result = await resolvePythPrivateIndexBenchmarks(symbols, options);
  return result.benchmarks;
}
