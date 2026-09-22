# SynthaBasket — Asset-Backed Private-Market Indexes on Solana

[![Solana](https://img.shields.io/badge/Solana-Devnet%20%2F%20Mainnet-14f195?style=flat-square&logo=solana)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Stocklana Hackathon](https://img.shields.io/badge/Hackathon-Stocklana%202026-9945ff?style=flat-square)](https://hackathons.solana.com/hackathons/stocklana)

**SynthaBasket** is a multi-provider private-market index protocol on Solana. It bundles tokenized private-company assets from providers such as PreStocks and Tessera into thematic, redeemable basket tokens backed by constituent SPL assets held in program-controlled vault accounts.

Market/provider data and Pyth are used for NAV and analytics. On-chain backing is determined by the actual constituent balances held by the vault.

---

## Architecture

```text
PreStocks / Tessera / Pyth
          │
          ▼
 Valuation + NAV Engine
          │
          ▼
   Basket Registry
          │
          ▼
   Allocation Engine
      ┌───────────────┐
      │               │
Mainnet           Devnet demo
Jupiter V2        mirror adapter
      │               │
      └───────┬───────┘
              ▼
      constituent SPLs
              │
              ▼
       Basket Vault PDA
              │
              ▼
       Basket SPL shares
          ┌───┴────┐
          ▼        ▼
      Redeem    Meteora config
```

### Mainnet execution

For supported assets with live liquidity, SynthaBasket requests executable Jupiter Swap API V2 transactions, broadcasts each constituent acquisition, confirms each signature, and only then constructs the vault deposit.

### Devnet execution

Canonical private-market provider mints are not treated as if they magically exist with Jupiter liquidity on Devnet.

The Devnet demo uses explicit mirror mints configured through `NEXT_PUBLIC_DEVNET_MIRROR_*`. A server-side Devnet-only adapter builds one atomic transaction that:

1. transfers Devnet USDC from the user to the Devnet mirror treasury; and
2. issues the corresponding test mirror constituents to the user.

Those test assets are then deposited into an isolated Devnet basket state (for example `AITD`) before basket shares are minted.

This mirror path is test infrastructure only. Canonical provider mint addresses remain the asset identity used by the product and valuation layer.

---

## Core baskets

- **AI Titans (`$AIT`)** — OpenAI / Anthropic / Kalshi private-market exposure.
- **Space & Defense (`$ORBIT`)** — SpaceX / Anduril exposure.
- **FinTech Disruptors (`$FINX`)** — tokenized private-market fintech and event-market exposure.
- **PreStocks Sovereign Frontier (`$PREX`)** — a focused basket composed of PreStocks-issued assets.

SynthaBasket itself is provider-neutral: providers are constituent sources rather than separate product modes.

---

## Transaction guarantees in the current code

The application does **not** mark a route or operation successful merely because a quote, simulation, or unrelated transaction exists.

For Invest:

1. every constituent must have an executable acquisition path;
2. each acquisition transaction must confirm;
3. exact acquired raw token amounts are passed to the vault instruction;
4. the live basket PDA, SPL mint, and constituent configuration are checked;
5. the actual Anchor `deposit_and_mint` transaction is broadcast; and
6. Solana signature status is polled until confirmed, failed, expired, or explicitly unknown.

For redemption, the actual Anchor `burn_and_redeem` transaction must confirm.

The Anchor program additionally validates dynamic token accounts against the configured constituent mints and account authorities.

---

## Devnet setup

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Configure `.env.local` from `.env.example`.

The hardened Anchor program must be deployed before provisioning mirrors.

Provision Devnet mirror mints and mirror basket state:

```bash
npm run provision-devnet
```

Copy the printed `NEXT_PUBLIC_DEVNET_MIRROR_*` values into the application/Vercel environment and configure the same authority secret as `DEVNET_MIRROR_AUTHORITY_SECRET` on the server.

The investing wallet also needs Devnet SOL and Devnet USDC.

Run the real execution proof only after provisioning:

```bash
npx tsx scripts/execute-happy-path.ts
```

The proof runner exits with an error instead of manufacturing a receipt if acquisition, deposit/mint, or redemption cannot execute.

---

## Verification

```bash
# Pipeline/schema checks
npx tsx scripts/test-e2e-pipeline.ts

# Provider/API diagnostics
npx tsx scripts/verify-apis.ts

# Share-accounting invariant checks
npx tsx scripts/verify-vault-math.ts

# Next.js production build
npm run build
```

See `DEMO_RUN_RECEIPTS.md` for the verified Devnet execution receipts.

---

## Anchor program

**Devnet hardened program ID**

```text
4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA
```

**PDA seeds**

- Basket state: `[b"basket", symbol.as_bytes()]`
- Basket mint: `[b"basket_mint", symbol.as_bytes()]`
- Constituent vault token account: ATA of `(constituentMint, basketPda)`

**Instructions**

- `initialize_basket(symbol, name, constituents, weights_bps, protocol_fee_bps)`
- `deposit_and_mint(shares_to_mint, constituent_amounts_in)`
- `burn_and_redeem(shares_to_burn)`

The deposit invariant is:

```text
S_mint <= S_total * min_i(ΔA_i / A_i)
```

For first issuance, positive constituent reserves establish the initial basket state. Subsequent issuance is capped by the least-proportional constituent deposit so an underfunded leg cannot dilute existing holders.

---

## Integrations

- **PreStocks** and **Tessera** — private-market asset/provider data.
- **Pyth Hermes** — benchmark/oracle context used by NAV and basis analytics.
- **Jupiter Swap API V2** — executable constituent acquisition on supported mainnet routes.
- **Meteora DBC SDK** — optional basket-liquidity configuration path. A DBC pool is not described as active unless its deployment is actually verified.

---

## Proof integrity

An earlier Devnet receipt set was retired after an audit found that setup/self-transfer signatures had been labeled as deposit and redemption proof while the Anchor operations were only simulated.

Those historical signatures are not used as protocol execution evidence anymore.

The repaired Devnet happy path was subsequently executed successfully against the provisioned AITD basket. The confirmed proof now includes the actual USDC-backed mirror acquisition, the actual Anchor `deposit_and_mint`, and the actual Anchor `burn_and_redeem` transactions recorded in `DEMO_RUN_RECEIPTS.md`.

A receipt is marked **CONFIRMED** only when the transaction performing the claimed operation itself confirms on-chain.
