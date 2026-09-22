import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
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
  NEURALINK: 'DbUYkDnEvh9mVPJNNXdCtLksFg7RDeXgqteRvesJ2F7A',
  FIGUREAI: '2bzfznWhXfHZqU1wRUyVCPrLAUkqP5gt5kAjjSj4b8e7',
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

function run(command: string, args: string[], cwd?: string) {
  console.log('$', command, args.join(' '));
  execFileSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });
}

function ensureSolanaCli() {
  try {
    execFileSync('solana', ['--version'], { stdio: 'ignore' });
    return;
  } catch {
    // Install a current Agave toolchain so cargo-build-sbf understands
    // modern crate manifests while compiling this Anchor 0.30 program.
  }

  const archive = path.join(os.tmpdir(), 'solana-release.tar.bz2');
  const installDir = path.join(os.tmpdir(), 'solana-release');

  run('curl', [
    '-L',
    '--fail',
    '--retry',
    '3',
    '-o',
    archive,
    'https://github.com/anza-xyz/agave/releases/download/v4.2.2/solana-release-x86_64-unknown-linux-gnu.tar.bz2',
  ]);

  fs.rmSync(installDir, { recursive: true, force: true });
  fs.mkdirSync(installDir, { recursive: true });
  run('tar', ['-xjf', archive, '--strip-components=1', '-C', installDir]);

  process.env.PATH =
    path.join(installDir, 'bin') + path.delimiter + (process.env.PATH || '');

  run('solana', ['--version']);
}

function deriveDevnetProgramKeypair(authority: Keypair): Keypair {
  const seed = createHash('sha256')
    .update('synthabasket-devnet-program-v1')
    .update(Buffer.from(authority.secretKey))
    .digest()
    .subarray(0, 32);

  return Keypair.fromSeed(seed);
}

async function ensureProgramDeployed(
  connection: Connection,
  authority: Keypair,
  endpoint: string
): Promise<PublicKey> {
  const programKeypair = deriveDevnetProgramKeypair(authority);
  const programId = programKeypair.publicKey;
  const existing = await connection.getAccountInfo(programId, 'confirmed');

  if (existing?.executable) {
    console.log('Reusing deployed SynthaBasket program:', programId.toBase58());
    return programId;
  }

  console.log(
    'SynthaBasket program is not deployed; provisioning Devnet program:',
    programId.toBase58()
  );

  ensureSolanaCli();

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'synthabasket-program-')
  );
  const authorityPath = path.join(tempDir, 'authority.json');
  const programKeypairPath = path.join(tempDir, 'program-keypair.json');

  fs.writeFileSync(
    authorityPath,
    JSON.stringify(Array.from(authority.secretKey))
  );
  fs.writeFileSync(
    programKeypairPath,
    JSON.stringify(Array.from(programKeypair.secretKey))
  );
  fs.chmodSync(authorityPath, 0o600);
  fs.chmodSync(programKeypairPath, 0o600);

  const contractDir = path.join(
    process.cwd(),
    'contracts',
    'synthabasket_vault'
  );
  const programDir = path.join(
    contractDir,
    'programs',
    'synthabasket_vault'
  );
  const libPath = path.join(programDir, 'src', 'lib.rs');
  const anchorPath = path.join(contractDir, 'Anchor.toml');

  const libSource = fs
    .readFileSync(libPath, 'utf8')
    .replace(
      /declare_id!\("[^"]+"\);/,
      'declare_id!("' + programId.toBase58() + '");'
    );
  fs.writeFileSync(libPath, libSource);

  const anchorSource = fs
    .readFileSync(anchorPath, 'utf8')
    .replace(
      /synthabasket_vault = "[^"]+"/g,
      'synthabasket_vault = "' + programId.toBase58() + '"'
    );
  fs.writeFileSync(anchorPath, anchorSource);

  // Use the CLI for funding checks here. Public Devnet RPC occasionally
  // drops fetch requests from web3.js during long CI jobs.
  try {
    run('solana', [
      'balance',
      authority.publicKey.toBase58(),
      '--url',
      endpoint,
    ]);
  } catch {
    console.warn('Unable to read Devnet SOL balance through the CLI.');
  }

  console.log('Requesting Devnet deployment SOL if the faucet permits it...');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      run('solana', [
        'airdrop',
        '2',
        authority.publicKey.toBase58(),
        '--url',
        endpoint,
      ]);
    } catch {
      console.warn(
        'Devnet faucet request failed or was rate-limited; continuing with the existing balance.'
      );
    }
  }

  try {
    run('solana', [
      'balance',
      authority.publicKey.toBase58(),
      '--url',
      endpoint,
    ]);
  } catch {
    console.warn('Unable to re-read Devnet SOL balance before deployment.');
  }

  // Resolve the dependency graph with the host Cargo. The current Agave
  // SBF toolchain supports the resulting lockfile format and Rust editions.
  run('cargo', ['generate-lockfile'], programDir);
  run('cargo', ['build-sbf'], programDir);

  const soPath = path.join(
    programDir,
    'target',
    'deploy',
    'synthabasket_vault.so'
  );

  if (!fs.existsSync(soPath)) {
    throw new Error(
      'cargo build-sbf completed but synthabasket_vault.so was not produced.'
    );
  }

  run('solana', [
    '--url',
    endpoint,
    '--keypair',
    authorityPath,
    'program',
    'deploy',
    soPath,
    '--program-id',
    programKeypairPath,
  ]);

  const deployed = await connection.getAccountInfo(
    programId,
    'confirmed'
  );

  if (!deployed?.executable) {
    throw new Error(
      'Program deployment returned without an executable program account.'
    );
  }

  console.log('PROGRAM_ID=' + programId.toBase58());
  return programId;
}

