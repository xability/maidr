import type { Disposable } from '@type/disposable';
import { Constant } from '@util/constant';

/**
 * Keeps the shortcuts of the page around a chart off the keys the reader
 * presses in it.
 *
 * A chart alone in a frame never met this: no key it was sent reached the
 * page. A chart written into the page itself -- a Quarto or R Markdown slide,
 * a website with a search box, a dashboard card -- shares every key with the
 * page, and each of those pages acts on keys MAIDR uses: the arrow keys turn
 * the slide, `/` and `f` open the site's search, Escape leaves the card's full
 * screen. MAIDR listens for its keys on the document in the bubble phase and
 * does not stop them, so no listener here can keep a key from the page
 * without keeping it from MAIDR too. Each guard instead answers where the page
 * itself asks whether to act, and answers "no" only while the focus is in a
 * chart, so a page with no chart focused behaves exactly as it would without
 * MAIDR.
 *
 * Each guard looks for its host's own global first, so a chart alone in a
 * frame, which has none, is left alone without a frame test, while a whole
 * page in a frame -- Quarto's preview in an editor, an embedded deck -- has
 * them and is guarded.
 *
 * The patches are never undone. They do nothing while no chart has focus, and
 * unwrapping in the wrong order would drop whatever a binding or the page
 * wrapped on top of them later.
 */

/** A chart MAIDR mounted, wherever it is in the page. */
const CHART_SELECTOR = `article[id^="${Constant.MAIDR_ARTICLE}-"]`;

/**
 * What a guarded object carries, so a second copy of this module -- maidr.js
 * and an adapter bundle on one page, or maidr.js loaded twice -- does not wrap
 * it again.
 *
 * A string property rather than a module-level `WeakSet` or `Symbol`, which
 * each copy of the module would have its own of. The other two are the ones
 * py-maidr's `inline.js` and r-maidr's `knitr-inline.js` set on the same
 * objects for their own copies of these guards: they are honoured, so a guard
 * either binding installed first is not wrapped again, and set, so a binding
 * that runs later skips what is guarded here. Both bindings' tests for "in a
 * chart" include this one's, so whichever installs first answers the same.
 *
 * They are only ever written on the objects guarded. On `window`, the same
 * names are the bindings' own once-guards, and setting one would stop that
 * binding's script from running at all.
 */
const GUARD_MARKERS = ['__maidrHostGuard', '__maidrInline', '__maidrKnitr'] as const;

/**
 * The namespace of the card component Quarto dashboards and Shiny share.
 *
 * Joined at runtime because the four-letter start of its name must appear
 * nowhere in the built bundle: Quarto's dashboard filter lifts any cell
 * output that matches it out of its card, and py-maidr writes maidr.js into a
 * cell when it bundles the script. A minifier folds `'bs' + 'lib'`, a template
 * literal and `String.fromCharCode` back into the plain name; it leaves a
 * joined array alone. `scripts/build.js` fails the build if the name leaks.
 */
const CARD_NAMESPACE = ['bs', 'lib'].join('');

/** The reveal.js API this reads, in reveal.js 3, 4 and 5. */
interface RevealApi {
  getConfig?: () => { keyboardCondition?: unknown } | undefined;
  isReady?: () => boolean;
  isFocused?: () => boolean;
  on?: (type: string, listener: () => void) => void;
  addEventListener?: (type: string, listener: () => void) => void;
  hasPlugin?: (id: string) => boolean;
}

/** Where Mousetrap keeps the test it runs before every shortcut. */
interface MousetrapHost {
  stopCallback?: (this: unknown, ...args: unknown[]) => unknown;
}

/** Mousetrap 1.5 and later (a constructor), or 1.4 (a plain object). */
interface MousetrapApi extends MousetrapHost {
  prototype?: MousetrapHost;
}

/** The ioslides deck's constructor. */
interface SlideDeckApi {
  prototype?: { onBodyKeyDown_?: (this: unknown, ...args: unknown[]) => unknown };
}

