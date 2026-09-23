'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Database,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AssetQuote, BasketCreationDraft } from '../lib/types';

interface CreateBasketStudioProps {
  availableAssets: AssetQuote[];
  marketplaceStatus: 'loading' | 'ready' | 'error';
  registryReady: boolean;
  onDeployBasket: (draft: BasketCreationDraft) => void;
  onCancel: () => void;
}

interface SelectedAsset {
  asset: AssetQuote;
  weightPct: number;
}

const MAX_CONSTITUENTS = 8;

function providerLabel(asset: AssetQuote): string {
  return asset.provider === 'prestocks' ? 'PreStocks' : 'Tessera';
}

export const CreateBasketStudio: React.FC<CreateBasketStudioProps> = ({
  availableAssets,
  marketplaceStatus,
  registryReady,
  onDeployBasket,
  onCancel,
}) => {
  const [basketName, setBasketName] = useState('');
  const [basketSymbol, setBasketSymbol] = useState('');
  const [basketDescription, setBasketDescription] = useState('');
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [indexMethodology, setIndexMethodology] = useState<'Custom' | 'Equal-Weight'>(
    'Custom'
  );

  const normalizedSymbol = basketSymbol.trim().toUpperCase();
  const nameValid = basketName.trim().length > 0 && basketName.trim().length <= 32;
  const symbolValid = /^[A-Z0-9]{1,10}$/.test(normalizedSymbol);

  const weightedAssets = useMemo(
    () =>
      selectedAssets.map((item) => ({
        ...item,
        targetWeightBps: Math.round(item.weightPct * 100),
      })),
    [selectedAssets]
  );

  const totalWeightBps = weightedAssets.reduce(
    (sum, item) => sum + item.targetWeightBps,
    0
  );
  const totalWeightPct = totalWeightBps / 100;
  const weightsPositive = weightedAssets.every(
    (item) => item.targetWeightBps > 0 && item.targetWeightBps <= 10_000
  );
  const isValidWeight =
    selectedAssets.length > 0 && totalWeightBps === 10_000 && weightsPositive;

  const previewNav = weightedAssets.reduce(
    (nav, item) =>
      nav + item.asset.priceUsd * (item.targetWeightBps / 10_000),
    0
  );

  const marketDataSource = useMemo(() => {
    if (selectedAssets.length === 0) return '—';
    const sources = new Set(
      selectedAssets.map((item) => item.asset.quoteSource || 'snapshot')
    );
    if (sources.size === 1) {
      if (sources.has('live')) return 'Live provider marks';
      if (sources.has('last_live')) return 'Last live provider marks';
      return 'Verified snapshots';
    }
    return 'Mixed provider freshness';
  }, [selectedAssets]);

  const currentStep =
    selectedAssets.length === 0
      ? 1
      : !isValidWeight
      ? 2
      : !nameValid || !symbolValid
      ? 3
      : 4;

  const steps = [
    { id: 1, label: 'Select Assets' },
    { id: 2, label: 'Set Weights' },
    { id: 3, label: 'Basket Details' },
    { id: 4, label: 'Review & Deploy' },
  ];

  const executionReady = selectedAssets.every(
    (item) => Boolean(item.asset.devnetMint)
  );

  const canDeploy =
    marketplaceStatus === 'ready' &&
    registryReady &&
    selectedAssets.length > 0 &&
    selectedAssets.length <= MAX_CONSTITUENTS &&
    executionReady &&
    isValidWeight &&
    nameValid &&
    symbolValid;

  const handleAddAsset = (asset: AssetQuote) => {
    if (!asset.devnetMint) return;
    if (selectedAssets.length >= MAX_CONSTITUENTS) return;
    if (
      selectedAssets.some(
        (item) => item.asset.tokenMint === asset.tokenMint
      )
    ) {
      return;
    }

    const remainingBps = Math.max(0, 10_000 - totalWeightBps);
    const weightPct =
      selectedAssets.length === 0
        ? 100
        : remainingBps > 0
        ? remainingBps / 100
        : 10;

    setSelectedAssets((items) => [...items, { asset, weightPct }]);
    setIndexMethodology('Custom');
  };

  const handleRemoveAsset = (mint: string) => {
    setSelectedAssets((items) =>
      items.filter((item) => item.asset.tokenMint !== mint)
    );
    setIndexMethodology('Custom');
  };

  const handleWeightChange = (mint: string, value: number) => {
    const weight = Number.isFinite(value)
      ? Math.min(100, Math.max(0, value))
      : 0;

    setSelectedAssets((items) =>
      items.map((item) =>
        item.asset.tokenMint === mint
          ? { ...item, weightPct: weight }
          : item
      )
    );
    setIndexMethodology('Custom');
  };

  const handleEqualWeights = () => {
    if (selectedAssets.length === 0) return;

    const baseBps = Math.floor(10_000 / selectedAssets.length);
    const remainder = 10_000 - baseBps * selectedAssets.length;

    setSelectedAssets((items) =>
      items.map((item, index) => ({
        ...item,
        weightPct: (baseBps + (index < remainder ? 1 : 0)) / 100,
      }))
    );
    setIndexMethodology('Equal-Weight');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canDeploy) return;

    const draft: BasketCreationDraft = {
      name: basketName.trim(),
      symbol: normalizedSymbol,
      description:
        basketDescription.trim() ||
        'Community-created private-market basket on Solana.',
      constituents: weightedAssets.map((item) => ({
        asset: item.asset,
        targetWeightBps: item.targetWeightBps,
      })),
      indicativeNavUsd: Number(previewNav.toFixed(2)),
    };

    onDeployBasket(draft);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              Basket Studio
            </span>
            <span className="rounded-full border border-brand-primary/25 bg-brand-primary/5 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-primary">
              Devnet
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-primary sm:text-3xl">
            Create a basket
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
            Choose the companies, set the target mix, and define the basket identity.
            Deployment creates the on-chain basket state and an empty share mint;
            investor shares are only created later against deposited assets.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="w-fit rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="space-y-5">
            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/10 font-mono text-[11px] font-bold text-brand-primary">
                      1
                    </span>
                    <h2 className="text-base font-bold text-ink-primary">
                      Choose constituents
                    </h2>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
                    Pick up to {MAX_CONSTITUENTS} supported private-market assets.
                    Provider marks are used only for the indicative target NAV.
                  </p>
                </div>

                <span className="w-fit rounded-full border border-border bg-surface-subtle px-3 py-1 font-mono text-[10px] text-ink-tertiary">
                  {selectedAssets.length}/{MAX_CONSTITUENTS} selected
                </span>
              </div>

              <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {marketplaceStatus === 'loading' && (
                  <div className="col-span-full rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-ink-tertiary">
                    Loading supported provider assets…
                  </div>
                )}

                {marketplaceStatus === 'error' && (
                  <div className="col-span-full flex items-start gap-2 rounded-xl border border-semantic-negative/30 bg-semantic-negative/5 px-4 py-3 text-sm text-semantic-negative">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    Market assets are unavailable, so basket creation is paused.
                  </div>
                )}

                {marketplaceStatus === 'ready' &&
                  availableAssets.map((asset) => {
                    const selected = selectedAssets.some(
                      (item) => item.asset.tokenMint === asset.tokenMint
                    );
                    const atLimit =
                      selectedAssets.length >= MAX_CONSTITUENTS && !selected;
                    const executionUnavailable = !asset.devnetMint;

                    return (
                      <button
                        type="button"
                        key={asset.tokenMint}
                        onClick={() => handleAddAsset(asset)}
                        disabled={selected || atLimit || executionUnavailable}
                        className={`group rounded-xl border p-3.5 text-left transition-all ${
                          selected
                            ? 'border-brand-primary/35 bg-brand-primary/5'
                            : atLimit || executionUnavailable
                            ? 'cursor-not-allowed border-border bg-surface-subtle opacity-45'
                            : 'border-border bg-surface-subtle hover:border-border-strong hover:bg-surface-elevated'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold text-ink-primary">
                                {asset.symbol}
                              </span>
                              {selected && (
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-primary text-black">
                                  <Check className="h-2.5 w-2.5" />
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-ink-tertiary">
                              {asset.name}
                            </p>
                          </div>
                          {!selected && !atLimit && !executionUnavailable && (
                            <Plus className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary transition-colors group-hover:text-brand-primary" />
                          )}
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="font-mono text-sm font-semibold tabular-nums text-ink-primary">
                              {'$'}{asset.priceUsd.toFixed(2)}
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink-tertiary">
                              {executionUnavailable
                                ? 'Devnet execution unavailable'
                                : providerLabel(asset)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                              asset.quoteSource === 'live'
                                ? 'bg-brand-primary/10 text-brand-primary'
                                : 'bg-brand-warning/10 text-brand-warning'
                            }`}
                          >
                            {asset.quoteSource === 'live' ? 'Live' : 'Snapshot'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>

              {selectedAssets.length >= MAX_CONSTITUENTS && (
                <p className="mt-3 text-xs text-ink-tertiary">
                  Maximum reached. The on-chain basket program supports eight constituents.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/10 font-mono text-[11px] font-bold text-brand-primary">
                      2
                    </span>
                    <h2 className="text-base font-bold text-ink-primary">
                      Set the target mix
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink-secondary">
                    Weights must add up to exactly 100%.
                  </p>
                </div>

                {selectedAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEqualWeights}
                    className="w-fit rounded-full border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors hover:border-brand-primary hover:text-brand-primary"
                  >
                    Equal weight
                  </button>
                )}
              </div>

              {selectedAssets.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-border px-5 py-10 text-center">
                  <p className="text-sm font-medium text-ink-secondary">
                    No constituents selected yet
                  </p>
                  <p className="mt-1 text-xs text-ink-tertiary">
                    Choose assets above and they’ll appear here for weighting.
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-2.5">
                  {selectedAssets.map((item) => (
                    <div
                      key={item.asset.tokenMint}
                      className="flex flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-ink-primary">
                            {item.asset.symbol}
                          </span>
                          <span className="text-xs text-ink-tertiary">
                            {item.asset.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-ink-tertiary">
                          {providerLabel(item.asset)} · {item.asset.quoteSource === 'live' ? 'live mark' : 'snapshot'} · {'$'}{item.asset.priceUsd.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-border bg-surface px-2.5 py-2">
                          <input
                            type="number"
                            min="0.01"
                            max="100"
                            step="0.01"
                            value={item.weightPct}
                            onChange={(event) =>
                              handleWeightChange(
                                item.asset.tokenMint,
                                Number(event.target.value)
                              )
                            }
                            className="w-20 bg-transparent text-right font-mono text-sm font-semibold tabular-nums text-ink-primary outline-none"
                          />
                          <span className="ml-1 text-xs text-ink-tertiary">%</span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Remove ${item.asset.symbol}`}
                          onClick={() => handleRemoveAsset(item.asset.tokenMint)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-ink-tertiary transition-colors hover:border-semantic-negative/40 hover:text-semantic-negative"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div
                    className={`mt-4 flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                      isValidWeight
                        ? 'border-brand-primary/30 bg-brand-primary/5'
                        : 'border-brand-warning/30 bg-brand-warning/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isValidWeight ? (
                        <Check className="h-4 w-4 text-brand-primary" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-brand-warning" />
                      )}
                      <span
                        className={`text-sm font-semibold ${
                          isValidWeight ? 'text-brand-primary' : 'text-brand-warning'
                        }`}
                      >
                        {totalWeightPct.toFixed(2)}% allocated
                      </span>
                    </div>
                    <span className="font-mono text-xs text-ink-tertiary">
                      {totalWeightBps.toLocaleString()} / 10,000 bps
                    </span>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/10 font-mono text-[11px] font-bold text-brand-primary">
                  3
                </span>
                <h2 className="text-base font-bold text-ink-primary">
                  Name the basket
                </h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">
                Keep the public identity simple. The ticker is also used to derive the Devnet basket addresses.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink-secondary">
                      Basket name
                    </label>
                    <span className="font-mono text-[10px] text-ink-tertiary">
                      {basketName.length}/32
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="Next-Gen Cloud Pioneers"
                    value={basketName}
                    onChange={(event) => setBasketName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-3.5 py-3 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-disabled focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-ink-secondary">
                    Ticker
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="CLOUD"
                    value={basketSymbol}
                    onChange={(event) =>
                      setBasketSymbol(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-border bg-surface-subtle px-3.5 py-3 font-mono text-sm font-bold uppercase text-ink-primary outline-none transition-colors placeholder:text-ink-disabled focus:border-brand-primary"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-ink-secondary">
                    Investment thesis <span className="font-normal text-ink-tertiary">(optional)</span>
                  </label>
                  <textarea
                    maxLength={280}
                    rows={3}
                    placeholder="What connects these companies, and what exposure is this basket designed to track?"
                    value={basketDescription}
                    onChange={(event) => setBasketDescription(event.target.value)}
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-surface-subtle px-3.5 py-3 text-sm leading-6 text-ink-primary outline-none transition-colors placeholder:text-ink-disabled focus:border-brand-primary"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface-subtle p-5">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-ink-primary">
                    What deployment creates
                  </h3>
                  <p className="mt-1.5 text-xs leading-5 text-ink-secondary">
                    A verified Devnet basket state and deterministic SPL share mint, followed by durable registry indexing.
                    Share supply starts at zero. This step does not mint investor shares or create secondary liquidity.
                  </p>
                </div>
              </div>
            </section>

            {!registryReady && marketplaceStatus === 'ready' && (
              <div className="flex items-start gap-2 rounded-xl border border-semantic-negative/30 bg-semantic-negative/5 px-4 py-3 text-sm text-semantic-negative">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Durable custom-basket storage is not configured, so deployment is disabled to prevent a basket from disappearing after refresh.
              </div>
            )}
          </div>

          <aside className="xl:sticky xl:top-24">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
              <div className="border-b border-border pb-5">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-tertiary">
                  Review
                </p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink-primary">
                      {basketName.trim() || 'Untitled basket'}
                    </h2>
                    <p className="mt-1 font-mono text-xs font-semibold text-brand-primary">
                      {normalizedSymbol ? `$${normalizedSymbol}` : '$INDEX'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-extrabold tabular-nums text-ink-primary">
                      {'$'}{previewNav.toFixed(2)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-tertiary">
                      indicative NAV
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-b border-border py-5">
                <p className="text-xs font-semibold text-ink-secondary">
                  Setup progress
                </p>
                {steps.map((step) => {
                  const completed = step.id < currentStep || (step.id === 4 && canDeploy);
                  const current = step.id === currentStep && !canDeploy;
                  return (
                    <div key={step.id} className="flex items-center gap-2.5">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold ${
                          completed
                            ? 'border-brand-primary bg-brand-primary text-black'
                            : current
                            ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                            : 'border-border text-ink-tertiary'
                        }`}
                      >
                        {completed ? <Check className="h-3 w-3" /> : step.id}
                      </span>
                      <span
                        className={`text-xs ${
                          completed || current
                            ? 'font-medium text-ink-primary'
                            : 'text-ink-tertiary'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4 py-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface-subtle p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Constituents
                    </p>
                    <p className="mt-1.5 font-mono text-sm font-bold text-ink-primary">
                      {selectedAssets.length}/{MAX_CONSTITUENTS}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-subtle p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-tertiary">
                      Weighting
                    </p>
                    <p className="mt-1.5 text-sm font-semibold text-ink-primary">
                      {indexMethodology}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-subtle p-3.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-tertiary">Market data</span>
                    <span className="text-right font-medium text-ink-secondary">
                      {marketDataSource}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-tertiary">Share supply at deploy</span>
                    <span className="font-mono font-semibold text-ink-primary">0</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
                    <span className="text-ink-tertiary">Secondary liquidity</span>
                    <span className="text-ink-secondary">Not created</span>
                  </div>
                </div>

                {weightedAssets.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-ink-secondary">
                        Target composition
                      </span>
                      <span className={`font-mono text-[10px] ${
                        isValidWeight ? 'text-brand-primary' : 'text-brand-warning'
                      }`}>
                        {totalWeightPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="space-y-2">
                      {weightedAssets.map((item) => (
                        <div key={item.asset.tokenMint}>
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="font-mono font-semibold text-ink-primary">
                              {item.asset.symbol}
                            </span>
                            <span className="font-mono tabular-nums text-ink-tertiary">
                              {(item.targetWeightBps / 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-border">
                            <div
                              className="h-full rounded-full bg-brand-primary"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(0, item.targetWeightBps / 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-subtle p-3.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                  <p className="text-[11px] leading-5 text-ink-secondary">
                    Deployment creates no unbacked shares. Later minting still requires verified constituent custody.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canDeploy}
                className="w-full rounded-xl bg-brand-primary py-3 text-sm font-bold text-black transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Deploy basket
              </button>

              {!canDeploy && (
                <p className="mt-2 text-center text-[10px] leading-4 text-ink-tertiary">
                  Complete the setup above before deployment becomes available.
                </p>
              )}
            </div>
          </aside>
        </div>
      </form>
    </div>
  );
};
