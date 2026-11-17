import { FieldValue } from 'firebase-admin/firestore';
import { getDownloadURL, getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { mediaProblem } from '../domain/media';
import { checkRateLimit } from '../rateLimit';
import { broadcastsRef, loadCredentialsForOrg, orgRef } from '../tenant';
import { Outbox } from '../whatsapp/client';
import { parse, requireMember } from './guards';

const BATCH = 10;

/**
 * Promotions to a list of customers (ported from OrderFlow), as text or as a
 * photo / video with the text as its caption. Meta only lets free-form
 * messages reach people who messaged in the last 24 hours; for older
 * customers this needs an approved marketing template — sends that Meta
 * refuses are counted as failed, never retried blindly. Growth plan and up.
 */
export const sendBroadcast = onCall({ timeoutSeconds: 300 }, async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'broadcasts.send');
  const { message, customerIds, media } = parse(
    z
      .object({
        message: z.string().trim().max(1000),
        customerIds: z.array(z.string().min(5)).min(1).max(300),
        // A file the browser uploaded to Storage; the server checks it and makes the link itself.
        media: z.object({ type: z.enum(['image', 'video']), path: z.string().min(10).max(300) }).nullable().optional(),
      })
      .refine((v) => v.message.length > 0 || v.media, 'Write a message or attach a photo or video.'),
    request.data,
    'Check the message and who it goes to.',
  );
  const org = await orgRef(orgId).get();
  if (!['growth', 'pro'].includes(org.get('subscription.plan') as string)) {
    throw new HttpsError('failed-precondition', 'Promotions are on the Growth plan and above.');
  }

  let mediaUrl: string | null = null;
  if (media) {
    const file = getStorage().bucket().file(media.path);
    const [exists] = await file.exists();
    const meta = exists ? (await file.getMetadata())[0] : null;
    const problem = mediaProblem(orgId, media, meta ? { contentType: meta.contentType, size: Number(meta.size ?? 0) } : null);
    if (problem) throw new HttpsError('invalid-argument', problem);
    mediaUrl = await getDownloadURL(file);
  }

  await checkRateLimit(`broadcast:${orgId}`, 3, 3600);
  const creds = await loadCredentialsForOrg(orgId);
  if (!creds) throw new HttpsError('failed-precondition', 'Connect a WhatsApp number first.');

  const sendOne = (id: string) => {
    const out = new Outbox(creds, orgId, id, 'staff', uid);
    return media && mediaUrl ? out.media({ type: media.type, link: mediaUrl, caption: message || undefined }) : out.text(message);
  };
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < customerIds.length; i += BATCH) {
    const results = await Promise.allSettled(customerIds.slice(i, i + BATCH).map(sendOne));
    results.forEach((r) => (r.status === 'fulfilled' && r.value.ok ? sent++ : failed++));
  }
  await broadcastsRef(orgId).add({
    message,
    mediaType: media?.type ?? null,
    mediaPath: media?.path ?? null,
    audienceSize: customerIds.length,
    sentCount: sent,
    failedCount: failed,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  logger.info('Broadcast sent', { orgId, sent, failed, media: media?.type ?? null });
  return { sentCount: sent, failedCount: failed };
});
