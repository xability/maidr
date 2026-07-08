/**
 * Tests for GoToExtremaViewModel covering:
 *  - getAvailableXValueOptions(): raw value preserved, label x-axis formatted
 *    (matching the terse layer text) with clean fallback to String(value).
 *  - moveToIndex(): Home/End index clamping.
 *  - the menu open/close audio cues fired on toggle()/hide()/selectCurrent(),
 *    and the silence on dispose().
 */
import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { FormatterService } from '@service/formatter';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { ExtremaTarget } from '@type/extrema';
import type { TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';

function createAudioStub(): AudioService {
  return {
    playMenuOpenTone: jest.fn(),
    playMenuCloseTone: jest.fn(),
  } as unknown as AudioService;
}

function createServiceStub(navigable: boolean = true): GoToExtremaService {
  return {
    isExtremaNavigable: jest.fn(() => navigable),
    toggle: jest.fn(),
    returnToTraceScope: jest.fn(),
  } as unknown as GoToExtremaService;
}

/** Builds a trace stub exposing the X-value navigation surface the VM ducks. */
function createTraceStub(xValues: (string | number)[]): {
  getAvailableXValues: () => (string | number)[];
  getExtremaTargets: () => ExtremaTarget[];
  navigateToExtrema: jest.Mock;
} {
  return {
    getAvailableXValues: () => xValues,
    getExtremaTargets: () => [],
    navigateToExtrema: jest.fn(),
  };
}

/** Context stub whose `active` is the trace and whose `state` carries layerId. */
function createContextStub(active: unknown, layerId: string | null): Context {
  const state = layerId === null
    ? { type: 'trace', empty: true }
    : { type: 'trace', empty: false, layerId };
  return { active, state } as unknown as Context;
}

/** Formatter stub: x axis has a custom formatter mapping via `map`. */
function createFormatterStub(map: Record<string, string>): FormatterService {
  return {
    hasCustomFormatter: (_layerId: string, axis: string) => axis === 'x',
    formatSingleValue: (value: string | number) => map[String(value)] ?? String(value),
  } as unknown as FormatterService;
}

const TRACE_STATE = {
  type: 'trace',
  empty: false,
  layerId: 'layer-1',
  traceType: 'candlestick',
} as unknown as TraceState;

describe('GoToExtremaViewModel.getAvailableXValueOptions', () => {
  test('formats the label via the x formatter while keeping the raw value', () => {
    const store = createMaidrStore();
    const trace = createTraceStub(['2019-11-03', '2019-11-04']);
    const context = createContextStub(trace, 'layer-1');
    const formatter = createFormatterStub({ '2019-11-03': 'Nov 3', '2019-11-04': 'Nov 4' });
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, createAudioStub(), formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([
      { value: '2019-11-03', label: 'Nov 3' },
      { value: '2019-11-04', label: 'Nov 4' },
    ]);
  });

  test('falls back to String(value) when the layer has no custom x formatter', () => {
    const store = createMaidrStore();
    const trace = createTraceStub([1, 2, 3]);
    const context = createContextStub(trace, 'layer-1');
    const formatter = {
      hasCustomFormatter: () => false,
      formatSingleValue: () => 'SHOULD_NOT_BE_USED',
    } as unknown as FormatterService;
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, createAudioStub(), formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([
      { value: 1, label: '1' },
      { value: 2, label: '2' },
      { value: 3, label: '3' },
    ]);
  });

  test('coerces a non-string formatter result to a string label', () => {
    const store = createMaidrStore();
    const trace = createTraceStub([5, 6]);
    const context = createContextStub(trace, 'layer-1');
    // A misbehaving custom formatter (built via new Function) that returns a
    // number rather than a string. The label must still be a string so
    // downstream string operations (e.g. filter's toLowerCase) don't throw.
    const formatter = {
      hasCustomFormatter: () => true,
      formatSingleValue: (v: number) => (v * 100) as unknown as string,
    } as unknown as FormatterService;
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, createAudioStub(), formatter);

    const options = vm.getAvailableXValueOptions();
    expect(options).toEqual([{ value: 5, label: '500' }, { value: 6, label: '600' }]);
    expect(typeof options[0].label).toBe('string');
  });

  test('falls back to String(value) when no formatter is injected', () => {
    const store = createMaidrStore();
    const trace = createTraceStub(['2019-11-03']);
    const context = createContextStub(trace, 'layer-1');
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, createAudioStub());

    expect(vm.getAvailableXValueOptions()).toEqual([{ value: '2019-11-03', label: '2019-11-03' }]);
  });

  test('falls back to String(value) when the layer id is unavailable (empty state)', () => {
    const store = createMaidrStore();
    const trace = createTraceStub(['2019-11-03']);
    const context = createContextStub(trace, null); // empty trace state -> no layerId
    const formatter = createFormatterStub({ '2019-11-03': 'Nov 3' });
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, createAudioStub(), formatter);

    expect(vm.getAvailableXValueOptions()).toEqual([{ value: '2019-11-03', label: '2019-11-03' }]);
  });

  test('returns [] when the active trace does not support X-value navigation', () => {
    const store = createMaidrStore();
    const context = createContextStub({}, 'layer-1'); // active has no getAvailableXValues
    const vm = new GoToExtremaViewModel(store, createServiceStub(), context, createAudioStub());

    expect(vm.getAvailableXValueOptions()).toEqual([]);
  });
});