/** The part of slidy's one global object this reads. */
interface SlidyApi {
  special_element?: (this: unknown, element: Element) => unknown;
}

/** A flexdashboard storyboard's Sly. */
interface SlyApi {
  getInstance?: (element: Element) => { options?: unknown } | undefined;
}

/** A card component instance, as its namespace hands it out. */
interface CardInstance {
  _exitFullScreenOnEscape?: (this: unknown, event: KeyboardEvent) => unknown;
}

/** The card component's namespace. */
interface CardNamespace {
  Card?: { getInstance?: (element: Element) => CardInstance | undefined };
}

/** The globals of the hosts guarded here, none of which MAIDR declares. */
interface HostGlobals {
  Reveal?: RevealApi;
  RevealSearch?: unknown;
  quartoOpenSearch?: (this: unknown, ...args: unknown[]) => unknown;
  Mousetrap?: MousetrapApi;
  SlideDeck?: SlideDeckApi;
  w3c_slidy?: SlidyApi;
  Sly?: SlyApi;
}

/**
 * The page's globals, as the hosts guarded here leave them.
 * @returns {HostGlobals} The window, typed for what this reads
 */
function host(): HostGlobals {
  return window as unknown as HostGlobals;
}

/**
 * Whether a node is in a chart, its dialogs included: MAIDR renders those
 * inside the chart's figure.
 * @param {unknown} node - The node to test
 * @returns {boolean} True for a node inside a chart's article
 */
function inChart(node: unknown): boolean {
  return node instanceof Element && node.closest(CHART_SELECTOR) !== null;
}

/**
 * Whether the reader's focus is in a chart.
 * @returns {boolean} True while the focused element is inside a chart
 */
function focusInChart(): boolean {
  return inChart(document.activeElement);
}

/**
 * Whether this module, another copy of it, or a binding has guarded an object.
 * @param {object} target - The object a guard would wrap
 * @returns {boolean} True when any of the markers is set on it
 */
function isGuarded(target: object): boolean {
  const record = target as Record<string, unknown>;
  return GUARD_MARKERS.some(marker => Boolean(record[marker]));
}

/**
 * Marks an object guarded, for this module and for both bindings.
 *
 * Not enumerable, so a host that copies its options or its instance with
 * `$.extend` or a spread does not carry the marker to an object nothing
 * guarded. Writable, because py-maidr clears its own marker when a deck turns
 * out to have no way to say it is ready.
 * @param {object} target - The object just guarded
 */
function markGuarded(target: object): void {
  for (const marker of GUARD_MARKERS) {
    Object.defineProperty(target, marker, { value: true, writable: true, configurable: true });
  }
}

/**
 * reveal.js reads `keyboardCondition` on every keydown, from the live config
 * `getConfig()` returns, so it is set on that object rather than through
 * `configure()`. `configure()` re-applies the whole config once the deck is
 * ready: it reshuffles a shuffled deck, restarts auto-slide and rebinds the
 * preview links, which no reader asked for. Setting the property has none of
 * those effects, so this is safe at any time; reveal.js's own menu plugin
 * extends the condition the same way.
 *
 * Whatever the deck set is kept: a function of its own, or `'focused'`.
 */
function guardReveal(): void {
  const reveal = host().Reveal;
  if (!reveal || isGuarded(reveal)) {
    return;
  }

  const apply = (): void => {
    const config = typeof reveal.getConfig === 'function' ? reveal.getConfig() : undefined;
    if (!config || typeof config !== 'object') {
      return;
    }
    const previous = config.keyboardCondition;
    config.keyboardCondition = function (this: unknown, event: KeyboardEvent): unknown {
      if (focusInChart()) {
        return false;
      }
      if (typeof previous === 'function') {
        return (previous as (this: unknown, event: KeyboardEvent) => unknown).call(this, event);
      }
      if (previous === 'focused' && typeof reveal.isFocused === 'function') {
        return reveal.isFocused();
      }
      return true;
    };
  };

  // Before `Reveal.initialize()`, reveal.js 4 and 5 answer `isReady()` with
  // false and queue `on()` until the deck exists; reveal.js 3 has no `on()`.
  if (typeof reveal.isReady === 'function' && reveal.isReady()) {
    apply();
  } else if (typeof reveal.on === 'function') {
    reveal.on('ready', apply);
  } else if (typeof reveal.addEventListener === 'function') {
    reveal.addEventListener('ready', apply);
  } else {
    // Nothing to wait on: left unmarked, so a later install can try again.
    return;
  }
  markGuarded(reveal);
}

