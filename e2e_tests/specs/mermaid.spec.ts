import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * E2E coverage for the Mermaid adapter (`maidr/mermaid`).
 *
 * Drives the examples under `examples/mermaid/`, one per diagram type, which
 * load Mermaid (and, for ZenUML, its plugin) from jsdelivr and the adapter
 * from `dist/mermaid.js`. The CDN requests are served from `node_modules` so
 * the spec needs no network, and every page runs the real Mermaid: the parse the adapter reads
 * and the SVG it pairs the reading with are Mermaid's own. Requires a built
 * core and adapter (`node scripts/build.js core mermaid`).
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mermaidDist = path.join(repoRoot, 'node_modules/mermaid/dist');
const zenumlDist = path.join(repoRoot, 'node_modules/@mermaid-js/mermaid-zenuml/dist');

const TEXT = '#maidr-text-container';
const FOCUS_TARGET = '[id^="maidr-figure-"] [tabindex="0"]';
const BRAILLE = 'textarea[id^="maidr-braille-textarea-"]';
const HIGHLIGHT = '[id^="maidr-highlight"]';

/**
 * Every braille cell MAIDR can emit lives in the Unicode braille block, but
 * for the blank a scatter's grid leaves in a cell with no points.
 */
const BRAILLE_CELLS = /^[\u2800-\u28FF\n ]+$/;

/** Every example page and the layer types it should become. */
const PAGES: Record<string, string[]> = {
  flowchart: ['directed_graph'],
  sequence: ['sequence'],
  zenuml: ['sequence'],
  class: ['directed_graph'],
  state: ['directed_graph'],
  er: ['directed_graph'],
  requirement: ['directed_graph'],
  usecase: ['directed_graph'],
  c4: ['directed_graph'],
  block: ['directed_graph'],
  architecture: ['directed_graph'],
  gitgraph: ['directed_graph'],
  eventmodeling: ['directed_graph'],
  swimlane: ['directed_graph'],
  agentflow: ['directed_graph'],
  mindmap: ['tree'],
  kanban: ['tree'],
  treeview: ['tree'],
  ishikawa: ['tree'],
  timeline: ['tree'],
  railroad: ['tree'],
  cynefin: ['tree', 'directed_graph'],
  pie: ['pie'],
  gantt: ['gantt'],
  packet: ['gantt'],
  quadrant: ['point'],
  xychart: ['bar', 'line'],
  radar: ['radar'],
  sankey: ['sankey'],
  treemap: ['treemap'],
  journey: ['line'],
  venn: ['venn'],
  wardley: ['point', 'directed_graph'],
};

test.use({ timezoneId: 'UTC', locale: 'en-US' });

/**
 * Opens an example with Mermaid served locally, and waits for MAIDR to take
 * the diagram.
 *
 * @param page - The page
 * @param name - The example's file name, without `.html`
 */
