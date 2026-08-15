/**
 * @jest-environment jsdom
 */

import type { Maidr, NavigateCallback } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { createNavigateObserver } from '@util/navigateObserver';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * A canvas adapter could not highlight a scatter-family point at all (#897).
 *
 * The navigate callback — the only path a canvas chart has to an overlay, since
 * it has no SVG elements for `selectors` to reach — fired only when
 * `state.braille` was non-empty. `ScatterTrace.braille` is empty outside grid
 * mode, so a scatter, volcano or Manhattan layer on amCharts or Chart.js
 * emitted **no navigation event whatever** during ordinary point-by-point
 * navigation, and the overlay never moved.
 *
 * Grid mode was not the escape hatch it looked like: it needs
 * `axes.{x,y}.{min,max,tickStep}`, and neither canvas adapter emits those — so
 * for those two adapters the callback fired literally never. Where it *did*
 * fire, the `row`/`col` it carried were binned grid cells, and an overlay
 * trusting them would outline whichever point sat at that ordinal.
 *
 * Constructing a `Controller` needs a live DOM, a Redux store and every
 * service, so this registers `createNavigateObserver` — the observer the
 * controller registers, imported rather than re-implemented, so that the
 * shipped wiring is what runs here — and drives the moves through `Context`
 * exactly as a keypress does.
 */

/** What the callback is handed, mirroring `NavigateCallback`'s parameter. */
type NavEvent = {
  layerId: string;
  row: number;
  col: number;
  pointIndices?: readonly number[];
} | null;

const FORWARD: MovableDirection = 'FORWARD';

/**
 * A scatter beside a bar, in one panel each.
 *
 * The scatter carries only axis *labels* — the shape both canvas adapters emit
 * — so grid mode is unavailable and this is exactly the reported case. Two of
 * its points share an X, so a column selects a set.
 */
function figureData(): Maidr {
  return {
    id: 'cloud-and-bar',
    subplots: [
      [
        {
          layers: [{
            id: 'cloud',
            type: TraceType.SCATTER,
            axes: { x: { label: 'X' }, y: { label: 'Y' } },
            data: [
              { x: 1, y: 10 },
              { x: 2, y: 20 },
              { x: 2, y: 30 },
            ],
          }],
        },
        {
          layers: [{
            id: 'bars',
            type: TraceType.BAR,
            data: [{ x: 'Apples', y: 30 }, { x: 'Bananas', y: 50 }],
          }],
        },
      ],
    ],
  } as Maidr;
}

describe('the navigate callback reaches a point cloud', () => {
  let figure: Figure;
  let context: Context;
  let seen: NavEvent[];

  /** Registers what `Controller.registerNavigateCallback` registers. */
  function register(callback: NavigateCallback): void {
    figure.subplots.forEach(row => row.forEach((subplot) => {
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(createNavigateObserver(trace, callback));
      }));
    }));
    figure.addObserver({ update: () => callback(null) } as never);
  }

  beforeEach(() => {
    figure = new Figure(figureData());
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    context = new Context(figure);
    seen = [];
    register(event => void seen.push(event));
  });

  it('fires at all for a scatter outside grid mode', () => {
    context.enterSubplot();
    seen.length = 0;

    // The cursor sits before the first column on entry, so the first move
    // lands on column 0 rather than stepping past it.
    context.moveOnce(FORWARD);

    // The bug in one assertion: this array stayed empty, so a canvas overlay
    // was never told anything had been selected.
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).not.toBeNull();
  });

  it('addresses the points rather than a position', () => {
    context.enterSubplot();
    seen.length = 0;

    context.moveOnce(FORWARD);
    // Column 0 is x=1, which only data[0] sits in.
    expect(seen.at(-1)).toEqual({
      layerId: 'cloud',
      row: -1,
      col: -1,
      pointIndices: [0],
    });

    context.moveOnce(FORWARD);
    // Column 1 is x=2, holding both data[1] and data[2]. A row/column pair
    // could not have said this.
    expect(seen.at(-1)).toEqual({
      layerId: 'cloud',
      row: -1,
      col: -1,
      pointIndices: [1, 2],
    });
  });

  it('sends -1 for the position, so an un-updated consumer clears', () => {
    context.enterSubplot();
    seen.length = 0;
    context.moveOnce(FORWARD);

    const event = seen.at(-1);
    // Every existing consumer bounds-checks the pair before indexing with it
    // (see `resolveActiveTargets`), so -1 degrades to no highlight rather than
    // to a box on an arbitrary mark. That is the behaviour #895 chose when it
    // declined to register a resolver at all, preserved here for free.
    expect(event?.row).toBe(-1);
    expect(event?.col).toBe(-1);
  });

  it('leaves a non-cloud trace emitting exactly what it emitted before', () => {
    // An SVG adapter highlights through `selectors` and never registers this
    // callback, but a canvas bar chart does — and its events must not shift.
    context.enterSubplot();
    context.exitSubplot();
    // The lobby cursor starts before the first panel, so the first move lands
    // on panel 1 and the second is what reaches the bar panel.
    context.moveOnce(FORWARD);
    context.moveOnce(FORWARD);
    context.enterSubplot();
    seen.length = 0;

    context.moveOnce(FORWARD);

    // The braille row/col pair, unchanged and with no `pointIndices` field.
    expect(seen.at(-1)).toEqual({ layerId: 'bars', row: 0, col: 0 });
  });
});
