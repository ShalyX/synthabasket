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
  /** True only when the provider response supplied a real 24h change value. */
  change24hAvailable?: boolean;
  /** Whether this quote came from the live provider response or the verified fallback snapshot. */
  quoteSource?: 'live' | 'snapshot';
  marketCapUsd?: number;
  volume24hUsd?: number;
  pythFeedId?: string;
  /** Official Pyth Index symbol when one exists for the underlying company. */
  pythBenchmarkSymbol?: string;
  /** Pyth benchmark value when the application is entitled to fetch it. */
  pythBenchmarkPriceUsd?: number;
  pythBenchmarkSource?: 'pyth_core' | 'pyth_index';
  /** Pyth private-market indices are informational/indicative rather than executable prices. */
  pythBenchmarkIndicative?: boolean;
  pythBenchmarkPublishedAt?: number;
  /** Only true when provider and benchmark values are known to use directly comparable units. */
  pythBenchmarkComparable?: boolean;
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
  /** Whether the displayed 24h basket change is backed by constituent 24h data. */
  navChange24hAvailable?: boolean;
  /** How the current basket NAV was derived. */
  navSource?: 'onchain_reserves' | 'target_weights';
  /** Aggregate provenance of the constituent market data. */
  marketDataSource?: 'live' | 'snapshot' | 'mixed';
  /** True when AUM/share supply were hydrated from the execution basket on-chain. */
  onChainStateLoaded?: boolean;
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

export interface BasketCreationDraft {
  name: string;
  symbol: string;
  description: string;
  constituents: BasketConstituent[];
  /** Indicative target-weight NAV at the time the draft is submitted. */
  indicativeNavUsd: number;
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

export interface TxReceiptAsset {
  symbol: string;
  amount: number;
}

export interface TxReceipt {
  basketSymbol?: string;
  spentUsdc?: number;
  sharesReceived?: number;
  sharesBurned?: number;
  resultingShareBalance?: number;
  assetsDeposited?: TxReceiptAsset[];
  assetsReturned?: TxReceiptAsset[];
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
  receipt?: TxReceipt;
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
  providerMarkPriceUsd: number;
  impliedValuationUsd?: number;
  change24h: number;
  change24hAvailable: boolean;
  quoteSource: 'live' | 'snapshot';
  pythBenchmarkSymbol?: string;
  pythBenchmarkPriceUsd?: number;
  pythBenchmarkSource?: 'pyth_core' | 'pyth_index';
  pythBenchmarkIndicative?: boolean;
  pythBenchmarkPublishedAt?: number;
  pythBenchmarkComparable?: boolean;
  benchmarkSpreadBps?: number;
  lastUpdated: number;
}
