# SynthaBasket — Verified Devnet Execution Receipts

Generated only after the actual acquisition, Anchor deposit/mint, and Anchor burn/redeem transactions confirm on Solana Devnet. Simulations and unrelated transfer transactions are not counted as execution proof.

**Execution Timestamp**: `2026-09-22T16:17:58.857Z`  
**Runner Wallet**: [`Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR`](https://explorer.solana.com/address/Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR?cluster=devnet)  
**Target Basket**: **AI Titans Index ($AIT)**  
**Devnet Execution Basket**: **AITD**  
**Program**: `4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA`

---

## 1. Underlying Acquisition

- **Action**: Atomic Devnet USDC payment + mirror-asset issuance
- **Status**: **CONFIRMED**
- **Transaction**: [`ux7dGVzci5sGpKJpMUTeMWtJSkjD4fiQa9MGps35wF78544wNwe2m4WVAxiDSXVdP2EAFvbKU9ypfC1dZZQtRdS`](https://explorer.solana.com/tx/ux7dGVzci5sGpKJpMUTeMWtJSkjD4fiQa9MGps35wF78544wNwe2m4WVAxiDSXVdP2EAFvbKU9ypfC1dZZQtRdS?cluster=devnet)
- **Details**:

```json
{
  "depositUsdc": 10,
  "constituents": [
    {
      "symbol": "T-OpenAI",
      "devnetMint": "Bj47e5GCXuaxmbPjDRF5iSVjZ1Y4uEFoaDoPUAfD1xkB",
      "rawAmount": "6200"
    },
    {
      "symbol": "ANTHROPIC",
      "devnetMint": "GxtkS2jUU5br9JJB64FuvvUxwp2sadxwCCRsZwiqAR3p",
      "rawAmount": "2900"
    },
    {
      "symbol": "T-Kalshi",
      "devnetMint": "HSv2zqvfSXv2CQ7TW79HpQPYziNvoiY3CKpGu7Ec3hFh",
      "rawAmount": "4800"
    }
  ]
}
```

---

## 2. Vault Deposit & Basket Mint

- **Action**: Anchor `deposit_and_mint` with real SPL transfers
- **Status**: **CONFIRMED**
- **Transaction**: [`2VftJP3hy5AVjjxHtD4snSAPQUzqxtBdPEGNq35EfxCjgpAuv88PT2DR8nrPsSv6kBKxTVADfjdrvWyn5YTJhPtJ`](https://explorer.solana.com/tx/2VftJP3hy5AVjjxHtD4snSAPQUzqxtBdPEGNq35EfxCjgpAuv88PT2DR8nrPsSv6kBKxTVADfjdrvWyn5YTJhPtJ?cluster=devnet)
- **Details**:

```json
{
  "basket": "AIT",
  "devnetExecutionSymbol": "AITD",
  "expectedShares": 0.0125
}
```

---

## 3. Burn & Redeem

- **Action**: Anchor `burn_and_redeem` with proportional SPL release
- **Status**: **CONFIRMED**
- **Transaction**: [`4C8hAJ8Kmagm9V5jXSYEpwFfDdXaEvS6XMQV7Fk4PB6gM2UJHP7Cu5rBTomjhFCnzR5mHCiGtvxQGmSi9mod2zJ5`](https://explorer.solana.com/tx/4C8hAJ8Kmagm9V5jXSYEpwFfDdXaEvS6XMQV7Fk4PB6gM2UJHP7Cu5rBTomjhFCnzR5mHCiGtvxQGmSi9mod2zJ5?cluster=devnet)
- **Details**:

```json
{
  "sharesBurned": 0.00625,
  "constituents": [
    { "symbol": "T-OpenAI" },
    { "symbol": "ANTHROPIC" },
    { "symbol": "T-Kalshi" }
  ]
}
```

---

## Oracle note

This proof run did not claim Pyth oracle verification because `PYTH_API_KEY` was not configured in GitHub Actions. The custody proof above is independent of that optional oracle side-check.

## Proof standard

A transaction is marked **CONFIRMED** only when the transaction that performs the claimed operation is itself broadcast and confirmed. A setup transfer, self-transfer, route estimate, or simulation is never substituted for execution proof.
