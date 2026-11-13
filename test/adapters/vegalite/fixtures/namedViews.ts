/**
 * Charts whose views declare names of their own, captured through the real
 * vega-lite compiler and Vega runtime: what `view.data()` answers for each
 * table, what `view.scale()` answers for each scale, and the marks drawn,
 * each item with the row it was drawn from.
 *
 * A view that declares a `name` is compiled under it, and so is everything
 * below it: its marks, its group, its scales and the views inside it (see
 * `names.ts`). Altair 6.1 names the view of a compound chart that carries its
 * selection, so the last three are Altair's own output for
 * `alt.layer(points.interactive(), line)`,
 * `alt.hconcat(points.interactive(), line.interactive())` and
 * `points.interactive().facet('c')`.
 *
 * Captured against vega-lite 5.23.0 and vega 5.33.1; vega-lite 6.5.0
 * compiles the same names. The scene leaves out the axes, legends, titles
 * and facet headers, and the tables those draw from, which the adapter does
 * not read.
 */

/** A mark of the drawn scenegraph, as captured. */
export interface CapturedMark {
  marktype: string;
  role: string;
  name?: string;
  items: Array<{ datum?: unknown; items?: CapturedMark[] }>;
}

/** One chart: its spec, as written, and what its compiled view answers. */
export interface NamedViewCapture {
  spec: Record<string, unknown>;
  tables: Record<string, unknown[]>;
  scales: Record<string, unknown[]>;
  scene: CapturedMark;
}

