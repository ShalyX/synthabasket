import { AssetQuote } from '../types';

const DEVNET_MIRROR_MINTS: Record<string, string | undefined> = {
  'T-OpenAI': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_OPENAI,
  ANTHROPIC: process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANTHROPIC,
  'T-Kalshi': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_KALSHI,
  'T-SpaceX': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_SPACEX,
  ANDURIL: process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANDURIL,
  KALSHI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_KALSHI,
  POLYMARKET: process.env.NEXT_PUBLIC_DEVNET_MIRROR_POLYMARKET,
  OPENAI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_OPENAI,
  NEURALINK: process.env.NEXT_PUBLIC_DEVNET_MIRROR_NEURALINK,
  FIGUREAI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_FIGUREAI,
};

export function getDevnetMirrorMint(symbol: string): string | undefined {
  const value = DEVNET_MIRROR_MINTS[symbol];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function withDevnetMirror<T extends AssetQuote>(asset: T): T {
  return {
    ...asset,
    devnetMint: asset.devnetMint || getDevnetMirrorMint(asset.symbol),
  };
}

export function getConfiguredDevnetMirrorMints(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(DEVNET_MIRROR_MINTS).filter(
      (entry): entry is [string, string] => Boolean(entry[1] && entry[1]!.trim())
    )
  );
}
