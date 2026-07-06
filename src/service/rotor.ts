import type { CompareModeInfo, RotorFilterUnit } from '@model/abstract';
import type { Context } from '@model/context';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { AbstractTrace } from '@model/abstract';
import { isGridNavigable } from '@type/navigation';
import { Constant } from '@util/constant';

/**
 * Manages rotor-based navigation for the active trace via alt+shift+up and alt+shift+down
 *
 * Purpose:
 * - Provide modal navigation over a trace by rotating through available modes.
 *
 * Available modes vary by trace type:
 * - Non-scatter traces: DATA_MODE → LOWER_VALUE_MODE → HIGHER_VALUE_MODE
 * - Scatter traces (with grid): ROW_COL_MODE → GRID_MODE
 * - Scatter traces (no grid): ROW_COL_MODE only
 *
 * Mode descriptions:
 * - DATA_MODE / ROW_COL_MODE: Default data browsing. The display name is trace-specific.
 * - LOWER_VALUE_MODE: Navigate to data points with lower y-values (non-scatter only).
 * - HIGHER_VALUE_MODE: Navigate to data points with higher y-values (non-scatter only).
 * - GRID_MODE: Navigate by grid cells in scatter plots (scatter with grid config only).
 *
 * Responsibilities:
 * - Track the current rotor mode and expose helpers to cycle forward/backward across modes.
 * - Coordinate scope focus: entering a compare mode (LOWER/HIGHER) may switch focus to
 *   the rotor scope; returning to data mode restores focus to the trace scope.
 * - Delegate directional movement to the active {@link AbstractTrace} implementation using
 *   rotor-aware APIs, with a fallback to compare-based traversal when rotor methods are
 *   unavailable.
 *
 * Dependencies:
 * - Context: Provides the active trace and current scope.
 * - TextService: Reserved for user-facing feedback/messages and parity with other services.
 *
 * Notes:
 * - UI-agnostic: this service contains no rendering logic and does not depend on the UI.
 * - Returns user-facing messages from movement methods when a move is not possible; callers
 *   may surface these through the ViewModel/UI.
 */
export class RotorNavigationService {
  private readonly context: Context;
  private readonly text: TextService;
  private readonly notification: NotificationService;
  private rotorIndex: number;

  /**
   * Creates a new RotorNavigationService instance.
   * @param context - The context providing access to the active trace
   * @param text - Provides terse/verbose/off mode for message formatting
   * @param notification - Used to push rotor boundary messages (intersection
   *   and compare mode) through the text alert region. The alert region
   *   re-mounts on every dispatch (keyed by a revision counter), which is what
   *   causes screen readers to re-announce on repeat key presses. Without
   *   this, identical messages dispatched only to the rotor area do not
   *   re-announce.
   */
  public constructor(context: Context, text: TextService, notification: NotificationService) {
    this.context = context;
    this.rotorIndex = 0;
    this.text = text;
    this.notification = notification;
  }

  /**
   * Advances to the next rotor navigation mode.
   * @returns The name of the new rotor mode, or grid info if entering grid mode
   */
  public moveToNextRotorUnit(): string {
    const modes = this.getAvailableModes();
    this.rotorIndex = (this.rotorIndex + 1) % modes.length;

    this.setMode();
    return this.formatModeDisplay();
  }

  /**
   * Moves to the previous rotor navigation mode.
   * @returns The name of the new rotor mode, or grid info if entering grid mode
   */
  public moveToPrevRotorUnit(): string {
    const modes = this.getAvailableModes();
    this.rotorIndex = (this.rotorIndex - 1 + modes.length) % modes.length;

    this.setMode();
    return this.formatModeDisplay();
  }

  /**
   * Formats the mode display string.
   * For grid mode, returns "GRID NAVIGATION: 5×4 GRID".
   * For other modes, returns the mode name.
   */
  private formatModeDisplay(): string {
    const mode = this.getMode();
    if (mode === Constant.GRID_MODE) {
      const activeTrace = this.context.active;
      if (isGridNavigable(activeTrace)) {
        const dims = activeTrace.getGridDimensions();
        if (dims) {
          return `GRID NAVIGATION: ${dims.rows}×${dims.cols} GRID`;
        }
      }
    }
    return mode;
  }

  /**
   * Gets the current rotor mode index.
   * @returns The current rotor index
   */
  public getCurrentUnit(): number {
    return this.rotorIndex;
  }

