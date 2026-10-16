/**
 * Recognising a page Quarto rendered.
 *
 * The diagram adapters start themselves on such a page, so that a Quarto
 * author's whole integration is the script tag (or the `maidr` filter that
 * adds it): a `{mermaid}` or `{dot}` cell has no place to call a binder from.
 * Anywhere else they wait to be called, as they always have, so a page that
 * binds with its own options is not bound first with the defaults.
 */

/**
 * Whether a document is a page Quarto rendered.
 *
 * Quarto writes `<meta name="generator" content="quarto-1.x.y">` into the
 * head of every HTML page it renders, documents and slides alike.
 *
 * @param doc - The document to look at
 * @returns True when Quarto rendered it
 */
export function isQuartoPage(doc: Document = document): boolean {
  const generator = doc.querySelector('meta[name="generator"]')?.getAttribute('content') ?? '';
  return generator.startsWith('quarto-');
}

/**
 * Runs a start-up once the document has been parsed, at once when it already
 * has. Without a document -- a script loaded outside a page -- it never runs.
 *
 * @param start - What to run
 */
export function whenParsed(start: () => void): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
