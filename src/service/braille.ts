import type { Context } from '@model/context';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import type { Observer } from '@type/observable';
import type {
  BarBrailleState,
  BoxBrailleState,
  HeatmapBrailleState,
  LineBrailleState,
  SubplotState,
  TraceState,
} from '@type/state';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import { Emitter, Scope } from '@type/event';
import { TraceType } from '@type/grammar';
import { Constant } from '@util/constant';

const DEFAULT_BRAILLE_SIZE = 32;

interface Cell {
  row: number;
  col: number;
}

interface BrailleChangedEvent {
  value: string;
  index: number;
}

interface EncodedBraille {
  value: string;
  cellToIndex: number[][];
  indexToCell: Cell[];
}

interface BrailleTransformer<BrailleState> {
  encode: (state: BrailleState, size?: number) => EncodedBraille;
  decode: (encoded: EncodedBraille, index: number) => Cell;
}

abstract class AbstractBrailleTransformer<T> implements BrailleTransformer<T> {
  public abstract encode(state: T): EncodedBraille;

  public decode(encoded: EncodedBraille, index: number): Cell {
    return encoded.indexToCell[index];
  }
}

class BarBrailleTransformer extends AbstractBrailleTransformer<BarBrailleState> {
  public encode(state: BarBrailleState): EncodedBraille {
    const values = new Array<string>();
    const cellToIndex = new Array<Array<number>>();
    const indexToCell = new Array<Cell>();

    for (let row = 0; row < state.values.length; row++) {
      cellToIndex.push(new Array<number>());

      const range = (state.max[row] - state.min[row]) / 4;
      const low = state.min[row] + range;
      const medium = low + range;
      const high = medium + range;

      for (let col = 0; col < state.values[row].length; col++) {
        if (state.values[row][col] === 0) {
          values.push(' ');
        } else if (state.values[row][col] <= low) {
          values.push('⠤');
        } else if (state.values[row][col] <= medium) {
          values.push('⠤');
        } else if (state.values[row][col] <= high) {
          values.push('⠒');
        } else {
          values.push('⠉');
        }

        cellToIndex[row].push(indexToCell.length);
        indexToCell.push({ row, col });
      }

      values.push(Constant.NEW_LINE);
      cellToIndex[row].push(indexToCell.length);
      indexToCell.push({ row, col: state.values[row].length });
    }

    return { value: values.join(Constant.EMPTY), cellToIndex, indexToCell };
  }

  public decode(encoded: EncodedBraille, index: number): Cell {
    return encoded.indexToCell[index];
  }
}

class BoxBrailleTransformer implements BrailleTransformer<BoxBrailleState> {
  public encode(state: BoxBrailleState): EncodedBraille {
    return { value: Constant.EMPTY, cellToIndex: [], indexToCell: [] };
  }

  public decode(encoded: EncodedBraille, index: number): Cell {
    return { row: 0, col: 0 };
  }
}

class HeatmapBrailleTransformer extends AbstractBrailleTransformer<HeatmapBrailleState> {
  public encode(state: HeatmapBrailleState): EncodedBraille {
    const values = new Array<string>();
    const cellToIndex = new Array<Array<number>>();
    const indexToCell = new Array<Cell>();

    const range = (state.max - state.min) / 3;
    const low = state.min + range;
    const medium = low + range;

    for (let row = 0; row < state.values.length; row++) {
      cellToIndex.push(new Array<number>());

      for (let col = 0; col < state.values[row].length; col++) {
        if (state.values[row][col] === 0) {
          values.push(' ');
        } else if (state.values[row][col] <= low) {
          values.push('⠤');
        } else if (state.values[row][col] <= medium) {
          values.push('⠒');
        } else {
          values.push('⠉');
        }

        cellToIndex[row].push(indexToCell.length);
        indexToCell.push({ row, col });
      }

      values.push(Constant.NEW_LINE);
      cellToIndex[row].push(indexToCell.length);
      indexToCell.push({ row, col: state.values[row].length });
    }

    return { value: values.join(Constant.EMPTY), cellToIndex, indexToCell };
  }
}

