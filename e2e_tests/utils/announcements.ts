import type { Page } from '@playwright/test';
import { TestConstants } from './constants';

/** Shape the recorder installs on `window`. */
interface AnnouncementWindow extends Window {
  __maidrAnnouncements?: string[];
}

/**
 * Records every announcement MAIDR makes.
 *
 * The page objects used to read the announcement straight after dispatching a
 * key, which races it: fast enough to pass in Chromium and Firefox, and a
 * flake in WebKit under load. Waiting only after the fact does not fix it
 * either, because an announcement the test arrived too late for is already
 * gone — waiting cannot bring it back.
 *
 * Observing instead means the count advances the moment MAIDR announces, so an
 * action can wait for its own announcement before the assertion reads anything.
 * Each announcement is a new element added to the chart's announcement live
 * region, keyed by a revision counter (see the note on `announceRotorMessage`
 * in src/service/rotor.ts), so a repeated identical message still registers.
 *
 * What counts as an announcement is an element added to that region, not the
 * visible text container: only the region is gated by the `announce` flag, so
 * the container can advance — during autoplay, for instance — while a screen
 * reader hears nothing.
 *
 * Idempotent: installing twice on the same page is a no-op, and the recorder
 * survives for the life of the page. Observation is rooted at `document.body`
 * rather than at a region because a page can hold several charts, each with
 * its own region, and a chart its host renders again gets a new one.
 *
 * Returns the count so an action can install and mark in a single page call.
 * Installing lazily rather than once at activation is deliberate: a navigation
 * replaces `window` and takes the recorder with it, so pinning installation to
 * one earlier moment would go quietly blind afterwards.
 * @param page - The Playwright page, already navigated to the example
 * @returns The number of announcements already recorded
 */
export async function installAnnouncementRecorder(page: Page): Promise<number> {
  return await page.evaluate((regionSelector) => {
    const w = window as AnnouncementWindow;
    if (w.__maidrAnnouncements) {
      return w.__maidrAnnouncements.length;
    }
    w.__maidrAnnouncements = [];

    // Read what is added to the announcement region, NOT #maidr-text-container.
    // They can differ: src/ui/component/Text.tsx renders `visual` into the
    // container and `current` into the region, and only `current` is gated by
    // the `announce` flag. During autoplay `announce` is false, so the
    // container keeps updating per step while nothing is announced — watching
    // the container would record announcements a screen reader never heard.
    //
    // Only what lands directly in a region counts, so a `role="alert"`
    // elsewhere — MUI's inside the settings dialog, or the page's own —
    // cannot be mistaken for an announcement.
    //
    // Walk the mutation records rather than sampling whatever is live when the
    // callback runs: a callback batches every record since the last flush, so
    // two announcements made before one flush would otherwise collapse into
    // one entry.
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!(mutation.target instanceof Element) || !mutation.target.matches(regionSelector)) {
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (text) {
            w.__maidrAnnouncements?.push(text);
          }
        }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
    });

    return w.__maidrAnnouncements.length;
  }, TestConstants.MAIDR_ANNOUNCEMENT_REGION);
}

/**
 * Waits until a new announcement lands after the given count.
 *
 * Resolves `false` on timeout rather than throwing. Not every keypress
 * announces — an out-of-bounds move in some modes is silent — and a caller
 * that waited in vain should carry on and let its own assertion decide, the
 * same way `isModeActive` does.
 *
 * Only a timeout means that. Anything else — a destroyed execution context
 * from an unexpected navigation, say — is a broken run rather than a silent
 * key, and is rethrown so it cannot pass for an expected no-op.
 * @param page - The Playwright page
 * @param since - Count captured before the action
 * @param timeout - How long to wait, in milliseconds
 * @returns True if an announcement arrived, false if the wait timed out
 * @throws The original error if the wait failed for any reason but a timeout
 */
export async function waitForAnnouncementAfter(
  page: Page,
  since: number,
  timeout = TestConstants.ANNOUNCEMENT_TIMEOUT,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      count => ((window as AnnouncementWindow).__maidrAnnouncements?.length ?? 0) > count,
      since,
      { timeout, polling: 16 },
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return false;
    }
    throw error;
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
