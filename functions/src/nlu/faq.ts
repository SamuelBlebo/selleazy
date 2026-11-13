import { fuzzyEq, normalise } from './rules';

/** A merchant's own question and answer (organizations.bot.faqs). */
export interface Faq {
  q: string;
  a: string;
  /** Extra words or phrases customers use for this question, e.g. "sunday", "closing time". */
  keywords?: string[];
}

/** Words that say nothing about what a question is about. */
const FILLER = new Set([
  'what', 'whats', 'when', 'where', 'which', 'who', 'why', 'how', 'do', 'does', 'did', 'is', 'are', 'was', 'can', 'could',
  'will', 'would', 'should', 'you', 'your', 'u', 'ur', 'i', 'me', 'my', 'we', 'our', 'us', 'the', 'a', 'an', 'to', 'of',
  'for', 'on', 'in', 'at', 'and', 'or', 'it', 'its', 'this', 'that', 'there', 'have', 'has', 'get', 'any', 'please', 'pls',
  'plz', 'abeg', 'hi', 'hello', 'hey', 'sir', 'madam', 'boss', 'be', 'am', 'if', 'with', 'about', 'much', 'many', 'like',
  'want', 'know', 'tell', 'ok', 'okay', 'so', 'just', 'also', 'still', 'dey', 'go', 'fit',
]);

/**
 * Stricter than the order reader's fuzzyEq: FAQ words are short and common,
 * so "house" must not become "hours". Same word, same stem, or one typo in a
 * long word.
 */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return Math.min(a.length, b.length) >= 6 && fuzzyEq(a, b);
}

const topicWords =(s: string) => normalise(s).split(' ').filter((w) => w.length > 1 && !FILLER.has(w));

/**
 * The merchant's FAQ that best fits what the customer typed, or null.
 * A keyword wins outright. Otherwise at least half of the question's topic
 * words must appear (at least two, if it has two or more); small typos are
 * allowed. Anything that doesn't fit goes to a person, never a guess.
 */
export function matchFaq(text: string, faqs: Faq[]): Faq | null {
  const padded = ` ${normalise(text)} `;
  const said = topicWords(text);
  if (!said.length) return null;

  let best: { faq: Faq; score: number } | null = null;
  for (const faq of faqs) {
    if (!faq.q?.trim() || !faq.a?.trim()) continue;
    const keywordHit = (faq.keywords ?? []).some((k) => {
      const kw = normalise(k);
      if (kw.length < 2) return false;
      return kw.includes(' ') ? padded.includes(` ${kw} `) : said.some((w) => near(w, kw));
    });
    const topic = topicWords(faq.q);
    const hits = topic.filter((t) => said.some((w) => near(w, t))).length;
    const ratio = topic.length ? hits / topic.length : 0;
    // Most of the question's topic, and most of what the customer said, must line up.
    const saidHits = said.filter((w) => topic.some((t) => near(w, t))).length;
    const fits = keywordHit || (hits >= Math.max(1, Math.ceil(topic.length / 2)) && (hits >= 2 || saidHits / said.length >= 0.5));
    if (!fits) continue;
    const score = (keywordHit ? 1 : 0) + ratio + hits * 0.01;
    if (!best || score > best.score) best = { faq, score };
  }
  return best?.faq ?? null;
}
