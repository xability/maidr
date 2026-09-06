/**
 * Which built pages are too large for Googlebot, and by which limit.
 *
 * Googlebot fetches the first 2 MB (2,097,152 bytes, uncompressed) of an HTML
 * file and discards the rest, so anything past that point is invisible to
 * search and to the AI features built on it.
 *
 * - Ordinary pages are held to 1,900,000 bytes, leaving headroom.
 * - `api/` pages are indexable too, but the hierarchy theme inlines the whole
 *   navigation tree (about 600 KB) into each of them, so they are held to the
 *   hard cutoff itself rather than the headroom.
 * - `examples/` pages are demos marked noindex, and the single-file Recharts
 *   bundle sits right at the limit, so they are exempt.
 */

export const SOFT_LIMIT = 1_900_000;
export const HARD_LIMIT = 2_097_152;

/** The byte limit for a page path relative to `_site/`, or null if exempt. */
export function limitFor(file) {
  const top = file.split('/')[0];
  if (top === 'examples') {
    return null;
  }
  return top === 'api' ? HARD_LIMIT : SOFT_LIMIT;
}

/**
 * The pages over their limit, each with the limit it broke.
 *
 * @param {Array<{file: string, size: number}>} pages
 * @returns {Array<{file: string, size: number, limit: number}>} the offenders, in the order given
 */
export function findOffenders(pages) {
  const offenders = [];
  for (const { file, size } of pages) {
    const limit = limitFor(file);
    if (limit !== null && size > limit) {
      offenders.push({ file, size, limit });
    }
  }
  return offenders;
}
