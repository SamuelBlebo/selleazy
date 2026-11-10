import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'firebase/auth';
import { addDoc, deleteDoc, serverTimestamp, updateDoc, type DocumentReference } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { auth, customerRef, googleProvider, itemImagePath, itemRef, itemsRef, orderRef, orgRef, storage } from '@/firebase';
import type { BusinessType, CatalogItem, Fulfilment, MomoNetwork, Organization, OrderStatus, PlanId, Role } from '@/types';
import { phoneToAuthEmail } from '@/utils/phone';
import { call } from './callable';

export { call };
export * from './admin.service';

/* --------------------------------- Auth ---------------------------------- */

export async function signIn(email: string, password: string) {
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}
export async function signInWithPhone(phone: string, password: string) {
  return signIn(phoneToAuthEmail(phone), password);
}
export async function signInWithGoogle() {
  return (await signInWithPopup(auth, googleProvider)).user;
}
/** Creates the login only. The business is created in onboarding, server-side. */
export async function registerWithPhone(fullName: string, phone: string, password: string) {
  const { user } = await createUserWithEmailAndPassword(auth, phoneToAuthEmail(phone), password);
  await updateProfile(user, { displayName: fullName });
  return user;
}
export const signOutUser = () => signOut(auth);

/* ----------------------------- Organization ------------------------------ */

export interface CreateOrganizationInput {
  businessName: string;
  fullName: string;
  phone?: string | null;
  businessType: BusinessType;
  category: string;
  area?: string | null;
}
export const createOrganization = (input: CreateOrganizationInput) => call<CreateOrganizationInput, { orgId: string }>('createOrganization', input);
export const acceptInvite = () => call<void, { joined: boolean; orgName?: string }>('acceptInvite');

type SettingsPatch = Partial<Pick<Organization, 'name' | 'phone' | 'area' | 'category' | 'businessType' | 'deliveryFeeMinor' | 'features' | 'bot' | 'momo'>>;
/** Owner-only settings; firestore.rules limits which fields this can touch. */
export function updateSettings(orgId: string, patch: SettingsPatch) {
  return updateDoc(orgRef(orgId), { ...patch, updatedAt: serverTimestamp() } as never);
}

/* ---------------------------------- Team --------------------------------- */

export const inviteMember = (contact: string, role: Exclude<Role, 'owner'>, name?: string) => call('inviteMember', { contact, role, name });
export const cancelInvite = (key: string) => call('cancelInvite', { key });
export const updateMemberRole = (uid: string, role: Exclude<Role, 'owner'>) => call('updateMemberRole', { uid, role });
export const removeMember = (uid: string) => call('removeMember', { uid });

/* -------------------------------- Catalogue ------------------------------ */

export type ItemInput = Omit<CatalogItem, 'createdAt' | 'updatedAt' | 'imageUrl' | 'imagePath'>;

/** A failed upload never blocks the item; `photoFailed` lets the form say so. */
export async function createItem(orgId: string, input: ItemInput, photo?: File | null) {
  const ref = await addDoc(itemsRef(orgId), { ...input, imageUrl: null, imagePath: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never);
  const photoFailed = photo ? await setItemPhoto(orgId, ref as DocumentReference<CatalogItem>, photo).then(() => false, () => true) : false;
  return { id: ref.id, photoFailed };
}

/** Stock is not editable here; use adjustStock. */
export async function updateItem(orgId: string, id: string, input: Omit<ItemInput, 'stock' | 'kind'>, photo?: File | null) {
  await updateDoc(itemRef(orgId, id), { ...input, updatedAt: serverTimestamp() } as never);
  if (photo) await setItemPhoto(orgId, itemRef(orgId, id), photo);
}

/**
 * WhatsApp only shows JPEG / PNG / WebP up to 5 MB, and phone photos are often
 * larger or HEIC. Re-encode to a JPEG at most 1600px wide; if the browser cannot
 * read the file, upload it as is.
 */
async function toWhatsappJpeg(photo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(photo);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff'; // transparent PNGs would turn black as JPEG
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? photo;
  } catch {
    return photo;
  }
}