/**
 * The search of a Quarto website or book opens on `f`, `s` or `/` outside a
 * form field, through `window.quartoOpenSearch`, which Quarto looks up each
 * time a key is let go.
 */
function guardQuartoSearch(): void {
  const globals = host();
  const open = globals.quartoOpenSearch;
  if (typeof open !== 'function' || isGuarded(open)) {
    return;
  }
  const guarded = function (this: unknown, ...args: unknown[]): unknown {
    if (focusInChart()) {
      return undefined;
    }
    return open.apply(this, args);
  };
  markGuarded(guarded);
  globals.quartoOpenSearch = guarded;
}

/**
 * Mousetrap (bookdown's gitbook: the arrow keys turn the page, `s` toggles
 * the sidebar, `f` opens the search) asks `stopCallback` before every
 * shortcut. It lives on the prototype from Mousetrap 1.5, and on the one
 * object before that.
 */
function guardMousetrap(): void {
  const mousetrap = host().Mousetrap;
  if (!mousetrap || isGuarded(mousetrap)) {
    return;
  }
  const owner = typeof mousetrap.prototype?.stopCallback === 'function'
    ? mousetrap.prototype
    : mousetrap;
  const previous = owner.stopCallback;
  if (typeof previous !== 'function') {
    return;
  }
  owner.stopCallback = function (this: unknown, ...args: unknown[]): unknown {
    if (inChart(args[1]) || focusInChart()) {
      return true;
    }
    return previous.apply(this, args);
  };
  markGuarded(mousetrap);
}

/**
 * ioslides listens for keydown on the document in the capture phase, from a
 * handler it binds when the deck is built at `DOMContentLoaded`. Binding
 * copies the method, so it is wrapped on the prototype, which only works when
 * this runs before the deck is built: `src/index.tsx` installs the guards as
 * soon as the bundle is evaluated for that reason.
 */
function guardIoslides(): void {
  const slideDeck = host().SlideDeck;
  const prototype = slideDeck?.prototype;
  if (!slideDeck || !prototype || isGuarded(slideDeck)) {
    return;
  }
  const previous = prototype.onBodyKeyDown_;
  if (typeof previous !== 'function') {
    return;
  }
  prototype.onBodyKeyDown_ = function (this: unknown, ...args: unknown[]): unknown {
    if (focusInChart()) {
      return undefined;
    }
    return previous.apply(this, args);
  };
  markGuarded(slideDeck);
}

/**
 * slidy leaves a key alone when `special_element` says the element it was
 * pressed on wants keys of its own. Every element in a chart does: the plot,
 * and the buttons, tabs and lists of MAIDR's dialogs, none of which slidy's
 * own test (an `onkeydown` property, or a tag name from a short list) knows.
 */
function guardSlidy(): void {
  const slidy = host().w3c_slidy;
  if (!slidy || isGuarded(slidy)) {
    return;
  }
  const previous = slidy.special_element;
  if (typeof previous !== 'function') {
    return;
  }
  slidy.special_element = function (this: unknown, element: Element): unknown {
    return focusInChart() || inChart(element) || previous.call(this, element);
  };
  markGuarded(slidy);
}

/**
 * A flexdashboard storyboard's Sly moves between frames on the arrow keys,
 * from a listener on the document that does not look at the focus. It reads
 * `options.keyboardNavBy` on every key press, which reads as `null` -- no
 * keyboard navigation -- while the focus is in a chart.
 */
