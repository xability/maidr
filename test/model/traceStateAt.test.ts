import type { MaidrLayer } from '@type/grammar';
import { describe, expect, jest, test } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { TraceType } from '@type/grammar';

/**
 * Creates a bar layer with three points for state-at tests.
 * @returns A bar layer definition
 */
function createBarLayer(): MaidrLayer {
  return {
    id: 'bar-layer',
    type: TraceType.BAR,
    axes: { x: { label: 'Category' }, y: { label: 'Value' } },
    data: [
      { x: 'A', y: 1 },
      { x: 'B', y: 2 },
      { x: 'C', y: 3 },
    ],
  };
}

describe('abstractTrace.getStateAt', () => {
  test('computes the state at the requested position', () => {
    const trace = new BarTrace(createBarLayer());

    const state = trace.getStateAt(0, 2);

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(state.text.main.value).toBe('C');
      expect(state.text.cross.value).toBe(3);
    }
  });

  test('does not move the cursor or clear initial entry', () => {
    const trace = new BarTrace(createBarLayer());

    trace.getStateAt(0, 2);

    expect(trace.row).toBe(0);
    expect(trace.col).toBe(0);
    expect(trace.isInitialEntry).toBe(true);
  });

  test('preserves a user-navigated position', () => {
    const trace = new BarTrace(createBarLayer());
    trace.isInitialEntry = false;
    trace.col = 1;

    trace.getStateAt(0, 2);

    expect(trace.col).toBe(1);
    expect(trace.isInitialEntry).toBe(false);
  });

  test('does not notify observers', () => {
    const trace = new BarTrace(createBarLayer());
    const observer = { update: jest.fn() };
    trace.addObserver(observer);

    trace.getStateAt(0, 2);

    expect(observer.update).not.toHaveBeenCalled();
  });
});
