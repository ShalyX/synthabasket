import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { INITIAL_BASKETS } from '../../../lib/data/registry';

const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

const MIRROR_MINTS: Record<string, string | undefined> = {
  'T-OpenAI': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_OPENAI || 'Bj47e5GCXuaxmbPjDRF5iSVjZ1Y4uEFoaDoPUAfD1xkB',
  ANTHROPIC: process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANTHROPIC || 'GxtkS2jUU5br9JJB64FuvvUxwp2sadxwCCRsZwiqAR3p',
  'T-Kalshi': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_KALSHI || 'HSv2zqvfSXv2CQ7TW79HpQPYziNvoiY3CKpGu7Ec3hFh',
  'T-SpaceX': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_SPACEX || 'B5SFgwf1nMGPAid4ngWWtn1fxpL2wTSbibmzsQzp4oaq',
  ANDURIL: process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANDURIL || 'F2ynAT6rER45pQPh62P63TLmDqhByepTJfDaypeETBJZ',
  KALSHI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_KALSHI || '41ZBu1Frvec4r7TeQjYP4PnMSviU8vwd1wo5SZZZ5wMn',
  POLYMARKET: process.env.NEXT_PUBLIC_DEVNET_MIRROR_POLYMARKET || '9qHJAujJTHxwn6gTzmwQKJZYDsoQGsBxAw1ygvtFboTN',
  OPENAI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_OPENAI || 'JBk4GN6xhW9rmu5pAM1Ub2pdgCZs3Bkc7xBAxbvH9Rr6',
  NEURALINK: process.env.NEXT_PUBLIC_DEVNET_MIRROR_NEURALINK || 'DbUYkDnEvh9mVPJNNXdCtLksFg7RDeXgqteRvesJ2F7A',
  FIGUREAI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_FIGUREAI || '2bzfznWhXfHZqU1wRUyVCPrLAUkqP5gt5kAjjSj4b8e7',
};

const PRICE_BY_SYMBOL = new Map<string, number>();
for (const basket of INITIAL_BASKETS) {
  for (const constituent of basket.constituents) {
    if (!PRICE_BY_SYMBOL.has(constituent.asset.symbol)) {
      PRICE_BY_SYMBOL.set(constituent.asset.symbol, constituent.asset.priceUsd);
    }
  }
}