function guardSly(): void {
  const sly = host().Sly;
  if (!sly || typeof sly.getInstance !== 'function') {
    return;
  }
  for (const frame of document.querySelectorAll('.sbframelist')) {
    const options = sly.getInstance(frame)?.options;
    if (options === null || typeof options !== 'object' || isGuarded(options)) {
      continue;
    }
    guardSlyOptions(options);
  }
}

/**
 * Wraps whatever `keyboardNavBy` already is, without reading it.
 *
 * Reading it once, as r-maidr's guard does, is how a storyboard loses its
 * keys: a getter some other guard installed answers `null` while the focus is
 * in a chart -- which it is whenever a chart's controller installs this --
 * and the storyboard would keep that `null` for good. So the getter reads the
 * original each time, and the setter writes to it, keeping Sly's own
 * assignments.
 * Enumerability is kept, so the option still shows up wherever Sly copies its
 * options.
 * @param {object} options - A Sly instance's options
 */
function guardSlyOptions(options: object): void {
  const descriptor = Object.getOwnPropertyDescriptor(options, 'keyboardNavBy');
  if (descriptor?.configurable === false) {
    return;
  }

  let value: unknown = descriptor?.value;
  const getter = descriptor?.get;
  const setter = descriptor?.set;
  const accessor = getter !== undefined || setter !== undefined;
  const read = (): unknown => (getter ? getter.call(options) : accessor ? undefined : value);
  let write: ((next: unknown) => void) | undefined;
  if (accessor) {
    write = setter ? (next: unknown): void => setter.call(options, next) : undefined;
  } else if (descriptor?.writable !== false) {
    write = (next: unknown): void => {
      value = next;
    };
  }

  Object.defineProperty(options, 'keyboardNavBy', {
    configurable: true,
    enumerable: descriptor?.enumerable ?? true,
    get: (): unknown => (focusInChart() ? null : read()),
    set: write,
  });
  markGuarded(options);
}

/** The page-level guards, in the order they are installed. */
const PAGE_GUARDS: ReadonlyArray<() => void> = [
  guardIoslides,
  guardReveal,
  guardQuartoSearch,
  guardMousetrap,
  guardSlidy,
  guardSly,
];

/**
 * Guards every host on the page that has a shortcut a chart's keys would
 * trigger.
 *
 * Idempotent and cheap, so it can be called whenever a host may have appeared:
 * when the bundle is evaluated (ioslides builds its deck at
 * `DOMContentLoaded`), at `DOMContentLoaded` and `load` (reveal.js, Quarto's
 * search), and whenever a chart takes focus (a storyboard built later, and
 * the React and adapter bundles, which have no entry script to call this).
 */
export function installHostGuards(): void {
  for (const guard of PAGE_GUARDS) {
    try {
      guard();
    } catch (error) {
      // One host whose objects are not what this expects must not keep the
      // others, or the chart, from working.
      console.warn('[maidr] Could not guard a host page\'s shortcuts:', error);
    }
  }
}

/**
 * Wraps the Escape handler of a full-screen card around a chart.
 *
 * The card leaves full screen on Escape pressed anywhere, through a document
 * listener it keeps on its instance and adds when it enters full screen.
 * Escape pressed in the chart closes MAIDR's own modes instead. A card that is
 * already full screen has the old handler on the document, so it is swapped.
 * @param {CardNamespace['Card']} card - The card component class
 * @param {Element} element - A card element around the chart
 */
function guardCard(card: NonNullable<CardNamespace['Card']>, element: Element): void {
  const instance = card.getInstance?.(element);
  if (!instance || isGuarded(instance)) {
    return;
  }
  const previous = instance._exitFullScreenOnEscape;
  if (typeof previous !== 'function') {
    return;
  }
  const guarded = function (event: KeyboardEvent): unknown {
    if (inChart(event.target)) {
      return undefined;
    }
    return previous.call(instance, event);
  };
  if (element.getAttribute('data-full-screen') === 'true') {
    document.removeEventListener('keydown', previous as EventListener, false);
    document.addEventListener('keydown', guarded, false);
  }
  instance._exitFullScreenOnEscape = guarded;
  markGuarded(instance);
}

