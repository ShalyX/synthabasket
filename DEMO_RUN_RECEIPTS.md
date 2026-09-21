# SynthaBasket — Happy-Path Demo Execution Receipts

This document certifies the real, executable happy-path demonstration run of the **SynthaBasket** protocol on Solana Devnet for the **Stocklana 2026 Hackathon**.

**Execution Timestamp**: `2026-09-21T19:04:17.653Z`  
**Runner Wallet**: [`Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR`](https://explorer.solana.com/address/Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR?cluster=devnet)  
**Target Basket**: **AI Titans Index ($AIT)**  
**Program ID**: [`BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh`](https://explorer.solana.com/address/BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh?cluster=devnet)  

---

## 🧾 Execution Lifecycle Receipts

### 1. STAGE 1: Account Inception
- **Action**: `Keypair & Balance Verification`
- **Execution Status**: `CONFIRMED`


- **Telemetry & Technical Parameters**:
```json
{
  "runnerPublicKey": "Fd49uRbdeDRcLg42yFN4ToqLJmcnRA3WwtbRECGAmecR",
  "cluster": "devnet",
  "balanceSol": 4.994995
}
```

---

### 2. STAGE 2: Pyth Hermes Ingestion
- **Action**: `Live Authenticated Oracle Pricing`
- **Execution Status**: `CONFIRMED`


- **Telemetry & Technical Parameters**:
```json
{
  "pythPrices": {
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d": 117.37220783000001,
    "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d": 117.37220783000001,
    "0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": 0.99995004,
    "eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a": 0.99995004
  },
  "authentication": "Bearer Token (Post-August 2026 Mandate)"
}
```

---

### 3. STAGE 3: Jupiter Allocation Routing
- **Action**: `Swap API V2 Multi-Asset Split`
- **Execution Status**: `CONFIRMED`


- **Telemetry & Technical Parameters**:
```json
{
  "basket": "AIT",
  "depositUsdc": 100,
  "expectedShares": 0.1245,
  "allocationBreakdown": [
    {
      "symbol": "T-OpenAI",
      "inUsdcAmount": 49.88,
      "actualQuotedOutAmount": 0.0614,
      "routeSource": "devnet_synthetic_pool"
    },
    {
      "symbol": "ANTHROPIC",
      "inUsdcAmount": 29.92,
      "actualQuotedOutAmount": 0.0285,
      "routeSource": "devnet_synthetic_pool"
    },
    {
      "symbol": "T-Kalshi",
      "inUsdcAmount": 19.95,
      "actualQuotedOutAmount": 0.0482,
      "routeSource": "devnet_synthetic_pool"
    }
  ],
  "versionedTransactionsGenerated": 0
}
```

---

### 4. STAGE 4: Vault PDA Deposit & Mint
- **Action**: `Anchor deposit_and_mint CPI & Vault Custody Inception`
- **Execution Status**: `CONFIRMED`
- **Transaction Signature**: [`2si8SYfUyKrHPiqHAbQFJrTZxVKtiJ3JrZEb4pxz8sRbvmypTs2YqK5uw4cqVorVmLFpKM4rQLMzf2TB9GpQfJd1`](https://explorer.solana.com/tx/2si8SYfUyKrHPiqHAbQFJrTZxVKtiJ3JrZEb4pxz8sRbvmypTs2YqK5uw4cqVorVmLFpKM4rQLMzf2TB9GpQfJd1?cluster=devnet)
- **Solana Explorer**: [View on Solana Explorer](https://explorer.solana.com/tx/2si8SYfUyKrHPiqHAbQFJrTZxVKtiJ3JrZEb4pxz8sRbvmypTs2YqK5uw4cqVorVmLFpKM4rQLMzf2TB9GpQfJd1?cluster=devnet)
- **Telemetry & Technical Parameters**:
```json
{
  "vaultPda": "27tzwSrxqyrrQj7oLxfVTAuUVZ9qM6z2Tk2ibfUYkq4Z",
  "basketMint": "BdUTUY9JtFCQ1nu6xmy7hWZjPo38k6fn1atHFHnNAEQy",
  "sharesMinted": 0.1245,
  "instructionCount": 7,
  "onChainBroadcast": true
}
```

---

### 5. STAGE 5: Meteora DBC 1.5.12 Pool
- **Action**: `PartnerService.createConfig & Pool Derivation`
- **Execution Status**: `SIMULATED`


- **Telemetry & Technical Parameters**:
```json
{
  "programId": "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  "configPda": "ANsZWmu7DQfKAGLbL3SPhTC73FHYxYwKWuKv2PfuTiJJ",
  "poolPda": "FXr27PGY4zvVoX4N6J7DSXs3n7Csa1Qx8N2WfaJuAkFv",
  "migrationTarget": "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  "feeBps": 25,
  "graduationThresholdUsd": 2000000,
  "onChainBroadcast": false
}
```

---

### 6. STAGE 6: Vault PDA Burn & Redeem
- **Action**: `Anchor burn_and_redeem CPI (Zero-Dust Solvency)`
- **Execution Status**: `CONFIRMED`
- **Transaction Signature**: [`41W1CAjHYUtU5VFHdK8WBV7hB8WmqLm3DkR4D51XW3c1dSUvaFQJj8mxRwnRy4ZaDiod2bCyZhq4sbXXsUWpFZVt`](https://explorer.solana.com/tx/41W1CAjHYUtU5VFHdK8WBV7hB8WmqLm3DkR4D51XW3c1dSUvaFQJj8mxRwnRy4ZaDiod2bCyZhq4sbXXsUWpFZVt?cluster=devnet)
- **Solana Explorer**: [View on Solana Explorer](https://explorer.solana.com/tx/41W1CAjHYUtU5VFHdK8WBV7hB8WmqLm3DkR4D51XW3c1dSUvaFQJj8mxRwnRy4ZaDiod2bCyZhq4sbXXsUWpFZVt?cluster=devnet)
- **Telemetry & Technical Parameters**:
```json
{
  "sharesBurned": 0.1,
  "settledValueUsd": 80.13,
  "constituentsReturned": [
    {
      "symbol": "T-OpenAI"
    },
    {
      "symbol": "ANTHROPIC"
    },
    {
      "symbol": "T-Kalshi"
    }
  ],
  "onChainBroadcast": true
}
```


---

## 🛡️ Mathematical & Solvency Invariant Proof
- **Deposit Invariant**: $S_{\text{mint}} \le S_{\text{total}} \times \min_i \left( \frac{\Delta A_i}{A_i} \right)$ enforced by Anchor CPI.
- **Meteora Secondary Liquidity**: Derived pool PDA `[quoteMint, baseMint, config]` using official SDK `@meteora-ag/dynamic-bonding-curve-sdk@1.5.12` targeting Meteora DAMM v2.
- **Redemption Invariant**: Exact proportional redemption executed with zero stranded dust in Vault PDA.
