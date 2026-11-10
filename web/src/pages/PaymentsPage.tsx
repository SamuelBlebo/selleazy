import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { limit, orderBy, query } from 'firebase/firestore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, EmptyState, Icon, Segmented, Select } from '@/components/ui';
import { paymentsRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { rejectPayment, verifyPayment } from '@/services';
import type { MomoNetwork, Payment, WithId } from '@/types';
import { toMessage } from '@/utils/errors';
import { cedis, formatPhone, shortWhen } from '@/utils/format';

const NETWORK: Record<MomoNetwork, string> = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', airteltigo: 'AirtelTigo Money' };
type Tab = 'submitted' | 'verified' | 'rejected';

/** Manual MoMo verification (ShopFlow's queue, on Firestore). */
export function PaymentsPage() {
  usePageTitle('MoMo checks');
  const { org } = useOrg();
  const [tab, setTab] = useState<Tab>('submitted');
  const payments = useCollection(useMemo(() => query(paymentsRef(org.id), orderBy('createdAt', 'desc'), limit(200)), [org.id]));
  const all = payments.status === 'ready' ? payments.data : [];
  const list = all.filter((p) => p.status === tab);
  const count = (s: Tab) => all.filter((p) => p.status === s).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader title="MoMo checks" description="Match each Transaction ID and amount with the MoMo SMS on your phone before you confirm." />
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'submitted', label: 'To check', count: count('submitted') }, { value: 'verified', label: 'Verified', count: count('verified') }, { value: 'rejected', label: 'Rejected', count: count('rejected') }]} />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          {list.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface sm:col-span-2">
              <EmptyState title={tab === 'submitted' ? 'No payments waiting' : 'Nothing here yet'} description="When a customer replies with a Transaction ID, it lands here for you to check." />
            </div>
          )}
          {list.map((p) => <PaymentCard key={p.id} p={p} />)}
        </div>
        <aside className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your MoMo numbers</h2>
            <Link to="/settings/momo" className="text-sm font-semibold text-brand-ink underline">Edit</Link>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">MTN MoMo</dt><dd className="tabular text-right">{org.momo.mtn || '—'}</dd>
            <dt className="text-muted">Telecel Cash</dt><dd className="tabular text-right">{org.momo.telecel || '—'}</dd>
            <dt className="text-muted">AirtelTigo Money</dt><dd className="tabular text-right">{org.momo.airteltigo || '—'}</dd>
          </dl>
          <h3 className="mt-5 font-semibold">How to check a payment</h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">
            <li>Open the MoMo SMS on the phone that received it.</li>
            <li>Find the same Transaction ID.</li>
            <li>Make sure the amount matches.</li>
            <li>Tap Verify. SellEazy confirms the order and thanks the customer.</li>
          </ol>
          <p className="mt-4 rounded-lg border border-dashed border-line2 p-3 text-xs text-muted">
            Automatic checks for MTN MoMo, Telecel Cash and AirtelTigo Money will plug in here later.
          </p>
        </aside>
      </div>
    </div>
  );
}

const FLAG_TEXT = (p: Payment): string[] =>
  p.flags.map((f) =>
    f === 'amount_mismatch'
      ? `Amount doesn't match. Due ${cedis(p.expectedMinor)}, customer says ${cedis(p.claimedMinor)}.`
      : f === 'duplicate_reference'
        ? `This Transaction ID was already used for order #${p.duplicateOfOrderNumber}. It may be an old receipt.`
        : `The customer didn't say how much. ${cedis(p.expectedMinor)} is due.`,
  );

function PaymentCard({ p }: { p: WithId<Payment> }) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("Amount doesn't match");
  const [busy, setBusy] = useState<'ok' | 'no' | null>(null);
  const bad = p.flags.some((f) => f !== 'amount_unknown');
  const act = async (kind: 'ok' | 'no') => {
    setBusy(kind);
    try {
      if (kind === 'ok') {
        await verifyPayment(p.id);
        toast.success(`Verified. Order #${p.orderNumber} updated and the customer thanked.`);
      } else {
        await rejectPayment(p.id, reason);
        toast.success('Rejected. The customer was asked to pay again.');
      }
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b-[3px] border-double border-line px-4 py-2 font-cap text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
        <span>{p.network ? NETWORK[p.network] : p.method} · {shortWhen(p.createdAt)} · #{p.orderNumber}</span>
        {p.status === 'verified' ? <Badge tone="ok">Verified</Badge> : p.status === 'rejected' ? <Badge tone="danger">Rejected</Badge> : bad ? <Badge tone="danger">Check carefully</Badge> : <Badge tone="accent">To check</Badge>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{p.customerName}</p>
            {p.payerPhone && <p className="tabular text-[13px] text-muted">From {formatPhone(p.payerPhone)}</p>}
          </div>
          <Link to={`/chats/${p.customerId}`} className="inline-flex items-center gap-1 text-[13px] font-semibold hover:underline"><Icon name="chat" className="h-4 w-4" /> Chat</Link>
        </div>
        <dl className="my-3 grid grid-cols-2 rounded-lg border border-line">
          <div className="px-3 py-2.5"><dt className="cap text-muted">Due</dt><dd className="tabular mt-1 text-lg font-semibold">{cedis(p.expectedMinor)}</dd></div>
          <div className="border-l border-line px-3 py-2.5">
            <dt className="cap text-muted">Customer says</dt>
            <dd className={`tabular mt-1 text-lg font-semibold ${p.flags.includes('amount_mismatch') ? 'text-danger' : ''}`}>{p.claimedMinor === null ? '—' : cedis(p.claimedMinor)}</dd>
          </div>
        </dl>
        {p.reference && (
          <div className="mb-3"><span className="text-[13px] text-muted">Transaction ID</span><p className="font-mono text-[15px] font-semibold tracking-wider">{p.reference}</p></div>
        )}
        {p.status === 'submitted' && FLAG_TEXT(p).map((t) => (
          <p key={t} className="mb-2 flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-[#7A1C15]"><Icon name="alert" className="mt-0.5 h-4 w-4" />{t}</p>
        ))}
        {p.status === 'submitted' ? (
          rejecting ? (
            <div className="space-y-2">
              <Select label="Why are you rejecting it?" value={reason} onChange={(e) => setReason(e.target.value)}>
                <option>Amount doesn't match</option>
                <option>Transaction ID not in my MoMo SMS</option>
                <option>Transaction ID already used</option>
                <option>Other</option>
              </Select>
              <div className="flex gap-2">
                <Button variant="danger" loading={busy === 'no'} onClick={() => void act('no')}>Reject payment</Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Keep it</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="ok" loading={busy === 'ok'} onClick={() => void act('ok')}><Icon name="check" /> Verify</Button>
              <Button variant="danger" onClick={() => setRejecting(true)}>Reject</Button>
            </div>
          )
        ) : (
          <p className="text-[13px] text-muted">{p.status === 'verified' ? 'Verified' : `Rejected${p.rejectedReason ? `: ${p.rejectedReason}` : ''}`}{p.verifiedAt ? ` · ${shortWhen(p.verifiedAt)}` : ''}</p>
        )}
      </div>
    </article>
  );
}
