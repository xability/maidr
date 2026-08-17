/**
 * Victory's `horizontal` prop reaches the emitted layer (#952).
 *
 * `horizontal` is how a Victory bar chart is turned on its side — on the
 * component or on the enclosing `<VictoryChart>`, which passes it to every
 * child. The adapter read it nowhere: every match for the word under
 * `src/adapters/victory/` was a geometry helper in `selectors.ts` or one
 * comment about `errorX`.
 *
 * So a horizontal chart emitted no `orientation` and the core defaulted it to
 * vertical, announcing a population pyramid as a *vertical* diverging bar plot
 * and sweeping its stereo cue across age bands that run down the page. This
 * repository's own `PopulationPyramidExample` is exactly that chart.
 *
 * Declaring the key is only half of it. Victory keeps its data
 * `x = category, y = value` whichever way it draws, and a `horz` bar layer is
 * read the other way round — `x` is the magnitude — so the key alone would
 * have handed `BarTrace` a category name to pitch and silenced every bar. The
 * layer is therefore emitted swapped, axis labels included, and the last
 * describe below runs the real trace over it rather than trusting that.
 *
 * These build the React elements and run the real converter rather than a
 * fixture, because the prop has to survive the walk from the chart down to
 * each data child, which is the part that was missing.
 *
 * Which declaration wins was measured by rendering each arrangement with real
 * Victory and reading where the bars landed, not by reading the prop merge:
 * the answer turned out to be the opposite of `polar`'s, so this file was
 * written once against the wrong rule before it was checked.
 */
import type { ReactElement } from 'react';
import { extractVictoryLayers, toMaidrLayer } from '@adapters/victory/converters';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';
import { createElement } from 'react';

const AGE_BANDS = [
  { x: '0-14', y: 1200 },
  { x: '15-29', y: 1150 },
  { x: '30-44', y: 1080 },
];

/**
 * A stand-in for a Victory component, recognised the way the real ones are.
 * @param displayName - The Victory display name to answer to
 * @returns A component type carrying that name
 */
function victory(displayName: string): (props: Record<string, unknown>) => null {
  const component = (): null => null;
  (component as unknown as { displayName: string }).displayName = displayName;
  return component;
}

const VictoryChart = victory('VictoryChart');
const VictoryBar = victory('VictoryBar');
const VictoryStack = victory('VictoryStack');
const VictoryAxis = victory('VictoryAxis');
const VictoryLine = victory('VictoryLine');
const VictoryHistogram = victory('VictoryHistogram');

/**
 * The MAIDR layers a tree of Victory elements converts to.
 * @param tree - The root element to walk
 * @returns One emitted layer per data component
 */
function layersOf(tree: ReactElement): ReturnType<typeof toMaidrLayer>[] {
  return extractVictoryLayers(tree).map(layer => toMaidrLayer(layer));
}

describe('a horizontal victory bar chart', () => {
  it('declares its orientation when the chart carries the prop', () => {
    const layers = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(VictoryBar, { data: AGE_BANDS }),
      ) as ReactElement,
    );

    expect(layers).toHaveLength(1);
    expect(layers[0].type).toBe(TraceType.BAR);
    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
  });

  it('declares it when only the bar carries the prop', () => {
    // Victory accepts it in either place, so the adapter has to look in both.
    const layers = layersOf(
      createElement(
        VictoryChart,
        null,
        createElement(VictoryBar, { data: AGE_BANDS, horizontal: true }),
      ) as ReactElement,
    );

    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
  });

  it('declares it when only the stack carries the prop', () => {
    // A `VictoryStack` takes `horizontal` too, and passes it to its bars.
    const layers = layersOf(
      createElement(
        VictoryChart,
        null,
        createElement(
          VictoryStack,
          { horizontal: true },
          createElement(VictoryBar, { name: 'Men', data: AGE_BANDS }),
          createElement(VictoryBar, { name: 'Women', data: AGE_BANDS }),
        ),
      ) as ReactElement,
    );

    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
  });

  it('reaches a stacked chart, which is how a population pyramid is written', () => {
    // `PopulationPyramidExample` in this repository: a `VictoryStack` of two
    // bar series inside `<VictoryChart horizontal>`. The prop has to survive
    // the extra level of nesting.
    const layers = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(
          VictoryStack,
          null,
          createElement(VictoryBar, { name: 'Men', data: AGE_BANDS.map(d => ({ ...d, y: -d.y })) }),
          createElement(VictoryBar, { name: 'Women', data: AGE_BANDS }),
        ),
      ) as ReactElement,
    );

    expect(layers).toHaveLength(1);
    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
  });
});

