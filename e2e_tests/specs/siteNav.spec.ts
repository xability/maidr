import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * The site's top nav, zoomed in (#1290).
 *
 * Browser zoom narrows the viewport in CSS pixels, so a 1280 x 800 window at
 * 200% lays the page out at 640 x 400, and at 400% at 320 x 200 (WCAG 1.4.10's
 * reflow size). The nav used to be one row that never wrapped, 859 CSS pixels
 * wide whatever the window, so zooming pushed its links off the right edge and
 * left the bottom of the Adapters menu out of reach.
 *
 * The template is loaded as-is: its `{{...}}` placeholders are text, and the
 * nav's layout does not depend on what the build puts in them.
 */
const TEMPLATE = 'docs/template.html';

/** A 1280 x 800 window at the zoom levels a reader steps through, plus one just past the breakpoint. */
const VIEWPORTS = [
  { zoom: '100%', width: 1280, height: 800 },
  { zoom: '125%', width: 1024, height: 640 },
  { zoom: '150%', width: 853, height: 533 },
  { zoom: '200%', width: 640, height: 400 },
  { zoom: '300%', width: 427, height: 267 },
  { zoom: '400%', width: 320, height: 200 },
  { zoom: 'short window', width: 961, height: 481 },
];

/**
 * Names of the nav's links and buttons that are not wholly inside the
 * viewport horizontally.
 */
async function clippedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll<HTMLElement>('nav[aria-label="Main"] :is(a, button)'))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.left < -0.5 || box.right > width + 0.5);
      })
      .map(el => el.textContent?.trim() ?? '');
  });
}

for (const { zoom, width, height } of VIEWPORTS) {
  test.describe(`site nav at ${zoom} (${width} x ${height})`, () => {
    test.use({ viewport: { width, height } });

    test.beforeEach(async ({ page }) => {
      await page.goto(TEMPLATE);
    });

    test('should keep every nav control inside the viewport', async ({ page }) => {
      expect(await clippedControls(page)).toEqual([]);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });

    test('should bring every Adapters menu item into view', async ({ page }) => {
      await page.locator('#adapters-trigger').click();
      const items = page.locator('#adapters-menu a[role="menuitem"]');
      await expect(items.first()).toBeFocused();

      // Arrow keys are how a keyboard reader walks the menu; each focused item
      // must end up on screen, the last one included. Not `ratio: 1`: focus
      // scrolls an item to the nearest edge, which can leave a fraction of a
      // pixel under it.
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        const item = items.nth(i);
        await expect(item).toBeFocused();
        await expect(item).toBeInViewport({ ratio: 0.9 });
        await page.keyboard.press('ArrowDown');
      }
      expect(await clippedControls(page)).toEqual([]);
    });
  });
}
