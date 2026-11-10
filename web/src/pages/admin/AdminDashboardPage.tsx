import { useEffect, useState } from 'react';
import { Card, CardBody, EmptyState, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { getPlatformMetrics } from '@/services';
import type { PlatformMetrics } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';

type Tone = 'brand' | 'info' | 'warn' | 'danger';

const TONE_STYLES: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand',
  info: 'bg-info/10 text-info',
  warn: 'bg-warn/10 text-warn',
  danger: 'bg-danger/10 text-danger',
};

function StatCard({ icon, tone, label, value, note }: { icon: string; tone: Tone; label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3.5 p-4 sm:p-5">
        <span aria-hidden className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg', TONE_STYLES[tone])}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight text-ink">{value}</p>
          {note && <p className="mt-0.5 truncate text-xs text-muted">{note}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

export function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPlatformMetrics()
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((err) => {
        if (!cancelled) setError(toMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader title="Platform Dashboard" description="Metrics across every merchant on SellEazy." />

      {loading && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}

      {error && (
        <Card>
          <EmptyState title="Metrics did not load" description={error} />
        </Card>
      )}

      {metrics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard icon="☺" tone="brand" label="Total Merchants" value={metrics.totalMerchants.toLocaleString()} />
          <StatCard
            icon="◎"
            tone="brand"
            label="Monthly Recurring Revenue"
            value={`$${metrics.mrr.toLocaleString()}`}
            note="Active paid plans"
          />
          <StatCard
            icon="⚡"
            tone="info"
            label="Active Merchants"
            value={metrics.activeMerchants.toLocaleString()}
            note="Not suspended"
          />
          <StatCard
            icon="☰"
            tone="info"
            label="Orders Processed"
            value={metrics.ordersProcessed.toLocaleString()}
            note="All time, all merchants"
          />
          <StatCard
            icon="↓"
            tone={metrics.churnRate > 0 ? 'danger' : 'brand'}
            label="Churn"
            value={`${(metrics.churnRate * 100).toFixed(1)}%`}
            note="Of all merchants"
          />
        </div>
      )}
    </>
  );
}
