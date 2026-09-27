import type { Reading } from '../page-objects/plots/bindingOutput-page';
import { expect, test } from '@playwright/test';
import { BindingOutputPage } from '../page-objects/plots/bindingOutput-page';

/**
 * What a reader gets from the charts Apache Superset and Metabase draw (#1304).
 *
 * Both tools render most of their charts with ECharts, and neither writes one
 * the way this repository's examples do: Metabase feeds every series from a
 * `dataset` through `encode` and names none of them, Superset draws every
 * chart to a canvas, and both put their time series on a `time` axis. Each
 * fixture under `e2e_tests/fixtures/bi-tools/` is the option a running copy of
 * one of them handed ECharts, drawn the way that tool draws it and bound with
 * `bindAllECharts` -- see the README beside them.
 *
 * What is checked is what a reader hears and sees: the first arrow key
 * announces the first datum the tool drew, and the highlight is on the mark
 * that was announced.
 */

/**
 * How strictly a fixture's highlight is checked. `announces` checks the
 * reading alone, for a chart with nothing to outline -- a box plot draws box
 * and whiskers as one path -- or whose drawing the fixture cannot reproduce.
 */
type Check = 'ranks' | 'ranks-wide' | 'moves' | 'outlined' | 'announces';

interface Fixture {
  name: string;
  check: Check;
  /** What the first arrow key has to announce. */
  first: RegExp;
  /**
   * Where the value is in an announcement, when it is not the last number --
   * a Metabase series is named by an id such as `43:CNT:Widget`, which ends
   * the announcement with a number of its own.
   */
  value?: RegExp;
}

const FIXTURES: ReadonlyArray<Fixture> = [
  // Metabase: SVG, a dataset read through `encode`, series named by id.
  { name: 'metabase-bar', check: 'ranks', first: /Doohickey, Count is 42\b/ },
  { name: 'metabase-line', check: 'moves', first: /2025-04-01, Count is 1\b/ },
  { name: 'metabase-area', check: 'moves', first: /2025-04-01, Count is 1\b/ },
  { name: 'metabase-stacked', check: 'ranks', first: /2025, CNT is 210, Level is 43:CNT:Widget/, value: /CNT is ([\d.]+)/ },
  { name: 'metabase-multi-series', check: 'ranks', first: /Doohickey, SUM_TOTAL is 297270\.99, Level is 44:SUM_TOTAL/, value: /SUM_TOTAL is ([\d.]+)/ },
  { name: 'metabase-scatter', check: 'moves', first: /PRICE is 15\.69, RATING is 4\b/ },
  { name: 'metabase-pie', check: 'outlined', first: /Widget, Value is 54\b/ },
  { name: 'metabase-combo', check: 'ranks', first: /Doohickey, SUM_TOTAL is 297270\.99/, value: /SUM_TOTAL is ([\d.]+)/ },
  { name: 'metabase-stack-totals', check: 'ranks', first: /2025, CNT is 210, Level is 58:CNT:Widget/, value: /CNT is ([\d.]+)/ },
  { name: 'metabase-trend-line', check: 'moves', first: /2025-04-01, Count is 1\b/ },
  // Its steps are a custom series whose `renderItem` a captured option cannot
  // carry, so the fixture draws no bars to outline; see the README.
  { name: 'metabase-waterfall', check: 'announces', first: /Jan, increase DELTA is 120, Running total is 120/ },
  { name: 'metabase-boxplot', check: 'announces', first: /Widget/ },
  // Superset: a canvas, inline pairs, a time axis.
  { name: 'superset-line', check: 'moves', first: /2024-01-01.*989\.44/ },
  { name: 'superset-line-multi', check: 'moves', first: /2024-01-01.*478\.93/ },
  { name: 'superset-area', check: 'moves', first: /2024-01-01.*989\.44/ },
  { name: 'superset-bar', check: 'ranks', first: /2024-01-01.*989\.44/ },
  { name: 'superset-bar-stacked', check: 'ranks', first: /2024-01-01.*399\.44.*Toys/ },
  { name: 'superset-bar-horizontal', check: 'ranks-wide', first: /989\.44.*2024-01-01|2024-01-01.*989\.44/ },
  { name: 'superset-bar-categorical', check: 'ranks', first: /Books.*1573\.68/ },
  { name: 'superset-scatter', check: 'moves', first: /2024-01-01.*989\.44/ },
  { name: 'superset-pie', check: 'outlined', first: /Toys.*2197\.79/ },
  { name: 'superset-funnel', check: 'outlined', first: /Toys, Count is 2197\.79/ },
  { name: 'superset-heatmap', check: 'outlined', first: /Books, Y is North, Level is 1046\.54/ },
  { name: 'superset-radar', check: 'moves', first: /SUM\(amount\), Y is 1\b/ },
  { name: 'superset-sunburst', check: 'outlined', first: /Toys, Value is 2197\.79/ },
  { name: 'superset-waterfall', check: 'outlined', first: /2024-01-01, increase Y is 989\.44, Running total is 989\.44/ },
  { name: 'superset-forecast', check: 'moves', first: /2023-12-31, SUM\(amount\)__yhat_upper is 287\.87/ },
  { name: 'superset-stream', check: 'moves', first: /2024-01-01, Toys is 399\.44/ },
  { name: 'superset-mixed', check: 'ranks', first: /2024-01-01, SUM\(amount\) is 989\.44/ },
  { name: 'superset-histogram', check: 'ranks', first: /121\.34 - 155\.13, count is 3/ },
  { name: 'superset-boxplot', check: 'announces', first: /Books/ },
];

