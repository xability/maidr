/**
 * @jest-environment jsdom
 */

/**
 * The panel outline `HighlightService` draws reads py-maidr's figure
 * background from the page, which the outline's colour is measured against
 * when a panel is transparent. It used to be read from the whole page, so a
 * figure measured its outline against the first chart's background. Each
 * chart is read inside the elements it is drawn in now.
 *
 * The panel itself is whatever the model names: a shape is stroked, as a
 * matplotlib axes' background patch always was, and anything else gets a box
 * drawn round it. The service used to outline a panel only where the chart
 * had more than one matplotlib axes group, so the lobby of every other
 * producer's figure showed nothing.
 *
 * In high contrast every mark is painted from the reader's palette, so the
 * highlight is drawn in the reader's highlight colour as it is: a colour
 * derived from a mark painted the palette's white was a grey, the dimmest
 * label on the dark page rather than the one the reader was on.
 */

import type { SettingsService } from '@service/settings';
import type { SubplotState, TraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HighlightService } from '@service/highlight';
import { DEFAULT_SETTINGS } from '@type/settings';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** What a settings change hands its listeners. */
type SettingsChange = Parameters<Parameters<SettingsService['onChange']>[0]>[0];

/**
 * The default settings, copied so a test can change them.
 * @param highContrastMode - Whether high contrast is on
 * @returns The settings
 */
function defaults(highContrastMode = false): typeof DEFAULT_SETTINGS {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
  settings.general.highContrastMode = highContrastMode;
  return settings;
}

/**
 * A settings service that answers with the defaults and never changes.
 * @param highContrastMode - Whether high contrast is on
 * @param listen - Handed each listener the service subscribes
 * @returns The stand-in
 */
function settingsStub(
  highContrastMode = false,
  listen: (listener: (event: SettingsChange) => void) => void = () => {},
): SettingsService {
  const stub: Pick<SettingsService, 'loadSettings' | 'onChange'> = {
    loadSettings: () => defaults(highContrastMode),
    onChange: (listener) => {
      listen(listener);
      return { dispose: () => {} };
    },
  };
  return stub as SettingsService;
}

/**
 * Adds one chart to the page as py-maidr draws it: a figure group holding the
 * figure background, then one transparent group per panel.
 * @param name - What makes the chart's ids its own
 * @param panels - How many panels it has
 * @param background - The figure background's fill
 * @returns The chart's plot element
 */
function addChart(name: string, panels: number, background: string): HTMLElement {
  const plot = document.createElement('div');
  const axes = Array.from({ length: panels }, (_, i) =>
    `<g id="axes_${i + 1}-${name}"><path style="fill: none"/></g>`).join('');
  plot.innerHTML = `<svg xmlns="${SVG_NAMESPACE}"><g id="figure_1-${name}">`
    + `<g id="maidr-figure-${name}"><path style="fill: ${background}"/></g>${axes}</g></svg>`;
  document.body.appendChild(plot);
  return plot;
}

/**
 * The state of a subplot whose outline is the given panel.
 * @param panel - The panel, or the background shape it is outlined along
 * @returns The state
 */
function onPanel(panel: Element): SubplotState {
  return {
    empty: false,
    type: 'subplot',
    size: 1,
    index: 1,
    trace: {} as TraceState,
    highlight: { empty: false, elements: panel },
  };
}

/**
 * Moves onto the first panel of a chart, its background shape, and reads the
 * outline drawn there.
 * @param plot - The chart's plot element
 * @param overlays - The chart's layers drawn outside its plot element
 * @returns The outline's stroke, or null when the panel is not outlined
 */
function outlineOfFirstPanel(plot: HTMLElement, overlays: Element[] = []): string | null {
  const service = new HighlightService(settingsStub(), () => [plot, ...overlays]);
  const background = plot.querySelector('g[id^="axes_"] path') as SVGElement;

  service.update(onPanel(background));

  const stroke = background.hasAttribute('data-maidr-orig-stroke') ? background.getAttribute('stroke') : null;
  service.dispose();
  return stroke;
}

