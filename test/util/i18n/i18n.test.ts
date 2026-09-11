import {
  browserLanguages,
  DEFAULT_LOCALE,
  getLocale,
  interpolate,
  isLanguageSetting,
  isLocale,
  LOCALE_NAMES,
  onLocaleChange,
  resolveLocale,
  setLocale,
  SUPPORTED_LOCALES,
} from '@util/i18n';

describe('i18n', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  describe('interpolate', () => {
    it('should substitute named placeholders', () => {
      expect(interpolate('{label} is {value}', { label: 'x', value: 5 })).toBe('x is 5');
    });

    it('should render an absent parameter as nothing', () => {
      expect(interpolate('{a}|{b}', { a: 'only' })).toBe('only|');
    });

    it('should attach a Korean particle named after the pipe', () => {
      expect(interpolate('{label|은는} {value}', { label: '가격', value: 5 })).toBe('가격은 5');
      expect(interpolate('{label|은는} {value}', { label: '온도', value: 5 })).toBe('온도는 5');
    });

    it('should ignore a modifier it does not know', () => {
      expect(interpolate('{label|upper}', { label: 'x' })).toBe('x');
    });
  });

  describe('locale', () => {
    it('should start in English', () => {
      expect(getLocale()).toBe('en');
      expect(SUPPORTED_LOCALES).toEqual(['en', 'ko', 'ja', 'zh', 'es', 'de', 'fr', 'it', 'hi']);
    });

    it('should name every locale in itself', () => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(LOCALE_NAMES[locale]).not.toBe('');
      }
      expect(LOCALE_NAMES.ja).toBe('日本語');
      expect(LOCALE_NAMES.hi).toBe('हिन्दी');
    });

    it('should recognise supported locales and the auto setting', () => {
      expect(isLocale('ko')).toBe(true);
      expect(isLocale('pt')).toBe(false);
      expect(isLocale(undefined)).toBe(false);
      expect(isLanguageSetting('auto')).toBe(true);
      expect(isLanguageSetting('xx')).toBe(false);
    });

    it('should notify listeners only when the locale actually changes', () => {
      const listener = jest.fn();
      const subscription = onLocaleChange(listener);

      setLocale('ko');
      setLocale('ko');
      setLocale('en');
      subscription.dispose();
      setLocale('ko');

      expect(listener.mock.calls).toEqual([['ko'], ['en']]);
    });
  });

  describe('browserLanguages', () => {
    const original = Object.getOwnPropertyDescriptors(navigator);

    function stubNavigator(languages: readonly string[] | undefined, language: string): void {
      Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
      Object.defineProperty(navigator, 'language', { value: language, configurable: true });
    }

    afterEach(() => {
      Object.defineProperties(navigator, original);
    });

    it('should prefer the full preference list', () => {
      stubNavigator(['ko-KR', 'en-US'], 'en-US');

      expect(browserLanguages()).toEqual(['ko-KR', 'en-US']);
    });

    it('should fall back to the single language when the list is empty', () => {
      stubNavigator([], 'ko-KR');

      expect(browserLanguages()).toEqual(['ko-KR']);
      expect(resolveLocale('auto')).toBe('ko');
    });

    it('should fall back to the single language when the list is missing', () => {
      stubNavigator(undefined, 'ko');

      expect(resolveLocale('auto')).toBe('ko');
    });
  });

  describe('resolveLocale', () => {
    it('should return an explicit locale as is', () => {
      expect(resolveLocale('ko', ['en-US'])).toBe('ko');
    });

    it('should follow the first browser language MAIDR supports', () => {
      expect(resolveLocale('auto', ['pt-BR', 'ko-KR', 'en-US'])).toBe('ko');
      expect(resolveLocale('auto', ['EN-GB'])).toBe('en');
    });

    it('should match every supported language on its primary subtag', () => {
      expect(resolveLocale('auto', ['ja-JP'])).toBe('ja');
      expect(resolveLocale('auto', ['zh-Hant-TW'])).toBe('zh');
      expect(resolveLocale('auto', ['zh-CN'])).toBe('zh');
      expect(resolveLocale('auto', ['es-419'])).toBe('es');
      expect(resolveLocale('auto', ['de-CH'])).toBe('de');
      expect(resolveLocale('auto', ['fr-CA'])).toBe('fr');
      expect(resolveLocale('auto', ['it-IT'])).toBe('it');
      expect(resolveLocale('auto', ['hi-IN'])).toBe('hi');
    });

    it('should fall back to English when no browser language is supported', () => {
      expect(resolveLocale('auto', ['pt-BR'])).toBe('en');
      expect(resolveLocale('auto', [])).toBe('en');
    });
  });
});
