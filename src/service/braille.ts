import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type { TraceState, WeightedBrailleValue } from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import { Emitter, Scope } from '@type/event';
import { Constant } from '@util/constant';

const DEFAULT_BRAILLE_SIZE = 32;

interface BrailleIndex {
  row: number;
  col: number;
}

interface BrailleChangedEvent {
  value: string;
  index: number;
}

interface EncodedBraille {
  encoded: string;
  map: BrailleIndex[];
}

export class BrailleService implements Observer<TraceState>, Disposable {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  private enabled: boolean;
  private lastEncoded: EncodedBraille;

  private readonly onChangeEmitter: Emitter<BrailleChangedEvent>;
  public readonly onChange: Event<BrailleChangedEvent>;

  public constructor(context: Context, notification: NotificationService, display: DisplayService) {
    this.context = context;
    this.notification = notification;
    this.display = display;

    this.enabled = false;
    this.lastEncoded = { encoded: Constant.EMPTY, map: [] };

    this.onChangeEmitter = new Emitter<BrailleChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();
  }

  public update(state: TraceState): void {
    if (!this.enabled || state.empty || state.braille.empty) {
      return;
    }

    const braille = state.braille;
    const isWeighted = typeof braille.values[0][0] !== 'string';
    this.lastEncoded = isWeighted
      ? this.encodeWeighted(braille.values as WeightedBrailleValue[][], DEFAULT_BRAILLE_SIZE)
      : this.encodeDefault(braille.values as string[][]);

    const value = this.lastEncoded.encoded;
    const index = this.lastEncoded.map
      .findIndex(bIdx => bIdx.row === braille.row && bIdx.col === braille.col);
    this.onChangeEmitter.fire({ value, index });
  }

  private encodeWeighted(_: WeightedBrailleValue[][], __: number): EncodedBraille {
    return this.lastEncoded;
  };

  private encodeDefault(values: string[][]): EncodedBraille {
    const map = new Array<BrailleIndex>();
    const braille = new Array<string>();

    values.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        braille.push(cell);
        map.push({ row: rowIndex, col: colIndex });
      });
      if (rowIndex !== row.length - 1) {
        braille.push(Constant.NEW_LINE);
        map.push({ row: rowIndex, col: row.length });
      }
    });

    return { encoded: braille.join(Constant.EMPTY), map };
  };

  public moveToIndex(index: number): void {
    if (!this.enabled || this.lastEncoded.map.length === 0) {
      return;
    }

    const { row, col } = this.lastEncoded.map[Math.max(0, Math.min(index, this.lastEncoded.map.length - 1))];
    this.context.moveToIndex(row, col);
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      const noInfo = 'No info for braille';
      this.notification.notify(noInfo);
      return;
    }

    if (state.braille.empty) {
      const notSupported = `Braille is not supported for plot type: ${state.braille.traceType}`;
      this.notification.notify(notSupported);
      return;
    }

    this.enabled = !this.enabled;
    this.update(state);
    this.display.toggleFocus(Scope.BRAILLE);

    const message = `Braille is ${this.enabled ? 'on' : 'off'}`;
    this.notification.notify(message);
  }
}
