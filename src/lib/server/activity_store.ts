import { AccountActivity } from '../activity';
import { getRedisRestConfig, redisRestConfigured } from './redis_config';

const KEY_PREFIX = 'synthabasket:activity:v1';
const RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const RETENTION_SECONDS = 420 * 24 * 60 * 60;

export function durableActivityConfigured(): boolean {
  return redisRestConfigured();
}

async function redisCommand(command: Array<string | number>): Promise<any> {
  const config = getRedisRestConfig();
  if (!config) return null;

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Durable activity store returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload?.error) throw new Error(payload.error);
  return payload?.result;
}

function activityKey(owner: string): string {
  return `${KEY_PREFIX}:${owner}`;
}

export async function recordAccountActivity(
  activity: AccountActivity
): Promise<boolean> {
  if (!durableActivityConfigured()) return false;

  const key = activityKey(activity.owner);
  const cutoff = Date.now() - RETENTION_MS;
  const member = JSON.stringify(activity);

  await redisCommand(['ZADD', key, activity.timestamp, member]);
  await redisCommand(['ZREMRANGEBYSCORE', key, 0, cutoff]);
  await redisCommand(['EXPIRE', key, RETENTION_SECONDS]);
  return true;
}

export async function readAccountActivities(
  owner: string,
  limit = 100
): Promise<AccountActivity[]> {
  if (!durableActivityConfigured()) return [];

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 250);
  const raw = await redisCommand([
    'ZREVRANGE',
    activityKey(owner),
    0,
    safeLimit - 1,
  ]);

  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const activities: AccountActivity[] = [];

  for (const member of raw) {
    try {
      const activity = JSON.parse(String(member)) as AccountActivity;
      if (
        !activity ||
        typeof activity.id !== 'string' ||
        typeof activity.signature !== 'string' ||
        typeof activity.timestamp !== 'number' ||
        seen.has(activity.id)
      ) {
        continue;
      }
      seen.add(activity.id);
      activities.push(activity);
    } catch {
      // Ignore malformed historical members rather than failing the feed.
    }
  }

  return activities.sort((left, right) => right.timestamp - left.timestamp);
}
