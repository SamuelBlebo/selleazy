import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { limit, orderBy, query } from 'firebase/firestore';
import { Logo } from '@/components/layout/Logo';
import { WhatsAppConnectButton, type ConnectMode } from '@/components/settings/WhatsAppConnect';
import { SetupProgress } from '@/components/setup/SetupProgress';
import { Button, Icon, Input, Textarea } from '@/components/ui';
import { plural } from '@/config/business';
import { planById } from '@/config/plans';
import { customersRef, itemsRef, ordersRef, paymentsRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { createItem, updateSettings, type ItemInput } from '@/services';
import type { SetupStepId } from '@/types';
import { trackSetupStep } from '@/utils/analyticsTracking';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';
import { money, toMinor } from '@/utils/format';
import { parsePriceList, type ParsedLine } from '@/utils/priceList';

/**
 * Setup wizard, steps 2 to 6 (step 1, the business, is OnboardingPage).
 * Whether a step is done is read from the real data (WhatsApp connected,
 * items listed, MoMo numbers saved, first message in), so progress follows
 * the merchant to any device. Only "do this later" and "finished" are
 * stored, in organizations/{id}.setup.
 */
const STEPS: Array<{ id: SetupStepId | 'done'; title: string }> = [
  { id: 'whatsapp', title: 'Connect WhatsApp' },
  { id: 'items', title: 'Add what you sell' },
  { id: 'pay', title: 'Get paid' },
  { id: 'test', title: 'Test it' },
  { id: 'done', title: 'Done' },
];
/** Step 1 (the business) is already behind them. */
const TOTAL = STEPS.length + 1;

export function SetupPage() {
  usePageTitle('Set up SellEazy');
  const { org, role } = useOrg();
  const items = useCollection(useMemo(() => query(itemsRef(org.id), limit(200)), [org.id]));
  if (role !== 'owner') return <Navigate to="/today" replace />;
  // Wait for the items, so the wizard opens on the right step.
  if (items.status !== 'ready') return <div className="min-h-screen bg-[#FBF6EC]" />;
  return <Wizard itemCount={items.data.length} />;
}

function Wizard({ itemCount }: { itemCount: number }) {
  const { org, words } = useOrg();
  const done: Record<SetupStepId, boolean> = {
    whatsapp: org.whatsapp.connected,
    items: itemCount > 0,
    pay: Boolean(org.momo.mtn || org.momo.telecel || org.momo.airteltigo),
    test: false,
  };
  const later = org.setup?.later ?? [];
  const firstOpen = STEPS.findIndex((s) => s.id !== 'done' && !done[s.id] && !later.includes(s.id));
  const [index, setIndex] = useState(() => (firstOpen < 0 ? STEPS.length - 1 : firstOpen));

  const step = STEPS[index];
  const next = () => setIndex((i) => Math.min(STEPS.length - 1, i + 1));
  const back = index > 0 ? () => setIndex((i) => i - 1) : null;
  const putOff = (id: SetupStepId) => {
    void trackSetupStep(id, 'later');
    void updateSettings(org.id, { setup: { later: [...new Set([...later, id])], finished: org.setup?.finished ?? false } }).catch(() => undefined);
    next();
  };
  const finishStep = (id: SetupStepId) => {
    void trackSetupStep(id, 'done');
    if (later.includes(id)) void updateSettings(org.id, { setup: { later: later.filter((l) => l !== id), finished: org.setup?.finished ?? false } }).catch(() => undefined);
    next();
  };

  return (
    <div className="min-h-screen bg-[#FBF6EC] text-[#14231D]">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-5 sm:px-6">
        <Logo to="/today" />
        <Link to="/today" className="text-sm font-medium text-[#5B6B64] hover:text-[#14231D]">Skip to dashboard</Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
        <SetupProgress step={index + 2} total={TOTAL} label={step.title} />
        <div className="mt-6 rounded-3xl border border-[#E8DFCC] bg-white p-5 shadow-sm sm:p-8">
          {step.id === 'whatsapp' && <WhatsAppStep connected={done.whatsapp} onNext={() => finishStep('whatsapp')} onLater={() => putOff('whatsapp')} />}
          {step.id === 'items' && <ItemsStep count={itemCount} itemWord={words.item} onNext={() => finishStep('items')} onLater={() => putOff('items')} />}
          {step.id === 'pay' && <PayStep onNext={() => finishStep('pay')} onLater={() => putOff('pay')} />}
          {step.id === 'test' && <TestStep onNext={() => finishStep('test')} onLater={() => putOff('test')} />}
          {step.id === 'done' && <DoneStep />}
        </div>
        {back && step.id !== 'done' && (
          <button type="button" onClick={back} className="mt-4 text-sm font-medium text-[#5B6B64] hover:text-[#14231D]">← Back</button>
        )}
      </main>
    </div>
  );
}

/* --------------------------------- Pieces --------------------------------- */

function StepHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-[#4A5A53]">{sub}</p>
    </div>
  );
}

