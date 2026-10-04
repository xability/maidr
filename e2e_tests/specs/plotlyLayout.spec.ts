import type { Locator, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * Where MAIDR's text lands on a Plotly chart (#1317), and where its focus ring
 * is drawn.
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

/** A bar chart MAIDR binds from its own SVG, to share a page with Plotly. */
const SVG_CHART = {
  id: 'svg-chart',
  subplots: [[{
    layers: [{
      id: '0',
      type: 'bar',
      axes: { x: { label: 'Slot' }, y: { label: 'Value' } },
      data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
      selectors: '#svg-chart-bars > rect',
    }],
  }]],
};

/** Presses Tab until the keyboard focus lands on `target`. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 10; i++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** The style of the outline the browser draws around `element`. */
async function outlineStyle(element: Locator): Promise<string> {
  return element.evaluate(el => getComputedStyle(el).outlineStyle);
}

test('keeps a focus ring on the other charts of a page with a Plotly chart', async ({ page }) => {
  // The Plotly chart draws its focus ring on its svg-container and hides the
  // one on its plot div, which has no box of its own. The rule hiding it
  // matched every MAIDR chart on the page, so every other chart lost its focus
  // ring once a Plotly chart was bound.
  await routePlotly(page);
  await page.goto('examples/plotly-bar.html');
  const plotlyTarget = page.locator(`.js-plotly-plot ${FOCUS_TARGET}`);
  await plotlyTarget.waitFor({ state: 'attached' });
  await page.evaluate((maidr) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '120');
    svg.setAttribute('height', '100');
    svg.setAttribute('maidr', JSON.stringify(maidr));
    svg.innerHTML = '<g id="svg-chart-bars">'
      + '<rect x="10" y="50" width="40" height="50" />'
      + '<rect x="70" y="0" width="40" height="100" />'
      + '</g>';
    document.body.appendChild(svg);
  }, SVG_CHART);
  const svgTarget = page.locator(`#maidr-figure-${SVG_CHART.id} [tabindex="0"]`);
  await svgTarget.waitFor({ state: 'attached' });

  await tabTo(page, plotlyTarget);
  const plotlyRing = await outlineStyle(page.locator('.js-plotly-plot .svg-container'));
  const plotlyDivRing = await outlineStyle(plotlyTarget);
  await tabTo(page, svgTarget);
  const svgRing = await outlineStyle(svgTarget);

  expect(plotlyRing).not.toBe('none');
  expect(plotlyDivRing).toBe('none');
  expect(svgRing).not.toBe('none');
});
