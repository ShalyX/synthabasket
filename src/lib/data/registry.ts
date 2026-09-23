import { BasketDefinition } from '../types';

// Registry asset values are last-known fallback marks, not live observations.
// Runtime provider hydration and Solana state are the only sources of live data.
const REGISTRY_SNAPSHOT_AT = Date.UTC(2026, 8, 21, 0, 0, 0);

export const INITIAL_BASKETS: BasketDefinition[] = [
  {
    id: 'ai-titans',
    name: 'AI Titans Index',
    symbol: 'AIT',
    description: 'High-conviction index tracking frontier artificial intelligence pioneers across LLMs, agents, and prediction markets.',
    category: 'ai',
    providerMode: 'multi',
    navUsd: 0,
    navChange24h: 0,
    aumUsd: 0,
    totalSharesMinted: 0,
    vaultPda: '27tzwSrxqyrrQj7oLxfVTAuUVZ9qM6z2Tk2ibfUYkq4Z',
    basketMint: 'BdUTUY9JtFCQ1nu6xmy7hWZjPo38k6fn1atHFHnNAEQy',
    devnetExecutionSymbol: 'AITD',
    createdAt: 0,
    constituents: [
      {
        asset: {
          symbol: 'T-OpenAI',
          name: 'OpenAI T-Token',
          provider: 'tessera',
          tokenMint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ',
          priceUsd: 812.79,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 5000, // 50%
      },
      {
        asset: {
          symbol: 'ANTHROPIC',
          name: 'Anthropic PreStocks',
          provider: 'prestocks',
          tokenMint: 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw',
          priceUsd: 1048.33,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 3000, // 30%
      },
      {
        asset: {
          symbol: 'T-Kalshi',
          name: 'Kalshi T-Token',
          provider: 'tessera',
          tokenMint: 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
          priceUsd: 413.80,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 2000, // 20%
      },
    ],
  },
  {
    id: 'space-defense',
    name: 'Space & Defense Index',
    symbol: 'ORBIT',
    description: 'Autonomous aerospace, satellite launch infrastructure, and sovereign defense technology.',
    category: 'space_defense',
    providerMode: 'multi',
    navUsd: 0,
    navChange24h: 0,
    aumUsd: 0,
    totalSharesMinted: 0,
    vaultPda: 'FHrjGsWtZabyoQSzaLV1G2Avg3pJqikv2XS5eHfTUGUb',
    basketMint: 'E34n47abEVaUUwmeRrSBprAup3Yk3MUvztryYWFaHYAS',
    devnetExecutionSymbol: 'ORBITD',
    createdAt: 0,
    constituents: [
      {
        asset: {
          symbol: 'T-SpaceX',
          name: 'SpaceX T-Token',
          provider: 'tessera',
          tokenMint: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v',
          priceUsd: 423.00,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 6500, // 65%
      },
      {
        asset: {
          symbol: 'ANDURIL',
          name: 'Anduril PreStocks',
          provider: 'prestocks',
          tokenMint: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB',
          priceUsd: 154.43,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 3500, // 35%
      },
    ],
  },
  {
    id: 'fintech-disruptors',
    name: 'FinTech Disruptors Index',
    symbol: 'FINX',
    description: 'Next-generation internet payment rails, crypto institutional exchanges, and CFTC event trading.',
    category: 'fintech',
    providerMode: 'multi',
    navUsd: 0,
    navChange24h: 0,
    aumUsd: 0,
    totalSharesMinted: 0,
    vaultPda: 'HJ4MDvgozdGYmvvQDXML9FKB9dFwCfsDxwuxsmhiddUW',
    basketMint: '3YPYyg84UwpCwXAFnJioJHaAyX2PrmwXXzLUjAhQThGM',
    devnetExecutionSymbol: 'FINXD',
    createdAt: 0,
    constituents: [
      {
        asset: {
          symbol: 'KALSHI',
          name: 'Kalshi PreStocks',
          provider: 'prestocks',
          tokenMint: 'PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua',
          priceUsd: 895.26,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 5000, // 50%
      },
      {
        asset: {
          symbol: 'POLYMARKET',
          name: 'Polymarket PreStocks',
          provider: 'prestocks',
          tokenMint: 'Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP',
          priceUsd: 144.18,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 3000, // 30%
      },
      {
        asset: {
          symbol: 'T-Kalshi',
          name: 'Kalshi T-Token',
          provider: 'tessera',
          tokenMint: 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ',
          priceUsd: 413.80,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 2000, // 20%
      },
    ],
  },
  {
    id: 'prestocks-frontier',
    name: 'PreStocks Sovereign Frontier',
    symbol: 'PREX',
    description: 'Focused private-market basket built from PreStocks-issued assets across frontier technology themes.',
    category: 'custom',
    providerMode: 'multi',
    navUsd: 0,
    navChange24h: 0,
    aumUsd: 0,
    totalSharesMinted: 0,
    vaultPda: '7JuhiGARSwk5SGDWvViBFEuoUfjkq3QN5NAfveqFnqZy',
    basketMint: 'DF7ik18h2eFZ67HtqzyWU1sGsvGFG838WFCzyjWZfLrT',
    devnetExecutionSymbol: 'PREXD',
    createdAt: 0,
    constituents: [
      {
        asset: {
          symbol: 'ANTHROPIC',
          name: 'Anthropic PreStocks',
          provider: 'prestocks',
          tokenMint: 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw',
          priceUsd: 1048.33,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 4000, // 40%
      },
      {
        asset: {
          symbol: 'ANDURIL',
          name: 'Anduril PreStocks',
          provider: 'prestocks',
          tokenMint: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB',
          priceUsd: 154.43,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 3000, // 30%
      },
      {
        asset: {
          symbol: 'OPENAI',
          name: 'OpenAI PreStocks',
          provider: 'prestocks',
          tokenMint: 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF',
          priceUsd: 994.38,
          change24h: 0,
          change24hAvailable: false,
          quoteSource: 'snapshot',
          lastUpdated: REGISTRY_SNAPSHOT_AT,
        },
        targetWeightBps: 3000, // 30%
      },
    ],
  },
];
