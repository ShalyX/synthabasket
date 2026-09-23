# SynthaBasket — Tokenized Private Markets, In One Basket

[![Solana](https://img.shields.io/badge/Solana-Devnet-14f195?style=flat-square&logo=solana)](https://solana.com)
[![Build](https://img.shields.io/github/actions/workflow/status/ShalyX/synthabasket/build.yml?branch=main&style=flat-square&label=build)](https://github.com/ShalyX/synthabasket/actions/workflows/build.yml)
[![Stocklana Hackathon](https://img.shields.io/badge/Hackathon-Stocklana%202026-9945ff?style=flat-square)](https://hackathons.solana.com/hackathons/stocklana)

**SynthaBasket** is a Solana index-basket app for tokenized private-market assets. Users invest Devnet USDC into thematic baskets, receive SPL basket shares backed by constituent assets held in program-controlled vault accounts, track their positions, and redeem shares for the proportional underlying constituents.

**Live app:** https://synthabasket.vercel.app  
**Technical walkthrough:** [TECHNICAL_WALKTHROUGH.md](./TECHNICAL_WALKTHROUGH.md)  
**Verified Devnet receipts:** [DEMO_RUN_RECEIPTS.md](./DEMO_RUN_RECEIPTS.md)

> The hosted app runs on **Solana Devnet**. Provider marks are valuation data; Devnet execution uses explicit test mirror mints for supported constituents.

---

## The product

Tokenized private-company assets are spread across providers and individual instruments. SynthaBasket turns that fragmented experience into a single portfolio workflow:

**discover → inspect → invest → receive basket shares → track → partially redeem → fully redeem**

Basket shares are on-chain SPL assets. During investment, constituent tokens move into program-controlled basket vault accounts and basket shares are minted to the user. During redemption, shares are burned and the proportional underlying constituents are released back to the wallet.

---

## What SynthaBasket does

### Baskets

- Curated private-market baskets across AI, space/defense, fintech, and provider-focused exposure.
- Provider hydration from **PreStocks** and **Tessera**.
- Basket NAV, composition, recorded market history, freshness, and on-chain verification.
- Exact pre-signing Invest and Redeem quotes with quote expiry.

### Invest

- Connect a Solana wallet.
- Enter a Devnet USDC amount.
- Acquire the basket's Devnet execution constituents.
- Verify the basket PDA, share mint, and configured constituent accounts.
- Execute the Anchor `deposit_and_mint` instruction.
- Receive basket shares in the wallet.
- See the confirmed position in Portfolio and Account Activity.

### Redeem

- Burn basket shares with Anchor `burn_and_redeem`.
- Receive proportional constituent assets directly into the wallet.
- See the exact assets returned and their marked value.
- Partial redemption keeps the basket position open.
- Full redemption moves the basket into **Closed positions** while returned constituents remain visible under **Redeemed assets**.

### Portfolio + Account

- Current basket holdings and marked value.
- Cost basis and P&L when indexed activity reconciles with the current on-chain share balance.
- Redeemed assets and closed-position history.
- Durable wallet activity for investments, redemptions, and basket creation.
- Direct Solana Explorer links for confirmed transactions.

### Create Basket

- Select supported assets and target weights.
- Sign the basket registration with the connected wallet.
- Initialize deterministic on-chain basket state and a share mint.
- Persist the custom basket in the registry.
- Use the same discover → inspect → invest → Portfolio → redeem lifecycle as curated baskets.

### Markets

- Provider-specific marks and implied valuations.
- Recorded live-observation market history.
- Cross-provider comparison where the same underlying is available from multiple providers.
- Optional Pyth private-index references when a supported value resolves.
- Jupiter route/liquidity signals when a live route is available.

---

## Why Solana

SynthaBasket uses Solana for ownership, custody, reserve accounting, and settlement:

- **SPL tokens** represent basket shares and constituent assets.
- **PDAs** provide deterministic basket state and vault authority.
- **Anchor instructions** handle constituent deposits, share minting, share burning, and reserve release.
- **On-chain balances** expose reserve state and user ownership directly.
- **Fast, low-cost transactions** make multi-asset basket interactions practical.

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

Market valuation and reserve accounting are separate layers. Provider marks power NAV and analytics; the Solana program tracks the constituent reserves associated with issued basket shares.

---

## Core baskets

- **AI Titans (`$AIT`)** — OpenAI / Anthropic / Kalshi exposure.
- **Space & Defense (`$ORBIT`)** — SpaceX / Anduril exposure.
- **FinTech Disruptors (`$FINX`)** — private-market fintech / event-market exposure.
- **PreStocks Sovereign Frontier (`$PREX`)** — a focused basket composed of PreStocks-issued assets.

The product layer treats providers as constituent sources, so baskets can combine supported assets into a single portfolio experience.

---

## Devnet execution model

The hosted demo maps supported constituent identities to explicit 6-decimal **Devnet execution mirror mints**.

For an investment:

1. Devnet USDC is transferred from the user to the mirror treasury.
2. The corresponding test mirror constituents are issued to the user.
3. Those constituents are deposited into the basket vault.
4. The Anchor program mints the resulting basket shares.

Provider mint addresses remain the identity and valuation references used by the market-data layer.

---

## Transaction flow

For **Invest**:

1. build the constituent acquisition quote;
2. confirm constituent acquisition;
3. pass the acquired raw token amounts into the vault instruction;
4. verify basket state, share mint, and constituent configuration;
5. execute Anchor `deposit_and_mint`;
6. confirm the transaction and refresh the user's position.

For **Redeem**:

1. verify the user's basket-share balance and current vault state;
2. execute Anchor `burn_and_redeem`;
3. confirm the transaction;
4. refresh the returned constituent balances and basket position.

The Anchor program validates the supplied token accounts against the basket's configured constituent mints and authorities.

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

Subsequent issuance is bounded by the least-proportional constituent deposit so share issuance remains aligned with basket reserves.

---

## Integrations

- **Tessera** — Product API marks for supported T-Tokens including OpenAI, SpaceX, and Kalshi.
- **PreStocks** — private-company token metadata and marks for supported PreStocks assets.
- **Pyth** — optional indicative private-index references when a configured value resolves.
- **Jupiter Swap API V2** — route and liquidity verification for supported non-Devnet paths.
- **Upstash Redis** — durable NAV history, market observations, custom basket registry, and wallet activity.

---

## Technical walkthrough

For the implementation path, see [TECHNICAL_WALKTHROUGH.md](./TECHNICAL_WALKTHROUGH.md).

The walkthrough covers:

- Anchor basket state, share minting, and redemption;
- the execution client and quote lifecycle;
- provider hydration and durable history;
- wallet-signed custom basket registration;
- confirmed Devnet execution receipts.

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

# Devnet execution proof runner
npm run execute-happy-path
```

---

## Devnet execution receipts

[DEMO_RUN_RECEIPTS.md](./DEMO_RUN_RECEIPTS.md) contains confirmed transactions for:

1. Devnet USDC-backed constituent acquisition;
2. Anchor basket deposit and share minting;
3. Anchor basket-share burn and proportional redemption.

---

## Stocklana 2026

SynthaBasket is built for the **Stocklana 2026** hackathon, including the **Tessera — Best Use of Tessera, Pre-IPO stocks** sponsor track.
