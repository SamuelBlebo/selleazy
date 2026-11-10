import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { GRAPH_VERSION, META_APP_ID, META_APP_SECRET } from '../config';
import { db, loadCredentialsForOrg, orgRef, toWaId, whatsappAccountRef } from '../tenant';
import { Outbox, wa } from '../whatsapp/client';
import { parse, requireMember } from './guards';

/**
 * Connecting a merchant's WhatsApp Business number. The Embedded Signup flow
 * moved here from OrderFlow's Cloudflare Worker (worker/src/whatsappConnect.ts):
 * the merchant finishes Meta's popup in the browser, which hands us a code;
 * we exchange it for a token, check the number, subscribe the app to the
 * WABA's webhooks, and claim the number for this organization. The token is
 * stored only in whatsappAccounts/{phoneNumberId}, which no client can read.
 */
const graph = (path: string) => `https://graph.facebook.com/${GRAPH_VERSION.value()}/${path}`;

async function probeNumber(phoneNumberId: string, accessToken: string) {
  const res = await fetch(graph(`${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new HttpsError('invalid-argument', 'Meta rejected that phone number.');
  const body = (await res.json()) as { display_phone_number?: string; verified_name?: string; quality_rating?: string };
  if (!body.display_phone_number) throw new HttpsError('invalid-argument', 'Meta did not return a phone number for that id.');
  return { displayPhone: body.display_phone_number, verifiedName: body.verified_name ?? null, qualityRating: body.quality_rating ?? null };
}

async function claimNumber(orgId: string, input: { phoneNumberId: string; businessAccountId: string; accessToken: string }) {
  const probe = await probeNumber(input.phoneNumberId, input.accessToken);
  await db().runTransaction(async (tx) => {
    const account = whatsappAccountRef(input.phoneNumberId);
    const existing = await tx.get(account);
    if (existing.exists && existing.get('organizationId') !== orgId) {
      throw new HttpsError('already-exists', 'That number is connected to another business on SellEazy.');
    }
    tx.set(account, {
      organizationId: orgId,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId,
      displayPhone: probe.displayPhone,
      accessToken: input.accessToken,
      webhookStatus: 'pending',
      connectedAt: FieldValue.serverTimestamp(),
    });
    tx.update(orgRef(orgId), {
      whatsapp: {
        connected: true,
        phoneNumberId: input.phoneNumberId,
        wabaId: input.businessAccountId,
        displayPhoneNumber: probe.displayPhone,
        verifiedName: probe.verifiedName,
        qualityRating: probe.qualityRating,
        connectedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return probe;
}

export const completeWhatsappSignup = onCall({ secrets: [META_APP_SECRET] }, async (request) => {
  const { orgId } = await requireMember(request.auth, 'whatsapp.manage');
  const input = parse(
    z.object({ code: z.string().min(10), phoneNumberId: z.string().min(5).max(64), businessAccountId: z.string().min(5).max(64) }),
    request.data,
    'Check the values from the signup popup.',
  );
  if (!META_APP_ID.value() || !META_APP_SECRET.value()) {
    throw new HttpsError('failed-precondition', 'WhatsApp connection is not set up on this SellEazy server yet.');
  }

  const tokenUrl = new URL(graph('oauth/access_token'));
  tokenUrl.searchParams.set('client_id', META_APP_ID.value());
  tokenUrl.searchParams.set('client_secret', META_APP_SECRET.value());
  tokenUrl.searchParams.set('code', input.code);
  const tokenRes = await fetch(tokenUrl);
  const token = ((await tokenRes.json().catch(() => ({}))) as { access_token?: string }).access_token;
  if (!tokenRes.ok || !token) throw new HttpsError('invalid-argument', 'Meta rejected that signup code. Try connecting again.');

  const subscribe = await fetch(graph(`${input.businessAccountId}/subscribed_apps`), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  if (!subscribe.ok) {
    logger.error('WABA subscribe failed', { status: subscribe.status, body: await subscribe.text() });
    throw new HttpsError('internal', "Connected, but Meta wouldn't send us message notifications. Try again.");
  }

  const probe = await claimNumber(orgId, { ...input, accessToken: token });
  return { ok: true as const, displayPhone: probe.displayPhone };
});

/** Support fallback: paste an existing permanent token. Not shown in the merchant UI. */
export const connectWhatsappManual = onCall(async (request) => {
  const { orgId } = await requireMember(request.auth, 'whatsapp.manage');
  const input = parse(
    z.object({ phoneNumberId: z.string().min(5).max(64), businessAccountId: z.string().min(5).max(64), accessToken: z.string().min(20).max(600) }),
    request.data,
  );
  const probe = await claimNumber(orgId, input);
  return { ok: true as const, displayPhone: probe.displayPhone };
});

export const disconnectWhatsapp = onCall(async (request) => {
  const { orgId } = await requireMember(request.auth, 'whatsapp.manage');
  const creds = await loadCredentialsForOrg(orgId);
  if (creds) {
    await fetch(graph(`${creds.businessAccountId}/subscribed_apps`), { method: 'DELETE', headers: { Authorization: `Bearer ${creds.accessToken}` } }).catch(
      (err) => logger.warn('Unsubscribe on disconnect failed', { orgId, err }),
    );
  }
  const batch = db().batch();
  if (creds) batch.delete(whatsappAccountRef(creds.phoneNumberId));
  batch.update(orgRef(orgId), {
    whatsapp: { connected: false, phoneNumberId: null, wabaId: null, displayPhoneNumber: null, verifiedName: null, qualityRating: null, connectedAt: null },
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { ok: true as const };
});

export const sendTestMessage = onCall(async (request) => {
  const { orgId } = await requireMember(request.auth, 'whatsapp.manage');
  const { to } = parse(z.object({ to: z.string().regex(/^\+?[0-9\s-]{9,17}$/) }), request.data, 'Enter a valid phone number.');
  const creds = await loadCredentialsForOrg(orgId);
  if (!creds) throw new HttpsError('failed-precondition', 'Connect a WhatsApp number first.');
  const result = await wa.text(creds, toWaId(to), 'Your SellEazy connection is working. Customers can now order from this number.');
  if (!result.ok) throw new HttpsError('internal', 'WhatsApp would not accept that message. Test numbers must be on your allowed list in Meta.');
  return { ok: true as const };
});

/** A staff member's reply from the Inbox. */
export const sendReply = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'inbox.reply');
  const { customerId, text } = parse(z.object({ customerId: z.string().min(5).max(20), text: z.string().trim().min(1).max(2000) }), request.data, 'Type a message first.');
  const creds = await loadCredentialsForOrg(orgId);
  if (!creds) throw new HttpsError('failed-precondition', 'Connect a WhatsApp number first.');
  const result = await new Outbox(creds, orgId, customerId, 'staff', uid).text(text);
  if (!result.ok) {
    throw new HttpsError('failed-precondition', "WhatsApp didn't deliver it. If the customer's last message was over 24 hours ago, only approved templates can be sent.");
  }
  await db().doc(`organizations/${orgId}/customers/${customerId}`).set({ unreadCount: 0, needsHuman: false }, { merge: true });
  return { ok: true as const };
});