async function main() {
  const secret =
    process.env.DEVNET_MIRROR_AUTHORITY_SECRET ||
    process.env.RUNNER_PRIVATE_KEY;

  if (!secret) {
    throw new Error(
      'Set DEVNET_MIRROR_AUTHORITY_SECRET or RUNNER_PRIVATE_KEY before provisioning.'
    );
  }

  const authority = parseSecret(secret);
  const endpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    clusterApiUrl('devnet');
  const connection = new Connection(endpoint, 'confirmed');
  const balance = await connection.getBalance(
    authority.publicKey,
    'confirmed'
  );

  if (balance < 0.05 * 1_000_000_000) {
    throw new Error(
      'Mirror authority needs at least 0.05 Devnet SOL before provisioning.'
    );
  }

  console.log(
    'Devnet execution authority:',
    authority.publicKey.toBase58()
  );
  console.log('RPC:', endpoint);

  const allSymbols = Object.keys(ENV_BY_SYMBOL);
  const mirrorMints = new Map<string, PublicKey>();

  for (const symbol of allSymbols) {
    const envName = ENV_BY_SYMBOL[symbol];
    const configured =
      process.env[envName] || KNOWN_DEVNET_MIRRORS[symbol];

    if (configured) {
      const mint = new PublicKey(configured);
      const info = await getMint(connection, mint);

      if (info.decimals !== 6) {
        throw new Error(symbol + ' mirror must use 6 decimals.');
      }

      if (
        !info.mintAuthority ||
        !info.mintAuthority.equals(authority.publicKey)
      ) {
        throw new Error(
          symbol +
            ' mirror mint authority does not match the configured execution authority.'
        );
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

  const programId = await ensureProgramDeployed(
    connection,
    authority,
    endpoint
  );

  const vaultClient = new SynthaBasketVaultClient(
    connection,
    programId
  );

  for (const basket of INITIAL_BASKETS) {
    const mirroredBasket: BasketDefinition = {
      ...basket,
      constituents: basket.constituents.map((constituent) => ({
        ...constituent,
        asset: {
          ...constituent.asset,
          devnetMint: mirrorMints
            .get(constituent.asset.symbol)!
            .toBase58(),
        },
      })),
    };

    const executionSymbol =
      basket.devnetExecutionSymbol || basket.symbol + 'D';
    const [basketPda] =
      vaultClient.getBasketPda(executionSymbol);
    const existing = await connection.getAccountInfo(
      basketPda,
      'confirmed'
    );

    if (existing) {
      console.log(
        'Basket already initialized:',
        executionSymbol,
        basketPda.toBase58()
      );
      await vaultClient.verifyBasketExecutionState(
        mirroredBasket,
        true
      );
      continue;
    }

    const tx =
      await vaultClient.buildInitializeBasketTransaction(
        authority.publicKey,
        mirroredBasket,
        true,
        0
      );

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [authority],
      { commitment: 'confirmed' }
    );

    console.log(
      'Initialized basket:',
      executionSymbol,
      basketPda.toBase58(),
      signature
    );
  }

  console.log(
    '\nNEXT_PUBLIC_PROGRAM_ID=' + programId.toBase58()
  );
  console.log(
    'Add these public values to local/Vercel environment settings:'
  );

  for (const [symbol, mint] of mirrorMints.entries()) {
    console.log(
      ENV_BY_SYMBOL[symbol] + '=' + mint.toBase58()
    );
  }

  console.log(
    '\nKeep DEVNET_MIRROR_AUTHORITY_SECRET server-side only.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
