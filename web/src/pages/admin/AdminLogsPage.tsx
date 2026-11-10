import { useMemo } from 'react';
import { Card, EmptyState, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCollection } from '@/hooks/useCollection';
import { platformLogsQuery } from '@/services';
import { formatDate } from '@/utils/format';

const ACTION_LABEL: Record<string, string> = {
  'merchant.suspended': 'Suspended merchant',
  'merchant.unsuspended': 'Unsuspended merchant',
  'merchant.deleted': 'Deleted merchant',
};

export function AdminLogsPage() {
  const logs = useCollection(useMemo(() => platformLogsQuery(), []));
  const rows = logs.status === 'ready' ? logs.data : [];

  return (
    <>
      <PageHeader
        title="Platform Logs"
        description="An audit trail of admin actions across every merchant — the most recent 200."
      />

      {logs.status === 'loading' && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}

      {logs.status === 'error' && (
        <Card>
          <EmptyState title="Logs did not load" description={logs.error} />
        </Card>
      )}

      {logs.status === 'ready' && rows.length === 0 && (
        <Card>
          <EmptyState
            title="No activity yet"
            description="Suspending, unsuspending, or deleting a merchant shows up here."
          />
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Merchant</th>
                  <th className="px-5 py-3">Admin</th>
                  <th className="px-5 py-3">Detail</th>
                  <th className="px-5 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr key={log.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-semibold text-ink">{ACTION_LABEL[log.action] ?? log.action}</td>
                    <td className="px-5 py-3 text-muted">{log.targetOrgName ?? '—'}</td>
                    <td className="px-5 py-3 text-muted">{log.actorEmail ?? log.actorUid}</td>
                    <td className="px-5 py-3 text-muted">{log.detail ?? '—'}</td>
                    <td className="px-5 py-3 text-xs text-muted">{formatDate(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 text-xs text-muted">
        This is SellEazy's own admin-action audit trail, not raw server logs. For request-level Cloud
        Functions logs, use the Firebase Console's Functions {'>'} Logs tab.
      </p>
    </>
  );
}