/**
 * Whether an element takes typed text.
 * @param {Element} element - The element a key was pressed on
 * @returns {boolean} True for a form field or an editable region
 */
function isEditable(element: Element): boolean {
  return (element instanceof HTMLElement && element.isContentEditable)
    || element.matches('input, textarea, select');
}

/**
 * Keeps the shortcuts of the page off one chart while it has the focus.
 *
 * Built with the chart's controller, so it exists exactly while a reader is
 * in the chart. It installs the page-level guards again, for a host built
 * after load, guards the cards around this chart, and listens for the few
 * keys no host asks about first.
 *
 * Like `FrameFocusService`, it writes to the host page, which
 * `rules/service.md` otherwise reserves for services that own their output.
 * The rule's remedy -- fire an event and let a ViewModel render the result --
 * cannot apply: every object written to belongs to the page around the
 * chart, which no ViewModel renders. Wrapping the page's own handlers is the
 * whole operation.
 */
export class HostGuardService implements Disposable {
  private readonly article: Element | null;
  private readonly root: HTMLElement | null;
  private readonly isBound: (event: KeyboardEvent) => boolean;
  private readonly onWindowKeyDown: (event: KeyboardEvent) => void;
  private readonly onPageKeyDown: (event: KeyboardEvent) => void;
  private readonly onRootKeyDown: (event: KeyboardEvent) => void;

  /**
   * Guards the page's hosts, the cards around the chart, and starts listening.
   * @param {HTMLElement} plot - The chart's focusable plot element
   * @param {(event: KeyboardEvent) => boolean} isBound - Whether the reader's
   *   keymap, in the scope they are in, binds the key an event carries
   */
  public constructor(plot: HTMLElement, isBound: (event: KeyboardEvent) => boolean) {
    this.article = plot.closest(CHART_SELECTOR);
    this.isBound = isBound;
    this.onWindowKeyDown = (event: KeyboardEvent): void => this.handleWindowKeyDown(event);
    this.onPageKeyDown = (event: KeyboardEvent): void => this.handlePageKeyDown(event);
    this.onRootKeyDown = (event: KeyboardEvent): void => HostGuardService.handleRootKeyDown(event);

    installHostGuards();
    HostGuardService.guardCards(plot);

    // Window capture runs before every listener in the document, ioslides'
    // and pkgdown's capture-phase ones included.
    window.addEventListener('keydown', this.onWindowKeyDown, true);

    // The root element, in the bubble phase, runs after React, which listens
    // on the element its root was created on, inside the page; and before the
    // document, where reveal.js's search plugin and MAIDR's shortcuts listen.
    document.documentElement.addEventListener('keydown', this.onPageKeyDown);

    // Only a chart bound from the page, whose React root is the element
    // MAIDR made around the article. In a React app the root is the app's
    // own, and stopping a key there would hide it from the app.
    const parent = this.article?.parentElement ?? null;
    this.root = parent?.hasAttribute(Constant.MAIDR_EMBED) ? parent : null;
    this.root?.addEventListener('keydown', this.onRootKeyDown);
  }

  /**
   * Stops listening. The page-level guards stay, doing nothing while no chart
   * has focus.
   */
  public dispose(): void {
    window.removeEventListener('keydown', this.onWindowKeyDown, true);
    document.documentElement.removeEventListener('keydown', this.onPageKeyDown);
    this.root?.removeEventListener('keydown', this.onRootKeyDown);
  }

