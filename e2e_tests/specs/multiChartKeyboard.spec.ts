import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The reader's keys on a page with two charts, as a Quarto page, a knitr
 * document or a slide deck puts them.
 *
 * Every chart binds the same keyboard scopes in the one hotkeys-js the page
 * has, so the keys have to follow the reader from chart to chart, in the
 * scope they are in there, and binding or dropping one chart must not take
 * the other's keys with it.
 *
 * These guard the ordinary ways across, and passed before each chart kept its
 * own bindings too: a Tab or a click disposes the chart left before the one
 * entered comes up, so only one is ever bound. An agent taking the reader
 * across, where the two overlap, is in webmcp.spec.ts.
 *
 * Uses examples/barplot.html (Sat 87, Sun 76, Thur 62, Fri 19; x labels
 * formatted to full day names), with a copy of its chart, id "bar2", put
 * beside it before MAIDR mounts. Requires a built bundle (dist/maidr.js).
 */

/**
 * Opens the bar chart page with a second chart beside the first. Both are
 * declared through the `maidr` attribute, since the page's `var maidr`
 * fallback serves one chart.
 * @param page - The Playwright page
 */
async function openTwoCharts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const first = document.querySelector('svg#bar');
      if (!first) {
        return;
      }
      const data = (window as unknown as { maidr: { id: string } }).maidr;
      const second = first.cloneNode(true) as SVGSVGElement;
      second.id = 'bar2';
      first.setAttribute('maidr', JSON.stringify(data));
      second.setAttribute('maidr', JSON.stringify({ ...data, id: 'bar2' }));
      first.after(second);
    });
  });
  await page.goto('examples/barplot.html');
  await page.waitForSelector('#maidr-figure-bar');
  await page.waitForSelector('#maidr-figure-bar2');
}

/**
 * Reads one chart's text region, empty while the reader is not in it.
 * @param page - The Playwright page
 * @param id - The chart's id
 * @returns The text the chart announces
 */
async function chartText(page: Page, id: string): Promise<string> {
  return page.evaluate(
    chartId => document.getElementById(`react-container-${chartId}`)?.textContent ?? '',
    id,
  );
}

/**
 * Whether the reader's focus is on a chart's plot, where a Tab lands.
 * @param page - The Playwright page
 * @param id - The chart's id
 * @returns True when the plot has focus
 */
async function plotHasFocus(page: Page, id: string): Promise<boolean> {
  return page.evaluate(
    chartId => document.activeElement?.parentElement?.id === `maidr-figure-${chartId}`,
    id,
  );
}

test.describe('the keyboard on a page with two charts', () => {
  test('follows a click into the other chart, in the scope the reader is in there', async ({ page }) => {
    await openTwoCharts(page);
    await page.click('svg#bar');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar')).toContain('Saturday');

    await page.click('svg#bar2');
    await page.keyboard.press('b');
    await expect(page.locator('#maidr-figure-bar2 textarea')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Saturday');

    // Back in the first, braille stays with the second and the arrow moves
    // the first, from where the reader left it.
    await page.click('svg#bar');
    await expect.poll(() => chartText(page, 'bar2')).toBe('');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar')).toContain('Sunday');
    expect(await plotHasFocus(page, 'bar')).toBe(true);
  });

  test('follows Tab and Shift+Tab between the charts', async ({ page }) => {
    await openTwoCharts(page);
    await page.click('svg#bar');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar')).toContain('Saturday');

    await page.keyboard.press('Tab');
    expect(await plotHasFocus(page, 'bar2')).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Saturday');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Sunday');

    await page.keyboard.press('Shift+Tab');
    expect(await plotHasFocus(page, 'bar')).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar')).toContain('Sunday');

    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Thursday');
  });

  test('keeps the reader\'s keys while the other chart is unbound and bound again', async ({ page }) => {
    await openTwoCharts(page);
    await page.click('svg#bar2');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Saturday');

    // As a host page that discards the first chart and draws it again does.
    await page.evaluate(() => {
      const plot = document.querySelector('svg#bar');
      document.dispatchEvent(new CustomEvent('maidr:unbindchart', { detail: plot }));
    });
    await expect(page.locator('#maidr-figure-bar')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Sunday');

    await page.evaluate(() => {
      const plot = document.querySelector('svg#bar');
      const json = plot?.getAttribute('maidr');
      if (plot && json) {
        plot.removeAttribute('data-maidr-value');
        plot.setAttribute('maidr', json);
      }
    });
    await page.waitForSelector('#maidr-figure-bar');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar2')).toContain('Thursday');

    await page.keyboard.press('Shift+Tab');
    expect(await plotHasFocus(page, 'bar')).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => chartText(page, 'bar')).toContain('Saturday');
  });
});
