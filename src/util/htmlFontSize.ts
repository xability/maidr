/**
 * The root font size MUI's typography is built for.
 *
 * MUI sizes text in `rem`, as `px / htmlFontSize`, and its default of 16 is
 * the nominal size of a browser's default font -- which is what the root is
 * on a page that leaves it alone, so 1rem is the reader's own default size.
 * A page that sets its root smaller breaks that for every dialog MAIDR opens
 * on it. Bootstrap 3 sets `html { font-size: 10px }`, and with it every
 * R Markdown `html_document`, bookdown gitbook and flexdashboard page: under
 * MUI's default the dialogs' body text came out at 8.75px instead of 14px, on
 * charts whose readers include people with low vision.
 */

/** MUI's default `typography.htmlFontSize`. */
const MUI_HTML_FONT_SIZE = 16;

/**
 * Works out the `typography.htmlFontSize` that gives MAIDR's dialogs the text
 * size they have on a page that leaves the root font size alone.
 *
 * Only a root *smaller* than the reader's default is compensated for. A page
 * that enlarges its root has always enlarged MAIDR's dialogs along with its
 * own text, and still does: larger text is never the hazard here, and undoing
 * a host's choice to show it would be a regression for the readers it was
 * made for. The reader's default font size, not a fixed 16px, is the
 * reference, so a reader who has asked their browser for larger text keeps
 * it on a page that shrinks the root, as they do on any other.
 *
 * Anything that is not a positive size -- a font size the browser did not
 * report -- leaves MUI's default in place.
 *
 * @param rootFontSize - The root element's computed font size, in px
 * @param defaultFontSize - The reader's default font size (CSS `medium`), in px
 * @returns The value for MUI's `typography.htmlFontSize`
 */
export function htmlFontSizeFor(rootFontSize: number, defaultFontSize: number): number {
  if (!(rootFontSize > 0) || !(defaultFontSize > 0) || rootFontSize >= defaultFontSize) {
    return MUI_HTML_FONT_SIZE;
  }
  return MUI_HTML_FONT_SIZE * rootFontSize / defaultFontSize;
}

/**
 * Reads the page's root font size and the reader's default font size, and
 * returns the `typography.htmlFontSize` {@link htmlFontSizeFor} makes of them.
 *
 * The default font size is CSS's `medium`, which nothing exposes directly, so
 * it is read off a probe element that exists only for the length of this
 * call. The probe is a child of the root element, so it resolves `medium`
 * for the root's own font family and language, and outside `<body>`, where
 * host pages and MAIDR's own adapters watch for inserted nodes. It is
 * `display: none`, so the read costs a style recalculation and no layout.
 *
 * @returns The value for MUI's `typography.htmlFontSize`; MUI's default where
 * there is no document (server-side rendering, a `node` test)
 */
export function readHtmlFontSize(): number {
  if (typeof document === 'undefined') {
    return MUI_HTML_FONT_SIZE;
  }

  const root = document.documentElement;
  const probe = document.createElement('div');
  // Inline and `!important`, so no host rule can override either.
  probe.style.setProperty('display', 'none', 'important');
  probe.style.setProperty('font-size', 'medium', 'important');
  root.appendChild(probe);
  try {
    return htmlFontSizeFor(
      Number.parseFloat(getComputedStyle(root).fontSize),
      Number.parseFloat(getComputedStyle(probe).fontSize),
    );
  } finally {
    probe.remove();
  }
}

/**
 * Calls `onChange` whenever the window is resized and the root font size has
 * changed with it.
 *
 * A host page's root font size can change while one of MAIDR's dialogs is
 * open: a responsive page sets it in a media query, and a reader who resizes
 * the window, turns their device, or zooms the page -- which narrows the
 * window in CSS pixels -- crosses its breakpoints. The value MUI was given
 * when the dialog opened is then wrong by as much as the root moved. Only the
 * root is compared, which needs no probe: a resize leaves the reader's default
 * size alone.
 *
 * Nothing else is watched. A stylesheet that changes the root at some other
 * time takes effect at the next render, which opening a dialog is.
 *
 * @param onChange - Called after each resize that changed the root font size
 * @returns A function that stops watching; a no-op where there is no `window`
 * (server-side rendering, a `node` test)
 */
export function watchRootFontSize(onChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => { /* Nothing was watched. */ };
  }

  let rootFontSize = getComputedStyle(document.documentElement).fontSize;
  const onResize = (): void => {
    const current = getComputedStyle(document.documentElement).fontSize;
    if (current !== rootFontSize) {
      rootFontSize = current;
      onChange();
    }
  };

  window.addEventListener('resize', onResize);
  return () => window.removeEventListener('resize', onResize);
}