async function openExample(page: Page, name: string): Promise<void> {
  for (const [pattern, dist] of [
    ['https://cdn.jsdelivr.net/npm/mermaid@*/dist/*', mermaidDist],
    ['https://cdn.jsdelivr.net/npm/@mermaid-js/mermaid-zenuml@*/dist/*', zenumlDist],
  ]) {
    await page.route(pattern, async (route) => {
      const file = path.join(dist, path.basename(new URL(route.request().url()).pathname));
      await route.fulfill({
        body: fs.readFileSync(file),
        contentType: 'text/javascript',
        headers: { 'access-control-allow-origin': '*' },
      });
    });
  }
  await page.goto(`examples/mermaid/${name}.html`);
  const target = page.locator(FOCUS_TARGET).first();
  await target.waitFor({ state: 'attached', timeout: 15000 });
  await target.focus();
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
 * Presses a key and waits for the announcement to change.
 *
 * @param page - The page
 * @param key - The key
 * @returns The new announcement
 */
async function press(page: Page, key: string): Promise<string> {
  const before = await announcement(page);
  await page.keyboard.press(key);
  await expect.poll(() => announcement(page)).not.toBe(before);
  return announcement(page);
}

/**
 * How wide the drawing is, how wide Mermaid drew it (its viewBox), and how
 * wide the figure it sits in is.
 *
 * @param page - The page
 * @returns The three widths, in CSS pixels
 */
async function widths(page: Page): Promise<{ drawing: number; drawn: number; figure: number }> {
  return page.locator('svg[maidr]').first().evaluate((svg: SVGSVGElement) => ({
    drawing: svg.getBoundingClientRect().width,
    drawn: svg.viewBox.baseVal.width,
    figure: (svg.closest('figure[id^="maidr-figure-"]') as HTMLElement).getBoundingClientRect().width,
  }));
}

/**
 * What MAIDR's focus ring covers of the focused diagram: each label, and
 * each box short of the whole drawing, that reaches into the 5px the ring is
 * drawn over on the left, top or right.
 *
 * @param page - The page
 * @returns The labels' text, or the boxes' tag
 */
async function underFocusRing(page: Page): Promise<string[]> {
  return page.locator(FOCUS_TARGET).first().evaluate((plot) => {
    const ring = 5;
    const edge = plot.getBoundingClientRect();
    const svg = plot.querySelector('svg') as SVGSVGElement;
    const whole = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('text, rect')].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.width < whole.width * 0.95 && element.closest('defs') === null
        && (box.left < edge.left + ring - 0.5 || box.top < edge.top + ring - 0.5
          || box.right > edge.right - ring + 0.5);
    }).map(element => element.textContent?.trim() || element.tagName);
  });
}

/**
 * Which of the elements a selector matches hold a line longer than they are
 * wide.
 *
 * @param page - The page
 * @param selector - The elements
 * @returns Each overflowing element's text
 */
async function overflowing(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll(elements => elements
    .filter(element => element.scrollWidth > element.clientWidth + 1)
    .map(element => (element.textContent ?? '').slice(0, 60)));
}

/**
 * The layer types MAIDR was handed.
 *
 * @param page - The page
 * @returns The types, in layer order
 */
async function layerTypes(page: Page): Promise<string[]> {
  const json = await page.locator('svg[maidr]').first().getAttribute('maidr');
  const maidr = JSON.parse(json ?? '{}') as { subplots: { layers: { type: string }[] }[][] };
  return maidr.subplots[0][0].layers.map(layer => layer.type);
}

