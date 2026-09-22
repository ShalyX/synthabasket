import { AssetQuote } from '../types';

const VERIFIED_SNAPSHOT_AT = Date.UTC(2026, 8, 21, 0, 0, 0);

export interface PreStocksApiItem {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  contract_address: string;
  markPrice: number;
  markValuation: number;
  tokenPrice: number;
  impliedValuation: number;
  supply: number;
  change24h?: number;
  change24hPercent?: number;
  priceChange24h?: number;
}

// Fallback verified snapshot from live PreStocks API (updated 2026-09-21)
export const PRESTOCKS_VERIFIED_SNAPSHOT: AssetQuote[] = [
  {
    symbol: 'ANDURIL',
    name: 'Anduril PreStocks',
    provider: 'prestocks',
    tokenMint: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB',
    priceUsd: 154.43,
    change24h: 1.25,
    marketCapUsd: 136_625_480_204,
    description: 'Anduril builds AI-driven defense systems, autonomous drones, and Lattice OS.',
    logoUrl: 'https://www.prestocks.com/logos/anduril.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'ANTHROPIC',
    name: 'Anthropic PreStocks',
    provider: 'prestocks',
    tokenMint: 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw',
    priceUsd: 1048.33,
    change24h: 3.45,
    marketCapUsd: 185_000_000_000,
    description: 'Anthropic PBC is an AI safety and research company, creators of Claude.',
    logoUrl: 'https://www.prestocks.com/logos/anthropic.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'OPENAI',
    name: 'OpenAI PreStocks',
    provider: 'prestocks',
    tokenMint: 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF',
    priceUsd: 994.38,
    change24h: 4.80,
    marketCapUsd: 950_000_000_000,
    description: 'Creator of ChatGPT and frontier artificial general intelligence models.',
    logoUrl: 'https://www.prestocks.com/logos/openai.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'SPACEX',
    name: 'SpaceX PreStocks',
    provider: 'prestocks',
    tokenMint: 'PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh',
    priceUsd: 154.36,
    change24h: 2.10,
    marketCapUsd: 210_000_000_000,
    description: 'Aerospace manufacturer and satellite constellation operator.',
    logoUrl: 'https://www.prestocks.com/logos/spacex.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'KALSHI',
    name: 'Kalshi PreStocks',
    provider: 'prestocks',
    tokenMint: 'PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua',
    priceUsd: 895.26,
    change24h: 5.60,
    marketCapUsd: 1_200_000_000,
    description: 'CFTC-regulated financial exchange for event and prediction contracts.',
    logoUrl: 'https://www.prestocks.com/logos/kalshi.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'NEURALINK',
    name: 'Neuralink PreStocks',
    provider: 'prestocks',
    tokenMint: 'PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S',
    priceUsd: 336.69,
    change24h: 1.85,
    marketCapUsd: 8_500_000_000,
    description: 'Brain-computer interface developer developing neural implants.',
    logoUrl: 'https://www.prestocks.com/logos/neuralink.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'POLYMARKET',
    name: 'Polymarket PreStocks',
    provider: 'prestocks',
    tokenMint: 'Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP',
    priceUsd: 144.18,
    change24h: 6.10,
    marketCapUsd: 2_100_000_000,
    description: 'Decentralized information markets and prediction platform.',
    logoUrl: 'https://www.prestocks.com/logos/polymarket.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  },
  {
    symbol: 'FIGUREAI',
    name: 'Figure AI PreStocks',
    provider: 'prestocks',
    tokenMint: 'PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd',
    priceUsd: 181.52,
    change24h: 3.20,
    marketCapUsd: 2_600_000_000,
    description: 'AI robotics company developing autonomous humanoid robots.',
    logoUrl: 'https://www.prestocks.com/logos/figureai.png',
    change24hAvailable: false,
    quoteSource: 'snapshot',
    lastUpdated: VERIFIED_SNAPSHOT_AT,
  }
];

export async function fetchPreStocksAssets(options?: { throwOnError?: boolean }): Promise<AssetQuote[]> {
  const url = process.env.NEXT_PUBLIC_PRESTOCKS_API_URL || 'https://prestocks.com/api/prestocks';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SynthaBasket-Protocol/1.0',
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      if (options?.throwOnError) {
        throw new Error(`PreStocks API returned HTTP ${res.status}: ${res.statusText}`);
      }
      console.warn(`[PreStocks API] HTTP ${res.status}. Falling back to verified snapshot.`);
      return PRESTOCKS_VERIFIED_SNAPSHOT;
    }

    const rawItems: PreStocksApiItem[] = await res.json();
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      if (options?.throwOnError) {
        throw new Error('PreStocks API returned empty or malformed array');
      }
      return PRESTOCKS_VERIFIED_SNAPSHOT;
    }

    const liveAssets: AssetQuote[] = rawItems.map((item) => {
      const providerChange = [item.change24h, item.change24hPercent, item.priceChange24h]
        .find((value) => typeof value === 'number' && Number.isFinite(value));

      return {
        symbol: item.symbol,
        name: item.name,
        provider: 'prestocks',
        tokenMint: item.contract_address,
        priceUsd: Number((item.markPrice || item.tokenPrice || 0).toFixed(2)),
        change24h: providerChange ?? 0,
        change24hAvailable: providerChange !== undefined,
        quoteSource: 'live',
        marketCapUsd: item.markValuation || item.impliedValuation,
        description: item.description,
        logoUrl: item.image,
        lastUpdated: Date.now(),
      };
    });

    const liveMints = new Set(liveAssets.map((asset) => asset.tokenMint));
    return [
      ...liveAssets,
      ...PRESTOCKS_VERIFIED_SNAPSHOT.filter(
        (asset) => !liveMints.has(asset.tokenMint)
      ),
    ];
  } catch (error: any) {
    if (options?.throwOnError) {
      throw new Error(`PreStocks API fetch failed: ${error.message}`);
    }
    console.warn('[PreStocks API] Network error, using verified snapshot:', error.message);
    return PRESTOCKS_VERIFIED_SNAPSHOT;
  }
}
