/**
 * @jest-environment jsdom
 */

/**
 * `TypingEffect` rendered, and read the way assistive technology reads it.
 *
 * Everything under this component was testable before and this was not:
 * `markdownSanitize.test.ts` checks what the allowlist contains,
 * `markdownPipeline.esm-test.ts` checks that markup survives the pipeline, but
 * neither reaches the `components` overrides, and neither can say what a
 * rendered element's accessible *name* is. That gap is where three shipped
 * bugs lived — a link announcing as `[object Object]` (#700), a visible
 * "Footnotes" heading (#699), and a backref announcing as "Link: ↩" (#695) —
 * and all three were fixed with no regression guard, because the component
 * imports `react-markdown` and the CommonJS project cannot load it.
 *
 * This file runs in the `esm` project for that reason, and opts into jsdom
 * because it renders. Assertions go through `getByRole(..., { name })`, which
 * computes the accessible name rather than reading an attribute — the name is
 * the contract, and for two of the three bugs above the attribute was present
 * and wrong.
 *
 * jsdom is not a screen reader. These pin the wiring; they do not replace
 * checking with real assistive technology.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { act, render, screen } from '@testing-library/react';
import { TypingEffect } from '@ui/components/TypingEffect';
import { Provider } from 'react-redux';

const URL = 'https://example.com';

/** A message with a footnote, whose rendered block is what several cases read. */
const FOOTNOTE = 'text[^1]\n\n[^1]: the note\n';

/**
 * Renders assistant messages and runs the typing animation to completion.
 *
 * `isUser` is false because the sanitised path is the assistant one, which
 * means the animation runs: the component reveals a character every 10 ms, so
 * without advancing the clock the assertions would read a prefix of the
 * markdown rather than the message. Fake timers rather than a wait, so the
 * cost does not scale with the fixture.
 *
 * A real store, not a stub — `TypingEffect` reads `settings.general.ariaMode`
 * through `useViewModelState`, which subscribes to the Redux slice, and a stub
 * view model would never re-render it.
 * The first message is a separate parameter so that calling this with none is
 * a type error rather than a runtime one. `Math.max()` of nothing is
 * `-Infinity`, which reaches `advanceTimersByTime` as `TypeError: Negative
 * ticks are not supported` — loud, but about the wrong thing. Defaulting the
 * value instead would be worse than either: a call with no messages would
 * render an empty document and quietly satisfy every "should not" assertion
 * in the file.
 * @param first - The message body to render.
 * @param rest - Further bodies, rendered as sibling bubbles in one document.
 * @returns The container holding them.
 */
function renderMessages(first: string, ...rest: string[]): HTMLElement {
  const texts = [first, ...rest];
  const longest = Math.max(...texts.map(text => text.length));
  const { container } = render(
    <Provider store={createMaidrStore()}>
      {texts.map((text, index) => (
        <TypingEffect key={index} text={text} isUser={false} messageId={`m${index}`} />
      ))}
    </Provider>,
  );

  act(() => {
    jest.advanceTimersByTime(longest * 10 + 100);
  });

  return container;
}

/**
 * Resolves the element a fragment-style attribute points at.
 * @param element - The element carrying the reference.
 * @param attribute - `href` for a link target, or an ARIA reference attribute.
 * @returns The referenced element, or null when the reference dangles.
 */
