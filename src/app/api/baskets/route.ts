import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { INITIAL_BASKETS } from '../../../lib/data/registry';
import { BasketDefinition } from '../../../lib/types';
import { getUnifiedAssetQuotes } from '../../../lib/services/valuation_engine';
import { hydrateBaskets } from '../../../lib/services/basket_hydration';
import { SynthaBasketVaultClient } from '../../../lib/execution/vault_client';
import { getRedisRestConfigResult } from '../../../lib/server/redis_config';
import { getDevnetConnection } from '../../../lib/server/devnet_connection';
import { getBasketSnapshot, getStaleBasketSnapshot, invalidateBasketSnapshot } from '../../../lib/server/basket_snapshot';
import {
  durableCustomBasketRegistryConfigured,
  writeCustomBasketDefinition,
} from '../../../lib/server/custom_basket_store';
import {
  BasketRegistrationAuthError,
  BasketRegistrationIntent,
  consumeBasketRegistrationChallenge,
  enforceBasketRegistrationRateLimit,
  issueBasketRegistrationChallenge,
  verifyBasketRegistrationChallenge,
} from '../../../lib/server/basket_registration_auth';

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

type SubmittedBasketInput = {
  name: string;
  symbol: string;
  description: string;
  constituents: Array<{
    tokenMint: string;
    targetWeightBps: number;
  }>;
};

function requestClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip =
    forwarded?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return ip;
}

function normalizeBasketIntent(submitted: any): SubmittedBasketInput {
  const name = String(submitted?.name || '').trim();
  const symbol = String(submitted?.symbol || '').trim().toUpperCase();
  const description =
    String(submitted?.description || '').trim() ||
    'Community-created private-market basket on Solana.';

  if (!name || name.length > 32) {
    throw new BasketRegistrationAuthError(
      'Basket name must be between 1 and 32 characters.',
      400,
      'VALIDATION_ERROR'
    );
  }
  if (!/^[A-Z0-9]{1,10}$/.test(symbol)) {
    throw new BasketRegistrationAuthError(
      'Ticker must contain 1-10 uppercase letters or numbers.',
      400,
      'VALIDATION_ERROR'
    );
  }
  if (
    INITIAL_BASKETS.some(
      (basket) => basket.symbol.toUpperCase() === symbol
    )
  ) {
    throw new BasketRegistrationAuthError(
      `Ticker ${symbol} is reserved by a curated basket.`,
      409,
      'SYMBOL_RESERVED'
    );
  }

  const rawConstituents = Array.isArray(submitted?.constituents)
    ? submitted.constituents
    : [];
  if (rawConstituents.length < 1 || rawConstituents.length > 8) {
    throw new BasketRegistrationAuthError(
      'A basket must contain between 1 and 8 constituents.',
      400,
      'VALIDATION_ERROR'
    );
  }

  const seenMints = new Set<string>();
  const constituents = rawConstituents.map((item: any) => {
    const tokenMint = String(item?.tokenMint || '').trim();
    const targetWeightBps = Number(item?.targetWeightBps);

    if (!tokenMint) {
      throw new BasketRegistrationAuthError(
        'Every constituent must include a token mint.',
        400,
        'VALIDATION_ERROR'
      );
    }
    if (seenMints.has(tokenMint)) {
      throw new BasketRegistrationAuthError(
        `Duplicate constituent mint: ${tokenMint}.`,
        400,
        'VALIDATION_ERROR'
      );
    }
    seenMints.add(tokenMint);

    if (
      !Number.isInteger(targetWeightBps) ||
      targetWeightBps <= 0 ||
      targetWeightBps > 10_000
    ) {
      throw new BasketRegistrationAuthError(
        `Invalid target weight for ${tokenMint}.`,
        400,
        'VALIDATION_ERROR'
      );
    }

    return { tokenMint, targetWeightBps };
  });

  if (
    constituents.reduce((sum, item) => sum + item.targetWeightBps, 0) !==
    10_000
  ) {
    throw new BasketRegistrationAuthError(
      'Target weights must sum to exactly 10,000 basis points.',
      400,
      'VALIDATION_ERROR'
    );
  }

  return { name, symbol, description, constituents };
}

