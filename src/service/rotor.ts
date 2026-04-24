import type { Context } from '@model/context';
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
  private rotorIndex: number;

  /**
   * Creates a new RotorNavigationService instance.
   * @param context - The context providing access to the active trace
   */
  public constructor(context: Context, text: TextService) {
    this.context = context;
    this.rotorIndex = 0;
    this.text = text;
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
          const msg = this.getMessage(compareType, direction);
          console.warn(msg);
          return msg;
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
      // Intentional: do not call notifyStateUpdate() here. Vertical navigation
      // is unavailable in intersection mode, so the model is not moved and no
      // audio/text update is emitted — only the rotor-area message is returned.
      return this.getIntersectionVerticalUnavailableMessage();
    }

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveUpRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareType(), 'above');
          console.warn(msg);
          return msg;
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
      // Intentional: see moveUp() — vertical navigation is unavailable in
      // intersection mode; the model is not moved and no observer is notified.
      return this.getIntersectionVerticalUnavailableMessage();
    }

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveDownRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareType(), 'below');
          console.warn(msg);
          return msg;
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

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveLeftRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareType(), 'left');
          console.warn(msg);
          return msg;
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

    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveRightRotor(this.getCompareType());
        if (!moved) {
          const msg = this.getMessage(this.getCompareType(), 'right');
          console.warn(msg);
          return msg;
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
   * Gets the comparison type for the current rotor mode.
   * @returns 'lower' or 'higher' based on the current mode
   */
  public getCompareType(): 'lower' | 'higher' {
    const currMode = this.getMode();
    if (currMode === Constant.HIGHER_VALUE_MODE) {
      return 'higher';
    } else if (currMode === Constant.LOWER_VALUE_MODE) {
      return 'lower';
    }
    return 'lower'; // fallback
  }

  public getMessage(navType: string, direction: string): string {
    const isVertical = direction === 'above' || direction === 'below';
    const preposition = isVertical ? '' : 'on the ';
    const position = isVertical ? `${direction} ` : `to the ${direction} of `;
    return this.buildMessage(
      `No ${navType} value found ${preposition}${direction}`,
      `No ${navType} value found ${position}the current value.`,
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
   */
  private getAvailableModes(): string[] {
    const activeTrace = this.context.active;
    const modes: string[] = [];

    if (activeTrace instanceof AbstractTrace) {
      modes.push(activeTrace.dataModeName());

      if (activeTrace.supportsCompareMode()) {
        modes.push(Constant.LOWER_VALUE_MODE);
        modes.push(Constant.HIGHER_VALUE_MODE);
      }

      if (isGridNavigable(activeTrace) && activeTrace.supportsGridMode()) {
        modes.push(Constant.GRID_MODE);
      }

      if (activeTrace.supportsIntersectionMode()) {
        modes.push(Constant.INTERSECTION_MODE);
      }
    } else {
      modes.push(Constant.DATA_MODE);
    }

    return modes;
  }

  /**
   * Checks if the given mode name is a data mode (either DATA_MODE or ROW_COL_MODE).
   */
  private isDataMode(mode: string): boolean {
    return mode === Constant.DATA_MODE || mode === Constant.ROW_COL_MODE;
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
      // told their key press had no effect, and warn for debugging.
      console.warn('[RotorNavigation] Active plot is not an AbstractTrace; intersection move ignored');
      return this.buildMessage(
        'Intersection mode unavailable',
        'Intersection navigation is not available in the current context.',
      );
    }
    const moved = direction === 'right'
      ? activeTrace.moveToNextIntersection()
      : activeTrace.moveToPrevIntersection();
    return moved ? null : this.getIntersectionBoundMessage(direction);
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
      return this.getMessage('grid', direction);
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
