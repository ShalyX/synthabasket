import { PublicKey } from '@solana/web3.js';
import { fetchPreStocksAssets } from '../src/lib/services/prestocks';
import { fetchTesseraAssets } from '../src/lib/services/tessera';
import { resolvePythPrivateIndexBenchmarks } from '../src/lib/services/pyth';
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
      if (asset.quoteSource !== 'live') {
        throw new Error(
          `Strict Tessera verification unexpectedly returned ${asset.quoteSource || 'unknown'} data for ${asset.symbol}`
        );
      }
    }

    const expectedTesseraMints = [
      'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
      'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
      'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
    ];
    const tesseraMints = new Set(tesseraAssets.map((asset) => asset.tokenMint));
    for (const mint of expectedTesseraMints) {
      if (!tesseraMints.has(mint)) {
        throw new Error(
          `Tessera Product API omitted expected STOCKLANA integration mint ${mint}`
        );
      }
    }

    console.log(
      '   [PASS] Tessera returned live data for all expected STOCKLANA T-Token mints.'
    );
  } catch (err: any) {
    console.error('   [FAIL] Tessera API failed loudly:', err.message);
    failureCount++;
  }

  // 3. Pyth private-company indices
  console.log('\n3. Checking Pyth private-index access contract...');
  try {
    const resolution = await resolvePythPrivateIndexBenchmarks(
      ['OPENAI', 'ANTHROPIC'],
      {
        apiKey:
          process.env.PYTH_PRO_API_KEY ||
          process.env.PYTH_INDEX_API_KEY,
      }
    );

    if (resolution.status === 'available') {
      console.log(
        `   [PASS] Received ${Object.keys(resolution.benchmarks).length} Pyth Index benchmark value(s).`
      );
    } else if (resolution.status === 'index_access_required') {
      console.warn(
        '   [WARNING] OpenAI/Anthropic are Pyth Indices with separate commercial access from Pyth Pro.'
      );
      console.log(
        '   [PASS] Integration fails closed instead of treating Pyth Indices as ordinary Pro feeds.'
      );
    } else if (resolution.status === 'pro_key_missing') {
      console.warn(
        '   [WARNING] No Pyth Pro API key configured; authenticated Pro reads are skipped.'
      );
      console.log('   [PASS] Optional Pyth integration remains fail-closed.');
    } else {
      throw new Error(
        resolution.detail ||
          `Unexpected Pyth resolution status: ${resolution.status}`
      );
    }
  } catch (err: any) {
    console.error('   [FAIL] Pyth integration contract check failed:', err.message);
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
