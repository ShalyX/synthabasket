import { AssetQuote } from '../types';
import { getRedisRestConfig, redisRestConfigured } from './redis_config';

const KEY = 'synthabasket:tessera-last-live:v1';
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

export async function readTesseraLastLive(): Promise<AssetQuote[]> {
  if (!durableTesseraLastLiveConfigured()) return [];

  const raw = await redisCommand(['GET', KEY]);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (asset: AssetQuote) =>
        asset?.provider === 'tessera' &&
        typeof asset.tokenMint === 'string' &&
        typeof asset.symbol === 'string' &&
        Number.isFinite(asset.priceUsd) &&
        asset.priceUsd > 0 &&
        Number.isFinite(asset.lastUpdated)
    );
  } catch {
    return [];
  }
}