function Footer({ onNext, onLater, nextLabel = 'Continue', nextDisabled, busy }: { onNext: () => void; onLater?: () => void; nextLabel?: string; nextDisabled?: boolean; busy?: boolean }) {
  return (
    <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
      {onLater ? (
        <button type="button" onClick={onLater} className="py-2 text-sm font-semibold text-[#5B6B64] underline-offset-2 hover:underline">I'll do this later</button>
      ) : <span />}
      <Button loading={busy} disabled={nextDisabled} onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}

function Choice({ checked, onChange, title, hint, badge }: { checked: boolean; onChange: () => void; title: string; hint: string; badge?: string }) {
  return (
    <label className={cn('flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors', checked ? 'border-[#0B7A6B] bg-[#EEF8F2]' : 'border-[#E8DFCC] hover:border-[#CFC3A8]')}>
      <input type="radio" className="mt-1 accent-[#0B7A6B]" checked={checked} onChange={onChange} />
      <span>
        <span className="flex flex-wrap items-center gap-2 font-semibold">{title}{badge && <span className="rounded-full bg-[#F5B82E] px-2 py-0.5 text-[11px] font-bold">{badge}</span>}</span>
        <span className="mt-0.5 block text-sm text-[#4A5A53]">{hint}</span>
      </span>
    </label>
  );
}

/* ------------------------------- 2. WhatsApp ------------------------------ */

function WhatsAppStep({ connected, onNext, onLater }: { connected: boolean; onNext: () => void; onLater: () => void }) {
  const { org } = useOrg();
  const [mode, setMode] = useState<ConnectMode>('coexistence');
  if (connected) {
    return (
      <>
        <StepHead title="WhatsApp is connected" sub={`Customers who message ${org.whatsapp.displayPhoneNumber ?? 'your number'} now get your catalogue.`} />
        <p className="flex items-center gap-2 rounded-2xl bg-[#EEF8F2] px-4 py-3 font-semibold text-[#0B7A6B]"><Icon name="check" /> {org.whatsapp.displayPhoneNumber}</p>
        <Footer onNext={onNext} />
      </>
    );
  }
  return (
    <>
      <StepHead title="Connect your WhatsApp" sub="SellEazy answers customers on your WhatsApp Business number." />
      <div className="space-y-3">
        <Choice
          checked={mode === 'coexistence'}
          onChange={() => setMode('coexistence')}
          title="Use my current WhatsApp Business number"
          badge="Recommended"
          hint="Keep using the WhatsApp Business app on your phone. You'll scan a QR code with it."
        />
        <Choice checked={mode === 'cloud'} onChange={() => setMode('cloud')} title="Use a new number" hint="A number that isn't on WhatsApp yet. It works through SellEazy only." />
      </div>
      <div className="mt-6">
        <WhatsAppConnectButton mode={mode} />
        <p className="mt-2 text-xs text-[#5B6B64]">You'll sign in with Facebook. SellEazy never sees your password.</p>
      </div>
      <Footer onNext={onNext} onLater={onLater} nextDisabled nextLabel="Connect first" />
    </>
  );
}

/* --------------------------------- 3. Items -------------------------------- */

type Row = { name: string; price: string };

function ItemsStep({ count, itemWord, onNext, onLater }: { count: number; itemWord: string; onNext: () => void; onLater: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const [how, setHow] = useState<'type' | 'paste'>('type');
  const [rows, setRows] = useState<Row[]>([{ name: '', price: '' }, { name: '', price: '' }, { name: '', price: '' }]);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parsePriceList(pasted), [pasted]);
  const typed: ParsedLine[] = rows
    .map((r) => ({ name: r.name.trim(), priceMinor: toMinor(r.price) ?? -1 }))
    .filter((r) => r.name.length >= 2 && r.priceMinor >= 0);
  const ready = how === 'type' ? typed : parsed.items;
  const limitLeft = planById(org.subscription.plan).itemLimit;
  const room = limitLeft === null ? Infinity : Math.max(0, limitLeft - count);
  const toSave = ready.slice(0, room);
  const service = org.businessType === 'services';

  const save = async () => {
    if (!toSave.length) return;
    setBusy(true);
    try {
      for (const line of toSave) {
        const input: ItemInput = {
          kind: service ? 'service' : 'product',
          name: line.name,
          description: '',
          category: '',
          priceMinor: line.priceMinor,
          active: true,
          aliases: [],
          sku: null,
          trackStock: false,
          stock: 0,
          lowStockAt: 0,
          durationMinutes: service ? 60 : null,
          requiresBooking: service,
          featured: false,
        };
        await createItem(org.id, input);
      }
      toast.success(`${toSave.length} added.`);
      onNext();
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <StepHead
        title="Add what you sell"
        sub={count > 0 ? `You have ${count} ${count > 1 ? plural(itemWord) : itemWord} already. Add more, or continue. You can add photos later.` : 'Just names and prices for now. You can add photos later.'}
      />
      <div role="tablist" className="mb-5 inline-flex rounded-full bg-[#F4EDDE] p-1">
        {([['type', 'Type them'], ['paste', 'Paste a price list']] as const).map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={how === id} onClick={() => setHow(id)} className={cn('rounded-full px-4 py-1.5 text-sm font-semibold', how === id ? 'bg-[#0E3B2E] text-white' : 'text-[#4A5A53]')}>
            {label}
          </button>
        ))}
      </div>

      {how === 'type' ? (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7.5rem] gap-2">
              <Input aria-label={`Name ${i + 1}`} placeholder={i === 0 ? (org.businessType === 'food' ? 'Jollof with chicken' : service ? 'Box braids' : 'Black sneakers') : 'Name'} value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input aria-label={`Price ${i + 1}`} inputMode="decimal" placeholder="GH₵" value={r.price} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            </div>
          ))}
          <button type="button" onClick={() => setRows([...rows, { name: '', price: '' }])} className="flex items-center gap-1 text-sm font-semibold text-[#0B7A6B]"><Icon name="plus" className="h-4 w-4" /> Add another</button>
        </div>
      ) : (
        <div>
          <Textarea
            label="Paste your price list"
            rows={7}
            placeholder={'Jollof with chicken - 45\nWaakye special 40\nKenkey GH₵10'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            hint="One item per line, with the price at the end. From WhatsApp, Notes or anywhere."
          />
          {parsed.problems.length > 0 && (
            <p className="mt-2 rounded-xl bg-[#FDF0D2] px-3 py-2 text-sm text-[#8A5A12]">
              No price found on: {parsed.problems.slice(0, 3).join(', ')}{parsed.problems.length > 3 ? ` and ${parsed.problems.length - 3} more` : ''}. Add a price at the end of those lines.
            </p>
          )}
        </div>
      )}

      {ready.length > 0 && <WhatsAppPreview name={org.name} lines={toSave} />}
      {ready.length > toSave.length && (
        <p className="mt-3 text-sm text-[#8A5A12]">Your plan lists {limitLeft} {plural(itemWord)}. The first {toSave.length} will be added; upgrade any time for more.</p>
      )}

      <Footer
        busy={busy}
        onLater={onLater}
        onNext={() => (toSave.length ? void save() : onNext())}
        nextDisabled={!toSave.length && count === 0}
        nextLabel={toSave.length ? `Add ${toSave.length} and continue` : 'Continue'}
      />
    </>
  );
}

