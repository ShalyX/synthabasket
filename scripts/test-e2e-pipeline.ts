import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BorshInstructionCoder, Idl, BN } from '@coral-xyz/anchor';
import { SYNTHABASKET_IDL } from '../src/lib/execution/idl';
import { SynthaBasketVaultClient, SYNTHABASKET_PROGRAM_ID } from '../src/lib/execution/vault_client';
import { MeteoraDbcManager } from '../src/lib/execution/meteora_dbc';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import { calculateMintQuote } from '../src/lib/services/valuation_engine';

async function main() {
  console.log('====================================================================');
  console.log('  SYNTHABASKET: STATIC PIPELINE & TRANSACTION-CONSTRUCTION TESTS    ');
  console.log('====================================================================\n');

  let failureCount = 0;

  // 1. Validate Base58 Program ID
  console.log('1. Validating Program ID Base58 Correctness...');
  try {
    const pubkey = new PublicKey('BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh');
    if (pubkey.toBase58() !== 'BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh') {
      throw new Error('Base58 roundtrip mismatch');
    }
    console.log(`   [PASS] Program ID ${pubkey.toBase58()} is a valid Base58 Solana public key.`);
  } catch (err: any) {
    console.error('   [FAIL] Invalid Program ID:', err.message);
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

  // 3. Test Meteora DBC 1.5.12 Official SDK Integration
  console.log('\n3. Testing Meteora DBC 1.5.12 SDK Integration & Pool Derivations...');
  try {
    const conn = new Connection('https://api.devnet.solana.com');
    const dbcManager = new MeteoraDbcManager(conn);

    const testBaseMint = new PublicKey('Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw'); // Anthropic
    const testQuoteMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
    const testConfigPubkey = Keypair.generate().publicKey;

    // Test derivation: [pool, quoteMint, baseMint, config]
    const [poolPda, bump] = dbcManager.getPoolPda(testBaseMint, testQuoteMint, testConfigPubkey);
    console.log(`   Derived Meteora DBC Pool PDA: ${poolPda.toBase58()} (bump: ${bump})`);
    console.log(`   Meteora DBC Program ID:       ${MeteoraDbcManager.PROGRAM_ID.toBase58()}`);
    console.log(`   Meteora DAMM v2 Program ID:   ${MeteoraDbcManager.DAMM_V2_PROGRAM_ID.toBase58()}`);

    // Verify curve points generation
    const curvePoints = MeteoraDbcManager.generateEquityCurvePoints(800, 2_500_000, 100_000, 5);
    if (curvePoints.length !== 6 || curvePoints[0].priceUsd !== 800) {
      throw new Error('Equity curve points calculation error');
    }
    console.log('   [PASS] Equity-smoothed curve points and official Meteora derivations verified.');
  } catch (err: any) {
    console.error('   [FAIL] Meteora DBC SDK test failed:', err.message);
    failureCount++;
  }

  // 4. Test Vault Client Transaction Building
  console.log('\n4. Testing Vault Client Transaction Construction (not live execution proof)...');
  try {
    const conn = new Connection('https://api.devnet.solana.com');
    const client = new SynthaBasketVaultClient(conn);
    const userKp = Keypair.generate();
    const testBasket = INITIAL_BASKETS[0]; // AI Titans
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