async function setItemPhoto(orgId: string, ref: DocumentReference<CatalogItem>, photo: File) {
  const jpeg = await toWhatsappJpeg(photo);
  const name = jpeg === photo ? photo.name.replace(/[^\w.-]/g, '_') : 'photo.jpg';
  const path = itemImagePath(orgId, ref.id, `${Date.now()}-${name}`);
  const uploaded = await uploadBytes(storageRef(storage, path), jpeg, { contentType: jpeg.type || photo.type });
  const url = await getDownloadURL(uploaded.ref);
  await updateDoc(ref, { imageUrl: url, imagePath: path, updatedAt: serverTimestamp() } as never);
}

export async function deleteItem(orgId: string, id: string, imagePath: string | null) {
  await deleteDoc(itemRef(orgId, id));
  if (imagePath) await deleteObject(storageRef(storage, imagePath)).catch(() => undefined);
}

export const setItemActive = (orgId: string, id: string, active: boolean) => updateDoc(itemRef(orgId, id), { active, updatedAt: serverTimestamp() } as never);

export const adjustStock = (itemId: string, reason: 'restock' | 'wastage' | 'correction' | 'return', quantity: number, note?: string) =>
  call<unknown, { stock: number }>('adjustStock', { itemId, reason, quantity, note });

/* --------------------------------- Orders -------------------------------- */

export const updateOrderStatus = (orderId: string, status: OrderStatus, opts: { reason?: string; rider?: { name: string; phone: string } } = {}) =>
  call('updateOrderStatus', { orderId, status, ...opts });
export const setAppointment = (orderId: string, at: Date) => call('setAppointment', { orderId, at: at.toISOString() });
export const setOrderNote = (orgId: string, orderId: string, note: string) => updateDoc(orderRef(orgId, orderId), { note, updatedAt: serverTimestamp() } as never);

export interface ManualOrderInput {
  customerName: string;
  customerPhone: string;
  lines: Array<{ itemId: string; quantity: number }>;
  fulfilment: Fulfilment;
  address?: string | null;
  appointmentAt?: string | null;
  note?: string | null;
}
export const createManualOrder = (input: ManualOrderInput) => call<ManualOrderInput, { orderId: string; number: number }>('createManualOrder', input);

export interface AcceptDraftInput {
  draftId: string;
  lines: Array<{ itemId: string; quantity: number }>;
  fulfilment: Fulfilment;
  address?: string | null;
  appointmentAt?: string | null;
}
export const acceptDraftOrder = (input: AcceptDraftInput) => call<AcceptDraftInput, { orderId: string; number: number }>('acceptDraftOrder', input);
export const dismissDraftOrder = (draftId: string) => call('dismissDraftOrder', { draftId });

/* -------------------------------- Payments ------------------------------- */

export const verifyPayment = (paymentId: string) => call('verifyMomoPayment', { paymentId });
export const rejectPayment = (paymentId: string, reason: string) => call('rejectMomoPayment', { paymentId, reason });
export const recordPayment = (input: { orderId: string; method: 'momo' | 'cash' | 'bank' | 'card'; network?: MomoNetwork | null; reference?: string | null; amountMinor: number }) =>
  call('recordPayment', input);

/* ------------------------------ Customers / chat ------------------------- */

export const sendReply = (customerId: string, text: string) => call('sendReply', { customerId, text });
export const markChatRead = (orgId: string, waId: string) => updateDoc(customerRef(orgId, waId), { unreadCount: 0 } as never);
export const markHandled = (orgId: string, waId: string) => updateDoc(customerRef(orgId, waId), { needsHuman: false } as never);
export const saveCustomerNote = (orgId: string, waId: string, note: string) => updateDoc(customerRef(orgId, waId), { note, updatedAt: serverTimestamp() } as never);
export const sendBroadcast = (message: string, customerIds: string[]) => call<unknown, { sentCount: number; failedCount: number }>('sendBroadcast', { message, customerIds });

/* -------------------------------- WhatsApp ------------------------------- */

export const completeWhatsappSignup = (input: { code: string; phoneNumberId: string; businessAccountId: string }) =>
  call<typeof input, { displayPhone: string }>('completeWhatsappSignup', input);
export const disconnectWhatsapp = () => call('disconnectWhatsapp');
export const sendTestMessage = (to: string) => call('sendTestMessage', { to });

/* --------------------------------- Billing ------------------------------- */

export const changePlan = (plan: PlanId, email?: string) => call<unknown, { checkoutUrl: string | null }>('changePlan', { plan, email });
