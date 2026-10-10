import type { PlotlyFullLayout, PlotlyGraphDiv } from '@adapters/plotly/types';
import type { Maidr } from '@type/grammar';
import { collectUniqueBgRects, getPlotlyOverlayLayers, normalizePlotlySvg } from '@adapters/plotly/normalizer';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface TestGlobals {
  document?: Document;
  MutationObserver?: typeof MutationObserver;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

const globals = globalThis as TestGlobals;
let savedGlobals: TestGlobals;
let dom: JSDOM;

/**
 * `normalizePlotlySvg` uses page globals (document, MutationObserver,
 * requestAnimationFrame); point them at this test's JSDOM window.
 * requestAnimationFrame is a no-op stub so the layout observer's polling
 * loop never spins during tests.
 */
beforeEach(() => {
  dom = new JSDOM('<!doctype html><body></body>');
  savedGlobals = {
    document: globals.document,
    MutationObserver: globals.MutationObserver,
    requestAnimationFrame: globals.requestAnimationFrame,
  };
  globals.document = dom.window.document;
  globals.MutationObserver = dom.window.MutationObserver;
  globals.requestAnimationFrame = () => 0;
});

afterEach(() => {
  for (const key of Object.keys(savedGlobals) as (keyof TestGlobals)[]) {
    if (savedGlobals[key] === undefined) {
      delete globals[key];
    } else {
      (globals as Record<string, unknown>)[key] = savedGlobals[key];
    }
  }
});

/** Builds a plotly-shaped container with a `.bglayer` holding the given rects. */
function createPlotlySvg(
  rects: { x: number; y: number }[],
  fullLayout?: PlotlyFullLayout,
): SVGSVGElement {
  const doc = dom.window.document as Document;
  const div = doc.createElement('div');
  div.className = 'js-plotly-plot';
  if (fullLayout) {
    (div as unknown as PlotlyGraphDiv)._fullLayout = fullLayout;
  }
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'main-svg');
  const bglayer = doc.createElementNS(SVG_NS, 'g');
  bglayer.setAttribute('class', 'bglayer');
  for (const pos of rects) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(pos.x));
    rect.setAttribute('y', String(pos.y));
    bglayer.appendChild(rect);
  }
  svg.appendChild(bglayer);
  div.appendChild(svg);
  doc.body.appendChild(div);
  return svg;
}

/**
 * Wraps `chart` the way maidr does, in an `<article>/<figure>` around the
 * focusable plot div, and returns that div.
 */
function wrapInMaidrFigure(chart: Element, id: string, parent: Element): HTMLElement {
  const doc = dom.window.document;
  const article = doc.createElement('article');
  article.id = `maidr-article-${id}`;
  const figure = doc.createElement('figure');
  figure.id = `maidr-figure-${id}`;
  const plot = doc.createElement('div');
  plot.tabIndex = 0;
  plot.appendChild(chart);
  figure.appendChild(plot);
  article.appendChild(figure);
  parent.appendChild(article);
  return plot;
}

function createSchema(selectors: (string | undefined)[][]): Maidr {
  return {
    id: 'chart',
    subplots: selectors.map(row =>
      row.map(selector => ({
        ...(selector ? { selector } : {}),
        layers: [{ id: '0', type: TraceType.BAR, data: [{ x: 'a', y: 1 }] }],
      })),
    ),
  };
}

