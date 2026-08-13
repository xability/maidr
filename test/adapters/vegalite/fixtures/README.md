# Vega-Lite adapter fixtures

Every fixture here is a **frozen capture of real compiler output**, not a
hand-written approximation. That is deliberate: the adapter has to recover
per-layer data and series names from a compiled spec, and the shapes it
depends on (dataset numbering, mark-group nesting, how Altair stringifies a
filter) are not documented contracts. They can only be established by
looking at what the compiler actually emits.

The flip side is that a green test suite proves the adapter still handles
**these captures** — not that it still handles current Altair or Vega-Lite.
A version bump that changes any of the shapes below degrades silently to
"no name" or "fall back to guessing", which is the safe direction but is
invisible to these tests. Re-capture when bumping.

## Captured against

| tool      | version                      |
| --------- | ---------------------------- |
| vega      | 6.3.1                        |
| vega-lite | 6.4.x                        |
| altair    | 5.x (emits `$schema` v6.4.1) |

## What each fixture is for

| fixture                      | shape                                      | what it establishes                                                                                                                    |
| ---------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `altairLayeredDensity.ts`    | `transform_density` + `alt.layer(...)`     | the chart from #648. Three species in disjoint mass ranges, so a mis-assigned series differs by orders of magnitude rather than subtly |
| `layeredNonLine.ts`          | layered bar, layered histogram             | the mark lookup reaches every trace type, and compiled column names (`sum_v`, `bin_maxbins_10_n`, `__count`) survive it                |
| `facetedLayeredDensity.ts`   | the #648 chart inside a facet              | facet marks are nested per cell, so the mark lookup cannot serve them                                                                  |
| `facetedAsymmetricLayers.ts` | facet, only one layer filtered             | facets keep declaration order even when layers transform asymmetrically                                                                |
| `facetNoPipelineLayer.ts`    | facet, one layer reads the source directly | cell-scoped `data_N` leftovers pass a naive field check and the count guard; only facet-value coverage rejects them                    |
| `facetedThreeLayers.ts`      | three-layer facet                          | falls back, because only two layers keep a full-coverage pipeline                                                                      |
| `repeatLayeredLine.ts`       | `repeat` with a layered child              | repeat numbers layers in **reverse** (`layer_0` → `data_1`)                                                                            |
| `concatLayeredLine.ts`       | `hconcat` with layered children            | concat likewise reversed, and its layers are never merged                                                                              |
| `unreachableMarkDatasets.ts` | colour-encoded line, boxplot               | shapes whose mark datasets are unreachable and must keep working through the fallback                                                  |

`testView.ts` is not a capture — it is a `VegaView` stub that deliberately
reproduces Vega's awkward contract (`getState`'s `data` option is a
predicate, and its values are state descriptors rather than rows). Keep it
strict. A convenient stub previously hid two real bugs by accepting calls
that real Vega rejects.

## Re-capturing

There is no checked-in generator: each capture was a throwaway script. The
procedure is short, and the point is to run the **real** compiler rather
than hand-edit the JSON.

1. Install the tools outside the repo so they do not enter `package.json`
   (vega and vega-lite are not dependencies of MAIDR):

   ```bash
   mkdir /tmp/vlcap && cd /tmp/vlcap && npm init -y && npm install vega vega-lite
   # and, for the Altair-authored specs:
   python -m venv .venv && .venv/bin/pip install altair pandas
   ```

2. Produce the Vega-Lite spec. For the Altair-authored fixtures, build the
   chart in Python and `json.dump(chart.to_dict())`; the source Python for
   each is quoted in that fixture's header comment.

3. Compile it and dump the view state:

   ```js
   import * as vega from 'vega';
   import * as vl from 'vega-lite';

   const { spec: vgSpec } = vl.compile(vlSpec);
   const view = new vega.View(vega.parse(vgSpec), { renderer: 'none' });
   await view.runAsync();

   const datasets = {};
   // Names come from getState; ROWS must come from view.data(name) —
   // getState's values are state descriptors, not records.
   for (const name of Object.keys(view.getState({ data: () => true }).data ?? {})) {
     try {
       const rows = view.data(name);
       if (Array.isArray(rows) && rows.length)
         datasets[name] = rows.map(r => ({ ...r }));
     } catch { /* out of scope for this view */ }
   }
   ```

   For fixtures that exercise the mark lookup, also capture each mark
   dataset as `{ datum }` items:

   ```js
   datasets[markName] = view.data(markName).map(item => ({ datum: { ...item.datum } }));
   ```

4. Drop Altair's `config` and inline `datasets` blocks from the spec before
   writing it out — the adapter reads neither, and they are pure noise.

5. Re-run the suite. If a fixture's behaviour changed, that is the signal
   the compiler shape moved, and the adapter's assumptions need re-checking
   rather than the test being updated to match.
