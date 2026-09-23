import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { INITIAL_BASKETS } from '../../../lib/data/registry';
import { BasketDefinition } from '../../../lib/types';
import { getUnifiedAssetQuotes } from '../../../lib/services/valuation_engine';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';
import { SynthaBasketVaultClient } from '../../../lib/execution/vault_client';
import { recordDurableNavHistory } from '../../../lib/server/nav_history_store';
import { recordDurableMarketHistory } from '../../../lib/server/market_history_store';
import { getRedisRestConfigResult } from '../../../lib/server/redis_config';
import {
  durableCustomBasketRegistryConfigured,
  readCustomBasketDefinitions,
  writeCustomBasketDefinition,
} from '../../../lib/server/custom_basket_store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getDevnetConnection(): Connection {
  return new Connection(
    process.env.SOLANA_DEVNET_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      'https://api.devnet.solana.com',
    'confirmed'
  );
}

type BasketPayload = {
  generatedAt: number;
  network: 'devnet';
  assets: Awaited<ReturnType<typeof getUnifiedAssetQuotes>>;
  baskets: BasketDefinition[];
  durableHistory: boolean;
  durableMarketHistory: boolean;
  customRegistryConfigured: boolean;
  durableStorageStatus: ReturnType<typeof getRedisRestConfigResult>['status'];
};

const BASKET_SNAPSHOT_TTL_MS = 15_000;
let basketSnapshotCache:
  | { payload: BasketPayload; expiresAt: number }
  | null = null;
let basketSnapshotInFlight: Promise<BasketPayload> | null = null;

async function buildBasketPayload(): Promise<BasketPayload> {
  const connection = getDevnetConnection();
  const assets = await getUnifiedAssetQuotes('multi');

  let customDefinitions: BasketDefinition[] = [];
  try {
    customDefinitions = await readCustomBasketDefinitions(assets);
  } catch (error) {
    console.warn(
      '[Basket hydration] Durable custom basket registry read failed.',
      error
    );
  }

  const reservedSymbols = new Set(
    INITIAL_BASKETS.map((basket) => basket.symbol.toUpperCase())
  );
  const definitions = [
    ...INITIAL_BASKETS,
    ...customDefinitions.filter(
      (basket) => !reservedSymbols.has(basket.symbol.toUpperCase())
    ),
  ];

  const baskets = await hydrateBaskets(connection, definitions, assets, true);

  const generatedAt = Date.now();
  let durableHistory = false;
  let durableMarketHistory = false;

  try {
    durableHistory = await recordDurableNavHistory(baskets, generatedAt);
  } catch {
    console.warn('[Basket hydration] Durable NAV history write failed.');
  }

  try {
    durableMarketHistory = await recordDurableMarketHistory(assets, generatedAt);
  } catch {
    console.warn('[Basket hydration] Durable market history write failed.');
  }

  const redisStatus = getRedisRestConfigResult();

  return {
    generatedAt,
    network: 'devnet',
    assets,
    baskets,
    durableHistory,
    durableMarketHistory,
    customRegistryConfigured: durableCustomBasketRegistryConfigured(),
    durableStorageStatus: redisStatus.status,
  };
}

async function getBasketPayload(): Promise<BasketPayload> {
  const now = Date.now();
  if (basketSnapshotCache && basketSnapshotCache.expiresAt > now) {
    return basketSnapshotCache.payload;
  }

  if (!basketSnapshotInFlight) {
    basketSnapshotInFlight = buildBasketPayload()
      .then((payload) => {
        basketSnapshotCache = {
          payload,
          expiresAt: Date.now() + BASKET_SNAPSHOT_TTL_MS,
        };
        return payload;
      })
      .finally(() => {
        basketSnapshotInFlight = null;
      });
  }

  return basketSnapshotInFlight;
}

