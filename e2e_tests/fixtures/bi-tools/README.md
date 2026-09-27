# Superset and Metabase output

Charts captured from a running Apache Superset and a running Metabase, driven
by `e2e_tests/specs/biToolOutput.spec.ts` (#1304). Both tools draw most of
their charts with Apache ECharts, and neither writes a chart the way this
repository's own examples do. These fixtures are what they hand ECharts, so a
change to the adapter is checked against a real tool's output, not against a
hand-written option.

Each page draws one captured option with `echarts@6.1.0` from
`node_modules`, the way its tool draws it:

- **Metabase**: SVG, sized at `init`, `setOption(option, true)`.
- **Superset**: the default canvas renderer, sized at `init`.

Each page then binds the chart with `maidrECharts.bindAllECharts(echarts)`,
the dashboard-wide recipe in `docs/echarts.md`. The width and height are
fixed, not the captured ones, so the layout differs from the screenshot.
The data, the series and the axes are unchanged.

## Where each came from

| Fixture                    | Tool               | Chart                                                                        |
| -------------------------- | ------------------ | ---------------------------------------------------------------------------- |
| `metabase-bar`             | Metabase 0.63.18.2 | `display: bar`, count of Products by Category                                |
| `metabase-line`            | Metabase 0.63.18.2 | `display: line`, count of Orders by Created At: Month                        |
| `metabase-area`            | Metabase 0.63.18.2 | `display: area`, the same query                                              |
| `metabase-stacked`         | Metabase 0.63.18.2 | `display: bar`, `stackable.stack_type: stacked`, Orders by year and Category |
| `metabase-multi-series`    | Metabase 0.63.18.2 | `display: bar`, `SUM(TOTAL)` and `COUNT(*)` by Category, one y axis each     |
| `metabase-scatter`         | Metabase 0.63.18.2 | `display: scatter`, Products' Price against Rating                           |
| `metabase-pie`             | Metabase 0.63.18.2 | `display: pie`, which Metabase draws as a one-level `sunburst`               |
| `superset-line`            | Superset 6.1.0     | `echarts_timeseries_line`, `SUM(amount)` by month                            |
| `superset-line-multi`      | Superset 6.1.0     | the same, grouped by region; South has gaps                                  |
| `superset-area`            | Superset 6.1.0     | `echarts_area`                                                               |
| `superset-bar`             | Superset 6.1.0     | `echarts_timeseries_bar`                                                     |
| `superset-bar-stacked`     | Superset 6.1.0     | the same, grouped by category, `stack: Stack`                                |
| `superset-bar-horizontal`  | Superset 6.1.0     | the same, `orientation: horizontal`, time on the y axis                      |
| `superset-bar-categorical` | Superset 6.1.0     | the same, with a category x axis                                             |
| `superset-scatter`         | Superset 6.1.0     | `echarts_timeseries_scatter`                                                 |
| `superset-pie`             | Superset 6.1.0     | `pie`, `SUM(amount)` by category                                             |
| `metabase-combo`           | Metabase 0.63.18.2 | `display: combo`, a bar and a line on two y axes                             |
| `metabase-stack-totals`    | Metabase 0.63.18.2 | a stacked bar with `graph.show_stack_values: total`, its totals as series    |
| `metabase-trend-line`      | Metabase 0.63.18.2 | a line with `graph.show_trendline`, the trend an unnamed series              |
| `metabase-waterfall`       | Metabase 0.63.18.2 | `display: waterfall`: a custom series over `start`/`end`, and a total bar    |
| `metabase-boxplot`         | Metabase 0.63.18.2 | `display: boxplot`, with a mean-marker scatter                               |
| `superset-funnel`          | Superset 6.1.0     | `funnel`                                                                     |
| `superset-heatmap`         | Superset 6.1.0     | `heatmap_v2`, category by region                                             |
| `superset-radar`           | Superset 6.1.0     | `radar`, one series per region                                               |
| `superset-sunburst`        | Superset 6.1.0     | `sunburst_v2`, category then region                                          |
| `superset-waterfall`       | Superset 6.1.0     | `waterfall`: a transparent `Assist` stacked under Increase/Decrease/Total    |
| `superset-forecast`        | Superset 6.1.0     | a timeseries line with a Prophet forecast: bounds, trend and observations    |
| `superset-stream`          | Superset 6.1.0     | `echarts_area` with `stack: Stream`, over an invisible `baseline` series     |
| `superset-mixed`           | Superset 6.1.0     | `mixed_timeseries`, a bar and a line on two y axes                           |
| `superset-histogram`       | Superset 6.1.0     | `histogram_v2`                                                               |
| `superset-boxplot`         | Superset 6.1.0     | `box_plot`, with its (empty) outlier series                                  |

`metabase-waterfall` is checked for what it announces and not for its
outline. Metabase draws its steps with a `custom` series, whose `renderItem`
is a function that `getOption()` cannot carry, so the fixture draws the
steps' data without their bars. On Metabase itself the bars are drawn, and
their count matches what the adapter reads (13 marks, measured in its SVG).

The Metabase charts query its built-in Sample Database. The Superset charts
query a 27-row SQLite table of sales from January to June 2024.

## Capturing one

Neither tool exposes its ECharts instances: each imports `echarts/core` into
its own bundle. So the page is opened in Playwright with an init script that
runs before the tool's code, and records every instance as ECharts
constructs it:

```js
window.__ec = [];
// A capture-only hack: it patches every object, and is never shipped.
// eslint-disable-next-line no-extend-native, accessor-pairs
Object.defineProperty(Object.prototype, '_zr', {
  configurable: true,
  set(value) {
    Object.defineProperty(this, '_zr', { value, writable: true, configurable: true, enumerable: true });
    if (typeof this.getModel === 'function' && typeof this.setOption === 'function') {
      window.__ec.push(this);
    }
  },
});
```

`_zr` is a private field of the ECharts instance, which is why this is a way
to capture a fixture and not something MAIDR ships. Once the chart has
rendered, `window.__ec[0].getOption()` is the option, with functions dropped
when it is written out as JSON. Paste it into a copy of a page here, as the
`option` constant.
