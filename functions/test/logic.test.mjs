// Run with: npm test  (builds, then uses Node's built-in test runner — no extra deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { RulesEngine } = require('../lib/nlu/rules.js');
const { readWhen } = require('../lib/nlu/when.js');
const { parseAmount } = require('../lib/domain/money.js');
const { canTransition, nextStatus } = require('../lib/domain/orderFlow.js');
const { can } = require('../lib/domain/permissions.js');

const food = [
  { id: 'p1', name: 'Jollof rice with chicken', aliases: ['jollof', 'jolof'], kind: 'product' },
  { id: 'p2', name: 'Fried rice & chicken', aliases: ['fried rice'], kind: 'product' },
  { id: 'p6', name: 'Sobolo (500ml)', aliases: ['sobolo', 'bissap'], kind: 'product' },
];
const salon = [
  { id: 's1', name: 'Box braids', aliases: ['braids', 'braid'], kind: 'service' },
  { id: 's2', name: 'Wash and set', aliases: ['washing'], kind: 'service' },
];
const engine = new RulesEngine();

test('reads a Ghanaian food order with quantities', async () => {
  const r = await engine.parse({ text: '2 jollof with chicken and 1 sobolo abeg. Deliver to East Legon', catalog: food });
  assert.equal(r.kind, 'ORDER');
  assert.deepEqual(r.lines.map((l) => [l.itemId, l.quantity]), [['p1', 2], ['p6', 1]]);
  assert.ok(r.confidence >= 0.55);
});

test('prefers the longer name: "fried rice" is not jollof', async () => {
  const r = await engine.parse({ text: 'three fried rice please', catalog: food });
  assert.equal(r.kind, 'ORDER');
  assert.deepEqual(r.lines.map((l) => [l.itemId, l.quantity]), [['p2', 3]]);
});

test('tolerates misspelling', async () => {
  const r = await engine.parse({ text: '2 jelof', catalog: food });
  assert.equal(r.kind, 'ORDER');
  assert.equal(r.lines[0].itemId, 'p1');
});

test('reads a service booking request', async () => {
  const r = await engine.parse({ text: 'I want box braids tomorrow 10am', catalog: salon });
  assert.equal(r.kind, 'ORDER');
  assert.equal(r.lines[0].itemId, 's1');
});

test('menu, status, human intents', async () => {
  assert.equal((await engine.parse({ text: 'what do you sell?', catalog: food })).kind, 'MENU');
  const s = await engine.parse({ text: 'where is my order #151', catalog: food });
  assert.equal(s.kind, 'ORDER_STATUS');
  assert.equal(s.orderNumber, 151);
  assert.equal((await engine.parse({ text: 'I want to talk to a person', catalog: food })).kind, 'HUMAN');
});

test('readWhen: weekday + am/pm, tomorrow, bare time', () => {
  const now = new Date(Date.UTC(2026, 10, 1, 13, 40)); // Sun 1 Nov 2026 13:40 GMT
  const sat = readWhen('Saturday 10am please', now);
  assert.equal(sat.at.toISOString(), '2026-11-07T10:00:00.000Z');
  assert.equal(readWhen('tomorrow 2:30pm', now).at.toISOString(), '2026-11-02T14:30:00.000Z');
  assert.equal(readWhen('9am', now).at.toISOString(), '2026-11-02T09:00:00.000Z'); // 9am already passed today
  assert.equal(readWhen('2 jollof', now).at, null);
});

test('parseAmount reads amounts customers type', () => {
  assert.equal(parseAmount("I've paid 50 cedis. ID 7731942056"), 5000);
  assert.equal(parseAmount('GHS 45.50 sent'), 4550);
  assert.equal(parseAmount('₵100'), 10000);
  assert.equal(parseAmount('Sent. ID 52816047391'), null);
});

test('order state machine', () => {
  assert.ok(canTransition('pending', 'confirmed'));
  assert.ok(!canTransition('pending', 'completed'));
  assert.ok(!canTransition('completed', 'cancelled'));
  const product = { kind: 'product' };
  const service = { kind: 'service' };
  assert.equal(nextStatus({ status: 'ready', fulfilment: 'delivery', lines: [product] }), 'out_for_delivery');
  assert.equal(nextStatus({ status: 'ready', fulfilment: 'pickup', lines: [product] }), 'completed');
  assert.equal(nextStatus({ status: 'in_progress', fulfilment: 'appointment', lines: [service] }), 'completed');
});

