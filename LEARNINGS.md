# Learnings & Technical Insights — SynthaBasket

## 2026-09-21: Solana Wallet Adapter Dependency Bloat & Windows Install Failure

### Context / Problem
Running `npm install` with `@solana/wallet-adapter-wallets` failed on Windows with exit code 1.
Symptoms / Error:
```
npm error path C:\...\node_modules\@stellar\stellar-sdk
npm error command failed
npm error command C:\Windows\system32\cmd.exe /d /s /c yarn setup || true
npm error 'yarn' is not recognized as an internal or external command,
npm error operable program or batch file.
```

### Root Cause
`@solana/wallet-adapter-wallets` is an aggregation package that includes dozens of legacy multi-chain wallet adapters (e.g. Torus, Ledger, Blocto, and Stellar). One of its transitive dependencies (`@stellar/stellar-sdk`) has an unportable postinstall script (`yarn setup || true`), which fails in Windows command prompt when `yarn` is not globally installed and `|| true` is not valid cmd.exe syntax.

### Solution / Better Way
1. **Remove `@solana/wallet-adapter-wallets`**: Modern Solana web applications should never depend on this legacy catch-all package.
2. **Adopt Solana Wallet Standard**: Modern Solana wallets (Phantom, Solflare, Backpack, OKX, etc.) natively register themselves via the Solana Wallet Standard (`window.navigator.wallets` / `@wallet-standard/features`).
3. In `@solana/wallet-adapter-react`, passing `wallets={[]}` automatically discovers and activates all installed standard wallets cleanly without pulling in hundreds of megabytes of multi-chain dependencies.

### Key Takeaway / Prevention
In any Solana project on Windows (or modern Web3 frontend in general), only include:
- `@solana/wallet-adapter-base`
- `@solana/wallet-adapter-react`
- `@solana/wallet-adapter-react-ui`

Never install `@solana/wallet-adapter-wallets` unless specifically targeting a legacy non-standard wallet.

## 2026-09-21: Base58 Validation in Solana Public Keys & Program IDs

### Context / Problem
Attempting to instantiate `new PublicKey("BKmpdn4ow17ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gB1")` or similar placeholder IDs threw `Error: Non-base58 character` at runtime.

### Root Cause
Solana uses Bitcoin's Base58 alphabet (`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`), which intentionally excludes visually ambiguous characters: `0` (zero), `O` (capital o), `I` (capital i), and `l` (lowercase L). Handcrafted or placeholder strings that inadvertently include lowercase `l` or capital `O` fail Base58 decoding.

### Solution / Better Way
Always generate authentic keypairs via `Keypair.generate()` or use known valid Base58 public keys (e.g., `BKmpdn4owi7ktwt1Brn5v9fZkRv15wBSdJXGUYAU5gBh`), and assert Base58 validity via `PublicKey.isOnCurve()` or `try { new PublicKey(str) }` in test suites.

### Key Takeaway / Prevention
Never hardcode mock public keys by manual typing. Use programmatic key generation or validated Base58 constants across all IDLs, program configurations, and client code.

## 2026-09-21: Anchor IDL v0.30+ Type Syntax (`pubkey` vs `publicKey`)

### Context / Problem
Initializing Anchor's `BorshInstructionCoder` on a program IDL threw:
```
TypeError: Cannot use 'in' operator to search for 'option' in publicKey
```

### Root Cause
In Anchor IDL specifications (v0.30+), the primitive type identifier for public keys in instruction arguments and account fields is `"pubkey"`, not `"publicKey"`. When Anchor's coder parses types, it inspects objects for complex types (`option`, `vec`, `defined`) and expects simple string primitives like `"pubkey"`, `"u64"`, etc. Passing `"publicKey"` confuses the type parser.

### Solution / Better Way
Ensure all account fields and instruction args in Anchor IDLs use `"type": "pubkey"`.

### Key Takeaway / Prevention
Validate IDLs against the official Anchor IDL schema. Use Anchor's `BorshInstructionCoder` directly in client tests to immediately catch type mismatches before runtime execution.

## 2026-09-21: Pyth Hermes Mandatory Authentication (Post-August 2026) & Server Proxying

### Context / Problem
Direct browser calls to Pyth Hermes price service returned `401 Unauthorized` or failed CORS preflights when client-side requests lacked credentials.

### Root Cause
Pyth Network transitioned Hermes to an authenticated access model starting August 26, 2026. Price feed queries require an API key passed via the `Authorization: Bearer <key>` header. Exposing `NEXT_PUBLIC_PYTH_API_KEY` in frontend bundles risks credential exfiltration and rate-limit exhaustion.

### Solution / Better Way
1. Store `PYTH_API_KEY` exclusively in server-side environment variables (`.env.local`).
2. Route all price service requests through a Next.js App Router API route (`/api/pyth`), which attaches the Bearer token securely and applies bounded retries (with exponential backoff) and graceful caching.

