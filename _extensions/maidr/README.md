# MAIDR — Quarto extension

Makes the charts in a Quarto document's `{ojs}` cells accessible: keyboard
navigation, audio sonification, text descriptions, and braille output, from
[MAIDR](https://maidr.ai).

## Installing

```bash
quarto add xability/maidr
```

## Using

Add the filter to a document's YAML header, or to `_quarto.yml` for a whole
project:

```yaml
---
title: Palmer Penguins
filters:
  - maidr
---
```

Then write `{ojs}` cells as you already do. Any chart drawn with
[Observable Plot](https://observablehq.com/plot) becomes navigable — Tab to it
and press the arrow keys.

````markdown
```{ojs}
data = FileAttachment("penguins.csv").csv({ typed: true })
```

```{ojs}
Plot.plot({
  title: "Body mass by species",
  marks: [Plot.barY(data, Plot.groupX({ y: "mean" }, { x: "species", y: "body_mass_g" }))]
})
```
````

## Options

| Option           | Default            | Description                                                                                        |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------------- |
| `maidr-version`  | the latest release | Which MAIDR release to load.                                                                       |
| `maidr-base-url` | jsDelivr           | Where to load `maidr.js` and `observable.js` from, for projects that serve the bundles themselves. |

```yaml
filters:
  - maidr
maidr-version: 4.2.0
```

## What it supports

Bar charts (plain and stacked), histograms, scatter plots, dot plots, line
charts, area charts, and faceted versions of all of them — each facet becomes a
panel you can move between with Page Up and Page Down.

Heatmaps (`Plot.cell`) and box plots (`Plot.boxY`) are not read yet. See the
[integration guide](https://maidr.ai/observable.html) for the full list and the
reasons.
