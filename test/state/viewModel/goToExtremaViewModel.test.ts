/**
 * Tests for GoToExtremaViewModel covering:
 *  - getAvailableXValueOptions() and formatTargetXValues(): raw value preserved,
 *    label x-axis formatted (matching the terse layer text) for every known
 *    layer, falling back to String(value) only with no formatter or no layer id.
 *  - moveToIndex(): Home/End index clamping.
 *  - the scope transitions on toggle()/hide()/selectCurrent() that DisplayViewModel
 *    turns into the menu open/close cues, and the silence on dispose().
 */
import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { ExtremaTarget } from '@type/extrema';
import type { AxisFormat } from '@type/grammar';
import type { AxisType, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { FormatterService } from '@service/formatter';
import { createMaidrStore } from '@state/store';
import { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import { TraceType } from '@type/grammar';

function createServiceStub(navigable: boolean = true): GoToExtremaService {
  return {
    isExtremaNavigable: jest.fn(() => navigable),
    toggle: jest.fn(),
    returnToTraceScope: jest.fn(),
  } as unknown as GoToExtremaService;
}

/** Builds a trace stub exposing the X-value navigation surface the VM ducks. */
function createTraceStub(
  xValues: (string | number)[],
  extremaTargets: ExtremaTarget[] = [],
): {
  getAvailableXValues: () => (string | number)[];
  getExtremaTargets: () => ExtremaTarget[];
  navigateToExtrema: jest.Mock;
} {
  return {
    getAvailableXValues: () => xValues,
    getExtremaTargets: () => extremaTargets,
    navigateToExtrema: jest.fn(),
  };
}

/** A FormatterService over one layer, with no `AxisFormat` unless given. */
function createRealFormatter(format?: AxisFormat, yFormat?: AxisFormat): FormatterService {
  return new FormatterService({
    id: 'chart',
    subplots: [[{
      layers: [{
        id: 'layer-1',
        type: TraceType.BAR,
        axes: {
          x: { label: 'Quarter', ...(format ? { format } : {}) },
          y: { label: 'Share', ...(yFormat ? { format: yFormat } : {}) },
        },
        data: [],
      }],
    }]],
  });
}

/**
 * Context stub whose `active` is the trace and whose `state` carries layerId.
 * `mainAxis` is the axis the trace reports its main value on — 'x' for a
 * vertical trace, 'y' for a horizontal one, as `TextState.mainAxis` does.
 */
function createContextStub(
  active: unknown,
  layerId: string | null,
  mainAxis: AxisType = 'x',
): Context {
  const state = layerId === null
    ? { type: 'trace', empty: true }
    : { type: 'trace', empty: false, layerId, text: { mainAxis } };
  return { active, state } as unknown as Context;
}

/** Formatter stub: x axis has a custom formatter mapping via `map`. */
function createFormatterStub(map: Record<string, string>): FormatterService {
  return {
    formatSingleValue: (value: string | number) => map[String(value)] ?? String(value),
  } as unknown as FormatterService;
}

const TRACE_STATE = {
  type: 'trace',
  empty: false,
  layerId: 'layer-1',
  traceType: 'candlestick',
  text: { mainAxis: 'x' },
} as unknown as TraceState;

/**
 * A horizontal trace: the value it calls `xValue` sits on the y axis, which is
 * what `TextState.mainAxis` reports and what the announcement formats with.
 */
const HORIZONTAL_TRACE_STATE = {
  type: 'trace',
  empty: false,
  layerId: 'layer-1',
  traceType: 'bar',
  text: { mainAxis: 'y' },
} as unknown as TraceState;

describe('GoToExtremaViewModel.getAvailableXValueOptions', () => {
  test('formats the label via the x formatter while keeping the raw value', () => {
    const store = createMaidrStore();
    const trace = createTraceStub(['2019-11-03', '2019-11-04']);
    const context = createContextStub(trace, 'layer-1');
    const formatter = createFormatterStub({ '2019-11-03': 'Nov 3', '2019-11-04': 'Nov 4' });
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([
      { value: '2019-11-03', label: 'Nov 3' },
      { value: '2019-11-04', label: 'Nov 4' },
    ]);
  });

  test('formats a layer with no author-supplied format, matching the announcement', () => {
    // A real FormatterService, so this exercises the default path rather than
    // a stub's idea of it: an axis with no `AxisFormat` still rounds, because
    // that is what the announcement for the same point says. This used to be
    // gated behind `hasCustomFormatter`, which could never answer false.
    const store = createMaidrStore();
    const trace = createTraceStub([57.14285714285714, 2, 3]);
    const context = createContextStub(trace, 'layer-1');
    const formatter = createRealFormatter();
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([
      { value: 57.14285714285714, label: '57.14' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
    ]);

    formatter.dispose();
  });

  test('coerces a non-string formatter result to a string label', () => {
    const store = createMaidrStore();
    const trace = createTraceStub([5, 6]);
    const context = createContextStub(trace, 'layer-1');
    // A misbehaving custom formatter (built via new Function) that returns a
    // number rather than a string. The label must still be a string so
    // downstream string operations (e.g. filter's toLowerCase) don't throw.
    const formatter = {
      formatSingleValue: (v: number) => (v * 100) as unknown as string,
    } as unknown as FormatterService;
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, formatter);

    const options = vm.getAvailableXValueOptions();
    expect(options).toEqual([{ value: 5, label: '500' }, { value: 6, label: '600' }]);
    expect(typeof options[0].label).toBe('string');
  });

  test('formats a horizontal trace\u2019s categories with its main axis, not always x', () => {
    // A horizontal bar reports its category as `xValue`, but that category
    // lives on the y axis \u2014 which is what `TextState.mainAxis` says and what
    // the announcement for the same point formats with. Formatting these
    // options with x applied the value axis\u2019s currency format to a category,
    // so the option read "$2,019.00" while the announcement said "2019".
    const store = createMaidrStore();
    const trace = createTraceStub([2019, 2020]);
    const context = createContextStub(trace, 'layer-1', 'y');
    const formatter = createRealFormatter({ type: 'currency' });
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([
      { value: 2019, label: '2019' },
      { value: 2020, label: '2020' },
    ]);

    formatter.dispose();
  });

  test('falls back to String(value) when no formatter is injected', () => {
    const store = createMaidrStore();
    const trace = createTraceStub(['2019-11-03']);
    const context = createContextStub(trace, 'layer-1');
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context);

    expect(vm.getAvailableXValueOptions()).toEqual([{ value: '2019-11-03', label: '2019-11-03' }]);
  });

  test('falls back to String(value) when the layer id is unavailable (empty state)', () => {
    const store = createMaidrStore();
    const trace = createTraceStub(['2019-11-03']);
    const context = createContextStub(trace, null); // empty trace state -> no layerId
    const formatter = createFormatterStub({ '2019-11-03': 'Nov 3' });
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([{ value: '2019-11-03', label: '2019-11-03' }]);
  });

  test('returns [] when the active trace does not support X-value navigation', () => {
    const store = createMaidrStore();
    const context = createContextStub({}, 'layer-1'); // active has no getAvailableXValues
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context);

    expect(vm.getAvailableXValueOptions()).toEqual([]);
  });
});

