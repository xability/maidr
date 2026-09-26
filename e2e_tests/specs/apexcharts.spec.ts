import type { Maidr } from '../../src/type/grammar';
import type { ApexChartsReading } from '../page-objects/plots/apexcharts-page';
import { expect, test } from '@playwright/test';
import { ApexChartsPage } from '../page-objects/plots/apexcharts-page';
import { extractMaidrData } from '../utils/maidr-data';

/**
 * The ApexCharts adapter's example pages, driven the way a reader drives
 * them: load the page, Tab onto the chart, press arrow keys, and check what is
 * announced, what the braille display shows and what is outlined -- including
 * after ApexCharts redraws the chart underneath the reader.
 */

/**
 * Every braille cell MAIDR can emit lives in the Unicode braille block
 * (U+2800 to U+28FF), so a display carrying anything else is not braille
 * output.
 */
const BRAILLE_CELL = /^[\u2800-\u28FF]+$/;

/** The one layer of a single-layer chart. */
function onlyLayer(maidr: Maidr): Maidr['subplots'][number][number]['layers'][number] {
  expect(maidr.subplots).toHaveLength(1);
  expect(maidr.subplots[0]).toHaveLength(1);
  expect(maidr.subplots[0][0].layers).toHaveLength(1);
  return maidr.subplots[0][0].layers[0];
}

/**
 * The outline a reading found, failing the test when there is none.
 * @param reading - One keypress' reading
 * @returns The first visible highlight's box
 */
function outline(reading: ApexChartsReading): NonNullable<ApexChartsReading['box']> {
  if (!reading.box)
    throw new Error(`Nothing is outlined after "${reading.text}"`);
  return reading.box;
}

/** A box's position, rounded, so two readings can be told apart. */
function where(reading: ApexChartsReading): string | null {
  return reading.box && `${Math.round(reading.box.x)},${Math.round(reading.box.y)}`;
}

