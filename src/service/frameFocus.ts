import type { Disposable } from '@type/disposable';

/**
 * The message an embedded chart posts to its host when the reader tabs back
 * out of it and the host must decide where focus goes.
 *
 * A host that embeds MAIDR in a cross-origin frame — an `src="data:…"` frame
 * has an opaque origin, which is what r-maidr's knitr output uses — cannot be
 * reached through the DOM, so the frame asks for the handoff instead of
 * performing it. Same-origin hosts need no listener: the fallback below does
 * the same thing from this side.
 */
export const FRAME_FOCUS_ESCAPE_MESSAGE = 'maidr:frame-focus-escape';

/**
 * How long to wait for the host to answer the message before falling back.
 *
 * Only the fallback path pays this, and only in a frame whose host has no
 * listener: a host that handles the message takes focus in the same event-loop
 * turn the message is delivered in.
 */
const HOST_RESPONSE_TIMEOUT_MS = 50;

/**
 * Elements that can hold DOM focus by keyboard, as a selector.
 *
 * `[tabindex="-1"]` is deliberately absent: those take focus programmatically
 * but are not tab stops, so they are neither a boundary of this frame nor
 * somewhere Shift + Tab could land in the host.
 */
const TABBABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

/**
 * The kind of host element the reader is handed back to.
 *
 * A reveal.js slide is a `<section>`, so a chart on a slide hands focus back to
 * the slide itself: the reader hears which slide they landed on, and the deck's
 * own shortcuts work again, because the keydown now reaches the host document
 * that listens for them.
 *
 * Page-level landmarks — `<main>`, `role="main"` — are deliberately absent.
 * They match in hosts that section nothing else, a notebook among them, and
 * handing a reader the whole page when they stepped out of one chart tells
 * them less about where they are than the chart's own wrapper does, which is
 * what `parentElement` falls back to.
 */
const HOST_CONTAINER_SELECTOR = 'section,article,[role="region"]';

/**
 * Keeps a chart in a frame from stranding the reader when they tab back out.
 *
 * A chart in an iframe swallows every key it is sent: keyboard events do not
 * cross a frame boundary, so while the reader is inside the chart the page
 * around it hears nothing. That is right while they are reading — MAIDR binds
 * the arrows, Space, Backspace, Page Up and Page Down itself — which leaves
 * Shift + Tab as the way back to the page.
 *
 * Usually the browser handles that on its own: Shift + Tab at the frame's first
 * tab stop moves to whatever precedes the frame in the host. But when nothing
 * usable precedes it, focus leaves the document altogether for the browser's
 * own UI, and the page cannot be driven from the keyboard until the reader tabs
 * all the way back in. A chart on a Quarto `revealjs` slide is exactly that
 * case: the deck's own controls are not rendered, so a chart is the first thing
 * on the page, and from inside it no key reaches the deck.
 *
 * So this service watches for Shift + Tab at the frame's first tab stop, and
 * steps in *only* when the browser would strand the reader, handing focus to
 * the element that holds the frame — the slide, in a deck. Where the host has
 * somewhere real to go, the native tab order is left exactly as it was, and Tab
 * in the forward direction is never touched.
 *
 * Nothing happens outside a frame, and nothing here can trap a reader: if the
 * handoff cannot be completed, the focused element is blurred so the next
 * Shift + Tab does what the browser would have done in the first place.
 */
