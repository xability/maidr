/**
 * @jest-environment jsdom
 */

/**
 * What the typing animation costs, and what it shows while it runs.
 *
 * Every 10 ms tick used to hand a one-character-longer prefix straight to
 * `<ReactMarkdown>`, which re-parses and re-transforms its children on every
 * render — remark-gfm, remark-math, rehype-sanitize, rehype-scope-ids and,
 * for a message with maths, rehype-katex. An N-character reply therefore cost
 * N full parses of a growing prefix, and each one replaced the whole rendered
 * subtree. Past a couple of thousand characters a tick no longer fits in the
 * interval, the callbacks queue, and the main thread — including the live
 * region updates a screen reader depends on — stalls for the length of the
 * reply.
 *
 * The cases below pin the shape rather than a timing: one DOM mutation per
 * tick instead of a whole re-rendered tree, and no half-parsed markdown on
 * screen on the way there.
 *
 * This is an `esm-test` because the component imports `react-markdown`.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { act, render } from '@testing-library/react';
import { TypingEffect } from '@ui/components/TypingEffect';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';

/** The animation reveals one character per this many milliseconds. */
const TICK_MS = 10;

/** Distinguishes every message this file renders, so none replays a cached run. */
let rendered = 0;

/**
 * Renders one assistant message, mid-animation.
 * @param text - The message body.
 * @returns The rendered container and the element holding the message content.
 */
function renderMessage(text: string): { container: HTMLElement; content: HTMLElement } {
  const { container } = render(
    <Provider store={createMaidrStore()}>
      <TypingEffect text={text} isUser={false} messageId={`anim-${rendered++}`} />
    </Provider>,
  );

  const content = container.querySelector('.chat-message-content');
  if (content === null) {
    throw new Error('no message content rendered');
  }
  return { container, content: content as HTMLElement };
}

/**
 * Advances the animation by a number of ticks.
 * @param ticks - How many characters to reveal.
 */
function type(ticks: number): void {
  act(() => {
    jest.advanceTimersByTime(ticks * TICK_MS);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the typing animation', () => {
  it('should build no markdown tree while it types', () => {
    // The property that makes a tick cheap: the prefix is text, so nothing is
    // parsed or transformed on the way to the next character. Two hundred
    // characters into this message the old path had already rendered a
    // heading, a paragraph, a link and most of a list, and rebuilt all of it
    // on every one of those two hundred ticks.
    const body = `# Heading\n\nSome **bold** text, a [link](https://example.com) and a list:\n\n- one\n- two\n- three\n\nAnd a closing paragraph that runs on for a while so the tree is not tiny.`;
    const { content } = renderMessage(body);

    // Well past the heading, the link and most of the list, and well short of
    // the end, so the animation is still running when the assertions read it.
    const revealed = 120;
    type(revealed + 1);

    expect(content.querySelectorAll('*').length).toBeLessThanOrEqual(1);
    expect(content.textContent).toBe(body.slice(0, revealed));
  });

  it('should not show half-parsed markdown while it types', () => {
    // A prefix is not a document: `**bold` renders as literal asterisks until
    // the closing delimiter arrives, so the structure flickered as it typed.
    const { container, content } = renderMessage('**bold** and then some more text');

    type(9);

    expect(content.textContent).toBe('**bold**');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('should render the finished message as markdown', () => {
    const body = '**bold** and then some more text';
    const { container, content } = renderMessage(body);

    type(body.length + 2);

    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(content.textContent).toBe('bold and then some more text');
  });
});
