# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Fixed by the owner: React (Vite + TypeScript) + Tailwind + Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting). Merchant mobile app is a separate future repo (kasa-mobile, React Native + Expo) with its own Firebase config copy. The Phase 2 prototype is a throwaway single-file HTML mock.

## Users

Owners and staff (manager, cashier, kitchen in food mode) of small Ghanaian businesses who already sell through WhatsApp: food vendors, fashion, beauty, pharmacy, electronics. Mostly on a phone, often mid-service, juggling chats, MoMo SMS alerts and stock in their head. *(Inferred from both source projects' docs.)*

End customers never make accounts; they only message the business on WhatsApp.

## Product Purpose

SellEazy ("speak/talk" in Twi) lets a merchant sell through chat: connect a WhatsApp Business number, list products, and every order, customer, stock movement and payment the chat produces lands in one dashboard. Success: a merchant runs a full day of WhatsApp sales without a notebook.

## Positioning

The chat is the shop. Customers order by tapping a WhatsApp menu or by typing freely ("2 jollof and 1 sobolo abeg"); free text becomes a draft order a human confirms. MoMo payments are verified against the transaction reference before an order is confirmed.

## Operating Context

- WhatsApp Cloud API, one platform webhook routing by receiving phone number.
- Manual MoMo verification: merchant compares the customer's reference/screenshot with their MoMo SMS. MTN MoMo, Telecel Cash, AirtelTigo APIs come later.
- Ghana only for now: GHS, +233 numbers, Africa/Accra.
- Optional food mode: kitchen display, dine-in, table QR codes.

## Capabilities and Constraints

Multi-tenant: Organization → users, products, inventory, customers, orders, payments, WhatsApp account, subscription, settings. Roles: Owner, Manager, Cashier (+ Kitchen in food mode). Stock is reserved when an order is placed and released on cancel, every change logged. Subscription billing via Paystack, 4 tiers priced in GHS. Platform admin and marketing site retained.

## Brand Commitments

Name: SellEazy. No logo or palette exists yet.

## Evidence on Hand

No real merchants, testimonials, or metrics. All prototype data is synthetic and must not be presented as real.

## Product Principles

1. A human confirms anything the machine guessed (free-text orders, payments).
2. Phone-first: every core task works one-handed on a small screen.
3. Never lose a customer's message or a cedi: idempotent, auditable records.
4. Tenant data never crosses tenants.
