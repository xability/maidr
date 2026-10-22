/**
 * Guarded reads of Mermaid's diagram databases and rendered SVG.
 *
 * The databases are Mermaid internals: a getter can be missing, renamed, or
 * return a Map where an array was expected. Every read here answers with an
 * empty value instead of throwing, so a diagram whose database has moved on
 * loses detail rather than its whole reading.
 */

import { cssEscape } from '../shared/selectorUtil';

/** A plain object read from a database. */
export type Row = Record<string, unknown>;

/**
 * Calls a database method when it exists.
 *
 * @param db - The database
 * @param name - The method's name
 * @param args - Its arguments
 * @returns What it returned, or undefined when it is not a method or throws
 */
export function call(db: unknown, name: string, ...args: unknown[]): unknown {
  if (db === null || typeof db !== 'object') {
    return undefined;
  }
  const method = (db as Record<string, unknown>)[name];
  if (typeof method !== 'function') {
    return undefined;
  }
  try {
    return (method as (...rest: unknown[]) => unknown).apply(db, args);
  } catch (error) {
    console.warn(`[maidr/mermaid] ${name}() failed; reading the diagram without it.`, error);
    return undefined;
  }
}

/**
 * A collection as a list of rows, whether it came as an array, a Map or a
 * plain keyed object.
 *
 * @param value - What a getter returned
 * @returns Its object entries, in order
 */
export function rows(value: unknown): Row[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (value instanceof Map) {
    list = [...value.values()];
  } else if (value !== null && typeof value === 'object') {
    list = Object.values(value);
  }
  return list.filter((one): one is Row => one !== null && typeof one === 'object');
}

/**
 * A field as a string, or undefined when it is absent or not text-like.
 *
 * Mermaid wraps some labels in `{ text }` objects (C4), so those are opened.
 *
 * @param value - The field
 * @returns Its text
 */
export function str(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (value !== null && typeof value === 'object' && 'text' in value) {
    return str((value as Row).text);
  }
  return undefined;
}

/**
 * A field as a finite number, or undefined.
 *
 * @param value - The field
 * @returns The number
 */
export function num(value: unknown): number | undefined {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined;
}

/** The entities a label most often carries, decoded without a DOM. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
};

/**
 * The text of a label with its markup taken out.
 *
 * Read with the browser's own HTML parser where there is one, which never
 * runs what it parses and gives back only the text a reader would see. A
 * single pass of a tag pattern is not enough without it: `<scr<b>ipt>`
 * leaves `<script>` behind once the inner tag is gone, so the fallback
 * strips until nothing changes and then drops any angle bracket left over.
 *
 * @param text - A label that may carry markup
 * @returns Its text
 */
function withoutMarkup(text: string): string {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(text, 'text/html').body.textContent ?? '';
  }
  let current = text;
  let previous: string;
  do {
    previous = current;
    current = current.replace(/<[^<>]*>/g, '');
  } while (current !== previous);
  return current.replace(/[<>]/g, '');
}

/**
 * A label as a reader should hear it: line breaks as spaces, markup and
 * Markdown emphasis stripped, entities decoded, whitespace collapsed.
 *
 * @param value - A label as Mermaid stores it
 * @returns The plain text, or an empty string
 */
