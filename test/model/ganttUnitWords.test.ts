import type { GanttPoint, MaidrLayer } from '@type/grammar';
import { afterEach, describe, expect, test } from '@jest/globals';
import { GanttTrace } from '@model/gantt';
import { TraceType } from '@type/grammar';
import { setLocale, t } from '@util/i18n';
// Every dictionary but English is a locale pack, so load them all.
import '../../src/locale/all';

/**
 * The unit a gantt names its lengths in, in the reader's language.
 *
 * The adapters name a schedule's unit -- `days` where the chart counts in
 * days, `hours` where it counts in hours -- and always in English, so a
 * German reader heard "Länge ist 30 days" and read a table headed
 * "Länge (days)". A unit of time named in English now reads in the reader's
 * language, in the singular for a length of one; any other word is the
 * chart's own and reads as written.
 */

/** One lane: a 30-unit interval, a 1-unit one, and a 15-unit one. */
const LANE: GanttPoint[][] = [[
  { x: 'Design', start: 0, end: 30 },
  { x: 'Design', start: 40, end: 41 },
  { x: 'Design', start: 50, end: 65 },
]];

/**
 * A gantt over {@link LANE} whose unit is the given word.
 *
 * @param unit - What the chart calls a unit of its axis
 * @returns The trace
 */
function schedule(unit: string): GanttTrace {
  const layer: MaidrLayer = {
    id: 'schedule',
    type: TraceType.GANTT,
    axes: { x: { label: 'Task' }, y: { label: 'Day' } },
    data: { points: LANE, unit },
  };
  return new GanttTrace(layer);
}

/**
 * What the reader is told at each interval, and the summary's shortest and
 * longest lengths and the table's Length header.
 *
 * @param trace - The trace
 * @returns The three readings
 */
function readings(trace: GanttTrace): { spoken: unknown[]; shortest: unknown; longest: unknown; header: string } {
  const spoken = LANE[0].map((_point, col) => {
    trace.moveToIndex(0, col);
    const state = trace.state;
    return state.empty ? undefined : state.text.z?.value;
  });
  const { stats, dataTable } = trace.description;
  return {
    spoken,
    shortest: stats.find(stat => stat.label === t('model.statShortest'))?.value,
    longest: stats.find(stat => stat.label === t('model.statLongest'))?.value,
    header: dataTable.headers[dataTable.headers.length - 1],
  };
}

afterEach(() => {
  setLocale('en');
});

describe('a gantt\'s unit of time', () => {
  test('reads in the reader\'s language', () => {
    setLocale('de');

    expect(readings(schedule('days'))).toEqual({
      spoken: ['30 Tage', '1 Tag', '15 Tage'],
      shortest: '1 Tag',
      longest: '30 Tage',
      header: 'Länge (Tage)',
    });
  });

  test('reads a length of one in the singular in English too', () => {
    expect(readings(schedule('days'))).toEqual({
      spoken: ['30 days', '1 day', '15 days'],
      shortest: '1 day',
      longest: '30 days',
      header: 'Length (days)',
    });
  });

  test('is recognised in the singular and in any case', () => {
    setLocale('ko');

    expect(readings(schedule('Hour')).spoken).toEqual(['30시간', '1시간', '15시간']);
    expect(readings(schedule('WEEKS')).header).toBe('길이 (주)');
  });

  test('leaves a word that names no unit of time as the chart wrote it', () => {
    // A packet diagram counts bits, and no dictionary has a word for them.
    setLocale('de');
    const { spoken, longest, header } = readings(schedule('bits'));

    expect(spoken[0]).toBe('30 bits');
    expect(longest).toBe('30 bits');
    expect(header).toBe('Länge (bits)');
  });
});
