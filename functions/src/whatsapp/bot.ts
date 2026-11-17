import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { closedNotice, hoursText, isOpen, type OpeningHours } from '../domain/hours';
import type { BusinessType, CatalogItem, Fulfilment, ItemKind, OrgFeatures, WhatsappAccount } from '../domain/model';
import { formatMoney, parseAmount, type Currency } from '../domain/money';
import { DRAFT_THRESHOLD, nlu, readWhen, type NluCatalogItem } from '../nlu';
import { matchFaq, type Faq } from '../nlu/faq';
import { guessNetwork } from '../payments/providers';
import { placeOrder } from '../services/orders';
import { submitPayment } from '../services/payments';
import { customerRef, draftOrdersRef, itemsRef, messagesRef, ordersRef, orgRef, sessionsRef } from '../tenant';
import { Outbox } from './client';
import { isBotPaused } from './coexistence';
import { FULFILMENT_LABEL, formatDuration, formatWhen, linesSummary, paymentInstructions, vocabulary } from './copy';

/**
 * The WhatsApp ordering bot. Ported from OrderFlow's Cloudflare Worker
 * (worker/src/bot.ts) to the Admin SDK and widened for every kind of
 * merchant: products and services in one cart, delivery / pickup /
 * appointment / on-site, a requested time for bookings, typed orders turned
 * into drafts a human confirms (ShopFlow's idea), and MoMo Transaction IDs
 * captured for manual verification.
 */

export interface InboundMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  interactive?: { type: string; list_reply?: { id: string; title: string }; button_reply?: { id: string; title: string } };
}

type Step = 'idle' | 'browsing' | 'with_human' | 'awaiting_qty' | 'awaiting_name' | 'awaiting_fulfilment' | 'awaiting_address' | 'awaiting_time' | 'awaiting_confirm';

interface CartLine {
  itemId: string;
  kind: ItemKind;
  name: string;
  priceMinor: number;
  quantity: number;
  needsTime: boolean;
}

interface Session {
  step: Step;
  cart: CartLine[];
  catalogIds: string[];
  catalogPage: number;
  pendingItemId: string | null;
  name: string | null;
  fulfilment: Fulfilment | null;
  address: string | null;
  timeRequest: string | null;
  timeAt: string | null;
  lastHandoffAt: number | null;
  handledMessageIds: string[];
}

const EMPTY: Session = {
  step: 'idle', cart: [], catalogIds: [], catalogPage: 0, pendingItemId: null, name: null, fulfilment: null,
  address: null, timeRequest: null, timeAt: null, lastHandoffAt: null, handledMessageIds: [],
};

const A = {
  shop: 'menu:shop', human: 'menu:human', browse: 'menu:browse', more: 'menu:more', cart: 'menu:cart', addMore: 'cart:more', checkout: 'cart:checkout',
  clear: 'cart:clear', confirm: 'order:confirm', cancel: 'order:cancel',
} as const;

const PAGE = 9;
const words = (ctx: Ctx) => vocabulary(ctx.org.businessType, ctx.org.category);
/** After "Need help" the bot stays quiet this long, so staff can talk without it butting in. */
const HUMAN_QUIET_MS = 4 * 60 * 60000;
const GREETINGS = ['hi', 'hello', 'hey', 'start', 'good morning', 'good afternoon', 'good evening', 'akwaaba'];
const CATALOG_WORDS = ['menu', 'shop', 'catalog', 'catalogue', 'products', 'items', 'services', 'price list', 'prices'];

interface Org {
  name: string;
  area: string | null;
  phone: string | null;
  businessType: BusinessType;
  category: string | null;
  features: OrgFeatures;
  deliveryFeeMinor: number;
  currency: Currency;
  greeting: string;
  menuBot: boolean;
  freeText: boolean;
  faqs: Faq[];
  hours: OpeningHours | null;
  momo: Record<string, string | null> | undefined;
  suspended: boolean;
}

interface Ctx {
  orgId: string;
  waId: string;
  profileName: string;
  org: Org;
  s: Session;
  out: Outbox;
}

