/**
 * @jest-environment jsdom
 */

/**
 * A Vega-Lite line read against a y axis that names its levels announces the
 * names.
 *
 * py-maidr's Altair hypnogram codes its sleep stages as 0 to 4 and names them
 * on the axis with `labelExpr`: N3, N2, N1, REM, Awake. The names exist only
 * on the drawn axis, so the converter could not carry them, and the chart was
 * announced as "Sleep stage is 3" where the axis says REM.
 *
 * The axes below imitate what Vega renders: one `<text>` per tick under
 * `g.role-axis-label`, each bound to its tick, whose `value` the text names.
 */
import type { VegaLiteSpec, VegaView } from '@adapters/vegalite/types';
import type { LinePoint, Maidr, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { initMaidrOnElement } from '@util/initMaidr';
import { bindVegaLite } from '../../../src/vegalite-entry';

jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));
const initMock = initMaidrOnElement as unknown as jest.Mock;

const SVG_NS = 'http://www.w3.org/2000/svg';

const STAGE_NAMES = ['N3', 'N2', 'N1', 'REM', 'Awake'];

/** A night's readings: hours asleep, and the stage code. */
const NIGHT = [4, 3, 2, 1, 0, 0, 1, 3].map((stage, i) => ({ hours: i * 0.5, stage }));

/** The Altair hypnogram's y axis: its codes, and the names drawn for them. */
const STAGE_AXIS = {
  values: [0, 1, 2, 3, 4],
  labelExpr: 'datum.value == 0 ? \'N3\' : datum.value == 1 ? \'N2\' : '
    + 'datum.value == 2 ? \'N1\' : datum.value == 3 ? \'REM\' : \'Awake\'',
};

/**
 * The hypnogram spec over the given rows.
 * @param rows - The readings
 * @param yAxis - The y channel's axis
 * @returns The spec
 */
function hypnogram(rows: Array<Record<string, number>>, yAxis: Record<string, unknown> = STAGE_AXIS): VegaLiteSpec {
  return {
    data: { values: rows },
    mark: { type: 'line', interpolate: 'step-after' },
    encoding: {
      x: { field: 'hours', type: 'quantitative', title: 'Time asleep (hours)' },
      y: { field: 'stage', type: 'quantitative', title: 'Sleep stage', axis: yAxis },
    },
  } as unknown as VegaLiteSpec;
}

/**
 * Append one axis: a label per tick, laid along x or up y, bound to its tick.
 * @param svg - The chart's SVG
 * @param ticks - Each tick's value and the text drawn for it
 * @param vertical - Whether the axis runs up the page
 * @param left - Where a vertical axis stands
 */
function axis(
  svg: Element,
  ticks: Array<[number, string]>,
  vertical: boolean,
  left = 30,
): void {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'mark-group role-axis');
  const labels = document.createElementNS(SVG_NS, 'g');
  labels.setAttribute('class', 'mark-text role-axis-label');
  for (const [value, name] of ticks) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.textContent = name;
    (text as unknown as { __data__: unknown }).__data__ = { datum: { value, label: String(value) } };
    const x = vertical ? left : 50 + value * 40;
    const y = vertical ? 300 - value * 50 : 320;
    text.getBoundingClientRect = (): DOMRect =>
      ({ x, y, width: 20, height: 10, top: y, left: x, right: x + 20, bottom: y + 10 }) as DOMRect;
    labels.appendChild(text);
  }
  const title = document.createElementNS(SVG_NS, 'g');
  title.setAttribute('class', 'mark-text role-axis-title');
  title.appendChild(document.createElementNS(SVG_NS, 'text')).textContent = 'Sleep stage';
  group.append(labels, title);
  svg.appendChild(group);
}

/**
 * A rendered hypnogram: the axes and the line.
 * @param yTicks - The y axis' ticks
 * @param extraY - A second vertical axis' ticks, for a dual-axis chart
 * @returns The view to bind
 */
