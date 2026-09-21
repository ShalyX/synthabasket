import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import { BasketMintQuote } from '../types';

export interface JupiterSwapV2QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<any>;
}

export interface JupiterSwapV2BuildResponse {
  swapTransaction: string; // base64 encoded VersionedTransaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export class AllocationRouter {
  private connection: Connection;
  private jupiterBaseUrl: string;

  constructor(connection: Connection, jupiterBaseUrl?: string) {
    this.connection = connection;
    this.jupiterBaseUrl = jupiterBaseUrl || '/api/jupiter';
  }

  /**
   * Queries Jupiter Swap API V2 for quotes with instructionVersion=V2.
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amountRaw: bigint,
    slippageBps: number = 50
  ): Promise<JupiterSwapV2QuoteResponse | null> {
    try {
      const params = new URLSearchParams({
        endpoint: 'quote',
        inputMint,
        outputMint,
        amount: amountRaw.toString(),
        slippageBps: slippageBps.toString(),
        instructionVersion: 'V2',
      });

      const isServer = typeof window === 'undefined';
      const url = isServer
        ? `https://api.jup.ag/swap/v2/quote?${params.toString()}`
        : `${this.jupiterBaseUrl}?${params.toString()}`;

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (isServer && process.env.JUPITER_API_KEY) {
        headers['x-api-key'] = process.env.JUPITER_API_KEY;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.warn(`[Jupiter Swap V2] Quote returned status: ${res.status}`);
        return null;
      }
      return await res.json();
    } catch (e: any) {
      console.warn('[Jupiter Swap V2] Quote fetch failed:', e.message);
      return null;
    }
  }

  /**
   * Builds an executable VersionedTransaction using Jupiter Swap API V2 /build.
   */
  async buildSwapTransaction(
    quoteResponse: JupiterSwapV2QuoteResponse,
    userPublicKey: PublicKey
  ): Promise<VersionedTransaction | null> {
    try {
      const isServer = typeof window === 'undefined';
      const url = isServer ? 'https://api.jup.ag/swap/v2/build' : this.jupiterBaseUrl;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (isServer && process.env.JUPITER_API_KEY) {
        headers['x-api-key'] = process.env.JUPITER_API_KEY;
      }

      const body = {
        endpoint: 'build',
        quoteResponse,
        userPublicKey: userPublicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
      };

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.warn(`[Jupiter Swap V2 /build] returned status: ${res.status}`);
        return null;
      }

      const json: JupiterSwapV2BuildResponse = await res.json();
      const swapTxBuffer = Buffer.from(json.swapTransaction, 'base64');
      return VersionedTransaction.deserialize(swapTxBuffer);
    } catch (e: any) {
      console.warn('[Jupiter Swap V2 /build] Failed to build transaction:', e.message);
      return null;
    }
  }

  /**
   * Prepares multi-asset allocation swaps.
   * Feeds actual quoted output amounts into the downstream execution pipeline.
   */
  async prepareAllocationSwaps(
    userPublicKey: PublicKey,
    mintQuote: BasketMintQuote,
    isDevnet: boolean = true
  ): Promise<{
    versionedTransactions: VersionedTransaction[];
    estimatedFeeLamports: number;
    breakdown: Array<{
      symbol: string;
      inUsdcAmount: number;
      actualQuotedOutAmount: number;
      routeSource: 'jupiter_v2' | 'devnet_synthetic_pool';
    }>;
  }> {
    const usdcMint = isDevnet ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;
    const versionedTransactions: VersionedTransaction[] = [];
    const breakdown = [];

    for (const alloc of mintQuote.allocations) {
      const rawUsdcAmount = BigInt(Math.floor(alloc.targetUsdAmount * 1_000_000));
      let routeSource: 'jupiter_v2' | 'devnet_synthetic_pool' = 'devnet_synthetic_pool';
      let actualQuotedOutAmount = alloc.estimatedTokensReceived;

      // On Mainnet (or Devnet with real route), query Jupiter V2
      const quote = await this.getQuote(usdcMint, alloc.asset.tokenMint, rawUsdcAmount);
      if (quote) {
        routeSource = 'jupiter_v2';
        actualQuotedOutAmount = Number(quote.outAmount) / 1_000_000;

        const swapTx = await this.buildSwapTransaction(quote, userPublicKey);
        if (swapTx) {
          versionedTransactions.push(swapTx);
        }
      }

      breakdown.push({
        symbol: alloc.asset.symbol,
        inUsdcAmount: alloc.targetUsdAmount,
        actualQuotedOutAmount,
        routeSource,
      });
    }

    return {
      versionedTransactions,
      estimatedFeeLamports: 5000 * mintQuote.allocations.length,
      breakdown,
    };
  }
}
