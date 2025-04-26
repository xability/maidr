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

interface BrailleEncoder<BrailleState> {
  encode: (state: BrailleState, size?: number) => EncodedBraille;
}

class BarBrailleEncoder implements BrailleEncoder<BarBrailleState> {
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
}

class BoxBrailleEncoder implements BrailleEncoder<BoxBrailleState> {
  public encode(state: BoxBrailleState, size: number = DEFAULT_BRAILLE_SIZE): EncodedBraille {
    const values: string[] = [];
    const indexToCell: Cell[] = [];
    const cellToIndex: number[][] = [];

    const numBoxes = state.values.length;

    for (let boxIndex = 0; boxIndex < numBoxes; boxIndex++) {
      const box = state.values[boxIndex];
      const boxValData = [
        { type: 'global_min', value: state.min },
        ...box.lowerOutliers.map(v => ({ type: 'lower_outlier' as const, value: v })),
        { type: 'min', value: box.min },
        { type: 'q1', value: box.q1 },
        { type: 'q2', value: box.q2 },
        { type: 'q3', value: box.q3 },
        { type: 'max', value: box.max },
        ...box.upperOutliers.map(v => ({ type: 'upper_outlier' as const, value: v })),
        { type: 'global_max', value: state.max },
      ];

      // 1. Calculate section lengths
      const lenData: { type: string; length: number; numChars: number }[] = [];
      for (let i = 0; i < boxValData.length - 1; i++) {
        const curr = boxValData[i];
        const next = boxValData[i + 1];

        if (curr.type === 'lower_outlier' || curr.type === 'upper_outlier') {
          lenData.push({ type: curr.type, length: 0, numChars: 1 });
          lenData.push({ type: 'blank', length: Math.abs(next.value - curr.value), numChars: 0 });
        } else if (curr.type === 'q2') {
          lenData.push({ type: 'q2', length: 0, numChars: 2 });
        } else if (curr.type === 'global_min' || curr.type === 'global_max') {
          lenData.push({ type: 'blank', length: Math.abs(next.value - curr.value), numChars: 0 });
        } else {
          lenData.push({ type: curr.type, length: Math.abs(next.value - curr.value), numChars: 1 });
        }
      }

      // 2. Preallocate mandatory characters
      const preAllocated = lenData.reduce((sum, l) => sum + (l.numChars > 0 ? l.numChars : 0), 0);
      let available = size - preAllocated;
      if (available < 5)
        available = 5;

      const totalLength = lenData.reduce((sum, l) => sum + (l.length > 0 ? l.length : 0), 0);

      for (const section of lenData) {
        if (section.length > 0) {
          section.numChars += Math.max(0, Math.round((section.length / totalLength) * available));
        }
      }

      // 3. Fix rounding errors
      const totalChars = lenData.reduce((sum, l) => sum + l.numChars, 0);
      let diff = size - totalChars;
      let adjustIndex = 0;
      while (diff !== 0) {
        const section = lenData[adjustIndex % lenData.length];
        if (section.type !== 'blank' && section.length > 0) {
          section.numChars += (diff > 0) ? 1 : -1;
          diff += (diff > 0) ? -1 : 1;
        }
        adjustIndex++;
      }

      // 4. Map sections to Braille characters
      const lineStart = values.length;
      cellToIndex.push([]);

      for (const section of lenData) {
        for (let j = 0; j < section.numChars; j++) {
          let brailleChar = '⠀'; // blank by default

          if (section.type === 'min' || section.type === 'max') {
            brailleChar = '⠒';
          } else if (section.type === 'q1' || section.type === 'q3') {
            brailleChar = '⠿';
          } else if (section.type === 'q2') {
            brailleChar = (j === 0) ? '⠸' : '⠇';
          } else if (section.type === 'lower_outlier' || section.type === 'upper_outlier') {
            brailleChar = '⠂';
          } else if (section.type === 'blank') {
            brailleChar = '⠀';
          }

          values.push(brailleChar);
          indexToCell.push({ row: boxIndex, col: section.type.startsWith('q') ? 1 : 0 });
          cellToIndex[boxIndex].push(lineStart + (values.length - lineStart - 1));
        }
      }

      // Add newline at the end of each box
      values.push('\n');
    }

    return {
      value: values.join(''),
      cellToIndex,
      indexToCell,
    };
  }
}

class HeatmapBrailleEncoder implements BrailleEncoder<HeatmapBrailleState> {
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

class LineBrailleEncoder implements BrailleEncoder<LineBrailleState> {
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

  private readonly encoders: Map<TraceType, BrailleEncoder<any>>;
  private readonly onChangeEmitter: Emitter<BrailleChangedEvent>;
  public readonly onChange: Event<BrailleChangedEvent>;

  public constructor(context: Context, notification: NotificationService, display: DisplayService) {
    this.context = context;
    this.notification = notification;
    this.display = display;

    this.enabled = false;
    this.cacheId = Constant.EMPTY;
    this.cache = null;

    this.encoders = new Map<TraceType, BrailleEncoder<any>>([
      [TraceType.BAR, new BarBrailleEncoder()],
      [TraceType.BOX, new BoxBrailleEncoder()],
      [TraceType.DODGED, new BarBrailleEncoder()],
      [TraceType.HEATMAP, new HeatmapBrailleEncoder()],
      [TraceType.HISTOGRAM, new BarBrailleEncoder()],
      [TraceType.LINE, new LineBrailleEncoder()],
      [TraceType.NORMALIZED, new BarBrailleEncoder()],
      [TraceType.STACKED, new BarBrailleEncoder()],
    ]);

    this.onChangeEmitter = new Emitter<BrailleChangedEvent>();
    this.onChange = this.onChangeEmitter.event;
  }

  public dispose(): void {
    this.onChangeEmitter.dispose();

    this.cache = null;
    this.encoders.clear();
  }

  public update(state: SubplotState | TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }

    const trace = state.type === 'subplot' ? state.trace : state;
    if (trace.empty || trace.braille.empty || !this.encoders.has(trace.traceType)) {
      return;
    }

    const braille = trace.braille;
    if (this.cacheId !== braille.id || this.cache === null) {
      const encoder = this.encoders.get(trace.traceType)!;
      this.cache = encoder.encode(braille as any, DEFAULT_BRAILLE_SIZE);
      this.cacheId = braille.id;
    }

    this.onChangeEmitter.fire({ value: this.cache.value, index: this.cache.cellToIndex[braille.row][braille.col] });
  }

  public moveToIndex(index: number): void {
    if (!this.enabled || this.cache === null || this.cache.indexToCell.length === 0) {
      return;
    }

    const { row, col } = this.cache.indexToCell[Math.max(0, Math.min(index, this.cache.indexToCell.length - 1))];
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
