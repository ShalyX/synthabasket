# SynthaBasket — Tokenized Private Markets, In One Basket

[![Solana](https://img.shields.io/badge/Solana-Devnet-14f195?style=flat-square&logo=solana)](https://solana.com)
[![Build](https://img.shields.io/github/actions/workflow/status/ShalyX/synthabasket/build.yml?branch=main&style=flat-square&label=build)](https://github.com/ShalyX/synthabasket/actions/workflows/build.yml)
[![Stocklana Hackathon](https://img.shields.io/badge/Hackathon-Stocklana%202026-9945ff?style=flat-square)](https://hackathons.solana.com/hackathons/stocklana)

**SynthaBasket** is a Solana index-basket app for tokenized private-market assets. A user can connect a wallet, invest Devnet USDC into a thematic basket, receive an SPL basket share, track the position, and redeem that share for the proportional underlying constituent assets held by the basket vault.

**Live app:** https://synthabasket.vercel.app  
**Stocklana submission notes:** [STOCKLANA_SUBMISSION.md](./STOCKLANA_SUBMISSION.md)  
**3-minute demo + technical walkthrough:** [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)  
**Verified Devnet receipts:** [DEMO_RUN_RECEIPTS.md](./DEMO_RUN_RECEIPTS.md)

> The hosted app is a **Devnet product prototype**. Provider marks are market/valuation data, not a promise of executable mainnet liquidity. Devnet execution uses explicit test mirror mints so the demo never pretends canonical provider assets have Devnet liquidity.

---

## The problem

Tokenized private-company exposure is fragmented across providers and individual assets. A user who wants diversified exposure has to discover assets separately, compare provider marks, size allocations manually, manage multiple token accounts, and then track the resulting position themselves.

SynthaBasket turns that into one product flow:

**discover → inspect → invest → receive basket shares → track → partially redeem → fully redeem**

The basket share is not just a dashboard abstraction. When shares are issued, constituent SPL assets are deposited into program-controlled basket vault accounts and the user receives an SPL share token representing their position.

---

## What works today

### Baskets
- Curated private-market baskets across AI, space/defense, fintech, and PreStocks-focused exposure.
- Live provider hydration from **PreStocks** and **Tessera**, with clearly labeled fallback states when a provider is unavailable.
- Basket NAV, composition, real observation history, freshness state, and on-chain verification.
- Exact pre-signing Invest and Redeem quotes with quote expiry and refresh protection.

### Invest
- Connect a Solana wallet.
- Spend Devnet USDC.
- Acquire the basket's Devnet execution constituents.
- Verify the live basket PDA, share mint, and configured constituent accounts.
- Broadcast the real Anchor `deposit_and_mint` instruction.
- Receive basket shares into the user's wallet.
- Persist confirmed activity and refresh Portfolio immediately.

### Redeem
- Burn basket shares with the real Anchor `burn_and_redeem` instruction.
- Receive proportional constituent assets directly into the wallet.
- Record the exact returned assets and marked value.
- Partial redemptions keep the basket position open.
- Full redemptions move the basket into **Closed positions**, while returned constituents remain visible under **Redeemed assets**.

### Portfolio + Account
- Current basket holdings and marked value.
- Cost basis and P&L only when indexed history reconciles with the actual on-chain balance.
- Partial-history states instead of fabricated P&L.
- Redeemed assets and closed-position history.
- Durable wallet activity for investments, redemptions, and basket creation.
- Transaction links to Solana Explorer.

### Create Basket
- Select supported provider assets and target weights.
- Wallet-signed registration flow.
- Deterministic on-chain basket state + share mint.
- Durable custom-basket registry.
- A created basket re-enters the normal product lifecycle: discover → inspect → invest → Portfolio → redeem.

### Markets
- Provider-specific marks and implied valuations.
- Durable real-observation charts; snapshot fallbacks never create fake chart history.
- Cross-provider comparison where the same underlying has multiple provider marks.
- Optional Pyth private-index references only when a supported value actually resolves.
- Jupiter route-based liquidity/basis signals only when a real route can be verified.

---

## Why Solana

SynthaBasket uses Solana for the parts that should be independently verifiable and composable:

- **SPL assets** for basket shares and constituents.
- **PDAs** for deterministic basket state and vault authority.
- **Atomic program instructions** for reserve deposit/share minting and share burn/reserve release.
- **Transparent balances** so reserve state and user ownership can be checked without trusting the UI.
- **Fast, low-cost settlement** for a product that may touch multiple constituent token accounts in one user journey.

---

## Architecture

```text
PreStocks / Tessera provider data
            │
            ▼
   Valuation + market layer
            │
            ├──────────────► durable NAV / market history
            │
            ▼
      Basket registry
            │
            ▼
      Quote + router
            │
            ▼
  Devnet mirror acquisition
      (test infrastructure)
            │
            ▼
 constituent SPL token accounts
            │
            ▼
       Basket Vault PDA
            │
            ▼
       SPL basket shares
            │
       mint / burn
            │
            ▼
        User wallet
```

The app deliberately separates **market valuation** from **reserve accounting**. Provider marks power NAV and analytics. The Solana program tracks the constituent reserves associated with issued basket shares.

---

## Core baskets

- **AI Titans (`$AIT`)** — OpenAI / Anthropic / Kalshi exposure.
- **Space & Defense (`$ORBIT`)** — SpaceX / Anduril exposure.
- **FinTech Disruptors (`$FINX`)** — private-market fintech / event-market exposure.
- **PreStocks Sovereign Frontier (`$PREX`)** — a focused basket composed of PreStocks-issued assets.

SynthaBasket is provider-neutral at the product layer: providers are constituent sources rather than separate user experiences.

---

## Devnet execution model

Canonical provider mints are never treated as if they automatically have Devnet liquidity.

For the hosted demo, supported assets map to explicit 6-decimal **Devnet execution mirror mints**. The server-side Devnet adapter builds an acquisition transaction that:

1. transfers Devnet USDC from the user to the Devnet mirror treasury; and
2. issues the corresponding test mirror constituents to the user.

Those test constituents are then deposited into the basket vault before shares are minted.

This path exists only to make the Devnet demo executable and auditable. Canonical provider mint addresses remain the asset identity used by the provider/valuation layer.

---

## Transaction guarantees

SynthaBasket does not call a route or operation successful because a quote, simulation, setup transfer, or unrelated signature exists.

For **Invest**:

1. every constituent must have an executable acquisition path;
2. acquisition transactions must confirm;
3. exact acquired raw token amounts are passed into the vault instruction;
4. basket state, share mint, and constituent configuration are verified;
5. the actual Anchor `deposit_and_mint` transaction is broadcast; and
6. Solana confirmation is checked before a success receipt is shown.

For **Redeem**, the actual Anchor `burn_and_redeem` transaction must confirm before the UI records the redemption.

The Anchor program also validates dynamic token accounts against the configured constituent mints and authorities.

---

## Anchor program

**Devnet program ID**

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

Subsequent issuance is bounded by the least-proportional constituent deposit, preventing an underfunded leg from diluting existing share holders.

---

## Integrations

- **Tessera** — official Product API marks for T-Tokens including OpenAI, SpaceX, and Kalshi.
- **PreStocks** — private-company token metadata / marks for supported PreStocks assets.
- **Pyth** — optional indicative private-index references when the configured Pyth Pro path resolves a supported value. Pyth references are not NAV inputs or executable prices.
- **Jupiter Swap API V2** — route verification / acquisition path for supported non-Devnet flows; the current hosted UI remains Devnet-only.
- **Upstash Redis** — durable NAV history, market observations, custom basket registry, and wallet activity.

---

## Run locally

Requirements:
- Node.js 22
- a Solana Devnet RPC
- Devnet SOL + Devnet USDC for execution testing

```bash
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

See [`.env.example`](./.env.example) for provider, Redis, Pyth, Jupiter, RPC, and Devnet mirror configuration.

### Verification commands

```bash
# Production build
npm run build

# Provider/API diagnostics
npm run verify-apis

# Static execution pipeline checks
npx tsx scripts/test-e2e-pipeline.ts

# Share-accounting invariant checks
npx tsx scripts/verify-vault-math.ts

# Real Devnet proof runner (requires funded/configured runner)
npm run execute-happy-path
```

The proof runner exits with an error instead of manufacturing a success receipt if acquisition, deposit/mint, or redemption cannot execute.

---

## Proof integrity

An earlier Devnet receipt set was retired after an audit found that setup/self-transfer signatures had been labeled as deposit/redemption proof while the Anchor operations were only simulated.

Those signatures are not used as protocol evidence.

The repaired proof runner records only the transaction that actually performs the claimed operation. See [DEMO_RUN_RECEIPTS.md](./DEMO_RUN_RECEIPTS.md) for the confirmed acquisition, Anchor deposit/mint, and Anchor burn/redeem receipts.

---

## Stocklana 2026

SynthaBasket is built for the **Stocklana 2026** hackathon.

The current submission is aimed at:
- **Solana Foundation Main Track**
- **Tessera — Best Use of Tessera, Pre-IPO stocks**

See [STOCKLANA_SUBMISSION.md](./STOCKLANA_SUBMISSION.md) for judge-facing copy and [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) for the recording plan.
