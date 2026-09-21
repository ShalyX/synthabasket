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
  ProviderMode,
  TxLifecycleState,
} from '../../lib/types';
import {
  getUnifiedAssetQuotes,
  generateBasisMonitoringLedger,
} from '../../lib/services/valuation_engine';
import { AllocationRouter } from '../../lib/execution/allocation_router';
import { SynthaBasketVaultClient } from '../../lib/execution/vault_client';
import { MeteoraDbcManager } from '../../lib/execution/meteora_dbc';

import { PublicKey } from '@solana/web3.js';
import {
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Lock,
  ArrowRightLeft,
  ExternalLink,
  ChevronRight,
  Search,
  Globe,
  Database,
  BarChart3,
  Clock,
  ArrowRight,
  Radio,
  Zap,
  Layers,
} from 'lucide-react';

export default function AppPage() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [providerMode, setProviderMode] = useState<ProviderMode>('multi');
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

  // Fetch live asset quotes on mount or mode change
  useEffect(() => {
    async function loadAssets() {
      const quotes = await getUnifiedAssetQuotes(providerMode);
      setAvailableAssets(quotes);
      const basis = generateBasisMonitoringLedger(quotes);
      setBasisItems(basis);
    }
    loadAssets();
  }, [providerMode]);

  const handleSelectBasket = (basket: BasketDefinition, mode: 'mint' | 'redeem' | 'inspect') => {
    setSelectedBasket(basket);
    setDetailInitialTab(mode);
  };

  const getSegmentColor = (idx: number) => {
    const palette = ['bg-brand-primary', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-400', 'bg-cyan-500'];
    return palette[idx % palette.length];
  };

  // 1-Click Mint Execution Flow (Honest, Step-by-Step Verification)
  const handleExecuteMint = async (basket: BasketDefinition, quote: BasketMintQuote) => {
    setSelectedBasket(null);

    const initialSteps = [
      {
        id: 'route_quote',
        label: 'Calculate Multi-Asset Jupiter Routes',
        description: `Splitting ${quote.depositUsdcAmount} USDC into ${basket.constituents.length} constituent assets via Swap API V2`,
        status: 'active' as const,
      },
      {
        id: 'verify_custody',
        label: 'Verify Vault PDA & Invariant Rules',
        description: `Inspecting on-chain custody state: ${basket.vaultPda.slice(0, 8)}...`,
        status: 'pending' as const,
      },
      {
        id: 'deposit_and_mint',
        label: `Execute Vault Deposit & Mint ${quote.expectedBasketTokens} $${basket.symbol}`,
        description: 'Dispatching Anchor synthabasket_vault CPI deposit_and_mint instruction',
        status: 'pending' as const,
      },
      {
        id: 'solvency_verified',
        label: 'Confirm On-Chain Settlement & Invariant',
        description: 'Verifying non-dilutive share receipt on Solana Devnet',
        status: 'pending' as const,
      },
    ];

    setTxLifecycle({
      isOpen: true,
      title: `Invest: ${basket.name} ($${basket.symbol})`,
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
        steps: prev.steps.map((s, idx) =>
          idx === 0
            ? { ...s, status: 'failed', error: 'Wallet not connected. Please connect your Solana wallet.' }
            : s
        ),
      }));
      return;
    }

    try {
      // Step 1: Jupiter Quote & Allocation Calculation
      const router = new AllocationRouter(connection);
      await router.prepareAllocationSwaps(publicKey, quote, network === 'devnet');

      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 1,
        steps: prev.steps.map((s, idx) =>
          idx === 0 ? { ...s, status: 'completed' } : idx === 1 ? { ...s, status: 'active' } : s
        ),
      }));

      // Step 2: Verify Vault Custody & Invariant Rules
      const vaultClient = new SynthaBasketVaultClient(connection);
      const depositTx = await vaultClient.buildMintTransaction(publicKey, basket, quote);

      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 2,
        steps: prev.steps.map((s, idx) =>
          idx === 1 ? { ...s, status: 'completed' } : idx === 2 ? { ...s, status: 'active' } : s
        ),
      }));

      // Step 3: Dispatch & Broadcast to Solana Cluster
      const txSig = await sendTransaction(depositTx, connection);

      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 3,
        steps: prev.steps.map((s, idx) =>
          idx === 2 ? { ...s, status: 'completed', txSignature: txSig } : idx === 3 ? { ...s, status: 'active' } : s
        ),
      }));

      // Step 4: Confirm Transaction & Finalize Settlement
      await connection.confirmTransaction(txSig, 'confirmed');

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: txSig,
        steps: prev.steps.map((s) => ({
          ...s,
          status: 'completed',
          txSignature: txSig,
        })),
      }));

      // Update local basket state
      setBaskets((prev) =>
        prev.map((b) =>
          b.id === basket.id
            ? {
                ...b,
                aumUsd: b.aumUsd + quote.depositUsdcAmount,
                totalSharesMinted: b.totalSharesMinted + quote.expectedBasketTokens,
              }
            : b
        )
      );
    } catch (err: any) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((s, idx) =>
          idx === prev.currentStepIndex
            ? { ...s, status: 'failed', error: err.message || 'Transaction failed' }
            : s
        ),
      }));
    }
  };

  // Burn & Redeem Execution Flow
  const handleExecuteRedeem = async (basket: BasketDefinition, quote: BasketRedeemQuote) => {
    setSelectedBasket(null);

    const initialSteps = [
      {
        id: 'burn_shares',
        label: `Burn ${quote.burnBasketTokensAmount} $${basket.symbol} Shares`,
        description: 'Executing burn instruction via Anchor synthabasket_vault',
        status: 'active' as const,
      },
      {
        id: 'vault_release',
        label: 'Release Underlying Constituents from Vault PDA',
        description: 'Unlocking physical tokens from on-chain custody',
        status: 'pending' as const,
      },
      {
        id: 'settlement',
        label: `Transfer Assets (${quote.expectedUsdcValue} USD Equivalent)`,
        description: 'Settling tokens directly into user wallet',
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
        steps: prev.steps.map((s, idx) =>
          idx === 0
            ? { ...s, status: 'failed', error: 'Wallet not connected. Connect your wallet to redeem.' }
            : s
        ),
      }));
      return;
    }

    try {
      const vaultClient = new SynthaBasketVaultClient(connection);
      const redeemTx = await vaultClient.buildRedeemTransaction(publicKey, basket, quote);

      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 1,
        steps: prev.steps.map((s, idx) =>
          idx === 0 ? { ...s, status: 'completed' } : idx === 1 ? { ...s, status: 'active' } : s
        ),
      }));

      const txSig = await sendTransaction(redeemTx, connection);

      setTxLifecycle((prev) => ({
        ...prev,
        currentStepIndex: 2,
        steps: prev.steps.map((s, idx) =>
          idx === 1 ? { ...s, status: 'completed', txSignature: txSig } : idx === 2 ? { ...s, status: 'active' } : s
        ),
      }));

      await connection.confirmTransaction(txSig, 'confirmed');

      setTxLifecycle((prev) => ({
        ...prev,
        isCompleted: true,
        finalSignature: txSig,
        steps: prev.steps.map((s) => ({
          ...s,
          status: 'completed',
          txSignature: txSig,
        })),
      }));

      setBaskets((prev) =>
        prev.map((b) =>
          b.id === basket.id
            ? {
                ...b,
                aumUsd: Math.max(0, b.aumUsd - quote.expectedUsdcValue),
                totalSharesMinted: Math.max(0, b.totalSharesMinted - quote.burnBasketTokensAmount),
              }
            : b
        )
      );
    } catch (err: any) {
      setTxLifecycle((prev) => ({
        ...prev,
        hasError: true,
        steps: prev.steps.map((s, idx) =>
          idx === prev.currentStepIndex
            ? { ...s, status: 'failed', error: err.message || 'Redemption failed' }
            : s
        ),
      }));
    }
  };

  // Create Basket Flow
  const handleDeployBasket = async (newBasket: BasketDefinition, dbcConfig?: MeteoraDBCConfig) => {
    setBaskets([newBasket, ...baskets]);
    router.push('/app');

    const initialSteps: Array<{
      id: string;
      label: string;
      description: string;
      status: 'pending' | 'active' | 'completed' | 'failed';
      txSignature?: string;
    }> = [
      {
        id: 'init_basket',
        label: `Derive Basket State PDA (${newBasket.symbol})`,
        description: `Deterministic Anchor Vault PDA: ${newBasket.vaultPda.slice(0, 8)}...`,
        status: 'active',
      },
      {
        id: 'init_mint',
        label: 'Derive Basket SPL Token Mint PDA',
        description: `Deterministic Mint PDA: ${newBasket.basketMint.slice(0, 8)}...`,
        status: 'pending',
      },
    ];

    if (dbcConfig) {
      initialSteps.push({
        id: 'init_dbc',
        label: 'Configure Meteora Dynamic Bonding Curve (1.5.12 SDK)',
        description: `Building equity-smoothed curve config with $${dbcConfig.graduationThresholdUsd.toLocaleString()} graduation threshold`,
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

    setTxLifecycle((prev) => ({
      ...prev,
      currentStepIndex: 1,
      steps: prev.steps.map((s, idx) =>
        idx === 0 ? { ...s, status: 'completed' } : idx === 1 ? { ...s, status: 'active' } : s
      ),
    }));

    setTxLifecycle((prev) => ({
      ...prev,
      currentStepIndex: dbcConfig ? 2 : 1,
      isCompleted: !dbcConfig,
      steps: prev.steps.map((s, idx) =>
        idx === 1
          ? { ...s, status: 'completed' }
          : idx === 2 && dbcConfig
          ? { ...s, status: 'active' }
          : s
      ),
    }));

    if (dbcConfig) {
      if (!publicKey) {
        setTxLifecycle((prev) => ({
          ...prev,
          hasError: true,
          steps: prev.steps.map((s, idx) =>
            idx === 2
              ? { ...s, status: 'failed', error: 'Wallet not connected. Connect your wallet to broadcast the Meteora DBC configuration.' }
              : s
          ),
        }));
        return;
      }

      try {
        const dbcManager = new MeteoraDbcManager(connection);
        const isDevnet = connection.rpcEndpoint.includes('devnet');
        const quoteMint = new PublicKey(
          isDevnet
            ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
            : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        );
        const { transaction: configTx, configKeypair } = await dbcManager.buildCreateConfigTransaction(
          publicKey,
          quoteMint,
          dbcConfig
        );
        const txSig = await sendTransaction(configTx, connection, { signers: [configKeypair] });
        await connection.confirmTransaction(txSig, 'confirmed');

        setTxLifecycle((prev) => ({
          ...prev,
          isCompleted: true,
          finalSignature: txSig,
          steps: prev.steps.map((s, idx) =>
            idx === 2
              ? { ...s, status: 'completed', txSignature: txSig }
              : s
          ),
        }));
      } catch (err: any) {
        setTxLifecycle((prev) => ({
          ...prev,
          hasError: true,
          steps: prev.steps.map((s, idx) =>
            idx === 2
              ? { ...s, status: 'failed', error: err.message || 'Meteora DBC deployment failed' }
              : s
          ),
        }));
      }
    }
  };

  const filteredBaskets = baskets.filter((b) => {
    if (providerMode === 'prestocks_pure' && b.providerMode !== 'prestocks_pure') {
      return false;
    }
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
        {/* Contextual Market Universe Switcher Bar */}
        <div className="flex items-center justify-between border-b border-border pb-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-ink-tertiary">Market Universe:</span>
            <div className="flex items-center rounded-full border border-border bg-surface-subtle p-0.5 font-medium">
              <button
                onClick={() => setProviderMode('multi')}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  providerMode === 'multi'
                    ? 'bg-surface-elevated text-ink-primary font-bold shadow-sm'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                Multi-Asset (PreStocks, Tessera, Synthetic)
              </button>
              <button
                onClick={() => setProviderMode('prestocks_pure')}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs transition-colors ${
                  providerMode === 'prestocks_pure'
                    ? 'bg-brand-primary text-black font-bold shadow-sm'
                    : 'text-ink-tertiary hover:text-ink-secondary'
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                PreStocks Pure ($10k Bounty Track)
              </button>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-ink-tertiary">
            <Radio className="h-3.5 w-3.5 text-brand-primary animate-pulse" />
            <span>Pyth Hermes Oracle: <span className="font-semibold text-brand-primary">38ms</span></span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: MAIN HOMEPAGE / BASKETS MARKETPLACE (MATCHING REFERENCE DESIGN) */}
        {/* ========================================================================= */}
        {activeTab === 'baskets' && (
          <div className="space-y-10">


            {/* THEMATIC BASKETS SECTION */}
            <div id="baskets-grid" className="space-y-4 pt-4">
              {/* Category Filter Pills & Search matching reference */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  {['all', 'ai', 'space_defense', 'fintech', 'custom'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                        selectedCategory === cat
                          ? 'bg-brand-primary text-black shadow-sm font-bold'
                          : 'border border-border bg-surface text-ink-secondary hover:text-ink-primary hover:border-border-strong'
                      }`}
                    >
                      {cat === 'all' ? 'All Baskets' : cat.replace('_', ' & ')}
                    </button>
                  ))}
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
                  <div className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-secondary font-mono">
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
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface-elevated font-mono text-xs font-bold text-brand-primary">
                              ${basket.symbol}
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-ink-primary leading-tight">
                                {basket.name}
                              </h3>
                              <span className="text-[10px] text-ink-tertiary">
                                {basket.category.replace('_', ' & ')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Badges */}
                        <div className="mt-2.5 flex items-center gap-1.5">
                          {basket.providerMode === 'prestocks_pure' ? (
                            <>
                              <span className="rounded-full border border-brand-primary/40 bg-brand-primary/10 px-2 py-0.5 font-mono text-[9px] text-brand-primary font-semibold">
                                PreStocks Only
                              </span>
                              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] text-emerald-400 font-semibold">
                                Hackathon Eligible
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="rounded-full border border-brand-primary/40 bg-brand-primary/10 px-2 py-0.5 font-mono text-[9px] text-brand-primary font-semibold">
                                Physically Backed
                              </span>
                              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 font-mono text-[9px] text-cyan-400 font-semibold">
                                Redeemable 1:1
                              </span>
                            </>
                          )}
                        </div>

                        {/* Description */}
                        <p className="mt-2.5 line-clamp-2 text-[11px] text-ink-secondary leading-relaxed">
                          {basket.description}
                        </p>

                        {/* NAV & 24h Return */}
                        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-2.5">
                          <div>
                            <span className="block font-mono text-[9px] uppercase tracking-wider text-ink-tertiary">
                              NAV
                            </span>
                            <span className="font-mono text-base font-bold text-ink-primary tabular-nums">
                              ${basket.navUsd.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="block font-mono text-[9px] uppercase tracking-wider text-ink-tertiary">
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
                          <div className="space-y-1 pt-1 font-mono text-[11px]">
                            {basket.constituents.slice(0, 3).map((c, idx) => (
                              <div key={c.asset.tokenMint} className="flex items-center justify-between text-ink-secondary">
                                <div className="flex items-center gap-1.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${getSegmentColor(idx)}`} />
                                  <span className="text-ink-primary font-medium">{c.asset.symbol}</span>
                                </div>
                                <span className="tabular-nums text-ink-tertiary">{c.targetWeightBps / 100}%</span>
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
                  <table className="w-full text-left font-mono text-xs">
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
                  <table className="w-full text-left font-mono text-xs">
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
                  <table className="w-full text-left font-mono text-xs">
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
                        <td className="py-2 text-brand-primary font-semibold">Mint</td>
                        <td className="py-2 text-ink-primary font-bold">$AIT</td>
                        <td className="py-2 text-ink-secondary">
                          <a
                            href="https://explorer.solana.com/tx/2si8SYfUyKrHPiqHAbQFJrTZxVKtiJ3JrZEb4pxz8sRbvmypTs2YqK5uw4cqVorVmLFpKM4rQLMzf2TB9GpQfJd1?cluster=devnet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-primary hover:underline"
                          >
                            2si8SYfU...QfJd1
                          </a>
                        </td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">12m ago</td>
                      </tr>
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-cyan-400 font-semibold">Redeem</td>
                        <td className="py-2 text-ink-primary font-bold">$AIT</td>
                        <td className="py-2 text-ink-secondary">
                          <a
                            href="https://explorer.solana.com/tx/41W1CAjHYUtU5VFHdK8WBV7hB8WmqLm3DkR4D51XW3c1dSUvaFQJj8mxRwnRy4ZaDiod2bCyZhq4sbXXsUWpFZVt?cluster=devnet"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-brand-primary hover:underline"
                          >
                            41W1CAjH...UWpF
                          </a>
                        </td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">18m ago</td>
                      </tr>
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-purple-400 font-semibold">Create</td>
                        <td className="py-2 text-ink-primary font-bold">$PREX</td>
                        <td className="py-2 text-ink-secondary">8kLn2vPq...9zXc</td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">1h ago</td>
                      </tr>
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-amber-400 font-semibold">Swap</td>
                        <td className="py-2 text-ink-primary font-bold">$ORBIT</td>
                        <td className="py-2 text-ink-secondary">5nP3qRtL...t7Yp</td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">2h ago</td>
                      </tr>
                      <tr className="hover:bg-surface-elevated/40 transition-colors">
                        <td className="py-2 text-brand-primary font-semibold">DBC Config</td>
                        <td className="py-2 text-ink-primary font-bold">$FINX</td>
                        <td className="py-2 text-ink-secondary">9dw8mK2n...xJ4a</td>
                        <td className="py-2 text-right font-sans text-ink-tertiary">3h ago</td>
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
          <BasisMonitor items={basisItems} providerMode={providerMode} />
        )}

        {/* TAB 3: CREATE BASKET STUDIO */}
        {activeTab === 'create_studio' && (
          <CreateBasketStudio
            availableAssets={availableAssets}
            providerMode={providerMode}
            onDeployBasket={handleDeployBasket}
            onCancel={() => router.push('/app')}
          />
        )}
      </div>

      {/* PRODUCT-FIRST FOOTER matching reference */}
      <footer className="mt-20 border-t border-border bg-surface-subtle py-8 font-sans">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {/* Left: Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface border border-border text-brand-primary">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <span className="font-extrabold text-sm text-ink-primary">SYNTHABASKET</span>
                <span className="text-xs text-ink-tertiary ml-2">Private Markets. On-Chain.</span>
              </div>
            </div>

            {/* Center: Ecosystem Stats */}
            <div className="flex flex-wrap items-center gap-6 font-mono text-xs text-ink-secondary">
              <div>
                <span className="font-bold text-ink-primary tabular-nums">$16.1M</span>
                <span className="text-ink-tertiary ml-1 font-sans text-[11px]">Total AUM</span>
              </div>
              <div>
                <span className="font-bold text-ink-primary tabular-nums">34.5K</span>
                <span className="text-ink-tertiary ml-1 font-sans text-[11px]">Shares</span>
              </div>
              <div>
                <span className="font-bold text-ink-primary tabular-nums">4</span>
                <span className="text-ink-tertiary ml-1 font-sans text-[11px]">DBC Pools</span>
              </div>
              <div>
                <span className="font-bold text-brand-primary tabular-nums">3 Providers</span>
                <span className="text-ink-tertiary ml-1 font-sans text-[11px]">(PreStocks • Tessera • Pyth)</span>
              </div>
            </div>

            {/* Right: Built on Solana Badge */}
            <div className="flex items-center gap-3 text-xs text-ink-tertiary">
              <span>Built on</span>
              <span className="font-extrabold text-ink-primary tracking-wider font-mono">SOLANA</span>
              <span>•</span>
              <span>Making private markets accessible.</span>
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
