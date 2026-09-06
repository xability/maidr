/**
 * JSON for an inline `<script type="application/ld+json">`.
 *
 * A `<` inside a string value would let `</script>` end the block early, so
 * it is escaped. Every value the site puts in structured data is authored in
 * this repository today, but the two emitters (`build-site.js` and
 * `typedoc-seo-plugin.mjs`, the latter reading TypeDoc doc comments) should
 * not disagree on that.
 */

/** `value` as JSON safe to inline in a script tag, indented by `space`. */
export function inlineJson(value, space) {
  return JSON.stringify(value, null, space).replace(/</g, '\\u003c');
}
