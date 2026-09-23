import { createHash, randomUUID, verify as verifySignature } from 'crypto';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { getRedisRestConfig } from './redis_config';

const CHALLENGE_TTL_SECONDS = 5 * 60;
const CHALLENGE_PREFIX = 'synthabasket:registration-challenge:v1';
const RATE_PREFIX = 'synthabasket:registration-rate:v1';

const RATE_LIMIT_SCRIPT =
  "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count;";

export class BasketRegistrationAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = 'BasketRegistrationAuthError';
  }
}

export type BasketRegistrationIntent = {
  name: string;
  symbol: string;
  description: string;
  constituents: Array<{
    tokenMint: string;
    targetWeightBps: number;
  }>;
};

export type StoredChallenge = {
  id: string;
  authority: string;
  symbol: string;
  intentHash: string;
  message: string;
  issuedAt: number;
  expiresAt: number;
};

async function redisCommand(command: Array<string | number>): Promise<any> {
  const config = getRedisRestConfig();
  if (!config) {
    throw new BasketRegistrationAuthError(
      'Durable registration storage is unavailable.',
      503,
      'STORAGE_UNAVAILABLE'
    );
  }

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
    throw new BasketRegistrationAuthError(
      `Registration storage returned HTTP ${response.status}.`,
      503,
      'STORAGE_UNAVAILABLE'
    );
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new BasketRegistrationAuthError(
      String(payload.error),
      503,
      'STORAGE_UNAVAILABLE'
    );
  }

  return payload?.result;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function challengeKey(id: string): string {
  return `${CHALLENGE_PREFIX}:${id}`;
}

export function hashBasketRegistrationIntent(
  intent: BasketRegistrationIntent
): string {
  return digest(JSON.stringify(intent));
}

export async function enforceBasketRegistrationRateLimit(
  scope: 'challenge' | 'register',
  identifier: string
): Promise<void> {
  const windowSeconds = scope === 'challenge' ? 300 : 600;
  const limit = scope === 'challenge' ? 12 : 6;
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${RATE_PREFIX}:${scope}:${bucket}:${digest(identifier).slice(0, 32)}`;
  const count = Number(
    await redisCommand(['EVAL', RATE_LIMIT_SCRIPT, 1, key, windowSeconds])
  );

  if (!Number.isFinite(count) || count > limit) {
    throw new BasketRegistrationAuthError(
      'Too many basket registration attempts. Try again after the current rate-limit window.',
      429,
      'RATE_LIMITED'
    );
  }
}

export async function issueBasketRegistrationChallenge(input: {
  intent: BasketRegistrationIntent;
  authority: string;
  domain: string;
}): Promise<{ challengeId: string; message: string; expiresAt: number }> {
  let authority: PublicKey;
  try {
    authority = new PublicKey(input.authority);
  } catch {
    throw new BasketRegistrationAuthError(
      'Registration authority is not a valid Solana address.',
      400,
      'INVALID_AUTHORITY'
    );
  }

  const id = randomUUID();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + CHALLENGE_TTL_SECONDS * 1000;
  const intentHash = hashBasketRegistrationIntent(input.intent);
  const message = [
    'SynthaBasket custom basket registration',
    `Domain: ${input.domain}`,
    'Network: Solana Devnet',
    `Basket: ${input.intent.symbol}`,
    `Authority: ${authority.toBase58()}`,
    `Intent SHA-256: ${intentHash}`,
    `Challenge: ${id}`,
    `Issued At: ${new Date(issuedAt).toISOString()}`,
    `Expires At: ${new Date(expiresAt).toISOString()}`,
    'Sign only to index this verified basket in the SynthaBasket registry.',
  ].join('\n');

  const stored: StoredChallenge = {
    id,
    authority: authority.toBase58(),
    symbol: input.intent.symbol,
    intentHash,
    message,
    issuedAt,
    expiresAt,
  };

  const result = await redisCommand([
    'SET',
    challengeKey(id),
    JSON.stringify(stored),
    'NX',
    'EX',
    CHALLENGE_TTL_SECONDS,
  ]);

  if (result !== 'OK') {
    throw new BasketRegistrationAuthError(
      'Unable to issue a unique registration challenge.',
      503,
      'STORAGE_UNAVAILABLE'
    );
  }

  return { challengeId: id, message, expiresAt };
}

function parseStoredChallenge(value: unknown): StoredChallenge | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value)) as Partial<StoredChallenge>;
    if (
      !parsed.id ||
      !parsed.authority ||
      !parsed.symbol ||
      !parsed.intentHash ||
      !parsed.message ||
      !Number.isFinite(Number(parsed.expiresAt))
    ) {
      return null;
    }
    return {
      id: String(parsed.id),
      authority: String(parsed.authority),
      symbol: String(parsed.symbol),
      intentHash: String(parsed.intentHash),
      message: String(parsed.message),
      issuedAt: Number(parsed.issuedAt || 0),
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

export async function verifyBasketRegistrationChallenge(input: {
  challengeId: string;
  signature: string;
  intent: BasketRegistrationIntent;
}): Promise<StoredChallenge> {
  if (!input.challengeId || !input.signature) {
    throw new BasketRegistrationAuthError(
      'A signed registration challenge is required.',
      401,
      'AUTH_REQUIRED'
    );
  }

  const stored = parseStoredChallenge(
    await redisCommand(['GET', challengeKey(input.challengeId)])
  );

  if (!stored || stored.id !== input.challengeId) {
    throw new BasketRegistrationAuthError(
      'Registration challenge is missing, expired, or already consumed.',
      401,
      'CHALLENGE_INVALID'
    );
  }

  if (stored.expiresAt <= Date.now()) {
    throw new BasketRegistrationAuthError(
      'Registration challenge has expired.',
      401,
      'CHALLENGE_EXPIRED'
    );
  }

  const expectedHash = hashBasketRegistrationIntent(input.intent);
  if (
    stored.symbol !== input.intent.symbol ||
    stored.intentHash !== expectedHash
  ) {
    throw new BasketRegistrationAuthError(
      'The signed challenge does not match this basket registration payload.',
      401,
      'INTENT_MISMATCH'
    );
  }

  let signatureBytes: Uint8Array;
  let authority: PublicKey;
  try {
    signatureBytes = bs58.decode(input.signature);
    authority = new PublicKey(stored.authority);
  } catch {
    throw new BasketRegistrationAuthError(
      'Registration signature is malformed.',
      401,
      'SIGNATURE_INVALID'
    );
  }

  if (signatureBytes.length !== 64) {
    throw new BasketRegistrationAuthError(
      'Registration signature has an invalid length.',
      401,
      'SIGNATURE_INVALID'
    );
  }

  // RFC 8410 SubjectPublicKeyInfo prefix for a raw Ed25519 public key.
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(authority.toBytes()),
  ]);

  const valid = verifySignature(
    null,
    Buffer.from(stored.message, 'utf8'),
    { key: spki, format: 'der', type: 'spki' },
    Buffer.from(signatureBytes)
  );

  if (!valid) {
    throw new BasketRegistrationAuthError(
      'Registration signature could not be verified.',
      401,
      'SIGNATURE_INVALID'
    );
  }

  return stored;
}

export async function consumeBasketRegistrationChallenge(
  challengeId: string
): Promise<void> {
  const consumed = await redisCommand(['GETDEL', challengeKey(challengeId)]);
  if (!consumed) {
    throw new BasketRegistrationAuthError(
      'Registration challenge was already consumed. Request a new challenge.',
      409,
      'CHALLENGE_REPLAYED'
    );
  }
}
