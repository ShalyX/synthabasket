'use client';

export type TransactionErrorContext =
  | 'quote'
  | 'balance'
  | 'invest'
  | 'redeem'
  | 'create_basket';

export interface UserFacingTransactionError {
  message: string;
  recoveryAction: string;
  technicalError?: string;
}

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error || '');
  }
}

function technicalDetail(raw: string): string | undefined {
  const compact = raw.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.slice(0, 1200);
}

export function explainTransactionError(
  error: unknown,
  context: TransactionErrorContext
): UserFacingTransactionError {
  const raw = rawErrorMessage(error);
  const lower = raw.toLowerCase();
  const technicalError = technicalDetail(raw);

  if (
    /user rejected|rejected the request|declined|cancelled|canceled|4001/.test(
      lower
    )
  ) {
    return {
      message: 'The wallet request was cancelled. No new transaction was sent.',
      recoveryAction: 'Review the quote and try again when you are ready to sign.',
      technicalError,
    };
  }

  if (/insufficient.*usdc|need .*usdc|wallet has .*usdc/.test(lower)) {
    return {
      message: 'This wallet does not have enough USDC for that investment.',
      recoveryAction: 'Reduce the amount or fund the wallet with Devnet USDC, then refresh the quote.',
      technicalError,
    };
  }

  if (/only hold|insufficient.*share|not enough.*share|burn.*exceed/.test(lower)) {
    return {
      message: 'The redemption amount is higher than the basket shares currently in this wallet.',
      recoveryAction: 'Use Max or enter a smaller share amount, then request a fresh quote.',
      technicalError,
    };
  }

  if (
    /blockhash not found|block height exceeded|expired|stale quote|quote.*changed|account.*changed|slippage/.test(
      lower
    )
  ) {
    return {
      message: 'The chain state changed before the transaction could be signed or confirmed.',
      recoveryAction: 'Refresh the quote and submit again with the latest vault state.',
      technicalError,
    };
  }

  if (
    /429|rate limit|too many requests|failed to fetch|fetch failed|rpc|node is behind|service unavailable|http 50[234]/.test(
      lower
    )
  ) {
    return {
      message: 'Solana Devnet is not responding reliably right now.',
      recoveryAction: 'Wait a moment and retry. Do not resend a submitted transaction until its signature status is known.',
      technicalError,
    };
  }

  if (
    /account not found|could not find account|invalid account data|associated token|token account/.test(
      lower
    )
  ) {
    return {
      message: 'A required token account is not ready for this transaction.',
      recoveryAction: 'Refresh wallet balances and try again. SynthaBasket will recreate supported token accounts when the route allows it.',
      technicalError,
    };
  }

  if (
    /no executable|acquisition route|quote unavailable|price.*unavailable|market data|unable to read the live vault|live executable quote/.test(
      lower
    )
  ) {
    return {
      message:
        context === 'quote'
          ? 'A fresh executable quote is not available right now.'
          : 'The full basket route is not executable with the current live data.',
      recoveryAction: 'Refresh the quote in a moment. SynthaBasket will not ask you to sign until the full route can be verified.',
      technicalError,
    };
  }

  if (/simulation failed|preflight|custom program error|anchorerror/.test(lower)) {
    return {
      message: 'The basket program rejected this transaction during its preflight safety check.',
      recoveryAction: 'Refresh the quote and try once more. If it repeats, open Technical details before retrying again.',
      technicalError,
    };
  }

  if (/insufficient funds|insufficient lamports|fee payer/.test(lower)) {
    return {
      message: 'The wallet does not have enough balance to complete the transaction and network fees.',
      recoveryAction: 'Check both the requested asset balance and Devnet SOL for fees, then try again.',
      technicalError,
    };
  }

  const fallback =
    context === 'quote'
      ? 'We could not produce a fresh executable quote.'
      : context === 'redeem'
      ? 'The redemption did not complete.'
      : context === 'invest'
      ? 'The investment did not complete.'
      : 'The transaction did not complete.';

  return {
    message: fallback,
    recoveryAction: 'Review the current balances and quote, then try again. Technical details are available below.',
    technicalError,
  };
}
