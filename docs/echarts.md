# Apache ECharts

MAIDR reads a rendered [Apache ECharts](https://echarts.apache.org/) chart and
makes it navigable with audio sonification, text descriptions, braille output
and keyboard navigation.

Measured against **echarts 6.1.0**.

## Quick start

```html
<script src="https://cdn.jsdelivr.net/npm/echarts@6/dist/echarts.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/echarts.js"></script>
<div id="chart" style="width: 600px; height: 400px"></div>
<script>
  const container = document.querySelector('#chart');
  const chart = echarts.init(container, null, { renderer: 'svg' });

  chart.setOption({
    title: { text: 'Daily Visitors' },
    xAxis: { type: 'category', data: ['Mon', 'Tue', 'Wed'], name: 'Day' },
    yAxis: { name: 'Visitors' },
    series: [{ type: 'bar', name: 'Visitors', data: [120, 240, 180] }],
  });

  chart.on('finished', function once() {
    chart.off('finished', once);
    const maidr = maidrECharts.createMaidrFromEChart(chart, container);
    container.setAttribute('maidr', JSON.stringify(maidr));
  });
</script>
```

Two things this example does on purpose:

- **`renderer: 'svg'`.** ECharts defaults to canvas, which draws no elements to
  point at. A canvas chart still reads — audio, text and braille all come from
  the chart's model — but it highlights nothing.
- **Calling after `finished`.** The adapter locates marks in the drawn SVG, so
  it has to run after ECharts has drawn.

## Supported series types

| ECharts `series.type` | Read as | Notes |
|---|---|---|
| `bar` | `bar` | One series. `yAxis: {type: 'category'}` makes it horizontal |
| `bar` ×N sharing a `stack` | `stacked_bar` | Each point carries its series name |
| `bar` ×N without a `stack` | `dodged_bar` | |
| `line` | `line` | |
| `line` + `areaStyle` | `area` | The fill is what makes it an area |
| `line` + `step` | `line` + `stepDirection` | `'start'` → `vh`, `'end'`/`'middle'` → `hv` |
| `scatter` | `point` | A `symbolSize` reading a third column becomes `ScatterPoint.z`, which is audible |

**Not yet supported:** `pie`, `boxplot`, `candlestick`, `heatmap`, `radar`,
`funnel`, `gauge`, `treemap`, `sunburst`, `sankey`, `graph`, `parallel`,
`themeRiver`, `pictorialBar`. Each of these is *refused by name* rather than
mapped onto whichever trace is closest — most have a MAIDR trace waiting for
them, and each wants its own measured layout first. See
[#1195](https://github.com/xability/maidr/issues/1195) for the tiers.

> **Orientation note:** ECharts has no "horizontal" option. A bar chart is
> turned on its side by making the **y** axis the categorical one, and that is
> the only thing that says so — so the adapter reads the orientation from which
> axis is `type: 'category'`, and moves the magnitude onto the axis that
> carries it.

> **Gap note:** a datum with no value draws nothing. In a bar chart that
> category is left out of the reading entirely, because there is no bar to
> announce or outline; in a line chart it is kept, with no reading, so the
> samples either side stay in their places rather than the series closing over
> the hole.

## Highlighting

ECharts gives a reading almost nothing to address by. Measured on 6.1.0: the
SVG is one flat `<g>` with **no ids, no `data-*` attributes** and only
generated `zr0-cls-N` classes; `dataIndex` is not set on the traversed zrender
elements in the production build; and the element-to-DOM-node mapping is not
exposed by any public property.

What the drawing does give is a clean separation by paint, with marks
contiguous in data order:

| what | fill | stroke |
|---|---|---|
| gridline, axis line | `none` | grey, unweighted |
| bar / scatter mark | the series colour | — |
| line | `none` | the series colour, `stroke-width: 2` |
| area fill | the series colour | none |
| hover symbol | white | the series colour |
| border artefact, axis-name background | black | — |

So the adapter finds marks by their paint, **checks the count against what the
model says was drawn**, stamps them, and builds selectors from the stamps. If
the counts disagree it drops the highlighting for that chart rather than
outlining the wrong datum — the same discipline the Google Charts Calendar
uses.

One consequence worth knowing: **a series painted pure black loses its
highlighting.** Its marks are indistinguishable from the furniture, so they are
excluded, the count check fails, and the chart reads without an outline. That
is the conservative failure, not a silent wrong one.
