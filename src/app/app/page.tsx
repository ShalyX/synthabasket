'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Navbar } from '../../components/Navbar';
import { BasketDetailView } from '../../components/BasketDetailView';
import { CreateBasketStudio } from '../../components/CreateBasketStudio';
import { BasisMonitor } from '../../components/BasisMonitor';
import { TransactionLifecycleModal } from '../../components/TransactionLifecycleModal';
import { ProtocolProofModal } from '../../components/ProtocolProofModal';

import { INITIAL_BASKETS } from '../../lib/data/registry';
import {
  AssetQuote,
  BasketDefinition,
  BasketMintQuote,
  BasketRedeemQuote,
  BasisMonitorItem,
  MeteoraDBCConfig,
  TxLifecycleState,
} from '../../lib/types';
import {
  getUnifiedAssetQuotes,
  generateBasisMonitoringLedger,
} from '../../lib/services/valuation_engine';
import { AllocationRouter } from '../../lib/execution/allocation_router';
import { SynthaBasketVaultClient } from '../../lib/execution/vault_client';
import { MeteoraDbcManager } from '../../lib/execution/meteora_dbc';
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

  const [baskets, setBaskets] = useState<BasketDefinition[]>(INITIAL_BASKETS);
  const [availableAssets, setAvailableAssets] = useState<AssetQuote[]>([]);
  const [basisItems, setBasisItems] = useState<BasisMonitorItem[]>([]);

  // Category filter for the basket cards
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [marketTab, setMarketTab] = useState<'top' | 'movers' | 'new'>('top');

  // Selected Basket Modal
  const [selectedBasket, setSelectedBasket] = useState<BasketDefinition | null>(null);
  const [detailInitialTab, setDetailInitialTab] = useState<'mint' | 'redeem' | 'inspect'>('mint');

  // Proof Modal
  const showProofModal = searchParams.get('proof') === '1';

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

  // Fetch the unified multi-provider private-market universe.
  useEffect(() => {
    async function loadAssets() {
      const quotes = await getUnifiedAssetQuotes('multi');
      setAvailableAssets(quotes);
      const basis = generateBasisMonitoringLedger(quotes);
      setBasisItems(basis);
    }
    loadAssets();
  }, []);

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
        label: isDevnet ? 'Resolve Executable Devnet Asset Routes' : 'Prepare Multi-Asset Jupiter Routes',
        description: isDevnet
          ? `Checking executable Devnet mirror assets for ${basket.constituents.length} constituents`
          : `Splitting ${quote.depositUsdcAmount} USDC into ${basket.constituents.length} constituent assets via Jupiter Swap API V2`,
        status: 'active' as const,
      },
      {
        id: 'verify_custody',
        label: 'Verify Live Vault & Execution Configuration',
        description: isDevnet
          ? 'Checking the initialized Devnet basket state and mirror constituent mints before any asset acquisition'
          : 'Checking program ownership, basket mint, and constituent configuration before any asset acquisition',
        status: 'pending' as const,
      },
      {
        id: 'acquire_underlying',
        label: 'Acquire Underlying Constituent Assets',
        description: isDevnet
          ? 'Exchanging Devnet USDC for explicit test-only mirror assets'
          : 'Broadcasting and confirming every Jupiter constituent swap',
        status: 'pending' as const,
      },
      {
        id: 'deposit_and_mint',
        label: `Deposit Underlying & Mint ${quote.expectedBasketTokens} ${basket.symbol}`,
        description: 'Broadcasting the Anchor deposit_and_mint instruction with the acquired token amounts',
        status: 'pending' as const,
      },
      {
        id: 'settlement',
        label: 'Confirm On-Chain Settlement',
        description: 'Polling Solana for a definitive confirmed, failed, or expired status',
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
      const vaultClient = new SynthaBasketVaultClient(connection);
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

      // A retry after a post-acquisition failure must never charge Devnet USDC
      // a second time. If the wallet already holds this exact execution basket,
      // reuse those assets and resume directly at the vault deposit.
      const canReuseExistingAcquisition =
        isDevnet &&
        (await vaultClient.hasSufficientDepositBalances(
          publicKey,
          basket,
          executionQuote,
          true
        ));

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

      await vaultClient.verifyDepositBalances(
        publicKey,
        basket,
        executionQuote,
        isDevnet
      );

      // Derive the largest non-dilutive mint from the live vault reserves and
      // exact acquired amounts. Tiny rounding surplus remains in the wallet.
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
                    : step.description,
              }
            : step
        ),
      }));

      activateStep(3, 2, allocationSignatures);

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

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: depositSignature,
        currentStepIndex: 4,
        steps: prev.steps.map((step, index) =>
          index === 4
            ? { ...step, status: 'completed', txSignature: depositSignature }
            : step
        ),
      }));

      setBaskets((prev) =>
        prev.map((existingBasket) =>
          existingBasket.id === basket.id
            ? {
                ...existingBasket,
                aumUsd:
                  existingBasket.aumUsd +
                  quote.depositUsdcAmount *
                    (quote.expectedBasketTokens > 0
                      ? depositQuote.expectedBasketTokens / quote.expectedBasketTokens
                      : 1),
                totalSharesMinted:
                  existingBasket.totalSharesMinted + depositQuote.expectedBasketTokens,
              }
            : existingBasket
        )
      );
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
                error: err?.message || 'Transaction failed',
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
        label: 'Verify Live Vault & Basket Shares',
        description: 'Checking the live basket state and execution mints before redemption',
        status: 'active' as const,
      },
      {
        id: 'burn_and_release',
        label: `Burn ${quote.burnBasketTokensAmount} $${basket.symbol} & Release Underlying`,
        description: 'Broadcasting the Anchor burn_and_redeem instruction',
        status: 'pending' as const,
      },
      {
        id: 'confirm_redeem',
        label: 'Confirm Redemption Settlement',
        description: `Confirming proportional constituent settlement (~$${quote.expectedUsdcValue} NAV equivalent)`,
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

      const redeemTx = await vaultClient.buildRedeemTransaction(
        publicKey,
        basket,
        quote,
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

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: signature,
        steps: prev.steps.map((step, index) =>
          index === 2
            ? { ...step, status: 'completed', txSignature: signature }
            : step
        ),
      }));

      setBaskets((prev) =>
        prev.map((existingBasket) =>
          existingBasket.id === basket.id
            ? {
                ...existingBasket,
                aumUsd: Math.max(0, existingBasket.aumUsd - quote.expectedUsdcValue),
                totalSharesMinted: Math.max(
                  0,
                  existingBasket.totalSharesMinted - quote.burnBasketTokensAmount
                ),
              }
            : existingBasket
        )
      );
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
  const handleDeployBasket = async (newBasket: BasketDefinition, dbcConfig?: MeteoraDBCConfig) => {
    const isDevnet = network === 'devnet';

    const initialSteps: Array<{
      id: string;
      label: string;
      description: string;
      status: 'pending' | 'active' | 'completed' | 'failed';
      txSignature?: string;
    }> = [
      {
        id: 'initialize_basket',
        label: `Initialize Basket State & SPL Mint ($${newBasket.symbol})`,
        description: 'Broadcasting the Anchor initialize_basket instruction',
        status: 'active',
      },
      {
        id: 'verify_basket',
        label: 'Verify On-Chain Basket Configuration',
        description: 'Confirming program ownership, basket mint, constituents, and weights',
        status: 'pending',
      },
    ];

    if (dbcConfig) {
      initialSteps.push({
        id: 'configure_dbc',
        label: 'Create Meteora DBC Configuration',
        description: `Creating the curve config with a $${dbcConfig.graduationThresholdUsd.toLocaleString()} graduation threshold`,
        status: 'pending',
      });
    }

    setTxLifecycle({
      isOpen: true,
      title: `Deploying Basket: ${newBasket.name}`,
      steps: initialSteps,
      currentStepIndex: 0,
      isCompleted: false,
      hasError: false,
      actionType: 'create_basket',
    });

    if (!publicKey) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? { ...step, status: 'failed', error: 'Wallet not connected. Connect your wallet to deploy the basket.' }
            : step
        ),
      }));
      return;
    }

    let activeStepIndex = 0;
    let basketAdded = false;

    try {
      const vaultClient = new SynthaBasketVaultClient(connection);
      const initTx = await vaultClient.buildInitializeBasketTransaction(
        publicKey,
        newBasket,
        isDevnet,
        0
      );
      const initLatest = await connection.getLatestBlockhash('confirmed');
      initTx.recentBlockhash = initLatest.blockhash;
      initTx.feePayer = publicKey;

      const initSignature = await sendTransaction(initTx, connection, {
        skipPreflight: false,
        maxRetries: 3,
      });

      activeStepIndex = 1;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 1,
        steps: prev.steps.map((step, index) =>
          index === 0
            ? { ...step, status: 'completed', txSignature: initSignature }
            : index === 1
            ? { ...step, status: 'active' }
            : step
        ),
      }));

      const initOutcome = await waitForSignatureOutcome(connection, initSignature, {
        lastValidBlockHeight: initLatest.lastValidBlockHeight,
        timeoutMs: 90_000,
      });

      if (initOutcome.state !== 'confirmed') {
        throw new Error(`Basket initialization ${initOutcome.state}: ${initOutcome.error}`);
      }

      await vaultClient.verifyBasketExecutionState(newBasket, isDevnet);

      setBaskets((prev) => [newBasket, ...prev]);
      basketAdded = true;

      if (!dbcConfig) {
        setTxLifecycle((prev) => ({
          ...prev,
          isCompleted: true,
          finalSignature: initSignature,
          steps: prev.steps.map((step, index) =>
            index === 1
              ? { ...step, status: 'completed', txSignature: initSignature }
              : step
          ),
        }));
        router.push('/app');
        return;
      }

      activeStepIndex = 2;
      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 2,
        steps: prev.steps.map((step, index) =>
          index === 1
            ? { ...step, status: 'completed', txSignature: initSignature }
            : index === 2
            ? { ...step, status: 'active' }
            : step
        ),
      }));

      const dbcManager = new MeteoraDbcManager(connection);
      const quoteMint = new PublicKey(
        isDevnet
          ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
          : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      );
      const { transaction: configTx, configKeypair } =
        await dbcManager.buildCreateConfigTransaction(publicKey, quoteMint, dbcConfig);

      const dbcLatest = await connection.getLatestBlockhash('confirmed');
      configTx.recentBlockhash = dbcLatest.blockhash;
      configTx.feePayer = publicKey;

      const dbcSignature = await sendTransaction(configTx, connection, {
        signers: [configKeypair],
        skipPreflight: false,
        maxRetries: 3,
      });

      const dbcOutcome = await waitForSignatureOutcome(connection, dbcSignature, {
        lastValidBlockHeight: dbcLatest.lastValidBlockHeight,
        timeoutMs: 90_000,
      });

      if (dbcOutcome.state !== 'confirmed') {
        throw new Error(`Meteora DBC configuration ${dbcOutcome.state}: ${dbcOutcome.error}`);
      }

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: dbcSignature,
        steps: prev.steps.map((step, index) =>
          index === 2
            ? { ...step, status: 'completed', txSignature: dbcSignature }
            : step
        ),
      }));

      router.push('/app');
    } catch (err: any) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        currentStepIndex: activeStepIndex,
        steps: prev.steps.map((step, index) =>
          index === activeStepIndex
            ? { ...step, status: 'failed', error: err?.message || 'Basket deployment failed' }
            : step
        ),
      }));

      if (basketAdded) {
        router.push('/app');
      }
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
            <div className="flex flex-col gap-2 pt-2">
              <span className="text-[12px] font-semibold text-brand-primary">Private-market indexes</span>
              <h1 className="text-2xl font-extrabold tracking-tight text-ink-primary sm:text-3xl">
                Thematic Baskets
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-ink-secondary">
                Asset-backed baskets of tokenized private companies, sourced across multiple providers and settled on Solana.
              </p>
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
                      placeholder="Search baskets, assets, or tickers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-64 rounded-full border border-border bg-surface pl-9 pr-3 py-1.5 text-xs text-ink-primary placeholder-ink-tertiary focus:border-brand-primary focus:outline-none"
                    />
                  </div>
                  <div className="px-2 py-1.5 text-xs font-medium text-ink-tertiary">
                    Sort: AUM
                  </div>
                </div>
              </div>

              {/* 4-Card Responsive Grid matching reference */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
                {filteredBaskets.map((basket) => {
                  const isPositive = basket.navChange24h >= 0;

                  return (
                    <div
                      key={basket.id}
                      className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-lg"
                    >
                      <div>
                        {/* Header: Badge, Name, Category */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated font-mono text-xs font-bold text-brand-primary">
                              ${basket.symbol}
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold leading-tight text-ink-primary">
                                {basket.name}
                              </h3>
                              <span className="text-[11px] text-ink-tertiary">
                                {categoryLabels[basket.category] ?? basket.category}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-brand-primary">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
                            Physically Backed
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-cyan-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                            Redeemable 1:1
                          </span>
                        </div>

                        {/* Description */}
                        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
                          {basket.description}
                        </p>

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
                              24H RETURN
                            </span>
                            <span
                              className={`flex items-center justify-end font-mono text-xs font-bold tabular-nums ${
                                isPositive ? 'text-brand-primary' : 'text-semantic-negative'
                              }`}
                            >
                              {isPositive ? '+' : ''}{basket.navChange24h.toFixed(2)}%
                            </span>
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
            </div>

            {/* BOTTOM 3-COLUMN SECTION matching reference */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 pt-4">
              {/* Column 1: Market Overview */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink-primary">Market Overview</span>
                  <div className="flex gap-2 text-[10px] font-semibold text-ink-tertiary">
                    <button
                      onClick={() => setMarketTab('top')}
                      className={marketTab === 'top' ? 'text-brand-primary font-bold' : 'hover:text-ink-secondary'}
                    >
                      Top Assets
                    </button>
                    <span>•</span>
                    <button
                      onClick={() => setMarketTab('movers')}
                      className={marketTab === 'movers' ? 'text-brand-primary font-bold' : 'hover:text-ink-secondary'}
                    >
                      Top Movers
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase text-ink-tertiary font-sans">
                        <th className="pb-1.5">Asset</th>
                        <th className="pb-1.5 text-right">Price</th>
                        <th className="pb-1.5 text-right">24h</th>
                        <th className="pb-1.5 text-right font-sans">Provider</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-[11px]">
                      {availableAssets.slice(0, 5).map((asset) => (
                        <tr key={asset.tokenMint} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="py-2 font-bold text-ink-primary">{asset.symbol}</td>
                          <td className="py-2 text-right tabular-nums text-ink-secondary">
                            ${asset.priceUsd.toFixed(2)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-brand-primary font-semibold">
                            +{(asset.change24h || 2.4).toFixed(2)}%
                          </td>
                          <td className="py-2 text-right font-sans text-ink-tertiary uppercase text-[9px]">
                            {asset.provider}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column 2: Basis & Premium Monitor */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink-primary">Basis &amp; Premium Monitor</span>
                  <button
                    onClick={() => router.push('/app?view=markets')}
                    className="text-[11px] font-semibold text-brand-primary hover:underline flex items-center gap-0.5"
                  >
                    View All →
                  </button>
                </div>

                <div className="overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase text-ink-tertiary font-sans">
                        <th className="pb-1.5">Asset</th>
                        <th className="pb-1.5 text-right">DEX Price</th>
                        <th className="pb-1.5 text-right">Pyth Ref</th>
                        <th className="pb-1.5 text-right">Spread</th>
                        <th className="pb-1.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-[11px]">
                      {basisItems.slice(0, 5).map((item) => (
                        <tr key={item.tokenMint} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="py-2 font-bold text-ink-primary">{item.symbol}</td>
                          <td className="py-2 text-right tabular-nums text-ink-secondary">
                            ${item.solanaDexPriceUsd.toFixed(2)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-ink-tertiary">
                            ${item.pythBenchmarkPriceUsd.toFixed(2)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-brand-primary font-semibold">
                            {item.spreadBps > 0 ? `+${item.spreadBps}` : item.spreadBps} bps
                          </td>
                          <td className="py-2 text-right">
                            <span className="rounded bg-brand-primary/10 px-1.5 py-0.2 text-[9px] text-brand-primary font-semibold">
                              {item.spreadBps > 10 ? 'Premium' : item.spreadBps < -10 ? 'Discount' : 'Parity'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Column 3: Recent On-Chain Activity */}
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-ink-primary">Recent On-Chain Activity</span>
                  <button
                    onClick={() => router.push('/app?proof=1')}
                    className="text-[11px] font-semibold text-brand-primary hover:underline flex items-center gap-0.5"
                  >
                    View All →
                  </button>
                </div>

                <div className="overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase text-ink-tertiary font-sans">
                        <th className="pb-1.5">Type</th>
                        <th className="pb-1.5">Basket</th>
                        <th className="pb-1.5">Tx Signature</th>
                        <th className="pb-1.5 text-right font-sans">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-[11px]">
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-amber-400 font-semibold">Acquire</td>
                        <td className="py-2 text-ink-primary font-bold">$AIT</td>
                        <td className="py-2 text-ink-secondary">
                          <a
                            href="https://explorer.solana.com/tx/64MVX5hGZZTcLdJ5w3vM8NdDHygD2E51sFtFJEf6gYc99yfMMnfwTMJt49gqmpXMecUkFRcQn1qX5Gav4auW77Yg?cluster=devnet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-primary hover:underline"
                          >
                            64MVX5hG...W77Yg
                          </a>
                        </td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">Verified</td>
                      </tr>
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-brand-primary font-semibold">Mint</td>
                        <td className="py-2 text-ink-primary font-bold">$AIT</td>
                        <td className="py-2 text-ink-secondary">
                          <a
                            href="https://explorer.solana.com/tx/eq7G23KVcEK2fSEPxmzpRggjpVSeY5kenT5xgqVc2DBYXjqXeqjbYoevYdLmc88wXw8ChcRvwToSaxfqrSCrzN8?cluster=devnet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-primary hover:underline"
                          >
                            eq7G23KV...SCrzN8
                          </a>
                        </td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">Verified</td>
                      </tr>
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-cyan-400 font-semibold">Redeem</td>
                        <td className="py-2 text-ink-primary font-bold">$AIT</td>
                        <td className="py-2 text-ink-secondary">
                          <a
                            href="https://explorer.solana.com/tx/5bSV4hjn9WdZsqnB12Eb5Srf8KGDcd4XpaFx5R74H7PCJWWztR3QCp1X7pSrEeLQXHEfN6izbmEwREcUqiFe7fBe?cluster=devnet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-primary hover:underline"
                          >
                            5bSV4hjn...Fe7fBe
                          </a>
                        </td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">Verified</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BASIS & ORACLES MONITOR */}
        {activeTab === 'basis_monitor' && (
          <BasisMonitor items={basisItems} />
        )}

        {/* TAB 3: CREATE BASKET STUDIO */}
        {activeTab === 'create_studio' && (
          <CreateBasketStudio
            availableAssets={availableAssets}
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
                href="https://github.com/ShalyX/synthabasket"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-brand-primary"
              >
                GitHub
              </a>
            </nav>

            <div className="text-xs text-ink-tertiary md:text-right">
              <div className="font-medium text-ink-secondary">PreStocks + Tessera assets</div>
              <div className="mt-1">Pyth data · Jupiter execution · Meteora liquidity</div>
            </div>
          </div>
        </div>
      </footer>

      {/* Deep Inspector & Mint/Redeem Modal */}
      {selectedBasket && (
        <BasketDetailView
          basket={selectedBasket}
          initialTab={detailInitialTab}
          onClose={() => setSelectedBasket(null)}
          onExecuteMint={handleExecuteMint}
          onExecuteRedeem={handleExecuteRedeem}
        />
      )}

      {/* Transaction Lifecycle Runner Modal */}
      <TransactionLifecycleModal
        state={txLifecycle}
        onClose={() => setTxLifecycle((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Protocol Proof & Audits Modal */}
      {showProofModal && (
        <ProtocolProofModal onClose={() => router.push('/app')} />
      )}
    </main>
  );
}
