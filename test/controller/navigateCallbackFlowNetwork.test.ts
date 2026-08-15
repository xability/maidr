/**
 * @jest-environment jsdom
 */

import type { FlowPoint, Maidr, NavigateCallback, NetworkPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { createNavigateObserver } from '@util/navigateObserver';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * The navigate callback carries a flow or network highlight (#904).
 *
 * A canvas chart has no SVG elements for `selectors` to reach, so this callback
 * is its only path to an overlay — and until now a sankey, chord, alluvial or
 * network layer sent it the *braille* position. For a flow trace that position
 * is deliberately transposed (`row` is the stage, `col` the node within it),
 * and for neither trace does it name the ribbon or line the chart actually
 * outlines. An adapter reading it would have had to rebuild `assignStages` or
 * `findComponents` to get back to a node, which is the copy #895 and #903 both
 * refused to ship.
 *
 * Now both traces publish the mark itself, by its index in the `data` array the
 * adapter supplied. This drives the moves through `Context` exactly as a
 * keypress does, and registers `createNavigateObserver` — the observer
 * `Controller` registers, imported rather than re-implemented — so what runs
 * here is the shipped wiring.
 */

/** What the callback is handed, mirroring `NavigateCallback`'s parameter. */
type NavEvent = {
  layerId: string;
  row: number;
  col: number;
  pointIndices?: readonly number[];
} | null;

const FORWARD: MovableDirection = 'FORWARD';

/** Flows declared out of value order, with a junction in the middle. */
const FLOWS: FlowPoint[] = [
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Electricity', target: 'Homes', value: 20 },
];

/** A hub whose most connected neighbour is not the first link authored. */
const LINKS: NetworkPoint[] = [
  { source: 'Ada', target: 'Edsger' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
];

/**
 * A sankey and a network, in one panel each, carrying no selectors.
 *
 * The missing selectors are the reported case rather than an omission: a canvas
 * chart has nothing to select, so the element channel is unavailable and the
 * published indices are the only thing an overlay can act on.
 *
 * @returns The figure definition
 */
function figureData(): Maidr {
  return {
    id: 'flow-and-network',
    subplots: [
      [
        {
          layers: [{
            id: 'sankey',
            type: TraceType.SANKEY,
            axes: { x: { label: 'Node' }, y: { label: 'Petajoules' } },
            data: FLOWS,
          }],
        },
        {
          layers: [{
            id: 'network',
            type: TraceType.NETWORK,
            axes: { x: { label: 'Person' }, y: { label: 'Links' } },
            data: LINKS,
          }],
        },
      ],
    ],
  } as Maidr;
}

describe('the navigate callback reaches a flow or network trace', () => {
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
  }

  beforeEach(() => {
    figure = new Figure(figureData());
    figure.applyLayout(resolveSubplotLayout(figure.subplots));
    context = new Context(figure);
    seen = [];
    register(event => void seen.push(event));
  });

  /** Steps the lobby cursor onto the second panel and enters it. */
  function enterNetworkPanel(): void {
    context.enterSubplot();
    context.exitSubplot();
    // The lobby cursor starts before the first panel, so the first move lands
    // on panel 1 and the second is what reaches the network panel.
    context.moveOnce(FORWARD);
    context.moveOnce(FORWARD);
    context.enterSubplot();
  }

  it('names the ribbon a flow node highlighted, not the braille position', () => {
    context.enterSubplot();
    seen.length = 0;

    context.moveOnce(FORWARD);

    // Coal's widest flow is `Coal-Electricity`, declared at index 1. The
    // braille pair this used to send was `{ row: 0, col: 0 }` — the stage and
    // the node within it, which names no ribbon at all.
    expect(seen.at(-1)).toEqual({
      layerId: 'sankey',
      row: -1,
      col: -1,
      pointIndices: [1],
    });
  });

  it('names one ribbon at a junction rather than every ribbon touching it', () => {
    context.enterSubplot();
    seen.length = 0;

    context.moveOnce(FORWARD);
    context.moveOnce(FORWARD);

    // Electricity receives flow 1 and sends flow 3. `[...out, ...in]` would
    // publish `[3, 1]` here, and an overlay would light both bands while an
    // SVG renderer lit one — the disagreement #904 exists to prevent.
    expect(seen.at(-1)?.pointIndices).toEqual([3]);
  });

  it('names the line a network node highlighted', () => {
    enterNetworkPanel();
    seen.length = 0;

    context.moveOnce(FORWARD);

    // Ada's neighbours by degree are Grace and Alan (2 each) then Edsger (1),
    // so the first is Grace — link 1, not the link 0 a pairing by rank takes.
    expect(seen.at(-1)).toEqual({
      layerId: 'network',
      row: -1,
      col: -1,
      pointIndices: [1],
    });
  });

  it('sends -1 for the position, so an un-updated consumer clears', () => {
    context.enterSubplot();
    seen.length = 0;
    context.moveOnce(FORWARD);

    const event = seen.at(-1);
    // Every consumer in the tree bounds-checks the pair before indexing with
    // it, so an integration that has not learned about `pointIndices` degrades
    // to no highlight — never to a box on an arbitrary ribbon.
    expect(event?.row).toBe(-1);
    expect(event?.col).toBe(-1);
  });
});
