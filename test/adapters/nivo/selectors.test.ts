/**
 * @jest-environment jsdom
 */

/**
 * The selector pass, on hand-built DOM.
 *
 * `renderedDom.esm-test.tsx` checks the selectors against what Nivo really
 * draws; this file pins the shapes each layer emits and the ways the pass
 * declines — marks not drawn yet, a count that does not match, a canvas —
 * which real Nivo output never exercises on purpose.
 */

import type { NivoMarks } from '@adapters/nivo/types';
import type { BoxSelector } from '@type/grammar';
import { extractNivoLayers, nivoToMaidr } from '@adapters/nivo/converters';
import {
  clearTaggedElements,
  drawnSignature,
  getTaggedElements,
  LINE_ATTR,
  NODE_ATTR,
  resolveNivoSelectors,
  stampedSelectors,
  syncHighlightCopies,
  testIdSelector,
} from '@adapters/nivo/selectors';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const SCOPE = '#chart ';

const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  warnSpy.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

afterAll(() => {
  warnSpy.mockRestore();
});

/**
 * Puts markup in a scoped container.
 * @param markup - The container's inner HTML
 * @returns The container
 */
function containerWith(markup: string): HTMLElement {
  document.body.innerHTML = `<div id="chart">${markup}</div>`;
  return document.getElementById('chart') as HTMLElement;
}

describe('testIdSelector', () => {
  it('scopes the test id and escapes what CSS would read as syntax', () => {
    const selector = testIdSelector(SCOPE, 'bar.item.a "b".0');
    document.body.innerHTML = '<div id="chart"><rect data-testid=\'bar.item.a "b".0\'></rect></div>';

    expect(selector.startsWith('#chart [data-testid="')).toBe(true);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });
});

describe('stampedSelectors', () => {
  it('names one bar per payload point', () => {
    const marks: NivoMarks = { kind: 'bar', testIds: ['bar.item.v.0', 'bar.item.v.2'] };
    expect(stampedSelectors(marks, SCOPE)).toEqual([
      '#chart [data-testid="bar\\.item\\.v\\.0"]',
      '#chart [data-testid="bar\\.item\\.v\\.2"]',
    ]);
  });

  it('keeps a stack\'s undrawn cells null', () => {
    const marks: NivoMarks = { kind: 'barGrid', testIds: [['a'], [null]] };
    expect(stampedSelectors(marks, SCOPE)).toEqual([['#chart [data-testid="a"]'], [null]]);
  });

  it('joins a pie\'s arcs into one selector list, and declines a sorted ring', () => {
    expect(stampedSelectors({ kind: 'arcs', testIds: ['arc.a', 'arc.b'], ordered: true }, SCOPE))
      .toBe('#chart [data-testid="arc\\.a"], #chart [data-testid="arc\\.b"]');
    expect(stampedSelectors({ kind: 'arcs', testIds: ['arc.a'], ordered: false }, SCOPE)).toBeUndefined();
  });

  it('lists a heat map\'s selector rows bottom-first', () => {
    const grid = stampedSelectors({ kind: 'cells', testIds: [['top'], ['bottom']] }, SCOPE);
    expect(grid).toEqual([['#chart [data-testid="bottom"]'], ['#chart [data-testid="top"]']]);
  });

  it('names a box\'s whisker caps when Nivo draws them, and its stems when not', () => {
    const [capped] = stampedSelectors({ kind: 'boxes', keys: ['boxplot.0.0'], whiskerCaps: true, horizontal: false }, SCOPE) as BoxSelector[];
    const [bare] = stampedSelectors({ kind: 'boxes', keys: ['boxplot.0.0'], whiskerCaps: false, horizontal: false }, SCOPE) as BoxSelector[];
    const box = '#chart [data-key="boxplot\\.0\\.0"]';

    expect(capped).toEqual({
      lowerOutliers: [],
      min: `${box} > line:nth-of-type(3)`,
      iq: `${box} > rect`,
      q2: `${box} > line:nth-of-type(1)`,
      max: `${box} > line:nth-of-type(5)`,
      upperOutliers: [],
    });
    expect([bare.min, bare.max]).toEqual([`${box} > line:nth-of-type(2)`, `${box} > line:nth-of-type(3)`]);
  });

  it('names a horizontal box\'s body for Q1 and Q3, so the core does not derive them from its unrotated edges', () => {
    const [vertical] = stampedSelectors({ kind: 'boxes', keys: ['boxplot.0.0'], whiskerCaps: true, horizontal: false }, SCOPE) as BoxSelector[];
    const [horizontal] = stampedSelectors({ kind: 'boxes', keys: ['boxplot.0.0'], whiskerCaps: true, horizontal: true }, SCOPE) as BoxSelector[];
    const body = '#chart [data-key="boxplot\\.0\\.0"] > rect';

    expect(vertical.q1).toBeUndefined();
    expect(vertical.q3).toBeUndefined();
    expect([horizontal.iq, horizontal.q1, horizontal.q3]).toEqual([body, body, body]);
  });

  it('marks a horizontal box plot\'s boxes as drawn rotated', () => {
    const data = [{ group: 'a', value: 1 }, { group: 'a', value: 2 }];
    const [horizontal] = extractNivoLayers('boxplot', { data, layout: 'horizontal' });
    const [vertical] = extractNivoLayers('boxplot', { data });

    expect(horizontal.marks).toMatchObject({ kind: 'boxes', horizontal: true });
    expect(vertical.marks).toMatchObject({ kind: 'boxes', horizontal: false });
  });

  it('leaves line and scatter marks to tagging', () => {
    expect(stampedSelectors({ kind: 'lines', points: null, seriesCount: 1 }, SCOPE)).toBeUndefined();
    expect(stampedSelectors({ kind: 'nodes', drawn: 1, offset: 0, kept: [0] }, SCOPE)).toBeUndefined();
  });
});

