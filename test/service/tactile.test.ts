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
 * The marks' client rectangles. Mark 1 is deliberately small and centred, so a
 * pan step does not take it out of the window and trigger the follow-the-focus
 * recentring that would undo the pan under test.
 */
const MARK_RECTS = [
  { left: 20, top: 20, width: 10, height: 10 },
  { left: 90, top: 45, width: 10, height: 10 },
  { left: 160, top: 70, width: 10, height: 10 },
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
 * A square ring in dot coordinates, one per mark, far enough apart that a
 * change of focus changes the frame.
 * @param element - The mark being reduced
 */
function ringFor(element: SVGGraphicsElement): DotRing[] {
  const index = Number.parseInt(element.getAttribute('data-index') ?? '0', 10);
  const left = 4 + index * 10;
  return [{
    points: [
      { x: left, y: 10 },
      { x: left + 6, y: 10 },
      { x: left + 6, y: 16 },
      { x: left, y: 16 },
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
 * A figure whose active subplot points at the given axes element.
 * @param axesElement - The axes group, or null to fall back to the whole SVG
 */
function createFigure(axesElement: SVGElement | null): Figure {
  return { activeSubplot: { axesElement } } as unknown as Figure;
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
    session.writeGraphic.mockClear();
    session.writeGraphicRow.mockClear();
    session.writeText.mockClear();
    session.disconnect.mockClear();
    ringsOf.mockReset();
    ringsOf.mockImplementation(element => ringFor(element));

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

    service = new TactileService(display, braille, notification, textService, createFigure(chart.axes));
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

    it('should fall back to the whole SVG when the subplot exposes no axes element', () => {
      const braille = brailleStub as Pick<BrailleService, 'isEnabled' | 'onToggle'> as unknown as BrailleService;
      const display = { plot: chart.plot } as unknown as DisplayService;
      service.dispose();
      service = new TactileService(display, braille, notification, textService, createFigure(null));

      activate();

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
    });

    it('should write nothing when the chart region has no size', () => {
      stubRect(chart.axes, { left: 0, top: 0, width: 0, height: 0 });

      activate();

      expect(session.writeGraphic).not.toHaveBeenCalled();
      expect(session.writeText).not.toHaveBeenCalled();
    });

    it('should redraw from the last state when a device connects', () => {
      brailleStub.isEnabled = true;
      service.update(traceState(chart, 1));
      session.isConnected = true;

      session.fireState({ status: 'connected', deviceName: 'DotPad 320', transport: 'bluetooth', geometry: GEOMETRY, message: '' });

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
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

      service.setFigure(createFigure(chart.axes));
      service.update(traceState(chart, 1));

      expect(session.writeGraphic).toHaveBeenCalledTimes(1);
      expect(session.writeGraphic.mock.calls[0][0]).toBe(first);
    });

    it('should reset the zoom so the next move re-measures the whole plot', () => {
      activate();
      const wholePlot = session.writeGraphic.mock.calls[0][0];
      service.zoomIn();
      session.writeGraphic.mockClear();

      service.setFigure(createFigure(chart.axes));
      service.update(traceState(chart, 1));

      expect(session.writeGraphic.mock.calls[0][0]).toBe(wholePlot);
    });
  });
});