/**
 * Gives an element a box on the page, which jsdom, laying nothing out, does
 * not.
 * @param element - The element
 * @param box - Its box
 * @param box.left - Its left edge
 * @param box.top - Its top edge
 * @param box.width - Its width
 * @param box.height - Its height
 */
function placeAt(element: Element, box: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height }),
    configurable: true,
  });
}

/**
 * The boxes MAIDR has drawn round panels on the page.
 * @returns Them, in document order
 */
function panelBoxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('div[data-maidr-owned]'));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('HighlightService outlining a panel', () => {
  it('should stroke a panel\'s background shape', () => {
    const plot = addChart('mB', 2, '#ffffff');

    const stroke = outlineOfFirstPanel(plot);

    expect(stroke).not.toBeNull();
  });

  it('should measure the outline against the chart\'s own figure background', () => {
    const alone = outlineOfFirstPanel(addChart('mB', 2, '#ffffff'));
    document.body.innerHTML = '';
    addChart('mA', 1, '#000000');
    const plot = addChart('mB', 2, '#ffffff');

    const beside = outlineOfFirstPanel(plot);

    expect(beside).not.toBeNull();
    expect(beside).toBe(alone);
  });

  it('should draw a box round a panel with no background of its own', () => {
    // A D3 panel's group holds its bars and nothing behind them; stroking
    // its first rect outlined the first bar.
    document.body.innerHTML = `<div id="plot"><svg xmlns="${SVG_NAMESPACE}">`
      + `<g class="panel"><rect class="bar" style="fill: #1f77b4"/></g></svg></div>`;
    const plot = document.getElementById('plot') as HTMLElement;
    const panel = plot.querySelector('g.panel') as SVGElement;
    placeAt(panel, { left: 40, top: 30, width: 200, height: 120 });
    const service = new HighlightService(settingsStub(), () => [plot]);

    service.update(onPanel(panel));

    const [box] = panelBoxes();
    expect(box).toBeDefined();
    expect(box.parentElement).toBe(plot);
    // Outside the panel by its 4px border and a 2px gap, so the border
    // covers none of the marks drawn at the panel's edge.
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['34px', '24px', '212px', '132px']);
    expect(box.style.pointerEvents).toBe('none');
    expect(box.getAttribute('aria-hidden')).toBe('true');
    // The chart's own marks are left as they were drawn.
    expect(panel.querySelector('rect')?.hasAttribute('stroke')).toBe(false);
    service.dispose();
  });

  it('should draw a box round a panel named by an HTML element laid over a canvas', () => {
    document.body.innerHTML = '<div id="plot"><canvas></canvas><div id="panel-1" style="visibility: hidden"></div></div>';
    const plot = document.getElementById('plot') as HTMLElement;
    const panel = document.getElementById('panel-1') as HTMLElement;
    placeAt(panel, { left: 10, top: 20, width: 300, height: 150 });
    const service = new HighlightService(settingsStub(), () => [plot]);

    service.update(onPanel(panel));

    expect(panelBoxes()).toHaveLength(1);
    expect(panelBoxes()[0].style.width).toBe('312px');
    service.dispose();
  });

  it('should take the box away when the reader moves to the next panel, and when the panel is left', () => {
    document.body.innerHTML = `<div id="plot"><svg xmlns="${SVG_NAMESPACE}"><g id="p1"></g><g id="p2"></g></svg></div>`;
    const plot = document.getElementById('plot') as HTMLElement;
    const [first, second] = ['p1', 'p2'].map(id => document.getElementById(id) as unknown as SVGElement);
    placeAt(first, { left: 0, top: 0, width: 100, height: 100 });
    placeAt(second, { left: 0, top: 120, width: 100, height: 100 });
    const service = new HighlightService(settingsStub(), () => [plot]);

    service.update(onPanel(first));
    service.update(onPanel(second));

    expect(panelBoxes()).toHaveLength(1);
    expect(panelBoxes()[0].style.top).toBe('114px');

    service.dispose();

    expect(panelBoxes()).toHaveLength(0);
  });

  it('should clear the outline when a state names no panel', () => {
    const plot = addChart('mB', 2, '#ffffff');
    const background = plot.querySelector('g[id^="axes_"] path') as SVGElement;
    const service = new HighlightService(settingsStub(), () => [plot]);
    service.update(onPanel(background));

    service.update({
      empty: false,
      type: 'subplot',
      size: 1,
      index: 1,
      trace: {} as TraceState,
      highlight: { empty: true, type: 'trace', audio: { x: 0, y: 0, rows: 1, cols: 1 } },
    });

    expect(background.hasAttribute('data-maidr-orig-stroke')).toBe(false);
    service.dispose();
  });
});

