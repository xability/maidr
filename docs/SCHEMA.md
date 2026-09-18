# MAIDR Data Schema

This document describes the JSON data schema used to define plots in maidr.

## Schema Structure

Your JSON schema should be a single `maidr` object with the following properties, or an array of objects if multiple plots exist on the page.

A single plot:

```javascript
// a single plot
<script>
var maidr = {
  id: "barplot_1",
  subplots: [
  [
    {
      id: "barplot_1", //add the same id to the svg component
      layers: [
        {
          id: "bar_layer1",
          type: "bar",
          title: "Sample Bar plot",
          axes: {
            x: { label: "Category" },
            y: { label: "Value" }
          },
          data: [
            {
              "x": "A",
              "y": 10
            },
            {
              "x": "B",
              "y": 24
            },
            {
              "x": "C",
              "y": 15
            },
            {
              "x": "D",
              "y": 7
            }
          ]
        }
      ]
    }
  ]
]
}
</script>
```

Or multiple plots:
```javascript
<script>
    var maidr = {
      "id": "multipanel_plot",
      "subplots": [
        [
          {
            "id": "line1",
            "layers": [
              {
                "id": "line_layer",
                "type": "line",
                "title": "Line Plot: Random Data",
                "axes": {
                  "x": { "label": "X-axis" },
                  "y": { "label": "Values" }
                },
                "data": [
                  []
                ],
              }
            ]
          }
        ],
        [
          {
            "id": "bar1",
            "layers": [
              {
                "id": "bar1_layer",
                "type": "bar",
                "title": "Bar Plot: Random Values",
                "axes": {
                  "x": { "label": "Categories" },
                  "y": { "label": "Values" }
                },
                "data": []
                }
            ]
          }
        ],
        [
          {
            "id": "bar2",
            "layers": [
              {
                "id": "bar2_layer",
                "type": "bar",
                "title": "Bar Plot 2: Random Values",
                "axes": {
                  "x": { "label": "Categories" },
                  "y": { "label": "Values" }
                },
                "data": []
              }
            ]
          }
        ]
      ]
    }
  </script>
```

## Object Properties

Use the following to define the object properties:

