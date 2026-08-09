import type { MaidrLayer } from '@type/grammar';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A producer with no axis name to give writes one of two spellings of "none".
 *
 * `??` only ever caught `undefined`. An empty string is a value, so it passed
 * through and the announcement lost its noun — " is Apples,  is 30". Every
 * Base R chart reaches this way: `barplot()`, `hist()`, `boxplot()` and
 * `pie()` all carry no `xlab`/`ylab` unless the author writes one.
 */
function pieLayer(axes: MaidrLayer['axes']): MaidrLayer {
  return {
    id: '0',
    type: TraceType.PIE,
    axes,
    data: [{ x: 'Apples', y: 30 }, { x: 'Bananas', y: 50 }],
  } as MaidrLayer;
}

function labelsOf(axes: MaidrLayer['axes']): [string, string] {
  const trace = TraceFactory.create(pieLayer(axes)) as unknown as {
    xAxis: string;
    yAxis: string;
  };
  return [trace.xAxis, trace.yAxis];
}

describe('a blank axis label falls back to the generic name', () => {
  it('uses the label when the layer gives one', () => {
    expect(labelsOf({ x: { label: 'Fruit' }, y: { label: 'Units' } }))
      .toEqual(['Fruit', 'Units']);
  });

  it('falls back when the axes are absent entirely', () => {
    expect(labelsOf(undefined)).toEqual(['X', 'Y']);
  });

  it('falls back on an empty string, which `??` used to pass through', () => {
    expect(labelsOf({ x: { label: '' }, y: { label: '' } })).toEqual(['X', 'Y']);
  });

  it('falls back on whitespace, which reads as blank to a listener', () => {
    expect(labelsOf({ x: { label: '   ' }, y: { label: '\t' } })).toEqual(['X', 'Y']);
  });

  it('keeps a label that is merely short', () => {
    expect(labelsOf({ x: { label: 'n' }, y: { label: '0' } })).toEqual(['n', '0']);
  });

  it('falls back per axis, not all or nothing', () => {
    expect(labelsOf({ x: { label: '' }, y: { label: 'Units' } })).toEqual(['X', 'Units']);
  });
});
