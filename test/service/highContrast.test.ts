/**
 * @jest-environment jsdom
 */

/**
 * Tests for `HighContrastService` in `src/service/highContrast.ts`.
 *
 * The service repaints the page and the chart, so the only thing that makes
 * it safe is the snapshot it restores from. Every path that re-takes that
 * snapshot has to run against the chart's own colours; taking it while high
 * contrast is painted records the service's own output as the page default
 * and there is no way back to the original appearance.
 */

import type { Context } from '@model/context';
import type { Figure } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { StorageService } from '@service/storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HighContrastService } from '@service/highContrast';
import { SettingsService } from '@service/settings';

// `jest-environment-jsdom` does not expose `structuredClone`, which
// `SettingsService` uses to clone the default settings.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PAGE_BACKGROUND = 'rgb(250, 250, 250)';
const PAGE_FOREGROUND = 'rgb(17, 17, 17)';
const BAR_FILL = '#dddddd';

/**
 * A path long enough to trip the "complex path" test, which marks an element
 * as one that must not be given the background colour.
 */
const COMPLEX_PATH = `M 0 0 ${Array.from({ length: 40 }, (_, i) => `L ${i} ${i}`).join(' ')}`;

/**
 * Minimal stand-in for the 2D canvas context the service uses to normalise CSS
 * colours. jsdom has no canvas, and the real one is a boundary worth mocking
 * rather than reaching through: assigning an unparseable colour leaves
 * `fillStyle` at its previous value, which is what the service relies on.
 */
function installCanvasStub(): void {
  const toHex = (value: string): string | null => {
    const trimmed = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    const rgba = trimmed.match(/^rgba\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)[\s,]+([\d.]+)\s*\)$/);
    if (rgba) {
      return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${rgba[4]})`;
    }
    const rgb = trimmed.match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/);
    if (rgb) {
      const channels = [rgb[1], rgb[2], rgb[3]]
        .map(channel => Number.parseInt(channel, 10).toString(16).padStart(2, '0'));
      return `#${channels.join('')}`;
    }
    return null;
  };

  class CanvasContextStub {
    private currentFillStyle = '#000000';

    public get fillStyle(): string {
      return this.currentFillStyle;
    }

    public set fillStyle(value: string) {
      const hex = toHex(value);
      if (hex !== null) {
        this.currentFillStyle = hex;
      }
    }
  }

  const stub = new CanvasContextStub();
  HTMLCanvasElement.prototype.getContext
    = (() => stub) as unknown as HTMLCanvasElement['getContext'];
}

function createStorage(): StorageService {
  const store = new Map<string, unknown>();
  return {
    save: <T>(key: string, value: T): void => {
      store.set(key, value);
    },
    load: <T>(key: string): T | null => (store.get(key) as T) ?? null,
    remove: (key: string): void => {
      store.delete(key);
    },
  };
}

/**
 * A layer as the service reads it: its type, the elements it selects, and
 * the shapes it was read from when its highlight marks stand in for them.
 */
interface LayerSpec {
  traceType: string;
  elements: SVGElement[];
  geometry?: SVGElement[];
}

/**
 * A figure of one subplot holding the given layers, or an empty one. The
 * service only walks it to decide which elements belong to a trace, and of
 * which type.
 */
function createFigure(layers: LayerSpec[] = []): Figure {
  if (layers.length === 0) {
    const figure: Pick<Figure, 'subplots'> = { subplots: [] };
    return figure as unknown as Figure;
  }
  const traces = layers.map(layer => ({
    traceType: layer.traceType,
    getAllOriginalElements: (): SVGElement[] => layer.elements,
    getGeometryElements: (): SVGElement[] => layer.geometry ?? [],
  }));
  const figure = { subplots: [[{ traces: [traces] }]] };
  return figure as unknown as Figure;
}

interface MarkSpec {
  fill: string;
  stroke?: string;
  /** Draw the mark as a long `<path>`, which may not take the background colour. */
  complexPath?: boolean;
  /** Draw a `<text>` element instead of a shape. */
  text?: boolean;
  /** An inline `stroke-width`. */
  strokeWidth?: string;
}

interface HarnessOptions {
  inlineBodyBackground?: string;
  /** The trace type the context reports; the marks become its elements. */
  traceType?: string;
  /** Put the SVG inside an HTML wrapper and hand the service the wrapper. */
  wrapInDiv?: boolean;
  /** An inline CSS background on the chart's SVG. */
  svgBackground?: string;
  /** Layers the service is told are drawn over the plot. */
  overlays?: Element[];
  /** A `<text>` with no fill of its own, coloured by the page. */
  unstyledText?: boolean;
  /** Runs once the page is built, before the service captures it. */
  beforeService?: () => void;
  /**
   * The marks are the shapes the layer was read from, not elements it
   * selects: a line whose path maidr marks with circles of its own.
   */
  marksAreGeometry?: boolean;
  /**
   * Mounts the plot as maidr does: a `display: contents` div holding
   * `article#maidr-article-chart > figure#maidr-figure-chart`, the plot and
   * the text maidr shows under it.
   */
  article?: boolean;
  /**
   * Adds page content around the chart before the service is built. Given the
   * chart's outermost element, already in the body.
   */
  surround?: (chart: HTMLElement) => void;
}

interface Harness {
  service: HighContrastService;
  settings: SettingsService;
  marks: SVGElement[];
  bar: SVGElement;
  /**
   * The same object the service holds, so a test can repoint it the way a
   * host does when it re-renders the chart into fresh SVG nodes.
   */
  display: { plot: HTMLElement };
  svg: SVGSVGElement;
  /** maidr's article around the chart, when the harness built one. */
  article: HTMLElement | null;
}

function createHarness(
  specs: MarkSpec[] = [{ fill: BAR_FILL }],
  options: HarnessOptions = {},
): Harness {
  const { inlineBodyBackground } = options;
  document.head.innerHTML = `<style>body { background-color: ${PAGE_BACKGROUND}; color: ${PAGE_FOREGROUND}; }</style>`;
  document.body.innerHTML = '';
  // The service writes to the body's inline style, which survives a change of
  // its children; clear it so each test starts from the stylesheet alone.
  document.body.removeAttribute('style');
  if (inlineBodyBackground !== undefined) {
    document.body.style.backgroundColor = inlineBodyBackground;
  }

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGSVGElement;
  svg.setAttribute('id', 'chart');
  if (options.svgBackground !== undefined) {
    svg.style.backgroundColor = options.svgBackground;
  }
  const marks = specs.map((spec) => {
    const tag = spec.text ? 'text' : spec.complexPath ? 'path' : 'rect';
    const mark = document.createElementNS(SVG_NAMESPACE, tag);
    if (spec.complexPath) {
      mark.setAttribute('d', COMPLEX_PATH);
    }
    mark.setAttribute('fill', spec.fill);
    if (spec.stroke !== 'none') {
      mark.setAttribute('stroke', spec.stroke ?? '#1f77b4');
    }
    if (spec.strokeWidth !== undefined) {
      mark.style.strokeWidth = spec.strokeWidth;
    }
    svg.appendChild(mark);
    return mark as SVGElement;
  });

  if (options.unstyledText) {
    const text = document.createElementNS(SVG_NAMESPACE, 'text');
    text.textContent = 'Monday';
    svg.appendChild(text);
  }

  let plot: Element = svg;
  if (options.wrapInDiv) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(svg);
    plot = wrapper;
  }
  let chart: Element = plot;
  let article: HTMLElement | null = null;
  if (options.article) {
    const root = document.createElement('div');
    root.style.display = 'contents';
    article = document.createElement('article');
    article.id = 'maidr-article-chart';
    const figure = document.createElement('figure');
    figure.id = 'maidr-figure-chart';
    const text = document.createElement('div');
    text.id = 'react-container-chart';
    text.innerHTML = '<p>Bar 1 of 4. Day is Sat, Count is 87.</p>';
    figure.append(plot, text);
    article.appendChild(figure);
    root.appendChild(article);
    chart = root;
  }
  document.body.appendChild(chart);
  options.surround?.(chart as HTMLElement);

  const display: Pick<DisplayService, 'plot'> = { plot: plot as HTMLElement };
  const displayService = display as unknown as DisplayService;

  const settings = new SettingsService(createStorage(), displayService);
  settings.saveSettings({
    ...settings.loadSettings(),
    general: { ...settings.loadSettings().general, highContrastMode: true },
  });

  const notification: Pick<NotificationService, 'notify'> = { notify: () => {} };

  const instructionContext = options.traceType === undefined
    ? {}
    : { type: options.traceType };
  const context: Pick<Context, 'id' | 'instructionContext'> = {
    id: 'chart',
    instructionContext: instructionContext as Context['instructionContext'],
  };

  options.beforeService?.();

  const overlays = options.overlays ?? [];
  const service = new HighContrastService(
    settings,
    notification as unknown as NotificationService,
    displayService,
    createFigure(options.traceType === undefined
      ? []
      : [options.marksAreGeometry
          ? { traceType: options.traceType, elements: [], geometry: marks }
          : { traceType: options.traceType, elements: marks }]),
    context as unknown as Context,
    () => overlays,
  );

  return { service, settings, marks, bar: marks[0], display, svg, article };
}