export const namedViews: Record<string, NamedViewCapture> = {
  'single scatter, named': {
    spec: { data: { values: [{ x: 1, y: 3, s: 'b' }, { x: 2, y: 5, s: 'a' }, { x: 3, y: 4, s: 'b' }] }, name: 'v', mark: 'point', encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }, color: { field: 's', type: 'nominal' } } },
    tables: {
      source_0: [{ x: 1, y: 3, s: 'b' }, { x: 2, y: 5, s: 'a' }, { x: 3, y: 4, s: 'b' }],
      data_0: [{ x: 1, y: 3, s: 'b' }, { x: 2, y: 5, s: 'a' }, { x: 3, y: 4, s: 'b' }],
      v_marks: [{ datum: { x: 1, y: 3, s: 'b' } }, { datum: { x: 2, y: 5, s: 'a' } }, { datum: { x: 3, y: 4, s: 'b' } }],
    },
    scales: { v_x: [0, 3], v_y: [0, 5], v_color: ['a', 'b'] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'symbol', role: 'mark', name: 'v_marks', items: [{ datum: { x: 1, y: 3, s: 'b' } }, { datum: { x: 2, y: 5, s: 'a' } }, { datum: { x: 3, y: 4, s: 'b' } }] },
      ] },
    ] },
  },
  'single scatter drawn in its order, named': {
    spec: { data: { values: [{ x: 1, y: 3, o: 3 }, { x: 2, y: 5, o: 1 }, { x: 3, y: 4, o: 2 }] }, name: 'v', mark: 'point', encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' }, order: { field: 'o' } } },
    tables: {
      source_0: [{ x: 1, y: 3, o: 3 }, { x: 2, y: 5, o: 1 }, { x: 3, y: 4, o: 2 }],
      data_0: [{ x: 1, y: 3, o: 3 }, { x: 2, y: 5, o: 1 }, { x: 3, y: 4, o: 2 }],
      v_marks: [{ datum: { x: 2, y: 5, o: 1 } }, { datum: { x: 3, y: 4, o: 2 } }, { datum: { x: 1, y: 3, o: 3 } }],
    },
    scales: { v_x: [0, 3], v_y: [0, 5] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'symbol', role: 'mark', name: 'v_marks', items: [{ datum: { x: 2, y: 5, o: 1 } }, { datum: { x: 3, y: 4, o: 2 } }, { datum: { x: 1, y: 3, o: 3 } }] },
      ] },
    ] },
  },
  'layer, named': {
    spec: { data: { values: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }] }, name: 'chart', layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: 'line', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] },
    tables: {
      source_0: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      data_0: [{ cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 }],
      chart_layer_0_marks: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }],
      chart_layer_1_marks: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }],
    },
    scales: { chart_x: ['p', 'q', 'r'], chart_y: [0, 7] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'rect', role: 'mark', name: 'chart_layer_0_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
        { marktype: 'line', role: 'mark', name: 'chart_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
      ] },
    ] },
  },
  'layer, named series computing its column': {
    spec: { data: { values: [{ cat: 'p', v: 3, s: 'a' }, { cat: 'q', v: 5, s: 'a' }, { cat: 'p', v: 4, s: 'b' }, { cat: 'q', v: 8, s: 'b' }] }, layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative', aggregate: 'sum' } } }, { name: 'tenfold', mark: 'line', transform: [{ calculate: 'datum.v * 10', as: 'w' }], encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'w', type: 'quantitative' }, color: { field: 's', type: 'nominal' } } }] },
    tables: {
      source_0: [{ cat: 'p', v: 3, s: 'a' }, { cat: 'q', v: 5, s: 'a' }, { cat: 'p', v: 4, s: 'b' }, { cat: 'q', v: 8, s: 'b' }],
      data_1: [{ cat: 'p', sum_v: 7 }, { cat: 'q', sum_v: 13 }],
      data_2: [{ cat: 'p', v: 3, s: 'a', w: 30 }, { cat: 'q', v: 5, s: 'a', w: 50 }, { cat: 'p', v: 4, s: 'b', w: 40 }, { cat: 'q', v: 8, s: 'b', w: 80 }],
      layer_0_marks: [{ datum: { cat: 'p', sum_v: 7 } }, { datum: { cat: 'q', sum_v: 13 } }],
      tenfold_pathgroup: [{ datum: { s: 'a', count: 2 } }, { datum: { s: 'b', count: 2 } }],
    },
    scales: { x: ['p', 'q'], y: [0, 80], color: ['a', 'b'] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'rect', role: 'mark', name: 'layer_0_marks', items: [{ datum: { cat: 'p', sum_v: 7 } }, { datum: { cat: 'q', sum_v: 13 } }] },
        { marktype: 'group', role: 'scope', name: 'tenfold_pathgroup', items: [
          { datum: { s: 'a', count: 2 }, items: [
            { marktype: 'line', role: 'mark', name: 'tenfold_marks', items: [{ datum: { cat: 'p', v: 3, s: 'a', w: 30 } }, { datum: { cat: 'q', v: 5, s: 'a', w: 50 } }] },
          ] },
          { datum: { s: 'b', count: 2 }, items: [
            { marktype: 'line', role: 'mark', name: 'tenfold_marks', items: [{ datum: { cat: 'p', v: 4, s: 'b', w: 40 } }, { datum: { cat: 'q', v: 8, s: 'b', w: 80 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'layer, named nested': {
    spec: { data: { values: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }] }, layer: [{ name: 'inner', layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: 'point', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] }, { mark: 'line', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] },
    tables: {
      source_0: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      data_1: [{ cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 }],
      data_2: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      inner_layer_0_marks: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }],
      inner_layer_1_marks: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }],
      layer_1_marks: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }],
    },
    scales: { x: ['p', 'q', 'r'], y: [0, 7] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'rect', role: 'mark', name: 'inner_layer_0_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
        { marktype: 'symbol', role: 'mark', name: 'inner_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
        { marktype: 'line', role: 'mark', name: 'layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
      ] },
    ] },
  },
  'concat, named children': {
    spec: { data: { values: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }] }, hconcat: [{ name: 'left', layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: 'line', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] }, { name: 'right', mark: 'point', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] },
    tables: {
      source_0: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      data_1: [{ cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 }],
      data_2: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
    },
    scales: { left_x: ['p', 'q', 'r'], left_y: [0, 7], right_x: ['p', 'q', 'r'], right_y: [0, 7] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'left_group', items: [
          { items: [
            { marktype: 'rect', role: 'mark', name: 'left_layer_0_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
            { marktype: 'line', role: 'mark', name: 'left_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
          ] },
        ] },
        { marktype: 'group', role: 'scope', name: 'right_group', items: [
          { items: [
            { marktype: 'symbol', role: 'mark', name: 'right_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'concat, named nested in child': {
    spec: { data: { values: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }] }, hconcat: [{ layer: [{ name: 'inner', layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: 'point', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] }, { mark: 'line', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] }, { mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }] },
    tables: {
      source_0: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      data_1: [{ cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 }],
      data_2: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
    },
    scales: { concat_0_x: ['p', 'q', 'r'], concat_0_y: [0, 7], concat_1_x: ['p', 'q', 'r'], concat_1_y: [0, 5] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'concat_0_group', items: [
          { items: [
            { marktype: 'rect', role: 'mark', name: 'inner_layer_0_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
            { marktype: 'symbol', role: 'mark', name: 'inner_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
            { marktype: 'line', role: 'mark', name: 'concat_0_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
          ] },
        ] },
        { marktype: 'group', role: 'scope', name: 'concat_1_group', items: [
          { items: [
            { marktype: 'rect', role: 'mark', name: 'concat_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'concat, named line with points': {
    spec: { data: { values: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }] }, hconcat: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { name: 'right', mark: { type: 'line', point: true }, encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] },
    tables: {
      source_0: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      data_1: [{ cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 }],
      data_2: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
    },
    scales: { concat_0_x: ['p', 'q', 'r'], concat_0_y: [0, 5], concat_1_x: ['p', 'q', 'r'], concat_1_y: [0, 7] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'concat_0_group', items: [
          { items: [
            { marktype: 'rect', role: 'mark', name: 'concat_0_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
          ] },
        ] },
        { marktype: 'group', role: 'scope', name: 'concat_1_group', items: [
          { items: [
            { marktype: 'line', role: 'mark', name: 'right_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
            { marktype: 'symbol', role: 'mark', name: 'concat_1_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'facet, named nested': {
    spec: { data: { values: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }] }, facet: { column: { field: 'panel' } }, spec: { layer: [{ name: 'inner', layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: 'point', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] }, { mark: 'line', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] } },
    tables: {
      source_0: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }],
      column_domain: [{ panel: 'A', count: 2 }, { panel: 'B', count: 2 }],
      data_2: [{ panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }],
      data_3: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }],
      cell: [{ datum: { panel: 'A', count: 2 } }, { datum: { panel: 'B', count: 2 } }],
    },
    scales: { x: ['p', 'q'], y: [0, 8] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'cell', items: [
          { datum: { panel: 'A', count: 2 }, items: [
            { marktype: 'rect', role: 'mark', name: 'inner_layer_0_marks', items: [{ datum: { panel: 'A', cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { panel: 'A', cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }] },
            { marktype: 'symbol', role: 'mark', name: 'inner_layer_1_marks', items: [{ datum: { panel: 'A', cat: 'p', v: 3, t: 7 } }, { datum: { panel: 'A', cat: 'q', v: 5, t: 2 } }] },
            { marktype: 'line', role: 'mark', name: 'child_layer_1_marks', items: [{ datum: { panel: 'A', cat: 'p', v: 3, t: 7 } }, { datum: { panel: 'A', cat: 'q', v: 5, t: 2 } }] },
          ] },
          { datum: { panel: 'B', count: 2 }, items: [
            { marktype: 'rect', role: 'mark', name: 'inner_layer_0_marks', items: [{ datum: { panel: 'B', cat: 'p', v: 4, t: 6, v_start: 0, v_end: 4 } }, { datum: { panel: 'B', cat: 'q', v: 8, t: 1, v_start: 0, v_end: 8 } }] },
            { marktype: 'symbol', role: 'mark', name: 'inner_layer_1_marks', items: [{ datum: { panel: 'B', cat: 'p', v: 4, t: 6 } }, { datum: { panel: 'B', cat: 'q', v: 8, t: 1 } }] },
            { marktype: 'line', role: 'mark', name: 'child_layer_1_marks', items: [{ datum: { panel: 'B', cat: 'p', v: 4, t: 6 } }, { datum: { panel: 'B', cat: 'q', v: 8, t: 1 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'facet, named': {
    spec: { data: { values: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }] }, name: 'f', facet: { column: { field: 'panel' } }, spec: { layer: [{ mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } }, { mark: 'point', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] } },
    tables: {
      source_0: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }],
      f_column_domain: [{ panel: 'A', count: 2 }, { panel: 'B', count: 2 }],
      data_2: [{ panel: 'A', cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { panel: 'A', cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { panel: 'B', cat: 'p', v: 4, t: 6, v_start: 0, v_end: 4 }, { panel: 'B', cat: 'q', v: 8, t: 1, v_start: 0, v_end: 8 }],
      data_3: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }],
      f_cell: [{ datum: { panel: 'A', count: 2 } }, { datum: { panel: 'B', count: 2 } }],
    },
    scales: { f_x: ['p', 'q'], f_y: [0, 8] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'f_cell', items: [
          { datum: { panel: 'A', count: 2 }, items: [
            { marktype: 'rect', role: 'mark', name: 'f_child_layer_0_marks', items: [{ datum: { panel: 'A', cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { panel: 'A', cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }] },
            { marktype: 'symbol', role: 'mark', name: 'f_child_layer_1_marks', items: [{ datum: { panel: 'A', cat: 'p', v: 3, t: 7 } }, { datum: { panel: 'A', cat: 'q', v: 5, t: 2 } }] },
          ] },
          { datum: { panel: 'B', count: 2 }, items: [
            { marktype: 'rect', role: 'mark', name: 'f_child_layer_0_marks', items: [{ datum: { panel: 'B', cat: 'p', v: 4, t: 6, v_start: 0, v_end: 4 } }, { datum: { panel: 'B', cat: 'q', v: 8, t: 1, v_start: 0, v_end: 8 } }] },
            { marktype: 'symbol', role: 'mark', name: 'f_child_layer_1_marks', items: [{ datum: { panel: 'B', cat: 'p', v: 4, t: 6 } }, { datum: { panel: 'B', cat: 'q', v: 8, t: 1 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'facet shorthand, named': {
    spec: { data: { values: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }] }, name: 'v', mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 'v', type: 'quantitative' }, column: { field: 'panel' } } },
    tables: {
      source_0: [{ panel: 'A', cat: 'p', v: 3, t: 7 }, { panel: 'A', cat: 'q', v: 5, t: 2 }, { panel: 'B', cat: 'p', v: 4, t: 6 }, { panel: 'B', cat: 'q', v: 8, t: 1 }],
      data_0: [{ panel: 'A', cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { panel: 'A', cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { panel: 'B', cat: 'p', v: 4, t: 6, v_start: 0, v_end: 4 }, { panel: 'B', cat: 'q', v: 8, t: 1, v_start: 0, v_end: 8 }],
      v_column_domain: [{ panel: 'A', count: 2 }, { panel: 'B', count: 2 }],
      v_cell: [{ datum: { panel: 'A', count: 2 } }, { datum: { panel: 'B', count: 2 } }],
    },
    scales: { v_x: ['p', 'q'], v_y: [0, 8] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'v_cell', items: [
          { datum: { panel: 'A', count: 2 }, items: [
            { marktype: 'rect', role: 'mark', name: 'v_child_marks', items: [{ datum: { panel: 'A', cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { panel: 'A', cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }] },
          ] },
          { datum: { panel: 'B', count: 2 }, items: [
            { marktype: 'rect', role: 'mark', name: 'v_child_marks', items: [{ datum: { panel: 'B', cat: 'p', v: 4, t: 6, v_start: 0, v_end: 4 } }, { datum: { panel: 'B', cat: 'q', v: 8, t: 1, v_start: 0, v_end: 8 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'repeat, named spec and leaf': {
    spec: { data: { values: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }] }, repeat: { column: ['v', 't'] }, spec: { name: 'inner', layer: [{ name: 'bars', mark: 'bar', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: { repeat: 'column' }, type: 'quantitative' } } }, { mark: 'line', encoding: { x: { field: 'cat', type: 'nominal' }, y: { field: 't', type: 'quantitative' } } }] } },
    tables: {
      source_0: [{ cat: 'p', v: 3, t: 7 }, { cat: 'q', v: 5, t: 2 }, { cat: 'r', v: 4, t: 6 }],
      data_1: [{ cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 }, { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 }, { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 }],
      data_2: [{ cat: 'p', v: 3, t: 7, t_start: 0, t_end: 7 }, { cat: 'q', v: 5, t: 2, t_start: 0, t_end: 2 }, { cat: 'r', v: 4, t: 6, t_start: 0, t_end: 6 }],
    },
    scales: { inner_child__column_v_x: ['p', 'q', 'r'], inner_child__column_v_y: [0, 7], inner_child__column_t_x: ['p', 'q', 'r'], inner_child__column_t_y: [0, 7] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'inner_child__column_v_group', items: [
          { items: [
            { marktype: 'rect', role: 'mark', name: 'inner_child__column_v_bars_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, v_start: 0, v_end: 3 } }, { datum: { cat: 'q', v: 5, t: 2, v_start: 0, v_end: 5 } }, { datum: { cat: 'r', v: 4, t: 6, v_start: 0, v_end: 4 } }] },
            { marktype: 'line', role: 'mark', name: 'inner_child__column_v_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
          ] },
        ] },
        { marktype: 'group', role: 'scope', name: 'inner_child__column_t_group', items: [
          { items: [
            { marktype: 'rect', role: 'mark', name: 'inner_child__column_t_bars_marks', items: [{ datum: { cat: 'p', v: 3, t: 7, t_start: 0, t_end: 7 } }, { datum: { cat: 'q', v: 5, t: 2, t_start: 0, t_end: 2 } }, { datum: { cat: 'r', v: 4, t: 6, t_start: 0, t_end: 6 } }] },
            { marktype: 'line', role: 'mark', name: 'inner_child__column_t_layer_1_marks', items: [{ datum: { cat: 'p', v: 3, t: 7 } }, { datum: { cat: 'q', v: 5, t: 2 } }, { datum: { cat: 'r', v: 4, t: 6 } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'altair 6.1: layer of an interactive chart': {
    spec: { config: { view: { continuousWidth: 300, continuousHeight: 300 } }, layer: [{ mark: { type: 'point' }, encoding: { color: { field: 'c', type: 'nominal' }, x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } }, name: 'view_18f67abe58e755a9_0' }, { mark: { type: 'line' }, encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } } }], data: { name: 'data-0a4a6bfc70c2945df74c9e8863ee386a' }, params: [{ name: 'param_1e9efca18e7a2868', select: { type: 'interval', encodings: ['x', 'y'] }, bind: 'scales', views: ['view_18f67abe58e755a9_0'] }], $schema: 'https://vega.github.io/schema/vega-lite/v6.4.1.json', datasets: { 'data-0a4a6bfc70c2945df74c9e8863ee386a': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }] } },
    tables: {
      'data-0a4a6bfc70c2945df74c9e8863ee386a': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'data_0': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'data_1': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'view_18f67abe58e755a9_0_marks': [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 5, y: 60, c: 'a' } }, { datum: { x: 6, y: 40, c: 'b' } }],
      'layer_1_marks': [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 5, y: 60, c: 'a' } }, { datum: { x: 6, y: 40, c: 'b' } }],
    },
    scales: { x: [0, 6], y: [0, 60], color: ['a', 'b'] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'symbol', role: 'mark', name: 'view_18f67abe58e755a9_0_marks', items: [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 5, y: 60, c: 'a' } }, { datum: { x: 6, y: 40, c: 'b' } }] },
        { marktype: 'line', role: 'mark', name: 'layer_1_marks', items: [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 5, y: 60, c: 'a' } }, { datum: { x: 6, y: 40, c: 'b' } }] },
      ] },
    ] },
  },
  'altair 6.1: hconcat of interactive charts': {
    spec: { config: { view: { continuousWidth: 300, continuousHeight: 300 } }, hconcat: [{ mark: { type: 'point' }, encoding: { color: { field: 'c', type: 'nominal' }, x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } }, name: 'view_18f67abe58e755a9_0' }, { mark: { type: 'line' }, encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } }, name: 'view_4b122d14c407e955_1' }], data: { name: 'data-0a4a6bfc70c2945df74c9e8863ee386a' }, params: [{ name: 'param_1e9efca18e7a2868', select: { type: 'interval', encodings: ['x', 'y'] }, bind: 'scales', views: ['view_18f67abe58e755a9_0', 'view_4b122d14c407e955_1'] }], $schema: 'https://vega.github.io/schema/vega-lite/v6.4.1.json', datasets: { 'data-0a4a6bfc70c2945df74c9e8863ee386a': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }] } },
    tables: {
      'data-0a4a6bfc70c2945df74c9e8863ee386a': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'data_0': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'data_1': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
    },
    scales: { color: ['a', 'b'], view_18f67abe58e755a9_0_x: [0, 6], view_18f67abe58e755a9_0_y: [0, 60], view_4b122d14c407e955_1_x: [1, 6], view_4b122d14c407e955_1_y: [0, 60] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'view_18f67abe58e755a9_0_group', items: [
          { items: [
            { marktype: 'symbol', role: 'mark', name: 'view_18f67abe58e755a9_0_marks', items: [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 5, y: 60, c: 'a' } }, { datum: { x: 6, y: 40, c: 'b' } }] },
          ] },
        ] },
        { marktype: 'group', role: 'scope', name: 'view_4b122d14c407e955_1_group', items: [
          { items: [
            { marktype: 'line', role: 'mark', name: 'view_4b122d14c407e955_1_marks', items: [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 5, y: 60, c: 'a' } }, { datum: { x: 6, y: 40, c: 'b' } }] },
          ] },
        ] },
      ] },
    ] },
  },
  'altair 6.1: facet of an interactive chart': {
    spec: { config: { view: { continuousWidth: 300, continuousHeight: 300 } }, data: { name: 'data-0a4a6bfc70c2945df74c9e8863ee386a' }, facet: { field: 'c', type: 'nominal' }, spec: { mark: { type: 'point' }, encoding: { color: { field: 'c', type: 'nominal' }, x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } }, name: 'view_07b21a75c5069ab4_0' }, params: [{ name: 'param_1e9efca18e7a2868', select: { type: 'interval', encodings: ['x', 'y'] }, bind: 'scales', views: ['view_07b21a75c5069ab4_0'] }], $schema: 'https://vega.github.io/schema/vega-lite/v6.4.1.json', datasets: { 'data-0a4a6bfc70c2945df74c9e8863ee386a': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }] } },
    tables: {
      'data-0a4a6bfc70c2945df74c9e8863ee386a': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'data_0': [{ x: 1, y: 30, c: 'a' }, { x: 2, y: 10, c: 'b' }, { x: 3, y: 50, c: 'a' }, { x: 4, y: 20, c: 'b' }, { x: 5, y: 60, c: 'a' }, { x: 6, y: 40, c: 'b' }],
      'facet_domain': [{ c: 'a', count: 3 }, { c: 'b', count: 3 }],
      'facet_domain_row': [{ data: 0 }],
      'facet_domain_column': [{ data: 0 }, { data: 1 }],
      'cell': [{ datum: { c: 'a', count: 3 } }, { datum: { c: 'b', count: 3 } }],
    },
    scales: { x: [0, 6], y: [0, 60], color: ['a', 'b'] },
    scene: { marktype: 'group', role: 'frame', name: 'root', items: [
      { items: [
        { marktype: 'group', role: 'scope', name: 'cell', items: [
          { datum: { c: 'a', count: 3 }, items: [
            { marktype: 'symbol', role: 'mark', name: 'view_07b21a75c5069ab4_0_marks', items: [{ datum: { x: 1, y: 30, c: 'a' } }, { datum: { x: 3, y: 50, c: 'a' } }, { datum: { x: 5, y: 60, c: 'a' } }] },
          ] },
          { datum: { c: 'b', count: 3 }, items: [
            { marktype: 'symbol', role: 'mark', name: 'view_07b21a75c5069ab4_0_marks', items: [{ datum: { x: 2, y: 10, c: 'b' } }, { datum: { x: 4, y: 20, c: 'b' } }, { datum: { x: 6, y: 40, c: 'b' } }] },
          ] },
        ] },
      ] },
    ] },
  },

};
