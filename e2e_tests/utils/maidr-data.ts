import type { Page } from '@playwright/test';
import type { Maidr } from '../../src/type/grammar';

/**
 * The three ways an example page can hand MAIDR its schema, in the same
 * precedence order `main()` in `src/index.tsx` resolves them.
 *
 * Keep this list in sync with the entry point: a spec that reads only one of
 * them passes or fails on which mechanism its example happens to use, not on
 * whether the product works.
 */
const SCHEMA_SOURCES = {
  jsonAttribute: 'the [maidr^="{"] attribute',
  dataAttribute: 'the [maidr-data] attribute',
  windowGlobal: 'the window.maidr global',
} as const;

/**
 * Reads the MAIDR schema out of a loaded example page.
 *
 * Resolution mirrors `main()` in `src/index.tsx`: a JSON-shaped `maidr`
 * attribute first, then a `maidr-data` attribute, then the `window.maidr`
 * global. All three are supported inputs, and the examples are split across
 * all three, so a spec must accept whichever one its page uses.
 * @param page - The Playwright page, already navigated to the example
 * @returns The parsed MAIDR schema
 * @throws Error if no source carries a schema, or if the schema is not valid JSON
 */
export async function extractMaidrData(page: Page): Promise<Maidr> {
  // The callback runs in the browser and cannot close over module bindings,
  // so the labels are passed in rather than repeated on both sides.
  const result = await page.evaluate((sources) => {
    // Mirrors Constant.MAIDR_JSON_SELECTOR — chart exports also stamp
    // non-JSON `maidr="<uuid>"` attributes, which are not schemas.
    const jsonAttrPlot = document.querySelector('[maidr^="{"]');
    const jsonAttr = jsonAttrPlot?.getAttribute('maidr');
    if (jsonAttr) {
      return { json: jsonAttr, source: sources.jsonAttribute };
    }

    const dataAttrPlot = document.querySelector('[maidr-data]');
    const dataAttr = dataAttrPlot?.getAttribute('maidr-data');
    if (dataAttr) {
      return { json: dataAttr, source: sources.dataAttribute };
    }

    const globalMaidr = (window as Window & { maidr?: unknown }).maidr;
    if (globalMaidr) {
      return { json: JSON.stringify(globalMaidr), source: sources.windowGlobal };
    }

    return null;
  }, SCHEMA_SOURCES);

  if (!result) {
    throw new Error(
      `No MAIDR schema found on the page. Looked for ${Object.values(SCHEMA_SOURCES).join(', ')}.`,
    );
  }

  try {
    return JSON.parse(result.json) as Maidr;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse the MAIDR schema from ${result.source}: ${errorMessage}`);
  }
}
