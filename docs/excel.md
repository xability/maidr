# Excel Integration

MAIDR ships a Microsoft Excel adapter for [Office Add-ins](https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins). One call in an add-in's task pane, `bindExcel(element)`, reads the charts of the open workbook through Office.js and mounts MAIDR's accessible layer for them in the pane. A reader gets audio sonification, text descriptions, braille output, keyboard navigation and a description modal for a chart drawn natively in Excel: the pane lists every chart in a labelled picker, shows the one the user selects in the grid, and re-reads it when its data changes.

> **What this adapter is not.** It does **not** make Excel's own chart accessible where it sits in the grid. Excel draws its charts itself, and an add-in cannot add keyboard navigation or a screen-reader reading to them. The adapter reads a chart's data through Office.js into the add-in's task pane, and the reader moves to the pane to read it. It is also a library for building an add-in, not an add-in itself: to build your own, you host the task pane page and its manifest, as for any add-in, and a starting point is in [`examples/excel-addin/`](https://github.com/xability/maidr/tree/main/examples/excel-addin). The add-in MAIDR publishes on it, for Excel, PowerPoint and Word, is [MAIDR Accessible Charts](office-addin.md). See [Limitations](#limitations) before you plan around it.

## Quick Start

An add-in is a web page Excel opens in a task pane beside the grid, and a manifest that tells Excel where the page is. Microsoft's [Excel add-in quick start](https://learn.microsoft.com/office/dev/add-ins/quickstarts/excel-quickstart-jquery) covers creating and sideloading one; MAIDR needs only the page below.

### 1. The task pane page

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Accessible charts</title>
    <script src="https://officeapis.public.onecdn.static.microsoft/1/office.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/excel.js"></script>
  </head>
  <body>
    <main id="maidr" aria-label="Accessible charts"></main>
    <script>
      Office.onReady(() => {
        maidrExcel.bindExcel(document.getElementById('maidr'));
      });
    </script>
  </body>
</html>
```

Bind from `Office.onReady`. `bindExcel` waits for it as well, because only then has Office.js loaded the Excel API and said which Excel it is running in. It appends one wrapper `<div>` (with a `data-maidr-excel` attribute) to the element and changes nothing else. It resolves once the first chart has been read, and it never rejects: anything that stops it reading is said in the pane.

A task pane built with a bundler imports the adapter instead. It is an ES module with React bundled in, because a task pane shares no React with anything else:

```bash
npm install maidr
```

```ts
import { bindExcel } from 'maidr/excel';

