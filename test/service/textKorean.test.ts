import type { BarTrace } from '@model/bar';
import type { NotificationService } from '@service/notification';
import type { BarPoint, MaidrLayer } from '@type/grammar';
import type { PlotState } from '@type/state';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';
import { setLocale } from '@util/i18n';
// The Korean dictionary is a locale pack, not part of the core, so load it.
import '../../src/locale/ko';

/**
 * The text service is the surface a reader hears on every arrow key, so it is
 * the one that has to speak their language. These assertions are on the
 * rendered sentence rather than on the dictionary, because a key that exists
 * but is never reached reads out in English all the same.
 */

const BARS: BarPoint[] = [
  { x: '사과', y: 10 },
  { x: '배', y: 20 },
];

/** A bar layer whose labels are the ones a Korean producer would author. */
function barLayer(): MaidrLayer {
  return {
    id: 'korean-bar',
    type: TraceType.BAR,
    title: '판매량',
    axes: { x: { label: '분류' }, y: { label: '값' } },
    data: BARS,
  };
}

/** A notification service that records what it was asked to speak. */
function createMockNotificationService(): NotificationService {
  return { notify: jest.fn() } as unknown as NotificationService;
}

/**
 * A non-empty subplot state, which reads as the layer announcement.
 * @param index - 1-based position of the layer
 * @param size - Total number of layers
 * @returns The state
 */
function subplotState(index: number, size: number): PlotState {
  return {
    empty: false,
    type: 'subplot',
    index,
    size,
    trace: {
      empty: false,
      type: 'trace',
      traceType: 'bar',
      plotType: 'bar',
      layerId: 'korean-bar',
      name: '판매량',
    },
  } as unknown as PlotState;
}

/** The out-of-bounds state a trace fires when navigation hits an edge. */
function boundaryState(): PlotState {
  return { empty: true, type: 'trace' } as unknown as PlotState;
}

afterEach(() => {
  setLocale('en');
});

describe('textService speaks Korean', () => {
  test('a point reads with the Korean particle attached to its label', () => {
    const trace = TraceFactory.create(barLayer()) as BarTrace;
    trace.moveToIndex(0, 0);

    setLocale('ko');
    const text = new TextService(createMockNotificationService());
    const heard: string[] = [];
    text.onChange(event => heard.push(String(event.value)));

    text.update(trace.state);

    // "{label} is {value}" twice, joined -- with 는 after 분류 (open syllable)
    // and 은 after 값 (closed), which is why the particle cannot be written
    // into the template.
    expect(heard[heard.length - 1]).toBe('분류는 사과, 값은 10');
  });

  test('a layer announcement puts the count before the position', () => {
    setLocale('ko');
    const text = new TextService(createMockNotificationService());

    expect(text.format(subplotState(1, 2))).toBe('레이어 2개 중 1: 판매량');
  });

  test('the boundary cue is announced in Korean in both verbosities', () => {
    setLocale('ko');
    const text = new TextService(createMockNotificationService());
    const heard: string[] = [];
    text.onChange(event => heard.push(String(event.value)));

    text.update(boundaryState());
    expect(heard[heard.length - 1]).toBe('표시할 데이터가 더 없습니다');

    text.toggle(); // VERBOSE -> TERSE
    text.update(boundaryState());
    expect(heard[heard.length - 1]).toBe('데이터 끝');
  });

  test('switching back to English restores the English wording', () => {
    setLocale('ko');
    setLocale('en');
    const text = new TextService(createMockNotificationService());

    expect(text.format(subplotState(1, 2))).toBe('Layer 1 of 2: 판매량');
  });
});
