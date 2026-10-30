import type { GaugeBand, GaugePoint, MaidrLayer } from '@type/grammar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * The reading docs/recharts.md quotes for its gauge recipe is the one MAIDR
 * gives the recipe's own chart.
 *
 * The guide says what a sighted reader takes from the dial and a screen reader
 * cannot, in one quoted sentence. Nothing tied that sentence to the recipe
 * above it, and it named the band the value sits under rather than the one it
 * is in.
 */

const GUIDE = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'recharts.md'), 'utf8');

/**
 * The guide's gauge section, from its heading to the next one.
 *
 * @returns The section's Markdown
 */
function gaugeSection(): string {
  const start = GUIDE.indexOf('#### Gauge Chart');
  return GUIDE.slice(start, GUIDE.indexOf('\n#### ', start + 1));
}

describe('the recharts guide\'s gauge recipe', () => {
  it('quotes the reading MAIDR gives the recipe\'s chart', () => {
    const section = gaugeSection();
    const numberAt = (key: string): number => Number(new RegExp(`\\b${key}: (-?[\\d.]+)`).exec(section)?.[1]);
    const bands: GaugeBand[] = [...section.matchAll(/\{ to: (-?[\d.]+), label: '([^']+)' \}/g)]
      .map(([, to, label]) => ({ to: Number(to), label }));
    const point: GaugePoint = {
      value: numberAt('score'),
      min: numberAt('min'),
      max: numberAt('max'),
      target: numberAt('target'),
      bands,
    };
    const trace = TraceFactory.create({ id: 'gauge', type: TraceType.GAUGE, data: point } as MaidrLayer);

    const state = trace.state;
    trace.dispose();
    const quoted = /"(\d+) out of (\d+), (\d+) below target, in the '([^']+)' band"/.exec(section);

    expect(bands).toHaveLength(3);
    expect(state.empty).toBe(false);
    expect(quoted?.slice(1)).toEqual([
      String(point.value),
      String(point.max),
      String(Number(point.target) - point.value),
      state.empty ? undefined : state.text.section,
    ]);
  });
});
