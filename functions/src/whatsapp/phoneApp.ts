import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { WhatsappAccount } from '../domain/model';
import { customerRef, db, messagesRef, orgRef } from '../tenant';
import { pauseUntil, phoneMessageRecord, type HistoryThread, type PhoneContact, type PhoneMessage } from './coexistence';

/**
 * Writes for Coexistence numbers (see coexistence.ts). Every message is
 * stored under its WhatsApp id, so importing the same chat twice overwrites
 * instead of duplicating. None of this ever calls the bot.
 */

const newCustomer = (name: string | null, now: Timestamp) => ({
  name, address: null, note: null, orderCount: 0, totalSpentMinor: 0, lastOrderAt: null, needsHuman: false,
  unreadCount: 0, tags: [], source: 'coexistence', createdAt: now,
});

const preview = (m: PhoneMessage) => (m.text?.body ?? `(${m.type})`).slice(0, 120);

/**
 * The owner replied from the WhatsApp Business app. Show it in Chats, mark
 * the chat as handled, and keep the bot quiet for a while so they don't talk
 * over each other.
 */
export async function recordEcho(account: WhatsappAccount, m: PhoneMessage): Promise<void> {
  const orgId = account.organizationId;
  const waId = m.to!;
  const r = phoneMessageRecord(m, waId);
  const now = Timestamp.now();
  const at = r.atMillis ? Timestamp.fromMillis(r.atMillis) : now;
  const [org, cust] = await Promise.all([orgRef(orgId).get(), customerRef(orgId, waId).get()]);
  const until = pauseUntil(now.toMillis(), org.get('bot.phoneReplyPauseMinutes') as number | undefined);

  await messagesRef(orgId, waId).doc(m.id).set({
    direction: 'out', by: 'merchant_phone', staffUid: null, type: r.type, body: r.body, extra: null,
    waMessageId: m.id, failed: false, createdAt: at,
  });
  await customerRef(orgId, waId).set(
    {
      phone: `+${waId}`,
      lastMessageAt: at,
      lastMessageText: preview(m),
      lastMessageOut: true,
      unreadCount: 0,
      needsHuman: false,
      botPausedUntil: until ? Timestamp.fromMillis(until) : null,
      updatedAt: now,
      ...(cust.exists ? {} : newCustomer(null, now)),
    },
    { merge: true },
  );
}

/** One customer's chat from before the number was connected. */
export async function importHistory(account: WhatsappAccount, thread: HistoryThread): Promise<void> {
  const orgId = account.organizationId;
  const waId = thread.id;
  const now = Timestamp.now();
  const cust = await customerRef(orgId, waId).get();

  let latest: { at: number; m: PhoneMessage; out: boolean } | null = null;
  for (let i = 0; i < thread.messages.length; i += 400) {
    const batch = db().batch();
    for (const m of thread.messages.slice(i, i + 400)) {
      const r = phoneMessageRecord(m, waId);
      const at = r.atMillis ?? now.toMillis();
      batch.set(messagesRef(orgId, waId).doc(m.id), {
        direction: r.direction, by: r.by, staffUid: null, type: r.type, body: r.body, extra: null,
        waMessageId: m.id, failed: false, imported: true, createdAt: Timestamp.fromMillis(at),
      });
      if (!latest || at > latest.at) latest = { at, m, out: r.direction === 'out' };
    }
    await batch.commit();
  }
  if (!latest) return;

  // Only move the chat preview forward: newer live messages win over old history.
  const current = (cust.get('lastMessageAt') as Timestamp | null | undefined)?.toMillis() ?? 0;
  const newer = latest.at > current;
  await customerRef(orgId, waId).set(
    {
      phone: `+${waId}`,
      updatedAt: now,
      ...(newer ? { lastMessageAt: Timestamp.fromMillis(latest.at), lastMessageText: preview(latest.m), lastMessageOut: latest.out } : {}),
      ...(cust.exists ? {} : newCustomer(null, now)),
    },
    { merge: true },
  );
  logger.info('Imported chat history', { orgId, messages: thread.messages.length });
}

/** A contact saved in the phone app. Never overwrites a name the merchant already has. */
export async function importContact(account: WhatsappAccount, c: PhoneContact): Promise<void> {
  const orgId = account.organizationId;
  const ref = customerRef(orgId, c.waId);
  const now = Timestamp.now();
  await db().runTransaction(async (tx) => {
    const cust = await tx.get(ref);
    if (!cust.exists) {
      tx.set(ref, { phone: `+${c.waId}`, lastMessageAt: null, updatedAt: now, ...newCustomer(c.name, now) });
    } else if (!cust.get('name') && c.name) {
      tx.update(ref, { name: c.name, updatedAt: now });
    }
  });
}
