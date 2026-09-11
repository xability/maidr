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
 */

/**
 * What a screen reader meets before activation: the wrapper's accessible name
 * and the language the article declares.
 * @param page - The Playwright page
 * @returns The pre-activation instruction and the article's `lang`
 */
async function preActivationState(page: Page): Promise<{ instruction: string; lang: string }> {
  const barPlotPage = new BarPlotPage(page);
  await barPlotPage.navigateToBarPlot();
  const wrapper = page.locator('article[id^="maidr-article"] figure > div[tabindex="0"]').first();
  await expect(wrapper).toHaveAttribute('aria-label', /.+/);
  return {
    instruction: (await wrapper.getAttribute('aria-label')) ?? '',
    lang: (await page.locator('article[id^="maidr-article"]').first().getAttribute('lang')) ?? '',
  };
}

test.describe('language from the browser', () => {
  test.describe('a Korean browser', () => {
    test.use({ locale: 'ko-KR' });

    test('loads in Korean before the chart is activated', async ({ page }) => {
      const { instruction, lang } = await preActivationState(page);

      expect(lang).toBe('ko');
      expect(instruction).toContain('maidr 그래프입니다');
      expect(instruction).not.toContain('This is a maidr plot');
    });

    test('announces the first data point in Korean', async ({ page }) => {
      const barPlotPage = new BarPlotPage(page);
      await barPlotPage.navigateToBarPlot();
      await barPlotPage.activateMaidr();

      await page.keyboard.press('ArrowRight');

      await expect(page.locator('[id^="maidr-text-container"]').first()).toContainText(/은|는/);
      await expect(page.locator('[id^="maidr-text-container"]').first()).not.toContainText(' is ');
    });
  });

  test.describe('an English browser', () => {
    test.use({ locale: 'en-US' });

    test('loads in English', async ({ page }) => {
      const { instruction, lang } = await preActivationState(page);

      expect(lang).toBe('en');
      expect(instruction).toContain('This is a maidr plot');
    });
  });
});
