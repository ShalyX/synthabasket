# Stocklana 2026 — Submission Sheet

Use this file as the source of truth when filling the Stocklana submission form.

## Project

**Name:** SynthaBasket

**Tagline:** Tokenized private markets. In one basket.

**Category / wedge:** Investing — index baskets for tokenized private-company assets.

**Live demo:** https://synthabasket.vercel.app

**GitHub:** https://github.com/ShalyX/synthabasket

**Network:** Solana Devnet

**Program ID:** `4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA`

---

## Short description

SynthaBasket lets users invest Devnet USDC into thematic baskets of tokenized private-market assets, receive an on-chain SPL basket share backed by constituent tokens in program-controlled vaults, track the position and activity, create custom baskets, and redeem shares back into the underlying assets.

## Longer description

Private-market tokens are fragmented across providers and individual assets. A user who wants diversified exposure has to discover instruments separately, compare marks, size allocations, manage several token accounts, and track everything themselves.

SynthaBasket turns that into one Solana-native product flow. Users discover curated or custom baskets, inspect composition and live provider marks, invest Devnet USDC, and receive an SPL basket share. The basket program accounts for constituent reserves in program-controlled vault accounts. Users can track positions, cost history, activity, and returned assets, then partially or fully redeem their basket shares for the proportional underlying constituents.

The product integrates private-market data from PreStocks and Tessera, durable real-observation charts, on-chain basket verification, wallet-signed custom basket creation, and a full Portfolio / Activity lifecycle. Devnet execution uses explicit test mirror mints so the demo remains executable without pretending canonical provider assets have Devnet liquidity.

## The user problem

Tokenized private-company assets may exist on Solana, but owning several of them is still a fragmented experience:

- discovery happens provider by provider;
- there is no simple thematic allocation product;
- users must size and track each asset themselves;
- reserve/custody state is hard to understand from a normal investing UI;
- redemption and post-redemption accounting are easy to lose track of.

SynthaBasket packages that complexity into a familiar index-style workflow while keeping the underlying Solana state inspectable.

## Why Solana

Solana is not just a payment rail in SynthaBasket.

- Basket shares and constituents are SPL assets.
- Deterministic PDAs hold basket state and authority.
- Deposit/mint and burn/redeem are Anchor program instructions.
- Reserve and user balances can be independently verified.
- Low-cost, fast settlement makes multi-asset basket interactions practical.
- The resulting SPL shares and constituent assets remain composable with the wider Solana ecosystem.

## Working end-to-end demo

A fresh user can:

1. open SynthaBasket in a new browser;
2. connect a new Solana wallet;
3. discover and inspect a basket;
4. invest Devnet USDC;
5. receive basket shares;
6. see the confirmed investment in Portfolio and Account Activity;
7. partially redeem and receive constituent assets;
8. fully redeem and close the basket position;
9. see returned assets and closed-position history;
10. create a custom basket and deploy its deterministic on-chain state.

This exact fresh-wallet / fresh-browser lifecycle has been manually exercised against the hosted Devnet app.

## What is on-chain

- basket state PDA;
- deterministic basket share mint;
- configured constituent mints and weights;
- constituent vault token accounts;
- user basket-share token account;
- `deposit_and_mint`;
- `burn_and_redeem`;
- custom basket initialization.

Verified transaction receipts are recorded in `DEMO_RUN_RECEIPTS.md`.

## Data / infrastructure

- **Tessera:** official Product API marks for T-Tokens.
- **PreStocks:** supported private-market asset data / marks.
- **Pyth:** optional indicative private-index references when a supported Pro value resolves; never silently substituted into NAV.
- **Jupiter V2:** verified route/liquidity path for supported non-Devnet flows.
- **Upstash Redis:** durable NAV history, market observations, custom basket registry, and account activity.

## Sponsor track

### Select: Tessera — Best Use of Tessera, Pre-IPO stocks

The live product uses Tessera OpenAI / SpaceX / Kalshi T-Tokens as basket constituents and uses the official Tessera Product API for market data. The basket UX turns those individual instruments into a consumer-facing diversified product.

### Do not select: PreStocks

The current product also integrates non-PreStocks pre-IPO tokens from Tessera. The Stocklana PreStocks bounty explicitly says projects integrating any non-PreStocks pre-IPO tokens are ineligible.

### Do not select: Meteora

The current release candidate does not integrate Meteora DBC. Previous DBC-oriented code/claims were removed rather than presenting an unverified integration.

### Do not select: Clawpump

The product does not launch a stock-paired token/liquidity pool with Clawpump + Meteora.

### Do not select: Pyth

Pyth is implemented as an optional indicative benchmark surface, but it is not central to execution or NAV in the current release candidate. The submission should not overstate that integration.

---

## Suggested submission copy

### One-line pitch

**SynthaBasket makes tokenized private markets investable like an index: one USDC deposit, one on-chain basket share, transparent reserves, and proportional redemption.**

### “What did you build?”

We built a working Solana Devnet application for diversified private-market exposure. SynthaBasket combines provider assets into curated or user-created baskets, turns a USDC investment into an SPL basket share backed by constituent tokens held in program-controlled vault accounts, and lets users track and redeem the position through a complete consumer portfolio experience.

Unlike an analytics-only basket, SynthaBasket executes real on-chain basket minting and redemption. The app verifies the live basket PDA/share mint before signing, confirms transactions before showing success, records durable wallet activity, and exposes returned constituent assets after redemption.

### “Why is this useful?”

Tokenized private-company assets are becoming available, but the user experience is still asset-by-asset and provider-by-provider. SynthaBasket gives users a simpler diversification primitive while preserving transparent Solana custody and composability.

### “What is technically interesting?”

- proportional multi-constituent reserve accounting;
- deterministic basket/share state using PDAs;
- executable quote lifecycle with stale-quote protection;
- confirmed transaction/activity indexing;
- custom basket initialization and durable discovery;
- truthful data fallbacks and real-only chart history;
- a Devnet mirror acquisition model that makes the prototype executable without misrepresenting canonical provider liquidity.

---

## Submission links checklist

- GitHub: https://github.com/ShalyX/synthabasket
- Live demo: https://synthabasket.vercel.app
- Pitch video: **ADD AFTER RECORDING**
- Technical video: **optional — ADD AFTER RECORDING**
- Verified receipts: https://github.com/ShalyX/synthabasket/blob/main/DEMO_RUN_RECEIPTS.md

## Deadline

Stocklana submissions close **Friday, September 25, 2026 at 4:00 PM ET (9:00 PM WAT)**.

Submit early. The platform allows edits until submissions close.