export async function GET() {
  try {
    const payload = await getBasketPayload();
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    });
  } catch (error: any) {
    // If a warm function has a previous good snapshot, prefer visibly stale
    // market data over blanking the entire marketplace on a transient provider
    // or RPC failure. generatedAt remains unchanged so the UI shows its age.
    if (basketSnapshotCache?.payload) {
      return NextResponse.json(
        { ...basketSnapshotCache.payload, stale: true },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
            'X-SynthaBasket-Stale': '1',
          },
        }
      );
    }

    return NextResponse.json(
      { error: error?.message || 'Unable to hydrate basket data.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}

export async function POST(request: Request) {
  if (!durableCustomBasketRegistryConfigured()) {
    const redisStatus = getRedisRestConfigResult();
    return NextResponse.json(
      {
        error:
          redisStatus.status === 'invalid'
            ? redisStatus.error
            : 'Durable custom basket registry is not configured. Add the Upstash REST URL and token before deploying custom baskets.',
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const submitted = body?.basket;

    const name = String(submitted?.name || '').trim();
    const symbol = String(submitted?.symbol || '').trim().toUpperCase();
    const description = String(submitted?.description || '').trim();

    if (!name || name.length > 32) {
      return NextResponse.json(
        { error: 'Basket name must be between 1 and 32 characters.' },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) {
      return NextResponse.json(
        { error: 'Ticker must contain 1-10 uppercase letters or numbers.' },
        { status: 400 }
      );
    }

    if (
      INITIAL_BASKETS.some(
        (basket) => basket.symbol.toUpperCase() === symbol
      )
    ) {
      return NextResponse.json(
        { error: `Ticker ${symbol} is reserved by a curated basket.` },
        { status: 409 }
      );
    }

    const submittedConstituents = Array.isArray(submitted?.constituents)
      ? submitted.constituents
      : [];

    if (
      submittedConstituents.length < 1 ||
      submittedConstituents.length > 8
    ) {
      return NextResponse.json(
        { error: 'A basket must contain between 1 and 8 constituents.' },
        { status: 400 }
      );
    }

    const assets = await getUnifiedAssetQuotes('multi');
    const assetByMint = new Map(assets.map((asset) => [asset.tokenMint, asset]));
    const seenMints = new Set<string>();

    const constituents: BasketDefinition['constituents'] = [];
    for (const submittedConstituent of submittedConstituents) {
      const tokenMint = String(submittedConstituent?.tokenMint || '');
      const targetWeightBps = Number(submittedConstituent?.targetWeightBps);
      const asset = assetByMint.get(tokenMint);

      if (!asset) {
        return NextResponse.json(
          { error: `Unsupported constituent mint: ${tokenMint || 'missing'}.` },
          { status: 400 }
        );
      }

      if (seenMints.has(tokenMint)) {
        return NextResponse.json(
          { error: `Duplicate constituent: ${asset.symbol}.` },
          { status: 400 }
        );
      }
      seenMints.add(tokenMint);

      if (
        !Number.isInteger(targetWeightBps) ||
        targetWeightBps <= 0 ||
        targetWeightBps > 10_000
      ) {
        return NextResponse.json(
          { error: `Invalid target weight for ${asset.symbol}.` },
          { status: 400 }
        );
      }

      constituents.push({
        asset,
        targetWeightBps,
      });
    }

    const totalWeightBps = constituents.reduce(
      (sum, constituent) => sum + constituent.targetWeightBps,
      0
    );
    if (totalWeightBps !== 10_000) {
      return NextResponse.json(
        { error: 'Target weights must sum to exactly 10,000 basis points.' },
        { status: 400 }
      );
    }

    const connection = getDevnetConnection();
    const vaultClient = new SynthaBasketVaultClient(connection);
    const [basketPda] = vaultClient.getBasketPda(symbol);
    const [basketMint] = vaultClient.getBasketMintPda(symbol);

    const basket: BasketDefinition = {
      id: `custom-${symbol.toLowerCase()}`,
      name,
      symbol,
      description:
        description || 'Community-created private-market basket on Solana.',
      category: 'custom',
      providerMode: 'multi',
      constituents,
      navUsd: 0,
      navChange24h: 0,
      aumUsd: 0,
      totalSharesMinted: 0,
      vaultPda: basketPda.toBase58(),
      basketMint: basketMint.toBase58(),
      devnetExecutionSymbol: symbol,
      createdAt: Date.now(),
    };

    // Registration is allowed only after the exact submitted configuration is
    // verifiably present in the SynthaBasket program on Devnet.
    await vaultClient.verifyBasketExecutionState(basket, true);
    basket.creatorAddress = await vaultClient.getBasketAuthority(basket, true);

    const persisted = await writeCustomBasketDefinition(basket);
    if (!persisted) {
      throw new Error('Durable custom basket registry write was unavailable.');
    }

    const [hydratedBasket] = await hydrateBaskets(
      connection,
      [basket],
      assets,
      true
    );

    return NextResponse.json(
      {
        basket: hydratedBasket,
        durableRegistry: true,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.error('[Custom basket registration]', error);
    return NextResponse.json(
      { error: error?.message || 'Unable to register custom basket.' },
      { status: 500 }
    );
  }
}