describe('the outermost declaration of horizontal is the one that counts', () => {
  // Not the rule `polar` follows, and not the rule React props usually follow.
  // Victory's wrappers clone their children with the wrapper's own value, so
  // the inner prop is overwritten rather than preferred. Each case below was
  // rendered with real Victory first and the bars' positions read off.

  it('keeps a chart horizontal even when the bar says otherwise', () => {
    const layers = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(VictoryBar, { data: AGE_BANDS, horizontal: false }),
      ) as ReactElement,
    );

    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
  });

  it('lets a chart suppress a bar that asks to be horizontal', () => {
    // `horizontal={false}` on the chart is not the same as leaving it off,
    // which is why the flag travels as `boolean | undefined`.
    const layers = layersOf(
      createElement(
        VictoryChart,
        { horizontal: false },
        createElement(VictoryBar, { data: AGE_BANDS, horizontal: true }),
      ) as ReactElement,
    );

    expect(layers[0].orientation).toBeUndefined();
  });

  it('lets a chart suppress a stack that asks to be horizontal', () => {
    const layers = layersOf(
      createElement(
        VictoryChart,
        { horizontal: false },
        createElement(
          VictoryStack,
          { horizontal: true },
          createElement(VictoryBar, { name: 'Men', data: AGE_BANDS }),
          createElement(VictoryBar, { name: 'Women', data: AGE_BANDS }),
        ),
      ) as ReactElement,
    );

    expect(layers[0].orientation).toBeUndefined();
  });

  it('reads a bar with no chart around it', () => {
    // Nothing outside has spoken, so the bar's own prop is all there is.
    const layers = layersOf(
      createElement(VictoryBar, { data: AGE_BANDS, horizontal: true }) as ReactElement,
    );

    expect(layers[0].orientation).toBe(Orientation.HORIZONTAL);
  });
});

describe('a vertical victory bar chart', () => {
  it('says nothing, which is what the core already defaults to', () => {
    const layers = layersOf(
      createElement(
        VictoryChart,
        null,
        createElement(VictoryBar, { data: AGE_BANDS }),
      ) as ReactElement,
    );

    expect(layers[0].orientation).toBeUndefined();
  });

  it('keeps its data exactly as Victory holds it', () => {
    const vertical = layersOf(
      createElement(
        VictoryChart,
        null,
        createElement(VictoryBar, { data: AGE_BANDS }),
      ) as ReactElement,
    )[0];

    expect(vertical.data).toEqual([
      { x: '0-14', y: 1200 },
      { x: '15-29', y: 1150 },
      { x: '30-44', y: 1080 },
    ]);
  });
});

