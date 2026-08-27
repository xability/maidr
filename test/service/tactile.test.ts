/**
 * @jest-environment jsdom
 */

/**
 * Tests for `src/service/tactile.ts`, the wiring that puts a chart on a DotPad.
 *
 * Everything else in the tactile feature — the rasteriser, the packer, the
 * braille table — fails loudly when it is wrong: a payload comes out the wrong
 * length, a pin lands in the wrong cell, a unit test goes red. This service is
 * the one piece that fails **silently**. It owns four subscriptions and one
 * cache, and every one of them breaks the same way if it is dropped: no
 * exception, no log line, no failed assertion anywhere in the suite — just a
 * display that stops changing while the audio and the speech carry on as
 * normal. A sighted developer running the app sees nothing at all, and the only
 * person who can detect the regression is a reader with a £3,000 device in
 * front of them who no longer trusts what it is showing.
 *
 * So the cases here pin the seams rather than the drawing:
 *
 * - The braille toggle is the display's on/off switch. `b` has to raise the
 *   pins and `b` again has to lower them, because the whole point of mirroring
 *   braille mode is that the reader has one switch, not two. If the
 *   `onToggle` subscription is dropped the display simply never comes up.
 * - Navigation has to redraw, and an unchanged picture has to **not** redraw.
 *   A full frame costs the device a second or more, so a redundant frame is not
 *   a wasted write, it is a device that lags a second behind the reader's
 *   fingers and stays there.
 * - The twenty-cell text line carries the focused value, and a model with no
 *   text line at all (`textCells: 0`) must not be written to.
 * - Zoom and pan have to announce, including when they refuse, because a
 *   zoomed view has no visible frame to say which slice of the chart it shows.
 *   A silent refusal is indistinguishable from a broken display.
 * - `dispose()` must release the subscriptions and must **not** disconnect the
 *   device. The controller disposes this service on every focus-out, and
 *   reconnecting a DotPad needs a user gesture that cannot be asked for
 *   mid-session — so a `disconnect()` here would make the feature unusable
 *   after the first time the reader tabbed away. That assertion is the reason
 *   this file exists as much as any of the others.
 *
 * Both hardware and geometry are mocked at their boundary. `dotPadSession` is
 * replaced by a fake that keeps the listeners it is handed, so a key press or a
 * connection change can be fired from a test; jsdom has no SVG layout engine,
 * so `TactileSvgGeometry.ringsOf` returns hand-written rings and every
 * `getBoundingClientRect` is stubbed per element — jsdom answers zero for all
 * of them, and the service treats a zero-sized region as un-renderable, so
 * without the stubs every case here would pass by drawing nothing.
 */

import type { Figure } from '@model/plot';
import type { BrailleService } from '@service/braille';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { Disposable } from '@type/disposable';
import type { DotPadGeometry, DotPadKey, DotPadState } from '@type/dotPad';
import type { FigureState, NonEmptyTraceState, SubplotState, TraceState } from '@type/state';
import type { DotRing } from '@util/tactile/svgGeometry';
import type { TactileViewport } from '@util/tactile/viewport';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { dotPadSession } from '@service/dotPadSession';
import { TactileService } from '@service/tactile';
import { Emitter } from '@type/event';
import { TactileBraille } from '@util/tactile/brailleText';
import { DotPack } from '@util/tactile/pack';
import { TactileSvgGeometry } from '@util/tactile/svgGeometry';

jest.mock('@service/dotPadSession', () => {
  const keyListeners = new Set<(key: DotPadKey) => void>();
  const stateListeners = new Set<(state: DotPadState) => void>();
  const writeFailureListeners = new Set<() => void>();

  return {
    dotPadSession: {
      isConnected: false,
      geometry: null,
      current: {
        status: 'disconnected',
        deviceName: null,
        geometry: null,
        message: '',
      },
      onKey: jest.fn((listener: (key: DotPadKey) => void): Disposable => {
        keyListeners.add(listener);
        return { dispose: () => {
          keyListeners.delete(listener);
        } };
      }),
      onStateChange: jest.fn((listener: (state: DotPadState) => void): Disposable => {
        stateListeners.add(listener);
        return { dispose: () => {
          stateListeners.delete(listener);
        } };
      }),
      onWriteFailure: jest.fn((listener: () => void): Disposable => {
        writeFailureListeners.add(listener);
        return { dispose: () => {
          writeFailureListeners.delete(listener);
        } };
      }),
      writeGraphic: jest.fn(),
      writeGraphicRow: jest.fn(),
      writeText: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      adopt: jest.fn(async (): Promise<boolean> => false),
      releaseIfAdopted: jest.fn(),
      canTranslate: false,
      translate: jest.fn(async (_text: string): Promise<string | null> => null),
      fireKey: (key: DotPadKey): void => {
        for (const listener of Array.from(keyListeners)) {
          listener(key);
        }
      },
      fireState: (state: DotPadState): void => {
        for (const listener of Array.from(stateListeners)) {
          listener(state);
        }
      },
      fireWriteFailure: (): void => {
        for (const listener of Array.from(writeFailureListeners)) {
          listener();
        }
      },
    },
  };
});

jest.mock('@util/tactile/svgGeometry', () => {
  // Only `ringsOf` is stubbed, because it needs `getScreenCTM` and the SVG
  // geometry interfaces jsdom does not implement. The two sifts are the real
  // ones: which of a chart's shapes reach the pins is a question the service
  // answers by walking a subtree, so stubbing them to keep everything would
  // leave "the fallback drew the chart and not the box around it" untestable
  // here — and that sentence is only true of the service, not of either sift
  // on its own.
  const actual = jest.requireActual<typeof import('@util/tactile/svgGeometry')>(
    '@util/tactile/svgGeometry',
  );
  return {
    TactileSvgGeometry: {
      isRenderable: actual.TactileSvgGeometry.isRenderable.bind(actual.TactileSvgGeometry),
      ringsOf: jest.fn(() => []),
      withoutPanel: actual.TactileSvgGeometry.withoutPanel.bind(actual.TactileSvgGeometry),
    },
  };
});

/**
 * The fake session's surface, including the two helpers that let a test act as
 * the device.
 */
interface FakeSession {
  isConnected: boolean;
  geometry: DotPadGeometry | null;
  canTranslate: boolean;
  translate: jest.Mock<(text: string) => Promise<string | null>>;
  current: DotPadState;
  writeGraphic: jest.Mock<(hex: string) => void>;
  writeGraphicRow: jest.Mock<(cellRow: number, hex: string) => void>;
  writeText: jest.Mock<(hex: string) => void>;
  disconnect: jest.Mock<() => void>;
  adopt: jest.Mock<() => Promise<boolean>>;
  releaseIfAdopted: jest.Mock<() => void>;
  fireKey: (key: DotPadKey) => void;
  fireState: (state: DotPadState) => void;
  fireWriteFailure: () => void;
}

const session = dotPadSession as unknown as FakeSession;
const ringsOf = TactileSvgGeometry.ringsOf as jest.Mock<
  (element: SVGGraphicsElement, viewport: TactileViewport) => DotRing[]
>;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * A DotPad 320: twenty cells across, ten down, and a twenty-cell text line.
 */
const GEOMETRY: DotPadGeometry = {
  cellColumns: 20,
  cellRows: 10,
  textCells: 20,
  dotWidth: 40,
  dotHeight: 40,
};

/**
 * The chart region in client pixels. Every mark below sits inside it.
 */
const REGION = { left: 0, top: 0, width: 200, height: 100 };

/**
 * The marks' client rectangles: one in each corner and one in the middle,
 * chosen so their combined extent is exactly {@link REGION}. That is the rect
 * the service maps onto the pins — the marks' own extent, not the plot
 * region's — so making the two coincide keeps the zoom and pan positions in
 * these tests readable as fractions of the chart.
 */
const MARK_RECTS = [
  { left: 0, top: 0, width: 10, height: 10 },
  { left: 95, top: 45, width: 10, height: 10 },
  { left: 190, top: 90, width: 10, height: 10 },
];

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The chart under test: the plot container the display service exposes, its
 * SVG, the axes group that bounds the region drawn, and the marks in it.
 */
interface Chart {
  plot: HTMLElement;
  svg: SVGSVGElement;
  axes: SVGElement;
  marks: SVGElement[];
}

/**
 * Gives an element a bounding box, which jsdom otherwise reports as all zeros.
 * @param element - The element to measure
 * @param rect - The box to report
 */
function stubRect(element: Element, rect: Rect): void {
  const box: DOMRect = {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    toJSON: () => ({}),
  };
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => box,
    configurable: true,
  });
}

/**
 * The mark's own rectangle, projected through the viewport.
 *
 * Stands in for the real `ringsOf`, which needs `getScreenCTM`. Going through
 * the viewport rather than returning fixed dot coordinates is what makes zoom
 * and pan visible in the frame: a stub that ignores the viewport draws the same
 * pins at every zoom level, and a test asserting that zooming redraws then
 * passes on a service that never redrew.
 *
 * @param element - The mark being reduced
 * @param viewport - The active zoom and pan
 */
