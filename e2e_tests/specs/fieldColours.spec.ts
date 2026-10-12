import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';

/**
 * The braille and review fields set both of their colours, as a pair, so a
 * page can never hand them only one.
 *
 * They used to set neither, and took each from wherever the cascade left it.
 * A reset that makes form fields inherit their text colour (normalize.css v3,
 * so Bootstrap 3 and every rmarkdown page; Tailwind 3's preflight) gave them
 * the light colour high contrast mode paints behind the chart, over the
 * browser's white field: white on white. A reset that clears their background
 * left them black on high contrast's black. And a dark theme that gives fields
 * the page's background but not its text colour (Quarto's darkly) left them
 * black on dark grey whether high contrast was on or not.
 *
 * Only a browser computes any of this -- jsdom has no default styles and no
 * system colours -- so it is checked here, by contrast ratio.
 */

const BRAILLE = '[id^="maidr-braille-textarea-"]';
const REVIEW = '[id^="maidr-review-input-"]';

/** WCAG 2.1 AA for text. */
const AA = 4.5;

/** What a field paints its text with, and over. */
interface FieldPaint {
  /** The field's text colour. */
  color: string;
  /** The colour its text sits on: its own background composited over every ancestor's. */
  background: string;
  /** The contrast ratio between the two. */
  ratio: number;
}

/**
 * Reads the colours of the field `selector` names, and their contrast ratio.
 */
async function fieldPaint(page: Page, selector: string): Promise<FieldPaint> {
  return page.locator(selector).evaluate((field) => {
    type Rgba = [number, number, number, number];
    const parse = (value: string): Rgba => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    };
    const over = (top: Rgba, bottom: Rgba): Rgba => {
      const a = top[3];
      return [0, 1, 2].map(i => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
    };
    const luminance = (rgba: Rgba): number => {
      const [r, g, b] = rgba.slice(0, 3).map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const css = (rgba: Rgba): string => `rgb(${rgba.slice(0, 3).map(Math.round).join(', ')})`;

    // Each background from the field up, until one is opaque. The canvas
    // under them all is white: these pages set no colour-scheme of their own
    // on the root unless a case says so, and then the body paints it.
    const layers: Rgba[] = [];
    for (let element: Element | null = field; element !== null; element = element.parentElement) {
      const layer = parse(window.getComputedStyle(element).backgroundColor);
      if (layer[3] > 0) {
        layers.push(layer);
      }
      if (layer[3] === 1) {
        break;
      }
    }
    const background = layers.reduceRight<Rgba>((under, layer) => over(layer, under), [255, 255, 255, 1]);
    const color = over(parse(window.getComputedStyle(field).color), background);

    const [light, dark] = [luminance(color), luminance(background)].sort((a, b) => b - a);
    return { color: css(color), background: css(background), ratio: (light + 0.05) / (dark + 0.05) };
  });
}

/**
 * Opens the bar chart with `css` added to the page after MAIDR's own rules,
 * as a page's stylesheet would be.
 */
async function openChart(page: Page, css: string): Promise<BarPlotPage> {
  const barPage = new BarPlotPage(page);
  await barPage.navigateToBarPlot();
  await page.addStyleTag({ content: css });
  await barPage.activateMaidr();
  return barPage;
}

/**
 * Opens braille, then review, and reads each field while it is open.
 */
async function readFields(page: Page, barPage: BarPlotPage): Promise<{ braille: FieldPaint; review: FieldPaint }> {
  await barPage.pressKey('b', 'open braille');
  await expect(page.locator(BRAILLE)).toBeFocused();
  const braille = await fieldPaint(page, BRAILLE);
  await barPage.pressKey('b', 'close braille');
  await expect(page.locator(BRAILLE)).toHaveCount(0);

  await barPage.pressKey('r', 'open review');
  await expect(page.locator(REVIEW)).toBeFocused();
  const review = await fieldPaint(page, REVIEW);

  return { braille, review };
}

test.describe('Braille and review field colours', () => {
  const resets = [
    {
      name: 'that makes fields inherit their text colour',
      // normalize.css v3, as Bootstrap 3 ships it, and Tailwind 3's preflight.
      css: 'button, input, optgroup, select, textarea { color: inherit; }',
    },
    {
      name: 'that clears fields\' background',
      css: 'textarea, input { background: transparent; }',
    },
  ];

  for (const reset of resets) {
    test(`keeps both fields readable in high contrast on a page with a reset ${reset.name}`, async ({ page }) => {
      const barPage = await openChart(page, reset.css);
      await barPage.pressKey('c', 'turn high contrast on');

      const { braille, review } = await readFields(page, barPage);

      expect.soft(braille.ratio, `braille: ${braille.color} on ${braille.background}`).toBeGreaterThanOrEqual(AA);
      expect.soft(review.ratio, `review: ${review.color} on ${review.background}`).toBeGreaterThanOrEqual(AA);
    });
  }

  test('keeps both fields readable in high contrast under forced colours', async ({ page }) => {
    // A guard: forced colours replaced the inherited colour with the
    // system's even before the fields had their own, and the system colours
    // they have now must stay a pair the system replaces as one.
    await page.emulateMedia({ forcedColors: 'active' });
    const barPage = await openChart(page, resets[0].css);
    await barPage.pressKey('c', 'turn high contrast on');

    const { braille, review } = await readFields(page, barPage);

    expect.soft(braille.ratio, `braille: ${braille.color} on ${braille.background}`).toBeGreaterThanOrEqual(AA);
    expect.soft(review.ratio, `review: ${review.color} on ${review.background}`).toBeGreaterThanOrEqual(AA);
  });

  test('keeps both fields readable on a dark page that gives fields only its background', async ({ page }) => {
    // Quarto's darkly theme: the page's background on every field, and the
    // browser's black text left as it was.
    const barPage = await openChart(page, `
      body { background-color: #222; color: #fff; }
      input, button, select, optgroup, textarea { background-color: #222; }
    `);

    const { braille, review } = await readFields(page, barPage);

    expect.soft(braille.ratio, `braille: ${braille.color} on ${braille.background}`).toBeGreaterThanOrEqual(AA);
    expect.soft(review.ratio, `review: ${review.color} on ${review.background}`).toBeGreaterThanOrEqual(AA);
  });

  test('keeps both fields readable on a page in the dark colour scheme', async ({ page }) => {
    const barPage = await openChart(page, ':root { color-scheme: dark; } body { background-color: #121212; color: #eee; }');

    const { braille, review } = await readFields(page, barPage);

    expect.soft(braille.ratio, `braille: ${braille.color} on ${braille.background}`).toBeGreaterThanOrEqual(AA);
    expect.soft(review.ratio, `review: ${review.color} on ${review.background}`).toBeGreaterThanOrEqual(AA);
  });

  test('leaves the colours a page gives its fields by a rule of its own', async ({ page }) => {
    // A floor, not a ceiling: a rule that names where the fields are, as a
    // page styling them on purpose does, is the page's choice to make.
    const barPage = await openChart(page, `
      .themed textarea, .themed input { color: rgb(20, 30, 40); background-color: rgb(250, 240, 200); }
    `);
    await page.evaluate(() => document.body.classList.add('themed'));

    const { braille, review } = await readFields(page, barPage);

    expect(braille).toMatchObject({ color: 'rgb(20, 30, 40)', background: 'rgb(250, 240, 200)' });
    expect(review).toMatchObject({ color: 'rgb(20, 30, 40)', background: 'rgb(250, 240, 200)' });
  });
});
