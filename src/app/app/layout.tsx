import { Suspense } from 'react';

function AppShellFallback() {
  return (
    <div className="min-h-screen bg-background text-ink-primary">
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-elevated" />
        <div className="mt-8 h-64 animate-pulse rounded-2xl border border-border bg-surface" />
      </div>
    </div>
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={<AppShellFallback />}>{children}</Suspense>;
}
