# Graphviz Integration

MAIDR provides an adapter for [Graphviz](https://graphviz.org/) diagrams that turns the SVG Graphviz draws into an accessible, navigable graph with audio sonification, text descriptions and braille output.

The adapter reads the drawing alone. It needs neither the DOT source nor Graphviz in the page, so it works on whatever drew the SVG: the `dot` command, a [Quarto](https://quarto.org/docs/authoring/diagrams.html) `{dot}` cell, R's [DiagrammeR](https://rich-iannone.github.io/DiagrammeR/), or a WebAssembly build such as [`@hpcc-js/wasm-graphviz`](https://www.npmjs.com/package/@hpcc-js/wasm-graphviz) or viz.js running in the page.

## Quick Start

Load `maidr.js` and `graphviz.js`, then call `bindGraphviz()` once the drawings are in the page:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My Graphviz Diagram</title>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/maidr/dist/graphviz.js"></script>
  </head>
  <body>
    <!-- The SVG `dot -Tsvg` wrote, pasted or included as it is -->
    <svg width="222pt" height="465pt" viewBox="0.00 0.00 222.00 465.00">
      <g id="graph0" class="graph">...</g>
    </svg>

    <script>
      maidrGraphviz.bindGraphviz();
    </script>
  </body>
</html>
```

`bindGraphviz()` finds every Graphviz drawing in the document, converts each one and sets its `maidr` attribute, which MAIDR picks up as it does any other chart. Click the diagram, or tab to it, and use the arrow keys.

## How It Works

Graphviz's SVG is regular: the graph is a `<g class="graph">`, each node a `<g class="node">` and each edge a `<g class="edge">`, every one titled with what the DOT source called it. A node's title is its name; an edge's is its two ends joined by `->` (or `--` in an undirected `graph`), each end followed by its port when the edge named one. The adapter reads:

- **nodes**, in drawing order, each announced by the text drawn on it. A node drawn with no text, such as `shape=point`, is announced by its name;
- **edges**, each pointing from the node it leaves to the node it arrives at (or, in a `graph`, joining the two), with the text drawn on it (its `label`, and any `xlabel`, `headlabel` and `taillabel`) as the edge's label;
- **clusters** (`subgraph cluster_*`), each by its drawn label, or by its name without the `cluster` prefix when it draws none;
- **the graph's `label`**, as the figure's title.

Graphviz draws a cluster's nodes beside the cluster's group, not inside it, so what puts a node in a cluster is the outline drawn around it: the adapter reads each node's position from the drawing's own coordinates and puts it inside every cluster whose outline holds it.

Each node of a directed graph, and each link of a network, is paired with its own group in the drawing, so what the reader is on is outlined. Graphviz numbers its groups `node1`, `edge1`, ... afresh in every drawing, so the adapter marks each group with `data-maidr-graphviz-node` or `data-maidr-graphviz-edge` and gives the SVG an id when it has none: two graphs on one page are kept apart.

## Supported Graph Types

### Stable chart types

None yet. Every graph type below is experimental.

### Experimental chart types

| Graph | MAIDR type | What the reader moves through |
|-------|-----------|-------------------------------|
| Directed Graph [experimental] | `directed_graph` | A `digraph`: nodes in the order the edges run, each announcing the nodes feeding it and fed by it, with the edges' labels. |
| Directed Graph with Clusters [experimental] | `directed_graph` | A `digraph` with `subgraph cluster_*` blocks: each cluster is a scope the reader opens with Down and leaves with Up, nested as the clusters are. |
| Network [experimental] | `network` | A `graph`: nodes by connected group, one group per row, most connected first, each announcing its degree and the nodes it is linked to. |

Which one a drawing is follows from its edges: `->` in a `digraph`, `--` in a `graph`. A drawing with no edges at all cannot say, and is read as a directed graph of nodes with nothing between them.

## Code Examples

### Stable chart types

None yet.

### Experimental chart types

#### Directed Graph [experimental]

A `digraph` becomes a `directed_graph`. The reader starts on a node nothing feeds and moves along the edges, hearing each node's inputs and outputs with their labels: below, `Pick and pack` is reached from `In stock?` (yes) and from `Order from supplier` (arrives).

```dot
digraph Orders {
  label="Order handling";
  node [shape=box, style=rounded];
  received [label="Order received"];
  stock [shape=diamond, style="", label="In stock?"];
  pick [label="Pick and pack"];
  reorder [label="Order from supplier"];
  ship [label="Ship"];
  notify [label="Email the customer"];
  received -> stock;
  stock -> pick [label="yes"];
  stock -> reorder [label="no"];
  reorder -> pick [label="arrives"];
  pick -> ship;
  ship -> notify;
}
```

```js
// The drawing is already in the page, inside #diagram.
maidrGraphviz.bindGraphviz(document.getElementById('diagram'), { nodeLabel: 'Step' });
```

`nodeLabel` names what a node is on this graph, so MAIDR says "Step" where it would otherwise say "Node".

#### Directed Graph with Clusters [experimental]

Each cluster becomes a scope of the directed graph, named by its label. The reader meets a cluster as one item in the order the edges run, hears how many nodes are inside it, opens it with Down to walk its nodes, and leaves it with Up. Clusters nest as they are drawn: below, `Data` is a scope inside `Backend`.

```dot
digraph Services {
  label="Checkout service";
  node [shape=box];
  browser [label="Browser"];
  subgraph cluster_backend {
    label="Backend";
    api [label="API"];
    payments [label="Payments"];
    subgraph cluster_data {
      label="Data";
      db [label="Orders DB"];
      cache [label="Cache"];
    }
  }
  worker [label="Email worker"];
  browser -> api;
  api -> payments;
  api -> cache [label="read"];
  api -> db [label="write"];
  db -> worker;
}
```

The node the reader is on is outlined; a cluster is not, since MAIDR derives a scope from its nodes rather than from a drawn element. A cluster announces the label Graphviz drew on it. In DOT a subgraph inherits its parent's `label` unless it sets its own, so a cluster inside a labelled graph draws -- and is announced by -- the graph's label; give it `label=""` to draw none and have it called by its name instead. Where two clusters side by side draw the same label, each is announced with its name beside it (`Shop (web)`, `Shop (store)`), so they stay two scopes. A cluster drawn with no outline, such as `style=invis`, is not a scope: nothing on the page shows the group.
#### Network [experimental]

An undirected `graph` becomes a `network`: one link per edge, and the link that joins the node the reader is on to the group is outlined. A link between two people is a fact about the pair, not a way to go, so the reader moves through each connected group by degree rather than along the edges. Below, Ana, Ben, Chloe and Dev form one group, with Chloe the most connected, and Eli and Fay another.

```dot
graph Team {
  label="Who reviews whose code";
  ana [label="Ana"]; ben [label="Ben"]; chloe [label="Chloe"];
  dev [label="Dev"]; eli [label="Eli"]; fay [label="Fay"];
  ana -- ben; ana -- chloe; ben -- chloe; chloe -- dev;
  eli -- fay;
}
```

```js
maidrGraphviz.bindGraphviz(document.getElementById('diagram'), { nodeLabel: 'Person' });
```

A network names its nodes by the text drawn on them. Where two nodes are drawn with the same text, every node is named by its DOT name instead, so the two stay two. A node no edge touches has no link to be named in, and is not read -- the adapter names such nodes in a console warning; a loop (`a -- a`) is reported apart from the node's links.

## Quarto

Quarto draws a `{dot}` cell with Graphviz when it renders, and writes the SVG straight into an HTML or Reveal.js page. Load the adapter after the body and every diagram on the page is made accessible:

````markdown
---
title: "Release process"
format:
  html:
    include-after-body:
      text: |
        <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/maidr/dist/graphviz.js"></script>
        <script>maidrGraphviz.bindGraphviz();</script>
---

```{dot}
digraph {
  label="Release process";
  build -> test -> ship;
  test -> fix [label="fails"];
  fix -> build;
}
```
````

Other formats -- PDF, Word, Typst -- draw the diagram as an image, which the adapter has nothing to read in.

## Drawing in the Page

When Graphviz runs in the page, bind the drawing once it is inserted:

```js
import { Graphviz } from '@hpcc-js/wasm-graphviz';
import { renderGraphviz } from 'maidr/graphviz';

const graphviz = await Graphviz.load();
const container = document.getElementById('diagram');
container.innerHTML = graphviz.dot('digraph { a -> b -> c }');
renderGraphviz(container.querySelector('svg'));
```

`renderGraphviz` converts one drawing and sets its `maidr` attribute; `createMaidrFromGraphviz` converts it and returns the figure without setting anything.

## Configuration Options

Each function takes the same options:

| Option | Default | Meaning |
|--------|---------|---------|
| `id` | the SVG's id | The figure's id. `bindGraphviz` uses it only when it is given a single drawing. |
| `title` | the graph's `label` | The figure's title. The graph's name (`digraph Orders`) is drawn nowhere a sighted reader sees it, so it is never used. |
| `subtitle` | none | The figure's subtitle. |
| `caption` | none | The figure's caption. |
| `nodeLabel` | "Node" | What a node is on this graph, announced as the node noun. |

## Using with npm/Bundlers

```js
import { bindGraphviz, createMaidrFromGraphviz, renderGraphviz } from 'maidr/graphviz';
```

`readGraphviz(svg)` returns what the adapter read -- nodes, edges and label -- for a caller that wants to build its own layer, and `isGraphvizSvg(svg)` says whether Graphviz drew an SVG.

## Keyboard Controls

| Key | Action |
|-----|--------|
| Arrow keys | Move between nodes |
| `T` | Toggle text descriptions |
| `B` | Toggle braille output |
| `S` | Toggle sonification |
| `H` | Open the help menu, which lists every command |

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