Office.onReady(async () => {
  const binding = await bindExcel(document.getElementById('maidr')!);
  // binding.charts, binding.show(id), binding.refresh(), binding.dispose()
});
```

Load `office.js` from Microsoft's CDN either way, in the page's `<head>`: Microsoft [requires the CDN reference](https://learn.microsoft.com/office/dev/add-ins/develop/referencing-the-javascript-api-for-office-library-from-its-cdn) of add-ins published to the Microsoft Marketplace.

### 2. The manifest

Nothing in the manifest is MAIDR's own. Declare `ReadWriteDocument` permission although the adapter writes nothing: Office requires it of any add-in that uses the Excel JavaScript API, [even one that only reads](https://learn.microsoft.com/office/dev/add-ins/develop/requesting-permissions-for-api-use-in-content-and-task-pane-add-ins). What to decide is the requirement set. Reading a chart's data needs **ExcelApi 1.12** (`ChartSeries.getDimensionValues`), and there are two ways to deal with Excel versions that lack it:

- Declare it, and the add-in does not appear at all in an Excel without it:

  ```xml
  <Requirements>
    <Sets DefaultMinVersion="1.1">
      <Set Name="ExcelApi" MinVersion="1.12" />
    </Sets>
  </Requirements>
  ```

- Leave it out, and the add-in opens there and its pane says why it cannot read the charts. That is what the [sample](https://github.com/xability/maidr/tree/main/examples/excel-addin) does, because a reader who never finds the add-in is never told why, and one who opens it is.

ExcelApi 1.12 is in Excel on the web, Excel for Microsoft 365 on Windows from version 2008 and on Mac from 16.40, Excel 2021 and later. ExcelApi 1.15 (Microsoft 365 from version 2202, Excel 2024, Mac 16.58) adds the category cells described under [How the Chart Is Read](#how-the-chart-is-read); without it the adapter reads less, not nothing. Microsoft's [requirement set table](https://learn.microsoft.com/javascript/api/requirement-sets/excel/excel-api-requirement-sets) has the full list.

## How It Works

The pane holds two things: a native `<select>` labelled **Chart**, listing every chart on the workbook's visible worksheets as `Sheet - title` (`Sheet - Chart 2` for a chart without a title), and the figure area beneath it. A keyboard or screen-reader user chooses a chart from the picker without leaving the pane, then presses <kbd>Tab</kbd> to reach MAIDR's figure and reads it with the [usual keys](#keyboard).

The figure is MAIDR's, around the chart's picture as Excel draws it (`Chart.getImage`), so a sighted colleague sees the same chart the reader hears. The picture is decorative (`alt=""`): MAIDR's figure carries the chart's name and instructions, and repeating them would be heard twice.

The pane follows the workbook:

- **The chart the user selects in the grid** is shown, and the picker follows it. With no chart selected when the pane opens, the first chart in the workbook is shown. Pass `followActiveChart: false` to leave the choice to the picker.
- **A chart losing its selection changes nothing.** Moving from the grid into the pane can deselect the chart, and the reader went to the pane to read it.
- **Edits are re-read.** A moment after a cell changes or the workbook recalculates (`refreshDelay`, 300 ms by default), the chart on show is read again, once for a burst of them. The figure is replaced only when what it reads has changed, so an edit elsewhere in the workbook does not disturb a reader in the chart.
- **New data is applied in place**, even while the reader's focus is in the figure, keeping their position where the chart's shape allows; <kbd>Space</kbd> replays the point they are on. The pane keeps its focused element while the reader works in the grid, so MAIDR cannot tell that they left, and data held back "until they leave" would be held until they happened to leave the figure itself. The [Power BI adapter](powerbi.md#updates) makes the same choice for the same reason.
- **Charts and worksheets added or deleted** update the picker. If the chart on show is deleted, the pane says so, and the picker offers the rest.

When there is nothing to read, the pane says why in a status message (`role="status"`, focusable with <kbd>Tab</kbd>) where the figure would be: a workbook with no charts, a chart whose every value is blank, a chart type MAIDR does not know — one a later Excel adds (the message names it) — an Excel without ExcelApi 1.12, or a page that is not running in Excel at all. If the reader was in the figure when it gave way to a message, focus moves to the message, so they hear why the chart went; when the chart comes back, focus moves back to the figure the same way. A combo chart read without one of its series has a note above the figure (`role="status"`, so it is announced when the chart is shown) naming what was left out.

## Supported Chart Types

The chart type comes from Excel (`Excel.ChartType`), so nothing has to be declared. Every type `Excel.ChartType` names is read, the preview-only `…Ex` types included, and the tables below sort them by the MAIDR layer each reads as. Every 3-D, cylinder, cone and pyramid variant reads as the flat chart it is a variant of — `3DColumnClustered`, `CylinderColStacked`, `ConeBarClustered` and `PyramidColStacked100` as clustered or stacked columns and bars, `3DColumn` and its kin (each series in a row of its own along the depth axis) as a clustered column chart, `3DLine`, `3DPie` and the `3DArea` family as their flat charts — because depth and bar shape are how the chart is drawn, not what it holds.

### Stable chart types

| Excel chart | `Excel.ChartType` | MAIDR layer |
|---|---|---|
| Column | `ColumnClustered`, one series | `bar` |
| Clustered column | `ColumnClustered`, several series | `dodged_bar` |
| Stacked column | `ColumnStacked` | `stacked_bar` (`bar` for one series) |
| 100% stacked column | `ColumnStacked100` | `stacked_normalized_bar` |
| Bar | `BarClustered`, one series | `bar`, horizontal |
| Clustered bar | `BarClustered`, several series | `dodged_bar`, horizontal |
| Stacked bar | `BarStacked` | `stacked_bar`, horizontal (`bar` for one series) |
| 100% stacked bar | `BarStacked100` | `stacked_normalized_bar`, horizontal |
| Line | `Line`, `LineMarkers` | `line`, one line per series |
| Pie | `Pie`, `PieExploded` | `pie` |
| Doughnut | `Doughnut`, `DoughnutExploded` | `pie`, from the first ring |
| Pie of pie | `PieOfPie` | two `pie` subplots: the pie, and the points split off it |
| Bar of pie | `BarOfPie` | a `pie` subplot, and a `bar` subplot of the points split off it |
| Scatter | `XYScatter` | `point`, one layer per series |
| Scatter with lines | `XYScatterLines`, `XYScatterLinesNoMarkers`, `XYScatterSmooth`, `XYScatterSmoothNoMarkers` | `line` over numeric x |
| Bubble | `Bubble`, `Bubble3DEffect` | `point`, each bubble's size as its `z`, one layer per series |
| Stock, open-high-low-close | `StockOHLC` | `candlestick` |
| Stock, volume-open-high-low-close | `StockVOHLC` | `candlestick`, and a `bar` layer of the volume |
| Stock, high-low-close | `StockHLC` | `candlestick` with no open |
| Stock, volume-high-low-close | `StockVHLC` | `candlestick` with no open, and a `bar` layer of the volume |
| Surface and contour | `Surface`, `SurfaceWireframe`, `SurfaceTopView`, `SurfaceTopViewWireframe` | `heat`: the categories across, the series down |
| Histogram | `Histogram` | `hist` (`bar` when binned by category) |
| Pareto | `Pareto` | `bar`, largest first, and a `line` of the cumulative percentage |
| Box and whisker | `Boxwhisker` | `box`, a layer per series, a box per category |

A 100% stacked chart reads as normalized even with one series, because Excel draws every bar of it full height. A smoothed scatter line is read through its points; the curve Excel draws between them is not data.

### Experimental chart types

| Excel chart | `Excel.ChartType` | MAIDR layer |
|---|---|---|
| Area [experimental] | `Area` | `area` |
| Stacked area [experimental] | `AreaStacked` | `stacked_area` (`area` for one series) |
| 100% stacked area [experimental] | `AreaStacked100` | `stacked_normalized_area` |
| Stacked line [experimental] | `LineStacked`, `LineMarkersStacked` | `stacked_area` (`line` for one series) |
| 100% stacked line [experimental] | `LineStacked100`, `LineMarkersStacked100` | `stacked_normalized_area` |
| Radar [experimental] | `Radar`, `RadarMarkers`, `RadarFilled` | `radar`, one outline per series |
| Funnel [experimental] | `Funnel` | `funnel`, horizontal |
| Waterfall [experimental] | `Waterfall` | `waterfall` |
| Treemap [experimental] | `Treemap` | `treemap` |
| Sunburst [experimental] | `Sunburst` | `sunburst` |
| Map [experimental] | `RegionMap` | `choropleth` |

These MAIDR layers are [experimental](SCHEMA.md#trace-type-stability): their readings may change in any release. A stacked line is drawn at each series' running total, which is what a stacked area reads: each band its own series' value, the total derived from them.

### Combo charts

In a combo chart every series carries its own type (`ChartSeries.chartType`, ExcelApi 1.7). The series are grouped by what they are drawn as, and by the value axis they are measured on, and each group becomes one layer of a single subplot: a column series and a line series on the secondary axis are a `bar` layer and a `line` layer, and <kbd>Page Up</kbd> and <kbd>Page Down</kbd> move between them. Each layer's value axis is labelled from its own axis' title. Two layers of one type, such as two lines on different axes, are named after their series so a layer switch tells them apart.

A series of a type MAIDR does not know — one a later Excel adds — or of a type that is a chart of its own, such as a box and whisker series, is left out, and the rest of the chart is read. The pane says above the figure which series it left out, and the console says why.

### Charts Excel computes

Some charts draw what Excel computed from the data rather than the data itself — a histogram's bins, a box's quartiles, a Pareto chart's order — and Office.js hands an add-in only the data. The adapter computes them again, as Microsoft documents Excel computing them:

- **Histogram.** The values are binned as the series' bin options (`ChartSeries.binOptions`, ExcelApi 1.9) say: *Automatic*, by Scott's normal reference rule as Microsoft's [histogram article](https://support.microsoft.com/en-us/excel/create-a-histogram) states it, a bin width of 3.5 sample standard deviations over the cube root of the count; *Bin width*; or *Number of bins*, a count that includes the overflow and underflow bins. Bins start at the smallest value, or at the underflow value, and each holds the values above its lower bound up to and including its upper bound, the first one its lower bound too. An enabled overflow bin holds every value above its value, an enabled underflow bin every value at or below its value. Each bin is read as its range and its count, the range's edges announced to the place of the bin width's third significant figure (`4.61`, not `4.608319134549957`) while the values are counted against the exact edges. Binned *by category*, Excel sums each category's values, and the chart reads as a `bar` layer of those totals.
- **Pareto.** The bars are each category's total, or each bin's count, binned as a histogram's are, sorted from largest to smallest, and a `line` layer over them reads their cumulative share of the whole, from 0 to 100%.
- **Box and whisker.** A series' values are grouped by the category beside each one: a box per category, or one box named after the series when there are no categories, and a layer per series. The quartiles follow the series' quartile calculation (`ChartSeries.boxwhiskerOptions`, ExcelApi 1.9): *Exclusive*, Excel's default, as `QUARTILE.EXC` computes them, or *Inclusive*, as `QUARTILE.INC` does. The whiskers reach the furthest values within 1.5 times the interquartile range of the box, and every value beyond them is read as an outlier.
- **Pie of pie and bar of pie.** The two plots are two subplots side by side: the main pie, with the points split off it gathered into one `Other` slice, and the split-off points as a pie or as bars. Which points split off is the series' split (`ChartSeries.splitType`, ExcelApi 1.8, and `splitValue`, ExcelApi 1.9): by position, the last points of the series; by value, the points worth less than the split value; by percentage value, the points worth less than that percentage of the whole. Excel's automatic split, or no split read, is its default: by position, the last three points.
- **Waterfall.** Each value is a step from the running total, read with the totals before and after it. A point set as a total stands on the baseline at its own value, and the running total goes on from there; Office.js does not say which points those are, so a chart read from Excel has none (see [Limitations](#limitations)), while a snapshot that names them (`ExcelSeriesSnapshot.totals`) is read with them.
- **Treemap and sunburst.** The hierarchy is the category range's columns, read from its cells with ExcelApi 1.15: each value a leaf, named by its innermost level, under the levels outside it, where a blank parent cell is the one above carried down. MAIDR derives each branch's total from its leaves. A blank, zero or negative value has no area to draw and is left out.
- **Map.** Each region is read with its value. Office.js names the regions and gives no position for them, so they are read as a list in the order of the data; the picture is Excel's own map.
- **Surface and contour.** The grid is the categories across and the series down, as the contour view draws them, its first series at the bottom row. The series axis' title names the rows and the value axis' title the cells.
- **Bubble.** Each bubble's size is its point's `z`, announced with its position and sonified, and named by the header cell above the sizes with ExcelApi 1.15 (`Bubble size` without one). A bubble whose size is blank, zero or negative is one Excel does not draw by default, and is left out.

## How the Chart Is Read

The adapter never imports Office.js. It reads the `Excel` and `Office` objects the page loaded structurally, so any Office.js version is accepted as it is. One read takes a handful of `context.sync()` round trips, each one batching everything that does not depend on the one before:

1. the chart (type, name, title and its visibility, worksheet) and its series' names and types;
2. every series' values, through `ChartSeries.getDimensionValues` (ExcelApi 1.12) — `Categories` and `Values`, `XValues` and `YValues` for a scatter, and `BubbleSizes` too for a bubble chart — with what the chart type is computed from (a histogram's or Pareto chart's `binOptions`, a box and whisker chart's `boxwhiskerOptions`, a pie of pie's `splitType` and `splitValue`), each series' `filtered` and `axisGroup`, a pie's `firstSliceAngle`, and, for a line, area or scatter chart, how it plots blank cells (`Chart.displayBlanksAs`, ExcelApi 1.8);
3. the axis titles, for a chart that has axes, and a surface's series axis title;
4. with ExcelApi 1.15, where the categories come from (`getDimensionDataSourceType` and `getDimensionDataSourceString`), and
5. that range's displayed text and the header cell before it;
6. with ExcelApi 1.15, for a bubble chart, the header cell above each series' sizes, found the same way;
7. the chart's picture.

The first two are the data: when either fails, the pane says it could not read the chart. The rest are labels and a picture, each read in a round trip of its own, so an Excel that declines one costs that one thing, with a console warning, and never the chart.

A surface, and the chart types Excel 2016 added (histogram, Pareto, box and whisker, waterfall, treemap, sunburst, funnel and map), are not asked whether a chart filter hides a series or which value axis it is measured on: Office.js says a surface has no chart filter, and a property a chart type lacks could fail the whole read. Their every series is read.

How values become what MAIDR announces:

- **A blank is a gap, never a zero, unless the chart plots it as one.** A zero is a reading, and sonifying a blank as one would put a mark where the chart has none. A blank bar is left out, a segmented bar's blank segment is announced as missing, a line keeps the gap at its position, a scatter point missing either coordinate is dropped, and a pie has no slice for a blank, zero or negative value (a warning counts the negative ones). A line, area or scatter chart set to *Show empty cells as: Zero* (`displayBlanksAs` is `Zero`) draws a blank value as zero, and it reads as the zero drawn; a blank bar is still left out, and an error value is still a gap.
- **Numbers are parsed from the strings Office.js returns.** An Excel error value such as `#N/A`, which charts are often given on purpose to break a line, is a gap. Other text that is not a number is a gap too, and the console names it, since it would mean Excel handed over formatted text rather than a value.
- **A series hidden by a chart filter** (`ChartSeries.filtered`) is not drawn and not read.
- **Categories keep their order.** They are the first series' categories, as Excel's axis takes them. A blank category reads as `(blank)`; a series plotted without categories is numbered 1, 2, 3, as Excel numbers it. A scatter series whose X values are blank or text is plotted at 1, 2, 3 by Excel, and read that way.
- **With ExcelApi 1.15, categories read as their cells show them.** When the categories come from a range on a worksheet, the cells' displayed text is used — dates as the cells format them, rather than whatever `getDimensionValues` returns for a date — provided it lines up with the categories the chart has. Several label levels (a year column beside a quarter column) are joined, outer first, with an outer label carried down its group: `2024 Q1`, `2024 Q2`.
- **Axis labels come from the axis titles the chart shows.** A hidden title is not read, and neither is a hidden chart title. Without a category-axis title, the header cell above the categories (or before them, for categories across a row) names the axis, with ExcelApi 1.15. Without a value-axis title, a lone series' name names it. A horizontal bar chart's value axis is its `x`. A series on the secondary axis is labelled from the secondary axis' title.
- **Stock charts are read by position.** Excel requires a stock chart's series in the order open, high, low, close, with volume first in the volume variants, and reads them that way whatever they are called; so does the adapter. The prices are candles, and a period missing its high, low or close, or its open where the chart has one, is left out. A high-low-close chart has no open, and none is invented: its candles have no open, so MAIDR announces their high, low and close and no body, trend or pattern. The volume of a volume variant is a `bar` layer of its own beside the prices — <kbd>Page Up</kbd> and <kbd>Page Down</kbd> move between them — as Excel draws it, as columns on an axis of their own; folded into the candles, MAIDR would list it only in the chart's description, and the reader could not walk it or hear it.
- **A pie starts where Excel turned it.** Excel and MAIDR both measure the first slice clockwise from 12 o'clock.

