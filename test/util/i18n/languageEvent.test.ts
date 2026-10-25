/**
 * @jest-environment jsdom
 */

import type { LanguageChangeDetail } from '@util/i18n';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { LANGUAGE_CHANGE_EVENT, registerLocale, setLocale } from '@util/i18n';
import { ko } from '@util/i18n/ko';

/**
 * The event MAIDR fires on the page when the language it speaks changes, for
 * what it does not render itself: a diagram adapter writes its own words into
 * the chart data, and listens for this to write them again.
 */

describe('the language change event', () => {
  const heard = jest.fn<(detail: LanguageChangeDetail) => void>();
  const listener = (event: Event): void => heard((event as CustomEvent<LanguageChangeDetail>).detail);

  afterEach(() => {
    document.removeEventListener(LANGUAGE_CHANGE_EVENT, listener);
    setLocale('en');
    heard.mockClear();
  });

  it('should be fired on the document with the new language, once per change', () => {
    document.addEventListener(LANGUAGE_CHANGE_EVENT, listener);

    setLocale('ko');
    setLocale('ko');
    setLocale('de');

    expect(heard.mock.calls.map(([detail]) => detail)).toEqual([{ language: 'ko' }, { language: 'de' }]);
  });

  it('should not be fired when the language MAIDR speaks has only arrived', () => {
    setLocale('ko');
    document.addEventListener(LANGUAGE_CHANGE_EVENT, listener);

    // The pack re-renders what MAIDR says itself; the language is the same.
    registerLocale('ko', ko);

    expect(heard).not.toHaveBeenCalled();
  });
});
