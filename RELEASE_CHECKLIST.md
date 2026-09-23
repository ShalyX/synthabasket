# Stocklana Release Checklist

This is the final release/submission checklist for SynthaBasket. Do not add new product scope unless testing finds a release-blocking bug.

## Release candidate status

- [x] Full external-user lifecycle implemented.
- [x] Fresh wallet + fresh browser test completed manually:
  - connect wallet;
  - discover / inspect basket;
  - invest Devnet USDC;
  - receive basket shares;
  - Portfolio + Activity update;
  - partial redeem;
  - returned assets visible;
  - full redeem;
  - closed position visible.
- [x] Custom basket creation/deployment flow implemented.
- [x] Durable market/NAV history and wallet activity implemented.
- [x] Quote expiry, recovery states, data freshness, light mode, dark mode, and mobile layouts implemented.
- [x] Confirmed Devnet acquisition + Anchor mint + Anchor redemption receipts exist.
- [x] Latest release-candidate build passed GitHub Build Check.
- [x] Latest Vercel preview build reached READY.
- [x] Release branch reconciled with the execution-proof commits that had landed on `main`.
- [ ] Merge PR #2 to `main`.
- [ ] Verify the production deployment is built from the merge commit.
- [ ] Verify https://synthabasket.vercel.app serves the release build.
- [ ] Run one final production-URL smoke test after the merge.

---

## Submission positioning

### Main track

Lead with the consumer problem and working product:

> Tokenized private-market assets are fragmented. SynthaBasket makes them investable like an index while preserving transparent Solana custody and proportional redemption.

The Stocklana main-track rubric asks whether this could be a real app people would actually use. Keep the demo focused on the end-to-end user journey, not infrastructure trivia.

### Sponsor track

**Select Tessera — Best Use of Tessera, Pre-IPO stocks.**

The product uses Tessera T-Tokens in curated baskets and the official Tessera Product API for market data.

Do **not** select these tracks for the current release:

- **PreStocks:** the bounty says projects integrating non-PreStocks pre-IPO tokens are ineligible, and SynthaBasket also uses Tessera.
- **Meteora:** no Meteora DBC integration exists in the release candidate.
- **Clawpump:** no stock-paired Clawpump + Meteora launch exists.
- **Pyth:** Pyth is an optional indicative reference surface, not central to NAV or execution.

Do not add a sponsor track simply because the form allows multiple selections.

---

## Demo assets

- [x] 3-minute pitch script written: `DEMO_SCRIPT.md`.
- [x] Optional 5-minute technical walkthrough script written.
- [ ] Record the 3-minute pitch video.
- [ ] Confirm the video is **3:00 or shorter**.
- [ ] Upload to a judge-accessible URL.
- [ ] Add the pitch-video URL to `STOCKLANA_SUBMISSION.md`.
- [ ] Optional: record/upload the 5-minute technical walkthrough.
- [ ] Test video links from a logged-out/private browser.

### Recording rules

- Use a fresh-looking browser profile.
- Use the production URL, not a protected Vercel preview.
- Start in the app, not on the landing page.
- Keep a funded Devnet wallet ready.
- Use a small investment such as 1 USDC.
- Have Solana Explorer ready in a second tab.
- Do not demo a degraded provider state if a clean live hydration can be recorded.
- Do not claim Pyth values if the app shows none.
- Do not claim Meteora/Clawpump integrations.
- Do not describe Devnet mirrors as canonical provider assets.

---

## README / repository

- [x] README front-loads the product problem, working flow, and live app.
- [x] README explains Devnet mirror execution honestly.
- [x] README links submission sheet, demo script, and verified receipts.
- [x] README contains current integrations only.
- [x] README documents the current Anchor program ID.
- [x] Submission copy is in `STOCKLANA_SUBMISSION.md`.
- [x] Verified receipts are in `DEMO_RUN_RECEIPTS.md`.
- [ ] After merging, confirm README links use `main` where appropriate.
- [ ] Confirm repository is public and readable while logged out.
- [ ] Confirm no `.env.local`, private key, API token, or wallet secret is committed.
- [ ] Confirm `.env.example` contains placeholders only.

---

## CI / deployment

- [ ] PR #2 shows mergeable/clean.
- [ ] GitHub Build Check passes on the release reconciliation commit.
- [ ] Vercel preview passes on the release reconciliation commit.
- [ ] Merge PR #2.
- [ ] GitHub Build Check passes on `main`.
- [ ] Production Vercel deployment reaches READY.
- [ ] Production home page returns HTTP 200.
- [ ] Production `/app` loads baskets.
- [ ] Production `/app?view=markets` loads.
- [ ] Production `/app?view=create` loads.
- [ ] Production `/app/portfolio` loads.
- [ ] Connect-wallet modal works in light and dark mode.
- [ ] Basket modal opens and closes correctly.
- [ ] One final invest/redeem smoke test succeeds from production.

---

## Proof integrity

Before submission, re-check that public copy never implies more than the app proves.

- [ ] Confirm `DEMO_RUN_RECEIPTS.md` transaction links still resolve on Devnet Explorer.
- [ ] Confirm the program ID shown in README/app is:
  `4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA`.
- [ ] Confirm no setup/self-transfer is described as a protocol deposit/redeem.
- [ ] Confirm the hosted app still labels snapshot/last-live/fallback data correctly.
- [ ] Confirm charts do not fabricate backfill.
- [ ] Confirm P&L is withheld when history is partial.
- [ ] Confirm full redemption returns constituents rather than claiming USDC redemption.

---

## Submission form

Stocklana submissions close **Friday, September 25, 2026 at 4:00 PM ET / 9:00 PM WAT**.

- [ ] Open the Stocklana submission form while logged in.
- [ ] Project name: **SynthaBasket**.
- [ ] Add GitHub link.
- [ ] Add production live-demo link.
- [ ] Add 3-minute pitch-video link.
- [ ] Select **Tessera** sponsor track.
- [ ] Invite teammates if applicable.
- [ ] Paste/review the copy from `STOCKLANA_SUBMISSION.md`.
- [ ] Submit before the deadline.
- [ ] Re-open the submitted project and verify every link.
- [ ] Take a screenshot of the successful submission page.
- [ ] Use the edit window only for fixes; do not restart feature work.

---

## Post-merge release marker

After the production deployment and final smoke test pass:

- [ ] Create a Git tag/release such as `stocklana-2026`.
- [ ] Release title: **SynthaBasket — Stocklana 2026 Release Candidate**.
- [ ] Include:
  - live demo;
  - program ID;
  - verified receipts;
  - key user flows;
  - Devnet-only scope;
  - Tessera track;
  - known limitation that Devnet mirror assets are test infrastructure.

At that point the repository, live app, proof, and submission should all describe the same product.
