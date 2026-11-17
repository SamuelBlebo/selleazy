/**
 * "Leave us a review" after an order is done. The merchant turns it on in
 * Settings → Reviews (organizations.bot.review) with their own link: Google,
 * Facebook, or any page. One ask per order, and a customer is asked at most
 * once every REVIEW_GAP_DAYS so regulars aren't nagged.
 * Mirrored in web/src/pages/SettingsPage.tsx (ReviewsTab).
 */
export interface ReviewSettings {
  enabled: boolean;
  link: string;
  message: string;
}

export const DEFAULT_REVIEW_MESSAGE = 'Thank you for choosing {business}, {name}! How did we do? A quick review helps us a lot: {link}';
export const REVIEW_GAP_DAYS = 30;

/** Only real web links go to customers. */
export function isReviewLink(link: string | undefined | null): boolean {
  if (!link || link.length > 500) return false;
  try {
    return new URL(link).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Fills {business} {name} {number} {link}. The link is always included, even if the merchant's text forgot it. */
export function reviewText(template: string | undefined, v: { business: string; customerName: string | null; number: number; link: string }): string {
  const text = (template?.trim() || DEFAULT_REVIEW_MESSAGE)
    .replace(/\{business\}/g, v.business)
    .replace(/\{name\}/g, v.customerName?.trim().split(/\s+/)[0] || 'friend')
    .replace(/\{number\}/g, String(v.number));
  const withLink = text.includes('{link}') ? text.replace(/\{link\}/g, v.link) : `${text}\n${v.link}`;
  return withLink.slice(0, 1000);
}

export function shouldAskForReview(o: {
  settings: Partial<ReviewSettings> | null | undefined;
  alreadyAskedForOrder: boolean;
  lastAskedCustomerMs: number | null;
  nowMs: number;
}): boolean {
  if (!o.settings?.enabled || !isReviewLink(o.settings.link)) return false;
  if (o.alreadyAskedForOrder) return false;
  return o.lastAskedCustomerMs === null || o.nowMs - o.lastAskedCustomerMs >= REVIEW_GAP_DAYS * 24 * 60 * 60000;
}
