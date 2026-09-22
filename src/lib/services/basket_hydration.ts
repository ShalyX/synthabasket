import { Connection } from '@solana/web3.js';
import { AssetQuote, BasketDefinition } from '../types';
import { calculateBasketNav } from './valuation_engine';
import { SynthaBasketVaultClient } from '../execution/vault_client';
import { withDevnetMirror } from '../execution/devnet_mirrors';

export interface BasketHydrationResult {
  baskets: BasketDefinition[];
  assets: AssetQuote[];
}

/**
 * Combines provider market quotes with live Solana basket state.
 *
 * Curated basket composition/weights remain registry configuration. Mutable
 * values (prices, NAV, AUM, share supply, reserve balances, execution
 * addresses) are hydrated at runtime.
 */
export async function hydrateBaskets(
  connection: Connection,
  definitions: BasketDefinition[],
  assets: AssetQuote[],
  useDevnetMirrors: boolean = true
): Promise<BasketDefinition[]> {
  const assetByMint = new Map(assets.map((asset) => [asset.tokenMint, asset]));
  const vaultClient = new SynthaBasketVaultClient(connection);

  return Promise.all(
    definitions.map(async (definition) => {
      const constituents = definition.constituents.map((constituent) => {
        const quote = assetByMint.get(constituent.asset.tokenMint);
        const mergedAsset = withDevnetMirror(
          quote
            ? {
                ...constituent.asset,
                ...quote,
                devnetMint: quote.devnetMint || constituent.asset.devnetMint,
              }
            : {
                ...constituent.asset,
                change24hAvailable: false,
                quoteSource: 'snapshot' as const,
              }
        );

        return {
          ...constituent,
          asset: mergedAsset,
          reserveBalance: undefined,
        };
      });

      const pricedBasket: BasketDefinition = {
        ...definition,
        constituents,
      };

      const pricedAssetMap = new Map(
        constituents.map((constituent) => [
          constituent.asset.tokenMint,
          constituent.asset,
        ])
      );
      const targetNav = calculateBasketNav(pricedBasket, pricedAssetMap);

      const quoteSources = constituents.map(
        (constituent) => constituent.asset.quoteSource || 'snapshot'
      );
      const marketDataSource =
        quoteSources.every((source) => source === 'live')
          ? 'live'
          : quoteSources.every((source) => source === 'snapshot')
          ? 'snapshot'
          : 'mixed';

      try {
        const snapshot = await vaultClient.getBasketExecutionSnapshot(
          pricedBasket,
          useDevnetMirrors
        );

        const reserveBySymbol = new Map(
          snapshot.reserves.map((reserve) => [reserve.symbol, reserve])
        );

        const hydratedConstituents = constituents.map((constituent) => ({
          ...constituent,
          reserveBalance:
            reserveBySymbol.get(constituent.asset.symbol)?.uiAmount || 0,
        }));

        const aumUsd = hydratedConstituents.reduce(
          (total, constituent) =>
            total +
            (constituent.reserveBalance || 0) * constituent.asset.priceUsd,
          0
        );

        const navUsd =
          snapshot.totalSharesMinted > 0
            ? aumUsd / snapshot.totalSharesMinted
            : targetNav.navUsd;

        return {
          ...pricedBasket,
          constituents: hydratedConstituents,
          navUsd: Number(navUsd.toFixed(2)),
          navChange24h: targetNav.navChange24h,
          navChange24hAvailable: targetNav.navChange24hAvailable,
          navSource:
            snapshot.totalSharesMinted > 0
              ? 'onchain_reserves'
              : 'target_weights',
          marketDataSource,
          onChainStateLoaded: true,
          aumUsd: Number(aumUsd.toFixed(2)),
          totalSharesMinted: snapshot.totalSharesMinted,
          vaultPda: snapshot.basketPda,
          basketMint: snapshot.basketMint,
        } satisfies BasketDefinition;
      } catch (error) {
        console.warn(
          `[Basket hydration] Unable to read live execution state for ${definition.symbol}:`,
          error
        );

        return {
          ...pricedBasket,
          navUsd: targetNav.navUsd,
          navChange24h: targetNav.navChange24h,
          navChange24hAvailable: targetNav.navChange24hAvailable,
          navSource: 'target_weights',
          marketDataSource,
          onChainStateLoaded: false,
          // Never present registry demo state as live AUM/supply.
          aumUsd: 0,
          totalSharesMinted: 0,
        } satisfies BasketDefinition;
      }
    })
  );
}
