#!/usr/bin/env node
/**
 * Seeds a demo merchant on SellEazy's model so the dashboard has real-looking
 * data without a WhatsApp connection. Re-runnable: it deletes and rebuilds
 * the demo business each time. All data is made up.
 *
 *   DEMO_TYPE = retail (default) | services | food
 *
 * PowerShell, against the emulators:
 *   firebase emulators:start --only auth,firestore,functions --project demo-kasa
 *   # second window, in functions/:
 *   $env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $env:GCLOUD_PROJECT="demo-kasa"; $env:DEMO_TYPE="services"; npm run seed:demo
 *
 * Against a real project: set GOOGLE_APPLICATION_CREDENTIALS to a service
 * account JSON and GCLOUD_PROJECT to the project id instead of the emulator vars.
 */
const admin = require('firebase-admin');

const TYPE = process.env.DEMO_TYPE || 'retail';
const PHONE = process.env.DEMO_PHONE || '233240000001';
const PASSWORD = process.env.DEMO_PASSWORD || 'SellEazyDemo!2026';
const EMAIL = `${PHONE}@phone.kasa.internal`; // matches web/src/utils/phone.ts

if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const DATA = {
  retail: {
    name: 'Kofi Phones & Accessories', owner: 'Kofi Mensah', area: 'Circle, Accra', category: 'Phones & electronics',
    features: { kitchen: false, bookings: true, delivery: true, pickup: true, onSite: false },
    businessType: 'mixed',
    items: [
      ['product', 'Samsung Galaxy A15', 'Phones', 185000, 6, ['a15', 'galaxy a15']],
      ['product', 'Tecno Spark 20', 'Phones', 135000, 4, ['spark 20', 'tecno']],
      ['product', 'iPhone charger 20W', 'Accessories', 15000, 25, ['iphone charger', 'charger']],
      ['product', 'Type-C cable', 'Accessories', 4000, 40, ['type c', 'usb c']],
      ['product', 'Phone case', 'Accessories', 5000, 3, ['case', 'cover']],
      ['product', 'Power bank 20000mAh', 'Accessories', 25000, 10, ['power bank']],
      ['service', 'Screen replacement', 'Repairs', 45000, 0, ['screen', 'broken screen'], 60],
      ['service', 'Battery replacement', 'Repairs', 20000, 0, ['battery'], 30],
    ],
  },
  services: {
    name: "Efua's Hair Studio", owner: 'Efua Asante', area: 'East Legon, Accra', category: 'Salon & barbering',
    features: { kitchen: false, bookings: true, delivery: false, pickup: false, onSite: true },
    businessType: 'services',
    items: [
      ['service', 'Knotless braids', 'Braids', 35000, 0, ['knotless', 'braids'], 300],
      ['service', 'Box braids', 'Braids', 28000, 0, ['box braid'], 240],
      ['service', 'Cornrows', 'Braids', 12000, 0, ['cornrow', 'all back'], 90],
      ['service', 'Wash and set', 'Care', 8000, 0, ['wash', 'washing'], 60],
      ['service', 'Wig install', 'Wigs', 15000, 0, ['wig', 'frontal'], 90],
      ['service', 'Pedicure', 'Nails', 10000, 0, ['pedi'], 45],
    ],
  },
  food: {
    name: "Ama's Kitchen", owner: 'Ama Asiedu', area: 'Osu, Accra', category: 'Restaurant',
    features: { kitchen: true, bookings: false, delivery: true, pickup: true, onSite: false },
    businessType: 'food',
    items: [
      ['product', 'Jollof rice with chicken', 'Mains', 4500, 30, ['jollof', 'jolof']],
      ['product', 'Waakye special', 'Mains', 4000, 20, ['waakye']],
      ['product', 'Banku & grilled tilapia', 'Mains', 8500, 10, ['banku', 'tilapia']],
      ['product', 'Fufu & light soup', 'Soups', 5500, 12, ['fufu']],
      ['product', 'Kelewele (bowl)', 'Sides', 1500, 25, ['kelewele']],
      ['product', 'Sobolo (500ml)', 'Drinks', 1000, 4, ['sobolo', 'bissap']],
    ],
  },
}[TYPE];
if (!DATA) throw new Error(`Unknown DEMO_TYPE ${TYPE}`);

