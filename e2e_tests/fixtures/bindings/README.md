# Language binding output

Real pages produced by r-maidr and py-maidr, driven by
`e2e_tests/specs/bindingOutput.spec.ts`. Each is the binding's output as it came
out, except for one line: the `<script src>` that loaded the binding's bundled
`maidr.js` now loads this repository's `dist/maidr.js`, so the spec asks what a
reader of that page gets from the build about to be released.

They are here because these producers are not in this repository and no other
test sees them. py-maidr loads the latest published maidr.js by default, so a
release reaches every installed copy of it the day it is published, whatever
py-maidr version wrote the page.

## The two kinds

- **`*-legacy-*`** pages carry the shapes the bindings emitted before they
  changed to match 4.x: a layer's selector inside a one-element list, and no
  `domMapping.order` on a segmented layer drawn as `<rect>`. Every py-maidr up
  to 1.24 still emits the list for a scatter. These pin the compatibility
  described under "Lists written for maidr.js before 4.0" in `docs/SCHEMA.md`.
- **The rest** are what the bindings emit today.

## Where each came from

| Fixture                          | Producer                             | Chart                                         |
| -------------------------------- | ------------------------------------ | --------------------------------------------- |
| `r-legacy-ggplot2-bar`           | r-maidr before xability/r-maidr#317  | `ggplot(mpg, aes(class)) + geom_bar()`        |
| `r-legacy-ggplot2-point`         | r-maidr before xability/r-maidr#317  | `ggplot(mtcars, aes(wt, mpg)) + geom_point()` |
| `r-legacy-ggplot2-pie`           | r-maidr before xability/r-maidr#317  | `geom_col()` + `coord_polar("y")`             |
| `r-legacy-base-stacked`          | r-maidr before xability/r-maidr#317  | `barplot(matrix)`                             |
| `py-legacy-seaborn-scatter`      | py-maidr 1.24.0                      | `sns.scatterplot()`                           |
| `py-legacy-matplotlib-eventplot` | py-maidr 1.24.0                      | `ax.eventplot()`                              |
| `r-ggplot2-dodged`               | r-maidr after xability/r-maidr#317   | `geom_col(position = "dodge")`                |
| `r-ggplot2-stacked`              | r-maidr after xability/r-maidr#317   | `geom_col(position = "stack")`                |
| `r-base-dodged`                  | r-maidr after xability/r-maidr#317   | `barplot(matrix, beside = TRUE)`              |
| `r-ggplot2-area`                 | r-maidr after xability/r-maidr#317   | `geom_area()`, a gridSVG `<polygon>` (#1273)  |
| `r-ggplot2-heat`                 | r-maidr 0.5.0                        | `geom_tile()`                                 |
| `py-seaborn-dodged`              | py-maidr after xability/py-maidr#807 | `sns.barplot(hue=)`                           |
| `py-matplotlib-line`             | py-maidr after xability/py-maidr#807 | `ax.plot()`                                   |
| `py-seaborn-heat`                | py-maidr after xability/py-maidr#807 | `sns.heatmap()`                               |

## Refreshing one

Render the chart with the binding, bundled rather than from the CDN, then point
its script at this repository's build:

```r
maidr::save_html(p, "r-ggplot2-dodged.html", use_cdn = FALSE)
```

```python
maidr.save_html(fig, file="py-seaborn-dodged.html", use_cdn=False)
```

```bash
sed -i 's#src="lib/maidr-[0-9.]*/maidr\.js"#src="../../../dist/maidr.js"#' r-ggplot2-dodged.html
```

Keep the legacy pages as they are: what they pin is that a shape producers
already shipped keeps working, and regenerating one with a current binding
would replace that shape with today's.
