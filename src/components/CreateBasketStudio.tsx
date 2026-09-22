'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Database,
  Plus,
  ShieldCheck,
  Sliders,
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
      return sources.has('live') ? 'Live provider marks' : 'Verified snapshots';
    }
    return 'Mixed live + snapshot';
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

  const canDeploy =
    marketplaceStatus === 'ready' &&
    registryReady &&
    selectedAssets.length > 0 &&
    selectedAssets.length <= MAX_CONSTITUENTS &&
    isValidWeight &&
    nameValid &&
    symbolValid;

  const handleAddAsset = (asset: AssetQuote) => {
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
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm font-sans">
      <div className="flex flex-col gap-4 border-b border-border bg-surface-subtle p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-strong bg-surface text-brand-primary">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-bold uppercase tracking-wider text-ink-primary">
                Create Basket
              </h1>
              <span className="rounded border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-primary">
                Devnet
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-secondary">
              Define up to eight supported private-market assets and deploy the
              basket state plus its deterministic SPL share mint. Share supply
              starts at zero until the first backed investment.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="self-start rounded-lg border border-border bg-surface px-4 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-border-strong hover:text-ink-primary sm:self-center"
        >
          Cancel
        </button>
      </div>

      <div className="overflow-x-auto border-b border-border bg-surface px-6 py-3.5">
        <div className="flex min-w-[620px] items-center justify-between font-mono text-xs">
          {steps.map((step, index) => {
            const completed = step.id < currentStep;
            const current = step.id === currentStep;

            return (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      completed
                        ? 'bg-brand-primary text-black'
                        : current
                        ? 'border-2 border-brand-primary bg-brand-primary/10 text-brand-primary'
                        : 'border border-border bg-surface-subtle text-ink-tertiary opacity-50'
                    }`}
                  >
                    {completed ? '✓' : step.id}
                  </span>
                  <span
                    className={`font-semibold ${
                      completed
                        ? 'text-brand-primary'
                        : current
                        ? 'text-ink-primary'
                        : 'text-ink-tertiary opacity-50'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-3 h-0.5 flex-1 rounded-full ${
                      completed ? 'bg-brand-primary' : 'bg-border'
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-[1.3fr_0.85fr] lg:divide-x lg:divide-y-0">
          <div className="space-y-6 p-6">
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-primary">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary/15 text-[10px] text-brand-primary">
                    1
                  </span>
                  Select Assets ({selectedAssets.length}/{MAX_CONSTITUENTS})
                </label>
                {selectedAssets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleEqualWeights}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    Equalize weights
                  </button>
                )}
              </div>

              <div className="flex min-h-14 flex-wrap gap-2 rounded-lg border border-border bg-surface-subtle p-3">
                {marketplaceStatus === 'loading' && (
                  <span className="text-xs text-ink-tertiary">
                    Loading supported provider assets…
                  </span>
                )}
                {marketplaceStatus === 'error' && (
                  <span className="text-xs text-semantic-negative">
                    Market assets are unavailable, so basket creation is paused.
                  </span>
                )}
                {marketplaceStatus === 'ready' &&
                  availableAssets.map((asset) => {
                    const selected = selectedAssets.some(
                      (item) => item.asset.tokenMint === asset.tokenMint
                    );
                    const atLimit =
                      selectedAssets.length >= MAX_CONSTITUENTS && !selected;

                    return (
                      <button
                        type="button"
                        key={asset.tokenMint}
                        onClick={() => handleAddAsset(asset)}
                        disabled={selected || atLimit}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs transition-colors ${
                          selected || atLimit
                            ? 'cursor-not-allowed border-border-subtle bg-surface-elevated text-ink-disabled opacity-50'
                            : 'border-border bg-surface text-ink-primary hover:border-brand-primary'
                        }`}
                      >
                        <Plus className="h-3 w-3 text-ink-tertiary" />
                        <span className="font-bold">{asset.symbol}</span>
                        <span className="text-ink-tertiary tabular-nums">
                          {'$'}{asset.priceUsd.toFixed(2)}
                        </span>
                        <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-sans text-[9px] uppercase tracking-wide text-ink-tertiary">
                          {providerLabel(asset)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wide ${
                            asset.quoteSource === 'live'
                              ? 'bg-brand-primary/10 text-brand-primary'
                              : 'bg-brand-warning/10 text-brand-warning'
                          }`}
                        >
                          {asset.quoteSource === 'live' ? 'Live' : 'Snapshot'}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {selectedAssets.length >= MAX_CONSTITUENTS && (
                <p className="text-[11px] text-ink-tertiary">
                  The on-chain basket program supports a maximum of eight
                  constituents.
                </p>
              )}
            </section>

            {selectedAssets.length > 0 && (
              <section className="space-y-2">
                <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                  <table className="w-full min-w-[620px] text-left font-mono text-xs">
                    <thead className="border-b border-border bg-surface-subtle font-sans text-[10px] uppercase tracking-wider text-ink-tertiary">
                      <tr>
                        <th className="px-3.5 py-2">Constituent</th>
                        <th className="px-3.5 py-2">Source</th>
                        <th className="px-3.5 py-2 text-right">
                          Provider Mark
                        </th>
                        <th className="px-3.5 py-2 text-right">Target Weight</th>
                        <th className="px-3.5 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle text-[11px]">
                      {selectedAssets.map((item) => (
                        <tr
                          key={item.asset.tokenMint}
                          className="transition-colors hover:bg-surface-elevated/40"
                        >
                          <td className="px-3.5 py-2.5">
                            <div>
                              <div className="font-bold text-ink-primary">
                                {item.asset.symbol}
                              </div>
                              <div className="font-sans text-[10px] text-ink-tertiary">
                                {item.asset.name}
                              </div>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 font-sans text-ink-secondary">
                            {providerLabel(item.asset)} ·{' '}
                            {item.asset.quoteSource === 'live'
                              ? 'live'
                              : 'snapshot'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-secondary">
                            {'$'}{item.asset.priceUsd.toFixed(2)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
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
                                className="w-20 rounded border border-border bg-surface-subtle px-2 py-1 text-right font-mono text-xs tabular-nums text-ink-primary focus:border-brand-primary focus:outline-none"
                              />
                              <span className="text-ink-tertiary">%</span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2.5 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${item.asset.symbol}`}
                              onClick={() =>
                                handleRemoveAsset(item.asset.tokenMint)
                              }
                              className="text-ink-tertiary transition-colors hover:text-semantic-negative"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  className={`flex flex-col gap-2 rounded-lg border p-3 font-mono text-xs sm:flex-row sm:items-center sm:justify-between ${
                    isValidWeight
                      ? 'border-brand-primary/40 bg-brand-primary/5 text-brand-primary'
                      : 'border-brand-warning/40 bg-brand-warning/5 text-brand-warning'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {isValidWeight ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>
                      Total:{' '}
                      <span className="font-bold tabular-nums">
                        {totalWeightPct.toFixed(2)}%
                      </span>{' '}
                      · {totalWeightBps.toLocaleString()} bps
                    </span>
                  </div>
                  <span>
                    Indicative target NAV:{' '}
                    <span className="font-bold tabular-nums">
                      {'$'}{previewNav.toFixed(2)}
                    </span>
                  </span>
                </div>
              </section>
            )}

            <section className="space-y-4 border-t border-border pt-5">
              <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-primary">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary/15 text-[10px] text-brand-primary">
                  3
                </span>
                Basket Details
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                      Basket Name
                    </label>
                    <span className="font-mono text-[10px] text-ink-tertiary">
                      {basketName.length}/32
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    placeholder="e.g. Next-Gen Cloud Pioneers"
                    value={basketName}
                    onChange={(event) => setBasketName(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-ink-primary placeholder:text-ink-disabled focus:border-brand-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                    Ticker
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. CLOUD"
                    value={basketSymbol}
                    onChange={(event) =>
                      setBasketSymbol(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, '')
                      )
                    }
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 font-mono text-xs font-bold uppercase text-ink-primary placeholder:text-ink-disabled focus:border-brand-primary focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-ink-tertiary">
                    1–10 letters or numbers. The ticker derives the on-chain PDA.
                  </p>
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
                    Investment Thesis
                  </label>
                  <input
                    type="text"
                    maxLength={280}
                    placeholder="Optional thesis summary or sector focus…"
                    value={basketDescription}
                    onChange={(event) =>
                      setBasketDescription(event.target.value)
                    }
                    className="mt-1.5 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xs text-ink-primary placeholder:text-ink-disabled focus:border-brand-primary focus:outline-none"
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-surface-subtle p-4">
              <div className="flex items-start gap-3">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-ink-primary">
                    Deployment scope
                  </h3>
                  <p className="text-[11px] leading-relaxed text-ink-secondary">
                    This creates the SynthaBasket vault state and deterministic
                    SPL share mint on Solana Devnet, then indexes the verified
                    basket in durable storage. It does not mint investor shares
                    or create secondary-market liquidity.
                  </p>
                  <p className="text-[11px] leading-relaxed text-ink-tertiary">
                    Secondary liquidity is surfaced separately only after a
                    compatible executable venue exists for the basket share mint.
                  </p>
                </div>
              </div>
            </section>

            {!registryReady && marketplaceStatus === 'ready' && (
              <div className="flex items-start gap-2 rounded-lg border border-semantic-negative/30 bg-semantic-negative/5 p-3 text-[11px] text-semantic-negative">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Durable custom-basket storage is not configured, so deployment
                is disabled to prevent a created basket from disappearing on
                refresh.
              </div>
            )}
          </div>

          <aside className="flex flex-col justify-between space-y-6 bg-surface-subtle p-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-primary">
                  Deployment Preview
                </span>
                <span className="font-mono text-xs font-bold text-brand-primary">
                  {'$'}{normalizedSymbol || 'INDEX'}
                </span>
              </div>

              <div className="space-y-2.5 rounded-lg border border-border bg-surface p-4 font-mono text-xs">
                <div className="flex justify-between gap-4">
                  <span className="font-sans text-ink-tertiary">
                    Indicative target NAV
                  </span>
                  <span className="font-bold tabular-nums text-ink-primary">
                    {'$'}{previewNav.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-sans text-ink-tertiary">
                    Constituents
                  </span>
                  <span className="font-semibold text-ink-primary">
                    {selectedAssets.length}/{MAX_CONSTITUENTS}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-sans text-ink-tertiary">
                    Weight method
                  </span>
                  <span className="font-sans text-ink-secondary">
                    {indexMethodology}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-sans text-ink-tertiary">
                    Market data
                  </span>
                  <span className="font-sans text-right text-ink-secondary">
                    {marketDataSource}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-sans text-ink-tertiary">
                    Share supply at deploy
                  </span>
                  <span className="font-semibold text-ink-primary">0</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="font-sans text-ink-tertiary">
                    Secondary liquidity
                  </span>
                  <span className="font-sans text-ink-tertiary">
                    Not created
                  </span>
                </div>
              </div>

              {selectedAssets.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-ink-tertiary">
                    <span className="font-medium">Target composition</span>
                    <span className="font-mono text-[10px]">
                      {totalWeightPct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {weightedAssets.map((item) => (
                      <div
                        key={item.asset.tokenMint}
                        className="flex items-center justify-between"
                      >
                        <span className="font-semibold text-ink-primary">
                          {item.asset.symbol}
                        </span>
                        <span className="tabular-nums text-ink-tertiary">
                          {(item.targetWeightBps / 100).toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
                <p className="text-[11px] leading-relaxed text-ink-secondary">
                  Deployment creates no unbacked basket shares. The share mint
                  starts at zero supply; later minting requires the vault's
                  deposit-and-mint path and live constituent custody.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canDeploy}
              className="w-full rounded-lg border border-brand-primary/40 bg-brand-primary py-3 text-xs font-bold uppercase tracking-wider text-black shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Deploy Basket Vault
            </button>
          </aside>
        </div>
      </form>
    </div>
  );
};
