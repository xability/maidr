import type { MaidrLayer } from '@type/grammar';

/**
 * Where a producer reads which `selectors` shape each layer type takes.
 *
 * Named in every warning below, so a producer that trips one has the contract
 * in front of it rather than a guess about which shape was expected.
 */
export const SELECTOR_CONTRACT_URL = 'https://maidr.ai/docs/SCHEMA.html#selectors';

/**
 * The one selector a flat list of selectors stood for, before 4.0.
 *
 * Until 4.0 a model that reads one selector string handed whatever it was given
 * to `querySelectorAll`, and the DOM turns an array into a string by joining
 * its entries with commas: `["#bars rect"]` became `"#bars rect"`, and
 * `["#a rect", "#b rect"]` became the selector list `"#a rect,#b rect"`. Every
 * producer that emitted its selector inside a list -- r-maidr and py-maidr
 * among them, for years -- relied on that without knowing it. 4.0 stopped
 * handing non-strings to the DOM (#750), so the same list matched nothing and
 * the layer lost its highlight with no error, while speech and navigation kept
 * working. py-maidr loads the latest maidr.js by default, so every installed
 * copy lost it at once.
 *
 * This restores that meaning, and only that meaning: a non-empty list whose
 * every entry is a non-blank string is joined into one selector list, which
 * `querySelectorAll` answers in document order exactly as the coerced array
 * did. Anything else -- an empty list, a blank entry, a nested grid, an
 * object -- is not a legacy list and gets `null`, so the protection #750 added
 * against `[]` and `''` stands.
 *
 * @param selectors - The layer's `selectors`, as parsed from JSON
 * @returns The joined selector list, or null when `selectors` is not a flat list of strings
 */
export function joinSelectorList(selectors: unknown): string | null {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return null;
  }
  for (const entry of selectors) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      return null;
    }
  }
  return (selectors as string[]).join(', ');
}

/**
 * The warning a legacy list earns, worded once for every model that accepts one.
 *
 * @param count - How many selectors the list held
 * @returns The sentence for {@link warnSelectors}
 */
export function legacyListProblem(count: number): string {
  return `\`selectors\` is a list of ${count} selector string${count === 1 ? '' : 's'}, `
    + 'but this layer type reads one selector string. The entries were joined into one '
    + 'selector list, which is what maidr.js before 4.0 did with a list; emit a single '
    + 'string instead.';
}

/**
 * A layer's selector, for a model that reads exactly one selector string.
 *
 * A string is returned as it is. A flat list of strings is the pre-4.0 shape
 * {@link joinSelectorList} describes: it is joined, and the producer is told
 * once that it should emit a string. Anything else is not a selector this kind
 * of model can use, and gives `undefined`, which every such model already
 * treats as "no highlight".
 *
 * @param layer - The layer whose selector is wanted
 * @returns One selector string, or undefined
 */
export function selectorString(
  layer: Pick<MaidrLayer, 'id' | 'type' | 'selectors'>,
): string | undefined {
  const { selectors } = layer;
  if (typeof selectors === 'string') {
    return selectors;
  }
  const joined = joinSelectorList(selectors);
  if (joined === null) {
    return undefined;
  }
  warnSelectors(layer, legacyListProblem((selectors as string[]).length));
  return joined;
}

/**
 * Problems already reported, so a chart rebuilt on every live-data append or
 * every figure on a page built from one template says each thing once.
 */
const reported = new Set<string>();

/**
 * Tells a producer, once, that a layer's `selectors` did not do what it meant.
 *
 * A layer whose selectors resolve to nothing still announces every point and
 * sounds every value; it only loses the outline a sighted or low-vision reader
 * follows. That is invisible to anyone who only listens, and was invisible to
 * every producer through the 4.x contract changes (#750, #991, #1135), which
 * is how a regression in r-maidr and py-maidr lasted weeks. The console is
 * where a producer's author will look, so the loss is said there.
 *
 * A warning rather than an error: the rest of the figure still works, and the
 * layer is still usable without its highlight.
 *
 * @param layer - The layer the problem is about
 * @param problem - What went wrong, as a sentence
 */
export function warnSelectors(
  layer: Pick<MaidrLayer, 'id' | 'type'>,
  problem: string,
): void {
  const key = `${layer.type}\u0000${layer.id}\u0000${problem}`;
  if (reported.has(key)) {
    return;
  }
  reported.add(key);
  console.warn(
    `[MAIDR] Layer "${layer.id}" (${layer.type}): ${problem} `
    + `See ${SELECTOR_CONTRACT_URL} for the selectors each layer type reads.`,
  );
}

/**
 * Whether a layer declares any selectors at all.
 *
 * `undefined`, `''` and `[]` all say "no selectors" -- the last two are what a
 * producer emits when it found nothing to name -- so none of them is a
 * declaration whose failure is worth reporting.
 *
 * @param selectors - The layer's `selectors`
 * @returns True when the layer names at least one element
 */
export function declaresSelectors(selectors: unknown): boolean {
  if (selectors === undefined || selectors === null) {
    return false;
  }
  if (typeof selectors === 'string') {
    return selectors.trim() !== '';
  }
  if (Array.isArray(selectors)) {
    return selectors.length > 0;
  }
  return true;
}

/**
 * Forgets what has been reported. For tests, which build many layers with the
 * same id and need each to report afresh.
 */
export function resetSelectorWarnings(): void {
  reported.clear();
}
