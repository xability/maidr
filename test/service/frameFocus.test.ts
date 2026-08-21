/**
 * @jest-environment jsdom
 */

/**
 * Tests for the frame focus handoff.
 *
 * A chart in an iframe hears every key the reader presses and the host page
 * hears none of them, so Shift + Tab off the chart is the reader's way back to
 * the page. Usually the browser handles that by itself; the case this service
 * exists for is the one where it cannot, because nothing reachable precedes
 * the frame in the host — a chart on a Quarto `revealjs` slide, where the deck
 * renders no controls of its own, so the chart is the first thing on the page
 * and from inside it no key reaches the deck.
 *
 * The service therefore has to make two decisions, and both are checked here:
 * whether Shift + Tab is at the frame's own boundary, and whether the host has
 * anywhere real to send the reader. Getting the second one wrong would rewrite
 * the tab order of every notebook and article that embeds a chart, so the
 * "leave it alone" cases matter as much as the fixing one.
 *
 * The DOM this builds is inside out on purpose. The service reads the document
 * it is loaded in as the frame's own, and reaches the host through
 * `window.frameElement`, so the test document plays the frame, and a real
 * child iframe — which has a browsing context, and so computed styles and a
 * live `activeElement` — plays the host.
 */

import { FrameFocusService } from '@service/frameFocus';

jest.useFakeTimers();

/** The host document, standing in for the page the chart is embedded in. */
let hostDocument: Document;
/** The element the host document holds the chart in. */
let hostFrame: HTMLElement;
/** The chart, and the only tab stop in the frame's own document. */
let plot: HTMLElement;
let service: FrameFocusService | null = null;

/**
 * Presents the test document as framed, holding the given host element.
 * @param {HTMLElement | null} frameElement - What `window.frameElement` returns
 */
function pretendFramedBy(frameElement: HTMLElement | null): void {
  // `self`, not `top`: jsdom defines `top` non-configurably, and the service
  // compares the two, so standing either one up answers the same question.
  Object.defineProperty(window, 'self', { value: {}, configurable: true });
  Object.defineProperty(window, 'frameElement', { value: frameElement, configurable: true });
}

/**
 * Sends Shift + Tab to the focused element.
 * @returns {KeyboardEvent} The dispatched event, to read `defaultPrevented` off
 */
function pressShiftTab(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="plot" tabindex="0"></div>';
  plot = document.getElementById('plot')!;

  // A real iframe, so the host document has a browsing context: without one
  // there are no computed styles to read and `focus()` does nothing.
  const carrier = document.createElement('iframe');
  document.body.appendChild(carrier);
  hostDocument = carrier.contentDocument!;
  hostDocument.body.innerHTML = '<section id="slide"><span id="frame"></span></section>';
  hostFrame = hostDocument.getElementById('frame')!;

  plot.focus();
});

afterEach(() => {
  service?.dispose();
  service = null;
});

describe('outside a frame', () => {
  it('leaves Shift + Tab alone', () => {
    Object.defineProperty(window, 'self', { value: window.top, configurable: true });
    service = new FrameFocusService();

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });
});

describe('in a frame the host has nothing before', () => {
  beforeEach(() => {
    pretendFramedBy(hostFrame);
    service = new FrameFocusService();
  });

  it('hands focus to the element holding the frame, in the same event', () => {
    const posted = jest.spyOn(window.parent, 'postMessage');

    expect(pressShiftTab().defaultPrevented).toBe(true);

    // Nothing to wait for: a host whose DOM this frame can reach is served
    // directly, so no message goes out and no deadline is armed.
    const slide = hostDocument.getElementById('slide')!;
    expect(slide.getAttribute('tabindex')).toBe('-1');
    expect(hostDocument.activeElement).toBe(slide);
    expect(posted).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    posted.mockRestore();
  });

  it('ignores Tab in the forward direction, which already lands in the host', () => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    plot.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores Shift + Tab from anywhere but the frame\'s first tab stop', () => {
    const second = document.createElement('button');
    document.body.appendChild(second);
    second.focus();

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });

  it('stops listening once disposed', () => {
    service!.dispose();
    service = null;

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });
});

describe('in a frame the host has something before', () => {
  it('leaves the native tab order alone', () => {
    hostDocument.body.insertBefore(
      Object.assign(hostDocument.createElement('a'), { href: '#earlier' }),
      hostDocument.body.firstChild,
    );
    pretendFramedBy(hostFrame);
    service = new FrameFocusService();

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });

  it('steps in anyway when the only thing before it cannot be reached', () => {
    // The slide deck case: reveal.js leaves the slides on either side of the
    // current one rendered, so the chart on the previous slide is a tab stop
    // in document order even though it is marked hidden and is off screen.
    const previousSlide = hostDocument.createElement('section');
    previousSlide.hidden = true;
    previousSlide.setAttribute('aria-hidden', 'true');
    previousSlide.innerHTML = '<span id="earlier-chart" tabindex="0"></span>';
    hostDocument.body.insertBefore(previousSlide, hostDocument.body.firstChild);

    pretendFramedBy(hostFrame);
    service = new FrameFocusService();

    expect(pressShiftTab().defaultPrevented).toBe(true);
  });
});

describe('with a host on another origin', () => {
  it('asks the host to take focus, and does not trap the reader when it will not', () => {
    // `frameElement` is null across origins — r-maidr embeds charts through a
    // `data:` URL, whose origin is opaque — so the message is the only channel.
    pretendFramedBy(null);
    const posted = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    service = new FrameFocusService();

    expect(pressShiftTab().defaultPrevented).toBe(true);
    expect(posted).toHaveBeenCalledWith(
      { type: 'maidr:frame-focus-escape', direction: 'backward' },
      '*',
    );

    // No host answered, and there is no DOM to fall back to: the chart lets go
    // so the reader's next Shift + Tab does what the browser would have done.
    jest.advanceTimersByTime(100);
    expect(document.activeElement).not.toBe(plot);

    posted.mockRestore();
  });

  it('asks once while a handoff is in flight, however long the key is held', () => {
    pretendFramedBy(null);
    const posted = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    service = new FrameFocusService();

    plot.focus();
    pressShiftTab();
    pressShiftTab();
    pressShiftTab();

    // Re-arming the deadline on every auto-repeat would hold the handoff off
    // for as long as the reader keeps the key down.
    expect(posted).toHaveBeenCalledTimes(1);

    posted.mockRestore();
  });
});