export async function handleInbound(account: WhatsappAccount, message: InboundMessage, profileName: string): Promise<void> {
  const orgId = account.organizationId;
  const waId = message.from;
  const sessionDoc = sessionsRef(orgId).doc(waId);

  const [sessionSnap, orgSnap, custSnap] = await Promise.all([sessionDoc.get(), orgRef(orgId).get(), customerRef(orgId, waId).get()]);
  const s: Session = { ...EMPTY, ...(sessionSnap.data() as Partial<Session> | undefined) };
  if (s.handledMessageIds.includes(message.id)) return; // Meta retries; never answer twice.

  const now = Timestamp.now();
  const body = readableBody(message);
  await messagesRef(orgId, waId).doc(message.id).set({
    direction: 'in', by: 'customer', type: message.type, body, waMessageId: message.id, createdAt: now,
  });
  await customerRef(orgId, waId).set(
    {
      phone: `+${waId}`,
      waProfileName: profileName || null,
      lastMessageAt: now,
      lastMessageText: (body ?? `(${message.type})`).slice(0, 120),
      lastMessageOut: false,
      unreadCount: FieldValue.increment(1),
      updatedAt: now,
      ...(custSnap.exists
        ? {}
        : { name: profileName || null, address: null, note: null, orderCount: 0, totalSpentMinor: 0, lastOrderAt: null, needsHuman: false, tags: [], createdAt: now }),
    },
    { merge: true },
  );

  const o = orgSnap.data() ?? {};
  const org: Org = {
    name: (o.name as string) ?? 'our shop',
    area: (o.area as string) ?? null,
    phone: (o.phone as string) ?? null,
    businessType: (o.businessType as BusinessType) ?? 'retail',
    category: (o.category as string) ?? null,
    features: (o.features as OrgFeatures) ?? { kitchen: false, bookings: false, delivery: true, pickup: true, onSite: false },
    deliveryFeeMinor: (o.deliveryFeeMinor as number) ?? 0,
    currency: (o.currency as Currency) ?? 'GHS',
    greeting: (o.bot?.greeting as string) ?? `Welcome to ${(o.name as string) ?? 'our shop'}!`,
    menuBot: o.bot?.menuEnabled !== false,
    freeText: o.bot?.freeTextEnabled !== false,
    faqs: Array.isArray(o.bot?.faqs) ? (o.bot.faqs as Faq[]) : [],
    hours: (o.bot?.hours as OpeningHours) ?? null,
    momo: o.momo as Org['momo'],
    suspended: o.suspended === true,
  };
  const ctx: Ctx = { orgId, waId, profileName, org, s, out: new Outbox(account, orgId, waId, 'bot') };

  let patch: Partial<Session> = {};
  try {
    if (org.suspended) await ctx.out.text('This shop is not taking orders on WhatsApp right now. Please check back later.');
    // The owner is replying from the WhatsApp Business app (Coexistence): stay out of their way.
    else if (isBotPaused((custSnap.get('botPausedUntil') as Timestamp | null | undefined)?.toMillis(), Date.now())) patch = {};
    else if (!org.menuBot) patch = await handoff(ctx, true);
    else patch = await route(ctx, message, body);
  } catch (err) {
    logger.error('Bot failed on a message', { orgId, messageId: message.id, err });
  }

  await sessionDoc.set({
    ...s,
    ...patch,
    handledMessageIds: [...s.handledMessageIds, message.id].slice(-25),
    updatedAt: now,
  });
}

function readableBody(m: InboundMessage): string | null {
  return m.text?.body ?? m.interactive?.list_reply?.title ?? m.interactive?.button_reply?.title ?? null;
}

/* --------------------------------- Routing -------------------------------- */

async function route(ctx: Ctx, m: InboundMessage, body: string | null): Promise<Partial<Session>> {
  const actionId = m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id;
  if (actionId) return handleAction(ctx, actionId);
  if (m.type !== 'text' || !body) {
    await ctx.out.text(`We can only read text messages here. Send "hi" to see our ${words(ctx).catalog}.`);
    return {};
  }

  const text = body.trim();
  const lower = text.toLowerCase();

  if (GREETINGS.includes(lower)) return greet(ctx);
  if (CATALOG_WORDS.includes(lower)) return showCatalog(ctx, undefined, 0);
  if (lower === 'more' && ctx.s.step === 'browsing') return showCatalog(ctx, undefined, ctx.s.catalogPage + 1);
  if (lower === 'cart') return showCart(ctx);
  if (lower === 'checkout') return startCheckout(ctx);
  if (['cancel', 'stop', 'clear'].includes(lower)) return reset(ctx, 'No problem. Your cart is empty again.');
  const rm = lower.match(/^remove\s+(\d+)$/);
  if (rm) return editCart(ctx, Number(rm[1]), 0);
  const qm = lower.match(/^qty\s+(\d+)\s+(\d+)$/);
  if (qm) return editCart(ctx, Number(qm[1]), Number(qm[2]));

  switch (ctx.s.step) {
    case 'awaiting_qty': return captureQty(ctx, text);
    case 'awaiting_name': return captureName(ctx, text);
    case 'awaiting_fulfilment': return captureFulfilmentText(ctx, lower);
    case 'awaiting_address': return captureAddress(ctx, text);
    case 'awaiting_time': return captureTime(ctx, text);
    case 'awaiting_confirm': return promptConfirm(ctx, 'Tap Confirm to place it, or Cancel to stop.');
    default: break;
  }

  if (await maybeCapturePayment(ctx, text)) return { step: 'idle' };

  if (ctx.s.step === 'with_human' && ctx.s.lastHandoffAt && Date.now() - ctx.s.lastHandoffAt < HUMAN_QUIET_MS) return handoff(ctx, true);

  if (ctx.s.step === 'browsing') {
    const picked = await pickFromCatalog(ctx, text);
    if (picked) return askQty(ctx, picked);
  }
  return readFreeText(ctx, text);
}

