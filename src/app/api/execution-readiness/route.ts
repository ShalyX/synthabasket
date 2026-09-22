import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK || process.env.NEXT_PUBLIC_NETWORK || 'devnet',
    authorityConfigured: Boolean(
      process.env.DEVNET_MIRROR_AUTHORITY_SECRET || process.env.RUNNER_PRIVATE_KEY
    ),
    runnerConfigured: Boolean(process.env.RUNNER_PRIVATE_KEY),
    mirrorAuthorityConfigured: Boolean(process.env.DEVNET_MIRROR_AUTHORITY_SECRET),
  });
}
