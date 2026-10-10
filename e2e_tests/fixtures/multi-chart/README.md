# Pages with several charts

Driven by `e2e_tests/specs/multiChart.spec.ts`, which reads each chart on a page
with the others beside it and again alone, and expects the same reading. Every
page loads this repository's `dist/maidr.js`.

| Fixture                   | Charts | What makes it hard                                            |
| ------------------------- | ------ | ------------------------------------------------------------- |
| `r-ggplot2-dodged-twice`  | 2      | One r-maidr output twice: the same ids and the same selectors |
| `py-seaborn-dodged-twice` | 2      | One py-maidr output twice, likewise                           |
| `plotly-scatters`         | 2      | Plotly's selectors name no chart                              |
| `plotly-gauges`           | 2      | A gauge is drawn in a layer outside the chart's article       |
| `py-quarto-inline`        | 3      | A real Quarto page: panels counted and a background read      |

## How each was made

### `*-twice`

The binding fixture of the same name under `../bindings/`, with its chart's
`<svg>` repeated straight after it, then `npm run lint:fix`, which only indents
the copy:

```js
const html = fs.readFileSync('../bindings/r-ggplot2-dodged.html', 'utf8');
const start = html.indexOf('<svg');
const end = html.indexOf('</svg>', start) + '</svg>'.length;
fs.writeFileSync('r-ggplot2-dodged-twice.html', `${html.slice(0, end)}\n${html.slice(start, end)}${html.slice(end)}`);
```

### `plotly-*`

Written by hand: two `Plotly.newPlot` calls, which MAIDR finds and binds by
itself. They load plotly.js from its CDN, as the examples do; the spec serves
that request from the pinned `plotly.js-dist-min` devDependency.

### `py-quarto-inline`

`quarto render py-quarto-inline.qmd --to html` with Quarto 1.10.19 and
py-maidr after xability/py-maidr#896, which writes each chart into the page
rather than an iframe. Then the loader py-maidr writes into every chart was
pointed at this build:

```bash
sed -i 's#https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js#../../../dist/maidr.js#g' py-quarto-inline.html
```

The page is otherwise as Quarto wrote it. The libraries Quarto keeps beside it
in `py-quarto-inline_files/` are not carried, and the spec does not fetch the
jQuery and require.js it loads from a CDN, so two of Quarto's own scripts fail;
the spec expects exactly those two errors and no others.

````markdown
---
title: Three charts on one page
format: html
---

```{python}
#| include: false
import matplotlib.pyplot as plt
import maidr
maidr.set_use_cdn(True)
```

## A chart on a dark background

```{python}
with plt.style.context("dark_background"):
    fig, ax = plt.subplots(figsize=(5, 3.5))
    ax.bar(["a", "b", "c", "d"], [3, 1, 4, 2])
    ax.set_title("Dark bars")
    plt.show()
```

## A chart with two layers

```{python}
fig, ax = plt.subplots(figsize=(5, 3.5))
ax.bar(["a", "b", "c", "d"], [2, 4, 1, 3], label="Count")
ax.plot(["a", "b", "c", "d"], [2.5, 3, 2, 2.5], color="black", label="Trend")
ax.set_title("Bars and a line")
plt.show()
```

## Two panels with transparent axes

```{python}
fig, (top, bottom) = plt.subplots(2, 1, figsize=(5, 6))
top.bar(["x", "y", "z"], [5, 2, 3])
top.set_title("Top panel")
bottom.plot([1, 2, 3, 4], [1, 3, 2, 4])
bottom.set_title("Bottom panel")
for ax in (top, bottom):
    ax.set_facecolor("none")
fig.tight_layout()
plt.show()
```
````

The dark chart comes first on purpose. The two-panel figure's axes are
transparent, so the outline MAIDR draws round a panel is measured against the
figure's background, and the first figure background on the page is the dark
one.
