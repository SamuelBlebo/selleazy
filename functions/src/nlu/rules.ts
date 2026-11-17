import type { NluCatalogItem, NluEngine, ParsedIntent, ParsedLine } from './engine';

/**
 * Rules-based reader, ported from ShopFlow's RulesEngine and widened from
 * food to every kind of merchant. Deliberately boring and inspectable: when
 * it reads an order wrong, you can point at the rule.
 */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, an: 1, couple: 2, pair: 2, dozen: 12,
};

/** Words that carry no product meaning, including common Ghanaian chat fillers. */
const NOISE = new Set([
  'please', 'pls', 'plz', 'abeg', 'good', 'morning', 'afternoon', 'evening', 'hello', 'hi', 'hey',
  'i', 'me', 'my', 'want', 'wan', 'need', 'give', 'send', 'order', 'buy', 'get', 'like', 'would', 'can', 'could',
  'and', 'plus', 'with', 'for', 'the', 'some', 'of', 'to', 'ok', 'okay', 'boss', 'madam', 'sir', 'auntie', 'bro',
  'sending', 'now', 'today', 'tomorrow', 'thanks', 'thank', 'you', 'chale', 'da', 'be', 'is', 'are', 'it',
  'deliver', 'delivery', 'at', 'in', 'on', 'near', 'by', 'pickup', 'pick', 'up', 'come', 'collect', 'am', 'pm',
]);

const STATUS_HINTS = ['where is my', 'where my', 'reach', 'status', 'coming', 'is it ready', 'track', 'how long', 'still waiting'];
const MENU_HINTS = ['menu', 'what do you have', 'price list', 'prices', 'wetin you get', 'catalog', 'catalogue', 'what do you sell', 'services', 'options'];
const AVAIL_HINTS = ['do you have', 'you get', 'available', 'still have', 'in stock', 'any '];
const HUMAN_HINTS = ['speak to', 'talk to', 'call me', 'customer service', 'a person', 'human', 'manager', 'complain'];
const PRICE_HINTS = ['how much', 'hw much', 'price', 'cost', 'charge for'];
const DELIVERY_HINTS = ['do you deliver', 'you deliver', 'u deliver', 'delivery fee', 'delivery charge', 'delivery cost', 'delivery price', 'is delivery', 'for delivery', 'can you deliver', 'can you bring'];
const PAYMENT_HINTS = ['how do i pay', 'how can i pay', 'how to pay', 'how i go pay', 'payment method', 'momo number', 'account number', 'pay with', 'do you take', 'do you accept', 'can i pay'];
const LOCATION_HINTS = ['where are you', 'where are u', 'where is your shop', 'where is the shop', 'where you dey', 'your location', 'located', 'location', 'address', 'directions', 'where can i find'];
const HOURS_HINTS = ['are you open', 'are u open', 'r u open', 'open today', 'opening hours', 'opening time', 'working hours', 'closing time', 'what time do you open', 'what time do you close', 'when do you open', 'when do you close', 'when do u open', 'when do u close', 'what time you dey open', 'are you closed'];
const GREETINGS = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'akwaaba', 'how are you'];

