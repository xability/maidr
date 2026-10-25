/**
 * @jest-environment jsdom
 */

import type { Maidr } from '@type/grammar';
import type { Locale } from '@util/i18n/locale';
import {
  adapterLocale,
  followReaderLanguage,
  languageRewritesSettled,
  stopFollowingReaderLanguage,
} from '@adapters/shared/language';
import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LANGUAGE_CHANGE_EVENT } from '@util/i18n/locale';
import { SETTINGS_KEY } from '@util/settingsKey';

/**
 * Keeping a diagram adapter's words in the language MAIDR speaks: which one
 * it writes in, and writing them again when the reader changes it.
 */

/** `window.maidrLive`, as far as an adapter uses it. */
interface LiveStub {
  setData: jest.Mock<(maidr: Maidr) => boolean>;
}

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
const error = jest.spyOn(console, 'error').mockImplementation(() => {});

/**
 * A figure whose one word is in a language.
 *
 * @param word - The word
 * @returns The figure
 */
function figure(word: string): Maidr {
  return { id: 'fig', subplots: [[{ layers: [{ id: 'l', type: 'tree' as never, axes: { x: { label: word } }, data: [] }] }]] };
}

/** The figure each language makes. */
const WORD: Partial<Record<Locale, string>> = { en: 'Topic', ko: '주제', de: 'Thema' };

/**
 * A drawing in the page, bound as an adapter binds it.
 *
 * @param bound - Whether it carries the `maidr` attribute MAIDR reads
 * @returns The drawing
 */
function drawing(bound = true): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (bound) {
    svg.setAttribute('maidr', '{}');
  }
  document.body.appendChild(svg);
  return svg;
}

/**
 * Tells the page MAIDR now speaks a language, as the core does, and waits for
 * the adapters to write their words again.
 *
 * @param language - The language
 */
async function speak(language: string): Promise<void> {
  document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language } }));
  await languageRewritesSettled();
}

describe('adapterLocale', () => {
  afterEach(() => {
    localStorage.clear();
    warn.mockClear();
  });

  it('should be the language given', () => {
    expect(adapterLocale('de', 'test')).toBe('de');
  });

  it('should be the reader\'s when none is given: the one chosen in settings, else the browser\'s', () => {
    expect(adapterLocale(undefined, 'test')).toBe('en');

    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { language: 'hi' } }));

    expect(adapterLocale(undefined, 'test')).toBe('hi');
  });

  it('should be the reader\'s, with a warning naming the adapter, for a language MAIDR does not speak', () => {
    expect(adapterLocale('pt-BR', 'graphviz')).toBe('en');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[maidr\/graphviz\] Ignoring language "pt-BR"/));
  });
});

describe('followReaderLanguage', () => {
  let live: LiveStub;

  beforeEach(() => {
    live = { setData: jest.fn<(maidr: Maidr) => boolean>(() => true) };
    (window as unknown as { maidrLive?: LiveStub }).maidrLive = live;
  });

  afterEach(async () => {
    // Back to English, so the next test starts where a page does.
    await speak('en');
    document.body.innerHTML = '';
    delete (window as unknown as { maidrLive?: LiveStub }).maidrLive;
    error.mockClear();
  });

  afterAll(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  /**
   * Binds a drawing that follows the reader, converted in English.
   *
   * @param svg - The drawing
   * @returns The conversion, counting its calls
   */
  function follow(svg: Element): jest.Mock<(language: Locale) => Maidr> {
    const reconvert = jest.fn((language: Locale) => figure(WORD[language] ?? 'Topic'));
    followReaderLanguage(svg, 'en', figure('Topic'), reconvert);
    return reconvert;
  }

  it('should convert a chart again in the new language and hand MAIDR the result', async () => {
    const svg = drawing();
    const reconvert = follow(svg);

    await speak('ko');

    expect(reconvert).toHaveBeenCalledWith('ko');
    expect(live.setData).toHaveBeenCalledTimes(1);
    expect(live.setData.mock.calls[0][0]).toEqual(figure('주제'));
  });

  it('should hand MAIDR nothing when the chart comes out the same, as one with no words of the adapter\'s does', async () => {
    const svg = drawing();
    followReaderLanguage(svg, 'en', figure('Total'), () => figure('Total'));

    await speak('ko');

    expect(live.setData).not.toHaveBeenCalled();
  });

  it('should leave a chart alone when MAIDR speaks the language its words are in', async () => {
    const svg = drawing();
    const reconvert = follow(svg);

    await speak('en');

    expect(reconvert).not.toHaveBeenCalled();
  });

  it('should write each change once, in the order MAIDR made them', async () => {
    const svg = drawing();
    const reconvert = follow(svg);

    document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language: 'ko' } }));
    document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language: 'de' } }));
    await languageRewritesSettled();

    expect(reconvert.mock.calls.map(([language]) => language)).toEqual(['ko', 'de']);
    expect(live.setData.mock.calls.map(([maidr]) => maidr)).toEqual([figure('주제'), figure('Thema')]);
  });

  it('should let go of a chart no longer in the page', async () => {
    const svg = drawing();
    const reconvert = follow(svg);
    svg.remove();

    await speak('ko');

    expect(reconvert).not.toHaveBeenCalled();
  });

  it('should hand MAIDR only a chart it was bound through the attribute', async () => {
    // The caller kept the figure, to place it some other way.
    const svg = drawing(false);
    const reconvert = follow(svg);

    await speak('ko');

    expect(reconvert).toHaveBeenCalledWith('ko');
    expect(live.setData).not.toHaveBeenCalled();
  });

  it('should stop following a chart converted again in a language of its own', async () => {
    const svg = drawing();
    const reconvert = follow(svg);
    stopFollowingReaderLanguage(svg);

    await speak('ko');

    expect(reconvert).not.toHaveBeenCalled();
  });

  it('should go on to the other charts when one cannot be converted again', async () => {
    const broken = drawing();
    followReaderLanguage(broken, 'en', figure('Topic'), () => {
      throw new Error('gone');
    });
    const svg = drawing();
    follow(svg);

    await speak('ko');

    expect(error).toHaveBeenCalledWith(expect.stringContaining('Could not write a diagram\'s words'), expect.any(Error));
    expect(live.setData).toHaveBeenCalledWith(figure('주제'));
  });

  it('should ignore an event that names no language MAIDR speaks', async () => {
    const svg = drawing();
    const reconvert = follow(svg);

    await speak('klingon');

    expect(reconvert).not.toHaveBeenCalled();
  });
});