function jsonRegistrationError(error: unknown) {
  if (error instanceof BasketRegistrationAuthError) {
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store',
    };
    if (error.status === 429) headers['Retry-After'] = '300';

    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers }
    );
  }

  const message = String((error as any)?.message || error || '');
  if (
    /429|rate limit|too many requests|fetch failed|ETIMEDOUT|ECONN|failed to get info about account|Server responded/i.test(
      message
    )
  ) {
    return NextResponse.json(
      {
        error: 'Solana Devnet is rate-limiting basket verification. Retry after RPC pressure subsides.',
        code: 'RPC_RATE_LIMITED',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (/not initialized|not owned by the SynthaBasket program|IDL\/program version mismatch/i.test(message)) {
    return NextResponse.json(
      { error: message, code: 'CHAIN_VERIFICATION_FAILED' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (/Durable|storage|registry/i.test(message)) {
    return NextResponse.json(
      { error: message || 'Durable registration storage is unavailable.', code: 'STORAGE_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  console.error('[Custom basket registration]', error);
  return NextResponse.json(
    {
      error: message || 'Unable to register custom basket.',
      code: 'REGISTRATION_FAILED',
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
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
        code: 'STORAGE_UNAVAILABLE',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const body = await request.json();
    const action = String(body?.action || 'register');
    const intent = normalizeBasketIntent(body?.basket);

    if (action === 'registration_challenge') {
      const authorityInput = String(body?.authority || '').trim();
      let authority: string;
      try {
        authority = new PublicKey(authorityInput).toBase58();
      } catch {
        throw new BasketRegistrationAuthError(
          'Registration authority is not a valid Solana address.',
          400,
          'INVALID_AUTHORITY'
        );
      }

      const clientIdentifier = requestClientIdentifier(request);

      // Gate abuse by client before doing any Solana RPC work. Do not include
      // attacker-controlled authority text in this preflight key.
      await enforceBasketRegistrationRateLimit(
        'challenge',
        clientIdentifier
      );

      const connection = getDevnetConnection();
      const vaultClient = new SynthaBasketVaultClient(connection);
      const onChainAuthority =
        await vaultClient.getBasketAuthorityByExecutionSymbol(intent.symbol);

      if (onChainAuthority !== authority) {
        throw new BasketRegistrationAuthError(
          'Connected wallet is not the on-chain authority for this basket.',
          403,
          'AUTHORITY_MISMATCH'
        );
      }

      const domain =
        request.headers.get('host') || 'synthabasket';
      const challenge = await issueBasketRegistrationChallenge({
        intent: intent as BasketRegistrationIntent,
        authority,
        domain,
      });

      return NextResponse.json(challenge, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (action !== 'register') {
      throw new BasketRegistrationAuthError(
        'Unsupported basket registration action.',
        400,
        'VALIDATION_ERROR'
      );
    }

    const auth = body?.auth || {};
    const verifiedChallenge = await verifyBasketRegistrationChallenge({
      challengeId: String(auth.challengeId || ''),
      signature: String(auth.signature || ''),
      intent: intent as BasketRegistrationIntent,
    });

    await enforceBasketRegistrationRateLimit(
      'register',
      verifiedChallenge.authority
    );

    const assets = await getUnifiedAssetQuotes('multi');
    const assetByMint = new Map(assets.map((asset) => [asset.tokenMint, asset]));
    const constituents: BasketDefinition['constituents'] = [];

    for (const submittedConstituent of intent.constituents) {
      const asset = assetByMint.get(submittedConstituent.tokenMint);
      if (!asset) {
        throw new BasketRegistrationAuthError(
          `Unsupported constituent mint: ${submittedConstituent.tokenMint}.`,
          400,
          'VALIDATION_ERROR'
        );
      }
      constituents.push({
        asset,
        targetWeightBps: submittedConstituent.targetWeightBps,
      });
    }

    const connection = getDevnetConnection();
    const vaultClient = new SynthaBasketVaultClient(connection);
    const [basketPda] = vaultClient.getBasketPda(intent.symbol);
    const [basketMint] = vaultClient.getBasketMintPda(intent.symbol);

    const basket: BasketDefinition = {
      id: `custom-${intent.symbol.toLowerCase()}`,
      name: intent.name,
      symbol: intent.symbol,
      description: intent.description,
      category: 'custom',
      providerMode: 'multi',
      constituents,
      navUsd: 0,
      navChange24h: 0,
      aumUsd: 0,
      totalSharesMinted: 0,
      vaultPda: basketPda.toBase58(),
      basketMint: basketMint.toBase58(),
      devnetExecutionSymbol: intent.symbol,
      creatorAddress: verifiedChallenge.authority,
      createdAt: Date.now(),
    };

    await vaultClient.verifyBasketExecutionState(basket, true);
    const actualAuthority = await vaultClient.getBasketAuthority(basket, true);
    if (actualAuthority !== verifiedChallenge.authority) {
      throw new BasketRegistrationAuthError(
        'Signed wallet is no longer the verified on-chain basket authority.',
        403,
        'AUTHORITY_MISMATCH'
      );
    }

    // Consume only after exact chain/config verification. GETDEL makes a
    // concurrent or replayed registration fail atomically.
    await consumeBasketRegistrationChallenge(
      String(auth.challengeId || '')
    );

    const persisted = await writeCustomBasketDefinition(basket);
    if (!persisted) {
      throw new BasketRegistrationAuthError(
        'Durable custom basket registry write was unavailable.',
        503,
        'STORAGE_UNAVAILABLE'
      );
    }

    invalidateBasketSnapshot();

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
        authorityVerified: true,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return jsonRegistrationError(error);
  }
}
