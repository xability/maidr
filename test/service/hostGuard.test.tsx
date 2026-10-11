/**
 * @jest-environment jsdom
 */

/**
 * Tests for the host-page guards.
 *
 * A chart written into a page shares every key with it. Each host here acts on
 * keys MAIDR uses, and each guard answers where the host asks whether to act:
 * "no" while the focus is in a chart, and whatever the host would have said
 * otherwise. The "otherwise" cases matter as much: a page with no chart
 * focused must behave exactly as it would without MAIDR.
 *
 * The hosts are stubs shaped like the real ones -- reveal.js 3, 4 and 5,
 * Quarto's search, the dashboard card, Mousetrap 1.4 and 1.6, ioslides,
 * slidy, a storyboard's Sly, pkgdown's search box -- and each test builds its
 * own, so the markers one leaves behind cannot reach the next.
 */

import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HostGuardService, installHostGuards } from '@service/hostGuard';
import { render } from '@testing-library/react';

/** The host globals these tests stand up, removed after each. */
const HOST_GLOBALS = ['Reveal', 'RevealSearch', 'quartoOpenSearch', 'Mousetrap', 'SlideDeck', 'w3c_slidy', 'Sly'];

/** The card component's namespace, built as the service builds it. */
const CARD_NAMESPACE = ['bs', 'lib'].join('');

/** The markers a guarded object carries. */
const MARKERS = ['__maidrHostGuard', '__maidrInline', '__maidrKnitr'];

/** The page's globals, writable. */
const globals = window as unknown as Record<string, unknown>;

let plot: HTMLElement;
let outside: HTMLElement;
let services: HostGuardService[] = [];
/** Undoes what a test added to the page beyond its fixture. */
let cleanups: Array<() => void> = [];

/**
 * Looks an element up, failing the test when the fixture lacks it.
 * @param {string} id - The element's id
 * @returns {HTMLElement} The element
 */
function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`fixture has no #${id}`);
  }
  return element;
}

/**
 * Builds a guard service for the chart, as its controller does on focus-in.
 * @param {(event: KeyboardEvent) => boolean} isBound - The reader's keymap
 * @returns {HostGuardService} The service
 */
function guardChart(isBound: (event: KeyboardEvent) => boolean = () => false): HostGuardService {
  const service = new HostGuardService(plot, isBound);
  services.push(service);
  return service;
}

/**
 * Dispatches a keydown on an element.
 * @param {Element} target - Where the key is pressed
 * @param {KeyboardEventInit} init - The key
 * @returns {KeyboardEvent} The event
 */
