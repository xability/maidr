/**
 * @jest-environment jsdom
 */

/**
 * Tests for the stylesheets MAIDR adds to a page: the figure margin rule
 * (#1376) and the focus ring. Each goes in once per document, however many
 * charts the document holds, and first in its head, so a page rule of equal
 * specificity, which comes later, wins.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { ensureDocumentStyle } from '@util/documentStyle';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('ensureDocumentStyle', () => {
  it('adds the rules once, first in the head', () => {
    document.head.innerHTML = '<style id="page">figure { margin: 2em; }</style>';

    ensureDocumentStyle(document, 'data-maidr-test', 'figure { margin: 0; }');
    ensureDocumentStyle(document, 'data-maidr-test', 'figure { margin: 0; }');

    const added = document.head.querySelectorAll('style[data-maidr-test]');
    expect(added).toHaveLength(1);
    expect(document.head.firstElementChild).toBe(added[0]);
    expect(added[0].textContent).toBe('figure { margin: 0; }');
  });

  it('keeps one sheet per marker', () => {
    ensureDocumentStyle(document, 'data-maidr-one', 'a {}');
    ensureDocumentStyle(document, 'data-maidr-two', 'b {}');

    expect(document.head.querySelectorAll('style')).toHaveLength(2);
  });

  it('adds the rules to each document a chart is in', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const other = frame.contentDocument;
    if (other === null) {
      throw new Error('the frame has no document');
    }
    ensureDocumentStyle(document, 'data-maidr-test', 'a {}');

    ensureDocumentStyle(other, 'data-maidr-test', 'a {}');

    expect(other.head.querySelector('style[data-maidr-test]')).not.toBeNull();
    frame.remove();
  });
});
