# MAIDR — Quarto extension

Makes the charts and diagrams in a Quarto document accessible: keyboard
navigation, audio sonification, text descriptions, and braille output, from
[MAIDR](https://maidr.ai). It covers three kinds of cell, with nothing to add
to any of them:

- `{ojs}` cells that draw with [Observable Plot](https://observablehq.com/plot);
- `{mermaid}` cells, every Mermaid diagram type;
- `{dot}` cells (Graphviz).

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

Then write your cells as you already do. Every chart and diagram they draw
becomes navigable — Tab to it and press the arrow keys.

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

````markdown
```{mermaid}
%%| label: fig-order
%%| fig-cap: "How an order is handled"
flowchart LR
  order[Order received] --> stock{In stock?}
  stock -->|yes| pack[Pack items]
  stock -->|no| back[Back-order]
```

```{dot}
digraph G {
  draft -> review -> publish;
  review -> draft [label="changes"];
}
```
````

A `{mermaid}` cell keeps its label, caption and cross-reference; the diagram
Quarto draws is the one made accessible. Mermaid cells rendered to an image
(`mermaid-format: png` or `svg`) have no diagram text left in the page and
are not read.

## Options

| Option           | Default            | Description                                                                                                                     |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `maidr-version`  | the latest release | Which MAIDR release to load.                                                                                                    |
| `maidr-base-url` | jsDelivr           | Where to load `maidr.js`, `observable.js`, `mermaid.js` and `graphviz.js` from, for projects that serve the bundles themselves. |

```yaml
filters:
  - maidr
maidr-version: 4.2.0
```

A release from before the Mermaid and Graphviz adapters has no `mermaid.js` or
`graphviz.js`; pinned to one, the page logs a failed load for each and the
`{ojs}` charts work as before.

## What it supports

**Mermaid:** every diagram type — see the
[Mermaid guide](https://maidr.ai/mermaid.html).

**Graphviz:** directed graphs, with or without clusters, and undirected
graphs — see the [Graphviz guide](https://maidr.ai/graphviz.html).

**Observable Plot:** bar charts (plain and stacked), histograms, scatter plots, dot plots, line
charts, area charts, and faceted versions of all of them — each facet becomes a
panel you can move between with Page Up and Page Down.

Heatmaps (`Plot.cell`) and box plots (`Plot.boxY`) are not read yet. See the
[integration guide](https://maidr.ai/observable.html) for the full list and the
reasons.
