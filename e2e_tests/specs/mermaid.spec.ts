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

/** The default highlight colour, as a computed stroke. */
const HIGHLIGHT_STROKE = 'rgb(3, 200, 9)';

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
 * How a highlight is painted against the mark it covers, read in the page:
 * the hidden copy of the mark it was made from sits just before it.
 *
 * @param highlight - The highlight
 * @returns The WCAG contrast between the two fills, and the two strokes
 */
function paintAgainstMark(highlight: Element): { ratio: number; stroke: string; markStroke: string } {
  const mark = highlight.previousElementSibling as Element;
  const luminance = (color: string): number => {
    const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((channel) => {
      const value = Number(channel) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const lit = luminance(getComputedStyle(highlight).fill);
  const drawn = luminance(getComputedStyle(mark).fill);
  return {
    ratio: (Math.max(lit, drawn) + 0.05) / (Math.min(lit, drawn) + 0.05),
    stroke: getComputedStyle(highlight).stroke,
    markStroke: getComputedStyle(mark).stroke,
  };
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
    // Its yes branch leads into the Shipping subgraph, which the reader meets
    // closed: the edge it stands for is still named by its label.
    expect(decision).toContain('To is Shipping (yes), Back-order (no)');
    expect(decision).toContain('Shape is decision');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('In stock?');
    // The diamond itself, which Mermaid's stylesheet paints, not only its label.
    await expect(page.locator(`${HIGHLIGHT} :is(rect, path, polygon)`).first())
      .toHaveCSS('stroke', HIGHLIGHT_STROKE);
  });

  test('names a transition into or out of a composite state by its event', async ({ page }) => {
    await openExample(page, 'state');
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowRight')).toContain('To is Running (start)');
    expect(await press(page, 'ArrowRight')).toContain('To is Idle (stop), end (quit)');

    await openExample(page, 'c4');
    expect(await press(page, 'ArrowRight')).toContain('To is Bank (enterprise) (Uses)');
  });

  test('reads a flowchart in terse mode with no empty field after a step\'s name', async ({ page }) => {
    await openExample(page, 'flowchart');
    await page.keyboard.press('t');

    const first = await press(page, 'ArrowRight');

    expect(first).toMatch(/^Order received, 0 inputs, 1 output, /);
    expect(first).not.toContain(', , ');
  });

  test('outlines every node inside a flowchart\'s subgraph while the reader is on it', async ({ page }) => {
    await openExample(page, 'flowchart');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');

    expect(await press(page, 'ArrowRight')).toContain('Scope is Shipping');
    await expect.poll(async () => (await page.locator(HIGHLIGHT).allTextContents()).map(text => text.trim()).sort())
      .toEqual(['Pack items', 'Print label', 'Ship']);
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

  test('outlines a sequence diagram\'s message and note over Mermaid\'s own paint', async ({ page }) => {
    await openExample(page, 'sequence');
    await press(page, 'ArrowRight');
    // Mermaid's stylesheet draws a message 1.5px wide, over the attribute.
    await expect(page.locator(HIGHLIGHT)).toHaveCSS('stroke-width', '3.5px');

    expect(await press(page, 'Control+ArrowRight')).toContain('Note is Session stored');
    await expect(page.locator(`${HIGHLIGHT} rect`)).toHaveCSS('stroke', HIGHLIGHT_STROKE);
  });

  test('draws the highlight of a light mark at 3:1 against it, keeping its edge', async ({ page }) => {
    await openExample(page, 'pie');
    await press(page, 'ArrowRight');
    const slice = await page.locator(HIGHLIGHT).evaluate(paintAgainstMark);
    expect(slice.ratio).toBeGreaterThanOrEqual(3);
    expect(slice.stroke).toBe(slice.markStroke);

    await openExample(page, 'radar');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowDown')).toContain('Bob');
    const point = await page.locator(HIGHLIGHT).evaluate(paintAgainstMark);
    expect(point.ratio).toBeGreaterThanOrEqual(3);
  });

  test('draws the highlight in the reader\'s colour in high contrast, not a grey of its white', async ({ page }) => {
    await openExample(page, 'cynefin');
    await press(page, 'ArrowRight');
    expect(await press(page, 'c')).toContain('High Contrast Mode on');

    expect(await press(page, 'ArrowRight')).toContain('Domain is Complicated');
    await expect(page.locator(HIGHLIGHT)).toHaveCSS('fill', HIGHLIGHT_STROKE);
  });

  test('numbers only what a sequence diagram numbers, in its description', async ({ page }) => {
    await openExample(page, 'sequence');
    await press(page, 'ArrowRight');
    await page.keyboard.press('d');

    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('tr', { hasText: 'Log in' }).locator('th, td').first()).toHaveText('1');
    // `autonumber` numbers the messages; the note it leaves unnumbered.
    await expect(dialog.locator('tr', { hasText: 'Session stored' }).locator('th, td').first()).toHaveText('');
  });

  test('counts a sequence diagram\'s fragments as it draws them, and names an else by its alt', async ({ page }) => {
    await openExample(page, 'sequence');
    await press(page, 'ArrowRight');
    await page.keyboard.press('d');

    // One loop and one alt with an else: two boxes, not three.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Fragments: 2');
    await expect(dialog.locator('tr', { hasText: 'Welcome' })).toContainText('alt Two-factor enabled, else');
  });

  test('sets a participant\'s kind off from its name, in a lifeline and the description', async ({ page }) => {
    await openExample(page, 'zenuml');
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowDown')).toContain('Lifeline is Customer (actor)');

    await page.keyboard.press('d');
    await expect(page.getByRole('dialog'))
      .toContainText('Customer (actor), API (boundary), Store (database)');
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

  test('announces a class\'s members, what it inherits from and what aggregates it', async ({ page }) => {
    await openExample(page, 'class');
    await press(page, 'ArrowRight');
    // `Pond "1" o-- "*" Duck`: the diamond marks Pond, the whole, which the
    // aggregation runs from.
    const pond = await press(page, 'ArrowRight');
    expect(pond).toContain('Class is Pond');
    expect(pond).toContain('To is Duck (lives in, aggregates');

    const duck = await press(page, 'ArrowRight');
    expect(duck).toContain('Class is Duck');
    expect(duck).toContain('From is Pond (lives in, aggregates, cardinality 1 Pond to * Duck)');
    expect(duck).toContain('To is Animal (inherits from)');
    expect(duck).toContain('Methods is public swim(); public quack()');
    expect(duck).toContain('Note is can fly and swim');
  });

  test('names a requirement diagram\'s element as an element', async ({ page }) => {
    await openExample(page, 'requirement');
    const requirement = await press(page, 'ArrowRight');
    expect(requirement).toContain('Node is checkout_req');
    expect(requirement).toContain('Kind is Requirement');

    const element = await press(page, 'ArrowRight');
    expect(element).toContain('Node is payment_service');
    expect(element).toContain('Kind is Element, Type is service');
    expect(element).not.toContain('Requirement is');
  });

  test('announces an event model\'s entity and its frame under different names', async ({ page }) => {
    await openExample(page, 'eventmodeling');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    const box = await press(page, 'ArrowDown');

    expect(box).toContain('Entity is CartUI');
    expect(box).toContain('Frame is 01');
    expect(box).not.toContain('Frame is CartUI');
  });

  test('calls an architecture diagram\'s group a scope, not a service', async ({ page }) => {
    await openExample(page, 'architecture');
    await press(page, 'ArrowRight');
    const group = await press(page, 'ArrowRight');

    expect(group).toContain('Scope is API');
    expect(group).toContain('Size is 3 nodes inside');
    expect(group).not.toContain('Service is');
  });

  test('calls a git branch and an agent\'s flow scopes, and a flow of connected steps connected', async ({ page }) => {
    await openExample(page, 'gitgraph');
    const branch = await press(page, 'ArrowRight');
    expect(branch).toContain('Scope is main');
    expect(branch).not.toContain('Commit is main');

    await openExample(page, 'agentflow');
    const flow = await press(page, 'ArrowRight');
    expect(flow).toContain('Scope is Review Agent');
    expect(flow).not.toContain('not connected');
  });

  test('reads an architecture connection drawn without an arrow both ways', async ({ page }) => {
    await openExample(page, 'architecture');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    // `disk:T -- B:db` is a plain line: neither end leads to the other.
    const database = await press(page, 'ArrowRight');
    expect(database).toContain('Element is Database');
    expect(database).toContain('To is Storage');

    const storage = await press(page, 'ArrowRight');
    expect(storage).toContain('Element is Storage');
    expect(storage).toContain('From is Database');
    expect(storage).not.toContain('graph input');
  });

  test('reads an agent flow by the kind of each step', async ({ page }) => {
    await openExample(page, 'agentflow');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    await press(page, 'ArrowRight');
    const tool = await press(page, 'ArrowRight');
    expect(tool).toContain('Step is run_linter');
    expect(tool).toContain('Kind is tool');
    expect(tool).not.toContain('subprocess');

    await press(page, 'ArrowRight');
    const action = await press(page, 'ArrowRight');
    expect(action).toContain('Step is Approve');
    expect(action).toContain('Kind is action');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('Approve');
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

    // The plugin draws every call before every reply; each is outlined in
    // the order it happens all the same.
    await expect(page.locator(HIGHLIGHT).first()).toContainText('available');
    for (const message of ['reserve(seat)', 'confirmation', 'sold out', 'receipt e-mailed']) {
      expect(await press(page, 'ArrowRight')).toContain(`Message is ${message}`);
      await expect(page.locator(HIGHLIGHT).first()).toContainText(message);
    }

    // ZenUML's own numbers are not read yet; the description invents none.
    await page.keyboard.press('d');
    await expect(page.getByRole('dialog').locator('th', { hasText: 'Message' })).toBeVisible();
    await expect(page.getByRole('dialog').locator('th', { hasText: 'Number' })).toHaveCount(0);
  });

  test('reads a gantt chart\'s tasks as dates with their status', async ({ page }) => {
    await openExample(page, 'gantt');
    const research = await press(page, 'ArrowRight');

    expect(research).toContain('Research (done)');
    expect(research).toContain('Length is 10 days');
  });

  test('finds the next longer task in a gantt lane with the rotor', async ({ page }) => {
    await openExample(page, 'gantt');
    await press(page, 'ArrowRight');
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await page.keyboard.press('Alt+Shift+ArrowUp');
    await expect(page.locator('#maidr-rotor-area')).toContainText('HIGHER VALUE NAVIGATION');

    expect(await press(page, 'ArrowRight')).toContain('Prototype');
  });

  test('says a flowchart has no extrema to go to, rather than ignoring g', async ({ page }) => {
    await openExample(page, 'flowchart');
    await press(page, 'ArrowRight');

    expect(await press(page, 'g')).toContain('No extrema to go to in this layer');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  test('offers a flowchart\'s outputs first in the rotor, not values its nodes lack', async ({ page }) => {
    await openExample(page, 'flowchart');
    await press(page, 'ArrowRight');
    await page.keyboard.press('Alt+Shift+ArrowUp');

    await expect(page.locator('#maidr-rotor-area')).toContainText('Outputs');
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

  test('shows MAIDR\'s text in the page\'s font, not the monospace of Mermaid\'s <pre>', async ({ page }) => {
    await openExample(page, 'flowchart');
    await press(page, 'ArrowRight');

    const fonts = await page.evaluate(() => {
      const text = getComputedStyle(document.querySelector('#maidr-text-container p') as Element);
      return { text: text.fontFamily, size: text.fontSize, page: getComputedStyle(document.body).fontFamily };
    });
    expect(fonts.text).toBe(fonts.page);
    expect(fonts.size).toBe('16px');
  });

  test('shrinks a diagram to a page narrower than it, without scrolling sideways', async ({ page }) => {
    await openExample(page, 'flowchart');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.setViewportSize({ width: 360, height: 800 });

    const { drawing, figure } = await widths(page);
    expect(drawing).toBeLessThanOrEqual(figure + 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });

  test('reads a packet field from its first bit to its last', async ({ page }) => {
    await openExample(page, 'packet');
    // Folded into Mermaid's rows of 32 bits, so a field pans by where its row
    // draws it.
    const json = await page.locator('svg[maidr]').first().getAttribute('maidr');
    const maidr = JSON.parse(json ?? '{}') as { subplots: { layers: { data: { wrap?: number } }[] }[][] };
    expect(maidr.subplots[0][0].layers[0].data.wrap).toBe(32);

    const source = await press(page, 'ArrowRight');
    expect(source).toContain('Source port, Bit is 0 through 15');
    expect(source).toContain('Length is 16 bits');
    expect(await press(page, 'ArrowRight')).toContain('Bit is 16 through 31');

    await page.keyboard.press('d');
    await expect(page.getByRole('dialog')).toContainText('Spans: 0 to 95');
  });

  test('introduces a packet diagram as a packet diagram, not a gantt chart', async ({ page }) => {
    await openExample(page, 'packet');
    await expect(page.locator(FOCUS_TARGET).first()).toHaveAttribute('aria-label', 'UDP packet, Packet Diagram');
    await press(page, 'ArrowRight');

    await page.keyboard.press('d');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Chart Type: Packet Diagram');
    await expect(dialog).not.toContainText(/gantt/i);
  });

  test('walks a user journey from one section into the next', async ({ page }) => {
    await openExample(page, 'journey');
    for (let task = 0; task < 3; task++) {
      await press(page, 'ArrowRight');
    }
    const next = await press(page, 'ArrowRight');
    expect(next).toContain('Go downstairs (Me)');
    expect(next).toContain('Section is Go home');
    expect(await press(page, 'ArrowRight')).toContain('Sit down (Me)');

    // One row of five cells, the 5s at either end as high as each other.
    await page.keyboard.press('b');
    const braille = page.locator(BRAILLE).first();
    await expect.poll(async () => (await braille.inputValue()).trim()).toMatch(BRAILLE_CELLS);
    const cells = [...(await braille.inputValue()).trim()];
    expect(cells).toHaveLength(5);
    expect(cells[4]).toBe(cells[0]);
  });

  test('outlines the sankey flow a step announces as the one it went along', async ({ page }) => {
    await openExample(page, 'sankey');
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowDown')).toContain('Node is Wind');
    const arrived = await press(page, 'ArrowRight');
    expect(arrived).toContain('Node is Electricity');
    expect(arrived).toContain('Along is Wind to Electricity');

    // Mermaid draws a link per flow, in the order the flows are written.
    const wind = page.locator('svg[maidr] g.link:not([data-maidr-owned]) path').nth(1);
    const lit = page.locator(`${HIGHLIGHT} path`).first();
    expect(await lit.getAttribute('d')).toBe(await wind.getAttribute('d'));
  });

  test('outlines a journey task by the face drawn at its score', async ({ page }) => {
    await openExample(page, 'journey');
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowRight')).toContain('Task is Go upstairs (Me)');

    const highlight = page.locator(HIGHLIGHT).first();
    await expect(highlight).toHaveClass(/face/);
    const face = page.locator('svg[maidr] circle.face:not([data-maidr-owned])').nth(1);
    expect(await highlight.getAttribute('cx')).toBe(await face.getAttribute('cx'));
    expect(await highlight.getAttribute('cy')).toBe(await face.getAttribute('cy'));
  });

  test('names a quadrant chart by its title, and its quadrants in the subtitle', async ({ page }) => {
    await openExample(page, 'quadrant');
    await press(page, 'ArrowRight');

    await page.keyboard.press('l');
    expect(await press(page, 't')).toContain('Title is Reach and engagement of campaigns');
    await page.keyboard.press('l');
    expect(await press(page, 's')).toContain('Subtitle is Quadrants: We should expand (top right)');
  });

  test('outlines the quadrant point it announces, in every navigation mode', async ({ page }) => {
    await openExample(page, 'quadrant');
    // The campaign whose drawn circle the highlight sits on.
    const outlined = (): Promise<string> => page.evaluate(() => {
      const highlight = document.querySelector('circle[id^="maidr-highlight"]');
      const mark = [...document.querySelectorAll('#diagram-svg-1 g.data-point:not([data-maidr-owned])')]
        .find(point => ['cx', 'cy'].every(at =>
          point.querySelector('circle')?.getAttribute(at) === highlight?.getAttribute(at)));
      return mark?.querySelector('text')?.textContent ?? '';
    });

    expect(await press(page, 'ArrowRight')).toContain('Name is Campaign A');
    await expect.poll(outlined).toBe('Campaign A');

    // Grid navigation, the quadrants: D alone in the bottom right, C in the top right.
    await page.keyboard.press('Alt+Shift+ArrowUp');
    expect(await press(page, 'ArrowRight')).toContain('point is: (0.78, 0.34)');
    await expect.poll(outlined).toBe('Campaign D');
    expect(await press(page, 'ArrowUp')).toContain('point is: (0.57, 0.69)');
    await expect.poll(outlined).toBe('Campaign C');
    expect(await press(page, 'Enter')).toContain('Name is Campaign C');
    await expect.poll(outlined).toBe('Campaign C');
    await page.keyboard.press('Escape');

    // Point navigation.
    await page.keyboard.press('Alt+Shift+ArrowUp');
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft']) {
      const name = /Name is (Campaign \w)/.exec(await press(page, key))?.[1];
      expect(name).toBeDefined();
      await expect.poll(outlined).toBe(name);
    }
  });

  test('outlines a treemap\'s section or item by its rectangle, not its label', async ({ page }) => {
    await openExample(page, 'treemap');
    const highlight = page.locator(HIGHLIGHT).first();
    const outlined = (): Promise<{ tag: string; group: string }> => highlight.evaluate(element => ({
      tag: element.tagName.toLowerCase(),
      group: element.parentElement?.querySelector('text')?.textContent ?? '',
    }));

    expect(await press(page, 'ArrowRight')).toContain('Item is Products');
    await expect(highlight).toHaveClass(/treemapSection\b/);
    expect(await outlined()).toEqual({ tag: 'rect', group: 'Products' });
    expect(await press(page, 'ArrowDown')).toContain('Item is Laptops');
    await expect(highlight).toHaveClass(/treemapLeaf/);
    expect(await outlined()).toEqual({ tag: 'rect', group: 'Laptops' });
  });

  test('names a kanban column as a column and a card as a card', async ({ page }) => {
    await openExample(page, 'kanban');
    const column = await press(page, 'ArrowRight');
    expect(column).toContain('Column is To do');
    expect(await press(page, 'ArrowDown')).toContain('Card is Write the docs');
  });

  test('names each level of a hierarchy for what it is', async ({ page }) => {
    await openExample(page, 'ishikawa');
    expect(await press(page, 'ArrowRight')).toContain('Effect is Blurry photo');
    expect(await press(page, 'ArrowDown')).toContain('Category is ');
    expect(await press(page, 'ArrowDown')).toContain('Cause is ');

    await openExample(page, 'timeline');
    expect(await press(page, 'ArrowRight')).toContain('Section is Guidelines');
    expect(await press(page, 'ArrowDown')).toContain('Period is 1999');
    expect(await press(page, 'ArrowDown')).toContain('Event is WCAG 1.0');
  });

  test('says which section a timeline period is in, after the Level rotor crosses into the next', async ({ page }) => {
    await openExample(page, 'timeline');
    await press(page, 'ArrowRight');
    expect(await press(page, 'ArrowDown')).toContain('Period is 1999, Path is Guidelines');
    await press(page, 'Control+ArrowRight');
    await page.keyboard.press('Alt+Shift+ArrowDown');
    await expect(page.locator('#maidr-rotor-area')).toContainText('Level');

    expect(await press(page, 'ArrowRight')).toContain('Path is Standards');
  });

  test('reads the Cynefin framework text, and reaches the Confusion it draws', async ({ page }) => {
    await openExample(page, 'cynefin');
    expect(await press(page, 'ArrowRight')).toContain('Domain is Complex (Probe → Sense → Respond, Emergent Practices)');
    for (let domain = 0; domain < 3; domain++) {
      await press(page, 'ArrowRight');
    }
    expect(await press(page, 'ArrowRight')).toContain('Domain is Confusion (Disorder)');
  });

  test('outlines the domain a Cynefin transition is on, as the domains layer does', async ({ page }) => {
    const unresolved: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('resolved to no element')) {
        unresolved.push(message.text());
      }
    });
    await openExample(page, 'cynefin');
    await press(page, 'ArrowRight');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('Complex');

    expect(await press(page, 'PageUp')).toContain('Transitions');
    expect(await press(page, 'ArrowRight')).toContain('Domain is Chaotic');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('Chaotic');
    expect(await press(page, 'ArrowRight')).toContain('Domain is Complex');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('Complex');
    expect(unresolved).toEqual([]);
  });

  test('outlines a Wardley map\'s component in both its layers', async ({ page }) => {
    const unresolved: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('resolved to no element')) {
        unresolved.push(message.text());
      }
    });
    await openExample(page, 'wardley');
    // Columns run by evolution, so the first is Kettle's, drawn as a dot.
    expect(await press(page, 'ArrowRight')).toContain('Name is Kettle');
    const dot = page.locator(`circle${HIGHLIGHT}`);
    await expect(dot).toHaveCount(1);
    const kettle = page.locator('svg[maidr] g.wardley-node:not([data-maidr-owned])', { hasText: 'Kettle' }).locator('circle').first();
    expect(await dot.getAttribute('cx')).toBe(await kettle.getAttribute('cx'));

    expect(await press(page, 'PageUp')).toContain('Value chain');
    expect(await press(page, 'ArrowRight')).toContain('Component is Business');
    await expect(page.locator(HIGHLIGHT).first()).toContainText('Business');
    expect(unresolved).toEqual([]);
  });

  test('says where the reader is among what the arrows walk, not where the sound is panned', async ({ page }) => {
    await openExample(page, 'gantt');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    // The pan follows the time axis: "column 1.1818181818181819 of 2".
    expect(await press(page, 'p')).toBe('Position is column 2 of 2, row 1 of 3');

    await openExample(page, 'kanban');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowRight');
    await press(page, 'ArrowDown');
    // The only card in its column, which the whole depth made "column 3 of 4".
    expect(await press(page, 'p')).toBe('Level 2 of 2, Position is 1 of 1 in In progress');
  });

  test('says an axis label a diagram does not have is not available', async ({ page }) => {
    await openExample(page, 'mindmap');
    await press(page, 'ArrowRight');
    await page.keyboard.press('l');
    expect(await press(page, 'x')).toContain('X label is Topic');
    await page.keyboard.press('l');
    // A tree has no y axis; "Y label is Y" named a placeholder as a label.
    expect(await press(page, 'y')).toContain('Y label is not available');
  });

  test('names a timeline by the title it declares', async ({ page }) => {
    await openExample(page, 'timeline');

    await expect(page.locator(FOCUS_TARGET).first()).toHaveAttribute('aria-label', /^Web accessibility milestones, /);
    await page.keyboard.press('l');
    expect(await press(page, 't')).toContain('Title is Web accessibility milestones');
  });
});
