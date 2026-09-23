import { AssetQuote, AssetProvider } from '../types';
import { getRedisRestConfig, redisRestConfigured } from './redis_config';

export interface DurableMarketHistoryPoint {
  timestamp: number;
  symbol: string;
  provider: AssetProvider;
  tokenMint: string;
  priceUsd: number;
  impliedValuationUsd?: number;
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_WRITE_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const KEY_PREFIX = 'synthabasket:market-history:v1';
const META_KEY = 'synthabasket:market-history-meta:v1';
const GATE_PREFIX = 'synthabasket:market-history-gate:v1';

export function durableMarketHistoryConfigured(): boolean {
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
    throw new Error(`Durable market store returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error);
  return payload?.result;
}

async function redisPipeline(commands: Array<Array<string | number>>): Promise<any[]> {
  const config = getRedisRestConfig();
  if (!config || commands.length === 0) return [];

  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Durable market pipeline returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function historyKey(tokenMint: string): string {
  return `${KEY_PREFIX}:${tokenMint}`;
}

function pipelineValue(entry: any): any {
  return entry && typeof entry === 'object' && 'result' in entry
    ? entry.result
    : entry;
}

export async function recordDurableMarketHistory(
  assets: AssetQuote[],
  timestamp: number = Date.now()
): Promise<boolean> {
  if (!durableMarketHistoryConfigured()) return false;

  const eligible = assets.filter(
    (asset) =>
      asset.quoteSource === 'live' &&
      Number.isFinite(asset.priceUsd) &&
      asset.priceUsd > 0 &&
      Boolean(asset.tokenMint)
  );
  if (eligible.length === 0) return true;

  // Cross-instance write gate prevents concurrent Vercel invocations from
  // appending equivalent observations during the minimum interval.
  const gateResults = await redisPipeline(
    eligible.map((asset) => [
      'SET',
      `${GATE_PREFIX}:${asset.tokenMint}`,
      timestamp,
      'NX',
      'PX',
      MIN_WRITE_INTERVAL_MS,
    ])
  );
  const gated = eligible.filter(
    (_asset, index) => pipelineValue(gateResults[index]) === 'OK'
  );
  if (gated.length === 0) return true;

  const metaReads = await redisPipeline(
    gated.map((asset) => ['HGET', META_KEY, asset.tokenMint])
  );
  const cutoff = timestamp - RETENTION_MS;
  const commands: Array<Array<string | number>> = [];

  gated.forEach((asset, index) => {
    const observedAt = Number.isFinite(asset.lastUpdated)
      ? asset.lastUpdated
      : timestamp;
    const previousRaw = pipelineValue(metaReads[index]);
    let previous: DurableMarketHistoryPoint | null = null;
    try {
      previous = previousRaw
        ? (JSON.parse(String(previousRaw)) as DurableMarketHistoryPoint)
        : null;
    } catch {
      previous = null;
    }

    const point: DurableMarketHistoryPoint = {
      timestamp: observedAt,
      symbol: asset.symbol,
      provider: asset.provider,
      tokenMint: asset.tokenMint,
      priceUsd: asset.priceUsd,
      impliedValuationUsd:
        typeof asset.marketCapUsd === 'number' &&
        Number.isFinite(asset.marketCapUsd)
          ? asset.marketCapUsd
          : undefined,
    };

    if (previous) {
      if (observedAt <= previous.timestamp) return;

      const elapsed = observedAt - previous.timestamp;
      if (elapsed < MIN_WRITE_INTERVAL_MS) return;

      const priceDelta = Math.abs(point.priceUsd - previous.priceUsd);
      const valuationDelta = Math.abs(
        (point.impliedValuationUsd || 0) -
          (previous.impliedValuationUsd || 0)
      );
      const meaningfulChange =
        priceDelta >= Math.max(0.0001, Math.abs(previous.priceUsd) * 0.0001) ||
        valuationDelta >=
          Math.max(
            1,
            Math.abs(previous.impliedValuationUsd || 0) * 0.0001
          );

      if (!meaningfulChange && elapsed < HEARTBEAT_INTERVAL_MS) return;
    }

    const key = historyKey(asset.tokenMint);
    commands.push(['ZADD', key, observedAt, JSON.stringify(point)]);
    commands.push(['ZREMRANGEBYSCORE', key, 0, cutoff]);
    commands.push(['EXPIRE', key, 60 * 60 * 24 * 40]);
    commands.push(['HSET', META_KEY, asset.tokenMint, JSON.stringify(point)]);
  });

  if (commands.length > 0) {
    commands.push(['EXPIRE', META_KEY, 60 * 60 * 24 * 40]);
    await redisPipeline(commands);
  }
  return true;
}

export async function readDurableMarketHistory(
  tokenMint: string,
  rangeMs: number,
  now: number = Date.now()
): Promise<DurableMarketHistoryPoint[]> {
  if (!durableMarketHistoryConfigured()) return [];

  const safeRange = Math.min(Math.max(rangeMs, 60_000), RETENTION_MS);
  const cutoff = now - safeRange;
  const raw = await redisCommand(['ZRANGEBYSCORE', historyKey(tokenMint), cutoff, now]);

  if (!Array.isArray(raw)) return [];

  return raw
    .map((member) => {
      try {
        return JSON.parse(String(member)) as DurableMarketHistoryPoint;
      } catch {
        return null;
      }
    })
    .filter(
      (point): point is DurableMarketHistoryPoint =>
        Boolean(
          point &&
            Number.isFinite(point.timestamp) &&
            Number.isFinite(point.priceUsd) &&
            point.priceUsd > 0
        )
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}