function ringFor(element: SVGGraphicsElement, viewport: TactileViewport): DotRing[] {
  const box = element.getBoundingClientRect();
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  return [{
    points: [
      viewport.toDot(box.left, box.top),
      viewport.toDot(right, box.top),
      viewport.toDot(right, bottom),
      viewport.toDot(box.left, bottom),
    ],
    closed: true,
  }];
}

/**
 * Builds a chart: a plot container holding an SVG, whose axes group holds three
 * marks.
 */
function createChart(): Chart {
  const plot = document.createElement('div');
  const svg = document.createElementNS(SVG_NS, 'svg');
  const axes = document.createElementNS(SVG_NS, 'g');
  plot.append(svg);
  svg.append(axes);

  const marks = MARK_RECTS.map((rect, index) => {
    const mark = document.createElementNS(SVG_NS, 'rect');
    mark.setAttribute('data-index', String(index));
    stubRect(mark, rect);
    axes.append(mark);
    return mark;
  });

  stubRect(svg, REGION);
  stubRect(axes, REGION);
  return { plot, svg, axes, marks };
}

/**
 * Adds to a chart the things a plotting library draws around the data: the four
 * axis spines, a tick mark, and the plot background.
 *
 * Given real bounding boxes, because the point of the test using this is that
 * they are measurable and still do not reach the pins.
 *
 * @param on - The chart to furnish
 */
function addFurniture(on: Chart): void {
  const furniture: [string, string, Rect][] = [
    ['rect', 'patch_2', REGION],
    ['path', 'patch_6', { left: 0, top: 0, width: 0, height: 100 }],
    ['path', 'patch_7', { left: 200, top: 0, width: 0, height: 100 }],
    ['path', 'patch_8', { left: 0, top: 100, width: 200, height: 0 }],
    ['path', 'patch_9', { left: 0, top: 0, width: 200, height: 0 }],
    ['line', 'xtick_1', { left: 100, top: 100, width: 0, height: 4 }],
  ];
  for (const [tag, id, rect] of furniture) {
    const element = document.createElementNS(SVG_NS, tag);
    element.setAttribute('id', id);
    stubRect(element, rect);
    on.axes.append(element);
  }
}

/**
 * The two ways a trace can be asked for its elements.
 *
 * Both are on the real `Trace`, and only one of them is right here.
 * `getAllHighlightElements` returns the trace's highlight values as they are.
 * `getAllOriginalElements` walks each one to its `previousElementSibling`,
 * which is the mark only for traces whose highlight values are hidden clones
 * inserted after it — and twenty call sites across box, heatmap, line, violin
 * and bar select with `shouldClone: false` and hold the live element itself.
 * For those, the sibling is the neighbouring mark and the list comes back
 * shifted. The stub reproduces that so a switch back to the wrong accessor
 * fails here rather than on a reader's display.
 */
interface FakeTrace {
  getAllHighlightElements: () => SVGElement[];
  getAllOriginalElements: () => SVGElement[];

  /**
   * What the trace itself drew, when that is not the same thing as its
   * highlight markers. A line synthesises one marker per vertex out of its
   * rendered path, so its markers are the points and the path is the shape.
   */
  getGeometryElements?: () => SVGElement[];
}

/**
 * A subplot stub whose active layer can be changed, as PageUp changes it.
 */
interface FakeSubplot {
  axesElement: SVGElement | null;
  traces: FakeTrace[][];
  activeTrace: FakeTrace | null;
}

/**
 * A figure whose active subplot points at the given axes element and holds one
 * trace per layer, starting on the first.
 *
 * The marks matter more than the axes element does: the service asks the model
 * which elements are the data rather than sifting the DOM for them, so this is
 * where the chart it draws comes from. Passing a layer with no marks is how a
 * test reaches the fallback that walks the region instead.
 *
 * @param axesElement - The axes group, or null to fall back to the whole SVG
 * @param layers - Each layer's own highlight markers
 * @param geometry - Each layer's own drawn shape, where it has one distinct
 * from its markers; omitted layers offer none and fall back to their markers
 */
function createFigure(
  axesElement: SVGElement | null,
  layers: SVGElement[][] = [[]],
  geometry: SVGElement[][] = [],
): Figure {
  const traces = layers.map((marks, layer) => [{
    getAllHighlightElements: () => marks,
    getAllOriginalElements: () => marks
      .map(mark => mark.previousElementSibling as SVGElement | null)
      .filter((mark): mark is SVGElement => mark !== null),
    getGeometryElements: () => geometry[layer] ?? [],
  }]);
  const subplot: FakeSubplot = {
    axesElement,
    traces,
    activeTrace: traces[0]?.[0] ?? null,
  };
  return { activeSubplot: subplot } as unknown as Figure;
}

/**
 * Moves a figure onto another layer, the way PageUp does.
 * @param figure - The figure to move
 * @param layer - Index of the layer to make active
 */
function switchLayer(figure: Figure, layer: number): void {
  const subplot = (figure as unknown as { activeSubplot: FakeSubplot }).activeSubplot;
  subplot.activeTrace = subplot.traces[layer][0];
}

/**
 * A trace state focused on one mark, carrying one pair of values.
 * @param chart - The chart the marks belong to
 * @param focus - Index of the focused mark
 * @param main - Main-axis value for the text line
 * @param cross - Cross-axis value for the text line
 */
function traceState(
  chart: Chart,
  focus: number,
  main: string = 'a',
  cross: number = 12,
  traceType: string = 'bar',
): NonEmptyTraceState {
  return {
    empty: false,
    type: 'trace',
    traceType,
    text: {
      main: { label: 'x', value: main },
      cross: { label: 'y', value: cross },
    },
    highlight: { empty: false, elements: chart.marks[focus] },
  } as unknown as NonEmptyTraceState;
}