function target(element: HTMLElement, attribute: string): HTMLElement | null {
  const value = element.getAttribute(attribute) ?? '';
  return document.getElementById(value.replace(/^#/, ''));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a chat link\'s accessible name', () => {
  // These three are the cases #700 fixed. The override it removed built
  // `aria-label` as `Link: ${children}`, which is a string only when the link
  // text is one text node — every case below produced `[object Object]`, and
  // `aria-label` replaces the name rather than supplementing it, so there was
  // no fall back to the visible words.
  it('should come from the link text when that text is emphasised', () => {
    renderMessages(`[**bold**](${URL})`);

    expect(screen.getByRole('link', { name: 'bold' })).toBeTruthy();
  });

  it('should come from the whole text when part of it is code', () => {
    renderMessages(`[a \`b\` c](${URL})`);

    expect(screen.getByRole('link', { name: 'a b c' })).toBeTruthy();
  });

  it('should come from the alt text when the link wraps an image', () => {
    renderMessages(`[![alt](${URL}/i.png)](${URL})`);

    expect(screen.getByRole('link', { name: 'alt' })).toBeTruthy();
  });

  it('should keep the label remark-gfm gives the footnote backref', () => {
    renderMessages(FOOTNOTE);

    // The one `aria-label` that should reach a chat link, and the only one
    // that arrives from the pipeline rather than from React. Removing the
    // override had to leave this intact rather than replace it, so a suite
    // that only checked the three cases above would pass while this vanished.
    const backref = screen.getByRole('link', { name: 'Back to reference 1' });

    // Read as the hyphenated DOM attribute deliberately. React camel-cases
    // most props but treats `aria-*` as the exception, and the name above
    // depends on `hast-util-to-jsx-runtime` relying on that — worth pinning
    // rather than assuming, since nothing else would notice it changing.
    expect(backref.getAttribute('aria-label')).toBe('Back to reference 1');
  });
});

describe('the footnotes heading', () => {
  it('should be announced but not drawn', () => {
    renderMessages(FOOTNOTE);

    // `mdast-util-to-hast` hardcodes `<h2 class="sr-only">Footnotes</h2>` and
    // expects a stylesheet to honour the class. MAIDR ships none that reaches
    // pipeline-generated markup, so before #699 this rendered as a visible
    // heading in every footnoted response. The override that fixes it is one
    // deletion away from silently coming back: a static guard can see the
    // class appear in `src/`, not an override disappear from a component.
    const heading = screen.getByRole('heading', { name: 'Footnotes' });

    expect(heading.style.clipPath).toBe('inset(50%)');
  });

  it('should stay in the accessibility tree rather than being hidden outright', () => {
    renderMessages(FOOTNOTE);

    // The clip pattern rather than `display: none` is the whole point —
    // `display: none` would remove the heading from the accessibility tree,
    // taking the footnotes block's only landmark with it. `getByRole` above
    // already fails on a hidden element; this says why that matters.
    const heading = screen.getByRole('heading', { name: 'Footnotes' });

    expect(heading.style.display).not.toBe('none');
    expect(heading.style.visibility).not.toBe('hidden');
  });
});

describe('footnote anchors', () => {
  it('should describe the reference with the footnotes heading', () => {
    renderMessages(FOOTNOTE);

    // This one resolves, and it is worth pinning that it does: `clobber`
    // renames `id` and `ariaDescribedBy` together, so both sides move by the
    // same prefix and the reference survives. It is the half of the footnote
    // wiring that works, and the fix for the half below must not break it.
    const reference = screen.getByRole('link', { name: '1' });

    expect(target(reference, 'aria-describedby')).not.toBeNull();
  });

  // The two below are `it.failing` rather than skipped: #696 is a live bug
  // that belongs to its own fix, so the cases run, the suite stays green while
  // the bug stands, and they turn red the day it is fixed — which is the
  // reminder to delete the marker and keep the assertion.
  it.failing('should point the reference at the footnote it names (#696)', () => {
    renderMessages(FOOTNOTE);

    // `mdast-util-to-hast` already prefixes footnote ids with `user-content-`,
    // then `hast-util-sanitize` prefixes every `id` again — so the target
    // becomes `user-content-user-content-fn-1` while the `href` stays
    // `#user-content-fn-1`, because `href` is not in `clobber`. The link is
    // announced normally and goes nowhere.
    const reference = screen.getByRole('link', { name: '1' });

    expect(target(reference, 'href')).not.toBeNull();
  });

  it.failing('should give two messages distinct footnote ids (#696)', () => {
    const container = renderMessages(FOOTNOTE, 'other[^1]\n\n[^1]: second note\n');

    // Footnotes are numbered per document, and each message is its own
    // document, so every message with a footnote emits the same ids. A chat
    // transcript is one page, which makes them duplicates — and a duplicate
    // id is the case a single-document test cannot see at all.
    const ids = Array.from(container.querySelectorAll('[id]')).map(element => element.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
