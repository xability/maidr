# Pages with an AMD loader

Pages that have require.js before maidr's bundles run, driven by
`e2e_tests/specs/amdAdapters.spec.ts`. The adapter bundles used to be
rolldown's UMD, whose AMD branch hands the bundle to the page's `define` as an
anonymous module instead of running it: the page global was never set, and
require.js threw "Mismatched anonymous define()" at the page's next
`require()`. Quarto puts require.js on every page a Jupyter render writes HTML
into.

| Fixture                           | What loads after require.js                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `adapters-requirejs.html`         | `observable.js`, `echarts.js` and `highcharts.js`                                    |
| `quarto-extension-requirejs.html` | `maidr.js` and `observable.js`, as maidr's Quarto extension writes them              |
| `requirejs-loads.html`            | Nothing: the spec has require.js load the adapters, under a `paths` alias and by URL |

`require-later.js` is the page's own AMD code on each of them, the next
`require()` the spec runs.

## `require.min.js`

RequireJS 2.3.6 as jsDelivr serves it at
`https://cdn.jsdelivr.net/npm/requirejs@2.3.6/require.min.js`, byte for byte,
under the MIT license its header names. It is the copy Quarto loads: its
SHA-384 is the first `integrity` hash in the `<script>` tag Quarto writes
(`src/core/jupyter/widgets.ts` in quarto-dev/quarto-cli). Check it with

```bash
openssl dgst -sha384 -binary require.min.js | openssl base64 -A
# c9c+LnTbwQ3aujuU7ULEPVvgLs+Fn6fJUvIGTsuu1ZcCf11fiEubah0ttpca4ntM
```

It is vendored rather than fetched because the specs open these pages from
`file://` with no network.
