import type { Page } from '@playwright/test';
import { TestConstants } from './constants';

/** Shape the recorder installs on `window`. */
interface AnnouncementWindow extends Window {
  __maidrAnnouncements?: string[];
}

/**
 * Records every update to MAIDR's text alert region.
 *
 * The page objects used to read that region straight after dispatching a key,
 * which races the announcement: fast enough to pass in Chromium and Firefox,
 * and a flake in WebKit under load. Waiting only after the fact does not fix
 * it either, because an announcement the test arrived too late for is already
 * gone — waiting cannot bring it back.
 *
 * Observing instead means the count advances the moment MAIDR announces, so an
 * action can wait for its own announcement before the assertion reads anything.
 * The region is keyed by a revision counter and re-mounts on every notify (see
 * the note on `announceRotorMessage` in src/service/rotor.ts), so a repeated
 * identical message still registers.
 *
 * Idempotent: installing twice on the same page is a no-op, and the recorder
 * survives for the life of the page. Observation is rooted at `document.body`
 * rather than the container, because MAIDR creates the container on activation
 * and it is replaced wholesale on each announcement.
 * @param page - The Playwright page, already navigated to the example
 */
export async function installAnnouncementRecorder(page: Page): Promise<void> {
  await page.evaluate((containerId) => {
    const w = window as AnnouncementWindow;
    if (w.__maidrAnnouncements) {
      return;
    }
    w.__maidrAnnouncements = [];

    // One entry per observer callback, not per MutationRecord: a single
    // announcement replaces several nodes and would otherwise count as many.
    new MutationObserver(() => {
      const text = (document.getElementById(containerId)?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        w.__maidrAnnouncements?.push(text);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, TestConstants.MAIDR_NOTIFICATION_CONTAINER);
}

/**
 * Number of announcements recorded so far. Callers capture this before an
 * action and pass it to {@link waitForAnnouncementAfter}.
 * @param page - The Playwright page
 * @returns The count, or 0 when the recorder is not installed
 */
export async function announcementCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => (window as AnnouncementWindow).__maidrAnnouncements?.length ?? 0,
  );
}

/**
 * Waits until a new announcement lands after the given count.
 *
 * Resolves `false` on timeout rather than throwing. Not every keypress
 * announces — an out-of-bounds move in some modes is silent — and a caller
 * that waited in vain should carry on and let its own assertion decide, the
 * same way `isModeActive` does.
 * @param page - The Playwright page
 * @param since - Count captured before the action
 * @param timeout - How long to wait, in milliseconds
 * @returns True if an announcement arrived, false if the wait timed out
 */
export async function waitForAnnouncementAfter(
  page: Page,
  since: number,
  timeout = 2000,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      count => ((window as AnnouncementWindow).__maidrAnnouncements?.length ?? 0) > count,
      since,
      { timeout, polling: 16 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Announcements recorded after the given count, oldest first.
 *
 * Assertions use this rather than the region's current text. An action's
 * announcement can be replaced by a later one before the assertion reads —
 * and an announcement from an earlier, un-awaited action can arrive in the
 * middle — so "was this announced by this action?" is a question about the
 * recorded window, not about whatever happens to be on screen now.
 * @param page - The Playwright page
 * @param since - Count captured before the action
 * @returns The announcements recorded since that point
 */
export async function announcementsSince(page: Page, since: number): Promise<string[]> {
  return await page.evaluate(
    count => ((window as AnnouncementWindow).__maidrAnnouncements ?? []).slice(count),
    since,
  );
}

/**
 * Every announcement recorded so far, oldest first.
 *
 * Use this to assert a sequence of transient announcements — the shape
 * `.claude/rules/testing.md` prescribes for live regions — rather than
 * sampling the region once per step and hoping each sample lands in time.
 * @param page - The Playwright page
 * @returns The recorded announcements
 */
export async function recordedAnnouncements(page: Page): Promise<string[]> {
  return await page.evaluate(
    () => [...((window as AnnouncementWindow).__maidrAnnouncements ?? [])],
  );
}
