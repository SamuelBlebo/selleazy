# SellEazy — Project Brief

*Written from the code, README.md, PRODUCT.md and MIGRATION.md as of commit `de8b04e` (13 Nov 2026). There is no CLAUDE.md or docs folder.*

## 1. Product

**SellEazy** — sell through chat. Customers order, book and pay by mobile money (MoMo) inside WhatsApp, with no app or account. The merchant runs everything from one web dashboard.

## 2. Problem and audience

- **Problem:** small businesses already sell over WhatsApp but keep orders, customers, stock and MoMo payments in their heads or a notebook. Success is defined as a merchant running a full day of WhatsApp sales without a notebook (PRODUCT.md).
- **For:** owners and staff of small businesses that already sell on WhatsApp: food vendors, fashion, beauty, pharmacy, electronics, salons, tailors, repairs, cleaning, events, fitness, tutoring. Users are mostly on a phone.
- **Market:** Ghana first. +233 numbers, Africa/Accra time, MTN MoMo / Telecel Cash / AirtelTigo Money, plans priced in GH₵. A business can sell in GHS, NGN, USD, GBP, EUR, KES or ZAR, but payments are MoMo-only and Ghana-specific.
- **End customers** never sign up. They only message the business on WhatsApp.

## 3. Features

### Built (in the code and deployed)

**WhatsApp bot (Cloud Functions)**
- One platform webhook, routed by the receiving phone number. Signatures are checked, and events go into a durable, idempotent queue.
- Greeting flow: the welcome message, then the top 5 items (featured first, as photo carousel cards where photos exist), then **Explore more / Need help** buttons.
- Catalogue as a WhatsApp list with paging, a cart (add, change quantity, remove, empty) and checkout.
- Checkout asks for name, delivery / pickup / at-the-shop / at-your-place, address, and requested booking time ("Saturday 10am" is read into a date). The customer then confirms, and MoMo payment instructions are sent.
- **Typed orders** ("2 jollof abeg", "box braids tomorrow 10am") are read by a rules engine that handles Ghanaian spellings, number words and typos. They become a **draft** that staff confirm. A typed order is never placed automatically.
- **Questions answered automatically:** prices (all, or one item), delivery, how to pay, location (from Settings), order status, item availability.
- **Merchant FAQs:** up to 30 custom questions and answers with keywords, plus one-tap suggestions per business type and category. Matching tolerates different wording and small typos.
- **Hand-off:** "Need help" or anything not understood flags the chat for a person. The bot stays quiet for 4 hours after "Need help".
- **Wording per business:** menu vs shop vs services vs "styles & prices", "Book this style", "Best sellers", etc., by type and category.
- MoMo Transaction IDs typed by the customer are captured against their latest unpaid order.
- Status updates go to the customer on WhatsApp (confirmed, preparing, ready, out for delivery with the rider, done, cancelled).

**Merchant dashboard (web)**
- **Home:** Today / This week / This month tiles (money taken, orders or bookings, customers, items listed), a setup checklist, "Needs you now", and today's bookings.
- **Chats:** WhatsApp-style inbox with last-message previews, unread and "waiting" badges, manual replies, quick replies, the 24-hour reply window, date dividers, and a full-screen chat on phones.
- **Orders / Bookings:** one status flow (New → Confirmed → In progress → Ready → Out for delivery → Done / Cancelled) with labels per business type. Also: rider, appointment time, notes, timeline, manual walk-in / phone orders, and confirming typed-order drafts.
- **MoMo checks:** a queue of submitted payments, flagged for wrong amounts and reused Transaction IDs. Staff verify or reject, and the customer is told either way. Payments can also be recorded by hand.
- **Catalogue:** products and services, photos, aliases, categories, featured flag, active switch, stock tracking with low-stock thresholds, service length in minutes, hours, days or months.
- **Stock:** reserved when an order is placed and returned on cancel. Restock, wastage and count corrections are supported, and every movement is logged.
- **Kitchen screen** (food businesses): big tickets with timers.
- **Customers:** history, spend, private notes, and promotions (broadcasts) on Growth and above, rate-limited to 3 an hour.
- **Settings:** business details, business type and category, currency, delivery fee, features, bot on/off, typed-order reading, greeting, Bot answers (FAQs), WhatsApp connection, MoMo numbers, team and roles, plan and billing.
- **Team:** invite by phone or email, change roles, remove members.
- **Phone-first layout:** bottom tab bar, minimal headers, 16px fields so iOS doesn't zoom.

**Platform**
- Sign-up and login with phone + password or Google. Onboarding creates the business server-side.
- **Platform admin** (`/admin`): metrics, merchant list, suspend / unsuspend / delete a merchant, feature flags, audit log.
- **Marketing site:** landing, pricing, FAQ, help centre, privacy, terms.
- **Billing:** Paystack checkout and webhook, plus a daily renewal job using a saved card or MoMo authorisation.
- Scheduled cleanup of stale bot sessions.
- **Tests:** 12 logic tests (typed-order reading, booking times, money parsing, order state machine, roles, price/FAQ intents, FAQ matching, wording limits) and a tenant-isolation rules check script.

### Planned or unfinished (stated in code or docs)

