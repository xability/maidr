import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Where MAIDR's text lands on a Plotly chart (#1317).
 *
 * Plotly draws its SVG absolutely positioned, so MAIDR pushes its text
 * container -- the announcements, text descriptions and braille area -- down
 * by the chart's height once the container appears. On many loads that
 * never happened and the text rendered behind the chart, where no one could
 * see it. It depends on real frame timing, which a unit test with stubbed
 * animation frames cannot reproduce, so it is pinned here.
 *
 * The examples load plotly.js from its CDN; the request is served from the
 * pinned `plotly.js-dist-min` devDependency so the spec needs no network.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plotlyBundle = path.join(repoRoot, 'node_modules/plotly.js-dist-min/plotly.min.js');

const FOCUS_TARGET = '[id^="maidr-figure-"] [tabindex="0"]';

/** Serves the Plotly CDN script from the local devDependency. */
async function routePlotly(page: Page): Promise<void> {
  await page.route('https://cdn.plot.ly/plotly-*.min.js', async (route) => {
    await route.fulfill({
      body: fs.readFileSync(plotlyBundle),
      contentType: 'text/javascript',
    });
  });
}

/**
 * The vertical extent of the chart and of the text MAIDR shows under it, or
 * `null` while the text is not there yet.
 */
async function layout(page: Page): Promise<{ chartBottom: number; textTop: number } | null> {
  return page.evaluate(() => {
    const chart = document.querySelector('.js-plotly-plot svg.main-svg');
    const container = document.querySelector('.js-plotly-plot div[id^="react-container-"]');
    if (!chart || !container || (container.textContent ?? '').trim() === '') {
      return null;
    }
    const text = document.createRange();
    text.selectNodeContents(container);
    return {
      chartBottom: chart.getBoundingClientRect().bottom,
      textTop: text.getBoundingClientRect().top,
    };
  });
}

for (const example of ['plotly-bar', 'plotly-line', 'plotly-subplots']) {
  test(`shows the text below the ${example} chart, not behind it`, async ({ page }) => {
    await routePlotly(page);
    await page.goto(`examples/${example}.html`);
    const target = page.locator(FOCUS_TARGET).first();
    await target.waitFor({ state: 'attached' });

    await target.focus();

    await expect.poll(async () => {
      const shown = await layout(page);
      return shown !== null && shown.textTop >= shown.chartBottom - 1;
    }).toBe(true);
  });
}
