import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { PLANS } from '../billing/plans';
import { PHONE_AUTH_EMAIL_DOMAIN } from '../config';
import { defaultFeatures, type Role } from '../domain/model';
import { ROLES } from '../domain/permissions';
import { db, globalInviteRef, invitesRef, membersRef, orgRef, userRef } from '../tenant';
import { parse, requireAuth, requireMember } from './guards';

/**
 * Tenant provisioning happens only here. OrderFlow let the browser write its
 * own users/{uid} doc, which meant anyone could point it at another
 * business's orgId and become its owner; in SellEazy, users/{uid} and new
 * organizations are written only by these functions (firestore.rules denies
 * the client).
 */
const createInput = z.object({
  businessName: z.string().trim().min(2).max(80),
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional().nullable(),
  businessType: z.enum(['food', 'retail', 'services', 'mixed']),
  category: z.string().trim().max(40).default('other'),
  area: z.string().trim().max(80).optional().nullable(),
});

const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const createOrganization = onCall(async (request) => {
  const auth = requireAuth(request.auth);
  const input = parse(createInput, request.data, 'Fill in your business details.');

  const existing = await userRef(auth.uid).get();
  if (existing.get('orgId')) return { orgId: existing.get('orgId') as string };

  const org = db().collection('organizations').doc();
  const now = FieldValue.serverTimestamp();
  const batch = db().batch();
  batch.set(org, {
    name: input.businessName,
    slug: `${slugify(input.businessName)}-${org.id.slice(0, 5).toLowerCase()}`,
    phone: input.phone ?? null,
    area: input.area ?? null,
    businessType: input.businessType,
    category: input.category,
    currency: 'GHS',
    deliveryFeeMinor: 0,
    features: defaultFeatures(input.businessType),
    ownerUid: auth.uid,
    bot: {
      menuEnabled: true,
      freeTextEnabled: true,
      greeting: `Akwaaba to ${input.businessName}! Tap below to see what we have, or just type what you want.`,
    },
    momo: { mtn: null, telecel: null, airteltigo: null, accountName: input.fullName },
    subscription: {
      plan: 'free', status: 'active', renewsAt: null, currentPeriodStart: null, ordersUsedThisPeriod: 0,
      paymentProvider: null, externalCustomerId: null, externalSubscriptionId: null, billingEmail: null,
    },
    whatsapp: { connected: false, phoneNumberId: null, wabaId: null, displayPhoneNumber: null, verifiedName: null, qualityRating: null, connectedAt: null },
    orderCounter: 0,
    suspended: false,
    suspendedReason: null,
    suspendedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(membersRef(org.id).doc(auth.uid), {
    fullName: input.fullName,
    contact: input.phone || (auth.token.email as string) || '',
    role: 'owner',
    createdAt: now,
  });
  batch.set(userRef(auth.uid), {
    uid: auth.uid,
    email: (auth.token.email as string) ?? '',
    fullName: input.fullName,
    orgId: org.id,
    role: 'owner',
    createdAt: now,
    updatedAt: now,
  });
  await batch.commit();
  logger.info('Organization created', { orgId: org.id, type: input.businessType });
  return { orgId: org.id };
});

/* ---------------------------------- Team ---------------------------------- */

/** Invites are keyed by sign-in email; phone sign-ups use their synthetic email (web/src/utils/phone.ts). */
function inviteKey(contact: string): string {
  const c = contact.trim().toLowerCase();
  if (c.includes('@')) return c;
  let digits = c.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) digits = `233${digits.slice(1)}`;
  if (digits.length < 9) throw new HttpsError('invalid-argument', 'Enter a valid phone number or email.');
  return `${digits}@${PHONE_AUTH_EMAIL_DOMAIN}`;
}

const staffRole = z.enum(ROLES.filter((r) => r !== 'owner') as [Exclude<Role, 'owner'>, ...Exclude<Role, 'owner'>[]]);

export const inviteMember = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'team.manage');
  const { contact, role, name } = parse(z.object({ contact: z.string().min(5).max(120), role: staffRole, name: z.string().trim().max(80).optional() }), request.data);
  const key = inviteKey(contact);

  const [org, members, invites, global] = await Promise.all([orgRef(orgId).get(), membersRef(orgId).count().get(), invitesRef(orgId).count().get(), globalInviteRef(key).get()]);
  const plan = PLANS[(org.get('subscription.plan') as keyof typeof PLANS) ?? 'free'];
  if (members.data().count + invites.data().count >= plan.staffLimit) {
    throw new HttpsError('resource-exhausted', `Your plan allows ${plan.staffLimit} staff. Upgrade to add more.`);
  }
  if (global.exists && global.get('orgId') !== orgId) throw new HttpsError('already-exists', 'That person already has an invite from another business.');

  const data = { orgId, orgName: org.get('name'), role, name: name ?? null, contact, invitedBy: uid, createdAt: FieldValue.serverTimestamp() };
  const batch = db().batch();
  batch.set(invitesRef(orgId).doc(key), data);
  batch.set(globalInviteRef(key), data);
  await batch.commit();
  return { ok: true as const, key };
});

