import type { Maidr } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { chartTypeLabel } from '@model/abstract';
import { BarTrace } from '@model/bar';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { setLocale } from '@util/i18n';

/**
 * The model layer speaks: everything a reader hears before they touch a chart
 * — the entry instruction, the chart type, the statistic labels — is built in
 * `src/model/` and has to come out in the reader's language.
 *
 * These are the three shapes that carry the whole path: a message the model
 * composes from several keys ({@link Context.getInstruction}), a table lookup
 * keyed by trace type ({@link chartTypeLabel}), and a statistic label built
 * inside a getter. If all three switch, nothing in the layer is frozen at
 * import time — which is the failure a module-level `const label = t(...)`
 * would produce, and the one thing that cannot be seen in English.
 */

/** A one-layer bar figure, the smallest thing `Context` will descend into. */
function createBarFigure(): Figure {
  const maidr: Maidr = {
    id: 'korean-instruction',
    subplots: [[{
      layers: [{
        id: 'bar-layer',
        type: TraceType.BAR,
        axes: { x: { label: '분류' }, y: { label: '값' } },
        data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
      }],
    }]],
  } as Maidr;
  return new Figure(maidr);
}

describe('the model layer in Korean', () => {
  afterEach(() => {
    // The locale is process-wide, so a test that switched it has to switch it
    // back or every later test in the run reads Korean.
    setLocale('en');
  });

  test('speaks the entry instruction in Korean after the locale changes', () => {
    const context = new Context(createBarFigure());
    const english = context.getInstruction(true);
    expect(english).toContain('This is a maidr plot of type: vertical bar.');
    expect(english).toContain('Click to activate.');

    setLocale('ko');

    const korean = context.getInstruction(true);
    expect(korean).toContain('이것은 세로 막대 유형의 maidr 그래프입니다.');
    expect(korean).toContain('클릭하여 활성화하세요.');
    expect(korean).not.toContain('This is a maidr plot');
  });

  test('names the chart type in Korean, from the same trace type', () => {
    expect(chartTypeLabel(TraceType.BAR)).toBe('Bar Chart');

    setLocale('ko');

    expect(chartTypeLabel(TraceType.BAR)).toBe('막대 그래프');
    expect(chartTypeLabel(TraceType.BOX)).toBe('상자 그림');
  });

  test('labels a statistic in Korean on a trace built while English was active', () => {
    // Built first, so its labels cannot have been resolved at construction:
    // a trace outlives a language change, and the description is the surface
    // where a frozen label would show.
    const trace = new BarTrace({
      id: 'bar-layer',
      type: TraceType.BAR,
      axes: { x: { label: '분류' }, y: { label: '값' } },
      data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
    });
    expect(trace.description.stats.map(stat => stat.label)).toContain('Number of bars');

    setLocale('ko');

    const labels = trace.description.stats.map(stat => stat.label);
    expect(labels).toContain('막대 개수');
    expect(labels).toContain('최솟값');
    expect(trace.description.chartType).toBe('막대 그래프');
  });
});