- `type`: the type of plot. The declarable types are `alluvial`, `area`, `bar`, `box`, `boxen`, `bump`, `candlestick`, `chord`, `choropleth`, `contour`, `diverging_bar`, `dodged_bar`, `dot`, `dumbbell`, `error_bar`, `forest`, `funnel`, `gantt`, `gauge`, `heat`, `hexbin`, `hist`, `icicle`, `line`, `lollipop`, `manhattan`, `mosaic`, `network`, `pack`, `parallel_coordinates`, `pie`, `point`, `polar_area`, `radar`, `ridgeline`, `roc`, `rug`, `sankey`, `smooth`, `stacked_area`, `stacked_bar`, `stacked_normalized_area`, `stacked_normalized_bar`, `step`, `sunburst`, `sunflower`, `survival`, `tree`, `treemap`, `violin_box`, `violin_kde`, `volcano`, `waterfall`, `word_cloud`. `TraceType` in `src/type/grammar.ts` is the source of truth; `candlestick_delta` appears there but is built at runtime from a candlestick and a reference line, so it is not something a page declares. Not all of them are equally settled — see [Trace type stability](#trace-type-stability).

> **`candlestick_delta` has no example page, on purpose.** It should never be
> given one: it is a reading mode the model derives at runtime from a
> `candlestick` layer (`src/model/candlestickDelta.ts`, reached with Alt+L), not
> a value a page declares. `TraceFactory.create` in `src/model/factory.ts` has
> no case for it, so a layer declaring it throws
> `Invalid trace type: candlestick_delta` and the figure never binds — an
> example would document something that does not exist. An audit of example
> coverage that finds this gap has found the correct state of affairs.
>
> It is the only deliberate gap. Other declarable types that lack a
> hand-authored example are genuinely missing one, and adding it is a normal
> contribution. The last three — `alluvial`, `area` and `manhattan` — were
> filled by `examples/alluvial.html`, `examples/area-overlapping.html` and
> `examples/manhattan.html`, so every declarable type now has a page carrying
> its JSON. Note that `examples/area.html` declares `stacked_area`, not `area`;
> `examples/area-overlapping.html` is the plain one, and the pair is written to
> be read together, since the difference between independent bands and bands
> that add up is the thing the missing page had left ambiguous.

- `id`: the id that you added as an attribute of your main SVG.
- `title`: the title of the plot. (optional)
- `axes`: axes info for your plot. Each axis is a per-axis object: `maidr.axes.x`, `maidr.axes.y`, and (when used) `maidr.axes.z`. Supported properties per axis: `label` (string), `min` / `max` (number bounds), `tickStep` (number), and `format` (an `AxisFormat` object controlling numeric / categorical rendering). `label` is optional and defaults to `X`, `Y`, or `Level` for the respective axis. Bare string values for axes are no longer accepted.
- `data`: the main data for your plot. See below.

### Top-Level Figure Properties

The top-level `maidr` object also accepts optional figure-wide metadata that
applies across all subplots:

- `title`, `subtitle`, `caption` (string): figure-level text. In a multi-panel
  figure, `l t` in the lobby announces the figure `title`, falling back to the
  focused subplot's own title when no figure title is authored.
- `axes` (object): figure-wide axis labels shared by every subplot — e.g. a
  facet grid whose panels all sit on one common X and Y axis. Only `label` is
  honored at the figure level (the type is `Pick<AxisConfig, 'label'>`, so a
  layer's `min` / `max` / `tickStep` / `format` have no figure-wide meaning):

  ```javascript
  var maidr = {
    id: "facet_grid",
    title: "Sales by Region",
    axes: { x: { label: "Year" }, y: { label: "Revenue" } },
    subplots: [ /* ... */ ]
  };
  ```

  In the multi-panel lobby, `l x` / `l y` announce the figure-wide label when
  authored ("Figure X label is Year"); otherwise they fall back to the focused
  subplot's own axis ("Subplot 2, X label is ..."). Omitting `axes` keeps the
  existing behavior, so this is fully backward compatible. Only `x` and `y` are
  read at the figure level — there is no figure-wide `z`, since the Z axis is
  inherently per-trace, so `l z` in the lobby always reports the focused
  subplot's own Z label.

### Top-Level Properties for Live Charts

The top-level `maidr` object accepts two optional properties for realtime/streaming scenarios (see the [Live & Streaming Data](LIVE_DATA.html) guide):

- `live` (boolean): enables live mode — in-place data updates via `window.maidrLive.setData()` / `appendData()` and the **M** monitor-mode key.
- `maxWidth` (number): sliding window size; appending a point beyond this width drops the oldest point(s), keeping at most `maxWidth` points per series.

```javascript
var maidr = {
  id: "live_chart",
  live: true,
  maxWidth: 50,
  subplots: [ /* ... */ ]
};
```

## Trace type stability

Not every declarable type carries the same promise, and that is not visible
from the list above.

Fifteen of them predate the chart-type coverage roadmap (#814). Thirty-seven
were added by it, most of them inside about two weeks, and `rug` (#1132) and
`roc` after it. **None of the thirty-nine has been through a user study**.

### Stable

`bar`, `box`, `candlestick`, `dodged_bar`, `heat`, `hist`, `line`, `pie`,
`point`, `smooth`, `stacked_bar`, `stacked_normalized_bar`, `step`,
`violin_box`, `violin_kde`

These are what MAIDR was built around. Their readings, their announcements and
their keyboard model have been exercised by real users over real charts, and a
change to any of them changes behaviour people already depend on.

### Experimental

`alluvial`, `area`, `boxen`, `bump`, `chord`, `choropleth`, `contour`,
`diverging_bar`, `dot`, `dumbbell`, `error_bar`, `forest`, `funnel`,
`gantt`, `gauge`, `hexbin`, `icicle`, `lollipop`, `manhattan`, `mosaic`,
`network`, `pack`, `parallel_coordinates`, `polar_area`, `radar`,
`ridgeline`, `roc`, `rug`, `sankey`, `stacked_area`, `stacked_normalized_area`,
`sunburst`, `sunflower`, `survival`, `tree`, `treemap`, `volcano`,
`waterfall`, `word_cloud`

**These are prototypes. Treat them as prototypes.**

- **Under active development.** They are being changed as they are used, not
  maintained against a settled specification.
- **Unstable.** Point shapes, field names, announcement wording and navigation
  semantics may change without a deprecation period, including in a patch
  release. A producer that emits one of these is pinned to the maidr version it
  was written against.
- **Not validated.** Each was measured against the drawing it reads, which is
  what the issues and the tests record. But measuring that a reading is
  *faithful to the chart* is a different claim from establishing that it is
  *useful to a reader*. Nobody has asked a blind or low-vision reader whether
  navigating a sunburst by depth, or hearing each parallel-coordinates axis on
  its own scale, is the right way to read one. Until that happens these are
  proposals about how a chart could be read, implemented and measured, not
  answers.
- **Not a support commitment.** A bug in one of these is worth reporting and is
  not a promise to keep the current behaviour.

If you are building something that has to keep working, build it on the stable
set.

### How the split is derived

It is the diff of `TraceType` against `84d9003`, the last commit on `main`
before #814 was filed:

```bash
git show 84d9003:src/type/grammar.ts | grep -oE "= '[a-z_0-9]+'"
```

`test/scripts/schemaStability.test.ts` fails if a declarable type appears in
neither list or in both, so a new trace type has to be placed deliberately
rather than inherit either promise by being forgotten.

## Shapes deliberately not read

A chart no trace type describes is declined rather than forced into the
nearest shape, because a reading that sounds confident and says something
false is worse than no reading — the lesson #814 recorded for every chart it
added. A decline that is a decision rather than an omission is written down
here, once, and an adapter that meets the chart points at this section rather
than carrying an argument of its own. Three adapters had each written their own
reason for the same chart, and the reasons did not agree (#1190).

### Set-overlap diagrams (Venn, Euler)

**Declined, in every adapter, for one reason: MAIDR has no trace whose
navigation is set membership.**

The data is not the objection. A Highcharts `venn` or `euler` point carries the
author's own declaration of a region — `sets: ['A', 'B']`, `value: 2` — and
`chartjs-chart-venn` and `am5hierarchy.Venn` take the same input. A region list
could be extracted from any of them today, and it would report the numbers the
author wrote, not a measurement of the drawing.

What no trace can hold is the question the diagram is drawn to answer: what
these sets share, and what belongs to only one of them. A flat list of `A`,
`B`, `A∩B` says *how big* each region is, and a reader stepping through it by
index is walking a layout rather than a membership. Read as a bar chart of
region sizes it would announce every number correctly and say nothing about
which sets a region belongs to — the parent trace reading the data and
answering the wrong question, which is the pattern #814 named.

If a reading is ever added it is a tier C trace in #814's sense: a
`MovableGraph` over regions addressed as `(set count, index among regions of
that count)`, where up and down move to regions of fewer or more sets and left
and right move between the regions sharing that count. The producers' data is
already in that shape; the work is the trace and its announcement, not the
extraction.

Two earlier reasons are retired. That a Venn's areas are drawn approximately
is true of the layout and not of what would be read — the producers declare
the size, and a reading would announce the declaration, not the drawing. That
a Venn has no axis is true, and no more of an obstacle than it was for the
treemap or the sankey.

## Data Formats by Plot Type

The data property is defined as a list of objects where each object is a record with fields x and y.

```javascript

   let maidr;

   // barplot maidr.data structure: a simple array of values
   maidr = {
     "data": [
                  {
                    "x": "A",
                    "y": 5.982192824845484
                  },
                  {
                    "x": "B",
                    "y": 9.309858198175455
                  },
                  {
                    "x": "C",
                    "y": 7.3531284491571505
                  },
                ]
   };

  // boxplot maidr.data structure: an array of objects with properties lower_outlier, min, q1, q2, q3, max, and upper_outlier
  maidr = {
  "data": [
              {
                "lowerOutliers": [
                  40.0,
                  50.0
                ],
                "min": 71.35451232573614,
                "q1": 92.62315416457983,
                "q2": 99.64912548800726,
                "q3": 107.6684972253361,
                "max": 118.19391634772752,
                "upperOutliers": [
                  150.0,
                  160.0
                ],
                "fill": "Group 1"
              },

            ],

            "orientation": "vert" //vert for vertical box plots, horz for horizontal bar plots
  }

  // boxen (letter-value) maidr.data structure: one object per distribution,
  // each with a median and a ladder of quantile pairs. A box plot is this
  // shape with exactly one rung; the point of a boxen is that a larger sample
  // earns more of them, so the depth varies per distribution and between them.
  maidr = {
    "type": "boxen",
    "data": [
              {
                "z": "Group 1",
                "median": 99.64912548800726,
                // Ordered outward from the median. `p` is the *tail*
                // probability, which is how letter-value plots are defined
                // and how the libraries drawing them report it: p = 0.25 is
                // the rung spanning the middle half, p = 0.125 the middle
                // three quarters, and so on. `lo` is the p quantile and `hi`
                // is the 1 - p quantile.
                //
                // Getting this backwards is the easy mistake -- a producer
                // that sends the *coverage* (0.5, 0.75, 0.875) rather than
                // the tail will have every rung announced as the wrong
                // percentile while the values stay right. The trace sorts by
                // p rather than trusting the order sent, so a ladder built
                // inward-first still reads correctly.
                //
                // 0.5 is out of range rather than a way of naming the median:
                // it would put two positions labelled "50th percentile"
                // either side of the one already called "median". Rungs
                // outside (0, 0.5) are dropped.
                "levels": [
                  { "p": 0.0625, "lo": 71.35, "hi": 118.19 },
                  { "p": 0.125,  "lo": 80.11, "hi": 112.44 },
                  { "p": 0.25,   "lo": 92.62, "hi": 107.67 }
                ],
                // Whatever fell beyond the deepest rung. Optional; a ladder
                // drawn to full depth has none.
                "lowerOutliers": [40.0, 50.0],
                "upperOutliers": [150.0, 160.0]
              }
            ],

            "orientation": "vert" // horz when the distributions run across the page
  }

  //candlestick
  maidr = {
    "data":[
              {
                'value': '2023-02-16',
                'open': 151.61,
                'high': 151.82,
                'low': 151.59,
                'close': 151.8,
                'volume': 0
              },
    ]
  }

  //dodged_bar
  maidr = {
    "data":[
      [
        {
          "x":"Adelie",
          "fill":"Below",
          "y":70
        }
      ],
      [ {
          "x":"Adelie",
          "fill":"Above",
          "y":90
        }]
    ]
  }

   // heatmap maidr.data structure: a 2D array of values
  maidr = {
        "data": {
              "points": [
                [ 60.5, 86.7, 89.3 ],
                [ 18.6, 67.6, 83.9 ],
                [ 18.5, 65.4, 78.7 ],
              ],
              "x": [
                "CoLA",
                "MNLI",
                "MRPC",
              ],
              "y": [
                "BERT",
                "BiLSTM",
                "BiLSTM+Attn",
              ]
            }
   }

    //histogram
    maidr = {
      "data":[
              {
                  "y": 4.0,
                  "x": 1.1475,
                  "xMin": 1.0,
                  "xMax": 1.295,
                  "yMin": 0,
                  "yMax": 4.0
              }
          ]
    }

    //line
    //
    //`label` is optional and names the ordinal level that a numeric `y`
    //encodes, for a line whose y axis is a category rather than a magnitude
    //(a sleep stage, a Likert response, a severity grade). When present it is
    //announced INSTEAD of the number, so the reader hears "Sleep stage is
    //REM" rather than "Sleep stage is 4"; `y` stays NUMERIC either way,
    //because it drives sonification, braille and the min/max range. Omit it
    //for the continuous y most line charts have.
    maidr = {
      "data":[
        [
          {
                      "x": 1.0,
                      "y": 2.0
          },
          {
                      "x": 2.0,
                      "y": 4.0
          },
        ]
        //add multiple arrays for multiline plots
      ]
    }

    //step: piecewise-constant data — the value is HELD across an interval and
    //then jumps, rather than being interpolated the way a line implies.
    //Data is nested exactly like `line`: one inner array per series.
    //
    //`y` stays NUMERIC — it drives sonification, braille and the min/max range.
    //`label` is the same optional per-point ordinal name documented under
    //`line` above, and is read identically here; a hypnogram is its canonical
    //case, which is why the example below carries one on every point.
    //
    //`stepDirection` is a layer-level property (a sibling of `axes` and
    //`data`), not a per-point one. It says where the jump happens between two
    //consecutive samples:
    //  "hv"  hold y[i] until x[i+1], then jump  (matplotlib 'steps-post',
    //                                            ggplot2 direction 'hv')
    //  "vh"  jump at x[i], then hold            (matplotlib 'steps-pre')
    //  "mid" jump midway between the two x values (matplotlib 'steps-mid')
    //Omit it entirely when the producing library does not report one — the
    //description only names a direction the data actually authored.
    maidr = {
      "type": "step",
      "stepDirection": "hv",
      "data":[
        [
          {
                      "x": 0.0,
                      "y": 5,
                      "label": "Awake"
          },
          {
                      "x": 0.5,
                      "y": 3,
                      "label": "N1"
          },
          {
                      "x": 1.0,
                      "y": 2,
                      "label": "N2"
          }
        ]
        //add multiple arrays for multiple step series
      ]
    }

    //pie: a FLAT array, one object per slice, in the order the slices are
    //drawn. Never the nested array the bar-family types use — a pie is one
    //row of N slices.
    //
    //`x` is the slice label and `y` its magnitude. `y` is strictly NUMERIC
    //(unlike a bar's), because it is both the sonified value and the
    //numerator of the slice's percentage.
    //
    //There is deliberately no `percentage` field. MAIDR derives the share of
    //the whole as `y / sum(y) * 100`, so an authored percentage can never
    //disagree with the values it is supposedly derived from. There is no
    //`orientation` either: slices sit around a circle, not along an axis.
    //
    //`axes` here names what the two dimensions mean rather than any drawn
    //axis: `x` what the slice labels are, `y` what their values measure.
    //`selectors` must resolve to exactly N elements in slice order, so data
    //index k and element k are the same wedge; a different count is treated
    //as addressing something other than the wedges and the layer is left
    //without highlighting rather than highlighting the wrong slice.
    //A doughnut is the same layer — the hole is a visual detail.
    //
    //MAIDR walks a pie CLOCKWISE: Right steps to the next slice round the
    //dial the way a clock hand goes, the audio pans each slice to where it
    //sits, and `p` names its clock position. Two optional keys say how the
    //slices were laid out so that reading matches the drawing:
    //
    //`startAngle`: where the first slice begins, in degrees clockwise from
    //12 o'clock. Defaults to 0. matplotlib's `startangle=0` (3 o'clock) is
    //90 here, and Chart.js's `rotation` carries over unchanged. Plotly's
    //`rotation` is clockwise from 12 too, but only a clockwise plotly pie
    //starts there: a counterclockwise one (plotly's default) ends its FIRST
    //wedge at `rotation` and draws it clockwise of there, so the ring starts
    //at `rotation` plus that wedge's sweep -- 50 of 100 at `rotation: 0`
    //means `startAngle: 180`.
    //
    //`direction`: `"clockwise"` (the default) or `"counterclockwise"`, the
    //way successive slices follow one another from `startAngle`. Declare
    //`"counterclockwise"` for a library that draws that way -- matplotlib,
    //base R's `pie()` and plotly all do by default -- and MAIDR walks `data`
    //in reverse so Right still moves clockwise, with the highlight, the pan
    //and the clock position on the slice being read. `data` and `selectors`
    //stay in drawn order either way; only the walk changes.
    maidr = {
      "type": "pie",
      "axes": {
        "x": { "label": "Fruit" },
        "y": { "label": "Units" }
      },
      "selectors": "#chart path.slice",
      "startAngle": 0,
      "direction": "clockwise",
      "data":[
        {
          "x": "Apples",
          "y": 30
        },
        {
          "x": "Bananas",
          "y": 50
        },
        {
          "x": "Cherries",
          "y": 20
        }
      ]
    }

   // scatterplot
   maidr = {
     data: [
       {
                      "x": 1.0,
                      "y": 2.0
        },
     ],
   };

   // scatterplot on a category axis: `xLabel` / `yLabel` name the category the
   // coordinate is a *position* for. A strip plot, a swarm plot and a jittered
   // `geom_point` all draw this shape.
   //
   // The coordinate stays numeric. The trace sorts on it, measures distance
   // with it, and resolves the column index that stereo panning uses from it,
   // and `'a' - 'b'` is NaN -- a string in `x` alone would give an unstable
   // sort, a broken column index and a highlight that lands nowhere. Emit the
   // tick position, not the drawn coordinate: on a strip plot the drawn one is
   // the jitter, a precise number for a quantity that does not exist.
   //
   // Either axis may carry the names -- `stripplot(x='g', y='v')` puts them on
   // x and `stripplot(y='g', x='v')` puts them on y -- so name the one that
   // applies and leave the other off. An empty string counts as absent.
   //
   // One name per numeric slot: every point sharing an `x` must carry the same
   // `xLabel`, since the slot *is* the category. A second, different name for
   // the same `x` is dropped rather than splitting the category into two
   // columns.
   maidr = {
     data: [
       { "x": 0, "xLabel": "a", "y": 1.4 },
       { "x": 0, "xLabel": "a", "y": 2.1 },
       { "x": 1, "xLabel": "b", "y": 3.0 }
     ],
   };

   // roc: a receiver operating characteristic curve, one array of operating
   // points per classifier. `x` is the false positive rate and `y` the true
   // positive rate, both fractions of one; `threshold` is the decision
   // threshold the point was scored at, and `z` names the curve as it names
   // a line. `auc` is the area the producer computed, read from the first
   // point of the curve that carries one; when no point does, the area is the
   // trapezoid rule over the curve's own points, which is what
   // `sklearn.metrics.auc` and `pROC::auc` compute. The points may be listed
   // in either order.
   //
   // The pitch is the true positive rate on the unit interval for every
   // curve, so two classifiers are comparable by ear; the pan follows the
   // false positive rate. Each point announces its threshold and how far it
   // sits above (or below) the chance diagonal, and the description gives
   // the area under each curve and the best operating point.
   maidr = {
     type: 'roc',
     axes: { x: { label: 'False positive rate' }, y: { label: 'True positive rate' } },
     data: [
       [
         { "x": 0, "y": 0, "threshold": 1, "z": "Logistic", "auc": 0.896 },
         { "x": 0.1, "y": 0.75, "threshold": 0.6, "z": "Logistic" },
         { "x": 1, "y": 1, "threshold": 0, "z": "Logistic" }
       ],
       [
         { "x": 0, "y": 0, "threshold": 1, "z": "Random forest" },
         { "x": 0.25, "y": 0.6, "threshold": 0.5, "z": "Random forest" },
         { "x": 1, "y": 1, "threshold": 0, "z": "Random forest" }
       ]
     ],
   };

   // rug: observations marked as ticks along one axis. One position per
   // observation and nothing else -- the chart is drawn to show where the
   // observations fall and where they bunch up. `x` for a vertical rug (the
   // ticks stand on the x axis, the default), `y` for a horizontal one
   // (`orientation: 'horz'`); the trace reads the field the orientation
   // names and ignores the other, so a producer that already emits a rug as
   // a `point` layer with a constant on the other axis switches by changing
   // `type`. Listed in any order: the observations are walked from the
   // lowest position up, and a flat selector pairs elements in this order.
   //
   // The pitch and the stereo pan follow the position on the axis, read
   // against `axes.x.min` / `max` when they cover the data and the data's
   // own span otherwise. The braille is the observation count per bin along
   // the axis: `tickStep` sets the bin width when declared, so the strip
   // lines up with the ticks the chart draws, and the axis is cut into
   // `ceil(sqrt(n))` equal bins when it is not.
   maidr = {
     type: 'rug',
     axes: { x: { label: 'Seconds', min: 0, max: 10, tickStep: 2.5 } },
     data: [
       { "x": 2.2 },
       { "x": 1.5 },
       { "x": 9.4 }
     ],
   };

   // smooth line maidr.data: an object containing x and y properties, each with an array of float values
   // note that data is an array here as scatterplots are often combine with line plots
   maidr = {
      "data":[
        [
          {
                      "x": 4.7,
                      "y": 3.12,
                      "svg_x": 404.51,
                      "svg_y": 390.012
          },
        ]
      ]
    }

   // violin_box: summary statistics overlay for violin plots
   // data is an array of BoxPoint objects, one per violin
   maidr = {
      "type": "violin_box",
      "data": [
              {
                "fill": "Ideal",
                "lowerOutliers": [],
                "min": 326,
                "q1": 878,
                "q2": 1810,
                "q3": 4678,
                "max": 18806,
                "upperOutliers": [18806],
                "mean": 3458
              },
              {
                "fill": "Premium",
                "lowerOutliers": [],
                "min": 326,
                "q1": 1046,
                "q2": 3185,
                "q3": 6296,
                "max": 18823,
                "upperOutliers": []
              }
            ]
   }

   // violin_kde: KDE density curve for violin plots
   // data is a 2D array: data[violinIndex][curvePosition] = ViolinKdePoint
   // points come in left/right pairs at each Y level (do NOT deduplicate)
   maidr = {
      "type": "violin_kde",
      "data": [
              [
                { "x": "Ideal", "y": -501.7, "svg_x": 100.41, "svg_y": 281.84, "width": 0.044 },
                { "x": "Ideal", "y": -501.7, "svg_x": 103.84, "svg_y": 281.84, "width": 0.044 },
                { "x": "Ideal", "y": -294.2, "svg_x": 98.25,  "svg_y": 279.41, "width": 0.100 },
                { "x": "Ideal", "y": -294.2, "svg_x": 105.99, "svg_y": 279.41, "width": 0.100 }
              ],
              [
                { "x": "Premium", "y": -400.0, "svg_x": 200.0, "svg_y": 270.0, "width": 0.035 },
                { "x": "Premium", "y": -400.0, "svg_x": 205.0, "svg_y": 270.0, "width": 0.035 }
              ]
            ]
   }

```

## Multilayer Plots

If multiple plots are overlaid on the same SVG, provide the data corresponding to every plot in the layers array.

```javascript
maidr = {
  "id": "multilayer_plot",
  "subplots": [
    [
      {
        "id": "445f4f08-b8a5-4204-8c55-0851eda7daec",
        "layers": [
          {
            "id": "f548e01f-ed13-469c-9e0a-cea420ec8b3f",
            "type": "bar",
            "title": "",
            "axes": {
              "x": { "label": "X values" },
              "y": { "label": "Bar values" }
            },
            "data": [
              {
                "x": "0",
                "y": 3.0
              },
              {
                "x": "1",
                "y": 5.0
              },
            ],
          },
          {
            "id": "f022d8e9-4aff-4ab0-9959-904fd07c9bd2",
            "type": "line",
            "title": "Multilayer Plot Example",
            "axes": {
              "x": { "label": "X values" },
              "y": { "label": "Line values" }
            },
            "data": [
              [
                {
                  "x": 0.0,
                  "y": 10.0,
                  "fill": "Line Data"
                },
                {
                  "x": 1.0,
                  "y": 8.0,
                  "fill": "Line Data"
                },
              ]
            ],
          }
        ]
      }
    ]
  ]
}
```

### Violin Plot (Multilayer)

Violin plots use two layers in the same subplot: `violin_box` for summary statistics and `violin_kde` for the KDE density curve. Put `violin_box` first so it is the default view. Users switch between layers with `PageUp`/`PageDown`.

For the full data contract and field reference, see [VIOLIN_PLOT_SPEC.md](./VIOLIN_PLOT_SPEC.md).

```javascript
maidr = {
  "id": "violin_plot",
  "subplots": [
    [
      {
        "layers": [
          {
            "id": "box-layer",
            "type": "violin_box",
            "title": "Diamond Price Distribution by Cut Quality",
            "axes": {
              "x": { "label": "Cut Quality" },
              "y": { "label": "Price (USD)" }
            },
            "selectors": [
              {
                "lowerOutliers": [],
                "min": "#box1 .whisker-min",
                "iq": "#box1 .iqr-rect",
                "q2": "#box1 .median-line",
                "max": "#box1 .whisker-max",
                "upperOutliers": []
              }
            ],
            "data": [
              {
                "fill": "Ideal",
                "lowerOutliers": [],
                "min": 326,
                "q1": 878,
                "q2": 1810,
                "q3": 4678,
                "max": 18806,
                "upperOutliers": []
              }
            ]
          },
          {
            "id": "kde-layer",
            "type": "violin_kde",
            "title": "Diamond Price Distribution by Cut Quality",
            "axes": {
              "x": { "label": "Cut Quality" },
              "y": { "label": "Price (USD)" }
            },
            "selectors": [
              "#violin-group-1 path"
            ],
            "data": [
              [
                { "x": "Ideal", "y": -501.7, "svg_x": 100.4, "svg_y": 281.8, "width": 0.044 },
                { "x": "Ideal", "y": -501.7, "svg_x": 103.8, "svg_y": 281.8, "width": 0.044 },
                { "x": "Ideal", "y": -294.2, "svg_x": 98.3,  "svg_y": 279.4, "width": 0.100 },
                { "x": "Ideal", "y": -294.2, "svg_x": 106.0, "svg_y": 279.4, "width": 0.100 }
              ]
            ]
          }
        ]
      }
    ]
  ]
}
```
