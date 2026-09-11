import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';

/**
 * A reader who has never opened MAIDR's settings should hear the chart in
 * their browser's language from the first announcement — the pre-activation
 * instruction a screen reader reads before the chart is ever focused — and
 * the wrapper should declare that language so the screen reader switches
 * voice. Nothing is stored in these tests: the language comes from the
 * browser alone.
 *
 * The example pages load `maidr.js` alone, so every language but English
 * arrives through the locale pack MAIDR fetches from beside the bundle. The
 * article's `lang` flips the moment the language is chosen, and the label
 * follows once the pack registers, so both are awaited rather than read.
 */

/**
 * Opens the bar chart and waits for its language to settle.
 * @param page - The Playwright page
 * @param lang - The language the page is expected to settle on
 * @returns The wrapper's pre-activation instruction in that language
 */
async function preActivationInstruction(page: Page, lang: string): Promise<string> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  const article = page.locator('article[id^="maidr-article"]').first();
  const wrapper = article.locator('figure > div[tabindex="0"]').first();
  await expect(article).toHaveAttribute('lang', lang);
  if (lang === 'en') {
    await expect(wrapper).toHaveAttribute('aria-label', /This is a maidr plot/);
  } else {
    await expect(wrapper).not.toHaveAttribute('aria-label', /This is a maidr plot/);
  }
  return (await wrapper.getAttribute('aria-label')) ?? '';
}

test.describe('language from the browser', () => {
  test.describe('a Korean browser', () => {
    test.use({ locale: 'ko-KR' });

    test('loads in Korean before the chart is activated', async ({ page }) => {
      const instruction = await preActivationInstruction(page, 'ko');

      expect(instruction).toContain('maidr 그래프입니다');
    });

    test('announces the first data point in Korean', async ({ page }) => {
      await preActivationInstruction(page, 'ko');
      const barPlotPage = new BarPlotPage(page);
      await barPlotPage.activateMaidr();

      await page.keyboard.press('ArrowRight');

      const text = page.locator('[id^="maidr-text-container"]').first();
      await expect(text).toContainText(/은|는/);
      await expect(text).not.toContainText(' is ');
    });
  });

  for (const [browserLocale, lang] of [
    ['ja-JP', 'ja'],
    ['zh-CN', 'zh'],
    ['es-ES', 'es'],
    ['de-DE', 'de'],
    ['fr-FR', 'fr'],
    ['it-IT', 'it'],
    ['hi-IN', 'hi'],
  ] as const) {
    test.describe(`a ${browserLocale} browser`, () => {
      test.use({ locale: browserLocale });

      test(`loads in ${lang} before the chart is activated`, async ({ page }) => {
        const instruction = await preActivationInstruction(page, lang);

        expect(instruction.length).toBeGreaterThan(20);
      });
    });
  }

  test.describe('an English browser', () => {
    test.use({ locale: 'en-US' });

    test('loads in English', async ({ page }) => {
      const instruction = await preActivationInstruction(page, 'en');

      expect(instruction).toContain('This is a maidr plot of type: vertical bar.');
    });
  });
});
