import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, Modal, Spinner } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/hooks/useToast';
import { deleteMerchant, listMerchants, suspendMerchant, unsuspendMerchant } from '@/services';
import type { MerchantSummary } from '@/types';
import { formatDate } from '@/utils/format';
import { toMessage } from '@/utils/errors';

export function AdminMerchantsPage() {
  const toast = useToast();
  const [merchants, setMerchants] = useState<MerchantSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [suspendTarget, setSuspendTarget] = useState<MerchantSummary | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<MerchantSummary | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async (nextCursor?: string) => {
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const result = await listMerchants(nextCursor);
      setMerchants((prev) => (nextCursor ? [...prev, ...result.merchants] : result.merchants));
      setCursor(result.nextCursor);
    } catch (err) {
      setLoadError(toMessage(err));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = merchants.filter(
    (m) => !search || m.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const doSuspend = async () => {
    if (!suspendTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await suspendMerchant(suspendTarget.id, suspendReason || undefined);
      setMerchants((prev) => prev.map((m) => (m.id === suspendTarget.id ? { ...m, suspended: true } : m)));
      toast.success(`${suspendTarget.name} suspended.`);
      setSuspendTarget(null);
      setSuspendReason('');
    } catch (err) {
      setActionError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doUnsuspend = async (merchant: MerchantSummary) => {
    setBusy(true);
    setActionError(null);
    try {
      await unsuspendMerchant(merchant.id);
      setMerchants((prev) => prev.map((m) => (m.id === merchant.id ? { ...m, suspended: false } : m)));
      toast.success(`${merchant.name} unsuspended.`);
    } catch (err) {
      setActionError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteMerchant(deleteTarget.id, confirmName);
      setMerchants((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast.success(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      setConfirmName('');
    } catch (err) {
      setActionError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Merchants" description="Every business signed up on SellEazy." />

      <div className="mb-4 w-full sm:max-w-xs">
        <Input
          aria-label="Search merchants"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}

      {loadError && (
        <Card>
          <EmptyState title="Merchants did not load" description={loadError} />
        </Card>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <Card>
          <EmptyState title="No merchants match" description="Try a different search term." />
        </Card>
      )}

      {filtered.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold text-muted">
                  <th className="px-5 py-3">Merchant</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((merchant) => (
                  <tr key={merchant.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-semibold text-ink">{merchant.name}</td>
                    <td className="px-5 py-3 capitalize text-muted">{merchant.plan}</td>
                    <td className="px-5 py-3">
                      {merchant.suspended ? (
                        <span className="inline-flex items-center rounded-full bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold capitalize text-brand">
                          {merchant.status}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-muted">{formatDate(merchant.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {merchant.suspended ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            loading={busy}
                            onClick={() => doUnsuspend(merchant)}
                          >
                            Unsuspend
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setActionError(null);
                              setSuspendTarget(merchant);
                            }}
                          >
                            Suspend
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setActionError(null);
                            setDeleteTarget(merchant);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <div className="flex justify-center border-t border-line p-3">
              <Button type="button" variant="ghost" size="sm" loading={loadingMore} onClick={() => load(cursor)}>
                Load more
              </Button>
            </div>
          )}
        </Card>
      )}

      <Modal
        open={Boolean(suspendTarget)}
        title="Suspend merchant"
        onClose={() => setSuspendTarget(null)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="danger" loading={busy} onClick={doSuspend}>
              Suspend
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          Suspend <strong>{suspendTarget?.name}</strong>? Their WhatsApp bot stops taking new orders
          immediately; their dashboard stays reachable so they can see history and contact support.
        </p>
        <div className="mt-3">
          <label className="block text-sm font-semibold text-ink" htmlFor="suspend-reason">
            Reason (optional, visible in logs)
          </label>
          <textarea
            id="suspend-reason"
            rows={2}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            placeholder="e.g. Repeated billing failures"
          />
        </div>
        {actionError && (
          <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{actionError}</p>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete merchant"
        onClose={() => {
          setDeleteTarget(null);
          setConfirmName('');
        }}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDeleteTarget(null);
                setConfirmName('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              disabled={confirmName.trim() !== deleteTarget?.name}
              onClick={doDelete}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          This permanently deletes <strong>{deleteTarget?.name}</strong> — every product, order, and
          customer record, their uploaded photos, and their WhatsApp connection. This cannot be undone.
        </p>
        <div className="mt-3">
          <label className="block text-sm font-semibold text-ink" htmlFor="confirm-name">
            Type <strong>{deleteTarget?.name}</strong> to confirm
          </label>
          <Input id="confirm-name" className="mt-1.5" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </div>
        {actionError && (
          <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{actionError}</p>
        )}
      </Modal>
    </>
  );
}
