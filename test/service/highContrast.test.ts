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
 * An empty figure. The service only walks it to decide which elements belong
 * to a trace, and these tests assert on the page and on chart colours that do
 * not depend on that classification.
 */
function createFigure(traceElements: SVGElement[] = []): Figure {
  if (traceElements.length === 0) {
    const figure: Pick<Figure, 'subplots'> = { subplots: [] };
    return figure as unknown as Figure;
  }
  const trace = { getAllOriginalElements: (): SVGElement[] => traceElements };
  const figure = { subplots: [[{ traces: [[trace]] }]] };
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
  document.body.appendChild(plot);

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
    createFigure(options.traceType === undefined ? [] : marks),
    context as unknown as Context,
    () => overlays,
  );

  return { service, settings, marks, bar: marks[0], display, svg };
}

function turnHighContrastOff(settings: SettingsService): void {
  settings.saveSettings({
    ...settings.loadSettings(),
    general: { ...settings.loadSettings().general, highContrastMode: false },
  });
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
});