describe('GoToExtremaViewModel.moveToIndex', () => {
  function withTargets(count: number): { store: ReturnType<typeof createMaidrStore>; vm: GoToExtremaViewModel } {
    const store = createMaidrStore();
    const vm = new GoToExtremaViewModel(store, createServiceStub(), createContextStub({}, 'layer-1'));
    const targets = Array.from({ length: count }, (_, i) => ({ label: `t${i}` }));
    store.dispatch({ type: 'goToExtrema/show', payload: { targets, description: '' } });
    return { store, vm };
  }

  test('sets an in-range index', () => {
    const { store, vm } = withTargets(3);
    vm.moveToIndex(2);
    expect(store.getState().goToExtrema.selectedIndex).toBe(2);
  });

  test('clamps above the virtual search option to targets.length', () => {
    const { store, vm } = withTargets(3);
    vm.moveToIndex(99);
    expect(store.getState().goToExtrema.selectedIndex).toBe(3); // targets.length (search option)
  });

  test('clamps a negative index to 0', () => {
    const { store, vm } = withTargets(3);
    vm.moveToIndex(-5);
    expect(store.getState().goToExtrema.selectedIndex).toBe(0);
  });

  test('is a no-op when there are no targets', () => {
    const store = createMaidrStore();
    const vm = new GoToExtremaViewModel(store, createServiceStub(), createContextStub({}, 'layer-1'));
    vm.moveToIndex(2);
    expect(store.getState().goToExtrema.selectedIndex).toBe(0); // unchanged initial
  });
});

