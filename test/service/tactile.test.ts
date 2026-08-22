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
import type { NonEmptyTraceState, SubplotState, TraceState } from '@type/state';
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
      writeGraphic: jest.fn(),
      writeGraphicRow: jest.fn(),
      writeText: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
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
    },
  };
});

jest.mock('@util/tactile/svgGeometry', () => ({
  TactileSvgGeometry: {
    isRenderable: jest.fn(() => true),
    ringsOf: jest.fn(() => []),
  },
}));

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
  fireKey: (key: DotPadKey) => void;
  fireState: (state: DotPadState) => void;
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
 * @param layers - Each layer's own rendered elements
 */
function createFigure(axesElement: SVGElement | null, layers: SVGElement[][] = [[]]): Figure {
  const traces = layers.map(marks => [{
    getAllHighlightElements: () => marks,
    getAllOriginalElements: () => marks
      .map(mark => mark.previousElementSibling as SVGElement | null)
      .filter((mark): mark is SVGElement => mark !== null),
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
): NonEmptyTraceState {
  return {
    empty: false,
    type: 'trace',
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
    ringsOf.mockReset();
    ringsOf.mockImplementation((element, viewport) => ringFor(element, viewport));

    chart = createChart();
    notify = jest.fn();
    notification = { notify } as unknown as NotificationService;
    // The line carries whatever review mode would read out, so the stub stands
    // in for TextService the same way review does — one description per state,
    // long enough that it needs more than one window on a 20-cell line.
    format = jest.fn((state: NonEmptyTraceState) =>
      `${state.text.main.label} is ${String(state.text.main.value)}, `
      + `${state.text.cross.label} is ${String(state.text.cross.value)}, `
      + `in the bar plot of units sold by fruit`);
    textService = { format } as unknown as TextService;
    toggle = new Emitter<{ enabled: boolean; state: TraceState }>();
    brailleStub = { isEnabled: false, onToggle: toggle.event };

    const braille = brailleStub as Pick<BrailleService, 'isEnabled' | 'onToggle'> as unknown as BrailleService;
    const display = { plot: chart.plot } as unknown as DisplayService;

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
  function activate(focus: number = 1): NonEmptyTraceState {
    brailleStub.isEnabled = true;
    session.isConnected = true;
    const state = traceState(chart, focus);
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

    it('should report that it is active only when braille is on and a device is connected', () => {
      brailleStub.isEnabled = true;
      session.isConnected = false;

      const withoutDevice = service.isActive;
      session.isConnected = true;

      expect(withoutDevice).toBe(false);
      expect(service.isActive).toBe(true);
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
      brailleStub.isEnabled = true;
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
     * The elements the renderer was actually asked to reduce to rings — which
     * is to say, everything that reached the pins.
     */
    function drawnElements(): SVGGraphicsElement[] {
      return ringsOf.mock.calls.map(call => call[0]);
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
      brailleStub.isEnabled = true;
      session.isConnected = true;
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
      brailleStub.isEnabled = true;
      session.isConnected = true;
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

  describe('the braille text line', () => {
    it('should send exactly one payload of the device text width', () => {
      activate();

      expect(session.writeText).toHaveBeenCalledTimes(1);
      expect(session.writeText.mock.calls[0][0]).toHaveLength(GEOMETRY.textCells * 2);
    });

    it('should change the payload when the focused value changes', () => {
      brailleStub.isEnabled = true;
      session.isConnected = true;
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
      brailleStub.isEnabled = true;
      session.isConnected = true;

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

    it('should fall back to its own table when the engine declines', async () => {
      session.canTranslate = true;
      session.translate.mockResolvedValue(null);
      brailleStub.isEnabled = true;
      session.isConnected = true;

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
      brailleStub.isEnabled = true;
      session.isConnected = true;

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
      brailleStub.isEnabled = true;
      session.isConnected = true;
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
      // Mark 0 sits at the left edge, so panning right takes it off the view.
      // The view has to stay where the reader put it: a redraw that follows
      // the focus undoes the very pan that asked for it, and the second step
      // then announces the same position as the first.
      activate(0);
      service.zoomIn();
      service.zoomIn();
      service.zoomIn();
      notify.mockClear();

      session.fireKey('panRight');
      const first = lastAnnouncement();
      session.fireKey('panRight');

      expect(first).toBe('Zoom 3x, centred 67% across and 50% down');
      expect(lastAnnouncement()).toBe('Zoom 3x, centred 83% across and 50% down');
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

      expect(notify).toHaveBeenCalledWith('Zoom 1.5x, centred 67% across and 50% down');
    });
  });

  describe('states it does not draw', () => {
    it('should ignore an empty trace state', () => {
      brailleStub.isEnabled = true;
      session.isConnected = true;

      service.update({ empty: true, type: 'trace' } as unknown as TraceState);

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should ignore a subplot state', () => {
      brailleStub.isEnabled = true;
      session.isConnected = true;

      service.update({ empty: false, type: 'subplot' } as unknown as SubplotState);

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('should contain a render failure so navigation carries on', () => {
      brailleStub.isEnabled = true;
      session.isConnected = true;
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
