# Pages with an AMD loader

Pages that have an AMD `define` before maidr's classic scripts run, driven by
`e2e_tests/specs/amdHost.spec.ts` (maidr.js and the locale packs) and
`e2e_tests/specs/amdAdapters.spec.ts` (the adapter bundles). All of them used
to be UMD, and a UMD wrapper hands the bundle to that `define` as an anonymous
module instead of running it: maidr never booted, a pack never registered, an
adapter's page global was never set, and require.js threw "Mismatched
anonymous define()" at the page's next `require()`. Quarto puts require.js on
every page a Jupyter render writes HTML into. py-maidr's charts there run
maidr.js through a `define` shim of their own (`withoutAmd` in its
`maidr/assets/inline.js`); a load without one, such as maidr.js or a pack
added to the page by hand, failed.

| Fixture                           | The `define` on the page, and what loads after it                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `define-stub.html`                | A stub that counts anonymous and named calls; maidr.js                                           |
| `requirejs.html`                  | require.js 2.3.6, laid out as Quarto lays it out; maidr.js                                       |
| `d3-require.html`                 | d3-require, as Observable and Quarto `{ojs}` cells load modules                                  |
| `adapters-requirejs.html`         | require.js; `observable.js`, `echarts.js` and `highcharts.js`                                    |
| `quarto-extension-requirejs.html` | require.js; `maidr.js` and `observable.js`, as maidr's Quarto extension writes them              |
| `requirejs-loads.html`            | require.js; nothing: the spec has require.js load the adapters, under a `paths` alias and by URL |

`require-later.js` is the page's own AMD code on the adapter pages, the next
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