describe('plotly normalizer subplot background wrapping', () => {
  it('wraps each bg rect in a g[id="axes_…"] group in row-major order', () => {
    // Rects appended out of visual order; wrapping must sort them row-major.
    const svg = createPlotlySvg([
      { x: 400, y: 300 },
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 400, y: 0 },
    ]);
    const schema = createSchema([
      ['g[id="axes_chart_1"]', 'g[id="axes_chart_2"]'],
      ['g[id="axes_chart_3"]', 'g[id="axes_chart_4"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    const groups = Array.from(svg.querySelectorAll('g[id^="axes_"]'));
    expect(groups.map(g => g.id).sort()).toEqual([
      'axes_chart_1',
      'axes_chart_2',
      'axes_chart_3',
      'axes_chart_4',
    ]);
    // Ids are assigned by visual position (row-major), not DOM order:
    // axes_chart_1 wraps the top-left rect, axes_chart_4 the bottom-right.
    const positionOf = (id: string): string => {
      const rect = svg.querySelector(`g[id="${id}"] > rect`)!;
      return `${rect.getAttribute('x')},${rect.getAttribute('y')}`;
    };
    expect(positionOf('axes_chart_1')).toBe('0,0');
    expect(positionOf('axes_chart_2')).toBe('400,0');
    expect(positionOf('axes_chart_3')).toBe('0,300');
    expect(positionOf('axes_chart_4')).toBe('400,300');
  });

  it('skips wrapping when counts disagree and no panel geometry is available', () => {
    const svg = createPlotlySvg([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 300 },
    ]);
    const schema = createSchema([
      ['g[id="axes_chart_1"]', 'g[id="axes_chart_2"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    expect(svg.querySelectorAll('g[id^="axes_"]')).toHaveLength(0);
  });

  it('injects transparent panel rects when the bglayer is empty (plotly default styling)', () => {
    const svg = createPlotlySvg([], {
      xaxis: { domain: [0, 0.45], _offset: 80, _length: 300 },
      xaxis2: { domain: [0.55, 1], _offset: 480, _length: 300 },
      yaxis: { domain: [0, 1], _offset: 60, _length: 400 },
      yaxis2: { domain: [0, 1], _offset: 60, _length: 400 },
    });
    const schema = createSchema([
      ['g[id="axes_chart_xy"]', 'g[id="axes_chart_x2y2"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    const groups = Array.from(svg.querySelectorAll('g[id^="axes_"]'));
    expect(groups.map(g => g.id)).toEqual(['axes_chart_xy', 'axes_chart_x2y2']);

    const rect = svg.querySelector('g[id="axes_chart_x2y2"] > rect')!;
    expect(rect.getAttribute('x')).toBe('480');
    expect(rect.getAttribute('y')).toBe('60');
    expect(rect.getAttribute('width')).toBe('300');
    expect(rect.getAttribute('height')).toBe('400');
    expect(rect.getAttribute('fill')).toBe('none');
    expect(rect.getAttribute('pointer-events')).toBe('none');
  });

  it('injects panel rects keyed by axis pair when a dropped panel leaves an extra bg rect', () => {
    // Three rendered rects but only two schema panels (one panel was
    // dropped for unsupported trace types): positional matching is unsafe,
    // so geometry comes from each panel's own axis offsets instead.
    const svg = createPlotlySvg(
      [
        { x: 80, y: 60 },
        { x: 480, y: 60 },
        { x: 880, y: 60 },
      ],
      {
        xaxis: { domain: [0, 0.3], _offset: 80, _length: 300 },
        xaxis2: { domain: [0.35, 0.65], _offset: 480, _length: 300 },
        yaxis: { domain: [0, 1], _offset: 60, _length: 400 },
        yaxis2: { domain: [0, 1], _offset: 60, _length: 400 },
      },
    );
    const schema = createSchema([
      ['g[id="axes_chart_xy"]', 'g[id="axes_chart_x2y2"]'],
    ]);

    normalizePlotlySvg(svg, schema);

    const groups = Array.from(svg.querySelectorAll('g[id^="axes_"]'));
    expect(groups.map(g => g.id)).toEqual(['axes_chart_xy', 'axes_chart_x2y2']);
    const wrapped = svg.querySelector('g[id="axes_chart_xy"] > rect')!;
    expect(wrapped.getAttribute('x')).toBe('80');
    expect(wrapped.getAttribute('y')).toBe('60');

    // The original bg rects stay untouched (direct bglayer children).
    const bglayer = svg.querySelector('.bglayer')!;
    expect(bglayer.querySelectorAll(':scope > rect')).toHaveLength(3);
  });

  it('wraps nothing for single-panel schemas without selectors', () => {
    const svg = createPlotlySvg([{ x: 0, y: 0 }]);
    const schema = createSchema([[undefined]]);

    normalizePlotlySvg(svg, schema);

    expect(svg.querySelectorAll('g[id^="axes_"]')).toHaveLength(0);
  });
});

describe('collectUniqueBgRects', () => {
  it('deduplicates rects sharing a position and sorts row-major', () => {
    const svg = createPlotlySvg([
      { x: 400, y: 0 },
      { x: 0, y: 300 },
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // duplicate
    ]);
    const bglayer = svg.querySelector('.bglayer')!;

    const rects = collectUniqueBgRects(bglayer);

    expect(rects).toHaveLength(3);
    expect(rects.map(r => `${r.getAttribute('x')},${r.getAttribute('y')}`))
      .toEqual(['0,0', '400,0', '0,300']);
  });
});

describe('getPlotlyOverlayLayers', () => {
  /**
   * The shape maidr leaves a Plotly chart in: the first `svg.main-svg` wrapped
   * in maidr's focusable div, and the layer carrying the titles and legend
   * still a direct child of the `.svg-container`.
   */
  function buildWrappedChart(): { plot: HTMLElement; overlay: SVGSVGElement } {
    const doc = dom.window.document;
    const container = doc.createElement('div');
    container.className = 'svg-container';
    const plot = doc.createElement('div');
    const main = doc.createElementNS(SVG_NS, 'svg');
    main.setAttribute('class', 'main-svg');
    plot.appendChild(main);
    const overlay = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    overlay.setAttribute('class', 'main-svg');
    container.append(plot, overlay);
    doc.body.appendChild(container);
    return { plot, overlay };
  }

  it('returns the layers drawn over the plot and not the plot itself', () => {
    const { plot, overlay } = buildWrappedChart();

    expect(getPlotlyOverlayLayers(plot)).toEqual([overlay]);
  });

  it('returns nothing for a chart that is not Plotly', () => {
    const plot = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(plot);

    expect(getPlotlyOverlayLayers(plot)).toEqual([]);
  });
});

describe('plotly layout observer', () => {
  /** Queues animation frames so a test can run them one at a time. */
  function queueFrames(): () => void {
    const frames: FrameRequestCallback[] = [];
    globals.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    return () => {
      const due = frames.splice(0);
      for (const callback of due) {
        callback(0);
      }
    };
  }

  it('pushes the text below the chart even when a frame sees the chart mid-move', () => {
    // maidr moves the SVG into its <article> wrapper. A frame that ran while
    // the SVG was out of the document used to stop the observer for good, so
    // the text under the chart stayed hidden behind it.
    const runFrame = queueFrames();
    const svg = createPlotlySvg([{ x: 0, y: 0 }]);
    svg.setAttribute('height', '500');
    const plotlyDiv = svg.parentElement as HTMLElement;
    normalizePlotlySvg(svg, createSchema([[undefined]]));

    svg.remove();
    runFrame();
    const doc = dom.window.document;
    const article = doc.createElement('article');
    article.id = 'maidr-article-chart';
    article.appendChild(svg);
    plotlyDiv.appendChild(article);
    runFrame();
    const container = doc.createElement('div');
    container.id = 'react-container-chart';
    article.appendChild(container);

    return Promise.resolve().then(() => {
      expect(container.style.paddingTop).toBe('500px');
    });
  });

  it('stops waiting once a removed chart stays out of the document', () => {
    // A chart that is gone for good must not keep a frame loop alive.
    const frames: FrameRequestCallback[] = [];
    globals.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    const svg = createPlotlySvg([{ x: 0, y: 0 }]);
    normalizePlotlySvg(svg, createSchema([[undefined]]));
    svg.parentElement?.remove();

    let ran = 0;
    while (frames.length > 0 && ran < 1000) {
      frames.shift()?.(0);
      ran++;
    }

    // One frame per sighting of the detached chart, the last of which stops.
    expect(frames).toHaveLength(0);
    expect(ran).toBe(60);
  });

  it('positions a text container that was already in place when the observer attached', () => {
    const runFrame = queueFrames();
    const svg = createPlotlySvg([{ x: 0, y: 0 }]);
    svg.setAttribute('height', '400');
    const plotlyDiv = svg.parentElement as HTMLElement;
    const doc = dom.window.document;
    const article = doc.createElement('article');
    article.id = 'maidr-article-chart';
    article.appendChild(svg);
    const container = doc.createElement('div');
    container.id = 'react-container-chart';
    article.appendChild(container);
    plotlyDiv.appendChild(article);
    normalizePlotlySvg(svg, createSchema([[undefined]]));

    runFrame();

    expect(container.style.paddingTop).toBe('400px');
  });

  it('does not queue a resize for a mutation that leaves the chart height unchanged', () => {
    // Every keypress swaps the highlight clone inside the article. Queuing a
    // window resize for each one invalidated every cached hover centre and
    // ran the page's resize handlers although nothing had moved.
    const frames: FrameRequestCallback[] = [];
    globals.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    const svg = createPlotlySvg([{ x: 0, y: 0 }]);
    svg.setAttribute('height', '400');
    const plotlyDiv = svg.parentElement as HTMLElement;
    const doc = dom.window.document;
    const article = doc.createElement('article');
    article.id = 'maidr-article-chart';
    article.appendChild(svg);
    const container = doc.createElement('div');
    container.id = 'react-container-chart';
    article.appendChild(container);
    plotlyDiv.appendChild(article);
    normalizePlotlySvg(svg, createSchema([[undefined]]));

    frames.splice(0).forEach(callback => callback(0));
    expect(container.style.paddingTop).toBe('400px');
    // The first positioning queues its resize.
    expect(frames).toHaveLength(1);
    frames.splice(0);

    svg.appendChild(doc.createElementNS(SVG_NS, 'rect'));

    return Promise.resolve().then(() => {
      expect(frames).toHaveLength(0);
      expect(container.style.paddingTop).toBe('400px');
    });
  });
});

describe('plotly focus ring', () => {
  /** A Plotly chart and an SVG chart on one page, both bound by maidr. */
  function buildMixedPage(): { plotlyPlot: HTMLElement; svgPlot: HTMLElement } {
    const doc = dom.window.document;
    const plotlyDiv = doc.createElement('div');
    plotlyDiv.className = 'js-plotly-plot';
    const container = doc.createElement('div');
    container.className = 'svg-container';
    plotlyDiv.appendChild(container);
    doc.body.appendChild(plotlyDiv);
    const mainSvg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    mainSvg.setAttribute('class', 'main-svg');
    const plotlyPlot = wrapInMaidrFigure(mainSvg, 'plotly', container);
    const svgPlot = wrapInMaidrFigure(doc.createElementNS(SVG_NS, 'svg'), 'svg', doc.body);

    normalizePlotlySvg(mainSvg, createSchema([[undefined]]));

    return { plotlyPlot, svgPlot };
  }

  it('leaves the focus ring of a chart that is not Plotly alone', () => {
    // The rule that hides the Plotly plot div's ring matched every maidr
    // figure on the page, so a keyboard user lost the focus indicator on
    // every other chart once a Plotly chart was bound.
    const { svgPlot } = buildMixedPage();

    svgPlot.focus();

    expect(dom.window.getComputedStyle(svgPlot).getPropertyValue('outline')).not.toBe('none');
  });

  it('still turns off the ring of the Plotly chart\'s own plot div', () => {
    // The div wraps only Plotly's absolutely positioned SVG, so it has no box
    // to draw a ring around; its svg-container draws one instead.
    const { plotlyPlot } = buildMixedPage();

    plotlyPlot.focus();

    expect(dom.window.getComputedStyle(plotlyPlot).getPropertyValue('outline')).toBe('none');
  });
});

describe('plotly normalizer on a page with another Plotly chart', () => {
  /** Queues animation frames so a test can run them one at a time. */
  function queueFrames(): () => void {
    const frames: FrameRequestCallback[] = [];
    globals.requestAnimationFrame = (callback) => {
      frames.push(callback);
      return frames.length;
    };
    return () => {
      const due = frames.splice(0);
      for (const callback of due) {
        callback(0);
      }
    };
  }

  /** Plotly's toolbar: a container holding a button. */
  function createModebar(): HTMLElement {
    const doc = dom.window.document;
    const modebar = doc.createElement('div');
    modebar.className = 'modebar-container';
    modebar.appendChild(doc.createElement('button'));
    return modebar;
  }

  /**
   * A Plotly chart maidr has already bound, earlier on the page: its graph
   * div, its `.svg-container` with the wrapped SVG and the text container
   * below it, and its modebar.
   */
  function buildOtherChart(): { graphDiv: HTMLElement; modebar: HTMLElement; text: HTMLElement } {
    const doc = dom.window.document;
    const graphDiv = doc.createElement('div');
    graphDiv.className = 'js-plotly-plot';
    graphDiv.setAttribute('data-maidr-auto', '1');
    const container = doc.createElement('div');
    container.className = 'svg-container';
    graphDiv.appendChild(container);
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'main-svg');
    const plot = wrapInMaidrFigure(svg, 'other', container);
    const text = doc.createElement('div');
    text.id = 'react-container-other';
    plot.after(text);
    const modebar = createModebar();
    container.appendChild(modebar);
    doc.body.appendChild(graphDiv);
    return { graphDiv, modebar, text };
  }

  /** Asserts that nothing in `modebar` was taken out of the tab order. */
  function expectUntouched(modebar: HTMLElement): void {
    expect(modebar.hasAttribute('aria-hidden')).toBe(false);
    expect(modebar.hasAttribute('tabindex')).toBe(false);
    expect(modebar.querySelector('[tabindex]')).toBeNull();
  }

  it('leaves the other chart alone when the SVG is in no graph div', () => {
    // An `svg.main-svg` outside `.js-plotly-plot` is still read as Plotly.
    // Its lookups fell back to the whole page and took the first match there:
    // the other chart's modebar left the accessibility tree, and the other
    // chart's graph div took this chart's click listener.
    const other = buildOtherChart();
    const doc = dom.window.document;
    const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'main-svg');
    doc.body.appendChild(svg);

    normalizePlotlySvg(svg, createSchema([[undefined]]));

    expectUntouched(other.modebar);
    expect(doc.querySelector('[data-maidr-click-focus]')).toBeNull();
  });

  it('pushes down its own text, not the other chart\'s', () => {
    // The layout observer watched the first maidr article on the page and
    // padded the other chart's text by this chart's height.
    const runFrame = queueFrames();
    const other = buildOtherChart();
    const doc = dom.window.document;
    const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'main-svg');
    svg.setAttribute('height', '300');
    doc.body.appendChild(svg);
    normalizePlotlySvg(svg, createSchema([[undefined]]));
    const plot = wrapInMaidrFigure(svg, 'own', doc.body);
    const text = doc.createElement('div');
    text.id = 'react-container-own';
    plot.after(text);

    runFrame();

    expect(text.style.paddingTop).toBe('300px');
    expect(other.text.style.paddingTop).toBe('');
  });

  it('hides the modebar and forwards clicks of an SVG in a bare .svg-container', () => {
    // Without a graph div, the chart's modebar and overlay layers are in the
    // `.svg-container` Plotly draws the SVG in: that is where to look, and
    // not the page.
    const other = buildOtherChart();
    const doc = dom.window.document;
    const container = doc.createElement('div');
    container.className = 'svg-container';
    const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'main-svg');
    const overlay = doc.createElementNS(SVG_NS, 'svg');
    overlay.setAttribute('class', 'main-svg');
    const modebar = createModebar();
    container.append(svg, overlay, modebar);
    doc.body.appendChild(container);

    normalizePlotlySvg(svg, createSchema([[undefined]]));
    const plot = wrapInMaidrFigure(svg, 'own', container);
    overlay.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    expect(modebar.getAttribute('aria-hidden')).toBe('true');
    expect(modebar.getAttribute('tabindex')).toBe('-1');
    expect(modebar.querySelector('button')?.getAttribute('tabindex')).toBe('-1');
    expect(doc.activeElement).toBe(plot);
    expectUntouched(other.modebar);
    expect(other.graphDiv.hasAttribute('data-maidr-click-focus')).toBe(false);
  });
});
