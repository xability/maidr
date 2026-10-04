/**
 * The few DOM helpers reading Open XML parts needs: parsing a part, and
 * finding its elements by namespace and local name, as the parts' prefixes
 * are only a convention.
 */

/** The namespaces of the parts read. */
export const NS = {
  /** DrawingML charts (`c:`). */
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  /** The chart types Office 2016 added (`cx:`). */
  cx: 'http://schemas.microsoft.com/office/drawing/2014/chartex',
  /** DrawingML (`a:`). */
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  /** Relationship ids in a part (`r:`). */
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  /** A part's relationships (`.rels`). */
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  /** PresentationML (`p:`). */
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  /** WordprocessingML drawings (`wp:`). */
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  /** Markup compatibility (`mc:`). */
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  /** A flat package, as Word's `getOoxml` returns one (`pkg:`). */
  pkg: 'http://schemas.microsoft.com/office/2006/xmlPackage',
} as const;

/** What a chart frame's `a:graphicData` says it holds: a DrawingML chart. */
export const CHART_URI = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

/** ... or a chart of a type Office 2016 added. */
export const CHARTEX_URI = 'http://schemas.microsoft.com/office/drawing/2014/chartex';

/**
 * Parse an XML part.
 *
 * @param text - The part's text.
 * @returns The document, or `null` when the text is not well-formed XML.
 */
export function parseXml(text: string): Document | null {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length > 0 || document.documentElement === null) {
    return null;
  }
  return document;
}

/** Whether an element is `ns:local`. */
export function is(element: Element, ns: string, local: string): boolean {
  return element.namespaceURI === ns && element.localName === local;
}

/** The element children of `parent` that are `ns:local`, in document order. */
export function children(parent: Element | null | undefined, ns: string, local: string): Element[] {
  if (parent === null || parent === undefined) {
    return [];
  }
  return Array.from(parent.children).filter(element => is(element, ns, local));
}

/** The first element child of `parent` that is `ns:local`. */
export function child(parent: Element | null | undefined, ns: string, local: string): Element | null {
  if (parent === null || parent === undefined) {
    return null;
  }
  for (const element of Array.from(parent.children)) {
    if (is(element, ns, local)) {
      return element;
    }
  }
  return null;
}

/**
 * The element at a path of children from `parent`, each step `ns:local` in
 * the same namespace.
 */
export function path(parent: Element | null | undefined, ns: string, ...locals: string[]): Element | null {
  let at: Element | null | undefined = parent;
  for (const local of locals) {
    at = child(at, ns, local);
    if (at === null) {
      return null;
    }
  }
  return at ?? null;
}

/**
 * Every descendant of `parent` that is `ns:local`, in document order,
 * leaving out those in an `mc:Fallback`: what a markup-compatibility block
 * offers to programs that do not understand its `mc:Choice`, which this one
 * reads instead.
 */
export function descendants(parent: Element | Document, ns: string, local: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(ns, local)).filter(element => !inFallback(element, parent));
}

function inFallback(element: Element, stop: Element | Document): boolean {
  for (let at = element.parentElement; at !== null && at !== stop; at = at.parentElement) {
    if (is(at, NS.mc, 'Fallback')) {
      return true;
    }
  }
  return false;
}

/**
 * The `val` attribute of the first child `c:local`, or `fallback`: how
 * DrawingML charts write nearly every setting.
 */
export function val(parent: Element | null | undefined, local: string, fallback?: string): string | undefined {
  const found = child(parent, NS.c, local);
  if (found === null) {
    return fallback;
  }
  return found.getAttribute('val') ?? fallback;
}

/** Whether an attribute value is a true boolean, as Open XML writes them. */
export function truthy(value: string | null | undefined): boolean {
  return value === '1' || value === 'true';
}

/** The text of an element, or `''`. */
export function text(element: Element | null | undefined): string {
  return element?.textContent ?? '';
}

/**
 * The text of a rich-text body (`c:rich`, `cx:rich`): its paragraphs' runs,
 * the paragraphs joined by a space.
 */
export function richText(rich: Element | null): string | undefined {
  if (rich === null) {
    return undefined;
  }
  const lines = descendants(rich, NS.a, 'p')
    .map(paragraph => descendants(paragraph, NS.a, 't').map(run => run.textContent ?? '').join('').trim())
    .filter(line => line !== '');
  const joined = lines.join(' ');
  return joined === '' ? undefined : joined;
}
