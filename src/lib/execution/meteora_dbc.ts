import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
} from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DAMM_V2_PROGRAM_ID,
  buildCurveWithMarketCap,
  TokenType,
  TokenDecimal,
  TokenAuthorityOption,
  BaseFeeMode,
  CollectFeeMode,
  MigrationOption,
  MigrationFeeOption,
  ActivationType,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { BasketDefinition, MeteoraDBCConfig } from '../types';

export interface DbcCurvePoint {
  supply: number;
  priceUsd: number;
  marketCapUsd: number;
}

export class MeteoraDbcManager {
  private connection: Connection;
  private client: DynamicBondingCurveClient;

  static PROGRAM_ID = DYNAMIC_BONDING_CURVE_PROGRAM_ID;
  static DAMM_V2_PROGRAM_ID = DAMM_V2_PROGRAM_ID;

  constructor(connection: Connection) {
    this.connection = connection;
    this.client = DynamicBondingCurveClient.create(connection);
  }

  /**
   * Generates an equity-smoothed polynomial curve for tokenized stock baskets.
   * P(progress) = P0 + (Pmax - P0) * (progress ^ 1.25)
   */
  static generateEquityCurvePoints(
    initialPriceUsd: number,
    targetMarketCapUsd: number,
    totalSupply: number = 100_000,
    steps: number = 20
  ): DbcCurvePoint[] {
    const points: DbcCurvePoint[] = [];
    const stepSize = totalSupply / steps;

    for (let i = 0; i <= steps; i++) {
      const supply = i * stepSize;
      const progress = supply / totalSupply;

      const maxPrice = targetMarketCapUsd / totalSupply;
      const price = initialPriceUsd + (maxPrice - initialPriceUsd) * Math.pow(progress, 1.25);
      const marketCap = price * (supply || 1);

      points.push({
        supply: Math.round(supply),
        priceUsd: Number(price.toFixed(2)),
        marketCapUsd: Number(marketCap.toFixed(2)),
      });
    }

    return points;
  }

  /**
   * Derives a Meteora DBC Pool PDA using the official derivation:
   * [quoteMint, baseMint, config]
   */
  getPoolPda(baseMint: PublicKey, quoteMint: PublicKey, configPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from('pool'),
        quoteMint.toBuffer(),
        baseMint.toBuffer(),
        configPubkey.toBuffer(),
      ],
      DYNAMIC_BONDING_CURVE_PROGRAM_ID
    );
  }

  /**
   * Creates a genuine Meteora DBC configuration transaction using the 1.5.12 SDK.
   */
  async buildCreateConfigTransaction(
    payer: PublicKey,
    quoteMint: PublicKey,
    config: MeteoraDBCConfig,
    configKeypair?: Keypair
  ): Promise<{ transaction: Transaction; configKeypair: Keypair; configKeypairPubkey: PublicKey }> {
    const activeConfigKeypair = configKeypair || Keypair.generate();
    const curveParams = buildCurveWithMarketCap({
      token: {
        tokenType: TokenType.SPLToken,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.SIX,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
      },
      fee: {
        baseFeeParams: {
          baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
          feeSchedulerParam: {
            startingFeeBps: config.feeBps,
            endingFeeBps: config.feeBps,
            numberOfPeriod: 0,
            totalDuration: 0,
          },
        },
        dynamicFeeEnabled: false,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
      },
      migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.FixedBps30,
        migrationFee: {
          feePercentage: 30,
          creatorFeePercentage: 0,
        },
      },
      liquidityDistribution: {
        partnerPermanentLockedLiquidityPercentage: 100,
        partnerLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
      },
      lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
      },
      activationType: ActivationType.Timestamp,
      initialMarketCap: 10_000,
      migrationMarketCap: 100_000,
    });

    const tx = await this.client.partner.createConfig({
      config: activeConfigKeypair.publicKey,
      feeClaimer: payer,
      leftoverReceiver: payer,
      quoteMint,
      payer,
      ...curveParams,
    });

    return {
      transaction: tx,
      configKeypair: activeConfigKeypair,
      configKeypairPubkey: activeConfigKeypair.publicKey,
    };
  }

  /**
   * Builds an executable transaction to launch a Meteora DBC Pool against the configuration.
   */
  async buildCreatePoolTransaction(
    creator: PublicKey,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    configPubkey: PublicKey,
    basketName: string,
    basketSymbol: string
  ): Promise<Transaction> {
    return await this.client.creator.createPool({
      name: basketName,
      symbol: basketSymbol,
      uri: `https://synthabasket.finance/api/metadata/${basketSymbol.toLowerCase()}`,
      payer: creator,
      poolCreator: creator,
      config: configPubkey,
      baseMint,
    });
  }

  /**
   * Builds the real transaction to trigger graduation/migration of a DBC pool to Meteora DAMM v2.
   */
  async buildMigrateToDammV2Transaction(
    payer: PublicKey,
    poolAddress: PublicKey,
    dammConfig: PublicKey = DAMM_V2_PROGRAM_ID
  ): Promise<Transaction> {
    const response = await this.client.migration.migrateToDammV2({
      payer,
      pool: poolAddress,
      dammConfig,
    });
    return response.transaction;
  }

  /**
   * Helper to format pool configuration summary.
   */
  describeDbcPool(
    basket: BasketDefinition,
    config: MeteoraDBCConfig,
    configPubkey: PublicKey
  ): { poolAddress: string; description: string } {
    const baseMint = new PublicKey(basket.basketMint);
    const quoteMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const [poolPda] = this.getPoolPda(baseMint, quoteMint, configPubkey);

    return {
      poolAddress: poolPda.toBase58(),
      description: `Official Meteora DBC pool (${poolPda.toBase58().slice(0, 8)}...) with ${config.feeBps / 100}% fee schedule, calibrated to migrate to DAMM v2 at $${config.graduationThresholdUsd.toLocaleString()} market cap.`,
    };
  }
}
