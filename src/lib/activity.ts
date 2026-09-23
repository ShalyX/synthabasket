export type AccountActivityType = 'invest' | 'redeem' | 'create_basket';

export interface AccountActivityAsset {
  symbol: string;
  amount: number;
  mint?: string;
  valueUsd?: number;
}

export interface AccountActivity {
  id: string;
  owner: string;
  type: AccountActivityType;
  basketId: string;
  basketName: string;
  basketSymbol: string;
  signature: string;
  timestamp: number;
  status: 'confirmed';
  amountUsd?: number;
  sharesDelta?: number;
  resultingShareBalance?: number;
  positionClosed?: boolean;
  assets?: AccountActivityAsset[];
}

export interface PositionHistorySummary {
  historyComplete: boolean;
  activityCount: number;
  lastActivityAt: number | null;
  indexedShares: number;
  totalInvestedUsd: number | null;
  netCostBasisUsd: number | null;
  averageEntryUsd: number | null;
  realizedPnlUsd: number | null;
  unrealizedPnlUsd: number | null;
}

const SHARE_TOLERANCE = 0.000001;

function finiteNonNegative(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function summarizePositionHistory(
  activities: AccountActivity[],
  currentShares: number,
  currentValueUsd: number | null
): PositionHistorySummary {
  const relevant = activities
    .filter(
      (activity) =>
        activity.type === 'invest' || activity.type === 'redeem'
    )
    .sort((left, right) => left.timestamp - right.timestamp);

  let indexedShares = 0;
  let costBasis = 0;
  let totalInvested = 0;
  let realizedPnl = 0;
  let basisValid = relevant.length > 0;
  let realizedValid = true;

  for (const activity of relevant) {
    const delta = Number(activity.sharesDelta || 0);

    if (activity.type === 'invest') {
      if (delta <= 0 || !finiteNonNegative(activity.amountUsd)) {
        basisValid = false;
        continue;
      }

      indexedShares += delta;
      costBasis += activity.amountUsd;
      totalInvested += activity.amountUsd;
      continue;
    }

    const sharesBurned = Math.abs(delta);
    if (
      sharesBurned <= 0 ||
      indexedShares <= SHARE_TOLERANCE ||
      sharesBurned > indexedShares + SHARE_TOLERANCE
    ) {
      basisValid = false;
      realizedValid = false;
      indexedShares = Math.max(0, indexedShares - sharesBurned);
      continue;
    }

    const averageCost = costBasis / indexedShares;
    const removedCost = averageCost * sharesBurned;
    indexedShares = Math.max(0, indexedShares - sharesBurned);
    costBasis = Math.max(0, costBasis - removedCost);

    if (finiteNonNegative(activity.amountUsd)) {
      realizedPnl += activity.amountUsd - removedCost;
    } else {
      realizedValid = false;
    }
  }

  const aligned =
    basisValid &&
    Math.abs(indexedShares - currentShares) <=
      Math.max(SHARE_TOLERANCE, Math.abs(currentShares) * 0.000001);

  const lastActivityAt =
    relevant.length > 0 ? relevant[relevant.length - 1].timestamp : null;

  if (!aligned) {
    return {
      historyComplete: false,
      activityCount: relevant.length,
      lastActivityAt,
      indexedShares,
      totalInvestedUsd: null,
      netCostBasisUsd: null,
      averageEntryUsd: null,
      realizedPnlUsd: null,
      unrealizedPnlUsd: null,
    };
  }

  const averageEntryUsd =
    currentShares > SHARE_TOLERANCE ? costBasis / currentShares : 0;

  return {
    historyComplete: true,
    activityCount: relevant.length,
    lastActivityAt,
    indexedShares,
    totalInvestedUsd: totalInvested,
    netCostBasisUsd: costBasis,
    averageEntryUsd,
    realizedPnlUsd: realizedValid ? realizedPnl : null,
    unrealizedPnlUsd:
      currentValueUsd === null || !Number.isFinite(currentValueUsd)
        ? null
        : currentValueUsd - costBasis,
  };
}
