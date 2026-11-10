import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { GRAPH_VERSION } from '../config';
import type { WhatsappCredentials } from '../domain/model';
import { customerRef, messagesRef } from '../tenant';

/**
 * The only place SellEazy calls Meta's WhatsApp Cloud API (ported from
 * OrderFlow's functions/src/whatsapp/client.ts and worker/src/whatsapp.ts).
 */
export interface SendResult {
  ok: boolean;
  waMessageId: string | null;
  error?: string;
}

async function send(creds: WhatsappCredentials, payload: Record<string, unknown>): Promise<SendResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION.value()}/${creds.phoneNumberId}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    if (!response.ok) {
      const detail = await response.text();
      logger.error('WhatsApp send failed', { status: response.status, detail });
      return { ok: false, waMessageId: null, error: detail };
    }
    const body = (await response.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
    return { ok: true, waMessageId: body.messages?.[0]?.id ?? null };
  } catch (err) {
    logger.error('WhatsApp send threw', err);
    return { ok: false, waMessageId: null, error: String(err) };
  }
}

const truncate = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface CarouselCard {
  imageUrl: string;
  body: string;
  buttonId: string;
  buttonTitle: string;
}

export const wa = {
  text: (creds: WhatsappCredentials, to: string, body: string) =>
    send(creds, { to, type: 'text', text: { preview_url: false, body: truncate(body, 4096) } }),

  list: (creds: WhatsappCredentials, to: string, o: { body: string; button: string; section: string; rows: ListRow[] }) =>
    send(creds, {
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: truncate(o.body, 1024) },
        action: {
          button: truncate(o.button, 20),
          sections: [
            {
              title: truncate(o.section, 24),
              rows: o.rows.slice(0, 10).map((r) => ({
                id: r.id.slice(0, 200),
                title: truncate(r.title, 24),
                ...(r.description ? { description: truncate(r.description, 72) } : {}),
              })),
            },
          ],
        },
      },
    }),

  buttons: (creds: WhatsappCredentials, to: string, o: { body: string; buttons: Array<{ id: string; title: string }>; imageUrl?: string }) =>
    send(creds, {
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(o.imageUrl ? { header: { type: 'image', image: { link: o.imageUrl } } } : {}),
        body: { text: truncate(o.body, 1024) },
        action: { buttons: o.buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id.slice(0, 200), title: truncate(b.title, 20) } })) },
      },
    }),

  /** Swipeable photo cards, 2 to 10, each with one quick-reply button. Taps arrive as button_reply. */
  carousel: (creds: WhatsappCredentials, to: string, o: { body: string; cards: CarouselCard[] }) =>
    send(creds, {
      to,
      type: 'interactive',
      interactive: {
        type: 'carousel',
        body: { text: truncate(o.body, 1024) },
        action: {
          cards: o.cards.slice(0, 10).map((c, i) => ({
            card_index: i,
            type: 'cta_url',
            header: { type: 'image', image: { link: c.imageUrl } },
            body: { text: truncate(c.body, 160) },
            action: { buttons: [{ type: 'quick_reply', quick_reply: { id: c.buttonId.slice(0, 256), title: truncate(c.buttonTitle, 20) } }] },
          })),
        },
      },
    }),

  markRead: (creds: WhatsappCredentials, messageId: string) => send(creds, { status: 'read', message_id: messageId }),
};

export type Sender = 'bot' | 'staff';

/**
 * Sends to one customer and records every message in their conversation,
 * so the Inbox shows exactly what the customer saw.
 */
export class Outbox {
  constructor(
    private creds: WhatsappCredentials,
    private orgId: string,
    private waId: string,
    private by: Sender = 'bot',
    private staffUid: string | null = null,
  ) {}

  async text(body: string) {
    return this.log(await wa.text(this.creds, this.waId, body), 'text', body, null);
  }

  async list(o: { body: string; button: string; section: string; rows: ListRow[] }) {
    return this.log(await wa.list(this.creds, this.waId, o), 'list', o.body, { button: o.button, options: o.rows.map((r) => r.title) });
  }

  async buttons(o: { body: string; buttons: Array<{ id: string; title: string }>; imageUrl?: string }) {
    return this.log(await wa.buttons(this.creds, this.waId, o), 'buttons', o.body, { options: o.buttons.map((b) => b.title) });
  }

  async carousel(o: { body: string; cards: CarouselCard[] }) {
    return this.log(await wa.carousel(this.creds, this.waId, o), 'carousel', o.body, { options: o.cards.map((c) => c.body.split('\n')[0].replace(/\*/g, '')) });
  }

  private async log(result: SendResult, type: string, body: string, extra: Record<string, unknown> | null) {
    await messagesRef(this.orgId, this.waId).add({
      direction: 'out',
      by: this.by,
      staffUid: this.staffUid,
      type,
      body,
      extra,
      waMessageId: result.waMessageId,
      failed: !result.ok,
      createdAt: FieldValue.serverTimestamp(),
    });
    await customerRef(this.orgId, this.waId).set({ lastMessageAt: FieldValue.serverTimestamp() }, { merge: true });
    return result;
  }
}
