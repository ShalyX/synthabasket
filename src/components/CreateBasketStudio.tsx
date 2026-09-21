'use client';

import React, { useState } from 'react';
import {
  Sliders,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  ShieldCheck,
  BarChart2,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { AssetQuote, BasketDefinition, MeteoraDBCConfig, ProviderMode } from '../lib/types';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { SynthaBasketVaultClient } from '../lib/execution/vault_client';
import { MeteoraDbcManager } from '../lib/execution/meteora_dbc';

interface CreateBasketStudioProps {
  availableAssets: AssetQuote[];
  providerMode: ProviderMode;
  onDeployBasket: (newBasket: BasketDefinition, dbcConfig?: MeteoraDBCConfig) => void;
  onCancel: () => void;
}

export const CreateBasketStudio: React.FC<CreateBasketStudioProps> = ({
  availableAssets,
  providerMode,
  onDeployBasket,
  onCancel,
}) => {
  const [basketName, setBasketName] = useState('');
  const [basketSymbol, setBasketSymbol] = useState('');
  const [basketDescription, setBasketDescription] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<Array<{ asset: AssetQuote; weightPct: number }>>([]);
  const [indexMethodology, setIndexMethodology] = useState<'Custom' | 'Equal-Weight' | 'Market-Cap'>('Custom');
  const [enableMeteoraDbc, setEnableMeteoraDbc] = useState(true);
  const [feeBps, setFeeBps] = useState(25); // 0.25%
  const [graduationThresholdUsd, setGraduationThresholdUsd] = useState(2_000_000);

  const filteredAvailable = availableAssets.filter((a) =>
    providerMode === 'prestocks_pure' ? a.provider === 'prestocks' : true
  );

  const totalWeight = selectedAssets.reduce((sum, item) => sum + item.weightPct, 0);
  const isValidWeight = Math.abs(totalWeight - 100) < 0.01;
  const isMetadataValid = basketName.trim().length > 0 && basketSymbol.trim().length > 0;

  // Strict linear step progression state machine:
  // Step 1: Assets Selection
  // Step 2: Weight Balancing
  // Step 3: Token Parameters
  // Step 4: Liquidity Configuration
  // Step 5: Review & Deploy
  let currentStep = 1;
  if (selectedAssets.length > 0) currentStep = 2;
  if (selectedAssets.length > 0 && isValidWeight) currentStep = 3;
  if (selectedAssets.length > 0 && isValidWeight && isMetadataValid) currentStep = 4;

  const steps = [
    { id: 1, label: '1. Select Assets' },
    { id: 2, label: '2. Calibrate Weights' },
    { id: 3, label: '3. Token Parameters' },
    { id: 4, label: '4. Liquidity & DBC' },
    { id: 5, label: '5. Deploy on Solana' },
  ];

  const handleAddAsset = (asset: AssetQuote) => {
    if (selectedAssets.some((item) => item.asset.tokenMint === asset.tokenMint)) return;
    const remainingWeight = Math.max(0, 100 - totalWeight);
    const newItems = [...selectedAssets, { asset, weightPct: remainingWeight || 10 }];
    setSelectedAssets(newItems);
  };

  const handleRemoveAsset = (mint: string) => {
    setSelectedAssets(selectedAssets.filter((item) => item.asset.tokenMint !== mint));
  };

  const handleWeightChange = (mint: string, weight: number) => {
    setSelectedAssets(
      selectedAssets.map((item) =>
        item.asset.tokenMint === mint ? { ...item, weightPct: weight } : item
      )
    );
  };

  const handleEqualWeights = () => {
    if (selectedAssets.length === 0) return;
    const equalShare = Number((100 / selectedAssets.length).toFixed(1));
    setSelectedAssets(
      selectedAssets.map((item, idx) => ({
        ...item,
        weightPct: idx === selectedAssets.length - 1 ? 100 - equalShare * (selectedAssets.length - 1) : equalShare,
      }))
    );
    setIndexMethodology('Equal-Weight');
  };

  const getSegmentColor = (idx: number) => {
    const palette = ['bg-brand-primary', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-emerald-400', 'bg-cyan-500'];
    return palette[idx % palette.length];
  };

  const previewNav = selectedAssets.reduce((nav, item) => {
    return nav + item.asset.priceUsd * (item.weightPct / 100);
  }, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidWeight || selectedAssets.length === 0 || !basketName || !basketSymbol) return;

    const vaultClient = new SynthaBasketVaultClient(new Connection('https://api.devnet.solana.com'));
    const [basketPda] = vaultClient.getBasketPda(basketSymbol);
    const [basketMintPda] = vaultClient.getBasketMintPda(basketSymbol);

    let dbcPoolAddress: string | undefined;
    if (enableMeteoraDbc) {
      const dbcManager = new MeteoraDbcManager(new Connection('https://api.devnet.solana.com'));
      const quoteMint = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
      const dummyConfig = Keypair.generate().publicKey;
      const [poolPda] = dbcManager.getPoolPda(basketMintPda, quoteMint, dummyConfig);
      dbcPoolAddress = poolPda.toBase58();
    }

    const newBasket: BasketDefinition = {
      id: basketSymbol.toLowerCase(),
      name: basketName,
      symbol: basketSymbol.toUpperCase(),
      description: basketDescription || 'Curated pre-IPO thematic index basket on Solana.',
      category: 'custom',
      providerMode: providerMode,
      navUsd: Number(previewNav.toFixed(2)),
      navChange24h: 0.0,
      aumUsd: 100_000,
      totalSharesMinted: Math.floor(100_000 / (previewNav || 100)),
      vaultPda: basketPda.toBase58(),
      basketMint: basketMintPda.toBase58(),
      meteoraGraduated: false,
      meteoraDbcPoolAddress: dbcPoolAddress,
      createdAt: Date.now(),
      constituents: selectedAssets.map((item) => ({
        asset: item.asset,
        targetWeightBps: Math.round(item.weightPct * 100),
      })),
    };

    const dbcConfig: MeteoraDBCConfig | undefined = enableMeteoraDbc
      ? {
          curveType: 'equity_smoothed',
          initialPriceUsd: Number(previewNav.toFixed(2)),
          graduationThresholdUsd: graduationThresholdUsd,
          feeBps: feeBps,
          quoteToken: 'USDC',
        }
      : undefined;

    onDeployBasket(newBasket, dbcConfig);
  };

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm font-sans overflow-hidden">
      {/* Studio Header */}
      <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between bg-surface-subtle">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-strong bg-surface text-brand-primary">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold uppercase tracking-wider text-ink-primary">
                Create Basket Studio
              </h2>
              <span className="rounded bg-brand-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-brand-primary font-bold border border-brand-primary/30">
                WIZARD
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-secondary">
              Curate thematic pre-IPO assets, balance target weights, and deploy an Anchor Vault PDA with optional Meteora DBC liquidity.
            </p>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="self-start sm:self-center rounded-lg border border-border bg-surface px-4 py-1.5 text-xs text-ink-secondary hover:border-border-strong hover:text-ink-primary transition-colors font-medium"
        >
          Cancel
        </button>
      </div>

      {/* Strict Linear Progression Rail: completed ✓, current highlighted, future muted */}
      <div className="border-b border-border bg-surface px-6 py-3.5 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[650px] font-mono text-xs">
          {steps.map((step, idx) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const isFuture = step.id > currentStep;

            return (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isCompleted
                        ? 'bg-brand-primary text-black'
                        : isCurrent
                        ? 'border-2 border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border border-border bg-surface-subtle text-ink-tertiary opacity-50'
                    }`}
                  >
                    {isCompleted ? '✓' : step.id}
                  </span>
                  <span
                    className={`font-semibold ${
                      isCompleted
                        ? 'text-brand-primary'
                        : isCurrent
                        ? 'text-ink-primary'
                        : 'text-ink-tertiary opacity-50'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-3 rounded-full transition-colors ${
                      isCompleted ? 'bg-brand-primary' : 'bg-border'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 2-Column Layout: Left Form, Right Live Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.85fr] divide-y lg:divide-y-0 lg:divide-x divide-border">
          {/* Left Column: Form Controls */}
          <div className="p-6 space-y-6">
            {/* Step 1: Asset Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-ink-primary font-bold flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary/15 text-[10px] font-bold text-brand-primary">1</span>
                  Select Underlying Assets ({selectedAssets.length} Selected)
                </label>
                {selectedAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEqualWeights}
                    className="text-xs text-brand-primary hover:underline font-medium"
                  >
                    Equalize Weights
                  </button>
                )}
              </div>

              {/* Asset Pills Available */}
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-subtle p-3">
                {filteredAvailable.map((asset) => {
                  const isSelected = selectedAssets.some((item) => item.asset.tokenMint === asset.tokenMint);
                  return (
                    <button
                      type="button"
                      key={asset.tokenMint}
                      onClick={() => handleAddAsset(asset)}
                      disabled={isSelected}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors ${
                        isSelected
                          ? 'border border-border-subtle bg-surface-elevated text-ink-disabled opacity-50 cursor-not-allowed'
                          : 'border border-border bg-surface text-ink-primary hover:border-brand-primary'
                      }`}
                    >
                      <Plus className="h-3 w-3 text-ink-tertiary" />
                      <span className="font-bold">{asset.symbol}</span>
                      <span className="text-ink-tertiary tabular-nums">${asset.priceUsd.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Assets Table */}
              {selectedAssets.length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="overflow-hidden rounded-lg border border-border bg-surface">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="border-b border-border bg-surface-subtle text-[10px] uppercase tracking-wider text-ink-tertiary font-sans">
                        <tr>
                          <th className="px-3.5 py-2">Constituent</th>
                          <th className="px-3.5 py-2 text-right">Oracle Price</th>
                          <th className="px-3.5 py-2 text-right">Target Weight</th>
                          <th className="px-3.5 py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle text-[11px]">
                        {selectedAssets.map((item, idx) => (
                          <tr key={item.asset.tokenMint} className="hover:bg-surface-elevated/40 transition-colors">
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${getSegmentColor(idx)}`} />
                                <span className="font-bold text-ink-primary">{item.asset.symbol}</span>
                                <span className="text-ink-tertiary font-sans text-[10px]">{item.asset.name}</span>
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                              ${item.asset.priceUsd.toFixed(2)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={item.weightPct}
                                  onChange={(e) => handleWeightChange(item.asset.tokenMint, Number(e.target.value))}
                                  className="w-16 rounded border border-border bg-surface-subtle px-2 py-1 font-mono text-xs text-right text-ink-primary focus:border-brand-primary focus:outline-none tabular-nums"
                                />
                                <span className="text-ink-tertiary">%</span>
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveAsset(item.asset.tokenMint)}
                                className="text-ink-tertiary hover:text-semantic-negative transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Weight Balance Indicator */}
                  <div
                    className={`flex items-center justify-between rounded-lg border p-3 font-mono text-xs ${
                      isValidWeight
                        ? 'border-brand-primary/40 bg-brand-primary/5 text-brand-primary'
                        : 'border-brand-warning/40 bg-brand-warning/5 text-brand-warning'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isValidWeight ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      <span>
                        Total Weight: <span className="font-bold tabular-nums">{totalWeight.toFixed(1)}%</span>{' '}
                        {isValidWeight ? '(Balanced 100%)' : '(Must sum to exactly 100%)'}
                      </span>
                    </div>
                    <div>Live NAV: <span className="font-bold tabular-nums">${previewNav.toFixed(2)}</span></div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 2: Metadata */}
            <div className="border-t border-border pt-5 space-y-4">
              <label className="text-xs uppercase tracking-wider text-ink-primary font-bold flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary/15 text-[10px] font-bold text-brand-primary">2</span>
                Index Metadata &amp; Ticker
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                    Index Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Next-Gen Cloud Pioneers"
                    value={basketName}
                    onChange={(e) => setBasketName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-ink-primary placeholder:text-ink-disabled focus:border-brand-primary focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                    Symbol (Ticker)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. CLOUD"
                    value={basketSymbol}
                    onChange={(e) => setBasketSymbol(e.target.value.toUpperCase())}
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 font-mono text-xs font-bold uppercase text-ink-primary placeholder:text-ink-disabled focus:border-brand-primary focus:outline-none transition-colors"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                    Investment Thesis
                  </label>
                  <input
                    type="text"
                    placeholder="Thesis summary or sector focus..."
                    value={basketDescription}
                    onChange={(e) => setBasketDescription(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-ink-primary placeholder:text-ink-disabled focus:border-brand-primary focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Meteora DBC Secondary Liquidity */}
            <div className="rounded-lg border border-border bg-surface-subtle p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-solana-purple" />
                  <span className="font-bold text-xs text-ink-primary">Meteora DBC Secondary Liquidity</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableMeteoraDbc}
                    onChange={(e) => setEnableMeteoraDbc(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-surface-elevated border border-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-primary"></div>
                </label>
              </div>
              <p className="text-ink-secondary text-[11px] leading-relaxed">
                Initializes a Dynamic Bonding Curve on Meteora for secondary trading. Once market cap reaches $2,000,000, liquidity automatically migrates to DAMM v2.
              </p>
            </div>
          </div>

          {/* Right Column: Live Basket Preview Sidebar */}
          <div className="p-6 bg-surface-subtle flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-primary">
                  Live Basket Preview
                </span>
                <span className="font-mono text-xs font-bold text-brand-primary">
                  ${basketSymbol || 'INDEX'}
                </span>
              </div>

              {/* Metric Breakdown */}
              <div className="space-y-2.5 rounded-lg border border-border bg-surface p-4 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-tertiary font-sans">Estimated Inception NAV:</span>
                  <span className="font-bold text-ink-primary tabular-nums">${previewNav.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-tertiary font-sans">Constituents Count:</span>
                  <span className="font-semibold text-ink-primary tabular-nums">{selectedAssets.length} assets</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-tertiary font-sans">Weight Method:</span>
                  <span className="text-ink-secondary font-sans">{indexMethodology}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-tertiary font-sans">Vault Custody:</span>
                  <span className="font-semibold text-brand-primary">Deterministic PDA</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-tertiary font-sans">Meteora DBC 1.5.12:</span>
                  <span className={enableMeteoraDbc ? 'text-brand-primary font-semibold' : 'text-ink-tertiary'}>
                    {enableMeteoraDbc ? 'Enabled ($2M Cap)' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Real-time Segmented Composition Bar */}
              {selectedAssets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-ink-tertiary font-sans">
                    <span className="font-medium">Portfolio Weights</span>
                    <span className="font-mono text-[10px] text-brand-primary">{totalWeight.toFixed(1)}%</span>
                  </div>

                  <div className="flex h-2.5 w-full overflow-hidden rounded bg-surface-elevated">
                    {selectedAssets.map((item, idx) => (
                      <div
                        key={item.asset.tokenMint}
                        style={{ width: `${item.weightPct}%` }}
                        className={`${getSegmentColor(idx)} h-full transition-all`}
                        title={`${item.asset.symbol}: ${item.weightPct}%`}
                      />
                    ))}
                  </div>

                  <div className="space-y-1.5 font-mono text-xs pt-1">
                    {selectedAssets.map((item, idx) => (
                      <div key={item.asset.tokenMint} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${getSegmentColor(idx)}`} />
                          <span className="font-semibold text-ink-primary">{item.asset.symbol}</span>
                        </div>
                        <span className="text-ink-tertiary tabular-nums font-semibold">{item.weightPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Solvency Invariant Note */}
              <div className="rounded-lg border border-border bg-surface p-3 text-xs flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-brand-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-ink-secondary leading-relaxed">
                  100% physically backed on Solana. Shares are minted in strict adherence to the non-dilutive mathematical invariant.
                </p>
              </div>
            </div>

            {/* Deploy Action */}
            <button
              type="submit"
              disabled={!isValidWeight || selectedAssets.length === 0 || !basketName || !basketSymbol}
              className="w-full rounded-lg border border-brand-primary/40 bg-brand-primary py-3 text-xs font-bold uppercase tracking-wider text-black transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-35 shadow-sm font-sans"
            >
              Deploy Basket Vault &amp; Mint
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
