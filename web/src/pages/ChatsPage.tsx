import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { limit, orderBy, query, where } from 'firebase/firestore';
import { DraftCard } from '@/components/orders/DraftCard';
import { NextStepButton, OrderDrawer, PayBadge, StatusBadge, itemsText } from '@/components/orders/OrderBits';
import { Badge, Button, Icon, SearchInput } from '@/components/ui';
import { isOpen } from '@/config/business';
import { customerRef, customersRef, draftOrdersRef, messagesRef, ordersRef } from '@/firebase';
import { useCollection } from '@/hooks/useCollection';
import { useDocument } from '@/hooks/useDocument';
import { useOrg } from '@/hooks/usePermission';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useToast } from '@/hooks/useToast';
import { markChatRead, markHandled, sendReply } from '@/services';
import type { Customer, DraftOrder, Message, WithId } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';
import { money, formatPhone, initials, shortWhen, time } from '@/utils/format';

const QUICK = ['Your order is on the way', 'Please send the MoMo Transaction ID', "We're closed now. We open at 8am", 'Thank you! Come again'];

export function ChatsPage() {
  usePageTitle('Chats');
  const { waId } = useParams();
  const { org } = useOrg();
  const [q, setQ] = useState('');
  const list = useCollection(useMemo(() => query(customersRef(org.id), orderBy('lastMessageAt', 'desc'), limit(150)), [org.id]));
  const customers = list.status === 'ready' ? list.data.filter((c) => c.lastMessageAt) : [];
  const shown = customers.filter((c) => `${c.name ?? ''} ${c.phone}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={cn('grid h-full min-h-0 grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px]')}>
      <aside className={cn('flex min-h-0 flex-col border-r border-line bg-surface', waId && 'hidden md:flex')} aria-label="Conversations">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Chats</h1>
            <Badge tone={org.bot.menuEnabled ? 'ok' : 'neutral'} className="max-md:hidden">{org.bot.menuEnabled ? 'Bot on' : 'Bot off'}</Badge>
          </div>
          <SearchInput value={q} onChange={setQ} placeholder="Search name or number" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.status === 'ready' && shown.length === 0 && (
            <p className="p-6 text-center text-sm text-muted">{org.whatsapp.connected ? 'No chats yet. They appear here as customers message you.' : 'Connect WhatsApp in Settings to start receiving chats.'}</p>
          )}
          {shown.map((c) => {
            const waiting = c.unreadCount > 0 || c.needsHuman;
            return (
              <Link
                key={c.id}
                to={`/chats/${c.id}`}
                aria-current={waId === c.id}
                className={cn('grid grid-cols-[48px_1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-raised', waId === c.id && 'bg-brand-soft')}
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink">{initials(c.name ?? c.waProfileName)}</span>
                <span className="min-w-0 border-b border-line py-1.5">
                  <span className="block truncate font-semibold">{c.name ?? c.waProfileName ?? formatPhone(c.phone)}</span>
                  <span className="flex items-center gap-1 text-[14px] text-muted">
                    {c.lastMessageOut && <Icon name="ticks" className="h-4 w-4 shrink-0 text-[#3B7BBF]" />}
                    <span className="truncate">{c.lastMessageText ?? formatPhone(c.phone)}</span>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1.5 self-stretch border-b border-line py-1.5 text-xs">
                  <span className={cn('tabular', waiting ? 'font-semibold text-ok' : 'text-muted')}>{shortWhen(c.lastMessageAt)}</span>
                  {waiting && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ok px-1.5 text-[11px] font-semibold text-white" aria-label={c.unreadCount ? `${c.unreadCount} unread` : 'Waiting for a reply'}>
                      {c.unreadCount || ''}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </aside>
      {waId ? <Thread key={waId} waId={waId} /> : (
        <section className="hidden place-items-center bg-chat p-8 text-center text-muted md:grid">
          <div>
            <Icon name="chat" className="mx-auto h-10 w-10" />
            <p className="mt-2">Pick a chat to read and reply.<br />Orders the bot takes show up here too.</p>
          </div>
        </section>
      )}
    </div>
  );
}

/** "Today", "Yesterday", or "Mon 9 Nov" — the date chips between messages. */
function dayLabel(at: number): string {
  const d = new Date(at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d >= today) return 'Today';
  if (d >= new Date(today.getTime() - 86400000)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

type Row = { kind: 'msg'; at: number; msg: WithId<Message> } | { kind: 'draft'; at: number; draft: WithId<DraftOrder> };

function Thread({ waId }: { waId: string }) {
  const { org } = useOrg();
  const toast = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [orderOpen, setOrderOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const customer = useDocument(useMemo(() => customerRef(org.id, waId), [org.id, waId]));
  const messages = useCollection(useMemo(() => query(messagesRef(org.id, waId), orderBy('createdAt', 'desc'), limit(200)), [org.id, waId]));
  const drafts = useCollection(useMemo(() => query(draftOrdersRef(org.id), where('customerId', '==', waId), limit(20)), [org.id, waId]));
  const orders = useCollection(useMemo(() => query(ordersRef(org.id), where('customerId', '==', waId), orderBy('createdAt', 'desc'), limit(10)), [org.id, waId]));

  const c = customer.status === 'ready' ? customer.data : null;
  useEffect(() => {
    if (c && c.unreadCount > 0) void markChatRead(org.id, waId).catch(() => undefined);
  }, [c, org.id, waId]);

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    if (messages.status === 'ready') for (const m of messages.data) r.push({ kind: 'msg', at: m.createdAt?.toMillis() ?? Date.now(), msg: m });
    if (drafts.status === 'ready') for (const d of drafts.data) r.push({ kind: 'draft', at: d.createdAt.toMillis() + 1, draft: d });
    return r.sort((a, b) => a.at - b.at);
  }, [messages, drafts]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length]);

  const latest = orders.status === 'ready' ? orders.data.find((o) => isOpen(o.status)) ?? orders.data[0] : undefined;
  const lastIn = messages.status === 'ready' ? messages.data.find((m) => m.direction === 'in')?.createdAt?.toMillis() : undefined;
  const windowHours = lastIn ? Math.max(0, 24 - Math.floor((Date.now() - lastIn) / 3600000)) : 0;

  const box = useRef<HTMLTextAreaElement>(null);
  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      await sendReply(waId, body);
      setText('');
      if (box.current) box.current.style.height = '';
    } catch (e) {
      toast.error(toMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="flex min-h-0 flex-col bg-chat" aria-label="Conversation">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <button type="button" onClick={() => navigate('/chats')} className="grid h-10 w-10 place-items-center rounded-full hover:bg-raised md:hidden" aria-label="Back to chats">
            <Icon name="back" />
          </button>
          <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-ink">{initials(c?.name ?? c?.waProfileName)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{c?.name ?? c?.waProfileName ?? formatPhone(`+${waId}`)}</p>
            <p className="tabular truncate text-[12.5px] text-muted">{formatPhone(`+${waId}`)}{windowHours > 0 && <span className="md:hidden"> · {windowHours}h to reply</span>}</p>
          </div>
          {c?.needsHuman && (
            <Button size="sm" variant="secondary" className="max-md:hidden" onClick={() => void markHandled(org.id, waId)}>
              <Icon name="check" className="h-4 w-4" />Mark handled
            </Button>
          )}
          {latest && <Button size="sm" variant="secondary" className="max-md:hidden xl:hidden" onClick={() => setOrderOpen(latest.id)}>#{latest.number}</Button>}
          {/* Phones: everything extra lives behind ⋮, like WhatsApp. */}
          <div className="relative md:hidden">
            <button type="button" onClick={() => setMenu(!menu)} aria-label="More options" aria-expanded={menu} className="grid h-10 w-10 place-items-center rounded-full hover:bg-raised">
              <Icon name="more" className="rotate-90" />
            </button>
            {menu && (
              <>
                <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg" role="menu">
                  {latest && (
                    <button type="button" role="menuitem" className="block w-full px-4 py-3 text-left hover:bg-raised" onClick={() => { setMenu(false); setOrderOpen(latest.id); }}>
                      View {latest.hasProducts ? 'order' : 'booking'} #{latest.number}
                    </button>
                  )}
                  <Link role="menuitem" to={`/customers?c=${waId}`} className="block px-4 py-3 hover:bg-raised">Customer details</Link>
                  {c?.needsHuman && (
                    <button type="button" role="menuitem" className="block w-full px-4 py-3 text-left hover:bg-raised" onClick={() => { setMenu(false); void markHandled(org.id, waId); }}>
                      Mark handled
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-[6%] sm:py-4">
          {rows.map((r, i) => {
            const day = dayLabel(r.at);
            const newDay = i === 0 || dayLabel(rows[i - 1].at) !== day;
            return (
              <Fragment key={r.kind === 'draft' ? r.draft.id : r.msg.id}>
                {newDay && <span className="my-2 self-center rounded-lg bg-surface/90 px-3 py-1 text-xs font-medium text-muted shadow-sm">{day}</span>}
                {r.kind === 'draft' ? <DraftCard draft={r.draft} /> : <Bubble m={r.msg} />}
              </Fragment>
            );
          })}
        </div>
        <div className="bg-chat px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 md:border-t md:border-line md:bg-surface md:px-3.5 md:pb-3 md:pt-2">
          <div className={cn('flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]', !quick && 'max-md:hidden')}>
            {QUICK.map((qr) => (
              <button key={qr} type="button" onClick={() => { setText(qr); setQuick(false); }} className="shrink-0 rounded-full border border-line2 bg-surface px-3 py-1.5 text-[13px] hover:bg-raised">
                {qr}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => setQuick(!quick)} aria-label="Quick replies" aria-pressed={quick} className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-muted md:hidden', quick && 'text-ok')}>
              <Icon name="spark" />
            </button>
            <label className="sr-only" htmlFor="reply">Reply</label>
            <textarea
              id="reply"
              ref={box}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Grow with the message, up to max-h.
                e.target.style.height = 'auto';
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Type a reply"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-[22px] border border-line2 bg-white px-4 py-2.5 text-base focus:border-brand focus:outline-none max-md:border-transparent max-md:shadow-sm"
            />
            <button type="button" onClick={() => void send()} disabled={sending || !text.trim()} aria-label="Send reply" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok text-white hover:bg-ok-ink disabled:opacity-50">
              <Icon name="send" />
            </button>
          </div>
          <p className={cn('mt-1.5 text-xs text-muted', windowHours > 0 && 'max-md:hidden')}>
            <Icon name="clock" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            {windowHours > 0 ? `Free reply window open · ${windowHours}h left.` : 'Reply window closed. Only approved templates reach this customer until they message again.'}
          </p>
        </div>
      </section>

      <aside className="hidden min-h-0 overflow-y-auto border-l border-line bg-surface p-5 xl:block" aria-label="Customer and order">
        {c && <CustomerSummary c={c} />}
        {latest ? (
          <div className="mt-5">
            <h3 className="mb-2 font-semibold">Latest {latest.hasProducts ? 'order' : 'booking'}</h3>
            <button type="button" onClick={() => setOrderOpen(latest.id)} className="w-full overflow-hidden rounded-2xl border border-line text-left hover:border-line2">
              <div className="flex items-center justify-between border-b border-line px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                <span>#{latest.number} · {time(latest.createdAt)}</span>
                <StatusBadge order={latest} />
              </div>
              <div className="space-y-2 p-3.5 text-sm">
                <p>{itemsText(latest)}</p>
                <p className="flex items-center justify-between"><b className="tabular">{money(latest.totalMinor)}</b><PayBadge order={latest} /></p>
              </div>
            </button>
            <div className="mt-3"><NextStepButton order={latest} size="md" /></div>
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted">No orders yet.</p>
        )}
      </aside>
      <OrderDrawer orderId={orderOpen} onClose={() => setOrderOpen(null)} />
    </>
  );
}

function CustomerSummary({ c }: { c: WithId<Customer> }) {
  return (
    <section>
      <p className="text-lg font-semibold">{c.name ?? c.waProfileName ?? 'Customer'}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted">Orders</dt><dd className="tabular text-right">{c.orderCount}</dd>
        <dt className="text-muted">Spent</dt><dd className="tabular text-right">{money(c.totalSpentMinor)}</dd>
        {c.address && (<><dt className="text-muted">Address</dt><dd className="text-right">{c.address}</dd></>)}
      </dl>
      {c.note && <p className="mt-3 rounded-lg bg-raised px-3 py-2 text-sm">{c.note}</p>}
      <Link to={`/customers?c=${c.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-ink hover:underline">
        Customer details <Icon name="arrow" className="h-4 w-4" />
      </Link>
    </section>
  );
}

function Bubble({ m }: { m: WithId<Message> }) {
  const out = m.direction === 'out';
  return (
    <div className={cn('flex', out && 'justify-end')}>
      <div className={cn('max-w-[86%] rounded-[10px] px-2.5 pb-1 pt-1.5 shadow-sm sm:max-w-[min(520px,78%)]', out ? 'rounded-tr-sm bg-brand-soft' : 'rounded-tl-sm bg-surface', m.failed && 'ring-1 ring-danger')}>
        {m.extra?.mediaUrl && (
          m.type === 'video'
            ? <video src={m.extra.mediaUrl} controls preload="metadata" className="mb-1 max-h-72 w-full rounded-md bg-black" />
            : <img src={m.extra.mediaUrl} alt="Photo sent to the customer" loading="lazy" className="mb-1 max-h-72 w-full rounded-md object-cover" />
        )}
        {(m.body || !m.extra?.mediaUrl) && <p className="whitespace-pre-wrap break-words">{m.body || <i className="text-muted">({m.type} message)</i>}</p>}
        {m.extra?.options && m.extra.options.length > 0 && (
          <div className="-mx-2.5 mt-2 border-t border-black/10 pt-1.5 text-center text-sm font-semibold text-[#1F7A9C]">
            {m.type === 'list' ? <span><Icon name="list" className="mr-1 inline h-4 w-4 align-[-3px]" />{m.extra.button}</span> : m.extra.options.join(' · ')}
          </div>
        )}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-muted">
          {m.failed && <span className="text-danger">Not delivered</span>}
          {out && m.by === 'bot' && <span className="font-medium text-ok-ink">Bot ·</span>}
          {out && m.by === 'merchant_phone' && <span className="font-medium text-ok-ink">From your phone ·</span>}
          <span className="tabular">{time(m.createdAt)}</span>
          {out && !m.failed && <Icon name="ticks" className="h-4 w-4 text-[#3B7BBF]" />}
        </span>
      </div>
    </div>
  );
}