- **Automatic MoMo collection** (MTN, Telecel, AirtelTigo APIs). Only the interface exists (`payments/providers.ts`); verification is manual.
- **WhatsApp message templates.** Needed to message customers more than 24 hours after their last message, including promotions to older customers.
- **Table QR codes** for food businesses. Rules exist but there is no screen.
- **AI assistant.** Interface only (`assistant/assistant.ts`): suggested replies, daily summary, an LLM in place of the rules engine. It returns nothing today.
- **Merchant mobile app** (`selleazy-mobile`, React Native + Expo). Separate repo, not started.
- **Not tested against real accounts:** Paystack (live or test mode) and Meta Embedded Signup.
- **Not built:** opening hours (the bot doesn't know when the business is closed) and analytics beyond the Home tiles. ShopFlow's daily rollups were not carried over.
- **Marketing site** is client-rendered, so SEO is limited.

## 4. Roles and main flows

| Role | Can do |
|---|---|
| Owner | Everything: settings, team, billing, WhatsApp |
| Manager | Chats, orders, cancel, kitchen, MoMo checks, catalogue, stock, customers, promotions |
| Cashier | Chats, orders, kitchen, MoMo checks |
| Kitchen | Kitchen screen only |
| Platform admin | `/admin` across all merchants |
| Customer | WhatsApp only, no account |

**Main flows**
1. **Merchant setup:** sign up → choose type and category → connect WhatsApp (Embedded Signup, or the manual script for a demo) → add items → add MoMo numbers.
2. **Menu order:** customer says "hi" → top picks → Explore more → pick items → cart → checkout (fulfilment, address, time) → confirm → order created, stock reserved → MoMo instructions.
3. **Payment:** customer replies with the Transaction ID → payment is "submitted" and flagged if odd → staff verify against the SMS → order confirmed and the customer is thanked.
4. **Typed order:** customer types an order → draft created and the chat flagged → staff correct and confirm → real order.
5. **Fulfilment:** staff move the order along. Each step can send a WhatsApp update (rider details for delivery).
6. **Questions and hand-off:** the bot answers prices, delivery, payment, location and FAQs. Anything else goes to "waiting for you" in Chats.
7. **Upgrade:** Settings → Plan → Paystack checkout → webhook updates the plan.

## 5. Tech stack and architecture

- **Web:** React 18 + Vite + TypeScript + Tailwind, one app for the marketing site, the merchant dashboard and platform admin. Firestore real-time listeners, Zod forms, optional Sentry.
- **Backend:** Firebase Cloud Functions v2 (Node, TypeScript, region `europe-west1`). Callable functions for every write that needs trust, a WhatsApp webhook plus a queue processor, Firestore triggers for status messages and opening stock, and scheduled jobs for renewals and session cleanup.
- **Database:** Cloud Firestore, multi-tenant under `organizations/{id}/…` (items, stockMovements, customers + messages, orders, draftOrders, payments, sessions, broadcasts). Security rules keep tenants apart. Membership, orders, payments, drafts, messages and stock are server-write only.
- **Storage:** Firebase Storage for product photos, scoped per tenant.
- **Hosting:** Firebase Hosting, live at https://selleazy.web.app on project `kasa-dp-prod`.
- **Integrations:**
  - **WhatsApp:** Meta Cloud API (Graph v21.0) and Embedded Signup.
  - **Payments:** Paystack for subscription billing (GHS, MoMo or card). Customer payments are MoMo, verified by hand.
  - **Email:** no email sending in the code. Contact address is support@selleazy.com.
- **Secrets:** Secret Manager (`META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `PAYSTACK_SECRET_KEY`).
- **Origins:** built on OrderFlow's code, with ShopFlow's ideas rewritten for Firebase (see MIGRATION.md).

## 6. Pricing and monetisation

Merchant subscriptions, billed monthly in GH₵ via Paystack:

| Plan | Price / month | Orders / month | Items | Staff | Extras |
|---|---|---|---|---|---|
| Free | GH₵0 | 15 | 10 | 1 | WhatsApp ordering, manual MoMo checks |
| Starter | GH₵50 | 75 | 50 | 5 | Bookings and delivery |
| Growth | GH₵150 | 300 | 200 | 10 | Promotions to customers |
| Pro | GH₵350 | Unlimited | Unlimited | 25 | Kitchen display, priority support |

- Going over the order limit **never blocks a customer's order**. Usage is counted per month and the merchant is asked to upgrade.
- Staff and item limits are enforced on the server. An item added over the limit is switched off, so customers never see it.
- No transaction fees or commission on sales appear in the code.

## 7. Status

**Estimate: about 80% of the first version is built. About 60% of the way to a public launch.**

The features are largely done, deployed and covered by logic tests. The main gaps are integrations that have never run against real accounts.

**Left before launch**
1. Run the full WhatsApp flow on a real number: greeting → order → MoMo ID → verify → status updates.
2. Finish Meta Business Verification, so outside merchants can connect through Embedded Signup.
3. Test Paystack checkout, the webhook and renewals with test keys, then live.
4. Add opening hours, so the bot doesn't promise quick replies when the business is closed.
5. Set up the support@selleazy.com inbox.
6. Onboard 2–3 real merchants and fix what they hit.

## 8. What makes it different (from the code's design choices)

- **The chat is the shop:** customers order, book and pay inside WhatsApp with no app, link-out store or account.
- **A human confirms anything guessed:** typed orders become drafts and MoMo payments are checked by a person. The bot never places a guessed order or verifies money on its own.
- **Built for Ghanaian MoMo:** Transaction ID capture, wrong-amount and reused-ID flags, and per-network numbers.
- **One product for shops, food and services:** products and bookings in one cart, with wording that changes by business type and category (menu, shop, styles and price list, packages, lessons).
- **Understands local phrasing:** Ghanaian spellings, Pidgin fillers ("abeg", "chale") and number words, with no AI cost.
- **Never blocks a sale over plan limits.**
- **Tenant isolation is enforced on the server and tested by a script.** This closes a cross-business takeover hole the OrderFlow base had.

*Competitors are not named anywhere in the code, so this section describes design choices, not a comparison.*