test('roles', () => {
  assert.ok(can('cashier', 'payments.verify'));
  assert.ok(!can('cashier', 'catalog.write'));
  assert.ok(!can('kitchen', 'orders.manage'));
  assert.ok(!can('manager', 'billing.manage'));
});

test('price and FAQ questions', async () => {
  const all = await engine.parse({ text: 'What are your prices?', catalog: food });
  assert.deepEqual([all.kind, all.itemIds], ['PRICE', []]);
  const one = await engine.parse({ text: 'how much is jollof', catalog: food });
  assert.deepEqual([one.kind, one.itemIds], ['PRICE', ['p1']]);
  assert.equal((await engine.parse({ text: 'Do you deliver to Tema?', catalog: food })).topic, 'delivery');
  assert.equal((await engine.parse({ text: 'how much is delivery', catalog: food })).topic, 'delivery');
  assert.equal((await engine.parse({ text: 'How do I pay?', catalog: food })).topic, 'payment');
  assert.equal((await engine.parse({ text: 'where are you located', catalog: food })).topic, 'location');
  assert.equal((await engine.parse({ text: 'where is my order', catalog: food })).kind, 'ORDER_STATUS');
});

test('wording fits each business, and WhatsApp buttons stay within 20 characters', () => {
  const { vocabulary } = require('../lib/whatsapp/copy.js');
  assert.equal(vocabulary('food', 'Restaurant').button, 'View menu');
  assert.equal(vocabulary('retail', 'Fashion').topPicks, 'New & popular');
  assert.equal(vocabulary('services', 'Salon & barbering').button, 'See styles');
  const types = ['food', 'retail', 'services', 'mixed'];
  const cats = [null, 'Salon & barbering', 'Salon & beauty', 'Tailoring', 'Fashion & tailoring', 'Repairs', 'Phones & repairs', 'Cleaning', 'Events & photography', 'Health & fitness', 'Tutoring', 'Drinks'];
  for (const t of types) for (const c of cats) {
    const w = vocabulary(t, c);
    for (const k of ['button', 'explore', 'pick', 'book']) assert.ok(w[k].length <= 20, `${t}/${c} ${k}: ${w[k]}`);
  }
});

test('merchant FAQs match different wordings, and nothing unrelated', () => {
  const { matchFaq } = require('../lib/nlu/faq.js');
  const faqs = [
    { q: 'What time do you open?', a: 'HOURS', keywords: ['closing time', 'sunday', 'hours'] },
    { q: 'Do I need to bring my own hair?', a: 'HAIR', keywords: ['attachment', 'extensions'] },
    { q: 'Do you do home service?', a: 'HOME', keywords: ['come to my house'] },
  ];
  const a = (t) => matchFaq(t, faqs)?.a ?? null;
  assert.equal(a('when do u open'), 'HOURS');
  assert.equal(a('Are you open on Sunday?'), 'HOURS');
  assert.equal(a("what's your closing time"), 'HOURS');
  assert.equal(a('should I bring my own hair or you provide?'), 'HAIR');
  assert.equal(a('do you sell attachment'), 'HAIR');
  assert.equal(a('can you come to my house'), 'HOME');
  assert.equal(a('do you do home service'), 'HOME');
  assert.equal(a('I want to complain about my order'), null);
  assert.equal(a('hello'), null);
});

