/**
 * Public contact details for the marketing pages. Fill these in before
 * launch; anything left empty is hidden rather than shown as a fake.
 */
export const SITE = {
  /** Support inbox shown on Help, Privacy and Terms. */
  supportEmail: 'support@selleazy.com', // TODO: confirm this inbox exists
  /** SellEazy's own WhatsApp number in wa_id form (233XXXXXXXXX). Empty hides "Chat with us on WhatsApp". */
  whatsappNumber: '', // TODO: e.g. '233241234567'
  /** Public site URL, used for Open Graph tags in index.html. */
  url: 'https://selleazy.com', // TODO: confirm the real domain
};

export const whatsappLink = (text = 'Hi SellEazy, I want to start selling on WhatsApp') =>
  SITE.whatsappNumber ? `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(text)}` : null;