async function handleAction(ctx: Ctx, id: string): Promise<Partial<Session>> {
  if (id === A.shop) return showCatalog(ctx, undefined, 0, false);
  if (id === A.human) return chatWithSomeone(ctx);
  if (id === A.browse || id === A.addMore) return showCatalog(ctx, undefined, 0);
  if (id === A.more) return showCatalog(ctx, undefined, ctx.s.catalogPage + 1);
  if (id === A.cart) return showCart(ctx);
  if (id === A.clear) return reset(ctx, 'Your cart is empty again.');
  if (id === A.checkout) return startCheckout(ctx);
  if (id === A.confirm) return confirmCheckout(ctx);
  if (id === A.cancel) return reset(ctx, 'Cancelled. Nothing was charged.');
  if (id.startsWith('f:')) return nextCheckoutStep(ctx, { fulfilment: id.slice(2) as Fulfilment });
  if (id.startsWith('i:')) {
    const item = await getItem(ctx, id.slice(2));
    return item ? askQty(ctx, item) : showCatalog(ctx, 'That item is no longer available.', 0);
  }
  return showCatalog(ctx, undefined, 0);
}

/* -------------------------------- Catalogue ------------------------------- */

type Item = CatalogItem & { id: string };

async function activeItems(orgId: string, limit = 200): Promise<Item[]> {
  const snap = await itemsRef(orgId).where('active', '==', true).orderBy('name').limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as CatalogItem) })).filter((i) => i.kind === 'service' || !i.trackStock || i.stock > 0);
}

async function getItem(ctx: Ctx, id: string): Promise<Item | null> {
  const snap = await itemsRef(ctx.orgId).doc(id).get();
  if (!snap.exists) return null;
  const item = { id: snap.id, ...(snap.data() as CatalogItem) };
  return item.active ? item : null;
}

const priceLine = (i: Item, currency: Currency) => `${formatMoney(i.priceMinor, currency)}${i.kind === 'service' && i.durationMinutes ? ` · ${formatDuration(i.durationMinutes)}` : ''}`;

const TOP_PICKS = 5;
/** WhatsApp can deliver back-to-back messages out of order; a short gap keeps them in sequence. */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reply to "hi", in this order: the greeting, the top 5 items (featured
 * first; photo cards where there are photos), then "Explore more" or
 * "Need help".
 */
async function greet(ctx: Ctx): Promise<Partial<Session>> {
  const items = await activeItems(ctx.orgId);
  const hello = closed(ctx) ? `${ctx.org.greeting}\n\n${closedNotice(ctx.org.hours!)}` : ctx.org.greeting;
  if (!items.length) return showCatalog(ctx, hello, 0);
  const top = [...items.filter((i) => i.featured), ...items.filter((i) => !i.featured)].slice(0, TOP_PICKS);

  await ctx.out.text(hello);
  await pause(1200);
  const shownPhotos = await showPhotos(ctx, top, `${words(ctx).topPicks}:`);
  if (shownPhotos) await pause(2000);

  const listed = shownPhotos ? top.filter((i) => !i.imageUrl) : top;
  const preview = listed.map((i) => `• ${i.name} — ${priceLine(i, ctx.org.currency)}`).join('\n');
  await ctx.out.buttons({
    body: [preview ? `${shownPhotos ? 'Also' : words(ctx).topPicks}:\n${preview}` : null, `Want to see all our ${words(ctx).catalog}, or need help?`].filter(Boolean).join('\n\n'),
    buttons: exploreOrHelp(ctx),
  });
  return { step: 'browsing', catalogIds: items.map((i) => i.id), catalogPage: 0 };
}

async function chatWithSomeone(ctx: Ctx): Promise<Partial<Session>> {
  await customerRef(ctx.orgId, ctx.waId).set({ needsHuman: true }, { merge: true });
  await ctx.out.text(`Sure! ${replyWhen(ctx)} Go ahead and type your message.\nTo shop anytime, reply "menu".`);
  return { step: 'with_human', lastHandoffAt: Date.now() };
}

async function showCatalog(ctx: Ctx, prefix: string | undefined, page: number, photos = true): Promise<Partial<Session>> {
  const items = await activeItems(ctx.orgId);
  const w = words(ctx);
  if (!items.length) {
    await ctx.out.text([prefix, `Our ${w.catalog} is being updated. A team member will reply shortly.`].filter(Boolean).join('\n\n'));
    return { step: 'idle', catalogIds: [] };
  }
  const start = page * PAGE < items.length ? page * PAGE : 0;
  const slice = items.slice(start, start + PAGE);
  const hasMore = start + PAGE < items.length;
  const rows = slice.map((it, i) => ({ id: `i:${it.id}`, title: `${start + i + 1}. ${it.name}`, description: priceLine(it, ctx.org.currency) }));
  if (hasMore) rows.push({ id: A.more, title: 'More…', description: `${items.length - start - PAGE} more` });
  const shownPhotos = photos && (await showPhotos(ctx, slice, prefix));
  await ctx.out.list({
    body: [shownPhotos ? null : prefix, `${shownPhotos ? 'Or see the full list. ' : ''}Tap to choose, or just type what you want, e.g. "2 of number 3".`].filter(Boolean).join('\n\n'),
    button: w.button,
    section: ctx.org.name,
    rows,
  });
  return { step: 'browsing', catalogIds: items.map((i) => i.id), catalogPage: start / PAGE };
}

