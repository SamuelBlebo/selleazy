import { HttpsError } from 'firebase-functions/v2/https';
import { can, type Permission } from '../domain/permissions';
import type { Role } from '../domain/model';
import { db, orgRef, userRef } from '../tenant';

export type AuthInfo = { uid: string; token: Record<string, unknown> } | undefined;

export function requireAuth(auth: AuthInfo) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  return auth;
}

export interface MemberContext {
  uid: string;
  orgId: string;
  role: Role;
  name: string;
}

/**
 * Tenant and role come from users/{uid}, which only Cloud Functions can
 * write (see firestore.rules). The client never tells us its orgId or role.
 * A suspended organization can still read its data but cannot act.
 */
export async function requireMember(auth: AuthInfo, permission?: Permission): Promise<MemberContext> {
  const user = requireAuth(auth);
  const profile = await userRef(user.uid).get();
  const orgId = profile.get('orgId') as string | undefined;
  const role = profile.get('role') as Role | undefined;
  if (!orgId || !role) throw new HttpsError('failed-precondition', 'This account has no business yet.');
  if (permission && !can(role, permission)) {
    throw new HttpsError('permission-denied', 'Your role cannot do this. Ask the business owner.');
  }
  if (permission) {
    const org = await orgRef(orgId).get();
    if (org.get('suspended') === true) throw new HttpsError('failed-precondition', 'This business is suspended. Contact SellEazy support.');
  }
  return { uid: user.uid, orgId, role, name: (profile.get('fullName') as string) ?? 'Staff' };
}

/** SellEazy staff — a separate grant from any merchant role (platformAdmins/{uid}). */
export async function requirePlatformAdmin(auth: AuthInfo) {
  const user = requireAuth(auth);
  const admin = await db().collection('platformAdmins').doc(user.uid).get();
  if (!admin.exists) throw new HttpsError('permission-denied', 'Platform admin access required.');
  return { uid: user.uid, email: (auth?.token.email as string | undefined) ?? null };
}

/** Zod parse that throws a friendly callable error. */
export function parse<T>(schema: { safeParse: (d: unknown) => { success: true; data: T } | { success: false } }, data: unknown, message = 'Check the details you sent.'): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpsError('invalid-argument', message);
  return result.data;
}
