/**
 * @jest-environment jsdom
 */

/**
 * Tests for the selector guards in `src/util/svg.ts`.
 *
 * Selectors arrive from parsed JSON and are cast to `string` at the call site,
 * so a producer that resolves nothing for a layer can send `[]` — truthy, and
 * therefore past every `if (!selector)` guard in the model layer. Before the
 * guard, `document.querySelectorAll([])` coerced it to `''` and threw a
 * `SyntaxError` that escaped figure construction, leaving the entire figure
 * inert: no announcements, no navigation, including for the subplots whose own
 * selectors were valid.
 *
 * The contract these tests pin: an unusable query matches nothing, and never
 * throws.
 */

import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Svg } from '@util/svg';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Values that reach `Svg` typed as `string` but are not usable selectors.
 * `[]` is the case reported from r-maidr's patchwork output; the rest share
 * the same shape — truthy or otherwise unusable, and fatal to `querySelector`.
 */
const UNUSABLE: { label: string; value: string }[] = [
  { label: 'an empty array', value: [] as unknown as string },
  { label: 'an empty string', value: '' },
  { label: 'a whitespace-only string', value: '   ' },
  { label: 'undefined', value: undefined as unknown as string },
  { label: 'null', value: null as unknown as string },
  { label: 'a number', value: 42 as unknown as string },
  { label: 'an object', value: {} as unknown as string },
];

describe('svg selector guards', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    group.setAttribute('id', 'bars');
    for (let i = 0; i < 3; i++) {
      group.appendChild(document.createElementNS(SVG_NAMESPACE, 'rect'));
    }
    svg.appendChild(group);
    document.body.appendChild(svg);
  });

  describe('selectAllElements', () => {
    it.each(UNUSABLE)('returns an empty array for $label', ({ value }) => {
      expect(() => Svg.selectAllElements(value)).not.toThrow();
      expect(Svg.selectAllElements(value)).toEqual([]);
    });

    it('inserts no clones into the DOM for an unusable query', () => {
      const before = document.querySelectorAll('#bars > rect').length;
      Svg.selectAllElements([] as unknown as string);
      expect(document.querySelectorAll('#bars > rect')).toHaveLength(before);
    });

    it('still resolves a valid selector', () => {
      // Guarding the unusable cases must not change the working path: three
      // rects in, three hidden clones out.
      expect(Svg.selectAllElements('#bars > rect')).toHaveLength(3);
      expect(document.querySelectorAll('#bars > rect')).toHaveLength(6);
    });
  });

  describe('selectElement', () => {
    it.each(UNUSABLE)('returns null for $label', ({ value }) => {
      expect(() => Svg.selectElement(value)).not.toThrow();
      expect(Svg.selectElement(value)).toBeNull();
    });

    it('returns null when a well-formed selector matches nothing', () => {
      // `null`, not `undefined`: the declared return type is `T | null`, and
      // the clone path used to fall through to an undefined clone.
      expect(Svg.selectElement('#absent > rect')).toBeNull();
      expect(Svg.selectElement('#absent > rect', false)).toBeNull();
    });

    it('still resolves a valid selector', () => {
      expect(Svg.selectElement('#bars > rect', false)).not.toBeNull();
    });

    it('marks the clone it inserts as MAIDR-owned', () => {
      const clone = Svg.selectElement('#bars > rect');
      expect(clone).not.toBeNull();
      expect(Svg.isOwned(clone as SVGElement)).toBe(true);
    });
  });

  describe('selectNthElement', () => {
    it.each(UNUSABLE)('returns null for $label', ({ value }) => {
      expect(() => Svg.selectNthElement(value, 0)).not.toThrow();
      expect(Svg.selectNthElement(value, 0)).toBeNull();
    });

    it('still resolves a valid selector', () => {
      expect(Svg.selectNthElement('#bars > rect', 1)).not.toBeNull();
      expect(Svg.selectNthElement('#bars > rect', 9)).toBeNull();
    });
  });
});

/**
 * Two charts on one page whose producer gave them the same ids: each is
 * MAIDR's article round a plot holding an `<svg>` with three bars.
 */
function twoChartsWithTheSameIds(): { plotA: HTMLElement; plotB: HTMLElement } {
  document.body.innerHTML = ['a', 'b'].map(chart => `
    <article id="maidr-article-${chart}">
      <figure><div id="wrap-${chart}" tabindex="0">
        <svg xmlns="${SVG_NAMESPACE}"><g id="bars"><rect/><rect/><rect/></g></svg>
      </div></figure>
    </article>`).join('');
  return {
    plotA: document.getElementById('wrap-a') as HTMLElement,
    plotB: document.getElementById('wrap-b') as HTMLElement,
  };
}

// A selector resolved outside its chart warns on purpose. Silenced for the
// file rather than per test, and handed back after.
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  consoleWarn.mockRestore();
});

