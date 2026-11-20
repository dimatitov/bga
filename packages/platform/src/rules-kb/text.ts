/** Text helpers shared by search, context and render. Pure and deterministic. */

/** English function words without search value (a query of only these yields no hits — C-4 Q-6). */
const STOP_WORDS = new Set([
  'a',
  'about',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'could',
  'd',
  'did',
  'do',
  'does',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'just',
  'll',
  'm',
  'may',
  'me',
  'might',
  'my',
  'of',
  'on',
  'or',
  'our',
  's',
  'she',
  'should',
  'so',
  't',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'to',
  've',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/** Very light English suffix stemming (`moved`/`moving`/`moves` → `mov`); other scripts are kept as is. */
function stem(word: string): string {
  if (!/^[a-z]+$/.test(word) || word.length <= 3) return word;
  let w = word;
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('ied') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('ation') && w.length > 6)
    w = w.slice(0, -3); // activation → activat
  else if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  else if (/(?:ss|sh|ch|x|z)es$/.test(w) && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.endsWith('e') && w.length > 3) w = w.slice(0, -1); // activate → activat
  // stopped → stopp → stop; winning → winn → win
  if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(?:ll|ss|zz)$/.test(w) && w.length > 3) {
    w = w.slice(0, -1);
  }
  return w;
}

/** Lower-cased Unicode word tokens (`\p{L}\p{N}`), without stop words, stemmed. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const word = match[0];
    if (STOP_WORDS.has(word)) continue;
    tokens.push(stem(word));
  }
  return tokens;
}

/** Number of whitespace-separated words (quote limits). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Number of characters (Unicode code points). */
export function countChars(text: string): number {
  return [...text].length;
}

/** Citation label of a source page: `${sourceId} p.${page}` (e.g. `RR p.9`). */
export function formatCitation(ref: { sourceId: string; page: number }): string {
  return `${ref.sourceId} p.${ref.page}`;
}

/** Locale-independent string order (stable tie-break by id). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Collapses all whitespace (incl. newlines) into single spaces. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
