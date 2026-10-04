/**
 * @jest-environment jsdom
 */

/**
 * What root font size MAIDR's dialogs are told to assume.
 *
 * MUI sizes their text in rem against `typography.htmlFontSize`. A host page
 * that shrinks its root (Bootstrap 3 sets 10px, and with it R Markdown,
 * bookdown and flexdashboard) shrinks every dialog unless MUI is told; these
 * cases fix what it is told, and that a page leaving its root alone is told
 * exactly what MUI assumed before.
 */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createTheme } from '@mui/material';
import { htmlFontSizeFor, readHtmlFontSize, watchRootFontSize } from '@util/htmlFontSize';

/**
 * The size, in px, at which a dialog's body text renders under the theme a
 * given `htmlFontSize` builds, on a page with the given root font size.
 * @param htmlFontSize - The theme's `typography.htmlFontSize`
 * @param rootFontSize - The page's root font size, in px
 * @returns The body text's rendered size, in px
 */
function bodyTextPx(htmlFontSize: number, rootFontSize: number): number {
  const { fontSize } = createTheme({ typography: { htmlFontSize } }).typography.body2;
  return Number.parseFloat(String(fontSize)) * rootFontSize;
}

describe('the root font size a dialog assumes', () => {
  test('is MUI\'s default on a page that leaves the root alone', () => {
    expect(htmlFontSizeFor(16, 16)).toBe(16);
  });

  test('follows a root the host shrank, so dialog text keeps its size', () => {
    const htmlFontSize = htmlFontSizeFor(10, 16);

    expect(htmlFontSize).toBe(10);
    expect(bodyTextPx(htmlFontSize, 10)).toBeCloseTo(bodyTextPx(16, 16));
  });

  test('keeps a reader\'s larger default size on a page that leaves the root alone', () => {
    // A reader who set their browser's default to 20px gets 20px roots on
    // such a page, and dialogs scaled up with it -- as they always have.
    expect(htmlFontSizeFor(20, 20)).toBe(16);
  });

  test('keeps a reader\'s larger default size on a page that shrank the root', () => {
    const htmlFontSize = htmlFontSizeFor(10, 20);

    expect(bodyTextPx(htmlFontSize, 10)).toBeCloseTo(bodyTextPx(16, 20));
  });

  test('leaves a root the host enlarged to enlarge the dialogs with it', () => {
    expect(htmlFontSizeFor(20, 16)).toBe(16);
  });

  test.each([
    ['an unreported root size', Number.NaN, 16],
    ['an unreported default size', 10, Number.NaN],
    ['a zero root size', 0, 16],
  ])('is MUI\'s default for %s', (_case, root, defaultSize) => {
    expect(htmlFontSizeFor(root, defaultSize)).toBe(16);
  });
});

describe('reading the root font size off the page', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Stands in for the browser's style resolution, which jsdom does not do for
   * font sizes: the root reports `root`, and an element asking for CSS's
   * `medium` -- the reader's default -- reports `medium`.
   * @param root - The root element's computed font size
   * @param medium - The size `font-size: medium` resolves to
   */
  function stubFontSizes(root: string, medium: string): void {
    jest.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      let fontSize = '';
      if (element === document.documentElement) {
        fontSize = root;
      } else if ((element as HTMLElement).style.fontSize === 'medium') {
        fontSize = medium;
      }
      return { fontSize } as CSSStyleDeclaration;
    });
  }

  test('compares the root against the reader\'s default size', () => {
    stubFontSizes('10px', '16px');

    expect(readHtmlFontSize()).toBe(10);
  });

  test('leaves nothing behind in the document', () => {
    stubFontSizes('10px', '16px');
    const before = document.documentElement.childElementCount;

    readHtmlFontSize();

    expect(document.documentElement.childElementCount).toBe(before);
  });

  test('is MUI\'s default when the browser reports no sizes', () => {
    stubFontSizes('', '');

    expect(readHtmlFontSize()).toBe(16);
  });
});

describe('watching for the root font size to change under an open dialog', () => {
  let rootFontSize = '10px';

  beforeEach(() => {
    rootFontSize = '10px';
    jest.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ fontSize: rootFontSize }) as CSSStyleDeclaration,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reports a resize that moved the root, as a host breakpoint does', () => {
    const onChange = jest.fn();
    const stop = watchRootFontSize(onChange);

    rootFontSize = '16px';
    window.dispatchEvent(new Event('resize'));
    stop();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test('ignores a resize that left the root alone', () => {
    const onChange = jest.fn();
    const stop = watchRootFontSize(onChange);

    window.dispatchEvent(new Event('resize'));
    stop();

    expect(onChange).not.toHaveBeenCalled();
  });

  test('stops reporting once stopped', () => {
    const onChange = jest.fn();
    const stop = watchRootFontSize(onChange);

    stop();
    rootFontSize = '16px';
    window.dispatchEvent(new Event('resize'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
