import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  AccountActivity,
  AccountActivityAsset,
  AccountActivityType,
} from '../../../lib/activity';
import { SYNTHABASKET_PROGRAM_ID } from '../../../lib/execution/vault_client';
import {
  durableActivityConfigured,
  readAccountActivities,
  recordAccountActivity,
} from '../../../lib/server/activity_store';
import { getDevnetConnection } from '../../../lib/server/devnet_connection';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_TYPES = new Set<AccountActivityType>([
  'invest',
  'redeem',
  'create_basket',
]);

function cleanText(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanOptionalNumber(
  value: unknown,
  options: { allowNegative?: boolean; max?: number } = {}
): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (!options.allowNegative && parsed < 0) return undefined;
  const max = options.max ?? 1_000_000_000_000;
  if (Math.abs(parsed) > max) return undefined;
  return parsed;
}

function cleanMint(value: unknown): string | undefined {
  const candidate = cleanText(value, 64);
  if (!candidate) return undefined;

  try {
    return new PublicKey(candidate).toBase58();
  } catch {
    return undefined;
  }
}

function cleanAssets(value: unknown): AccountActivityAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const assets: AccountActivityAsset[] = value
    .slice(0, 20)
    .map((item: any) => ({
      symbol: cleanText(item?.symbol, 20),
      amount: cleanOptionalNumber(item?.amount, { max: 1_000_000_000 }),
      mint: cleanMint(item?.mint),
      valueUsd: cleanOptionalNumber(item?.valueUsd),
    }))
    .filter(
      (item) => Boolean(item.symbol) && typeof item.amount === 'number'
    )
    .map((item) => ({
      symbol: item.symbol,
      amount: item.amount as number,
      ...(item.mint ? { mint: item.mint } : {}),
      ...(typeof item.valueUsd === 'number'
        ? { valueUsd: item.valueUsd }
        : {}),
    }));

  return assets.length > 0 ? assets : undefined;
}

function cacheHeaders() {
  return { 'Cache-Control': 'no-store, max-age=0' };
}

export async function GET(request: NextRequest) {
  const ownerParam = request.nextUrl.searchParams.get('owner');
  if (!ownerParam) {
    return NextResponse.json(
      { error: 'owner is required' },
      { status: 400, headers: cacheHeaders() }
    );
  }

  try {
    const owner = new PublicKey(ownerParam).toBase58();
    const configured = durableActivityConfigured();
    const activities = configured
      ? await readAccountActivities(owner, 150)
      : [];

    return NextResponse.json(
      {
        owner,
        storageStatus: configured ? 'loaded' : 'not_configured',
        generatedAt: Date.now(),
        activities,
      },
      { headers: cacheHeaders() }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to load account activity.' },
      { status: 400, headers: cacheHeaders() }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!durableActivityConfigured()) {
    return NextResponse.json(
      { error: 'Durable activity storage is not configured.' },
      { status: 503, headers: cacheHeaders() }
    );
  }

  try {
    const body = await request.json();
    const owner = new PublicKey(cleanText(body?.owner, 64));
    const type = cleanText(body?.type, 32) as AccountActivityType;
    const basketId = cleanText(body?.basketId, 160);
    const basketName = cleanText(body?.basketName, 100);
    const basketSymbol = cleanText(body?.basketSymbol, 20).toUpperCase();
    const signature = cleanText(body?.signature, 128);

    if (
      !VALID_TYPES.has(type) ||
      !basketId ||
      !basketName ||
      !basketSymbol ||
      !signature
    ) {
      return NextResponse.json(
        { error: 'Activity payload is incomplete.' },
        { status: 400, headers: cacheHeaders() }
      );
    }

    const amountUsd = cleanOptionalNumber(body?.amountUsd);
    const sharesDelta = cleanOptionalNumber(body?.sharesDelta, {
      allowNegative: true,
      max: 1_000_000_000,
    });
    const resultingShareBalance = cleanOptionalNumber(
      body?.resultingShareBalance,
      { max: 1_000_000_000 }
    );
    const positionClosed = body?.positionClosed === true;

    if (
      (type === 'invest' && (!sharesDelta || sharesDelta <= 0)) ||
      (type === 'redeem' && (!sharesDelta || sharesDelta >= 0))
    ) {
      return NextResponse.json(
        { error: 'Activity share delta does not match the action type.' },
        { status: 400, headers: cacheHeaders() }
      );
    }

    const connection = getDevnetConnection();
    const transaction = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction || transaction.meta?.err) {
      return NextResponse.json(
        { error: 'Confirmed transaction is not available from Devnet yet.' },
        { status: 404, headers: cacheHeaders() }
      );
    }

    const ownerAddress = owner.toBase58();
    const ownerSigned = transaction.transaction.message.accountKeys.some(
      (account: any) =>
        account?.signer === true &&
        account?.pubkey?.toBase58?.() === ownerAddress
    );

    const programInvoked = transaction.transaction.message.instructions.some(
      (instruction: any) =>
        instruction?.programId?.toBase58?.() ===
        SYNTHABASKET_PROGRAM_ID.toBase58()
    );

    if (!ownerSigned || !programInvoked) {
      return NextResponse.json(
        { error: 'Transaction does not verify this wallet action.' },
        { status: 403, headers: cacheHeaders() }
      );
    }

    const activity: AccountActivity = {
      id: `${type}:${signature}`,
      owner: ownerAddress,
      type,
      basketId,
      basketName,
      basketSymbol,
      signature,
      timestamp:
        (transaction.blockTime || Math.floor(Date.now() / 1000)) * 1000,
      status: 'confirmed',
      amountUsd,
      sharesDelta: type === 'create_basket' ? 0 : sharesDelta,
      resultingShareBalance:
        type === 'redeem' ? resultingShareBalance : undefined,
      positionClosed:
        type === 'redeem'
          ? positionClosed ||
            (typeof resultingShareBalance === 'number' &&
              resultingShareBalance <= 0.000001)
          : undefined,
      assets: cleanAssets(body?.assets),
    };

    await recordAccountActivity(activity);

    return NextResponse.json(
      { ok: true, activity },
      { headers: cacheHeaders() }
    );
  } catch (error: any) {
    console.error('[Activity API]', error);
    return NextResponse.json(
      { error: error?.message || 'Unable to record account activity.' },
      { status: 400, headers: cacheHeaders() }
    );
  }
}