  /**
   * Moves to the next data point in the specified direction based on current compare mode.
   * @param direction - The direction to move ('left' or 'right')
   * @returns Error message if move failed, null otherwise
   */
  public callMoveToNextCompareMethod(direction: 'left' | 'right'): string | null {
    const activeTrace = this.context.active;

    const compareType = this.getCompareType();
    if (compareType !== 'lower' && compareType !== 'higher') {
      console.error(`Unexpected compare type: ${compareType}`);
      return null;
    }
    // Check if activeTrace is an instance of AbstractTrace and supports moveToNextHigherValue
    if (activeTrace instanceof AbstractTrace) {
      const xValue = activeTrace.getCurrentXValue(); // Get the current X value
      if (xValue !== null) {
        const moved = activeTrace.moveToNextCompareValue(direction, compareType);
        if (!moved) {
          const msg = this.getMessage(this.getCompareNoun(compareType), direction);
          console.warn(msg);
          return this.announceRotorMessage(msg);
        }
      } else {
        console.error('Unable to retrieve the current X value.');
      }
    } else {
      console.error('The active trace does not support \'callMoveToNextCompareMethod\'.');
    }
    return null;
  }

  /**
   * Moves up to a data point with lower/higher value based on rotor mode,
   * or moves up one grid cell in grid mode.
   * @returns Error message if move failed, null otherwise
   */
  public moveUp(): string | null {
    // Resolve the current rotor mode once. getMode() walks the capability
    // list via getAvailableModes(), so caching it here avoids doing that
    // twice per keystroke when dispatching to GRID_MODE / INTERSECTION_MODE.
    const mode = this.getMode();
    if (mode === Constant.GRID_MODE) {
      return this.moveGrid('up');
    }
    if (mode === Constant.INTERSECTION_MODE) {
      // The model is intentionally NOT moved here — vertical navigation is
      // unavailable in intersection mode. We still must push the message
      // through notification.notify so the text alert region re-mounts and
      // screen readers re-announce on repeat key presses; returning the
      // message only to the rotor area would announce once and stay silent
      // for subsequent identical hits.
      return this.announceRotorMessage(this.getIntersectionVerticalUnavailableMessage());
    }

    const filterUnit = this.getActiveFilterUnit(mode);
    if (filterUnit) {
      return this.moveFilter(filterUnit, 'up');
    }

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveUpRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareNoun(this.getCompareType()), 'above');
          console.warn(msg);
          return this.announceRotorMessage(msg);
        }
      }
    } catch {
      // default behavior is to mirror move right
      return this.moveRight();
    }
    return null;
  }

  /**
   * Moves down to a data point with lower/higher value based on rotor mode,
   * or moves down one grid cell in grid mode.
   * @returns Error message if move failed, null otherwise
   */
  public moveDown(): string | null {
    const mode = this.getMode();
    if (mode === Constant.GRID_MODE) {
      return this.moveGrid('down');
    }
    if (mode === Constant.INTERSECTION_MODE) {
      // See moveUp() — model not moved; route through notification so the
      // alert region re-mounts and the SR re-announces on repeat presses.
      return this.announceRotorMessage(this.getIntersectionVerticalUnavailableMessage());
    }

    const filterUnit = this.getActiveFilterUnit(mode);
    if (filterUnit) {
      return this.moveFilter(filterUnit, 'down');
    }

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveDownRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareNoun(this.getCompareType()), 'below');
          console.warn(msg);
          return this.announceRotorMessage(msg);
        }
      }
    } catch {
      // default behavior is to mirror move left
      return this.moveLeft();
    }
    return null;
  }

  /**
   * Moves left to a data point with lower/higher value based on rotor mode,
   * or moves left one grid cell in grid mode.
   * @returns Error message if move failed, null otherwise
   */
  public moveLeft(): string | null {
    const mode = this.getMode();
    if (mode === Constant.GRID_MODE) {
      return this.moveGrid('left');
    }
    if (mode === Constant.INTERSECTION_MODE) {
      return this.moveIntersection('left');
    }

    const filterUnit = this.getActiveFilterUnit(mode);
    if (filterUnit) {
      return this.moveFilter(filterUnit, 'left');
    }

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveLeftRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareNoun(this.getCompareType()), 'left');
          console.warn(msg);
          return this.announceRotorMessage(msg);
        }
      }
    } catch {
      // default behavior is to mirror move left
      return this.callMoveToNextCompareMethod('left');
    }
    return null;
  }

  /**
   * Moves right to a data point with lower/higher value based on rotor mode,
   * or moves right one grid cell in grid mode.
   * @returns Error message if move failed, null otherwise
   */
  public moveRight(): string | null {
    const mode = this.getMode();
    if (mode === Constant.GRID_MODE) {
      return this.moveGrid('right');
    }
    if (mode === Constant.INTERSECTION_MODE) {
      return this.moveIntersection('right');
    }

    const filterUnit = this.getActiveFilterUnit(mode);
    if (filterUnit) {
      return this.moveFilter(filterUnit, 'right');
    }

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveRightRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareNoun(this.getCompareType()), 'right');
          console.warn(msg);
          return this.announceRotorMessage(msg);
        }
      }
    } catch {
      // default behavior is to mirror move right
      return this.callMoveToNextCompareMethod('right');
    }
    return null;
  }

  /**
   * Sets the rotor mode based on the current index and updates context state.
   */
  public setMode(): void {
    const currMode = this.getMode();
    if (this.isDataMode(currMode)) {
      this.context.setRotorEnabled(false);
      this.notifyGridMode(false);
      return;
    }
    this.context.setRotorEnabled(true);
    this.notifyGridMode(currMode === Constant.GRID_MODE);
  }

  /**
   * Gets the current rotor mode name.
   *
   * Known limitation: rotorIndex is not reset when the active plot/trace
   * changes. If the user cycles to a capability-gated mode (GRID_MODE or
   * INTERSECTION_MODE) and focus then moves to a trace that does not
   * advertise that capability, the modulo below silently wraps the index
   * onto a different mode without announcing the switch. Resetting the
   * rotor on context change is a broader UX decision tracked separately
   * from this file.
   * @returns The display name of the current rotor mode
   */
  public getMode(): string {
    const modes = this.getAvailableModes();
    // Clamp index in case modes list changed between cycles
    const idx = this.rotorIndex % modes.length;
    return modes[idx];
  }

  /**
   * Gets the compare-mode labels and message nouns for the active trace.
   * Traces can rename the two compare units (e.g., the candlestick delta
   * layer exposes them as "above line" / "below line"); everything else
   * falls back to the classic lower/higher value modes.
   */
  private getCompareInfo(): CompareModeInfo {
    const activeTrace = this.context.active;
    if (activeTrace instanceof AbstractTrace) {
      return activeTrace.compareModeInfo();
    }
    return {
      lower: { label: Constant.LOWER_VALUE_MODE, noun: 'lower value' },
      higher: { label: Constant.HIGHER_VALUE_MODE, noun: 'higher value' },
    };
  }

  /**
   * Gets the comparison type for the current rotor mode.
   * @returns 'lower' or 'higher' based on the current mode
   */
  public getCompareType(): 'lower' | 'higher' {
    const info = this.getCompareInfo();
    const currMode = this.getMode();
    if (currMode === info.higher.label) {
      return 'higher';
    } else if (currMode === info.lower.label) {
      return 'lower';
    }
    return 'lower'; // fallback
  }

  /**
   * Gets the noun used in boundary messages for a compare type, honoring
   * trace-specific renames (e.g., "point above the line").
   * @param type - The compare type to describe
   * @returns The noun for "No {noun} found ..." messages
   */
  private getCompareNoun(type: 'lower' | 'higher'): string {
    return this.getCompareInfo()[type].noun;
  }

  public getMessage(noun: string, direction: string): string {
    const isVertical = direction === 'above' || direction === 'below';
    const preposition = isVertical ? '' : 'on the ';
    const position = isVertical ? `${direction} ` : `to the ${direction} of `;
    return this.buildMessage(
      `No ${noun} found ${preposition}${direction}`,
      `No ${noun} found ${position}the current value.`,
    );
  }

  /**
   * Builds the list of available rotor modes based on active trace capabilities.
   * Modes are appended in a fixed order so that cycling with Alt+Shift+Up/Down
   * is predictable; future modes should be inserted with that ordering in mind.
   *
   * Order (when all capabilities are supported):
   *   1. Data mode (DATA_MODE or ROW_COL_MODE — the trace's data mode name)
   *   2. LOWER_VALUE_MODE   (if supportsCompareMode)
   *   3. HIGHER_VALUE_MODE  (if supportsCompareMode)
   *   4. GRID_MODE          (if grid-navigable and supportsGridMode)
   *   5. INTERSECTION_MODE  (if supportsIntersectionMode — e.g. multiline lines)
   *   6. Filter units       (getRotorFilterUnits — e.g. candlestick trend filters)
   */
  private getAvailableModes(): string[] {
    const activeTrace = this.context.active;
    const modes: string[] = [];

    if (activeTrace instanceof AbstractTrace) {
      modes.push(activeTrace.dataModeName());

      if (activeTrace.supportsCompareMode()) {
        const compareInfo = activeTrace.compareModeInfo();
        modes.push(compareInfo.lower.label);
        modes.push(compareInfo.higher.label);
      }

      if (isGridNavigable(activeTrace) && activeTrace.supportsGridMode()) {
        modes.push(Constant.GRID_MODE);
      }

      if (activeTrace.supportsIntersectionMode()) {
        modes.push(Constant.INTERSECTION_MODE);
      }

      for (const unit of activeTrace.getRotorFilterUnits()) {
        modes.push(unit.label);
      }
    } else {
      modes.push(Constant.DATA_MODE);
    }

    return modes;
  }

  /**
   * Resolves the trace's rotor filter unit matching the current mode, or null
   * when the current mode is a built-in (data/compare/grid/intersection) mode.
   * Filter units are matched by label, the same string cycled through the
   * rotor, so a stale index from a previous trace cannot resolve to the wrong
   * unit.
   * @returns The active filter unit, or null
   */
  private getActiveFilterUnit(mode: string): RotorFilterUnit | null {
    const activeTrace = this.context.active;
    if (!(activeTrace instanceof AbstractTrace)) {
      return null;
    }
    return activeTrace.getRotorFilterUnits().find(unit => unit.label === mode) ?? null;
  }

  /**
   * Delegates movement within a rotor filter unit to the active trace and maps
   * a failed move to a user-facing boundary message.
   *
   * Return convention matches the sibling move methods: null on success
   * (nothing to announce), a message string when bounded/unavailable.
   *
   * Filter units navigate along one axis only (e.g. candles left/right), so
   * up/down are announced as unavailable-in-this-mode — phrasing distinct
   * from a real positional boundary, mirroring intersection mode — without
   * touching the model.
   *
   * All messages route through notification.notify so the text alert region
   * re-mounts (it is keyed by a revision counter) and screen readers
   * re-announce on every repeat key press — trend filters bound frequently
   * (e.g. few bullish candles), so silent repeats would strand a
   * screen-reader user at a boundary with no feedback.
   * @param unit - The active filter unit
   * @param direction - The direction to move
   * @returns Boundary/unavailable message on failure, null on success
   */
  private moveFilter(
    unit: RotorFilterUnit,
    direction: 'up' | 'down' | 'left' | 'right',
  ): string | null {
    if (direction === 'up' || direction === 'down') {
      return this.announceRotorMessage(this.getFilterVerticalUnavailableMessage(unit));
    }

    const activeTrace = this.context.active;
    if (!(activeTrace instanceof AbstractTrace)) {
      return this.announceRotorMessage(this.getMessage(unit.noun, direction));
    }
    const moved = activeTrace.moveToRotorFilter(unit.key, direction);
    if (!moved) {
      return this.announceRotorMessage(this.getMessage(unit.noun, direction));
    }
    return null;
  }

  /**
   * User-facing message when Up/Down is pressed inside a filter unit. Trend
   * filtering is horizontal-only, so vertical directions are announced as
   * unavailable rather than reusing the generic boundary message (which would
   * read as "No bullish point found above ..." and imply a real vertical
   * bound exists). Mirrors {@link getIntersectionVerticalUnavailableMessage}.
   * @param unit - The active filter unit, used to name the mode
   * @returns The terse/verbose/off message
   */
  private getFilterVerticalUnavailableMessage(unit: RotorFilterUnit): string {
    return this.buildMessage(
      `Up/down unavailable in ${unit.noun} mode`,
      `Up and down navigation is not available in ${unit.noun} mode.`,
    );
  }

  /**
   * Checks if the given mode name is a data mode. Besides the two classic
   * names, the active trace's own dataModeName() counts — traces like the
   * candlestick delta layer rename their default unit.
   */
  private isDataMode(mode: string): boolean {
    if (mode === Constant.DATA_MODE || mode === Constant.ROW_COL_MODE) {
      return true;
    }
    const activeTrace = this.context.active;
    return activeTrace instanceof AbstractTrace && mode === activeTrace.dataModeName();
  }

  /**
   * Resets the rotor to the default data mode. Called when the navigation
   * target changes wholesale (e.g., the candlestick delta layer activates or
   * deactivates) so a compare mode from the previous trace cannot silently
   * map onto a different unit of the new one.
   */
  public resetToDataMode(): void {
    this.rotorIndex = 0;
    this.setMode();
  }

  /**
   * Handles intersection navigation in the specified direction.
   * Delegates to the active trace's intersection movement methods and surfaces
   * a user-facing bound message through the rotor area when no further point
   * intersection exists in that direction.
   *
   * The {@link supportsIntersectionMode} contract guarantees that the active
   * plot is an {@link AbstractTrace} whenever this method is reached, and the
   * base-class navigation methods are safe no-ops for any trace that does not
   * override them, so no explicit try/catch is required.
   *
   * Return convention matches sibling methods (moveUp/moveDown/moveLeft/
   * moveRight / moveGrid): `null` signals a successful move (nothing to
   * announce in the rotor area); a non-null string is the user-facing
   * message for a failed / bounded / unavailable attempt.
   * @returns Error message if at bounds or unavailable, null on success
   */
  private moveIntersection(direction: 'left' | 'right'): string | null {
    const activeTrace = this.context.active;
    if (!(activeTrace instanceof AbstractTrace)) {
      // Defensive: INTERSECTION_MODE is only added to getAvailableModes() for
      // AbstractTrace subclasses that opt in via supportsIntersectionMode(),
      // so reaching this branch means the active plot changed between the
      // mode list build and the key press. Return an unavailable message
      // (not null — null means "move succeeded" to callers) so the user is
      // told their key press had no effect.
      return this.announceRotorMessage(this.buildMessage(
        'Intersection mode unavailable',
        'Intersection navigation is not available in the current context.',
      ));
    }
    const moved = direction === 'right'
      ? activeTrace.moveToNextIntersection()
      : activeTrace.moveToPrevIntersection();
    if (moved) {
      return null;
    }
    return this.announceRotorMessage(this.getIntersectionBoundMessage(direction));
  }

  /**
   * Push a rotor-area message through the notification service so the text
   * alert region re-mounts (it is keyed by a revision counter), forcing
   * screen readers to re-announce on every keystroke. Without this, repeated
   * identical messages dispatched only to the rotor area announce once and
   * then stay silent. Used by the intersection, compare-mode, and filter-unit
   * boundary paths. Returns the message unchanged so callers can chain. Empty
   * strings (text-off mode) are passed through; NotificationService already
   * no-ops on empty input.
   * @param message The text to announce; returned unchanged.
   */
  private announceRotorMessage(message: string): string {
    this.notification.notify(message);
    return message;
  }

  /**
   * Picks the terse or verbose string based on the current text mode, or an
   * empty string when text mode is off. Shared by mode-specific message
   * helpers to avoid duplicating the off/terse/verbose branching.
   */
  private buildMessage(terse: string, verbose: string): string {
    if (this.text.isOff()) {
      return '';
    }
    return this.text.isTerse() ? terse : verbose;
  }

  /**
   * User-facing message when Left/Right hits a boundary in intersection mode.
   * Uses the word "intersection" rather than the generic getMessage() output
   * which reads as "intersection value" — awkward since an intersection is a
   * coordinate, not a value.
   */
  private getIntersectionBoundMessage(direction: 'left' | 'right'): string {
    return this.buildMessage(
      `No intersection to the ${direction}`,
      `No intersection found to the ${direction} of the current point.`,
    );
  }

  /**
   * User-facing message when Up/Down is pressed in intersection mode.
   * Intersection navigation is horizontal-only, so vertical directions are
   * explicitly announced as unavailable rather than reusing the directional
   * bound message (which would imply a vertical bound exists).
   */
  private getIntersectionVerticalUnavailableMessage(): string {
    return this.buildMessage(
      'Up/down unavailable in intersection mode',
      'Up and down navigation is not available in intersection point mode.',
    );
  }

  /**
   * Notifies the active trace to enter or exit grid mode.
   */
  private notifyGridMode(enabled: boolean): void {
    const activeTrace = this.context.active;
    if (isGridNavigable(activeTrace)) {
      activeTrace.setGridMode(enabled);
    }
  }

  /**
   * Handles grid navigation in the specified direction.
   * @returns Error message if grid not supported, null otherwise (boundary handled by notifyOutOfBounds)
   */
  private moveGrid(direction: 'up' | 'down' | 'left' | 'right'): string | null {
    const activeTrace = this.context.active;
    if (!isGridNavigable(activeTrace) || !activeTrace.supportsGridMode()) {
      // Route through announceRotorMessage so this boundary re-announces on
      // repeat presses like every other rotor boundary path. Defensive only:
      // GRID_MODE is offered by getAvailableModes() only when supportsGridMode()
      // is true, so this branch is not reachable through the normal getMode()
      // dispatch — hence there is no black-box test for it.
      return this.announceRotorMessage(this.getMessage('grid value', direction));
    }

    // Grid move methods call notifyOutOfBounds() on boundary, which handles audio/text
    switch (direction) {
      case 'up':
        activeTrace.moveGridUp();
        break;
      case 'down':
        activeTrace.moveGridDown();
        break;
      case 'left':
        activeTrace.moveGridLeft();
        break;
      case 'right':
        activeTrace.moveGridRight();
        break;
    }

    return null;
  }
}
