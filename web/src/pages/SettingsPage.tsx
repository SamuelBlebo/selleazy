import { useMemo, useState } from 'react';
import { NavLink, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { WhatsAppConnectButton, type ConnectMode } from '@/components/settings/WhatsAppConnect';
import { Badge, Button, Card, CardBody, CardHeader, Icon, Input, Select, SettingRow, Switch, Textarea } from '@/components/ui';
import { BUSINESS_TYPES, CATEGORIES, suggestedFaqs } from '@/config/business';
import { ROLE_LABEL, ROLE_PERMISSIONS, type Permission } from '@/config/permissions';
import { PLANS, planById } from '@/config/plans';
import { invitesRef, membersRef } from '@/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useCollection } from '@/hooks/useCollection';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { cancelInvite, changePlan, disconnectWhatsapp, inviteMember, removeMember, sendTestMessage, updateMemberRole, updateSettings } from '@/services';
import type { BusinessType, DayHours, Faq, OpeningHours, ReviewSettings, Role } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';
import { money, formatDate, toMinor, currencySymbol, CURRENCIES, type Currency } from '@/utils/format';

const TABS = [
  ['business', 'Business'],
  ['hours', 'Opening hours'],
  ['faqs', 'Bot answers'],
  ['reviews', 'Reviews'],
  ['whatsapp', 'WhatsApp'],
  ['momo', 'MoMo numbers'],
  ['team', 'Team & roles'],
  ['plan', 'Plan & billing'],
] as const;

export function SettingsPage() {
  usePageTitle('Settings');
  const { tab = 'business' } = useParams();
  if (!TABS.some(([id]) => id === tab)) return <Navigate to="/settings" replace />;
  const Body = { business: BusinessTab, hours: HoursTab, faqs: FaqTab, reviews: ReviewsTab, whatsapp: WhatsAppTab, momo: MomoTab, team: TeamTab, plan: PlanTab }[tab as (typeof TABS)[number][0]];
  return (
    <div className="mx-auto max-w-5xl px-4 py-4 md:py-6 lg:px-8">
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
    currency: org.currency ?? 'GHS',
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
          <Input label={`Delivery fee (${currencySymbol()})`} inputMode="decimal" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} hint="Added to delivery orders." />
          <Select label="Currency" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value as Currency })} hint="Prices, orders and WhatsApp messages use it. Existing prices are not converted.">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </Select>
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
                  currency: f.currency,
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
  const [mode, setMode] = useState<ConnectMode>('coexistence');
  const wa = org.whatsapp;
  const shared = wa.mode === 'coexistence';
  const pause = org.bot.phoneReplyPauseMinutes ?? 30;
  const setPause = (minutes: number) => void save(() => updateSettings(org.id, { bot: { ...org.bot, phoneReplyPauseMinutes: minutes } }));
  return (
    <Card>
      <CardHeader title="WhatsApp Business" action={wa.connected ? <Badge tone="ok">Connected</Badge> : <Badge tone="danger">Not connected</Badge>} />
      <CardBody>
        {wa.connected ? (
          <div className="space-y-4">
            <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Number</dt><dd className="tabular text-right">{wa.displayPhoneNumber}</dd>
              <dt className="text-muted">Mode</dt><dd className="text-right">{shared ? 'Shared with your WhatsApp Business app' : 'SellEazy only'}</dd>
              <dt className="text-muted">Display name</dt><dd className="text-right">{wa.verifiedName ?? '—'}</dd>
              <dt className="text-muted">Quality rating</dt><dd className="text-right">{wa.qualityRating ?? 'Not rated yet'}</dd>
              <dt className="text-muted">Connected</dt><dd className="text-right">{formatDate(wa.connectedAt)}</dd>
            </dl>
            {shared && (
              <div>
                <SettingRow title="Bot paused while you reply from your phone" hint="When you answer a customer in the WhatsApp Business app, the bot stays quiet in that chat so you don't talk over each other.">
                  <Switch checked={pause > 0} label="Bot paused while you reply from your phone" onChange={(v) => setPause(v ? 30 : 0)} />
                </SettingRow>
                {pause > 0 && (
                  <div className="w-56">
                    <Select label="Pause for" value={String(pause)} onChange={(e) => setPause(Number(e.target.value))}>
                      {[15, 30, 60, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}
                    </Select>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-56"><Input label="Send a test message to" inputMode="tel" placeholder="024 000 0000" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <Button variant="secondary" loading={busy} disabled={to.replace(/\D/g, '').length < 9} onClick={() => void save(() => sendTestMessage(to), 'Test sent. Check that phone.')}>Send test</Button>
            </div>
            {confirm ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
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
            <fieldset className="space-y-2">
              <legend className="mb-1 font-semibold">Which number?</legend>
              {([
                ['coexistence', 'Use my current WhatsApp Business number (recommended)', 'You keep using the WhatsApp Business app on your phone. Your chats and contacts come with you.'],
                ['cloud', 'Use a new number', "A number that isn't on WhatsApp yet. It works only through SellEazy, not the phone app."],
              ] as const).map(([value, title, hint]) => (
                <label key={value} className={cn('flex cursor-pointer gap-3 rounded-lg border p-3', mode === value ? 'border-ok bg-ok-soft' : 'border-line2')}>
                  <input type="radio" name="wa-mode" className="mt-1" checked={mode === value} onChange={() => setMode(value)} />
                  <span><span className="block font-medium">{title}</span><span className="block text-sm text-muted">{hint}</span></span>
                </label>
              ))}
            </fieldset>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Log in with the Facebook account that manages your business.</li>
              {mode === 'coexistence' ? (
                <>
                  <li>Enter your WhatsApp Business number, then scan the QR code with the WhatsApp Business app (Settings → Linked devices).</li>
                  <li>Agree to share your chats so they show up in SellEazy.</li>
                </>
              ) : (
                <li>Pick your business and add your new number.</li>
              )}
              <li>Done. SellEazy starts answering with your catalogue.</li>
            </ol>
            <WhatsAppConnectButton mode={mode} />
            <p className="text-xs text-muted">You'll sign in with Facebook. SellEazy never sees your password.</p>
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

const MAX_FAQS = 30;

function FaqTab() {
  const { org } = useOrg();
  const { busy, save } = useSaver();
  const toEdit = (f: Faq) => ({ q: f.q, a: f.a, keywords: (f.keywords ?? []).join(', ') });
  const [rows, setRows] = useState(() => (org.bot.faqs ?? []).map(toEdit));
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const have = new Set(rows.map((r) => r.q.trim().toLowerCase()));
  const suggestions = suggestedFaqs(org.businessType, org.category).filter((f) => !have.has(f.q.toLowerCase()));
  const clean = (): Faq[] =>
    rows
      .filter((r) => r.q.trim() && r.a.trim())
      .map((r) => ({ q: r.q.trim().slice(0, 150), a: r.a.trim().slice(0, 900), keywords: r.keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 15) }));

  return (
    <Card>
      <CardHeader
        title="Questions the bot answers"
        description="When a customer asks one of these on WhatsApp, the bot replies with your answer. Anything else goes to you."
      />
      <CardBody className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-muted">No questions yet. Start with the suggestions below, then change the answers to fit your business.</p>}
        {rows.map((r, i) => (
          <div key={i} className="space-y-2.5 rounded-xl border border-line p-3.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Input label={`Question ${i + 1}`} value={r.q} onChange={(e) => setRow(i, { q: e.target.value })} placeholder="e.g. Are you open on Sunday?" />
              </div>
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`} className="mt-7 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-danger">
                <Icon name="x" />
              </button>
            </div>
            <Textarea label="Answer" rows={2} value={r.a} onChange={(e) => setRow(i, { a: e.target.value })} />
            <Input label="Other words customers use" value={r.keywords} onChange={(e) => setRow(i, { keywords: e.target.value })} placeholder="e.g. sunday, closing time, weekend" hint="Separate with commas. Any one of these is enough to send this answer." />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={rows.length >= MAX_FAQS} onClick={() => setRows([...rows, { q: '', a: '', keywords: '' }])}>
            <Icon name="plus" /> Add question
          </Button>
        </div>
        {suggestions.length > 0 && rows.length < MAX_FAQS && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Suggested for your business</h3>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button key={s.q} type="button" onClick={() => setRows([...rows, toEdit(s)])} className="rounded-full border border-line2 px-3 py-1.5 text-left text-[13px] hover:bg-raised">
                  + {s.q}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Check each answer before saving. Delivery, payment, location, prices and opening hours are already answered from your other settings.</p>
          </div>
        )}
        <div className="flex justify-end">
          <Button loading={busy} onClick={() => void save(() => updateSettings(org.id, { bot: { ...org.bot, faqs: clean() } }))}>Save</Button>
        </div>
      </CardBody>
    </Card>
  );
}

const WEEK: Array<[number, string]> = [[1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'], [5, 'Friday'], [6, 'Saturday'], [0, 'Sunday']];
const TIMEZONES: Array<[string, string]> = [
  ['Africa/Accra', 'Ghana (GMT)'],
  ['Africa/Lagos', 'Nigeria (GMT+1)'],
  ['Africa/Nairobi', 'Kenya (GMT+3)'],
  ['Africa/Johannesburg', 'South Africa (GMT+2)'],
  ['Europe/London', 'United Kingdom'],
  ['America/New_York', 'US Eastern'],
];
const DEFAULT_HOURS: OpeningHours = {
  enabled: false,
  timezone: 'Africa/Accra',
  ordersWhenClosed: true,
  days: [null, ...Array.from({ length: 6 }, (): DayHours => ({ open: '08:00', close: '20:00' }))],
};

/** Same default and rules as functions/src/domain/reviews.ts. */
const DEFAULT_REVIEW_MESSAGE = 'Thank you for choosing {business}, {name}! How did we do? A quick review helps us a lot: {link}';

/** Settings → Reviews: ask customers for a review when their order is done. */
function ReviewsTab() {
  const { org } = useOrg();
  const { busy, save } = useSaver();
  const [r, setR] = useState<ReviewSettings>({ enabled: false, link: '', message: DEFAULT_REVIEW_MESSAGE, ...org.bot.review });
  const validLink = /^https:\/\/\S+$/.test(r.link.trim());
  const sample = (r.message.trim() || DEFAULT_REVIEW_MESSAGE)
    .replace(/\{business\}/g, org.name)
    .replace(/\{name\}/g, 'Kofi')
    .replace(/\{number\}/g, '42');
  const preview = sample.includes('{link}') ? sample.replace(/\{link\}/g, r.link.trim() || 'your link') : `${sample}\n${r.link.trim() || 'your link'}`;
  return (
    <Card>
      <CardHeader title="Ask for reviews" description="When an order is marked Done, the customer gets a thank-you with your review link on WhatsApp." />
      <CardBody className="space-y-4">
        <SettingRow title="Send a review request" hint="Once per order. A customer is asked at most once a month.">
          <Switch checked={r.enabled} label="Send a review request" onChange={(v) => setR({ ...r, enabled: v })} />
        </SettingRow>
        <Input
          label="Your review link"
          inputMode="url"
          placeholder="https://g.page/r/your-business/review"
          value={r.link}
          onChange={(e) => setR({ ...r, link: e.target.value })}
          error={r.link && !validLink ? 'Paste the full link, starting with https://' : undefined}
          hint="Google: Business Profile → Ask for reviews → copy the link. Facebook or any page works too."
        />
        <Textarea label="Message" rows={3} value={r.message} onChange={(e) => setR({ ...r, message: e.target.value.slice(0, 600) })} hint="{name} = customer's first name, {business} = your business name, {number} = order number, {link} = your link." />
        <div>
          <p className="mb-1.5 text-sm font-medium">What the customer sees</p>
          <div className="rounded-xl bg-chat p-3">
            <p className="w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-xl rounded-tl-sm bg-surface px-3 py-2 text-sm shadow-sm">{preview}</p>
          </div>
        </div>
        <p className="text-sm text-muted">WhatsApp only delivers it if the customer messaged you in the last 24 hours, which is usual for WhatsApp orders.</p>
        <div className="flex justify-end">
          <Button
            loading={busy}
            disabled={r.enabled && !validLink}
            onClick={() => void save(() => updateSettings(org.id, { bot: { ...org.bot, review: { enabled: r.enabled, link: r.link.trim(), message: r.message.trim() || DEFAULT_REVIEW_MESSAGE } } }))}
          >
            Save
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function HoursTab() {
  const { org } = useOrg();
  const { busy, save } = useSaver();
  const [h, setH] = useState<OpeningHours>(() => org.bot.hours ?? DEFAULT_HOURS);
  const setDay = (i: number, d: DayHours | null) => setH({ ...h, days: h.days.map((x, j) => (j === i ? d : x)) });
  const copyToAll = (d: DayHours) => setH({ ...h, days: h.days.map((x) => (x ? { ...d } : x)) });

  return (
    <Card>
      <CardHeader title="Opening hours" description="Outside these hours the bot tells customers you're closed and when you open again. It still shows your catalogue." />
      <CardBody className="space-y-4">
        <SettingRow title="Use opening hours" hint="Off means the bot treats you as always open."><Switch checked={h.enabled} label="Use opening hours" onChange={(v) => setH({ ...h, enabled: v })} /></SettingRow>
        <div className={cn('space-y-4', !h.enabled && 'pointer-events-none opacity-50')}>
          <div className="divide-y divide-line rounded-xl border border-line">
            {WEEK.map(([i, name]) => {
              const d = h.days[i];
              return (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                  <div className="flex w-36 items-center gap-3">
                    <Switch checked={!!d} label={`Open on ${name}`} onChange={(v) => setDay(i, v ? { open: '08:00', close: '20:00' } : null)} />
                    <span className="font-medium">{name}</span>
                  </div>
                  {d ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input type="time" aria-label={`${name} opens`} value={d.open} onChange={(e) => setDay(i, { ...d, open: e.target.value || d.open })} />
                      <span className="text-muted">to</span>
                      <Input type="time" aria-label={`${name} closes`} value={d.close} onChange={(e) => setDay(i, { ...d, close: e.target.value || d.close })} />
                      <button type="button" onClick={() => copyToAll(d)} className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-raised max-sm:hidden">Copy to all</button>
                    </div>
                  ) : (
                    <span className="text-sm text-muted">Closed</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">If closing time is earlier than opening time, the day runs past midnight.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Time zone" value={h.timezone} onChange={(e) => setH({ ...h, timezone: e.target.value })}>
              {[...new Map<string, string>([[h.timezone, h.timezone], ...TIMEZONES]).entries()].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </div>
          <SettingRow title="Take orders while closed" hint="Customers can still check out. Off: they can browse, and the bot asks them to order when you open.">
            <Switch checked={h.ordersWhenClosed} label="Take orders while closed" onChange={(v) => setH({ ...h, ordersWhenClosed: v })} />
          </SettingRow>
        </div>
        <div className="flex justify-end">
          <Button loading={busy} onClick={() => void save(() => updateSettings(org.id, { bot: { ...org.bot, hours: h } }))}>Save</Button>
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
      <line x1="10" x2={W - 10} y1="56" y2="56" stroke="#D1D5DB" />
      <line x1="10" x2={x(used)} y1="56" y2="56" stroke="#008069" strokeWidth="3" />
      {Array.from({ length: limit + 1 }, (_, k) => (
        <g key={k}>
          <line x1={x(k)} x2={x(k)} y1={k % 5 === 0 ? 30 : 40} y2="56" stroke={k <= used ? '#008069' : '#D1D5DB'} strokeWidth={k % 5 === 0 ? 1.6 : 1} />
          {k % label === 0 && <text x={x(k)} y="74" textAnchor="middle" fontSize="12" fill="#6B7280">{k}</text>}
        </g>
      ))}
      <path d={`M${x(used)} 26 l-6 -10 h12z`} fill="#D97706" />
      <text x={x(used)} y="11" textAnchor="middle" fontSize="13" fontWeight="700" fill="#92400E">{used}</text>
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
      {sub.status === 'past_due' && <p className="rounded-lg bg-danger-soft px-4 py-3 text-danger">Your last renewal didn't go through. Pay again below to keep your plan.</p>}
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
            <p className="tabular text-2xl font-semibold">{money(p.priceMinor, 'GHS').replace('.00', '')}<span className="text-sm font-medium text-muted"> / month</span></p>
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
