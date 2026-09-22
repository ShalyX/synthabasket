import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
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
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export interface PreparedAllocationSwap {
  symbol: string;
  outputMint: string;
  transaction: VersionedTransaction;
  lastValidBlockHeight: number;
  rawOutAmount: string;
  quotedOutAmountUi: number;
}

export interface AllocationUnavailableItem {
  symbol: string;
  reason: string;
}

export interface AllocationPlan {
  preparedSwaps: PreparedAllocationSwap[];
  estimatedFeeLamports: number;
  unavailable: AllocationUnavailableItem[];
  breakdown: Array<{
    symbol: string;
    inUsdcAmount: number;
    actualQuotedOutAmount: number | null;
    routeSource: 'jupiter_v2' | 'unavailable';
  }>;
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
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  }

  async buildSwapTransaction(
    quoteResponse: JupiterSwapV2QuoteResponse,
    userPublicKey: PublicKey
  ): Promise<{ transaction: VersionedTransaction; lastValidBlockHeight: number } | null> {
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
        return null;
      }

      const json: JupiterSwapV2BuildResponse = await res.json();
      if (!json.swapTransaction || typeof json.lastValidBlockHeight !== 'number') {
        return null;
      }

      return {
        transaction: VersionedTransaction.deserialize(Buffer.from(json.swapTransaction, 'base64')),
        lastValidBlockHeight: json.lastValidBlockHeight,
      };
    } catch {
      return null;
    }
  }

  private async rawAmountToUiAmount(mint: string, rawAmount: string): Promise<number> {
    try {
      const mintInfo = await getMint(this.connection, new PublicKey(mint));
      return Number(rawAmount) / 10 ** mintInfo.decimals;
    } catch {
      return Number(rawAmount);
    }
  }

  /**
   * Prepares only executable allocation transactions.
   *
   * Important: there is deliberately no synthetic/estimated fallback here. If a
   * constituent cannot be acquired on the active cluster, the plan reports it
   * as unavailable and callers must stop before vault deposit.
   */
  async prepareAllocationSwaps(
    userPublicKey: PublicKey,
    mintQuote: BasketMintQuote,
    isDevnet: boolean = true
  ): Promise<AllocationPlan> {
    const preparedSwaps: PreparedAllocationSwap[] = [];
    const unavailable: AllocationUnavailableItem[] = [];
    const breakdown: AllocationPlan['breakdown'] = [];

    for (const alloc of mintQuote.allocations) {
      if (isDevnet) {
        unavailable.push({
          symbol: alloc.asset.symbol,
          reason: alloc.asset.devnetMint
            ? 'Devnet mirror exists but must be acquired through the explicit Devnet mirror execution adapter, not Jupiter.'
            : 'No Devnet mirror mint is configured for this private-market asset.',
        });
        breakdown.push({
          symbol: alloc.asset.symbol,
          inUsdcAmount: alloc.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        });
        continue;
      }

      const rawUsdcAmount = BigInt(Math.floor(alloc.targetUsdAmount * 1_000_000));
      const outputMint = alloc.asset.tokenMint;
      const quote = await this.getQuote(USDC_MINT_MAINNET, outputMint, rawUsdcAmount);

      if (!quote || !quote.outAmount) {
        unavailable.push({
          symbol: alloc.asset.symbol,
          reason: 'Jupiter returned no executable route for this constituent.',
        });
        breakdown.push({
          symbol: alloc.asset.symbol,
          inUsdcAmount: alloc.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        });
        continue;
      }

      const built = await this.buildSwapTransaction(quote, userPublicKey);
      if (!built) {
        unavailable.push({
          symbol: alloc.asset.symbol,
          reason: 'Jupiter quoted the route but did not return an executable transaction.',
        });
        breakdown.push({
          symbol: alloc.asset.symbol,
          inUsdcAmount: alloc.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        });
        continue;
      }

      const quotedOutAmountUi = await this.rawAmountToUiAmount(outputMint, quote.outAmount);
      preparedSwaps.push({
        symbol: alloc.asset.symbol,
        outputMint,
        transaction: built.transaction,
        lastValidBlockHeight: built.lastValidBlockHeight,
        rawOutAmount: quote.outAmount,
        quotedOutAmountUi,
      });
      breakdown.push({
        symbol: alloc.asset.symbol,
        inUsdcAmount: alloc.targetUsdAmount,
        actualQuotedOutAmount: quotedOutAmountUi,
        routeSource: 'jupiter_v2',
      });
    }

    return {
      preparedSwaps,
      estimatedFeeLamports: 5000 * preparedSwaps.length,
      unavailable,
      breakdown,
    };
  }
}
