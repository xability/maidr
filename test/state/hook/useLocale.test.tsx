/**
 * @jest-environment jsdom
 */

import type { MessageKey } from '@util/i18n';
import { afterEach, describe, expect, it } from '@jest/globals';
import { useLocale } from '@state/hook/useLocale';
import { act, render, screen } from '@testing-library/react';
import { registerLocale, setLocale } from '@util/i18n';
import { en } from '@util/i18n/en';
import React from 'react';
// The `/jest-globals` entry point augments the imported `expect`.
import '@testing-library/jest-dom/jest-globals';

/**
 * A dictionary that answers every key with a marker.
 * @param marker - What every message renders as
 * @returns A complete dictionary
 */
function stub(marker: string): Readonly<Record<MessageKey, string>> {
  return Object.fromEntries(Object.keys(en).map(key => [key, marker])) as Readonly<Record<MessageKey, string>>;
}

const Title: React.FC = () => {
  const { locale, t } = useLocale();
  return <h1 lang={locale}>{t('settings.title')}</h1>;
};

describe('useLocale', () => {
  afterEach(() => {
    setLocale('en');
  });

  it('should re-render when the language changes', () => {
    render(<Title />);
    expect(screen.getByRole('heading')).toHaveTextContent(en['settings.title']);

    act(() => setLocale('ko'));

    expect(screen.getByRole('heading').getAttribute('lang')).toBe('ko');
  });

  it('should re-render when the active language\'s pack arrives', () => {
    act(() => setLocale('it'));
    render(<Title />);
    // The pack is not here yet, so the heading is still English.
    expect(screen.getByRole('heading')).toHaveTextContent(en['settings.title']);

    act(() => registerLocale('it', stub('Impostazioni')));

    expect(screen.getByRole('heading')).toHaveTextContent('Impostazioni');
    expect(screen.getByRole('heading').getAttribute('lang')).toBe('it');
  });
});
