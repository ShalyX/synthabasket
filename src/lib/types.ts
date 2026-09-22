export type AssetProvider = 'prestocks' | 'tessera';

export interface AssetQuote {
  symbol: string;
  name: string;
  provider: AssetProvider;
  tokenMint: string;
  /**
   * Optional Devnet mirror mint used only for executable test flows.
   * The canonical provider mint remains tokenMint.
   */
  devnetMint?: string;
  priceUsd: number;
  change24h: number;
  marketCapUsd?: number;
  volume24hUsd?: number;
  pythFeedId?: string;
  pythBenchmarkPriceUsd?: number;
  basisSpreadBps?: number;
  logoUrl?: string;
  description?: string;
  lastUpdated: number;
}

export interface BasketConstituent {
  asset: AssetQuote;
  targetWeightBps: number; // e.g. 5000 = 50.00%
  reserveBalance?: number;  // SPL token balance in Vault PDA
}

export type BasketCategory = 'ai' | 'space_defense' | 'fintech' | 'custom';

export type ProviderMode = 'multi' | 'prestocks_pure';

export interface BasketDefinition {
  id: string;
  name: string;
  symbol: string;
  description: string;
  category: BasketCategory;
  providerMode: ProviderMode;
  constituents: BasketConstituent[];
  navUsd: number;
  navChange24h: number;
  aumUsd: number;
  totalSharesMinted: number;
  vaultPda: string;
  basketMint: string;
  /**
   * Separate seed symbol for the Devnet mirror basket state. This keeps
   * executable test custody isolated from canonical provider-mint metadata.
   */
  devnetExecutionSymbol?: string;
  meteoraDbcPoolAddress?: string;
  meteoraDammPoolAddress?: string;
  meteoraGraduated: boolean;
  meteoraMarketCapUsd?: number;
  creatorAddress?: string;
  createdAt: number;
}

export interface MeteoraDBCConfig {
  curveType: 'linear' | 'exponential' | 'equity_smoothed';
  initialPriceUsd: number;
  graduationThresholdUsd: number;
  feeBps: number;
  quoteToken: 'USDC' | 'SOL';
}

export type TxStepStatus = 'pending' | 'active' | 'submitted' | 'completed' | 'failed';

export interface TxStep {
  id: string;
  label: string;
  description: string;
  status: TxStepStatus;
  txSignature?: string;
  txSignatures?: string[];
  error?: string;
  statusMessage?: string;
}

export interface TxLifecycleState {
  isOpen: boolean;
  title: string;
  steps: TxStep[];
  currentStepIndex: number;
  isCompleted: boolean;
  hasError: boolean;
  hasPendingConfirmation?: boolean;
  finalSignature?: string;
  actionType: 'mint' | 'redeem' | 'create_basket' | 'launch_dbc';
}

export interface AllocationRouteItem {
  asset: AssetQuote;
  targetUsdAmount: number;
  estimatedTokensReceived: number;
  /**
   * Exact raw token amount acquired by the execution layer, when known.
   */
  rawTokenAmount?: string;
  jupiterRoute?: unknown;
}

export interface BasketMintQuote {
  basketId: string;
  depositUsdcAmount: number;
  expectedBasketTokens: number;
  protocolFeeUsdc: number;
  allocations: AllocationRouteItem[];
  estimatedNavUsd: number;
}

export interface BasketRedeemQuote {
  basketId: string;
  burnBasketTokensAmount: number;
  expectedUsdcValue: number;
  constituentsToReturn: {
    asset: AssetQuote;
    tokenAmount: number;
    valueUsd: number;
  }[];
}

export interface BasisMonitorItem {
  symbol: string;
  name: string;
  tokenMint: string;
  provider: AssetProvider;
  solanaDexPriceUsd: number;
  pythBenchmarkPriceUsd: number;
  spreadBps: number; // ((dex - pyth) / pyth) * 10000
  arbitrageDirection: 'solana_premium' | 'solana_discount' | 'parity';
  lastUpdated: number;
}
