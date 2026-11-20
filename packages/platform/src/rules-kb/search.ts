import { type KbEntry, type KbEntryKind, type KbEntryStatus, type KnowledgeBase } from './schema';
import { compareStrings, formatCitation, tokenize } from './text';

export interface RulesCitation {
  sourceId: string;
  page: number;
  section: string;
  /** `RR p.9` */
  label: string;
}

export interface RulesSearchOptions {
  kinds?: KbEntryKind[];
  /** Matches the category and all its descendants (by `parent`). */
  categories?: string[];
  status?: KbEntryStatus[];
  /** Default 5. */
  limit?: number;
}

export interface RulesSearchHit {
  entry: KbEntry;
  score: number;
  /** All `sources` of the entry, in data order. */
  citations: RulesCitation[];
}

export interface RulesSearch {
  search(query: string, options?: RulesSearchOptions): RulesSearchHit[];
}

const K1 = 1.2;
const B = 0.75;
const DEFAULT_LIMIT = 5;
const FIELD_WEIGHTS = { title: 3, keywords: 3, text: 1, exceptions: 1 } as const;

interface IndexedEntry {
  entry: KbEntry;
  /** Weighted term frequency over all fields. */
  tf: Map<string, number>;
  /** Weighted document length. */
  length: number;
}

function indexEntry(entry: KbEntry): IndexedEntry {
  const tf = new Map<string, number>();
  let length = 0;
  const addField = (text: string, weight: number) => {
    for (const token of tokenize(text)) {
      tf.set(token, (tf.get(token) ?? 0) + weight);
      length += weight;
    }
  };
  addField(entry.title, FIELD_WEIGHTS.title);
  for (const keyword of entry.keywords ?? []) addField(keyword, FIELD_WEIGHTS.keywords);
  addField(entry.text, FIELD_WEIGHTS.text);
  for (const ex of entry.exceptions ?? []) addField(ex.text, FIELD_WEIGHTS.exceptions);
  return { entry, tf, length };
}

export function toCitations(entry: KbEntry): RulesCitation[] {
  return entry.sources.map((ref) => ({
    sourceId: ref.sourceId,
    page: ref.page,
    section: ref.section,
    label: formatCitation(ref),
  }));
}

/**
 * BM25 search (k1 1.2, b 0.75) over title ×3, keywords ×3, text ×1, exceptions ×1; no dependencies, no
 * network, deterministic. Collection statistics are computed over the whole knowledge base, so filters
 * never change the score of an entry. Empty/meaningless queries return `[]` (C-4 Q-6).
 */
export function createRulesSearch(kb: KnowledgeBase): RulesSearch {
  const docs = kb.entries.map(indexEntry);
  const df = new Map<string, number>();
  let totalLength = 0;
  for (const doc of docs) {
    totalLength += doc.length;
    for (const term of doc.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const n = docs.length;
  const avgLength = n > 0 && totalLength > 0 ? totalLength / n : 1;
  const parents = new Map<string, string | undefined>(
    kb.manifest.categories.map((c) => [c.id, c.parent]),
  );

  const inCategories = (category: string, wanted: ReadonlySet<string>): boolean => {
    const seen = new Set<string>();
    let current: string | undefined = category;
    while (current !== undefined && !seen.has(current)) {
      if (wanted.has(current)) return true;
      seen.add(current);
      current = parents.get(current);
    }
    return false;
  };

  return {
    search(query, options = {}) {
      const terms = [...new Set(tokenize(query))];
      if (terms.length === 0) return [];
      const kinds = options.kinds?.length ? new Set(options.kinds) : undefined;
      const statuses = options.status?.length ? new Set(options.status) : undefined;
      const categories = options.categories?.length ? new Set(options.categories) : undefined;
      const limit = Math.max(0, Math.floor(options.limit ?? DEFAULT_LIMIT));

      const hits: RulesSearchHit[] = [];
      for (const doc of docs) {
        const { entry } = doc;
        if (kinds && !kinds.has(entry.kind)) continue;
        if (statuses && !statuses.has(entry.status)) continue;
        if (categories && !inCategories(entry.category, categories)) continue;
        let score = 0;
        for (const term of terms) {
          const freq = doc.tf.get(term);
          if (!freq) continue;
          const docFreq = df.get(term) ?? 0;
          const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
          score += (idf * (freq * (K1 + 1))) / (freq + K1 * (1 - B + (B * doc.length) / avgLength));
        }
        if (score > 0) hits.push({ entry, score, citations: toCitations(entry) });
      }
      hits.sort((a, b) => b.score - a.score || compareStrings(a.entry.id, b.entry.id));
      return hits.slice(0, limit);
    },
  };
}
