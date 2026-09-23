import { PublicKey } from '@solana/web3.js';
import { fetchPreStocksAssets } from '../src/lib/services/prestocks';
import { fetchTesseraAssets } from '../src/lib/services/tessera';
import { fetchPythPrivateIndexBenchmarks } from '../src/lib/services/pyth';
import { calculateBasketNav } from '../src/lib/services/valuation_engine';
import { INITIAL_BASKETS } from '../src/lib/data/registry';
import { AssetQuote } from '../src/lib/types';

function isValidBase58(str: string): boolean {
  try {
    new PublicKey(str);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('===============================================================');
  console.log('  SYNTHABASKET PROTOCOL: LOUD-FAILING API & SCHEMA TEST SUITE  ');
  console.log('===============================================================\n');

  let failureCount = 0;

  // 1. PreStocks API
  console.log('1. Testing Live PreStocks API (Strict Schema & Mint Validation)...');
  try {
    const prestocksAssets = await fetchPreStocksAssets({ throwOnError: true });
    if (!prestocksAssets || prestocksAssets.length === 0) {
      throw new Error('PreStocks API returned 0 assets');
    }
    console.log(`   [PASS] Live PreStocks API returned ${prestocksAssets.length} assets.`);

    // Strict schema check
    for (const asset of prestocksAssets) {
      if (!asset.symbol || typeof asset.symbol !== 'string') {
        throw new Error(`Invalid symbol in PreStocks asset: ${JSON.stringify(asset)}`);
      }
      if (typeof asset.priceUsd !== 'number' || asset.priceUsd <= 0) {
        throw new Error(`Invalid price for PreStocks asset ${asset.symbol}: ${asset.priceUsd}`);
      }
      if (!isValidBase58(asset.tokenMint)) {
        throw new Error(`Invalid base58 token mint for ${asset.symbol}: ${asset.tokenMint}`);
      }
    }
    console.log('   [PASS] All PreStocks assets passed base58 address & price sanity checks.');
  } catch (err: any) {
    console.error('   [FAIL] PreStocks API failed loudly:', err.message);
    failureCount++;
  }

  // 2. Tessera API
  console.log('\n2. Testing Live Tessera API (Strict Schema & Mint Validation)...');
  try {
    const tesseraAssets = await fetchTesseraAssets({ throwOnError: true });
    if (!tesseraAssets || tesseraAssets.length === 0) {
      throw new Error('Tessera API returned 0 assets');
    }
    console.log(`   [PASS] Live Tessera API returned ${tesseraAssets.length} assets.`);

    for (const asset of tesseraAssets) {
      if (!asset.symbol || typeof asset.symbol !== 'string') {
        throw new Error(`Invalid symbol in Tessera asset: ${JSON.stringify(asset)}`);
      }
      if (typeof asset.priceUsd !== 'number' || asset.priceUsd <= 0) {
        throw new Error(`Invalid price for Tessera asset ${asset.symbol}: ${asset.priceUsd}`);
      }
      if (!isValidBase58(asset.tokenMint)) {
        throw new Error(`Invalid base58 token mint for ${asset.symbol}: ${asset.tokenMint}`);
      }
    }
    console.log('   [PASS] All Tessera assets passed base58 address & price sanity checks.');
  } catch (err: any) {
    console.error('   [FAIL] Tessera API failed loudly:', err.message);
    failureCount++;
  }

  // 3. Pyth private-company indices
  console.log('\n3. Testing optional Pyth private-index entitlement...');
  try {
    const apiKey = process.env.PYTH_INDEX_API_KEY;

    if (!apiKey) {
      console.warn('   [WARNING] No PYTH_INDEX_API_KEY found; skipping entitled private-index reads.');
      console.log('   [PASS] Pyth private-index integration is correctly optional.');
    } else {
      const benchmarks = await fetchPythPrivateIndexBenchmarks(
        ['OPENAI', 'ANTHROPIC'],
        { throwOnError: true, apiKey }
      );

      const received = Object.keys(benchmarks);
      if (received.length === 0) {
        throw new Error(
          'Pyth private-index API returned no entitled OpenAI/Anthropic benchmark values'
        );
      }

      console.log(
        `   [PASS] Received ${received.length} entitled Pyth private-index benchmark(s).`
      );
    }
  } catch (err: any) {
    console.error('   [FAIL] Pyth private-index check failed loudly:', err.message);
    failureCount++;
  }

  // 4. Basket NAV Calculation
  console.log('\n4. Testing NAV Calculation on Curated Baskets with Real Mints...');
  try {
    const assetMap = new Map<string, AssetQuote>();
    INITIAL_BASKETS.forEach((b) => {
      b.constituents.forEach((c) => assetMap.set(c.asset.tokenMint, c.asset));
    });

    for (const b of INITIAL_BASKETS) {
      const { navUsd, navChange24h } = calculateBasketNav(b, assetMap);
      if (navUsd <= 0) {
        throw new Error(`Calculated NAV for ${b.symbol} is invalid: ${navUsd}`);
      }
      console.log(`   [PASS] ${b.name} ($${b.symbol}): NAV = $${navUsd}, Delta = ${navChange24h}%`);
    }
  } catch (err: any) {
    console.error('   [FAIL] Basket NAV calculation failed:', err.message);
    failureCount++;
  }

  console.log('\n===============================================================');
  if (failureCount > 0) {
    console.error(`  TEST SUITE FAILED WITH ${failureCount} FAILURE(S)`);
    console.log('===============================================================');
    process.exit(1);
  } else {
    console.log('  ALL STRICT VERIFICATION CHECKS PASSED SUCCESSFULLY          ');
    console.log('===============================================================');
  }
}

main().catch((e) => {
  console.error('Unhandled fatal error in verify-apis:', e);
  process.exit(1);
});
