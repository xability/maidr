import {
  DEFAULT_LOCALE,
  getLocale,
  interpolate,
  isLanguageSetting,
  isLocale,
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
      expect(SUPPORTED_LOCALES).toContain('ko');
    });

    it('should recognise supported locales and the auto setting', () => {
      expect(isLocale('ko')).toBe(true);
      expect(isLocale('fr')).toBe(false);
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

  describe('resolveLocale', () => {
    it('should return an explicit locale as is', () => {
      expect(resolveLocale('ko', ['en-US'])).toBe('ko');
    });

    it('should follow the first browser language MAIDR supports', () => {
      expect(resolveLocale('auto', ['fr-FR', 'ko-KR', 'en-US'])).toBe('ko');
      expect(resolveLocale('auto', ['EN-GB'])).toBe('en');
    });

    it('should fall back to English when no browser language is supported', () => {
      expect(resolveLocale('auto', ['fr-FR'])).toBe('en');
      expect(resolveLocale('auto', [])).toBe('en');
    });
  });
});
