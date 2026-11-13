/**
 * The names Vega-Lite compiles a spec's views under, as vega-lite 5.23.0 and
 * 6.5.0 compile them (see `names.ts`).
 */
import type { VegaLiteSpec } from '@adapters/vegalite/types';
import { compiledName, drawsPathOverlay, markViews, repeatCellName, varName, viewName } from '@adapters/vegalite/names';
import { describe, expect, it } from '@jest/globals';

describe('vega-lite compiled names', () => {
  it('names a view by the name it declares, else by its parent and the step to it', () => {
    expect(viewName({}, '', '')).toBe('');
    expect(viewName({ name: 'chart' }, '', '')).toBe('chart');
    expect(viewName({}, '', 'layer_1')).toBe('layer_1');
    expect(viewName({}, 'chart', 'layer_1')).toBe('chart_layer_1');
    expect(viewName({}, 'concat_0', 'layer_0')).toBe('concat_0_layer_0');
    expect(viewName({}, '', 'child')).toBe('child');
    expect(viewName({}, 'f', 'child')).toBe('f_child');
    // A declared name is the view's alone, wherever it sits.
    expect(viewName({ name: 'inner' }, 'concat_0', 'layer_0')).toBe('inner');
    expect(viewName({ name: 'view_18f67abe58e755a9_0' }, '', 'concat_0')).toBe('view_18f67abe58e755a9_0');
  });

  it('puts a repeated cell\'s name before a name declared inside it', () => {
    expect(viewName({ name: 'bars' }, 'child__column_v', 'layer_0', 'child__column_v')).toBe('child__column_v_bars');
    expect(viewName({ name: 'p5-95' }, 'child__column_p50', 'layer_0', 'child__column_p50')).toBe('child__column_p50_p5_95');
    expect(viewName({}, 'child__column_v', 'layer_1', 'child__column_v')).toBe('child__column_v_layer_1');
  });

  it('names what a view compiles after the view, through varName', () => {
    expect(compiledName('', 'marks')).toBe('marks');
    expect(compiledName('layer_0', 'marks')).toBe('layer_0_marks');
    expect(compiledName('left', 'group')).toBe('left_group');
    expect(compiledName('f', 'cell')).toBe('f_cell');
    expect(compiledName('', 'cell')).toBe('cell');
    expect(compiledName('chart', 'y')).toBe('chart_y');
    expect(compiledName('l', 'pathgroup')).toBe('l_pathgroup');
    expect(compiledName(viewName({ name: '2-bars' }, '', 'layer_0'), 'marks')).toBe('_2_bars_marks');
    expect(varName('p5-95')).toBe('p5_95');
  });

  it('draws a path a view overlays under the name it declares, else a level down', () => {
    expect(markViews({}, 'layer_1')).toEqual(['layer_1', 'layer_1_layer_0']);
    expect(markViews({}, '')).toEqual(['', 'layer_0']);
    expect(markViews({ name: 'l' }, 'l')).toEqual(['l']);
  });

  it('tells which marks Vega-Lite lays points or a line over', () => {
    const spec = (mark: VegaLiteSpec['mark'], extra: Partial<VegaLiteSpec> = {}): VegaLiteSpec => ({ mark, ...extra });

    expect(drawsPathOverlay(spec({ type: 'line', point: true }), undefined)).toBe(true);
    expect(drawsPathOverlay(spec({ type: 'line', point: 'transparent' }), undefined)).toBe(true);
    expect(drawsPathOverlay(spec({ type: 'area', line: true }), undefined)).toBe(true);
    expect(drawsPathOverlay(spec('line'), { line: { point: true } })).toBe(true);
    expect(drawsPathOverlay(spec('line', { encoding: { shape: { field: 's' } } }), undefined)).toBe(true);
    expect(drawsPathOverlay(spec('line'), undefined)).toBe(false);
    expect(drawsPathOverlay(spec({ type: 'line', point: false }), { line: { point: true } })).toBe(false);
    expect(drawsPathOverlay(spec({ type: 'line', point: null }), undefined)).toBe(false);
    expect(drawsPathOverlay(spec({ type: 'bar', point: true } as VegaLiteSpec['mark']), undefined)).toBe(false);
  });

  it('names a repeated cell by its fields, after the repeated spec\'s own name', () => {
    expect(repeatCellName({}, { repeat: 'yield' })).toBe('child__yield');
    expect(repeatCellName({}, { row: 'yield' })).toBe('child__row_yield');
    expect(repeatCellName({}, { column: 'year' })).toBe('child__column_year');
    expect(repeatCellName({}, { row: 'yield', column: 'year' })).toBe('child__row_yieldcolumn_year');
    // Non-word characters in field names become underscores.
    expect(repeatCellName({}, { repeat: 'my field' })).toBe('child__my_field');
    expect(repeatCellName({ name: 'inner' }, { column: 'v' })).toBe('inner_child__column_v');
  });

  it('prefixes an underscore for digit-leading field names (varName rule)', () => {
    // Vega-Lite's varName prepends `_` when the field starts with a
    // digit, so the compiled classes are `child___2020_marks` /
    // `child___2020_group`. Without the prefix every selector for a
    // repeated year-column chart matches nothing.
    expect(repeatCellName({}, { repeat: '2020' })).toBe('child___2020');
    expect(repeatCellName({}, { row: '3rd quarter' })).toBe('child__row__3rd_quarter');
    expect(repeatCellName({}, { column: '2019', row: 'yield' })).toBe('child__row_yieldcolumn__2019');
  });
});
