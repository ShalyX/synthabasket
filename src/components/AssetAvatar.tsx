'use client';

import React from 'react';

type AssetAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

interface AssetAvatarProps {
  symbol?: string;
  name?: string;
  logoUrl?: string;
  size?: AssetAvatarSize;
  className?: string;
}

const IDENTITY_DOMAINS: Array<{ keys: string[]; domain: string }> = [
  { keys: ['OPENAI'], domain: 'openai.com' },
  { keys: ['ANTHROPIC'], domain: 'anthropic.com' },
  { keys: ['SPACEX'], domain: 'spacex.com' },
  { keys: ['ANDURIL'], domain: 'anduril.com' },
  { keys: ['NEURALINK'], domain: 'neuralink.com' },
  { keys: ['KALSHI'], domain: 'kalshi.com' },
  { keys: ['POLYMARKET'], domain: 'polymarket.com' },
  { keys: ['FIGUREAI', 'FIGURE'], domain: 'figure.ai' },
  { keys: ['STRIPE'], domain: 'stripe.com' },
  { keys: ['KRAKEN'], domain: 'kraken.com' },
];

const SIZE_STYLES: Record<
  AssetAvatarSize,
  { shell: string; image: string; text: string }
> = {
  xs: { shell: 'h-6 w-6 rounded-md', image: 'h-3.5 w-3.5', text: 'text-[8px]' },
  sm: { shell: 'h-7 w-7 rounded-lg', image: 'h-[18px] w-[18px]', text: 'text-[9px]' },
  md: { shell: 'h-8 w-8 rounded-lg', image: 'h-5 w-5', text: 'text-[10px]' },
  lg: { shell: 'h-10 w-10 rounded-xl', image: 'h-6 w-6', text: 'text-[11px]' },
};

function identityKey(symbol?: string, name?: string) {
  return `${symbol || ''} ${name || ''}`
    .toUpperCase()
    .replace(/T-TOKEN/g, '')
    .replace(/PRESTOCKS/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function fallbackInitials(symbol?: string, name?: string) {
  const source = String(symbol || name || '?')
    .replace(/^T-/i, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .trim();

  if (!source) return '?';

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function fallbackLogoUrl(symbol?: string, name?: string) {
  const key = identityKey(symbol, name);
  const match = IDENTITY_DOMAINS.find((entry) =>
    entry.keys.some((candidate) => key.includes(candidate))
  );

  return match
    ? `https://www.google.com/s2/favicons?domain=${match.domain}&sz=64`
    : undefined;
}

export const AssetAvatar: React.FC<AssetAvatarProps> = ({
  symbol,
  name,
  logoUrl,
  size = 'md',
  className = '',
}) => {
  const styles = SIZE_STYLES[size];
  const src = logoUrl || fallbackLogoUrl(symbol, name);
  const initials = fallbackInitials(symbol, name);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white text-slate-700 shadow-sm ${styles.shell} ${className}`}
      title={name || symbol || 'Asset'}
      aria-hidden="true"
    >
      <span className={`font-sans font-extrabold tracking-tight ${styles.text}`}>
        {initials}
      </span>
      {src && (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className={`absolute object-contain ${styles.image}`}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </span>
  );
};
