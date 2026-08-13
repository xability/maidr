import { expect, test } from '@playwright/test';
import { EmptySubplotPage } from '../page-objects/plots/emptySubplot-page';
import { recordedAnnouncements } from '../utils/announcements';

/**
 * Regression coverage for issue #749.
 *
 * A subplot authored with an empty `layers` array threw in
 * `Subplot.activeTrace` while the plot context was being built — before any
 * user interaction. The exception escaped initialisation, so MAIDR never
 * attached: Tab did nothing, nothing was ever announced, and *every* panel in
 * the figure was unreachable, including well-formed ones.
 *
 * The unit suite (`test/model/emptySubplot.test.ts`) pins the model contract.
 * These specs pin what the user actually gets, which is the part the unit
 * tests cannot see: that MAIDR attaches at all, that the empty panel says so
 * out loud, and that its well-formed sibling stays navigable. Every assertion
 * below would have failed before the fix — the first at the Tab that never
 * focused anything.
 *
 * The fixture's panel 1 is the layerless one and the lobby starts there, so
 * the empty panel is what the user meets first.
 */
const EMPTY_PANEL_ANNOUNCEMENT = 'Subplot 1 of 2 is empty, nothing to describe.';

test.describe('Subplot with no layers', () => {
  test('attaches without an uncaught error', async ({ page }) => {
    // The reported symptom is an exception, and it escaped *initialisation* —
    // it never reached a state assertion. Watching for it directly is the only
    // check here that fails for the original reason: MAIDR still renders a
    // focusable wrapper after the throw, so asserting on focus alone passes
    // against the unfixed build.
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const plotPage = new EmptySubplotPage(page);
    await plotPage.navigateToEmptySubplotFigure();
    await plotPage.activateMaidr();

    expect(pageErrors).toEqual([]);
  });

  test('announces the empty panel rather than describing a plot that is not there', async ({ page }) => {
    const plotPage = new EmptySubplotPage(page);
    await plotPage.navigateToEmptySubplotFigure();
    await plotPage.activateMaidr();

    // Verbose is the default text mode, so without the fix the lobby would
    // read "a multi-layered plot containing  plots" — with the trace types
    // missing from the middle — followed by an ENTER prompt that cannot do
    // anything.
    const before = (await recordedAnnouncements(page)).length;
    await plotPage.announceStartingSubplot();

    const recorded = (await recordedAnnouncements(page)).slice(before);
    expect(recorded).toContain(EMPTY_PANEL_ANNOUNCEMENT);
  });

  test('refuses to enter the empty panel and says why', async ({ page }) => {
    const plotPage = new EmptySubplotPage(page);
    await plotPage.navigateToEmptySubplotFigure();
    await plotPage.activateMaidr();
    await plotPage.announceStartingSubplot();

    const before = (await recordedAnnouncements(page)).length;
    await plotPage.pressEnterOnFocusedSubplot();

    // Refused rather than entered: the user stays in the lobby with every
    // other panel reachable, and the keypress is not silent.
    const recorded = (await recordedAnnouncements(page)).slice(before);
    expect(recorded).toContain(EMPTY_PANEL_ANNOUNCEMENT);
  });

  test('keeps the well-formed sibling panel fully navigable', async ({ page }) => {
    const plotPage = new EmptySubplotPage(page);
    await plotPage.navigateToEmptySubplotFigure();
    await plotPage.activateMaidr();

    // This is what the bug cost: a figure where one malformed panel silenced
    // the panels that were perfectly describable.
    await plotPage.announceStartingSubplot();
    await plotPage.moveToNextSubplot();
    await plotPage.pressEnterOnFocusedSubplot();

    const before = (await recordedAnnouncements(page)).length;
    await plotPage.moveToNextDataPoint();

    const recorded = (await recordedAnnouncements(page)).slice(before);
    expect(recorded).toContain('Category is A, Value is 1');
  });
});
