import 'dotenv/config';
import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import { createMint, getMint } from '@solana/spl-token';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import { BasketDefinition } from '../src/lib/types';
import {
  SYNTHABASKET_PROGRAM_ID,
  SynthaBasketVaultClient,
} from '../src/lib/execution/vault_client';

const MIRROR_ENV_KEYS: Record<string, string> = {
  'T-OpenAI': 'NEXT_PUBLIC_DEVNET_MIRROR_T_OPENAI',
  ANTHROPIC: 'NEXT_PUBLIC_DEVNET_MIRROR_ANTHROPIC',
  'T-Kalshi': 'NEXT_PUBLIC_DEVNET_MIRROR_T_KALSHI',
  'T-SpaceX': 'NEXT_PUBLIC_DEVNET_MIRROR_T_SPACEX',
  ANDURIL: 'NEXT_PUBLIC_DEVNET_MIRROR_ANDURIL',
  KALSHI: 'NEXT_PUBLIC_DEVNET_MIRROR_KALSHI',
  POLYMARKET: 'NEXT_PUBLIC_DEVNET_MIRROR_POLYMARKET',
  OPENAI: 'NEXT_PUBLIC_DEVNET_MIRROR_OPENAI',
  NEURALINK: 'NEXT_PUBLIC_DEVNET_MIRROR_NEURALINK',
  FIGUREAI: 'NEXT_PUBLIC_DEVNET_MIRROR_FIGUREAI',
};

function parseKeypair(value: string): Keypair {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

async function main() {
  const rpc =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    clusterApiUrl('devnet');

  if (!rpc.includes('devnet')) {
    throw new Error('Mirror provisioning is Devnet-only. Refusing to run against a non-Devnet RPC.');
  }

  const secret =
    process.env.DEVNET_MIRROR_AUTHORITY_SECRET ||
    process.env.RUNNER_PRIVATE_KEY;

  if (!secret) {
    throw new Error(
      'Set DEVNET_MIRROR_AUTHORITY_SECRET (or RUNNER_PRIVATE_KEY) before provisioning.'
    );
  }

  const authority = parseKeypair(secret);
  const connection = new Connection(rpc, 'confirmed');
  const balance = await connection.getBalance(authority.publicKey, 'confirmed');

  console.log('SynthaBasket Devnet mirror provisioning');
  console.log('Authority:', authority.publicKey.toBase58());
  console.log('Program:', SYNTHABASKET_PROGRAM_ID.toBase58());
  console.log('SOL balance:', balance / 1e9);

  const programInfo = await connection.getAccountInfo(SYNTHABASKET_PROGRAM_ID, 'confirmed');
  if (!programInfo?.executable) {
    throw new Error('SynthaBasket program is not executable on this Devnet cluster.');
  }

  const mirrorMints: Record<string, string> = {};

  for (const [symbol, envKey] of Object.entries(MIRROR_ENV_KEYS)) {
    const existing = process.env[envKey]?.trim();

    if (existing) {
      const mint = new PublicKey(existing);
      const info = await getMint(connection, mint);
      if (info.decimals !== 6) {
        throw new Error(`${symbol} mirror ${mint.toBase58()} does not use 6 decimals.`);
      }
      if (!info.mintAuthority?.equals(authority.publicKey)) {
        throw new Error(
          `${symbol} mirror ${mint.toBase58()} is not controlled by the configured Devnet mirror authority.`
        );
      }
      mirrorMints[symbol] = mint.toBase58();
      console.log(`[existing] ${symbol}: ${mint.toBase58()}`);
      continue;
    }

    const mint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      6
    );
    mirrorMints[symbol] = mint.toBase58();
    console.log(`[created]  ${symbol}: ${mint.toBase58()}`);
  }

  const baskets: BasketDefinition[] = INITIAL_BASKETS.map((basket) => ({
    ...basket,
    constituents: basket.constituents.map((constituent) => ({
      ...constituent,
      asset: {
        ...constituent.asset,
        devnetMint: mirrorMints[constituent.asset.symbol],
      },
    })),
  }));

  const vaultClient = new SynthaBasketVaultClient(connection);

  for (const basket of baskets) {
    const executionSymbol = basket.devnetExecutionSymbol || `${basket.symbol}D`;
    const [basketPda] = vaultClient.getBasketPda(executionSymbol);
    const existing = await connection.getAccountInfo(basketPda, 'confirmed');

    if (!existing) {
      console.log(`[init]      ${basket.symbol} -> ${executionSymbol}`);
      const tx = await vaultClient.buildInitializeBasketTransaction(
        authority.publicKey,
        basket,
        true,
        25
      );
      const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
        commitment: 'confirmed',
      });
      console.log(`            tx: ${signature}`);
    } else {
      console.log(`[verify]    ${basket.symbol} -> ${executionSymbol} already exists`);
    }

    await vaultClient.verifyBasketExecutionState(basket, true);
    console.log(`[ready]     ${basket.symbol} mirror basket verified`);
  }

  console.log('\nAdd these public values to local/Vercel environment:');
  for (const [symbol, envKey] of Object.entries(MIRROR_ENV_KEYS)) {
    console.log(`${envKey}=${mirrorMints[symbol]}`);
  }

  console.log(
    '\nAlso configure DEVNET_MIRROR_AUTHORITY_SECRET on the server with the same authority secret.'
  );
  console.log(
    'The browser never receives that secret; it only receives partially signed Devnet acquisition transactions.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
