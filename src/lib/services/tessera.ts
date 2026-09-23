import { AssetQuote } from '../types';
import {
  readTesseraLastLive,
  writeTesseraLastLive,
} from '../server/tessera_quote_store';

const VERIFIED_SNAPSHOT_AT = Date.UTC(2026, 8, 21, 0, 0, 0);
const OFFICIAL_PRODUCT_API =
  'https://rest-api.tessera.pe/v1/public/token-details';
const REQUEST_TIMEOUT_MS = 6_000;
const LIVE_CACHE_MS = 25_000;
const RETRY_DELAYS_MS = [250, 750];
const EXPECTED_TESSERA_MINTS = new Set([
  'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
  'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
  'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
]);

export interface TesseraApiItem {
  id?: string;
  name?: string;
  symbol?: string;
  code?: string;
  sector?: string;
  mint?: string;
  markPrice?: number;
  holders?: number;
  markValuation?: number;
  change24h?: number;
  change24hPercent?: number;
  priceChange24h?: number;
}

export const TESSERA_VERIFIED_SNAPSHOT: AssetQuote[] = [
  {
    symbol: 'T-OpenAI',
    name: 'OpenAI T-Token',
    provider: 'tessera',
    tokenMint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
    priceUsd: 812.79,
    change24h: 0,
    marketCapUsd: 950_000_000_000,
    description:
      'Tessera T-Token exposure for OpenAI. Instrument terms are provider-specific and do not represent direct equity ownership.',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'T-Kalshi',
    name: 'Kalshi T-Token',
    provider: 'tessera',
    tokenMint: 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
    priceUsd: 413.8,
    change24h: 0,
    marketCapUsd: 1_500_000_000,
    description:
      'Tessera T-Token exposure for Kalshi. Instrument terms are provider-specific and do not represent direct equity ownership.',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'T-SpaceX',
    name: 'SpaceX T-Token',
    provider: 'tessera',
    tokenMint: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
    priceUsd: 423,
    change24h: 0,
    marketCapUsd: 210_000_000_000,
    description:
      'Tessera T-Token exposure for SpaceX. Instrument terms are provider-specific and do not represent direct equity ownership.',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
];

let cachedLive:
  | { assets: AssetQuote[]; expiresAt: number }
  | null = null;
let inFlight: Promise<AssetQuote[]> | null = null;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapTesseraItem(
  item: TesseraApiItem,
  observedAt: number
): AssetQuote | null {
  const symbol = String(item?.symbol || '').trim();
  const name = String(item?.name || '').trim();
  const tokenMint = String(item?.mint || '').trim();
  const priceUsd = Number(item?.markPrice);
  const marketCapUsd = Number(item?.markValuation);

  if (
    !symbol ||
    !name ||
    !tokenMint ||
    !Number.isFinite(priceUsd) ||
    priceUsd <= 0
  ) {
    return null;
  }

  const providerChange = [
    item.change24h,
    item.change24hPercent,
    item.priceChange24h,
  ].find((value) => typeof value === 'number' && Number.isFinite(value));

  const sector = String(item?.sector || '').trim();
  return {
    symbol,
    name,
    provider: 'tessera',
    tokenMint,
    priceUsd: Number(priceUsd.toFixed(2)),
    change24h: providerChange ?? 0,
    change24hAvailable: providerChange !== undefined,
    quoteSource: 'live',
    marketCapUsd:
      Number.isFinite(marketCapUsd) && marketCapUsd > 0
        ? marketCapUsd
        : undefined,
    description:
      `Tessera T-Token exposure${sector ? ` in ${sector}` : ''}: ${name}. Instrument terms are provider-specific and do not represent direct equity ownership.`,
    lastUpdated: observedAt,
  };
}

async function requestOfficialTesseraApi(): Promise<AssetQuote[]> {
  const url =
    process.env.TESSERA_API_URL ||
    process.env.NEXT_PUBLIC_TESSERA_API_URL ||
    OFFICIAL_PRODUCT_API;
  let lastError = 'Unknown Tessera API error';

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'SynthaBasket-Protocol/1.0',
        },
      });

      if (!response.ok) {
        const requestId =
          response.headers.get('x-request-id') ||
          response.headers.get('x-vercel-id') ||
          '';
        const body = (await response.text().catch(() => ''))
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        lastError =
          `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}` +
          `${requestId ? ` request=${requestId}` : ''}` +
          `${body ? ` body=${body}` : ''}`;
      } else {
        const payload = await response.json();
        if (!Array.isArray(payload) || payload.length === 0) {
          lastError = 'HTTP 200 with an empty or non-array payload';
        } else {
          const observedAt = Date.now();
          const assets = payload
            .map((item: TesseraApiItem) => mapTesseraItem(item, observedAt))
            .filter((asset): asset is AssetQuote => Boolean(asset));

          if (assets.length === 0) {
            lastError = 'HTTP 200 but no rows passed Tessera schema validation';
          } else {
            return assets;
          }
        }
      }
    } catch (error: any) {
      lastError =
        error?.name === 'AbortError'
          ? `request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : String(error?.message || error);
    } finally {
      clearTimeout(timeoutId);
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(lastError);
}

function expectedCoveragePresent(assets: AssetQuote[]): boolean {
  const mints = new Set(assets.map((asset) => asset.tokenMint));
  return [...EXPECTED_TESSERA_MINTS].every((mint) => mints.has(mint));
}

async function fallbackTesseraAssets(error: Error): Promise<AssetQuote[]> {
  try {
    const durable = await readTesseraLastLive();
    if (durable.length > 0) {
      console.warn(
        `[Tessera API] Official Product API unavailable after retries (${error.message}). Using last successful live observation from durable storage.`
      );
      return durable.map((asset) => ({
        ...asset,
        quoteSource: 'last_live' as const,
        change24hAvailable: false,
      }));
    }
  } catch (storeError: any) {
    console.warn(
      '[Tessera API] Last-live store read failed:',
      storeError?.message || storeError
    );
  }

  console.warn(
    `[Tessera API] Official Product API unavailable after retries (${error.message}). Using verified 2026-09-21 snapshot.`
  );
  return TESSERA_VERIFIED_SNAPSHOT;
}

async function fetchFreshTesseraAssets(
  throwOnError: boolean
): Promise<AssetQuote[]> {
  try {
    const liveAssets = await requestOfficialTesseraApi();

    let resolvedAssets = liveAssets;

    // Only replace the durable recovery set when the official response still
    // contains all three hackathon integration mints. If a 200 response is
    // partially malformed or omits one expected row, recover only that row
    // without downgrading the valid live rows.
    if (expectedCoveragePresent(liveAssets)) {
      try {
        await writeTesseraLastLive(liveAssets);
      } catch (storeError: any) {
        console.warn(
          '[Tessera API] Live response succeeded but last-live persistence failed:',
          storeError?.message || storeError
        );
      }
    } else {
      const liveMints = new Set(liveAssets.map((asset) => asset.tokenMint));
      let durable: AssetQuote[] = [];
      try {
        durable = await readTesseraLastLive();
      } catch (storeError: any) {
        console.warn(
          '[Tessera API] Partial live response; last-live recovery read failed:',
          storeError?.message || storeError
        );
      }

      const recovered = durable
        .filter(
          (asset) =>
            EXPECTED_TESSERA_MINTS.has(asset.tokenMint) &&
            !liveMints.has(asset.tokenMint)
        )
        .map((asset) => ({
          ...asset,
          quoteSource: 'last_live' as const,
          change24hAvailable: false,
        }));

      const recoveredMints = new Set(recovered.map((asset) => asset.tokenMint));
      const staticRecovery = TESSERA_VERIFIED_SNAPSHOT.filter(
        (asset) =>
          !liveMints.has(asset.tokenMint) &&
          !recoveredMints.has(asset.tokenMint)
      );

      resolvedAssets = [...liveAssets, ...recovered, ...staticRecovery];
      console.warn(
        `[Tessera API] Live response omitted or invalidated expected rows; preserved ${liveAssets.length} live row(s), recovered ${recovered.length} last-live row(s), and used ${staticRecovery.length} static row(s).`
      );
    }

    cachedLive = {
      assets: resolvedAssets,
      expiresAt: Date.now() + LIVE_CACHE_MS,
    };
    return resolvedAssets;
  } catch (error: any) {
    const normalized = new Error(String(error?.message || error));
    if (throwOnError) {
      throw new Error(
        `Tessera official Product API fetch failed after retries: ${normalized.message}`
      );
    }
    const fallback = await fallbackTesseraAssets(normalized);
    cachedLive = {
      assets: fallback,
      expiresAt: Date.now() + Math.min(LIVE_CACHE_MS, 15_000),
    };
    return fallback;
  }
}

export async function fetchTesseraAssets(options?: {
  throwOnError?: boolean;
}): Promise<AssetQuote[]> {
  const now = Date.now();
  if (!options?.throwOnError && cachedLive && cachedLive.expiresAt > now) {
    return cachedLive.assets;
  }

  if (options?.throwOnError) {
    return fetchFreshTesseraAssets(true);
  }

  if (!inFlight) {
    inFlight = fetchFreshTesseraAssets(false).finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}
