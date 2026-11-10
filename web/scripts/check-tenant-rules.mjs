// Tenant-isolation check against the Firestore emulator (real firestore.rules).
// Needs the emulators running and the demo seeded (see README → "Run it locally").
//
// PowerShell, from web/:
//   $env:EMU_PORTS="9099,8080"; node scripts/check-tenant-rules.mjs
//
// Each line must say PASS. It tries the OrderFlow takeover (writing your own
// users/{uid} with someone else's orgId) and other writes only Cloud Functions may do.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, limit, query, setDoc, updateDoc } from 'firebase/firestore';

const [authPort, fsPort] = (process.env.EMU_PORTS ?? '9099,8080').split(',');
const app = initializeApp({ apiKey: 'demo', projectId: process.env.PROJECT ?? 'demo-kasa' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', Number(fsPort));

let failures = 0;
async function expect(label, shouldSucceed, fn) {
  try {
    await fn();
    if (shouldSucceed) console.log(`PASS  allowed: ${label}`);
    else { failures++; console.log(`FAIL  should be denied: ${label}`); }
  } catch (e) {
    const denied = String(e.code ?? e.message).includes('permission-denied');
    if (!shouldSucceed && denied) console.log(`PASS  denied:  ${label}`);
    else { failures++; console.log(`FAIL  ${label}: ${e.code ?? e.message}`); }
  }
}

// 1. The demo owner (seeded by functions/scripts/seedDemoMerchant.js).
await signInWithEmailAndPassword(auth, '233240000001@phone.kasa.internal', 'SellEazyDemo!2026');
const me = await getDoc(doc(db, 'users', auth.currentUser.uid));
const orgId = me.data().orgId;
const item = (await getDocs(query(collection(db, 'organizations', orgId, 'items'), limit(1)))).docs[0];
const order = (await getDocs(query(collection(db, 'organizations', orgId, 'orders'), limit(1)))).docs[0];

await expect('owner reads own business', true, () => getDoc(doc(db, 'organizations', orgId)));
await expect('owner changes delivery fee', true, () => updateDoc(doc(db, 'organizations', orgId), { deliveryFeeMinor: 1500, businessType: 'services' }));
await expect('owner gives themselves the Pro plan', false, () => updateDoc(doc(db, 'organizations', orgId), { 'subscription.plan': 'pro' }));
await expect('owner flips their own suspension flag', false, () => updateDoc(doc(db, 'organizations', orgId), { suspended: true, suspendedReason: 'x' }));
await expect('owner edits stock directly (must use adjustStock)', false, () => updateDoc(item.ref, { stock: 999 }));
await expect('owner changes an order status directly', false, () => updateDoc(order.ref, { status: order.data().status === 'completed' ? 'pending' : 'completed' }));
await expect('owner marks an order paid directly', false, () => updateDoc(order.ref, { paymentState: order.data().paymentState === 'paid' ? 'unpaid' : 'paid' }));
await expect('owner edits an order note', true, () => updateDoc(order.ref, { note: `checked ${Date.now()}` }));
await expect('owner creates a fake payment', false, () => addDoc(collection(db, 'organizations', orgId, 'payments'), { status: 'verified' }));
await expect('owner changes own role', false, () => setDoc(doc(db, 'users', auth.currentUser.uid), { role: 'owner', orgId }, { merge: true }));
await expect('anyone reads WhatsApp tokens', false, () => getDocs(query(collection(db, 'whatsappAccounts'), limit(1))));

// 2. A brand-new stranger tries to get into that business.
await createUserWithEmailAndPassword(auth, `attacker${Date.now()}@example.com`, 'Password123');
const uid = auth.currentUser.uid;
await expect('stranger writes users/{uid} with the victim orgId (OrderFlow hole)', false, () => setDoc(doc(db, 'users', uid), { orgId, role: 'owner' }));
await expect('stranger reads the victim business', false, () => getDoc(doc(db, 'organizations', orgId)));
await expect('stranger reads the victim orders', false, () => getDocs(query(collection(db, 'organizations', orgId, 'orders'), limit(1))));
await expect('stranger creates a business from the browser', false, () => addDoc(collection(db, 'organizations'), { name: 'x', ownerUid: uid, subscription: { plan: 'pro' } }));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll tenant-isolation checks passed.');
process.exit(failures ? 1 : 0);
