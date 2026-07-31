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
 * What counts as an announcement is the `role="alert"` node, not the visible
 * text container: only the alert is gated by the `announce` flag, so the
 * container can advance — during autoplay, for instance — while a screen
 * reader hears nothing.
 *
 * Idempotent: installing twice on the same page is a no-op, and the recorder
 * survives for the life of the page. Observation is rooted at `document.body`
 * because MAIDR builds its UI on activation and re-mounts the alert on every
 * announcement, so there is no stable node to attach to.
 *
 * Returns the count so an action can install and mark in a single page call.
 * Installing lazily rather than once at activation is deliberate: a navigation
 * replaces `window` and takes the recorder with it, so pinning installation to
 * one earlier moment would go quietly blind afterwards.
 * @param page - The Playwright page, already navigated to the example
 * @returns The number of announcements already recorded
 */
export async function installAnnouncementRecorder(page: Page): Promise<number> {
  return await page.evaluate((containerId) => {
    const w = window as AnnouncementWindow;
    if (w.__maidrAnnouncements) {
      return w.__maidrAnnouncements.length;
    }
    w.__maidrAnnouncements = [];

    // Read the role="alert" node, NOT #maidr-text-container. They can differ:
    // src/ui/component/Text.tsx renders `visual` into the container and
    // `current` into the alert, and only `current` is gated by the `announce`
    // flag. During autoplay `announce` is false, so the container keeps
    // updating per step while nothing is announced — watching the container
    // would record announcements a screen reader never heard.
    //
    // Scoped to MAIDR's own region so MUI's role="alert" inside the settings
    // dialog cannot be mistaken for it.
    const inMaidrRegion = (node: Element): boolean =>
      document.getElementById(containerId)?.parentElement?.contains(node) ?? false;

    // The alert is keyed by a revision counter and re-mounts on every update,
    // so each announcement is a fresh node insertion. Walk the mutation
    // records rather than sampling whatever is live when the callback runs:
    // a callback batches every record since the last flush, so two alerts
    // inserted before one flush would otherwise collapse into one entry.
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }
          const alert = node.matches('[role="alert"]')
            ? node
            : node.querySelector('[role="alert"]');
          if (!alert || !inMaidrRegion(alert)) {
            continue;
          }
          const text = (alert.textContent ?? '').replace(/\s+/g, ' ').trim();
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
  }, TestConstants.MAIDR_NOTIFICATION_CONTAINER);
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
  timeout = TestConstants.ANNOUNCEMENT_TIMEOUT,
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
