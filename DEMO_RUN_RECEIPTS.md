# SynthaBasket — Verified Devnet Execution Receipts

These receipts link to confirmed Solana Devnet transactions for constituent acquisition, Anchor basket issuance, basket-share balance verification, and Anchor redemption.

**Execution Timestamp**: `2026-09-22T16:22:41.786Z`  
**Runner Wallet**: [`Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR`](https://explorer.solana.com/address/Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR?cluster=devnet)  
**Target Basket**: **AI Titans Index ($AIT)**  
**Devnet Execution Basket**: **AITD**  
**Devnet Basket Mint**: `3CLenKY9X1hniMKsTi2KPANfWi4C27qyus6HDknrZzUK`  
**Program**: `4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA`

---

## 1. Underlying Acquisition

- **Action**: Atomic Devnet USDC payment + mirror-asset issuance
- **Status**: **CONFIRMED**
- **Transaction**: [`64MVX5hGZZTcLdJ5w3vM8NdDHygD2E51sFtFJEf6gYc99yfMMnfwTMJt49gqmpXMecUkFRcQn1qX5Gav4auW77Yg`](https://explorer.solana.com/tx/64MVX5hGZZTcLdJ5w3vM8NdDHygD2E51sFtFJEf6gYc99yfMMnfwTMJt49gqmpXMecUkFRcQn1qX5Gav4auW77Yg?cluster=devnet)

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

- **Action**: Anchor `deposit_and_mint` with SPL constituent transfers
- **Status**: **CONFIRMED**
- **Transaction**: [`eq7G23KVcEK2fSEPxmzpRggjpVSeY5kenT5xgqVc2DBYXjqXeqjbYoevYdLmc88wXw8ChcRvwToSaxfqrSCrzN8`](https://explorer.solana.com/tx/eq7G23KVcEK2fSEPxmzpRggjpVSeY5kenT5xgqVc2DBYXjqXeqjbYoevYdLmc88wXw8ChcRvwToSaxfqrSCrzN8?cluster=devnet)

```json
{
  "basket": "AIT",
  "devnetExecutionSymbol": "AITD",
  "expectedShares": 0.0125,
  "basketMint": "3CLenKY9X1hniMKsTi2KPANfWi4C27qyus6HDknrZzUK",
  "userBasketTokenAccount": "HXVoNVp9gk4NjGTHFifVH4YVKdgUGquSrgv4kBus8e4J",
  "sharesBeforeMintRaw": "6250",
  "sharesAfterMintRaw": "18750",
  "mintedDeltaRaw": "12500"
}
```

The transaction increased the runner's AITD token balance by **12,500 raw units = 0.0125 AITD**.

---

## 3. Burn & Redeem

- **Action**: Anchor `burn_and_redeem` with proportional SPL release
- **Status**: **CONFIRMED**
- **Transaction**: [`5bSV4hjn9WdZsqnB12Eb5Srf8KGDcd4XpaFx5R74H7PCJWWztR3QCp1X7pSrEeLQXHEfN6izbmEwREcUqiFe7fBe`](https://explorer.solana.com/tx/5bSV4hjn9WdZsqnB12Eb5Srf8KGDcd4XpaFx5R74H7PCJWWztR3QCp1X7pSrEeLQXHEfN6izbmEwREcUqiFe7fBe?cluster=devnet)

```json
{
  "sharesBurned": 0.00625,
  "sharesBeforeRedeemRaw": "18750",
  "sharesAfterRedeemRaw": "12500",
  "burnedDeltaRaw": "6250",
  "constituents": [
    { "symbol": "T-OpenAI" },
    { "symbol": "ANTHROPIC" },
    { "symbol": "T-Kalshi" }
  ]
}
```

The transaction reduced the runner's AITD token balance by **6,250 raw units = 0.00625 AITD**.

---

## Receipt scope

The receipt set covers custody and basket execution on Solana Devnet. Optional Pyth reference data is separate from this execution proof.
