import type { AbstractTrace } from '@model/abstract';
import type { Context } from '@model/context';
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { GoToExtremaService } from '@service/goToExtrema';
import { Orientation, TraceType } from '@type/grammar';

/**
 * Two violins, each level drawn on both edges, as producers send a violin.
 * `Ideal` is widest at 950 and narrowest at both tails, 100 and 1800, where
 * it is equally thin; `Fair` is widest at 2400.
 */
const VIOLINS: ViolinKdePoint[][] = [
  [
    { x: 'Ideal', y: 100, width: 0.05 },
    { x: 'Ideal', y: 100, width: 0.05 },
    { x: 'Ideal', y: 500, width: 0.4 },
    { x: 'Ideal', y: 500, width: 0.4 },
    { x: 'Ideal', y: 950, width: 0.8 },
    { x: 'Ideal', y: 950, width: 0.8 },
    { x: 'Ideal', y: 1400, width: 0.3 },
    { x: 'Ideal', y: 1400, width: 0.3 },
    { x: 'Ideal', y: 1800, width: 0.05 },
    { x: 'Ideal', y: 1800, width: 0.05 },
  ],
  [
    { x: 'Fair', y: 300, width: 0.1 },
    { x: 'Fair', y: 300, width: 0.1 },
    { x: 'Fair', y: 2400, width: 0.8 },
    { x: 'Fair', y: 2400, width: 0.8 },
    { x: 'Fair', y: 5000, width: 0.02 },
    { x: 'Fair', y: 5000, width: 0.02 },
  ],
];

/**
 * A violin density layer, as the figure builds one.
 * @param data The curves
 * @param orientation How the violins are drawn
 * @returns The trace
 */
function violins(data: ViolinKdePoint[][] = VIOLINS, orientation?: Orientation): AbstractTrace {
  const layer: MaidrLayer = {
    id: 'density',
    type: TraceType.VIOLIN_KDE,
    axes: { x: { label: 'Cut' }, y: { label: 'Price' } },
    data,
    ...(orientation === undefined ? {} : { orientation }),
  };
  return TraceFactory.create(layer) as AbstractTrace;
}

/**
 * The targets as type, label and value, as the Go To dialog lists them.
 * @param trace The trace to read
 * @returns One triple per target
 */
function offered(trace: AbstractTrace): [string, string, number][] {
  return trace.getExtremaTargets().map(target => [target.type, target.label, target.value]);
}

/**
 * One of a trace's targets, by its place in the list.
 * @param trace The trace to read
 * @param index Which target
 * @returns The target
 */
function targetAt(trace: AbstractTrace, index: number): ExtremaTarget {
  const target = trace.getExtremaTargets()[index];
  if (target === undefined) {
    throw new Error(`Expected a target at ${index}`);
  }
  return target;
}

/**
 * What the cursor announces: the violin, the value and the width.
 * @param trace The trace to read
 * @returns The three
 */
function announced(trace: AbstractTrace): unknown[] {
  const { text } = trace.state as NonEmptyTraceState;
  return [text.main.value, text.cross?.value, text.z?.value];
}

/**
 * The real service over a stub context. `goToExtremeValue` reads only the
 * active plot and its state.
 * @param active The trace the cursor is in
 * @returns The service
 */
function serviceFor(active: AbstractTrace): GoToExtremaService {
  const context = {
    get active() {
      return active;
    },
    get state() {
      return active.state;
    },
  } as unknown as Context;
  return new GoToExtremaService(context, { toggleFocus: (): void => {} } as never);
}

describe('a violin\'s density layer answers [ and ] at the widest and narrowest part of the violin the reader is on', () => {
  test('offers the widest level, and every level as narrow as the narrowest', () => {
    // Both keys answered that there was no maximum or minimum value in this
    // layer, though every level carries the width the violin is drawn at.
    const trace = violins();
    trace.moveToIndex(0, 0);

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Max point at 950', 0.8],
      ['min', 'Min point at 100', 0.05],
      ['min', 'Min point at 1800', 0.05],
    ]);
  });

  test('offers each level once, though it is drawn on both edges', () => {
    // Read as points, every target would come twice, and a second press of
    // ] would announce the same reading again as "2 of 2".
    const trace = violins();
    trace.moveToIndex(0, 0);

    expect(trace.getExtremaTargets().filter(target => target.type === 'max')).toHaveLength(1);
  });

  test('stays on its own violin rather than going to the widest of all', () => {
    const trace = violins();
    trace.moveToIndex(1, 0);

    expect(offered(trace)).toEqual([
      ['max', 'Max point at 2400', 0.8],
      ['min', 'Min point at 5000', 0.02],
    ]);
  });

  test('lands on the level, as a move along the curve announces it', () => {
    const trace = violins();
    trace.moveToIndex(1, 0);

    trace.navigateToExtrema(targetAt(trace, 0));

    expect(announced(trace)).toEqual(['Fair', 2400, '0.8']);
  });

  test('walks the narrowest levels, a further [ going to the next', () => {
    const trace = violins();
    trace.moveToIndex(0, 2);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
    expect(announced(trace)).toEqual(['Ideal', 100, '0.05']);

    expect(service.goToExtremeValue('min')).toEqual({ position: 2, total: 2 });
    expect(announced(trace)).toEqual(['Ideal', 1800, '0.05']);
  });

  test('works the same on violins drawn on their side', () => {
    // A horizontal layer lists its violins bottom first, so the reader's
    // first violin is the last one declared.
    const trace = violins(VIOLINS, Orientation.HORIZONTAL);
    trace.moveToIndex(0, 0);

    expect(offered(trace)[0]).toEqual(['max', 'Max point at 2400', 0.8]);
  });

  test('never offers a level drawn with neither a density nor a width', () => {
    // The layer reads such a level as 0 for its pitch and braille; as a
    // target it would be a narrowest point the violin was never drawn at.
    const trace = violins([[
      { x: 'Ideal', y: 100, width: 0.2 },
      { x: 'Ideal', y: 500 },
      { x: 'Ideal', y: 900, width: 0.6 },
    ]]);
    trace.moveToIndex(0, 0);

    expect(offered(trace)).toEqual([
      ['max', 'Max point at 900', 0.6],
      ['min', 'Min point at 100', 0.2],
    ]);
  });
});
