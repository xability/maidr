import { expect, test } from '@playwright/test';
import { HistogramPage } from '../page-objects/plots/histogram-page';
import { installAnnouncementRecorder, recordedAnnouncements } from '../utils/announcements';
import { TestConstants } from '../utils/constants';

/**
 * The announcement recorder is what every mode assertion now depends on, so
 * its contract is pinned here rather than left to the specs that consume it.
 *
 * It reads the `role="alert"` node — the live region a screen reader hears —
 * and not `#maidr-text-container`, which renders a different string that is
 * not gated by the `announce` flag. The last test is the one that tells those
 * two apart.
 */
test.describe('Announcement recorder', () => {
  test('records one entry per announcement, in order', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();

    const before = (await recordedAnnouncements(page)).length;
    await histogramPage.toggleTextMode();
    await histogramPage.toggleTextMode();
    await histogramPage.toggleTextMode();

    const recorded = (await recordedAnnouncements(page)).slice(before);
    expect(recorded).toEqual([
      TestConstants.TEXT_MODE_TERSE_MESSAGE,
      TestConstants.TEXT_MODE_OFF_MESSAGE,
      TestConstants.TEXT_MODE_VERBOSE_MESSAGE,
    ]);
  });

  test('records a repeated identical message every time', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();
    await histogramPage.moveToFirstDataPoint();

    // Walking off the same edge repeatedly announces the same string each
    // time. MAIDR re-mounts the alert so a screen reader re-reads it, and the
    // recorder has to see each one — comparing text alone would collapse them.
    const before = (await recordedAnnouncements(page)).length;
    await histogramPage.moveToPreviousDataPoint();
    await histogramPage.moveToPreviousDataPoint();
    await histogramPage.moveToPreviousDataPoint();

    const recorded = (await recordedAnnouncements(page)).slice(before);
    expect(recorded).toEqual([
      TestConstants.PLOT_EXTREME_VERIFICATION,
      TestConstants.PLOT_EXTREME_VERIFICATION,
      TestConstants.PLOT_EXTREME_VERIFICATION,
    ]);
  });

  test('ignores display updates that were never announced', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();
    await histogramPage.moveToFirstDataPoint();

    const container = page.locator(`#${TestConstants.MAIDR_NOTIFICATION_CONTAINER}`);
    const textBefore = await container.textContent();
    const before = (await recordedAnnouncements(page)).length;

    // Autoplay turns the `announce` flag off, so no alert node renders while
    // it runs even though the display text advances on every step.
    await histogramPage.startForwardAutoplay();
    await page.waitForTimeout(2000);

    // The display really did move — otherwise this test proves nothing.
    expect(await container.textContent()).not.toBe(textBefore);

    // ...and none of it counted as an announcement.
    expect((await recordedAnnouncements(page)).length).toBe(before);
  });
});
