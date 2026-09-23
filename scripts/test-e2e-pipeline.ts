import { Connection, Keypair } from '@solana/web3.js';
import { BorshInstructionCoder, Idl, BN } from '@coral-xyz/anchor';
import { SYNTHABASKET_IDL } from '../src/lib/execution/idl';
import { SynthaBasketVaultClient, SYNTHABASKET_PROGRAM_ID } from '../src/lib/execution/vault_client';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import { calculateMintQuote } from '../src/lib/services/valuation_engine';

async function main() {
  console.log('====================================================================');
  console.log('  SYNTHABASKET: STATIC PIPELINE & TRANSACTION-CONSTRUCTION TESTS    ');
  console.log('====================================================================\n');

  let failureCount = 0;

  // 1. Validate that client/runtime metadata points at the verified Devnet program.
  console.log('1. Validating SynthaBasket Devnet Program ID...');
  try {
    const expectedProgramId = '4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA';
    if (SYNTHABASKET_PROGRAM_ID.toBase58() !== expectedProgramId) {
      throw new Error(
        `Program ID mismatch: client uses ${SYNTHABASKET_PROGRAM_ID.toBase58()}, expected ${expectedProgramId}`
      );
    }
    console.log(`   [PASS] Program ID ${expectedProgramId} matches the verified Devnet execution target.`);
  } catch (err: any) {
    console.error('   [FAIL] Program ID mismatch:', err.message);
    failureCount++;
  }

  // 2. Validate Anchor Discriminators via BorshInstructionCoder
  console.log('\n2. Testing Anchor Instruction Encoding & Default Discriminators...');
  try {
    const coder = new BorshInstructionCoder(SYNTHABASKET_IDL as unknown as Idl);

    // Test depositAndMint
    const depositData = coder.encode('depositAndMint', {
      sharesToMint: new BN(1_000_000),
      constituentAmountsIn: [new BN(500_000), new BN(500_000)],
    });
    const depositDiscriminator = Array.from(depositData.slice(0, 8));
    const expectedDepositDiscriminator = [97, 126, 119, 210, 67, 186, 64, 23];

    console.log(`   depositAndMint discriminator: [${depositDiscriminator.join(', ')}]`);
    if (JSON.stringify(depositDiscriminator) !== JSON.stringify(expectedDepositDiscriminator)) {
      throw new Error(
        `depositAndMint discriminator mismatch! Got [${depositDiscriminator}], expected [${expectedDepositDiscriminator}]`
      );
    }
    console.log('   [PASS] depositAndMint matches standard Anchor sha256("global:deposit_and_mint")[..8]');

    // Test burnAndRedeem
    const redeemData = coder.encode('burnAndRedeem', {
      sharesToBurn: new BN(500_000),
    });
    const redeemDiscriminator = Array.from(redeemData.slice(0, 8));
    const expectedRedeemDiscriminator = [2, 82, 184, 230, 13, 208, 102, 164];

    console.log(`   burnAndRedeem discriminator:  [${redeemDiscriminator.join(', ')}]`);
    if (JSON.stringify(redeemDiscriminator) !== JSON.stringify(expectedRedeemDiscriminator)) {
      throw new Error(
        `burnAndRedeem discriminator mismatch! Got [${redeemDiscriminator}], expected [${expectedRedeemDiscriminator}]`
      );
    }
    console.log('   [PASS] burnAndRedeem matches standard Anchor sha256("global:burn_and_redeem")[..8]');
  } catch (err: any) {
    console.error('   [FAIL] Anchor IDL encoding test failed:', err.message);
    failureCount++;
  }

  // 3. Test Vault Client Transaction Building
  console.log('\n3. Testing Vault Client Transaction Construction (not live execution proof)...');
  try {
    const conn = new Connection('https://api.devnet.solana.com');
    const client = new SynthaBasketVaultClient(conn);
    const userKp = Keypair.generate();
    const registryBasket = INITIAL_BASKETS[0]; // AI Titans
    const indicativeNav = registryBasket.constituents.reduce(
      (sum, constituent) =>
        sum +
        constituent.asset.priceUsd * (constituent.targetWeightBps / 10_000),
      0
    );
    const testBasket = { ...registryBasket, navUsd: indicativeNav };
    const quote = calculateMintQuote(testBasket, 100);

    const mintTx = await client.buildMintTransaction(userKp.publicKey, testBasket, quote);
    console.log(`   Generated mint transaction with ${mintTx.instructions.length} instructions.`);
    if (mintTx.instructions.length < 3) {
      throw new Error('Expected at least compute budget, ATA creation, and deposit instructions');
    }

    const redeemQuote = {
      basketId: testBasket.id,
      burnBasketTokensAmount: 0.5,
      expectedUsdcValue: 400,
      constituentsToReturn: testBasket.constituents.map((c) => ({
        asset: c.asset,
        tokenAmount: 0.25,
        valueUsd: 100,
      })),
    };
    const redeemTx = await client.buildRedeemTransaction(userKp.publicKey, testBasket, redeemQuote);
    console.log(`   Generated redeem transaction with ${redeemTx.instructions.length} instructions.`);
    console.log('   [PASS] Vault client constructed IDL-encoded instructions. This test does not claim on-chain execution.');
  } catch (err: any) {
    console.error('   [FAIL] Vault client transaction building failed:', err.message);
    failureCount++;
  }

  console.log('\n====================================================================');
  if (failureCount > 0) {
    console.error(`  PIPELINE AUDIT FAILED WITH ${failureCount} FAILURE(S)`);
    console.log('====================================================================');
    process.exit(1);
  } else {
    console.log('  ALL STATIC PIPELINE TESTS PASSED                                   ');
    console.log('====================================================================');
  }
}

main().catch((e) => {
  console.error('Unhandled fatal error:', e);
  process.exit(1);
});