/**
 * Items with a photo go out first as swipeable cards (one card as a photo
 * message, since a carousel needs at least two). Taps arrive as `i:<itemId>`
 * like list picks. Returns false if nothing was sent, e.g. Meta rejected a photo.
 */
async function showPhotos(ctx: Ctx, items: Item[], prefix: string | undefined): Promise<boolean> {
  const withPhoto = items.filter((i) => i.imageUrl).slice(0, 10);
  if (!withPhoto.length) return false;
  const buttonTitle = (i: Item) => (i.kind === 'service' ? words(ctx).book : words(ctx).pick);
  // A card allows 160 characters and at most two line breaks.
  const cardBody = (i: Item) => [`*${i.name}*`, priceLine(i, ctx.org.currency), i.description?.replace(/\s+/g, ' ').trim() || null].filter(Boolean).join('\n');
  const body = [prefix, 'Swipe to see more, then tap a button to choose.'].filter(Boolean).join('\n\n');

  const result = withPhoto.length === 1
    ? await ctx.out.buttons({ body: [prefix, cardBody(withPhoto[0])].filter(Boolean).join('\n\n'), buttons: [{ id: `i:${withPhoto[0].id}`, title: buttonTitle(withPhoto[0]) }], imageUrl: withPhoto[0].imageUrl! })
    : await ctx.out.carousel({ body, cards: withPhoto.map((i) => ({ imageUrl: i.imageUrl!, body: cardBody(i), buttonId: `i:${i.id}`, buttonTitle: buttonTitle(i) })) });
  return result.ok;
}

async function pickFromCatalog(ctx: Ctx, text: string): Promise<Item | null> {
  const n = Number.parseInt(text, 10);
  if (String(n) === text.trim() && n >= 1 && n <= ctx.s.catalogIds.length) return getItem(ctx, ctx.s.catalogIds[n - 1]);
  const needle = text.trim().toLowerCase();
  const items = await activeItems(ctx.orgId);
  const exact = items.find((i) => i.name.toLowerCase() === needle || i.aliases?.some((a) => a.toLowerCase() === needle));
  if (exact) return exact;
  const partial = items.filter((i) => i.name.toLowerCase().includes(needle));
  return partial.length === 1 ? partial[0] : null;
}

async function askQty(ctx: Ctx, item: Item): Promise<Partial<Session>> {
  if (item.kind === 'service') return addToCart(ctx, item, 1);
  await ctx.out.text(`${item.name} — ${formatMoney(item.priceMinor, ctx.org.currency)}\nHow many? Reply with a number, e.g. 2`);
  return { step: 'awaiting_qty', pendingItemId: item.id };
}

async function captureQty(ctx: Ctx, text: string): Promise<Partial<Session>> {
  const qty = Number.parseInt(text.replace(/\D/g, ''), 10);
  if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
    await ctx.out.text('Please reply with a number between 1 and 99.');
    return {};
  }
  const item = ctx.s.pendingItemId ? await getItem(ctx, ctx.s.pendingItemId) : null;
  if (!item) return showCatalog(ctx, 'Sorry, that item just ran out.', 0);
  return addToCart(ctx, item, qty);
}

async function addToCart(ctx: Ctx, item: Item, qty: number): Promise<Partial<Session>> {
  const inCart = ctx.s.cart.find((l) => l.itemId === item.id)?.quantity ?? 0;
  if (item.kind === 'product' && item.trackStock && inCart + qty > item.stock) {
    await ctx.out.text(`Sorry, we only have ${item.stock} ${item.name} left.`);
    return { step: 'awaiting_qty', pendingItemId: item.id };
  }
  const line: CartLine = {
    itemId: item.id, kind: item.kind, name: item.name, priceMinor: item.priceMinor, quantity: qty,
    needsTime: item.kind === 'service' && ctx.org.features.bookings && item.requiresBooking !== false,
  };
  const cart = inCart
    ? ctx.s.cart.map((l) => (l.itemId === item.id ? { ...l, quantity: Math.min(99, l.quantity + qty) } : l))
    : [...ctx.s.cart, line];
  await ctx.out.buttons({
    body: `Added.\n${cartText(cart, ctx.org.currency)}`,
    buttons: [{ id: A.addMore, title: 'Add more' }, { id: A.checkout, title: checkoutTitle(cart) }],
  });
  return { step: 'browsing', cart, pendingItemId: null };
}