describe('selectors resolved inside a chart', () => {
  beforeEach(() => {
    consoleWarn.mockClear();
  });

  it('should find only the chart\'s own marks when another chart shares its ids', () => {
    const { plotA, plotB } = twoChartsWithTheSameIds();

    const rects = Svg.withQueryRoots([plotB], () => Svg.selectAllElements<SVGElement>('#bars rect', false));

    expect(rects).toHaveLength(3);
    expect(rects.every(rect => plotB.contains(rect))).toBe(true);
    expect(rects.some(rect => plotA.contains(rect))).toBe(false);
  });

  it('should insert every hidden copy into the chart and none into the other', () => {
    const { plotA, plotB } = twoChartsWithTheSameIds();

    Svg.withQueryRoots([plotB], () => Svg.selectAllElements('#bars rect'));

    expect(plotB.querySelectorAll('[data-maidr-owned]')).toHaveLength(3);
    expect(plotA.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
  });

  it('should count only the chart\'s own matches for one element and the nth', () => {
    const { plotB } = twoChartsWithTheSameIds();
    const ownSecond = plotB.querySelectorAll('rect')[1];

    const [first, second, beyond] = Svg.withQueryRoots([plotB], () => [
      Svg.selectElement<SVGElement>('#bars rect', false),
      Svg.selectNthElement<SVGElement>('#bars rect', 1),
      Svg.selectNthElement<SVGElement>('#bars rect', 3),
    ]);

    expect(first).toBe(plotB.querySelector('rect'));
    expect(second).toBe(ownSecond);
    expect(beyond).toBeNull();
  });

  it('should still match a selector that names an ancestor of the chart', () => {
    const { plotB } = twoChartsWithTheSameIds();
    const svg = plotB.querySelector('svg') as SVGSVGElement;

    const rects = Svg.withQueryRoots([svg], () => Svg.selectAllElements<SVGElement>('#wrap-b svg rect', false));

    expect(rects).toEqual(Array.from(svg.querySelectorAll('rect')));
  });

  it('should resolve on the rest of the page, with one warning, when the chart has no match', () => {
    const { plotB } = twoChartsWithTheSameIds();
    const outside = document.createElementNS(SVG_NAMESPACE, 'svg');
    outside.innerHTML = '<circle class="legend-mark"/>';
    document.body.append(outside);

    const found = Svg.withQueryRoots([plotB], () => [
      Svg.selectAllElements<SVGElement>('.legend-mark', false),
      Svg.selectElement<SVGElement>('.legend-mark', false),
    ]);

    expect(found).toEqual([[outside.firstElementChild], outside.firstElementChild]);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(String(consoleWarn.mock.calls[0][0])).toContain('".legend-mark" matches nothing inside its chart');
  });

  it('should never fall back to the marks of another chart', () => {
    const { plotB } = twoChartsWithTheSameIds();
    plotB.querySelector('#bars')?.remove();

    const [all, one] = Svg.withQueryRoots([plotB], () => [
      Svg.selectAllElements<SVGElement>('#bars rect', false),
      Svg.selectElement<SVGElement>('#bars rect'),
    ]);

    expect(all).toEqual([]);
    expect(one).toBeNull();
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('should never fall back to a layer Plotly draws over another chart', () => {
    // Plotly's graph div holds MAIDR's article round the first `svg.main-svg`,
    // and beside it the layers it draws over the chart.
    document.body.innerHTML = ['a', 'b'].map(chart => `
      <div class="js-plotly-plot" id="graph-${chart}"><div class="svg-container">
        <article id="maidr-article-${chart}"><figure><div id="plot-${chart}">
          <svg class="main-svg"><g class="cartesianlayer"><path class="point"/></g></svg>
        </div></figure></article>
        <svg class="main-svg"><g class="indicatorlayer"><path class="arc"/></g></svg>
      </div></div>`).join('');
    const plotB = document.getElementById('plot-b') as HTMLElement;
    document.querySelector('#graph-b .indicatorlayer .arc')?.remove();

    const arcs = Svg.withQueryRoots([plotB], () => Svg.selectAllElements<SVGElement>('.indicatorlayer .arc', false));

    expect(arcs).toEqual([]);
  });

  it('should return the matches of several roots in document order', () => {
    document.body.innerHTML = `
      <div id="plot"><svg><rect id="r1"/><rect id="r2"/></svg></div>
      <svg id="overlay"><rect id="r3"/></svg>`;
    const plot = document.getElementById('plot') as HTMLElement;
    const overlay = document.getElementById('overlay') as Element;

    const ids = Svg.withQueryRoots([overlay, plot, plot], () => [
      Svg.selectAllElements<SVGElement>('rect', false).map(rect => rect.id),
      Svg.selectElement<SVGElement>('rect', false)?.id,
      Svg.selectNthElement<SVGElement>('rect', 2)?.id,
    ]);

    expect(ids).toEqual([['r1', 'r2', 'r3'], 'r1', 'r3']);
  });

  it('should put the previous roots back when building throws, and after a nested build', () => {
    const { plotA, plotB } = twoChartsWithTheSameIds();
    const inA = (): boolean => plotA.contains(Svg.selectElement<SVGElement>('#bars rect', false));

    const nested = Svg.withQueryRoots([plotB], () =>
      Svg.withQueryRoots([plotA], inA) && !inA());
    expect(() => Svg.withQueryRoots([plotB], () => {
      throw new Error('construction failed');
    })).toThrow('construction failed');

    expect(nested).toBe(true);
    expect(inA()).toBe(true);
  });

  it('should search the whole page outside a chart\'s build, as before', () => {
    twoChartsWithTheSameIds();

    const rects = Svg.selectAllElements<SVGElement>('#bars rect', false);

    expect(rects).toEqual(Array.from(document.querySelectorAll('#bars rect')));
    expect(rects).toHaveLength(6);
    expect(consoleWarn).not.toHaveBeenCalled();
  });
});