function parseAuthoritySecret(value: string): Keypair {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export async function GET() {
  const configuredMirrors = Object.fromEntries(
    Object.entries(MIRROR_MINTS).map(([symbol, value]) => [symbol, Boolean(value && value.trim())])
  );

  return NextResponse.json({
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || process.env.NEXT_PUBLIC_NETWORK || 'devnet',
    authorityConfigured: Boolean(
      process.env.DEVNET_MIRROR_AUTHORITY_SECRET || process.env.RUNNER_PRIVATE_KEY
    ),
    configuredMirrors,
  });
}

export async function POST(request: NextRequest) {
  if ((process.env.NEXT_PUBLIC_SOLANA_NETWORK || process.env.NEXT_PUBLIC_NETWORK || 'devnet') !== 'devnet') {
    return NextResponse.json(
      { error: 'Devnet mirror acquisition is disabled outside Devnet.' },
      { status: 403 }
    );
  }

  const secret =
    process.env.DEVNET_MIRROR_AUTHORITY_SECRET ||
    process.env.RUNNER_PRIVATE_KEY;

  if (!secret) {
    return NextResponse.json(
      { error: 'Devnet mirror authority is not configured on the server.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const user = new PublicKey(body.userPublicKey);
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];

    if (allocations.length < 1 || allocations.length > 8) {
      return NextResponse.json({ error: 'Invalid mirror allocation count.' }, { status: 400 });
    }

    const authority = parseAuthoritySecret(secret);
    const endpoint =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      process.env.SOLANA_RPC_URL ||
      clusterApiUrl('devnet');
    const connection = new Connection(endpoint, 'confirmed');

    const userUsdcAta = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, user);
    const userUsdcInfo = await connection.getAccountInfo(userUsdcAta, 'confirmed');
    if (!userUsdcInfo || !userUsdcInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      return NextResponse.json(
        {
          error:
            'Connected wallet has no Devnet USDC token account. Fund it with Devnet USDC before investing.',
        },
        { status: 400 }
      );
    }

    const treasuryUsdcAta = getAssociatedTokenAddressSync(
      DEVNET_USDC_MINT,
      authority.publicKey
    );

    const tx = new Transaction();
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        user,
        treasuryUsdcAta,
        authority.publicKey,
        DEVNET_USDC_MINT
      )
    );

    let totalUsdcRaw = 0n;
    const issued: Array<{ symbol: string; mint: string; rawAmount: string; uiAmount: number }> = [];

    for (const allocation of allocations) {
      const symbol = String(allocation.symbol || '');
      const configuredMint = MIRROR_MINTS[symbol];
      if (!configuredMint) {
        return NextResponse.json(
          { error: `No configured Devnet mirror mint for ${symbol}.` },
          { status: 503 }
        );
      }

      const requestedMint = new PublicKey(String(allocation.mint || ''));
      if (requestedMint.toBase58() !== configuredMint) {
        return NextResponse.json(
          { error: `Mirror mint mismatch for ${symbol}.` },
          { status: 400 }
        );
      }

      const usdcRaw = BigInt(String(allocation.usdcRaw || '0'));
      if (usdcRaw <= 0n) {
        return NextResponse.json(
          { error: `Invalid USDC acquisition amount for ${symbol}.` },
          { status: 400 }
        );
      }

      const referencePrice = PRICE_BY_SYMBOL.get(symbol);
      if (!referencePrice || referencePrice <= 0) {
        return NextResponse.json(
          { error: `No server-side Devnet reference price for ${symbol}.` },
          { status: 500 }
        );
      }

      const usdcAmount = Number(usdcRaw) / 1_000_000;
      const uiMirrorAmount = usdcAmount / referencePrice;
      const rawAmount = BigInt(Math.max(1, Math.floor(uiMirrorAmount * 1_000_000)));

      const mirrorMintInfo = await getMint(connection, requestedMint);
      if (mirrorMintInfo.decimals !== 6) {
        return NextResponse.json(
          { error: `Devnet mirror ${symbol} must use 6 decimals.` },
          { status: 500 }
        );
      }
      if (
        !mirrorMintInfo.mintAuthority ||
        !mirrorMintInfo.mintAuthority.equals(authority.publicKey)
      ) {
        return NextResponse.json(
          { error: `Server authority is not the mint authority for ${symbol} mirror.` },
          { status: 500 }
        );
      }

      totalUsdcRaw += usdcRaw;
      issued.push({
        symbol,
        mint: requestedMint.toBase58(),
        rawAmount: rawAmount.toString(),
        uiAmount: Number(rawAmount) / 1_000_000,
      });

      const userMirrorAta = getAssociatedTokenAddressSync(requestedMint, user);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          userMirrorAta,
          user,
          requestedMint
        ),
        createMintToCheckedInstruction(
          requestedMint,
          userMirrorAta,
          authority.publicKey,
          rawAmount,
          6
        )
      );
    }

    const userUsdcBalance = await connection.getTokenAccountBalance(userUsdcAta, 'confirmed');
    if (BigInt(userUsdcBalance.value.amount) < totalUsdcRaw) {
      return NextResponse.json(
        {
          error:
            `Insufficient Devnet USDC. Need ${Number(totalUsdcRaw) / 1_000_000} USDC, wallet has ${userUsdcBalance.value.uiAmountString || '0'}.`,
        },
        { status: 400 }
      );
    }

    // Hard cap the demo adapter to $1,000 USDC per transaction.
    if (totalUsdcRaw > 1_000_000_000n) {
      return NextResponse.json(
        { error: 'Devnet mirror acquisition exceeds the $1,000 demo limit.' },
        { status: 400 }
      );
    }

    tx.add(
      createTransferCheckedInstruction(
        userUsdcAta,
        DEVNET_USDC_MINT,
        treasuryUsdcAta,
        user,
        totalUsdcRaw,
        6
      )
    );

    const latest = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = user;
    tx.partialSign(authority);

    return NextResponse.json({
      transaction: tx
        .serialize({ requireAllSignatures: false, verifySignatures: false })
        .toString('base64'),
      lastValidBlockHeight: latest.lastValidBlockHeight,
      treasury: authority.publicKey.toBase58(),
      totalUsdcRaw: totalUsdcRaw.toString(),
      issued,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to build Devnet mirror acquisition transaction.' },
      { status: 500 }
    );
  }
}