test.describe('ApexCharts adapter', () => {
  test.describe('bar chart', () => {
    test('should convert, announce and outline each column', async ({ page }) => {
      const chart = new ApexChartsPage(page);
      await chart.open('apexcharts-bar');

      const layer = onlyLayer(await extractMaidrData(page));
      expect(layer.type).toBe('bar');
      expect(layer.axes?.x?.label).toBe('Month');
      expect(layer.axes?.y?.label).toBe('Cups sold');

      await chart.enter();
      const jan = await chart.step('ArrowRight');
      const feb = await chart.step('ArrowRight');
      const mar = await chart.step('ArrowRight');

      expect(jan.text).toContain('Jan');
      expect(jan.text).toContain('420');
      expect(feb.text).toContain('Feb');
      expect(feb.text).toContain('380');
      // Every step outlines a column, and the taller value gets the taller
      // outline: 510 > 420 > 380.
      for (const reading of [jan, feb, mar])
        expect(reading.outlined).toBeGreaterThan(0);
      expect(outline(mar).height).toBeGreaterThan(outline(jan).height);
      expect(outline(jan).height).toBeGreaterThan(outline(feb).height);
      expect(chart.problems).toEqual([]);
    });

    test('should leave the arrow keys to MAIDR', async ({ page }) => {
      // ApexCharts 7 makes its svg a tabbable role="application" with its own
      // arrow-key navigation unless the page turns it off. The examples do,
      // so the first Tab lands on MAIDR's chart rather than ApexCharts' one.
      const chart = new ApexChartsPage(page);
      await chart.open('apexcharts-bar');

      const svg = page.locator('#chart svg.apexcharts-svg');
      await expect(svg).not.toHaveAttribute('role', 'application');
      await expect(svg).not.toHaveAttribute('tabindex', '0');
      await chart.enter();

      // And the arrow key is MAIDR's: its reading of the first column, with
      // its outline, rather than ApexCharts' tooltip.
      const jan = await chart.step('ArrowRight');

      expect(jan.text).toContain('Month is Jan, Cups sold is 420');
      expect(jan.outlined).toBeGreaterThan(0);
      expect(chart.problems).toEqual([]);
    });

    test('should leave no ApexCharts control between the chart and the rest of the page', async ({ page }) => {
      // The toolbar's buttons would be Tab stops inside MAIDR's chart; the
      // examples hide it.
      const chart = new ApexChartsPage(page);
      await chart.open('apexcharts-line');
      await chart.enter();

      expect(await chart.tabStaysInChart()).toBe(false);
    });

    test('should put the braille display on the columns', async ({ page }) => {
      const chart = new ApexChartsPage(page);
      await chart.open('apexcharts-bar');
      await chart.enter();
      await chart.step('ArrowRight');

      const braille = await chart.readBraille();

      // One cell per month.
      expect(braille).toMatch(BRAILLE_CELL);
      expect(braille).toHaveLength(6);
      expect(chart.problems).toEqual([]);
    });

    test('should keep outlining columns after ApexCharts redraws them narrower', async ({ page }) => {
      // A resize makes ApexCharts throw away every column and draw new ones.
      // A highlight still pointing at the old ones outlines nothing; the
      // binding hands MAIDR the redrawn chart instead.
      const chart = new ApexChartsPage(page);
      await chart.open('apexcharts-bar');
      const wide = await chart.svgWidth();

      await chart.narrowTo(480);
      await chart.enter();
      const jan = await chart.step('ArrowRight');
      const readings = [jan];
      for (let k = 0; k < 5; k++)
        readings.push(await chart.step('ArrowRight'));
      const jun = readings[5];
      const drawn = await chart.boxOf('path.apexcharts-bar-area[j="5"]');

      // The chart follows its container down, rather than keeping its old
      // width or collapsing to ApexCharts' 300-pixel fallback.
      expect(wide).toBeGreaterThan(600);
      expect(await chart.svgWidth()).toBeCloseTo(480, -1);
      expect(jan.text).toContain('Jan');
      expect(jun.text).toContain('Jun');
      // The last column's outline sits on the redrawn column, not where the
      // old, wider chart drew it.
      const box = outline(jun);
      expect(Math.abs(box.x - drawn.x)).toBeLessThan(2);
      expect(Math.abs(box.width - drawn.width)).toBeLessThan(2);
      expect(chart.problems).toEqual([]);
    });

    test('should keep a reader who is in the chart there, on their point, when the data changes', async ({ page }) => {
      // A redraw used to re-mount MAIDR, which took the focus off the chart:
      // the reader's next arrow key went nowhere. It is now an in-place data
      // update, so the next key moves on from where they were.
      const chart = new ApexChartsPage(page);
      await chart.exposeChart();
      await chart.open('apexcharts-bar');
      await chart.enter();
      await chart.step('ArrowRight');
      const feb = await chart.step('ArrowRight');

      await chart.updateEveryValue();
      const stillIn = await chart.isInChart();
      const mar = await chart.step('ArrowRight');

      expect(feb.text).toContain('380');
      expect(stillIn).toBe(true);
      expect(mar.text).toContain('Mar');
      expect(mar.text).toContain('511');
      expect(mar.outlined).toBeGreaterThan(0);
      expect(chart.problems).toEqual([]);
    });

    test('should keep fitting a narrow window after MAIDR takes the chart', async ({ page }) => {
      // MAIDR's tab stop is sized to its content, which would otherwise hold
      // the chart at the width it was first drawn at: a reader who zooms in
      // would have to scroll sideways to see it.
      const chart = new ApexChartsPage(page);
      await page.setViewportSize({ width: 1200, height: 900 });
      await chart.open('apexcharts-bar');

      await page.setViewportSize({ width: 640, height: 900 });

      await expect.poll(() => chart.svgWidth()).toBeLessThan(600);
      await chart.waitUntilDrawn();
      expect(await chart.overflowsSideways()).toBe(false);
      expect(chart.problems).toEqual([]);
    });
  });

  test('pie, radar and funnel: should fit a narrow window and outline the first step', async ({ page }) => {
    // These charts were drawn once at the width they had before MAIDR took
    // them and not again: ApexCharts watches the container's old parent for
    // size changes, so the width the binding gave the container went unseen
    // and the chart ran off the side of the page until the reader Tabbed in
    // -- and the redraw that Tab caused took the first step's outline away.
    await page.setViewportSize({ width: 700, height: 900 });
    for (const example of ['apexcharts-pie', 'apexcharts-radar', 'apexcharts-funnel']) {
      const chart = new ApexChartsPage(page);
      await chart.open(example);

      expect(await chart.overflowsSideways(), example).toBe(false);
      await chart.enter();
      const first = await chart.step('ArrowRight');
      expect(first.outlined, example).toBeGreaterThan(0);
      expect(chart.problems, example).toEqual([]);
      page.removeAllListeners('pageerror');
      page.removeAllListeners('console');
      await page.unrouteAll();
    }
  });

  test('candlestick: should keep the reader on their candle and part when the chart redraws', async ({ page }) => {
    // The candlestick trace navigates by a cursor of its own, which a live
    // update used to reset to the first candle's close: after a plain
    // resize, the reader's next key read from the start of the chart.
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-candlestick');
    await chart.enter();
    for (let k = 0; k < 3; k++)
      await chart.step('ArrowRight');
    const open = await chart.step('ArrowUp');

    await chart.narrowTo(560);
    const stillIn = await chart.isInChart();
    const next = await chart.step('ArrowRight');

    expect(open.text).toContain('Trading day is Mar 5, open Price ($) is 53.6');
    expect(stillIn).toBe(true);
    expect(next.text).toContain('Trading day is Mar 6, open');
    expect(next.outlined).toBeGreaterThan(0);
    expect(chart.problems).toEqual([]);
  });

  test('line chart: should keep the reader in the chart when the data changes', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.exposeChart();
    await chart.open('apexcharts-line');
    await chart.enter();
    await chart.step('ArrowRight');

    await chart.updateEveryValue();
    const feb = await chart.step('ArrowRight');

    expect(await chart.isInChart()).toBe(true);
    expect(feb.text).toContain('Feb');
    expect(feb.text).toContain('-1.4');
    expect(feb.outlined).toBeGreaterThan(0);
    expect(chart.problems).toEqual([]);
  });

  test('line chart: should put the braille display on the line', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-line');
    await chart.enter();
    await chart.step('ArrowRight');

    const braille = await chart.readBraille();

    // One cell per month.
    expect(braille).toMatch(BRAILLE_CELL);
    expect(braille).toHaveLength(12);
    expect(chart.problems).toEqual([]);
  });

  test('range bar (gantt): should announce each task\'s dates and its length in days', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-gantt');
    await chart.enter();

    const research = await chart.step('ArrowRight');

    expect(research.text).toContain('Research');
    expect(research.text).toContain('Jan 6, 2025 through Jan 17, 2025');
    expect(research.text).toContain('Length is 11 days');
    expect(research.outlined).toBeGreaterThan(0);
    expect(chart.problems).toEqual([]);
  });

  test('line chart: should announce each month and move the outline with it', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-line');

    const layer = onlyLayer(await extractMaidrData(page));
    expect(layer.type).toBe('line');

    await chart.enter();
    const jan = await chart.step('ArrowRight');
    const feb = await chart.step('ArrowRight');

    expect(jan.text).toContain('Jan');
    expect(jan.text).toContain('-4.6');
    expect(feb.text).toContain('Feb');
    expect(jan.outlined).toBeGreaterThan(0);
    expect(feb.outlined).toBeGreaterThan(0);
    expect(where(feb)).not.toEqual(where(jan));
    expect(chart.problems).toEqual([]);
  });

  test('heatmap: should read the rows top first and outline each cell', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-heatmap');

    const layer = onlyLayer(await extractMaidrData(page));
    expect(layer.type).toBe('heat');
    const data = layer.data as { x: string[]; y: string[]; points: (number | null)[][] };
    // ApexCharts draws the last series at the top.
    expect(data.y).toEqual(['Fri', 'Thu', 'Wed', 'Tue', 'Mon']);
    expect(data.x).toEqual(['7am', '9am', '11am', '1pm', '3pm']);
    expect(data.points[0]).toEqual([20, 40, 29, 41, 27]);

    await chart.enter();
    const first = await chart.step('ArrowRight');
    const second = await chart.step('ArrowRight');

    expect(first.text).toContain('Hour is 7am, Weekday is Mon, Customers is 12');
    expect(second.text).toContain('Hour is 9am, Weekday is Mon, Customers is 30');
    expect(first.outlined).toBeGreaterThan(0);
    expect(second.outlined).toBeGreaterThan(0);
    expect(where(second)).not.toEqual(where(first));
    expect(chart.problems).toEqual([]);
  });

  test('box plot: should announce each group and outline its parts', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-box');

    const layer = onlyLayer(await extractMaidrData(page));
    expect(layer.type).toBe('box');
    const boxes = layer.data as { z: string; min: number; q1: number; q2: number; q3: number; max: number }[];
    expect(boxes.map(box => box.z)).toEqual(['Car', 'Bus', 'Bike', 'Walk']);
    expect(boxes[0]).toMatchObject({ min: 12, q1: 18, q2: 24, q3: 31, max: 45 });

    await chart.enter();
    // A box is entered at its lower outliers, which this chart has none of,
    // so the first step outlines nothing; Up walks the summary.
    const car = await chart.step('ArrowRight');
    const min = await chart.step('ArrowUp');
    const q1 = await chart.step('ArrowUp');

    expect(car.text).toContain('Car');
    expect(min.text).toContain('12');
    expect(q1.text).toContain('18');
    expect(min.outlined).toBeGreaterThan(0);
    expect(q1.outlined).toBeGreaterThan(0);
    // The minimum's whisker cap sits below the box's lower edge.
    expect(outline(min).y).toBeGreaterThan(outline(q1).y);
    expect(chart.problems).toEqual([]);
  });

  test('pie chart: should announce each slice and outline it', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-pie');

    const layer = onlyLayer(await extractMaidrData(page));
    expect(layer.type).toBe('pie');
    expect((layer.data as { x: string; y: number }[]).map(slice => slice.x))
      .toEqual(['Rent', 'Food', 'Transport', 'Utilities', 'Savings']);

    await chart.enter();
    const rent = await chart.step('ArrowRight');
    const food = await chart.step('ArrowRight');

    expect(rent.text).toContain('Rent');
    expect(rent.text).toContain('1200');
    expect(food.text).toContain('Food');
    expect(rent.outlined).toBeGreaterThan(0);
    expect(where(food)).not.toEqual(where(rent));
    expect(chart.problems).toEqual([]);
  });

  test('grouped bar chart: should read a dodged layer and walk the series', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-grouped-bar');

    const layer = onlyLayer(await extractMaidrData(page));
    expect(layer.type).toBe('dodged_bar');

    await chart.enter();
    const first = await chart.step('ArrowRight');
    const next = await chart.step('ArrowUp');

    // One quarter, one series at a time: Up moves to the next region's bar
    // in the same quarter.
    expect(first.text).toContain('Quarter is Q1, Revenue ($ thousands) is 44, Level is North');
    expect(next.text).toContain('Quarter is Q1, Revenue ($ thousands) is 76, Level is South');
    expect(first.outlined).toBeGreaterThan(0);
    expect(next.outlined).toBeGreaterThan(0);
    expect(where(next)).not.toEqual(where(first));
    expect(chart.problems).toEqual([]);
  });

  test('mixed chart: should read the columns and the line as two layers', async ({ page }) => {
    const chart = new ApexChartsPage(page);
    await chart.open('apexcharts-mixed');

    const maidr = await extractMaidrData(page);
    expect(maidr.subplots[0][0].layers.map(layer => layer.type).sort()).toEqual(['bar', 'line']);

    await chart.enter();
    const column = await chart.step('ArrowRight');
    const line = await chart.step('PageUp');

    expect(column.text).toContain('Month is Jan, Revenue ($ thousands) is 42');
    expect(line.text).toContain('Target');
    expect(line.text).toContain('Month is Jan, Revenue ($ thousands) is 45');
    expect(column.outlined).toBeGreaterThan(0);
    expect(line.outlined).toBeGreaterThan(0);
    expect(where(line)).not.toEqual(where(column));
    expect(chart.problems).toEqual([]);
  });

  test('every example should bind without an error or a MAIDR warning', async ({ page }) => {
    // The per-chart tests above walk a few pages in depth; this one opens
    // them all, so a page whose chart the adapter cannot convert -- or
    // converts with a selector that resolves to nothing -- fails here.
    // What the first reading on each page announces: its first category,
    // that category's value and, on a chart of several series, the series.
    const examples: Record<string, string[]> = {
      'apexcharts-area': ['Day is Mon 1, Sessions is 310'],
      'apexcharts-bar-horizontal': ['Language is Mandarin, Native speakers (millions) is 939'],
      // Entered at the (empty) lower outliers; see the box plot test.
      'apexcharts-box-horizontal': ['Class D', 'Minimum Score is 52'],
      'apexcharts-bubble': ['GDP per person ($ thousands) is 2.4, Life expectancy (years) is 70.8'],
      'apexcharts-candlestick': ['Trading day is Mar 3, close Price ($) is 52.9'],
      'apexcharts-donut': ['Browser is Chrome, Share (%) is 65, Percentage is 65.0%'],
      'apexcharts-funnel': ['Stage is Applied, Count is 1380'],
      'apexcharts-gantt': ['Task is Research, Date is Jan 6, 2025 through Jan 17, 2025, Length is 11 days'],
      'apexcharts-gauge': ['Measure is Battery, Charge (%) is 72'],
      'apexcharts-multiline': ['Week is W1, Active users is 1200, Group is Desktop'],
      'apexcharts-normalized': ['Age group is 18-29, Share of respondents is 73.57, Level is Agree'],
      'apexcharts-polar-area': ['Season is Spring, Hours is 5.2'],
      'apexcharts-radar': ['Skill is Coding, Rating is 8, Series is Alice'],
      'apexcharts-scatter': ['Height (cm) is 155, Weight (kg) is 53'],
      'apexcharts-stacked': ['Year is 2019, Generation (TWh) is 210, Level is Coal'],
      'apexcharts-stacked-area': ['Month is Jan, Visits is 4200, Band is Organic'],
      'apexcharts-step': ['Quarter is 2022 Q1, Rate (%) is 0.25'],
      'apexcharts-treemap': ['City is Tokyo, Population (millions) is 37.2'],
    };
    test.setTimeout(Object.keys(examples).length * 10000);
    for (const [example, expected] of Object.entries(examples)) {
      const chart = new ApexChartsPage(page);
      await chart.open(example);
      await chart.enter();
      let reading = await chart.step('ArrowRight');
      if (example === 'apexcharts-box-horizontal')
        reading = await chart.step('ArrowRight');

      for (const part of expected)
        expect(reading.text, example).toContain(part);
      expect(reading.outlined, `${example}: nothing outlined`).toBeGreaterThan(0);
      expect(chart.problems, example).toEqual([]);
      page.removeAllListeners('pageerror');
      page.removeAllListeners('console');
      await page.unrouteAll();
    }
  });
});