describe('HighlightService when an outlined panel is resized', () => {
  // jsdom has no ResizeObserver, so one that only records is put in its
  // place, and its callback is called as a browser would after laying the
  // chart out again.
  const watchers: { callback: ResizeObserverCallback; watched: Element[] }[] = [];
  const realResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    watchers.length = 0;
    class RecordingResizeObserver {
      private readonly watcher: { callback: ResizeObserverCallback; watched: Element[] };

      public constructor(callback: ResizeObserverCallback) {
        this.watcher = { callback, watched: [] };
        watchers.push(this.watcher);
      }

      public observe(element: Element): void {
        this.watcher.watched.push(element);
      }

      public unobserve(): void {}

      public disconnect(): void {
        this.watcher.watched.length = 0;
      }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { value: RecordingResizeObserver, configurable: true, writable: true });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'ResizeObserver', { value: realResizeObserver, configurable: true, writable: true });
  });

  /**
   * Outlines a panel with no background of its own, which gets a box.
   * @returns The service, the chart and the panel
   */
  function outlineOnePanel(): { service: HighlightService; plot: HTMLElement; panel: SVGElement } {
    document.body.innerHTML = `<div id="plot"><svg xmlns="${SVG_NAMESPACE}">`
      + `<g class="panel"><rect class="bar" style="fill: #1f77b4"/></g></svg></div>`;
    const plot = document.getElementById('plot') as HTMLElement;
    const panel = plot.querySelector('g.panel') as SVGElement;
    placeAt(panel, { left: 40, top: 30, width: 200, height: 120 });
    const service = new HighlightService(settingsStub(), () => [plot]);
    service.update(onPanel(panel));
    return { service, plot, panel };
  }

  /** What every live watcher is watching. */
  function watched(): Element[] {
    return watchers.flatMap(watcher => watcher.watched);
  }

  it('should draw the box again where the panel is now', () => {
    // A box is placed from where its panel is when it is drawn. A responsive
    // chart laid out again at another size, as on a zoom, moves its panels.
    const { service, plot, panel } = outlineOnePanel();

    placeAt(panel, { left: 40, top: 230, width: 400, height: 240 });
    watchers.filter(watcher => watcher.watched.length > 0).forEach(watcher => watcher.callback([], {} as ResizeObserver));

    const [box] = panelBoxes();
    expect(watched()).toEqual(expect.arrayContaining([panel, plot]));
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['34px', '224px', '412px', '252px']);
    service.dispose();
  });

  it('should stop watching once the outline is gone', () => {
    const { service } = outlineOnePanel();

    service.dispose();

    expect(watched()).toEqual([]);
    expect(panelBoxes()).toHaveLength(0);
  });
});

