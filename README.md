# Kasa (web)

**Sell through chat.** Kasa is a multi-tenant WhatsApp commerce platform for businesses in Ghana: shops, food sellers and service providers. Customers order, book and pay by MoMo inside WhatsApp, with no app or account. Merchants run everything from this dashboard.

This is the **web repo**. The merchant mobile app will be a separate repo (`kasa-mobile`, React Native + Expo) with **its own copy** of the Firebase config. Nothing is shared through a monorepo or workspace.

```
kasa-web/
├── web/                React + Vite + TypeScript + Tailwind: marketing site, merchant dashboard, platform admin
├── functions/          Cloud Functions: WhatsApp webhook and bot, orders, stock, payments, team, billing, admin
├── firestore.rules     Tenant isolation (see "Security")
├── firestore.indexes.json
├── storage.rules       Tenant-scoped photos
├── prototype/          Phase 2 clickable prototype (one offline HTML file)
├── PRODUCT.md          Product brief
└── MIGRATION.md        What came from ShopFlow and OrderFlow
```

## What it does

| Area | What a merchant gets |
|---|---|
| Any business | Choose **products**, **services**, **food** or **mixed** at signup. The catalogue, wording ("Bookings" vs "Orders", "Menu" vs "Services") and tools follow. |
| WhatsApp bot | Shows the catalogue as a WhatsApp list, builds a cart, asks delivery / pickup / at-the-shop / at-your-place, takes the address and a requested time for bookings, places the order and sends MoMo payment instructions. |
| Typed orders | "2 jollof abeg" or "box braids tomorrow 10am" becomes a **draft** a person corrects and confirms. Kasa never places a typed order on its own. |
| Chats | WhatsApp-style inbox: unread counts, "waiting for you" when the bot hands over, quick replies, 24-hour reply window shown. |
| Orders and bookings | One flow for everyone (New → Confirmed → In progress → Ready → Out for delivery → Done), labels per business type. Rider, booking time, notes, timeline. Phone and walk-in orders by hand. |
| MoMo checks | Customer replies with a Transaction ID; Kasa flags wrong amounts and reused IDs; staff verify or reject. Verified + fully paid confirms the order and thanks the customer. |
| Stock | Set aside when an order is placed, returned on cancel, restock / wastage / count corrections, full history. |
| Kitchen screen | For food businesses: big tickets with timers. |
| Customers | History, spend, private notes, promotions (Growth plan and up). |
| Team | Owner, Manager, Cashier, Kitchen; invite by phone or email. |
| Plans | Free / Starter GH₵50 / Growth GH₵150 / Pro GH₵350 a month, via Paystack (MoMo or card). Going over the limit never blocks a customer. |
| Platform admin | `/admin` for Kasa staff: metrics, suspend or delete a merchant, feature flags, audit log. |

## Run it locally (PowerShell)

Needs: Node 20+ (22 recommended), Java 11+ (for the emulators), Firebase CLI (`npm install -g firebase-tools`).

```powershell
cd kasa-web
cd functions; npm install; npm run build; cd ..
cd web; npm install; cd ..

# Local-only settings (both files are gitignored)
Set-Content functions\.env.local "GRAPH_VERSION=v21.0`nMETA_APP_ID=local-dev`nAPP_URL=http://localhost:5173"
Set-Content functions\.secret.local "META_APP_SECRET=local-dev`nWHATSAPP_VERIFY_TOKEN=local-dev`nPAYSTACK_SECRET_KEY=unset"
Copy-Item web\.env.example web\.env.local
# In web\.env.local set: VITE_FIREBASE_PROJECT_ID=demo-kasa, VITE_FIREBASE_API_KEY=demo-key,
# VITE_FIREBASE_APP_ID=demo, the other VITE_FIREBASE_* to any value, VITE_USE_FIREBASE_EMULATORS=true

# Window 1: emulators
firebase emulators:start --only auth,firestore,functions,storage --project demo-kasa

# Window 2: demo data (DEMO_TYPE = retail | services | food)
cd functions
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"; $env:GCLOUD_PROJECT="demo-kasa"; $env:DEMO_TYPE="services"
npm run seed:demo

# Window 3: the web app → http://localhost:5173, sign in with phone 0240000001 / KasaDemo!2026
cd web; npm run dev
```

If those ports are busy, start the emulators with another config file and set `VITE_EMULATOR_PORTS=auth,firestore,storage,functions` in `web\.env.local`.

### Checks

```powershell
cd functions; npm test                     # NLU, booking-time reading, money, order flow, roles
cd web; npm run build; npx eslint src --ext ts,tsx
cd web; $env:EMU_PORTS="9099,8080"; node scripts\check-tenant-rules.mjs   # emulators running + demo seeded
```

## Environment variables

**web/.env.local** (public; all `VITE_*` values end up in the browser)

| Variable | What |
|---|---|
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Firebase console → Project settings → Your apps → Web |
| `VITE_USE_FIREBASE_EMULATORS` | `true` locally |
| `VITE_EMULATOR_PORTS` | Optional, only if emulator ports differ |
| `VITE_META_APP_ID`, `VITE_META_CONFIGURATION_ID` | Meta App ID and Embedded Signup configuration ID. Blank = "not set up yet" message instead of the Connect button |
| `VITE_SENTRY_DSN`, `VITE_FIREBASE_MEASUREMENT_ID` | Optional |