const CUSTOMERS = [
  ['233244118802', 'Akosua Mensah', 'East Legon'], ['233244123377', 'Kwame Asante', 'Spintex'], ['233209876512', 'Afia Owusu', 'Dzorwulu'],
  ['233277445190', 'Esi Quaye', 'Labone'], ['233553019874', 'Kweku Ofori', 'Osu'], ['233246602231', 'Fiifi Boateng', 'Cantonments'],
];

async function main() {
  let user;
  try {
    user = await admin.auth().getUserByEmail(EMAIL);
    await admin.auth().updateUser(user.uid, { password: PASSWORD, displayName: DATA.owner });
  } catch {
    user = await admin.auth().createUser({ email: EMAIL, password: PASSWORD, displayName: DATA.owner });
  }
  const old = await db.collection('users').doc(user.uid).get();
  if (old.get('orgId')) await db.recursiveDelete(db.collection('organizations').doc(old.get('orgId')));

  const org = db.collection('organizations').doc();
  const now = Date.now();
  const ts = (minutesAgo) => Timestamp.fromMillis(now - minutesAgo * 60000);
  await org.set({
    name: DATA.name, slug: `demo-${TYPE}`, phone: `+${PHONE}`, area: DATA.area, businessType: DATA.businessType, category: DATA.category,
    currency: 'GHS', deliveryFeeMinor: DATA.features.delivery ? 1000 : 0, features: DATA.features, ownerUid: user.uid,
    bot: { menuEnabled: true, freeTextEnabled: true, greeting: `Akwaaba to ${DATA.name}! Tap below to see what we have, or just type what you want.` },
    momo: { mtn: '024 000 0001', telecel: '020 000 0001', airteltigo: null, accountName: DATA.owner },
    subscription: { plan: 'starter', status: 'active', renewsAt: null, currentPeriodStart: null, ordersUsedThisPeriod: 0, paymentProvider: null, externalCustomerId: null, externalSubscriptionId: null, billingEmail: null },
    whatsapp: { connected: false, phoneNumberId: null, wabaId: null, displayPhoneNumber: null, verifiedName: null, qualityRating: null, connectedAt: null },
    orderCounter: 0, suspended: false, suspendedReason: null, suspendedAt: null, createdAt: ts(60 * 24 * 40), updatedAt: ts(0),
  });
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: EMAIL, fullName: DATA.owner, orgId: org.id, role: 'owner', createdAt: ts(0), updatedAt: ts(0) });
  await org.collection('members').doc(user.uid).set({ fullName: DATA.owner, contact: `+${PHONE}`, role: 'owner', createdAt: ts(0) });

  const items = [];
  for (const [kind, name, category, priceMinor, stock, aliases, duration] of DATA.items) {
    const ref = org.collection('items').doc();
    const item = {
      kind, name, description: '', category, priceMinor, active: true, aliases, imageUrl: null, imagePath: null, sku: null,
      trackStock: kind === 'product', stock: kind === 'product' ? stock : 0, lowStockAt: 5,
      durationMinutes: kind === 'service' ? duration ?? null : null, requiresBooking: kind === 'service', createdAt: ts(9000), updatedAt: ts(0),
    };
    await ref.set(item);
    items.push({ id: ref.id, ...item });
  }

  // Orders the way the real code writes them (functions/src/services/orders.ts), spread over the last 3 days.
  const statuses = ['completed', 'completed', 'completed', 'completed', 'in_progress', 'confirmed', 'pending', 'pending', 'cancelled', 'ready'];
  let number = 0;
  for (let i = 0; i < 18; i++) {
    const [waId, name, area] = CUSTOMERS[i % CUSTOMERS.length];
    const item = items[(i * 3) % items.length];
    const qty = item.kind === 'product' ? 1 + (i % 2) : 1;
    const status = statuses[i % statuses.length];
    const minutesAgo = i < 8 ? 30 + i * 35 : 60 * 24 + i * 120;
    const fulfilment = item.kind === 'service' ? (DATA.features.onSite && i % 3 === 0 ? 'on_site' : 'appointment') : i % 2 ? 'delivery' : 'pickup';
    const fee = fulfilment === 'delivery' ? 1000 : 0;
    const total = item.priceMinor * qty + fee;
    const paid = status === 'completed' || status === 'in_progress' || status === 'confirmed' || status === 'ready';
    number += 1;
    const ref = org.collection('orders').doc();
    await ref.set({
      number, status, paymentState: paid ? 'paid' : status === 'pending' && i % 2 ? 'submitted' : 'unpaid', paidMinor: paid ? total : 0,
      fulfilment, channel: i % 3 === 0 ? 'whatsapp_text' : 'whatsapp_menu', customerId: waId, customerName: name, customerPhone: `+${waId}`,
      deliveryAddress: fulfilment === 'delivery' || fulfilment === 'on_site' ? `${area}, Accra` : null,
      appointmentRequest: item.kind === 'service' ? 'Saturday 10am' : null,
      appointmentAt: item.kind === 'service' ? Timestamp.fromMillis(now + ((i % 5) + 1) * 3600000) : null,
      lines: [{ itemId: item.id, kind: item.kind, name: item.name, unitPriceMinor: item.priceMinor, quantity: qty, durationMinutes: item.durationMinutes }],
      hasProducts: item.kind === 'product', hasServices: item.kind === 'service',
      subtotalMinor: item.priceMinor * qty, deliveryFeeMinor: fee, totalMinor: total, currency: 'GHS', note: null,
      cancelReason: status === 'cancelled' ? 'No payment' : null, rider: null,
      statusHistory: [{ status: 'pending', at: ts(minutesAgo), by: 'bot' }, ...(status !== 'pending' ? [{ status, at: ts(minutesAgo - 10), by: user.uid }] : [])],
      createdBy: 'bot', createdAt: ts(minutesAgo), updatedAt: ts(minutesAgo - 10),
    });
    if (status === 'pending' && i % 2) {
      await org.collection('payments').add({
        orderId: ref.id, orderNumber: number, customerId: waId, customerName: name, method: 'momo', network: 'mtn',
        reference: String(52816047000 + i), claimedMinor: i === 7 ? total - 500 : total, expectedMinor: total, payerPhone: `+${waId}`,
        status: 'submitted', flags: i === 7 ? ['amount_mismatch'] : [], duplicateOfOrderNumber: null, source: 'whatsapp',
        submittedBy: 'bot', verifiedBy: null, verifiedAt: null, rejectedReason: null, createdAt: ts(minutesAgo - 5), updatedAt: ts(minutesAgo - 5),
      });
    }
  }
  const d = new Date();
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  await org.update({ orderCounter: number, 'subscription.ordersUsedThisPeriod': number, 'subscription.currentPeriodStart': period });

  for (const [waId, name, area] of CUSTOMERS) {
    await org.collection('customers').doc(waId).set({
      name, phone: `+${waId}`, waProfileName: name, address: `${area}, Accra`, note: null, tags: [], orderCount: 3, totalSpentMinor: 30000,
      lastOrderAt: ts(60), lastMessageAt: ts(20), unreadCount: waId.endsWith('02') ? 1 : 0, needsHuman: waId.endsWith('12'), createdAt: ts(9000),
    });
    await org.collection('customers').doc(waId).collection('messages').add({ direction: 'in', by: 'customer', type: 'text', body: 'Hello', waMessageId: null, createdAt: ts(25) });
  }

  // One typed order waiting for a human, to show the draft flow.
  const [waId, name] = CUSTOMERS[0];
  const it = items[0];
  const text = it.kind === 'service' ? `I want ${it.aliases[0]} Saturday 10am please` : `2 ${it.aliases[0]} abeg, deliver to East Legon`;
  await org.collection('draftOrders').add({
    customerId: waId, customerName: name, text, lines: [{ itemId: it.id, name: it.name, quantity: it.kind === 'service' ? 1 : 2, unitPriceMinor: it.priceMinor, kind: it.kind }],
    unmatched: [], confidence: 0.86, fulfilment: it.kind === 'service' ? 'appointment' : 'delivery', address: it.kind === 'service' ? null : 'East Legon',
    appointmentRequest: it.kind === 'service' ? 'saturday 10am' : null, appointmentAt: null, status: 'open', orderId: null, createdAt: ts(9),
  });
  await org.collection('customers').doc(waId).collection('messages').add({ direction: 'in', by: 'customer', type: 'text', body: text, waMessageId: null, createdAt: ts(9) });

  console.log(`\nDemo "${DATA.name}" ready (${TYPE}).\nSign in with phone 0${PHONE.slice(3)} and password ${PASSWORD}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