export const cancelInvite = onCall(async (request) => {
  const { orgId } = await requireMember(request.auth, 'team.manage');
  const { key } = parse(z.object({ key: z.string().min(3) }), request.data);
  const batch = db().batch();
  batch.delete(invitesRef(orgId).doc(key));
  const global = await globalInviteRef(key).get();
  if (global.get('orgId') === orgId) batch.delete(globalInviteRef(key));
  await batch.commit();
  return { ok: true as const };
});

/** Called by the web app right after sign-in when the account has no business yet. */
export const acceptInvite = onCall(async (request) => {
  const auth = requireAuth(request.auth);
  const email = ((auth.token.email as string) ?? '').toLowerCase();
  if (!email) return { joined: false as const };
  const invite = await globalInviteRef(email).get();
  if (!invite.exists) return { joined: false as const };

  const orgId = invite.get('orgId') as string;
  const role = invite.get('role') as Role;
  const fullName = (invite.get('name') as string) || (auth.token.name as string) || email.split('@')[0];
  await db().runTransaction(async (tx) => {
    const user = await tx.get(userRef(auth.uid));
    if (user.get('orgId')) throw new HttpsError('failed-precondition', 'This account already belongs to a business.');
    const now = FieldValue.serverTimestamp();
    tx.set(userRef(auth.uid), { uid: auth.uid, email, fullName, orgId, role, createdAt: now, updatedAt: now });
    tx.set(membersRef(orgId).doc(auth.uid), { fullName, contact: invite.get('contact') ?? email, role, createdAt: now });
    tx.delete(invitesRef(orgId).doc(email));
    tx.delete(globalInviteRef(email));
  });
  return { joined: true as const, orgId, orgName: invite.get('orgName') as string };
});

export const updateMemberRole = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'team.manage');
  const input = parse(z.object({ uid: z.string().min(1), role: staffRole }), request.data);
  if (input.uid === uid) throw new HttpsError('failed-precondition', "You can't change your own role.");
  const member = await membersRef(orgId).doc(input.uid).get();
  if (!member.exists || member.get('role') === 'owner') throw new HttpsError('not-found', 'That staff member was not found.');
  const batch = db().batch();
  batch.update(membersRef(orgId).doc(input.uid), { role: input.role });
  batch.update(userRef(input.uid), { role: input.role, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true as const };
});

export const removeMember = onCall(async (request) => {
  const { orgId, uid } = await requireMember(request.auth, 'team.manage');
  const input = parse(z.object({ uid: z.string().min(1) }), request.data);
  if (input.uid === uid) throw new HttpsError('failed-precondition', "You can't remove yourself.");
  const member = await membersRef(orgId).doc(input.uid).get();
  if (!member.exists || member.get('role') === 'owner') throw new HttpsError('not-found', 'That staff member was not found.');
  const batch = db().batch();
  batch.delete(membersRef(orgId).doc(input.uid));
  batch.update(userRef(input.uid), { orgId: null, role: null, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true as const };
});
