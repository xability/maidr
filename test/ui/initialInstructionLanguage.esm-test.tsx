/**
 * @jest-environment jsdom
 */

/**
 * The pre-activation announcement is the first thing a screen reader says
 * about a chart, before any focus-in builds a Controller and its
 * SettingsService. It has to be in the reader's stored language from the
 * very first render: the label is computed in that render, so a language
 * applied afterwards would leave one English frame in front of it.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { SETTINGS_KEY } from '@service/settings';
import { TraceType } from '@type/grammar';
import { setLocale } from '@util/i18n';
import { renderToString } from 'react-dom/server.node';
import { Maidr } from '../../src/maidr-component';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

const data: MaidrData = {
  id: 'language-test',
  subplots: [[{
    layers: [{
      id: 'bar-layer',
      type: TraceType.BAR,
      axes: { x: { label: 'Category' }, y: { label: 'Value' } },
      data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
    }],
  }]],
};

/**
 * Renders the chart once, with no effects run, and reads the wrapper's label
 * and the article's language out of the markup.
 * @returns The `aria-label` and `lang` attributes of the first render
 */
function firstRender(): { label: string; lang: string } {
  const markup = renderToString(
    <Maidr data={data}>
      <svg />
    </Maidr>,
  );
  const label = /aria-label="([^"]*)"/.exec(markup)?.[1] ?? '';
  const lang = /<article[^>]*\slang="([^"]*)"/.exec(markup)?.[1] ?? '';
  return { label, lang };
}

describe('pre-activation instruction language', () => {
  afterEach(() => {
    localStorage.removeItem(SETTINGS_KEY);
    setLocale('en');
  });

  test('speaks the stored language in the very first render', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { language: 'ko' } }));

    const { label, lang } = firstRender();

    expect(lang).toBe('ko');
    expect(label).toContain('maidr 그래프입니다');
    expect(label).not.toContain('This is a maidr plot');
  });

  test('speaks English when nothing is stored', () => {
    const { label, lang } = firstRender();

    expect(lang).toBe('en');
    expect(label).toContain('This is a maidr plot of type: vertical bar.');
  });
});
