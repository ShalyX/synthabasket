import {
  AccountActivityAsset,
  AccountActivityType,
} from '../activity';

export interface RecordAccountActivityInput {
  owner: string;
  type: AccountActivityType;
  basketId: string;
  basketName: string;
  basketSymbol: string;
  signature: string;
  amountUsd?: number;
  sharesDelta?: number;
  assets?: AccountActivityAsset[];
}

export interface ActivityNotification {
  kind: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export function publishActivityNotification(
  notification: ActivityNotification
): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('synthabasket:notification', {
      detail: notification,
    })
  );
}

function notificationTitle(type: AccountActivityType): string {
  if (type === 'redeem') return 'Redemption confirmed';
  if (type === 'create_basket') return 'Basket deployed';
  return 'Investment confirmed';
}

export async function recordConfirmedActivity(
  input: RecordAccountActivityInput
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        cache: 'no-store',
      });

      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('synthabasket:activity-recorded', {
              detail: payload?.activity || input,
            })
          );
        }
        publishActivityNotification({
          kind: 'success',
          title: notificationTitle(input.type),
          message:
            input.type === 'create_basket'
              ? `${input.basketName} is now indexed.`
              : `${input.basketSymbol} activity was added to your account history.`,
        });
        return true;
      }

      if (response.status !== 404 && response.status !== 503) {
        break;
      }
    } catch {
      // Retry once: RPC indexing can briefly lag a confirmed transaction.
    }

    if (attempt === 0 && typeof window !== 'undefined') {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
    }
  }

  return false;
}