/** How the catalogue will look to a customer on WhatsApp. */
function WhatsAppPreview({ name, lines }: { name: string; lines: ParsedLine[] }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-sm font-semibold text-[#5B6B64]">How customers will see it</p>
      <div className="rounded-2xl bg-[#ECE5DD] p-4">
        <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-[14px] shadow-sm">
          <p className="font-semibold">{name}</p>
          <ul className="mt-1 space-y-0.5">
            {lines.slice(0, 8).map((l) => <li key={l.name} className="flex justify-between gap-4"><span>{l.name}</span><span className="tabular text-[#5B6B64]">{money(l.priceMinor, 'GHS')}</span></li>)}
            {lines.length > 8 && <li className="text-[#5B6B64]">+ {lines.length - 8} more</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- 4. Pay --------------------------------- */

function PayStep({ onNext, onLater }: { onNext: () => void; onLater: () => void }) {
  const { org } = useOrg();
  const toast = useToast();
  const [m, setM] = useState({ mtn: org.momo.mtn ?? '', telecel: org.momo.telecel ?? '', airteltigo: org.momo.airteltigo ?? '', accountName: org.momo.accountName ?? '' });
  const [busy, setBusy] = useState(false);
  const any = [m.mtn, m.telecel, m.airteltigo].some((v) => v.replace(/\D/g, '').length >= 9);
  const save = async () => {
    setBusy(true);
    try {
      await updateSettings(org.id, { momo: { mtn: m.mtn.trim() || null, telecel: m.telecel.trim() || null, airteltigo: m.airteltigo.trim() || null, accountName: m.accountName.trim() || null } });
      onNext();
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <StepHead title="How customers pay you" sub="After each order the bot sends these MoMo numbers. Customers reply with the Transaction ID and you check it in Payments." />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="MTN MoMo number" inputMode="tel" placeholder="024 000 0000" value={m.mtn} onChange={(e) => setM({ ...m, mtn: e.target.value })} />
        <Input label="Telecel Cash number" inputMode="tel" placeholder="Optional" value={m.telecel} onChange={(e) => setM({ ...m, telecel: e.target.value })} />
        <Input label="AirtelTigo Money number" inputMode="tel" placeholder="Optional" value={m.airteltigo} onChange={(e) => setM({ ...m, airteltigo: e.target.value })} />
        <Input label="Name on the account" value={m.accountName} onChange={(e) => setM({ ...m, accountName: e.target.value })} hint="So customers know they're paying you." />
      </div>
      <Footer busy={busy} onLater={onLater} onNext={() => void save()} nextDisabled={!any} />
    </>
  );
}

/* --------------------------------- 5. Test --------------------------------- */

function TestStep({ onNext, onLater }: { onNext: () => void; onLater: () => void }) {
  const { org, words } = useOrg();
  const firstChat = useCollection(useMemo(() => query(customersRef(org.id), orderBy('lastMessageAt', 'desc'), limit(1)), [org.id]));
  const firstOrder = useCollection(useMemo(() => query(ordersRef(org.id), limit(1)), [org.id]));
  const firstPayment = useCollection(useMemo(() => query(paymentsRef(org.id), limit(1)), [org.id]));
  const has = (s: { status: string; data?: unknown[] }) => s.status === 'ready' && (s.data?.length ?? 0) > 0;
  const checks = [
    { label: 'A message arrives', done: firstChat.status === 'ready' && firstChat.data.some((c) => c.lastMessageAt) },
    { label: `An ${words.order} is placed`, done: has(firstOrder) },
    { label: 'A payment comes in', done: has(firstPayment) },
  ];
  const phone = org.whatsapp.displayPhoneNumber;
  const digits = phone?.replace(/\D/g, '');

  if (!org.whatsapp.connected) {
    return (
      <>
        <StepHead title="Test it" sub="Connect WhatsApp first, then send yourself a test order here." />
        <Link to="/settings/whatsapp" className="font-semibold text-[#0B7A6B] underline-offset-2 hover:underline">Connect WhatsApp →</Link>
        {/* Nothing to test yet, so moving on only puts it off. */}
        <Footer onNext={onLater} nextLabel="Continue" />
      </>
    );
  }
  return (
    <>
      <StepHead title="Try it like a customer" sub={`From another phone, send "hi" to ${phone}. Order something and follow the steps. This list ticks itself.`} />
      {digits && (
        <a href={`https://wa.me/${digits}?text=hi`} target="_blank" rel="noreferrer" className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 font-semibold text-white hover:bg-[#1EBE5A]">
          <Icon name="chat" className="h-4 w-4" /> Open WhatsApp
        </a>
      )}
      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-3">
            <span className={cn('grid h-7 w-7 place-items-center rounded-full border-2 transition-colors', c.done ? 'border-[#0B7A6B] bg-[#0B7A6B] text-white' : 'border-[#CFC3A8]')}>
              {c.done ? <Icon name="check" className="h-4 w-4" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-[#CFC3A8]" />}
            </span>
            <span className={cn('font-medium', c.done ? 'text-[#0B7A6B]' : 'text-[#14231D]')}>{c.label}</span>
          </li>
        ))}
      </ul>
      <Footer onNext={onNext} onLater={checks[0].done ? undefined : onLater} nextLabel={checks[1].done ? 'Continue' : 'Skip the test'} />
    </>
  );
}

/* --------------------------------- 6. Done --------------------------------- */

function DoneStep() {
  const { org } = useOrg();
  const later = org.setup?.later ?? [];
  const markFinished = () => void updateSettings(org.id, { setup: { later, finished: true } }).catch(() => undefined);
  const nextSteps = [
    { to: '/settings/team', icon: 'users' as const, title: 'Invite your team', hint: 'Give staff their own login and role.' },
    { to: '/catalog', icon: 'image' as const, title: 'Add photos', hint: 'Items with photos sell better on WhatsApp.' },
    { to: '/settings/hours', icon: 'clock' as const, title: 'Set opening hours', hint: 'The bot tells late customers when you open.' },
  ];
  return (
    <>
      <StepHead title="You're ready to sell" sub={later.length ? "A few steps are waiting on your Today page whenever you're ready." : 'Customers can now order from you on WhatsApp.'} />
      <ul className="space-y-2">
        {nextSteps.map((s) => (
          <li key={s.to}>
            <Link to={s.to} onClick={markFinished} className="flex items-center gap-4 rounded-2xl border border-[#E8DFCC] p-4 hover:bg-[#FBF6EC]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#FDF0D2] text-[#B7791F]"><Icon name={s.icon} className="h-5 w-5" /></span>
              <span><span className="block font-semibold">{s.title}</span><span className="block text-sm text-[#4A5A53]">{s.hint}</span></span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/today" onClick={markFinished} className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0E3B2E] font-semibold text-white hover:bg-[#14503F]">
        Go to my dashboard <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </>
  );
}
