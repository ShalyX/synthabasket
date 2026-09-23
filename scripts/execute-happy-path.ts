import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { SynthaBasketVaultClient } from '../src/lib/execution/vault_client';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import {
  calculateMintQuote,
  calculateRedeemQuote,
} from '../src/lib/services/valuation_engine';
import { BasketDefinition, BasketMintQuote } from '../src/lib/types';

const DEVNET_USDC_MINT = new PublicKey(
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
);

interface DemoStepReceipt {
  step: string;
  action: string;
  status: 'CONFIRMED' | 'FAILED';
  txSignature?: string;
  explorerUrl?: string;
  details: Record<string, unknown>;
}

function parseKeypair(value: string): Keypair {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

async function loadRunner(connection: Connection): Promise<Keypair> {
  const runnerSecret =
    process.env.RUNNER_PRIVATE_KEY ||
    process.env.DEVNET_MIRROR_AUTHORITY_SECRET;

  if (!runnerSecret) {
    throw new Error(
      'RUNNER_PRIVATE_KEY or DEVNET_MIRROR_AUTHORITY_SECRET is required. The proof runner never generates disposable wallets or fake settlement records.'
    );
  }

  const runner = parseKeypair(runnerSecret);
  const balance = await connection.getBalance(runner.publicKey, 'confirmed');
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Runner ${runner.publicKey.toBase58()} needs at least 0.05 Devnet SOL for real transaction fees.`
    );
  }
  return runner;
}

function explorer(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function attachConfiguredMirrors(basket: BasketDefinition): BasketDefinition {
  const envBySymbol: Record<string, string | undefined> = {
    'T-OpenAI':
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_OPENAI ||
      'Bj47e5GCXuaxmbPjDRF5iSVjZ1Y4uEFoaDoPUAfD1xkB',
    ANTHROPIC:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANTHROPIC ||
      'GxtkS2jUU5br9JJB64FuvvUxwp2sadxwCCRsZwiqAR3p',
    'T-Kalshi':
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_KALSHI ||
      'HSv2zqvfSXv2CQ7TW79HpQPYziNvoiY3CKpGu7Ec3hFh',
    'T-SpaceX':
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_SPACEX ||
      'B5SFgwf1nMGPAid4ngWWtn1fxpL2wTSbibmzsQzp4oaq',
    ANDURIL:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANDURIL ||
      'F2ynAT6rER45pQPh62P63TLmDqhByepTJfDaypeETBJZ',
    KALSHI:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_KALSHI ||
      '41ZBu1Frvec4r7TeQjYP4PnMSviU8vwd1wo5SZZZ5wMn',
    POLYMARKET:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_POLYMARKET ||
      '9qHJAujJTHxwn6gTzmwQKJZYDsoQGsBxAw1ygvtFboTN',
    OPENAI:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_OPENAI ||
      'JBk4GN6xhW9rmu5pAM1Ub2pdgCZs3Bkc7xBAxbvH9Rr6',
    NEURALINK:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_NEURALINK ||
      'DbUYkDnEvh9mVPJNNXdCtLksFg7RDeXgqteRvesJ2F7A',
    FIGUREAI:
      process.env.NEXT_PUBLIC_DEVNET_MIRROR_FIGUREAI ||
      '2bzfznWhXfHZqU1wRUyVCPrLAUkqP5gt5kAjjSj4b8e7',
  };

  return {
    ...basket,
    constituents: basket.constituents.map((constituent) => ({
      ...constituent,
      asset: {
        ...constituent.asset,
        devnetMint: envBySymbol[constituent.asset.symbol],
      },
    })),
  };
}

async function acquireDevnetMirrors(
  connection: Connection,
  runner: Keypair,
  authority: Keypair,
  quote: BasketMintQuote
): Promise<{
  signature: string;
  executionQuote: BasketMintQuote;
}> {
  const userUsdcAta = getAssociatedTokenAddressSync(
    DEVNET_USDC_MINT,
    runner.publicKey
  );
  const userUsdcBalance = await connection.getTokenAccountBalance(
    userUsdcAta,
    'confirmed'
  ).catch(() => null);

  const requiredUsdc = quote.allocations.reduce(
    (sum, allocation) => sum + allocation.targetUsdAmount,
    0
  );

  if (
    !userUsdcBalance ||
    Number(userUsdcBalance.value.uiAmount || 0) + 1e-9 < requiredUsdc
  ) {
    throw new Error(
      `Runner needs at least ${requiredUsdc.toFixed(2)} Devnet USDC in ${userUsdcAta.toBase58()} before the proof run.`
    );
  }

  const treasuryUsdcAta = getAssociatedTokenAddressSync(
    DEVNET_USDC_MINT,
    authority.publicKey
  );
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      runner.publicKey,
      treasuryUsdcAta,
      authority.publicKey,
      DEVNET_USDC_MINT
    )
  );

  let totalUsdcRaw = 0n;
  const executionAllocations = [];

  for (const allocation of quote.allocations) {
    if (!allocation.asset.devnetMint) {
      throw new Error(
        `Missing Devnet mirror mint for ${allocation.asset.symbol}. Run npm run provision-devnet first.`
      );
    }

    const mirrorMint = new PublicKey(allocation.asset.devnetMint);
    const mirrorInfo = await getMint(connection, mirrorMint);
    if (
      mirrorInfo.decimals !== 6 ||
      !mirrorInfo.mintAuthority?.equals(authority.publicKey)
    ) {
      throw new Error(
        `Mirror ${allocation.asset.symbol} is not a 6-decimal mint controlled by the configured authority.`
      );
    }

    const rawAmount = BigInt(
      Math.max(1, Math.floor(allocation.estimatedTokensReceived * 1_000_000))
    );
    const usdcRaw = BigInt(
      Math.max(1, Math.floor(allocation.targetUsdAmount * 1_000_000))
    );
    totalUsdcRaw += usdcRaw;

    const userMirrorAta = getAssociatedTokenAddressSync(
      mirrorMint,
      runner.publicKey
    );

    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        runner.publicKey,
        userMirrorAta,
        runner.publicKey,
        mirrorMint
      ),
      createMintToCheckedInstruction(
        mirrorMint,
        userMirrorAta,
        authority.publicKey,
        rawAmount,
        6
      )
    );

    executionAllocations.push({
      ...allocation,
      rawTokenAmount: rawAmount.toString(),
    });
  }

  tx.add(
    createTransferCheckedInstruction(
      userUsdcAta,
      DEVNET_USDC_MINT,
      treasuryUsdcAta,
      runner.publicKey,
      totalUsdcRaw,
      6
    )
  );

  const signers =
    authority.publicKey.equals(runner.publicKey)
      ? [runner]
      : [runner, authority];

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    signers,
    { commitment: 'confirmed' }
  );

  return {
    signature,
    executionQuote: {
      ...quote,
      allocations: executionAllocations,
    },
  };
}

async function runHappyPath() {
  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    'https://api.devnet.solana.com';

  if (!rpcUrl.includes('devnet')) {
    throw new Error('Happy-path proof runner is Devnet-only.');
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const runner = await loadRunner(connection);

  const authoritySecret =
    process.env.DEVNET_MIRROR_AUTHORITY_SECRET ||
    process.env.RUNNER_PRIVATE_KEY;
  if (!authoritySecret) {
    throw new Error('DEVNET_MIRROR_AUTHORITY_SECRET is required.');
  }
  const mirrorAuthority = parseKeypair(authoritySecret);

  const registryBasket = attachConfiguredMirrors(INITIAL_BASKETS[0]);
  const indicativeNav = registryBasket.constituents.reduce(
    (sum, constituent) =>
      sum +
      constituent.asset.priceUsd * (constituent.targetWeightBps / 10_000),
    0
  );
  const targetBasket = {
    ...registryBasket,
    navUsd: Number(indicativeNav.toFixed(2)),
  };
  const vaultClient = new SynthaBasketVaultClient(connection);
  const receipts: DemoStepReceipt[] = [];

  console.log('SynthaBasket REAL Devnet happy-path proof');
  console.log('Runner:', runner.publicKey.toBase58());
  console.log('Basket:', targetBasket.symbol);

  await vaultClient.verifyBasketExecutionState(targetBasket, true);

  const depositUsdc = Number(process.env.DEMO_DEPOSIT_USDC || '50');
  const quote = calculateMintQuote(targetBasket, depositUsdc);

  const acquisition = await acquireDevnetMirrors(
    connection,
    runner,
    mirrorAuthority,
    quote
  );

  receipts.push({
    step: 'Underlying Acquisition',
    action: 'Atomic Devnet USDC payment + mirror-asset issuance',
    status: 'CONFIRMED',
    txSignature: acquisition.signature,
    explorerUrl: explorer(acquisition.signature),
    details: {
      depositUsdc,
      constituents: acquisition.executionQuote.allocations.map((allocation) => ({
        symbol: allocation.asset.symbol,
        devnetMint: allocation.asset.devnetMint,
        rawAmount: allocation.rawTokenAmount,
      })),
    },
  });

  const executionSymbol =
    targetBasket.devnetExecutionSymbol || `${targetBasket.symbol}D`;
  const [executionBasketMint] =
    vaultClient.getBasketMintPda(executionSymbol);
  const userBasketAta = vaultClient.getUserTokenAccount(
    runner.publicKey,
    executionBasketMint
  );

  const readBasketSharesRaw = async (): Promise<bigint> => {
    const balance = await connection
      .getTokenAccountBalance(userBasketAta, 'confirmed')
      .catch(() => null);
    return balance ? BigInt(balance.value.amount) : 0n;
  };

  const sharesBeforeMintRaw = await readBasketSharesRaw();

  const depositTx = await vaultClient.buildMintTransaction(
    runner.publicKey,
    targetBasket,
    acquisition.executionQuote,
    50_000,
    true
  );

  const depositSignature = await sendAndConfirmTransaction(
    connection,
    depositTx,
    [runner],
    { commitment: 'confirmed' }
  );

  const sharesAfterMintRaw = await readBasketSharesRaw();
  const mintedDeltaRaw = sharesAfterMintRaw - sharesBeforeMintRaw;
  if (mintedDeltaRaw <= 0n) {
    throw new Error(
      'deposit_and_mint confirmed but the runner basket-share balance did not increase.'
    );
  }

  receipts.push({
    step: 'Vault Deposit & Basket Mint',
    action: 'Anchor deposit_and_mint with real SPL transfers',
    status: 'CONFIRMED',
    txSignature: depositSignature,
    explorerUrl: explorer(depositSignature),
    details: {
      basket: targetBasket.symbol,
      devnetExecutionSymbol: executionSymbol,
      expectedShares: acquisition.executionQuote.expectedBasketTokens,
      basketMint: executionBasketMint.toBase58(),
      userBasketTokenAccount: userBasketAta.toBase58(),
      sharesBeforeMintRaw: sharesBeforeMintRaw.toString(),
      sharesAfterMintRaw: sharesAfterMintRaw.toString(),
      mintedDeltaRaw: mintedDeltaRaw.toString(),
    },
  });

  const sharesToRedeem = Number(
    Math.max(
      0.000001,
      acquisition.executionQuote.expectedBasketTokens / 2
    ).toFixed(6)
  );
  const redeemQuote = calculateRedeemQuote(targetBasket, sharesToRedeem);
  const redeemTx = await vaultClient.buildRedeemTransaction(
    runner.publicKey,
    targetBasket,
    redeemQuote,
    50_000,
    true
  );

  const sharesBeforeRedeemRaw = await readBasketSharesRaw();

  const redeemSignature = await sendAndConfirmTransaction(
    connection,
    redeemTx,
    [runner],
    { commitment: 'confirmed' }
  );

  const sharesAfterRedeemRaw = await readBasketSharesRaw();
  const burnedDeltaRaw = sharesBeforeRedeemRaw - sharesAfterRedeemRaw;
  if (burnedDeltaRaw <= 0n) {
    throw new Error(
      'burn_and_redeem confirmed but the runner basket-share balance did not decrease.'
    );
  }

  receipts.push({
    step: 'Burn & Redeem',
    action: 'Anchor burn_and_redeem with proportional SPL release',
    status: 'CONFIRMED',
    txSignature: redeemSignature,
    explorerUrl: explorer(redeemSignature),
    details: {
      sharesBurned: sharesToRedeem,
      sharesBeforeRedeemRaw: sharesBeforeRedeemRaw.toString(),
      sharesAfterRedeemRaw: sharesAfterRedeemRaw.toString(),
      burnedDeltaRaw: burnedDeltaRaw.toString(),
      constituents: redeemQuote.constituentsToReturn.map((item) => ({
        symbol: item.asset.symbol,
      })),
    },
  });

  const markdown = generateReceiptsMarkdown(
    receipts,
    runner.publicKey.toBase58(),
    targetBasket
  );
  const receiptsPath = path.join(__dirname, '..', 'DEMO_RUN_RECEIPTS.md');
  fs.writeFileSync(receiptsPath, markdown, 'utf8');

  console.log('REAL happy path confirmed.');
  console.log('Receipts:', receiptsPath);
}

function generateReceiptsMarkdown(
  receipts: DemoStepReceipt[],
  runnerAddress: string,
  basket: BasketDefinition
): string {
  return `# SynthaBasket — Verified Devnet Execution Receipts

Generated only after the actual acquisition, Anchor deposit/mint, and Anchor burn/redeem transactions confirm on Solana Devnet. Simulations and unrelated transfer transactions are not counted as execution proof.

**Execution Timestamp**: \`${new Date().toISOString()}\`  
**Runner Wallet**: [\`${runnerAddress}\`](https://explorer.solana.com/address/${runnerAddress}?cluster=devnet)  
**Target Basket**: **${basket.name} ($${basket.symbol})**

---

${receipts
  .map(
    (receipt, index) => `## ${index + 1}. ${receipt.step}

- **Action**: ${receipt.action}
- **Status**: **${receipt.status}**
${receipt.txSignature ? `- **Transaction**: [\`${receipt.txSignature}\`](${receipt.explorerUrl})` : ''}
- **Details**:

\`\`\`json
${JSON.stringify(receipt.details, null, 2)}
\`\`\`
`
  )
  .join('\n---\n\n')}

---

## Proof standard

A transaction is marked **CONFIRMED** only when the transaction that performs the claimed operation is itself broadcast and confirmed. A setup transfer, self-transfer, route estimate, or simulation is never substituted for execution proof.
`;
}

runHappyPath().catch((error) => {
  console.error('\nHAPPY PATH FAILED');
  console.error(error);
  process.exit(1);
});
