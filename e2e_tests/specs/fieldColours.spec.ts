import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';
import { TestConstants } from '../utils/constants';

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
 * A pair of fixed colours with a fixed specificity did not hold either: a
 * page that sets only one of the two at the same weight or more splits the
 * pair (Milligram clears only the background, through `input[type='text']`),
 * and it overrode the colours of every page that themed its fields on
 * purpose, white boxes on dark themes included. So under high contrast the
 * fields take the reader's pair, `!important`; outside it they keep the
 * page's colours, and only where those measure below 4.5:1 take the colours
 * of the text around the chart.
 *
 * Only a browser computes any of this -- jsdom has no default styles and no
 * system colours -- so it is checked here, by contrast ratio.
 */

declare global {
  interface Window {
    /** How many times a page's own MutationObserver has been called. */
    observerCalls?: number;
  }
}

const BRAILLE = `textarea[id^="${TestConstants.BRAILLE_TEXTAREA}"]`;
const REVIEW = `input[id^="${TestConstants.REVIEW_INPUT}"]`;

/** WCAG 2.1 AA for text. */
const AA = 4.5;

/**
 * The resets that make fields inherit their text colour: normalize.css v3, as
 * Bootstrap 3 ships it, and Tailwind 3's preflight.
 */
const INHERIT_RESET = 'button, input, optgroup, select, textarea { color: inherit; }';

/**
 * Quarto's darkly theme: the page's background on every field, and the
 * browser's black text left as it was.
 */
const QUARTO_DARKLY = `
  body { background-color: #222; color: #fff; }
  input, button, select, optgroup, textarea { background-color: #222; }
`;

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
    // Every colour through one canvas pixel: a computed colour can stay in
    // the space it was written in (`oklch()`, `lab()`, `color(srgb ...)`), and
    // reading its numbers as red, green and blue misreads it.
    const pixel = document.createElement('canvas');
    pixel.width = 1;
    pixel.height = 1;
    const context = pixel.getContext('2d', { willReadFrequently: true });
    if (context === null) {
      throw new Error('fieldPaint: no 2D canvas context to read colours with');
    }
    const parse = (value: string): Rgba => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
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
 * Waits for the re-render a key asked for to land, and then for every CSS
 * transition on the page to end, so the colours read are where they settle,
 * not where a transition passes through.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const transitions = document.getAnimations().filter(animation => animation instanceof CSSTransition);
    await Promise.all(transitions.map(transition => transition.finished.catch(() => undefined)));
  });
}

/**
 * Opens the bar chart with `css` added to the page after MAIDR's own rules,
 * as a page's stylesheet would be.
 * @param page - The page
 * @param css - The page's own rules
 * @param options - How the page is laid out
 * @param options.prose - Puts a paragraph before the chart, as on a real
 *   page. High contrast then paints its backdrop on the chart's article
 *   rather than on the body of a page holding nothing else.
 * @returns The chart's page object
 */
