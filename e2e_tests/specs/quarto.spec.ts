import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for `{mermaid}` and `{dot}` cells on a page Quarto rendered.
 *
 * `e2e_tests/fixtures/quarto/diagrams.html` is Quarto's own output, cut down:
 * its generator meta, its Mermaid runtime (`mermaid-init.js`) and its cells as
 * it wrote them, with `maidr.js`, `mermaid.js` and `graphviz.js` in the head
 * where the `maidr` filter puts them. Nothing on the page calls MAIDR; the
 * adapters start themselves because the page is Quarto's, which is the whole
 * point. Requires the core, Mermaid and Graphviz bundles
 * (`node scripts/build.js core locales mermaid graphviz`).
 */

const mermaidDist = path.resolve('node_modules/mermaid/dist');

/** Quarto's own `mermaid-init.js`, vendored unchanged and kept as data. */
const quartoInit = path.resolve('e2e_tests/fixtures/quarto/libs/quarto-diagram/mermaid-init.js.txt');

/**
 * Where the page is served from: an origin every request to which is
 * answered from the repository.
 *
 * Not the `file://` URLs the other specs use. Playwright routes a request a
 * `file://` page makes only in Chromium; Firefox and WebKit read it from the
 * disk, where Quarto's copy of Mermaid and its runtime are not, so they drew
 * no `{mermaid}` cell at all. A request to an `http` origin is routed in all
 * three.
 */
const ORIGIN = 'http://quarto.maidr.test';

/** The content type each file served is given, by its extension. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const FOCUS_TARGET = '[id^="maidr-figure-"] [tabindex="0"]';
const TEXT = '#maidr-text-container';
const BRAILLE = 'textarea[id^="maidr-braille-textarea-"]';
const HIGHLIGHT = '[id^="maidr-highlight"]';

/**
 * The file a request to the page's origin is answered with: Quarto's copy of
 * Mermaid from node_modules, its Mermaid runtime from the vendored copy, and
 * anything else from the repository.
 *
 * @param pathname - The request's path
 * @returns The file
 */
function fileFor(pathname: string): string {
  if (pathname.endsWith('/libs/quarto-diagram/mermaid.min.js')) {
    return path.join(mermaidDist, 'mermaid.min.js');
  }
  if (pathname.endsWith('/libs/quarto-diagram/mermaid-init.js')) {
    return quartoInit;
  }
  return path.join(path.resolve('.'), pathname);
}

/**
 * Opens the page and waits for every diagram to be bound.
 *
 * @param page - The page
 */
async function openQuartoPage(page: Page): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const file = fileFor(decodeURIComponent(new URL(route.request().url()).pathname));
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      await route.fulfill({ status: 404, body: '' });
      return;
    }
    await route.fulfill({
      body: fs.readFileSync(file),
      contentType: CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
    });
  });
  await page.goto(`${ORIGIN}/e2e_tests/fixtures/quarto/diagrams.html`);
  await expect(page.locator('svg[maidr]')).toHaveCount(4, { timeout: 15000 });
}

/**
 * The current text-mode announcement.
 *
 * @param page - The page
 * @returns The announcement
 */
async function announcement(page: Page): Promise<string> {
  return ((await page.locator(TEXT).textContent()) ?? '').replace(/\s+/g, ' ');
}

/**
 * Focuses a diagram, presses a key and waits for the announcement to change.
 *
 * @param page - The page
 * @param index - Which diagram, in document order
 * @param key - The key
 * @returns The new announcement
 */
async function pressOn(page: Page, index: number, key: string): Promise<string> {
  await page.locator(FOCUS_TARGET).nth(index).focus();
  const before = await announcement(page);
  await page.keyboard.press(key);
  await expect.poll(() => announcement(page)).not.toBe(before);
  return announcement(page);
}

test.describe('Quarto diagrams', () => {
  test.beforeEach(async ({ page }) => {
    await openQuartoPage(page);
  });

  test('binds every {mermaid} and {dot} cell with no call on the page', async ({ page }) => {
    const types = await page.locator('svg[maidr]').evaluateAll(svgs => svgs.map(svg =>
      (JSON.parse(svg.getAttribute('maidr') ?? '{}').subplots?.[0]?.[0]?.layers ?? [])
        .map((layer: { type: string }) => layer.type)));

    expect(types).toEqual([['directed_graph'], ['sequence'], ['pie'], ['directed_graph']]);
  });

  test('reads a labelled flowchart Quarto renamed, and outlines its nodes', async ({ page }) => {
    await expect(page.locator('#fig-flow-mermaid[maidr]')).toHaveCount(1);

    const first = await pressOn(page, 0, 'ArrowRight');

    expect(first).toContain('Order');
    await expect(page.locator(HIGHLIGHT).first()).toBeAttached();
  });

  test('draws a {mermaid} cell at the size Mermaid drew it, not at 300px', async ({ page }) => {
    const { drawing, drawn, figure } = await page.locator('#fig-flow-mermaid').evaluate((svg: SVGSVGElement) => ({
      drawing: svg.getBoundingClientRect().width,
      drawn: svg.viewBox.baseVal.width,
      figure: (svg.closest('figure[id^="maidr-figure-"]') as HTMLElement).getBoundingClientRect().width,
    }));

    expect(Math.min(drawn, figure)).toBeGreaterThan(300);
    expect(Math.abs(drawing - Math.min(drawn, figure))).toBeLessThanOrEqual(1);
  });

  test('walks the sequence diagram, the pie and the {dot} graph, in text and braille', async ({ page }) => {
    expect(await pressOn(page, 1, 'ArrowRight')).toContain('Hello');

    expect(await pressOn(page, 2, 'ArrowRight')).toContain('Dogs');

    expect(await pressOn(page, 3, 'ArrowRight')).toContain('Node is a');
    await page.keyboard.press('b');
    await expect.poll(async () => (await page.locator(BRAILLE).first().inputValue()).trim())
      .toMatch(/^[\p{Script=Braille}\n]+$/u);
  });
});
