import { AssetQuote, ProviderMode } from '../types';
import { withDevnetMirror } from '../execution/devnet_mirrors';
import { fetchPreStocksAssets } from '../services/prestocks';
import { fetchTesseraAssets } from '../services/tessera';
import {
  fetchPythPrivateIndexBenchmarks,
  getPythPrivateIndexSymbol,
  normalizePrivateMarketUnderlying,
} from '../services/pyth';

const CACHE_MS = 20_000;
const cachedByMode = new Map<
  ProviderMode,
  { assets: AssetQuote[]; expiresAt: number }
>();
const inFlightByMode = new Map<ProviderMode, Promise<AssetQuote[]>>();

async function buildUnifiedAssetQuotes(
  mode: ProviderMode
): Promise<AssetQuote[]> {
  const prestocksPromise = fetchPreStocksAssets();
  const tesseraPromise =
    mode === 'multi' ? fetchTesseraAssets() : Promise.resolve([]);

  const [prestocks, tessera] = await Promise.all([
    prestocksPromise,
    tesseraPromise,
  ]);
  const combined = [...prestocks, ...tessera].map(withDevnetMirror);

  const underlyings = combined.map((asset) =>
    normalizePrivateMarketUnderlying(asset.symbol)
  );
  const privateIndexBenchmarks =
    await fetchPythPrivateIndexBenchmarks(underlyings);

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
      };
    }

    return {
      ...asset,
      pythBenchmarkSymbol:
        privateIndexSymbol || asset.pythBenchmarkSymbol,
    };
  });
}

export async function getUnifiedAssetQuotes(
  mode: ProviderMode = 'multi'
): Promise<AssetQuote[]> {
  const now = Date.now();
  const cached = cachedByMode.get(mode);
  if (cached && cached.expiresAt > now) {
    return cached.assets;
  }

  const existing = inFlightByMode.get(mode);
  if (existing) return existing;

  const request = buildUnifiedAssetQuotes(mode)
    .then((assets) => {
      cachedByMode.set(mode, {
        assets,
        expiresAt: Date.now() + CACHE_MS,
      });
      return assets;
    })
    .finally(() => {
      inFlightByMode.delete(mode);
    });

  inFlightByMode.set(mode, request);
  return request;
}
