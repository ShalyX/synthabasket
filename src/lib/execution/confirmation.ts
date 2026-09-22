import { Commitment, Connection } from '@solana/web3.js';

export type SignatureOutcome =
  | { state: 'confirmed'; confirmationStatus: 'confirmed' | 'finalized' }
  | { state: 'failed'; error: string }
  | { state: 'expired'; error: string }
  | { state: 'unknown'; error: string };

export interface WaitForSignatureOptions {
  commitment?: Commitment;
  timeoutMs?: number;
  pollIntervalMs?: number;
  lastValidBlockHeight?: number;
}

/**
 * Polls signature status instead of treating a short RPC timeout as a failed transaction.
 * If lastValidBlockHeight is known we can also distinguish expiry from an unknown status.
 */
export async function waitForSignatureOutcome(
  connection: Connection,
  signature: string,
  options: WaitForSignatureOptions = {}
): Promise<SignatureOutcome> {
  const {
    commitment = 'confirmed',
    timeoutMs = 90_000,
    pollIntervalMs = 1_500,
    lastValidBlockHeight,
  } = options;

  const startedAt = Date.now();
  let lastRpcError: string | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      });
      const status = response.value[0];

      if (status?.err) {
        return {
          state: 'failed',
          error: `Transaction failed on-chain: ${JSON.stringify(status.err)}`,
        };
      }

      const confirmationStatus = status?.confirmationStatus;
      if (
        confirmationStatus === 'finalized' ||
        (commitment === 'confirmed' && confirmationStatus === 'confirmed')
      ) {
        return {
          state: 'confirmed',
          confirmationStatus,
        };
      }

      if (typeof lastValidBlockHeight === 'number') {
        const currentBlockHeight = await connection.getBlockHeight('confirmed');
        if (currentBlockHeight > lastValidBlockHeight) {
          return {
            state: 'expired',
            error: 'Transaction blockhash expired before confirmation.',
          };
        }
      }
    } catch (error: any) {
      lastRpcError = error?.message || String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    state: 'unknown',
    error: lastRpcError
      ? `Confirmation status is still unknown after ${Math.round(timeoutMs / 1000)}s. Last RPC error: ${lastRpcError}`
      : `Confirmation status is still unknown after ${Math.round(timeoutMs / 1000)}s. Check the signature in Solana Explorer before retrying.`,
  };
}
