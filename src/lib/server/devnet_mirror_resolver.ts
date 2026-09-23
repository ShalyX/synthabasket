import { createHash } from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { getDevnetMirrorMint } from '../execution/devnet_mirrors';

const MIRROR_SEED_DOMAIN = 'synthabasket:devnet-mirror:v1';

function parseAuthoritySecret(value: string): Keypair {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function getServerDevnetMirrorAuthority(): Keypair | null {
  const secret =
    process.env.DEVNET_MIRROR_AUTHORITY_SECRET ||
    process.env.RUNNER_PRIVATE_KEY;
  if (!secret) return null;
  return parseAuthoritySecret(secret);
}

function deriveMirrorKeypair(authority: Keypair, symbol: string): Keypair {
  const seed = createHash('sha256')
    .update(MIRROR_SEED_DOMAIN)
    .update(authority.secretKey)
    .update(symbol.trim().toUpperCase())
    .digest()
    .subarray(0, 32);

  return Keypair.fromSeed(Uint8Array.from(seed));
}

export function getServerDevnetMirrorMint(
  symbol: string
): string | undefined {
  const configured = getDevnetMirrorMint(symbol);
  if (configured) return configured;

  const authority = getServerDevnetMirrorAuthority();
  if (!authority) return undefined;
  return deriveMirrorKeypair(authority, symbol).publicKey.toBase58();
}

export async function ensureServerDevnetMirrorMint(
  connection: Connection,
  symbol: string
): Promise<string> {
  const authority = getServerDevnetMirrorAuthority();
  if (!authority) {
    throw new Error(
      'Devnet mirror authority is not configured on the server.'
    );
  }

  const configured = getDevnetMirrorMint(symbol);
  const dynamicMint = configured
    ? null
    : deriveMirrorKeypair(authority, symbol);
  const mintPublicKey = configured
    ? new PublicKey(configured)
    : dynamicMint!.publicKey;

  const accountInfo = await connection.getAccountInfo(
    mintPublicKey,
    'confirmed'
  );

  if (!accountInfo) {
    if (!dynamicMint) {
      throw new Error(
        `Configured Devnet mirror mint for ${symbol} does not exist on Devnet.`
      );
    }

    const lamports =
      await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    const transaction = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: authority.publicKey,
        newAccountPubkey: mintPublicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMintInstruction(
        mintPublicKey,
        6,
        authority.publicKey,
        null
      )
    );

    await sendAndConfirmTransaction(
      connection,
      transaction,
      [authority, dynamicMint],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );
  }

  const mint = await getMint(connection, mintPublicKey, 'confirmed');
  if (mint.decimals !== 6) {
    throw new Error(
      `Devnet mirror ${symbol} must use 6 decimals.`
    );
  }
  if (
    !mint.mintAuthority ||
    !mint.mintAuthority.equals(authority.publicKey)
  ) {
    throw new Error(
      `Server authority is not the mint authority for ${symbol} mirror.`
    );
  }

  return mintPublicKey.toBase58();
}