describe('a horizontal layer is emitted the way the core reads it', () => {
  // Victory's `horizontal` is a rendering flag — it does not move the data, so
  // `vert` and `horz` alike leave the chart holding `x = category`. The core
  // reads a `horz` bar's magnitude from `x`, so the swap has to happen here or
  // the key is a lie about the payload underneath it.

  it('puts the magnitude in x and the category in y', () => {
    const layer = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(VictoryBar, { data: AGE_BANDS }),
      ) as ReactElement,
    )[0];

    expect(layer.data).toEqual([
      { x: 1200, y: '0-14' },
      { x: 1150, y: '15-29' },
      { x: 1080, y: '30-44' },
    ]);
  });

  it('swaps the axis labels with them', () => {
    // `BarTrace.text` announces the cross axis under the label of the axis the
    // magnitude sits on, so a swapped payload under unswapped labels would
    // report the age band as a count of people.
    const layer = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(VictoryAxis, { label: 'Age band' }),
        createElement(VictoryAxis, { dependentAxis: true, label: 'People' }),
        createElement(VictoryBar, { data: AGE_BANDS }),
      ) as ReactElement,
    )[0];

    expect(layer.axes).toEqual({ x: { label: 'People' }, y: { label: 'Age band' } });
  });

  it('leaves a vertical chart\'s labels alone', () => {
    const layer = layersOf(
      createElement(
        VictoryChart,
        null,
        createElement(VictoryAxis, { label: 'Age band' }),
        createElement(VictoryAxis, { dependentAxis: true, label: 'People' }),
        createElement(VictoryBar, { data: AGE_BANDS }),
      ) as ReactElement,
    )[0];

    expect(layer.axes).toEqual({ x: { label: 'Age band' }, y: { label: 'People' } });
  });

  it('carries a histogram\'s bin edges across with it', () => {
    // A bin's span travels as `xMin`/`xMax`. Swapping only `x` and `y` leaves
    // each bin announcing a value from one axis and a width from the other,
    // which reads as a plausible bar and is not one.
    const layer = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(VictoryHistogram, {
          data: [{ x: 0 }, { x: 1 }, { x: 8 }, { x: 9 }],
          bins: [0, 5, 10],
        }),
      ) as ReactElement,
    )[0];

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(layer.data).toEqual([
      { x: 2, y: '0.0-5.0', xMin: 0, xMax: 2, yMin: 0, yMax: 5 },
      { x: 2, y: '5.0-10.0', xMin: 0, xMax: 2, yMin: 5, yMax: 10 },
    ]);
  });

  it('does not touch a line, which never asks about orientation', () => {
    // A `VictoryLine` in a horizontal chart is drawn on its side too, but
    // `LineTrace` does not resolve the key, so swapping its labels would
    // rename its axes for nothing.
    const layer = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(VictoryAxis, { label: 'Age band' }),
        createElement(VictoryAxis, { dependentAxis: true, label: 'People' }),
        createElement(VictoryLine, { data: AGE_BANDS }),
      ) as ReactElement,
    )[0];

    expect(layer.orientation).toBeUndefined();
    expect(layer.axes).toEqual({ x: { label: 'Age band' }, y: { label: 'People' } });
  });
});

describe('the population pyramid the core actually builds', () => {
  /**
   * The layer `PopulationPyramidExample` emits, run through the real trace.
   * @returns What the trace announces at its first bar, and anything it warned
   */
  function readFirstBar(): { magnitude: unknown; warnings: string[] } {
    const men = AGE_BANDS.map(band => ({ ...band, y: -band.y }));
    const layer = layersOf(
      createElement(
        VictoryChart,
        { horizontal: true },
        createElement(
          VictoryStack,
          null,
          createElement(VictoryBar, { name: 'Men', data: men }),
          createElement(VictoryBar, { name: 'Women', data: AGE_BANDS }),
        ),
      ) as ReactElement,
    )[0];

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const trace = TraceFactory.create(layer as never);
      const state = (trace as unknown as { state: { audio: { freq: { raw: unknown } } } }).state;
      return {
        magnitude: state.audio.freq.raw,
        warnings: warn.mock.calls.map(call => String(call[0])),
      };
    } finally {
      warn.mockRestore();
    }
  }

  it('has a magnitude to pitch at its first bar', () => {
    // This is the assertion the fix exists for. Emitting the key over
    // Victory's own arrangement passes every test above and lands here with
    // `raw: null` — a chart that loads, navigates, highlights, and is silent.
    //
    // 1200 rather than -1200 because `DivergingTrace` pitches `Math.abs` and
    // announces the sign as the side the bar points to, which is the whole
    // reason the adapter leaves the values signed.
    expect(readFirstBar().magnitude).toBe(1200);
  });

  it('draws no complaint from the core about its own payload', () => {
    // `warnOnMislabelledMagnitude` (#950) fires on exactly the payload the
    // half-fix produced, so an empty list here is the core agreeing.
    expect(readFirstBar().warnings).toEqual([]);
  });
});