function chart(yTicks: Array<[number, string]>, extraY?: Array<[number, string]>): VegaView {
  const container = document.createElement('div');
  container.id = 'chart';
  const svg = document.createElementNS(SVG_NS, 'svg');
  axis(svg, [[0, '0'], [4, '4'], [8, '8']], false);
  axis(svg, yTicks, true);
  if (extraY)
    axis(svg, extraY, true, 500);
  const marks = document.createElementNS(SVG_NS, 'g');
  marks.setAttribute('class', 'mark-line role-mark marks');
  marks.appendChild(document.createElementNS(SVG_NS, 'path'));
  svg.appendChild(marks);
  container.appendChild(svg);
  document.body.appendChild(container);

  const view = {
    container: () => container,
    data: (name: string) => {
      throw new Error(`no dataset ${name}`);
    },
    runAsync: async (): Promise<unknown> => view,
    scale: () => {
      throw new Error('no scales');
    },
  } as unknown as VegaView;
  return view;
}

/**
 * Bind a chart and return the layer MAIDR is handed.
 * @param rows - The readings
 * @param view - The rendered chart
 * @param yAxis - The y channel's axis, if not the hypnogram's
 * @returns The layer
 */
function bound(
  rows: Array<Record<string, number>>,
  view: VegaView,
  yAxis?: Record<string, unknown>,
): MaidrLayer {
  bindVegaLite(view, hypnogram(rows, yAxis));
  const maidr = initMock.mock.calls[0]?.[0] as Maidr | undefined;
  const layer = maidr?.subplots?.[0]?.[0]?.layers?.[0];
  if (!layer)
    throw new Error('no layer emitted');
  return layer;
}

/** The named stage ticks. */
const NAMED: Array<[number, string]> = STAGE_NAMES.map((name, value) => [value, name]);

/**
 * Each point's label, in order.
 * @param layer - The layer
 * @returns The labels
 */
function labels(layer: MaidrLayer): Array<string | undefined> {
  return (layer.data as LinePoint[][]).flat().map(point => point.label);
}

describe('a vega-lite line read against an axis that names its levels', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('names every point by the level it sits on', () => {
    const layer = bound(NIGHT, chart(NAMED));

    // Before the fix: no labels, and "Sleep stage is 3" was announced.
    expect(labels(layer)).toEqual(['Awake', 'REM', 'N1', 'N2', 'N3', 'N3', 'N2', 'REM']);
    expect((layer.data as LinePoint[][])[0].map(point => point.y)).toEqual([4, 3, 2, 1, 0, 0, 1, 3]);
  });
});

describe('a vega-lite line whose axis names no levels', () => {
  beforeEach(() => {
    initMock.mockClear();
    document.body.innerHTML = '';
  });

  it('keeps its numbers when the axis draws numerals', () => {
    const numerals: Array<[number, string]> = [[0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']];

    const layer = bound(NIGHT, chart(numerals));

    expect(labels(layer).every(label => label === undefined)).toBe(true);
  });

  it('keeps its numbers when the axis only formats them', () => {
    // `format: '$,d'` draws "$0" to "$4": not numerals, but numbers all the
    // same, and every point sits on a tick. Without a labelExpr in the spec
    // the axis is read as measuring its values, not naming them.
    const dollars: Array<[number, string]> = [[0, '$0'], [1, '$1'], [2, '$2'], [3, '$3'], [4, '$4']];

    const layer = bound(NIGHT, chart(dollars), { format: '$,d' });

    expect(labels(layer).every(label => label === undefined)).toBe(true);
  });

  it('keeps its numbers when a point sits between the named levels', () => {
    const layer = bound([...NIGHT, { hours: 4, stage: 2.5 }], chart(NAMED));

    expect(labels(layer).every(label => label === undefined)).toBe(true);
  });

  it('keeps its numbers when the chart has two vertical axes', () => {
    const layer = bound(NIGHT, chart(NAMED, [[0, 'low'], [4, 'high']]));

    expect(labels(layer).every(label => label === undefined)).toBe(true);
  });
});
