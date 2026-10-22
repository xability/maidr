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
 * The lines the trace would highlight at the cursor's position.
 * @param trace The trace to read
 * @returns Each highlighted line's link, in the order highlighted; none for a
 *   placeholder
 */
function highlighted(trace: NetworkTrace): string[] {
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    return [];
  }
  const { elements } = state.highlight;
  return (Array.isArray(elements) ? elements : [elements])
    .map(element => element.getAttribute('data-link'))
    .filter((link): link is string => link !== null);
}

describe('a node highlights the lines that were actually drawn for it', () => {
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

  test('the hub highlights every line it touches, its most connected neighbour\'s first', () => {
    // Ada's neighbours sorted by degree are Grace and Alan (2 each) then
    // Edsger (1), so the first is Grace -- drawn by `link-1`, not `link-0`.
    // A pairing by rank would give different elements.
    const trace = new NetworkTrace(createLayer());
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }

    expect(state.text.main.value).toBe('Ada');
    expect(highlighted(trace)).toEqual(['Ada-Grace', 'Ada-Alan', 'Ada-Edsger']);
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
    expect(highlighted(trace)).toEqual([]);
  });

  test('every line is listed once for the tactile view, the loop included', () => {
    const trace = new NetworkTrace(createLayer());

    expect(trace.getAllHighlightElements().map(line => line.getAttribute('data-link')))
      .toEqual(['Ada-Edsger', 'Ada-Grace', 'Ada-Alan', 'Grace-Alan', 'Ida-Ida']);
  });
});

describe('two people never show the same highlight', () => {
  /** The Graphviz example's team: Ana, Ben, Chloe and Dev, then Eli and Fay. */
  const TEAM: NetworkPoint[] = [
    { source: 'ana', target: 'ben' },
    { source: 'ana', target: 'chloe' },
    { source: 'ben', target: 'chloe' },
    { source: 'chloe', target: 'dev' },
    { source: 'eli', target: 'fay' },
  ];

  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${
      TEAM.map((link, index) => `<line id="link-${index}" data-link="${link.source}--${link.target}" />`).join('')
    }</svg>`;
  });

  test('each person outlines their own lines, unless two are a group by themselves', () => {
    const trace = new NetworkTrace({
      ...createLayer(),
      selectors: TEAM.map((_, index) => `#link-${index}`),
      data: TEAM,
    });

    const seen = new Map<string, string>();
    for (const [row, size] of [[0, 4], [1, 2]]) {
      for (let col = 0; col < size; col++) {
        trace.moveToIndex(row, col);
        const state = trace.state;
        if (state.empty) {
          throw new Error('Expected a non-empty trace state');
        }
        seen.set(String(state.text.main.value), highlighted(trace).sort().join(' '));
      }
    }

    // Chloe's line to Ana was the whole highlight on both of them.
    expect(seen.get('chloe')).toBe('ana--chloe ben--chloe chloe--dev');
    expect(seen.get('ana')).toBe('ana--ben ana--chloe');
    expect(new Set(['ana', 'ben', 'chloe', 'dev'].map(name => seen.get(name))).size).toBe(4);
    expect(seen.get('eli')).toBe(seen.get('fay'));
  });
});