export class FrameFocusService implements Disposable {
  private readonly onKeyDown: (event: KeyboardEvent) => void;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Creates the service and, when the document is framed, starts listening.
   */
  public constructor() {
    this.onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);
    if (FrameFocusService.isFramed()) {
      // Capture phase: `hotkeys-js` listens on `document` in the bubble phase,
      // and the modal components listen on their own subtrees. Neither binds
      // Tab today, but running first keeps this independent of that.
      document.addEventListener('keydown', this.onKeyDown, true);
    }
  }

  /**
   * Stops listening and cancels a pending fallback.
   */
  public dispose(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  /**
   * Whether this document is displayed inside a frame.
   * @returns {boolean} True when the document has a parent browsing context
   */
  private static isFramed(): boolean {
    try {
      return window.self !== window.top;
    } catch {
      // Reading `window.top` across origins throws in some browsers, and it
      // only throws when there *is* a cross-origin ancestor — so being here
      // is itself the answer.
      return true;
    }
  }

  /**
   * Hands focus back to the host when Shift + Tab would otherwise leave the
   * document.
   * @param {KeyboardEvent} event - The keydown being inspected
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (event.defaultPrevented || !this.isAtFirstTabStop()) {
      return;
    }

    const frame = FrameFocusService.hostFrameElement();
    if (frame !== null && FrameFocusService.hasTabStopBefore(frame)) {
      // The host has somewhere real to send them. Leave the tab order alone.
      return;
    }

    event.preventDefault();
    this.requestHostFocus();
  }

  /**
   * Whether the focused element is the first thing Tab reaches in this frame.
   *
   * Anything inside a modal is excluded: a dialog cycles focus within itself,
   * so its first element is a boundary of the dialog, not of the frame.
   * @returns {boolean} True when Shift + Tab from here would leave the frame
   */
  private isAtFirstTabStop(): boolean {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) {
      return false;
    }
    if (active.closest('[role="dialog"],[aria-modal="true"]') !== null) {
      return false;
    }

    const stops = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR))
      .filter(element => FrameFocusService.isReachable(element));
    return stops.length > 0 && stops[0] === active;
  }

  /**
   * Whether the host has a tab stop of its own ahead of this frame.
   *
   * "Ahead" is document order, which is what Shift + Tab follows. A stop the
   * reader cannot actually reach does not count, and that distinction is the
   * whole point in a slide deck: reveal.js leaves the slides on either side of
   * the current one rendered, so the chart on the previous slide is a tab stop
   * in document order even though it is marked hidden and is not on screen.
   * @param {Element} frame - This document's frame, in the host's DOM
   * @returns {boolean} True when Shift + Tab has somewhere real to land
   */
  private static hasTabStopBefore(frame: Element): boolean {
    const stops = Array.from(frame.ownerDocument.querySelectorAll(TABBABLE_SELECTOR));
    const index = stops.indexOf(frame);
    return stops
      .slice(0, index < 0 ? stops.length : index)
      .some(stop => FrameFocusService.isReachable(stop));
  }

  /**
   * Whether an element is rendered and exposed, and so can be tabbed to.
   * @param {Element} element - The candidate tab stop
   * @returns {boolean} True when the element takes part in the tab order
   */
  private static isReachable(element: Element): boolean {
    if (element.closest('[hidden],[aria-hidden="true"],[inert]') !== null) {
      return false;
    }
    const view = element.ownerDocument.defaultView;
    if (view === null) {
      return false;
    }
    const style = view.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  /**
   * Moves focus into the host, by whichever channel that host allows.
   */
  private requestHostFocus(): void {
    if (FrameFocusService.hostFrameElement() !== null) {
      // The host's DOM is reachable, which is both faster and surer than
      // asking: focus moves in this same event, with nothing to wait for.
      this.focusHostContainer();
      return;
    }

    // A host on another origin can only be asked. Once a handoff is in flight
    // there is nothing to add by asking again — which is what a held Shift +
    // Tab would otherwise do on every auto-repeat, pushing the deadline out
    // for as long as the key is down.
    if (this.fallbackTimer !== null) {
      return;
    }

    try {
      window.parent.postMessage({ type: FRAME_FOCUS_ESCAPE_MESSAGE, direction: 'backward' }, '*');
    } catch {
      // A host that refuses messages still gets the fallback below.
    }

    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      // The host took focus if this document no longer has it. Checking the
      // outcome rather than waiting for an acknowledgement keeps hosts that
      // handle the message without answering it — the common case — working.
      if (document.hasFocus()) {
        this.focusHostContainer();
      }
    }, HOST_RESPONSE_TIMEOUT_MS);
  }

  /**
   * Moves focus to the element that holds this frame in the host document.
   *
   * Reaches the host's DOM directly, which `rules/service.md` otherwise
   * reserves for the services that own their own output. The rule's remedy —
   * fire an event and let a ViewModel render the result — cannot apply here:
   * the element focus has to land on belongs to another document, which no
   * ViewModel of ours renders and no React tree of ours contains. Writing to
   * it is the whole operation, so there is nothing left to delegate.
   *
   * Falls back to letting go of focus when the host cannot be reached, which
   * is the cross-origin case the posted message exists for.
   */
  private focusHostContainer(): void {
    const frame = FrameFocusService.hostFrameElement();
    if (frame !== null) {
      for (const candidate of FrameFocusService.hostCandidates(frame)) {
        if (FrameFocusService.takeFocus(candidate)) {
          return;
        }
      }
    }

    // Nothing in the host would take it. Blurring means the next Shift + Tab
    // behaves as it would have without this service, so the reader is left no
    // worse off than before — never trapped.
    (document.activeElement as HTMLElement | null)?.blur();
  }

  /**
   * The host elements worth handing focus to, nearest meaningful first.
   *
   * The whole ancestor chain follows the sectioning element, because the
   * nearest wrapper is not always able to hold focus: Shiny wraps every output
   * in a `display: contents` div, which has no box for focus to land in, and
   * the chart's frame sits directly inside one.
   * @param {Element} frame - This document's frame, in the host's DOM
   * @returns {Element[]} Candidates in the order they should be tried
   */
  private static hostCandidates(frame: Element): Element[] {
    const section = frame.closest(HOST_CONTAINER_SELECTOR);
    const candidates = section === null ? [] : [section];
    for (let element = frame.parentElement; element !== null; element = element.parentElement) {
      if (element !== section) {
        candidates.push(element);
      }
    }
    return candidates;
  }

  /**
   * Gives a host element focus, and reports whether it actually took it.
   *
   * Asking is not enough: `focus()` on an element with no rendered box — a
   * `display: contents` wrapper, most of all — is a silent no-op, so a caller
   * that only checked the call went through would leave the reader inside the
   * frame with nothing to show for the keypress. Reading `activeElement` back
   * is what tells the two apart.
   *
   * A `tabindex` this added is removed again when the element refuses, so a
   * host that cannot hold focus is not left carrying an attribute that says it
   * can.
   * @param {Element} element - An element belonging to the host document
   * @returns {boolean} True when the element now holds focus
   */
  private static takeFocus(element: Element): boolean {
    // Duck-typed: everything reached through `frameElement` lives in the host's
    // realm, where `instanceof HTMLElement` — which resolves to *this* frame's
    // constructor — is false for every element the host owns.
    if (typeof (element as HTMLElement).focus !== 'function') {
      return false;
    }

    // `tabindex="-1"` makes the element focusable without adding a tab stop to
    // the host's own order.
    const added = !element.hasAttribute('tabindex');
    if (added) {
      element.setAttribute('tabindex', '-1');
    }

    (element as HTMLElement).focus();
    if (element.ownerDocument.activeElement === element) {
      return true;
    }

    if (added) {
      element.removeAttribute('tabindex');
    }
    return false;
  }

  /**
   * The frame element holding this document, when the host is reachable.
   *
   * Null across origins — a `src="data:…"` frame has an opaque origin, so this
   * is exactly where the posted message is the only way through.
   * @returns {Element | null} The host's `<iframe>`, or null across origins
   */
  private static hostFrameElement(): Element | null {
    try {
      return window.frameElement;
    } catch {
      return null;
    }
  }
}
