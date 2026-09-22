import { AssetQuote, BasketDefinition } from '../types';

interface StoredCustomBasket {
  id: string;
  name: string;
  symbol: string;
  description: string;
  vaultPda: string;
  basketMint: string;
  devnetExecutionSymbol: string;
  creatorAddress?: string;
  createdAt: number;
  constituents: Array<{
    tokenMint: string;
    targetWeightBps: number;
  }>;
}

const REGISTRY_KEY = 'synthabasket:custom-baskets:devnet:v1';

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

  if (!url || !token) return null;

  const normalizedUrl = url.trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(normalizedUrl)) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL must be the HTTPS REST endpoint, not a Redis CLI/redis:// connection string.'
    );
  }

  return { url: normalizedUrl, token };
}

export function durableCustomBasketRegistryConfigured(): boolean {
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
    throw new Error(`Durable custom basket registry returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error);
  return payload?.result;
}

function normalizeStoredRecord(value: unknown): StoredCustomBasket | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<StoredCustomBasket>;

  if (
    !record.id ||
    !record.name ||
    !record.symbol ||
    !record.vaultPda ||
    !record.basketMint ||
    !record.devnetExecutionSymbol ||
    !Array.isArray(record.constituents) ||
    record.constituents.length < 1 ||
    record.constituents.length > 8
  ) {
    return null;
  }

  const constituents = record.constituents
    .map((item) => ({
      tokenMint: String(item?.tokenMint || ''),
      targetWeightBps: Number(item?.targetWeightBps),
    }))
    .filter(
      (item) =>
        item.tokenMint.length > 0 &&
        Number.isInteger(item.targetWeightBps) &&
        item.targetWeightBps > 0
    );

  if (
    constituents.length !== record.constituents.length ||
    constituents.reduce((sum, item) => sum + item.targetWeightBps, 0) !== 10_000
  ) {
    return null;
  }

  return {
    id: String(record.id),
    name: String(record.name),
    symbol: String(record.symbol).toUpperCase(),
    description: String(record.description || 'Community-created private-market basket on Solana.'),
    vaultPda: String(record.vaultPda),
    basketMint: String(record.basketMint),
    devnetExecutionSymbol: String(record.devnetExecutionSymbol).toUpperCase(),
    creatorAddress: record.creatorAddress ? String(record.creatorAddress) : undefined,
    createdAt: Number.isFinite(Number(record.createdAt))
      ? Number(record.createdAt)
      : Date.now(),
    constituents,
  };
}

export async function writeCustomBasketDefinition(
  basket: BasketDefinition
): Promise<boolean> {
  if (!durableCustomBasketRegistryConfigured()) return false;

  const record: StoredCustomBasket = {
    id: basket.id,
    name: basket.name,
    symbol: basket.symbol,
    description: basket.description,
    vaultPda: basket.vaultPda,
    basketMint: basket.basketMint,
    devnetExecutionSymbol: basket.devnetExecutionSymbol || basket.symbol,
    creatorAddress: basket.creatorAddress,
    createdAt: basket.createdAt,
    constituents: basket.constituents.map((constituent) => ({
      tokenMint: constituent.asset.tokenMint,
      targetWeightBps: constituent.targetWeightBps,
    })),
  };

  await redisCommand(['HSET', REGISTRY_KEY, basket.id, JSON.stringify(record)]);
  return true;
}

export async function readCustomBasketDefinitions(
  assets: AssetQuote[]
): Promise<BasketDefinition[]> {
  if (!durableCustomBasketRegistryConfigured()) return [];

  const raw = await redisCommand(['HVALS', REGISTRY_KEY]);
  if (!Array.isArray(raw)) return [];

  const assetByMint = new Map(assets.map((asset) => [asset.tokenMint, asset]));
  const definitions: BasketDefinition[] = [];

  for (const member of raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(member));
    } catch {
      continue;
    }

    const record = normalizeStoredRecord(parsed);
    if (!record) continue;

    const constituents = record.constituents.map((constituent) => {
      const asset = assetByMint.get(constituent.tokenMint);
      if (!asset) return null;

      return {
        asset,
        targetWeightBps: constituent.targetWeightBps,
      };
    });

    if (constituents.some((constituent) => constituent === null)) continue;

    definitions.push({
      id: record.id,
      name: record.name,
      symbol: record.symbol,
      description: record.description,
      category: 'custom',
      providerMode: 'multi',
      constituents: constituents as BasketDefinition['constituents'],
      navUsd: 0,
      navChange24h: 0,
      aumUsd: 0,
      totalSharesMinted: 0,
      vaultPda: record.vaultPda,
      basketMint: record.basketMint,
      devnetExecutionSymbol: record.devnetExecutionSymbol,
      meteoraGraduated: false,
      creatorAddress: record.creatorAddress,
      createdAt: record.createdAt,
    });
  }

  return definitions.sort((a, b) => b.createdAt - a.createdAt);
}
