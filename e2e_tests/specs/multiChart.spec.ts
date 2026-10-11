import type { Page } from '@playwright/test';
import type { ChartReading, Ownership } from '../page-objects/plots/multiChart-page';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { CHART_ARTICLE, MultiChartPage } from '../page-objects/plots/multiChart-page';

/**
 * A chart reads the same with other charts on its page as it does alone.
 *
 * MAIDR resolves a chart's selectors, counts its panels and reads its
 * background when the reader moves into it. Each of those used to look across
 * the whole page, so on a page of several charts they found the first chart's
 * elements: one output shown twice outlined its marks in the first copy, two
 * Plotly charts -- whose selectors name no chart at all -- both lit up, and
 * a py-maidr figure on a Quarto page measured its outline against the
 * background of the chart above it. Each fixture under
 * `e2e_tests/fixtures/multi-chart/` is such a page; the README beside them
 * says how each was made.
 *
 * For every chart on every page: read it with company and read it alone, the
 * others taken off the page, and the two readings match; while it is read,
 * nothing MAIDR creates or outlines is in another chart; and once the reader
 * moves on, nothing of it is left behind.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plotlyBundle = path.join(repoRoot, 'node_modules/plotly.js-dist-min/plotly.min.js');

/** Three steps right: enough to move, and to move again. */
const RIGHT = ['ArrowRight', 'ArrowRight', 'ArrowRight'];

interface Fixture {
  /** The page, without `.html`. */
  readonly name: string;
  /** What a chart's region is on it: MAIDR's article, or Plotly's graph div. */
  readonly region: string;
  /** The keys each chart is read with, one list per chart in page order. */
  readonly keys: ReadonlyArray<readonly string[]>;
  /** Errors the page's own scripts raise, which are not MAIDR's. */
  readonly pageErrors?: readonly RegExp[];
}

const FIXTURES: readonly Fixture[] = [
  // One output shown twice: the same ids, the same selectors.
  { name: 'r-ggplot2-dodged-twice', region: CHART_ARTICLE, keys: [RIGHT, RIGHT] },
  { name: 'py-seaborn-dodged-twice', region: CHART_ARTICLE, keys: [RIGHT, RIGHT] },
  // Plotly's selectors name no chart, and a gauge is drawn in a layer
  // outside the chart's article.
  { name: 'plotly-scatters', region: '.js-plotly-plot', keys: [RIGHT, RIGHT] },
  { name: 'plotly-gauges', region: '.js-plotly-plot', keys: [RIGHT, RIGHT] },
  // A real Quarto page: a chart on a dark background, one with two layers,
  // and a figure of two panels whose axes are transparent, so its outline is
  // measured against the figure's background.
  {
    name: 'py-quarto-inline',
    region: CHART_ARTICLE,
    keys: [RIGHT, ['ArrowRight', 'PageUp', 'ArrowRight'], ['ArrowDown', 'ArrowDown', 'ArrowUp']],
    // Quarto's own scripts, without the require.js the page loads from a CDN
    // and the libraries it keeps beside it, which the fixture does not carry.
    pageErrors: [/^define is not defined$/, /^window\.AnchorJS is not a constructor$/],
  },
];

/** Serves the Plotly CDN script from the local devDependency. */
async function routePlotly(page: Page): Promise<void> {
  await page.route('https://cdn.plot.ly/plotly-*.min.js', async (route) => {
    await route.fulfill({
      body: fs.readFileSync(plotlyBundle),
      contentType: 'text/javascript',
    });
  });
  // The jQuery and require.js the Quarto page loads from a CDN: the spec
  // needs no network, and MAIDR needs neither.
  await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
}

/**
 * Checks two readings of a chart agree: the same text, the same number of
 * marks outlined, the same panel outlines, and the outline in the same place.
 * @param beside - The chart read with the others on the page
 * @param alone - The chart read alone
 */
function expectSameReadings(beside: ChartReading[], alone: ChartReading[]): void {
  const withoutBox = (reading: ChartReading): Omit<ChartReading, 'box'> => ({
    text: reading.text,
    outlined: reading.outlined,
    panelStrokes: reading.panelStrokes,
  });
  expect(beside.map(withoutBox)).toEqual(alone.map(withoutBox));
  beside.forEach((reading, step) => {
    const expected = alone[step].box;
    expect(reading.box === null, `step ${step + 1}: outlined in one reading only`).toBe(expected === null);
    reading.box?.forEach((value, index) => {
      expect(value, `step ${step + 1}: the outline is somewhere else`).toBeCloseTo(expected?.[index] ?? Number.NaN, 2);
    });
  });
}

/** One chart read through its keys, and where MAIDR's elements were after each. */
interface Session {
  readonly readings: ChartReading[];
  readonly ownership: Ownership[];
}

/**
 * Opens a fixture and reads one of its charts.
 * @param charts - The page object
 * @param fixture - The page
 * @param chart - The chart to read
 * @param alone - Whether to take the other charts off the page first
 * @returns What the chart showed, step by step
 */
async function read(
  charts: MultiChartPage,
  fixture: Fixture,
  chart: number,
  alone: boolean,
): Promise<Session> {
  await charts.open(fixture.name, fixture.keys.length);
  if (alone) {
    await charts.isolate(chart);
  }
  await charts.enter(chart);
  const readings: ChartReading[] = [];
  const ownership: Ownership[] = [];
  for (const key of fixture.keys[chart]) {
    readings.push(await charts.step(chart, key));
    ownership.push(await charts.ownership());
  }
  return { readings, ownership };
}

test.describe('several charts on one page', () => {
  for (const fixture of FIXTURES) {
    for (let chart = 0; chart < fixture.keys.length; chart++) {
      test(`${fixture.name}: chart ${chart + 1} reads the same beside the others as alone`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const resolvedOutside: string[] = [];
        page.on('console', (message) => {
          if (message.text().includes('matches nothing inside its chart')) {
            resolvedOutside.push(message.text());
          }
        });
        await routePlotly(page);
        const charts = new MultiChartPage(page, fixture.region);

        const beside = await read(charts, fixture, chart, false);
        const others = fixture.keys.map((_, index) => index).filter(index => index !== chart);
        await charts.enter(others[0]);
        await expect.poll(async () => {
          const { owned, outlinedPanels } = await charts.ownership();
          return [owned[chart], outlinedPanels[chart]];
        }, { message: `chart ${chart + 1} kept MAIDR's elements or an outline once the reader moved to chart ${others[0] + 1}` })
          .toEqual([0, 0]);
        const alone = await read(charts, fixture, chart, true);

        expect(errors.filter(error => !fixture.pageErrors?.some(known => known.test(error)))).toEqual([]);
        expect(resolvedOutside, 'a selector was resolved outside its chart').toEqual([]);
        expect(
          beside.readings.some(reading => reading.outlined > 0 || reading.panelStrokes.length > 0),
          'nothing was outlined, so there is nothing to compare',
        ).toBe(true);
        expectSameReadings(beside.readings, alone.readings);
        for (const step of beside.ownership) {
          expect(step.ownedElsewhere, 'MAIDR made elements outside every chart').toBe(0);
          for (const other of others) {
            expect(step.owned[other], `chart ${other + 1} holds elements made for chart ${chart + 1}`).toBe(0);
            expect(step.outlinedPanels[other], `chart ${other + 1} has a panel outlined`).toBe(0);
          }
        }
      });
    }
  }
});
