# SynthaBasket — Devnet Execution Proof Status

## Status: re-verification required

The previous receipt set has been **retired as execution proof**.

During an execution audit on 2026-09-22, we found that the earlier happy-path script used unrelated Solana transfers as the recorded "confirmed" signatures while the actual Anchor `deposit_and_mint` and `burn_and_redeem` transactions were only simulated. The earlier Jupiter stage also produced no executable swap transactions for the Devnet private-market assets.

Those signatures remain valid Solana transactions, but they **do not prove the operations they were previously labeled as proving** and must not be used as SynthaBasket deposit/mint or redemption receipts.

### Retired signatures

- `2si8SYfUyKrHPiqHAbQFJrTZxVKtiJ3JrZEb4pxz8sRbvmypTs2YqK5uw4cqVorVmLFpKM4rQLMzf2TB9GpQfJd1`
  - Historical operation: SOL transfer used to provision/fund a PDA address.
  - **Not** proof of Anchor `deposit_and_mint`.

- `41W1CAjHYUtU5VFHdK8WBV7hB8WmqLm3DkR4D51XW3c1dSUvaFQJj8mxRwnRy4ZaDiod2bCyZhq4sbXXsUWpFZVt`
  - Historical operation: small SOL self-transfer used as a settlement record.
  - **Not** proof of Anchor `burn_and_redeem`.

## Replacement proof standard

A SynthaBasket operation may be marked **CONFIRMED** only when the transaction that performs that exact operation is itself broadcast and confirmed.

The current proof runner, `scripts/execute-happy-path.ts`, now requires all of the following:

1. Authenticated Pyth price ingestion.
2. An actual Devnet USDC-backed acquisition transaction for configured private-market mirror assets.
3. A confirmed Anchor `deposit_and_mint` transaction containing real SPL constituent transfers.
4. A confirmed Anchor `burn_and_redeem` transaction containing proportional SPL releases.

Route estimates, simulations, setup transfers, self-transfers, or PDA funding transactions are never substituted for execution proof.

## Devnet execution prerequisites

Before generating replacement receipts:

1. Deploy the hardened Anchor program in `contracts/synthabasket_vault`.
2. Configure a funded Devnet runner and mirror authority.
3. Run:

```bash
npm run provision-devnet
```

4. Add the printed `NEXT_PUBLIC_DEVNET_MIRROR_*` values to the application environment.
5. Configure `DEVNET_MIRROR_AUTHORITY_SECRET` on the server.
6. Fund the runner/user with Devnet SOL and Devnet USDC.
7. Run:

```bash
npx tsx scripts/execute-happy-path.ts
```

Only after that script completes successfully should this file contain new transaction receipts.

## Current code-level hardening

The repaired execution path now:

- refuses to advance when an executable constituent acquisition is unavailable;
- broadcasts actual Jupiter transactions on supported mainnet routes;
- uses an explicit Devnet mirror acquisition adapter instead of a synthetic route fallback;
- feeds exact acquired raw token amounts into the vault deposit;
- verifies live basket PDA ownership and constituent configuration before deposit;
- polls Solana for confirmed / failed / expired transaction status rather than treating a short timeout as definitive;
- validates constituent mint identities and token-account ownership inside the Anchor program.

This document intentionally contains **no replacement "confirmed" deposit or redemption signature yet**. New receipts must come from the repaired runner after the Devnet environment is provisioned.
