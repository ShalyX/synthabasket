import { Connection, PublicKey } from '@solana/web3.js';

const WALLET = new PublicKey('CwThEkTY7nch5wCAxehQXfBLY2yHopcVPDE7kj6eESxG');
const PROGRAM = new PublicKey('4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA');
const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

const LABELS: Record<string,string> = {
  '3CLenKY9X1hniMKsTi2KPANfWi4C27qyus6HDknrZzUK':'AITD',
  'Bj47e5GCXuaxmbPjDRF5iSVjZ1Y4uEFoaDoPUAfD1xkB':'T-OpenAI mirror',
  'GxtkS2jUU5br9JJB64FuvvUxwp2sadxwCCRsZwiqAR3p':'ANTHROPIC mirror',
  'HSv2zqvfSXv2CQ7TW79HpQPYziNvoiY3CKpGu7Ec3hFh':'T-Kalshi mirror',
};

function keyAt(message:any, i:number): PublicKey {
  const keys: PublicKey[] = message.staticAccountKeys || message.accountKeys;
  return new PublicKey(keys[i]);
}

async function main() {
  const sigs = await connection.getSignaturesForAddress(WALLET, { limit: 12 }, 'confirmed');
  for (const s of sigs) {
    const tx = await connection.getTransaction(s.signature, {
      commitment:'confirmed',
      maxSupportedTransactionVersion:0,
    });
    if (!tx?.meta) continue;

    const msg:any = tx.transaction.message;
    const instructions:any[] = msg.compiledInstructions || msg.instructions || [];
    const invokesProgram = instructions.some((ix:any) => {
      if (typeof ix.programIdIndex === 'number') {
        return keyAt(msg, ix.programIdIndex).equals(PROGRAM);
      }
      return ix.programId && new PublicKey(ix.programId).equals(PROGRAM);
    });
    if (!invokesProgram) continue;

    console.log('SIGNATURE', s.signature);
    console.log('BLOCK_TIME', s.blockTime);
    console.log('ERR', JSON.stringify(tx.meta.err));

    const pre = tx.meta.preTokenBalances || [];
    const post = tx.meta.postTokenBalances || [];
    const byKey = new Map<string,{mint:string, owner?:string, pre:bigint, post:bigint, decimals:number}>();

    for (const b of pre) {
      const key = b.accountIndex+'|'+b.mint;
      byKey.set(key,{mint:b.mint, owner:b.owner, pre:BigInt(b.uiTokenAmount.amount), post:0n, decimals:b.uiTokenAmount.decimals});
    }
    for (const b of post) {
      const key = b.accountIndex+'|'+b.mint;
      const cur = byKey.get(key) || {mint:b.mint, owner:b.owner, pre:0n, post:0n, decimals:b.uiTokenAmount.decimals};
      cur.post = BigInt(b.uiTokenAmount.amount);
      cur.owner = b.owner || cur.owner;
      byKey.set(key,cur);
    }

    for (const v of byKey.values()) {
      if (v.owner !== WALLET.toBase58()) continue;
      const delta = v.post - v.pre;
      if (delta === 0n) continue;
      const label = LABELS[v.mint] || v.mint;
      console.log('TOKEN_DELTA', label, v.mint, delta.toString(), 'decimals', v.decimals);
    }
    console.log('---');
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
