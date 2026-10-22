# Mermaid Integration

MAIDR makes [Mermaid](https://mermaid.js.org) diagrams accessible: every diagram type Mermaid draws -- flowcharts, sequence, class, state and entity-relationship diagrams, gantt charts, mindmaps, pie charts and the rest -- becomes navigable with the keyboard and readable as speech, sonification and braille.

The adapter does not guess from the drawing. It parses the diagram's text with **Mermaid's own parser**, reads what the parser produced, and pairs that with the SVG Mermaid drew, so a reader hears exactly what the author wrote: a flowchart's branch labels, a class's members, a relationship's cardinality, a message's place in its loop.

## Quick Start

Load Mermaid, MAIDR and the Mermaid adapter, turn off Mermaid's automatic rendering, and let the adapter render instead:

```html
<pre class="mermaid">
flowchart LR
  order[Order received] --> stock{In stock?}
  stock -->|yes| pack[Pack items]
  stock -->|no| back[Back-order]
</pre>

<script src="https://cdn.jsdelivr.net/npm/mermaid@12.2.0/dist/mermaid.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
<script src="https://cdn.jsdelivr.net/npm/maidr/dist/mermaid.js"></script>
<script>
  mermaid.initialize({ startOnLoad: false });
  maidrMermaid.bindMermaid(mermaid);
</script>
```

`bindMermaid` takes the place of `mermaid.run()`: it renders every `.mermaid` element on the page, one at a time, and makes each one accessible. Click a diagram or Tab to it, then use the arrow keys.

`startOnLoad: false` matters. Mermaid replaces each diagram's text with its drawing, and the adapter needs the text; with `startOnLoad` left on, Mermaid would draw the diagrams before the adapter could read them.

MAIDR shows its text and dialogs inside the element a diagram is drawn in. Once a diagram is drawn in a `<pre>`, the adapter gives the `<pre>` the page's font (`font-family: inherit`), so they are not set in its monospace. Mermaid's diagrams carry their own font and look the same; a Wardley map, which has none, takes the page's font, the one Mermaid laid it out in. A font set in the `<pre>`'s own `style` attribute is kept.

## Using with npm/Bundlers

```bash
npm install maidr mermaid
```

```javascript
import mermaid from 'mermaid';
import 'maidr';
import { bindMermaid, createMaidrFromMermaid } from 'maidr/mermaid';

mermaid.initialize({ startOnLoad: false });
await bindMermaid(mermaid);
```

### Binding a diagram you render yourself

When you call `mermaid.render` yourself, hand the adapter the same text and the SVG it produced:

```javascript
const text = 'sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi';
const { svg, bindFunctions } = await mermaid.render('greeting', text);
container.innerHTML = svg;
bindFunctions?.(container);

const drawing = container.querySelector('svg');
const maidr = await createMaidrFromMermaid(mermaid, text, drawing, { title: 'Greeting' });
drawing.setAttribute('maidr', JSON.stringify(maidr));
```

`renderMermaid(mermaid, element, text?)` does the same for one element: it renders `text` (or the element's own text) into the element and binds it.

Both leave the drawing at the size Mermaid gave it. By default Mermaid draws a diagram `width="100%"`, up to an inline `max-width` of the width it laid it out at; MAIDR's figure is only as wide as the chart it holds, so that percentage would have nothing to resolve against and the browser would draw the diagram at 300px. The adapter writes the same size the other way round, `width: <max-width>; max-width: 100%`: as wide as Mermaid laid it out, and no wider than the page. A width you set yourself is left alone.

They also pad the drawing by 5px inside that size (`padding: 5px; box-sizing: border-box`). MAIDR's focus ring is drawn 5px into the chart, and Mermaid crops a diagram to what it drew, so without the padding the ring would cover a railroad's rule names, a packet's bit numbers or a sankey's node bars while the reader is in the diagram. A padding you set on the drawing yourself is left alone.

## Quarto

A `{mermaid}` cell is made accessible as it is, with nothing to add to it. Either install the MAIDR Quarto extension, which also covers `{dot}` (Graphviz) and Observable Plot `{ojs}` cells:

```bash
quarto add xability/maidr
```

```yaml
filters:
  - maidr
```

or load the scripts yourself:

````markdown
---
title: "Order handling"
format:
  html:
    include-in-header:
      text: |
        <script src="https://cdn.jsdelivr.net/npm/maidr/dist/maidr.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/maidr/dist/mermaid.js"></script>
---

```{mermaid}
%%| label: fig-order
%%| fig-cap: "How an order is handled"
flowchart LR
  order[Order received] --> stock{In stock?}
  stock -->|yes| pack[Pack items]
  stock -->|no| back[Back-order]
```
````

Quarto draws its `{mermaid}` cells itself, once the page has loaded, with the Mermaid it bundles, and replaces each cell's text with the drawing. On a page Quarto rendered -- recognised by the `<meta name="generator" content="quarto-…">` it writes -- the adapter starts by itself (`watchQuartoMermaid()`). It keeps each cell's text before Quarto draws it, and binds the drawings once Quarto has drawn them all, so the diagram the reader gets is the one Quarto drew, with its label, caption and cross-reference. The scripts have to be in the head, where both ways above put them, to run before Quarto draws. To keep the adapter from starting on a Quarto page, set `window.maidrMermaidAutoInit = false` before the script loads.

Quarto 1.10 bundles Mermaid 11.12, and the adapter reads it. Mermaid 11 does not tag a sequence diagram's message lines and notes with their ids as Mermaid 12 does, so the adapter pairs them with the messages in drawing order instead. Cells rendered to an image (`mermaid-format: png` or `svg`) have no diagram text left in the page and are not read.

## How It Works

1. **Parses the text with Mermaid** -- `mermaid.mermaidAPI.getDiagramFromText` returns the diagram's type and its database: the nodes, edges, messages, tasks or slices the parser read.
2. **Chooses the reading** -- each diagram type becomes the MAIDR layer it is read for (see [Supported Diagram Types](#supported-diagram-types)).
3. **Pairs the reading with the drawing** -- each point is matched to the element Mermaid drew for it, so the highlight follows the reader. Mermaid's element ids carry counters that move from one parse to the next, so the adapter matches on everything but the counter and falls back to drawing order; a layer whose elements cannot all be paired is read without a highlight rather than with one on the wrong shape.
4. **Hands the figure to MAIDR** -- by setting the `maidr` attribute on the SVG.

The title comes from the diagram's `title` (or its front matter), and the caption from its `accDescr`. A quadrant chart's subtitle names its quadrants.

## Supported Diagram Types

Every diagram type in Mermaid 12 is read, and ZenUML through its plugin. Several become a type MAIDR already had; two -- sequence and Venn diagrams -- were given trace types of their own, because nothing else reads order in time or set membership.

### Stable chart types

| Diagram | Mermaid keyword | MAIDR reads it as |
|---------|-----------------|-------------------|
| Pie | `pie` | one `pie` slice per section; a slice Mermaid leaves undrawn (under 1%) is still read |
| XY chart (bar and line) | `xychart` | one `bar` or `line` layer per plot; Page Up / Page Down switch between them |
| User journey | `journey` | one `line` of the tasks in the order Mermaid draws them, across the sections: a task's score with the mood it is drawn with, who takes part and its section |
| Quadrant chart | `quadrantChart` | a `point` layer of the named points on two axes from 0 to 1, gridded by quadrant; the quadrants are named in the figure subtitle (<kbd>L</kbd>, then <kbd>S</kbd>) |
| Wardley map | `wardley-beta` | a `point` layer of the components by evolution and visibility, gridded in quarters, and a `directed_graph` of the value chain |

### Experimental chart types

These may change without a deprecation period; see [Trace type stability](SCHEMA.md#trace-type-stability).

| Diagram | Mermaid keyword | MAIDR reads it as |
|---------|-----------------|-------------------|
| Flowchart [experimental] | `flowchart`, `graph` | a `directed_graph`: steps, subgraphs as scopes, each arrow by its label, a node's shape when it means something (decision, database) |
| Sequence diagram [experimental] | `sequenceDiagram` | a `sequence`: messages in time, lifelines, fragments, notes and sequence numbers |
| ZenUML sequence diagram [experimental] | `zenuml` (with the `@mermaid-js/mermaid-zenuml` plugin) | a `sequence`: sync, async, creation and reply messages, nested calls and their fragments |
| Class diagram [experimental] | `classDiagram` | a `directed_graph`: classes with their attributes and methods; inheritance, realization, composition, aggregation, association and dependency with cardinalities; namespaces as scopes |
| State diagram [experimental] | `stateDiagram-v2` | a `directed_graph`: states joined by their events, composite states and concurrent regions as scopes, start and end named |
| Entity relationship diagram [experimental] | `erDiagram` | a `directed_graph`: entities with their attributes and keys, each relationship by its verb and both cardinalities |
| Requirement diagram [experimental] | `requirementDiagram` | a `directed_graph`: each box by its kind -- a requirement by its requirement type, with id, text, risk and verification, and an element as an element, with its type and document; relationships by what they assert |
| Use case diagram [experimental] | `usecase-beta` | a `directed_graph`: actors and use cases inside their system boundaries |
| C4 diagram [experimental] | `C4Context` and the other C4 levels | a `directed_graph`: people, systems and containers in their boundaries, relationships with their technology |
| Block diagram [experimental] | `block` | a `directed_graph`: blocks inside composite blocks, block arrows by their direction |
| Architecture diagram [experimental] | `architecture-beta` | a `directed_graph`: services and junctions in their groups, each announced as an element with its kind |
| Git graph [experimental] | `gitGraph` | a `directed_graph`: commits on their branches, each fed by its parents, with tags and merge and cherry-pick commits named |
| Event model [experimental] | `eventmodeling` | a `directed_graph`: each time frame's entity (UI, command, read model, event, processor) in its swimlane, with its frame, along the flow between them |
| Swimlane diagram [experimental] | `swimlane-beta` | a `directed_graph`: steps lane by lane |
| Agent flow [experimental] | `agentflow-beta` | a `directed_graph`: an agent's steps inside its flows, each by the kind its author gave it (task, tool, input, decision, action, reference document, connector) |
| Mindmap [experimental] | `mindmap` | a `tree` from the central topic |
| Kanban board [experimental] | `kanban` | a `tree` of columns and their cards, each card with its ticket, assignee and priority |
| Tree view [experimental] | `treeView-beta` | a `tree` of folders and files |
| Ishikawa diagram [experimental] | `ishikawa-beta` | a `tree` from the effect to its categories of cause and their causes |
| Timeline [experimental] | `timeline` | a `tree` of sections, periods and their events |
| Railroad diagram [experimental] | `railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta` | a `tree` of grammar rules and the expressions they are made of |
| Cynefin framework [experimental] | `cynefin-beta` | a `tree` of the five domains Mermaid draws, each with the decision model and practice drawn under it, and what sits in each, and a `directed_graph` of the transitions between domains |
| Gantt chart [experimental] | `gantt` | a `gantt` lane per section, each task an interval announced as dates, with its status (done, active, critical, milestone) |
| Packet diagram [experimental] | `packet` | a `gantt`, named a packet diagram: a lane per row of bits, each field an interval of bits announced by its first and last bit and its width, and panned by where it starts in its row |
| Radar chart [experimental] | `radar-beta` | a `radar` curve per series |
| Sankey diagram [experimental] | `sankey` | a `sankey` flow per link |
| Treemap [experimental] | `treemap-beta` | a `treemap` of sections and sized items |
| Venn diagram [experimental] | `venn-beta` | a `venn`: the sets, then their overlaps by depth, each with its name, size and the items written in it |

ZenUML (`zenuml`) is drawn by a separate Mermaid plugin that keeps no diagram database -- ZenUML parses its own text -- so the adapter reads the text itself, following the grammar Mermaid documents for ZenUML. Register the plugin with Mermaid before binding:

```html
<script src="https://cdn.jsdelivr.net/npm/@mermaid-js/mermaid-zenuml@1.0.1/dist/mermaid-zenuml.min.js"></script>
<script>
  const zenuml = window.__esbuild_esm_mermaid_nm['mermaid-zenuml'];
  mermaid.registerExternalDiagrams([zenuml.default ?? zenuml]).then(() => {
    mermaid.initialize({ startOnLoad: false });
    maidrMermaid.bindMermaid(mermaid);
  });
</script>
```

### What the adapter reads, not the drawing

- **Arrows are read in the direction they point.** A class edge written `Animal <|-- Duck` is read as Duck inheriting from Animal, and an architecture connection drawn with an arrow runs the way the arrow points. An architecture connection drawn as a plain line, or with an arrow at each end, is read both ways, as a C4 two-way relationship is. A composition or aggregation runs from the whole, where its diamond is drawn: `Car *-- Wheel` and `Wheel --* Car` are both read as Car composed of Wheel. Each cardinality is read with its class, in the order the edge runs: `Shape "1" <|-- "many" Circle` is `cardinality many Circle to 1 Shape`. A class relation with a head at each end, `Teacher <--> Student`, is read both ways, each in the words of its own head. A solid `-->` is an association and a dashed `..>` a dependency, though Mermaid draws them with the same head.
- **An edge to a group is read as entering or leaving it.** `subgraph --> step` in a flowchart leaves from the subgraph's last steps; a transition into a composite state enters on its initial states. A group that ends in a loop is left from the states or steps in the loop and those leading to it, never from its initial state, and one that starts in a loop is entered on them, never on its final state.
- **A hierarchy's nodes are named for what they are.** A kanban board announces `Column is To do`, and then `Card is Write the docs` for a card in it. An Ishikawa diagram's nodes are an `Effect`, `Category` or `Cause`; a timeline's a `Section`, `Period` or `Event`; a Cynefin framework's a `Domain` or `Item`; and a railroad diagram's a `Rule`, an `Expression`, a `Terminal` or a `Reference` to another rule. The description's table lists them in a Kind column.
- **Notes are folded into what they annotate.** A note attached to a class or state is announced with it as `Note`, rather than read as a step of its own.
- **Sizes Mermaid made up are not announced.** A Venn diagram without sizes is laid out with sizes Mermaid chooses; those are the layout's, so such a diagram is read without sizes.
- **An empty diagram is still a diagram.** A gantt with no tasks or a quadrant chart with no points becomes a figure with nothing in it, and a reader who reaches it is told it has nothing to describe yet rather than hearing nothing.
- **Generated ids are not read out.** A git commit Mermaid named itself is announced by its message or its place in the history.

## Code Examples

### Stable chart types

#### Pie

```html
<pre class="mermaid">
pie title Pets adopted by volunteers
  "Dogs" : 386
  "Cats" : 85
  "Rabbits" : 42
</pre>
```

Left and right walk the slices; each announces its value and its share of the whole.

#### XY chart (bar and line)

```html
<pre class="mermaid">
xychart-beta
  title "Sales revenue"
  x-axis [jan, feb, mar, apr]
  y-axis "Revenue (in $)" 4000 --> 11000
  bar [5000, 6000, 7500, 8200]
  line [5000, 6000, 7500, 8200]
</pre>
```

The bars and the line are two layers; Page Up and Page Down switch between them.

#### User journey

```html
<pre class="mermaid">
journey
  title My working day
  section Go to work
    Make tea: 5: Me
    Do work: 1: Me, Cat
</pre>
```

Each task is announced with its score, the mood Mermaid draws it with, who takes part and its section: `Task is Do work (Me, Cat), Score is 1, unhappy, Section is Go to work`. The tasks are one line, so right arrow runs on from the last task of a section to the first of the next, and every score is sounded on the same scale.

#### Quadrant chart

```html
<pre class="mermaid">
quadrantChart
  x-axis Low Reach --> High Reach
  y-axis Low Engagement --> High Engagement
  quadrant-1 We should expand
  Campaign A: [0.3, 0.6]
  Campaign B: [0.45, 0.23]
</pre>
```

#### Wardley map

```html
<pre class="mermaid">
wardley-beta
title Tea shop
anchor Business [0.95, 0.63]
component Tea [0.63, 0.81]
component Kettle [0.43, 0.35]
Business -> Tea
Tea -> Kettle
evolve Kettle 0.62
</pre>
```

The first layer places each component by evolution and visibility, each named with its notes in parentheses ("Kettle (evolving to 0.62)", "Business (anchor)"); Page Up reaches the second, the value chain read along its dependencies, and Page Down returns to the first. Both layers draw the same components, so a switch either way keeps the reader on the component they were on. Two components at one evolution share a column of the map, which reads both and names neither: a switch from that column lands on the upper one in the value chain, and a switch back from either lands on its own visibility, a row that names it, unless a third component shares that too.

### Experimental chart types

#### Flowchart [experimental]

```html
<pre class="mermaid">
flowchart LR
  order[Order received] --> stock{In stock?}
  stock -->|yes| pack[Pack items]
  stock -->|no| back[Back-order]
  back --> stock
</pre>
```

Left and right walk the steps in flow order. Each step names what it comes from and leads to, with the arrows' labels: `Step is In stock?, From is Order received, Back-order, To is Pack items (yes), Back-order (no), Shape is decision`. The rotor's **Outputs** and **Inputs** follow the arrows themselves.

#### Sequence diagram [experimental]

```html
<pre class="mermaid">
sequenceDiagram
  autonumber
  actor U as User
  participant W as Web app
  U->>W: Log in
  loop Until the password matches
    W->>W: Check password
  end
  W-->>U: Welcome
</pre>
```

Left and right walk the messages in time: `Message is Log in, Route is User to Web app, Number is 1`. Down moves onto each participant's lifeline, where left and right walk only that participant's messages, and the cursor keeps the moment the reader was at. The rotor's **Fragments** unit jumps to where the next loop or alternative opens or closes.

#### Class diagram [experimental]

```html
<pre class="mermaid">
classDiagram
  Animal <|-- Duck
  Animal : +int age
  class Duck {
    +swim()
  }
</pre>
```

`Class is Duck, To is Animal (inherits from), Methods is public swim()`.

#### State diagram [experimental]

```html
<pre class="mermaid">
stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Idle : stop
</pre>
```

#### Entity relationship diagram [experimental]

```html
<pre class="mermaid">
erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    string name PK
  }
</pre>
```

`Entity is CUSTOMER, To is ORDER (places, exactly one to zero or more), Attributes is string name PK`.

#### Gantt chart [experimental]

```html
<pre class="mermaid">
gantt
  dateFormat YYYY-MM-DD
  section Design
    Research  :done, r1, 2026-01-05, 10d
    Prototype :active, after r1, 15d
</pre>
```

`Section is Design, Research (done), Date is 1/5/2026 through 1/15/2026, Length is 10 days`. Down moves to the next section, drawn below, and Up back; left and right walk a section's tasks. A packet diagram reads the same way, a row of bits at a time.

#### Mindmap [experimental]

```html
<pre class="mermaid">
mindmap
  root((Accessible charts))
    Audio
    Braille
</pre>
```

Down moves from a topic to its first branch and up back to its parent.

#### Venn diagram [experimental]

```html
<pre class="mermaid">
venn-beta
  set A["Frontend"]:20
  set B["Backend"]:12
  union A,B["Full stack"]:5
</pre>
```

The first row is the sets; down goes into the overlaps a set is part of: `Region is Frontend and Backend, Size is 5, Name is Full stack, Share of its smallest set is 41.7%`.

Every other diagram type has a runnable page under [Examples](#examples).

## Highlighting

The highlight outlines the shape Mermaid drew for the point the reader is on: a flowchart's node, a sequence diagram's arrow or note, a gantt task, a treemap's section or item, the face drawn at a journey task's score, a Venn region. A node, a note or a column is drawn as a group of shapes, and each of them is outlined in the highlight colour over the paint Mermaid's stylesheet gives it, with its fill and its label left as drawn; an arrow is drawn thicker. A gantt task, a packet field, a treemap section or item and a pie slice are each one shape, which is filled in the highlight colour, or for a light one a darker shade of its own; a label drawn on it that would not read on that fill is shown in black or white instead, or in high contrast mode in your light or dark colour, whichever reads better. On a scope -- a subgraph, a composite state, a block group, a boundary, an architecture group, a git branch or a swimlane lane -- every node inside it is outlined, since MAIDR derives a scope from its nodes rather than from the shape drawn round them. A Wardley map's components are outlined by the shape drawn at each one's place -- a component's dot, a market's ring, a pipeline's square, an anchor's label -- and its value chain by each node's whole drawing; a map with a pipeline that holds components, or where an anchor's label shares a row or a column with another node, reads its components without that outline, since a pipeline's square is placed by its corner and an anchor's label just above its node, so their marks would light the wrong row or column. Where a diagram's shapes cannot all be paired with what was read -- a railroad diagram's expressions are drawn as one path -- the diagram is read without a highlight, and every modality still works.

## High contrast

<kbd>C</kbd> repaints the diagram in the reader's high contrast colours (see [Modes](CONTROLS.md#modes)): what lies behind it takes the dark colour, and Mermaid's lines, text and coloured shapes take the light one. A node filled in a tint of the page, as a flowchart's are, goes dark inside an outline that goes light, so it reads as the same box drawn hollow. A box Mermaid fills and outlines in two tints of the page, as it draws a railroad diagram's terminals, keeps its outline in the light colour too; a grey frame drawn that way, such as an event model's swimlane, stays faint, as gridlines do. An outline Mermaid draws translucent, as it draws a block diagram's composite blocks, is drawn no fainter than a gridline, while a translucent fill keeps its own opacity. Each label takes whichever of the two colours reads on what lies under it; a label Mermaid draws across the edge of a shape, part on it and part off, as it can draw a C4 relationship's, takes the colour that reads on more of it, with a halo of the other round its letters. Where marks touch or overlap and only their colours told them apart -- a pie's slices, a radar's series drawn one over another -- each is filled with a pattern of its own, and each legend key with the pattern of the marks it stands for. An XY chart's bars stay light beside its line, and the line is cased in the dark colour, so it still reads where it crosses a bar. A sankey's links keep their own colours: each colour of a link's gradient is lightened, keeping its hue, until at the half opacity Mermaid draws the link it reads at better than 3:1 against the backdrop.

## Configuration Options

`createMaidrFromMermaid(mermaid, text, svg, options)`, `renderMermaid(mermaid, element, text?, options)` and `convertMermaidDiagram(diagram, svg, options)` take:

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | ID of the MAIDR figure. Defaults to the SVG's id. |
| `title` | `string` | Figure title. Defaults to the diagram's own title or front matter `title`. |
| `subtitle` | `string` | Figure subtitle. Defaults to a quadrant chart's quadrant names. |
| `caption` | `string` | Figure caption. Defaults to the diagram's `accDescr`. |

`bindMermaid(mermaid, selector = '.mermaid', root = document)` renders and binds every matching element and resolves to the figures it made. A diagram that fails to parse or convert is reported on the console and left as Mermaid drew it; the others are still bound.

`bindMermaid` can be called again, for instance after adding diagrams to the page, and touches only what it has not handled yet. A diagram it already bound is skipped. So is a diagram that failed: it is reported once, marked with a `data-maidr-mermaid-failed` attribute holding the text it failed on, and not rendered again until that text changes. To retry it with new text, set the element's `data-maidr-mermaid-source` attribute to the new text, or replace the element's text and remove that attribute.

`supportedMermaidDiagrams()` lists the Mermaid diagram type names the adapter reads.

## Limitations

- **Mermaid's diagram databases are internal.** The adapter reads them through guarded getters, so a Mermaid release that changes one degrades to fewer details rather than an error. The examples and the e2e spec are tested with Mermaid 12.2.0 and `@mermaid-js/mermaid-zenuml` 1.0.1, the versions `package-lock.json` pins. Because a breaking release would otherwise pass unnoticed, a scheduled job (`.github/workflows/mermaid-latest-check.yml`) runs the spec every week against the newest Mermaid and ZenUML plugin on npm and opens an issue naming the version when it fails.
- **A diagram must be rendered from its text.** Diagrams Mermaid already rendered with `startOnLoad` have lost their text; render them with `bindMermaid` instead. Quarto's `{mermaid}` cells are the exception: the adapter keeps their text before Quarto draws them (see [Quarto](#quarto)).
- **Scatter layers have braille only in grid navigation.** The quadrant chart and the Wardley map's components are `point` layers. A scatter's braille surface is its grid, a count of points per cell, so <kbd>B</kbd> shows it once the rotor (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>↑</kbd>) is on grid navigation; in the ordinary row and column navigation it reports that braille is not supported. The quadrant chart's grid is its four quadrants, and the Wardley map's cuts both axes into quarters, evolution into Mermaid's four default stages.
- **The SVG is trusted as Mermaid's own sanitizing left it.** `bindMermaid` writes what `mermaid.render()` returns into the page. Under Mermaid's default `securityLevel: 'strict'` that output is sanitized; under `'loose'` or `'antiscript'` it is not, so a diagram whose text comes from someone else should be rendered with `'strict'`.
- **ZenUML is read from its text.** Its plugin parses ZenUML itself and keeps nothing the adapter could read, so the adapter follows the documented grammar; a construct outside it is passed over rather than misread.

## Examples

One runnable page per diagram type, under [`examples/mermaid/`](https://github.com/xability/maidr/tree/main/examples/mermaid) and in the [examples gallery](examples.html): flowchart, sequence, ZenUML, class, state, ER, requirement, use case, C4, block, architecture, git graph, event model, swimlane, agent flow, mindmap, kanban, tree view, Ishikawa, timeline, railroad, Cynefin, pie, gantt, packet, quadrant, XY chart, radar, sankey, treemap, user journey, Venn and Wardley map.

## Keyboard Controls

Once a diagram is focused, use standard MAIDR keyboard shortcuts:

| Function | Key (Windows) | Key (Mac) |
|----------|--------------|-----------|
| Move between points | Arrow keys | Arrow keys |
| Open a scope, group or branch / close it | Down / Up Arrow | Down / Up Arrow |
| Change lifeline (sequence diagram) | Down / Up Arrow | Down / Up Arrow |
| Switch layers | Page Up / Page Down | Page Up / Page Down |
| Follow arrows or jump between fragments | Rotor (Alt + Shift + Up / Down), then Left / Right | Rotor (Option + Shift + Up / Down), then Left / Right |
| Toggle Sonification | S | S |
| Toggle Braille Mode | B | B |
| Toggle Text Mode | T | T |
| Toggle Review Mode | R | R |
| Description | D | D |

For the full list, see the [Keyboard Controls](CONTROLS.md) reference.

## API Documentation

For the complete TypeScript API reference, see the [API Documentation](api/index.html).
