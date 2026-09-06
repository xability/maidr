import type { Dimension, NearestPoint } from '@model/abstract';
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer } from '@type/grammar';
import type { Movable } from '@type/movable';
import type {
  AudioState,
  BrailleState,
  DescriptionState,
  TextState,
  TraceState,
} from '@type/state';
import { describe, expect, it, jest } from '@jest/globals';
import { AbstractTrace } from '@model/abstract';
import { MovableGrid } from '@model/movable';
import { TraceType } from '@type/grammar';

/**
 * A fresh trace parks its cursor on (0, 0) with `isInitialEntry` set: nothing
 * has been announced yet and the highlight is deliberately withheld. Pointing
 * at the first mark has to count as entering the chart, exactly as the first
 * arrow key does -- otherwise the first bar is the one point on the chart a
 * pointer cannot reach until the reader has hovered some other one.
 */

const FIRST_POINT: NearestPoint = {
  element: {} as SVGElement,
  row: 0,
  col: 0,
  centerX: 10,
  centerY: 10,
};

class PointerTrace extends AbstractTrace {
  protected readonly supportsExtrema = false;
  protected readonly movable: Movable;

  constructor() {
    super({
      id: 'pointer',
      type: TraceType.BAR,
      title: 'Test',
    } as MaidrLayer);
    this.movable = new MovableGrid<number>([[1, 2, 3]]);
  }

  protected get dimension(): Dimension {
    return { rows: 1, cols: 3 };
  }

  protected get audio(): AudioState {
    return {
      freq: { min: 0, max: 1, raw: 0 },
      panning: { x: this.col, y: 0, rows: 1, cols: 3 },
    };
  }

  protected get braille(): BrailleState {
    return { empty: true, type: 'trace', traceType: TraceType.BAR, audio: { x: 0, y: 0, rows: 1, cols: 3 } };
  }

  protected get text(): TextState {
    return { main: { label: 'x', value: this.col }, cross: { label: 'y', value: 0 } };
  }

  public get description(): DescriptionState {
    return { chartType: 'Bar Plot', title: 'Test', axes: {}, stats: [], dataTable: { headers: [], rows: [] } };
  }

  protected get highlightValues(): null {
    return null;
  }

  protected get values(): number[][] {
    return [[1, 2, 3]];
  }

  protected findNearestPoint(_x: number, _y: number): NearestPoint | null {
    return FIRST_POINT;
  }

  public override isPointInBounds(): boolean {
    return true;
  }

  public override getExtremaTargets(): ExtremaTarget[] {
    return [];
  }
}

describe('pointing at the first mark of a fresh trace', () => {
  it('enters the chart and announces the mark', () => {
    const trace = new PointerTrace();
    const update = jest.fn<(state: TraceState) => void>();
    trace.addObserver({ update });

    const guidance = trace.moveToPointAndGetPointerGuidance(10, 10);

    expect(guidance).toEqual({ onCurve: true });
    expect(trace.isInitialEntry).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not re-announce a mark the cursor already sits on once entered', () => {
    const trace = new PointerTrace();
    trace.moveToIndex(0, 0);
    const update = jest.fn<(state: TraceState) => void>();
    trace.addObserver({ update });

    trace.moveToPointAndGetPointerGuidance(10, 10);

    expect(update).not.toHaveBeenCalled();
  });
});
