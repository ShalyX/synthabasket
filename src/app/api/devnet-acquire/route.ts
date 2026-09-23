import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import { getUnifiedAssetQuotes } from '../../../lib/server/provider_quotes';
import {
  ensureServerDevnetMirrorMint,
  getServerDevnetMirrorAuthority,
  getServerDevnetMirrorMint,
} from '../../../lib/server/devnet_mirror_resolver';

const DEVNET_USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

const KNOWN_MIRROR_SYMBOLS = [
  'T-OpenAI',
  'ANTHROPIC',
  'T-Kalshi',
  'T-SpaceX',
  'ANDURIL',
  'KALSHI',
  'POLYMARKET',
  'OPENAI',
  'NEURALINK',
  'FIGUREAI',
  'SPACEX',
];

export async function GET() {
  const configuredMirrors = Object.fromEntries(
    KNOWN_MIRROR_SYMBOLS.map((symbol) => [
      symbol,
      Boolean(getServerDevnetMirrorMint(symbol)),
    ])
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

  const authority = getServerDevnetMirrorAuthority();
  if (!authority) {
    return NextResponse.json(
      { error: 'Devnet mirror authority is not configured on the server.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const endpoint =
      process.env.SOLANA_DEVNET_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      clusterApiUrl('devnet');
    const connection = new Connection(endpoint, 'confirmed');

    // Price Devnet mirrors from the same provider quote layer that hydrates
    // the marketplace. This keeps executable test issuance aligned with the
    // NAV the user actually sees instead of stale registry seed prices.
    const marketAssets = await getUnifiedAssetQuotes('multi');
    const supportedSymbols = new Set(
      marketAssets.map((asset) => asset.symbol)
    );

    if (body?.action === 'ensure_mirrors') {
      const requestedSymbols = (
        Array.isArray(body?.symbols) ? body.symbols : []
      )
        .map((value: unknown) => String(value || '').trim())
        .filter((value: string) => value.length > 0);
      const symbols: string[] = Array.from(
        new Set<string>(requestedSymbols)
      );

      if (symbols.length < 1 || symbols.length > 8) {
        return NextResponse.json(
          { error: 'Invalid Devnet mirror symbol count.' },
          { status: 400 }
        );
      }

      for (const symbol of symbols) {
        if (!supportedSymbols.has(symbol)) {
          return NextResponse.json(
            { error: `Unsupported provider asset: ${symbol}.` },
            { status: 400 }
          );
        }
      }

      const mirrors: Record<string, string> = {};
      for (const symbol of symbols) {
        mirrors[symbol] = await ensureServerDevnetMirrorMint(
          connection,
          symbol
        );
      }

      return NextResponse.json({
        network: 'devnet',
        mirrors,
      });
    }

    const user = new PublicKey(body.userPublicKey);
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    const priceBySymbol = new Map(
      marketAssets.map((asset) => [asset.symbol, asset.priceUsd])
    );

    if (allocations.length < 1 || allocations.length > 8) {
      return NextResponse.json({ error: 'Invalid mirror allocation count.' }, { status: 400 });
    }

    const userUsdcAta = getAssociatedTokenAddressSync(DEVNET_USDC_MINT, user);
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
      const configuredMint = await ensureServerDevnetMirrorMint(
        connection,
        symbol
      );

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

      const referencePrice = priceBySymbol.get(symbol);
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

    const userUsdcBalance = await connection
      .getTokenAccountBalance(userUsdcAta, 'confirmed')
      .catch(() => null);
    const userUsdcRaw = userUsdcBalance ? BigInt(userUsdcBalance.value.amount) : 0n;

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
      userUsdcRaw: userUsdcRaw.toString(),
      hasSufficientUsdc: userUsdcRaw >= totalUsdcRaw,
      issued,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to build Devnet mirror acquisition transaction.' },
      { status: 500 }
    );
  }
}
