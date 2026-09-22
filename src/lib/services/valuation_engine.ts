import { AssetQuote, BasketDefinition, BasketMintQuote, BasketRedeemQuote, BasisMonitorItem, ProviderMode } from '../types';
import { fetchPreStocksAssets } from './prestocks';
import { fetchTesseraAssets } from './tessera';
import { computeBasisSpread, fetchPythPrices } from './pyth';
import { withDevnetMirror } from '../execution/devnet_mirrors';

export async function getUnifiedAssetQuotes(mode: ProviderMode = 'multi'): Promise<AssetQuote[]> {
  const prestocksPromise = fetchPreStocksAssets();
  const tesseraPromise = mode === 'multi' ? fetchTesseraAssets() : Promise.resolve([]);

  const [prestocks, tessera] = await Promise.all([prestocksPromise, tesseraPromise]);
  const combined = [...prestocks, ...tessera].map(withDevnetMirror);

  // Fetch Pyth benchmark prices for any assets with pythFeedId
  const feedIds = combined
    .map(a => a.pythFeedId)
    .filter((id): id is string => Boolean(id));

  if (feedIds.length > 0) {
    const pythPrices = await fetchPythPrices(feedIds);
    return combined.map(asset => {
      if (asset.pythFeedId && (pythPrices[asset.pythFeedId] || pythPrices[`0x${asset.pythFeedId}`])) {
        const pythPrice = pythPrices[asset.pythFeedId] || pythPrices[`0x${asset.pythFeedId}`];
        const { spreadBps } = computeBasisSpread(asset.priceUsd, pythPrice);
        return {
          ...asset,
          pythBenchmarkPriceUsd: pythPrice,
          basisSpreadBps: spreadBps,
        };
      }
      return asset;
    });
  }

  return combined;
}

export function calculateBasketNav(
  basket: BasketDefinition,
  liveAssetMap: Map<string, AssetQuote>
): { navUsd: number; navChange24h: number } {
  let totalNav = 0;
  let weightedChange = 0;

  for (const constituent of basket.constituents) {
    const liveAsset = liveAssetMap.get(constituent.asset.tokenMint) || constituent.asset;
    const weightFraction = constituent.targetWeightBps / 10000;
    totalNav += liveAsset.priceUsd * weightFraction;
    weightedChange += (liveAsset.change24h || 0) * weightFraction;
  }

  return {
    navUsd: Number(totalNav.toFixed(2)),
    navChange24h: Number(weightedChange.toFixed(2)),
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
    .filter(a => a.pythBenchmarkPriceUsd && a.pythBenchmarkPriceUsd > 0)
    .map(a => {
      const { spreadBps, direction } = computeBasisSpread(a.priceUsd, a.pythBenchmarkPriceUsd!);
      return {
        symbol: a.symbol,
        name: a.name,
        tokenMint: a.tokenMint,
        provider: a.provider,
        solanaDexPriceUsd: a.priceUsd,
        pythBenchmarkPriceUsd: a.pythBenchmarkPriceUsd!,
        spreadBps,
        arbitrageDirection: direction,
        lastUpdated: a.lastUpdated,
      };
    })
    .sort((a, b) => Math.abs(b.spreadBps) - Math.abs(a.spreadBps));
}