function press(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/**
 * Records the keys that reach the document, where the hosts listen.
 * @returns {string[]} The keys, in order, as they arrive
 */
function keysReachingDocument(): string[] {
  const keys: string[] = [];
  const listener = (event: KeyboardEvent): void => {
    keys.push(event.key);
  };
  document.addEventListener('keydown', listener);
  cleanups.push(() => document.removeEventListener('keydown', listener));
  return keys;
}

beforeEach(() => {
  document.body.innerHTML = `
    <button id="outside">Outside</button>
    <div id="root" data-maidr-embed="">
      <article id="maidr-article-c">
        <figure id="maidr-figure-c">
          <div id="plot" tabindex="0"></div>
          <textarea id="maidr-braille-textarea-c"></textarea>
          <input id="maidr-review-input-c">
          <div role="dialog"><button id="dialog-button">Close</button><input id="chat-input"></div>
        </figure>
      </article>
    </div>`;
  plot = byId('plot');
  outside = byId('outside');
});

afterEach(() => {
  services.forEach(service => service.dispose());
  services = [];
  cleanups.forEach(cleanup => cleanup());
  cleanups = [];
  for (const name of [...HOST_GLOBALS, CARD_NAMESPACE]) {
    delete globals[name];
  }
  jest.useRealTimers();
});

describe('reveal.js', () => {
  /** A reveal.js 4/5 deck: a live config and `configure()`, which re-applies it. */
  function deck(ready: boolean, keyboardCondition: unknown = null) {
    const config: Record<string, unknown> = { keyboardCondition, shuffle: true };
    const listeners: Array<() => void> = [];
    const reveal = {
      getConfig: () => config,
      isReady: () => ready,
      isFocused: jest.fn(() => false),
      configure: jest.fn(),
      on: jest.fn((type: string, listener: () => void) => {
        if (type === 'ready') {
          listeners.push(listener);
        }
      }),
    };
    globals.Reveal = reveal;
    return { reveal, config, becomeReady: () => listeners.forEach(listener => listener()) };
  }

  /** Asks the deck's condition, as reveal.js does on every keydown. */
  function condition(config: Record<string, unknown>): unknown {
    const ask = config.keyboardCondition as (event: KeyboardEvent) => unknown;
    return ask.call(config, new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  }

  it('sets the condition on the live config, and never calls configure()', () => {
    const { reveal, config } = deck(true);

    installHostGuards();

    // configure() would reshuffle a shuffled deck and restart auto-slide.
    expect(reveal.configure).not.toHaveBeenCalled();
    expect(config.shuffle).toBe(true);
    expect(typeof config.keyboardCondition).toBe('function');
  });

  it('holds the deck\'s keys off while the focus is in a chart, and only then', () => {
    const { config } = deck(true);
    installHostGuards();

    plot.focus();
    expect(condition(config)).toBe(false);

    outside.focus();
    expect(condition(config)).toBe(true);
  });

  it('keeps a condition the deck set itself, and its receiver', () => {
    const previous = jest.fn(function (this: unknown) {
      return this;
    });
    const { config } = deck(true, previous);
    installHostGuards();

    outside.focus();

    expect(condition(config)).toBe(config);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('keeps keyboardCondition: \'focused\'', () => {
    const { reveal, config } = deck(true, 'focused');
    installHostGuards();
    outside.focus();

    expect(condition(config)).toBe(false);
    reveal.isFocused.mockReturnValue(true);
    expect(condition(config)).toBe(true);
  });

  it('waits for a deck that is not ready yet', () => {
    const { config, becomeReady } = deck(false);
    installHostGuards();
    expect(config.keyboardCondition).toBeNull();

    becomeReady();

    expect(typeof config.keyboardCondition).toBe('function');
  });

  it('waits on reveal.js 3, which has addEventListener but no on()', () => {
    const config: Record<string, unknown> = { keyboardCondition: null };
    const listeners: Array<() => void> = [];
    globals.Reveal = {
      getConfig: () => config,
      isReady: () => false,
      addEventListener: (type: string, listener: () => void) => listeners.push(listener),
    };
    installHostGuards();

    listeners.forEach(listener => listener());

    plot.focus();
    expect(condition(config)).toBe(false);
  });

  it('wraps the condition once, however often it is installed', () => {
    const { config } = deck(true);
    installHostGuards();
    const guarded = config.keyboardCondition;

    installHostGuards();
    guardChart();

    expect(config.keyboardCondition).toBe(guarded);
  });

  it('marks the deck for both bindings, so neither wraps it again', () => {
    const { reveal } = deck(true);

    installHostGuards();

    for (const marker of MARKERS) {
      expect((reveal as unknown as Record<string, unknown>)[marker]).toBe(true);
    }
    // Not enumerable: a copy of the object does not claim to be guarded.
    expect(Object.keys(reveal)).not.toContain('__maidrHostGuard');
  });

  it('leaves a deck a binding has already guarded to the binding', () => {
    const { reveal, config } = deck(true);
    (reveal as unknown as Record<string, unknown>).__maidrKnitr = true;

    installHostGuards();

    expect(config.keyboardCondition).toBeNull();
  });

  it('is not wrapped twice by two copies of MAIDR on one page', async () => {
    // maidr.js and an adapter bundle each carry this module; a WeakSet or a
    // Symbol would be one per copy, and the deck would be wrapped by both.
    const { config } = deck(true);
    let first: (() => void) | undefined;
    let second: (() => void) | undefined;
    await jest.isolateModulesAsync(async () => {
      first = (await import('@service/hostGuard')).installHostGuards;
    });
    await jest.isolateModulesAsync(async () => {
      second = (await import('@service/hostGuard')).installHostGuards;
    });

    first?.();
    const guarded = config.keyboardCondition;
    second?.();

    expect(second).not.toBe(first);
    expect(config.keyboardCondition).toBe(guarded);
  });
});

describe('Quarto\'s site search', () => {
  it('does not open while the focus is in a chart, and opens outside one', () => {
    const open = jest.fn();
    globals.quartoOpenSearch = open;
    installHostGuards();
    const guarded = globals.quartoOpenSearch as (...args: unknown[]) => unknown;

    plot.focus();
    guarded('f');
    expect(open).not.toHaveBeenCalled();

    outside.focus();
    guarded('f');
    expect(open).toHaveBeenCalledWith('f');
  });

  it('is wrapped once, and a binding\'s wrapper is left alone', () => {
    globals.quartoOpenSearch = jest.fn();
    installHostGuards();
    const guarded = globals.quartoOpenSearch;
    installHostGuards();
    expect(globals.quartoOpenSearch).toBe(guarded);

    const binding = Object.assign(jest.fn(), { __maidrInline: true });
    globals.quartoOpenSearch = binding;
    installHostGuards();
    expect(globals.quartoOpenSearch).toBe(binding);
  });
});

describe('a full-screen card', () => {
  /** A card instance as the card component builds one. */
  class Card {
    public readonly exit = jest.fn();
    public constructor() {
      this._exitFullScreenOnEscape = this._exitFullScreenOnEscape.bind(this);
    }

    public _exitFullScreenOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        this.exit();
      }
    }

    public enterFullScreen(): void {
      document.addEventListener('keydown', this._exitFullScreenOnEscape, false);
    }
  }

  /**
   * Puts the chart in a card, its instance registered with the namespace.
   * @param {boolean} fullScreen - Whether the card is full screen already
   * @returns {Card} The card's instance
   */
  function cardAround(fullScreen: boolean): Card {
    const element = document.createElement('div');
    element.setAttribute('data-full-screen', String(fullScreen));
    const root = byId('root');
    root.replaceWith(element);
    element.appendChild(root);
    const instance = new Card();
    globals[CARD_NAMESPACE] = { Card: { getInstance: (el: Element) => (el === element ? instance : undefined) } };
    if (fullScreen) {
      instance.enterFullScreen();
    }
    cleanups.push(() => document.removeEventListener('keydown', instance._exitFullScreenOnEscape, false));
    return instance;
  }

  it('stays full screen on an Escape pressed in the chart, and leaves on one outside it', () => {
    const card = cardAround(true);
    plot.focus();
    guardChart();

    press(plot, { key: 'Escape' });
    press(byId('maidr-braille-textarea-c'), { key: 'Escape' });
    expect(card.exit).not.toHaveBeenCalled();

    press(outside, { key: 'Escape' });
    expect(card.exit).toHaveBeenCalledTimes(1);
  });

  it('guards a card that goes full screen later', () => {
    const card = cardAround(false);
    plot.focus();
    guardChart();

    card.enterFullScreen();
    press(plot, { key: 'Escape' });

    expect(card.exit).not.toHaveBeenCalled();
  });
});

describe('Mousetrap', () => {
  it('stops its shortcuts in a chart from the prototype, in Mousetrap 1.5 and later', () => {
    const previous = jest.fn(() => false);
    function Mousetrap(): void {}
    Mousetrap.prototype.stopCallback = previous;
    globals.Mousetrap = Mousetrap;
    installHostGuards();
    const instance = new (Mousetrap as unknown as new () => { stopCallback: (event: Event, element: Element) => unknown })();

    plot.focus();
    expect(instance.stopCallback(new KeyboardEvent('keydown'), plot)).toBe(true);

    outside.focus();
    expect(instance.stopCallback(new KeyboardEvent('keydown'), outside)).toBe(false);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('stops them from the object itself in Mousetrap 1.4', () => {
    const mousetrap: { stopCallback: (event: Event, element: Element) => unknown } = {
      stopCallback: jest.fn(() => false),
    };
    globals.Mousetrap = mousetrap;
    installHostGuards();

    expect(mousetrap.stopCallback(new KeyboardEvent('keydown'), byId('dialog-button'))).toBe(true);
    expect(mousetrap.stopCallback(new KeyboardEvent('keydown'), outside)).toBe(false);
  });
});

describe('ioslides', () => {
  it('guards the deck\'s handler on the prototype, before the deck binds it', () => {
    const previous = jest.fn();
    function SlideDeck(this: { handler: (event: KeyboardEvent) => void }): void {
      // As the real constructor: the method is bound, so copied, here.
      this.handler = (SlideDeck.prototype.onBodyKeyDown_ as (event: KeyboardEvent) => void).bind(this);
    }
    SlideDeck.prototype.onBodyKeyDown_ = previous;
    globals.SlideDeck = SlideDeck;

    installHostGuards();
    const deck = new (SlideDeck as unknown as new () => { handler: (event: KeyboardEvent) => void })();

    plot.focus();
    deck.handler(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(previous).not.toHaveBeenCalled();

    outside.focus();
    deck.handler(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(previous).toHaveBeenCalledTimes(1);
  });
});

describe('slidy', () => {
  it('counts every element of a chart as one that wants its own keys', () => {
    const slidy: { special_element: (element: Element) => unknown } = { special_element: () => false };
    const previous = jest.fn(function (this: unknown, element: Element) {
      return element.tagName === 'A' && this === slidy;
    });
    slidy.special_element = previous;
    globals.w3c_slidy = slidy;
    installHostGuards();
    outside.focus();

    // A dialog's button, which slidy's own list of tag names does not cover.
    expect(slidy.special_element(byId('dialog-button'))).toBe(true);
    expect(slidy.special_element(outside)).toBe(false);
    const link = document.createElement('a');
    expect(slidy.special_element(link)).toBe(true);
    // Nothing is written on the chart itself.
    expect(plot.onkeydown).toBeNull();
  });
});

describe('a storyboard\'s Sly', () => {
  /**
   * Gives a frame list a Sly instance with the given options.
   * @param {object} options - The instance's options
   */
  function storyboard(options: object): void {
    const frame = document.createElement('div');
    frame.className = 'sbframelist';
    document.body.appendChild(frame);
    globals.Sly = { getInstance: (element: Element) => (element === frame ? { options } : undefined) };
  }

  it('reads no keyboard navigation while the focus is in a chart', () => {
    const options: Record<string, unknown> = { keyboardNavBy: 'items' };
    storyboard(options);
    installHostGuards();

    plot.focus();
    expect(options.keyboardNavBy).toBeNull();

    outside.focus();
    expect(options.keyboardNavBy).toBe('items');
  });

  it('keeps what Sly writes, and keeps the option enumerable', () => {
    const options: Record<string, unknown> = { keyboardNavBy: 'items' };
    storyboard(options);
    installHostGuards();

    options.keyboardNavBy = 'pages';

    expect(options.keyboardNavBy).toBe('pages');
    expect(Object.keys(options)).toContain('keyboardNavBy');
    expect(Object.getOwnPropertyDescriptor(options, 'keyboardNavBy')?.configurable).toBe(true);
  });

  it('wraps an accessor without reading it, so a chart\'s focus is never captured', () => {
    let navBy: unknown = 'items';
    const get = jest.fn(() => navBy);
    const options = {};
    Object.defineProperty(options, 'keyboardNavBy', {
      get,
      set: (value: unknown) => {
        navBy = value;
      },
      enumerable: false,
      configurable: true,
    });
    storyboard(options);

    // Installed as a chart's controller installs it: with the focus in it.
    plot.focus();
    guardChart();
    expect(get).not.toHaveBeenCalled();

    outside.focus();
    (options as Record<string, unknown>).keyboardNavBy = 'pages';
    expect((options as Record<string, unknown>).keyboardNavBy).toBe('pages');
    expect(navBy).toBe('pages');
    expect(Object.keys(options)).not.toContain('keyboardNavBy');
  });

  it('leaves options r-maidr has already guarded to r-maidr', () => {
    const options: Record<string, unknown> = { keyboardNavBy: 'items', __maidrKnitr: true };
    storyboard(options);
    installHostGuards();

    plot.focus();

    expect(options.keyboardNavBy).toBe('items');
  });
});

describe('pkgdown\'s search', () => {
  beforeEach(() => {
    document.body.insertAdjacentHTML('afterbegin', '<input id="search-input">');
  });

  it('cannot take the focus from a / pressed on the chart, for that one task', () => {
    jest.useFakeTimers();
    const search = byId('search-input') as HTMLInputElement;
    // pkgdown's own handler, on the document.
    const takeFocus = (event: KeyboardEvent): void => {
      if (event.key === '/') {
        search.focus();
      }
    };
    document.addEventListener('keydown', takeFocus);
    cleanups.push(() => document.removeEventListener('keydown', takeFocus));
    plot.focus();
    guardChart();

    press(plot, { key: '/' });

    expect(document.activeElement).toBe(plot);
    jest.runAllTimers();
    expect(search.disabled).toBe(false);
  });

  it('does not hear a / typed into one of MAIDR\'s fields', () => {
    const reaching = keysReachingDocument();
    const chat = byId('chat-input');
    chat.focus();
    guardChart();

    press(chat, { key: '/' });

    expect(reaching).toEqual([]);
  });

  it('lets a / in the braille and review fields through to MAIDR\'s own shortcuts', () => {
    // There `/` resets the autoplay speed, and MAIDR's shortcuts listen on
    // the document, where pkgdown does.
    const reaching = keysReachingDocument();
    const braille = byId('maidr-braille-textarea-c');
    braille.focus();
    guardChart();

    press(braille, { key: '/' });
    press(byId('maidr-review-input-c'), { key: '/' });

    expect(reaching).toEqual(['/', '/']);
  });

  it('leaves a / alone on a page with no search box', () => {
    byId('search-input').remove();
    const reaching = keysReachingDocument();
    const chat = byId('chat-input');
    chat.focus();
    guardChart();

    press(chat, { key: '/' });

    expect(reaching).toEqual(['/']);
  });

  it('leaves a chart in a React app alone, whose root is the app\'s', () => {
    byId('root').removeAttribute('data-maidr-embed');
    const reaching = keysReachingDocument();
    const chat = byId('chat-input');
    chat.focus();
    guardChart();

    press(chat, { key: '/' });

    expect(reaching).toEqual(['/']);
  });

  it('stops a / only after the field\'s own React handler has had it', () => {
    // The real shape: React listens on the root it was created on, and the
    // service listens there too, not below it, where stopping the key would
    // keep it from React.
    const container = document.createElement('div');
    container.setAttribute('data-maidr-embed', '');
    document.body.appendChild(container);
    const onKeyDown = jest.fn();
    /** A chart's article with a field that reads keys. */
    function Chart(): JSX.Element {
      return (
        <article id="maidr-article-r">
          <figure id="maidr-figure-r">
            <div id="react-plot" tabIndex={0}></div>
            <input id="react-chat" onKeyDown={event => onKeyDown(event.key)} />
          </figure>
        </article>
      );
    }
    render(<Chart />, { container });
    const reaching = keysReachingDocument();
    const field = byId('react-chat');
    field.focus();
    plot = byId('react-plot');
    guardChart();

    press(field, { key: '/' });

    expect(onKeyDown).toHaveBeenCalledWith('/');
    expect(reaching).toEqual([]);
  });
});

describe('reveal.js\'s search plugin', () => {
  const searchKey: KeyboardEventInit = { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true };

  it('does not open from a chart on a deck that has it', () => {
    globals.Reveal = { hasPlugin: (id: string) => id === 'search' };
    const reaching = keysReachingDocument();
    plot.focus();
    guardChart();

    press(plot, searchKey);
    press(plot, { ...searchKey, ctrlKey: false, metaKey: true });

    expect(reaching).toEqual([]);
  });

  it('does not open on the key the plugin reads with Caps Lock on, either', () => {
    // The plugin opens on a capital F with Ctrl or Cmd held, Shift or not.
    globals.RevealSearch = {};
    const reaching = keysReachingDocument();
    plot.focus();
    guardChart();

    press(plot, { key: 'F', code: 'KeyF', ctrlKey: true });
    // Caps Lock and Shift together type a small f, which the plugin ignores.
    press(plot, { key: 'f', code: 'KeyF', ctrlKey: true, shiftKey: true });

    expect(reaching).toEqual(['f']);
  });

  it('is left alone on a page without the plugin', () => {
    globals.Reveal = { hasPlugin: () => false };
    const reaching = keysReachingDocument();
    plot.focus();
    guardChart();

    press(plot, searchKey);

    expect(reaching).toEqual(['F']);
  });

  it('is left alone outside a chart', () => {
    globals.RevealSearch = {};
    const reaching = keysReachingDocument();
    plot.focus();
    guardChart();
    outside.focus();

    press(outside, searchKey);

    expect(reaching).toEqual(['F']);
  });

  it('is left to MAIDR when the reader has bound the key there', () => {
    globals.RevealSearch = {};
    const reaching = keysReachingDocument();
    plot.focus();
    guardChart(() => true);

    press(plot, searchKey);

    expect(reaching).toEqual(['F']);
  });

  it('reaches MAIDR\'s own fields first, so a reader can record it as a shortcut', () => {
    // The shortcut recorder is a React handler, which React runs from the
    // root it was created on, and which stops the key once it has it.
    globals.RevealSearch = {};
    const container = document.createElement('div');
    container.setAttribute('data-maidr-embed', '');
    document.body.appendChild(container);
    const recorded: string[] = [];
    /** A chart's article with a field that records the keys pressed in it. */
    function Chart(): JSX.Element {
      return (
        <article id="maidr-article-r">
          <figure id="maidr-figure-r">
            <div id="react-plot" tabIndex={0}></div>
            <button
              id="recorder"
              type="button"
              onKeyDown={(event) => {
                recorded.push(event.key);
                event.stopPropagation();
              }}
            />
            <button id="other" type="button" />
          </figure>
        </article>
      );
    }
    render(<Chart />, { container });
    const reaching = keysReachingDocument();
    plot = byId('react-plot');
    byId('recorder').focus();
    guardChart();

    press(byId('recorder'), searchKey);
    byId('other').focus();
    press(byId('other'), searchKey);

    expect(recorded).toEqual(['F']);
    // Nowhere else in the chart does the key reach the deck's search.
    expect(reaching).toEqual([]);
  });
});

describe('disposal', () => {
  it('removes its listeners, and leaves the page-level guards in place', () => {
    globals.RevealSearch = {};
    document.body.insertAdjacentHTML('afterbegin', '<input id="search-input">');
    const open = jest.fn();
    globals.quartoOpenSearch = open;
    const reaching = keysReachingDocument();
    plot.focus();
    guardChart().dispose();
    services = [];

    press(plot, { key: 'F', ctrlKey: true, shiftKey: true });
    press(plot, { key: '/' });
    const chat = byId('chat-input');
    chat.focus();
    press(chat, { key: '/' });

    expect(reaching).toEqual(['F', '/', '/']);
    expect((byId('search-input') as HTMLInputElement).disabled).toBe(false);
    // Still guarded: patches to the page are never undone.
    (globals.quartoOpenSearch as () => void)();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('a host object that will not take a mark', () => {
  it.each([
    ['Mousetrap 1.4', 'Mousetrap', () => ({ stopCallback: () => false }), 'stopCallback'],
    ['slidy', 'w3c_slidy', () => ({ special_element: () => false }), 'special_element'],
  ])('is not wrapped again on every install: %s', (_name, global, build, method) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    cleanups.push(() => warn.mockRestore());
    const target = build() as Record<string, unknown>;
    const original = target[method];
    Object.preventExtensions(target);
    globals[global] = target;

    installHostGuards();
    installHostGuards();

    // Left as it was, and said so, rather than wrapped once per install.
    expect(target[method]).toBe(original);
    expect(warn).toHaveBeenCalled();
  });

  it('is not wrapped again on every install: reveal.js', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    cleanups.push(() => warn.mockRestore());
    const config: { keyboardCondition?: unknown } = {};
    const reveal = { getConfig: () => config, isReady: () => true };
    Object.preventExtensions(reveal);
    globals.Reveal = reveal;

    installHostGuards();
    installHostGuards();

    expect(config.keyboardCondition).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe('the page\'s window', () => {
  it('never carries a marker, which would stop a binding\'s script from running', () => {
    globals.Reveal = { getConfig: () => ({}), isReady: () => true };
    globals.quartoOpenSearch = jest.fn();
    globals.Mousetrap = { stopCallback: jest.fn() };
    globals.w3c_slidy = { special_element: jest.fn() };

    installHostGuards();
    plot.focus();
    guardChart();

    for (const marker of MARKERS) {
      expect(marker in window).toBe(false);
    }
  });
});
