import type { GoogleChart, GoogleDataTable } from '@adapters/google-charts/types';
import type { SurvivalPoint } from '@type/grammar';
import { createMaidrFromGoogleChart } from '@adapters/google-charts/converters';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One sampled time: the time, then every column of the table in order. */
type CurveRow = [number, ...(number | boolean | null)[]];

/**
 * A two-armed figure: the treatment arm with its confidence band and its
 * censoring flag, then the control arm.
 */
const ROWS: CurveRow[] = [
  [0, 1, 0.94, 1, false, 1],
  [6, 0.82, 0.71, 0.9, true, 0.74],
  [12, 0.61, 0.48, 0.73, false, 0.45],
];

const LABELS = ['Months', 'Treatment', '', '', 'Censored', 'Control'];
const ROLES = [undefined, undefined, 'interval', 'interval', 'certainty', undefined];

/** Minimal DataTable fake for a Kaplan-Meier table. */
function makeCurveDataTable(
  rows: CurveRow[] = ROWS,
  labels: string[] = LABELS,
  roles: (string | undefined)[] = ROLES,
): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => labels.length,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: (c) => {
      if (typeof rows[0][c] === 'boolean') {
        return 'boolean';
      }
      return 'number';
    },
    getColumnRole: c => roles[c] ?? '',
  };
}

/**
 * A survival curve is drawn by the stepped-area class, whose marking path
 * never asks for a layout interface — this fake fails loudly if it does.
 */
const SURVIVAL_CHART: GoogleChart = {
  getSelection: () => [],
  setSelection: () => {},
  getChartLayoutInterface: () => {
    throw new Error('the line marking path must not need a layout interface');
  },
};

/**
 * Builds a rendered survival chart: a clip-path group holding, per arm, the
 * filled band Google draws (`areaOpacity: 0` leaves it painted but invisible)
 * and, when the chart drew one, the step outline along its top edge.
 */
function makeCurveContainer(arms = 2, withOutline = true): HTMLElement {
  const dom = new JSDOM('<!doctype html><body><div id="km-chart"></div></body>');
  const doc = dom.window.document;
  const container = doc.getElementById('km-chart') as HTMLElement;

  const svg = doc.createElementNS(SVG_NS, 'svg');
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);
  container.appendChild(svg);

  for (let arm = 0; arm < arms; arm++) {
    const band = doc.createElementNS(SVG_NS, 'path');
    band.setAttribute('fill', '#3366cc');
    band.setAttribute('fill-opacity', '0');
    band.setAttribute('d', `M0,10L40,10L40,20L80,20L80,90L0,90Z`);
    group.appendChild(band);

    if (withOutline) {
      const outline = doc.createElementNS(SVG_NS, 'path');
      outline.setAttribute('fill', 'none');
      // The step polyline: one corner per sample plus the risers between.
      outline.setAttribute('d', `M0,10L40,10L40,20L80,20L80,30`);
      group.appendChild(outline);
    }
  }

  return container;
}

function build(
  dt: GoogleDataTable = makeCurveDataTable(),
  container: HTMLElement = makeCurveContainer(),
  options: { stepDirection?: 'hv' | 'vh' | 'mid' } = {},
): {
  layer: ReturnType<typeof createMaidrFromGoogleChart>['subplots'][0][0]['layers'][0];
  container: HTMLElement;
} {
  const maidr = createMaidrFromGoogleChart(SURVIVAL_CHART, dt, container, {
    chartType: 'SurvivalChart',
    ...options,
  });
  return { layer: maidr.subplots[0][0].layers[0], container };
}

describe('createMaidrFromGoogleChart with a SurvivalChart', () => {
  it('reads one curve per arm, with numeric times', () => {
    const { layer } = build();

    expect(layer.type).toBe(TraceType.SURVIVAL);

    const data = layer.data as SurvivalPoint[][];
    expect(data).toHaveLength(2);
    // Numbers rather than formatted strings: median survival and the
    // separation between arms are read off the time axis.
    expect(data[0].map(point => point.x)).toEqual([0, 6, 12]);
    expect(data[1].map(point => point.y)).toEqual([1, 0.74, 0.45]);
    expect(data[0][0].z).toBe('Treatment');
  });

  it('does not read the boolean censoring column as a third arm', () => {
    const { layer } = build();

    // Read as an arm it would sonify true and false as 1 and 0 and draw a
    // curve the chart does not contain.
    const data = layer.data as SurvivalPoint[][];
    expect(data).toHaveLength(2);
    expect(data.map(arm => arm[0].z)).toEqual(['Treatment', 'Control']);
  });

  it('marks the censored times on the arm the flag column follows', () => {
    const { layer } = build();

    const data = layer.data as SurvivalPoint[][];
    expect(data[0].map(point => point.censored)).toEqual([undefined, true, undefined]);
    // The flag belongs to the arm it was declared after, not to every arm.
    expect(data[1].every(point => point.censored === undefined)).toBe(true);
  });

  it('takes the confidence band from the interval columns', () => {
    const { layer } = build();

    const data = layer.data as SurvivalPoint[][];
    expect(data[0][1].yMin).toBe(0.71);
    expect(data[0][1].yMax).toBe(0.9);
    // The band was declared on the treatment arm only.
    expect(data[1][1].yMin).toBeUndefined();
  });

  it('leaves both bounds off when the table declares a single interval column', () => {
    const dt = makeCurveDataTable(
      [
        [0, 1, 0.94],
        [6, 0.82, 0.71],
      ],
      ['Months', 'Treatment', ''],
      [undefined, undefined, 'interval'],
    );

    const { layer } = build(dt, makeCurveContainer(1));

    // Half a band is not a band: emitting the one bound as both would
    // announce a confidence interval of zero width at every time.
    const data = layer.data as SurvivalPoint[][];
    expect(data[0][0].yMin).toBeUndefined();
    expect(data[0][0].yMax).toBeUndefined();
  });

  it('carries a step direction only when the caller declares one', () => {
    expect(build().layer.stepDirection).toBeUndefined();
    expect(build(makeCurveDataTable(), makeCurveContainer(), { stepDirection: 'hv' })
      .layer.stepDirection).toBe('hv');
  });

  it('names the time axis and leaves the probability axis to the arms', () => {
    const { layer } = build();

    expect(layer.axes?.x).toEqual({ label: 'Months' });
    // With two arms the column labels are the arms; calling the probability
    // axis "Treatment" would name the wrong thing.
    expect(layer.axes?.y).toEqual({ label: undefined });
  });

  it('marks one step outline per arm for highlighting', () => {
    const { layer, container } = build();

    expect(layer.selectors).toEqual([
      '#km-chart svg path[data-maidr-line-series="0"]',
      '#km-chart svg path[data-maidr-line-series="1"]',
    ]);
    expect(container.querySelectorAll('[data-maidr-line-series]')).toHaveLength(2);
  });

  it('omits the selectors when the chart drew only filled bands', () => {
    const { layer } = build(makeCurveDataTable(), makeCurveContainer(2, false));

    // The band's own path closes back along the baseline, so its vertices are
    // not the samples; highlighting them would land between the steps.
    expect(layer.selectors).toBeUndefined();
  });
});