  /**
   * Guards every full-screen card around the chart.
   *
   * Found by the attribute the card component keeps its state in, rather than
   * by its class, whose name the bundle must not spell; see
   * {@link CARD_NAMESPACE}.
   * @param {Element} plot - The chart's plot element
   */
  private static guardCards(plot: Element): void {
    const namespace = (window as unknown as Record<string, unknown>)[CARD_NAMESPACE] as CardNamespace | undefined;
    const card = namespace?.Card;
    if (!card || typeof card.getInstance !== 'function') {
      return;
    }
    for (
      let element = plot.closest('[data-full-screen]');
      element !== null;
      element = element.parentElement?.closest('[data-full-screen]') ?? null
    ) {
      try {
        guardCard(card, element);
      } catch (error) {
        console.warn('[maidr] Could not guard a full-screen card\'s Escape key:', error);
      }
    }
  }

  /**
   * Keeps pkgdown's search box from taking the focus on `/`, before any
   * listener in the document hears the key.
   *
   * pkgdown moves the focus to the box on `/`, which MAIDR reads as "reset
   * speed" on the chart, and from its braille field. The box cannot take the
   * focus while it is disabled, for the one task in which pkgdown's handler
   * runs.
   * @param {KeyboardEvent} event - A keydown anywhere in the page
   */
  private handleWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== '/' || !this.article?.contains(document.activeElement)) {
      return;
    }
    const search = document.getElementById('search-input');
    if (search instanceof HTMLInputElement && !search.disabled) {
      search.disabled = true;
      setTimeout(() => {
        search.disabled = false;
      }, 0);
    }
  }

  /**
   * Keeps reveal.js's search plugin from opening on its shortcut, Ctrl+Shift+F
   * (Cmd on a Mac), pressed in the chart. The plugin listens on the document,
   * where `keyboardCondition` does not reach.
   *
   * Stopped only once MAIDR's own fields have had the key: a reader recording
   * it as a shortcut of their own presses it in the settings dialog, whose
   * recorder is a React handler. Stopping it hides it from MAIDR's shortcuts
   * as well, so only when the deck has the plugin and the reader has not bound
   * the key to something in MAIDR.
   * @param {KeyboardEvent} event - A keydown that MAIDR's fields let through
   */
  private handlePageKeyDown(event: KeyboardEvent): void {
    if (!this.article?.contains(document.activeElement)) {
      return;
    }
    if (HostGuardService.isRevealSearchKey(event) && HostGuardService.hasRevealSearch() && !this.isBound(event)) {
      event.stopPropagation();
    }
  }

  /**
   * Keeps a `/` typed into one of MAIDR's fields -- the chat, the command
   * palette -- from pkgdown, which would take it for its search shortcut.
   *
   * Listens on the chart's React root, where React listens too, rather than
   * anywhere below it: stopped below the root, the key would never reach
   * React's listener, and the field's own handlers would not see it. The
   * braille field and the review field are let through: MAIDR's own shortcuts
   * listen on the document and read keys there, where `/` resets the autoplay
   * speed.
   * @param {KeyboardEvent} event - A keydown inside the chart
   */
  private static handleRootKeyDown(event: KeyboardEvent): void {
    if (event.key !== '/' || document.getElementById('search-input') === null) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element) || !isEditable(target)) {
      return;
    }
    if (target.id.startsWith(Constant.BRAILLE_TEXT_AREA) || target.id.startsWith(Constant.REVIEW_INPUT)) {
      return;
    }
    event.stopPropagation();
  }

  /**
   * Whether a keydown opens the reveal.js search plugin, by the plugin's own
   * test: a capital F with Ctrl or Cmd held. That is Ctrl+Shift+F, and also
   * Ctrl+F with Caps Lock on, which the plugin opens on just the same.
   * @param {KeyboardEvent} event - The keydown
   * @returns {boolean} True for a key the plugin acts on
   */
  private static isRevealSearchKey(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && event.key === 'F';
  }

  /**
   * Whether the page has reveal.js's search plugin.
   * @returns {boolean} True when the plugin's global or registration exists
   */
  private static hasRevealSearch(): boolean {
    const globals = host();
    if (globals.RevealSearch !== undefined) {
      return true;
    }
    const reveal = globals.Reveal;
    return typeof reveal?.hasPlugin === 'function' && reveal.hasPlugin('search') === true;
  }
}
