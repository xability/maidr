# Pages with an AMD loader

Pages that have an AMD `define` before maidr.js runs, driven by
`e2e_tests/specs/amdHost.spec.ts`. maidr.js and the locale packs used to be
UMD, and a UMD wrapper hands an entry with no exports to that `define` as an
anonymous module instead of running it: maidr never booted, a pack never
registered, and require.js threw "Mismatched anonymous define()" at the page's
next `require()`. Quarto puts require.js on every page a Jupyter render writes
HTML into. py-maidr's charts there run maidr.js through a `define` shim of
their own (`withoutAmd` in its `maidr/assets/inline.js`); a load without one,
such as maidr.js or a pack added to the page by hand, failed.

| Fixture            | The `define` on the page                                        |
| ------------------ | --------------------------------------------------------------- |
| `define-stub.html` | A stub that counts anonymous and named calls                    |
| `requirejs.html`   | require.js 2.3.6, laid out as Quarto lays it out                |
| `d3-require.html`  | d3-require, as Observable and Quarto `{ojs}` cells load modules |

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
