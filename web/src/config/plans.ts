import type { PlanId } from '@/types';

/** Mirrors functions/src/billing/plans.ts. Ghana only, prices in pesewas. */
export interface Plan {
  id: PlanId;
  name: string;
  priceMinor: number;
  orderLimit: number | null;
  staffLimit: number;
  itemLimit: number | null;
  features: string[];
}

export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', priceMinor: 0, orderLimit: 15, staffLimit: 1, itemLimit: 10, features: ['15 orders a month', '10 products or services', 'WhatsApp ordering', 'Manual MoMo checks'] },
  { id: 'starter', name: 'Starter', priceMinor: 5000, orderLimit: 75, staffLimit: 5, itemLimit: 50, features: ['75 orders a month', '50 products or services', 'Bookings and delivery', 'Up to 5 staff'] },
  { id: 'growth', name: 'Growth', priceMinor: 15000, orderLimit: 300, staffLimit: 10, itemLimit: 200, features: ['300 orders a month', '200 products or services', 'Promotions to customers', 'Up to 10 staff'] },
  { id: 'pro', name: 'Pro', priceMinor: 35000, orderLimit: null, staffLimit: 25, itemLimit: null, features: ['Unlimited orders', 'Unlimited catalogue', 'Kitchen display', 'Priority support'] },
];

export const planById = (id: PlanId) => PLANS.find((p) => p.id === id) ?? PLANS[0];