test('opening hours: open, closed, overnight, next opening, hours question', async () => {
  const { isOpen, nextOpening } = require('../lib/domain/hours.js');
  const nine = { open: '09:00', close: '17:00' };
  // Mon–Fri 9–5, Saturday 18:00–02:00, Sunday closed. Accra is UTC+0.
  const hours = { enabled: true, timezone: 'Africa/Accra', ordersWhenClosed: true, days: [null, nine, nine, nine, nine, nine, { open: '18:00', close: '02:00' }] };
  const at = (iso) => new Date(iso);
  assert.equal(isOpen(hours, at('2026-11-16T10:00:00Z')), true); // Monday 10:00
  assert.equal(isOpen(hours, at('2026-11-16T17:00:00Z')), false); // Monday 17:00
  assert.equal(isOpen(hours, at('2026-11-21T23:30:00Z')), true); // Saturday late
  assert.equal(isOpen(hours, at('2026-11-22T01:30:00Z')), true); // early Sunday, still Saturday's shift
  assert.equal(isOpen(hours, at('2026-11-22T03:00:00Z')), false); // Sunday
  assert.equal(nextOpening(hours, at('2026-11-22T03:00:00Z')), 'tomorrow at 9am');
  assert.equal(nextOpening(hours, at('2026-11-16T07:00:00Z')), 'today at 9am');
  assert.equal(nextOpening(hours, at('2026-11-20T18:00:00Z')), 'tomorrow at 6pm'); // Friday evening
  assert.equal(isOpen({ ...hours, enabled: false }, at('2026-11-22T03:00:00Z')), true);
  assert.equal(isOpen(hours, at('2026-11-16T09:30:00Z')) && isOpen({ ...hours, timezone: 'Africa/Nairobi' }, at('2026-11-16T06:30:00Z')), true); // 9:30 in Nairobi
  for (const q of ['are you open?', 'what time do you close', 'opening hours pls']) {
    const r = await engine.parse({ text: q, catalog: food });
    assert.equal(r.kind === 'FAQ' && r.topic, 'hours', q);
  }
});

/* ------------------------------ Coexistence ------------------------------- */

const { tasksFromChange, phoneMessageRecord, pauseUntil, isBotPaused } = require('../lib/whatsapp/coexistence.js');

const meta = { phone_number_id: 'PN1' };
const echoValue = {
  metadata: meta,
  message_echoes: [{ id: 'wamid.E1', from: '233200000000', to: '233244118802', timestamp: '1763380000', type: 'text', text: { body: 'Your food is on the way' } }],
};

test('coexistence: echoes from the phone app never become bot messages', () => {
  const tasks = tasksFromChange('smb_message_echoes', echoValue);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].kind, 'echo');
  assert.ok(!tasks.some((t) => t.kind === 'message'), 'only kind "message" reaches the bot');
  const r = phoneMessageRecord(tasks[0].message, '233244118802');
  assert.deepEqual([r.direction, r.by, r.body], ['out', 'merchant_phone', 'Your food is on the way']);
  // An echo payload with a messages array too is still not routed to the bot.
  assert.ok(tasksFromChange('smb_message_echoes', { ...echoValue, messages: [{ id: 'x', from: '1', type: 'text' }] }).every((t) => t.kind === 'echo'));
});

test('coexistence: customer messages still reach the bot, unknown fields are ignored', () => {
  const v = { metadata: meta, contacts: [{ profile: { name: 'Ama' } }], messages: [{ id: 'wamid.M1', from: '233244118802', type: 'text', text: { body: 'hi' } }] };
  assert.deepEqual(tasksFromChange('messages', v).map((t) => [t.id, t.kind, t.profileName]), [['wamid.M1', 'message', 'Ama']]);
  assert.deepEqual(tasksFromChange(undefined, v).map((t) => t.kind), ['message']);
  assert.deepEqual(tasksFromChange('account_update', v), []);
});

test('coexistence: importing the same history twice gives the same ids (no duplicates)', () => {
  const history = {
    metadata: meta,
    history: [{ threads: [{ id: '233244118802', messages: [
      { id: 'wamid.H1', from: '233244118802', timestamp: '1763000000', type: 'text', text: { body: 'Do you deliver?' } },
      { id: 'wamid.H2', from: '233200000000', to: '233244118802', timestamp: '1763000100', type: 'text', text: { body: 'Yes' } },
      { id: 'wamid.H1', from: '233244118802', timestamp: '1763000000', type: 'text', text: { body: 'Do you deliver?' } },
    ] }] }],
  };
  const first = tasksFromChange('history', history);
  const again = tasksFromChange('history', structuredClone(history));
  assert.equal(first.length, 1);
  assert.equal(first[0].id, again[0].id, 'same event id, so create() is a no-op');
  assert.deepEqual(first[0].thread.messages.map((m) => m.id), ['wamid.H1', 'wamid.H2'], 'repeated messages collapse');
  // Message docs are keyed by WhatsApp id, so re-imports overwrite rather than add.
  const recs = first[0].thread.messages.map((m) => phoneMessageRecord(m, '233244118802'));
  assert.deepEqual(recs.map((r) => [r.waMessageId, r.direction, r.by]), [['wamid.H1', 'in', 'customer'], ['wamid.H2', 'out', 'merchant_phone']]);
  // Message order inside the chunk doesn't change the id.
  const reversed = structuredClone(history);
  reversed.history[0].threads[0].messages.reverse();
  assert.equal(tasksFromChange('history', reversed)[0].id, first[0].id);
});