describe('GoToExtremaViewModel.formatTargetXValues (via toggle)', () => {
  /** A min/max target as a trace builds it: the sentence and its parts. */
  function target(name: string, x: string, xValue: string | number, y?: string): ExtremaTarget {
    return {
      label: y === undefined ? `${name} at ${x}` : `${name} at ${x}, ${y}`,
      display: y === undefined ? { name, x } : { name, x, y },
      xValue,
    } as unknown as ExtremaTarget;
  }

  function formatted(store: ReturnType<typeof createMaidrStore>): ExtremaTarget['display'] {
    return store.getState().goToExtrema.targets[0].display;
  }

  test('rounds a long float in an extrema position for a layer with no format', () => {
    // A real FormatterService over a layer with no `AxisFormat` still shortens
    // the position, so the dialog and the announcement say the same number for
    // the same point.
    const store = createMaidrStore();
    const trace = createTraceStub([], [target('Max Bar', '57.14285714285714', 57.14285714285714)]);
    const formatter = createRealFormatter();
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1'),
      formatter,
    );

    vm.toggle(TRACE_STATE);

    expect(formatted(store)).toEqual({ name: 'Max Bar', x: '57.14' });

    formatter.dispose();
  });

  test('leaves a position alone when the formatter does not change the value', () => {
    const store = createMaidrStore();
    const trace = createTraceStub([], [target('Max Bar', 'Q1', 'Q1')]);
    const formatter = createRealFormatter();
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1'),
      formatter,
    );

    vm.toggle(TRACE_STATE);

    expect(formatted(store)).toEqual({ name: 'Max Bar', x: 'Q1' });

    formatter.dispose();
  });

  test('formats the x of a grid cell and leaves its row alone', () => {
    // A heatmap target carries both coordinates. Only x has a formatter; the
    // row must come through as the trace wrote it even when it shares the
    // digits of x.
    const store = createMaidrStore();
    const trace = createTraceStub([], [
      target('Global Maximum', '9', 9, '2'),
      target('Row Maximum', '1', 1, '12'),
    ]);
    const formatter = createRealFormatter({ type: 'fixed', decimals: 1 });
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1'),
      formatter,
    );

    vm.toggle(TRACE_STATE);

    expect(store.getState().goToExtrema.targets.map(t => t.display)).toEqual([
      { name: 'Global Maximum', x: '9.0', y: '2' },
      { name: 'Row Maximum', x: '1.0', y: '12' },
    ]);

    formatter.dispose();
  });

  test('leaves a position that is not the raw x value written out alone', () => {
    // A trace may place an extremum by a label of its own rather than by the
    // raw x; the formatter has nothing to say about that label.
    const store = createMaidrStore();
    const trace = createTraceStub([], [target('Max Data', 'rest', 7)]);
    const formatter = createRealFormatter({ type: 'fixed', decimals: 1 });
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1'),
      formatter,
    );

    vm.toggle(TRACE_STATE);

    expect(formatted(store)).toEqual({ name: 'Max Data', x: 'rest' });

    formatter.dispose();
  });

  test('never rewrites the sentence, in any language', () => {
    // The Korean sentence puts the position first and has no " at " in it;
    // the parts are what get formatted, and the sentence is not parsed.
    const store = createMaidrStore();
    const trace = createTraceStub([], [{
      label: '57.14285714285714의 최대 막대',
      display: { name: '최대 막대', x: '57.14285714285714' },
      xValue: 57.14285714285714,
    } as unknown as ExtremaTarget]);
    const formatter = createRealFormatter();
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1'),
      formatter,
    );

    vm.toggle(TRACE_STATE);

    expect(store.getState().goToExtrema.targets[0]).toMatchObject({
      label: '57.14285714285714의 최대 막대',
      display: { name: '최대 막대', x: '57.14' },
    });

    formatter.dispose();
  });

  test('formats a horizontal trace\u2019s position with its main axis, not always x', () => {
    // The dialog announced "Max Bar at $2,019.00" for a category the trace
    // itself announces as "2019".
    const store = createMaidrStore();
    const trace = createTraceStub([], [target('Max Bar', '2019', 2019)]);
    const formatter = createRealFormatter({ type: 'currency' });
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1', 'y'),
      formatter,
    );

    vm.toggle(HORIZONTAL_TRACE_STATE);

    expect(formatted(store)).toEqual({ name: 'Max Bar', x: '2019' });

    formatter.dispose();
  });

  test('formats a horizontal trace\u2019s position with the y format the announcement uses', () => {
    const store = createMaidrStore();
    const trace = createTraceStub([], [target('Max Bar', '57.14285714285714', 57.14285714285714)]);
    const formatter = createRealFormatter({ type: 'currency' }, { type: 'fixed', decimals: 1 });
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1', 'y'),
      formatter,
    );

    vm.toggle(HORIZONTAL_TRACE_STATE);

    expect(formatted(store)).toEqual({ name: 'Max Bar', x: '57.1' });

    formatter.dispose();
  });

  test('still honours an author-supplied format on the same path', () => {
    const store = createMaidrStore();
    const trace = createTraceStub([], [target('Max Bar', '57.14285714285714', 57.14285714285714)]);
    const formatter = createRealFormatter({ type: 'fixed', decimals: 4 });
    const vm = new GoToExtremaViewModel(
      store,
      createServiceStub(true),
      createContextStub(trace, 'layer-1'),
      formatter,
    );

    vm.toggle(TRACE_STATE);

    expect(formatted(store)).toEqual({ name: 'Max Bar', x: '57.1429' });

    formatter.dispose();
  });
});