describe('GoToExtremaViewModel.moveToIndex', () => {
  function withTargets(count: number): { store: ReturnType<typeof createMaidrStore>; vm: GoToExtremaViewModel } {
    const store = createMaidrStore();
    const vm = new GoToExtremaViewModel(store, createServiceStub(), createContextStub({}, 'layer-1'), createAudioStub());
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
    const vm = new GoToExtremaViewModel(store, createServiceStub(), createContextStub({}, 'layer-1'), createAudioStub());
    vm.moveToIndex(2);
    expect(store.getState().goToExtrema.selectedIndex).toBe(0); // unchanged initial
  });
});

describe('GoToExtremaViewModel menu audio cues', () => {
  test('toggle() plays the open cue once when the trace is extrema-navigable', () => {
    const store = createMaidrStore();
    const audio = createAudioStub();
    const trace = createTraceStub(['2019-11-03']);
    const vm = new GoToExtremaViewModel(store, createServiceStub(true), createContextStub(trace, 'layer-1'), audio);

    vm.toggle(TRACE_STATE);

    expect(audio.playMenuOpenTone).toHaveBeenCalledTimes(1);
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });

  test('hide() plays the close cue once', () => {
    const store = createMaidrStore();
    const audio = createAudioStub();
    const vm = new GoToExtremaViewModel(store, createServiceStub(), createContextStub({}, 'layer-1'), audio);

    vm.hide();

    expect(audio.playMenuCloseTone).toHaveBeenCalledTimes(1);
    expect(audio.playMenuOpenTone).not.toHaveBeenCalled();
  });

  test('selectCurrent() closes the modal (plays the close cue) and navigates', () => {
    const store = createMaidrStore();
    const audio = createAudioStub();
    const trace = createTraceStub(['2019-11-03']);
    const vm = new GoToExtremaViewModel(store, createServiceStub(true), createContextStub(trace, 'layer-1'), audio);
    store.dispatch({ type: 'goToExtrema/show', payload: { targets: [{ label: 't0' }], description: '' } });

    vm.selectCurrent();

    expect(audio.playMenuCloseTone).toHaveBeenCalledTimes(1);
    expect(trace.navigateToExtrema).toHaveBeenCalledTimes(1);
  });

  test('dispose() does not play any cue (focus-out is silent)', () => {
    const store = createMaidrStore();
    const audio = createAudioStub();
    const vm = new GoToExtremaViewModel(store, createServiceStub(), createContextStub({}, 'layer-1'), audio);

    vm.dispose();

    expect(audio.playMenuOpenTone).not.toHaveBeenCalled();
    expect(audio.playMenuCloseTone).not.toHaveBeenCalled();
  });
});
