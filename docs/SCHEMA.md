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
            x: "Category",
            y: "Value"
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
                  "x": "X-axis",
                  "y": "Values"
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
                  "x": "Categories",
                  "y": "Values"
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
                  "x": "Categories",
                  "y": "Values"
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

- `type`: the type of plot. Currently supported are 'bar', 'box', 'candlestick', 'dodged_bar', 'heat', 'hist', 'line', 'stacked_normalized_bar', 'point', 'smooth', 'stacked_bar',
- `id`: the id that you added as an attribute of your main SVG.
- `title`: the title of the plot. (optional)
- `axes`: axes info for your plot. `maidr.axes.x.label` and `maidr.axes.y.label` will provide axes labels, and `maidr.axes.x.level` or `maidr.axes.y.level` (x or y, not both) will provide level or tick mark labels.
- `data`: the main data for your plot. See below.

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

   // scatterplot
   maidr = {
     data: [
       {
                      "x": 1.0,
                      "y": 2.0
        },
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
              "x": "X values",
              "y": "Bar values"
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
              "x": "X values",
              "y": "Line values"
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
