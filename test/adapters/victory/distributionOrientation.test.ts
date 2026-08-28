/**
 * A horizontal Victory box plot or error bar was read as an upright one.
 *
 * `isHorizontalComponent` has resolved `horizontal` -- on the component, on a
 * `<VictoryStack>` or on the enclosing `<VictoryChart>` -- since #950, and the
 * emitted layer took it only when the extracted kind was in the **bar family**.
 * A `<VictoryBoxPlot horizontal>` and a `<VictoryErrorBar>` inside a
 * `<VictoryChart horizontal>` are drawn with their groups down the page just
 * as a bar is, and neither said so.
 *
 * That family test is the right one for the payload -- the grammar's table has
 * only the bar family exchanging `x` and `y` -- but it is the wrong one for
 * the *announcement*. A box plot and an interval read their axis labels
 * through the orientation instead: `BoxTrace` and `ErrorBarTrace` take the
 * group off `axes.y` and the measurement off `axes.x` when the layer is
 * horizontal, and `toMaidrLayer` has already swapped the labels by then --
 * Victory keeps `x = category` in its own data however the chart is drawn, so
 * the pair of axis labels moves with the drawing.
 *
 * Without the key the two halves disagreed: the labels swapped and the reading
 * did not, so the group was announced against the measurement's axis title and
 * the measurement against the group's.
 */

import type { BoxPoint, ErrorBarPoint, MaidrLayer } from '@type/grammar';
import type { ReactNode } from 'react';
import { extractVictoryLayers, toMaidrLayer } from '@adapters/victory/converters';
import { describe, expect, it } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { createElement } from 'react';

interface VictoryStub {
  (props: Record<string, unknown>): null;
  displayName: string;
}

/**
 * A stand-in for a Victory component: extraction reads `displayName` and the
 * element props, so the real renderer is not needed.
 * @param displayName - The component name to answer to
 * @returns The stub
 */
function stub(displayName: string): VictoryStub {
  const component = (): null => null;
  component.displayName = displayName;
  return component as VictoryStub;
}

const VictoryChart = stub('VictoryChart');
const VictoryAxis = stub('VictoryAxis');
const VictoryBoxPlot = stub('VictoryBoxPlot');
const VictoryErrorBar = stub('VictoryErrorBar');

/** Two groups of samples, as `VictoryBoxPlot` takes them. */
const SAMPLES = [
  { x: 'alpha', y: 1 },
  { x: 'alpha', y: 3 },
  { x: 'alpha', y: 5 },
  { x: 'bravo', y: 2 },
  { x: 'bravo', y: 4 },
  { x: 'bravo', y: 6 },
];

/** Two estimates with an interval around each. */
const ESTIMATES = [
  { x: 'alpha', y: 10, errorY: [2, 2] },
  { x: 'bravo', y: 20, errorY: [3, 3] },
];

/**
 * The layer one data component converts to, inside a titled chart.
 *
 * @param child - The data component to read
 * @param horizontal - Whether the chart declares `horizontal`
 * @returns The emitted layer
 */
function layerFor(child: ReactNode, horizontal?: boolean): MaidrLayer {
  const tree = createElement(
    VictoryChart,
    horizontal ? { horizontal: true } : {},
    createElement(VictoryAxis, { label: 'Group' }),
    createElement(VictoryAxis, { dependentAxis: true, label: 'Value' }),
    child,
  );
  const [info] = extractVictoryLayers(tree);
  if (!info)
    throw new Error('no layer extracted');
  return toMaidrLayer(info);
}

describe('a Victory box plot', () => {
  it('says nothing about orientation when the chart is upright', () => {
    const layer = layerFor(createElement(VictoryBoxPlot, { data: SAMPLES }));

    expect(layer.type).toBe(TraceType.BOX);
    expect(layer.orientation).toBeUndefined();
    expect(layer.axes).toEqual({ x: { label: 'Group' }, y: { label: 'Value' } });
  });

  it('says it is drawn sideways when the chart is horizontal', () => {
    const layer = layerFor(createElement(VictoryBoxPlot, { data: SAMPLES }), true);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  it('takes `horizontal` from the box plot itself as well', () => {
    // `<VictoryBoxPlot horizontal />` needs no chart around it to be drawn
    // sideways, and the prop is read on the component for that reason.
    const layer = layerFor(
      createElement(VictoryBoxPlot, { data: SAMPLES, horizontal: true }),
    );

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
  });

  it('names the group axis y, which is where the trace looks for it', () => {
    const layer = layerFor(createElement(VictoryBoxPlot, { data: SAMPLES }), true);

    expect(layer.axes).toEqual({ x: { label: 'Value' }, y: { label: 'Group' } });
  });

  it('leaves the summaries themselves alone', () => {
    // A `BoxPoint` has no `x`/`y` pair to exchange, so the five numbers are
    // the same whichever way the chart is drawn.
    const sideways = layerFor(createElement(VictoryBoxPlot, { data: SAMPLES }), true);
    const upright = layerFor(createElement(VictoryBoxPlot, { data: SAMPLES }));

    expect(sideways.data as BoxPoint[]).toEqual(upright.data as BoxPoint[]);
  });
});

describe('a Victory error bar', () => {
  it('says nothing about orientation when the chart is upright', () => {
    const layer = layerFor(createElement(VictoryErrorBar, { data: ESTIMATES }));

    expect(layer.type).toBe(TraceType.ERROR_BAR);
    expect(layer.orientation).toBeUndefined();
  });

  it('says it is drawn sideways inside a horizontal chart', () => {
    const layer = layerFor(createElement(VictoryErrorBar, { data: ESTIMATES }), true);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.axes).toEqual({ x: { label: 'Value' }, y: { label: 'Group' } });
  });

  it('keeps the estimate and its bounds where they are', () => {
    // The grammar's table: an interval is announced by its orientation and
    // exchanges nothing.
    const sideways = layerFor(createElement(VictoryErrorBar, { data: ESTIMATES }), true);

    expect((sideways.data as ErrorBarPoint[])[0]).toEqual({
      x: 'alpha',
      y: 10,
      yMin: 8,
      yMax: 12,
    });
  });
});
