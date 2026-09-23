export interface RedisRestConfig {
  url: string;
  token: string;
}

export type RedisRestConfigStatus = 'ready' | 'missing' | 'invalid';

export interface RedisRestConfigResult {
  status: RedisRestConfigStatus;
  config: RedisRestConfig | null;
  error?: string;
}

export function getRedisRestConfigResult(): RedisRestConfigResult {
  const rawUrl =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    '';
  const rawToken =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    '';

  if (!rawUrl || !rawToken) {
    return {
      status: 'missing',
      config: null,
    };
  }

  const normalizedUrl = rawUrl.trim().replace(/\/$/, '');

  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== 'https:') {
      return {
        status: 'invalid',
        config: null,
        error:
          'Durable storage requires the Upstash HTTPS REST URL, not a redis:// connection string.',
      };
    }
  } catch {
    return {
      status: 'invalid',
      config: null,
      error: 'Durable storage REST URL is not a valid HTTPS URL.',
    };
  }

  return {
    status: 'ready',
    config: {
      url: normalizedUrl,
      token: rawToken.trim(),
    },
  };
}

export function getRedisRestConfig(): RedisRestConfig | null {
  return getRedisRestConfigResult().config;
}

export function redisRestConfigured(): boolean {
  return getRedisRestConfigResult().status === 'ready';
}
