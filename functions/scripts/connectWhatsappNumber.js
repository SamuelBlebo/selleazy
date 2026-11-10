#!/usr/bin/env node
/**
 * Platform-owner tool: links a WhatsApp Cloud API number to a SellEazy business
 * without Embedded Signup. Use it for your own number or Meta's test number
 * while Business Verification is pending. It does what claimNumber() in
 * src/http/whatsapp.ts does: checks the number with Meta, subscribes the app
 * to the WABA's webhooks, then writes whatsappAccounts/{phoneNumberId} and
 * the organization's `whatsapp` field.
 *
 *   OWNER_PHONE    the merchant's SellEazy sign-in phone, e.g. 0240000001
 *                  (or OWNER_EMAIL for Google / email sign-in, or ORG_ID)
 *   PHONE_NUMBER_ID, WABA_ID   Meta → WhatsApp → API Setup
 *   WA_TOKEN       a System User permanent token with whatsapp_business_messaging
 *                  and whatsapp_business_management (temporary tokens expire in 24h)
 *   WA_PIN         optional: 6-digit two-step PIN. Registers a number you added
 *                  yourself in WhatsApp Manager (not needed for Meta's test number)
 *   DISCONNECT=1   unlinks the business's number instead
 *   DRY_RUN=1      checks everything with Meta, writes nothing
 *
 * PowerShell, in functions/, with a service account key from Firebase console →
 * Project settings → Service accounts (keep the JSON outside the repo):
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\kasa-dp-prod.json"; $env:GCLOUD_PROJECT="kasa-dp-prod"
 *   $env:OWNER_PHONE="0240000001"; $env:PHONE_NUMBER_ID="..."; $env:WABA_ID="..."; $env:WA_TOKEN="..."
 *   npm run connect:whatsapp
 */
const admin = require('firebase-admin');

const GRAPH = `https://graph.facebook.com/${process.env.GRAPH_VERSION || 'v21.0'}`;
const env = (name) => (process.env[name] || '').trim();

if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
const { FieldValue } = admin.firestore;

/** Same as web/src/utils/phone.ts normalizePhone. */
const normalizePhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('0') && digits.length === 10 ? `233${digits.slice(1)}` : digits;
};

async function graph(path, token, init = {}) {
  const res = await fetch(`${GRAPH}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta ${init.method || 'GET'} ${path} failed (${res.status}): ${body.error?.message || JSON.stringify(body)}`);
  return body;
}

async function findOrgId() {
  if (env('ORG_ID')) return env('ORG_ID');
  if (!env('OWNER_PHONE') && !env('OWNER_EMAIL')) throw new Error('Set OWNER_PHONE (the merchant sign-in phone), OWNER_EMAIL (Google or email sign-in) or ORG_ID.');
  const email = env('OWNER_EMAIL') || `${normalizePhone(env('OWNER_PHONE'))}@phone.kasa.internal`;
  const user = await admin.auth().getUserByEmail(email).catch((err) => {
    if (err.code === 'auth/user-not-found') return null;
    throw new Error(`Could not reach Firebase Auth (check GOOGLE_APPLICATION_CREDENTIALS and GCLOUD_PROJECT): ${err.message}`);
  });
  if (!user) throw new Error(`No SellEazy account signs in with ${email}. Sign up on the website first.`);
  const orgId = (await db.collection('users').doc(user.uid).get()).get('orgId');
  if (!orgId) throw new Error(`${email} has an account but no business yet. Finish onboarding on the website first.`);
  return orgId;
}

async function disconnect(orgRef) {
  const phoneNumberId = (await orgRef.get()).get('whatsapp.phoneNumberId');
  const batch = db.batch();
  if (phoneNumberId) batch.delete(db.collection('whatsappAccounts').doc(phoneNumberId));
  batch.update(orgRef, {
    whatsapp: { connected: false, phoneNumberId: null, wabaId: null, displayPhoneNumber: null, verifiedName: null, qualityRating: null, connectedAt: null },
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (!env('DRY_RUN')) await batch.commit();
  console.log(phoneNumberId ? `Disconnected ${phoneNumberId}.` : 'No number was connected.');
}

async function main() {
  const orgId = await findOrgId();
  const orgRef = db.collection('organizations').doc(orgId);
  const org = await orgRef.get();
  if (!org.exists) throw new Error(`Organization ${orgId} does not exist.`);
  console.log(`Business: ${org.get('name')} (${orgId})`);
  if (env('DISCONNECT')) return disconnect(orgRef);

  const phoneNumberId = env('PHONE_NUMBER_ID');
  const wabaId = env('WABA_ID');
  const token = env('WA_TOKEN');
  if (!phoneNumberId || !wabaId || !token) throw new Error('Set PHONE_NUMBER_ID, WABA_ID and WA_TOKEN.');

  const probe = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`, token);
  if (!probe.display_phone_number) throw new Error('Meta did not return a phone number for that PHONE_NUMBER_ID.');
  console.log(`Number:   ${probe.display_phone_number} "${probe.verified_name ?? ''}" (verification ${probe.code_verification_status ?? 'n/a'})`);

  const existing = await db.collection('whatsappAccounts').doc(phoneNumberId).get();
  if (existing.exists && existing.get('organizationId') !== orgId) {
    throw new Error(`That number is already linked to organization ${existing.get('organizationId')}. Disconnect it there first.`);
  }
  if (env('DRY_RUN')) return console.log('DRY_RUN: Meta accepted the token and number. Nothing written.');

  if (env('WA_PIN')) {
    await graph(`${phoneNumberId}/register`, token, { method: 'POST', body: JSON.stringify({ messaging_product: 'whatsapp', pin: env('WA_PIN') }) });
    console.log('Registered the number for Cloud API.');
  }
  await graph(`${wabaId}/subscribed_apps`, token, { method: 'POST' });
  console.log('Subscribed the app to this WABA\'s webhooks.');

  await db.runTransaction(async (tx) => {
    tx.set(db.collection('whatsappAccounts').doc(phoneNumberId), {
      organizationId: orgId,
      phoneNumberId,
      businessAccountId: wabaId,
      displayPhone: probe.display_phone_number,
      accessToken: token,
      webhookStatus: 'pending',
      connectedAt: FieldValue.serverTimestamp(),
    });
    tx.update(orgRef, {
      whatsapp: {
        connected: true,
        phoneNumberId,
        wabaId,
        displayPhoneNumber: probe.display_phone_number,
        verifiedName: probe.verified_name ?? null,
        qualityRating: probe.quality_rating ?? null,
        connectedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  console.log(`Connected. Message ${probe.display_phone_number} from another phone; the first message flips webhookStatus to "verified".`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
  });
