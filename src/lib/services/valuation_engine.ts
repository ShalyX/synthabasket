import { AssetQuote, BasketDefinition, BasketMintQuote, BasketRedeemQuote, BasisMonitorItem, ProviderMode } from '../types';
import { fetchPreStocksAssets } from './prestocks';
import { fetchTesseraAssets } from './tessera';
import {
  computeBasisSpread,
  fetchPythPrices,
  fetchPythPrivateIndexBenchmarks,
  getPythPrivateIndexSymbol,
  normalizePrivateMarketUnderlying,
} from './pyth';
import { withDevnetMirror } from '../execution/devnet_mirrors';

export async function getUnifiedAssetQuotes(mode: ProviderMode = 'multi'): Promise<AssetQuote[]> {
  const prestocksPromise = fetchPreStocksAssets();
  const tesseraPromise = mode === 'multi' ? fetchTesseraAssets() : Promise.resolve([]);

  const [prestocks, tessera] = await Promise.all([prestocksPromise, tesseraPromise]);
  const combined = [...prestocks, ...tessera].map(withDevnetMirror);

  const feedIds = combined
    .map((asset) => asset.pythFeedId)
    .filter((id): id is string => Boolean(id));
  const underlyings = combined.map((asset) => normalizePrivateMarketUnderlying(asset.symbol));

  const [pythPrices, privateIndexBenchmarks] = await Promise.all([
    feedIds.length > 0 ? fetchPythPrices(feedIds) : Promise.resolve<Record<string, number>>({}),
    fetchPythPrivateIndexBenchmarks(underlyings),
  ]);

  return combined.map((asset) => {
    const underlying = normalizePrivateMarketUnderlying(asset.symbol);
    const privateIndex = privateIndexBenchmarks[underlying];
    const privateIndexSymbol = getPythPrivateIndexSymbol(asset.symbol);

    if (privateIndex) {
      return {
        ...asset,
        pythBenchmarkSymbol: privateIndex.symbol,
        pythBenchmarkPriceUsd: privateIndex.priceUsd,
        pythBenchmarkSource: 'pyth_index' as const,
        pythBenchmarkIndicative: true,
        pythBenchmarkPublishedAt: privateIndex.publishedAt,
        // Pyth explicitly describes the private-company indices as indicative
        // company-level signals. Do not infer token-price basis from them.
        pythBenchmarkComparable: false,
        basisSpreadBps: undefined,
      };
    }

    if (asset.pythFeedId) {
      const pythPrice = pythPrices[asset.pythFeedId] || pythPrices[`0x${asset.pythFeedId}`];
      if (pythPrice) {
        const comparable = asset.pythBenchmarkComparable === true;
        const spreadBps = comparable
          ? computeBasisSpread(asset.priceUsd, pythPrice).spreadBps
          : undefined;
        return {
          ...asset,
          pythBenchmarkSymbol: asset.pythBenchmarkSymbol || asset.pythFeedId,
          pythBenchmarkPriceUsd: pythPrice,
          pythBenchmarkSource: 'pyth_core' as const,
          pythBenchmarkIndicative: false,
          basisSpreadBps: spreadBps,
        };
      }
    }

    return {
      ...asset,
      // Surface that an official Pyth Index exists even when the deployment has
      // not yet been granted index access. This is metadata, not a live value.
      pythBenchmarkSymbol: privateIndexSymbol || asset.pythBenchmarkSymbol,
    };
  });
}

export function calculateBasketNav(
  basket: BasketDefinition,
  liveAssetMap: Map<string, AssetQuote>
): { navUsd: number; navChange24h: number; navChange24hAvailable: boolean } {
  let totalNav = 0;
  let weightedChange = 0;
  let hasComplete24hData = true;

  for (const constituent of basket.constituents) {
    const liveAsset = liveAssetMap.get(constituent.asset.tokenMint) || constituent.asset;
    const weightFraction = constituent.targetWeightBps / 10000;
    totalNav += liveAsset.priceUsd * weightFraction;

    if (liveAsset.change24hAvailable === true) {
      weightedChange += liveAsset.change24h * weightFraction;
    } else {
      hasComplete24hData = false;
    }
  }

  return {
    navUsd: Number(totalNav.toFixed(2)),
    navChange24h: hasComplete24hData ? Number(weightedChange.toFixed(2)) : 0,
    navChange24hAvailable: hasComplete24hData,
  };
}

