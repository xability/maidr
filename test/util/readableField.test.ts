/**
 * @jest-environment jsdom
 */

/**
 * The readability floor of the braille and review fields.
 *
 * jsdom computes the colours a page sets on an element and inherits `color`,
 * but has no default field colours and no system colours: a field the page
 * leaves alone computes `color: initial`, which the floor cannot read and so
 * leaves alone. Every case here therefore sets both colours itself. What the
 * browser makes of real stylesheets is checked in
 * `e2e_tests/specs/fieldColours.spec.ts`.
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { keepFieldReadable } from '@util/readableField';

/**
 * Draws a chart's article on a page, with a field inside it.
 * @param page - The page's colours
 * @param page.text - Its text colour
 * @param page.background - Its background colour
 * @param field - The colours the page gives the field, or null for none
 * @param field.text - The field's text colour
 * @param field.background - The field's background colour
 * @returns The field
 */
function drawField(
  page: { text: string; background: string },
  field: { text: string; background: string } | null,
): HTMLTextAreaElement {
  document.body.style.color = page.text;
  document.body.style.backgroundColor = page.background;
  const article = document.createElement('article');
  article.id = 'maidr-article-chart';
  const textArea = document.createElement('textarea');
  if (field !== null) {
    textArea.style.color = field.text;
    textArea.style.backgroundColor = field.background;
  }
  article.append(textArea);
  document.body.append(article);
  return textArea;
}

describe('keepFieldReadable', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
  });

  it('should leave a readable field as the page drew it', () => {
    // water.css's dark theme: white on #161f27 on a #202b38 page.
    const field = drawField(
      { text: 'rgb(219, 219, 219)', background: 'rgb(32, 43, 56)' },
      { text: 'rgb(255, 255, 255)', background: 'rgb(22, 31, 39)' },
    );

    keepFieldReadable(field);

    expect(field.style.color).toBe('rgb(255, 255, 255)');
    expect(field.style.backgroundColor).toBe('rgb(22, 31, 39)');
  });

  it('should give an unreadable field the colours of the text around it', () => {
    // A dark page whose fields take its background and keep a dark text.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );

    keepFieldReadable(field);

    expect(field.style.color).toBe('rgb(255, 255, 255)');
    expect(field.style.backgroundColor).toBe('rgb(34, 34, 34)');
  });

  it('should give the browser\'s field colours where the text around it is unreadable too', () => {
    const field = drawField(
      { text: 'rgb(40, 40, 40)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(30, 30, 30)', background: 'rgba(0, 0, 0, 0)' },
    );

    keepFieldReadable(field);

    expect(field.style.color.toLowerCase()).toBe('fieldtext');
    expect(field.style.backgroundColor.toLowerCase()).toBe('field');
  });

  it('should put back what it replaced when undone', () => {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );

    const undo = keepFieldReadable(field);
    undo();

    expect(field.style.color).toBe('rgb(0, 0, 0)');
    expect(field.style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('should finish the transitions on the field\'s colours, and only those', () => {
    // A transition starts from the colours being left -- the floor's own, just
    // after it is undone -- so measured mid-way the field reads as readable.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const transition = (property: string): Pick<CSSTransition, 'transitionProperty' | 'finish'> => (
      { transitionProperty: property, finish: jest.fn() }
    );
    const colour = transition('color');
    const background = transition('background-color');
    const opacity = transition('opacity');
    field.getAnimations = (): Animation[] => [colour, background, opacity].map(stub => stub as CSSTransition);

    keepFieldReadable(field);

    // Once before measuring, once after setting the pair.
    expect(colour.finish).toHaveBeenCalledTimes(2);
    expect(background.finish).toHaveBeenCalledTimes(2);
    expect(opacity.finish).not.toHaveBeenCalled();
  });

  it('should leave a field alone when its colours cannot be read', () => {
    // No colours of its own: jsdom computes `initial`, as it would for any
    // field a page did not style.
    const field = drawField({ text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' }, null);

    keepFieldReadable(field);

    expect(field.getAttribute('style')).toBeNull();
  });
});