/** A cart of only services is a booking. */
const checkoutTitle = (cart: CartLine[]) => (cart.every((l) => l.kind === 'service') ? 'Book now' : 'Checkout');
const cartTotal = (cart: CartLine[]) => cart.reduce((s, l) => s + l.priceMinor * l.quantity, 0);
const cartText = (cart: CartLine[], currency: Currency) =>
  `${linesSummary(cart.map((l) => ({ name: l.name, quantity: l.quantity, unitPriceMinor: l.priceMinor })), currency)}\nSubtotal: ${formatMoney(cartTotal(cart), currency)}`;

async function showCart(ctx: Ctx): Promise<Partial<Session>> {
  if (!ctx.s.cart.length) {
    await ctx.out.buttons({ body: 'Your cart is empty.', buttons: [{ id: A.browse, title: words(ctx).button }] });
    return { step: 'idle' };
  }
  await ctx.out.buttons({
    body: `${cartText(ctx.s.cart, ctx.org.currency)}\n\nTo change an item, reply "qty 2 3" or "remove 2".`,
    buttons: [{ id: A.checkout, title: checkoutTitle(ctx.s.cart) }, { id: A.addMore, title: 'Add more' }, { id: A.clear, title: 'Empty cart' }],
  });
  return { step: 'browsing' };
}

async function editCart(ctx: Ctx, position: number, qty: number): Promise<Partial<Session>> {
  const idx = position - 1;
  if (idx < 0 || idx >= ctx.s.cart.length) {
    await ctx.out.text(ctx.s.cart.length ? 'That number is not in your cart. Reply "cart" to see it.' : 'Your cart is empty.');
    return {};
  }
  const cart = qty === 0 ? ctx.s.cart.filter((_, i) => i !== idx) : ctx.s.cart.map((l, i) => (i === idx ? { ...l, quantity: Math.min(99, qty) } : l));
  await ctx.out.text(cart.length ? `Updated.\n${cartText(cart, ctx.org.currency)}` : 'Removed. Your cart is empty.');
  return { cart };
}

async function reset(ctx: Ctx, message: string): Promise<Partial<Session>> {
  await ctx.out.buttons({ body: message, buttons: [{ id: A.browse, title: words(ctx).button }] });
  return { step: 'idle', cart: [], pendingItemId: null, fulfilment: null, address: null, timeRequest: null, timeAt: null };
}

/* -------------------------------- Checkout -------------------------------- */

function fulfilmentOptions(ctx: Ctx): Fulfilment[] {
  const f = ctx.org.features;
  const servicesOnly = ctx.s.cart.every((l) => l.kind === 'service');
  if (servicesOnly) return [...(['appointment'] as Fulfilment[]), ...(f.onSite ? (['on_site'] as Fulfilment[]) : [])];
  const opts: Fulfilment[] = [];
  if (f.delivery) opts.push('delivery');
  if (f.pickup) opts.push('pickup');
  return opts.length ? opts : ['pickup'];
}

async function startCheckout(ctx: Ctx): Promise<Partial<Session>> {
  if (!ctx.s.cart.length) return showCart(ctx);
  if (closed(ctx) && !ctx.org.hours!.ordersWhenClosed) {
    await ctx.out.text(`${closedNotice(ctx.org.hours!)}\nYour cart is saved. Reply "checkout" when we're open.`);
    return {};
  }
  const saved = (await customerRef(ctx.orgId, ctx.waId).get()).get('name') as string | null;
  const name = saved || ctx.profileName;
  if (!name) {
    await ctx.out.text('What name should we put on it?');
    return { step: 'awaiting_name' };
  }
  return nextCheckoutStep(ctx, { name });
}

async function captureName(ctx: Ctx, text: string): Promise<Partial<Session>> {
  if (text.length < 2) {
    await ctx.out.text('Please send your name.');
    return {};
  }
  return nextCheckoutStep(ctx, { name: text.slice(0, 60) });
}

async function captureFulfilmentText(ctx: Ctx, lower: string): Promise<Partial<Session>> {
  const opts = fulfilmentOptions(ctx);
  const n = Number.parseInt(lower, 10);
  const byWord = opts.find((f) => lower.includes(f === 'on_site' ? 'come' : f === 'appointment' ? 'shop' : f));
  const chosen = byWord ?? (n >= 1 && n <= opts.length ? opts[n - 1] : null);
  if (!chosen) return nextCheckoutStep(ctx, {});
  return nextCheckoutStep(ctx, { fulfilment: chosen });
}

async function captureAddress(ctx: Ctx, text: string): Promise<Partial<Session>> {
  if (text.length < 5) {
    await ctx.out.text('Please send a fuller address with a landmark we can find.');
    return {};
  }
  return nextCheckoutStep(ctx, { address: text.slice(0, 300) });
}

async function captureTime(ctx: Ctx, text: string): Promise<Partial<Session>> {
  const when = readWhen(text);
  return nextCheckoutStep(ctx, { timeRequest: text.slice(0, 120), timeAt: when.at ? when.at.toISOString() : null });
}

