import { useMemo, useState } from 'react';
import { NavLink, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { WhatsAppConnectButton } from '@/components/settings/WhatsAppConnect';
import { Badge, Button, Card, CardBody, CardHeader, Icon, Input, Select, SettingRow, Switch, Textarea } from '@/components/ui';
import { BUSINESS_TYPES, CATEGORIES } from '@/config/business';
import { ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from '@/config/permissions';
import { PLANS, planById } from '@/config/plans';
import { invitesRef, membersRef } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useCollection } from '@/hooks/useCollection';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { cancelInvite, changePlan, disconnectWhatsapp, inviteMember, removeMember, sendTestMessage, updateMemberRole, updateSettings } from '@/services';
import type { BusinessType, Role } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';
import { cedis, formatDate, toMinor } from '@/utils/format';

const TABS = [
  ['business', 'Business'],
  ['whatsapp', 'WhatsApp'],
  ['momo', 'MoMo numbers'],
  ['team', 'Team & roles'],
  ['plan', 'Plan & billing'],
] as const;

export function SettingsPage() {
  usePageTitle('Settings');
  const { tab = 'business' } = useParams();
  if (!TABS.some(([id]) => id === tab)) return <Navigate to="/settings" replace />;
  const Body = { business: BusinessTab, whatsapp: WhatsAppTab, momo: MomoTab, team: TeamTab, plan: PlanTab }[tab as (typeof TABS)[number][0]];
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <PageHeader title="Settings" />
      <div className="grid items-start gap-6 md:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings" className="flex gap-1 overflow-x-auto [scrollbar-width:none] md:sticky md:top-0 md:flex-col">
          {TABS.map(([id, label]) => (
            <NavLink key={id} to={`/settings/${id}`} className={({ isActive }) => cn('shrink-0 whitespace-nowrap rounded-lg px-3 py-2 font-semibold', isActive || (id === 'business' && tab === 'business') ? 'bg-surface text-ink shadow-card' : 'text-muted hover:bg-raised')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0"><Body /></div>
      </div>
    </div>
  );
}

function useSaver() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (fn: () => Promise<unknown>, ok = 'Saved.') => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

function BusinessTab() {
  const { org } = useOrg();
  const { busy, save } = useSaver();
  const [f, setF] = useState({
    name: org.name,
    area: org.area ?? '',
    phone: org.phone ?? '',
    businessType: org.businessType,
    category: org.category,
    fee: (org.deliveryFeeMinor / 100).toFixed(2),
    features: org.features,
    bot: org.bot,
  });
  const setFeature = (k: keyof typeof f.features, v: boolean) => setF({ ...f, features: { ...f.features, [k]: v } });
  return (
    <Card>
      <CardHeader title="Business" />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Business name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="e.g. Osu, Accra" />
          <Select label="What you sell" value={f.businessType} onChange={(e) => setF({ ...f, businessType: e.target.value as BusinessType, category: CATEGORIES[e.target.value as BusinessType][0] })}>
            {BUSINESS_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
          <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {[...new Set([f.category, ...CATEGORIES[f.businessType]])].map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Delivery fee (GH₵)" inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} hint="Added to delivery orders." />
          <Input label="Business phone" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
        <div>
          <h3 className="mb-1 font-semibold">How customers get their order</h3>
          <SettingRow title="Delivery" hint="We bring it to the customer."><Switch checked={f.features.delivery} label="Delivery" onChange={(v) => setFeature('delivery', v)} /></SettingRow>
          <SettingRow title="Pickup" hint="The customer collects it."><Switch checked={f.features.pickup} label="Pickup" onChange={(v) => setFeature('pickup', v)} /></SettingRow>
          <SettingRow title="Bookings" hint="Services can carry an appointment time."><Switch checked={f.features.bookings} label="Bookings" onChange={(v) => setFeature('bookings', v)} /></SettingRow>
          <SettingRow title="We come to the customer" hint="For services done at the customer's place."><Switch checked={f.features.onSite} label="On-site services" onChange={(v) => setFeature('onSite', v)} /></SettingRow>
          <SettingRow title="Kitchen screen" hint="For food: a big-ticket screen for the kitchen."><Switch checked={f.features.kitchen} label="Kitchen screen" onChange={(v) => setFeature('kitchen', v)} /></SettingRow>
        </div>
        <div>
          <h3 className="mb-1 font-semibold">WhatsApp bot</h3>
          <SettingRow title="Menu bot" hint="Shows your catalogue, builds a cart, takes the address and time."><Switch checked={f.bot.menuEnabled} label="Menu bot" onChange={(v) => setF({ ...f, bot: { ...f.bot, menuEnabled: v } })} /></SettingRow>
          <SettingRow title="Read typed orders" hint="When a customer types an order in their own words, SellEazy drafts it. You always confirm it first."><Switch checked={f.bot.freeTextEnabled} label="Read typed orders" onChange={(v) => setF({ ...f, bot: { ...f.bot, freeTextEnabled: v } })} /></SettingRow>
          <div className="mt-2"><Textarea label="Greeting" value={f.bot.greeting} onChange={(e) => setF({ ...f, bot: { ...f.bot, greeting: e.target.value.slice(0, 500) } })} /></div>
        </div>
        <div className="flex justify-end">
          <Button
            loading={busy}
            onClick={() =>
              void save(() =>
                updateSettings(org.id, {
                  name: f.name.trim() || org.name,
                  area: f.area.trim() || null,
                  phone: f.phone.trim() || null,
                  businessType: f.businessType,
                  category: f.category,
                  deliveryFeeMinor: Math.max(0, toMinor(f.fee) ?? 0),
                  features: f.features,
                  bot: f.bot,
                }),
              )
            }
          >
            Save changes
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function WhatsAppTab() {
  const { org } = useOrg();
  const { busy, save } = useSaver();
  const [confirm, setConfirm] = useState(false);
  const [to, setTo] = useState('');
  const wa = org.whatsapp;
  return (
    <Card>
      <CardHeader title="WhatsApp Business" action={wa.connected ? <Badge tone="ok">Connected</Badge> : <Badge tone="danger">Not connected</Badge>} />
      <CardBody>
        {wa.connected ? (
          <div className="space-y-4">
            <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Number</dt><dd className="tabular text-right">{wa.displayPhoneNumber}</dd>
              <dt className="text-muted">Display name</dt><dd className="text-right">{wa.verifiedName ?? '—'}</dd>
              <dt className="text-muted">Quality rating</dt><dd className="text-right">{wa.qualityRating ?? 'Not rated yet'}</dd>
              <dt className="text-muted">Connected</dt><dd className="text-right">{formatDate(wa.connectedAt)}</dd>
            </dl>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-56"><Input label="Send a test message to" inputMode="tel" placeholder="024 000 0000" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <Button variant="secondary" loading={busy} disabled={to.replace(/\D/g, '').length < 9} onClick={() => void save(() => sendTestMessage(to), 'Test sent. Check that phone.')}>Send test</Button>
            </div>
            {confirm ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft p-3 text-sm text-[#7A1C15]">
                <Icon name="alert" /> Customers won't be able to order on WhatsApp until you reconnect.
                <Button size="sm" variant="danger" onClick={() => void save(() => disconnectWhatsapp(), 'WhatsApp disconnected.')}>Disconnect</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirm(true)}>Disconnect number</Button>
            )}
          </div>
        ) : (
          <div className="max-w-md space-y-4">
            <p>Use the WhatsApp Business number your customers already message. You'll sign in with Facebook. SellEazy never sees your password.</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Log in with the Facebook account that manages your business.</li>
              <li>Pick your business and WhatsApp number (or add one).</li>
              <li>Done. SellEazy starts answering with your catalogue.</li>
            </ol>
            <WhatsAppConnectButton />
            <p className="text-xs text-muted">A number connected to SellEazy can't be used in the WhatsApp Business phone app at the same time.</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MomoTab() {
  const { org } = useOrg();
  const { busy, save } = useSaver();
  const [m, setM] = useState({ mtn: org.momo.mtn ?? '', telecel: org.momo.telecel ?? '', airteltigo: org.momo.airteltigo ?? '', accountName: org.momo.accountName ?? '' });
  return (
    <Card>
      <CardHeader title="Where customers send MoMo" description="The bot sends these after every order. You check payments in MoMo checks." />
      <CardBody className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="MTN MoMo number" inputMode="tel" value={m.mtn} onChange={(e) => setM({ ...m, mtn: e.target.value })} />
          <Input label="Telecel Cash number" inputMode="tel" value={m.telecel} onChange={(e) => setM({ ...m, telecel: e.target.value })} />
          <Input label="AirtelTigo Money number" inputMode="tel" placeholder="Optional" value={m.airteltigo} onChange={(e) => setM({ ...m, airteltigo: e.target.value })} />
          <Input label="Name on the account" value={m.accountName} onChange={(e) => setM({ ...m, accountName: e.target.value })} hint="So customers know they're paying the right person." />
        </div>
        <SettingRow title="Automatic verification" hint="MTN MoMo, Telecel Cash and AirtelTigo Money APIs. Coming later."><Switch checked={false} disabled label="Automatic verification" onChange={() => undefined} /></SettingRow>
        <div className="flex justify-end">
          <Button loading={busy} onClick={() => void save(() => updateSettings(org.id, { momo: { mtn: m.mtn.trim() || null, telecel: m.telecel.trim() || null, airteltigo: m.airteltigo.trim() || null, accountName: m.accountName.trim() || null } }))}>Save</Button>
        </div>
      </CardBody>
    </Card>
  );
}

const PERM_ROWS: Array<[string, Permission]> = [
  ['Chats and orders', 'orders.manage'],
  ['Check MoMo payments', 'payments.verify'],
  ['Kitchen screen', 'kitchen.manage'],
  ['Catalogue and stock', 'catalog.write'],
  ['Customers and promotions', 'broadcasts.send'],
  ['Settings, team and billing', 'settings.write'],
];

function TeamTab() {
  const { org } = useOrg();
  const { user } = useAuth();
  const { busy, save } = useSaver();
  const members = useCollection(useMemo(() => membersRef(org.id), [org.id]));
  const invites = useCollection(useMemo(() => invitesRef(org.id), [org.id]));
  const [inv, setInv] = useState({ contact: '', name: '', role: 'cashier' as Exclude<Role, 'owner'> });
  const plan = planById(org.subscription.plan);
  const used = (members.status === 'ready' ? members.data.length : 0) + (invites.status === 'ready' ? invites.data.length : 0);
  const roles: Array<Exclude<Role, 'owner'>> = org.features.kitchen ? ['manager', 'cashier', 'kitchen'] : ['manager', 'cashier'];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Team" action={<span className="text-sm text-muted">{used} of {plan.staffLimit} on {plan.name}</span>} />
        <div>
          {members.status === 'ready' && members.data.map((mb) => (
            <div key={mb.id} className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 first:border-t-0">
              <div className="min-w-0 flex-1"><p className="font-semibold">{mb.fullName}{mb.id === user?.uid ? ' (you)' : ''}</p><p className="text-sm text-muted">{mb.contact}</p></div>
              {mb.role === 'owner' || mb.id === user?.uid ? (
                <Badge tone="brand">{ROLE_LABEL[mb.role]}</Badge>
              ) : (
                <>
                  <select aria-label={`Role for ${mb.fullName}`} value={mb.role} onChange={(e) => void save(() => updateMemberRole(mb.id, e.target.value as Exclude<Role, 'owner'>), 'Role changed.')} className="h-9 rounded-full border border-line2 bg-white px-3 text-sm">
                    {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <Button size="sm" variant="danger" onClick={() => window.confirm(`Remove ${mb.fullName}?`) && void save(() => removeMember(mb.id), 'Removed.')}>Remove</Button>
                </>
              )}
            </div>
          ))}
          {invites.status === 'ready' && invites.data.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-t border-line px-5 py-3">
              <div className="min-w-0 flex-1"><p className="font-semibold">{i.name ?? i.contact}</p><p className="text-sm text-muted">{i.contact}</p></div>
              <Badge tone="accent">Invited · {ROLE_LABEL[i.role]}</Badge>
              <Button size="sm" variant="ghost" onClick={() => void save(() => cancelInvite(i.id), 'Invite cancelled.')}>Cancel</Button>
            </div>
          ))}
        </div>
        <CardBody className="border-t border-line">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
            <Input label="Name" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} />
            <Input label="Phone or email" value={inv.contact} onChange={(e) => setInv({ ...inv, contact: e.target.value })} placeholder="024… or name@…" />
            <Select label="Role" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Exclude<Role, 'owner'> })}>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
            <Button loading={busy} disabled={inv.contact.length < 5} onClick={() => void save(async () => { await inviteMember(inv.contact, inv.role, inv.name || undefined); setInv({ ...inv, contact: '', name: '' }); }, 'Invite saved.')}>Invite</Button>
          </div>
          <p className="mt-2 text-sm text-muted">They sign up on SellEazy with that phone number or email and land straight in {org.name}.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="What each role can do" />
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="cap text-muted"><th className="py-2 text-left font-semibold">Area</th>{(['owner', ...roles] as Role[]).map((r) => <th key={r} className="py-2 font-semibold">{ROLE_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {PERM_ROWS.map(([label, p]) => (
                <tr key={label} className="border-t border-line">
                  <th scope="row" className="py-2 text-left font-normal">{label}</th>
                  {(['owner', ...roles] as Role[]).map((r) => (
                    <td key={r} className="py-2 text-center">{ROLE_PERMISSIONS[r].includes(p) ? <Icon name="check" className="mx-auto h-4 w-4 text-ok" /> : <span className="text-muted">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

/** Plan usage drawn as a cloth measure (the prototype's signature). */
function Measure({ used, limit }: { used: number; limit: number }) {
  const W = 760;
  const x = (k: number) => 10 + (Math.min(k, limit) * (W - 20)) / limit;
  const label = limit > 30 ? 15 : 5;
  return (
    <svg viewBox={`0 0 ${W} 80`} className="h-auto w-full" role="img" aria-label={`${used} of ${limit} orders used this month`}>
      <line x1="10" x2={W - 10} y1="56" y2="56" stroke="#CDBFA6" />
      <line x1="10" x2={x(used)} y1="56" y2="56" stroke="#26346F" strokeWidth="3" />
      {Array.from({ length: limit + 1 }, (_, k) => (
        <g key={k}>
          <line x1={x(k)} x2={x(k)} y1={k % 5 === 0 ? 30 : 40} y2="56" stroke={k <= used ? '#26346F' : '#CDBFA6'} strokeWidth={k % 5 === 0 ? 1.6 : 1} />
          {k % label === 0 && <text x={x(k)} y="74" textAnchor="middle" fontSize="12" fill="#62594B">{k}</text>}
        </g>
      ))}
      <path d={`M${x(used)} 26 l-6 -10 h12z`} fill="#C4860F" />
      <text x={x(used)} y="11" textAnchor="middle" fontSize="13" fontWeight="700" fill="#6B4500">{used}</text>
    </svg>
  );
}

function PlanTab() {
  const { org } = useOrg();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState(user?.email && !user.email.endsWith('.internal') ? user.email : '');
  const sub = org.subscription;
  const cur = planById(sub.plan);
  const used = sub.ordersUsedThisPeriod ?? 0;

  const choose = async (id: (typeof PLANS)[number]['id']) => {
    setBusy(id);
    try {
      const r = await changePlan(id, email || undefined);
      if (r.checkoutUrl) window.location.href = r.checkoutUrl;
      else toast.success('Plan changed.');
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {params.get('paystack') === 'return' && <p className="rounded-lg bg-ok-soft px-4 py-3 text-ok-ink">Thanks! Your plan updates as soon as Paystack confirms the payment (usually under a minute).</p>}
      {sub.status === 'past_due' && <p className="rounded-lg bg-danger-soft px-4 py-3 text-[#7A1C15]">Your last renewal didn't go through. Pay again below to keep your plan.</p>}
      <Card>
        <CardHeader title="This month" action={<Badge tone="brand">{cur.name} plan</Badge>} />
        <CardBody>
          <p><b className="tabular">{used}</b> of <b>{cur.orderLimit ?? 'unlimited'}</b> orders used.{sub.renewsAt ? ` Renews ${new Date(sub.renewsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.` : ''}</p>
          {cur.orderLimit && <div className="mt-2"><Measure used={used} limit={cur.orderLimit} /></div>}
          <p className="mt-1 text-sm text-muted">Customers can still order if you go over. We'll ask you to upgrade, never block a sale.</p>
        </CardBody>
      </Card>
      <div className="max-w-sm"><Input label="Email for receipts" type="email" value={email} onChange={(e) => setEmail(e.target.value)} hint="Paystack sends your receipt here. Pay with MoMo or card." /></div>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {PLANS.map((p) => (
          <article key={p.id} className={cn('flex flex-col gap-2.5 rounded-2xl border bg-surface p-4', p.id === cur.id ? 'border-brand-2 shadow-[inset_0_0_0_1px_rgb(var(--c-brand2))]' : 'border-line')}>
            <h3 className="font-semibold">{p.name}</h3>
            <p className="tabular text-2xl font-bold">{cedis(p.priceMinor).replace('.00', '')}<span className="text-sm font-medium text-muted"> / month</span></p>
            <ul className="space-y-1.5 text-[13.5px]">{p.features.map((ft) => <li key={ft} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 text-ok" />{ft}</li>)}</ul>
            <div className="mt-auto pt-2">
              {p.id === cur.id ? (
                <Button fullWidth variant="secondary" disabled>Current plan</Button>
              ) : (
                <Button fullWidth variant={p.priceMinor > cur.priceMinor ? 'primary' : 'secondary'} loading={busy === p.id} onClick={() => void choose(p.id)}>
                  {p.priceMinor > cur.priceMinor ? 'Upgrade' : 'Switch'} to {p.name}
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
