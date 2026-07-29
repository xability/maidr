/**
 * MAIDR renders its dialogs with `disablePortal`, so they mount inside the
 * host page's chart wrapper instead of beside it. MUI's `ModalManager` marks
 * the *modal container's* other children `aria-hidden="true"` while a modal is
 * open, and that container defaults to `document.body` — whose only child on a
 * MAIDR page is the wrapper holding the chart AND the dialog. The dialog hid
 * itself, its controls, its live regions, and the chart it was opened from.
 *
 * These tests mount a real MUI dialog into the real MAIDR DOM shape. The first
 * one pins the defect (no `container` prop → the wrapper is hidden); the rest
 * assert that `useModalContainer` scopes the hiding to the modal's own parent.
 */

import type { ReactElement } from 'react';
import type { Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

/**
 * The DOM MAIDR builds around a chart: a single body child wrapping the
 * article, the figure, the chart itself, and the React container the dialogs
 * are rendered into.
 */
const MAIDR_BODY = `
  <div id="maidr-wrapper">
    <article id="maidr-article-bar">
      <figure id="maidr-figure-bar">
        <div id="plot-bar" role="img"></div>
        <div id="react-container-bar"></div>
      </figure>
    </article>
  </div>
`;

const MAIDR_DOM = `<!doctype html><body>${MAIDR_BODY}</body>`;

/**
 * Globals the render stack reads off `globalThis` rather than off a node's
 * owner document. Emotion in particular gates its default style cache on a
 * bare `typeof HTMLElement`, and returns a null cache without it.
 */
const BROWSER_GLOBALS = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Element',
  'Node',
  'DocumentFragment',
  'Event',
  'KeyboardEvent',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'MutationObserver',
] as const;

type MutableGlobals = Record<string, unknown>;

const globals = globalThis as unknown as MutableGlobals;
const saved: MutableGlobals = {};

let act: typeof import('react').act;
let createElement: typeof import('react').createElement;
let createRoot: typeof import('react-dom/client').createRoot;
let Dialog: typeof import('@mui/material/Dialog').default;
let useModalContainer: typeof import('@state/hook/useModalContainer').useModalContainer;

let root: Root | null = null;

function defineGlobal(key: string, value: unknown): void {
  Object.defineProperty(globals, key, { value, configurable: true, writable: true });
}

/**
 * Mounts an element into the React container inside the MAIDR DOM shape.
 * @param element - The element to render
 */
async function mount(element: ReactElement): Promise<void> {
  document.body.innerHTML = MAIDR_BODY;
  root = createRoot(document.getElementById('react-container-bar') as HTMLElement);
  await act(async () => {
    root?.render(element);
  });
}

/**
 * Walks up from an element collecting every ancestor marked `aria-hidden`.
 * A non-empty result means the element is outside the accessibility tree.
 * @param selector - CSS selector for the element to walk up from
 * @returns Ids (or tag names) of the hidden ancestors
 */
function hiddenAncestorsOf(selector: string): string[] {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`no element matched "${selector}"`);
  }
  const hidden: string[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.getAttribute('aria-hidden') === 'true') {
      hidden.push(node.id || node.tagName.toLowerCase());
    }
  }
  return hidden;
}

beforeAll(async () => {
  for (const key of [...BROWSER_GLOBALS, 'IS_REACT_ACT_ENVIRONMENT']) {
    saved[key] = globals[key];
  }

  const dom = new JSDOM(MAIDR_DOM, { pretendToBeVisual: true });
  const win = dom.window as unknown as MutableGlobals;
  defineGlobal('window', win);
  for (const key of BROWSER_GLOBALS.filter(name => name !== 'window')) {
    const value = win[key];
    defineGlobal(key, typeof value === 'function' ? value.bind(win) : value);
  }
  defineGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  // Import after the DOM globals exist so module-level environment checks in
  // React and MUI see a browser-like environment.
  const react = await import('react');
  act = react.act;
  createElement = react.createElement;
  ({ createRoot } = await import('react-dom/client'));
  Dialog = (await import('@mui/material/Dialog')).default;
  ({ useModalContainer } = await import('@state/hook/useModalContainer'));
});

afterEach(async () => {
  if (root) {
    const current = root;
    await act(async () => {
      current.unmount();
    });
    root = null;
  }
});

afterAll(() => {
  for (const key of [...BROWSER_GLOBALS, 'IS_REACT_ACT_ENVIRONMENT']) {
    defineGlobal(key, saved[key]);
  }
});

describe('useModalContainer', () => {
  it('should reproduce the defect when a disablePortal dialog keeps the default container', async () => {
    const unscoped = (): ReactElement =>
      createElement(Dialog, { open: true, disablePortal: true }, 'body');

    await mount(createElement(unscoped));

    expect(document.getElementById('maidr-wrapper')?.getAttribute('aria-hidden')).toBe('true');
    expect(hiddenAncestorsOf('.MuiDialog-root')).toEqual(['maidr-wrapper']);
  });

  it('should keep the dialog in the accessibility tree', async () => {
    const scoped = (): ReactElement => {
      const { modalRef, container } = useModalContainer();
      return createElement(
        Dialog,
        { open: true, disablePortal: true, ref: modalRef, container },
        'body',
      );
    };

    await mount(createElement(scoped));

    expect(document.getElementById('maidr-wrapper')?.getAttribute('aria-hidden')).toBeNull();
    expect(hiddenAncestorsOf('.MuiDialog-root')).toEqual([]);
  });

  it('should keep the chart it was opened from in the accessibility tree', async () => {
    const scoped = (): ReactElement => {
      const { modalRef, container } = useModalContainer();
      return createElement(
        Dialog,
        { open: true, disablePortal: true, ref: modalRef, container },
        'body',
      );
    };

    await mount(createElement(scoped));

    expect(document.getElementById('plot-bar')?.getAttribute('aria-hidden')).toBeNull();
    expect(hiddenAncestorsOf('#plot-bar')).toEqual([]);
  });

  it('should hide the modal siblings it is supposed to hide', async () => {
    const scoped = (): ReactElement => {
      const { modalRef, container } = useModalContainer();
      return createElement(
        'div',
        null,
        createElement('div', { id: 'behind-the-dialog' }, 'live region'),
        createElement(
          Dialog,
          { open: true, disablePortal: true, ref: modalRef, container },
          'body',
        ),
      );
    };

    await mount(createElement(scoped));

    // The wrapper div this component renders is the dialog's parent, so its
    // other child is what the modal pattern is meant to take out of the tree.
    expect(document.getElementById('behind-the-dialog')?.getAttribute('aria-hidden')).toBe('true');
    expect(hiddenAncestorsOf('.MuiDialog-root')).toEqual([]);
  });

  it('should restore the accessibility tree when the dialog closes', async () => {
    const scoped = (props: { open: boolean }): ReactElement => {
      const { modalRef, container } = useModalContainer();
      return createElement(
        Dialog,
        { open: props.open, disablePortal: true, ref: modalRef, container },
        'body',
      );
    };

    await mount(createElement(scoped, { open: true }));
    await act(async () => {
      root?.render(createElement(scoped, { open: false }));
    });

    expect(document.getElementById('maidr-wrapper')?.getAttribute('aria-hidden')).toBeNull();
    expect(document.getElementById('plot-bar')?.getAttribute('aria-hidden')).toBeNull();
  });
});
