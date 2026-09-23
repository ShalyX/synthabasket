# SynthaBasket — Technical Walkthrough

This walkthrough follows one basket from market data to on-chain issuance, portfolio tracking, and redemption.

## 1. Basket program

Open:

- `contracts/synthabasket_vault/programs/synthabasket_vault/src/lib.rs`

The Anchor program defines the basket state and three core instructions:

- `initialize_basket`
- `deposit_and_mint`
- `burn_and_redeem`

Basket state and the basket share mint are deterministic PDAs derived from the basket symbol. Constituent vault token accounts are associated with the basket PDA and configured constituent mints.

During issuance, the program validates the supplied token accounts, moves constituent assets into basket-controlled vault accounts, and mints basket shares. During redemption, it burns basket shares and releases the proportional constituent reserves.

## 2. Execution client

Open:

- `src/lib/execution/vault_client.ts`
- `src/lib/execution/allocation_router.ts`
- `src/lib/execution/confirmation.ts`

This layer builds executable quotes, resolves raw constituent amounts, prepares transactions, verifies live basket configuration, and waits for confirmation before the product records completion.

Quotes are time-bounded in the UI so a user refreshes the quote when basket state has moved.

## 3. Provider and valuation layer

Open:

- `src/lib/server/provider_quotes.ts`
- `src/lib/services/tessera.ts`
- `src/lib/services/prestocks.ts`
- `src/lib/server/nav_history_store.ts`

PreStocks and Tessera supply supported private-market asset data. The valuation layer converts constituent marks and target weights into basket NAV and market views.

Live observations are written to durable history so basket and market charts are based on recorded data points.

## 4. Portfolio and activity

Open:

- `src/lib/server/activity_store.ts`
- `src/app/app/portfolio/page.tsx`
- `src/components/AccountActivityCenter.tsx`

Confirmed basket actions are indexed into wallet activity. Portfolio reconciles indexed activity with the current on-chain share balance before showing history-derived metrics such as cost basis and P&L.

Redemptions persist the constituent assets returned to the wallet. Full redemptions move the basket into closed-position history.

## 5. Custom baskets

Open:

- `src/lib/server/basket_registration_auth.ts`
- `src/components/CreateBasketStudio.tsx`

Custom basket creation uses a wallet-signed registration flow. The selected assets and weights are used to initialize deterministic basket state and a share mint, then the basket is persisted into the registry and becomes available through the same invest/redeem lifecycle.

## 6. Devnet execution

The hosted app uses explicit Devnet mirror mints for supported constituents so the full basket lifecycle can execute on Devnet.

The execution path is:

```text
Devnet USDC
    │
    ▼
mirror constituent acquisition
    │
    ▼
user constituent token accounts
    │
    ▼
Anchor deposit_and_mint
    │
    ▼
basket vault reserves + user basket shares
    │
    ▼
Anchor burn_and_redeem
    │
    ▼
returned constituent assets
```

## 7. Verify on-chain execution

Open [DEMO_RUN_RECEIPTS.md](./DEMO_RUN_RECEIPTS.md).

It links to confirmed Devnet transactions for:

1. constituent acquisition;
2. Anchor `deposit_and_mint`;
3. Anchor `burn_and_redeem`.

The Devnet program ID is:

```text
4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA
```
