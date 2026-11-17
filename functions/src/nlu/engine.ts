import type { ItemKind } from '../domain/model';

export interface NluCatalogItem {
  id: string;
  name: string;
  aliases: string[];
  kind: ItemKind;
}

export interface ParsedLine {
  itemId: string;
  name: string;
  quantity: number;
}

export type ParsedIntent =
  | { kind: 'ORDER'; lines: ParsedLine[]; unmatched: string[]; confidence: number }
  | { kind: 'ORDER_STATUS'; orderNumber: number | null; confidence: number }
  | { kind: 'AVAILABILITY'; itemIds: string[]; confidence: number }
  | { kind: 'PRICE'; itemIds: string[]; confidence: number }
  | { kind: 'FAQ'; topic: 'location' | 'delivery' | 'payment' | 'hours'; confidence: number }
  | { kind: 'MENU'; confidence: number }
  | { kind: 'GREETING'; confidence: number }
  | { kind: 'HUMAN'; confidence: number }
  | { kind: 'UNKNOWN'; confidence: number };

/**
 * Reads what a customer typed (ShopFlow's NluEngine seam). v1 is the rules
 * engine in rules.ts; an LLM engine can replace it in nlu/index.ts with no
 * other change. Whatever it returns, an ORDER only ever becomes a *draft*
 * a human confirms.
 */
export interface NluEngine {
  parse(input: { text: string; catalog: NluCatalogItem[] }): Promise<ParsedIntent>;
}

/** Below this an ORDER is not drafted; the chat is flagged for a human instead. */
export const DRAFT_THRESHOLD = 0.55;
