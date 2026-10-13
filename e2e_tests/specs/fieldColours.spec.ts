import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';

/**
 * The braille and review fields stay readable on any page, and keep the
 * colours a page gives them wherever those are readable.
 *
 * They used to set neither colour, and took each from wherever the cascade
 * left it. A reset that makes form fields inherit their text colour
 * (normalize.css v3, so Bootstrap 3 and every rmarkdown page; Tailwind 3's
 * preflight) gave them the light colour high contrast mode paints behind the
 * chart, over the browser's white field: white on white. A reset that clears
 * their background left them black on high contrast's black. And a dark page
 * whose fields kept the browser's black text -- Quarto's darkly, a dark site
 * on Tailwind 3 or Bootstrap 3, Milligram on a dark body -- left them black
 * on dark grey whether high contrast was on or not.
 *
 * The fields carry the browser's own field colours as a pair, which holds
 * against the resets, and on top of that are measured as they open and on
 * every step: where the page's colours leave them below 4.5:1, they take the
 * colours of the text around the chart.
 *
 * Only a browser computes any of this -- jsdom has no default styles and no
 * system colours -- so it is checked here, by contrast ratio.
 */

const BRAILLE = '[id^="maidr-braille-textarea-"]';
const REVIEW = '[id^="maidr-review-input-"]';

/** WCAG 2.1 AA for text. */
const AA = 4.5;

/**
 * The resets that make fields inherit their text colour: normalize.css v3, as
 * Bootstrap 3 ships it, and Tailwind 3's preflight.
 */
const INHERIT_RESET = 'button, input, optgroup, select, textarea { color: inherit; }';

/** A page rule giving the fields one colour of their own, on purpose. */
const THEMED_FIELDS = '.themed textarea, .themed input { color: rgb(20, 30, 40); background-color: rgb(250, 240, 200); }';

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

    // Each background from the field up, until one is opaque, over the
    // canvas, whose colour follows the page's colour scheme.
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'Canvas';
    document.documentElement.appendChild(probe);
    const canvas = parse(window.getComputedStyle(probe).backgroundColor);
    probe.remove();
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
    const background = layers.reduceRight<Rgba>((under, layer) => over(layer, under), canvas);
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

/**
 * Expects both fields to read at WCAG AA or better.
 */
function expectReadable({ braille, review }: { braille: FieldPaint; review: FieldPaint }): void {
  expect.soft(braille.ratio, `braille: ${braille.color} on ${braille.background}`).toBeGreaterThanOrEqual(AA);
  expect.soft(review.ratio, `review: ${review.color} on ${review.background}`).toBeGreaterThanOrEqual(AA);
}

/**
 * Expects the open braille field to come to read at WCAG AA or better, once
 * the re-render a key asked for has landed.
 */
async function expectBrailleReadable(page: Page): Promise<void> {
  await expect.poll(async () => {
    const braille = await fieldPaint(page, BRAILLE);
    return braille.ratio;
  }, { message: 'braille contrast' }).toBeGreaterThanOrEqual(AA);
}

/**
 * Expects both fields to show exactly the colours the page gave them.
 */
function expectPageColours(
  { braille, review }: { braille: FieldPaint; review: FieldPaint },
  colours: { color: string; background: string },
): void {
  expect.soft(braille, 'braille').toMatchObject(colours);
  expect.soft(review, 'review').toMatchObject(colours);
}

test.describe('Braille and review field colours', () => {
  test.describe('in high contrast', () => {
    const pages = [
      {
        name: 'a reset that makes fields inherit their text colour',
        css: INHERIT_RESET,
      },
      {
        name: 'a reset that clears fields\' background',
        css: 'textarea, input { background: transparent; }',
      },
    ];

    for (const { name, css } of pages) {
      test(`keeps both fields readable on a page with ${name}`, async ({ page }) => {
        const barPage = await openChart(page, css);
        await barPage.pressKey('c', 'turn high contrast on');

        expectReadable(await readFields(page, barPage));
      });
    }

    test('gives the page its fields\' colours back when high contrast is turned off with a field open', async ({ page }) => {
      // Quarto's darkly. The floor measured the field while high contrast
      // painted it, so it must measure again once high contrast is gone.
      const barPage = await openChart(page, `
        body { background-color: #222; color: #fff; }
        input, button, select, optgroup, textarea { background-color: #222; }
      `);
      await barPage.pressKey('c', 'turn high contrast on');
      await barPage.pressKey('b', 'open braille');
      await expect(page.locator(BRAILLE)).toBeFocused();

      await barPage.pressKey('c', 'turn high contrast off');

      await expectBrailleReadable(page);
    });
  });

  test.describe('outside high contrast', () => {
    const pages = [
      {
        // Quarto's darkly theme: the page's background on every field, and
        // the browser's black text left as it was.
        name: 'a dark page that gives fields only its background',
        css: `
          body { background-color: #222; color: #fff; }
          input, button, select, optgroup, textarea { background-color: #222; }
        `,
      },
      {
        // Tailwind 3's preflight under a dark body: the fields inherit the
        // light text and keep the browser's white field.
        name: 'a dark page on a reset that makes fields inherit their text colour',
        css: `${INHERIT_RESET} body { background-color: #111827; color: #f9fafb; }`,
      },
      {
        // Milligram on a dark body: transparent fields, the browser's black text.
        name: 'a dark page whose fields clear their background at the specificity of an attribute',
        css: `
          body { background-color: #1b1b1b; color: #e6e6e6; }
          input[type="text"], textarea { background-color: transparent; }
        `,
      },
      {
        name: 'a page in the dark colour scheme',
        css: ':root { color-scheme: dark; } body { background-color: #121212; color: #eee; }',
      },
    ];

    for (const { name, css } of pages) {
      test(`keeps both fields readable on ${name}`, async ({ page }) => {
        const barPage = await openChart(page, css);

        expectReadable(await readFields(page, barPage));
      });
    }

    const themes = [
      {
        name: 'a rule of its own',
        css: THEMED_FIELDS,
        colours: { color: 'rgb(20, 30, 40)', background: 'rgb(250, 240, 200)' },
      },
    ];

    for (const { name, css, colours } of themes) {
      test(`leaves the readable colours a page gives its fields by ${name}`, async ({ page }) => {
        // A floor, not a ceiling: what a page chose and can be read is its own.
        const barPage = await openChart(page, css);
        await page.evaluate(() => document.body.classList.add('themed'));

        expectPageColours(await readFields(page, barPage), colours);
      });
    }

    test('keeps the braille field readable when the page switches theme while it is open', async ({ page }) => {
      // A theme toggle, or the system's dark mode, changing the page under
      // an open field: measured again on the reader's next step.
      const barPage = await openChart(page, `${INHERIT_RESET} html.dark body { background-color: #111827; color: #f9fafb; }`);
      await barPage.pressKey('b', 'open braille');
      await expect(page.locator(BRAILLE)).toBeFocused();

      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await barPage.pressKey('ArrowRight', 'move to the next bar');

      await expectBrailleReadable(page);
    });
  });

  test('keeps both fields readable in high contrast under forced colours', async ({ page }) => {
    // A guard: forced colours replace both colours with the system's, over
    // the pair the fields carry and over any the floor would give.
    await page.emulateMedia({ forcedColors: 'active' });
    const barPage = await openChart(page, INHERIT_RESET);
    await barPage.pressKey('c', 'turn high contrast on');

    expectReadable(await readFields(page, barPage));
  });
});