test('coexistence: contacts sync adds contacts, ignores removals', () => {
  const v = { metadata: meta, state_sync: [
    { type: 'contact', action: 'add', contact: { full_name: 'Kofi Mensah', phone_number: '+233 24 411 8802' } },
    { type: 'contact', action: 'remove', contact: { phone_number: '233200000001' } },
  ] };
  const tasks = tasksFromChange('smb_app_state_sync', v);
  assert.deepEqual(tasks.map((t) => [t.kind, t.contact.waId, t.contact.name]), [['contact', '233244118802', 'Kofi Mensah']]);
  assert.equal(tasks[0].id, tasksFromChange('smb_app_state_sync', v)[0].id);
});

test('coexistence: bot pauses after the owner replies from the phone', () => {
  const now = 1_000_000;
  assert.equal(pauseUntil(now, undefined), now + 30 * 60000, 'defaults to 30 minutes');
  assert.equal(pauseUntil(now, 0), null, '0 switches pausing off');
  assert.ok(isBotPaused(pauseUntil(now, 30), now + 29 * 60000));
  assert.ok(!isBotPaused(pauseUntil(now, 30), now + 31 * 60000));
  assert.ok(!isBotPaused(null, now));
});

/* ------------------------- Paystack payment links ------------------------- */

const { createHmac } = await import('node:crypto');
const { verifyPaystackSignature } = require('../lib/billing/paystack.js');
const L = require('../lib/payments/paystackLinks.js');
const { howToPay } = require('../lib/whatsapp/copy.js');

test('paystack: webhook signature must match the raw body and secret', () => {
  const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'se_1' } }));
  const good = createHmac('sha512', 'sk_test_x').update(body).digest('hex');
  assert.ok(verifyPaystackSignature(body, good, 'sk_test_x'));
  assert.ok(!verifyPaystackSignature(body, good, 'sk_test_other'), 'wrong secret');
  assert.ok(!verifyPaystackSignature(Buffer.from(body.toString().replace('se_1', 'se_2')), good, 'sk_test_x'), 'tampered body');
  assert.ok(!verifyPaystackSignature(body, undefined, 'sk_test_x'), 'missing header');
  assert.ok(!verifyPaystackSignature(body, 'abc', 'sk_test_x'), 'short header');
});

test('paystack: only a successful GHS charge for one of our orders counts', () => {
  const ok = { status: 'success', reference: 'se_A', currency: 'GHS', amount: 10500, channel: 'mobile_money', metadata: { kind: 'order', orgId: 'o1', orderId: 'x1' } };
  assert.deepEqual(L.checkOrderCharge(ok, 'se_A'), { ok: true, orgId: 'o1', orderId: 'x1', reference: 'se_A', amountMinor: 10500, method: 'momo' });
  assert.equal(L.checkOrderCharge({ ...ok, metadata: JSON.stringify(ok.metadata) }, 'se_A').ok, true, 'metadata may arrive as a string');
  assert.equal(L.checkOrderCharge({ ...ok, channel: 'card' }, 'se_A').method, 'card');
  for (const [bad, why] of [
    [{ ...ok, status: 'failed' }, 'failed charge'],
    [{ ...ok, status: 'abandoned' }, 'abandoned'],
    [{ ...ok, currency: 'NGN' }, 'wrong currency'],
    [{ ...ok, reference: 'se_B' }, 'reference swapped'],
    [{ ...ok, metadata: { orgId: 'o1', plan: 'pro' } }, 'a plan payment, not an order'],
    [{ ...ok, amount: 0 }, 'zero amount'],
  ]) assert.equal(L.checkOrderCharge(bad, 'se_A').ok, false, why);
});