export function calculateMintQuote(
  basket: BasketDefinition,
  depositUsdcAmount: number,
  protocolFeeBps: number = 0 // disabled until an on-chain fee collector is implemented
): BasketMintQuote {
  const protocolFeeUsdc = (depositUsdcAmount * protocolFeeBps) / 10000;
  const netInvestAmount = depositUsdcAmount - protocolFeeUsdc;

  const allocations = basket.constituents.map(c => {
    const targetUsd = netInvestAmount * (c.targetWeightBps / 10000);
    const estimatedTokens = c.asset.priceUsd > 0 ? targetUsd / c.asset.priceUsd : 0;
    return {
      asset: withDevnetMirror(c.asset),
      targetUsdAmount: Number(targetUsd.toFixed(2)),
      estimatedTokensReceived: Number(estimatedTokens.toFixed(4)),
    };
  });

  const expectedBasketTokens = basket.navUsd > 0 ? Number((netInvestAmount / basket.navUsd).toFixed(4)) : 0;

  return {
    basketId: basket.id,
    depositUsdcAmount,
    expectedBasketTokens,
    protocolFeeUsdc: Number(protocolFeeUsdc.toFixed(2)),
    allocations,
    estimatedNavUsd: basket.navUsd,
  };
}

export function calculateRedeemQuote(
  basket: BasketDefinition,
  burnBasketTokensAmount: number
): BasketRedeemQuote {
  const totalValueUsd = burnBasketTokensAmount * basket.navUsd;

  const constituentsToReturn = basket.constituents.map(c => {
    const fraction = c.targetWeightBps / 10000;
    const constituentValueUsd = totalValueUsd * fraction;
    const tokenAmount = c.asset.priceUsd > 0 ? constituentValueUsd / c.asset.priceUsd : 0;

    return {
      asset: c.asset,
      tokenAmount: Number(tokenAmount.toFixed(4)),
      valueUsd: Number(constituentValueUsd.toFixed(2)),
    };
  });

  return {
    basketId: basket.id,
    burnBasketTokensAmount,
    expectedUsdcValue: Number(totalValueUsd.toFixed(2)),
    constituentsToReturn,
  };
}

export function generateBasisMonitoringLedger(assets: AssetQuote[]): BasisMonitorItem[] {
  return assets
    .map((asset) => {
      const benchmarkPrice =
        typeof asset.pythBenchmarkPriceUsd === 'number' &&
        Number.isFinite(asset.pythBenchmarkPriceUsd) &&
        asset.pythBenchmarkPriceUsd > 0
          ? asset.pythBenchmarkPriceUsd
          : undefined;

      const benchmarkSpreadBps =
        benchmarkPrice && asset.pythBenchmarkComparable === true
          ? computeBasisSpread(asset.priceUsd, benchmarkPrice).spreadBps
          : undefined;

      return {
        symbol: asset.symbol,
        name: asset.name,
        tokenMint: asset.tokenMint,
        provider: asset.provider,
        providerMarkPriceUsd: asset.priceUsd,
        impliedValuationUsd: asset.marketCapUsd,
        change24h: asset.change24h,
        change24hAvailable: asset.change24hAvailable === true,
        quoteSource: asset.quoteSource || 'snapshot',
        pythBenchmarkSymbol: asset.pythBenchmarkSymbol,
        pythBenchmarkPriceUsd: benchmarkPrice,
        pythBenchmarkSource: asset.pythBenchmarkSource,
        pythBenchmarkIndicative: asset.pythBenchmarkIndicative,
        pythBenchmarkPublishedAt: asset.pythBenchmarkPublishedAt,
        pythBenchmarkComparable: asset.pythBenchmarkComparable,
        benchmarkSpreadBps,
        lastUpdated: asset.lastUpdated,
      };
    })
    .sort((a, b) => {
      const aUnderlying = a.symbol.replace(/^T-/i, '').toUpperCase();
      const bUnderlying = b.symbol.replace(/^T-/i, '').toUpperCase();

      if (aUnderlying !== bUnderlying) {
        return aUnderlying.localeCompare(bUnderlying);
      }

      if (a.quoteSource !== b.quoteSource) {
        return a.quoteSource === 'live' ? -1 : 1;
      }

      return a.provider.localeCompare(b.provider);
    });
}
