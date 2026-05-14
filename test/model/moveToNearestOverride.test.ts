import type { Dimension, NearestPoint } from '@model/abstract';
/**
 * Contract test for the `moveToNearest` protected-hook pattern that
 * BoxTrace and ViolinBoxTrace rely on: overriding the hook to a no-op
 * must disable hover-driven moves while keeping pointer-guidance state
 * intact.
 *
 * Uses a minimal AbstractTrace subclass instead of constructing a real
 * BoxTrace, which would need a fully-formed MAIDR layer plus DOM.
 */
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer } from '@type/grammar';
import type { Movable, MovableDirection } from '@type/movable';
import type {
  AudioState,
  BrailleState,
  DescriptionState,
  TextState,
} from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { AbstractTrace } from '@model/abstract';
import { TraceType } from '@type/grammar';

class StubMovable implements Movable {
  public row = 0;
  public col = 0;
  public isInitialEntry = false;
  public isOutOfBounds = false;

  public moveOnce(_direction: MovableDirection): boolean {
    return false;
  }

  public moveToExtreme(_direction: MovableDirection): boolean {
    return false;
  }

  public moveToIndex(row: number, col: number): boolean {
    this.row = row;
    this.col = col;
    return true;
  }

  public isMovable(_target: [number, number] | MovableDirection): boolean {
    return true;
  }
}

class TestTrace extends AbstractTrace {
  public moveToIndexCalls = 0;
  private readonly movableInst: StubMovable;
  private readonly nearest: NearestPoint;
  private readonly inBounds: boolean;
  protected readonly supportsExtrema = false;

  constructor(nearest: NearestPoint, inBounds: boolean) {
    super({
      id: 'test',
      type: TraceType.BOX,
      title: 'Test',
    } as MaidrLayer);
    this.movableInst = new StubMovable();
    this.nearest = nearest;
    this.inBounds = inBounds;
  }

  protected get movable(): Movable {
    return this.movableInst;
  }

  protected get dimension(): Dimension {
    return { rows: 1, cols: 1 };
  }

  protected get audio(): AudioState {
    return {
      freq: { min: 0, max: 1, raw: 0 },
      panning: { x: 0, y: 0, rows: 1, cols: 1 },
    };
  }

  protected get braille(): BrailleState {
    return { empty: true, type: 'trace', traceType: TraceType.BOX, audio: { x: 0, y: 0, rows: 1, cols: 1 } };
  }

  protected get text(): TextState {
    return { main: { label: 'x', value: 0 }, cross: { label: 'y', value: 0 } };
  }

  public get description(): DescriptionState {
    return { chartType: 'Box Plot', title: 'Test', axes: {}, stats: [], dataTable: { headers: [], rows: [] } };
  }

  protected get highlightValues(): null {
    return null;
  }

  protected get values(): never[][] {
    return [];
  }

  protected findNearestPoint(_x: number, _y: number): NearestPoint | null {
    return this.nearest;
  }

  public isPointInBounds(_x: number, _y: number, _nearest: NearestPoint): boolean {
    return this.inBounds;
  }

  public moveToIndex(row: number, col: number): boolean {
    this.moveToIndexCalls++;
    return super.moveToIndex(row, col);
  }

  public getExtremaTargets(): ExtremaTarget[] {
    return [];
  }
}

/** Subclass that disables hover-driven moves (mirrors BoxTrace / ViolinBoxTrace). */
class NoMoveTrace extends TestTrace {
  protected override moveToNearest(
    _x: number,
    _y: number,
    _nearest: NearestPoint | null,
    _onCurve?: boolean,
  ): void {
    // Disabled — same pattern BoxTrace/ViolinBoxTrace use.
  }
}

const NEAREST: NearestPoint = {
  element: {} as SVGElement,
  row: 3,
  col: 4,
  centerX: 100,
  centerY: 50,
};

describe('moveToNearest override pattern (used by BoxTrace / ViolinBoxTrace)', () => {
  test('default behaviour moves when cursor is on-curve', () => {
    // Cursor at (90, 60) is left and below the nearest point at (100, 50).
    const trace = new TestTrace(NEAREST, true);
    const guidance = trace.moveToPointAndGetPointerGuidance(90, 60);

    expect(trace.moveToIndexCalls).toBe(1);
    expect(guidance).toEqual({
      onCurve: true,
      distancePx: Math.hypot(NEAREST.centerX - 90, NEAREST.centerY - 60),
      cursorVerticalPosition: 'below',
      cursorHorizontalPosition: 'left',
    });
  });

  test('override skips the move but still returns guidance', () => {
    const trace = new NoMoveTrace(NEAREST, true);
    const guidance = trace.moveToPointAndGetPointerGuidance(90, 60);

    expect(trace.moveToIndexCalls).toBe(0);
    expect(guidance).not.toBeNull();
    expect(guidance?.onCurve).toBe(true);
    expect(guidance?.distancePx).toBeCloseTo(Math.hypot(10, 10));
  });

  test('override returns off-curve guidance with distance', () => {
    const trace = new NoMoveTrace(NEAREST, false);
    const guidance = trace.moveToPointAndGetPointerGuidance(NEAREST.centerX + 80, NEAREST.centerY + 60);

    expect(trace.moveToIndexCalls).toBe(0);
    expect(guidance?.onCurve).toBe(false);
    expect(guidance?.distancePx).toBeCloseTo(100);
    expect(guidance?.cursorHorizontalPosition).toBe('right');
    expect(guidance?.cursorVerticalPosition).toBe('below');
  });

  test('returns null when no nearest point exists', () => {
    const trace = new (class extends TestTrace {
      protected override findNearestPoint(): null {
        return null;
      }
    })(NEAREST, false);
    void jest.fn(); // touch jest import so the linter keeps it

    expect(trace.moveToPointAndGetPointerGuidance(0, 0)).toBeNull();
  });
});
