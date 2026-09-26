import type { Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { announcementsSince, installAnnouncementRecorder, waitForAnnouncementAfter } from '../utils/announcements';
import { normalizeText } from '../utils/text';

/**
 * The Nivo adapter against the example app, in a real browser.
 *
 * The adapter points its highlight at marks Nivo draws after mount (a
 * `Responsive*` chart measures first, and react-spring animates in), so the
 * claim worth checking is the one jsdom cannot make: that on a laid-out page
 * an arrow key announces a datum and outlines the very mark Nivo drew for it.
 * Each step compares the outline MAIDR draws with the box of the Nivo mark
 * named by its own `data-testid`.
 *
 * The example is a Vite single-file build of `examples/nivo/`, which bundles
 * the adapter from `src/` together with React and Nivo. It is not part of
 * `npm run build`; build it with `npm run build:nivo-example` first.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = path.join(ROOT, 'examples', 'nivo', 'dist', 'index.html');

/**
 * The Nivo mark an outline must sit on: its `data-testid`, or — for marks
 * Nivo stamps with none — a CSS selector and which of its matches, counting
 * the chart's own elements only.
 */
type Mark = string | { selector: string; nth?: number };

/** One arrow key and what it should produce. */
interface Step {
  key: string;
  /** Text the announcement must contain. */
  says: string;
  /** The Nivo mark the outline must sit on; none for a section with no mark. */
  mark?: Mark;
}

interface Case {
  /** The example's button in the app's nav. */
  example: string;
  /** Id the example gives `<MaidrNivo>`. */
  id: string;
  steps: Step[];
}

const CASES: Case[] = [
  {
    example: 'Bar Chart',
    id: 'nivo-bar',
    steps: [
      { key: 'ArrowRight', says: 'Quarter is Q1, Revenue ($) is 4200', mark: 'bar.item.revenue.0' },
      { key: 'ArrowRight', says: 'Quarter is Q2, Revenue ($) is 5800', mark: 'bar.item.revenue.1' },
      { key: 'ArrowLeft', says: 'Quarter is Q1, Revenue ($) is 4200', mark: 'bar.item.revenue.0' },
    ],
  },
  {
    example: 'Horizontal Bar',
    id: 'nivo-horizontal',
    steps: [
      { key: 'ArrowRight', says: 'Language is JavaScript, Respondents (%) is 62', mark: 'bar.item.developers.0' },
      { key: 'ArrowRight', says: 'Language is Python, Respondents (%) is 51', mark: 'bar.item.developers.1' },
    ],
  },
  {
    // Nivo draws the first key (web) at the top of each band, so the series
    // Up starts from is the last key, and Up moves up the page.
    example: 'Horizontal Bar',
    id: 'nivo-horizontal-grouped',
    steps: [
      { key: 'ArrowRight', says: 'Quarter is Q1, Sign-ups is 80', mark: 'bar.item.mobile.0' },
      { key: 'ArrowUp', says: 'Quarter is Q1, Sign-ups is 120', mark: 'bar.item.web.0' },
    ],
  },
  {
    example: 'Stacked Bar',
    id: 'nivo-stacked',
    steps: [
      { key: 'ArrowRight', says: 'Quarter is Q1, Revenue ($) is 2400, Level is Product A', mark: 'bar.item.Product A.0' },
      { key: 'ArrowUp', says: 'Quarter is Q1, Revenue ($) is 1800, Level is Product B', mark: 'bar.item.Product B.0' },
      { key: 'ArrowRight', says: 'Quarter is Q2, Revenue ($) is 2700, Level is Product B', mark: 'bar.item.Product B.1' },
    ],
  },
  {
    example: 'Line Chart',
    id: 'nivo-line',
    steps: [
      { key: 'ArrowRight', says: 'Month is Jan, Users (thousands) is 120, Group is Web', mark: 'line.point.Web.0' },
      { key: 'ArrowRight', says: 'Month is Feb, Users (thousands) is 180, Group is Web', mark: 'line.point.Web.1' },
      { key: 'ArrowDown', says: 'Month is Feb, Users (thousands) is 110, Group is Mobile', mark: 'line.point.Mobile.1' },
    ],
  },
  {
    example: 'Pie Chart',
    id: 'nivo-pie',
    steps: [
      { key: 'ArrowRight', says: 'Category is Chrome, Value is 64', mark: 'arc.Chrome' },
      { key: 'ArrowRight', says: 'Category is Safari, Value is 19', mark: 'arc.Safari' },
      { key: 'ArrowLeft', says: 'Category is Chrome, Value is 64', mark: 'arc.Chrome' },
    ],
  },
  {
    // The legend draws its symbols as circles; the highlight must still land
    // on the data nodes.
    example: 'Scatter Plot',
    id: 'nivo-scatter',
    steps: [
      { key: 'ArrowRight', says: 'Study hours is 1.2', mark: { selector: 'svg > g > circle', nth: 0 } },
      { key: 'ArrowRight', says: 'Study hours is 2.4', mark: { selector: 'svg > g > circle', nth: 1 } },
    ],
  },
  {
    // Drawn as a vertical box rotated by -90°. Q1 and Q3 outline the box as
    // drawn, not its unrotated edges.
    example: 'Box Plot',
    id: 'nivo-boxplot-horizontal',
    steps: [
      { key: 'ArrowRight', says: 'Departure is Morning, no Lower outlier(s)' },
      // Nivo's default whiskers end at the 10th and 90th percentiles, and are
      // named so rather than as a minimum and maximum.
      { key: 'ArrowRight', says: '10th percentile', mark: { selector: '[data-key="boxplot.0.0"] > line', nth: 2 } },
      { key: 'ArrowRight', says: '25%', mark: { selector: '[data-key="boxplot.0.0"] > rect' } },
      { key: 'ArrowRight', says: '50%', mark: { selector: '[data-key="boxplot.0.0"] > line', nth: 0 } },
      { key: 'ArrowRight', says: '75%', mark: { selector: '[data-key="boxplot.0.0"] > rect' } },
      { key: 'ArrowRight', says: '90th percentile', mark: { selector: '[data-key="boxplot.0.0"] > line', nth: 4 } },
    ],
  },
  {
    example: 'Heatmap',
    id: 'nivo-heatmap',
    steps: [
      // The core starts a heat map at its bottom-left cell: Nivo draws the
      // last row (Fri) at the bottom.
      { key: 'ArrowRight', says: 'Time of day is 9am, Weekday is Fri, Level is 9', mark: 'cell.Fri.9am' },
      { key: 'ArrowUp', says: 'Time of day is 9am, Weekday is Thu, Level is 14', mark: 'cell.Thu.9am' },
    ],
  },
];

interface Box { x: number; y: number; width: number; height: number }

/**
 * Where MAIDR's visible outline is, and where the named Nivo mark is.
 * @param page - The Playwright page
 * @param id - The chart's id, to scope the mark lookup to its figure
 * @param mark - The mark
 * @returns The two boxes; either is null when there is nothing to measure
 */
async function measure(page: Page, id: string, mark: Mark): Promise<{ outline: Box | null; target: Box | null }> {
  const { selector, nth } = typeof mark === 'string'
    ? { selector: '[data-testid]', nth: undefined }
    : { selector: mark.selector, nth: mark.nth ?? 0 };
  const testId = typeof mark === 'string' ? mark : null;
  return page.evaluate(({ id, selector, nth, testId }) => {
    const figure = document.getElementById(`maidr-figure-${id}`);
    const box = (element: Element | null | undefined): Box | null => {
      if (!element)
        return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const outline = Array.from(figure?.querySelectorAll('svg [data-maidr-owned]') ?? [])
      .find(e => getComputedStyle(e).visibility !== 'hidden' && e.getAttribute('visibility') !== 'hidden');
    const own = Array.from(figure?.querySelectorAll(selector) ?? [])
      .filter(e => e.closest('[data-maidr-owned]') === null);
    const target = testId === null
      ? own[nth ?? 0]
      : own.find(e => e.getAttribute('data-testid') === testId);
    return { outline: box(outline), target: box(target) };
  }, { id, selector, nth, testId });
}

/**
 * How far MAIDR's outline is from a mark, in the largest of its four
 * coordinates.
 * @param page - The Playwright page
 * @param id - The chart's id
 * @param mark - The mark
 * @returns `'on the mark'`, or what is wrong
 */
async function outlineOn(page: Page, id: string, mark: Mark): Promise<string> {
  const { outline, target } = await measure(page, id, mark);
  if (!outline || !target)
    return `outline ${outline ? 'present' : 'missing'}, mark ${target ? 'present' : 'missing'}`;
  const off = Math.max(
    Math.abs(outline.x - target.x),
    Math.abs(outline.y - target.y),
    Math.abs(outline.width - target.width),
    Math.abs(outline.height - target.height),
  );
  return off <= 2 ? 'on the mark' : `off the mark by ${off.toFixed(1)}px`;
}

/**
 * Opens an example, waits for the chart to settle, and focuses its plot.
 * @param page - The Playwright page
 * @param example - The example's button
 * @param id - The chart's id
 * @param mark - A mark to wait for
 */
async function openAndFocus(page: Page, example: string, id: string, mark: Mark): Promise<void> {
  await page.goto(`file://${EXAMPLE}`);
  await page.getByRole('button', { name: example, exact: true }).click();

  // Nivo draws its marks after mount; wait for the one the first step names.
  await expect.poll(async () => (await measure(page, id, mark)).target !== null).toBe(true);
  await waitForSettled(page, id, mark);

  const figure = page.locator(`#maidr-figure-${id}`);
  const plot = figure.locator('[tabindex="0"]').first();
  const mark0 = await installAnnouncementRecorder(page);
  await plot.focus();
  await waitForAnnouncementAfter(page, mark0);
}

/**
 * Waits for Nivo's entry animation to finish.
 *
 * MAIDR copies the highlighted marks when the plot takes focus, so a chart
 * focused while react-spring is still growing its marks is outlined at the
 * size they had at that moment. That is true of any animated chart, not a
 * property of this adapter; a reader tabbing in within the first second would
 * see it too. The test waits the animation out so it measures the adapter.
 * @param page - The Playwright page
 * @param id - The chart's id
 * @param mark - A mark to watch
 */
async function waitForSettled(page: Page, id: string, mark: Mark): Promise<void> {
  let last = '';
  await expect.poll(async () => {
    const { target } = await measure(page, id, mark);
    const now = JSON.stringify(target);
    const settled = target !== null && now === last;
    last = now;
    return settled;
  }, { intervals: [200], message: `${JSON.stringify(mark)} stops moving` }).toBe(true);
}

test.describe('Nivo adapter example', () => {
  test.beforeAll(() => {
    if (!existsSync(EXAMPLE))
      throw new Error(`${EXAMPLE} is missing; run "npm run build:nivo-example" first.`);
  });

  for (const { example, id, steps } of CASES) {
    test(`${example} (${id}): arrow keys announce the datum and outline its Nivo mark`, async ({ page }) => {
      const first = steps.find(step => step.mark !== undefined)?.mark;
      if (first === undefined)
        throw new Error(`${id} names no mark to wait for`);
      await openAndFocus(page, example, id, first);

      for (const step of steps) {
        const mark = await installAnnouncementRecorder(page);
        await page.keyboard.press(step.key);
        expect(await waitForAnnouncementAfter(page, mark), `${step.key} announced nothing`).toBe(true);

        const said = (await announcementsSince(page, mark)).map(normalizeText).join(' ');
        expect(said).toContain(step.says);

        const { mark: target } = step;
        if (target === undefined)
          continue;
        await expect.poll(() => outlineOn(page, id, target), {
          message: `${step.key} outlines ${JSON.stringify(target)}`,
        }).toBe('on the mark');
      }
    });
  }

  test('a resize while the chart is focused keeps the outline on the mark', async ({ page }) => {
    const id = 'nivo-bar';
    await page.setViewportSize({ width: 1280, height: 800 });
    await openAndFocus(page, 'Bar Chart', id, 'bar.item.revenue.0');

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => outlineOn(page, id, 'bar.item.revenue.0')).toBe('on the mark');
    const before = (await measure(page, id, 'bar.item.revenue.0')).target;

    // The chart is `min(700px, 80vw)` wide, so this narrows it and Nivo
    // moves every bar in place.
    await page.setViewportSize({ width: 600, height: 800 });
    await expect.poll(async () => (await measure(page, id, 'bar.item.revenue.0')).target?.width)
      .not
      .toBe(before?.width);
    await waitForSettled(page, id, 'bar.item.revenue.0');

    // The outline showing follows the bar, and so does the next one drawn.
    await expect.poll(() => outlineOn(page, id, 'bar.item.revenue.0')).toBe('on the mark');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => outlineOn(page, id, 'bar.item.revenue.1')).toBe('on the mark');
  });
});
