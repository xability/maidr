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
  private readonly GLOBAL_MIN = 'globalMin';
  private readonly GLOBAL_MAX = 'globalMax';
  private readonly BLANK = 'blank';

  private readonly LOWER_OUTLIER = 'lowerOutlier';
  private readonly UPPER_OUTLIER = 'upperOutlier';

  private readonly MIN = 'min';
  private readonly MAX = 'max';

  private readonly Q1 = 'q1';
  private readonly Q2 = 'q2';
  private readonly Q3 = 'q3';

  public encode(state: BoxBrailleState, size: number = DEFAULT_BRAILLE_SIZE): EncodedBraille {
    const values = new Array<string>();
    const indexToCell = new Array<Cell>();
    const cellToIndex = new Array<Array<number>>();

    for (let row = 0; row < state.values.length; row++) {
      const box = state.values[row];
      const boxValData = [
        { type: this.GLOBAL_MIN, value: state.min },
        ...box.lowerOutliers.map(v => ({ type: this.LOWER_OUTLIER, value: v })),
        { type: this.MIN, value: box.min },
        { type: this.Q1, value: box.q1 },
        { type: this.Q2, value: box.q2 },
        { type: this.Q3, value: box.q3 },
        { type: this.MAX, value: box.max },
        ...box.upperOutliers.map(v => ({ type: this.UPPER_OUTLIER, value: v })),
        { type: this.GLOBAL_MAX, value: state.max },
      ];

      const lenData = new Array<{ type: string; length: number; numChars: number }>();
      let isBeforeMid = true;
      for (let i = 0; i < boxValData.length - 1; i++) {
        const curr = boxValData[i];
        const next = boxValData[i + 1];
        const diff = isBeforeMid
          ? Math.abs(next.value - curr.value)
          : Math.abs(curr.value - boxValData[i - 1].value);

        if (curr.type === this.LOWER_OUTLIER || curr.type === this.UPPER_OUTLIER) {
          lenData.push({ type: curr.type, length: 0, numChars: 1 });
          lenData.push({ type: this.BLANK, length: diff, numChars: 0 });
        } else if (curr.type === this.Q2) {
          isBeforeMid = false;
          lenData.push({ type: this.Q2, length: 0, numChars: 2 });
        } else if (curr.type === this.GLOBAL_MIN || curr.type === this.GLOBAL_MAX) {
          lenData.push({ type: this.BLANK, length: diff, numChars: 0 });
        } else {
          lenData.push({ type: curr.type, length: diff, numChars: 1 });
        }
      }

      let preAllocated = lenData.reduce((sum, l) => sum + (l.numChars > 0 ? l.numChars : 0), 0);
      let [locMin, locMax, locQ1, locQ3] = [-1, -1, -1, -1];
      for (let i = 0; i < lenData.length; i++) {
        if (lenData[i].type === this.MIN && lenData[i].length > 0)
          locMin = i;
        if (lenData[i].type === this.MAX && lenData[i].length > 0)
          locMax = i;
        if (lenData[i].type === this.Q1)
          locQ1 = i;
        if (lenData[i].type === this.Q3)
          locQ3 = i;
      }
      if (locMin !== -1 && locMax !== -1 && lenData[locMin].length !== lenData[locMax].length) {
        if (lenData[locMin].length > lenData[locMax].length) {
          lenData[locMin].numChars++;
          preAllocated++;
        } else {
          lenData[locMax].numChars++;
          preAllocated++;
        }
      }
      if (locQ1 !== -1 && locQ3 !== -1 && lenData[locQ1].length !== lenData[locQ3].length) {
        if (lenData[locQ1].length > lenData[locQ3].length) {
          lenData[locQ1].numChars++;
          preAllocated++;
        } else {
          lenData[locQ3].numChars++;
          preAllocated++;
        }
      }

      const available = Math.max(0, size - preAllocated);
      const totalLength = lenData.reduce((sum, l) => sum + (l.type !== 'q2' && l.length > 0 ? l.length : 0), 0);
      for (const section of lenData) {
        if (section.type !== this.Q2 && section.length > 0) {
          const allocated = Math.round((section.length / totalLength) * available);
          section.numChars += allocated;
        }
      }

      const totalChars = lenData.reduce((sum, l) => sum + l.numChars, 0);
      let diff = size - totalChars;
      let adjustIndex = 0;
      while (diff !== 0) {
        const section = lenData[adjustIndex % lenData.length];
        if (section.type !== this.BLANK && section.type !== this.Q2 && section.length > 0) {
          section.numChars += diff > 0 ? 1 : -1;
          diff += diff > 0 ? -1 : 1;
        }
        adjustIndex++;
      }

      let col = -1;
      cellToIndex.push(new Array<number>());
      const sections = [this.LOWER_OUTLIER, this.MIN, this.Q1, this.Q2, this.Q3, this.MAX, this.UPPER_OUTLIER];
      for (const section of lenData) {
        if (section.type !== this.BLANK && section.type !== this.GLOBAL_MIN && section.type !== this.GLOBAL_MAX) {
          col = sections.indexOf(section.type);
        }

        for (let j = 0; j < section.numChars; j++) {
          let brailleChar = '⠀';

          if (section.type === this.MIN || section.type === this.MAX) {
            brailleChar = '⠒';
          } else if (section.type === this.Q1 || section.type === this.Q3) {
            brailleChar = '⠿';
          } else if (section.type === this.Q2) {
            brailleChar = (j === 0) ? '⠸' : '⠇';
          } else if (section.type === this.LOWER_OUTLIER || section.type === this.UPPER_OUTLIER) {
            brailleChar = '⠂';
          } else if (section.type === this.BLANK) {
            brailleChar = '⠀';
          }

          values.push(brailleChar);
          cellToIndex[row].push(Math.max(col, 0));
          indexToCell.push({ row, col });
        }
      }

      values.push(Constant.NEW_LINE);
      cellToIndex[row].push(Math.max(col, 0));
      indexToCell.push({ row, col });
    }

    return {
      value: values.join(Constant.EMPTY),
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