function turnHighContrastOff(settings: SettingsService): void {
  settings.saveSettings({
    ...settings.loadSettings(),
    general: { ...settings.loadSettings().general, highContrastMode: false },
  });
}

function turnHighContrastOn(settings: SettingsService): void {
  settings.saveSettings({
    ...settings.loadSettings(),
    general: { ...settings.loadSettings().general, highContrastMode: true },
  });
}

/** The default dark and light colours, as an inline style reports them. */
const DARK = 'rgb(0, 0, 0)';
const LIGHT = 'rgb(255, 255, 255)';

/** The nodes some markup parses to, text and comments included. */
function nodesOf(markup: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = markup;
  return template.content;
}

/**
 * Lays the body out from markup, with the chart where `<i data-chart></i>`
 * stands.
 */
function pageAround(markup: string): (chart: HTMLElement) => void {
  return (chart) => {
    document.body.innerHTML = markup;
    document.body.querySelector('[data-chart]')?.replaceWith(chart);
  };
}

/**
 * Gives an element the box a browser would lay it out in. jsdom lays out
 * nothing, and reports every box at the origin with no size.
 */
function placeAt(element: Element, left: number, top: number, width: number, height: number): void {
  const box = { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
  element.getBoundingClientRect = (): DOMRect => ({ ...box, toJSON: () => box }) as DOMRect;
}

/** An absolutely positioned link, such as a skip link, at a given place. */
function positionedLink(left: number, top: number): HTMLElement {
  const link = document.createElement('a');
  link.href = '#main';
  link.textContent = 'Skip to content';
  link.style.position = 'absolute';
  link.style.left = `${left}px`;
  link.style.top = `${top}px`;
  placeAt(link, left, top, 120, 20);
  return link;
}

/**
 * A div drawing `markup` from an open shadow root, with `children` of its own
 * for the root to slot in.
 */
function shadowHost(markup: string, children = ''): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = children;
  host.attachShadow({ mode: 'open' }).innerHTML = markup;
  return host;
}

/** Which of the page and the chart's article carry the dark backdrop. */
function paintedBackdrops(article: HTMLElement | null): string[] {
  return [
    ...(document.body.style.backgroundColor === DARK ? ['page'] : []),
    ...(article?.style.backgroundColor === DARK ? ['chart'] : []),
  ];
}