**functions/.env** (non-secret params, deployed with the functions)

| Variable | What |
|---|---|
| `GRAPH_VERSION` | Meta Graph API version, default `v21.0` |
| `META_APP_ID` | Same Meta App ID as above |
| `APP_URL` | Public web address, e.g. `https://kasa-dp-prod.web.app` (Paystack return link) |

**Secrets** (Secret Manager; set each once, before the first deploy)

```powershell
firebase functions:secrets:set META_APP_SECRET        # Meta App → Settings → Basic → App secret
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN  # any long random string; reused in Meta's webhook setup
firebase functions:secrets:set PAYSTACK_SECRET_KEY    # sk_test_... first; "unset" until you take payments
```

## Live deployment

Project `kasa-dp-prod`, live at https://kasa-dp-prod.web.app. Redeploy with `firebase deploy`. Production web settings live in the gitignored `web\.env.production.local`.

## Deploy to a new Firebase project

1. Create the project (Console or `firebase projects:create your-project-id`), switch it to the **Blaze** plan, enable **Authentication** (Email/Password and Google), **Firestore** (region `europe-west1` or close), **Storage**.
2. Update `.firebaserc` with your project id. Add a Web app and copy its config into `web\.env.local` (with `VITE_USE_FIREBASE_EMULATORS=false`).
3. Create `functions\.env` (table above) and set the three secrets.
4. `firebase deploy` (rules, indexes, storage, functions and hosting; builds run automatically).
5. Make yourself platform admin: in Firestore create `platformAdmins/{your uid}` with any field.

## Connect WhatsApp (one-time, platform owner)

1. [developers.facebook.com](https://developers.facebook.com/apps) → Create app (Business) → add **WhatsApp**.
2. WhatsApp → Configuration → Webhook: callback URL `https://europe-west1-<project-id>.cloudfunctions.net/whatsappWebhook`, verify token = your `WHATSAPP_VERIFY_TOKEN`, subscribe to **messages**.
3. Facebook Login for Business → Configurations → create an **Embedded Signup** configuration (WhatsApp). Put the App ID and Configuration ID in the web env and `META_APP_ID` in `functions\.env`.
4. Start **Business Verification** in Meta Business Manager early; it takes days and is needed before outside merchants can connect.
5. Each merchant then clicks Settings → WhatsApp → **Continue with Facebook**. The token is stored only in `whatsappAccounts/`, which no browser can read.

### Link a number without Embedded Signup (your own number, Meta's test number)

Before Business Verification, or for a demo, link a number to a business directly. The merchant must already have signed up and finished onboarding. You need a service account key (Firebase console → Project settings → Service accounts; keep it outside the repo) and a **System User permanent token** (Business settings → System users) with `whatsapp_business_messaging` and `whatsapp_business_management`.

```powershell
cd functions
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\kasa-dp-prod.json"; $env:GCLOUD_PROJECT="kasa-dp-prod"
$env:OWNER_PHONE="0240000001"; $env:PHONE_NUMBER_ID="..."; $env:WABA_ID="..."; $env:WA_TOKEN="..."
$env:DRY_RUN="1"; npm run connect:whatsapp      # checks with Meta, writes nothing
Remove-Item Env:DRY_RUN; npm run connect:whatsapp
```

Use `OWNER_EMAIL` instead of `OWNER_PHONE` if the merchant signed up with Google or email. If PowerShell says "running scripts is disabled", use `npm.cmd` and `firebase.cmd`. Meta's test number only replies to phones added to its "To" list (WhatsApp → API Setup).

Add `WA_PIN` (6-digit two-step PIN) the first time you use a number you added yourself in WhatsApp Manager; it registers the number for the Cloud API. `DISCONNECT=1` unlinks. The webhook still needs the real `META_APP_SECRET` set, or every incoming message is rejected.

Customers who messaged in the last 24 hours get free-form replies; older ones need Meta-approved templates (promotions included).

## Security

- `users/{uid}` (which business and role you belong to) and new businesses are written **only** by Cloud Functions. OrderFlow let the browser write that document, which allowed taking over another business; `scripts/check-tenant-rules.mjs` proves it is closed.
- Orders, payments, drafts, messages and stock changes are server-only. The browser edits catalogue items (not stock), a short list of owner settings (not plan, suspension or WhatsApp), and customer notes.
- Every callable re-reads the caller's business and role (`functions/src/http/guards.ts`); roles mirror `functions/src/domain/permissions.ts`.

## Seams for later

| Later | Where it plugs in |
|---|---|
| MTN MoMo / Telecel Cash / AirtelTigo APIs | `functions/src/payments/providers.ts`: implement `MomoCollectionProvider`, register it, call `verifyPayment` from the callback |
| AI assistant | `functions/src/nlu/index.ts` (swap the rules engine) and `functions/src/assistant/assistant.ts` (suggested replies, daily summary) |
| Other billing | `functions/src/billing/` (Paystack today) |
| Mobile app | New `kasa-mobile` repo using the same callables and rules |

## Not done yet

- Automatic MoMo collection (interfaces only; verification is manual).
- WhatsApp message templates for messaging customers after 24 hours.
- Table QR codes for food businesses (rules exist; no screen yet).
- Paystack and Meta Embedded Signup have not been exercised against live accounts. Test with test-mode keys and a Meta test number first.
- Marketing site is client-rendered (limited SEO). Contact emails use `kasa.example`; replace with your domain.