/**
 * The first pair of readings whose outlined extents do not rank the way their
 * announced values do, or null when every pair does.
 * @param readings - One reading per step, each with a value and an outline
 * @param extent - Which side of the outline grows with the value
 * @param value - Where the value is in an announcement, when not last
 * @returns A description of the first mismatch, or null
 */
function misranked(
  readings: Reading[],
  extent: 'height' | 'width',
  value?: RegExp,
): string | null {
  const valueOf = (r: Reading): number | null => {
    if (!value) {
      return r.value;
    }
    const match = value.exec(r.text);
    return match ? Number(match[1]) : null;
  };
  const byValue = readings
    .filter(r => valueOf(r) !== null && r.box !== null)
    .map(r => ({ value: valueOf(r) as number, size: (r.box as { height: number; width: number })[extent] }))
    .sort((a, b) => a.value - b.value);
  for (let i = 1; i < byValue.length; i++) {
    const lower = byValue[i - 1];
    const upper = byValue[i];
    const wrong = upper.value > lower.value
      ? upper.size <= lower.size + 0.5
      : Math.abs(upper.size - lower.size) > 0.5;
    if (wrong) {
      return `${lower.value} outlined ${lower.size.toFixed(1)}px ${extent}, `
        + `${upper.value} outlined ${upper.size.toFixed(1)}px ${extent}`;
    }
  }
  return null;
}

test.describe('Superset and Metabase charts', () => {
  for (const { name, check, first, value } of FIXTURES) {
    test(`${name}: an arrow key announces the first datum and outlines it`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const chart = new BindingOutputPage(page, 'bi-tools', '[maidr-data]');
      await chart.open(name);
      await chart.enter();

      const readings: Reading[] = [];
      for (let i = 0; i < 3; i++) {
        readings.push(await chart.step('ArrowRight'));
      }

      expect(errors).toEqual([]);
      expect(readings[0].text, `${name}: the first datum was not announced`).toMatch(first);
      if (check !== 'announces') {
        expect(readings[0].outlined, `${name}: nothing outlined after ArrowRight`).toBeGreaterThan(0);
      }
      if (check === 'ranks' || check === 'ranks-wide') {
        const extent = check === 'ranks' ? 'height' : 'width';
        expect(misranked(readings, extent, value), `${name}: the outlined bar is not the announced one`)
          .toBeNull();
      }
      if (check === 'moves') {
        const boxes = readings.map(r => r.box && `${Math.round(r.box.x)},${Math.round(r.box.y)}`);
        expect(new Set(boxes).size, `${name}: the outline stayed put while the reader moved`)
          .toBeGreaterThan(1);
      }
    });
  }
});
