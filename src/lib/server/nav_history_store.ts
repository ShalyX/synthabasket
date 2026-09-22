import { BasketDefinition } from '../types';

export interface DurableNavHistoryPoint {
  timestamp: number;
  navUsd: number;
  aumUsd: number;
  totalSharesMinted: number;
  navSource?: BasketDefinition['navSource'];
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// Vercel preview envs are read at runtime; a redeploy is required after adding them.
const KEY_PREFIX = 'synthabasket:nav-history:v1';

function getRedisConfig(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    '';

  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export function durableNavHistoryConfigured(): boolean {
  return Boolean(getRedisConfig());
}

async function redisCommand(command: Array<string | number>): Promise<any> {
  const config = getRedisConfig();
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
    throw new Error(`Durable NAV store returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error);
  return payload?.result;
}

async function redisPipeline(commands: Array<Array<string | number>>): Promise<any[]> {
  const config = getRedisConfig();
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
    throw new Error(`Durable NAV pipeline returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function historyKey(basketId: string): string {
  return `${KEY_PREFIX}:${basketId}`;
}

export async function recordDurableNavHistory(
  baskets: BasketDefinition[],
  timestamp: number = Date.now()
): Promise<boolean> {
  if (!durableNavHistoryConfigured()) return false;

  const cutoff = timestamp - RETENTION_MS;
  const commands: Array<Array<string | number>> = [];

  for (const basket of baskets) {
    if (!Number.isFinite(basket.navUsd) || basket.navUsd <= 0) continue;

    const point: DurableNavHistoryPoint = {
      timestamp,
      navUsd: basket.navUsd,
      aumUsd: basket.aumUsd,
      totalSharesMinted: basket.totalSharesMinted,
      navSource: basket.navSource,
    };

    const key = historyKey(basket.id);
    commands.push(['ZADD', key, timestamp, JSON.stringify(point)]);
    commands.push(['ZREMRANGEBYSCORE', key, 0, cutoff]);
    commands.push(['EXPIRE', key, 60 * 60 * 24 * 40]);
  }

  await redisPipeline(commands);
  return true;
}

export async function readDurableNavHistory(
  basketId: string,
  rangeMs: number,
  now: number = Date.now()
): Promise<DurableNavHistoryPoint[]> {
  if (!durableNavHistoryConfigured()) return [];

  const safeRange = Math.min(Math.max(rangeMs, 60_000), RETENTION_MS);
  const cutoff = now - safeRange;
  const raw = await redisCommand([
    'ZRANGEBYSCORE',
    historyKey(basketId),
    cutoff,
    now,
  ]);

  if (!Array.isArray(raw)) return [];

  return raw
    .map((member) => {
      try {
        return JSON.parse(String(member)) as DurableNavHistoryPoint;
      } catch {
        return null;
      }
    })
    .filter(
      (point): point is DurableNavHistoryPoint =>
        Boolean(
          point &&
            Number.isFinite(point.timestamp) &&
            Number.isFinite(point.navUsd)
        )
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}
