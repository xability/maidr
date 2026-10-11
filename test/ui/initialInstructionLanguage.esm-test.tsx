/**
 * @jest-environment jsdom
 */

/**
 * The pre-activation announcement is the first thing a screen reader says
 * about a chart, before any focus-in builds a Controller and its
 * SettingsService. It has to be in the reader's stored language from the
 * very first render: the name and the instructions it is described by are
 * computed in that render, so a language applied afterwards would leave one
 * English frame in front of them.
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
 * Renders the chart once, with no effects run, and reads the wrapper's name,
 * the instructions it is described by and the article's language out of the
 * markup.
 * @returns The wrapper's `aria-label`, the text of the element its
 * `aria-describedby` names, and the article's `lang`, in the first render
 */
function firstRender(): { name: string; description: string; lang: string } {
  const markup = renderToString(
    <Maidr data={data}>
      <svg />
    </Maidr>,
  );
  const name = /aria-label="([^"]*)"/.exec(markup)?.[1] ?? '';
  const describedBy = /aria-describedby="([^"]*)"/.exec(markup)?.[1] ?? '';
  const description = new RegExp(`<div id="${describedBy}" hidden="">([^<]*)</div>`).exec(markup)?.[1] ?? '';
  const lang = /<article[^>]*\slang="([^"]*)"/.exec(markup)?.[1] ?? '';
  return { name, description, lang };
}

describe('pre-activation instruction language', () => {
  afterEach(() => {
    localStorage.removeItem(SETTINGS_KEY);
    setLocale('en');
  });

  test('speaks the stored language in the very first render', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ general: { language: 'ko' } }));

    const { name, description, lang } = firstRender();

    expect(lang).toBe('ko');
    expect(name).toBe('막대 그래프');
    expect(description).toContain('maidr 그래프입니다');
    expect(description).toContain('키보드 도움말을 보려면');
    expect(description).not.toContain('This is a maidr plot');
  });

  test('speaks English when nothing is stored', () => {
    const { name, description, lang } = firstRender();

    expect(lang).toBe('en');
    expect(name).toBe('Bar Chart');
    expect(description).toContain('This is a maidr plot of type: vertical bar.');
    expect(description).toContain('Press Control Slash for keyboard help.');
  });
});
