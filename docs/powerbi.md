# Power BI Integration

MAIDR ships a Power BI adapter for building a [Power BI custom visual](https://learn.microsoft.com/power-bi/developer/visuals/develop-power-bi-visuals). One call in the visual's constructor, `bindPowerBI(options.element, { chartType })`, mounts MAIDR's accessible layer inside the visual. After that, each `update()` passes the new `DataView` to it. A report reader gets audio sonification, text descriptions, braille output, keyboard navigation and a description modal for the data the report author dragged into the visual's field wells.

> **What this adapter is not.** It does **not** make Power BI's native visuals accessible, and it does **not** read another visual's data or drawing. Each custom visual runs in its own sandboxed `<iframe>`, and can see neither the report's DOM (where Power BI's native visuals render) nor another visual's data: it cannot inject ARIA into a native visual, and it receives no data except the `DataView` for its own field wells. The adapter works inside one custom visual, from the data Power BI hands that visual. It is also not a packaged `.pbiviz`. You build the visual with Microsoft's `pbiviz` tooling and import MAIDR into it like any other npm dependency. See [Limitations](#limitations) before you plan around it.

## Quick Start

Start from a visual project created with `pbiviz new`, then add MAIDR:

```bash
npm install maidr
```

### 1. `capabilities.json`

Declare the field wells MAIDR reads, a categorical mapping over them, and keyboard focus. The role names below are the adapter's defaults: `category`, `series` and `measure`, plus `x` and `y` for a scatter. If you name your roles differently, map them with the [`roles`](#powerbirolenames) option.

```json
{
  "dataRoles": [
    { "name": "category", "displayName": "Axis", "kind": "Grouping" },
    { "name": "series", "displayName": "Legend", "kind": "Grouping" },
    { "name": "measure", "displayName": "Values", "kind": "Measure" }
  ],
  "dataViewMappings": [
    {
      "conditions": [{ "category": { "max": 1 }, "series": { "max": 1 } }],
      "categorical": {
        "categories": { "for": { "in": "category" } },
        "values": {
          "group": {
            "by": "series",
            "select": [{ "for": { "in": "measure" } }]
          }
        }
      }
    }
  ],
  "supportsKeyboardFocus": true,
  "privileges": []
}
```

For a scatter visual, add two more measure roles and select them alongside (or instead of) `measure`:

```json
{ "name": "x", "displayName": "X Axis", "kind": "Measure" },
{ "name": "y", "displayName": "Y Axis", "kind": "Measure" }
```

```json
"select": [{ "for": { "in": "x" } }, { "for": { "in": "y" } }]
```

`"supportsKeyboardFocus": true` is recommended. It is what makes Power BI's keyboard model reach inside the visual: <kbd>Enter</kbd> on the visual's container moves focus into the visual, and <kbd>Tab</kbd> then stays inside it until the reader presses <kbd>Esc</kbd>. Microsoft's documentation notes that <kbd>Enter</kbd> does not always land on the first focusable element and recommends moving focus there programmatically; for this adapter that element is MAIDR's figure (see [Keyboard Controls](#keyboard-controls)). `privileges` is required from visuals API 4.6.0 onward. Leave it empty unless you want MAIDR's AI descriptions (see [Limitations](#limitations)).

### 2. `src/visual.ts`

```ts
import type { PowerBIBinding } from 'maidr/powerbi';
import { bindPowerBI } from 'maidr/powerbi';
import powerbi from 'powerbi-visuals-api';

import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

export class Visual implements IVisual {
  private readonly svg: SVGSVGElement;
  private readonly maidr: PowerBIBinding;

  constructor(options: VisualConstructorOptions) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.maidr = bindPowerBI(options.element, {
      chartType: 'column',
      barMode: 'grouped',
      title: 'Sales by quarter',
      chart: this.svg, // chart mode: MAIDR wraps your drawing
    });
  }

  update(options: VisualUpdateOptions): void {
    const dataView = options.dataViews?.[0];
    // ...draw the columns into this.svg from dataView, as any visual does...
    this.maidr.update(dataView);
  }

  destroy(): void {
    this.maidr.dispose();
  }
}
```

`bindPowerBI` appends one wrapper `<div>` (with a `data-maidr-powerbi` attribute) to `options.element` and changes nothing else. There is nothing to navigate until the first `update()`. After that, a keyboard user who presses <kbd>Enter</kbd> on the visual's container moves into the visual, reaches MAIDR's figure with <kbd>Tab</kbd>, and gets:

- **Audio sonification**: tones that represent the data values
- **Text descriptions**: announced through the screen reader
- **Braille output**: support for refreshable braille displays
- **Keyboard navigation**: the arrow keys move through the data points
- **Highlighting**: through your own [`onNavigate`](#highlighting-and-cross-highlighting) callback, which is also where cross-highlighting of the rest of the report starts

Package the visual and try it with `pbiviz start` (the developer visual in the Power BI service) or `pbiviz package`, as for any custom visual. The adapter needs no extra build step: `maidr/powerbi` is an ES module with React bundled in, because a visual's iframe shares no React with anything else.

## Chart Mode and Companion Mode

The binder runs in one of two modes. Which one you get depends on whether you pass `chart`.

### Chart mode (`chart` given)

The visual draws its own chart into an element, usually an `<svg>` or a `<canvas>`, and passes that element as `chart`. The binder **moves** it inside MAIDR's figure, so the reader's keyboard focus and the drawing are the same element. A click on the drawing focuses MAIDR, and [`onNavigate`](#highlighting-and-cross-highlighting) can highlight the mark the reader is on. Keep drawing into the same element on every update. The binder re-parents it once and gives it back to `options.element` on `dispose()`.

MAIDR draws no highlight of its own here. The adapter emits no selectors, because it cannot know how your drawing is structured, so any visual feedback is whatever your `onNavigate` callback draws.

### Companion mode (no `chart`)

GitHub issue [#1305](https://github.com/xability/maidr/issues/1305) asked for a second option: MAIDR sitting alongside a **native** Power BI visual, so authors keep the chart Power BI draws and add a non-visual reading next to it. We evaluated this, and a custom visual cannot reach into a native one. Each custom visual runs in its own sandboxed iframe, apart from the report's DOM where native visuals render, and Power BI gives it only the data bound to its own field wells, never another visual's data.

What *does* work is a companion **custom** visual bound to the **same fields** as the native one. The author places a native clustered column chart and the MAIDR visual side by side and drags the same Axis, Legend and Values fields into both. Slicers and filters then reach both visuals the same way, and the companion reads the same numbers the native chart draws. In companion mode the binder renders no chart. It renders only MAIDR's keyboard entry point, showing the text set by [`label`](#powerbibindoptions). Size the companion visual small and place it next to the native chart. A reader tabs into it and hears the native chart's data.

`label` is **visible text only**. The entry point sits inside MAIDR's focusable plot element, which has `role="img"` and an `aria-label` holding MAIDR's own instruction, so a screen reader announces that instruction and never reads the label. Use the label to tell sighted keyboard users what the box is; do not put anything in it that a screen-reader user needs to hear, and do not repeat keyboard instructions there.

```ts
this.maidr = bindPowerBI(options.element, {
  chartType: 'column',
  barMode: 'stacked', // match what the native visual draws
  title: 'Sales by quarter',
  label: 'Sales by quarter (accessible chart)', // visible text; screen readers hear MAIDR's instruction
});
```

Style the entry point with the `[data-maidr-powerbi-anchor]` attribute selector.

What companion mode cannot do:

- **It cannot highlight the native chart's mark directly.** The companion can call `selectionManager.select()` from `onNavigate` (see [below](#highlighting-and-cross-highlighting)). Power BI then cross-highlights or cross-filters the other visuals on the page, the native chart included, which is the closest a companion can get to pointing at the mark.
- **It cannot follow a click on the native chart.** A click there changes that visual's selection, which the companion hears about only as cross-highlighting or filtering of its own data, not as "this mark was clicked". [`navigateTo`](#following-a-click) is for chart mode.
- **It cannot tell how the native visual is drawn.** Set `chartType` and `barMode` to match it. A clustered and a stacked column chart are the same data view.

## Supported Chart Types

The data view alone does not say what a visual draws. One category and one measure make a column chart, a line chart and a pie equally well. So the visual names its chart with `chartType`, and the adapter shapes the data view into the matching MAIDR layer:

| `chartType` | Power BI chart | MAIDR layer |
|---|---|---|
| `column` | Column chart, one series | `bar` |
| `column` + `barMode: 'grouped'` (default) | Clustered column chart | `dodged_bar` |
| `column` + `barMode: 'stacked'` | Stacked column chart | `stacked_bar` |
| `bar` | Bar chart, drawn horizontally, one series | `bar` (horizontal) |
| `bar` + `barMode: 'grouped'` / `'stacked'` | Clustered / stacked bar chart | `dodged_bar` / `stacked_bar` (horizontal) |
| `line` | Line chart, one line per series or per measure | `line` |
| `scatter` | Scatter chart, one layer per series | `point` |
| `pie` / `donut` | Pie or donut chart | `pie` |

"Several series" means either a field in the `series` (Legend) role or several measures in the Values well with no series field. Both are drawn by Power BI as a clustered chart, and both read as one here. `barMode` has no default guess from the data: a clustered and a stacked chart receive the same data view. MAIDR's segmented bar adds its *Total* row after the series in both cases, so the per-category sum is always available.

`chartType` and `barMode` can change on any update, for example from a format-pane setting: `binding.update(dataView, { chartType: 'bar' })`.

## How the Data View Is Read

The adapter never imports `powerbi-visuals-api`. It reads the `DataView` structurally, so a real `powerbi.DataView` from any API version passes as it is. A plain JSON data view, such as a snapshot or a test fixture, converts the same way.

1. **Pick the mapping.** `dataView.categorical` is read when present. Otherwise the adapter falls back to `dataView.table`. `single` and `matrix` mappings are not read, and a data view with neither categorical nor table data converts to nothing.
2. **Find the fields by role.** Each metadata column carries the roles from `capabilities.json` that it is bound to. The category is the category column that has the `category` role, or the first category column. The measure is the value column with the `measure` role, or the first. The scatter axes use `x` and `y`, or else the first two measures.
3. **Group by series.** With a Legend field bound, Power BI emits one value column for each series value and measure. Each column is tagged with its series in `source.groupName`, and `categorical.values.source` is the Legend field. The adapter regroups the columns by that tag, in the order the tags first appear (the legend's order). It does not call the SDK's `grouped()`, so a plain JSON data view groups the same way. With no Legend field, each measure in the Values well is its own series, named after the measure.
4. **Table fallback.** For a table mapping, the category and series columns are found by role. Failing that, the category is the first column that is neither a measure nor numeric. Measure columns are those with a measure, `x` or `y` role, `isMeasure`, or a numeric type. The adapter pivots rows onto one position per distinct category and one series per distinct series value (series in first-appearance order). When a category and series pair repeats, the **first row wins**. Summing the rows would announce a total the visual never drew.
   - **Category order.** A category whose values are all numbers, or all dates, is put in ascending axis order, with blanks last: a table's rows follow the query's sort, which need not be the category's, and rows sorted by series first would otherwise run a line Feb, Mar, Jan. A text category keeps the order of the rows.
   - **No category.** With no column recognisable as the category, each row would be its own mark. A bar, column or pie chart then reads one mark per series from a single row; when the table holds several rows, reading only the first would drop the rest without a word, so the conversion is `null` and a warning asks you to bind the category role or give the table a text or date column.
5. **Only the first category level.** When several category fields are bound, the adapter reads one of them and warns that it ignored the rest. Reading a hierarchy level by level needs drill-down, which the Quick Start does not declare: add `"drilldown": { "roles": ["category"] }` to `capabilities.json`, and drilling down in the report then hands the visual the next level. See Microsoft's [drill-down documentation](https://learn.microsoft.com/power-bi/developer/visuals/drill-down-support) for how it interacts with your mapping's `conditions`.

How values become what MAIDR announces:

- **A blank is a gap, never a zero.** A zero is a real reading, and sonifying a blank as one would put a mark where the report has none. So:
  - a single-series bar with no value is left out, as Power BI draws no bar there;
  - a segmented bar's missing cell is announced as missing and stays silent;
  - a line keeps the gap at its position;
  - a scatter point missing either coordinate is dropped;
  - a pie slice that is blank, zero or negative is dropped, with a warning for the negative ones, because Power BI draws no slice for them either.
- **Numbers stay numbers.** A numeric category keeps its order and spacing, and a measure that arrives as a numeric string is parsed.
- **Dates** read as `YYYY-MM-DD` in the report's local time. The time is appended only when it is not midnight: `HH:MM`, with seconds (`HH:MM:SS`) when they are present and milliseconds (`HH:MM:SS.mmm`) when those are, so two readings a few seconds apart are never announced as the same minute.
- **An empty category** reads as `(Blank)`, the label Power BI itself shows.
- **No category field.** A bar or column chart becomes one bar per series or measure, and a pie becomes one slice per series or measure, each reading its single value. When the data view holds several rows and no category (a table view, see above), it converts to nothing with a warning rather than reading the first row alone. A line needs a category to run along, so it converts to nothing and logs a warning.
- **A pie reads one series.** With a Legend field and a category both bound, the first series is read and a warning names how many were ignored.
- **A scatter needs two measures** for each series. Without them nothing is built, and a warning says why. A bound category becomes each point's label, like Power BI's Details well.

**Axis labels** default to the display names of the bound fields: the category on the category axis and the measure on the value axis. The measure name is used only when every series reads the same measure. A horizontal `bar` chart swaps the two. The Legend field names the `z` axis of a segmented bar or a multi-line chart. For a pie the labels are the category and measure names, and for a scatter the two measure names. The `axes` option overrides `x` and `y` as the layer emits them: on a horizontal bar chart, `x` is the measure axis.

When there is nothing to navigate (no fields bound yet, no rows, or every reading blank), the conversion is `null`. The binder then mounts no MAIDR figure. In its place it renders a focusable empty state (`role="status"`, `tabIndex` 0, attribute `data-maidr-powerbi-empty`) whose text is [`emptyLabel`](#powerbibindoptions), default `No data to read`. In companion mode the empty state is visible; in chart mode it is visually hidden and your drawing stays on screen, so show your own empty state there, or declare `supportsLandingPage` in `capabilities.json`. If the reader was inside the figure when the data went away, for example a slicer filtered it to nothing, focus is handed to the empty state, so they hear why the chart is gone instead of being dropped onto the frame's body. When data comes back, focus moves from the empty state to MAIDR's figure the same way.

## Highlighting and Cross-Highlighting

`onNavigate` is called each time the reader moves, with the data points under MAIDR's cursor, and with `null` when the reader leaves the chart (see [below](#when-null-is-sent)). Each point is a `PowerBIDataPointRef` that names where it came from in the data view:

```ts
type PowerBIDataPointRef =
  | { kind: 'categorical'; categoryIndex: number | null; valueColumnIndex: number | null }
  | { kind: 'table'; rowIndex: number };
```

`categoryIndex` indexes `categorical.categories[0].values`, and `valueColumnIndex` indexes `categorical.values`. Either one is `null` where the position has no such coordinate. For example, a pie built from series alone has no category. Most positions resolve to one data point. A segmented bar's *Total* row resolves to every segment of that category, a scatter position shared by several points resolves to all of them, and a gap resolves to none.

These are the indices Power BI's own selection API takes, so the refs turn straight into [selection ids](https://learn.microsoft.com/power-bi/developer/visuals/selection-api). Selecting them makes Power BI cross-highlight or cross-filter the other visuals on the page, as a mouse click on the mark would:

```ts
import type { PowerBIDataPointRef } from 'maidr/powerbi';
import powerbi from 'powerbi-visuals-api';

import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

function selectionIdFor(host: IVisualHost, dataView: DataView, ref: PowerBIDataPointRef): ISelectionId | null {
  const builder = host.createSelectionIdBuilder();
  if (ref.kind === 'table') {
    // A table row: select it by its row index.
    return dataView.table ? builder.withTable(dataView.table, ref.rowIndex).createSelectionId() : null;
  }
  const categorical = dataView.categorical;
  if (categorical === undefined) {
    return null;
  }
  if (ref.categoryIndex !== null && categorical.categories?.[0]) {
    builder.withCategory(categorical.categories[0], ref.categoryIndex);
  }
  const column = ref.valueColumnIndex !== null ? categorical.values?.[ref.valueColumnIndex] : undefined;
  if (categorical.values && column) {
    if (categorical.values.source) {
      builder.withSeries(categorical.values, column); // only when a Legend field is bound
    }
    if (column.source.queryName) {
      builder.withMeasure(column.source.queryName);
    }
  }
  return builder.createSelectionId();
}

// In the constructor, next to bindPowerBI:
this.host = options.host;
this.selectionManager = this.host.createSelectionManager();
this.maidr = bindPowerBI(options.element, {
  chartType: 'column',
  chart: this.svg,
  onNavigate: (points) => {
    this.highlightMarks(points); // your own drawing: outline the bars in `points`
    const ids = (points ?? [])
      .map(ref => selectionIdFor(this.host, this.dataView, ref))
      .filter((id): id is ISelectionId => id !== null);
    // `null` (the reader left) and a gap (no data points) both clear.
    void (ids.length > 0 ? this.selectionManager.select(ids) : this.selectionManager.clear());
  },
});
```

(`this.dataView` is the data view you last passed to `update()`. `withTable` was added to `ISelectionIdBuilder` in visuals API 2.5.0, so a visual targeting an older API cannot select table rows.) Two things to decide before you ship this:

- **A selection on every arrow press is a query on every arrow press.** Each selection makes Power BI re-query and redraw the visuals it cross-filters. On a heavy page, you might select only when the reader pauses, or keep `onNavigate` to your own highlight and leave the rest of the report alone.
- **`null` means the reader left.** Clearing the selection then leaves nothing highlighted behind the reader.

### When `null` is sent

MAIDR itself reports nothing when focus leaves a chart, so the binder sends the `null`. It listens for `focusout` on its wrapper and, one task later (focus moving between two elements inside the figure also fires `focusout`), sends `onNavigate(null)` when either:

- focus is no longer inside the wrapper, or
- the visual's frame has lost focus (`document.hasFocus()` is false), because the reader moved to another visual, a slicer or the report's own controls.

It is sent only if a position had been reported since the last `null`, so the visual hears it once per visit, and never when the reader tabbed through without moving. It is also sent when the figure is swapped for the [empty state](#how-the-data-view-is-read), since the marks it named are gone. It is not sent by `dispose()`.

### Following a click

`binding.navigateTo(ref)` works the other way. It moves MAIDR's cursor to a data point, so a sighted colleague pointing at a bar and a screen-reader user land on the same one. Call it from your marks' click handler with the ref of the mark that was clicked:

```ts
rect.addEventListener('click', () => {
  this.maidr.navigateTo({ kind: 'categorical', categoryIndex, valueColumnIndex });
});
```

It goes through MAIDR's [`navigateTo`](LIVE_DATA.md). If the reader is inside the chart, the cursor moves at once and is announced. Otherwise the target is kept and the reader lands on it when they next focus in. `navigateTo(null)` withdraws a kept target. The call returns `false` for a ref that no position was built from, such as a blank reading, a skipped slice or a second category level, and when nothing is mounted.

`update()` commits synchronously: MAIDR holds the new data by the time it returns. So a visual that re-applies its current selection straight after `update()`, by calling `navigateTo` with the selected mark's ref, addresses the new data rather than the old.

## Updates

Call `binding.update(dataView)` from every `update()`. Power BI calls `update()` for resizes and format-pane changes as well as for new data. The binder therefore compares what the new data view converts to with what is mounted and does nothing when they are the same, so a report author dragging the visual's corner does not disturb a reader inside the chart.

**By default the binder is live: new data is applied in place while the reader is inside the chart**, keeping their position where the figure's shape allows.

This differs from the [Tableau adapter](tableau.md), which holds a refresh until the reader leaves. In Power BI, holding back does not work as a default. A custom visual's frame keeps its focused element when the reader moves to a slicer elsewhere on the page, so from inside the frame MAIDR cannot tell that they left. Data held "until they leave" would be held until they happened to tab out of the visual itself, and a reader who changed a filter and came back would hear the unfiltered chart.

Pass `live: false` to hold new data until focus leaves the visual itself (MAIDR's wrapper) and pick it up when the reader returns. While new data is held, `navigateTo` still addresses the data the reader is hearing:

```ts
bindPowerBI(options.element, { chartType: 'line', live: false });
```

Changes that swap the figure for the [empty state](#how-the-data-view-is-read), or back, are applied at once either way.

The figure's id is fixed when you bind and kept across updates, so the same MAIDR instance is updated rather than replaced.

## API Reference

### `bindPowerBI(element, options)`

Mounts MAIDR inside a custom visual.

| Parameter | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | The element Power BI passed to the visual's constructor (`options.element`). A wrapper is appended to it, and nothing else is touched. |
| `options` | `PowerBIBindOptions` | What the visual draws and how MAIDR reports back. See below. |

Returns a `PowerBIBinding`:

| Member | Type | Description |
|---|---|---|
| `update` | `(dataView, overrides?) => PowerBIConversion \| null` | Converts `options.dataViews[0]` and shows it, synchronously. `undefined` replaces the figure with the empty state. `overrides` is a `Partial<PowerBIAdapterOptions>` (for example a `chartType` or `title` read from the format pane) that applies to this update and all later ones. The figure `id` cannot be overridden. Returns the conversion now mounted, or `null` when the data view held nothing to navigate. |
| `navigateTo` | `(ref: PowerBIDataPointRef \| null) => boolean` | Moves MAIDR's cursor to a data point, or withdraws a pending move when passed `null`. Returns whether MAIDR accepted it. See [Following a click](#following-a-click). |
| `conversion` | `PowerBIConversion \| null` | Getter for the conversion currently mounted. |
| `dispose` | `() => void` | Unmounts MAIDR, removes the wrapper, and in chart mode appends your `chart` element back to `element`. Call it from `destroy()`. |

### `PowerBIBindOptions`

Every field of [`PowerBIAdapterOptions`](#powerbiadapteroptions), plus:

| Option | Type | Description |
|---|---|---|
| `chart` | `HTMLElement \| SVGElement?` | The visual's own drawing, moved inside MAIDR's figure (chart mode). Omit it for companion mode. |
| `onNavigate` | `(points: readonly PowerBIDataPointRef[] \| null) => void?` | Called as the reader moves, with the data points under the cursor, and with `null` when focus leaves the visual or the visual's frame loses focus, if a position had been reported. See [When `null` is sent](#when-null-is-sent). |
| `label` | `string?` | The visible text of companion mode's entry point. Defaults to `title`, then to `Accessible chart`. Screen readers hear MAIDR's own instruction instead, not this text. |
| `emptyLabel` | `string?` | The text of the focusable empty state shown when the data view holds nothing to navigate. Default `No data to read`. |
| `live` | `boolean?` | Apply new data in place while the reader is inside the chart. Default `true`; `false` holds it until focus leaves the visual. See [Updates](#updates). |

### `PowerBIAdapterOptions`

| Option | Type | Description |
|---|---|---|
| `chartType` | `'column' \| 'bar' \| 'line' \| 'scatter' \| 'pie' \| 'donut'` | **Required.** The chart the visual draws. See [Supported Chart Types](#supported-chart-types). |
| `barMode` | `'grouped' \| 'stacked'?` | How a multi-series bar or column chart is drawn. Default `'grouped'`. |
| `title` | `string?` | Chart title, announced on entry. Set on the figure and on its layer(s). |
| `subtitle` | `string?` | Figure subtitle. |
| `caption` | `string?` | Figure caption. |
| `axes` | `{ x?: string; y?: string }?` | Axis labels. Defaults to the display names of the bound fields. See [How the Data View Is Read](#how-the-data-view-is-read). |
| `roles` | `PowerBIRoleNames?` | Role names, when your `capabilities.json` uses different ones. |
| `id` | `string?` | The figure id, which must be unique on the page. Defaults to `maidr-powerbi-<n>`. |

### `PowerBIRoleNames`

| Field | Default | Role |
|---|---|---|
| `category` | `'category'` | The axis or category grouping. |
| `series` | `'series'` | The legend or series grouping. |
| `measure` | `'measure'` | The value measure(s). |
| `x` | `'x'` | A scatter's horizontal measure. |
| `y` | `'y'` | A scatter's vertical measure. |

### `convertPowerBIDataView(dataView, options)`

The pure half of the adapter: no DOM, no Power BI host, no React. It takes a data view and `PowerBIAdapterOptions` and returns a `PowerBIConversion`, or `null` when there is nothing to navigate. Use it in a visual that mounts `<Maidr>` itself, or in tests.

| Field | Type | Description |
|---|---|---|
| `maidr` | `Maidr` | The MAIDR data, ready for `<Maidr data={...}>`. `onNavigate` is not set. Wiring it is the binder's job. |
| `cells` | `ReadonlyMap<string, (PowerBIDataPointRef \| null)[][]>` | For the grid-shaped layers (bar, segmented bar, line, pie): layer id → `[row][col]` → the data point at that position. `null` marks a position with no mark: a blank line sample, or a gap padded to keep a segmented grid rectangular. A segmented layer's rows are its series. The *Total* row MAIDR adds after them has no entry. |
| `points` | `ReadonlyMap<string, (PowerBIDataPointRef \| null)[]>` | For scatter layers: layer id → the data point behind each point. |

### `resolvePowerBIDataPoints(conversion, info)`

Resolves a position reported by MAIDR's `onNavigate` (`{ layerId, row, col, pointIndices? }`) to the data points it stands for, against the conversion it was reported for. The binder calls it for you. Use it directly only with `convertPowerBIDataView`. It returns one ref for a bar, a slice or a line sample. For a scatter position (points that share a position are read together) or a segmented *Total* row, it can return several. For a gap or an unknown layer it returns none.

### Script tags

The UMD build (`dist/powerbi.js`) exposes `window.maidrPowerBI` with `bindPowerBI`, `convertPowerBIDataView` and `resolvePowerBIDataPoints`. A packaged visual imports `maidr/powerbi` instead. The script tag is what the [runnable examples](#examples) use to simulate a visual on a plain page.

### Type exports

```ts
import type {
  PowerBIAdapterOptions,
  PowerBIBarMode,
  PowerBIBinding,
  PowerBIBindOptions,
  PowerBICategorical,
  PowerBICategoryColumn,
  PowerBIChartType,
  PowerBIConversion,
  PowerBIDataPointRef,
  PowerBIDataView,
  PowerBIMetadataColumn,
  PowerBINavigateInfo,
  PowerBIPrimitiveValue,
  PowerBIRoleNames,
  PowerBITable,
  PowerBIValueColumn,
  PowerBIValueColumns,
  PowerBIValueTypeDescriptor,
} from 'maidr/powerbi';
```

These are **minimal structural types**. They describe only the parts of the Power BI data view the adapter reads, so nothing here depends on `powerbi-visuals-api`.

## Keyboard Controls

Reaching the visual is Power BI's keyboard model, from [its keyboard navigation documentation](https://learn.microsoft.com/power-bi/developer/visuals/supportskeyboardfocus-feature):

- Move between visuals on the report page as Power BI documents. With `"supportsKeyboardFocus": true`, <kbd>Enter</kbd> on the visual's container moves focus inside the visual, and <kbd>Tab</kbd> then stays inside the visual and reaches MAIDR's figure. Power BI notes that <kbd>Enter</kbd> does not always land on the first focusable element, and that <kbd>Tab</kbd> may need pressing more than once. Microsoft recommends focusing the first element programmatically once focus enters. MAIDR's figure is the first focusable element in the binder's wrapper, `options.element.querySelector<HTMLElement>('[data-maidr-powerbi] [tabindex]')`; one way is to focus it from a `focus` listener on the visual's `window` when `document.activeElement` is still `document.body`. Test this in the Power BI service, since the SDK does not tell a visual that <kbd>Enter</kbd> was pressed on its container.
- <kbd>Esc</kbd> is how Power BI moves focus from inside a visual back to its container. MAIDR also depends on <kbd>Esc</kbd>, and for some of these, braille mode among them, it is the only key:
  - leaving braille mode;
  - closing the chat, the chart description, the go-to-extrema dialog, the command palette and the help menu;
  - leaving label mode;
  - leaving a scatter's grid cell;
  - returning from a chart to its figure's subplot list (<kbd>Backspace</kbd> also does this).

  If Power BI handles <kbd>Esc</kbd> before MAIDR does, a reader in braille mode or in one of those dialogs is moved out to the visual's container instead, and has to find their way back in. We have not verified which of the two gets the key in each Power BI host. Test <kbd>Esc</kbd> in every one of these states in the Power BI service (and in Power BI Desktop, if your readers use it) before you ship the visual.

Once the figure is focused, the standard MAIDR shortcuts apply:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Switch between a scatter's series (layers) | Page Up / Page Down | Page Up / Page Down |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

Power BI Desktop and the Power BI service have keyboard shortcuts of their own. Keys the report frame handles before the visual's iframe sees them never reach MAIDR. Test the keys your readers rely on in the host you deploy to. For the full list of MAIDR keys, see the [Keyboard Controls](CONTROLS.md) reference.

## Limitations

- **One visual, its own data.** A custom visual runs in a sandboxed iframe and receives only its own field wells. The adapter cannot read or annotate a native visual, and companion mode works by binding the same fields a second time. See [Chart Mode and Companion Mode](#chart-mode-and-companion-mode).
- **Highlighting is yours to draw.** The adapter emits no selectors, so MAIDR draws no highlight on your chart. `onNavigate` gives you the data points to draw one, and a selection id to cross-highlight the report.
- **Cross-highlights are not read.** When another visual highlights part of this one's data, Power BI puts the highlighted portion in each value column's `highlights` array. The adapter reads `values` only, so the reader hears the full values. (With `supportsHighlight` off, which is the default, Power BI filters the data view instead, and the reader hears the filtered data.)
- **`categorical` and `table` mappings only.** `matrix` and `single` are not read. Only the first category level is read, and only one measure per series.
- **Power BI's data reduction applies.** The adapter reads the data view Power BI produced. When a large query is reduced (the mapping's `dataReductionAlgorithm`, or Power BI's default), MAIDR announces the reduced data, not the full model.
- **Settings may not persist.** MAIDR saves its settings to browser `localStorage`, which a visual's sandboxed iframe may not allow. MAIDR catches the failure and uses its defaults, so settings changed in MAIDR's settings dialog may be lost when the report reloads. Power BI's `LocalStorage` privilege enables Power BI's own storage service for visuals. It does not change what `window.localStorage` allows, and MAIDR does not use that service.
- **AI descriptions need `WebAccess`.** MAIDR's chat calls the model providers' HTTPS endpoints (for example `https://api.openai.com`, `https://api.anthropic.com`, `https://generativelanguage.googleapis.com`) and MAIDR's own service at `https://maidr-service.azurewebsites.net`. A visual must declare each of these in a `WebAccess` privilege, and the tenant admin must allow it. The chat can also talk to Ollama at a base URL the reader types in; a `WebAccess` privilege is fixed when the visual is packaged, so Ollama works only at an origin you declared there ahead of time. Without that, the chat's requests fail and everything else keeps working. A visual that accesses external services is not eligible for Power BI certification.
- **Braille and tactile hardware.** Refreshable braille through the reader's screen reader works as usual. MAIDR's direct connection to a Dot Pad over Bluetooth or USB needs browser device permissions that a sandboxed visual iframe is not expected to have.
- **Packaging and certification are a separate step.** This adapter is the MAIDR side. Building the `.pbiviz`, publishing to AppSource and Power BI visual certification (which includes a code review of the visual's repository) belong to the visual's own project, and are future work rather than part of this release.

## Examples

Two pages simulate a custom visual without Power BI. Each one hands a hand-written `DataView` to `bindPowerBI`, exactly as a visual's `update()` would:

- [powerbi-bar.html](examples/powerbi-bar.html): chart mode, a clustered column chart grouped by a Legend field, with `onNavigate` highlighting the bars, a click that calls `navigateTo`, and a simulated slicer that the live binding applies in place (one region left reads as a plain bar chart).
- [powerbi-line.html](examples/powerbi-line.html): companion mode, a "native" line chart beside a MAIDR visual bound to the same fields.

Both load the built bundles from `../dist/`, so run `npm run build` first.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
