import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { USDC_MINT_MAINNET } from '../../../lib/execution/allocation_router';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SOLANA_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PROBE_USDC = 10;
const PROBE_USDC_RAW = BigInt(PROBE_USDC * 1_000_000).toString();
const CACHE_MS = 60_000;

export interface VerifiedLiquidityRoute {
  tokenMint: string;
  dexPriceUsd: number;
  quotedUsdc: number;
  quotedTokenAmount: number;
  venueLabels: string[];
  priceImpactPct?: number;
  verifiedAt: number;
  source: 'jupiter_v2';
}

const routeCache = new Map<string, { expiresAt: number; value: VerifiedLiquidityRoute | null }>();

async function getMintDecimals(mints: string[]): Promise<Record<string, number>> {
  const rpcUrl =
    process.env.SOLANA_MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL ||
    'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const publicKeys = mints.map((mint) => new PublicKey(mint));
  const response = await connection.getMultipleParsedAccounts(publicKeys, { commitment: 'confirmed' });
  const decimalsByMint: Record<string, number> = {};

  response.value.forEach((account, index) => {
    const parsed = account?.data && 'parsed' in account.data ? account.data.parsed : null;
    const decimals = Number(parsed?.info?.decimals);
    if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) {
      decimalsByMint[mints[index]] = decimals;
    }
  });

  return decimalsByMint;
}

async function verifyJupiterRoute(
  tokenMint: string,
  decimals: number
): Promise<VerifiedLiquidityRoute | null> {
  const cached = routeCache.get(tokenMint);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const params = new URLSearchParams({
      inputMint: USDC_MINT_MAINNET,
      outputMint: tokenMint,
      amount: PROBE_USDC_RAW,
      slippageBps: '50',
      instructionVersion: 'V2',
    });
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.JUPITER_API_KEY) {
      headers['x-api-key'] = process.env.JUPITER_API_KEY;
    }

    const response = await fetch(`https://api.jup.ag/swap/v2/quote?${params.toString()}`, {
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      routeCache.set(tokenMint, { expiresAt: now + CACHE_MS, value: null });
      return null;
    }

    const quote = await response.json();
    const outAmountRaw = Number(quote?.outAmount);
    const routePlan = Array.isArray(quote?.routePlan) ? quote.routePlan : [];
    const quotedTokenAmount = outAmountRaw / 10 ** decimals;

    if (
      routePlan.length === 0 ||
      !Number.isFinite(quotedTokenAmount) ||
      quotedTokenAmount <= 0
    ) {
      routeCache.set(tokenMint, { expiresAt: now + CACHE_MS, value: null });
      return null;
    }

    const venueLabels: string[] = Array.from(
      new Set<string>(
        routePlan
          .map((step: any) => String(step?.swapInfo?.label || '').trim())
          .filter((label: string) => Boolean(label))
      )
    );
    const dexPriceUsd = PROBE_USDC / quotedTokenAmount;
    const priceImpactPct = Number(quote?.priceImpactPct);
    const result: VerifiedLiquidityRoute = {
      tokenMint,
      dexPriceUsd,
      quotedUsdc: PROBE_USDC,
      quotedTokenAmount,
      venueLabels,
      priceImpactPct: Number.isFinite(priceImpactPct) ? priceImpactPct : undefined,
      verifiedAt: now,
      source: 'jupiter_v2',
    };

    routeCache.set(tokenMint, { expiresAt: now + CACHE_MS, value: result });
    return result;
  } catch {
    routeCache.set(tokenMint, { expiresAt: now + CACHE_MS, value: null });
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rawMints: string[] = (request.nextUrl.searchParams.get('mints') || '')
    .split(',')
    .map((mint: string) => mint.trim())
    .filter((mint: string) => Boolean(mint));
  const mints: string[] = Array.from(new Set<string>(rawMints)).slice(0, 16);

  if (mints.length === 0 || mints.some((mint) => !SOLANA_MINT_RE.test(mint))) {
    return NextResponse.json({ error: 'One or more valid Solana mints are required.' }, { status: 400 });
  }

  try {
    const decimalsByMint = await getMintDecimals(mints);
    const routes = await Promise.all(
      mints.map(async (mint) => {
        const decimals = decimalsByMint[mint];
        if (typeof decimals !== 'number') return null;
        return verifyJupiterRoute(mint, decimals);
      })
    );

    return NextResponse.json(
      {
        generatedAt: Date.now(),
        probeUsdc: PROBE_USDC,
        routes: routes.filter((route): route is VerifiedLiquidityRoute => Boolean(route)),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    console.warn('[Market liquidity API]', error?.message || error);
    return NextResponse.json(
      { generatedAt: Date.now(), probeUsdc: PROBE_USDC, routes: [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
