/**
 * Test helper for the D3 adapter's core-model integration cases.
 *
 * The model resolves every layer selector through the page-global `document`
 * (`Svg.selectAllElements`), which in a Jest `node` environment does not exist
 * — so a Figure built from a binder's output would silently resolve nothing
 * and withdraw its highlighting, and the case would pass without exercising
 * the part it was written for.
 */

/**
 * Runs `assert` with the page-global `document` pointed at the one the given
 * element belongs to, restoring whatever was there before — including its
 * absence — however the assertion ends.
 *
 * @param element - Any element from the JSDOM document the case built.
 * @param assert - The assertion to run against that document.
 * @returns Whatever `assert` returns.
 */
export function withPageDocument<T>(element: Element, assert: () => T): T {
  const globals = globalThis as { document?: Document };
  const previousDocument = globals.document;
  globals.document = element.ownerDocument;
  try {
    return assert();
  } finally {
    if (previousDocument === undefined) {
      delete globals.document;
    } else {
      globals.document = previousDocument;
    }
  }
}