export class RulesEngine implements NluEngine {
  async parse({ text, catalog }: { text: string; catalog: NluCatalogItem[] }): Promise<ParsedIntent> {
    const lower = normalise(text);
    if (!lower) return { kind: 'UNKNOWN', confidence: 0 };

    if (HUMAN_HINTS.some((h) => lower.includes(h))) return { kind: 'HUMAN', confidence: 0.85 };
    if (DELIVERY_HINTS.some((h) => lower.includes(h))) return { kind: 'FAQ', topic: 'delivery', confidence: 0.85 };
    if (PAYMENT_HINTS.some((h) => lower.includes(h))) return { kind: 'FAQ', topic: 'payment', confidence: 0.85 };
    if (HOURS_HINTS.some((h) => lower.includes(h))) return { kind: 'FAQ', topic: 'hours', confidence: 0.85 };
    if (PRICE_HINTS.some((h) => lower.includes(h))) {
      const ids = catalog.filter((c) => nameVariants(c).some((v) => lower.includes(v))).map((c) => c.id);
      return { kind: 'PRICE', itemIds: ids, confidence: 0.85 };
    }
    if (MENU_HINTS.some((h) => lower.includes(h))) return { kind: 'MENU', confidence: 0.9 };

    if (STATUS_HINTS.some((h) => lower.includes(h))) {
      const ref = text.match(/#\s?(\d{1,7})/);
      return { kind: 'ORDER_STATUS', orderNumber: ref ? Number(ref[1]) : null, confidence: ref ? 0.9 : 0.75 };
    }

    if (AVAIL_HINTS.some((h) => lower.includes(h))) {
      const ids = catalog.filter((c) => nameVariants(c).some((v) => lower.includes(v))).map((c) => c.id);
      if (ids.length) return { kind: 'AVAILABILITY', itemIds: ids, confidence: 0.85 };
    }

    const order = extractOrder(lower, catalog);
    if (order.lines.length) return order;

    if (LOCATION_HINTS.some((h) => lower.includes(h))) return { kind: 'FAQ', topic: 'location', confidence: 0.8 };

    if (GREETINGS.some((g) => lower.startsWith(g)) && lower.length < 40) return { kind: 'GREETING', confidence: 0.8 };
    return { kind: 'UNKNOWN', confidence: 0.2 };
  }
}

function extractOrder(lower: string, catalog: NluCatalogItem[]): Extract<ParsedIntent, { kind: 'ORDER' }> {
  const tokens = lower.split(' ').filter(Boolean);
  const lines: ParsedLine[] = [];
  const consumed = new Set<number>();

  // Longer names first, so "fried rice" wins over "rice".
  const candidates = catalog
    .flatMap((item) => nameVariants(item).map((variant) => ({ item, variant })))
    .sort((a, b) => b.variant.split(' ').length - a.variant.split(' ').length);

  for (const { item, variant } of candidates) {
    const vTokens = variant.split(' ');
    for (let i = 0; i <= tokens.length - vTokens.length; i++) {
      if (vTokens.some((_, k) => consumed.has(i + k))) continue;
      if (!vTokens.every((t, k) => fuzzyEq(tokens[i + k], t))) continue;

      // Quantity is the nearest number just before the name ("2 jollof"), or just after ("jollof x2").
      let quantity = 1;
      for (let back = i - 1; back >= Math.max(0, i - 2); back--) {
        const q = readNumber(tokens[back]);
        if (q && !consumed.has(back)) { quantity = q; consumed.add(back); break; }
      }
      const after = tokens[i + vTokens.length];
      if (quantity === 1 && after && /^x\d{1,2}$/.test(after)) { quantity = Number(after.slice(1)); consumed.add(i + vTokens.length); }

      vTokens.forEach((_, k) => consumed.add(i + k));
      const existing = lines.find((l) => l.itemId === item.id);
      if (existing) existing.quantity += quantity;
      else lines.push({ itemId: item.id, name: item.name, quantity });
      break;
    }
  }

  const unmatched = tokens.filter((t, i) => !consumed.has(i) && !NOISE.has(t) && !readNumber(t) && t.length > 2);
  const coverage = tokens.length ? (tokens.length - unmatched.length) / tokens.length : 0;
  const confidence = lines.length ? Math.min(0.99, 0.55 + coverage * 0.44) : 0;
  return { kind: 'ORDER', lines, unmatched, confidence: Math.round(confidence * 100) / 100 };
}

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s#]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function readNumber(token?: string): number | null {
  if (!token) return null;
  if (/^\d{1,2}$/.test(token)) return Number(token) || null;
  return NUMBER_WORDS[token] ?? null;
}

/** Spellings vary wildly; merchant-supplied aliases carry what fuzzy matching cannot. */
function nameVariants(item: NluCatalogItem): string[] {
  const base = normalise(item.name);
  const words = base.split(' ').filter((w) => !NOISE.has(w));
  return [base, words.join(' '), ...item.aliases.map(normalise)].filter((v, i, arr) => v && v.length > 2 && arr.indexOf(v) === i);
}

/** Levenshtein ≤ 2 for words over 4 letters — "jelof" still finds "jollof", "braids" finds "braid". */
export function fuzzyEq(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length > 3 && (a.startsWith(b) || b.startsWith(a))) return Math.abs(a.length - b.length) <= 2;
  if (b.length <= 4) return false;
  return levenshtein(a, b) <= 2;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}
