import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The MUI X Charts example app, driven the way a reader drives it.
 *
 * The page is the Vite build of `examples/mui-x-charts` -- a production,
 * minified bundle, so the chart components' names are gone and the adapter
 * has to recognise each chart from the classes MUI stamps on its SVG. Build it
 * first with `npm run build:mui-x-charts-example`.
 *
 * Every example is checked for the two things a reader loses silently when
 * the adapter and MUI's markup drift apart: the announcement, and the outline
 * on the mark being read. The console is watched as well, since MAIDR says
 * there -- and nowhere else -- when a layer's selectors resolve to nothing.
 */

const PAGE = 'examples/mui-x-charts/dist/index.html';
const TEXT = '#maidr-text-container p';
const HIGHLIGHT = '[id^="maidr-highlight"]';

interface Case {
  /** The example's nav button. */
  button: string;
  /** The MAIDR id the example gives its chart. */
  id: string;
  /** What the first and second Right arrow announce. */
  first: RegExp;
  second: RegExp;
}

const CASES: Case[] = [
  { button: 'Bar Chart', id: 'mui-bar', first: /Quarter is Q1, Revenue \(\$\) is 4200/, second: /Q2, Revenue \(\$\) is 5800/ },
  { button: 'Grouped Bar', id: 'mui-grouped', first: /Quarter is Q1, Units is 42.*North/, second: /Q2, Units is 58.*North/ },
  { button: 'Stacked Bar', id: 'mui-stacked', first: /Year is 2021, TWh is 120.*Solar/, second: /2022, TWh is 135.*Solar/ },
  { button: 'Horizontal Bar', id: 'mui-horizontal', first: /Fruit is Apple, Votes is 34/, second: /Banana, Votes is 21/ },
  { button: 'Line Chart', id: 'mui-line', first: /Month is Jan, Temperature \(°C\) is 5.*Seattle/, second: /Feb, Temperature \(°C\) is 7/ },
  { button: 'Step Line', id: 'mui-step', first: /Year is 2020, Price \(\$\) is 8/, second: /Year is 2021, Price \(\$\) is 8/ },
  { button: 'Area Chart', id: 'mui-area', first: /Day is 1, Visitors is 320/, second: /Day is 2, Visitors is 410/ },
  { button: 'Stacked Area', id: 'mui-stacked-area', first: /Week is 1, Sessions is 100.*Search/, second: /Week is 2, Sessions is 120/ },
  { button: 'Scatter Chart', id: 'mui-scatter', first: /Height \(cm\) is 152, Weight \(kg\) is 48/, second: /Height \(cm\) is 160, Weight \(kg\) is 55/ },
  { button: 'Pie Chart', id: 'mui-pie', first: /Category is Chrome, Value is 64/, second: /Category is Safari, Value is 19/ },
  { button: 'Doughnut Chart', id: 'mui-doughnut', first: /Category is Sleep, Value is 8/, second: /Category is Work, Value is 9/ },
];

/** Opens one example and focuses its MAIDR plot. */
async function open(page: Page, example: Case): Promise<void> {
  await page.goto(PAGE);
  await page.getByRole('button', { name: example.button, exact: true }).click();
  const plot = page.locator(`#maidr-figure-${example.id} > [tabindex="0"]`);
  await plot.waitFor();
  await plot.focus();
}

async function announcement(page: Page): Promise<string> {
  return (await page.locator(TEXT).first().textContent()) ?? '';
}

test.describe('MUI X Charts adapter', () => {
  for (const example of CASES) {
    test(`${example.button}: announces each point and outlines one mark`, async ({ page }) => {
      const warnings: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'warning' || message.type() === 'error')
          warnings.push(message.text());
      });

      await open(page, example);

      await page.keyboard.press('ArrowRight');
      await expect.poll(() => announcement(page)).toMatch(example.first);
      await expect(page.locator(HIGHLIGHT)).toHaveCount(1);

      await page.keyboard.press('ArrowRight');
      await expect.poll(() => announcement(page)).toMatch(example.second);
      await expect(page.locator(HIGHLIGHT)).toHaveCount(1);

      expect(warnings.filter(text => text.includes('[MAIDR]'))).toEqual([]);
      // MUI X's own keyboard navigation is off, so MAIDR's plot is the
      // chart's only tab stop.
      await expect(page.locator(`#maidr-figure-${example.id} [tabindex="0"]`)).toHaveCount(1);
    });
  }

  test('Step Line: outlines each sample, not a corner of the staircase', async ({ page }) => {
    await open(page, CASES.find(example => example.id === 'mui-step')!);
    const xs: number[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(page.locator(HIGHLIGHT)).toHaveCount(1);
      xs.push(Number(await page.locator(HIGHLIGHT).getAttribute('cx')));
    }
    // Evenly spaced samples on a point axis: equal steps between outlines.
    expect(xs[1] - xs[0]).toBeGreaterThan(0);
    expect(Math.abs((xs[2] - xs[1]) - (xs[1] - xs[0]))).toBeLessThan(1);
  });

  test('Scatter Chart: the outline follows the marker being read', async ({ page }) => {
    // MUI draws each marker at the origin and translates it into place. Read
    // without the translate, every marker sat at (0, 0) and the first point
    // outlined all seven while every other point outlined none. MAIDR's own
    // hidden clones of the markers carry `data-maidr-owned` and are skipped.
    await open(page, CASES.find(example => example.id === 'mui-scatter')!);
    const markers = page.locator('#maidr-figure-mui-scatter .MuiScatterChart-marker:not([data-maidr-owned])');

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(page.locator(HIGHLIGHT)).toHaveCount(1);
      await expect(page.locator(HIGHLIGHT)).toHaveAttribute(
        'transform',
        (await markers.nth(i).getAttribute('transform')) ?? '',
      );
    }
  });
});
