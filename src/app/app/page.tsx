'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Navbar } from '../../components/Navbar';
import { BasketDetailView } from '../../components/BasketDetailView';
import { CreateBasketStudio } from '../../components/CreateBasketStudio';
import { TransactionLifecycleModal } from '../../components/TransactionLifecycleModal';

const BasisMonitor = dynamic(
  () =>
    import('../../components/BasisMonitor').then((module) => module.BasisMonitor),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-ink-secondary">
        Loading market analytics…
      </div>
    ),
  }
);

import {
  AssetQuote,
  BasketDefinition,
  BasketCreationDraft,
  BasketMintQuote,
  BasketRedeemQuote,
  BasisMonitorItem,
  TxLifecycleState,
} from '../../lib/types';
import { generateBasisMonitoringLedger } from '../../lib/services/valuation_engine';
import {
  NavHistoryByBasket,
  readNavHistory,
  recordBasketNavHistory,
} from '../../lib/client/nav_history';
import { AllocationRouter } from '../../lib/execution/allocation_router';
import { SynthaBasketVaultClient } from '../../lib/execution/vault_client';
import { waitForSignatureOutcome } from '../../lib/execution/confirmation';

import { PublicKey } from '@solana/web3.js';
import {
  Search,
  Layers,
} from 'lucide-react';

