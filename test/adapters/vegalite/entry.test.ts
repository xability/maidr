import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { Maidr } from '@type/grammar';
import { initMaidrOnElement } from '@util/initMaidr';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Tests only use the public Element/JSDOM surface.
import { JSDOM } from 'jsdom';
import { bindVegaLite } from '../../../src/vegalite-entry';

// Mock the MAIDR mount so bindVegaLite never touches React / the real
// controller; the tests below only verify what (and whether) it mounts.
jest.mock('@util/initMaidr', () => ({
  initMaidrOnElement: jest.fn(),
}));

const initMock = initMaidrOnElement as jest.Mock;

/** Build a JSDOM chart container (with an <svg>) and a minimal Vega view. */
function setupChart(withId = true): { container: HTMLElement; view: VegaView } {
  const dom = new JSDOM(
    `<!DOCTYPE html><body><div${withId ? ' id="chart"' : ''}><svg></svg></div></body>`,
  );
  const container = dom.window.document.querySelector('div') as HTMLElement;
  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: () => undefined,
  } as unknown as VegaView;
  return { container, view };
}

const barSpec: VegaLiteSpec = {
  data: { values: [{ a: 'A', b: 1 }, { a: 'B', b: 2 }] },
  mark: 'bar',
  encoding: {
    x: { field: 'a', type: 'nominal' },
    y: { field: 'b', type: 'quantitative' },
  },
};

describe('bindVegaLite', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    initMock.mockClear();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('skips binding when the spec produces no accessible layers', () => {
    const { view } = setupChart();
    const arcSpec: VegaLiteSpec = {
      data: { values: [{ a: 'A', b: 1 }] },
      mark: 'arc',
      encoding: {
        color: { field: 'a', type: 'nominal' },
        y: { field: 'b', type: 'quantitative' },
      },
    };
    bindVegaLite(view, arcSpec);
    expect(initMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no accessible layers'),
    );
  });

  it('skips binding for a faceted spec whose child mark is unsupported', () => {
    // A faceted pie compiles every cell to zero layers; mounting the
    // resulting `[[{ layers: [] }]]` fallback would crash MAIDR core on
    // focus (Subplot.activeTrace on an empty traces array).
    const { view } = setupChart();
    const facetedArc: VegaLiteSpec = {
      data: { values: [{ site: 'A', a: 'x', b: 1 }, { site: 'B', a: 'y', b: 2 }] },
      facet: { column: { field: 'site', type: 'nominal' } },
      spec: {
        mark: 'arc',
        encoding: {
          color: { field: 'a', type: 'nominal' },
          y: { field: 'b', type: 'quantitative' },
        },
      },
    };
    bindVegaLite(view, facetedArc);
    expect(initMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no accessible layers'),
    );
  });

  it('mounts supported specs with selectors prefixed by the container id', () => {
    const { view } = setupChart();
    bindVegaLite(view, barSpec);

    expect(initMock).toHaveBeenCalledTimes(1);
    const maidr = initMock.mock.calls[0][0] as Maidr;
    expect(maidr.id).toBe('chart');

    const selector = maidr.subplots[0][0].layers[0].selectors as string;
    expect(selector.startsWith('#chart ')).toBe(true);
  });

  it('generates a container id when missing and scopes repeat selectors', () => {
    // Two identical repeat charts on one page compile to identical Vega
    // class names; only the container-id prefix keeps their selectors
    // from resolving each other's elements.
    const { container, view } = setupChart(false);
    const repeatSpec: VegaLiteSpec = {
      data: { values: [{ a: 1, b: 2, c: 3 }, { a: 4, b: 5, c: 6 }] },
      repeat: { row: ['b', 'c'] },
      spec: {
        mark: 'point',
        encoding: {
          x: { field: 'a', type: 'quantitative' },
          y: { field: { repeat: 'row' } as unknown as string, type: 'quantitative' },
        },
      },
    };
    bindVegaLite(view, repeatSpec);

    expect(container.id).toMatch(/^vl-/);
    expect(initMock).toHaveBeenCalledTimes(1);
    const maidr = initMock.mock.calls[0][0] as Maidr;
    const scope = `#${container.id}`;

    for (const row of maidr.subplots) {
      for (const subplot of row) {
        expect(subplot.selector!.startsWith(`${scope} g.mark-group.role-scope.child__row_`))
          .toBe(true);
        expect((subplot.layers[0].selectors as string).startsWith(`${scope} `))
          .toBe(true);
      }
    }
  });

  it('scopes vconcat subplot background selectors with the container id', () => {
    const { view } = setupChart();
    const vconcatSpec: VegaLiteSpec = {
      vconcat: [barSpec, barSpec],
    };
    bindVegaLite(view, vconcatSpec);

    expect(initMock).toHaveBeenCalledTimes(1);
    const maidr = initMock.mock.calls[0][0] as Maidr;
    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0][0].selector)
      .toBe('#chart g.mark-group.role-scope.concat_0_group > g > path.background');
    expect(maidr.subplots[1][0].selector)
      .toBe('#chart g.mark-group.role-scope.concat_1_group > g > path.background');
  });
});
