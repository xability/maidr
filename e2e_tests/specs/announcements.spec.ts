import { expect, test } from '@playwright/test';
import { DEFAULT_SETTINGS } from '../../src/type/settings';
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

  test('records both announcements when two land in one flush', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();

    const before = (await recordedAnnouncements(page)).length;

    // Insert two alerts in one synchronous block so the observer sees both in
    // a single callback. Driving this through MAIDR would depend on two
    // notifies landing before one flush, which is not something a test can
    // force; the observer's own batching behaviour is what is under test, and
    // it is the reason this walks MutationRecords rather than sampling the
    // live node once per callback.
    await page.evaluate((containerId) => {
      const parent = document.getElementById(containerId)?.parentElement;
      if (!parent) {
        throw new Error(`No parent for #${containerId}`);
      }
      for (const text of ['First batched message', 'Second batched message']) {
        const alert = document.createElement('div');
        alert.setAttribute('role', 'alert');
        alert.textContent = text;
        parent.appendChild(alert);
      }
    }, TestConstants.MAIDR_NOTIFICATION_CONTAINER);

    await expect
      .poll(async () => (await recordedAnnouncements(page)).slice(before))
      .toEqual(['First batched message', 'Second batched message']);
  });

  test('records both announcements when one insertion carries two', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();

    const before = (await recordedAnnouncements(page)).length;

    // The same collapse as the test above, one level down. A MutationRecord
    // lists only the root of an inserted subtree, so taking the first match
    // inside that root would count one announcement where there are two.
    await page.evaluate((containerId) => {
      const parent = document.getElementById(containerId)?.parentElement;
      if (!parent) {
        throw new Error(`No parent for #${containerId}`);
      }
      const wrapper = document.createElement('div');
      for (const text of ['First nested message', 'Second nested message']) {
        const alert = document.createElement('div');
        alert.setAttribute('role', 'alert');
        alert.textContent = text;
        wrapper.appendChild(alert);
      }
      parent.appendChild(wrapper);
    }, TestConstants.MAIDR_NOTIFICATION_CONTAINER);

    await expect
      .poll(async () => (await recordedAnnouncements(page)).slice(before))
      .toEqual(['First nested message', 'Second nested message']);
  });

  test('falls back to the region when no action preceded the check', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();

    await histogramPage.toggleTextMode();

    // The first check reads the recorded window and consumes the mark.
    expect(await histogramPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE)).toBe(true);

    // The second has no action before it and no mark left, so it has to answer
    // from the region instead. Pinning this because the alternative — treating
    // a missing mark as "not active" — would be a silent false negative, and
    // because the contract is positional and not enforced by the types.
    expect(await histogramPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE)).toBe(true);
  });

  test('does not answer from a window an unwrapped keypress has invalidated', async ({ page }) => {
    const histogramPage = new HistogramPage(page);
    await histogramPage.navigateToHistogram();
    await installAnnouncementRecorder(page);
    await histogramPage.activateMaidr();

    // Awaited, so it leaves a mark behind: "Text mode is terse".
    await histogramPage.toggleTextMode();

    // Now change the mode again without going through the awaited path, the
    // way `toggleAxisTitle` presses its two keys. Text mode is off after this.
    await histogramPage.pressKey(TestConstants.TEXT_KEY, 'unwrapped text mode toggle');

    // If the earlier mark survived, the recorded window would still hold
    // "Text mode is terse" and this would report a mode that is no longer
    // active. An unwrapped keypress has to invalidate the window, so the check
    // falls back to the region and reads the state as it now is.
    expect(await histogramPage.isTextModeActive(TestConstants.TEXT_MODE_TERSE)).toBe(false);
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
    //
    // Sample at half the autoplay duration, derived rather than hard-coded:
    // reaching the last point flips `announce` back on and does announce, so a
    // fixed wait would silently start failing for an unrelated reason if the
    // default were ever tuned down.
    await histogramPage.startForwardAutoplay();
    await page.waitForTimeout(DEFAULT_SETTINGS.general.autoplayDuration / 2);

    // The display really did move — otherwise this test proves nothing.
    expect(await container.textContent()).not.toBe(textBefore);

    // ...and none of it counted as an announcement.
    expect((await recordedAnnouncements(page)).length).toBe(before);
  });
});
