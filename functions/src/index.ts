/**
 * SellEazy Cloud Functions. Everything that touches a Meta or Paystack secret,
 * moves money, changes stock, or writes orders/customers lives here — never
 * in the browser. This file only re-exports.
 */
import './config';
import { onRequest } from 'firebase-functions/v2/https';

// Tenant setup and team
export { createOrganization, inviteMember, cancelInvite, acceptInvite, updateMemberRole, removeMember } from './http/organizations';

// Orders, drafts, stock
export { updateOrderStatus, setAppointment, createManualOrder, acceptDraftOrder, dismissDraftOrder, adjustStock } from './http/orders';

// Payments (manual MoMo verification)
export { verifyMomoPayment, rejectMomoPayment, recordPayment } from './http/payments';

// WhatsApp
export { whatsappWebhook, processWhatsappEvent } from './whatsapp/webhook';
export { completeWhatsappSignup, connectWhatsappManual, disconnectWhatsapp, sendTestMessage, sendReply } from './http/whatsapp';
export { sendBroadcast } from './http/customers';

// SellEazy's own billing
export { changePlan, billingWebhook } from './http/billing';

// Platform admin
export { getPlatformMetrics, listMerchants, suspendMerchant, unsuspendMerchant, deleteMerchant } from './http/admin';

// Background
export { onOrderStatusChange, onItemCreated } from './triggers/orderTriggers';
export { cleanupSessions } from './triggers/cleanupSessions';
export { renewSubscriptions } from './triggers/renewSubscriptions';

export const health = onRequest((_req, res) => {
  res.json({ ok: true, service: 'kasa-functions' });
});
