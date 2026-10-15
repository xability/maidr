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
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
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
 * Escapes a string for use in a regular expression.
 *
 * @param value - The raw string
 * @returns The escaped string
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Finds the element Mermaid drew for a node, by the id it was given.
 *
 * An id is `<svg id>-<dom id>` where the dom id usually ends in a counter
 * (`flowchart-A-0`, `classId-Animal-4`, `state-Still-3`). The counter moves
 * between the parse that drew the diagram and the parse the adapter reads, so
 * an exact match is tried first and then a match on everything but the
 * counter, with an optional type prefix.
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
  const free = candidates.filter(element => !used.has(element));
  const present = keys.filter((key): key is string => typeof key === 'string' && key !== '');
  for (const key of present) {
    const exact = free.find(element => element.id === `${svgId}-${key}` || element.id === key);
    if (exact) {
      used.add(exact);
      return exact;
    }
  }
  for (const key of present) {
    const stem = key.replace(/-\d+$/, '');
    const pattern = new RegExp(`^${escapeRegExp(svgId)}-(?:[A-Za-z]+-)?${escapeRegExp(stem)}(?:-\\d+)?$`);
    const loose = free.find(element => pattern.test(element.id));
    if (loose) {
      used.add(loose);
      return loose;
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