class LineBrailleTransformer extends AbstractBrailleTransformer<LineBrailleState> {
  public encode(state: LineBrailleState): EncodedBraille {
    const values = new Array<string>();
    const cellToIndex = new Array<Array<number>>();
    const indexToCell = new Array<Cell>();

    for (let row = 0; row < state.values.length; row++) {
      cellToIndex.push(new Array<number>());

      const range = (state.max[row] - state.min[row]) / 4;
      const low = state.min[row] + range;
      const medium = low + range;
      const mediumHigh = medium + range;
      const high = medium + range;

      for (let col = 0; col < state.values[row].length; col++) {
        if (state.values[row][col] <= low && col - 1 >= 0 && state.values[row][col - 1] > low) {
          if (state.values[row][col - 1] <= medium) {
            values.push('⢄');
          } else if (state.values[row][col - 1] <= mediumHigh) {
            values.push('⢆');
          } else if (state.values[row][col - 1] > mediumHigh) {
            values.push('⢇');
          }
        } else if (state.values[row][col] <= low) {
          values.push('⣀');
        } else if (col - 1 >= 0 && state.values[row][col - 1] <= low) {
          if (state.values[row][col] <= medium) {
            values.push('⡠');
          } else if (state.values[row][col] <= mediumHigh) {
            values.push('⡰');
          } else if (state.values[row][col] > mediumHigh) {
            values.push('⡸');
          }
        } else if (
          state.values[row][col] <= medium
          && col - 1 >= 0
          && state.values[row][col - 1] > medium
        ) {
          if (state.values[row][col - 1] <= mediumHigh) {
            values.push('⠢');
          } else if (state.values[row][col - 1] > mediumHigh) {
            values.push('⠣');
          }
        } else if (state.values[row][col] <= medium) {
          values.push('⠤');
        } else if (col - 1 >= 0 && state.values[row][col - 1] <= medium) {
          if (state.values[row][col] <= mediumHigh) {
            values.push('⠔');
          } else if (state.values[row][col] > mediumHigh) {
            values.push('⠜');
          }
        } else if (
          state.values[row][col] <= mediumHigh
          && col - 1 >= 0
          && state.values[row][col - 1] > mediumHigh
        ) {
          values.push('⠑');
        } else if (state.values[row][col] <= mediumHigh) {
          values.push('⠒');
        } else if (col - 1 >= 0 && state.values[row][col - 1] <= mediumHigh) {
          values.push('⠊');
        } else if (state.values[row][col] <= high) {
          values.push('⠉');
        }

        cellToIndex[row].push(indexToCell.length);
        indexToCell.push({ row, col });
      }

      values.push(Constant.NEW_LINE);
      cellToIndex[row].push(indexToCell.length);
      indexToCell.push({ row, col: state.values[row].length });
    }

    return { value: values.join(Constant.EMPTY), cellToIndex, indexToCell };
  }
}

export class BrailleService implements Observer<SubplotState | TraceState>, Disposable {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly display: DisplayService;

  private enabled: boolean;
  private cacheId: string;
  private cache: EncodedBraille | null;

  private readonly transformers: Map<TraceType, BrailleTransformer<any>>;
  private readonly onChangeEmitter: Emitter<BrailleChangedEvent>;
  public readonly onChange: Event<BrailleChangedEvent>;

  public constructor(context: Context, notification: NotificationService, display: DisplayService) {
    this.context = context;
    this.notification = notification;
    this.display = display;

    this.enabled = false;
    this.cacheId = Constant.EMPTY;
    this.cache = null;

    this.transformers = new Map<TraceType, BrailleTransformer<any>>([
      [TraceType.BAR, new BarBrailleTransformer()],
      [TraceType.BOX, new BoxBrailleTransformer()],
      [TraceType.DODGED, new BarBrailleTransformer()],
      [TraceType.HEATMAP, new HeatmapBrailleTransformer()],
      [TraceType.HISTOGRAM, new BarBrailleTransformer()],
      [TraceType.LINE, new LineBrailleTransformer()],
      [TraceType.NORMALIZED, new BarBrailleTransformer()],
      [TraceType.STACKED, new BarBrailleTransformer()],
    ]);

    this.onChangeEmitter = new Emitter<BrailleChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();

    this.cache = null;
    this.transformers.clear();
  }

  public update(state: SubplotState | TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    const trace = state.type === 'subplot' ? state.trace : state;
    if (trace.empty || trace.braille.empty || !this.transformers.has(trace.traceType)) {
      return;
    }

    const braille = trace.braille;
    if (this.cacheId !== braille.id) {
      const transformer = this.transformers.get(trace.traceType)!;
      this.cache = transformer.encode(braille as any, DEFAULT_BRAILLE_SIZE);
      this.cacheId = braille.id;
    }

    this.onChangeEmitter.fire({ value: this.cache!.value, index: this.cache!.cellToIndex[braille.row][braille.col] });
  }

  public moveToIndex(index: number): void {
    if (!this.enabled || this.cache?.indexToCell.length === 0) {
      return;
    }

    const { row, col } = this.cache!.indexToCell[Math.max(0, Math.min(index, this.cache!.indexToCell.length - 1))];
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