### Key Takeaway / Prevention
Never query authenticated third-party price oracles directly from client-side Web3 components. Always funnel through trusted server proxy routes.

## 2026-09-21: Jupiter Swap API V2 Migration & Versioned Transactions

### Context / Problem
Routing through legacy `quote-api.jup.ag/v6` caused deprecation warnings and missing features (dynamic slippage, direct instruction assembly).

### Root Cause
Jupiter's legacy v6 API is deprecated in favor of Swap API V2 (`https://api.jup.ag/swap/v2`), which introduces `instructionVersion=V2` and streamlined transaction building (`/swap/v2/build`).

### Solution / Better Way
1. Fetch quotes from `https://api.jup.ag/swap/v2/quote?instructionVersion=V2&...`.
2. Build transaction payloads via `https://api.jup.ag/swap/v2/build`.
3. Deserialize base64 payloads into `VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'))`.
4. Proxy requests through `/api/jupiter` with `JUPITER_API_KEY`.

### Key Takeaway / Prevention
Use Jupiter API V2 endpoints and always pipe real quote outputs (`outAmount`) directly into downstream vault deposit allocations.

## 2026-09-21: Institutional Ledger Design System & Next.js SWC Angle Bracket Escaping

### Context / Problem
During Next.js 15 production build (`next build`), SWC compiler threw a hard syntax error:
```
./src/components/BasisMonitor.tsx
Error: x Unexpected token. Did you mean `{'>'}` or `&gt;`?
```

### Root Cause
In JSX text nodes, bare `<` and `>` characters are parsed as tag opening and closing delimiters rather than literal text. When writing financial basis expressions like `(> +10 bps)` or `(< -10 bps)`, SWC treats them as malformed JSX tags.

### Solution / Better Way
1. Always escape comparison operators in JSX text using HTML entities (`&gt;`, `&lt;`, `&amp;`) or string expressions (`{'>'}`, `{'<'}`).
2. For mathematical formulas, use proper Unicode symbols (e.g. `≤` (`\u2264`), `≥` (`\u2265`), `×` (`\u00d7`)) or KaTeX formatting.

### Design System Insights & Takeaway
To strictly eliminate generic Web3 AI slop (neon purple/cyan glow blobs, gratuitous background blurs, floating glassmorphism cards, and emoji icons):
- **Bespoke Institutional Palette**: Anchor on deep slate-charcoal (`#0c0d12`), structural surface (`#13151d`), hairline borders (`#222636`), institutional emerald (`#00d182`), and international orange (`#ff5a36`) for basis divergence.
- **Tabular Monospace Typography**: Enforce `tabular-nums` with `font-mono` (`JetBrains Mono` / `Geist Mono`) on all financial numbers, NAVs, basis spreads, and PDA addresses to guarantee exact vertical optical alignment.
- **Zero Emojis**: Use strictly professional, dedicated vector SVG icon systems (`lucide-react`) across all navigation, buttons, and status pills.

## 2026-09-21: Solana Wallet Adapter Button Wrapping & Wizard State Machines

### Context / Problem
1. **Wallet Button Wrapping**: In the header, `@solana/wallet-adapter-react-ui` rendered "Select / Wallet" wrapped onto two lines above and below an empty dark rectangle.
2. **Wizard Progression Illogic**: In `CreateBasketStudio`, steps 3, 5, 6, and 8 displayed green checkmarks while steps 1 and 2 were incomplete.
3. **Telemetry Contradiction**: `BasisMonitor` displayed `Monitored Feeds: 0` alongside `Arbitrage Efficiency: 99.82%` and claimed all assets were in parity.

### Root Causes
1. The Solana wallet adapter button lacked explicit `white-space: nowrap !important;` and `display: inline-flex !important; flex-wrap: nowrap !important;` in `.wallet-adapter-button`, `.wallet-adapter-button-trigger`, and `.wallet-btn-container`.
2. Each step in `CreateBasketStudio` had an independent boolean check, marking static properties as completed before preceding user inputs were provided.
3. Unconditional fallback calculations in `BasisMonitor` computed efficiency percentages even when the underlying filtered feeds array was empty.

### Solutions & Better Ways
1. **Pill-Styled Single-Line Wallet Button**: Enforce:
   ```css
   .wallet-btn-container { display: inline-flex !important; white-space: nowrap !important; flex-shrink: 0 !important; }
   .wallet-adapter-button { display: inline-flex !important; align-items: center !important; justify-content: center !important; white-space: nowrap !important; flex-wrap: nowrap !important; height: 36px !important; border-radius: 9999px !important; }
   ```
2. **Strict Linear State Machine**: Use a single `currentStep` pointer:
   - `step.id < currentStep`: `completed ✓`
   - `step.id === currentStep`: `current highlighted`
   - `step.id > currentStep`: `future muted`
3. **State-Aware Financial Metrics**: If `feeds.length === 0`, display `—` for calculated metrics and show `Waiting for comparable benchmark feeds`. Only display calculated stats and parity claims when `feeds.length > 0`.
