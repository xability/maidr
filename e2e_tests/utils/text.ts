/**
 * Collapses whitespace runs and trims, the way `expect(...).toHaveText()` does
 * before comparing.
 *
 * MAIDR's announcement markup wraps its text across lines, so any comparison
 * against a single-line expected string has to normalise first — otherwise a
 * wait that matched and a strict equality check that followed it can disagree.
 * @param text - Raw text content read from the page
 * @returns The text with whitespace runs collapsed to single spaces, trimmed
 */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
