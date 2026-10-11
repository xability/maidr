/**
 * @jest-environment jsdom
 */

/**
 * A chart's model is built from its own marks, whatever else is on the page.
 *
 * `Controller` builds the model when the reader moves into a chart, and every
 * selector the model reads was looked up across the whole page. A page holding
 * one output twice, or two Plotly charts -- whose selectors name no chart --
 * gave the second chart the first one's marks: its hidden copies went in
 * beside them, and its outline was drawn there. The controller now builds the
 * model inside the chart: its own element and the layers Plotly draws over it.
 *
 * Built on a real `Controller`, since what is under test is where it builds;
 * the Web Audio API and `hotkeys-js` are stubbed at the boundary, as the other
 * controller tests stub them.
 */

import type { Keys } from '@type/event';
import type { Maidr } from '@type/grammar';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { TraceType } from '@type/grammar';
import { Controller } from '../../src/controller';

jest.mock('hotkeys-js', () => {
  const hotkeys = (): void => {};
  hotkeys.setScope = (): void => {};
  hotkeys.unbind = (): void => {};
  hotkeys.deleteScope = (): void => {};
  hotkeys.filter = (): boolean => true;
  hotkeys.getScope = (): string => '';
  return { __esModule: true, default: hotkeys };
});

/** A Web Audio node that accepts every call the audio service makes of it. */
function audioNode(): Record<string, unknown> {
  const param = {
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    exponentialRampToValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
  };
  return {
    type: '',
    frequency: param,
    gain: param,
    pan: param,
    threshold: param,
    knee: param,
    ratio: param,
    attack: param,
    release: param,
    buffer: null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  };
}

/** A stand-in AudioContext, running from the start. */
function audioContext(): Record<string, unknown> {
  return {
    currentTime: 0,
    state: 'running',
    sampleRate: 44100,
    destination: {},
    createOscillator: audioNode,
    createGain: audioNode,
    createStereoPanner: audioNode,
    createDynamicsCompressor: audioNode,
    createConvolver: audioNode,
    createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
    createBufferSource: audioNode,
    resume: () => Promise.resolve(),
    close: jest.fn(),
  };
}

const realStructuredClone = globalThis.structuredClone;
const realGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  // jsdom has no canvas, and says so on the console each time high contrast
  // asks one to parse a chart's colours. A canvas that answers nothing is
  // what the service already handles.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
  globalThis.structuredClone = (<T>(value: T): T => JSON.parse(JSON.stringify(value)) as T) as typeof structuredClone;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext
    = function AudioContextStub(): Record<string, unknown> {
      return audioContext();
    } as unknown as typeof AudioContext;
});

afterAll(() => {
  globalThis.structuredClone = realStructuredClone;
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

/**
 * Three bars, each named by its own selector.
 * @param scope - What every selector starts with
 * @returns The chart's data
 */
function bars(scope: string): Maidr {
  const selectors = [1, 2, 3].map(n => `${scope} #bars rect:nth-child(${n})`);
  return {
    id: 'shown-twice',
    subplots: [[{
      layers: [{
        id: 'bars',
        type: TraceType.BAR,
        axes: { x: { label: 'Slot' }, y: { label: 'Value' } },
        data: [{ x: 'a', y: 1 }, { x: 'b', y: 3 }, { x: 'c', y: 2 }],
        selectors,
      }],
    }]],
  };
}

/** Three bars, in a group with the same id in every chart. */
const BARS = '<g id="bars"><rect/><rect/><rect/></g>';

/**
 * The same output on the page twice, each copy in an article of its own as
 * MAIDR wraps it.
 * @returns The second copy's plot element
 */
function shownTwice(): HTMLElement {
  document.body.innerHTML = ['first', 'second'].map(copy => `
    <article id="maidr-article-${copy}"><figure><div id="plot-${copy}">
      <svg xmlns="http://www.w3.org/2000/svg">${BARS}</svg>
    </div></figure></article>`).join('');
  return document.getElementById('plot-second') as HTMLElement;
}

/**
 * Two Plotly charts, each drawing its bars in the layer Plotly stacks over the
 * chart, outside MAIDR's article.
 * @returns The second chart's plot element
 */
function twoPlotlyCharts(): HTMLElement {
  document.body.innerHTML = ['first', 'second'].map(chart => `
    <div class="js-plotly-plot"><div class="svg-container">
      <article id="maidr-article-${chart}"><figure><div id="plot-${chart}">
        <svg class="main-svg"></svg>
      </div></figure></article>
      <svg class="main-svg"><g class="indicatorlayer">${BARS}</g></svg>
    </div></div>`).join('');
  return document.getElementById('plot-second') as HTMLElement;
}

/**
 * What MAIDR has made inside and outside a chart's region.
 * @param region - Everything on the page that belongs to the chart
 * @returns How many of its elements are in the region, and how many are not
 */
function owned(region: Element): { inside: number; outside: number } {
  const all = Array.from(document.querySelectorAll('[data-maidr-owned]'));
  const inside = all.filter(element => region.contains(element)).length;
  return { inside, outside: all.length - inside };
}

let controller: Controller | null = null;

/**
 * Builds a controller on a chart, as moving into it does.
 * @param maidr - The chart's data
 * @param plot - The chart's plot element
 * @returns The controller
 */
function enterChart(maidr: Maidr, plot: HTMLElement): Controller {
  controller = new Controller(maidr, plot, createMaidrStore());
  return controller;
}

/**
 * Moves right once, as the keyboard does.
 * @param reading - The controller of the chart being read
 */
function moveRight(reading: Controller): void {
  // `Keys` is the keys every scope shares, which is none: cast, as the
  // executor's own callers do.
  reading.getContextValue().commandExecutor.executeCommand('MOVE_RIGHT' as Keys);
}

// A selector resolved outside its chart warns. Silenced for the file, and
// read by the case that must not need it.
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  controller?.dispose();
  controller = null;
  document.body.innerHTML = '';
  consoleWarn.mockClear();
});

afterAll(() => {
  consoleWarn.mockRestore();
});

describe('Controller builds a chart from its own marks', () => {
  it('should leave the first copy of an output alone when the second is read', () => {
    const plot = shownTwice();
    const article = plot.closest('article') as Element;

    moveRight(enterChart(bars('svg'), plot));

    expect(owned(article).outside).toBe(0);
    expect(owned(article).inside).toBeGreaterThan(0);
  });

  it('should keep to the second copy when its data is replaced', () => {
    const plot = shownTwice();
    const article = plot.closest('article') as Element;
    const reading = enterChart(bars('svg'), plot);

    reading.updateData(bars('svg'));

    expect(owned(article).outside).toBe(0);
    expect(owned(article).inside).toBeGreaterThan(0);
  });

  it('should find a Plotly chart\'s marks in the layer drawn over it, not another chart\'s', () => {
    const plot = twoPlotlyCharts();
    const graph = plot.closest('.js-plotly-plot') as Element;

    moveRight(enterChart(bars('.indicatorlayer'), plot));

    expect(owned(graph).outside).toBe(0);
    expect(owned(graph).inside).toBeGreaterThan(0);
    // Found among the chart's own layers, not on the rest of the page.
    expect(consoleWarn.mock.calls.flat().join('\n')).not.toContain('matches nothing inside its chart');
  });
});
