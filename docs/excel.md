# Excel Integration

MAIDR ships a Microsoft Excel adapter for [Office Add-ins](https://learn.microsoft.com/office/dev/add-ins/overview/office-add-ins). One call in an add-in's task pane, `bindExcel(element)`, reads the charts of the open workbook through Office.js and mounts MAIDR's accessible layer for them in the pane. A reader gets audio sonification, text descriptions, braille output, keyboard navigation and a description modal for a chart drawn natively in Excel: the pane lists every chart in a labelled picker, shows the one the user selects in the grid, and re-reads it when its data changes.

> **What this adapter is not.** It does **not** make Excel's own chart accessible where it sits in the grid. Excel draws its charts itself, and an add-in cannot add keyboard navigation or a screen-reader reading to them. The adapter reads a chart's data through Office.js into the add-in's task pane, and the reader moves to the pane to read it. It is also not a published add-in: you host the task pane page and its manifest yourself, as for any add-in. A starting point is in [`examples/excel-addin/`](https://github.com/xability/maidr/tree/main/examples/excel-addin). See [Limitations](#limitations) before you plan around it.

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
- **Edits are re-read.** A moment after a cell changes (`refreshDelay`, 300 ms by default), the chart on show is read again, once for a burst of edits. The figure is replaced only when what it reads has changed, so an edit elsewhere in the workbook does not disturb a reader in the chart.
- **New data is applied in place**, even while the reader's focus is in the figure, keeping their position where the chart's shape allows; <kbd>Space</kbd> replays the point they are on. The pane keeps its focused element while the reader works in the grid, so MAIDR cannot tell that they left, and data held back "until they leave" would be held until they happened to leave the figure itself. The [Power BI adapter](powerbi.md#updates) makes the same choice for the same reason.
- **Charts and worksheets added or deleted** update the picker. If the chart on show is deleted, the pane says so, and the picker offers the rest.

When there is nothing to read, the pane says why in a status message (`role="status"`, focusable with <kbd>Tab</kbd>) where the figure would be: a workbook with no charts, a chart whose every value is blank, a chart type MAIDR cannot read yet (the message names it), an Excel without ExcelApi 1.12, or a page that is not running in Excel at all. If the reader was in the figure when it gave way to a message, focus moves to the message, so they hear why the chart went; when the chart comes back, focus moves back to the figure the same way.

## Supported Chart Types

The chart type comes from Excel (`Excel.ChartType`), so nothing has to be declared. Every 3-D, cylinder, cone and pyramid variant reads as the flat chart it is a variant of — `3DColumnClustered`, `CylinderColStacked`, `ConeBarClustered` and `PyramidColStacked100` as clustered or stacked columns and bars, `3DColumn` and its kin (each series in a row of its own along the depth axis) as a clustered column chart, `3DLine`, `3DPie` and the `3DArea` family as their flat charts — because depth and bar shape are how the chart is drawn, not what it holds.

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
| Scatter | `XYScatter` | `point`, one layer per series |
| Scatter with lines | `XYScatterLines`, `XYScatterLinesNoMarkers`, `XYScatterSmooth`, `XYScatterSmoothNoMarkers` | `line` over numeric x |
| Stock | `StockHLC`, `StockOHLC`, `StockVHLC`, `StockVOHLC` | `candlestick` |

A 100% stacked chart reads as normalized even with one series, because Excel draws every bar of it full height. A smoothed scatter line is read through its points; the curve Excel draws between them is not data.

### Experimental chart types

| Excel chart | `Excel.ChartType` | MAIDR layer |
|---|---|---|
| Area [experimental] | `Area` | `area` |
| Stacked area [experimental] | `AreaStacked` | `stacked_area` (`area` for one series) |
| 100% stacked area [experimental] | `AreaStacked100` | `stacked_normalized_area` |
| Radar [experimental] | `Radar`, `RadarMarkers`, `RadarFilled` | `radar`, one outline per series |
| Funnel [experimental] | `Funnel` | `funnel`, horizontal |

These MAIDR layers are [experimental](SCHEMA.md#trace-type-stability): their readings may change in any release.

### Combo charts

In a combo chart every series carries its own type (`ChartSeries.chartType`, ExcelApi 1.7). The series are grouped by what they are drawn as, and by the value axis they are measured on, and each group becomes one layer of a single subplot: a column series and a line series on the secondary axis are a `bar` layer and a `line` layer, and <kbd>Page Up</kbd> and <kbd>Page Down</kbd> move between them. Each layer's value axis is labelled from its own axis' title. Two layers of one type, such as two lines on different axes, are named after their series so a layer switch tells them apart.

A combo chart with one series of a type MAIDR cannot read is declined whole rather than read in part, since the reader would not know a part was missing.

### Not supported yet

Each of these gets a message in the pane naming the chart type, and the console says why:

- **Stacked line** and **100% stacked line** (with or without markers). Excel draws each series at the running total of the series before it. MAIDR has no stacked-line reading: a line would announce those totals as the series' own values, and a stacked area would name a chart the author did not draw.
- **Pie of pie** and **bar of pie**: the split between the two plots follows a rule Office.js does not report.
- **Histogram**, **Pareto**, **Box and whisker**, **Waterfall**, **Treemap**, **Sunburst** and **Map**: Excel computes what these draw — bins, quartiles, running totals, a hierarchy, map regions — and Office.js hands over only the values it computed them from. Reading those would describe a different chart.
- **Bubble**: the bubble size is a third magnitude no MAIDR scatter reading carries yet.
- **Surface** and **contour**: a grid of values MAIDR does not read from Excel yet.

## How the Chart Is Read

The adapter never imports Office.js. It reads the `Excel` and `Office` objects the page loaded structurally, so any Office.js version is accepted as it is. One read takes a handful of `context.sync()` round trips, each one batching everything that does not depend on the one before:

1. the chart (type, name, title and its visibility, worksheet) and its series' names and types;
2. every series' values, through `ChartSeries.getDimensionValues` (ExcelApi 1.12): `Categories` and `Values`, or `XValues` and `YValues` for a scatter, with each series' `filtered`, `axisGroup` and a pie's `firstSliceAngle`;
3. the axis titles, for a chart that has axes;
4. with ExcelApi 1.15, where the categories come from (`getDimensionDataSourceType` and `getDimensionDataSourceString`), and
5. that range's displayed text and the header cell before it;
6. the chart's picture.

The first two are the data: when either fails, the pane says it could not read the chart. The rest are labels and a picture, each read in a round trip of its own, so an Excel that declines one costs that one thing, with a console warning, and never the chart.

How values become what MAIDR announces:

- **A blank is a gap, never a zero.** A zero is a reading, and sonifying a blank as one would put a mark where the chart has none. A blank bar is left out, a segmented bar's blank segment is announced as missing, a line keeps the gap at its position, a scatter point missing either coordinate is dropped, and a pie has no slice for a blank, zero or negative value (a warning counts the negative ones). Excel's own *Show empty cells as zero* setting is not followed.
- **Numbers are parsed from the strings Office.js returns.** An Excel error value such as `#N/A`, which charts are often given on purpose to break a line, is a gap. Other text that is not a number is a gap too, and the console names it, since it would mean Excel handed over formatted text rather than a value.
- **A series hidden by a chart filter** (`ChartSeries.filtered`) is not drawn and not read.
- **Categories keep their order.** They are the first series' categories, as Excel's axis takes them. A blank category reads as `(blank)`; a series plotted without categories is numbered 1, 2, 3, as Excel numbers it. A scatter series whose X values are blank or text is plotted at 1, 2, 3 by Excel, and read that way.
- **With ExcelApi 1.15, categories read as their cells show them.** When the categories come from a range on a worksheet, the cells' displayed text is used — dates as the cells format them, rather than whatever `getDimensionValues` returns for a date — provided it lines up with the categories the chart has. Several label levels (a year column beside a quarter column) are joined, outer first, with an outer label carried down its group: `2024 Q1`, `2024 Q2`.
- **Axis labels come from the axis titles the chart shows.** A hidden title is not read, and neither is a hidden chart title. Without a category-axis title, the header cell above the categories (or before them, for categories across a row) names the axis, with ExcelApi 1.15. Without a value-axis title, a lone series' name names it. A horizontal bar chart's value axis is its `x`. A series on the secondary axis is labelled from the secondary axis' title.
- **Stock charts are read by position.** Excel requires a stock chart's series in the order open, high, low, close, with volume first in the volume variants, and reads them that way whatever they are called; so does the adapter. A period missing any of them is left out. A high-low-close chart has no open, and the candlestick reading leaves it out rather than inventing one.
- **A pie starts where Excel turned it.** Excel and MAIDR both measure the first slice clockwise from 12 o'clock.

A legend in Excel has no title, so a segmented bar announces its series under MAIDR's default name for them (`Level is North`), and a line under its own (`Group is Visits`).

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
| `labels` | `Partial<ExcelPaneLabels>?` | Replacements for the pane's wording: `picker`, `choose`, `loading`, `noCharts`, `noData`, `unsupported` (where `{type}` names the chart type), `unsupportedExcel`, `noExcel`, `readFailed` and `chartGone`. `DEFAULT_EXCEL_LABELS` holds the English defaults. |

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

The two halves underneath `bindExcel`, for a pane that mounts `<Maidr>` itself. `readExcelChart` takes a request context from `Excel.run` and a chart from it, and returns an `ExcelChartSnapshot`: plain data, safe to keep after the context is gone. Pass `{ categoryCells: true }` where ExcelApi 1.15 is supported, and `{ image: true }` or `{ image: { width } }` for the picture. `convertExcelChart` is pure: no DOM, no Office.js. It takes the snapshot (one read by hand works the same) and returns a MAIDR figure, or `null` with a console warning when the chart's type has no reading yet or it holds nothing to navigate.

```ts
import { convertExcelChart, readExcelChart } from 'maidr/excel';

const snapshot = await Excel.run(async (context) => {
  const chart = context.workbook.getActiveChartOrNullObject();
  return readExcelChart(context, chart);
});
const maidr = convertExcelChart(snapshot);
```

`listExcelCharts(context)` lists the charts `bindExcel`'s picker offers. `isSupportedExcelChartType(type)` says whether a chart type has a reading, and `excelChartTypeName(type)` names it as a message does.

### Script tags

The UMD build (`dist/excel.js`) exposes `window.maidrExcel` with `bindExcel`, `convertExcelChart`, `readExcelChart`, `listExcelCharts`, `isSupportedExcelChartType`, `excelChartTypeName` and `DEFAULT_EXCEL_LABELS`.

### Type exports

The `Excel…` and `OfficeHost` interfaces exported from `maidr/excel` are **minimal structural types**. They describe only the parts of Office.js the adapter reads, so nothing here depends on `@types/office-js`, and the real `Excel` and `Office` objects pass as they are.

## Limitations

- **Excel's own chart is unchanged.** The reading happens in the task pane; the chart in the grid stays as inaccessible as Excel makes it.
- **No highlight on the picture.** The picture is an image of the chart, and the adapter emits no selectors, so MAIDR outlines nothing on it as the reader moves.
- **Excel 2019 and older perpetual versions cannot be read.** Reading a chart's data needs ExcelApi 1.12, which Office 2019 and earlier do not have; the pane says so. Excel 2021 has 1.12 but not 1.15, so its category labels are what `getDimensionValues` returns rather than the cells' displayed text.
- **Not every chart type yet.** See [Not supported yet](#not-supported-yet).
- **Only what `getDimensionValues` returns.** The adapter reads the values Office.js hands over and does not recompute them. Whether those include the cells of hidden rows and columns when a chart plots only visible cells, and what a date axis returns without ExcelApi 1.15, has not been verified in Excel.
- **A chart is followed when it is selected, not when it is edited.** Editing a chart's formatting, type or source range changes nothing the pane hears about until the next cell edit, a different chart being selected, or `refresh()`. Values that change without a cell edit — external data, a volatile function recalculating — are likewise read on the next of those.
- **Chart sheets are not listed.** Charts on their own chart sheet are not in any worksheet's chart collection, which is where the picker looks; Office.js has no other collection of them.
- **Tested with a simulated Office.js, not inside Excel.** The unit tests and the end-to-end spec drive the adapter against a stand-in for Office.js written from Microsoft's API reference. Nothing here has yet been run inside Excel on the web, Windows or Mac, or checked with a screen reader in Excel. In particular, whether <kbd>F6</kbd> (<kbd>Ctrl</kbd>+<kbd>F6</kbd> on the web) reaches the pane and lands on its first control, whether Excel takes keys MAIDR needs (<kbd>Esc</kbd> among them) before the pane sees them, and how each screen reader announces the pane's live text, are open.

## Examples

- [excel-taskpane.html](examples/excel-taskpane.html) simulates a task pane without Excel. It installs a stand-in for Office.js holding a workbook of five charts on four worksheets — a clustered column chart with a blank cell, a line chart named by its header cell, a pie, a column-and-line combo on two axes and a treemap MAIDR declines — and has buttons for what a user does in the grid: selecting a chart, editing a cell, clearing a chart's data. Add `?api=1.11` to the address to see what an Excel without ExcelApi 1.12 gets. It loads the built bundles from `../dist/`, so run `npm run build` first.
- [`examples/excel-addin/`](https://github.com/xability/maidr/tree/main/examples/excel-addin) is a minimal add-in to sideload into Excel: a manifest and a task pane page served from your machine. Its README covers serving it over `https://localhost` and adding it to Excel on the web.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