describe('highContrastService', () => {
  let harness: Harness;

  beforeEach(() => {
    installCanvasStub();
    harness = createHarness();
  });

  afterEach(() => {
    harness.service.dispose();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  /** Replaces the default single-mark harness with one built for a test. */
  function rebuild(specs: MarkSpec[], options: HarnessOptions = {}): void {
    harness.service.dispose();
    harness = createHarness(specs, options);
  }

  it('recolours the page and the chart while high contrast is on', () => {
    harness.service.initializeHighContrast();

    expect(window.getComputedStyle(document.body).backgroundColor).toBe('rgb(0, 0, 0)');
    expect(harness.bar.getAttribute('fill')).not.toBe(BAR_FILL);
  });

  it('restores the page and the chart when high contrast is turned off', () => {
    harness.service.initializeHighContrast();

    turnHighContrastOff(harness.settings);

    expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
    expect(harness.bar.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('restores the page and the chart after a live update taken while high contrast is on', () => {
    harness.service.initializeHighContrast();

    harness.service.setFigure(createFigure());
    turnHighContrastOff(harness.settings);

    expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
    expect(harness.bar.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('keeps high contrast applied across a live update', () => {
    harness.service.initializeHighContrast();

    harness.service.setFigure(createFigure());

    expect(window.getComputedStyle(document.body).backgroundColor).toBe('rgb(0, 0, 0)');
    expect(harness.bar.getAttribute('fill')).not.toBe(BAR_FILL);
  });

  it('repaints with a colour saved while high contrast is on, and still restores after', () => {
    harness.service.initializeHighContrast();

    harness.settings.saveSettings({
      ...harness.settings.loadSettings(),
      general: { ...harness.settings.loadSettings().general, highContrastDarkColor: '#1a1a66' },
    });

    expect(window.getComputedStyle(document.body).backgroundColor).toBe('rgb(26, 26, 102)');

    turnHighContrastOff(harness.settings);

    expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
    expect(harness.bar.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('does not paint a colour saved while high contrast is off', () => {
    turnHighContrastOff(harness.settings);

    harness.settings.saveSettings({
      ...harness.settings.loadSettings(),
      general: { ...harness.settings.loadSettings().general, highContrastDarkColor: '#1a1a66' },
    });

    expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
    expect(harness.bar.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('reads the real colours of a chart the host re-rendered into new nodes', () => {
    // The restore before the re-capture writes to the elements captured last
    // time. A host that redraws into fresh SVG nodes leaves those detached, so
    // the restore reaches nothing -- which is fine, because the new nodes were
    // never recoloured and already carry their own colours. This pins that the
    // second path is as correct as the first, since only the first is obvious.
    harness.service.initializeHighContrast();
    const replacement = document.createElementNS(SVG_NAMESPACE, 'svg');
    replacement.setAttribute('id', 'chart');
    const redrawn = document.createElementNS(SVG_NAMESPACE, 'rect');
    redrawn.setAttribute('fill', BAR_FILL);
    redrawn.setAttribute('stroke', '#1f77b4');
    replacement.appendChild(redrawn);
    harness.display.plot.replaceWith(replacement);
    harness.display.plot = replacement as unknown as HTMLElement;

    harness.service.setFigure(createFigure());
    turnHighContrastOff(harness.settings);

    expect(redrawn.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('interpolates the colour ramp once per apply, not once per colour', () => {
    rebuild(Array.from({ length: 16 }, () => ({ fill: BAR_FILL })));
    const interpolate = jest.spyOn(harness.service, 'interpolateColors');

    harness.service.initializeHighContrast();

    expect(interpolate).toHaveBeenCalledTimes(1);
  });

  it('walks an element ancestry once per element, not once per captured colour', () => {
    // Every mark contributes a fill and a stroke, and the ancestor walk that
    // decides whether it is text was run for each of them and then again for
    // the glow filter.
    rebuild(Array.from({ length: 16 }, () => ({ fill: BAR_FILL })));
    const capturedColours = harness.marks.length * 2;
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'parentElement');
    let ancestorReads = 0;
    Object.defineProperty(Node.prototype, 'parentElement', {
      configurable: true,
      get(this: Node) {
        ancestorReads++;
        return descriptor?.get?.call(this);
      },
    });

    try {
      harness.service.initializeHighContrast();
    } finally {
      if (descriptor) {
        Object.defineProperty(Node.prototype, 'parentElement', descriptor);
      }
    }

    expect(ancestorReads).toBeLessThan(capturedColours);
  });

  it('leaves no inline body colours behind once high contrast is turned off', () => {
    harness.service.initializeHighContrast();

    turnHighContrastOff(harness.settings);

    // An inline declaration outranks the page's own stylesheet, so leaving one
    // here would freeze the page at whatever it looked like on the way in --
    // a host theme toggle would stop changing the body.
    expect(document.body.style.backgroundColor).toBe('');
    expect(document.body.style.color).toBe('');
  });

  it('restores an inline body colour the page set for itself', () => {
    rebuild([{ fill: BAR_FILL }], { inlineBodyBackground: 'rgb(200, 0, 0)' });

    harness.service.initializeHighContrast();
    turnHighContrastOff(harness.settings);

    expect(document.body.style.backgroundColor).toBe('rgb(200, 0, 0)');
  });

  it('leaves the ramp intact for later marks when one may not take the background', () => {
    // A long path may not take the background colour, and filtering it out of
    // the ramp must not strip it for the marks that follow.
    rebuild([
      { fill: '#aaaaaa', complexPath: true },
      { fill: '#aaaaaa', stroke: '#333333' },
      { fill: '#aaaaaa', stroke: '#333333' },
    ]);

    harness.service.initializeHighContrast();

    const [complex, ...rest] = harness.marks.map(mark => mark.getAttribute('fill'));
    expect(complex).toBe('#ffffff');
    expect(rest).toEqual(['#000000', '#000000']);
  });

  it('lets a tiled area take either end of the ramp, however long its outline', () => {
    // A contour band is a long path; forcing every band light left the whole
    // field one flat colour.
    rebuild(
      [{ fill: '#050aac', complexPath: true, stroke: 'none' }, { fill: '#e48b57', complexPath: true, stroke: 'none' }],
      { traceType: 'contour' },
    );

    harness.service.initializeHighContrast();

    expect(new Set(harness.marks.map(mark => mark.getAttribute('fill')))).toEqual(new Set(['#ffffff', '#000000']));
  });

  it('paints a colour given as a CSS variable by the colour it resolves to', () => {
    // Highcharts writes every colour as `var(--highcharts-...)`. The canvas
    // cannot parse that, and reading it as black sent every line, marker and
    // label to the background.
    // jsdom does not resolve custom properties, so the cascade is stubbed at
    // the DOM boundary: the element reports the colour the page defines.
    const computed = window.getComputedStyle;
    jest.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      if (element.getAttribute('fill') === 'var(--series-colour)') {
        return { getPropertyValue: () => 'rgb(44, 175, 254)' } as unknown as CSSStyleDeclaration;
      }
      return computed.call(window, element, pseudo);
    });

    try {
      rebuild([{ fill: 'var(--series-colour)', stroke: 'none' }]);
      harness.service.initializeHighContrast();
    } finally {
      jest.restoreAllMocks();
    }

    expect(harness.bar.getAttribute('fill')).toBe('#ffffff');

    turnHighContrastOff(harness.settings);

    expect(harness.bar.getAttribute('fill')).toBe('var(--series-colour)');
  });

  it('leaves a gradient or pattern fill as the chart drew it', () => {
    rebuild([{ fill: 'url(#gradient)' }]);

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('url(#gradient)');
  });

  it('keeps a translucent paint translucent', () => {
    // Highcharts draws an invisible hit area along every line; mapping it to
    // an opaque colour draws a thick band over the chart.
    rebuild([{ fill: 'rgba(31, 119, 180, 0.0001)' }]);

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('rgba(255, 255, 255, 0.0001)');
  });

  it('draws a faint outline no fainter than a faint gridline, and keeps a faint fill and a hit area as they were', () => {
    // Mermaid outlines a block diagram's composites rgba(170, 170, 51, 0.2):
    // white at 0.2 on the black backdrop is under 2:1, a frame far fainter
    // than any gridline.
    const paints = [
      { fill: 'rgba(255, 255, 222, 0.5)', stroke: 'rgba(170, 170, 51, 0.2)' },
      { fill: 'none', stroke: 'rgba(31, 119, 180, 0.0001)' },
      { fill: 'none', stroke: 'rgba(31, 119, 180, 0.2)' },
      { fill: 'none', stroke: 'rgba(31, 119, 180, 0.8)' },
      { fill: 'none', stroke: 'rgba(221, 221, 221, 0.4)' },
      { fill: 'rgba(31, 119, 180, 0.2)', stroke: 'none' },
    ].map((spec) => {
      rebuild([spec]);
      harness.service.initializeHighContrast();
      return [harness.bar.getAttribute('fill'), harness.bar.getAttribute('stroke')];
    });

    expect(paints).toEqual([
      ['rgba(0, 0, 0, 0.5)', 'rgba(255, 255, 255, 0.5)'],
      ['none', 'rgba(255, 255, 255, 0.0001)'],
      ['none', 'rgba(255, 255, 255, 0.5)'],
      ['none', 'rgba(255, 255, 255, 0.8)'],
      ['none', 'rgba(255, 255, 255, 0.5)'],
      ['rgba(255, 255, 255, 0.2)', null],
    ]);
  });

  it('never leaves a shape wholly in the background colour', () => {
    // A dark bar with no outline used to be matched to the dark end of the
    // ramp -- the background -- and vanish.
    rebuild([{ fill: '#1f3f5f', stroke: 'none' }, { fill: '#2a4a6a', stroke: 'none' }], { traceType: 'bar' });

    harness.service.initializeHighContrast();

    expect(harness.marks.map(mark => mark.getAttribute('fill'))).toEqual(['#ffffff', '#ffffff']);
  });

  it('never leaves a series in the background colour, however light it was', () => {
    // The luminance spread pushes the lightest series to white, which the
    // reversal then sent to black.
    rebuild([{ fill: '#aec7e8', stroke: 'none' }, { fill: '#1f77b4', stroke: 'none' }], { traceType: 'line' });

    harness.service.initializeHighContrast();

    expect(harness.marks.map(mark => mark.getAttribute('fill'))).toEqual(['#ffffff', '#ffffff']);
  });

  it('keeps the white gap between touching marks as background', () => {
    rebuild([{ fill: '#1f77b4', stroke: '#ffffff' }], { traceType: 'hist' });

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('#ffffff');
    expect(harness.bar.getAttribute('stroke')).toBe('#000000');
  });

  describe('a box drawn in tints of the page', () => {
    // Mermaid fills a railroad diagram's terminals #ffffde and outlines them
    // #eeeebc, both as light as paper. Both went to the background colour,
    // and every terminal box vanished from the black backdrop.
    function paintsOf(spec: MarkSpec): [string | null, string | null] {
      rebuild([spec]);
      harness.service.initializeHighContrast();
      return [harness.bar.getAttribute('fill'), harness.bar.getAttribute('stroke')];
    }

    it('keeps an outline drawn darker than its fill, in the light colour, and its own paints after', () => {
      expect(paintsOf({ fill: '#ffffde', stroke: '#eeeebc' })).toEqual(['#000000', '#ffffff']);

      turnHighContrastOff(harness.settings);

      expect([harness.bar.getAttribute('fill'), harness.bar.getAttribute('stroke')]).toEqual(['#ffffde', '#eeeebc']);
    });

    it('keeps a grey frame drawn on a white panel faint, as other frames are', () => {
      expect(paintsOf({ fill: '#ffffff', stroke: '#eeeeee' })).toEqual(['#000000', 'rgba(255, 255, 255, 0.5)']);
    });

    it('leaves a panel outlined in its own colour, or lighter, or not at all, in the background colour', () => {
      const panels = [
        paintsOf({ fill: '#ffffde', stroke: '#ffffde' }),
        paintsOf({ fill: '#eeeebc', stroke: '#ffffff' }),
        paintsOf({ fill: '#ffffde', stroke: 'none' }),
        paintsOf({ fill: '#ffffde', stroke: '#eeeebc', strokeWidth: '0' }),
      ];

      expect(panels).toEqual([
        ['#000000', '#000000'],
        ['#000000', '#000000'],
        ['#000000', null],
        ['#000000', '#000000'],
      ]);
    });
  });

  it('draws text light, whatever colour it was', () => {
    // Mid-grey labels are common and used to be matched to the background.
    rebuild([{ fill: '#999999', stroke: '#ffffff', text: true }]);

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('#ffffff');
    // A halo around text keeps separating it from what lies beneath.
    expect(harness.bar.getAttribute('stroke')).toBe('#000000');
  });

  it('recolours text styled by a stylesheet, and hands it back to the stylesheet after', () => {
    rebuild([{ fill: BAR_FILL }], { unstyledText: true });
    const text = harness.svg.querySelector('text') as SVGTextElement;

    harness.service.initializeHighContrast();

    expect(text.style.getPropertyValue('fill')).not.toBe('');

    turnHighContrastOff(harness.settings);

    expect(text.style.getPropertyValue('fill')).toBe('');
  });

  it('keeps a filled shape with an outline, drawn hollow', () => {
    // A light box behind a dark outline reads as the same box once the fill
    // goes dark and the outline light, and keeps what is drawn inside it --
    // a box plot's median -- visible.
    rebuild([{ fill: '#aec7e8', stroke: '#333333' }], { traceType: 'box' });

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('#000000');
    expect(harness.bar.getAttribute('stroke')).toBe('#ffffff');
  });

  it('turns a white label on a coloured mark dark, since the mark turns light', () => {
    rebuild([{ fill: '#ffffff', stroke: 'none', text: true }]);

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('#000000');
  });

  it('keeps a faint gridline faint rather than dropping it', () => {
    rebuild([{ fill: 'none', stroke: '#dddddd' }]);

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('stroke')).toBe('rgba(255, 255, 255, 0.5)');
  });

  it('reads a colour a computed style reports in color(srgb ...) form', () => {
    // Highcharts writes relative colours, `color(from var(...) ...)`, which a
    // computed style reports as `color(srgb r g b)`.
    rebuild([{ fill: 'color(srgb 0.17 0.69 1)', stroke: 'none' }]);

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('#ffffff');
  });

  it('lets a span inside a label take its colour from the label', () => {
    rebuild([{ fill: '#999999', stroke: 'none', text: true }]);
    const span = document.createElementNS(SVG_NAMESPACE, 'tspan');
    span.textContent = 'Coal';
    harness.bar.appendChild(span);
    harness.service.dispose();
    harness = { ...harness, service: new HighContrastService(
      harness.settings,
      { notify: () => {} } as unknown as NotificationService,
      harness.display as unknown as DisplayService,
      createFigure(),
      { id: 'chart', instructionContext: {} } as unknown as Context,
    ) };

    harness.service.initializeHighContrast();

    expect(span.style.getPropertyValue('fill')).toBe('');
  });

  it('does not count an outline drawn at zero width', () => {
    // Plotly gives every bar a stroke colour and draws it at zero width, so
    // the bar is its fill alone.
    rebuild([{ fill: '#1f3f5f', stroke: '#444444', strokeWidth: '0' }], { traceType: 'bar' });

    harness.service.initializeHighContrast();

    expect(harness.bar.getAttribute('fill')).toBe('#ffffff');
  });

  describe('on a chart of more than one layer or panel', () => {
    /**
     * Replaces the harness's service with one reading `figure`, under a
     * context that reports no single type, as a Subplot of several layers or
     * a Figure of several panels does.
     */
    function serviceFor(figure: Figure): void {
      harness.service.dispose();
      harness = { ...harness, service: new HighContrastService(
        harness.settings,
        { notify: () => {} } as unknown as NotificationService,
        harness.display as unknown as DisplayService,
        figure,
        { id: 'chart', instructionContext: {} } as unknown as Context,
      ) };
    }

    it('keeps a near-white bar a bar beside a line', () => {
      // Mermaid's XY chart draws its bars #ECECFF beside a line; they were
      // taken for paper, painted the background colour and vanished.
      rebuild([
        { fill: '#ececff', stroke: 'none' },
        { fill: 'none', stroke: '#808080', complexPath: true },
      ]);
      const [bar, line] = harness.marks;
      serviceFor(createFigure([
        { traceType: 'bar', elements: [bar] },
        { traceType: 'line', elements: [line] },
      ]));

      harness.service.initializeHighContrast();

      expect(bar.getAttribute('fill')).toBe('#ffffff');
      expect(line.getAttribute('stroke')).toBe('#ffffff');
    });

    it('cases a line drawn beside bars in the background colour, and takes the casing away after', () => {
      // Mermaid's XY chart draws its line over its bars, and both are light:
      // every segment that crossed a bar was lost in it.
      rebuild([
        { fill: '#ececff', stroke: 'none' },
        { fill: 'none', stroke: '#8493a6', complexPath: true, strokeWidth: '2' },
      ]);
      const [bar, line] = harness.marks;
      // A flat line has a box of no height, which a filter sized by that box
      // would leave undrawn.
      (line as unknown as SVGGraphicsElement).getBBox = (): DOMRect => ({ x: 10, y: 50, width: 300, height: 0 }) as DOMRect;
      serviceFor(createFigure([
        { traceType: 'bar', elements: [bar] },
        { traceType: 'line', elements: [], geometry: [line] },
      ]));

      harness.service.initializeHighContrast();

      const id = line.getAttribute('filter')?.match(/^url\(#(.+)\)$/)?.[1] ?? '';
      const casing = harness.svg.querySelector(`filter[id="${id}"]`);
      expect(bar.getAttribute('fill')).toBe('#ffffff');
      expect(line.getAttribute('stroke')).toBe('#ffffff');
      expect(casing?.getAttribute('filterUnits')).toBe('userSpaceOnUse');
      expect(Number(casing?.getAttribute('height'))).toBeGreaterThan(0);
      expect(casing?.querySelector('feFlood')?.getAttribute('flood-color')).toBe('#000000');

      turnHighContrastOff(harness.settings);

      expect(line.hasAttribute('filter')).toBe(false);
      expect(harness.svg.querySelector('filter')).toBeNull();
    });

    it('cases no line on a chart without bars, nor one the page filters itself', () => {
      rebuild([
        { fill: '#ececff', stroke: 'none' },
        { fill: 'none', stroke: '#8493a6', complexPath: true },
        { fill: 'none', stroke: '#1f77b4', complexPath: true },
      ]);
      const [bar, line, filtered] = harness.marks;
      filtered.setAttribute('filter', 'url(#page-glow)');
      for (const mark of [line, filtered]) {
        (mark as unknown as SVGGraphicsElement).getBBox = (): DOMRect => ({ x: 0, y: 0, width: 300, height: 100 }) as DOMRect;
      }
      serviceFor(createFigure([{ traceType: 'line', elements: [], geometry: [line] }]));
      harness.service.initializeHighContrast();
      const alone = line.getAttribute('filter');
      serviceFor(createFigure([
        { traceType: 'bar', elements: [bar] },
        { traceType: 'line', elements: [], geometry: [filtered] },
      ]));

      harness.service.initializeHighContrast();

      expect(alone).toBeNull();
      expect(filtered.getAttribute('filter')).toBe('url(#page-glow)');
    });

    it('keeps a near-white bar a bar in each of several panels', () => {
      rebuild([{ fill: '#ececff', stroke: 'none' }, { fill: '#f4f4ff', stroke: 'none' }]);
      const panels = harness.marks.map(mark => ({
        traces: [[{ traceType: 'bar', getAllOriginalElements: (): SVGElement[] => [mark] }]],
      }));
      serviceFor({ subplots: [panels] } as unknown as Figure);

      harness.service.initializeHighContrast();

      expect(harness.marks.map(mark => mark.getAttribute('fill'))).toEqual(['#ffffff', '#ffffff']);
    });
  });

  it('lifts the labels of a tiled chart off their cells, and lets them go after', () => {
    // A heat map label may land on a cell of either shade, so it is given the
    // glow; the glow goes when high contrast does.
    rebuild([{ fill: '#1f77b4', stroke: 'none' }], { traceType: 'heat', unstyledText: true });
    const label = harness.svg.querySelector('text') as SVGTextElement;

    harness.service.initializeHighContrast();

    expect(label.getAttribute('filter')).toBe('url(#glow-shadow)');

    turnHighContrastOff(harness.settings);

    expect(label.hasAttribute('filter')).toBe(false);
    expect(harness.svg.querySelector('#glow-shadow')).toBeNull();
  });

  it('darkens a CSS background on the chart and restores it after', () => {
    // Plotly and Vega-Lite paint the chart's white ground as a CSS background
    // on the SVG, behind every mark.
    rebuild([{ fill: BAR_FILL }], { svgBackground: 'white' });

    harness.service.initializeHighContrast();

    expect(harness.svg.style.backgroundColor).not.toBe('white');

    turnHighContrastOff(harness.settings);

    expect(harness.svg.style.backgroundColor).toBe('white');
  });

  describe('a mark blended with what lies beneath it', () => {
    // Mermaid draws a sankey's links `mix-blend-mode: multiply`, inline and
    // from its stylesheet; multiplied over the black backdrop every link was
    // drawn black. Drawn normally instead, the highlighted link covered the
    // labels at its ends.
    function blended(mode: string): void {
      rebuild([{ fill: BAR_FILL }], {
        beforeService: () => document.querySelector('#chart rect')?.setAttribute('style', `mix-blend-mode: ${mode}`),
      });
    }

    it('is screened over the dark backdrop, and multiplied again after', () => {
      blended('multiply');

      harness.service.initializeHighContrast();

      expect(harness.bar.style.getPropertyValue('mix-blend-mode')).toBe('screen');

      turnHighContrastOff(harness.settings);

      expect(harness.bar.style.getPropertyValue('mix-blend-mode')).toBe('multiply');
      expect(harness.bar.getAttribute('style')).toContain('mix-blend-mode: multiply');
    });

    it('takes the dark backdrop\'s counterpart of each darkening mode, and is drawn normally in any other', () => {
      const modes = ['darken', 'color-burn', 'overlay', 'lighten'].map((mode) => {
        blended(mode);
        harness.service.initializeHighContrast();
        return harness.bar.style.getPropertyValue('mix-blend-mode');
      });

      expect(modes).toEqual(['lighten', 'color-dodge', 'normal', 'lighten']);
    });

    it('keeps its own colour over a backdrop the reader made light', () => {
      const modes = ['multiply', 'screen'].map((mode) => {
        blended(mode);
        harness.settings.saveSettings({
          ...harness.settings.loadSettings(),
          general: { ...harness.settings.loadSettings().general, highContrastDarkColor: '#ffffff', highContrastLightColor: '#000000' },
        });
        harness.service.initializeHighContrast();
        return harness.bar.style.getPropertyValue('mix-blend-mode');
      });

      expect(modes).toEqual(['multiply', 'multiply']);
    });

    it('is screened when a stylesheet blends it, and handed back to the stylesheet after', () => {
      rebuild([{ fill: BAR_FILL }], {
        beforeService: () => {
          document.head.insertAdjacentHTML('beforeend', '<style>#chart rect { mix-blend-mode: multiply; }</style>');
        },
      });

      harness.service.initializeHighContrast();

      expect(window.getComputedStyle(harness.bar).getPropertyValue('mix-blend-mode')).toBe('screen');

      turnHighContrastOff(harness.settings);

      expect(harness.bar.style.getPropertyValue('mix-blend-mode')).toBe('');
      expect(window.getComputedStyle(harness.bar).getPropertyValue('mix-blend-mode')).toBe('multiply');
    });

    it('is screened in the hidden copy a highlight is cloned from', () => {
      const copy = document.createElementNS(SVG_NAMESPACE, 'rect');
      copy.setAttribute('visibility', 'hidden');
      copy.setAttribute('style', 'mix-blend-mode: multiply');
      rebuild([{ fill: BAR_FILL }], { beforeService: () => document.querySelector('#chart')?.appendChild(copy) });

      harness.service.initializeHighContrast();

      expect(copy.style.getPropertyValue('mix-blend-mode')).toBe('screen');
    });

    it('is the only mark given a blend mode', () => {
      harness.service.initializeHighContrast();

      expect(harness.bar.style.getPropertyValue('mix-blend-mode')).toBe('');
    });
  });

  it('puts pattern and glow definitions inside the SVG when the plot is a wrapper', () => {
    // A <pattern> outside an <svg> renders nothing, so every patterned wedge
    // disappeared on a chart whose SVG had no <defs> of its own.
    rebuild(
      [{ fill: '#4e79a7' }, { fill: '#f28e2b' }],
      { traceType: 'pie', wrapInDiv: true },
    );

    harness.service.initializeHighContrast();

    expect(harness.svg.querySelectorAll('pattern')).toHaveLength(2);
    expect(harness.svg.querySelector('#glow-shadow')).not.toBeNull();
    expect(harness.display.plot.querySelector(':scope > defs')).toBeNull();
  });

  describe('telling the highlight the chart was repainted', () => {
    // The highlight copies a mark as it is painted, so it is drawn again each
    // time the reader repaints the chart -- and only then.
    function countRepaints(): () => number {
      let repaints = 0;
      harness.service.onDidRepaint(() => {
        repaints++;
      });
      return () => repaints;
    }

    it('tells it once each time high contrast is turned on or off', () => {
      const repaints = countRepaints();
      turnHighContrastOff(harness.settings);
      const afterOff = repaints();

      turnHighContrastOn(harness.settings);

      expect(afterOff).toBe(1);
      expect(repaints()).toBe(2);
    });

    it('tells it once when new levels are saved while painted', () => {
      harness.service.initializeHighContrast();
      const repaints = countRepaints();

      harness.settings.saveSettings({
        ...harness.settings.loadSettings(),
        general: { ...harness.settings.loadSettings().general, highContrastLevels: 4 },
      });

      expect(repaints()).toBe(1);
    });

    it('does not tell it when the chart is painted on focus or put back on blur', () => {
      const repaints = countRepaints();

      harness.service.initializeHighContrast();
      harness.service.suspendHighContrast();

      expect(repaints()).toBe(0);
    });
  });

  describe('the legend of a patterned chart', () => {
    // A pie's wedges are told apart by pattern in high contrast, and its
    // legend keys were left a plain colour: black on black, or white, the
    // same for every series.

    /** Draws `markup` after the marks, as a legend is drawn. */
    function withLegend(specs: MarkSpec[], markup: string, before = false, options: HarnessOptions = {}): void {
      rebuild(specs, {
        traceType: 'pie',
        ...options,
        beforeService: () => {
          const chart = document.querySelector('#chart') as SVGSVGElement;
          const legend = document.createElementNS(SVG_NAMESPACE, 'g');
          legend.innerHTML = markup;
          chart.insertBefore(legend, before ? chart.firstChild : null);
        },
      });
    }

    /** The paint a key is drawn with, from its style or its attribute. */
    const fillOf = (element: Element): string =>
      element.getAttribute('style')?.match(/fill:\s*([^;]+)/)?.[1].trim() ?? element.getAttribute('fill') ?? '';

    it('gives each key the pattern of the marks it keys, and its own colour back after', () => {
      withLegend(
        [{ fill: '#ececff' }, { fill: '#b5ff20' }],
        '<rect class="key" style="fill: rgb(236, 236, 255); stroke: rgb(236, 236, 255)"></rect>'
        + '<rect class="key" fill="#b5ff20"></rect>',
      );
      const keys = Array.from(harness.svg.querySelectorAll('.key'));

      harness.service.initializeHighContrast();

      expect(keys.map(fillOf)).toEqual(harness.marks.map(mark => mark.getAttribute('fill')));
      expect(fillOf(keys[0])).toMatch(/^url\(#maidr-pattern-/);
      expect(fillOf(keys[0])).not.toBe(fillOf(keys[1]));

      turnHighContrastOff(harness.settings);

      expect(keys.map(fillOf)).toEqual(['rgb(236, 236, 255)', '#b5ff20']);
    });

    it('tells a radar\'s overlapping series apart, and gives each key its series\' pattern', () => {
      // Mermaid draws a radar's series #8686ff and #ffff78, translucent, one
      // over the other. Both went white with a white outline, and both keys
      // white: nothing said which outline was Alice and which Bob. The layer
      // names the curves, and maidr marks their vertices with circles of its
      // own, so the curves are the shapes it was read from.
      withLegend(
        [
          { fill: '#8686ff', stroke: '#8686ff', complexPath: true },
          { fill: '#ffff78', stroke: '#ffff78', complexPath: true },
        ],
        '<rect class="key" fill="#8686ff"></rect><rect class="key" fill="#ffff78"></rect>',
        false,
        { traceType: 'radar', marksAreGeometry: true },
      );
      const keys = Array.from(harness.svg.querySelectorAll('.key'));

      harness.service.initializeHighContrast();

      const curves = harness.marks.map(mark => mark.getAttribute('fill'));
      expect(curves[0]).toMatch(/^url\(#maidr-pattern-/);
      expect(curves[1]).toMatch(/^url\(#maidr-pattern-/);
      expect(curves[0]).not.toBe(curves[1]);
      expect(keys.map(fillOf)).toEqual(curves);
      expect(harness.marks.map(mark => mark.getAttribute('stroke'))).toEqual(['#ffffff', '#ffffff']);

      turnHighContrastOff(harness.settings);

      expect(harness.marks.map(mark => mark.getAttribute('fill'))).toEqual(['#8686ff', '#ffff78']);
      expect(keys.map(fillOf)).toEqual(['#8686ff', '#ffff78']);
    });

    it('leaves a shape of a series colour drawn before the marks alone', () => {
      withLegend([{ fill: '#ececff' }, { fill: '#b5ff20' }], '<rect class="panel" fill="#b5ff20"></rect>', true);

      harness.service.initializeHighContrast();

      expect(fillOf(harness.svg.querySelector('.panel') as Element)).not.toMatch(/^url\(/);
    });

    it('patterns no text, and no key of a white series', () => {
      withLegend(
        [{ fill: '#ffffff' }, { fill: '#b5ff20' }],
        '<text class="label" fill="#b5ff20">Cats</text><rect class="frame" fill="#ffffff"></rect>',
      );

      harness.service.initializeHighContrast();

      expect(fillOf(harness.svg.querySelector('.label') as Element)).not.toMatch(/^url\(/);
      expect(fillOf(harness.svg.querySelector('.frame') as Element)).not.toMatch(/^url\(/);
    });
  });

  it('recolours the layers drawn over the plot with it', () => {
    const overlay = document.createElementNS(SVG_NAMESPACE, 'svg');
    const title = document.createElementNS(SVG_NAMESPACE, 'text');
    title.setAttribute('fill', '#444444');
    overlay.appendChild(title);
    // The harness clears the page as it builds, so the overlay goes in after,
    // attached before the service is built -- as Plotly's layer is.
    const buildWithOverlay = (): void => {
      document.body.appendChild(overlay);
    };
    harness.service.dispose();
    harness = createHarness([{ fill: BAR_FILL }], { overlays: [overlay], beforeService: buildWithOverlay });

    harness.service.initializeHighContrast();

    expect(title.getAttribute('fill')).toBe('#ffffff');

    turnHighContrastOff(harness.settings);

    expect(title.getAttribute('fill')).toBe('#444444');
  });
  it('marks only its own chart as a line chart, never another with the same id', () => {
    // The class went to the first element on the page with the chart's id,
    // which can be another chart's.
    rebuild([{ fill: 'none', stroke: '#1f77b4' }], {
      traceType: 'line',
      wrapInDiv: true,
      surround: pageAround('<svg id="chart"></svg><i data-chart></i>'),
    });
    const other = document.body.firstElementChild as Element;

    harness.service.initializeHighContrast();

    expect(harness.svg.classList.contains('high-contrast')).toBe(true);
    expect(other.classList.contains('high-contrast')).toBe(false);

    turnHighContrastOff(harness.settings);

    expect(harness.svg.classList.contains('high-contrast')).toBe(false);
  });

  describe('paint a stylesheet gives', () => {
    // Mermaid paints its edges, markers, lifelines, node fills and axis text
    // from the <style> it puts in the diagram. None of it was captured, and
    // where an attribute was rewritten instead the rule still won, so the
    // diagram's lines stayed dark on the black backdrop.
    const SHEET_LIGHT = '#ffffff';
    const SHEET_DARK = '#000000';

    /** Builds a chart from markup drawn into the SVG, under a stylesheet. */
    function chartOf(markup: string, css: string): void {
      rebuild([{ fill: 'none', stroke: 'none' }], {
        beforeService: () => {
          document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
          const chart = document.querySelector('#chart') as SVGSVGElement;
          chart.innerHTML = markup;
        },
      });
    }

    it('repaints a line a rule strokes, and hands it back to the rule after', () => {
      chartOf('<path class="edge" d="M 0 0 L 10 10"></path>', '#chart .edge { stroke: #333333; fill: none; }');
      const edge = harness.svg.querySelector('.edge') as SVGElement;

      harness.service.initializeHighContrast();

      expect(edge.style.getPropertyValue('stroke')).toBe(SHEET_LIGHT);
      expect(edge.style.getPropertyPriority('stroke')).toBe('important');
      expect(edge.style.getPropertyValue('fill')).toBe('');

      turnHighContrastOff(harness.settings);

      expect(edge.hasAttribute('style')).toBe(false);
    });

    it('repaints text a rule colours over its fill attribute, and leaves the attribute alone', () => {
      // D3's and Mermaid's axis ticks: `fill="#000"` under `.tick text`.
      chartOf('<g class="tick"><text fill="#000">2026-01-11</text></g>', '#chart .tick text { fill: #333333; }');
      const tick = harness.svg.querySelector('text') as SVGElement;

      harness.service.initializeHighContrast();

      expect(tick.style.getPropertyValue('fill')).toBe(SHEET_LIGHT);
      expect(tick.getAttribute('fill')).toBe('#000');

      turnHighContrastOff(harness.settings);

      expect(tick.style.getPropertyValue('fill')).toBe('');
      expect(tick.getAttribute('fill')).toBe('#000');
    });

    it('repaints a fill an important rule gives, over the rule', () => {
      // A Mermaid classDef is an `!important` rule.
      chartOf('<rect class="box"></rect>', '#chart rect.box { fill: #f0f0f0 !important; }');
      const box = harness.svg.querySelector('.box') as SVGElement;

      harness.service.initializeHighContrast();

      expect(box.style.getPropertyValue('fill')).toBe(SHEET_DARK);
      expect(box.style.getPropertyPriority('fill')).toBe('important');
    });

    it('takes an inline paint over the attribute it hides', () => {
      // C4 and Mermaid's sequence actors write both. The hidden attribute was
      // counted as the outline that kept the box visible, and the box was
      // left black on black.
      chartOf(
        '<rect fill="#eaeaea" stroke="#666666" style="fill: #fff7ed; stroke: #fb923c"></rect>',
        '',
      );
      const box = harness.svg.querySelector('rect') as SVGElement;

      harness.service.initializeHighContrast();

      expect(box.getAttribute('style')).toContain('stroke:#ffffff');
      expect(box.getAttribute('stroke')).toBe('#666666');
    });

    it('repaints a span a rule colours itself, as well as its label', () => {
      // Mermaid's `.loopText > tspan`, which kept a loop's condition dark.
      chartOf(
        '<text class="loopText"><tspan>[Until the password matches]</tspan></text>',
        '#chart .loopText, #chart .loopText > tspan { fill: #333333; }',
      );
      const span = harness.svg.querySelector('tspan') as SVGElement;

      harness.service.initializeHighContrast();

      expect(span.style.getPropertyValue('fill')).toBe(SHEET_LIGHT);
      expect(span.style.getPropertyPriority('fill')).toBe('important');
    });

    it('repaints the markers a rule fills', () => {
      chartOf(
        '<defs><marker id="arrow"><path class="arrowhead" d="M 0 0 L 5 5"></path></marker></defs>',
        '#chart .arrowhead { fill: #333333; stroke: #333333; }',
      );
      const head = harness.svg.querySelector('.arrowhead') as SVGElement;

      harness.service.initializeHighContrast();

      expect(head.style.getPropertyValue('fill')).toBe(SHEET_LIGHT);
      expect(head.style.getPropertyValue('stroke')).toBe(SHEET_LIGHT);
    });

    it('paints a pale yellow as ink, not as the page showing through', () => {
      // Mermaid draws a radar series, and a mindmap's section and its
      // branches, in #ffff78: as light as paper, but a colour. Taken for the
      // page, the series and the branches were painted the background colour.
      chartOf(
        '<path class="curve" d="M 0 0 L 10 10 Z"></path><path class="branch" d="M 0 0 L 10 10"></path>',
        '#chart .curve { fill: #ffff78; stroke: #ffff78; } #chart .branch { fill: none; stroke: #ffff78; }',
      );
      const curve = harness.svg.querySelector('.curve') as SVGElement;
      const branch = harness.svg.querySelector('.branch') as SVGElement;

      harness.service.initializeHighContrast();

      expect(curve.style.getPropertyValue('fill')).toBe(SHEET_LIGHT);
      expect(branch.style.getPropertyValue('stroke')).toBe(SHEET_LIGHT);
    });

    it('reads a rule nested in an at-rule, and none that matches no element', () => {
      chartOf(
        '<path class="edge" d="M 0 0 L 10 10"></path>',
        '@media screen { #chart .edge { stroke: #333333; } } #chart .edge::after { fill: red; }',
      );
      const edge = harness.svg.querySelector('.edge') as SVGElement;

      harness.service.initializeHighContrast();

      expect(edge.style.getPropertyValue('stroke')).toBe(SHEET_LIGHT);
    });
  });

  describe('HTML drawn inside the SVG', () => {
    // Mermaid draws its labels as HTML in a <foreignObject>, coloured by CSS
    // `color`. A rule on the label outranked the colour it would take from
    // the backdrop, so Venn items and use case actors stayed dark on black.

    /** Builds a chart holding `markup` in a foreignObject, under `css`. */
    function htmlChart(markup: string, css: string, options: HarnessOptions = {}): HTMLElement {
      rebuild([{ fill: 'none', stroke: 'none' }], {
        ...options,
        beforeService: () => {
          document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
          const object = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
          object.innerHTML = markup;
          document.querySelector('#chart')?.appendChild(object);
        },
      });
      return harness.svg.querySelector('foreignObject') as unknown as HTMLElement;
    }

    it('recolours HTML text a stylesheet colours, and hands it back after', () => {
      const object = htmlChart(
        '<div><span class="venn-text-node">React</span></div>',
        '#chart .venn-text-node { color: rgb(40, 37, 61); }',
      );
      const label = object.querySelector('span') as HTMLElement;

      harness.service.initializeHighContrast();

      expect(label.style.getPropertyValue('color')).toBe(LIGHT);
      expect(label.style.getPropertyPriority('color')).toBe('important');

      turnHighContrastOff(harness.settings);

      expect(label.style.getPropertyValue('color')).toBe('');
      expect(label.hasAttribute('style')).toBe(false);
    });

    it('turns near-white HTML text dark', () => {
      const object = htmlChart('<p class="on-mark">Ship</p>', '#chart .on-mark { color: rgb(255, 255, 255); }');

      harness.service.initializeHighContrast();

      expect((object.querySelector('p') as HTMLElement).style.getPropertyValue('color')).toBe(DARK);
    });

    it('darkens a label box drawn in HTML, and restores it after', () => {
      // Mermaid's edge labels: `.edgeLabel p { background-color: ... }`.
      const object = htmlChart('<p class="edgeLabel">yes</p>', '#chart .edgeLabel { background-color: rgba(232, 232, 232, 0.8); }');
      const box = object.querySelector('p') as HTMLElement;

      harness.service.initializeHighContrast();

      expect(box.style.getPropertyValue('background-color')).toBe(DARK);

      turnHighContrastOff(harness.settings);

      expect(box.style.getPropertyValue('background-color')).toBe('');
    });

    it('leaves HTML outside the SVG alone', () => {
      htmlChart('<span>React</span>', '#react-container-chart p { color: rgb(40, 37, 61); }', { article: true });
      const announcement = document.querySelector('#react-container-chart p') as HTMLElement;

      harness.service.initializeHighContrast();

      expect(announcement.style.getPropertyValue('color')).toBe('');
    });
  });

  describe('a label and the shape under it', () => {
    // A box lifted to the light colour: its fill and outline both map to the
    // background, so its fill is lifted off it -- as Mermaid's event model
    // boxes are.
    const LIFTED_BOX: MarkSpec = { fill: '#bcd6fe', stroke: '#679ac3' };
    // A box whose fill goes dark behind an outline that goes light.
    const DARKENED_BOX: MarkSpec = { fill: '#ffb778', stroke: '#c19a0f' };
    // An inline fill as jsdom reports it: as written, where it serialises
    // `color` as rgb().
    const DARK_FILL = '#000000';
    const LIGHT_FILL = '#ffffff';

    /**
     * Builds a chart of one box with a label drawn on it, the label coloured
     * by a stylesheet as Mermaid colours its text, and lays them out.
     */
    function labelOn(
      box: MarkSpec,
      options: { css?: string; boxStyle?: string; traceType?: string; copied?: boolean } = {},
    ): SVGElement {
      rebuild([box], {
        traceType: options.traceType,
        beforeService: () => {
          document.head.insertAdjacentHTML('beforeend', `<style>#chart .lab { fill: #333333; } ${options.css ?? ''}</style>`);
          const chart = document.querySelector('#chart') as SVGSVGElement;
          if (options.boxStyle !== undefined) {
            chart.querySelector('rect')?.setAttribute('style', options.boxStyle);
          }
          const label = document.createElementNS(SVG_NAMESPACE, 'text');
          label.setAttribute('class', 'lab');
          label.textContent = 'Add item';
          chart.appendChild(label);
          if (options.copied) {
            // The hidden copy MAIDR stands beside a node, as Svg.cloneHidden does.
            const copy = document.createElementNS(SVG_NAMESPACE, 'g');
            copy.setAttribute('data-maidr-owned', 'true');
            copy.setAttribute('visibility', 'hidden');
            copy.append(chart.querySelector('rect')?.cloneNode(true) ?? '', label.cloneNode(true));
            chart.appendChild(copy);
          }
        },
      });
      const label = harness.svg.querySelector('text.lab') as SVGElement;
      placeAt(harness.bar, 0, 0, 100, 40);
      placeAt(label, 10, 10, 60, 16);
      const copy = harness.svg.querySelector('[data-maidr-owned]');
      if (copy !== null) {
        placeAt(copy.querySelector('rect') as Element, 0, 0, 100, 40);
        placeAt(copy.querySelector('text') as Element, 10, 10, 60, 16);
      }
      return label;
    }

    it('gives a label the colour that reads on the box under it, and takes it back after', () => {
      const label = labelOn(LIFTED_BOX);

      harness.service.initializeHighContrast();

      expect(harness.bar.getAttribute('fill')).toBe('#ffffff');
      expect(label.style.getPropertyValue('fill')).toBe(DARK_FILL);
      expect(label.style.getPropertyPriority('fill')).toBe('important');

      turnHighContrastOff(harness.settings);

      expect(label.style.getPropertyValue('fill')).toBe('');
    });

    it('gives an HTML label inside the SVG the colour that reads on the box under it', () => {
      rebuild([LIFTED_BOX], {
        beforeService: () => {
          const object = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
          const div = document.createElement('div');
          div.textContent = 'Add item';
          object.appendChild(div);
          document.querySelector('#chart')?.appendChild(object);
        },
      });
      const div = harness.svg.querySelector('foreignObject div') as HTMLElement;
      placeAt(harness.bar, 0, 0, 100, 40);
      placeAt(div, 10, 10, 60, 16);

      harness.service.initializeHighContrast();

      expect(div.style.getPropertyValue('color')).toBe(DARK);

      turnHighContrastOff(harness.settings);

      expect(div.style.getPropertyValue('color')).toBe('');
    });

    it('keeps a label light on a box that went dark', () => {
      const label = labelOn(DARKENED_BOX);

      harness.service.initializeHighContrast();

      expect(harness.bar.getAttribute('fill')).toBe('#000000');
      expect(label.style.getPropertyValue('fill')).toBe(LIGHT_FILL);
    });

    it('leaves a label with nothing under it the colour it was given', () => {
      const label = labelOn(LIFTED_BOX);
      placeAt(harness.bar, 200, 200, 100, 40);

      harness.service.initializeHighContrast();

      expect(label.style.getPropertyValue('fill')).toBe(LIGHT_FILL);
    });

    it('gives a label drawn across a box\'s edge the colour that reads on more of it, haloed in the other, and takes both back after', () => {
      // A C4 relationship's label is drawn at the middle of its arrow, here
      // with its right end over a cylinder that goes white. Read at its
      // centre alone it was on nothing, and was left white on the cylinder.
      const label = labelOn(LIFTED_BOX);
      placeAt(label, 80, 10, 80, 16);

      harness.service.initializeHighContrast();

      expect(harness.bar.getAttribute('fill')).toBe('#ffffff');
      expect(label.style.getPropertyValue('fill')).toBe(LIGHT_FILL);
      expect(label.style.getPropertyValue('stroke')).toBe(DARK_FILL);
      expect(label.style.getPropertyValue('stroke-width')).toBe('3px');

      turnHighContrastOff(harness.settings);

      expect(label.hasAttribute('style')).toBe(false);
    });

    it('draws no halo round a label wholly on one box', () => {
      const label = labelOn(LIFTED_BOX);

      harness.service.initializeHighContrast();

      expect(label.style.getPropertyValue('stroke')).toBe('');
    });

    it('halos an HTML label drawn across a box\'s edge', () => {
      rebuild([LIFTED_BOX], {
        beforeService: () => {
          const object = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
          const div = document.createElement('div');
          div.textContent = 'Reads accounts';
          object.appendChild(div);
          document.querySelector('#chart')?.appendChild(object);
        },
      });
      const div = harness.svg.querySelector('foreignObject div') as HTMLElement;
      placeAt(harness.bar, 0, 0, 100, 40);
      placeAt(div, 30, 10, 80, 16);

      harness.service.initializeHighContrast();

      expect(div.style.getPropertyValue('color')).toBe(DARK);
      expect(div.style.getPropertyValue('text-shadow')).toContain('#ffffff');

      turnHighContrastOff(harness.settings);

      expect(div.style.getPropertyValue('text-shadow')).toBe('');
    });

    it('sees a translucent box as it shows over the dark backdrop', () => {
      // White at 0.3 over black is a dark grey, which light text reads on;
      // at 0.6 it is a light grey, which dark text reads on.
      const faint = labelOn(LIFTED_BOX, { boxStyle: 'opacity: 0.3' });
      harness.service.initializeHighContrast();
      const faintFill = faint.style.getPropertyValue('fill');

      const solid = labelOn(LIFTED_BOX, { boxStyle: 'opacity: 0.6' });
      harness.service.initializeHighContrast();

      expect(faintFill).toBe(LIGHT_FILL);
      expect(solid.style.getPropertyValue('fill')).toBe(DARK_FILL);
    });

    it('does not take one of MAIDR\'s highlights for the surface', () => {
      const label = labelOn(DARKENED_BOX);
      harness.service.initializeHighContrast();
      const highlight = document.createElementNS(SVG_NAMESPACE, 'rect');
      highlight.setAttribute('data-maidr-owned', 'true');
      highlight.setAttribute('style', 'fill: rgb(3, 200, 9)');
      placeAt(highlight, 0, 0, 100, 40);
      harness.svg.insertBefore(highlight, label);

      turnHighContrastOff(harness.settings);
      turnHighContrastOn(harness.settings);

      expect(label.style.getPropertyValue('fill')).toBe(LIGHT_FILL);
    });

    it('gives the label in the copy a highlight is cloned from its original\'s colour, and takes it back after', () => {
      // The highlight is cloned from MAIDR's hidden copy, and outlines the box
      // without filling it, so the copy's label shows over the original box:
      // left light, the label of the node the reader was on went white on white.
      const label = labelOn(LIFTED_BOX, { copied: true });
      const copied = harness.svg.querySelector('[data-maidr-owned] text') as SVGElement;

      harness.service.initializeHighContrast();

      expect(label.style.getPropertyValue('fill')).toBe(DARK_FILL);
      expect(copied.style.getPropertyValue('fill')).toBe(DARK_FILL);
      expect(copied.style.getPropertyPriority('fill')).toBe('important');

      turnHighContrastOff(harness.settings);

      expect(copied.style.getPropertyValue('fill')).toBe('');
    });

    it('leaves text that draws its own halo, and the labels of a tiled chart, as they were', () => {
      const haloed = labelOn(LIFTED_BOX, { css: '#chart .lab { stroke: #ffffff; stroke-width: 3px; }' });
      harness.service.initializeHighContrast();
      const haloedFill = haloed.style.getPropertyValue('fill');

      const onCell = labelOn({ fill: '#1f77b4', stroke: 'none' }, { traceType: 'heat' });
      harness.service.initializeHighContrast();

      expect(haloedFill).toBe(LIGHT_FILL);
      expect(onCell.style.getPropertyValue('fill')).toBe(LIGHT_FILL);
    });

    it('gives a span its own rule colours the colour of its label, and takes it back after', () => {
      // Mermaid colours a sequence diagram's `.loopText > tspan` itself.
      const label = labelOn(LIFTED_BOX, { css: '#chart .lab > tspan { fill: #333333; }' });
      const span = document.createElementNS(SVG_NAMESPACE, 'tspan');
      span.textContent = 'loop';
      label.replaceChildren(span);

      harness.service.initializeHighContrast();

      expect(span.style.getPropertyValue('fill')).toBe(DARK_FILL);

      turnHighContrastOff(harness.settings);

      expect(span.style.getPropertyValue('fill')).toBe('');
    });
  });

  describe('what it paints behind the chart', () => {
    it('paints the page behind a chart that has the document to itself', () => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: pageAround('<script>var maidr = {};</script><i data-chart></i><script></script>'),
      });

      harness.service.initializeHighContrast();

      expect(window.getComputedStyle(document.body).backgroundColor).toBe(DARK);
      expect(harness.article?.style.backgroundColor).toBe('');
    });

    it('paints the chart, not a page it shares', () => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: pageAround('<h1>Results</h1><i data-chart></i>'),
      });
      const article = harness.article as HTMLElement;

      harness.service.initializeHighContrast();

      expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
      expect(document.body.style.backgroundColor).toBe('');
      expect(article.style.backgroundColor).toBe(DARK);
      expect(article.style.color).toBe(LIGHT);

      turnHighContrastOff(harness.settings);

      expect(article.style.backgroundColor).toBe('');
      expect(article.style.color).toBe('');
    });

    it('puts the chart\'s own inline colours back as they were', () => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: (chart) => {
          pageAround('<h1>Results</h1><i data-chart></i>')(chart);
          chart.querySelector('article')?.style.setProperty('background-color', 'rgb(1, 2, 3)', 'important');
        },
      });
      const article = harness.article as HTMLElement;

      harness.service.initializeHighContrast();
      const painted = article.style.backgroundColor;
      turnHighContrastOff(harness.settings);

      expect(painted).toBe(DARK);
      expect(article.style.getPropertyValue('background-color')).toBe('rgb(1, 2, 3)');
      expect(article.style.getPropertyPriority('background-color')).toBe('important');
    });

    it('puts a property overridden twice back as it was', () => {
      // With no article around it, the backdrop is the plot -- here the SVG,
      // whose own CSS background is overridden as well.
      rebuild([{ fill: BAR_FILL }], {
        svgBackground: 'white',
        surround: pageAround('<p>Results</p><i data-chart></i>'),
      });

      harness.service.initializeHighContrast();

      expect(harness.svg.style.backgroundColor).toBe(DARK);

      turnHighContrastOff(harness.settings);

      expect(harness.svg.style.backgroundColor).toBe('white');
    });

    it('looks for what the page shows at every level up to the body', () => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: pageAround(
          '<main><p>Tips by day.</p><section><div class="cell"><div class="cell-output-display">'
          + '<i data-chart></i></div></div></section></main>',
        ),
      });

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['chart']);
    });

    it.each<[string, () => Node]>([
      ['a script', () => nodesOf('<script>var x = 1;</script>')],
      ['a style sheet', () => nodesOf('<style>p { color: red; }</style>')],
      ['a link to one', () => nodesOf('<link rel="stylesheet" href="page.css">')],
      ['a hidden element', () => nodesOf('<div hidden>Note</div>')],
      ['an element not displayed', () => nodesOf('<p style="display: none">Note</p>')],
      ['invisible text', () => nodesOf('<span style="visibility: hidden">Note</span>')],
      ['an empty status line', () => nodesOf('<p role="status"></p>')],
      ['a script in a wrapper', () => nodesOf('<div><script>var x = 1;</script></div>')],
      ['white space', () => nodesOf('\n    ')],
      ['a comment', () => nodesOf('<!-- chart -->')],
      ['a line break', () => nodesOf('<br>')],
      ['a link parked off the page', () => positionedLink(-10000, 0)],
      [
        'a shadow root of style sheets and an empty layer',
        () => shadowHost('<style>:host { position: fixed; }</style><div></div>'),
      ],
    ])('takes %s for nothing the page shows', (_, build) => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: () => document.body.prepend(build()),
      });

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['page']);
    });

    it.each<[string, () => Node]>([
      ['a line of text', () => nodesOf('Results')],
      ['a paragraph', () => nodesOf('<p>Results</p>')],
      ['an image', () => nodesOf('<img alt="">')],
      ['a button', () => nodesOf('<button></button>')],
      ['a canvas', () => nodesOf('<canvas></canvas>')],
      [
        'another chart',
        () => nodesOf('<div style="display: contents"><article id="maidr-article-other"><figure>'
          + '<div tabindex="0"><svg></svg></div></figure></article></div>'),
      ],
      ['a custom element', () => nodesOf('<my-banner></my-banner>')],
      ['a link placed on the page', () => positionedLink(16, 16)],
      ['text in a shadow root', () => shadowHost('<style>p { margin: 0; }</style><p>Results</p>')],
      ['text a shadow root slots in', () => shadowHost('<slot></slot>', 'Results')],
    ])('takes %s for something the page shows', (_, build) => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: () => document.body.prepend(build()),
      });

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['chart']);
    });

    /**
     * A page plotly.js drew one chart on: its title and legend layer and its
     * toolbar beside maidr's article in the `.svg-container`, and the SVG it
     * measures text in parked off the page, as `Plotly.newPlot` leaves it.
     */
    function plotlyPage(overlay: Element, before = ''): HarnessOptions {
      return {
        article: true,
        overlays: [overlay],
        surround: (chart) => {
          pageAround(
            `${before}<div id="graph" class="js-plotly-plot"><div class="plot-container plotly">`
            + '<div class="svg-container"><i data-chart></i></div></div></div>'
            + '<script>Plotly.newPlot("graph", data);</script>',
          )(chart);
          const modebar = document.createElement('div');
          modebar.className = 'modebar-container';
          modebar.innerHTML = '<div class="modebar"><a class="modebar-btn"><svg></svg></a></div>';
          chart.after(overlay, modebar);
          const tester = document.createElementNS(SVG_NAMESPACE, 'svg');
          tester.id = 'js-plotly-tester';
          tester.setAttribute(
            'style',
            'position: absolute; left: -10000px; top: -10000px; width: 9000px; height: 9000px',
          );
          placeAt(tester, -10000, -10000, 9000, 9000);
          document.body.appendChild(tester);
        },
      };
    }

    it('counts the layers Plotly draws beside the chart as the chart\'s own', () => {
      const overlay = document.createElementNS(SVG_NAMESPACE, 'svg');
      overlay.classList.add('main-svg');
      rebuild([{ fill: BAR_FILL }], plotlyPage(overlay));

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['page']);
    });

    it('paints only a Plotly chart on a page that shows more than it', () => {
      const overlay = document.createElementNS(SVG_NAMESPACE, 'svg');
      overlay.classList.add('main-svg');
      rebuild([{ fill: BAR_FILL }], plotlyPage(overlay, '<p>Tips by day.</p>'));

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['chart']);
    });

    it('decides again each time it paints', () => {
      rebuild([{ fill: BAR_FILL }], { article: true });
      const note = document.createElement('p');
      note.textContent = 'Updated hourly.';

      harness.service.initializeHighContrast();
      const alone = paintedBackdrops(harness.article);
      turnHighContrastOff(harness.settings);
      document.body.prepend(note);
      turnHighContrastOn(harness.settings);
      const shared = paintedBackdrops(harness.article);
      turnHighContrastOff(harness.settings);
      note.remove();
      turnHighContrastOn(harness.settings);
      const aloneAgain = paintedBackdrops(harness.article);

      expect(alone).toEqual(['page']);
      expect(shared).toEqual(['chart']);
      expect(aloneAgain).toEqual(['page']);
    });

    it('puts the page back although it gained content while painted', () => {
      rebuild([{ fill: BAR_FILL }], { article: true });

      harness.service.initializeHighContrast();
      document.body.prepend(nodesOf('<p>Updated hourly.</p>'));
      turnHighContrastOff(harness.settings);

      expect(document.body.style.backgroundColor).toBe('');
      expect(document.body.style.color).toBe('');
      expect(harness.article?.style.backgroundColor).toBe('');
    });

    it('keeps painting the chart, not the page, across a live update', () => {
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: pageAround('<h1>Results</h1><i data-chart></i>'),
      });
      const article = harness.article as HTMLElement;

      harness.service.initializeHighContrast();
      harness.service.setFigure(createFigure());

      expect(paintedBackdrops(article)).toEqual(['chart']);

      turnHighContrastOff(harness.settings);

      expect(document.body.style.backgroundColor).toBe('');
      expect(article.style.backgroundColor).toBe('');
      expect(article.style.color).toBe('');
    });

    it.each([
      [
        'an r-maidr page',
        '<div class="maidr-page"><i data-chart></i></div><script src="lib/maidr.js"></script>',
      ],
      [
        'a py-maidr notebook frame',
        '<div><script>(function () { run(); })();</script><div><i data-chart></i></div></div>',
      ],
      [
        'an htmlwidget page',
        '<div id="htmlwidget_container"><div class="html-widget"><i data-chart></i></div></div>'
        + '<script type="application/json" data-for="htmlwidget-1">{"x": {}}</script>'
        + '<script type="application/htmlwidget-sizing" data-for="htmlwidget-1">{}</script>',
      ],
      [
        'the maidr-mcp view while idle',
        '<div id="chart"><i data-chart></i></div><p id="status" role="status"></p>'
        + '<script type="module">connect();</script>',
      ],
    ])('paints the page of %s', (_, markup) => {
      rebuild([{ fill: BAR_FILL }], { article: true, surround: pageAround(markup) });

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['page']);
    });

    it('paints the page of a Bokeh chart', () => {
      // BokehJS 3 adds two empty fixed layers and its notification area to the
      // body, each drawing from an open shadow root that holds style sheets.
      rebuild([{ fill: BAR_FILL }], {
        article: true,
        surround: (chart) => {
          pageAround(
            '<div><script src="bokeh.min.js"></script><div id="maidr-bokeh-1">'
            + '<div id="maidr-bokeh-1-plot"><i data-chart></i></div></div>'
            + '<script>embed();</script></div>',
          )(chart);
          const notifications = shadowHost('<style>.bk-notification { color: red; }</style>');
          notifications.className = 'bk-Notifications';
          document.body.append(
            shadowHost('<style>:host { position: fixed; }</style><div></div>'),
            shadowHost('<style>:host { position: fixed; }</style>'),
            notifications,
          );
        },
      });

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['page']);
    });

    it.each([
      [
        'the maidr-mcp view with a notice',
        '<div id="chart"><i data-chart></i></div>'
        + '<p id="status" role="status">Chart updated: Tips by day.</p>',
      ],
      [
        'a Quarto page',
        '<header><h1>Tips</h1></header><main><div class="cell"><div class="cell-output-display">'
        + '<div class="maidr-inline"><i data-chart></i></div></div></div></main>',
      ],
      [
        'a reveal.js deck',
        '<div class="reveal"><div class="slides"><section><h2>Tips</h2><i data-chart></i>'
        + '</section></div></div>',
      ],
    ])('paints only the chart on %s', (_, markup) => {
      rebuild([{ fill: BAR_FILL }], { article: true, surround: pageAround(markup) });

      harness.service.initializeHighContrast();

      expect(paintedBackdrops(harness.article)).toEqual(['chart']);
    });
  });
});