export default function AppPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab: 'baskets' | 'basis_monitor' | 'create_studio' =
    searchParams.get('view') === 'markets'
      ? 'basis_monitor'
      : searchParams.get('view') === 'create'
      ? 'create_studio'
      : 'baskets';
  const [network] = useState<string>('devnet');

  const [baskets, setBaskets] = useState<BasketDefinition[]>([]);
  const [availableAssets, setAvailableAssets] = useState<AssetQuote[]>([]);
  const [basisItems, setBasisItems] = useState<BasisMonitorItem[]>([]);
  const [hydrationNonce, setHydrationNonce] = useState(0);
  const [marketplaceStatus, setMarketplaceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [customRegistryConfigured, setCustomRegistryConfigured] = useState(false);
  const [lastHydratedAt, setLastHydratedAt] = useState<number | null>(null);
  const [freshnessNow, setFreshnessNow] = useState<number>(() => Date.now());
  const [navHistory, setNavHistory] = useState<NavHistoryByBasket>({});
  const hasHydratedMarketplaceRef = useRef(false);
  const lastMarketplaceRefreshRef = useRef(0);

  // Category filter for the basket cards
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected Basket Modal
  const [selectedBasket, setSelectedBasket] = useState<BasketDefinition | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'mint' | 'redeem' | 'inspect'>('mint');

  // Transaction Lifecycle Modal State
  const [txLifecycle, setTxLifecycle] = useState<TxLifecycleState>({
    isOpen: false,
    title: '',
    steps: [],
    currentStepIndex: 0,
    isCompleted: false,
    hasError: false,
    actionType: 'mint',
  });

  useEffect(() => {
    setNavHistory(readNavHistory());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setFreshnessNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Hydrate mutable basket data from one server endpoint. Provider prices,
  // live vault reserves, basket supply, and execution addresses are resolved
  // before the marketplace renders. Once loaded, refresh silently every 30s
  // while the tab is visible and immediately when the window regains focus.
  useEffect(() => {
    let cancelled = false;
    let requestInFlight = false;

    async function hydrateMarketplace() {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        const marketOnly = activeTab === 'basis_monitor';
        const response = await fetch(
          marketOnly ? '/api/market-data' : '/api/baskets',
          { cache: 'no-store' }
        );
        if (!response.ok) {
          throw new Error(
            `${marketOnly ? 'Market data' : 'Basket hydration'} request failed with HTTP ${response.status}.`
          );
        }

        const payload = await response.json();
        const quotes: AssetQuote[] = Array.isArray(payload.assets)
          ? payload.assets
          : [];
        const hydrated: BasketDefinition[] = Array.isArray(payload.baskets)
          ? payload.baskets
          : [];

        if (quotes.length === 0 || (!marketOnly && hydrated.length === 0)) {
          throw new Error(
            marketOnly
              ? 'Market data response was incomplete.'
              : 'Hydrated basket response was incomplete.'
          );
        }

        if (cancelled) return;
        setAvailableAssets(quotes);
        setBasisItems(generateBasisMonitoringLedger(quotes));

        if (!marketOnly) {
          setBaskets(hydrated);
          setCustomRegistryConfigured(payload.customRegistryConfigured === true);
          setNavHistory(recordBasketNavHistory(hydrated));
        }

        setLastHydratedAt(Number(payload.generatedAt) || Date.now());
        hasHydratedMarketplaceRef.current = true;
        setMarketplaceStatus('ready');
      } catch (error) {
        console.error('[Marketplace hydration]', error);
        if (!cancelled && !hasHydratedMarketplaceRef.current) {
          setMarketplaceStatus('error');
        }
      } finally {
        requestInFlight = false;
      }
    }

    const refreshIfActive = () => {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (now - lastMarketplaceRefreshRef.current < 5_000) return;
      lastMarketplaceRefreshRef.current = now;
      void hydrateMarketplace();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfActive();
    };

    lastMarketplaceRefreshRef.current = Date.now();
    void hydrateMarketplace();

    const intervalId = window.setInterval(refreshIfActive, 30_000);
    window.addEventListener('focus', refreshIfActive);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfActive);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab, hydrationNonce]);

  const handleSelectBasket = (basket: BasketDefinition, mode: 'mint' | 'redeem' | 'inspect') => {
    setSelectedBasket(basket);
    setDetailInitialTab(mode);
  };

  const getSegmentColor = (idx: number) => {
    const palette = ['bg-brand-primary', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-400', 'bg-cyan-500'];
    return palette[idx % palette.length];
  };

  // 1-Click Mint Execution Flow
  const handleExecuteMint = async (basket: BasketDefinition, quote: BasketMintQuote) => {
    setSelectedBasket(null);

    const isDevnet = network === 'devnet';
    const initialSteps = [
      {
        id: 'route_quote',
        label: 'Preparing your investment',
        description: `Getting ${basket.constituents.length} underlying assets ready`,
        status: 'active' as const,
      },
      {
        id: 'verify_custody',
        label: 'Checking the basket',
        description: 'Verifying the live vault before any funds move',
        status: 'pending' as const,
      },
      {
        id: 'acquire_underlying',
        label: 'Buying the underlying assets',
        description: `Converting ${quote.depositUsdcAmount} USDC into the basket constituents`,
        status: 'pending' as const,
      },
      {
        id: 'deposit_and_mint',
        label: `Minting ${quote.expectedBasketTokens} ${basket.symbol}`,
        description: 'Moving the underlying assets into the vault and minting your shares',
        status: 'pending' as const,
      },
      {
        id: 'settlement',
        label: 'Confirming',
        description: 'Waiting for Solana to confirm your position',
        status: 'pending' as const,
      },
    ];

    setTxLifecycle({
      isOpen: true,
      title: `Invest: ${basket.name} (${basket.symbol})`,
      steps: initialSteps,
      currentStepIndex: 0,
      isCompleted: false,
      hasError: false,
      actionType: 'mint',
    });

    if (!publicKey) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? { ...step, status: 'failed', error: 'Wallet not connected. Please connect your Solana wallet.' }
            : step
        ),
      }));
      return;
    }

    let activeStepIndex = 0;
    let constituentAcquisitionReady = false;

    const activateStep = (nextIndex: number, completedIndex?: number, evidence?: string[]) => {
      activeStepIndex = nextIndex;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: nextIndex,
        steps: prev.steps.map((step, index) => {
          if (typeof completedIndex === 'number' && index === completedIndex) {
            return {
              ...step,
              status: 'completed',
              txSignatures: evidence,
              txSignature: evidence?.length === 1 ? evidence[0] : step.txSignature,
            };
          }
          if (index === nextIndex) return { ...step, status: 'active' };
          return step;
        }),
      }));
    };

    try {
      const vaultClient = new SynthaBasketVaultClient(connection);
      const devnetUsdcMint = new PublicKey(
        '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
      );
      const [beforeUsdcBalance, beforeBasketBalance] = await Promise.all([
        vaultClient.getUserTokenBalance(publicKey, devnetUsdcMint),
        vaultClient.getUserBasketBalance(publicKey, basket, isDevnet),
      ]);

      // Step 1: Produce an execution plan. Estimates are never treated as executable routes.
      const router = new AllocationRouter(connection);
      const allocationPlan = await router.prepareAllocationSwaps(publicKey, quote, isDevnet);

      if (allocationPlan.unavailable.length > 0) {
        const reasons = allocationPlan.unavailable
          .map((item) => `${item.symbol}: ${item.reason}`)
          .join(' | ');
        throw new Error(
          `Investment stopped before signing because the full constituent acquisition is not executable on this cluster. ${reasons}`
        );
      }

      if (allocationPlan.executionTransactions.length < 1) {
        throw new Error('Investment stopped: no executable acquisition transaction was produced.');
      }

      // Step 2: Verify the live basket configuration before any swap or Devnet
      // acquisition can consume user USDC.
      await vaultClient.verifyBasketExecutionState(basket, isDevnet);
      activateStep(2, 1);

      // Use the server-produced exact raw outputs. Devnet mirror issuance is
      // intentionally not derived from the rounded display estimates.
      const executionQuote: BasketMintQuote = {
        ...quote,
        allocations: quote.allocations.map((allocation) => {
          const executed = allocationPlan.breakdown.find(
            (item) => item.symbol === allocation.asset.symbol
          );
          if (!executed?.rawOutAmount || executed.actualQuotedOutAmount === null) {
            throw new Error(
              `Missing executable amount for ${allocation.asset.symbol}.`
            );
          }
          return {
            ...allocation,
            estimatedTokensReceived: executed.actualQuotedOutAmount,
            rawTokenAmount: executed.rawOutAmount,
          };
        }),
      };

      // Compute the exact non-dilutive deposit from the current live reserves
      // BEFORE any acquisition signature is requested. This is the executable
      // share amount for this route, not a price-derived UI estimate.
      const depositQuote = await vaultClient.prepareProportionalMintQuote(
        basket,
        executionQuote,
        isDevnet
      );

      setTxLifecycle((prev) => ({
        ...prev,
        steps: prev.steps.map((step, index) =>
          index === 3
            ? {
                ...step,
                label: `Deposit Underlying & Mint ${depositQuote.expectedBasketTokens} ${basket.symbol}`,
                description:
                  depositQuote.expectedBasketTokens < quote.expectedBasketTokens
                    ? 'Mint amount adjusted to the live vault reserve ratio; any rounding surplus remains in your wallet.'
                    : 'Exact mint amount derived from the live vault reserve ratio.',
              }
            : step
        ),
      }));

      // A retry after a post-acquisition failure must never charge Devnet USDC
      // a second time. Only the exact deposit legs are required for a resume.
      const canReuseExistingAcquisition =
        isDevnet &&
        (await vaultClient.hasSufficientDepositBalances(
          publicKey,
          basket,
          depositQuote,
          true
        ));

      if (canReuseExistingAcquisition) {
        constituentAcquisitionReady = true;
      }

      if (
        !canReuseExistingAcquisition &&
        beforeUsdcBalance + 1e-9 < quote.depositUsdcAmount
      ) {
        throw new Error(
          `Insufficient Devnet USDC. Need ${quote.depositUsdcAmount.toFixed(2)} USDC, wallet has ${beforeUsdcBalance.toFixed(2)}.`
        );
      }

      const allocationSignatures: string[] = [];
      if (!canReuseExistingAcquisition) {
        // Step 3: Execute every prepared constituent acquisition and require a confirmed result.
        for (const prepared of allocationPlan.executionTransactions) {
          const signature = await sendTransaction(prepared.transaction, connection, {
            skipPreflight: false,
            maxRetries: 3,
          });

          const outcome = await waitForSignatureOutcome(connection, signature, {
            lastValidBlockHeight: prepared.lastValidBlockHeight,
            timeoutMs: 90_000,
          });

          if (outcome.state === 'unknown') {
            setTxLifecycle((prev) => ({
              ...prev,
              hasPendingConfirmation: true,
              currentStepIndex: 2,
              steps: prev.steps.map((step, index) =>
                index === 2
                  ? {
                      ...step,
                      status: 'submitted',
                      txSignature: signature,
                      statusMessage: outcome.error,
                    }
                  : step
              ),
            }));
            return;
          }
          if (outcome.state !== 'confirmed') {
            throw new Error(
              `${prepared.label} ${outcome.state}: ${outcome.error}`
            );
          }
          allocationSignatures.push(signature);
        }
        constituentAcquisitionReady = true;
      } else {
        setTxLifecycle((prev) => ({
          ...prev,
          steps: prev.steps.map((step, index) =>
            index === 2
              ? {
                  ...step,
                  statusMessage:
                    'Existing confirmed Devnet mirror assets detected. Reusing them; no additional USDC acquisition was sent.',
                }
              : step
          ),
        }));
      }

      // Once acquisition is confirmed, reflect that truth immediately. Any
      // subsequent RPC/preflight failure belongs to the vault-deposit step;
      // the acquired tokens stay in the user's wallet and are reusable.
      activateStep(3, 2, allocationSignatures);

      await vaultClient.verifyDepositBalances(
        publicKey,
        basket,
        depositQuote,
        isDevnet
      );

      // Step 4: Build the actual Anchor deposit transaction only after all
      // acquisition signatures are confirmed and token balances are present.
      const depositTx = await vaultClient.buildMintTransaction(
        publicKey,
        basket,
        depositQuote,
        50_000,
        isDevnet
      );

      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      depositTx.recentBlockhash = latestBlockhash.blockhash;
      depositTx.feePayer = publicKey;

      // Simulate the exact unsigned deposit before opening the wallet. This
      // turns Anchor errors into useful UI messages instead of a wallet-level
      // generic "Internal error".
      const depositSimulation = await connection.simulateTransaction(depositTx);
      if (depositSimulation.value.err) {
        const anchorErrorLog = (depositSimulation.value.logs || []).find(
          (line) => line.includes('Error Message:')
        );
        throw new Error(
          anchorErrorLog
            ? anchorErrorLog.replace(/^.*Error Message:\s*/, 'Vault preflight failed: ')
            : `Vault preflight failed: ${JSON.stringify(depositSimulation.value.err)}`
        );
      }

      // Step 4: Broadcast the actual Anchor deposit_and_mint transaction.
      const depositSignature = await sendTransaction(depositTx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });

      activateStep(4, 3, [depositSignature]);

      // Step 5: Poll for a definitive outcome instead of treating a 30s RPC timeout as failure.
      const depositOutcome = await waitForSignatureOutcome(connection, depositSignature, {
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        timeoutMs: 90_000,
      });

      if (depositOutcome.state === 'unknown') {
        setTxLifecycle((prev) => ({
          ...prev,
          hasPendingConfirmation: true,
          currentStepIndex: 4,
          steps: prev.steps.map((step, index) =>
            index === 4
              ? {
                  ...step,
                  status: 'submitted',
                  txSignature: depositSignature,
                  statusMessage: depositOutcome.error,
                }
              : step
          ),
        }));
        return;
      }

      if (depositOutcome.state !== 'confirmed') {
        throw new Error(`Vault deposit ${depositOutcome.state}: ${depositOutcome.error}`);
      }

      let afterUsdcBalance: number | null = null;
      let afterBasketBalance: number | null = null;
      try {
        [afterUsdcBalance, afterBasketBalance] = await Promise.all([
          vaultClient.getUserTokenBalance(publicKey, devnetUsdcMint),
          vaultClient.getUserBasketBalance(publicKey, basket, isDevnet),
        ]);
      } catch (receiptError) {
        console.warn(
          '[Mint receipt] Transaction confirmed but post-settlement balance enrichment failed.',
          receiptError
        );
      }

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: depositSignature,
        receipt: {
          basketSymbol: basket.symbol,
          spentUsdc:
            afterUsdcBalance === null
              ? undefined
              : Math.max(0, beforeUsdcBalance - afterUsdcBalance),
          sharesReceived: depositQuote.expectedBasketTokens,
          resultingShareBalance:
            afterBasketBalance === null ? undefined : afterBasketBalance,
          assetsDeposited: depositQuote.allocations.map((allocation) => ({
            symbol: allocation.asset.symbol,
            amount: allocation.estimatedTokensReceived,
          })),
        },
        currentStepIndex: 4,
        steps: prev.steps.map((step, index) =>
          index === 4
            ? { ...step, status: 'completed', txSignature: depositSignature }
            : step
        ),
      }));

      // Refresh from actual provider prices + Solana state rather than
      // incrementing registry/demo numbers locally.
      setHydrationNonce((value) => value + 1);
    } catch (err: any) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        currentStepIndex: activeStepIndex,
        steps: prev.steps.map((step, index) =>
          index === activeStepIndex
            ? {
                ...step,
                status: 'failed',
                error:
                  (err?.message || 'Transaction failed') +
                  (constituentAcquisitionReady
                    ? ' Any constituent tokens already acquired remain in your wallet. Retry the same investment to reuse those exact deposit balances; SynthaBasket will not send another Devnet USDC acquisition while they are still present.'
                    : ''),
              }
            : step
        ),
      }));
    }
  };

  // Burn & Redeem Execution Flow
  const handleExecuteRedeem = async (basket: BasketDefinition, quote: BasketRedeemQuote) => {
    setSelectedBasket(null);

    const isDevnet = network === 'devnet';
    const initialSteps = [
      {
        id: 'verify_redeem',
        label: 'Checking your position',
        description: 'Verifying your shares and the live basket vault',
        status: 'active' as const,
      },
      {
        id: 'burn_and_release',
        label: `Redeeming ${quote.burnBasketTokensAmount} ${basket.symbol}`,
        description: 'Burning your shares and releasing the underlying assets',
        status: 'pending' as const,
      },
      {
        id: 'confirm_redeem',
        label: 'Confirming',
        description: 'Waiting for the redeemed assets to settle in your wallet',
        status: 'pending' as const,
      },
    ];

    setTxLifecycle({
      isOpen: true,
      title: `Burn & Redeem: ${basket.name} ($${basket.symbol})`,
      steps: initialSteps,
      currentStepIndex: 0,
      isCompleted: false,
      hasError: false,
      actionType: 'redeem',
    });

    if (!publicKey) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? { ...step, status: 'failed', error: 'Wallet not connected. Connect your wallet to redeem.' }
            : step
        ),
      }));
      return;
    }

    let activeStepIndex = 0;

    try {
      const vaultClient = new SynthaBasketVaultClient(connection);
      await vaultClient.verifyBasketExecutionState(basket, isDevnet);

      const beforeBasketBalance = await vaultClient.getUserBasketBalance(
        publicKey,
        basket,
        isDevnet
      );

      if (beforeBasketBalance + 0.0000005 < quote.burnBasketTokensAmount) {
        throw new Error(
          `You only hold ${beforeBasketBalance.toFixed(6)} ${basket.symbol}. Reduce the redemption amount and try again.`
        );
      }

      // Re-read reserves immediately before transaction construction so the
      // executable burn amount and displayed constituent outputs are based on
      // the latest vault state rather than an older modal quote.
      const executionRedeemQuote = await vaultClient.prepareLiveRedeemQuote(
        basket,
        quote.burnBasketTokensAmount,
        isDevnet
      );

      setTxLifecycle((prev) => ({
        ...prev,
        steps: prev.steps.map((step, index) =>
          index === 1
            ? {
                ...step,
                label: `Redeeming ${executionRedeemQuote.burnBasketTokensAmount} ${basket.symbol}`,
                description: 'Burning your shares and releasing the current pro-rata vault assets',
              }
            : step
        ),
      }));

      const beforeConstituentBalances = await Promise.all(
        executionRedeemQuote.constituentsToReturn.map(async (item) => {
          const mint = new PublicKey(
            isDevnet
              ? item.asset.devnetMint || item.asset.tokenMint
              : item.asset.tokenMint
          );
          return {
            symbol: item.asset.symbol,
            balance: await vaultClient.getUserTokenBalance(publicKey, mint),
          };
        })
      );

      const redeemTx = await vaultClient.buildRedeemTransaction(
        publicKey,
        basket,
        executionRedeemQuote,
        50_000,
        isDevnet
      );

      const latest = await connection.getLatestBlockhash('confirmed');
      redeemTx.recentBlockhash = latest.blockhash;
      redeemTx.feePayer = publicKey;

      activeStepIndex = 1;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 1,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? { ...step, status: 'completed' }
            : index === 1
            ? { ...step, status: 'active' }
            : step
        ),
      }));

      const redeemSimulation = await connection.simulateTransaction(redeemTx);
      if (redeemSimulation.value.err) {
        const anchorErrorLog = (redeemSimulation.value.logs || []).find(
          (line) => line.includes('Error Message:')
        );
        throw new Error(
          anchorErrorLog
            ? anchorErrorLog.replace(/^.*Error Message:\s*/, 'Vault preflight failed: ')
            : `Vault preflight failed: ${JSON.stringify(redeemSimulation.value.err)}`
        );
      }

      const signature = await sendTransaction(redeemTx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });

      activeStepIndex = 2;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 2,
        steps: prev.steps.map((step, index) =>
          index === 1
            ? { ...step, status: 'completed', txSignature: signature }
            : index === 2
            ? { ...step, status: 'active' }
            : step
        ),
      }));

      const outcome = await waitForSignatureOutcome(connection, signature, {
        lastValidBlockHeight: latest.lastValidBlockHeight,
        timeoutMs: 90_000,
      });

      if (outcome.state === 'unknown') {
        setTxLifecycle((prev) => ({
          ...prev,
          hasPendingConfirmation: true,
          currentStepIndex: 2,
          steps: prev.steps.map((step, index) =>
            index === 2
              ? {
                  ...step,
                  status: 'submitted',
                  txSignature: signature,
                  statusMessage: outcome.error,
                }
              : step
          ),
        }));
        return;
      }

      if (outcome.state !== 'confirmed') {
        throw new Error(`Redemption ${outcome.state}: ${outcome.error}`);
      }

      let afterBasketBalance: number | null = null;
      let assetsReturned:
        | Array<{ symbol: string; amount: number }>
        | undefined;

      try {
        afterBasketBalance = await vaultClient.getUserBasketBalance(
          publicKey,
          basket,
          isDevnet
        );
        const afterConstituentBalances = await Promise.all(
          executionRedeemQuote.constituentsToReturn.map(async (item) => {
            const mint = new PublicKey(
              isDevnet
                ? item.asset.devnetMint || item.asset.tokenMint
                : item.asset.tokenMint
            );
            return {
              symbol: item.asset.symbol,
              balance: await vaultClient.getUserTokenBalance(publicKey, mint),
            };
          })
        );

        assetsReturned = afterConstituentBalances.map((after) => {
          const before = beforeConstituentBalances.find(
            (item) => item.symbol === after.symbol
          );
          return {
            symbol: after.symbol,
            amount: Math.max(0, after.balance - (before?.balance || 0)),
          };
        });
      } catch (receiptError) {
        console.warn(
          '[Redeem receipt] Transaction confirmed but post-settlement balance enrichment failed.',
          receiptError
        );
      }

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: signature,
        receipt: {
          basketSymbol: basket.symbol,
          sharesBurned: executionRedeemQuote.burnBasketTokensAmount,
          resultingShareBalance:
            afterBasketBalance === null ? undefined : afterBasketBalance,
          assetsReturned,
        },
        steps: prev.steps.map((step, index) =>
          index === 2
            ? { ...step, status: 'completed', txSignature: signature }
            : step
        ),
      }));

      // Re-read the vault after settlement so the UI reflects actual reserves
      // and SPL supply rather than an estimated local subtraction.
      setHydrationNonce((value) => value + 1);
    } catch (err: any) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        currentStepIndex: activeStepIndex,
        steps: prev.steps.map((step, index) =>
          index === activeStepIndex
            ? { ...step, status: 'failed', error: err?.message || 'Redemption failed' }
            : step
        ),
      }));
    }
  };

  // Create Basket Flow
  const handleDeployBasket = async (draft: BasketCreationDraft) => {
    const isDevnet = network === 'devnet';
    const vaultClient = new SynthaBasketVaultClient(connection);
    const [basketPda] = vaultClient.getBasketPda(draft.symbol);
    const [basketMint] = vaultClient.getBasketMintPda(draft.symbol);

    const newBasket: BasketDefinition = {
      id: `custom-${draft.symbol.toLowerCase()}`,
      name: draft.name,
      symbol: draft.symbol,
      description: draft.description,
      category: 'custom',
      providerMode: 'multi',
      constituents: draft.constituents,
      navUsd: draft.indicativeNavUsd,
      navChange24h: 0,
      navChange24hAvailable: false,
      navSource: 'target_weights',
      marketDataSource:
        draft.constituents.every(
          (constituent) => constituent.asset.quoteSource === 'live'
        )
          ? 'live'
          : draft.constituents.every(
              (constituent) => constituent.asset.quoteSource !== 'live'
            )
          ? 'snapshot'
          : 'mixed',
      onChainStateLoaded: false,
      aumUsd: 0,
      totalSharesMinted: 0,
      vaultPda: basketPda.toBase58(),
      basketMint: basketMint.toBase58(),
      devnetExecutionSymbol: draft.symbol,
      createdAt: Date.now(),
    };

    const initialSteps = [
      {
        id: 'initialize_basket',
        label: `Initialize Basket State & Share Mint (${draft.symbol})`,
        description:
          'Creating the deterministic basket PDA and zero-supply SPL share mint',
        status: 'active' as const,
      },
      {
        id: 'verify_basket',
        label: 'Verify On-Chain Basket Configuration',
        description:
          'Checking program ownership, share mint, constituents, and exact target weights',
        status: 'pending' as const,
      },
      {
        id: 'register_basket',
        label: 'Index Basket in Durable Registry',
        description:
          'Saving verified off-chain metadata so the basket survives refreshes and hydration',
        status: 'pending' as const,
      },
    ];

    setTxLifecycle({
      isOpen: true,
      title: `Deploying Basket: ${draft.name}`,
      steps: initialSteps,
      currentStepIndex: 0,
      isCompleted: false,
      hasError: false,
      actionType: 'create_basket',
    });

    if (!customRegistryConfigured) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? {
                ...step,
                status: 'failed',
                error:
                  'Durable custom-basket storage is not configured. Deployment is blocked so a newly created basket cannot disappear on refresh.',
              }
            : step
        ),
      }));
      return;
    }

    if (!publicKey) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? {
                ...step,
                status: 'failed',
                error:
                  'Wallet not connected. Connect your Solana wallet to deploy the basket.',
              }
            : step
        ),
      }));
      return;
    }

    let activeStepIndex = 0;
    let initSignature: string | undefined;

    try {
      const existingBasketAccount = await connection.getAccountInfo(
        basketPda,
        'confirmed'
      );

      if (!existingBasketAccount) {
        const initTx = await vaultClient.buildInitializeBasketTransaction(
          publicKey,
          newBasket,
          isDevnet,
          0
        );
        const initLatest = await connection.getLatestBlockhash('confirmed');
        initTx.recentBlockhash = initLatest.blockhash;
        initTx.feePayer = publicKey;

        const initSimulation = await connection.simulateTransaction(initTx);
        if (initSimulation.value.err) {
          const anchorErrorLog = (initSimulation.value.logs || []).find((line) =>
            line.includes('Error Message:')
          );
          throw new Error(
            anchorErrorLog
              ? anchorErrorLog.replace(
                  /^.*Error Message:\s*/,
                  'Basket preflight failed: '
                )
              : `Basket preflight failed: ${JSON.stringify(
                  initSimulation.value.err
                )}`
          );
        }

        initSignature = await sendTransaction(initTx, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        setTxLifecycle((prev) => ({
          ...prev,
          currentStepIndex: 0,
          steps: prev.steps.map((step, index) =>
            index === 0
              ? {
                  ...step,
                  status: 'submitted',
                  txSignature: initSignature,
                  statusMessage: 'Submitted; waiting for Solana confirmation.',
                }
              : step
          ),
        }));

        const initOutcome = await waitForSignatureOutcome(
          connection,
          initSignature,
          {
            lastValidBlockHeight: initLatest.lastValidBlockHeight,
            timeoutMs: 90_000,
          }
        );

        if (initOutcome.state === 'unknown') {
          setTxLifecycle((prev) => ({
            ...prev,
            hasPendingConfirmation: true,
            steps: prev.steps.map((step, index) =>
              index === 0
                ? {
                    ...step,
                    status: 'submitted',
                    txSignature: initSignature,
                    statusMessage: initOutcome.error,
                  }
                : step
            ),
          }));
          return;
        }

        if (initOutcome.state !== 'confirmed') {
          throw new Error(
            `Basket initialization ${initOutcome.state}: ${initOutcome.error}`
          );
        }
      }

      activeStepIndex = 1;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 1,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? {
                ...step,
                status: 'completed',
                txSignature: initSignature,
                statusMessage: existingBasketAccount
                  ? 'Existing matching basket account found; reusing it for registration recovery.'
                  : undefined,
              }
            : index === 1
            ? { ...step, status: 'active' }
            : step
        ),
      }));

      await vaultClient.verifyBasketExecutionState(newBasket, isDevnet);

      activeStepIndex = 2;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 2,
        steps: prev.steps.map((step, index) =>
          index === 1
            ? { ...step, status: 'completed' }
            : index === 2
            ? { ...step, status: 'active' }
            : step
        ),
      }));

      const registrationResponse = await fetch('/api/baskets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basket: {
            name: draft.name,
            symbol: draft.symbol,
            description: draft.description,
            constituents: draft.constituents.map((constituent) => ({
              tokenMint: constituent.asset.tokenMint,
              targetWeightBps: constituent.targetWeightBps,
            })),
          },
        }),
      });

      const registrationPayload = await registrationResponse
        .json()
        .catch(() => ({}));

      if (!registrationResponse.ok) {
        throw new Error(
          registrationPayload?.error ||
            `Basket registry returned HTTP ${registrationResponse.status}.`
        );
      }

      const registeredBasket = registrationPayload?.basket as
        | BasketDefinition
        | undefined;

      if (!registeredBasket?.id) {
        throw new Error(
          'Basket was verified on-chain but the durable registry returned an incomplete record.'
        );
      }

      setBaskets((prev) => [
        registeredBasket,
        ...prev.filter((basket) => basket.id !== registeredBasket.id),
      ]);

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: initSignature,
        steps: prev.steps.map((step, index) =>
          index === 2 ? { ...step, status: 'completed' } : step
        ),
      }));

      setHydrationNonce((value) => value + 1);
      router.push('/app');
    } catch (err: any) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        currentStepIndex: activeStepIndex,
        steps: prev.steps.map((step, index) =>
          index === activeStepIndex
            ? {
                ...step,
                status: 'failed',
                error:
                  err?.message ||
                  'Basket deployment failed before it could be fully indexed.',
              }
            : step
        ),
      }));
    }
  };

  const categoryLabels: Record<string, string> = {
    all: 'All Baskets',
    ai: 'AI',
    space_defense: 'Space & Defense',
    fintech: 'FinTech',
    custom: 'Custom',
  };

  const filteredBaskets = baskets.filter((b) => {
    if (selectedCategory !== 'all' && b.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        b.symbol.toLowerCase().includes(q) ||
        b.constituents.some((c) => c.asset.name.toLowerCase().includes(q) || c.asset.symbol.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <main className="flex-1 pb-16 font-sans">
      <Navbar network={network} />

      <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6 lg:px-8 space-y-10">

        {/* ========================================================================= */}
        {/* TAB 1: MAIN HOMEPAGE / BASKETS MARKETPLACE (MATCHING REFERENCE DESIGN) */}
        {/* ========================================================================= */}
        {activeTab === 'baskets' && (
          <div className="space-y-10">
            <div className="pt-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-primary sm:text-3xl">
                Baskets
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-secondary">
                <span>Private-market indexes you can invest in and redeem on Solana.</span>
                {lastHydratedAt && (
                  <span className="text-xs text-ink-tertiary">
                    {Math.max(0, Math.floor((freshnessNow - lastHydratedAt) / 1000)) < 5
                      ? 'Updated just now'
                      : `Updated ${Math.max(
                          0,
                          Math.floor((freshnessNow - lastHydratedAt) / 1000)
                        )}s ago`} · refreshes every 30s
                  </span>
                )}
              </div>
            </div>

            {/* THEMATIC BASKETS SECTION */}
            <div id="baskets-grid" className="space-y-4 pt-4">
              {/* Category Filter Pills & Search matching reference */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-6">
                  {['all', 'ai', 'space_defense', 'fintech', 'custom'].map((cat) => {
                    const active = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`relative py-2 text-[13px] font-semibold transition-colors ${
                          active ? 'text-brand-primary' : 'text-ink-secondary hover:text-ink-primary'
                        }`}
                      >
                        {categoryLabels[cat]}
                        {active && (
                          <span className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-brand-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-ink-tertiary" />
                    <input
                      type="text"
                      placeholder="Search baskets"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-full border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-ink-primary placeholder-ink-tertiary focus:border-brand-primary focus:outline-none sm:w-64"
                    />
                  </div>

                </div>
              </div>

              {/* Hydrated basket grid */}
              {marketplaceStatus === 'loading' ? (
                <div className="py-16 text-sm text-ink-tertiary">Loading basket data…</div>
              ) : marketplaceStatus === 'error' ? (
                <div className="py-16 text-sm text-semantic-negative">
                  Live basket data is temporarily unavailable.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                {filteredBaskets.map((basket) => {
                  const isPositive = basket.navChange24h >= 0;

                  return (
                    <div
                      key={basket.id}
                      className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-lg"
                    >
                      <div>
                        {/* Basket identity: title first, ticker as metadata (not an avatar). */}
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold leading-tight text-ink-primary">
                            {basket.name}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
                            <span className="font-mono font-semibold text-brand-primary">
                              {basket.symbol}
                            </span>
                            <span className="text-ink-tertiary">·</span>
                            <span className="text-ink-tertiary">
                              {categoryLabels[basket.category] ?? basket.category}
                            </span>
                            <span className="text-ink-tertiary">·</span>
                            <span
                              className={
                                basket.navSource === 'onchain_reserves'
                                  ? 'text-brand-primary'
                                  : 'text-ink-tertiary'
                              }
                            >
                              {basket.navSource === 'onchain_reserves'
                                ? 'Live vault'
                                : 'Index pricing'}
                            </span>
                          </div>
                        </div>

                        {/* NAV & 24h Return */}
                        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5">
                          <div>
                            <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                              NAV
                            </span>
                            <span className="font-mono text-base font-bold text-ink-primary tabular-nums">
                              ${basket.navUsd.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-ink-tertiary">
                              24h
                            </span>
                            {basket.navChange24hAvailable ? (
                              <span
                                className={`flex items-center justify-end font-mono text-xs font-bold tabular-nums ${
                                  isPositive ? 'text-brand-primary' : 'text-semantic-negative'
                                }`}
                              >
                                {isPositive ? '+' : ''}{basket.navChange24h.toFixed(2)}%
                              </span>
                            ) : (
                              <span className="font-mono text-xs text-ink-tertiary">—</span>
                            )}
                          </div>
                        </div>

                        {/* Segmented Composition Bar */}
                        <div className="mt-3 space-y-1.5">
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                            {basket.constituents.map((c, idx) => (
                              <div
                                key={c.asset.tokenMint}
                                style={{ width: `${c.targetWeightBps / 100}%` }}
                                className={`${getSegmentColor(idx)} h-full`}
                              />
                            ))}
                          </div>

                          {/* Holdings list */}
                          <div className="space-y-1.5 pt-1 text-[11px]">
                            {basket.constituents.slice(0, 3).map((c, idx) => (
                              <div key={c.asset.tokenMint} className="flex items-center justify-between text-ink-secondary">
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${getSegmentColor(idx)}`} />
                                  <span className="text-ink-primary font-medium">{c.asset.symbol}</span>
                                </div>
                                <span className="font-mono tabular-nums text-ink-tertiary">{c.targetWeightBps / 100}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                        <button
                          onClick={() => handleSelectBasket(basket, 'mint')}
                          className="flex-1 rounded-lg bg-brand-primary py-1.5 text-xs font-bold text-black transition-opacity hover:opacity-95"
                        >
                          Invest
                        </button>
                        <button
                          onClick={() => handleSelectBasket(basket, 'inspect')}
                          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-ink-secondary hover:border-border-strong hover:text-ink-primary transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: BASIS & ORACLES MONITOR */}
        {activeTab === 'basis_monitor' && (
          <BasisMonitor
            items={basisItems}
            status={marketplaceStatus}
            lastRefreshedAt={lastHydratedAt}
            now={freshnessNow}
          />
        )}

        {/* TAB 3: CREATE BASKET STUDIO */}
        {activeTab === 'create_studio' && (
          <CreateBasketStudio
            availableAssets={availableAssets}
            marketplaceStatus={marketplaceStatus}
            registryReady={customRegistryConfigured}
            onDeployBasket={handleDeployBasket}
            onCancel={() => router.push('/app')}
          />
        )}
      </div>

      <footer className="mt-24 border-t border-border/60 bg-background py-10 font-sans">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-elevated text-brand-primary">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-sm font-extrabold tracking-tight text-ink-primary">SYNTHABASKET</span>
              </div>
              <p className="mt-2 text-xs text-ink-tertiary">
                Multi-provider private-market indexes on Solana.
              </p>
            </div>

            <nav className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-ink-secondary">
              <button onClick={() => router.push('/app')} className="transition-colors hover:text-brand-primary">Baskets</button>
              <button onClick={() => router.push('/app?view=markets')} className="transition-colors hover:text-brand-primary">Markets</button>
              <button onClick={() => router.push('/app?view=create')} className="transition-colors hover:text-brand-primary">Create</button>
              <button onClick={() => router.push('/app/portfolio')} className="transition-colors hover:text-brand-primary">Portfolio</button>
              <a
                href="https://github.com/ShalyX/synthabasket/blob/ui/wider-shell/DEMO_RUN_RECEIPTS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-brand-primary"
              >
                Verification log
              </a>
              <a
                href="https://github.com/ShalyX/synthabasket"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-brand-primary"
              >
                GitHub
              </a>
            </nav>

            <div className="text-xs text-ink-tertiary md:text-right">
              Solana Devnet
            </div>
          </div>
        </div>
      </footer>

      {/* Deep Inspector & Mint/Redeem Modal */}
      {selectedBasket && (
        <BasketDetailView
          basket={
            baskets.find((basket) => basket.id === selectedBasket.id) ||
            selectedBasket
          }
          initialTab={detailInitialTab}
          onClose={() => setSelectedBasket(null)}
          onExecuteMint={handleExecuteMint}
          onExecuteRedeem={handleExecuteRedeem}
          navHistory={navHistory[selectedBasket.id] || []}
        />
      )}

      {/* Transaction Lifecycle Runner Modal */}
      <TransactionLifecycleModal
        state={txLifecycle}
        onClose={() => setTxLifecycle((prev) => ({ ...prev, isOpen: false }))}
      />
    </main>
  );
}
