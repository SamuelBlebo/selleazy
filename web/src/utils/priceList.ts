/**
 * Turns a pasted price list into items, one per line:
 *   "Jollof with chicken - 45"   "Kenkey GH₵10"   "Waakye 40.00"   "Box braids: 350"
 * The last number on the line is the price in cedis; the rest is the name.
 * Lines without a price come back as problems so the merchant can fix them.
 * Nothing is saved until the merchant confirms the preview.
 */
export interface ParsedLine {
  name: string;
  priceMinor: number;
}

export function parsePriceList(text: string): { items: ParsedLine[]; problems: string[] } {
  const items: ParsedLine[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    const m = line.match(/^(.*?)[\s:–—=-]*(?:gh[s₵¢c]?|cedis?|₵|¢)?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:gh[s₵¢c]?|cedis?|₵|¢)?\s*$/i);
    const name = m?.[1].replace(/[\s:–—=-]+$/, '').trim() ?? '';
    if (!m || name.length < 2) {
      problems.push(raw.trim());
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name: name.slice(0, 100), priceMinor: Math.round(Number(m[2].replace(',', '.')) * 100) });
  }
  return { items, problems };
}
