/**
 * @jest-environment jsdom
 */

/**
 * Highlight resolution for a pie layer.
 *
 * The contract is exactly one element per slice, in slice order, so data index
 * k and element k are the same wedge. Nothing else in the model enforces that
 * — a selector matching a different number of elements would be index-aligned
 * anyway and would highlight a wedge the announcement is not describing.
 */

import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { PieTrace } from '@model/pie';
import { TraceType } from '@type/grammar';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const SLICE_LABELS = ['Apples', 'Bananas', 'Cherries'];

/** Renders `count` wedges under `#pie`, each carrying its slice label. */
function renderWedges(count: number): void {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  group.setAttribute('id', 'pie');
  for (let index = 0; index < count; index++) {
    const wedge = document.createElementNS(SVG_NAMESPACE, 'path');
    wedge.setAttribute('class', 'slice');
    wedge.setAttribute('data-slice', SLICE_LABELS[index] ?? `Slice ${index + 1}`);
    group.appendChild(wedge);
  }
  svg.appendChild(group);
  document.body.appendChild(svg);
}

/** A three-slice pie layer pointed at whatever `#pie` currently holds. */
function pieLayer(selectors: string): MaidrLayer {
  return {
    id: 'slices',
    type: TraceType.PIE,
    selectors,
    axes: { x: { label: 'Fruit' }, y: { label: 'Units' } },
    data: SLICE_LABELS.map((x, index) => ({ x, y: (index + 1) * 10 })),
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: PieTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state;
}

describe('pie highlight resolution', () => {
  beforeEach(() => {
    renderWedges(3);
  });

  it('highlights the wedge that shares the slice index', () => {
    const trace = new PieTrace(pieLayer('#pie path.slice'));

    trace.moveToIndex(0, 1);
    const { highlight } = stateOf(trace);

    if (highlight.empty) {
      throw new Error('expected the second wedge to be highlighted');
    }
    const element = Array.isArray(highlight.elements)
      ? highlight.elements[0]
      : highlight.elements;
    expect(element.getAttribute('data-slice')).toBe('Bananas');
  });

  it('reports no highlight when the selector resolves the wrong number of wedges', () => {
    renderWedges(2);

    const trace = new PieTrace(pieLayer('#pie path.slice'));

    trace.moveToIndex(0, 0);
    // Index-aligning two elements to three slices would confidently highlight
    // the wrong wedge; no highlight is the better answer.
    expect(stateOf(trace).highlight.empty).toBe(true);
  });

  it('leaves no orphaned clones behind when it rejects the selector', () => {
    renderWedges(2);

    const trace = new PieTrace(pieLayer('#pie path.slice'));

    // The clones are inserted by the selection itself, and disposal only
    // reaches elements the trace kept a reference to — so the rejecting path
    // has to remove them itself or they leak into the chart's DOM.
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
    expect(stateOf(trace).highlight.empty).toBe(true);
  });

  it('reports no highlight for a layer that declares no selector', () => {
    const trace = new PieTrace({ ...pieLayer('#pie path.slice'), selectors: undefined });

    trace.moveToIndex(0, 0);

    expect(stateOf(trace).highlight.empty).toBe(true);
  });

  it('removes the clones it owns on disposal', () => {
    const trace = new PieTrace(pieLayer('#pie path.slice'));
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(3);

    trace.dispose();

    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
    // The chart's own wedges are not MAIDR's to remove.
    expect(document.querySelectorAll('#pie path.slice')).toHaveLength(3);
  });
});