describe('HighlightService in high contrast', () => {
  /**
   * Puts a label high contrast has painted white on the page.
   * @returns The label
   */
  function addWhiteLabel(): SVGElement {
    document.body.innerHTML = `<div><svg xmlns="${SVG_NAMESPACE}"><text style="fill: #ffffff">Ship</text></svg></div>`;
    return document.querySelector('text') as SVGElement;
  }

  it('should draw a mark the palette painted light in the reader\'s highlight colour', () => {
    const label = addWhiteLabel();
    const service = new HighlightService(settingsStub(true), () => [document.body]);

    service.highlight(label);

    const highlight = label.nextElementSibling as SVGElement;
    expect(highlight.getAttribute('fill')).toBe(DEFAULT_SETTINGS.general.highlightColor);
    expect(highlight.style.fill).toBe(DEFAULT_SETTINGS.general.highlightColor);
    service.dispose();
  });

  it('should derive the colour from a light mark outside high contrast', () => {
    const label = addWhiteLabel();
    const service = new HighlightService(settingsStub(false), () => [document.body]);

    service.highlight(label);

    const highlight = label.nextElementSibling as SVGElement;
    expect(highlight.getAttribute('fill')).not.toBe(DEFAULT_SETTINGS.general.highlightColor);
    service.dispose();
  });

  it('should follow high contrast as it is turned on', () => {
    const label = addWhiteLabel();
    let changed: (event: SettingsChange) => void = () => {};
    const service = new HighlightService(
      settingsStub(false, (listener) => {
        changed = listener;
      }),
      () => [document.body],
    );

    changed({ newSettings: defaults(true) } as Pick<SettingsChange, 'newSettings'> as SettingsChange);
    service.highlight(label);

    const highlight = label.nextElementSibling as SVGElement;
    expect(highlight.getAttribute('fill')).toBe(DEFAULT_SETTINGS.general.highlightColor);
    service.dispose();
  });
});

describe('HighlightService redraw', () => {
  /**
   * A settings service whose settings a test can change, handing each change
   * to the listener the service subscribed.
   * @returns The stand-in, the settings it answers with, and a way to save
   */
  function liveSettings(): { settings: SettingsService; current: typeof DEFAULT_SETTINGS; save: () => void } {
    const current = defaults(true);
    let listener: (event: SettingsChange) => void = () => {};
    const stub: Pick<SettingsService, 'loadSettings' | 'onChange'> = {
      loadSettings: () => current,
      onChange: (subscribed) => {
        listener = subscribed;
        return { dispose: () => {} };
      },
    };
    const save = (): void => listener({ newSettings: current } as Pick<SettingsChange, 'newSettings'> as SettingsChange);
    return { settings: stub as SettingsService, current, save };
  }

  /**
   * Puts a node on the page as Graphviz draws one: a group holding its shape
   * and its label.
   * @returns The node
   */
  function addNode(): SVGElement {
    document.body.innerHTML = `<div><svg xmlns="${SVG_NAMESPACE}"><g class="node">`
      + '<polygon style="fill: none; stroke: #000000"/><text style="fill: #000000">Browser</text></g></svg></div>';
    return document.querySelector('g.node') as SVGElement;
  }

  /** Every highlight on the page. */
  const highlights = (): Element[] => Array.from(document.querySelectorAll('[id^="maidr-highlight"]'));

  it('should copy the node again as it is painted now', () => {
    const node = addNode();
    const service = new HighlightService(settingsStub(), () => [document.body]);
    service.highlight(node);

    (node.querySelector('text') as SVGElement).style.fill = '#ffffff';
    service.redraw();

    expect(highlights()).toHaveLength(1);
    expect((highlights()[0].querySelector('text') as SVGElement).style.fill).toBe('#ffffff');
    service.dispose();
    expect(highlights()).toHaveLength(0);
  });

  it('should keep the highlight of a mark a live update replaced until the next move', () => {
    // A live update replaces the marks without telling the service and keeps
    // the reader's place; dropping the copy on a repaint left that place
    // unmarked until they moved.
    const node = addNode();
    const service = new HighlightService(settingsStub(), () => [document.body]);
    service.highlight(node);
    node.remove();

    expect(() => service.redraw()).not.toThrow();

    expect(highlights()).toHaveLength(1);
    service.dispose();
    expect(highlights()).toHaveLength(0);
  });

  it('should outline a panel again against the figure background as it is now', () => {
    const plot = addChart('a', 2, 'rgb(255, 255, 255)');
    const service = new HighlightService(settingsStub(), () => [plot]);
    const outline = plot.querySelector('g[id^="axes_"] path') as SVGElement;
    service.update(onPanel(outline));
    const onWhite = outline.getAttribute('stroke');

    (plot.querySelector('g[id^="maidr-"] > path') as SVGElement).style.fill = 'rgb(0, 0, 0)';
    service.redraw();

    expect(outline.getAttribute('stroke')).not.toBe(onWhite);
    expect(outline.getAttribute('stroke')).toBe(DEFAULT_SETTINGS.general.highlightColor);
    expect(outline.getAttribute('data-maidr-orig-stroke')).toBe('');
    service.dispose();
  });

  it('should draw the highlight again in a highlight colour the reader saves', () => {
    const label = document.createElementNS(SVG_NAMESPACE, 'text');
    label.setAttribute('style', 'fill: #ffffff');
    document.body.innerHTML = `<div><svg xmlns="${SVG_NAMESPACE}"></svg></div>`;
    document.querySelector('svg')?.appendChild(label);
    const { settings, current, save } = liveSettings();
    const service = new HighlightService(settings, () => [document.body]);
    service.highlight(label);

    current.general.highlightColor = '#ff00ff';
    save();

    expect(highlights()).toHaveLength(1);
    expect(highlights()[0].getAttribute('fill')).toBe('#ff00ff');
    service.dispose();
  });
});

