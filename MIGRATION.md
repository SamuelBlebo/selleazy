# Migration notes: ShopFlow + OrderFlow → SellEazy

SellEazy is built on **OrderFlow** (React + Vite + Firebase), whose solid code was reused directly. **ShopFlow** (Next.js + NestJS + Postgres/Prisma) contributed features, data-model ideas and business logic, rewritten for Firebase. No ShopFlow code was copied as-is.

Source snapshots: OrderFlow `58e3f47`, ShopFlow `3aafa32`. Commit `854f63c` in this repo is OrderFlow's code unchanged, so every SellEazy change after it is a readable diff.

## From OrderFlow (reused, then adapted)

| SellEazy | OrderFlow origin | Change |
|---|---|---|
| `web/` structure (services → hooks → pages, typed Firestore paths, contexts, `useCollection`/`useDocument`, toast, error boundary, Zod forms) | `web/src` | Kept; restyled to the SellEazy palette; dark mode removed |
| Auth: phone + password and Google, phone→synthetic email | `services/auth.service.ts`, `utils/phone.ts` | Org creation moved server-side; Ghana `0XX` numbers normalised |
| WhatsApp bot (catalogue list, cart, checkout, transactional order) | `worker/src/bot.ts`, `cart.ts`, `orders.ts` | Moved from the Cloudflare Worker to Cloud Functions (Admin SDK); services, bookings, fulfilment choice, MoMo reference capture, typed-order drafts added |
| Webhook signature check | `worker/src/signature.ts` | Node crypto; durable `webhookEvents` queue with idempotent `create()` |
| Embedded Signup (Connect WhatsApp) | `worker/src/whatsappConnect.ts`, `web/src/pages/WhatsAppPage.tsx` | Now the `completeWhatsappSignup` callable; UI in Settings → WhatsApp |
| Graph API client | `functions/src/whatsapp/client.ts` | Every outbound message is also logged to the conversation (`Outbox`) |
| Inbox and manual reply, broadcasts | `functions/src/http/customers.ts`, `InboxPage` | Rewritten as Chats; broadcasts gated to Growth+ |
| Delivery steps, rider, timeline, status WhatsApp updates | `onOrderStatusChange`, `OrdersPage` | Wording per business type |
| Plans, usage, Paystack checkout, webhook, renewals | `billing.ts`, `http/billing.ts`, `renewSubscriptions.ts`, `paystack/client.ts` | GHS only, money in pesewas |
| Platform admin, feature flags, audit log | `http/admin.ts`, `pages/admin` | Rebranded; MRR in GHS |
| Marketing pages | `pages/marketing` | Rewritten for all merchants and Ghana |
| Rate limiting | `rateLimit.ts` | Unchanged |

**Dropped:** the Cloudflare Worker (all WhatsApp logic is in Cloud Functions now), Analytics page and Recharts (Today page instead), multi-currency pricing, dark mode, the redundant `orderItems` subcollection.

**Fixed:** OrderFlow's `firestore.rules` let any signed-in user write their own `users/{uid}` with another business's `orgId` and role `owner`, and let a merchant create their organization on a paid plan. Both are now impossible (see `web/scripts/check-tenant-rules.mjs`).

## From ShopFlow (rewritten for Firebase)

| SellEazy | ShopFlow origin |
|---|---|
| Order state machine, one transition table (`functions/src/domain/orderFlow.ts`) | `orders/order-state.machine.ts` |
| Manual MoMo verification queue with duplicate-reference and amount checks (`services/payments.ts`, `PaymentsPage`) | `payments/payments.service.ts` |
| Payment provider seam for MTN / Telecel / AirtelTigo (`payments/providers.ts`) | `payments/payment-provider.interface.ts` |
| Stock movement log as the source of truth (`stockMovements`, `adjustStock`) | `inventory/inventory.service.ts`, `InventoryMovement` |
| Free-text order reading (rules engine, Ghanaian spellings, number words, fuzzy match), draft + human confirm (`nlu/`) | `nlu/rules.engine.ts`, `nlu.interface.ts` |
| Roles and permissions (Owner, Manager, Cashier, Kitchen) | `common/permissions.ts` |
| Kitchen display | `app/kitchen/page.tsx` |
| Money as integer minor units (pesewas) | Prisma `*Minor` fields |
| Item aliases for matching | `Product.aliases` |
| Low-stock thresholds, MoMo numbers per business | `Product.lowStockAt`, `Business.momo*Number` |
| Tenant-leak test idea | `test/tenancy.spec.ts` → `web/scripts/check-tenant-rules.mjs` |

**Not carried over (yet):** QR code screens (`QrCode` model), `DailyRollup` analytics, Clerk auth (Firebase Auth instead), Socket.IO realtime (Firestore listeners instead), Postgres RLS (Firestore rules instead), the demo simulation mode.

## New in SellEazy

- Products **and services** in one catalogue; services have duration and booking times; business types (food / retail / services / mixed) with features (delivery, pickup, bookings, on-site, kitchen).
- Booking-time reading from chat ("Saturday 10am") for the merchant to confirm (`nlu/when.ts`).
- Staff invites and role changes server-side.
- Today page with setup checklist and "Needs you now".
- Seed script for retail, services or food demos.

## Data model mapping

| SellEazy (Firestore) | OrderFlow | ShopFlow (Prisma) |
|---|---|---|
| `organizations/{id}` | `organizations` | `Business` |
| `users/{uid}` + `organizations/{id}/members` | `users` | `User` + `Membership` |
| `items` (kind product/service) | `products` | `Product` + `Category` |
| `stockMovements` | — | `InventoryMovement` |
| `customers/{waId}` + `/messages` | same | `Customer`, `WhatsAppMessage` |
| `orders` (lines embedded, `statusHistory`) | `orders` + `orderItems` | `Order`, `OrderItem`, `OrderStatusHistory` |
| `draftOrders` | — | parsed-intent drafts on `WhatsAppMessage` |
| `payments`, `paymentRefs` | — | `Payment` |
| `whatsappAccounts/{phoneNumberId}` | same | `Business.wa*` columns |

There is no live data to migrate: SellEazy uses a new Firebase project.