test.describe('Mermaid adapter', () => {
  for (const [name, types] of Object.entries(PAGES)) {
    test(`reads the ${name} example as ${types.join(' and ')}, in text and braille`, async ({ page }) => {
      await openExample(page, name);

      expect(await layerTypes(page)).toEqual(types);
      const first = await press(page, 'ArrowRight');
      expect(first.length).toBeGreaterThan(0);

      // A scatter's braille surface is its grid, a count per cell, which the
      // rotor's grid navigation opens.
      if (types[0] === 'point') {
        await page.keyboard.press('Alt+Shift+ArrowUp');
        await expect(page.locator('#maidr-rotor-area')).toContainText('GRID NAVIGATION');
      }
      await page.keyboard.press('b');
      const braille = page.locator(BRAILLE).first();
      await expect.poll(async () => (await braille.inputValue()).trim()).toMatch(BRAILLE_CELLS);
    });
  }

  test('reads a flowchart along its arrows, each branch by its label', async ({ page }) => {
    await openExample(page, 'flowchart');
    await press(page, 'ArrowRight');
    const decision = await press(page, 'ArrowRight');

    expect(decision).toContain('In stock?');
    expect(decision).toContain('Back-order (no)');
    expect(decision).toContain('Shape is decision');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('In stock?');
  });

  test('walks a sequence diagram in time, and a lifeline keeping the moment', async ({ page }) => {
    await openExample(page, 'sequence');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    const looped = await press(page, 'ArrowRight');

    expect(looped).toContain('User row');
    expect(looped).toContain('Route is Database to Web app');
    expect(looped).toContain('Fragment is loop Until the password matches');

    await press(page, 'ArrowDown');
    const lifeline = await press(page, 'ArrowDown');
    expect(lifeline).toContain('Lifeline is Web app');
    expect(lifeline).toContain('User row');
  });

  test('goes into a Venn diagram\'s overlaps and back out', async ({ page }) => {
    await openExample(page, 'venn');
    const set = await press(page, 'ArrowRight');
    expect(set).toContain('Region is Frontend');
    expect(set).toContain('Overlaps is Backend, Data');

    const overlap = await press(page, 'ArrowDown');
    expect(overlap).toContain('Region is Frontend and Backend');
    expect(overlap).toContain('Name is Full stack');

    expect(await press(page, 'ArrowUp')).toContain('Region is Frontend');
  });

  test('announces a class\'s members and what it inherits from', async ({ page }) => {
    await openExample(page, 'class');
    const duck = await press(page, 'ArrowRight');

    expect(duck).toContain('Class is Duck');
    expect(duck).toContain('Animal (inherits from)');
    expect(duck).toContain('Methods is public swim(); public quack()');
    expect(duck).toContain('Note is can fly and swim');
  });

  test('reads a ZenUML diagram from its text, nested calls and replies included', async ({ page }) => {
    await openExample(page, 'zenuml');
    await press(page, 'ArrowRight');
    const nested = await press(page, 'ArrowRight');
    expect(nested).toContain('Message is check(seat)');
    expect(nested).toContain('Route is API to Store');

    const reply = await press(page, 'ArrowRight');
    expect(reply).toContain('Route is Store to API');
    expect(reply).toContain('Kind is reply');
  });

  test('reads a gantt chart\'s tasks as dates with their status', async ({ page }) => {
    await openExample(page, 'gantt');
    const research = await press(page, 'ArrowRight');

    expect(research).toContain('Research (done)');
    expect(research).toContain('Length is 10 days');
  });

  // Mermaid draws a diagram `width="100%"`, up to the width it laid it out
  // at. In MAIDR's plot, which is as wide as what it holds, the browser drew
  // that at its 300px fallback.
  for (const name of ['flowchart', 'gantt', 'mindmap']) {
    test(`draws the ${name} example at Mermaid's size, not at 300px`, async ({ page }) => {
      await openExample(page, name);

      const { drawing, drawn, figure } = await widths(page);
      expect(Math.min(drawn, figure)).toBeGreaterThan(300);
      expect(Math.abs(drawing - Math.min(drawn, figure))).toBeLessThanOrEqual(1);
    });
  }

  test('outlines a gantt task at the size it is drawn', async ({ page }) => {
    await openExample(page, 'gantt');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');

    const box = await page.locator(HIGHLIGHT).first().boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(15);
  });

  // The ring is drawn inside the chart, over what is there, and these draw
  // at the drawing's edge: a railroad's rule names, a packet's bit numbers,
  // a sankey's node bars.
  for (const name of ['railroad', 'packet', 'sankey']) {
    test(`keeps the focus ring off the ${name} example's drawing`, async ({ page }) => {
      await openExample(page, name);
      await press(page, 'ArrowRight');

      expect(await underFocusRing(page)).toEqual([]);
    });
  }

  // Mermaid's markup puts a diagram in a `<pre class="mermaid">`, and what
  // MAIDR shows is mounted inside it, dialogs included.
  for (const width of [undefined, 320]) {
    test(`wraps MAIDR's text and dialogs inside the <pre> Mermaid draws into${width ? ` at ${width}px` : ''}`, async ({ page }) => {
      if (width !== undefined) {
        await page.setViewportSize({ width, height: 800 });
      }
      await openExample(page, 'c4');
      await press(page, 'ArrowRight');

      expect(await overflowing(page, TEXT)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

      await page.keyboard.press('o');
      await expect(page.locator('#object-list-description')).toBeVisible();
      expect(await overflowing(page, '#object-list-description')).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(page.locator('#object-list-description')).toHaveCount(0);
      await page.keyboard.press('d');
      await page.getByRole('dialog').getByRole('button', { name: /About this chart type/ }).click();
      await expect(page.locator('[role="dialog"] dd').first()).toBeVisible();
      expect(await overflowing(page, '[role="dialog"] dd')).toEqual([]);
    });
  }

  test('shrinks a diagram to a page narrower than it, without scrolling sideways', async ({ page }) => {
    await openExample(page, 'flowchart');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.setViewportSize({ width: 360, height: 800 });

    const { drawing, figure } = await widths(page);
    expect(drawing).toBeLessThanOrEqual(figure + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