/** Asks for whatever the order still needs, in order: how, where, when, then confirm. */
async function nextCheckoutStep(ctx: Ctx, patch: Partial<Session>): Promise<Partial<Session>> {
  const s = { ...ctx.s, ...patch };
  const next: Ctx = { ...ctx, s };
  const opts = fulfilmentOptions(next);

  if (!s.fulfilment || !opts.includes(s.fulfilment)) {
    if (opts.length === 1) s.fulfilment = opts[0];
    else {
      await ctx.out.buttons({
        body: `Thanks ${s.name ?? ''}. How would you like it?`.replace('  ', ' '),
        buttons: opts.map((f) => ({ id: `f:${f}`, title: FULFILMENT_LABEL[f] })),
      });
      return { ...patch, step: 'awaiting_fulfilment' };
    }
  }
  if ((s.fulfilment === 'delivery' || s.fulfilment === 'on_site') && !s.address) {
    await ctx.out.text(s.fulfilment === 'delivery' ? 'Where should we deliver? Send the address and a landmark.' : 'Where should we come to? Send the address and a landmark.');
    return { ...patch, fulfilment: s.fulfilment, step: 'awaiting_address' };
  }
  if (s.cart.some((l) => l.needsTime) && !s.timeRequest) {
    await ctx.out.text('What day and time would you like? e.g. "Saturday 10am". We will confirm it with you.');
    return { ...patch, fulfilment: s.fulfilment, step: 'awaiting_time' };
  }
  return { ...(await promptConfirm(next)), ...patch, fulfilment: s.fulfilment };
}

async function promptConfirm(ctx: Ctx, prefix?: string): Promise<Partial<Session>> {
  const s = ctx.s;
  const fee = s.fulfilment === 'delivery' ? ctx.org.deliveryFeeMinor : 0;
  const when = s.timeAt ? formatWhen(new Date(s.timeAt)) : s.timeRequest;
  await ctx.out.buttons({
    body: [
      prefix,
      cartText(s.cart, ctx.org.currency),
      fee ? `Delivery: ${formatMoney(fee, ctx.org.currency)}` : null,
      `Total: ${formatMoney(cartTotal(s.cart) + fee, ctx.org.currency)}`,
      s.fulfilment ? `${FULFILMENT_LABEL[s.fulfilment]}${s.address ? `: ${s.address}` : ''}` : null,
      when ? `Requested time: ${when}` : null,
    ].filter(Boolean).join('\n'),
    buttons: [{ id: A.confirm, title: 'Confirm' }, { id: A.cancel, title: 'Cancel' }],
  });
  return { step: 'awaiting_confirm' };
}

async function confirmCheckout(ctx: Ctx): Promise<Partial<Session>> {
  const s = ctx.s;
  if (!s.cart.length || !s.fulfilment) {
    await ctx.out.text('That checkout expired. Send "hi" to start again.');
    return { ...EMPTY, handledMessageIds: s.handledMessageIds };
  }
  const result = await placeOrder({
    orgId: ctx.orgId,
    customer: { waId: ctx.waId, name: s.name ?? ctx.profileName ?? 'Customer', phone: `+${ctx.waId}` },
    lines: s.cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
    fulfilment: s.fulfilment,
    address: s.address,
    appointment: s.timeRequest ? { requested: s.timeRequest, at: s.timeAt ? new Date(s.timeAt) : null } : null,
    channel: 'whatsapp_menu',
    note: null,
    by: 'bot',
  });
  if (!result.ok) {
    const why =
      result.reason === 'out_of_stock' ? `Sorry, only ${result.available} ${result.itemName} left now. Reply "cart" to change it.`
      : result.reason === 'unavailable' ? `Sorry, ${result.itemName} is no longer available. Reply "cart" to change it.`
      : 'Your cart is empty.';
    await ctx.out.text(why);
    return { step: 'browsing' };
  }
  const noun = s.cart.every((l) => l.kind === 'service') ? words(ctx).order : 'order';
  await ctx.out.text(
    [
      `${noun[0].toUpperCase()}${noun.slice(1)} #${result.number} received. Total ${formatMoney(result.totalMinor, ctx.org.currency)}.`,
      s.timeRequest ? 'We will confirm your time shortly.' : null,
      '',
      paymentInstructions(result.totalMinor, ctx.org.momo, ctx.org.currency),
    ].filter((l) => l !== null).join('\n'),
  );
  return { step: 'idle', cart: [], pendingItemId: null, fulfilment: null, address: null, timeRequest: null, timeAt: null };
}

/* ------------------------------ MoMo references --------------------------- */

/**
 * "Sent. ID 52816047391" → a submitted payment on the customer's latest
 * unpaid order. Ghanaian phone numbers (0XXXXXXXXX / 233XXXXXXXXX) are not
 * mistaken for Transaction IDs.
 */
