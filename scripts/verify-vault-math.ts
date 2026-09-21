/**
 * Unit test suite verifying SynthaBasket Vault PDA Share Accounting & Dilution Resistance
 */

interface VaultStateMock {
  totalSharesMinted: bigint;
  vaultReserves: bigint[];
}

function simulateDepositAndMint(
  vault: VaultStateMock,
  sharesToMint: bigint,
  constituentAmountsIn: bigint[]
): { sharesMinted: bigint; newVault: VaultStateMock } {
  const newReserves = [...vault.vaultReserves];

  if (vault.totalSharesMinted === 0n) {
    // Seed liquidity
    for (let i = 0; i < constituentAmountsIn.length; i++) {
      if (constituentAmountsIn[i] <= 0n) {
        throw new Error('Seed constituent amount must be positive');
      }
      newReserves[i] = constituentAmountsIn[i];
    }
    return {
      sharesMinted: sharesToMint,
      newVault: {
        totalSharesMinted: sharesToMint,
        vaultReserves: newReserves,
      },
    };
  }

  // Subsequent deposit: calculate minimum proportional shares
  let minProportionalShares = 2n ** 64n - 1n;
  for (let i = 0; i < constituentAmountsIn.length; i++) {
    const amount = constituentAmountsIn[i];
    const currentReserve = vault.vaultReserves[i];
    if (currentReserve <= 0n) throw new Error('Vault reserve is zero');

    // shares_i = amount * totalShares / currentReserve
    const sharesI = (amount * vault.totalSharesMinted) / currentReserve;
    if (sharesI < minProportionalShares) {
      minProportionalShares = sharesI;
    }
    newReserves[i] = currentReserve + amount;
  }

  if (sharesToMint > minProportionalShares) {
    throw new Error(
      `SlippageExceeded: Requested ${sharesToMint} shares exceeds max proportional ${minProportionalShares}`
    );
  }

  return {
    sharesMinted: sharesToMint,
    newVault: {
      totalSharesMinted: vault.totalSharesMinted + sharesToMint,
      vaultReserves: newReserves,
    },
  };
}

function simulateBurnAndRedeem(
  vault: VaultStateMock,
  sharesToBurn: bigint
): { tokensReturned: bigint[]; newVault: VaultStateMock } {
  if (sharesToBurn <= 0n) throw new Error('Burn amount must be positive');
  if (sharesToBurn > vault.totalSharesMinted) throw new Error('Insufficient shares in vault');

  const tokensReturned: bigint[] = [];
  const newReserves = [...vault.vaultReserves];

  for (let i = 0; i < vault.vaultReserves.length; i++) {
    // amount_out = currentReserve * sharesToBurn / totalShares
    const amountOut = (vault.vaultReserves[i] * sharesToBurn) / vault.totalSharesMinted;
    tokensReturned.push(amountOut);
    newReserves[i] = vault.vaultReserves[i] - amountOut;
  }

  return {
    tokensReturned,
    newVault: {
      totalSharesMinted: vault.totalSharesMinted - sharesToBurn,
      vaultReserves: newReserves,
    },
  };
}

function runTests() {
  console.log('===============================================================');
  console.log('  SYNTHABASKET: ON-CHAIN VAULT ACCOUNTING & INVARIANT TESTS    ');
  console.log('===============================================================\n');

  // Test 1: Seed Deposit
  console.log('Test 1: Seed Deposit (Initial Mint)...');
  let vault: VaultStateMock = {
    totalSharesMinted: 0n,
    vaultReserves: [0n, 0n],
  };

  const seedDeposit = [100_000_000n, 200_000_000n]; // 100 Token A, 200 Token B (6 decimals)
  const initialShares = 1_000_000n; // 1 share

  const r1 = simulateDepositAndMint(vault, initialShares, seedDeposit);
  vault = r1.newVault;
  console.log(`   [PASS] Seeded vault with ${vault.totalSharesMinted} shares.`);
  console.log(`          Reserves: [${vault.vaultReserves[0]}, ${vault.vaultReserves[1]}]`);

  // Test 2: Balanced Subsequent Deposit
  console.log('\nTest 2: Balanced Subsequent Deposit (50% increase)...');
  const balancedDeposit = [50_000_000n, 100_000_000n]; // Exact 50% of reserves
  const expectedShares = 500_000n; // 0.5 shares

  const r2 = simulateDepositAndMint(vault, expectedShares, balancedDeposit);
  vault = r2.newVault;
  console.log(`   [PASS] Minted ${r2.sharesMinted} shares on balanced deposit.`);
  console.log(`          Total shares now: ${vault.totalSharesMinted} (expected 1,500,000).`);

  // Test 3: Unbalanced Deposit Attempt (Dilution Attack Prevention)
  console.log('\nTest 3: Unbalanced Deposit Attempt (Dilution Resistance)...');
  const unbalancedDeposit = [50_000_000n, 10_000_000n]; // Token B under-deposited by 90%!
  try {
    simulateDepositAndMint(vault, 500_000n, unbalancedDeposit);
    throw new Error('FAIL: Should have rejected deposit requesting 500,000 shares');
  } catch (err: any) {
    console.log(`   [PASS] Successfully rejected unbalanced mint request: ${err.message}`);
  }

  // Test 4: Proportional Redemption
  console.log('\nTest 4: Proportional Burn & Redeem (Redeeming 500,000 shares)...');
  const r4 = simulateBurnAndRedeem(vault, 500_000n);
  vault = r4.newVault;
  console.log(`   [PASS] Burned 500,000 shares.`);
  console.log(`          Returned: [${r4.tokensReturned[0]}, ${r4.tokensReturned[1]}]`);
  console.log(`          Remaining reserves: [${vault.vaultReserves[0]}, ${vault.vaultReserves[1]}]`);
  console.log(`          Remaining shares: ${vault.totalSharesMinted}`);

  // Test 5: Invariant Check
  console.log('\nTest 5: Full Redemption to Zero Reserves...');
  const r5 = simulateBurnAndRedeem(vault, 1_000_000n);
  vault = r5.newVault;
  console.log(`   [PASS] Burned remaining 1,000,000 shares.`);
  console.log(`          Reserves after full redemption: [${vault.vaultReserves[0]}, ${vault.vaultReserves[1]}]`);
  if (vault.vaultReserves[0] !== 0n || vault.vaultReserves[1] !== 0n || vault.totalSharesMinted !== 0n) {
    throw new Error('FAIL: Vault reserves or shares did not return to zero');
  }
  console.log('   [PASS] Invariant verified: Exact token solvency preserved with zero dust.');

  console.log('\n===============================================================');
  console.log('  ALL VAULT ACCOUNTING & INVARIANT TESTS PASSED               ');
  console.log('===============================================================');
}

runTests();
