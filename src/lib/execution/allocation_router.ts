import {
  Connection,
  PublicKey,
  Transaction,
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

export interface PreparedExecutionTransaction {
  label: string;
  symbols: string[];
  transaction: Transaction | VersionedTransaction;
  lastValidBlockHeight: number;
}

export interface AllocationUnavailableItem {
  symbol: string;
  reason: string;
}

export interface AllocationBreakdownItem {
  symbol: string;
  inUsdcAmount: number;
  actualQuotedOutAmount: number | null;
  rawOutAmount?: string;
  executionMint?: string;
  routeSource: 'jupiter_v2' | 'devnet_mirror' | 'unavailable';
}

export interface AllocationPlan {
  executionTransactions: PreparedExecutionTransaction[];
  estimatedFeeLamports: number;
  unavailable: AllocationUnavailableItem[];
  breakdown: AllocationBreakdownItem[];
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
      if (!res.ok) return null;
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

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpoint: 'build',
          quoteResponse,
          userPublicKey: userPublicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!res.ok) return null;

      const json: JupiterSwapV2BuildResponse = await res.json();
      if (!json.swapTransaction || typeof json.lastValidBlockHeight !== 'number') {
        return null;
      }

      return {
        transaction: VersionedTransaction.deserialize(
          Buffer.from(json.swapTransaction, 'base64')
        ),
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

  private async prepareDevnetMirrorAcquisition(
    userPublicKey: PublicKey,
    mintQuote: BasketMintQuote
  ): Promise<AllocationPlan> {
    const unavailable: AllocationUnavailableItem[] = [];
    const allocations = mintQuote.allocations.map((allocation) => {
      if (!allocation.asset.devnetMint) {
        unavailable.push({
          symbol: allocation.asset.symbol,
          reason: 'No Devnet mirror mint is configured for this private-market asset.',
        });
      }

      const rawAmount = BigInt(
        Math.max(1, Math.floor(allocation.estimatedTokensReceived * 1_000_000))
      ).toString();
      const usdcRaw = BigInt(
        Math.max(1, Math.floor(allocation.targetUsdAmount * 1_000_000))
      ).toString();

      return {
        symbol: allocation.asset.symbol,
        mint: allocation.asset.devnetMint,
        rawAmount,
        usdcRaw,
      };
    });

    if (unavailable.length > 0) {
      return {
        executionTransactions: [],
        estimatedFeeLamports: 0,
        unavailable,
        breakdown: mintQuote.allocations.map((allocation) => ({
          symbol: allocation.asset.symbol,
          inUsdcAmount: allocation.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        })),
      };
    }

    try {
      const res = await fetch('/api/devnet-acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPublicKey: userPublicKey.toBase58(),
          allocations,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload.transaction || typeof payload.lastValidBlockHeight !== 'number') {
        const reason = payload?.error || 'Devnet mirror acquisition adapter is unavailable.';
        return {
          executionTransactions: [],
          estimatedFeeLamports: 0,
          unavailable: mintQuote.allocations.map((allocation) => ({
            symbol: allocation.asset.symbol,
            reason,
          })),
          breakdown: mintQuote.allocations.map((allocation) => ({
            symbol: allocation.asset.symbol,
            inUsdcAmount: allocation.targetUsdAmount,
            actualQuotedOutAmount: null,
            routeSource: 'unavailable',
          })),
        };
      }

      const transaction = Transaction.from(Buffer.from(payload.transaction, 'base64'));

      const issuedBySymbol = new Map<string, any>(
        Array.isArray(payload.issued)
          ? payload.issued.map((item: any) => [String(item.symbol), item])
          : []
      );

      return {
        executionTransactions: [
          {
            label: 'Acquire Devnet private-market mirrors',
            symbols: mintQuote.allocations.map((allocation) => allocation.asset.symbol),
            transaction,
            lastValidBlockHeight: payload.lastValidBlockHeight,
          },
        ],
        estimatedFeeLamports: 5_000,
        unavailable: [],
        breakdown: mintQuote.allocations.map((allocation) => {
          const issued = issuedBySymbol.get(allocation.asset.symbol);
          if (!issued?.rawAmount) {
            throw new Error(
              `Devnet acquisition adapter omitted the issued amount for ${allocation.asset.symbol}.`
            );
          }
          return {
            symbol: allocation.asset.symbol,
            inUsdcAmount: allocation.targetUsdAmount,
            actualQuotedOutAmount: Number(issued.uiAmount),
            rawOutAmount: String(issued.rawAmount),
            executionMint: allocation.asset.devnetMint,
            routeSource: 'devnet_mirror' as const,
          };
        }),
      };
    } catch (error: any) {
      const reason =
        error?.message || 'Unable to reach the Devnet mirror acquisition adapter.';
      return {
        executionTransactions: [],
        estimatedFeeLamports: 0,
        unavailable: mintQuote.allocations.map((allocation) => ({
          symbol: allocation.asset.symbol,
          reason,
        })),
        breakdown: mintQuote.allocations.map((allocation) => ({
          symbol: allocation.asset.symbol,
          inUsdcAmount: allocation.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        })),
      };
    }
  }

  /**
   * Produces executable acquisition transactions only.
   *
   * Mainnet uses Jupiter V2. Devnet uses an explicit USDC-backed mirror adapter.
   * There is no estimated/synthetic route fallback.
   */
  async prepareAllocationSwaps(
    userPublicKey: PublicKey,
    mintQuote: BasketMintQuote,
    isDevnet: boolean = true
  ): Promise<AllocationPlan> {
    if (isDevnet) {
      return this.prepareDevnetMirrorAcquisition(userPublicKey, mintQuote);
    }

    const executionTransactions: PreparedExecutionTransaction[] = [];
    const unavailable: AllocationUnavailableItem[] = [];
    const breakdown: AllocationBreakdownItem[] = [];

    for (const allocation of mintQuote.allocations) {
      const rawUsdcAmount = BigInt(
        Math.max(1, Math.floor(allocation.targetUsdAmount * 1_000_000))
      );
      const outputMint = allocation.asset.tokenMint;
      const quote = await this.getQuote(
        USDC_MINT_MAINNET,
        outputMint,
        rawUsdcAmount
      );

      if (!quote || !quote.outAmount) {
        unavailable.push({
          symbol: allocation.asset.symbol,
          reason: 'Jupiter returned no executable route for this constituent.',
        });
        breakdown.push({
          symbol: allocation.asset.symbol,
          inUsdcAmount: allocation.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        });
        continue;
      }

      const built = await this.buildSwapTransaction(quote, userPublicKey);
      if (!built) {
        unavailable.push({
          symbol: allocation.asset.symbol,
          reason: 'Jupiter quoted the route but did not return an executable transaction.',
        });
        breakdown.push({
          symbol: allocation.asset.symbol,
          inUsdcAmount: allocation.targetUsdAmount,
          actualQuotedOutAmount: null,
          routeSource: 'unavailable',
        });
        continue;
      }

      const quotedOutAmountUi = await this.rawAmountToUiAmount(
        outputMint,
        quote.outAmount
      );

      executionTransactions.push({
        label: `Acquire ${allocation.asset.symbol} via Jupiter`,
        symbols: [allocation.asset.symbol],
        transaction: built.transaction,
        lastValidBlockHeight: built.lastValidBlockHeight,
      });
      breakdown.push({
        symbol: allocation.asset.symbol,
        inUsdcAmount: allocation.targetUsdAmount,
        actualQuotedOutAmount: quotedOutAmountUi,
        rawOutAmount: quote.outAmount,
        executionMint: outputMint,
        routeSource: 'jupiter_v2',
      });
    }

    return {
      executionTransactions,
      estimatedFeeLamports: 5_000 * executionTransactions.length,
      unavailable,
      breakdown,
    };
  }
}