async function maybeCapturePayment(ctx: Ctx, text: string): Promise<boolean> {
  const candidates = [...text.matchAll(/\b(\d{8,14})\b/g)].map((m) => m[1]).filter((d) => !/^0\d{9}$/.test(d) && !/^233\d{9}$/.test(d));
  if (!candidates.length) return false;
  const keyword = /\b(id|txn|trans|transaction|ref|reference|paid|sent|momo|payment)\b/i.test(text);
  if (!keyword && text.replace(/\D/g, '') !== candidates[0]) return false;

  const open = await ordersRef(ctx.orgId)
    .where('customerId', '==', ctx.waId)
    .where('paymentState', 'in', ['unpaid', 'partial', 'submitted'])
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
  const order = open.docs.find((d) => d.get('status') !== 'cancelled');
  if (!order) return false;

  const result = await submitPayment({
    orgId: ctx.orgId,
    orderId: order.id,
    method: 'momo',
    network: guessNetwork(text),
    reference: candidates[0],
    amountMinor: parseAmount(text, ctx.org.currency),
    payerPhone: `+${ctx.waId}`,
    source: 'whatsapp',
    by: 'bot',
  });
  await ctx.out.text(`Thank you! We have your payment reference for order #${result.orderNumber} and are checking it now. We will confirm here shortly.`);
  return true;
}

/* ------------------------------- Free text -------------------------------- */

async function readFreeText(ctx: Ctx, text: string): Promise<Partial<Session>> {
  const items = await activeItems(ctx.orgId);
  const catalog: NluCatalogItem[] = items.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases ?? [], kind: i.kind }));
  const intent = await nlu.parse({ text, catalog });

  // The merchant's own answers come before the bot's built-in ones; orders and order status don't.
  if (intent.kind !== 'ORDER' && intent.kind !== 'ORDER_STATUS') {
    const faq = matchFaq(text, ctx.org.faqs);
    if (faq) {
      await ctx.out.buttons({ body: faq.a, buttons: exploreOrHelp(ctx) });
      return {};
    }
  }

  switch (intent.kind) {
    case 'MENU':
      return showCatalog(ctx, undefined, 0);
    case 'GREETING':
      return greet(ctx);
    case 'ORDER_STATUS':
      return replyOrderStatus(ctx, intent.orderNumber);
    case 'AVAILABILITY': {
      const found = items.filter((i) => intent.itemIds.includes(i.id));
      await ctx.out.text(found.map((i) => `Yes, ${i.name} is available: ${priceLine(i, ctx.org.currency)}.`).join('\n') + '\nReply "menu" to order.');
      return {};
    }
    case 'PRICE':
      return replyPrices(ctx, items, intent.itemIds);
    case 'FAQ':
      return replyFaq(ctx, intent.topic);
    case 'ORDER':
      if (!ctx.org.freeText) return handoff(ctx);
      if (intent.confidence >= DRAFT_THRESHOLD) return createDraft(ctx, text, intent.lines, intent.unmatched, intent.confidence, items);
      return handoff(ctx);
    default:
      return handoff(ctx);
  }
}

const exploreOrHelp = (ctx: Ctx) => [{ id: A.shop, title: words(ctx).explore }, { id: A.human, title: 'Need help' }];

/** "How much is jollof?" → that price; "What are your prices?" → the price list. */
async function replyPrices(ctx: Ctx, items: Item[], itemIds: string[]): Promise<Partial<Session>> {
  const asked = items.filter((i) => itemIds.includes(i.id));
  const shown = (asked.length ? asked : items).slice(0, 20);
  const more = asked.length ? 0 : items.length - shown.length;
  await ctx.out.buttons({
    body: [
      asked.length ? null : words(ctx).pricesIntro,
      shown.map((i) => `• ${i.name} — ${priceLine(i, ctx.org.currency)}`).join('\n') + (more > 0 ? `\n…and ${more} more` : ''),
      `Tap ${words(ctx).explore} to ${words(ctx).order === 'booking' ? 'book' : 'order'}.`,
    ].filter(Boolean).join('\n\n'),
    buttons: exploreOrHelp(ctx),
  });
  return { step: 'browsing', catalogIds: items.map((i) => i.id), catalogPage: 0 };
}

/** Common questions answered from the business's settings. Anything we can't answer goes to a person. */
async function replyFaq(ctx: Ctx, topic: 'location' | 'delivery' | 'payment' | 'hours'): Promise<Partial<Session>> {
  const { org } = ctx;
  let answer: string | null = null;
  if (topic === 'hours') {
    if (!org.hours?.enabled) return handoff(ctx);
    answer = `${closed(ctx) ? closedNotice(org.hours) : "Yes, we're open now."}\n\nOur hours:\n${hoursText(org.hours)}`;
  } else if (topic === 'location' && org.area) {
    answer = `We're in ${org.area}.${org.phone ? ` Call ${org.phone} if you need directions.` : ''}`;
  } else if (topic === 'delivery') {
    const fee = org.deliveryFeeMinor ? ` The delivery fee is ${formatMoney(org.deliveryFeeMinor, org.currency)}.` : '';
    answer = org.features.delivery
      ? `Yes, we deliver.${fee} Add your address when you check out.${org.features.pickup ? ' You can also pick up.' : ''}`
      : `Sorry, we don't deliver right now.${org.features.pickup ? ` You can pick up${org.area ? ` in ${org.area}` : ''}.` : ''}`;
  } else if (topic === 'payment') {
    const momo = org.momo ?? {};
    const lines = [
      momo.mtn ? `MTN MoMo: ${momo.mtn}` : null,
      momo.telecel ? `Telecel Cash: ${momo.telecel}` : null,
      momo.airteltigo ? `AirtelTigo Money: ${momo.airteltigo}` : null,
    ].filter(Boolean);
    answer = lines.length
      ? ['We take mobile money:', ...lines, momo.accountName ? `Name: ${momo.accountName}` : null, '', 'Place your order first and we will send you the total.'].filter((l) => l !== null).join('\n')
      : 'We will tell you how to pay when you place your order.';
  }
  if (!answer) return handoff(ctx);
  await ctx.out.buttons({ body: answer, buttons: exploreOrHelp(ctx) });
  return {};
}

