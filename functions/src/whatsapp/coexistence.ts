import { createHash } from 'node:crypto';
import type { InboundMessage } from './bot';

/**
 * WhatsApp Coexistence: a merchant keeps using the WhatsApp Business app on
 * their phone while SellEazy runs the same number through the Cloud API.
 * Meta then sends three extra webhook fields besides `messages`:
 *   - smb_message_echoes: what the merchant typed in the phone app
 *   - history: the chats from before they connected (once, in chunks)
 *   - smb_app_state_sync: the contacts saved in the phone app
 *
 * This file only turns webhook payloads into queued tasks and holds the
 * "bot pauses while the owner replies" rule. No Firestore here, so it is
 * tested without an emulator. The writes live in phoneApp.ts.
 */

export type WhatsappMode = 'coexistence' | 'cloud';

/** Minutes the bot stays quiet after the owner replies from the phone app. 0 = never pause. */
export const DEFAULT_PHONE_REPLY_PAUSE_MINUTES = 30;

/** A message the merchant sent from the phone app, or one in an imported chat. */
export interface PhoneMessage {
  id: string;
  from: string;
  to?: string;
  timestamp?: string;
  type: string;
  text?: { body: string };
}

export interface HistoryThread {
  /** The customer's wa_id. */
  id: string;
  messages: PhoneMessage[];
}

export interface PhoneContact {
  waId: string;
  name: string | null;
}

/** One unit of work, saved as webhookEvents/{id} and handled by processWhatsappEvent. */
export type WebhookTask =
  | { id: string; kind: 'message'; message: InboundMessage; profileName: string }
  | { id: string; kind: 'echo'; message: PhoneMessage }
  | { id: string; kind: 'history'; thread: HistoryThread }
  | { id: string; kind: 'contact'; contact: PhoneContact };

export interface ChangeValue {
  metadata?: { phone_number_id?: string };
  messages?: InboundMessage[];
  contacts?: Array<{ profile?: { name?: string } }>;
  message_echoes?: PhoneMessage[];
  history?: Array<{ threads?: Array<{ id?: string; messages?: PhoneMessage[] }>; errors?: unknown[] }>;
  state_sync?: Array<{ type?: string; action?: string; contact?: { full_name?: string; first_name?: string; phone_number?: string } }>;
}

const digest = (...parts: string[]) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24);

/**
 * Event ids are derived from the payload, so a Meta retry (or Meta sending
 * the same history chunk twice) maps to the same webhookEvents doc and
 * create() turns it into a no-op.
 */
export function tasksFromChange(field: string | undefined, value: ChangeValue | undefined): WebhookTask[] {
  if (!value) return [];
  const phoneNumberId = value.metadata?.phone_number_id ?? '';

  if (field === 'smb_message_echoes') {
    return (value.message_echoes ?? [])
      .filter((m) => m?.id && m.to)
      .map((m) => ({ id: `echo_${digest(phoneNumberId, m.id)}`, kind: 'echo' as const, message: m }));
  }

  if (field === 'history') {
    const tasks: WebhookTask[] = [];
    for (const chunk of value.history ?? []) {
      for (const t of chunk.threads ?? []) {
        if (!t.id) continue;
        const messages = uniqueById(t.messages ?? []);
        if (!messages.length) continue;
        tasks.push({
          id: `history_${digest(phoneNumberId, t.id, ...messages.map((m) => m.id).sort())}`,
          kind: 'history',
          thread: { id: t.id, messages },
        });
      }
    }
    return tasks;
  }

  if (field === 'smb_app_state_sync') {
    return (value.state_sync ?? [])
      .filter((s) => s.type === 'contact' && s.action !== 'remove' && s.contact?.phone_number)
      .map((s) => {
        const waId = s.contact!.phone_number!.replace(/\D/g, '');
        const name = (s.contact!.full_name || s.contact!.first_name || '').trim() || null;
        return { id: `contact_${digest(phoneNumberId, waId, name ?? '')}`, kind: 'contact' as const, contact: { waId, name } };
      })
      .filter((t) => t.contact.waId.length >= 9);
  }

  // `messages` (and anything without a field, as before Coexistence).
  if (field && field !== 'messages') return [];
  const profileName = value.contacts?.[0]?.profile?.name ?? '';
  return (value.messages ?? []).filter((m) => m?.id).map((message) => ({ id: message.id, kind: 'message' as const, message, profileName }));
}

function uniqueById(messages: PhoneMessage[]): PhoneMessage[] {
  const seen = new Set<string>();
  return messages.filter((m) => m?.id && !seen.has(m.id) && seen.add(m.id));
}

/** How a phone-app message is stored in customers/{waId}/messages/{message.id}. */
export function phoneMessageRecord(m: PhoneMessage, customerWaId: string) {
  const fromCustomer = m.from === customerWaId;
  return {
    direction: fromCustomer ? ('in' as const) : ('out' as const),
    by: fromCustomer ? ('customer' as const) : ('merchant_phone' as const),
    type: m.type,
    body: m.text?.body ?? null,
    waMessageId: m.id,
    atMillis: m.timestamp ? Number(m.timestamp) * 1000 : null,
  };
}

/** When the bot may talk again after the owner replied from the phone, or null if pausing is off. */
export function pauseUntil(nowMs: number, minutes: number | undefined): number | null {
  const m = minutes ?? DEFAULT_PHONE_REPLY_PAUSE_MINUTES;
  return m > 0 ? nowMs + m * 60000 : null;
}

export function isBotPaused(pausedUntilMs: number | null | undefined, nowMs: number): boolean {
  return typeof pausedUntilMs === 'number' && pausedUntilMs > nowMs;
}
