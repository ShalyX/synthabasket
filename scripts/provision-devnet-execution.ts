import * as fs from 'fs';
import * as path from 'path';
import { Connection, Keypair, PublicKey, clusterApiUrl, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getMint } from '@solana/spl-token';
import bs58 from 'bs58';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import { BasketDefinition } from '../src/lib/types';
import { SynthaBasketVaultClient } from '../src/lib/execution/vault_client';

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const KNOWN_DEVNET_MIRRORS: Record<string, string> = {
  'T-OpenAI': 'Bj47e5GCXuaxmbPjDRF5iSVjZ1Y4uEFoaDoPUAfD1xkB',
  ANTHROPIC: 'GxtkS2jUU5br9JJB64FuvvUxwp2sadxwCCRsZwiqAR3p',
  'T-Kalshi': 'HSv2zqvfSXv2CQ7TW79HpQPYziNvoiY3CKpGu7Ec3hFh',
  'T-SpaceX': 'B5SFgwf1nMGPAid4ngWWtn1fxpL2wTSbibmzsQzp4oaq',
  ANDURIL: 'F2ynAT6rER45pQPh62P63TLmDqhByepTJfDaypeETBJZ',
  KALSHI: '41ZBu1Frvec4r7TeQjYP4PnMSviU8vwd1wo5SZZZ5wMn',
  POLYMARKET: '9qHJAujJTHxwn6gTzmwQKJZYDsoQGsBxAw1ygvtFboTN',
  OPENAI: 'JBk4GN6xhW9rmu5pAM1Ub2pdgCZs3Bkc7xBAxbvH9Rr6',
};

const ENV_BY_SYMBOL: Record<string, string> = {
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

function parseSecret(value: string): Keypair {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

async function main() {
  const secret = process.env.DEVNET_MIRROR_AUTHORITY_SECRET || process.env.RUNNER_PRIVATE_KEY;
  if (!secret) {
    throw new Error('Set DEVNET_MIRROR_AUTHORITY_SECRET or RUNNER_PRIVATE_KEY before provisioning.');
  }

  const authority = parseSecret(secret);
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');
  const balance = await connection.getBalance(authority.publicKey, 'confirmed');

  if (balance < 0.05 * 1_000_000_000) {
    throw new Error('Mirror authority needs at least 0.05 Devnet SOL for mint and basket initialization rent.');
  }

  console.log('Devnet execution authority:', authority.publicKey.toBase58());
  console.log('RPC:', endpoint);

  const allSymbols = Array.from(
    new Set(INITIAL_BASKETS.flatMap((basket) => basket.constituents.map((c) => c.asset.symbol)))
  );
  const mirrorMints = new Map<string, PublicKey>();

  for (const symbol of allSymbols) {
    const envName = ENV_BY_SYMBOL[symbol];
    if (!envName) throw new Error('No mirror environment-variable mapping for ' + symbol);

    const configured = process.env[envName] || KNOWN_DEVNET_MIRRORS[symbol];
    if (configured) {
      const mint = new PublicKey(configured);
      const info = await getMint(connection, mint);
      if (info.decimals !== 6) throw new Error(symbol + ' mirror must use 6 decimals.');
      if (!info.mintAuthority || !info.mintAuthority.equals(authority.publicKey)) {
        throw new Error(symbol + ' mirror mint authority does not match the configured execution authority.');
      }
      mirrorMints.set(symbol, mint);
      console.log('Reusing', symbol, mint.toBase58());
      continue;
    }

    const mint = await createMint(
      connection,
      authority,
      authority.publicKey,
      null,
      6
    );
    mirrorMints.set(symbol, mint);
    console.log('Created', symbol, mint.toBase58());
  }

  const vaultClient = new SynthaBasketVaultClient(connection);

  for (const basket of INITIAL_BASKETS) {
    const mirroredBasket: BasketDefinition = {
      ...basket,
      constituents: basket.constituents.map((constituent) => ({
        ...constituent,
        asset: {
          ...constituent.asset,
          devnetMint: mirrorMints.get(constituent.asset.symbol)!.toBase58(),
        },
      })),
    };

    const executionSymbol = basket.devnetExecutionSymbol || basket.symbol + 'D';
    const [basketPda] = vaultClient.getBasketPda(executionSymbol);
    const existing = await connection.getAccountInfo(basketPda, 'confirmed');
    if (existing) {
      console.log('Basket already initialized:', executionSymbol, basketPda.toBase58());
      await vaultClient.verifyBasketExecutionState(mirroredBasket, true);
      continue;
    }

    const tx = await vaultClient.buildInitializeBasketTransaction(
      authority.publicKey,
      mirroredBasket,
      true,
      0
    );
    const signature = await sendAndConfirmTransaction(connection, tx, [authority], {
      commitment: 'confirmed',
    });
    console.log('Initialized basket:', executionSymbol, signature);
  }

  console.log('\nAdd these values to local/Vercel environment settings:');
  console.log('DEVNET_MIRROR_AUTHORITY_SECRET=<same server-side authority secret>');
  for (const [symbol, mint] of mirrorMints.entries()) {
    console.log(ENV_BY_SYMBOL[symbol] + '=' + mint.toBase58());
  }
  console.log('\nDo not expose DEVNET_MIRROR_AUTHORITY_SECRET as NEXT_PUBLIC_* or commit it.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
