import { BasketDefinition } from '../types';
import { getRedisRestConfig, redisRestConfigured } from './redis_config';

export interface DurableNavHistoryPoint {
  timestamp: number;
  navUsd: number;
  aumUsd: number;
  totalSharesMinted: number;
  navSource?: BasketDefinition['navSource'];
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_WRITE_INTERVAL_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
// Vercel preview envs are read at runtime; a redeploy is required after adding them.
const KEY_PREFIX = 'synthabasket:nav-history:v1';
const META_KEY = 'synthabasket:nav-history-meta:v1';
const GATE_PREFIX = 'synthabasket:nav-history-gate:v1';

export function durableNavHistoryConfigured(): boolean {
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
    throw new Error(`Durable NAV store returned HTTP ${response.status}.`);
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
    throw new Error(`Durable NAV pipeline returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

function historyKey(basketId: string): string {
  return `${KEY_PREFIX}:${basketId}`;
}

function pipelineValue(entry: any): any {
  return entry && typeof entry === 'object' && 'result' in entry
    ? entry.result
    : entry;
}

export async function recordDurableNavHistory(
  baskets: BasketDefinition[],
  timestamp: number = Date.now()
): Promise<boolean> {
  if (!durableNavHistoryConfigured()) return false;

  const eligible = baskets.filter(
    (basket) => Number.isFinite(basket.navUsd) && basket.navUsd > 0
  );
  if (eligible.length === 0) return true;

  // Cross-instance write gate: only one function may evaluate/persist a given
  // basket during the minimum write interval.
  const gateResults = await redisPipeline(
    eligible.map((basket) => [
      'SET',
      `${GATE_PREFIX}:${basket.id}`,
      timestamp,
      'NX',
      'PX',
      MIN_WRITE_INTERVAL_MS,
    ])
  );
  const gated = eligible.filter(
    (_basket, index) => pipelineValue(gateResults[index]) === 'OK'
  );
  if (gated.length === 0) return true;

  const metaReads = await redisPipeline(
    gated.map((basket) => ['HGET', META_KEY, basket.id])
  );
  const cutoff = timestamp - RETENTION_MS;
  const commands: Array<Array<string | number>> = [];

  gated.forEach((basket, index) => {
    const previousRaw = pipelineValue(metaReads[index]);
    let previous: DurableNavHistoryPoint | null = null;
    try {
      previous = previousRaw
        ? (JSON.parse(String(previousRaw)) as DurableNavHistoryPoint)
        : null;
    } catch {
      previous = null;
    }

    const point: DurableNavHistoryPoint = {
      timestamp,
      navUsd: basket.navUsd,
      aumUsd: basket.aumUsd,
      totalSharesMinted: basket.totalSharesMinted,
      navSource: basket.navSource,
    };

    if (previous) {
      const elapsed = timestamp - previous.timestamp;
      if (elapsed < MIN_WRITE_INTERVAL_MS) return;

      const navDelta = Math.abs(point.navUsd - previous.navUsd);
      const aumDelta = Math.abs(point.aumUsd - previous.aumUsd);
      const shareDelta = Math.abs(
        point.totalSharesMinted - previous.totalSharesMinted
      );
      const meaningfulChange =
        navDelta >= Math.max(0.01, Math.abs(previous.navUsd) * 0.0001) ||
        aumDelta >= Math.max(0.01, Math.abs(previous.aumUsd) * 0.0001) ||
        shareDelta >= 0.000001 ||
        point.navSource !== previous.navSource;

      if (!meaningfulChange && elapsed < HEARTBEAT_INTERVAL_MS) return;
    }

    const key = historyKey(basket.id);
    commands.push(['ZADD', key, timestamp, JSON.stringify(point)]);
    commands.push(['ZREMRANGEBYSCORE', key, 0, cutoff]);
    commands.push(['EXPIRE', key, 60 * 60 * 24 * 40]);
    commands.push(['HSET', META_KEY, basket.id, JSON.stringify(point)]);
  });

  if (commands.length > 0) {
    commands.push(['EXPIRE', META_KEY, 60 * 60 * 24 * 40]);
    await redisPipeline(commands);
  }
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
