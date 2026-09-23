import { Connection } from '@solana/web3.js';

let devnetConnection: Connection | null = null;

export function getDevnetConnection(): Connection {
  if (!devnetConnection) {
    devnetConnection = new Connection(
      process.env.SOLANA_DEVNET_RPC_URL ||
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
        'https://api.devnet.solana.com',
      {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 30_000,
        disableRetryOnRateLimit: false,
      }
    );
  }

  return devnetConnection;
}