describe('nivoToMaidr with a scope', () => {
  it('emits the stamped selectors without a DOM', () => {
    const figure = nivoToMaidr(
      { id: 'c', type: 'bar', props: { data: [{ id: 'a', value: 1 }] } },
      SCOPE,
    );
    expect(figure.subplots[0][0].layers[0].selectors).toEqual(['#chart [data-testid="bar\\.item\\.value\\.0"]']);
  });
});

describe('resolveNivoSelectors', () => {
  const BAR = extractNivoLayers('bar', { data: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }] });

  it('emits nothing until the chart has drawn', () => {
    const container = containerWith('<div></div>');
    expect(resolveNivoSelectors(container, BAR, SCOPE)).toEqual([undefined]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits nothing while a stamped mark is missing', () => {
    const container = containerWith('<svg><rect data-testid="bar.item.value.0"></rect></svg>');
    expect(resolveNivoSelectors(container, BAR, SCOPE)).toEqual([undefined]);
  });

  it('emits the stamped selectors once every mark is there', () => {
    const container = containerWith(
      '<svg><rect data-testid="bar.item.value.0"></rect><rect data-testid="bar.item.value.1"></rect></svg>',
    );
    expect(resolveNivoSelectors(container, BAR, SCOPE)[0]).toHaveLength(2);
  });

  it('does not count MAIDR\'s own clones as marks', () => {
    const pie = extractNivoLayers('pie', { data: [{ id: 'a', value: 1 }] });
    const container = containerWith(
      '<svg><path data-testid="arc.a"></path><path data-testid="arc.a" data-maidr-owned=""></path></svg>',
    );
    expect(resolveNivoSelectors(container, pie, SCOPE)[0]).toBe('#chart [data-testid="arc\\.a"]');
  });

  it('warns once that a canvas chart cannot be highlighted', () => {
    const container = containerWith('<canvas></canvas>');

    expect(resolveNivoSelectors(container, BAR, SCOPE)).toEqual([undefined]);
    resolveNivoSelectors(container, BAR, SCOPE);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('<canvas>');
  });

  describe('line series', () => {
    const SERIES = [
      { id: 'a', data: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      { id: 'b', data: [{ x: 1, y: 3 }] },
    ];

    it('tags the point markers of each series', () => {
      const layers = extractNivoLayers('line', { data: SERIES });
      const container = containerWith(`<svg>
        <g data-testid="line.point.b.0"></g>
        <g data-testid="line.point.a.0"></g>
        <g data-testid="line.point.a.1"></g>
      </svg>`);

      const [selectors] = resolveNivoSelectors(container, layers, SCOPE) as string[][];

      expect(selectors).toEqual([`#chart [${LINE_ATTR}="0"]`, `#chart [${LINE_ATTR}="1"]`]);
      expect(Array.from(document.querySelectorAll(selectors[0]), el => el.getAttribute('data-testid')))
        .toEqual(['line.point.a.0', 'line.point.a.1']);
    });

    it('falls back to the strokes, which Nivo paints last series first', () => {
      const layers = extractNivoLayers('line', { data: SERIES, enablePoints: false });
      const container = containerWith('<svg><path id="b" fill="none"></path><path id="a" fill="none"></path></svg>');

      const [selectors] = resolveNivoSelectors(container, layers, SCOPE) as string[][];

      expect(document.querySelector(selectors[0])?.id).toBe('a');
      expect(document.querySelector(selectors[1])?.id).toBe('b');
    });

    it('emits nothing when the strokes do not match the series', () => {
      const layers = extractNivoLayers('line', { data: SERIES, enablePoints: false });
      const container = containerWith('<svg><path fill="none"></path></svg>');
      expect(resolveNivoSelectors(container, layers, SCOPE)).toEqual([undefined]);
    });
  });

  describe('scatter nodes', () => {
    const PROPS = {
      data: [
        { id: 'A', data: [{ x: 1, y: 1 }, { x: null, y: 2 }] },
        { id: 'B', data: [{ x: 3, y: 3 }] },
      ],
    };

    it('tags each series\' nodes by position, skipping a node with no payload point', () => {
      const layers = extractNivoLayers('scatterplot', PROPS);
      const container = containerWith('<svg><g><circle id="a0"></circle><circle id="a1"></circle><circle id="b0"></circle></g></svg>');

      const selectors = resolveNivoSelectors(container, layers, SCOPE) as string[];

      expect(Array.from(document.querySelectorAll(selectors[0]), el => el.id)).toEqual(['a0']);
      expect(Array.from(document.querySelectorAll(selectors[1]), el => el.id)).toEqual(['b0']);
    });

    it('does not count a legend\'s circle symbols as nodes', () => {
      const layers = extractNivoLayers('scatterplot', PROPS);
      // @nivo/legends draws each `symbolShape: 'circle'` item in groups of
      // its own inside the plot's <g>, after the nodes.
      const container = containerWith(`<svg><g>
        <circle id="a0"></circle><circle id="a1"></circle><circle id="b0"></circle>
        <g><g><g><circle id="legend-A"></circle></g><g><circle id="legend-B"></circle></g></g></g>
      </g></svg>`);

      const selectors = resolveNivoSelectors(container, layers, SCOPE) as string[];

      expect(Array.from(document.querySelectorAll(selectors[0]), el => el.id)).toEqual(['a0']);
      expect(Array.from(document.querySelectorAll(selectors[1]), el => el.id)).toEqual(['b0']);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('emits nothing when the circles are not one per datum, and says so once', () => {
      const layers = extractNivoLayers('scatterplot', PROPS);
      const container = containerWith('<svg><g><circle></circle><circle></circle></g></svg>');

      expect(resolveNivoSelectors(container, layers, SCOPE)).toEqual([undefined, undefined]);
      resolveNivoSelectors(container, layers, SCOPE);

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('draws 2 nodes where its data has 3');
    });
  });
});

describe('drawnSignature', () => {
  it('tells a chart not drawn yet from a canvas and from a drawn svg', () => {
    expect(drawnSignature(containerWith('<div></div>'))).toBe('none');
    expect(drawnSignature(containerWith('<canvas></canvas>'))).toBe('canvas');
    expect(drawnSignature(containerWith('<svg><g><rect></rect></g></svg>'))).toBe('svg:2');
  });

  it('is unmoved by a tooltip outside the svg and by MAIDR\'s own copies', () => {
    const container = containerWith('<svg><g><rect></rect></g></svg>');
    const before = drawnSignature(container);

    container.insertAdjacentHTML('beforeend', '<div class="tooltip"><span>a</span></div>');
    container.querySelector('g')?.insertAdjacentHTML('beforeend', '<rect data-maidr-owned="true"></rect><g data-maidr-owned="true"><rect></rect></g>');

    expect(drawnSignature(container)).toBe(before);
  });
});

describe('syncHighlightCopies', () => {
  it('moves the copies of a named mark to where the mark now is', () => {
    const container = containerWith(`<svg><g>
      <rect id="mark" data-testid="bar.item.v.0" width="10" height="20"></rect>
      <rect id="hidden" data-testid="bar.item.v.0" data-maidr-owned="true" width="5" height="8" visibility="hidden"></rect>
      <rect id="outline" data-testid="bar.item.v.0" data-maidr-owned="true" width="5" height="8" fill="red"></rect>
    </g></svg>`);

    syncHighlightCopies(container);

    for (const id of ['hidden', 'outline']) {
      const copy = document.getElementById(id);
      expect([copy?.getAttribute('width'), copy?.getAttribute('height')]).toEqual(['10', '20']);
    }
    expect(document.getElementById('outline')?.getAttribute('fill')).toBe('red');
    expect(document.getElementById('hidden')?.getAttribute('visibility')).toBe('hidden');
  });

  it('descends into a copied group, as a heat map cell is', () => {
    const container = containerWith(`<svg>
      <g data-testid="cell.a.x" transform="translate(40, 0)"><rect width="30"></rect></g>
      <g id="copy" data-testid="cell.a.x" data-maidr-owned="true" transform="translate(20, 0)"><rect width="15"></rect></g>
    </svg>`);

    syncHighlightCopies(container);

    const copy = document.getElementById('copy');
    expect(copy?.getAttribute('transform')).toBe('translate(40, 0)');
    expect(copy?.querySelector('rect')?.getAttribute('width')).toBe('30');
  });

  it('leaves copies it cannot pair with their mark alone', () => {
    const container = containerWith(`<svg><g data-key="boxplot.0.0">
      <line x1="0" x2="10"></line>
      <line id="derived" data-maidr-owned="true" x1="3" x2="4"></line>
    </g></svg>`);

    syncHighlightCopies(container);

    expect(document.getElementById('derived')?.getAttribute('x2')).toBe('4');
  });
});

describe('clearTaggedElements', () => {
  it('removes every tag of this adapter', () => {
    const container = containerWith(`<svg><path ${LINE_ATTR}="0"></path><circle ${NODE_ATTR}="1"></circle></svg>`);
    expect(getTaggedElements(container)).toHaveLength(2);

    clearTaggedElements(container);

    expect(getTaggedElements(container)).toHaveLength(0);
  });
});
