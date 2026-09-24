import { AssetQuote, BasketDefinition, BasketMintQuote, BasketRedeemQuote, BasisMonitorItem } from '../types';
import { withDevnetMirror } from '../execution/devnet_mirrors';

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
        logoUrl: asset.logoUrl,
        pythBenchmarkSymbol: asset.pythBenchmarkSymbol,
        pythBenchmarkPriceUsd: benchmarkPrice,
        pythBenchmarkSource: asset.pythBenchmarkSource,
        pythBenchmarkIndicative: asset.pythBenchmarkIndicative,
        pythBenchmarkPublishedAt: asset.pythBenchmarkPublishedAt,
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
