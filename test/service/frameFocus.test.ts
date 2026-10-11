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
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });
});

describe('in a frame the host has nothing before', () => {
  beforeEach(() => {
    pretendFramedBy(hostFrame);
    service = new FrameFocusService(plot);
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

describe('when the host element holding the frame cannot take focus', () => {
  it('walks past it rather than leaving the reader in the frame', () => {
    // Shiny's shape: every output is wrapped in a `display: contents` div, and
    // the chart's frame sits directly inside one with no sectioning element
    // anywhere above it. `focus()` on a box that is not rendered is a silent
    // no-op, so a handoff that only made the call would leave the reader in
    // the chart with nothing to show for the keypress.
    hostDocument.body.innerHTML
      = '<div id="page"><div id="wrapper"><span id="frame"></span></div></div>';
    hostFrame = hostDocument.getElementById('frame')!;
    const page = hostDocument.getElementById('page')!;
    const wrapper = hostDocument.getElementById('wrapper')!;
    wrapper.style.display = 'contents';
    // jsdom has no layout, so it would focus an element a browser refuses.
    // Stubbing the call is what reproduces the browser: the call goes through
    // and focus does not move.
    wrapper.focus = (): void => {};

    pretendFramedBy(hostFrame);
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);

    expect(hostDocument.activeElement).toBe(page);
    // And nothing is left behind on the element that refused.
    expect(wrapper.hasAttribute('tabindex')).toBe(false);
  });
});

describe('in a frame the host has something before', () => {
  it('leaves the native tab order alone', () => {
    hostDocument.body.insertBefore(
      Object.assign(hostDocument.createElement('a'), { href: '#earlier' }),
      hostDocument.body.firstChild,
    );
    pretendFramedBy(hostFrame);
    service = new FrameFocusService(plot);

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
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);
  });

  it('steps in anyway when the only thing before it is out of the tab order', () => {
    // A link with a negative tabindex is focusable from script but no tab
    // stop, so Shift + Tab passes it by. It still matches `a[href]`.
    const earlier = hostDocument.createElement('a');
    earlier.href = '#earlier';
    earlier.setAttribute('tabindex', '-1');
    hostDocument.body.insertBefore(earlier, hostDocument.body.firstChild);

    pretendFramedBy(hostFrame);
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);
  });
});

describe('with a host on another origin', () => {
  it('asks the host to take focus, and does not trap the reader when it will not', () => {
    // `frameElement` is null across origins — r-maidr embeds charts through a
    // `data:` URL, whose origin is opaque — so the message is the only channel.
    pretendFramedBy(null);
    const posted = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    service = new FrameFocusService(plot);

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
    service = new FrameFocusService(plot);

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

describe('in a page of its own', () => {
  /**
   * Puts a chart into the test document itself, as a script tag or a binding
   * writes one into a page, inside whatever `around` wraps it.
   * @param {string} around - Markup with `{chart}` where the chart goes
   * @returns {HTMLElement} The chart's plot element, focused
   */
  function chartIn(around: string): HTMLElement {
    const chart = '<article id="maidr-article-c"><figure id="maidr-figure-c">'
      + '<div id="plot" tabindex="0"></div></figure></article>';
    document.body.innerHTML = around.replace('{chart}', chart);
    const element = document.getElementById('plot');
    if (element === null) {
      throw new Error('fixture has no chart');
    }
    element.focus();
    return element;
  }

  beforeEach(() => {
    Object.defineProperty(window, 'self', { value: window.top, configurable: true });
  });

  afterEach(() => {
    delete (window as unknown as { w3c_slidy?: unknown }).w3c_slidy;
  });

  it('leaves Shift + Tab alone on a page that is not a deck, a section around the chart or not', () => {
    // An article, a blog post, Power BI's companion pane: what is above the
    // chart is the page's, or the chart's own wrappers, and the browser's own
    // Shift + Tab is the answer there.
    plot = chartIn('<section id="post"><div class="wrapper">{chart}</div></section>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(plot);
    expect(document.getElementById('post')?.hasAttribute('tabindex')).toBe(false);
  });

  it('hands the reader to the reveal.js slide the chart is the first thing on', () => {
    plot = chartIn('<div class="reveal"><div class="slides"><section id="stack">'
      + '<section id="slide"><div class="cell">{chart}</div></section></section></div></div>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);

    // The innermost section: in a vertical stack, that is the slide in view.
    const slide = document.getElementById('slide');
    expect(document.activeElement).toBe(slide);
    expect(slide?.getAttribute('tabindex')).toBe('-1');
  });

  it('hands the reader to an ioslides slide', () => {
    plot = chartIn('<slides><slide id="slide" class="current"><hgroup><h2>Title</h2></hgroup>'
      + '<article id="content">{chart}</article></slide></slides>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('slide'));
  });

  it('hands the reader to an ioslides slide past the links on the slides before it', () => {
    // ioslides renders every slide and fades out all but the current one,
    // marking none of them hidden: a link on an earlier slide is a tab stop
    // in document order, but not one on screen.
    plot = chartIn('<slides><slide class="far-past"><a href="#a">First</a></slide>'
      + '<slide class="past"><a href="#b">Second</a></slide>'
      + '<slide id="slide" class="current"><article>{chart}</article></slide>'
      + '<slide class="next"><a href="#c">Fourth</a></slide></slides>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('slide'));
  });

  it('hands the reader to the slide past links and buttons taken out of the tab order', () => {
    // pandoc's HTML 4 writer, which slidy decks use, puts a link with a
    // negative tabindex and no aria-hidden on every line of echoed code. It
    // matches `a[href]`, as such a button matches `button`, but Shift + Tab
    // passes both by.
    plot = chartIn('<div class="reveal"><div class="slides"><section id="slide">'
      + '<div class="sourceCode" id="cb1"><pre class="sourceCode r"><code class="sourceCode r">'
      + '<span id="cb1-1"><a href="#cb1-1" tabindex="-1"></a>barplot(x)</span></code></pre></div>'
      + '<button type="button" tabindex="-1">Download</button>'
      + '{chart}</section></div></div>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('slide'));
  });

  it('counts an editable element with no tabindex as a tab stop', () => {
    // Read from the attribute: the `tabIndex` property of an editable element
    // with no tabindex is -1 in Chromium, but Tab stops on it all the same.
    plot = chartIn('<div class="reveal"><div class="slides"><section>'
      + '<div contenteditable="true">Notes</div>{chart}</section></div></div>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });

  it('takes a .slide for a slide only on a page slidy runs on', () => {
    // A carousel's `.slide` is no slide to hand a reader to.
    plot = chartIn('<div class="slide" id="slide">{chart}</div>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(false);
    service.dispose();

    (window as unknown as { w3c_slidy?: unknown }).w3c_slidy = {};
    plot.focus();
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('slide'));
  });

  it('leaves the tab order alone when something reachable comes before the chart', () => {
    plot = chartIn('<a href="#top">Top</a><div class="reveal"><div class="slides">'
      + '<section>{chart}</section></div></div>');
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });

  it('leaves a key inside one of MAIDR\'s dialogs to the dialog', () => {
    plot = chartIn('<div class="reveal"><div class="slides"><section>{chart}</section></div></div>');
    plot.insertAdjacentHTML('afterend', '<div role="dialog"><button id="close">Close</button></div>');
    service = new FrameFocusService(plot);
    // The dialog's button is the first tab stop, so only the dialog test
    // keeps this from handing off.
    plot.removeAttribute('tabindex');
    document.getElementById('close')?.focus();

    expect(pressShiftTab().defaultPrevented).toBe(false);
  });

  it('stands aside when another handler has already taken the key', () => {
    // A binding's own handoff, at the window, runs first.
    plot = chartIn('<div class="reveal"><div class="slides"><section>{chart}</section></div></div>');
    service = new FrameFocusService(plot);
    const takeIt = (event: KeyboardEvent): void => event.preventDefault();
    window.addEventListener('keydown', takeIt, true);

    pressShiftTab();

    expect(document.activeElement).toBe(plot);
    window.removeEventListener('keydown', takeIt, true);
  });

  it('leaves the key to the browser when the slide will not take focus', () => {
    plot = chartIn('<div class="reveal"><div class="slides"><section id="slide">{chart}</section></div></div>');
    const slide = document.getElementById('slide');
    if (slide === null) {
      throw new Error('fixture has no slide');
    }
    slide.focus = (): void => {};
    service = new FrameFocusService(plot);

    expect(pressShiftTab().defaultPrevented).toBe(false);
    expect(slide.hasAttribute('tabindex')).toBe(false);
  });
});