async function openChart(page: Page, css: string, { prose = false }: { prose?: boolean } = {}): Promise<BarPlotPage> {
  const barPage = new BarPlotPage(page);
  await barPage.navigateToBarPlot();
  await page.addStyleTag({ content: css });
  if (prose) {
    await page.evaluate(() => document.body.insertAdjacentHTML('afterbegin', '<p>Some prose before the chart.</p>'));
  }
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
      {
        // Milligram's own rule, after Bootstrap 3's reset: a pair given at
        // this specificity loses its background and keeps its black text.
        name: 'a rule that clears only the background, at the specificity of an attribute',
        css: `${INHERIT_RESET} input[type="text"], textarea[readonly] { background-color: transparent; }`,
      },
      {
        // The same, with a light background: the inherited light text on it.
        name: 'a rule that sets only a light background, at the specificity of an attribute',
        css: `${INHERIT_RESET} input[type="text"], textarea[readonly] { background-color: #fff; }`,
      },
    ];

    for (const { name, css } of pages) {
      test(`keeps both fields readable on a page with ${name}`, async ({ page }) => {
        const barPage = await openChart(page, css);
        await barPage.pressKey('c', 'turn high contrast on');

        expectReadable(await readFields(page, barPage));
      });
    }

    test('gives the reader\'s pair to fields a page themes in a cascade layer', async ({ page }) => {
      // A layered theme loses to any rule outside a layer, and the fields must
      // still show the reader's colours, not the page's, under high contrast.
      const barPage = await openChart(page, `@layer theme { ${THEMED_FIELDS} }`);
      await page.evaluate(() => document.body.classList.add('themed'));
      await barPage.pressKey('c', 'turn high contrast on');

      expectPageColours(await readFields(page, barPage), { color: 'rgb(255, 255, 255)', background: 'rgb(0, 0, 0)' });
    });

    test('gives the page its fields\' colours back when high contrast is turned off with a field open', async ({ page }) => {
      // Quarto's darkly. The floor measured the field while high contrast
      // painted it, so it must measure again once high contrast is gone, and
      // the field must end as it is outside high contrast.
      const barPage = await openChart(page, QUARTO_DARKLY);
      await barPage.pressKey('b', 'open braille');
      await expect(page.locator(BRAILLE)).toBeFocused();
      const own = await fieldPaint(page, BRAILLE);
      await barPage.pressKey('b', 'close braille');
      await expect(page.locator(BRAILLE)).toHaveCount(0);
      await barPage.pressKey('c', 'turn high contrast on');
      await barPage.pressKey('b', 'open braille');
      await expect(page.locator(BRAILLE)).toBeFocused();
      await expect.poll(() => fieldPaint(page, BRAILLE), { message: 'braille in high contrast' })
        .toMatchObject({ color: 'rgb(255, 255, 255)', background: 'rgb(0, 0, 0)' });

      await barPage.pressKey('c', 'turn high contrast off');

      expect(own.ratio, `braille: ${own.color} on ${own.background}`).toBeGreaterThanOrEqual(AA);
      await expect.poll(() => fieldPaint(page, BRAILLE), { message: 'braille after high contrast' }).toEqual(own);
    });
  });

  test.describe('outside high contrast', () => {
    const pages = [
      {
        name: 'a dark page that gives fields only its background',
        css: QUARTO_DARKLY,
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
        // A page whose field rule is `!important`: the floor's pair has to
        // outweigh it.
        name: 'a dark page that gives fields a dark text with !important',
        css: `
          body { background-color: #1b1b1b; color: #e6e6e6; }
          textarea, input { background: transparent; color: #000 !important; }
        `,
      },
      {
        // Colours a browser keeps in the space they were written in, which
        // only painting them reads: transparent fields, a dark text, on a
        // dark body.
        name: 'a dark page whose colours are written in oklch()',
        css: `
          body { background-color: oklch(0.2 0.02 250); color: oklch(0.95 0 0); }
          textarea, input { background-color: transparent; color: oklch(0.2 0 0); }
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

    test('keeps both fields readable on a page that restyles focused fields', async ({ page }) => {
      // Readable until focused, and braille is measured before it takes
      // focus: the field must be measured again once it has it.
      const barPage = await openChart(page, `
        ${INHERIT_RESET}
        body { background-color: #1b1b1b; color: #e6e6e6; }
        textarea, input { background-color: transparent; }
        textarea:focus, input:focus { background-color: #fff; }
      `);

      expectReadable(await readFields(page, barPage));
    });

    const themes = [
      {
        name: 'a rule of its own',
        css: THEMED_FIELDS,
        colours: { color: 'rgb(20, 30, 40)', background: 'rgb(250, 240, 200)' },
      },
      {
        name: 'a rule in a cascade layer',
        css: `@layer theme { ${THEMED_FIELDS} }`,
        colours: { color: 'rgb(20, 30, 40)', background: 'rgb(250, 240, 200)' },
      },
      {
        // water.css's dark theme names fields by element type alone: a white
        // box in its place would glare on the dark page.
        name: 'a dark theme that styles fields by element type',
        css: `
          body { background-color: #202b38; color: #dbdbdb; }
          textarea, input, select, button { color: #fff; background-color: #161f27; }
        `,
        colours: { color: 'rgb(255, 255, 255)', background: 'rgb(22, 31, 39)' },
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

    test('keeps the braille field readable when the page swaps in a dark stylesheet while it is open', async ({ page }) => {
      // A theme switched by a stylesheet, which nothing watches: measured
      // again on the reader's next step.
      const barPage = await openChart(page, INHERIT_RESET);
      await barPage.pressKey('b', 'open braille');
      await expect(page.locator(BRAILLE)).toBeFocused();

      await page.addStyleTag({ content: 'body { background-color: #111827; color: #f9fafb; }' });
      await barPage.pressKey('ArrowRight', 'move to the next bar');

      await expectBrailleReadable(page);
    });
  });

  test.describe('when the page switches theme with a field open', () => {
    // Review takes no steps while it is open, so a switch must be measured
    // without one: the field is measured again when the page's root or body
    // changes an attribute, or the system's colour scheme changes, and again
    // once any transition the switch started on the field's ancestors ends.
    const DARK_CLASS = 'html.dark body { background-color: #111827; color: #f9fafb; }';
    const THEME_TRANSITIONS = '*, *::before, *::after { transition: background-color .3s, color .3s; }';
    const switches = [
      {
        name: 'a class on the root',
        css: `${INHERIT_RESET} ${DARK_CLASS}`,
        toDark: async (page: Page): Promise<void> => {
          await page.evaluate(() => document.documentElement.classList.add('dark'));
        },
      },
      {
        name: 'a class on the root, with the colours transitioning',
        css: `${INHERIT_RESET} ${DARK_CLASS} ${THEME_TRANSITIONS}`,
        toDark: async (page: Page): Promise<void> => {
          await page.evaluate(() => document.documentElement.classList.add('dark'));
        },
      },
      {
        name: 'the system\'s colour scheme',
        css: `${INHERIT_RESET} @media (prefers-color-scheme: dark) { body { background-color: #111827; color: #f9fafb; } }`,
        toDark: async (page: Page): Promise<void> => {
          await page.emulateMedia({ colorScheme: 'dark' });
        },
      },
    ];
    const fields = [
      { name: 'braille', key: 'b', selector: BRAILLE },
      { name: 'review', key: 'r', selector: REVIEW },
    ];

    for (const { name, css, toDark } of switches) {
      for (const field of fields) {
        test(`keeps the ${field.name} field readable when ${name} turns the page dark`, async ({ page }) => {
          await page.emulateMedia({ colorScheme: 'light' });
          const barPage = await openChart(page, css);
          await barPage.pressKey(field.key, `open ${field.name}`);
          await expect(page.locator(field.selector)).toBeFocused();

          await toDark(page);
          await settle(page);

          const paint = await fieldPaint(page, field.selector);
          expect(paint.ratio, `${field.name}: ${paint.color} on ${paint.background}`).toBeGreaterThanOrEqual(AA);
        });
      }
    }
  });

  test.describe('on a page that transitions its colours', () => {
    // Each step undoes the floor and measures again. A transition on the
    // field's colours starts from the colours being left -- the floor's own
    // -- so a measure taken then found the field readable, and it faded to
    // the page's unreadable colours on every other step.
    const pages = [
      {
        name: 'fields that transition every property',
        css: `${INHERIT_RESET} body { background-color: #111827; color: #f9fafb; } input, textarea { transition: all .25s; }`,
      },
      {
        // The snippet a theme toggle ships with, on Quarto's darkly.
        name: 'every element transitioning its colours, as a theme toggle does',
        css: `${QUARTO_DARKLY} *, *::before, *::after { transition: background-color .3s, color .3s; }`,
      },
    ];

    for (const { name, css } of pages) {
      test(`keeps the braille field readable on every step, on a page with ${name}`, async ({ page }) => {
        const barPage = await openChart(page, css);
        await barPage.pressKey('b', 'open braille');
        await expect(page.locator(BRAILLE)).toBeFocused();
        const ratios: number[] = [];

        for (let step = 0; step <= 4; step++) {
          if (step > 0) {
            await barPage.pressKey('ArrowRight', `step ${step}`);
          }
          await settle(page);
          ratios.push((await fieldPaint(page, BRAILLE)).ratio);
        }

        for (const [step, ratio] of ratios.entries()) {
          expect.soft(ratio, `braille after step ${step} of ${ratios.map(r => r.toFixed(2)).join(', ')}`).toBeGreaterThanOrEqual(AA);
        }
      });

      test(`keeps the braille field readable when high contrast is turned off with it open, on a page with ${name}`, async ({ page }) => {
        const barPage = await openChart(page, css);
        await barPage.pressKey('c', 'turn high contrast on');
        await barPage.pressKey('b', 'open braille');
        await expect(page.locator(BRAILLE)).toBeFocused();

        await barPage.pressKey('c', 'turn high contrast off');
        await settle(page);
        const off = await fieldPaint(page, BRAILLE);
        await barPage.pressKey('ArrowRight', 'move to the next bar');
        await settle(page);
        const stepped = await fieldPaint(page, BRAILLE);

        expect.soft(off.ratio, `braille once off: ${off.color} on ${off.background}`).toBeGreaterThanOrEqual(AA);
        expect.soft(stepped.ratio, `braille a step later: ${stepped.color} on ${stepped.background}`).toBeGreaterThanOrEqual(AA);
      });

      test(`gives the braille field its colours outside high contrast once high contrast's transitions end, on a page with ${name}`, async ({ page }) => {
        // Turning high contrast off restores the colours around the chart,
        // and on this page they transition back: measured at once, the text
        // around the field is still high contrast's, so the field is measured
        // again once the transitions end, without waiting for a step. With
        // prose on the page, the backdrop is the article: nothing the page's
        // root or body does gives the change away.
        const barPage = await openChart(page, css, { prose: true });
        await barPage.pressKey('b', 'open braille');
        await expect(page.locator(BRAILLE)).toBeFocused();
        await settle(page);
        const own = await fieldPaint(page, BRAILLE);
        await barPage.pressKey('b', 'close braille');
        await expect(page.locator(BRAILLE)).toHaveCount(0);
        await barPage.pressKey('c', 'turn high contrast on');
        await barPage.pressKey('b', 'open braille');
        await expect(page.locator(BRAILLE)).toBeFocused();

        await barPage.pressKey('c', 'turn high contrast off');
        await settle(page);

        await expect.poll(() => fieldPaint(page, BRAILLE), { message: 'braille after high contrast' }).toEqual(own);
      });
    }
  });

  test.describe('on a page that answers changes to its document', () => {
    // A page's own MutationObserver that writes to its root or body whenever
    // the document changes. A floor that changed the page on every measure --
    // a probe for the canvas colour, or its pair taken off and set again --
    // and measured again on every change to the root or body, answered each
    // of the page's writes with one of its own, in microtasks, and the tab
    // froze as the field opened.
    const DARK_TRANSPARENT_FIELDS = 'body { background-color: #1b1b1b; color: #e6e6e6; } textarea, input { background: transparent; color: #000; }';
    const pages = [
      {
        // Tailwind 4's preflight: fields inherit their text and clear their
        // background, and nothing behind them is opaque.
        name: 'Tailwind 4\'s preflight and an observer of the document\'s children that marks the body',
        css: 'button, input, select, optgroup, textarea { color: inherit; background-color: transparent; }',
        observe: (): void => {
          const observer = new MutationObserver(() => {
            window.observerCalls = (window.observerCalls ?? 0) + 1;
            document.body.classList.add('seen');
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        },
      },
      {
        name: 'an observer of every style attribute that marks the root',
        css: DARK_TRANSPARENT_FIELDS,
        observe: (): void => {
          const observer = new MutationObserver((records) => {
            window.observerCalls = (window.observerCalls ?? 0) + 1;
            if (records.some(record => record.target !== document.body && record.target !== document.documentElement)) {
              document.documentElement.setAttribute('data-touched', '1');
            }
          });
          observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], subtree: true });
        },
      },
      {
        name: 'an observer of every style attribute that counts on the root',
        css: DARK_TRANSPARENT_FIELDS,
        observe: (): void => {
          let count = 0;
          const observer = new MutationObserver((records) => {
            window.observerCalls = (window.observerCalls ?? 0) + 1;
            if (records.some(record => record.target !== document.body && record.target !== document.documentElement)) {
              document.documentElement.setAttribute('data-touched', String(count++));
            }
          });
          observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'], subtree: true });
        },
      },
    ];
    const fields = [
      { name: 'braille', key: 'b', selector: BRAILLE },
      { name: 'review', key: 'r', selector: REVIEW },
    ];

    /**
     * How many times the page's observer has been called.
     */
    async function observerCalls(page: Page): Promise<number> {
      return page.evaluate(() => window.observerCalls ?? 0);
    }

    for (const { name, css, observe } of pages) {
      for (const field of fields) {
        test(`opens the ${field.name} field and stays responsive on a page with ${name}`, async ({ page }) => {
          const barPage = await openChart(page, css);
          await page.evaluate(observe);

          // A frozen tab never answers the key press: give up on it rather
          // than wait for the test's own timeout.
          const pressed = await Promise.race([
            barPage.pressKey(field.key, `open ${field.name}`).then(() => true),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
          ]);
          expect(pressed, 'the page answers the key press').toBe(true);
          await expect(page.locator(field.selector)).toBeFocused();
          await settle(page);

          // And the page and the floor have stopped answering each other.
          const calls = await observerCalls(page);
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 300)));
          expect(await observerCalls(page), 'the page\'s observer calls, 300 ms on').toBe(calls);
          const paint = await fieldPaint(page, field.selector);
          expect(paint.ratio, `${field.name}: ${paint.color} on ${paint.background}`).toBeGreaterThanOrEqual(AA);
        });
      }
    }
  });

  test.describe('under forced colours', () => {
    // A guard: forced colours replace both colours with the system's, over
    // the reader's pair and over any the floor would give.
    for (const colorScheme of ['light', 'dark'] as const) {
      for (const highContrast of [false, true]) {
        test(`keeps both fields readable in the ${colorScheme} scheme with high contrast ${highContrast ? 'on' : 'off'}`, async ({ page }) => {
          await page.emulateMedia({ forcedColors: 'active', colorScheme });
          const barPage = await openChart(page, `${INHERIT_RESET} body { background-color: #222; color: #fff; }`);
          if (highContrast) {
            await barPage.pressKey('c', 'turn high contrast on');
          }

          expectReadable(await readFields(page, barPage));
        });
      }
    }
  });
});
