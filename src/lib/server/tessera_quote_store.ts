import { AssetQuote } from '../types';
import { getRedisRestConfig, redisRestConfigured } from './redis_config';

const KEY = 'synthabasket:tessera-last-live:v1';
const MARKET_HISTORY_META_KEY = 'synthabasket:market-history-meta:v1';
const TTL_SECONDS = 7 * 24 * 60 * 60;

export function durableTesseraLastLiveConfigured(): boolean {
  return redisRestConfigured();
}

async function redisCommand(command: Array<string | number>): Promise<any> {
  const config = getRedisRestConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Tessera last-live store returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(String(payload.error));
  return payload?.result;
}

export async function writeTesseraLastLive(
  assets: AssetQuote[]
): Promise<boolean> {
  if (!durableTesseraLastLiveConfigured() || assets.length === 0) return false;

  await redisCommand(['SET', KEY, JSON.stringify(assets), 'EX', TTL_SECONDS]);
  return true;
}

function validStoredAssets(value: unknown): AssetQuote[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (asset: AssetQuote) =>
      asset?.provider === 'tessera' &&
      typeof asset.tokenMint === 'string' &&
      typeof asset.symbol === 'string' &&
      Number.isFinite(asset.priceUsd) &&
      asset.priceUsd > 0 &&
      Number.isFinite(asset.lastUpdated)
  );
}

export async function readTesseraLastLive(
  seedAssets: AssetQuote[] = []
): Promise<AssetQuote[]> {
  if (!durableTesseraLastLiveConfigured()) return [];

  const raw = await redisCommand(['GET', KEY]);
  if (raw) {
    try {
      const stored = validStoredAssets(JSON.parse(String(raw)));
      if (stored.length > 0) return stored;
    } catch {
      // Fall through to the durable market-history migration below.
    }
  }

  // Bootstrap the dedicated last-live cache from market-history metadata that
  // was already written only from genuinely live provider observations.
  if (seedAssets.length === 0) return [];

  const recovered: AssetQuote[] = [];
  for (const seed of seedAssets) {
    const pointRaw = await redisCommand([
      'HGET',
      MARKET_HISTORY_META_KEY,
      seed.tokenMint,
    ]);
    if (!pointRaw) continue;

    try {
      const point = JSON.parse(String(pointRaw));
      const priceUsd = Number(point?.priceUsd);
      const timestamp = Number(point?.timestamp);
      const impliedValuationUsd = Number(point?.impliedValuationUsd);

      if (
        point?.provider !== 'tessera' ||
        !Number.isFinite(priceUsd) ||
        priceUsd <= 0 ||
        !Number.isFinite(timestamp) ||
        timestamp <= seed.lastUpdated
      ) {
        continue;
      }

      recovered.push({
        ...seed,
        priceUsd,
        marketCapUsd:
          Number.isFinite(impliedValuationUsd) && impliedValuationUsd > 0
            ? impliedValuationUsd
            : seed.marketCapUsd,
        change24h: 0,
        change24hAvailable: false,
        quoteSource: 'live',
        lastUpdated: timestamp,
      });
    } catch {
      // A malformed historical metadata row is ignored independently.
    }
  }

  if (recovered.length > 0) {
    await redisCommand([
      'SET',
      KEY,
      JSON.stringify(recovered),
      'EX',
      TTL_SECONDS,
    ]);
  }

  return recovered;
}