const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('tactileService', () => {
  let chart: Chart;
  let notification: NotificationService;
  let notify: jest.Mock<(text: string) => void>;
  let textService: TextService;
  let format: jest.Mock<(state: NonEmptyTraceState) => string>;
  let brailleStub: { isEnabled: boolean; onToggle: BrailleService['onToggle'] };
  let braille: BrailleService;
  let display: DisplayService;
  let toggle: Emitter<{ enabled: boolean; state: TraceState }>;
  let service: TactileService;

  beforeEach(() => {
    consoleError.mockClear();
    session.isConnected = false;
    session.geometry = GEOMETRY;
    session.canTranslate = false;
    session.translate.mockReset();
    session.translate.mockImplementation(async (): Promise<string | null> => null);
    session.writeGraphic.mockClear();
    session.writeGraphicRow.mockClear();
    session.writeText.mockClear();
    session.disconnect.mockClear();
    session.releaseIfAdopted.mockClear();
    session.adopt.mockReset();
    session.adopt.mockImplementation(async (): Promise<boolean> => false);
    ringsOf.mockReset();
    ringsOf.mockImplementation((element, viewport) => ringFor(element, viewport));

    chart = createChart();
    notify = jest.fn();
    notification = { notify } as unknown as NotificationService;
    // The line carries whatever review mode would read out, so the stub stands
    // in for TextService the same way review does — one description per state,
    // long enough that it needs more than one window on a 20-cell line.
    format = jest.fn((state: NonEmptyTraceState | { type: string; index: number; size: number }) => {
      // The real TextService formats a figure state as well as a trace one,
      // and the lobby hands it the former. A stub that only knows traces
      // throws there, and the throw is swallowed by the draw guard — so the
      // braille line silently goes missing and the test says nothing.
      if (state.type === 'figure') {
        const figure = state as { index: number; size: number };
        return `Subplot ${figure.index} of ${figure.size}, a bar plot of units sold by fruit`;
      }
      const trace = state as NonEmptyTraceState;
      // `cross` is optional: a chart may have no cross axis to speak of. The
      // fixture says so rather than asserting one, so this stub keeps working
      // for a trace that has none.
      const cross = trace.text.cross === undefined
        ? ''
        : `${trace.text.cross.label} is ${String(trace.text.cross.value)}, `;
      return `${trace.text.main.label} is ${String(trace.text.main.value)}, `
        + `${cross}in the bar plot of units sold by fruit`;
    });
    textService = { format } as unknown as TextService;
    toggle = new Emitter<{ enabled: boolean; state: TraceState }>();
    brailleStub = { isEnabled: false, onToggle: toggle.event };

    braille = brailleStub as Pick<BrailleService, 'isEnabled' | 'onToggle'> as unknown as BrailleService;
    display = { plot: chart.plot } as unknown as DisplayService;

    service = new TactileService(display, braille, notification, textService, createFigure(chart.axes, [chart.marks]));
  });

  afterEach(() => {
    service.dispose();
    toggle.dispose();
  });

  afterAll(() => {
    consoleError.mockRestore();
  });

  /**
   * Puts the service in the state the reader is in once they have turned
   * braille on with a device connected and moved onto a mark.
   * @param focus - Index of the focused mark
   */
  /**
   * Turns the display on the way the reader does, through braille's toggle
   * event. The display keeps its own on/off state — it has to, since braille
   * declines in the lobby and on plot types it has no table for — so setting
   * the braille flag alone no longer puts anything on the pins.
   */
  function turnOn(): void {
    brailleStub.isEnabled = true;
    toggle.fire({ enabled: true, state: traceState(chart, 1) });
  }

  /**
   * A second service over the same chart, for a case that has to draw the same
   * marks twice from a clean cache. `dispose()` is permanent, so the instance
   * built in `beforeEach` cannot be reused once it has been torn down.
   */
  function freshService(): TactileService {
    return new TactileService(
      display,
      braille,
      notification,
      textService,
      createFigure(chart.axes, [chart.marks]),
    );
  }

  function activate(focus: number = 1, traceType: string = 'bar'): NonEmptyTraceState {
    session.isConnected = true;
    turnOn();
    // Through the toggle event, as the real braille service raises it. The
    // display keeps its own on/off state — it has to, since braille declines
    // in the lobby and on plot types it has no table for — so setting the
    // braille flag alone no longer puts anything on the pins.
    toggle.fire({ enabled: true, state: traceState(chart, focus, 'a', 12, traceType) });
    const state = traceState(chart, focus, 'a', 12, traceType);
    service.update(state);
    return state;
  }

  /**
   * Replaces the service under test with one driving a different chart.
   * @param on - The chart the new service should draw
   * @param figure - The figure to give it, defaulting to one over `on`
   */
  function rebuild(on: Chart, figure: Figure = createFigure(on.axes, [on.marks])): void {
    const braille = brailleStub as Pick<BrailleService, 'isEnabled' | 'onToggle'> as unknown as BrailleService;
    const display = { plot: on.plot } as unknown as DisplayService;
    service.dispose();
    service = new TactileService(display, braille, notification, textService, figure);
    if (brailleStub.isEnabled) {
      // The replacement subscribes in its constructor and starts with the
      // display off, as a freshly built controller does. A test that had the
      // pins up before the swap wants them up after it.
      toggle.fire({ enabled: true, state: traceState(on, 1) });
    }
  }

  /**
   * Lets every queued microtask run, so a promise chain the service started
   * has finished by the time an assertion looks at its effects.
   */
  async function flushMicrotasks(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * The elements the renderer was actually asked to reduce to rings — which is
   * to say, everything that reached the pins.
   */
  function drawnElements(): SVGGraphicsElement[] {
    return ringsOf.mock.calls.map(call => call[0]);
  }

  /**
   * The most recent thing said, which for a zoom or a pan is the new position.
   */
  function lastAnnouncement(): string {
    const calls = notify.mock.calls;
    return calls[calls.length - 1][0];
  }

  describe('braille toggle', () => {
    it('should draw the focused chart when braille is turned on', () => {
      session.isConnected = true;
      service.update(traceState(chart, 1));

      brailleStub.isEnabled = true;
      toggle.fire({ enabled: true, state: traceState(chart, 1) });

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should lower every pin and blank the text line when braille is turned off', () => {
      activate();
      session.writeGraphic.mockClear();
      session.writeText.mockClear();

      brailleStub.isEnabled = false;
      toggle.fire({ enabled: false, state: traceState(chart, 1) });

      expect(session.writeGraphic).toHaveBeenCalledWith('00'.repeat(GEOMETRY.cellColumns * GEOMETRY.cellRows));
      expect(session.writeText).toHaveBeenCalledWith('00'.repeat(GEOMETRY.textCells));
    });

    it('should not write when braille is turned off with no device connected', () => {
      service.update(traceState(chart, 1));

      toggle.fire({ enabled: false, state: traceState(chart, 1) });

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });
  });

  describe('when inactive', () => {
    it('should write nothing on navigation while braille is off', () => {
      session.isConnected = true;

      service.update(traceState(chart, 1));

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should write nothing on navigation while no device is connected', () => {
      brailleStub.isEnabled = true;

      service.update(traceState(chart, 1));

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should report that it is active only when it has been asked for and a device is connected', () => {
      session.isConnected = false;
      turnOn();

      const withoutDevice = service.isActive;
      session.isConnected = true;

      expect(withoutDevice).toBe(false);
      expect(service.isActive).toBe(true);
    });

    it('should come up where braille declines, since it needs no braille table', () => {
      // The lobby and the plot types with no braille table — scatter,
      // manhattan, volcano. Braille never turns on there, so a display gated
      // on it was unreachable in exactly the places a pin grid is most worth
      // having.
      session.isConnected = true;

      service.toggle();

      expect(service.isActive).toBe(true);
      expect(brailleStub.isEnabled).toBe(false);
    });
  });

  describe('telling several lines apart', () => {
    // Strands laid over one another cross, and at every crossing a reader
    // following one has to decide which of two lines leaving the junction is
    // theirs. A sighted reader answers that from colour. On pins there is no
    // colour, so the chart's own colours become dash patterns.

    /**
     * Paints the chart's marks with the given stroke colours, cycling if there
     * are fewer colours than marks.
     * @param colours - Stroke colours to apply
     */
    const paintStrokes = (colours: readonly string[]): void => {
      chart.marks.forEach((mark, index) => {
        mark.setAttribute('stroke', colours[index % colours.length]);
        mark.setAttribute('fill', 'none');
      });
      // The shared fixture's marks are rectangles, and a pattern only ever
      // applies to an open stroke. These cases are about strands, so the rings
      // are re-stubbed as the open ones a line chart actually hands over.
      ringsOf.mockImplementation((element, viewport) => {
        const box = element.getBoundingClientRect();
        return [{
          points: [
            viewport.toDot(box.left, box.top),
            viewport.toDot(box.left + box.width, box.top + box.height),
          ],
          closed: false,
        }];
      });
    };

    /**
     * Total pins raised by the frame the service last sent.
     * @param hex - The graphic payload
     */
    const raisedIn = (hex: string): number => {
      let count = 0;
      for (let index = 0; index < hex.length; index += 2) {
        let byte = Number.parseInt(hex.slice(index, index + 2), 16);
        while (byte > 0) {
          count += byte & 1;
          byte >>= 1;
        }
      }
      return count;
    };

    it('should break up the strands when the chart drew them in different colours', () => {
      paintStrokes(['#1f77b4', '#ff7f0e', '#2ca02c']);
      activate(0, 'line');
      const patterned = raisedIn(session.writeGraphic.mock.calls[0][0]);

      session.writeGraphic.mockClear();
      service.dispose();
      service = freshService();
      paintStrokes(['#1f77b4']);
      activate(0, 'line');
      const uniform = raisedIn(session.writeGraphic.mock.calls[0][0]);

      // Same geometry either way; the patterned frame is the one with gaps in
      // it, so it raises strictly fewer pins.
      expect(patterned).toBeLessThan(uniform);
    });

    it('should leave the strands solid when the chart drew them one colour', () => {
      // No series distinction is being drawn, so dashing them all identically
      // would cost every line its continuity to say nothing at all.
      paintStrokes(['#1f77b4']);
      activate(0, 'line');
      const uniform = raisedIn(session.writeGraphic.mock.calls[0][0]);

      session.writeGraphic.mockClear();
      service.dispose();
      service = freshService();
      paintStrokes(['#1f77b4']);
      activate(0, 'line');

      expect(raisedIn(session.writeGraphic.mock.calls[0][0])).toBe(uniform);
    });

    it('should not pattern a chart whose colours do not name a series', () => {
      // A box plot draws its medians in a second colour without that colour
      // naming a second series, so dashing its whiskers would invent a
      // distinction the chart never made.
      paintStrokes(['#1f77b4', '#ff7f0e', '#2ca02c']);
      activate(0, 'box');
      const boxed = raisedIn(session.writeGraphic.mock.calls[0][0]);

      session.writeGraphic.mockClear();
      service.dispose();
      service = freshService();
      paintStrokes(['#1f77b4']);
      activate(0, 'box');

      expect(raisedIn(session.writeGraphic.mock.calls[0][0])).toBe(boxed);
    });
  });

  describe('a write that did not land', () => {
    // Only the rows that changed are transmitted, which makes every frame a
    // difference against the one before it. That is correct exactly while the
    // device received everything sent to it. When a write is dropped -- and on
    // a real device over Bluetooth they are, under the burst of full frames a
    // zoom step produces -- the rows it carried keep whatever they held, and
    // the next frame is a difference against what was *sent* rather than what
    // *arrived*. Those rows are never named again, so the display stays wrong
    // in a few places and navigating does not clear it.
    //
    // The worst of it is the unchanged-frame skip: returning the view to where
    // it started transmits nothing at all, so the one moment the reader is
    // most certain of what they should be feeling was the moment least able to
    // repair itself.

    it('should send a whole frame after a failed write, not a difference', () => {
      activate(1);
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      session.fireWriteFailure();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      service.update(traceState(chart, 0));

      // Without forgetting the dropped frame this is a row update, computed
      // against a frame the device never received.
      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });

    it('should redraw a view that came back to where it started', () => {
      // The reported symptom: zoom in twice, zoom out twice, and the picture
      // the reader returns to is not the one they left. The final frame equals
      // the frame the service believes is on the device, so it is skipped --
      // and if any of the four writes in between was dropped, that skip is
      // what makes the wrong picture permanent.
      activate(1);
      service.zoomIn();
      service.zoomIn();
      service.zoomOut();
      session.fireWriteFailure();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      service.zoomOut();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should repair the display without waiting for the reader to move', () => {
      // A reader who has stopped navigating is the one most likely to be
      // reading, and a display left wrong until the next arrow key is a
      // display they are reading wrong.
      activate(1);
      session.writeGraphic.mockClear();

      session.fireWriteFailure();

      return Promise.resolve().then(() => {
        expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      });
    });

    it('should resend the text line as well', () => {
      // The text line is cached against retransmission in exactly the same
      // way, so it goes stale in exactly the same way.
      activate(1);
      session.writeText.mockClear();

      session.fireWriteFailure();
      service.update(traceState(chart, 0));

      expect(session.writeText).toHaveBeenCalled();
    });

    it('should stop repairing a device that never accepts a write', async () => {
      // A repair is itself a write and can fail in turn. Retrying on every
      // failure would spin for as long as the device is unreachable.
      activate(1);
      session.writeGraphic.mockClear();

      for (let attempt = 0; attempt < 12; attempt++) {
        session.fireWriteFailure();
        await Promise.resolve();
      }

      expect(session.writeGraphic.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('should repair again once the reader has moved', async () => {
      // The bound is per reader action rather than per session: a display that
      // broke, was given up on, and then was navigated is worth repairing
      // again, because the reader is back and the device may not be.
      activate(1);
      for (let attempt = 0; attempt < 4; attempt++) {
        session.fireWriteFailure();
        await Promise.resolve();
      }
      service.update(traceState(chart, 0));
      session.writeGraphic.mockClear();

      session.fireWriteFailure();
      await Promise.resolve();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should give the repair budget back to a display that has just connected', async () => {
      // The bound is there to stop writing to a device that cannot be written
      // to. A device that has just connected is not that device, and until the
      // reader navigates nothing else would restore the budget -- so the first
      // failure on a fresh display would go unrepaired for no reason.
      activate(1);
      for (let attempt = 0; attempt < 4; attempt++) {
        session.fireWriteFailure();
        await Promise.resolve();
      }

      session.fireState({ status: 'connected', deviceName: 'DotPad 320', transport: 'bluetooth', geometry: GEOMETRY, message: '' });
      await Promise.resolve();
      session.writeGraphic.mockClear();

      session.fireWriteFailure();
      await Promise.resolve();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should not write to a device the reader has switched off', async () => {
      activate(1);
      service.toggle();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      session.fireWriteFailure();
      await Promise.resolve();

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('should send a frame on the first move', () => {
      activate();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(session.writeGraphic.mock.calls[0][0]).toHaveLength(GEOMETRY.cellColumns * GEOMETRY.cellRows * 2);
    });

    it('should not send a second frame when the picture is unchanged', () => {
      activate();
      session.writeGraphic.mockClear();

      service.update(traceState(chart, 1));

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });

    it('should send the changed rows when the focused mark moves', () => {
      activate(1);
      session.writeGraphic.mockClear();

      service.update(traceState(chart, 0));

      expect(session.writeGraphicRow).toHaveBeenCalled();
      expect(session.writeGraphic).not.toHaveBeenCalled();
    });

    it('should follow the focus onto a mark an arrow key took off the view', () => {
      // The counterpart to the pan tests: a pan the reader chose is left
      // alone, but a move they made with the arrow keys has to bring the view
      // with it, or the mark being described is not on the pins at all.
      activate(0);
      service.zoomIn();
      notify.mockClear();

      service.update(traceState(chart, 2));
      session.fireKey('panLeft');

      expect(lastAnnouncement()).toBe('Zoom 1.5x, centred 33% across and 67% down');
    });

    it('should leave the view alone when the focus is still on it', () => {
      activate(1);
      service.zoomIn();
      session.fireKey('panLeft');
      const panned = lastAnnouncement();

      service.update(traceState(chart, 1, 'b', 13));
      session.fireKey('function2');

      expect(lastAnnouncement()).not.toBe(panned);
      expect(lastAnnouncement()).toBe('Zoom 1.5x, centred 33% across and 33% down');
    });

    it('should fall back to the whole SVG when the subplot exposes no axes element', () => {
      rebuild(chart, createFigure(null, [chart.marks]));

      activate();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should walk the region when the model has no elements to give', () => {
      // A trace authored without selectors has none. There is then no way to
      // tell the chart from its furniture, so the fallback draws whatever the
      // region holds rather than nothing at all.
      rebuild(chart, createFigure(chart.axes, [[]]));

      activate();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should leave the panel behind when it walks the region', () => {
      // The fallback has no list of marks to trust, so it takes what the
      // subtree holds — and on a chart that has been through MAIDR the plot
      // background and the spines cannot be told apart by name, their groups
      // having been renamed for selector use. Left in, they cost a band of
      // pins around the whole display and the window is sized to the panel
      // rather than to the marks, so the data is squeezed into what is left.
      addFurniture(chart);
      rebuild(chart, createFigure(chart.axes, [[]]));

      activate();

      // As a set: the frame is drawn more than once and the focused mark goes
      // on last, so what is being asserted is which shapes reached the pins at
      // all, not how often or in what order.
      expect(new Set(drawnElements())).toEqual(new Set(chart.marks));
    });

    it('should draw the trace marks rather than everything in the axes subtree', () => {
      activate();
      const marksOnly = session.writeGraphic.mock.calls[0][0];
      session.writeGraphic.mockClear();

      // The same marks, plus what a chart library draws around them: an axis
      // spine along each edge, a tick below one of them, and the plot
      // background behind the lot. The model calls none of it data, so none of
      // it reaches the pins — and the frame is the one the bare chart gave.
      const furnished = createChart();
      addFurniture(furnished);
      rebuild(furnished);
      service.update(traceState(furnished, 1));

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(session.writeGraphic.mock.calls[0][0]).toBe(marksOnly);
    });

    it('should map the marks onto the pins whatever room the region takes around them', () => {
      // The region carries the tick labels and the title, so it is larger than
      // the marks and by a different amount on every chart. If it decided the
      // mapping, the same data would land on different pins depending on how
      // long the axis labels were.
      activate();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      stubRect(chart.axes, { left: -200, top: -100, width: 800, height: 400 });
      service.update(traceState(chart, 1, 'b', 13));

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });

    it('should write nothing when there is no area to draw in', () => {
      const flat = { left: 0, top: 0, width: 0, height: 0 };
      chart.marks.forEach(mark => stubRect(mark, flat));
      stubRect(chart.axes, flat);

      activate();

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should ignore a mark with no box rather than letting it drag the window', () => {
      // A stylesheet can hide an element in ways the attribute checks do not
      // see, and an unrendered one reports a zero rect at the viewport origin.
      // Folded into the extent that pulls the window off to the top-left
      // corner, and every real mark shrinks to nothing.
      // Away from the viewport origin, which is where an unrendered element
      // reports its zero rect — marks that already reach the origin would hide
      // the effect.
      chart.marks.forEach((mark, index) => {
        stubRect(mark, { left: 100 + index * 40, top: 50, width: 10, height: 20 });
      });
      rebuild(chart);
      activate();
      const framed = session.writeGraphic.mock.calls[0][0];
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      const ghost = document.createElementNS(SVG_NS, 'rect');
      stubRect(ghost, { left: 0, top: 0, width: 0, height: 0 });
      chart.axes.append(ghost);
      chart.marks.push(ghost);
      rebuild(chart);
      service.update(traceState(chart, 1));

      expect(session.writeGraphic.mock.calls[0][0]).toBe(framed);
    });

    it('should fall back to the plot region when every value is the same', () => {
      // A flat trace -- every bar the same height -- has marks sharing a line
      // with no height at all. Mapping that onto the pins divides by zero and
      // the chart disappears, so the region supplies the window instead.
      chart.marks.forEach((mark, index) => {
        stubRect(mark, { left: index * 60, top: 50, width: 10, height: 0 });
      });

      activate();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should redraw from the last state when a device connects', () => {
      // The reader asks for the display before plugging one in, and navigates
      // meanwhile. Nothing can be drawn until the device arrives, and when it
      // does the pins have to catch up to where the reader already is rather
      // than wait for the next arrow key.
      turnOn();
      service.update(traceState(chart, 1));
      session.isConnected = true;

      session.fireState({ status: 'connected', deviceName: 'DotPad 320', transport: 'bluetooth', geometry: GEOMETRY, message: '' });

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });
  });

  describe('layers', () => {
    /**
     * A two-layer chart: three marks in the first layer and three more, at
     * different places, in the second. Both are in the DOM at once, as a
     * multi-layer chart draws them.
     */
    function twoLayers(): { figure: Figure; second: SVGElement[] } {
      const second = [
        { left: 40, top: 60, width: 10, height: 10 },
        { left: 120, top: 20, width: 10, height: 10 },
      ].map((rect, index) => {
        const mark = document.createElementNS(SVG_NS, 'circle');
        mark.setAttribute('data-index', String(index + 10));
        stubRect(mark, rect);
        chart.axes.append(mark);
        return mark;
      });
      return { figure: createFigure(chart.axes, [chart.marks, second]), second };
    }

    /**
     * A trace state focused on an element outside {@link MARK_RECTS}.
     * @param element - The mark the reader is on
     */
    function focusedOn(element: SVGElement): NonEmptyTraceState {
      return {
        ...traceState(chart, 1),
        highlight: { empty: false, elements: element },
      } as unknown as NonEmptyTraceState;
    }

    it('should draw the incoming layer rather than the one it had cached', () => {
      // The reported failure. A layer switch keeps the same subplot and the
      // same axes element, so a cache keyed on those hands back the outgoing
      // layer's marks: the reader navigates one series while the pins hold
      // another, and nothing on the device says so.
      const { figure, second } = twoLayers();
      rebuild(chart, figure);
      activate();
      ringsOf.mockClear();

      switchLayer(figure, 1);
      service.update(focusedOn(second[0]));

      expect(drawnElements()).toEqual(expect.arrayContaining(second));
      for (const mark of chart.marks) {
        expect(drawnElements()).not.toContain(mark);
      }
    });

    it('should draw only the layer the reader is on', () => {
      // Sixty pins across cannot hold two series at once and stay readable.
      // Drawing both would also leave the picture the same whichever layer is
      // active, which is the same failure as not redrawing at all.
      const { figure, second } = twoLayers();
      rebuild(chart, figure);
      switchLayer(figure, 1);
      session.isConnected = true;
      turnOn();
      ringsOf.mockClear();

      service.update(focusedOn(second[1]));

      expect(drawnElements()).toEqual(expect.arrayContaining(second));
      for (const mark of chart.marks) {
        expect(drawnElements()).not.toContain(mark);
      }
    });

    it('should size the window to every layer, not just the drawn one', () => {
      const { figure, second } = twoLayers();
      rebuild(chart, figure);
      switchLayer(figure, 1);
      session.isConnected = true;
      turnOn();
      service.update(focusedOn(second[1]));
      const acrossBothLayers = session.writeGraphic.mock.calls[0][0];
      session.writeGraphic.mockClear();

      // The same layer, alone in its subplot. Its marks now have the window to
      // themselves and land on different pins. Were the window sized to the
      // drawn layer, the two frames would be identical — and a series running
      // 0 to 2 would come out the same height as one running 0 to 20, so the
      // layers stop being comparable at the moment the reader compares them.
      rebuild(chart, createFigure(chart.axes, [second]));
      service.update(focusedOn(second[1]));

      expect(session.writeGraphic.mock.calls[0][0]).not.toBe(acrossBothLayers);
    });

    it('should put the new layer description on the braille line', () => {
      const { figure } = twoLayers();
      rebuild(chart, figure);
      activate();
      const first = session.writeText.mock.calls[0][0];
      session.writeText.mockClear();

      switchLayer(figure, 1);
      service.update(traceState(chart, 1, 'b', 99));

      expect(session.writeText).toHaveBeenCalled();
      expect(session.writeText.mock.calls[0][0]).not.toBe(first);
    });
  });

  describe('sharing one display between charts', () => {
    // Every chart in a notebook is its own iframe, so every chart is its own
    // copy of the session with its own connection — a live BluetoothDevice or
    // SerialPort cannot cross a frame boundary. What does cross is the
    // permission, which belongs to the page. These cases pin the consequence:
    // the reader pairs once for the page, not once per chart.

    it('should take up a display the page was already granted', () => {
      session.isConnected = false;

      brailleStub.isEnabled = true;
      toggle.fire({ enabled: true, state: traceState(chart, 1) });

      expect(session.adopt).toHaveBeenCalledTimes(1);
    });

    it('should not reach for one when this chart already has it', () => {
      session.isConnected = true;

      brailleStub.isEnabled = true;
      toggle.fire({ enabled: true, state: traceState(chart, 1) });

      expect(session.adopt).not.toHaveBeenCalled();
    });

    it('should draw as soon as one is taken up', async () => {
      session.isConnected = false;
      session.adopt.mockImplementation(async () => {
        session.isConnected = true;
        return true;
      });
      brailleStub.isEnabled = true;
      service.update(traceState(chart, 1));

      toggle.fire({ enabled: true, state: traceState(chart, 1) });
      await Promise.resolve();
      await Promise.resolve();

      expect(session.writeGraphic).toHaveBeenCalled();
    });

    it('should hand back a display that arrived after the panel had closed', async () => {
      // Taking one up is asynchronous, and a double press of `b` is enough to
      // outrun it. The release on the way out finds nothing to release,
      // because the adoption has not happened yet — so without a second look
      // the display stays checked out to a chart whose panel is shut, and the
      // next chart to want it finds the device open and gives up quietly.
      session.isConnected = false;
      let settle: (adopted: boolean) => void = () => {};
      session.adopt.mockImplementation(async () => new Promise<boolean>((resolve) => {
        settle = resolve;
      }));

      brailleStub.isEnabled = true;
      toggle.fire({ enabled: true, state: traceState(chart, 1) });
      brailleStub.isEnabled = false;
      toggle.fire({ enabled: false, state: traceState(chart, 1) });
      session.releaseIfAdopted.mockClear();

      settle(true);
      await flushMicrotasks();

      expect(session.releaseIfAdopted).toHaveBeenCalledTimes(1);
    });

    it('should keep a display that arrived while the panel was still open', async () => {
      session.isConnected = false;
      let settle: (adopted: boolean) => void = () => {};
      session.adopt.mockImplementation(async () => new Promise<boolean>((resolve) => {
        settle = resolve;
      }));

      brailleStub.isEnabled = true;
      toggle.fire({ enabled: true, state: traceState(chart, 1) });
      session.releaseIfAdopted.mockClear();

      settle(true);
      await flushMicrotasks();

      expect(session.releaseIfAdopted).not.toHaveBeenCalled();
    });

    it('should not take the display from a newer chart after being disposed', async () => {
      // Focus-out disposes the controller on a 0ms timer while taking up a
      // display is a round trip, so a reader who presses `b` and tabs away can
      // have a newer controller running in this frame before the old adoption
      // resolves. Both share the one session: handing the device back here
      // would take it from the chart that now has it.
      session.isConnected = false;
      let settle: (adopted: boolean) => void = () => {};
      session.adopt.mockImplementation(async () => new Promise<boolean>((resolve) => {
        settle = resolve;
      }));

      brailleStub.isEnabled = true;
      toggle.fire({ enabled: true, state: traceState(chart, 1) });
      service.dispose();
      brailleStub.isEnabled = false;
      session.releaseIfAdopted.mockClear();

      settle(true);
      await flushMicrotasks();

      expect(session.releaseIfAdopted).not.toHaveBeenCalled();
    });

    it('should not draw onto a newer chart display after being disposed', () => {
      // Pins the invariant rather than one mechanism: a disposed service never
      // reaches the pins. Two things uphold it — the disposal guard in the
      // adoption callback, and `dispose()` nulling the last state, which
      // `redraw` returns on. Removing either alone leaves this passing, which
      // is the point: it is the outcome that must hold, not the route to it.
      session.isConnected = false;
      let settle: (adopted: boolean) => void = () => {};
      session.adopt.mockImplementation(async () => new Promise<boolean>((resolve) => {
        settle = resolve;
      }));
      brailleStub.isEnabled = true;
      service.update(traceState(chart, 1));
      toggle.fire({ enabled: true, state: traceState(chart, 1) });
      service.dispose();
      session.isConnected = true;
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      settle(true);

      return flushMicrotasks().then(() => {
        expect(session.writeGraphic).not.toHaveBeenCalled();
        expect(session.writeGraphicRow).not.toHaveBeenCalled();
      });
    });

    it('should hand the display back when this chart stops using it', () => {
      activate();

      brailleStub.isEnabled = false;
      toggle.fire({ enabled: false, state: traceState(chart, 1) });

      expect(session.releaseIfAdopted).toHaveBeenCalledTimes(1);
    });
  });

  describe('the multi-panel lobby', () => {
    /**
     * A figure state, as the lobby of a multi-panel plot emits one.
     *
     * Its highlight is the whole panel under the cursor, not a mark inside it:
     * in the lobby the reader has chosen a panel but not a point.
     * @param panel - The axes element of the focused panel
     */
    function figureState(panel: SVGElement): FigureState {
      return {
        empty: false,
        type: 'figure',
        title: 'Sales',
        subtitle: '',
        caption: '',
        xAxis: 'x',
        yAxis: 'y',
        size: 4,
        index: 2,
        traceTypes: ['bar'],
        highlight: { empty: false, elements: panel },
      } as unknown as FigureState;
    }

    it('should draw the panel under the cursor', () => {
      // Without this the pins keep the last chart drawn — a panel the reader
      // may have left — and present it as the one they are on. A stale picture
      // is worse than none: nothing on the device says it is stale.
      session.isConnected = true;
      turnOn();

      service.update(figureState(chart.axes));

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(drawnElements()).toEqual(expect.arrayContaining(chart.marks));
    });

    it('should leave every mark hollow, since no point is focused yet', () => {
      // Marks wide enough to have an interior. At the default size they are
      // two dots across, where a fill and an outline raise the same pins and
      // the comparison below could not tell them apart.
      chart.marks.forEach((mark, index) => {
        stubRect(mark, { left: index * 70, top: 0, width: 60, height: 100 });
      });
      rebuild(chart);
      session.isConnected = true;
      turnOn();

      service.update(figureState(chart.axes));
      const lobby = session.writeGraphic.mock.calls[0][0];

      // The same panel with a mark focused raises strictly more pins: the
      // focused one is filled. If the lobby had filled anything, the two
      // frames would match.
      session.writeGraphic.mockClear();
      rebuild(chart);
      activate();

      expect(session.writeGraphic.mock.calls[0][0]).not.toBe(lobby);
    });

    it('should not fill the whole panel just because the panel is highlighted', () => {
      // The lobby's highlight is the axes element. Treating that as the
      // focused mark would fill every pin the panel covers.
      session.isConnected = true;
      turnOn();

      service.update(figureState(chart.axes));

      expect(drawnElements()).not.toContain(chart.axes);
    });

    it('should put the figure description on the braille line', () => {
      session.isConnected = true;
      turnOn();

      service.update(figureState(chart.axes));

      expect(format).toHaveBeenCalledWith(expect.objectContaining({ type: 'figure' }));
      expect(session.writeText).toHaveBeenCalled();
    });
  });

  describe('the braille text line', () => {
    it('should send exactly one payload of the device text width', () => {
      activate();

      expect(session.writeText).toHaveBeenCalledTimes(1);
      expect(session.writeText.mock.calls[0][0]).toHaveLength(GEOMETRY.textCells * 2);
    });

    it('should change the payload when the focused value changes', () => {
      session.isConnected = true;
      turnOn();
      service.update(traceState(chart, 1, 'a', 12));
      const first = session.writeText.mock.calls[0][0];

      service.update(traceState(chart, 1, 'b', 34));

      expect(session.writeText.mock.calls[1][0]).not.toBe(first);
    });

    it('should write no text at all to a device with no text line', () => {
      session.geometry = { ...GEOMETRY, textCells: 0 };

      activate();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should carry the same description review mode reads out', () => {
      activate();

      // Not a separate abbreviated phrasing for the device: what the reader
      // meets under their fingers is the account review shows, verbatim.
      expect(format).toHaveBeenCalled();
      const described = format.mock.results[0].value as string;
      const expected = DotPack.brailleCells(
        TactileBraille.window(TactileBraille.toCells(described), GEOMETRY.textCells, 0),
        GEOMETRY.textCells,
      );
      expect(session.writeText).toHaveBeenCalledWith(expected);
    });

    it('should scroll forward through the line on function key 4', () => {
      activate();
      const first = session.writeText.mock.calls[0][0];
      notify.mockClear();

      session.fireKey('function4');

      expect(session.writeText).toHaveBeenCalledTimes(2);
      expect(session.writeText.mock.calls[1][0]).not.toBe(first);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Line part 2 of'));
    });

    it('should scroll back through the line on function key 1', () => {
      activate();
      session.fireKey('function4');
      const second = session.writeText.mock.calls[1][0];
      notify.mockClear();

      session.fireKey('function1');

      expect(session.writeText.mock.calls[2][0]).not.toBe(second);
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('Line part 1 of'));
    });

    it('should say when there is no more line in that direction', () => {
      activate();
      notify.mockClear();

      session.fireKey('function1');

      expect(notify).toHaveBeenCalledWith('Start of the line');
    });

    it('should say the whole line is shown when it fits the device', () => {
      format.mockReturnValue('a');
      activate();
      notify.mockClear();

      session.fireKey('function4');

      expect(notify).toHaveBeenCalledWith('The whole line is already shown');
    });

    it('should carry contracted braille from the device engine when it has one', async () => {
      session.canTranslate = true;
      session.translate.mockResolvedValue('1e15ff');
      session.isConnected = true;
      turnOn();

      service.update(traceState(chart, 1));
      await Promise.resolve();

      // The device's own engine, not MAIDR's uncontracted table: on twenty
      // cells the contractions are most of the difference between a value
      // fitting and needing to be panned.
      expect(session.translate).toHaveBeenCalledWith(format.mock.results[0].value);
      expect(session.writeText).toHaveBeenCalledWith(
        `1e15ff${'00'.repeat(GEOMETRY.textCells - 3)}`,
      );
    });

    it('should say once that the line is uncontracted when the engine declines', async () => {
      // The failure that prompted this: the engine came up, accepted a
      // language and a grade, and then returned nothing, because its table
      // bundle was corrupt. `canTranslate` stays true down that path, so a
      // check on it alone would have missed the case entirely -- and the
      // reader met grade 1 with no way to tell it from a description that was
      // simply that long.
      session.canTranslate = true;
      session.translate.mockResolvedValue(null);
      session.isConnected = true;
      turnOn();

      service.update(traceState(chart, 1));
      await Promise.resolve();

      expect(notify).toHaveBeenCalledWith(
        'Contracted braille is unavailable, so the tactile display\'s text line is uncontracted',
      );
    });

    it('should say the line is uncontracted when the engine never came up', () => {
      // The other way it happens, and the simpler one: no engine at all. The
      // reader is told the same thing, because from their side it is the same
      // event -- the cells under their fingers are uncontracted either way.
      session.canTranslate = false;
      session.isConnected = true;
      turnOn();

      service.update(traceState(chart, 1));

      expect(notify).toHaveBeenCalledWith(
        'Contracted braille is unavailable, so the tactile display\'s text line is uncontracted',
      );
    });

    it('should say it once rather than on every move', async () => {
      // A standing condition, not an event. Repeating it on every arrow key
      // would talk over the reading it is describing.
      session.canTranslate = true;
      session.translate.mockResolvedValue(null);
      session.isConnected = true;
      turnOn();
      service.update(traceState(chart, 1));
      await Promise.resolve();

      service.update(traceState(chart, 2));
      await Promise.resolve();

      const said = notify.mock.calls
        .filter(call => String(call[0]).includes('uncontracted'));
      expect(said).toHaveLength(1);
    });

    it('should say nothing about grade when the engine answers', async () => {
      session.canTranslate = true;
      session.translate.mockResolvedValue('1e15ff');
      session.isConnected = true;
      turnOn();

      service.update(traceState(chart, 1));
      await Promise.resolve();

      expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('uncontracted'));
    });

    it('should fall back to its own table when the engine declines', async () => {
      session.canTranslate = true;
      session.translate.mockResolvedValue(null);
      session.isConnected = true;
      turnOn();

      service.update(traceState(chart, 1));
      await Promise.resolve();

      // Worse to read than contracted braille, but the line must never go
      // blank for want of a translator.
      const described = format.mock.results[0].value as string;
      expect(session.writeText).toHaveBeenCalledWith(DotPack.brailleCells(
        TactileBraille.window(TactileBraille.toCells(described), GEOMETRY.textCells, 0),
        GEOMETRY.textCells,
      ));
    });

    it('should not let a slow translation overwrite a newer point', async () => {
      session.canTranslate = true;
      const pending: ((hex: string | null) => void)[] = [];
      session.translate.mockImplementation(
        () => new Promise<string | null>(resolve => pending.push(resolve)),
      );
      session.isConnected = true;
      turnOn();

      service.update(traceState(chart, 1, 'a', 12));
      service.update(traceState(chart, 0, 'b', 34));
      pending[1]?.('2222');
      await Promise.resolve();
      session.writeText.mockClear();
      pending[0]?.('1111');
      await Promise.resolve();

      // The first request answers last. Writing it would put the previous
      // point's description under the reader's fingers while the pins show
      // the current one.
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should drop a translation that lands after braille is switched off', async () => {
      session.canTranslate = true;
      const pending: ((hex: string | null) => void)[] = [];
      session.translate.mockImplementation(
        () => new Promise<string | null>(resolve => pending.push(resolve)),
      );
      session.isConnected = true;
      turnOn();
      service.update(traceState(chart, 1));

      brailleStub.isEnabled = false;
      toggle.fire({ enabled: false, state: traceState(chart, 1) });
      session.writeText.mockClear();
      pending[0]?.('1111');
      await Promise.resolve();

      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should return to the start of the line on the next navigation move', () => {
      activate();
      session.fireKey('function4');
      const firstWindow = session.writeText.mock.calls[0][0];
      session.writeText.mockClear();

      service.update(traceState(chart, 0, 'c', 56));

      // A move describes a different point; leaving the window where it was
      // would drop the reader into the middle of a sentence.
      expect(session.writeText).toHaveBeenCalledTimes(1);
      const described = format.mock.results[format.mock.results.length - 1].value as string;
      expect(session.writeText.mock.calls[0][0]).toBe(DotPack.brailleCells(
        TactileBraille.window(TactileBraille.toCells(described), GEOMETRY.textCells, 0),
        GEOMETRY.textCells,
      ));
      expect(session.writeText.mock.calls[0][0]).not.toBe(firstWindow);
    });
  });

  describe('zoom', () => {
    it('should announce the new view and redraw when zooming in', () => {
      activate();
      session.writeGraphic.mockClear();

      service.zoomIn();

      expect(notify).toHaveBeenCalledWith('Zoom 1.5x, centred 50% across and 50% down');
      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should announce the whole plot when zooming back out', () => {
      activate();
      service.zoomIn();

      service.zoomOut();

      expect(notify).toHaveBeenLastCalledWith('Whole plot');
    });

    it('should refuse rather than announce a view when already at the closest zoom', () => {
      activate();
      for (let step = 0; step < 7; step++) {
        service.zoomIn();
      }
      notify.mockClear();

      service.zoomIn();

      expect(notify).toHaveBeenCalledWith('Already at the closest zoom');
    });

    it('should refuse when already showing the whole plot', () => {
      activate();

      service.zoomOut();

      expect(notify).toHaveBeenCalledWith('Already showing the whole plot');
    });

    it('should say that no display is connected rather than zooming', () => {
      brailleStub.isEnabled = true;

      service.zoomIn();

      expect(notify).toHaveBeenCalledWith('No tactile display is connected');
      expect(session.writeGraphic).not.toHaveBeenCalled();
    });

    it('should say that braille is off rather than zooming', () => {
      session.isConnected = true;

      service.zoomIn();

      expect(notify).toHaveBeenCalledWith('Turn braille on to use the tactile display');
      expect(session.writeGraphic).not.toHaveBeenCalled();
    });
  });

  describe('a view that cannot move', () => {
    it('should say when a pan left the pins exactly as they were', () => {
      // A mark whose projection does not move with the window — a stripe that
      // runs past both edges at a fixed height. Panning across it redraws a
      // frame identical to the one it replaced, and not an empty one, so the
      // reader's fingers find exactly what they found before. That is
      // indistinguishable from a key that did nothing unless it is said.
      activate();
      service.zoomIn();
      ringsOf.mockImplementation(() => [{
        points: [{ x: -20, y: 20 }, { x: 80, y: 20 }],
        closed: false,
      }]);
      service.zoomIn();
      notify.mockClear();

      session.fireKey('panRight');

      expect(lastAnnouncement()).toContain('; the pins are unchanged');
    });

    it('should say when a zoom left nothing in view at all', () => {
      // Every pin down is also what a display that has stopped working feels
      // like, so a reader who zooms into an empty patch of chart and is told
      // nothing cannot tell the two apart.
      activate(0);
      service.zoomIn();
      service.zoomIn();
      service.zoomIn();
      session.fireKey('panRight');
      session.fireKey('panRight');
      notify.mockClear();

      session.fireKey('panRight');

      expect(lastAnnouncement()).toContain('; nothing is in view');
    });

    it('should not say it of a pan that did change the pins', () => {
      activate();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('panRight');

      expect(lastAnnouncement()).not.toContain('unchanged');
    });

    it('should zoom in on the mark the reader is on, not the middle of the plot', () => {
      // Zoom is asked for to feel one mark more closely. Holding the window on
      // the plot's centre instead leaves the reader's own mark off the edge
      // after a step or two, on a display that cannot say what is missing —
      // and the middle of a plot is usually a patch with nothing in it, so
      // what they get is blank pins and no account of why.
      activate(0);
      notify.mockClear();

      service.zoomIn();
      service.zoomIn();

      // Mark 0 sits at the left edge, so a window that followed it reports a
      // centre left of the middle. One that did not stays at 50%.
      expect(lastAnnouncement()).toBe('Zoom 2x, centred 25% across and 25% down');
    });
  });

  describe('charts read by their shape', () => {
    /**
     * The viewport the renderer was last handed, so a test can ask it directly
     * how a rectangle lands on the pins.
     */
    function lastViewport(): TactileViewport {
      const calls = ringsOf.mock.calls;
      return calls[calls.length - 1][1];
    }

    /**
     * How square a patch of pins a square region maps to. 1 is undistorted.
     * @param viewport - The viewport to measure
     */
    function squareness(viewport: TactileViewport): number {
      const origin = viewport.toDot(REGION.left, REGION.top);
      const corner = viewport.toDot(REGION.left + 100, REGION.top + 100);
      return (corner.x - origin.x) / (corner.y - origin.y);
    }

    it('should keep a pie round rather than stretching it to fill the grid', () => {
      // A wedge at the top would otherwise subtend a different arc from the
      // same wedge at the side, so the reader concludes one slice is bigger
      // when the data says they are equal.
      activate();
      ringsOf.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'pie'));

      expect(squareness(lastViewport())).toBeCloseTo(1);
    });

    it('should still spend every pin on a chart whose shape carries nothing', () => {
      activate();
      ringsOf.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'bar'));

      // The grid is wider than it is tall, so an undistorted mapping is not
      // what a stretched one produces.
      expect(squareness(lastViewport())).not.toBeCloseTo(1);
    });

    it('should rebuild the view when a layer switch changes what the shape means', () => {
      // Page Up can move between a bar layer and a pie layer in one subplot.
      // A viewport built for one maps the same rect onto different pins from
      // one built for the other, so it cannot simply be re-pointed.
      activate();
      service.update(traceState(chart, 1, 'a', 12, 'pie'));
      ringsOf.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'bar'));

      expect(squareness(lastViewport())).not.toBeCloseTo(1);
    });

    it('should keep the lobby stretched, since no trace type is settled yet', () => {
      // A panel is a rectangle of chart. Which trace type is inside it is not
      // settled until the reader enters one.
      session.isConnected = true;
      turnOn();
      ringsOf.mockClear();
      service.update({
        empty: false,
        type: 'figure',
        traceTypes: ['pie'],
        highlight: { empty: false, elements: chart.axes },
      } as unknown as FigureState);

      expect(squareness(lastViewport())).not.toBeCloseTo(1);
    });
  });

  describe('the value a chart put in a colour', () => {
    /**
     * Paints the marks along a scale, as a heatmap or a choropleth does.
     */
    function paintScale(): void {
      const shades = ['#ffffff', '#888888', '#000000'];
      chart.marks.forEach((mark, index) => {
        (mark as SVGElement).setAttribute('fill', shades[index % shades.length]);
        (mark as SVGElement).style.fill = shades[index % shades.length];
        // Wide enough to have an interior. A mark too small to hollow out has
        // nowhere to put a texture either.
        stubRect(mark, { left: REGION.left + index * 90, top: REGION.top, width: 80, height: 80 });
      });
    }

    it('should texture a heatmap, whose cells are all the same shape', () => {
      // Every cell is the same size, so the shape reaching the pins carries
      // nothing and the numbers are all in the colour. A heatmap spent 819
      // pins on an 8x8 lattice and delivered none of its 64 values.
      paintScale();
      activate();
      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'heat'));
      const textured = session.writeGraphic.mock.calls.at(-1)?.[0];

      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'bar'));
      const plain = session.writeGraphic.mock.calls.at(-1)?.[0];

      expect(textured).toBeDefined();
      expect(plain).toBeDefined();
      expect(textured).not.toBe(plain);
    });

    /**
     * Paints the marks the way a candlestick paints its bodies: some solid,
     * some hollow, and nothing in between.
     * @param colours - One fill per mark, cycled if there are fewer
     */
    function paintBodies(colours: string[]): void {
      chart.marks.forEach((mark, index) => {
        const colour = colours[index % colours.length];
        (mark as SVGElement).setAttribute('fill', colour);
        (mark as SVGElement).style.fill = colour;
        stubRect(mark, { left: REGION.left + index * 90, top: REGION.top, width: 80, height: 80 });
      });
    }

    it('should texture the bodies a candlestick drew solid', () => {
      // A falling day and a rising day of the same range are the same
      // rectangle in the same place, and the chart tells them apart by filling
      // one of them. Outlines alone drop the one thing the body was drawn to
      // say.
      paintBodies(['#000000', '#ffffff']);
      activate();
      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'candlestick'));
      const textured = session.writeGraphic.mock.calls.at(-1)?.[0];

      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'bar'));
      const plain = session.writeGraphic.mock.calls.at(-1)?.[0];

      expect(textured).toBeDefined();
      expect(textured).not.toBe(plain);
    });

    it('should read the direction off the chart rather than off a convention', () => {
      // Red against green, both mid-luminance and neither of them black. The
      // darker group is the one the chart filled, whatever the two colours are,
      // so an absolute threshold on darkness would texture both or neither.
      paintBodies(['#d62728', '#2ca02c']);
      activate();
      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'candlestick'));
      const textured = session.writeGraphic.mock.calls.at(-1)?.[0];

      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'bar'));
      const plain = session.writeGraphic.mock.calls.at(-1)?.[0];

      expect(textured).toBeDefined();
      expect(textured).not.toBe(plain);
    });

    it('should texture against a body the chart left unpainted', () => {
      // The hollow convention: the rising bodies carry `fill: none` and only
      // the falling ones are painted. Leaving an unpainted body out of the
      // comparison made the painted ones the only measured group — every one
      // of them as light as the lightest — and the display fell back to
      // outlines with no direction on it at all.
      // Painted first, so the two textured bodies are ones the reader is not
      // standing on: the focused mark is drawn solid and never takes a shade,
      // so a fixture that painted only the focused body would pass whatever
      // this code did.
      paintBodies(['#d62728', 'none']);
      activate();
      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'candlestick'));
      const textured = session.writeGraphic.mock.calls.at(-1)?.[0];

      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'bar'));
      const plain = session.writeGraphic.mock.calls.at(-1)?.[0];

      expect(textured).toBeDefined();
      expect(textured).not.toBe(plain);
    });

    it('should not read a wick as a body the chart left hollow', () => {
      // Wicks arrive in the same list as the bodies and are always unpainted,
      // being lines. Counted as hollow bodies they would put one in every
      // chart, and every painted body would then be textured whatever the
      // chart drew — including a chart drawing no direction at all.
      paintBodies(['#d62728']);
      stubRect(chart.marks[0], { left: REGION.left, top: REGION.top, width: 0, height: 80 });
      (chart.marks[0] as SVGElement).style.fill = 'none';
      activate();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      service.update(traceState(chart, 1, 'a', 12, 'candlestick'));

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });

    it('should leave the bodies alone when the chart filled them all the same', () => {
      // No direction is being drawn, so there is none to feel. Texturing every
      // body would leave the focused one the only solid mark among a display
      // of near-solid ones.
      paintBodies(['#ffffff']);
      activate();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      service.update(traceState(chart, 1, 'a', 12, 'candlestick'));

      // Nothing is sent because nothing changed: the frame is the one the
      // same marks drew as bars.
      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });

    it('should leave a pie hollow, where colour names the slice and the angle is the value', () => {
      // Texturing a pie put two of four wedges at full density and left a
      // third empty: two solid wedges, one of them the one the reader was
      // standing on, and no way to tell which.
      paintScale();
      activate();
      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'pie'));
      const pie = session.writeGraphic.mock.calls.at(-1)?.[0];

      session.writeGraphic.mockClear();
      service.update(traceState(chart, 1, 'a', 12, 'heat'));
      const heat = session.writeGraphic.mock.calls.at(-1)?.[0];

      expect(pie).toBeDefined();
      expect(heat).toBeDefined();
      expect(pie).not.toBe(heat);
    });
  });

  describe('trace geometry', () => {
    it('should draw the shape a trace drew rather than the markers on it', () => {
      // A line: maidr makes one circle per vertex out of the rendered path, so
      // the trace's highlight list is the points and never the line between
      // them. Drawn from those alone the display is a scatter of dots — and a
      // zoomed window landing between two of them holds nothing, so every pan
      // from there redraws the same empty frame and the keys feel dead.
      const line = document.createElementNS(SVG_NS, 'path') as SVGElement;
      chart.axes.appendChild(line);
      stubRect(line, REGION);
      rebuild(chart, createFigure(chart.axes, [chart.marks], [[line]]));
      activate();

      expect(drawnElements()).toContain(line);
      // The vertices are not drawn as marks in their own right. The focused
      // one still is — it is what tells the reader where they are — so this
      // names an unfocused vertex.
      expect(drawnElements()).not.toContain(chart.marks[0]);
    });

    it('should fall back to the markers when a trace drew no shape of its own', () => {
      // Bars, points, boxes: the highlight elements are the marks. A trace
      // with nothing extra to offer returns an empty list rather than being
      // absent, so this is one check rather than two.
      rebuild(chart, createFigure(chart.axes, [chart.marks], [[]]));
      activate();

      expect(drawnElements()).toEqual(expect.arrayContaining(chart.marks));
    });
  });

  describe('panning', () => {
    it('should pan left on the device panning key', () => {
      activate();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('panLeft');

      expect(notify).toHaveBeenCalledWith('Zoom 1.5x, centred 33% across and 50% down');
    });

    it('should pan up on function key 2', () => {
      activate();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('function2');

      expect(notify).toHaveBeenCalledWith('Zoom 1.5x, centred 50% across and 33% down');
    });

    it('should pan down on function key 3', () => {
      activate();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('function3');

      expect(notify).toHaveBeenCalledWith('Zoom 1.5x, centred 50% across and 67% down');
    });

    it('should leave the graphic alone on the text-line scroll keys', () => {
      activate();
      service.zoomIn();
      session.writeGraphic.mockClear();
      session.writeGraphicRow.mockClear();

      session.fireKey('function4');

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeGraphicRow).not.toHaveBeenCalled();
    });

    it('should say there is nothing more that way at the edge of the plot', () => {
      activate();
      service.zoomIn();
      session.fireKey('panLeft');
      notify.mockClear();

      session.fireKey('panLeft');

      expect(notify).toHaveBeenCalledWith('No more to show to the left');
    });

    it('should say to zoom in first when the whole plot is already shown', () => {
      activate();
      notify.mockClear();

      session.fireKey('panRight');

      expect(notify).toHaveBeenCalledWith('The whole plot is already shown; zoom in to pan');
    });

    it('should ignore a key it does not map', () => {
      activate();
      service.zoomIn();
      notify.mockClear();
      session.writeGraphic.mockClear();

      session.fireKey('panAll' as DotPadKey);

      expect(notify).not.toHaveBeenCalled();
      expect(session.writeGraphic).not.toHaveBeenCalled();
    });

    it('should keep a pan step that leaves the focused mark behind', () => {
      // Mark 0 sits at the left edge, so zooming settles the window on it and
      // panning right takes it off the view. The view has to stay where the
      // reader put it: a redraw that follows the focus undoes the very pan
      // that asked for it, and the second step then announces the same
      // position as the first rather than a further one.
      activate(0);
      service.zoomIn();
      service.zoomIn();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('panRight');
      const first = lastAnnouncement();
      session.fireKey('panRight');

      expect(first).toBe('Zoom 3x, centred 33% across and 17% down; nothing is in view');
      // Past the marks there is nothing left to draw, so the frame repeats and
      // is said to — but the position still advances, which is the point here.
      expect(lastAnnouncement()).toBe('Zoom 3x, centred 50% across and 17% down; nothing is in view');
    });

    it('should pan a mark larger than the window', () => {
      // A mark filling the plot can never fit a zoomed window, so following
      // the focus on every redraw would pin the view to it for good — every
      // pan announcing a move it had not made.
      stubRect(chart.marks[1], REGION);
      activate();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('panRight');

      // Centred 67%, not 50%: the pan moved and was not pulled back onto the
      // focus, which is the whole point here. A mark this size can never be
      // contained by a zoomed window, so a redraw that followed the focus
      // would pin the view to it for good and every pan would announce a move
      // it had not made.
      expect(notify).toHaveBeenCalledWith('Zoom 1.5x, centred 67% across and 50% down');
    });
  });

  describe('states it does not draw', () => {
    it('should ignore an empty trace state', () => {
      session.isConnected = true;
      turnOn();

      service.update({ empty: true, type: 'trace' } as unknown as TraceState);

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should ignore a subplot state', () => {
      session.isConnected = true;
      turnOn();

      service.update({ empty: false, type: 'subplot' } as unknown as SubplotState);

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('should contain a render failure so navigation carries on', () => {
      session.isConnected = true;
      turnOn();
      ringsOf.mockImplementation(() => {
        throw new Error('no screen CTM');
      });

      const move = (): void => service.update(traceState(chart, 1));

      expect(move).not.toThrow();
      expect(consoleError).toHaveBeenCalledWith('Tactile render failed:', 'no screen CTM');
    });
  });

  describe('dispose', () => {
    it('should stop responding to the braille toggle', () => {
      activate();
      session.writeGraphic.mockClear();
      session.writeText.mockClear();

      service.dispose();
      toggle.fire({ enabled: false, state: traceState(chart, 1) });

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should stop responding to device keys', () => {
      activate();
      service.zoomIn();
      notify.mockClear();

      service.dispose();
      session.fireKey('panLeft');

      expect(notify).not.toHaveBeenCalled();
    });

    it('should leave the device connected', () => {
      activate();

      service.dispose();

      expect(session.disconnect).not.toHaveBeenCalled();
      expect(session.isConnected).toBe(true);
    });
  });

  describe('setFigure', () => {
    it('should resend a full frame because the cached one no longer applies', () => {
      activate();
      const first = session.writeGraphic.mock.calls[0][0];
      session.writeGraphic.mockClear();

      service.setFigure(createFigure(chart.axes, [chart.marks]));
      service.update(traceState(chart, 1));

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(session.writeGraphic.mock.calls[0][0]).toBe(first);
    });

    it('should reset the zoom so the next move re-measures the whole plot', () => {
      activate();
      const wholePlot = session.writeGraphic.mock.calls[0][0];
      service.zoomIn();
      session.writeGraphic.mockClear();

      service.setFigure(createFigure(chart.axes, [chart.marks]));
      service.update(traceState(chart, 1));

      expect(session.writeGraphic.mock.calls[0][0]).toBe(wholePlot);
    });
  });
});