test('paystack: the same reference always maps to the same payment (no double credit)', () => {
  assert.equal(L.paystackPaymentId('se_abc_123'), L.paystackPaymentId('se_abc_123'));
  assert.notEqual(L.paystackPaymentId('se_abc_123'), L.paystackPaymentId('se_abc_124'));
  assert.doesNotMatch(L.paystackPaymentId('a/b c'), /[/ ]/, 'safe as a Firestore doc id');
});

test('paystack: paying the full amount confirms a pending order', () => {
  const s = L.settle({ totalMinor: 10500, paidMinor: 0, status: 'pending' }, 10500);
  assert.deepEqual([s.paymentState, s.fullyPaid, s.confirms, s.balanceMinor, s.flags], ['paid', true, true, 0, []]);
  assert.equal(L.settle({ totalMinor: 10500, paidMinor: 0, status: 'ready' }, 10500).confirms, false, 'only pending orders are confirmed');
});

test('paystack: paying less than due leaves the order partially paid and flagged', () => {
  const s = L.settle({ totalMinor: 10500, paidMinor: 0, status: 'pending' }, 6000);
  assert.deepEqual([s.paymentState, s.fullyPaid, s.confirms, s.balanceMinor], ['partial', false, false, 4500]);
  assert.deepEqual(s.flags, ['amount_mismatch']);
  assert.deepEqual(L.settle({ totalMinor: 10500, paidMinor: 0, status: 'cancelled' }, 10500).flags, ['order_cancelled']);
});

test('paystack: fee added for the customer is not credited to the order', () => {
  const { amountMinor, feeMinor } = L.payLinkAmount(10000, true);
  assert.ok(amountMinor > 10000 && feeMinor === amountMinor - 10000);
  // After Paystack takes 1.95% of what the customer paid, the merchant nets at least what was due.
  assert.ok(amountMinor - Math.round((amountMinor * L.PAYSTACK_GH_FEE_BPS) / 10000) >= 10000);
  assert.deepEqual(L.payLinkAmount(10000, false), { amountMinor: 10000, feeMinor: 0 });
  const link = { reference: 'se_A', feeMinor };
  assert.equal(L.creditFromCharge(amountMinor, 'se_A', link), 10000);
  assert.equal(L.creditFromCharge(5000, 'se_OTHER', link), 5000, 'a different link: no fee to strip');
  assert.equal(L.creditFromCharge(100, 'se_A', link), 0, 'never negative');
});

test('paystack: one reminder only while WhatsApp allows it', () => {
  const now = 1_800_000_000_000;
  const base = { nowMs: now, paymentState: 'unpaid', status: 'pending', lastInboundMs: now - 40 * 60000 };
  assert.equal(L.reminderDecision(base), 'send');
  assert.equal(L.reminderDecision({ ...base, paymentState: 'paid' }), 'skip_paid');
  assert.equal(L.reminderDecision({ ...base, status: 'cancelled' }), 'skip_cancelled');
  assert.equal(L.reminderDecision({ ...base, lastInboundMs: now - 25 * 3600000 }), 'skip_window');
  assert.equal(L.reminderDecision({ ...base, lastInboundMs: null }), 'skip_window');
});

test('paystack: payment message shows the link, and MoMo numbers only in "both" mode', () => {
  const momo = { mtn: '0244118802', accountName: 'Kate' };
  const link = { url: 'https://checkout.paystack.com/abc', amountMinor: 10700, feeMinor: 200 };
  const linkOnly = howToPay(10500, momo, link, 'link', 'GHS');
  assert.match(linkOnly, /checkout\.paystack\.com\/abc/);
  assert.match(linkOnly, /payment fee/);
  assert.doesNotMatch(linkOnly, /0244118802/);
  assert.match(howToPay(10500, momo, link, 'both', 'GHS'), /0244118802/);
  assert.match(howToPay(10500, momo, null, 'link', 'GHS'), /Transaction ID/, 'no link: manual fallback');
});
