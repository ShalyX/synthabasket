# SynthaBasket — Pre-IPO Thematic Index Protocol on Solana

[![Solana](https://img.shields.io/badge/Solana-Devnet%20%2F%20Mainnet-14f195?style=flat-square&logo=solana)](https://solana.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Stocklana Hackathon](https://img.shields.io/badge/Hackathon-Stocklana%202026-9945ff?style=flat-square)](https://hackathons.solana.com/hackathons/stocklana)

**SynthaBasket** is an institutional-grade, asset-backed thematic index and structured basket protocol on Solana. It enables retail and institutional allocators to gain 1-click diversified exposure to tokenized private equities and pre-IPO assets (OpenAI, SpaceX, Kalshi, Anthropic, Anduril, Stripe) with real-time Pyth-anchored NAV calculations, PreStocks & Tessera API integration, and Meteora Dynamic Bonding Curve (DBC) secondary liquidity.

---

## 🏛️ System Architecture

```
                    SYNTHABASKET

        ┌────────── DATA / VALUATION ──────────┐
        │                                      │
   PreStocks API       Tessera API        Pyth Hermes
        │                   │                  │
        └──────────────┬────┴──────────────────┘
                       ↓
              Valuation / NAV Engine
                       ↓
               Basket Registry
                       │
          ┌────────────┴─────────────┐
          ↓                          ↓
    Basket Factory              Analytics & Basis Monitor
          │
          ↓
    Allocation Engine
          │
      Jupiter Router
          │
          ↓
   Underlying SPL Assets
          │
          ↓
     Basket Vault PDA
          │
          ↓
   Basket SPL Token Mint
          │
   ┌──────┴─────────────┐
   ↓                    ↓
Redeem Engine      Meteora DBC
                        │
                        ↓
                Secondary Liquidity
                        │
                        ↓
                    DAMM v2
```

---

## 🎯 Hackathon Sponsor Stacking Alignment

| Sponsor Track | Prize | How SynthaBasket Qualifies |
| :--- | :--- | :--- |
| **Solana Main Track** | **$100,000** | Best overall consumer & investing app for tokenized stocks on Solana (thematic baskets, 1-click USDC invest, physical vault backing, 24/7 basis monitor). |
| **PreStocks Bounty** | **$10,000** | Direct integration of PreStocks API (`https://prestocks.com/api/prestocks`). Includes dedicated `PreStocks Pure` mode ensuring 100% compliance with non-compete rules. |
| **Tessera Bounty** | **$6,000** | Primary constituent integration of Tessera OpenAI (`tOPENAI`) and Kalshi (`tKALSHI`) T-Tokens into the flagship `$AIT` (AI Titans) basket. |
| **Meteora Bounty** | **$5,000** | Custom implementation of Meteora Dynamic Bonding Curves (DBC) for tokenized stock baskets with equity-smoothed polynomial curves and DAMM v2 migration. |
| **Pyth Network** | **3 Mos Pro** | Ingests Pyth Hermes feeds for real-time benchmark pricing, continuous NAV computation, and 24/7 off-market basis monitoring. |

---

## ✨ Key Features

1. **Curated Thematic Baskets**:
   - **AI Titans (`$AIT`)**: 50% OpenAI (Tessera) + 30% Anthropic (PreStocks) + 20% Kalshi (Tessera).
   - **Space & Defense (`$ORBIT`)**: 65% SpaceX (Tessera) + 35% Anduril (PreStocks).
   - **FinTech Disruptors (`$FINX`)**: 50% Stripe (PreStocks) + 30% Kraken (PreStocks) + 20% Kalshi (Tessera).
   - **PreStocks Sovereign Frontier (`$PREX`)**: 40% Anthropic + 30% Anduril + 30% Stripe (Pure PreStocks track).
2. **1-Click USDC Allocation & Minting**:
   - Converts deposited USDC into constituent allocations via Jupiter Swap API V2 routing.
   - Deposits underlying tokens directly into on-chain `BasketState` Vault PDA.
   - Mints synthetic Basket SPL tokens to the user's wallet with 100% physical backing.
3. **Burn & Physical Redemption**:
   - Burn Basket SPL tokens anytime to release proportional underlying assets from the Vault PDA.
4. **Create Basket Studio**:
   - 8-step creation wizard allowing users and fund managers to assemble custom baskets, validate weights ($\sum w_i = 100\%$), preview NAV, and launch a Meteora DBC pool using `@meteora-ag/dynamic-bonding-curve-sdk@1.5.12`.
5. **24/7 Basis & Premium Monitor**:
   - Real-time comparison between US market closing prices (Pyth benchmark) and 24/7 Solana DEX spot markets to capture basis arbitrage.
6. **Bespoke Institutional Design**:
   - Built to institutional fintech standards: JetBrains Mono tabular figures, obsidian neutral palette, zero generic templates or emojis.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install --legacy-peer-deps
```

### 2. Run Comprehensive Verification Suites
```bash
# 1. End-to-end pipeline & Anchor discriminator verification
npx tsx scripts/test-e2e-pipeline.ts

# 2. Strict live API, schema & Pyth diagnostic gate
npx tsx scripts/verify-apis.ts

# 3. On-chain vault share accounting & dilution resistance
npx tsx scripts/verify-vault-math.ts
```

### 3. Production Build
```bash
npm run build
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🔒 Smart Contract Details

- **Program ID**: `BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh`
- **Seeds**:
  - Basket PDA: `[b"basket", symbol.as_bytes()]`
  - Basket Mint PDA: `[b"basket_mint", symbol.as_bytes()]`
  - Associated Vault Accounts: `getAssociatedTokenAddressSync(constituentMint, basketPda, true)`
- **Key Instructions**:
  - `initialize_basket(symbol, name, constituents, weights_bps, protocol_fee_bps)`
  - `deposit_and_mint(shares_to_mint, constituent_amounts_in)`
  - `burn_and_redeem(shares_to_burn)`
- **Meteora DBC Integration**:
  - Program ID: `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`
  - SDK Version: `@meteora-ag/dynamic-bonding-curve-sdk@1.5.12`
  - Migration Target: Meteora DAMM v2 (`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`)
