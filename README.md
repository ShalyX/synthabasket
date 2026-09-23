# SynthaBasket — Private-Market Indexes on Solana

[![Solana](https://img.shields.io/badge/Solana-Devnet-14f195?style=flat-square&logo=solana)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Stocklana Hackathon](https://img.shields.io/badge/Hackathon-Stocklana%202026-9945ff?style=flat-square)](https://hackathons.solana.com/hackathons/stocklana)

**SynthaBasket** is a multi-provider private-market index protocol on Solana. It bundles tokenized private-company assets from providers such as PreStocks and Tessera into thematic basket shares. When shares are issued, custody is represented by constituent SPL assets held in program-controlled vault accounts.

Provider marks drive basket NAV and market analytics. The Markets UI reserves an optional Pyth reference field for indicative index values; unavailable values remain blank and never affect NAV or execution. For issued basket shares, reserve backing is determined by the constituent balances accounted for by the on-chain basket program.

---

## Architecture

```text
   PreStocks / Tessera
          │
          ▼
 Valuation + NAV Engine
          │
          ▼
   Basket Registry
          │
          ▼
   Allocation Engine
          │
          ▼
 Devnet mirror adapter
          │
          ▼
      constituent SPLs
              │
              ▼
       Basket Vault PDA
              │
              ▼
       Basket SPL shares
              │
              ▼
           Redeem
```

### Hosted execution scope

The submitted and hosted application is Devnet-only. The repository contains a Jupiter V2 path for non-Devnet acquisition and route verification, but the current UI does not expose a Mainnet network switch.

### Devnet execution

Canonical private-market provider mints are not treated as if they magically exist with Jupiter liquidity on Devnet.

The Devnet demo uses explicit 6-decimal execution mirror mints. Curated mirrors can be configured through `NEXT_PUBLIC_DEVNET_MIRROR_*`; for supported provider assets without a configured mirror, the server deterministically provisions one using `DEVNET_MIRROR_AUTHORITY_SECRET` before custom-basket initialization. A server-side Devnet-only adapter then builds one atomic acquisition transaction that:

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

For the curated AIT proof runner, provision its known Devnet mirror mints and basket state:

```bash
npm run provision-devnet
```

Copy any printed `NEXT_PUBLIC_DEVNET_MIRROR_*` values used by that proof setup into the application/Vercel environment and configure the same authority secret as `DEVNET_MIRROR_AUTHORITY_SECRET` on the server. The hosted Create Basket flow can provision missing supported mirrors on demand with that server authority.

The investing wallet also needs Devnet SOL and Devnet USDC.

Run the real execution proof only after the curated proof basket is provisioned:

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

- **PreStocks** and **Tessera** — private-market provider marks used for basket valuation.
- **Pyth private-company indices** — optional indicative references for OpenAI / Anthropic analytics when a supported value is available; absent values remain blank and are never NAV inputs or executable prices.
- **Jupiter Swap API V2** — executable constituent acquisition and verified route-based liquidity signals on supported mainnet routes.

---

## Proof integrity

An earlier Devnet receipt set was retired after an audit found that setup/self-transfer signatures had been labeled as deposit and redemption proof while the Anchor operations were only simulated.

Those historical signatures are not used as protocol execution evidence anymore.

The repaired Devnet happy path was subsequently executed successfully against the provisioned AITD basket. The confirmed proof now includes the actual USDC-backed mirror acquisition, the actual Anchor `deposit_and_mint`, and the actual Anchor `burn_and_redeem` transactions recorded in `DEMO_RUN_RECEIPTS.md`.

A receipt is marked **CONFIRMED** only when the transaction performing the claimed operation itself confirms on-chain.
