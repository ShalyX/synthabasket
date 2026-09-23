import { INITIAL_BASKETS } from '../data/registry';
import { BasketDefinition } from '../types';
import { getUnifiedAssetQuotes } from '../services/valuation_engine';
import { hydrateBaskets } from '../services/basket_hydration';
import { recordDurableNavHistory } from './nav_history_store';
import { recordDurableMarketHistory } from './market_history_store';
import { getRedisRestConfigResult } from './redis_config';
import {
  durableCustomBasketRegistryConfigured,
  readCustomBasketDefinitions,
} from './custom_basket_store';
import { getDevnetConnection } from './devnet_connection';

export type BasketSnapshot = {
  generatedAt: number;
  network: 'devnet';
  assets: Awaited<ReturnType<typeof getUnifiedAssetQuotes>>;
  baskets: BasketDefinition[];
  definitions: BasketDefinition[];
  customDefinitions: BasketDefinition[];
  durableHistory: boolean;
  durableMarketHistory: boolean;
  customRegistryConfigured: boolean;
  durableStorageStatus: ReturnType<typeof getRedisRestConfigResult>['status'];
  customRegistryStatus: 'loaded' | 'not_configured' | 'unavailable';
};

const DEFAULT_SNAPSHOT_MAX_AGE_MS = 25_000;
let cachedSnapshot: { value: BasketSnapshot } | null = null;
let inFlight: Promise<BasketSnapshot> | null = null;

function mergeDefinitions(customDefinitions: BasketDefinition[]): BasketDefinition[] {
  const reservedSymbols = new Set(
    INITIAL_BASKETS.map((basket) => basket.symbol.toUpperCase())
  );

  return [
    ...INITIAL_BASKETS,
    ...customDefinitions.filter(
      (basket) => !reservedSymbols.has(basket.symbol.toUpperCase())
    ),
  ];
}

async function buildSnapshot(): Promise<BasketSnapshot> {
  const connection = getDevnetConnection();
  const assets = await getUnifiedAssetQuotes('multi');

  const customRegistryConfigured = durableCustomBasketRegistryConfigured();
  let customRegistryStatus: BasketSnapshot['customRegistryStatus'] =
    customRegistryConfigured ? 'loaded' : 'not_configured';
  let customDefinitions: BasketDefinition[] = [];

  if (customRegistryConfigured) {
    try {
      customDefinitions = await readCustomBasketDefinitions(assets);
    } catch (error) {
      customRegistryStatus = 'unavailable';
      console.warn('[Basket snapshot] Custom basket registry read failed.', error);
    }
  }

  const definitions = mergeDefinitions(customDefinitions);
  const baskets = await hydrateBaskets(connection, definitions, assets, true);
  const generatedAt = Date.now();

  let durableHistory = false;
  let durableMarketHistory = false;

  try {
    durableHistory = await recordDurableNavHistory(baskets, generatedAt);
  } catch {
    console.warn('[Basket snapshot] Durable NAV history write failed.');
  }

  try {
    durableMarketHistory = await recordDurableMarketHistory(assets, generatedAt);
  } catch {
    console.warn('[Basket snapshot] Durable market history write failed.');
  }

  return {
    generatedAt,
    network: 'devnet',
    assets,
    baskets,
    definitions,
    customDefinitions,
    durableHistory,
    durableMarketHistory,
    customRegistryConfigured,
    durableStorageStatus: getRedisRestConfigResult().status,
    customRegistryStatus,
  };
}

export async function getBasketSnapshot(options?: {
  force?: boolean;
  maxAgeMs?: number;
}): Promise<BasketSnapshot> {
  const now = Date.now();
  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_SNAPSHOT_MAX_AGE_MS;
  if (
    !options?.force &&
    cachedSnapshot &&
    now - cachedSnapshot.value.generatedAt < maxAgeMs
  ) {
    return cachedSnapshot.value;
  }

  if (!inFlight) {
    inFlight = buildSnapshot()
      .then((value) => {
        cachedSnapshot = { value };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}

export function getStaleBasketSnapshot(): BasketSnapshot | null {
  return cachedSnapshot?.value || null;
}
