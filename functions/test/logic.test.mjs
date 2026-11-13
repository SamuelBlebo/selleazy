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
