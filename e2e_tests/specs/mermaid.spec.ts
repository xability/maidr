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

/** Every braille cell MAIDR can emit lives in the Unicode braille block. */
const BRAILLE_CELLS = /^[\u2800-\u28FF\n]+$/;

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

      // MAIDR has no braille encoding for a scatter, and says so.
      if (types[0] !== 'point') {
        await page.keyboard.press('b');
        const braille = page.locator(BRAILLE).first();
        await expect.poll(async () => (await braille.inputValue()).trim()).toMatch(BRAILLE_CELLS);
      }
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
});
