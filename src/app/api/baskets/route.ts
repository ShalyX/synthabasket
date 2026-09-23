import { NextResponse } from 'next/server';
import { INITIAL_BASKETS } from '../../../lib/data/registry';
import { BasketDefinition } from '../../../lib/types';
import { getUnifiedAssetQuotes } from '../../../lib/services/valuation_engine';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';
import { SynthaBasketVaultClient } from '../../../lib/execution/vault_client';
import { getRedisRestConfigResult } from '../../../lib/server/redis_config';
import { getDevnetConnection } from '../../../lib/server/devnet_connection';
import { getBasketSnapshot, getStaleBasketSnapshot } from '../../../lib/server/basket_snapshot';
import {
  durableCustomBasketRegistryConfigured,
  readCustomBasketDefinitions,
  writeCustomBasketDefinition,
} from '../../../lib/server/custom_basket_store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const snapshot = await getBasketSnapshot();
    const { definitions, customDefinitions, customRegistryStatus, ...payload } =
      snapshot;

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=30',
      },
    });
  } catch (error: any) {
    const stale = getStaleBasketSnapshot();
    if (stale) {
      const { definitions, customDefinitions, customRegistryStatus, ...payload } =
        stale;
      return NextResponse.json(
        { ...payload, stale: true },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
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
