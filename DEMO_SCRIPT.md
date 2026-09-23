# SynthaBasket Demo Script

The Stocklana pitch video can be up to **3 minutes**. Keep the video product-first: prove that the experience works, then show just enough on-chain evidence to make the technical claim credible.

## Recording setup

- Use the production URL: https://synthabasket.vercel.app
- Use a fresh browser profile or incognito window.
- Use a funded Devnet wallet with Devnet SOL + USDC.
- Keep Solana Explorer open in a second tab.
- Start on the **Baskets** screen, not the landing page.
- Use light or dark mode consistently; do not switch themes during the recording.
- Disable unrelated browser extensions/notifications.
- If provider data is temporarily degraded, wait for a clean live hydration before recording.
- Prefer a small investment such as **1 USDC** so the transaction is fast and easy to read.

---

# 3-minute pitch video

## 0:00–0:15 — Problem + product

**Say:**

> Tokenized private-company assets are arriving on Solana, but the investing experience is still fragmented asset by asset and provider by provider. SynthaBasket turns that into one index-style product: choose a theme, invest USDC, receive one on-chain basket share, and redeem it back into the underlying assets.

**Show:**
- Baskets marketplace.
- Quickly point to AI Titans, Space & Defense, FinTech, and the PreStocks-focused basket.

Do not spend time on the landing page.

---

## 0:15–0:40 — Inspect a real basket

Open **AI Titans** or **Space & Defense**.

**Say:**

> Each basket shows its target composition, provider marks, real observation history, freshness, and the current on-chain vault/share-mint verification state. We distinguish live data, fallback data, and unpriced states instead of pretending everything is live.

**Show:**
- NAV / composition.
- Live/fallback source labels.
- On-chain verification block.
- Briefly open the Invest tab.

---

## 0:40–1:15 — Invest

Connect the fresh wallet and enter **1 USDC**.

**Say:**

> Before signing, SynthaBasket builds an executable quote from the current basket state. Quotes expire rather than silently going stale. On Devnet, we use explicit test mirror assets so we can execute the full flow without pretending canonical provider tokens have Devnet liquidity.

Approve the wallet transaction(s).

**Show:**
- Quote.
- Wallet approval.
- Transaction lifecycle.
- Final receipt.

**Say:**

> Success is shown only after the actual acquisition and Anchor basket mint transaction confirm.

---

## 1:15–1:40 — Portfolio + Activity

Open **Portfolio**, then Account Activity.

**Say:**

> The position appears immediately with its on-chain share balance and current marked value. Confirmed actions are persisted into wallet activity. Cost basis and P&L are only shown when indexed history reconciles with the actual on-chain balance.

**Show:**
- New position.
- Details.
- Activity entry.
- Explorer link.

---

## 1:40–2:10 — Redeem

Redeem part of the position first.

**Say:**

> Redemption burns basket shares and releases the proportional underlying constituents directly to the wallet.

Show the receipt and **Redeemed assets**.

Then redeem the remaining shares.

**Say:**

> A full redemption closes the basket position, but SynthaBasket keeps the returned assets and closed-position history visible instead of making the position simply disappear.

**Show:**
- Partial redemption receipt.
- Redeemed assets.
- Full redemption.
- Closed positions.

---

## 2:10–2:35 — Create a custom basket

Open **Create Basket**.

**Say:**

> Users can also build their own basket from supported provider assets. The wallet signs the registration, the app initializes deterministic basket state and a share mint, and the new basket re-enters the same invest-and-redeem lifecycle.

**Show:**
- Pick 2–3 assets.
- Adjust weights.
- Scroll through the review/deployment steps.

Do not wait for a full custom deployment in the pitch video unless it is already prepared and fast.

---

## 2:35–2:50 — Markets

Open **Markets**.

**Say:**

> SynthaBasket also gives users provider-specific market context: durable real-observation charts, cross-provider valuation comparisons, and liquidity signals only when a real route can be verified.

**Show:**
- Market chart.
- Provider board.
- A comparison/liquidity row if available.

---

## 2:50–3:00 — Close

**Say:**

> SynthaBasket is a Solana-native diversification primitive for tokenized private markets: SPL basket shares, transparent program-controlled reserves, and proportional redemption — wrapped in a product normal users can actually operate.

End on Portfolio or the basket marketplace.

---

# Optional 5-minute technical walkthrough

This is useful as a second submission link if there is time. It should not repeat the pitch video.

## 0:00–0:40 — Architecture

Show the README architecture diagram.

Explain:
- provider data is separate from reserve accounting;
- Devnet mirror assets are test execution infrastructure;
- canonical provider mints remain identity/valuation metadata.

## 0:40–1:30 — Program model

Open:

`contracts/synthabasket_vault/programs/synthabasket_vault/src/lib.rs`

Cover:
- `initialize_basket`;
- `deposit_and_mint`;
- `burn_and_redeem`;
- deterministic PDA/share mint;
- constituent account validation;
- least-proportional-deposit mint cap.

## 1:30–2:15 — Execution client

Open:

`src/lib/execution/vault_client.ts`  
`src/lib/execution/allocation_router.ts`  
`src/lib/execution/confirmation.ts`

Explain:
- quote/build path;
- exact raw constituent amounts;
- confirmation polling;
- quote expiry / failure handling;
- no simulated transaction is treated as success.

## 2:15–3:00 — Server data layer

Open:

`src/lib/server/provider_quotes.ts`  
`src/lib/services/tessera.ts`  
`src/lib/services/prestocks.ts`  
`src/lib/server/nav_history_store.ts`  
`src/lib/server/activity_store.ts`

Explain:
- live provider hydration;
- last-live/snapshot fallbacks;
- only live observations enter durable charts;
- wallet activity and history persistence.

## 3:00–3:40 — Custom basket security

Open:

`src/lib/server/basket_registration_auth.ts`  
`src/components/CreateBasketStudio.tsx`

Explain:
- wallet-signed challenge;
- replay/expiry controls;
- deterministic initialization;
- durable custom basket registration.

## 3:40–4:20 — Proof

Open `DEMO_RUN_RECEIPTS.md`.

Show the three confirmed operations:
1. Devnet USDC-backed mirror acquisition;
2. real Anchor deposit/mint;
3. real Anchor burn/redeem.

Open one transaction in Explorer.

## 4:20–5:00 — Product integrity

Explain the design rule:

> SynthaBasket fails closed. If a provider mark, Pyth reference, liquidity route, price history, or transaction cannot be verified, the UI labels it unavailable/stale/partial instead of fabricating proof.

Close with why this makes the prototype extensible to production provider/liquidity infrastructure later.
