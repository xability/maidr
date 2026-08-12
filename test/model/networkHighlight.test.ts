/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { NetworkTrace } from '@model/network';
import { TraceType } from '@type/grammar';

/**
 * A hub, its three neighbours, and a node linked to nobody.
 *
 * The links are declared so that the hub's widest neighbour is *not* the first
 * link authored: pairing by rank in the degree-sorted list would point at the
 * wrong line, which is the same mismap the sankey had.
 */
const LINKS: NetworkPoint[] = [
  { source: 'Ada', target: 'Edsger' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Ida', target: 'Ida' },
];

/**
 * Create a network layer whose selectors name each line by its own link.
 * @returns Network layer definition
 */
function createLayer(): MaidrLayer {
  return {
    id: 'test-network-highlight',
    type: TraceType.NETWORK,
    title: 'Collaborations',
    axes: { x: { label: 'Person' }, y: { label: 'Links' } },
    selectors: LINKS.map((_, index) => `#link-${index}`),
    data: LINKS,
  };
}

/**
 * The element the trace would highlight at the cursor's position.
 * @param trace The trace to read
 * @returns The highlighted element, or null when there is none
 */
function highlighted(trace: NetworkTrace): SVGElement | null {
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    return null;
  }
  const { elements } = state.highlight;
  return (Array.isArray(elements) ? elements[0] : elements) ?? null;
}

describe('a node highlights a line that was actually drawn for it', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <line id="link-0" data-link="Ada-Edsger" />
        <line id="link-1" data-link="Ada-Grace" />
        <line id="link-2" data-link="Ada-Alan" />
        <line id="link-3" data-link="Grace-Alan" />
        <line id="link-4" data-link="Ida-Ida" />
      </svg>`;
  });

  test('the hub highlights the line to its most connected neighbour', () => {
    // Ada's neighbours sorted by degree are Grace and Alan (2 each) then
    // Edsger (1), so the first is Grace -- drawn by `link-1`, not `link-0`.
    // A placeholder, or a pairing by rank, would give a different element.
    const trace = new NetworkTrace(createLayer());
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }

    expect(state.text.main.value).toBe('Ada');
    expect(highlighted(trace)?.getAttribute('data-link')).toBe('Ada-Grace');
  });

  test('the highlight agrees with where the rotor would step next', () => {
    // The line highlighted on arrival is the one the first rotor step
    // travels, so the two never disagree about which neighbour is nearest.
    const trace = new NetworkTrace(createLayer());
    trace.moveOnce('FORWARD');
    trace.moveToRotorFilter('links', 'right');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }

    expect(state.text.main.value).toBe('Grace');
  });

  test('an isolated node points at no line rather than at somebody else’s', () => {
    const trace = new NetworkTrace(createLayer());
    trace.moveOnce('FORWARD');
    trace.moveOnce('UPWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }

    expect(state.text.main.value).toBe('Ida');
    expect(highlighted(trace)?.hasAttribute('data-link')).toBe(false);
  });
});
