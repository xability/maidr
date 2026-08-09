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

function zLabelOf(axes: MaidrLayer['axes']): string {
  const trace = TraceFactory.create(pieLayer(axes)) as unknown as { z: string };
  return trace.z;
}

/**
 * A two-line layer, so `LineTrace` has a group to name.
 *
 * It resolves its own z label against the trace-specific "Group" rather than
 * reading `this.z`, so `AbstractTrace`'s fallback does not cover it and it
 * needs its own cases.
 */
function lineLayer(axes: MaidrLayer['axes']): MaidrLayer {
  return {
    id: '0',
    type: TraceType.LINE,
    axes,
    data: [
      [{ x: 1, y: 2, z: 'north' }, { x: 2, y: 3, z: 'north' }],
      [{ x: 1, y: 5, z: 'south' }, { x: 2, y: 6, z: 'south' }],
    ],
  } as MaidrLayer;
}

function groupLabelOf(axes: MaidrLayer['axes']): string {
  const trace = TraceFactory.create(lineLayer(axes)) as unknown as {
    groupLabel: string;
  };
  return trace.groupLabel;
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

describe('the z axis falls back the same way', () => {
  it('uses the label when the layer gives one', () => {
    expect(zLabelOf({ z: { label: 'Region' } })).toBe('Region');
  });

  it('falls back on an empty string', () => {
    expect(zLabelOf({ z: { label: '' } })).toBe('Level');
  });

  it('falls back on whitespace', () => {
    expect(zLabelOf({ z: { label: '  ' } })).toBe('Level');
  });

  it('falls back when there is no z axis at all', () => {
    expect(zLabelOf({ x: { label: 'Fruit' } })).toBe('Level');
  });
});

describe('a line trace names its group the same way', () => {
  it('uses the label when the layer gives one', () => {
    expect(groupLabelOf({ z: { label: 'Region' } })).toBe('Region');
  });

  it('falls back to the trace-specific name, not the generic "Level"', () => {
    expect(groupLabelOf(undefined)).toBe('Group');
  });

  it('falls back on an empty string, which `??` used to pass through', () => {
    expect(groupLabelOf({ z: { label: '' } })).toBe('Group');
  });

  it('falls back on whitespace', () => {
    expect(groupLabelOf({ z: { label: '\t' } })).toBe('Group');
  });
});
