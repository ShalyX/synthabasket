import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import { calculateMintQuote } from '../src/lib/services/valuation_engine';
import { getDevnetMirrorMint } from '../src/lib/execution/devnet_mirrors';
import { SynthaBasketVaultClient } from '../src/lib/execution/vault_client';

const signature = process.env.UI_ACQUISITION_SIGNATURE;
if (!signature) throw new Error('UI_ACQUISITION_SIGNATURE is required.');

const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

async function main() {
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error('Acquisition transaction not found.');

  const message: any = tx.transaction.message;
  const accountKeys: PublicKey[] = message.staticAccountKeys || message.accountKeys;
  const user = new PublicKey(accountKeys[0]);

  console.log('Acquisition signature:', signature);
  console.log('User / fee payer:', user.toBase58());
  console.log('SOL lamports:', await connection.getBalance(user, 'confirmed'));

  const basket = {
    ...INITIAL_BASKETS[0],
    constituents: INITIAL_BASKETS[0].constituents.map((c) => ({
      ...c,
      asset: {
        ...c.asset,
        devnetMint: getDevnetMirrorMint(c.asset.symbol),
      },
    })),
  };

  const quote = calculateMintQuote(basket, 10);
  const executionQuote = {
    ...quote,
    allocations: quote.allocations.map((allocation) => ({
      ...allocation,
      rawTokenAmount: String(
        Math.max(
          1,
          Math.floor(
            (allocation.targetUsdAmount / allocation.asset.priceUsd) * 1_000_000
          )
        )
      ),
    })),
  };

  console.log('Expected basket shares:', executionQuote.expectedBasketTokens);

  for (const allocation of executionQuote.allocations) {
    const mint = new PublicKey(allocation.asset.devnetMint!);
    const ata = getAssociatedTokenAddressSync(mint, user);
    const balance = await connection.getTokenAccountBalance(ata, 'confirmed').catch(() => null);
    console.log(
      allocation.asset.symbol,
      'ATA', ata.toBase58(),
      'requiredRaw', allocation.rawTokenAmount,
      'balanceRaw', balance?.value.amount || 'MISSING'
    );
  }

  const vaultClient = new SynthaBasketVaultClient(connection);
  await vaultClient.verifyBasketExecutionState(basket, true);
  await vaultClient.verifyDepositBalances(user, basket, executionQuote, true);

  const depositQuote = await vaultClient.prepareProportionalMintQuote(
    basket,
    executionQuote,
    true
  );
  console.log('Adjusted basket shares:', depositQuote.expectedBasketTokens);
  for (const allocation of depositQuote.allocations) {
    console.log(
      'Deposit leg',
      allocation.asset.symbol,
      'raw',
      allocation.rawTokenAmount
    );
  }

  const executionSymbol = basket.devnetExecutionSymbol || basket.symbol + 'D';
  const [basketMint] = vaultClient.getBasketMintPda(executionSymbol);
  const userBasketAta = vaultClient.getUserTokenAccount(user, basketMint);
  const basketAtaInfo = await connection.getAccountInfo(userBasketAta, 'confirmed');
  console.log('Basket mint:', basketMint.toBase58());
  console.log('User basket ATA:', userBasketAta.toBase58(), basketAtaInfo ? 'exists' : 'missing');

  const depositTx = await vaultClient.buildMintTransaction(
    user,
    basket,
    depositQuote,
    50_000,
    true
  );

  const latest = await connection.getLatestBlockhash('confirmed');
  depositTx.recentBlockhash = latest.blockhash;
  depositTx.feePayer = user;

  const simulation = await connection.simulateTransaction(depositTx);
  console.log('SIMULATION ERROR:', JSON.stringify(simulation.value.err));
  console.log('SIMULATION UNITS:', simulation.value.unitsConsumed);
  console.log('SIMULATION LOGS:');
  for (const line of simulation.value.logs || []) console.log(line);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
