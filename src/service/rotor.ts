import type { Context } from '@model/context';
import { AbstractTrace } from '@model/abstract';
import { Constant } from '@util/constant';

const ROTOR_MODES: Record<number, string> = {
  0: Constant.DATA_MODE,
  1: Constant.LOWER_VALUE_MODE,
  2: Constant.HIGHER_VALUE_MODE,
};
/**
 * Manages rotor-based navigation for the active trace.
 *
 * Purpose:
 * - Provide modal navigation over a trace by rotating through three modes.
 *
 * Navigation modes:
 * - DATA_MODE: Default data browsing. Focus remains in the trace scope; no compare behavior.
 * - LOWER_VALUE_MODE: Navigate to the next/previous data point with a lower y-value relative
 *   to the current point (supports left/right and, when available, up/down semantics).
 * - HIGHER_VALUE_MODE: Navigate to the next/previous data point with a higher y-value relative
 *   to the current point (supports left/right and, when available, up/down semantics).
 *
 * Responsibilities:
 * - Track the current rotor mode and expose helpers to cycle forward/backward across modes.
 * - Coordinate scope focus: entering a compare mode (LOWER/HIGHER) may switch focus to
 *   the rotor scope; returning to DATA_MODE restores focus to the trace scope.
 * - Delegate directional movement to the active {@link AbstractTrace} implementation using
 *   rotor-aware APIs, with a fallback to compare-based traversal when rotor methods are
 *   unavailable.
 *
 * Mode management:
 * - getMode(): Returns the symbolic mode string for the current index.
 * - setMode(): Applies mode side-effects (e.g., restore trace scope in DATA_MODE).
 * - getCompareType(): Maps the current mode to 'lower' or 'higher' for compare operations
 *   (DATA_MODE falls back to 'lower').
 *
 * Dependencies:
 * - Context: Provides the active trace and current scope.
 * - DisplayService: Toggles UI focus between scopes (trace vs. rotor).
 * - TextService: Reserved for user-facing feedback/messages and parity with other services.
 *
 * Notes:
 * - UI-agnostic: this service contains no rendering logic and does not depend on the UI.
 * - Returns user-facing messages from movement methods when a move is not possible; callers
 *   may surface these through the ViewModel/UI.
 */
export class RotorNavigationService {
  private readonly context: Context;
  private rotorIndex: number;

  public constructor(context: Context) {
    this.context = context;
    this.rotorIndex = 0;
  }

  public moveToNextRotorUnit(): string {
    this.rotorIndex = (this.rotorIndex + 1) % Constant.NO_OF_ROTOR_NAV_MODES;

    this.setMode();
    return this.getMode();
  }

  public moveToPrevRotorUnit(): string {
    this.rotorIndex = (this.rotorIndex - 1 + Constant.NO_OF_ROTOR_NAV_MODES) % Constant.NO_OF_ROTOR_NAV_MODES;

    this.setMode();
    return this.getMode();
  }

  public getCurrentUnit(): number {
    return this.rotorIndex;
  }

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
          const msg = `No ${compareType} value found to the ${direction} of the current value.`;
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

  public moveUp(): string | null {
    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveUpRotor(this.getCompareType());
        if (!moved) {
          const msg = `No ${this.getCompareType()} value found above the current value.`;
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

  public moveDown(): string | null {
    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveDownRotor(this.getCompareType());
        if (!moved) {
          const msg = `No ${this.getCompareType()} value found below the current value.`;
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

  public moveLeft(): string | null {
    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveLeftRotor(this.getCompareType());
        if (!moved) {
          const msg = `No ${this.getCompareType()} value found to the left of the current value.`;
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

  public moveRight(): string | null {
    const activeTrace = this.context.active;
    try {
      if (activeTrace instanceof AbstractTrace) {
        const moved = activeTrace.moveRightRotor(this.getCompareType());
        if (!moved) {
          const msg = `No ${this.getCompareType()} value found to the right of the current value.`;
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

  public setMode(): void {
    const curr_mode = ROTOR_MODES[this.rotorIndex];
    if (curr_mode === Constant.DATA_MODE) {
      this.context.setRotorEnabled(false);
      return;
    }
    this.context.setRotorEnabled(true);
  }

  public getMode(): string {
    const curr_mode = ROTOR_MODES[this.rotorIndex];
    return curr_mode;
  }

  public getCompareType(): 'lower' | 'higher' {
    const curr_mode = this.getMode();
    if (curr_mode === Constant.HIGHER_VALUE_MODE) {
      return 'higher';
    } else if (curr_mode === Constant.LOWER_VALUE_MODE) {
      return 'lower';
    }
    return 'lower'; // fallback
  }
}
