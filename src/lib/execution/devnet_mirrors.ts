import { AssetQuote } from '../types';

const DEVNET_MIRROR_MINTS: Record<string, string | undefined> = {
  'T-OpenAI': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_OPENAI || 'Bj47e5GCXuaxmbPjDRF5iSVjZ1Y4uEFoaDoPUAfD1xkB',
  ANTHROPIC: process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANTHROPIC || 'GxtkS2jUU5br9JJB64FuvvUxwp2sadxwCCRsZwiqAR3p',
  'T-Kalshi': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_KALSHI || 'HSv2zqvfSXv2CQ7TW79HpQPYziNvoiY3CKpGu7Ec3hFh',
  'T-SpaceX': process.env.NEXT_PUBLIC_DEVNET_MIRROR_T_SPACEX || 'B5SFgwf1nMGPAid4ngWWtn1fxpL2wTSbibmzsQzp4oaq',
  ANDURIL: process.env.NEXT_PUBLIC_DEVNET_MIRROR_ANDURIL || 'F2ynAT6rER45pQPh62P63TLmDqhByepTJfDaypeETBJZ',
  KALSHI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_KALSHI || '41ZBu1Frvec4r7TeQjYP4PnMSviU8vwd1wo5SZZZ5wMn',
  POLYMARKET: process.env.NEXT_PUBLIC_DEVNET_MIRROR_POLYMARKET || '9qHJAujJTHxwn6gTzmwQKJZYDsoQGsBxAw1ygvtFboTN',
  OPENAI: process.env.NEXT_PUBLIC_DEVNET_MIRROR_OPENAI || 'JBk4GN6xhW9rmu5pAM1Ub2pdgCZs3Bkc7xBAxbvH9Rr6',
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