async function createDraft(
  ctx: Ctx,
  text: string,
  lines: Array<{ itemId: string; name: string; quantity: number }>,
  unmatched: string[],
  confidence: number,
  items: Item[],
): Promise<Partial<Session>> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const when = readWhen(text);
  const hasService = lines.some((l) => byId.get(l.itemId)?.kind === 'service');
  const addressMatch = text.match(/\b(?:deliver(?:y|ed)?|bring it|send it)\s+(?:to|at)\s+(.{4,120})$/i);
  const fulfilment: Fulfilment | null = /\b(pick ?up|collect|come for it)\b/i.test(text)
    ? 'pickup'
    : addressMatch || /\bdeliver/i.test(text)
      ? 'delivery'
      : hasService
        ? 'appointment'
        : null;

  await draftOrdersRef(ctx.orgId).add({
    customerId: ctx.waId,
    customerName: ctx.s.name ?? ctx.profileName ?? null,
    text,
    lines: lines.map((l) => ({ itemId: l.itemId, name: l.name, quantity: l.quantity, unitPriceMinor: byId.get(l.itemId)?.priceMinor ?? 0, kind: byId.get(l.itemId)?.kind ?? 'product' })),
    unmatched,
    confidence,
    fulfilment,
    address: addressMatch?.[1]?.trim() ?? null,
    appointmentRequest: hasService ? when.phrase : null,
    appointmentAt: hasService && when.at ? Timestamp.fromDate(when.at) : null,
    status: 'open',
    orderId: null,
    createdAt: Timestamp.now(),
  });
  await customerRef(ctx.orgId, ctx.waId).set({ needsHuman: true }, { merge: true });
  await ctx.out.text(
    `Thanks! We read your ${hasService && lines.every((l) => byId.get(l.itemId)?.kind === 'service') ? 'request' : 'order'} as:\n${lines
      .map((l) => `• ${l.quantity} × ${l.name}`)
      .join('\n')}${when.phrase && hasService ? `\nTime: ${when.phrase}` : ''}\n\n${ctx.org.name} will confirm it with you here shortly.`,
  );
  return { step: 'idle' };
}

async function replyOrderStatus(ctx: Ctx, number: number | null): Promise<Partial<Session>> {
  let q = ordersRef(ctx.orgId).where('customerId', '==', ctx.waId);
  if (number) q = q.where('number', '==', number);
  const snap = await q.orderBy('createdAt', 'desc').limit(1).get();
  const order = snap.docs[0];
  if (!order) {
    await ctx.out.text(`We could not find an order for you. Reply "menu" to see our ${words(ctx).catalog}.`);
    return {};
  }
  const label: Record<string, string> = {
    pending: 'received and waiting for confirmation', confirmed: 'confirmed', in_progress: 'being worked on', ready: 'ready',
    out_for_delivery: 'on its way', completed: 'completed', cancelled: 'cancelled',
  };
  await ctx.out.text(`Order #${order.get('number')} is ${label[order.get('status') as string] ?? order.get('status')}. A team member will reply if you need more help.`);
  await customerRef(ctx.orgId, ctx.waId).set({ needsHuman: true }, { merge: true });
  return {};
}

/** Hands the chat to a person, without spamming the customer if they keep typing. */
function closed(ctx: Ctx): boolean {
  return !isOpen(ctx.org.hours);
}

function replyWhen(ctx: Ctx): string {
  return closed(ctx)
    ? `We're closed right now, so someone from ${ctx.org.name} will reply when we open.`
    : `Someone from ${ctx.org.name} will reply here shortly.`;
}

async function handoff(ctx: Ctx, silent = false): Promise<Partial<Session>> {
  await customerRef(ctx.orgId, ctx.waId).set({ needsHuman: true }, { merge: true });
  const recently = ctx.s.lastHandoffAt && Date.now() - ctx.s.lastHandoffAt < 30 * 60000;
  if (!silent && !recently) {
    await ctx.out.text(`Thanks for your message. ${replyWhen(ctx)}\nTo order now, reply "menu".`);
    return { lastHandoffAt: Date.now() };
  }
  return {};
}
