import type { Reading } from '../page-objects/plots/bindingOutput-page';
import { expect, test } from '@playwright/test';
import { BindingOutputPage } from '../page-objects/plots/bindingOutput-page';

/**
 * What r-maidr and py-maidr readers get from this build.
 *
 * Most pages MAIDR reads are not written in this repository. r-maidr and
 * py-maidr each emit their own payloads against their own renderers (gridSVG,
 * matplotlib), and py-maidr loads the latest maidr.js by default -- so a
 * release reaches every installed copy of it the day it is published. The
 * 4.x changes to what a layer reads from `selectors` (#750, #991, #1135) were
 * each checked against every producer in this tree, and between them took the
 * highlight off r-maidr's and py-maidr's bars, points, pies and heat maps for
 * weeks: speech and navigation kept working, so nothing failed.
 *
 * Each fixture under `e2e_tests/fixtures/bindings/` is a real page one of them
 * produced, with its bundled maidr.js replaced by this build. The `legacy`
 * ones are what they emitted before they changed to match 4.x -- selectors in
 * a list -- which is still what every installed py-maidr up to 1.24 emits;
 * the rest are what they emit today. See the README beside them for how each
 * was made.
 *
 * What is checked is what a reader sees: that pressing an arrow key outlines a
 * mark, and, where the marks are bars, that the outlined bar is the announced
 * one -- a taller bar is a larger number on every chart here, so the heights
 * have to rank the way the announced values do. A highlight on the wrong bar
 * is worse than none, and #1135 produced exactly that.
 */

/** How strictly a fixture's highlight is checked. */
type Check = 'ranks' | 'moves' | 'outlined';

const FIXTURES: ReadonlyArray<{ name: string; check: Check }> = [
  // Written before 4.0, selectors in a list.
  { name: 'r-legacy-ggplot2-bar', check: 'ranks' },
  { name: 'r-legacy-ggplot2-point', check: 'moves' },
  { name: 'r-legacy-ggplot2-pie', check: 'outlined' },
  { name: 'r-legacy-base-stacked', check: 'ranks' },
  { name: 'py-legacy-seaborn-scatter', check: 'moves' },
  { name: 'py-legacy-matplotlib-eventplot', check: 'outlined' },
  // What the bindings emit today.
  { name: 'r-ggplot2-dodged', check: 'ranks' },
  { name: 'r-ggplot2-stacked', check: 'ranks' },
  { name: 'r-base-dodged', check: 'ranks' },
  { name: 'r-ggplot2-area', check: 'outlined' },
  { name: 'r-ggplot2-heat', check: 'outlined' },
  { name: 'py-seaborn-dodged', check: 'ranks' },
  { name: 'py-matplotlib-line', check: 'moves' },
  { name: 'py-seaborn-heat', check: 'outlined' },
];

/**
 * The first pair of readings whose outlined heights do not rank the way their
 * announced values do, or null when every pair does.
 * @param readings - One reading per step, each with a value and an outline
 * @returns A description of the first mismatch, or null
 */
function misranked(readings: Reading[]): string | null {
  const byValue = readings
    .filter(r => r.value !== null && r.box !== null)
    .map(r => ({ value: r.value as number, height: (r.box as { height: number }).height }))
    .sort((a, b) => a.value - b.value);
  for (let i = 1; i < byValue.length; i++) {
    const lower = byValue[i - 1];
    const upper = byValue[i];
    const wrong = upper.value > lower.value
      ? upper.height <= lower.height + 0.5
      : Math.abs(upper.height - lower.height) > 0.5;
    if (wrong) {
      return `${lower.value} outlined ${lower.height.toFixed(1)}px tall, `
        + `${upper.value} outlined ${upper.height.toFixed(1)}px tall`;
    }
  }
  return null;
}

test.describe('language binding output', () => {
  for (const { name, check } of FIXTURES) {
    test(`${name}: an arrow key outlines the announced mark`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const binding = new BindingOutputPage(page);
      await binding.open(name);
      await binding.enter();

      const readings: Reading[] = [];
      for (let i = 0; i < 3; i++) {
        readings.push(await binding.step('ArrowRight'));
      }

      expect(errors).toEqual([]);
      expect(readings[0].outlined, `${name}: nothing outlined after ArrowRight`).toBeGreaterThan(0);
      if (check === 'ranks') {
        expect(misranked(readings), `${name}: the outlined bar is not the announced one`).toBeNull();
      }
      if (check === 'moves') {
        const boxes = readings.map(r => r.box && `${Math.round(r.box.x)},${Math.round(r.box.y)}`);
        expect(new Set(boxes).size, `${name}: the outline stayed put while the reader moved`)
          .toBeGreaterThan(1);
      }
    });
  }
});
