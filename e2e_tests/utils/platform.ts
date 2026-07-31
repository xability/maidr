import type { Page } from '@playwright/test';

/**
 * Resolves the control/command modifier for MAIDR's shortcuts by asking the
 * browser, exactly the way `Platform.IS_MAC` in src/util/platform.ts does.
 *
 * This cannot be decided from `process.platform`. Playwright's WebKit build on
 * Linux is a Mac-flavoured WebKit that reports `navigator.platform` as
 * "MacIntel", so MAIDR binds Command there while the host OS is Linux. A
 * modifier chosen from the host sends Control, which WebKit ignores, and every
 * Ctrl-combination shortcut — help, settings, extreme navigation, autoplay —
 * silently no-ops.
 * @param page - The Playwright page, already navigated to a document
 * @returns 'Meta' when the browser reports macOS, otherwise 'Control'
 */
export async function modifierKey(page: Page): Promise<'Meta' | 'Control'> {
  const isMac = await page.evaluate(() => {
    const navigatorWithUaData = navigator as Navigator & {
      userAgentData?: { platform?: string };
    };
    const platform
      = navigatorWithUaData.userAgentData?.platform ?? navigator.platform;
    return platform.toLowerCase().includes('mac');
  });

  return isMac ? 'Meta' : 'Control';
}