export function plain(value: unknown): string {
  const text = str(value);
  if (text === undefined) {
    return '';
  }
  return withoutMarkup(text.replace(/<br\s*\/?>/gi, ' '))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole)
    // Mermaid's own entity syntax, `#9829;`, outside an HTML entity.
    .replace(/#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/(\*\*|__|`)/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The text an element of the drawing shows, as a reader should hear it.
 *
 * Text already drawn is the label as the reader sees it, so it is only
 * collapsed, never put through {@link plain}: a label drawn as `<b>` is that
 * text, not markup to strip, and an `&amp;` in it was already decoded once.
 *
 * @param element - An element of the drawing, when there is one
 * @returns Its text with whitespace collapsed, or an empty string
 */
export function drawnText(element: Element | null | undefined): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

let refCounter = 0;

/**
 * Names an element with a selector that reaches it alone.
 *
 * Mermaid's element ids are not stable across parses -- a node's id carries
 * a counter the next parse moves on -- so the adapter marks each element it
 * pairs with a reading and names it by that mark instead.
 *
 * @param element - The element to name
 * @returns A selector matching that element and no other
 */
export function refer(element: Element): string {
  let ref = element.getAttribute('data-maidr-ref');
  if (ref === null) {
    refCounter += 1;
    ref = `mm${refCounter}`;
    element.setAttribute('data-maidr-ref', ref);
  }
  return `[data-maidr-ref="${cssEscape(ref)}"]`;
}

/**
 * The selectors for a layer whose points are paired with these elements,
 * or undefined when any point has no element -- a list that has slipped by
 * one outlines the wrong mark for the rest of the layer, so the highlight is
 * withdrawn instead.
 *
 * @param elements - One element per point, in point order
 * @returns The selectors, or undefined
 */
export function selectorsFor(elements: (Element | null | undefined)[]): string[] | undefined {
  if (elements.length === 0 || elements.some(element => !element)) {
    return undefined;
  }
  return (elements as Element[]).map(refer);
}

/**
 * The candidates sharing one key, in document order, with a cursor past the
 * leading ones already paired.
 */
interface Bucket {
  entries: { element: Element; at: number }[];
  head: number;
}

/**
 * The candidates of one diagram, indexed by the ids they can be found by.
 */
interface IdIndex {
  /** By the element's id as it is. */
  exact: Map<string, Bucket>;
  /** By every stem the element's id matches loosely. */
  loose: Map<string, Bucket>;
}

/** A counter at the end of a dom id. */
const COUNTER = /-\d+$/;

/** A type prefix (`flowchart-`, `classId-`) at the start of a dom id. */
const TYPE_PREFIX = /^[a-z]+-/i;

/** The index of each candidate list, by diagram id prefix, built on first use. */
const indexes = new WeakMap<Element[], Map<string, IdIndex>>();

/**
 * Adds an element to the bucket for a key.
 *
 * @param map - The buckets
 * @param key - The key
 * @param element - The element
 * @param at - Its position in document order
 */
function file(map: Map<string, Bucket>, key: string, element: Element, at: number): void {
  const bucket = map.get(key);
  if (bucket) {
    bucket.entries.push({ element, at });
  } else {
    map.set(key, { entries: [{ element, at }], head: 0 });
  }
}

/**
 * Every stem a loose match of a key would find an id by.
 *
 * A loose match is `<svg id>-[<letters>-]<stem>[-<digits>]`, so the part
 * after the prefix is read with and without its type prefix, each with and
 * without its counter.
 *
 * @param id - The element's id
 * @param svgId - The diagram's id prefix
 * @returns The stems, none twice
 */
function stemsOf(id: string, svgId: string): Set<string> {
  const stems = new Set<string>();
  if (!id.startsWith(`${svgId}-`)) {
    return stems;
  }
  const rest = id.slice(svgId.length + 1);
  const prefix = TYPE_PREFIX.exec(rest);
  for (const body of prefix ? [rest, rest.slice(prefix[0].length)] : [rest]) {
    stems.add(body);
    if (COUNTER.test(body)) {
      stems.add(body.replace(COUNTER, ''));
    }
  }
  return stems;
}

/**
 * The index of a diagram's candidates, built once per candidate list.
 *
 * @param candidates - The elements that could be nodes, in document order
 * @param svgId - The diagram's id prefix
 * @returns The index
 */
function indexOf(candidates: Element[], svgId: string): IdIndex {
  let bySvg = indexes.get(candidates);
  if (!bySvg) {
    bySvg = new Map();
    indexes.set(candidates, bySvg);
  }
  const built = bySvg.get(svgId);
  if (built) {
    return built;
  }
  const index: IdIndex = { exact: new Map(), loose: new Map() };
  candidates.forEach((element, at) => {
    file(index.exact, element.id, element, at);
    for (const stem of stemsOf(element.id, svgId)) {
      file(index.loose, stem, element, at);
    }
  });
  bySvg.set(svgId, index);
  return index;
}

/**
 * The first element of a bucket not yet paired.
 *
 * Paired elements are never released, so those at the front are skipped for
 * good.
 *
 * @param bucket - The bucket, if any
 * @param used - Elements already paired
 * @returns The element and its position, or undefined
 */
function firstFree(bucket: Bucket | undefined, used: Set<Element>): { element: Element; at: number } | undefined {
  if (!bucket) {
    return undefined;
  }
  while (bucket.head < bucket.entries.length && used.has(bucket.entries[bucket.head].element)) {
    bucket.head++;
  }
  for (let at = bucket.head; at < bucket.entries.length; at++) {
    if (!used.has(bucket.entries[at].element)) {
      return bucket.entries[at];
    }
  }
  return undefined;
}

/**
 * Finds the element Mermaid drew for a node, by the id it was given.
 *
 * An id is `<svg id>-<dom id>` where the dom id usually ends in a counter
 * (`flowchart-A-0`, `classId-Animal-4`, `state-Still-3`). The counter moves
 * between the parse that drew the diagram and the parse the adapter reads, so
 * an exact match is tried first and then a match on everything but the
 * counter, with an optional type prefix. Each key is tried in turn, and for a
 * key the first free element in document order wins.
 *
 * The candidates are indexed on the first call for a list and the index is
 * reused by later calls with the same list, so the list must not change
 * between them.
 *
 * @param candidates - The elements that could be nodes, in document order
 * @param svgId - The diagram's id prefix
 * @param keys - The node's dom id and id, most specific first
 * @param used - Elements already paired, which are not paired twice
 * @returns The element, or null
 */
export function findById(
  candidates: Element[],
  svgId: string,
  keys: (string | undefined)[],
  used: Set<Element>,
): Element | null {
  const index = indexOf(candidates, svgId);
  const present = keys.filter((key): key is string => typeof key === 'string' && key !== '');
  for (const key of present) {
    const prefixed = firstFree(index.exact.get(`${svgId}-${key}`), used);
    const bare = firstFree(index.exact.get(key), used);
    const exact = prefixed && bare ? (prefixed.at < bare.at ? prefixed : bare) : prefixed ?? bare;
    if (exact) {
      used.add(exact.element);
      return exact.element;
    }
  }
  for (const key of present) {
    const loose = firstFree(index.loose.get(key.replace(COUNTER, '')), used);
    if (loose) {
      used.add(loose.element);
      return loose.element;
    }
  }
  return null;
}

/**
 * The elements matching a selector inside the diagram, in document order.
 *
 * @param svg - The diagram
 * @param selector - What to match
 * @returns The matches
 */
export function all(svg: Element, selector: string): Element[] {
  return [...svg.querySelectorAll(selector)];
}