describe('HighlightService and the labels drawn over a mark', () => {
  /**
   * Puts a gantt task on the page as Mermaid draws one, a red rectangle with
   * its white label after it, and gives both a box on screen, which jsdom
   * lays out for nothing.
   * @returns The task and its label
   */
  function addCriticalTask(): { task: SVGElement; label: SVGElement } {
    document.body.innerHTML = `<div><svg xmlns="${SVG_NAMESPACE}"><g>`
      + '<rect id="task" style="fill: #ff0000"/><text id="label" style="fill: #ffffff">Adapter</text></g></svg></div>';
    const boxes: Record<string, [number, number, number, number]> = { task: [0, 0, 100, 20], label: [40, 4, 30, 12] };
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const [left, top, width, height] = boxes[this.id] ?? [0, 0, 0, 0];
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    });
    return {
      task: document.getElementById('task') as unknown as SVGElement,
      label: document.getElementById('label') as unknown as SVGElement,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should copy a label the highlight would leave unreadable, and take it away with the highlight', () => {
    const { task, label } = addCriticalTask();
    const service = new HighlightService(settingsStub(), () => [document.body]);

    service.highlight(task);

    const copy = label.nextElementSibling as SVGElement;
    expect(copy.textContent).toBe('Adapter');
    expect(copy.style.getPropertyValue('fill')).toBe('#000000');

    service.unhighlight(task);

    expect(document.querySelectorAll('text')).toHaveLength(1);
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
    service.dispose();
  });

  it('should colour the copy from the reader\'s high contrast pair', () => {
    const { task, label } = addCriticalTask();
    const settings = settingsStub(true);
    const { general } = settings.loadSettings();
    const service = new HighlightService(settings, () => [document.body]);

    service.highlight(task);

    // Black on the highlight green, of the default pair's white and black.
    expect((label.nextElementSibling as SVGElement).style.getPropertyValue('fill'))
      .toBe(general.highContrastDarkColor);
    service.dispose();
    expect(document.querySelectorAll('text')).toHaveLength(1);
  });

  it('should draw the copy again with the highlight', () => {
    const { task } = addCriticalTask();
    const service = new HighlightService(settingsStub(), () => [document.body]);
    service.highlight(task);

    service.redraw();

    expect(document.querySelectorAll('text')).toHaveLength(2);
    service.dispose();
    expect(document.querySelectorAll('text')).toHaveLength(1);
  });
});
