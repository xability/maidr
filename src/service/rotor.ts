import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { Event } from '@type/event';
import type { TraceState } from '@type/state';
import type { TextService } from './text';
import { AbstractTrace } from '@model/abstract';
import { Emitter, Scope } from '@type/event';
import { Constant } from '@util/constant';

export enum RotorEvent {
  ROTOR_CHANGED = 'ROTOR_CHANGED',
  NAV_TARGET_NOT_FOUND = 'NAV_TARGET_NOT_FOUND',
}
enum ROTOR_MODES {
  DATA_MODE = 0,
  LOWER_VALUE_MODE = 1,
  HIGHER_VALUE_MODE = 2,
}

interface RotorChangedEvent {
  value: string;
}

export class RotorNavigationService {
  private readonly context: Context;
  private readonly display: DisplayService;
  private readonly text: TextService;
  private rotorIndex: number;
  private readonly onChangeEmitter: Emitter<RotorChangedEvent>;
  public readonly onChange: Event<RotorChangedEvent>;

  public constructor(context: Context, display: DisplayService, text: TextService) {
    this.context = context;
    this.display = display;
    this.text = text;
    this.rotorIndex = 0;
    this.onChangeEmitter = new Emitter<RotorChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      return;
    }

    const activeTrace = this.context.active;
    if (activeTrace && this.context.scope !== Scope.ROTOR && this.getMode() !== Constant.DATA_MODE) {
      this.display.toggleFocus(Scope.ROTOR);
    }
  }

  public returnToTraceScope(): void {
    this.display.toggleFocus(Scope.ROTOR);
  }

  public moveToNextRotorUnit(): string {
    this.rotorIndex = (this.rotorIndex + 1) % Constant.NO_OF_ROTOR_NAV_MODES;
    this.onChangeEmitter.fire({
      value: RotorEvent.ROTOR_CHANGED,
    });
    this.setMode();
    return this.getMode();
  }

  public moveToPrevRotorUnit(): string {
    this.rotorIndex = (this.rotorIndex - 1 + Constant.NO_OF_ROTOR_NAV_MODES) % Constant.NO_OF_ROTOR_NAV_MODES;
    this.onChangeEmitter.fire({
      value: RotorEvent.ROTOR_CHANGED,
    });
    this.setMode();
    return this.getMode();
  }

  public getCurrentUnit(): number {
    return this.rotorIndex;
  }

  public callMoveToNextCompareMethod(direction: "right" | "left"): string | null {
    const activeTrace = this.context.active;

    const compare = this.getCompareType();
    // Check if activeTrace is an instance of AbstractTrace and supports moveToNextHigherValue
    if (activeTrace instanceof AbstractTrace) {
      const xValue = activeTrace.getCurrentXValue(); // Get the current X value
      if (xValue !== null) {
        const moved = activeTrace.moveToNextCompareValue(direction, xValue, compare as 'lower' | 'higher');
        if (!moved) {
          console.warn(`No ${compare} value found in the ${direction} of the current value.`);
          return `No ${compare} value found in the ${direction} of the current value.`
        }
      } else {
        console.error('Unable to retrieve the current X value.');
      }
    } else {
      console.error('The active trace does not support \'moveToNextHigherValue\'.');
    }
    return null;
  }

  public moveUp(): string | null {
    return this.callMoveToNextCompareMethod('right');
  }

  public moveDown(): string | null {
    return this.callMoveToNextCompareMethod('left');
  }

  public moveLeft(): string | null {
    return this.moveDown();
  }

  public moveRight(): string | null {
    return this.moveUp();
  }

  public setMode(): void {
    const curr_mode = ROTOR_MODES[this.rotorIndex];
    const curr_mode_text = this.text.format(curr_mode);
    if (curr_mode_text) {
      this.onChangeEmitter.fire({ value: curr_mode_text });
    }
    if (curr_mode === Constant.DATA_MODE) {
      // DATA MODE return to default TRACE scope
      this.returnToTraceScope();
    }
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

  public close(): void {
    this.returnToTraceScope();
  }
}