A legend in Excel has no title, so a segmented bar announces its series under MAIDR's default name for them (`Level is North`), a line under its own (`Group is Visits`), and a radar under its own (`Series is North`).

## Keyboard

Reaching the task pane is Excel's keyboard model. In Excel for Windows and Mac, <kbd>F6</kbd> moves focus between the main areas of the window — the grid, the ribbon, the status bar and an open task pane — and <kbd>Shift</kbd>+<kbd>F6</kbd> moves back; in Excel on the web the keys are <kbd>Ctrl</kbd>+<kbd>F6</kbd> and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F6</kbd>. Microsoft's [Use a screen reader to explore and navigate Excel](https://support.microsoft.com/en-US/accessibility/excel/use-a-screen-reader-to-explore-and-navigate-excel) describes the main areas. Inside the pane, <kbd>Tab</kbd> moves from the **Chart** picker to MAIDR's figure (or to the pane's message, when there is one). Choosing a chart in the picker shows it; on Windows the arrow keys change a closed picker's choice directly, so each chart is shown as it is reached.

Once the figure is focused, the standard MAIDR shortcuts apply:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between data points | Arrow keys | Arrow keys |
| Replay the current point | Space | Space |
| Go to extremes | Ctrl + Arrow | Cmd + Arrow |
| Switch between layers (a combo chart's groups, a scatter's series) | Page Up / Page Down | Page Up / Page Down |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Auto-play | Ctrl + Shift + Arrow | Cmd + Shift + Arrow |
| Stop Auto-play | Ctrl | Cmd |

A pie of pie or bar of pie is two panels, so its figure opens at MAIDR's lobby: the arrow keys choose a panel, <kbd>Enter</kbd> goes into it and <kbd>Escape</kbd> comes back out, as [Multi-Panel Figures](CONTROLS.md#multi-panel-figures-the-lobby) describes.

Excel has keyboard shortcuts of its own, and keys it handles before the task pane's page sees them never reach MAIDR. Test the keys your readers rely on in the Excel they use. For the full list of MAIDR keys, see the [Keyboard Controls](CONTROLS.md) reference.

## API Reference

### `bindExcel(container, options?)`

Mounts the pane. Returns a `Promise<ExcelBinding>` that resolves once the first chart has been read, and never rejects.

| Parameter | Type | Description |
|---|---|---|
| `container` | `HTMLElement` | The element the pane goes in. A wrapper is appended to it, and nothing else is touched. |
| `options` | `ExcelBindOptions?` | See below. |

### `ExcelBindOptions`

| Option | Type | Description |
|---|---|---|
| `excel` | `ExcelHost?` | The `Excel` namespace. Default `window.Excel`. |
| `office` | `OfficeHost?` | The `Office` namespace. Default `window.Office`. |
| `followActiveChart` | `boolean?` | Show the chart the user selects in the grid. Default `true`. |
| `refreshDelay` | `number?` | Milliseconds to wait after a cell change before re-reading. Default `300`. |
| `imageWidth` | `number?` | The width, in pixels, to request the chart's picture at. Default: the container's width at the screen's pixel density. |
| `id` | `string?` | The figure id, unique on the page. Default `maidr-excel-<n>`. |
| `labels` | `Partial<ExcelPaneLabels>?` | Replacements for the pane's wording: `picker`, `choose`, `loading`, `noCharts`, `noData`, `unsupported` (where `{type}` names the chart type), `partial` (the note above a combo chart read without some of its series, where `{series}` names them), `unsupportedExcel`, `noExcel`, `readFailed` and `chartGone`. `DEFAULT_EXCEL_LABELS` holds the English defaults. |

### `ExcelBinding`

| Member | Type | Description |
|---|---|---|
| `maidr` | `Maidr \| null` | The figure on show, or `null` while the pane shows a message. |
| `chart` | `ExcelChartInfo \| null` | The chart on show. |
| `charts` | `readonly ExcelChartInfo[]` | Every chart the picker offers: `{ id, name, title?, worksheet, worksheetId, label }`. |
| `show` | `(chartId?: string) => Promise<void>` | Show a chart by id; with no id, the chart on show, or else the active chart, or else the first. |
| `refresh` | `() => Promise<void>` | Re-read the chart list and the chart on show. |
| `dispose` | `() => Promise<void>` | Remove every Office.js event handler the pane added, through the request context it was added in, and unmount MAIDR and the wrapper. |

### `readExcelChart(context, chart, options?)` and `convertExcelChart(snapshot, options?)`

The two halves underneath `bindExcel`, for a pane that mounts `<Maidr>` itself. `readExcelChart` takes a request context from `Excel.run` and a chart from it, and returns an `ExcelChartSnapshot`: plain data, safe to keep after the context is gone. Pass `{ categoryCells: true }` where ExcelApi 1.15 is supported, and `{ image: true }` or `{ image: { width } }` for the picture. `convertExcelChart` is pure: no DOM, no Office.js. It takes the snapshot (one read by hand works the same) and returns a MAIDR figure, or `null` with a console warning when the chart's type has no reading or it holds nothing to navigate.

```ts
import { convertExcelChart, readExcelChart } from 'maidr/excel';

const snapshot = await Excel.run(async (context) => {
  const chart = context.workbook.getActiveChartOrNullObject();
  return readExcelChart(context, chart);
});
const maidr = convertExcelChart(snapshot);
```

`listExcelCharts(context)` lists the charts `bindExcel`'s picker offers. `isSupportedExcelChartType(type)` says whether a chart type has a reading — every type `Excel.ChartType` names does, and `Invalid` or a type a later Excel adds does not — and `excelChartTypeName(type)` names it as a message does.

### Script tags

The UMD build (`dist/excel.js`) exposes `window.maidrExcel` with `bindExcel`, `convertExcelChart`, `readExcelChart`, `listExcelCharts`, `isSupportedExcelChartType`, `excelChartTypeName` and `DEFAULT_EXCEL_LABELS`.

### Type exports

The `Excel…` and `OfficeHost` interfaces exported from `maidr/excel` are **minimal structural types**. They describe only the parts of Office.js the adapter reads, so nothing here depends on `@types/office-js`, and the real `Excel` and `Office` objects pass as they are.

## Limitations

- **Excel's own chart is unchanged.** The reading happens in the task pane; the chart in the grid stays as inaccessible as Excel makes it.
- **No highlight on the picture.** The picture is an image of the chart, and the adapter emits no selectors, so MAIDR outlines nothing on it as the reader moves.
- **Excel 2019 and older perpetual versions cannot be read.** Reading a chart's data needs ExcelApi 1.12, which Office 2019 and earlier do not have; the pane says so. Excel 2021 has 1.12 but not 1.15, so its category labels are what `getDimensionValues` returns rather than the cells' displayed text.
- **Only what `getDimensionValues` returns.** The adapter reads the values Office.js hands over. Whether those include the cells of hidden rows and columns when a chart plots only visible cells, and what a date axis returns without ExcelApi 1.15, has not been verified in Excel.
- **Computed charts are computed again, not read.** A histogram's bins, a Pareto chart's order, a box's quartiles and whiskers and a pie of pie's split are worked out from the values Office.js returns, by the rules [above](#charts-excel-computes); the quartiles agree with numpy's `linear` and `weibull` methods, which are `QUARTILE.INC` and `QUARTILE.EXC`. None of it has been checked against what Excel draws, so where Excel rounds an automatic bin width, say, the reading can differ from the picture.
- **Waterfall totals read as steps.** Office.js does not say which points the author set as totals, so every point is read as an increase or a decrease from the running total: a closing total set in Excel is read as one more increase, and the running total after it is off by that much.
- **A custom pie of pie split reads as one pie.** The points an author moves into the second plot one by one are not reported by Office.js, so such a chart reads as one pie of every point.
- **A treemap's or sunburst's levels need ExcelApi 1.15.** They are read from the category range's cells; without it, every value is a leaf of one level.
- **A map's regions have no positions.** They are read as a list in the order of the data, not across the map.
- **A surface's rows are placed by assumption.** The first series is put at the bottom of the grid, as a contour chart's series axis runs up from its category axis; that has not been checked against Excel's picture.
- **The newer chart types are read on Office.js's word.** That Excel answers `getDimensionValues`, `binOptions`, `boxwhiskerOptions` and the axis titles for histogram, Pareto, box and whisker, waterfall, treemap, sunburst, funnel and map charts as its reference says, and what `getDimensionValues` returns for a multi-level category range, has not been tried in Excel. A box's mean marker and mean line are not read, and neither is a bubble chart's *Show negative bubbles* setting.
- **A chart is followed when it is selected, not when it is edited.** Editing a chart's formatting, type or source range changes nothing the pane hears about until the next cell edit or recalculation, a different chart being selected, or `refresh()`. Values a recalculation changes without a cell edit, a volatile function's, are read again once the workbook recalculates.
- **Chart sheets are not listed.** Charts on their own chart sheet are not in any worksheet's chart collection, which is where the picker looks; Office.js has no other collection of them.
- **Tested with a simulated Office.js, not inside Excel.** The unit tests and the end-to-end spec drive the adapter against a stand-in for Office.js written from Microsoft's API reference. Nothing here has yet been run inside Excel on the web, Windows or Mac, or checked with a screen reader in Excel. In particular, whether <kbd>F6</kbd> (<kbd>Ctrl</kbd>+<kbd>F6</kbd> on the web) reaches the pane and lands on its first control, whether Excel takes keys MAIDR needs (<kbd>Esc</kbd> among them) before the pane sees them, and how each screen reader announces the pane's live text, are open.

## Examples

- [excel-taskpane.html](examples/excel-taskpane.html) simulates a task pane without Excel. It installs a stand-in for Office.js holding a workbook of five charts on four worksheets — a clustered column chart with a blank cell, a line chart named by its header cell, a pie, a column-and-line combo on two axes and a treemap read in two levels from its category columns — and has buttons for what a user does in the grid: selecting a chart, editing a cell, clearing a chart's data. Add `?api=1.11` to the address to see what an Excel without ExcelApi 1.12 gets. It loads the built bundles from `../dist/`, so run `npm run build` first.
- [`examples/excel-addin/`](https://github.com/xability/maidr/tree/main/examples/excel-addin) is a minimal add-in to sideload into Excel: a manifest and a task pane page served from your machine. Its README covers serving it over `https://localhost` and adding it to Excel on the web.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
