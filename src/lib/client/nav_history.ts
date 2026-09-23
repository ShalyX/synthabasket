import { BasketDefinition } from '../types';

export interface NavHistoryPoint {
  timestamp: number;
  navUsd: number;
  aumUsd: number;
  totalSharesMinted: number;
  navSource?: BasketDefinition['navSource'];
}

export type NavHistoryByBasket = Record<string, NavHistoryPoint[]>;

const STORAGE_KEY = 'synthabasket:nav-history:v1';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function safeParse(raw: string | null): NavHistoryByBasket {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readNavHistory(): NavHistoryByBasket {
  if (typeof window === 'undefined') return {};
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function bucketSizeForAge(ageMs: number): number {
  if (ageMs <= 2 * 60 * 60 * 1000) return 30 * 1000;
  if (ageMs <= 2 * 24 * 60 * 60 * 1000) return 5 * 60 * 1000;
  if (ageMs <= 8 * 24 * 60 * 60 * 1000) return 30 * 60 * 1000;
  return 2 * 60 * 60 * 1000;
}

function compact(points: NavHistoryPoint[], now: number): NavHistoryPoint[] {
  const cutoff = now - THIRTY_DAYS_MS;
  const buckets = new Map<string, NavHistoryPoint>();

  for (const point of points) {
    if (!Number.isFinite(point.timestamp) || !Number.isFinite(point.navUsd)) continue;
    if (point.timestamp < cutoff) continue;

    const bucketSize = bucketSizeForAge(now - point.timestamp);
    const bucket = Math.floor(point.timestamp / bucketSize);
    const key = `${bucketSize}:${bucket}`;
    const existing = buckets.get(key);

    // Keep the newest real observation within each retention bucket.
    if (!existing || point.timestamp > existing.timestamp) {
      buckets.set(key, point);
    }
  }

  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
}

export function recordBasketNavHistory(
  baskets: BasketDefinition[],
  timestamp: number = Date.now()
): NavHistoryByBasket {
  if (typeof window === 'undefined') return {};

  const history = readNavHistory();

  for (const basket of baskets) {
    if (!Number.isFinite(basket.navUsd) || basket.navUsd <= 0) continue;

    const current = history[basket.id] || [];
    current.push({
      timestamp,
      navUsd: basket.navUsd,
      aumUsd: basket.aumUsd,
      totalSharesMinted: basket.totalSharesMinted,
      navSource: basket.navSource,
    });

    history[basket.id] = compact(current, timestamp);
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (error) {
    console.warn('[NAV history] Unable to persist local history:', error);
  }

  return history;
}

export function getHistoryForRange(
  points: NavHistoryPoint[],
  rangeMs: number,
  now: number = Date.now()
): NavHistoryPoint[] {
  const cutoff = now - rangeMs;
  return points.filter((point) => point.timestamp >= cutoff);
}
