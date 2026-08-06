import type { Page } from '@playwright/test';
import { TestConstants } from '../../utils/constants';
import { EmptySubplotError } from '../../utils/errors';
import { BasePage } from '../base-page';

/**
 * Page object for the empty-subplot regression fixture (issue #749).
 *
 * The fixture is a two-panel figure whose first panel has no layers at all, so
 * the interactions this exposes are the multi-panel lobby ones — stepping
 * between panels and pressing ENTER — rather than the data-point navigation
 * the plot page objects wrap. It points at `e2e_tests/fixtures/`, not
 * `examples/`, because a deliberately degenerate input is not a gallery demo.
 */
export class EmptySubplotPage extends BasePage {
  /**
   * Selectors for various UI elements
   */
  protected override readonly selectors = {
    notification: `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`,
    info: `#${TestConstants.MAIDR_INFO_CONTAINER} ${TestConstants.PARAGRAPH}`,
    svg: 'svg#empty-subplot-figure',
    helpModal: TestConstants.MAIDR_HELP_MODAL,
    helpModalTitle: TestConstants.MAIDR_HELP_MODAL_TITLE,
    helpModalClose: TestConstants.HELP_MENU_CLOSE_BUTTON,
    settingsModal: TestConstants.MAIDR_SETTINGS_MODAL,
    chatModal: TestConstants.MAIDR_CHAT_MODAL,
  };

  /**
   * Creates a new EmptySubplotPage instance
   * @param page - The Playwright page object
   */
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates to the empty-subplot fixture.
   * @returns Promise resolving when navigation completes
   * @throws EmptySubplotError if navigation fails
   */
  public async navigateToEmptySubplotFigure(): Promise<void> {
    try {
      await super.navigateTo('e2e_tests/fixtures/empty-subplot.html');
      await super.verifyPlotLoaded(this.selectors.svg);
    } catch (error) {
      throw new EmptySubplotError('Failed to navigate to the empty-subplot fixture', { cause: error });
    }
  }

  /**
   * Activates MAIDR by focusing the plot.
   *
   * This is the step the bug broke: construction threw before MAIDR ever
   * attached, so Tab moved focus straight past the figure and this failed.
   * @returns Promise resolving when MAIDR is activated
   * @throws EmptySubplotError if MAIDR cannot be activated
   */
  public override async activateMaidr(): Promise<void> {
    try {
      await super.activateMaidr(this.selectors.svg, 'empty-subplot-figure');
    } catch (error) {
      throw new EmptySubplotError('Failed to activate MAIDR', { cause: error });
    }
  }

  /**
   * Presses an arrow key to announce the panel the lobby starts on.
   *
   * The first arrow key in the lobby is consumed by initial entry: it reports
   * the focused panel without moving off it (see `MovableGrid.moveOnce`). This
   * is a separate method rather than a first call to {@link moveToNextSubplot}
   * so a spec reads as what it does — a caller that wants to reach the *next*
   * panel has to say so twice, which is what a user does.
   * @returns Promise resolving once the panel has been announced
   * @throws KeypressError if the keypress fails
   */
  public async announceStartingSubplot(): Promise<void> {
    await super.pressKeyAwaitingAnnouncement(
      TestConstants.DOWN_ARROW_KEY,
      'announce starting subplot',
    );
  }

  /**
   * Steps to the next subplot in the figure lobby. Call
   * {@link announceStartingSubplot} first, or this press is consumed by
   * initial entry and moves nothing.
   * @returns Promise resolving once the move has been announced
   * @throws KeypressError if the keypress fails
   */
  public async moveToNextSubplot(): Promise<void> {
    await super.pressKeyAwaitingAnnouncement(
      TestConstants.DOWN_ARROW_KEY,
      'move to next subplot',
    );
  }

  /**
   * Presses ENTER on the focused subplot. Named for the keypress rather than
   * the outcome because on an empty panel the entry is refused — which is the
   * behaviour the spec asserts.
   * @returns Promise resolving once the result has been announced
   * @throws KeypressError if the keypress fails
   */
  public async pressEnterOnFocusedSubplot(): Promise<void> {
    await super.pressKeyAwaitingAnnouncement(
      TestConstants.ENTER_KEY,
      'enter focused subplot',
    );
  }
}
