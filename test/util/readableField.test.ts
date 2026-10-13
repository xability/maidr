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

import type { ReadableField } from '@util/readableField';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Constant } from '@util/constant';
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

/** What the floor reads of a CSS transition, as a case stands one in. */
type TransitionStub = Pick<CSSTransition, 'transitionProperty' | 'playState' | 'playbackRate' | 'finish'>;

/** Every floor a case made, so none outlives it and answers the next one's changes. */
const floors: ReadableField[] = [];

/**
 * Makes a field's floor, to be disposed once the case is over.
 * @param field - The field
 * @returns Its floor
 */
function floorFor(field: HTMLElement): ReadableField {
  const floor = keepFieldReadable(field);
  floors.push(floor);
  return floor;
}

afterEach(() => {
  for (const floor of floors.splice(0)) {
    floor.dispose();
  }
});

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

    floorFor(field).check();

    expect(field.style.color).toBe('rgb(255, 255, 255)');
    expect(field.style.backgroundColor).toBe('rgb(22, 31, 39)');
  });

  it('should give an unreadable field the colours of the text around it', () => {
    // A dark page whose fields take its background and keep a dark text.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );

    floorFor(field).check();

    expect(field.style.color).toBe('rgb(255, 255, 255)');
    expect(field.style.backgroundColor).toBe('rgb(34, 34, 34)');
  });

  it('should give the browser\'s field colours where the text around it is unreadable too', () => {
    const field = drawField(
      { text: 'rgb(40, 40, 40)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(30, 30, 30)', background: 'rgba(0, 0, 0, 0)' },
    );

    floorFor(field).check();

    expect(field.style.color.toLowerCase()).toBe('fieldtext');
    expect(field.style.backgroundColor.toLowerCase()).toBe('field');
  });

  it('should put back what it replaced when disposed', () => {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );

    const floor = floorFor(field);
    floor.check();
    floor.dispose();

    expect(field.style.color).toBe('rgb(0, 0, 0)');
    expect(field.style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  it('should set its pair above a page\'s !important colours', () => {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );

    floorFor(field).check();

    expect(field.style.getPropertyPriority('color')).toBe('important');
    expect(field.style.getPropertyPriority('background-color')).toBe('important');
  });

  it('should put back the page\'s own inline colours and their priorities when disposed', () => {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    field.setAttribute('style', 'color: rgb(0, 0, 0) !important; background-color: rgba(0, 0, 0, 0);');
    const before = field.getAttribute('style');

    const floor = floorFor(field);
    floor.check();
    const fixed = field.style.getPropertyValue('color');
    floor.dispose();

    expect(fixed).toBe('rgb(255, 255, 255)');
    expect(field.getAttribute('style')).toBe(before);
    expect(field.style.getPropertyPriority('color')).toBe('important');
    expect(field.style.getPropertyPriority('background-color')).toBe('');
  });

  it('should finish the transitions on the field\'s colours, and only those', () => {
    // A transition starts from the colours being left -- the floor's own, just
    // after it is undone -- so measured mid-way the field reads as readable.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const transition = (property: string): TransitionStub => (
      { transitionProperty: property, playState: 'running', playbackRate: 1, finish: jest.fn() }
    );
    const colour = transition('color');
    const background = transition('background-color');
    const opacity = transition('opacity');
    field.getAnimations = (): Animation[] => [colour, background, opacity].map(stub => stub as CSSTransition);

    floorFor(field).check();

    // Once before measuring, once after setting the pair.
    expect(colour.finish).toHaveBeenCalledTimes(2);
    expect(background.finish).toHaveBeenCalledTimes(2);
    expect(opacity.finish).not.toHaveBeenCalled();
  });

  it('should leave a colour transition the page has paused or frozen as it is', () => {
    // Finishing a transition held at a playbackRate of 0 throws, as a browser
    // does here; one the page paused shows the colours it is held at.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const frozen: TransitionStub = {
      transitionProperty: 'background-color',
      playState: 'running',
      playbackRate: 0,
      finish: jest.fn(() => {
        throw new DOMException('Cannot finish Animation with a playbackRate of 0.', 'InvalidStateError');
      }),
    };
    const paused: TransitionStub = { transitionProperty: 'color', playState: 'paused', playbackRate: 1, finish: jest.fn() };
    field.getAnimations = (): Animation[] => [frozen, paused].map(stub => stub as CSSTransition);

    floorFor(field).check();

    expect(frozen.finish).not.toHaveBeenCalled();
    expect(paused.finish).not.toHaveBeenCalled();
    expect(field.style.color).toBe('rgb(255, 255, 255)');
  });

  it('should change nothing on the page when checked again with nothing changed', async () => {
    // A page whose own MutationObserver answers each change to its document
    // with a write to its root would otherwise answer every check, for ever.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const floor = floorFor(field);
    floor.check();
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(found => records.push(...found));
    observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });

    floor.check();
    floor.check();
    await Promise.resolve();
    observer.disconnect();

    expect(records).toEqual([]);
    expect(field.style.color).toBe('rgb(255, 255, 255)');
  });

  it('should measure again once the colours around the field change', () => {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const floor = floorFor(field);
    floor.check();

    document.body.style.color = 'rgb(240, 240, 200)';
    document.body.style.backgroundColor = 'rgb(20, 20, 60)';
    floor.check();

    expect(field.style.color).toBe('rgb(240, 240, 200)');
    expect(field.style.backgroundColor).toBe('rgb(20, 20, 60)');
  });

  it('should add its probe for the canvas colour once, not on every check', () => {
    // Nothing behind the field is opaque, so the canvas shows through.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgba(0, 0, 0, 0)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const appendChild = jest.spyOn(document.documentElement, 'appendChild');
    const floor = floorFor(field);

    floor.check();
    floor.check();
    floor.check();

    expect(appendChild).toHaveBeenCalledTimes(1);
    appendChild.mockRestore();
  });

  /**
   * Gives the field high contrast mode's pair, as it inherits it from the
   * chart's backdrop, where `HighContrastService` paints it: on the field
   * itself, since jsdom does not inherit custom properties.
   */
  function paintHighContrast(field: HTMLElement, light: string, dark: string): void {
    field.style.setProperty(Constant.HIGH_CONTRAST_LIGHT_PROPERTY, light);
    field.style.setProperty(Constant.HIGH_CONTRAST_DARK_PROPERTY, dark);
  }

  it('should leave the reader\'s own high contrast pair as it is, however dim', () => {
    // #666 on #000 is 3.66:1, and the reader chose it: the field shows it,
    // as the high contrast rule gives it.
    const field = drawField(
      { text: 'rgb(102, 102, 102)', background: 'rgb(0, 0, 0)' },
      { text: 'rgb(102, 102, 102)', background: 'rgb(0, 0, 0)' },
    );
    paintHighContrast(field, '#666666', '#000000');

    floorFor(field).check();

    expect(field.style.color).toBe('rgb(102, 102, 102)');
    expect(field.style.getPropertyPriority('color')).toBe('');
    expect(field.style.getPropertyPriority('background-color')).toBe('');
  });

  it('should give the field the reader\'s high contrast pair where the page keeps it from the field', () => {
    // A page's `!important` black text outweighs the high contrast rule, so
    // the field shows black on the reader's dark grey. Their pair, not the
    // page's colours around the chart.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgb(26, 26, 26)' },
    );
    paintHighContrast(field, '#f0f0f0', '#1a1a1a');

    floorFor(field).check();

    expect(field.style.color).toBe('rgb(240, 240, 240)');
    expect(field.style.getPropertyPriority('color')).toBe('important');
    expect(field.style.backgroundColor).toBe('rgb(26, 26, 26)');
  });

  it('should give the field the reader\'s high contrast pair over its own when high contrast is turned on', () => {
    // The floor's pair from the text around the chart is inline, so the
    // field's paint stays put as high contrast is turned on: only the
    // reader's pair says it was.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const floor = floorFor(field);
    floor.check();
    const before = field.style.color;

    paintHighContrast(field, '#f0f0f0', '#1a1a1a');
    floor.check();

    expect(before).toBe('rgb(255, 255, 255)');
    expect(field.style.color).toBe('rgb(240, 240, 240)');
    expect(field.style.backgroundColor).toBe('rgb(26, 26, 26)');
  });

  it('should take the reader\'s high contrast pair off the field when high contrast is turned off', () => {
    // The page's `!important` black text kept the field from the reader's
    // pair, so the floor set it; with high contrast off, the field's own
    // black on white is readable, and is the page's again.
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' },
    );
    paintHighContrast(field, '#f0f0f0', '#1a1a1a');
    const floor = floorFor(field);
    floor.check();
    const during = field.style.color;

    field.style.removeProperty(Constant.HIGH_CONTRAST_LIGHT_PROPERTY);
    field.style.removeProperty(Constant.HIGH_CONTRAST_DARK_PROPERTY);
    floor.check();

    expect(during).toBe('rgb(240, 240, 240)');
    expect(field.style.color).toBe('rgb(0, 0, 0)');
    expect(field.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(field.style.getPropertyPriority('color')).toBe('');
  });

  it('should leave a field alone under forced colours, which replace whatever it sets', () => {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    window.matchMedia = (query: string): MediaQueryList => Object.assign(new EventTarget(), {
      matches: query === '(forced-colors: active)',
    }) as MediaQueryList;

    floorFor(field).check();

    expect(field.style.getPropertyPriority('color')).toBe('');
    expect(field.style.color).toBe('rgb(0, 0, 0)');
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('should leave a field alone when its colours cannot be read', () => {
    // No colours of its own: jsdom computes `initial`, as it would for any
    // field a page did not style.
    const field = drawField({ text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' }, null);

    floorFor(field).check();

    expect(field.getAttribute('style')).toBeNull();
  });
});

describe('keepFieldReadable between the checks it is asked for', () => {
  /** Waits for `count` animation frames. */
  async function frames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }

  /** Waits until the frames a check is followed by are over. */
  async function quiet(): Promise<void> {
    await frames(8);
  }

  /**
   * Draws an unreadable field the floor has checked, in an article whose
   * colours a test changes without touching the root or body.
   */
  function drawCheckedField(): { field: HTMLTextAreaElement; article: HTMLElement; floor: ReadableField } {
    const field = drawField(
      { text: 'rgb(255, 255, 255)', background: 'rgb(34, 34, 34)' },
      { text: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)' },
    );
    const article = field.parentElement as HTMLElement;
    const floor = floorFor(field);
    floor.check();
    return { field, article, floor };
  }

  /** Gives the article colours of its own. */
  function paintArticle(article: HTMLElement, text: string, background: string): void {
    article.style.color = text;
    article.style.backgroundColor = background;
  }

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
    document.body.removeAttribute('class');
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('should check the field at once when it gains or loses focus', () => {
    // A page's `:focus` rule restyles the field, and braille is measured
    // before it takes focus.
    const { field, article, floor } = drawCheckedField();

    paintArticle(article, 'rgb(240, 240, 200)', 'rgb(20, 20, 60)');
    field.focus();
    const focused = field.style.color;
    paintArticle(article, 'rgb(200, 240, 240)', 'rgb(60, 20, 20)');
    field.blur();

    expect(focused).toBe('rgb(240, 240, 200)');
    expect(field.style.color).toBe('rgb(200, 240, 240)');
    floor.dispose();
  });

  it('should check the field on the next frame when the page switches theme on its body', async () => {
    const { field, floor } = drawCheckedField();
    await quiet();

    document.body.style.color = 'rgb(240, 240, 200)';
    document.body.style.backgroundColor = 'rgb(20, 20, 60)';
    await Promise.resolve();
    const beforeFrame = field.style.color;
    await frames(1);

    expect(beforeFrame).toBe('rgb(255, 255, 255)');
    expect(field.style.color).toBe('rgb(240, 240, 200)');
    floor.dispose();
  });

  it('should not look again when the page sets an attribute to the value it has', async () => {
    // A page that answers each change to its document by marking its body:
    // the floor must not answer the mark.
    document.body.classList.add('seen');
    document.documentElement.setAttribute('lang', 'en');
    const { floor } = drawCheckedField();
    await quiet();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');

    document.body.classList.add('seen');
    document.documentElement.setAttribute('lang', 'en');
    await Promise.resolve();

    expect(requestFrame).not.toHaveBeenCalled();
    floor.dispose();
    document.documentElement.removeAttribute('lang');
  });

  it('should check at most once a frame however often the page changes its root', async () => {
    const { floor } = drawCheckedField();
    await quiet();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');

    for (let i = 0; i < 3; i++) {
      document.documentElement.style.setProperty('--frame', String(i));
      await Promise.resolve();
    }

    expect(requestFrame).toHaveBeenCalledTimes(1);
    floor.dispose();
    document.documentElement.removeAttribute('style');
  });

  it('should check once every few frames while the page changes its root on every one', async () => {
    // A scroll-progress or pointer-follow custom property, written every
    // frame: the floor still follows the page, a few frames behind at most,
    // without reading its colours on every frame.
    const { field, article, floor } = drawCheckedField();
    await quiet();
    const computed = jest.spyOn(window, 'getComputedStyle');
    const reads: number[] = [];
    const colours: string[] = [];

    for (let i = 0; i < 16; i++) {
      document.documentElement.style.setProperty('--frame', String(i));
      if (i === 8) {
        paintArticle(article, 'rgb(240, 240, 200)', 'rgb(20, 20, 60)');
      }
      await frames(1);
      reads.push(computed.mock.calls.length);
      colours.push(field.style.color);
    }
    const checked = reads.filter((count, i) => count > (i === 0 ? 0 : reads[i - 1])).length;

    expect(checked).toBeGreaterThanOrEqual(3);
    expect(checked).toBeLessThanOrEqual(5);
    // Painted before the ninth frame, and caught within four frames of it.
    expect(colours[11]).toBe('rgb(240, 240, 200)');
    floor.dispose();
    document.documentElement.removeAttribute('style');
  });

  it('should check the field on the next frame when the system\'s colour scheme changes', async () => {
    const scheme = new EventTarget();
    window.matchMedia = (): MediaQueryList => scheme as MediaQueryList;
    const { field, article, floor } = drawCheckedField();
    await quiet();

    paintArticle(article, 'rgb(240, 240, 200)', 'rgb(20, 20, 60)');
    scheme.dispatchEvent(new Event('change'));
    await frames(1);

    expect(field.style.color).toBe('rgb(240, 240, 200)');
    floor.dispose();
  });

  it('should check the field on the next frame when a stylesheet loads, or fails to', async () => {
    // A theme switch that enables a stylesheet takes effect once the sheet has
    // loaded: Chromium fires `load` then, and Firefox `error`.
    const { field, article, floor } = drawCheckedField();
    const link = document.createElement('link');
    document.head.append(link);
    await quiet();
    const seen: string[] = [];

    for (const [type, text] of [['load', 'rgb(240, 240, 200)'], ['error', 'rgb(200, 240, 240)']]) {
      paintArticle(article, text, 'rgb(20, 20, 60)');
      link.dispatchEvent(new Event(type));
      await frames(1);
      seen.push(field.style.color);
      await quiet();
    }

    expect(seen).toEqual(['rgb(240, 240, 200)', 'rgb(200, 240, 240)']);
    floor.dispose();
    link.remove();
  });

  it('should not look again when anything but a stylesheet loads', async () => {
    const { floor } = drawCheckedField();
    const image = document.createElement('img');
    document.body.append(image);
    await quiet();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');

    image.dispatchEvent(new Event('load'));

    expect(requestFrame).not.toHaveBeenCalled();
    floor.dispose();
  });

  it('should follow colours that change frame after frame, and stop once they hold', async () => {
    // The colours around the field transitioning after a change.
    const { field, article, floor } = drawCheckedField();
    const seen: string[] = [];

    for (const level of [60, 120, 180]) {
      paintArticle(article, `rgb(${level}, 240, 240)`, 'rgb(20, 20, 60)');
      await frames(1);
      seen.push(field.style.color);
    }
    await quiet();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');
    await frames(3);

    expect(seen).toEqual(['rgb(60, 240, 240)', 'rgb(120, 240, 240)', 'rgb(180, 240, 240)']);
    // The three frames waited for above, and none of the floor's.
    expect(requestFrame).toHaveBeenCalledTimes(3);
    floor.dispose();
  });

  /**
   * A colour transition, as the floor reads one off an element.
   * @param playbackRate - Its rate: 0 for one a page holds where it is
   */
  function backgroundTransition(playbackRate: number): Animation {
    const transition: TransitionStub = { transitionProperty: 'background-color', playState: 'running', playbackRate, finish: jest.fn() };
    return transition as CSSTransition;
  }

  it('should keep checking while a colour transition around the field waits out its delay', async () => {
    // A theme switch whose colours transition after a delay, or step once at
    // the end: frame after frame finds nothing changed until the transition
    // moves, long after the quiet frames that would otherwise end the checks.
    const { field, article, floor } = drawCheckedField();
    await quiet();
    let transitions = [backgroundTransition(1)];
    article.getAnimations = (): Animation[] => transitions;

    document.body.classList.add('dark');
    await frames(12);
    paintArticle(article, 'rgb(240, 240, 200)', 'rgb(20, 20, 60)');
    transitions = [];
    await frames(1);
    const settled = field.style.color;
    await quiet();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');
    await frames(3);

    expect(settled).toBe('rgb(240, 240, 200)');
    // Once it is over, the checks end: the three frames waited for above, and none of the floor's.
    expect(requestFrame).toHaveBeenCalledTimes(3);
    floor.dispose();
  });

  it('should not keep checking for a colour transition the page holds where it is', async () => {
    const { article, floor } = drawCheckedField();
    await quiet();
    article.getAnimations = (): Animation[] => [backgroundTransition(0)];

    document.body.classList.add('dark');
    await quiet();
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');
    await frames(3);

    expect(requestFrame).toHaveBeenCalledTimes(3);
    floor.dispose();
  });

  it('should log what a check on a frame throws, and stop checking, rather than throw it', async () => {
    // Nothing above a frame callback catches an error: the floor reports it,
    // leaves the field as it is, and does not fail the same way every frame.
    const { field, floor } = drawCheckedField();
    await quiet();
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    field.getAnimations = (): Animation[] => {
      throw new Error('getAnimations failed');
    };

    document.body.style.color = 'rgb(240, 240, 200)';
    await frames(1);
    const requestFrame = jest.spyOn(window, 'requestAnimationFrame');
    await frames(3);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[keepFieldReadable]'), expect.any(Error));
    // The three frames waited for above, and none of the floor's.
    expect(requestFrame).toHaveBeenCalledTimes(3);
    floor.dispose();
  });

  it('should log what a check on focus throws rather than throw it', () => {
    const { field, article, floor } = drawCheckedField();
    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    field.getAnimations = (): Animation[] => {
      throw new Error('getAnimations failed');
    };

    paintArticle(article, 'rgb(240, 240, 200)', 'rgb(20, 20, 60)');
    field.focus();

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('[keepFieldReadable]'), expect.any(Error));
    floor.dispose();
  });

  it('should stop checking, and put back what it replaced, once disposed', async () => {
    const { field, floor } = drawCheckedField();
    const cancelFrame = jest.spyOn(window, 'cancelAnimationFrame');

    floor.dispose();
    document.body.style.color = 'rgb(240, 240, 200)';
    await frames(2);
    field.focus();

    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(field.style.color).toBe('rgb(0, 0, 0)');
    expect(field.style.getPropertyPriority('color')).toBe('');
  });
});
