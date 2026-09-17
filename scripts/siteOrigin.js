/**
 * Where the built site will be served from.
 *
 * Every absolute URL the site build writes -- canonical links, Open Graph
 * tags, JSON-LD `@id`s, the sitemaps and robots.txt -- is derived from one
 * origin. It defaults to the production site and is overridden by the
 * `SITE_ORIGIN` environment variable, so a local preview, a staging deploy or
 * a fork's own domain can build a site whose metadata describes where it
 * actually is (#588):
 *
 *     npm run docs                                   # https://maidr.ai/
 *     SITE_ORIGIN=http://localhost:3000 npm run docs # a local preview
 *     SITE_ORIGIN=https://staging.example npm run docs
 *
 * Resolved once here and imported by `scripts/build-site.js`,
 * `scripts/typedoc-seo-plugin.mjs` and `scripts/add-navbar-to-typedoc.js`,
 * so the three cannot disagree about where the site lives.
 */

import process from 'node:process';

/** The origin the site is built for when `SITE_ORIGIN` is not set. */
export const DEFAULT_SITE_ORIGIN = 'https://maidr.ai';

/**
 * The site's base URL for `origin`, normalised to end in `/` so a path can be
 * appended to it directly. A path under the origin is kept, so a site served
 * from a subdirectory can name it; a query or fragment is dropped.
 *
 * An empty or blank `origin` means the default. Anything that is not an
 * absolute `http` or `https` URL is refused with an error naming the
 * variable, rather than being written into every page as a broken canonical.
 */
export function resolveSiteUrl(origin = process.env.SITE_ORIGIN) {
  const raw = (origin ?? '').trim() || DEFAULT_SITE_ORIGIN;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SITE_ORIGIN must be an absolute http(s) URL such as https://maidr.ai; got "${origin}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`SITE_ORIGIN must use http or https; got "${origin}"`);
  }
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

/** The base URL of the site being built, with a trailing slash. */
export const SITE_URL = resolveSiteUrl();

/** The base URL of the API reference, which TypeDoc writes under `api/`. */
export const API_URL = `${SITE_URL}api/`;
