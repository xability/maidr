/**
 * Adds a stylesheet to the head of a document, once per document.
 *
 * Prepended, so the page's own rules of equal specificity, which come later,
 * win: MAIDR's rules are a floor for a page that set nothing, not a ceiling
 * for one that did.
 *
 * Keyed by an attribute on the `<style>` rather than by a module-level flag,
 * so two copies of MAIDR on one page -- maidr.js and an adapter bundle -- add
 * the sheet once between them, and a document that lost its head's contents
 * gets it again.
 * @param doc - The document the rules are for
 * @param marker - The attribute that names the `<style>`, such as
 *   `data-maidr-figure`
 * @param css - The rules
 */
export function ensureDocumentStyle(doc: Document, marker: string, css: string): void {
  const head = doc.head;
  if (!head || head.querySelector(`style[${marker}]`)) {
    return;
  }
  const style = doc.createElement('style');
  style.setAttribute(marker, '');
  style.textContent = css;
  head.prepend(style);
}
