import { MAIDR_VERSION } from './version';

/**
 * Where the running maidr.js bundle was loaded from.
 *
 * - `cdn` — served by an origin other than the page's (jsDelivr, unpkg, or any
 *   other asset host).
 * - `local` — served by the page's own origin, or read off the filesystem
 *   alongside a `file://` page.
 * - `inline` — embedded directly in the page rather than fetched.
 * - `unknown` — no script tag could be attributed to maidr.js, which is what
 *   happens when the bundle is rolled into a host application's own chunk.
 */
export type MaidrSourceKind = 'cdn' | 'local' | 'inline' | 'unknown';

export interface MaidrSource {
  readonly kind: MaidrSourceKind;
  /** Absolute URL of the script that loaded maidr.js, when one is known. */
  readonly url: string | null;
}

export interface Diagnostics {
  readonly version: string;
  readonly browser: string;
  readonly operatingSystem: string;
  readonly source: MaidrSource;
  readonly userAgent: string;
}

/**
 * The `<script>` element that was executing while this module was evaluated.
 *
 * `document.currentScript` is only meaningful during that first synchronous
 * run, so it is snapshotted here instead of read on demand. Classic scripts —
 * including the ones py-maidr and r-maidr inject, whether they point at the CDN
 * or at a bundled copy — report the tag that loaded maidr.js. Module scripts
 * report `null`, which the DOM scan in `findMaidrScript` covers.
 */
const loadingScript: HTMLScriptElement | null
  = typeof document !== 'undefined' && document.currentScript instanceof HTMLScriptElement
    ? document.currentScript
    : null;

/**
 * Matches the paths the library is published under.
 *
 * Two alternatives, both deliberately narrow so an unrelated script whose name
 * merely starts with "maidr" is not mistaken for the bundle:
 * - A maidr package directory, which is what catches the per-adapter bundles
 *   (`recharts.mjs`, `vegalite.js`, …) under `/npm/maidr@3.74.0/dist/`. A `@`
 *   may be followed by any npm version spec, but a `-` has to be followed by a
 *   digit, so `/maidr-3.74.0/` matches while `/maidr-analytics/` does not.
 * - The bundle's own filename, where anything after "maidr" must start at a
 *   separator — otherwise `maidrical.js` would match. The separator class and
 *   the segment class are kept disjoint (`\w` excludes `.` and `-`) so the
 *   repetition cannot reach itself and backtrack super-linearly.
 */
const MAIDR_SCRIPT_PATTERN = /\/maidr(?:@[\w.-]+|-\d[\w.-]*)?\/|(?:^|\/)maidr(?:[.-]\w+)*\.m?js(?:$|[?#])/i;

// Order matters: Edge, Opera and Samsung Internet all keep "Chrome" in their
// user agent, so each has to be matched before Chrome itself.
const BROWSER_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'Microsoft Edge', pattern: /Edg(?:e|A|iOS)?\/(\d+)/ },
  { name: 'Opera', pattern: /OPR\/(\d+)/ },
  { name: 'Samsung Internet', pattern: /SamsungBrowser\/(\d+)/ },
  { name: 'Firefox', pattern: /(?:Firefox|FxiOS)\/(\d+)/ },
  { name: 'Chrome', pattern: /(?:Chrome|CriOS)\/(\d+)/ },
  // Safari puts the WebKit build number in `Safari/` and its own release in
  // `Version/`, so the latter is the one worth reporting.
  { name: 'Safari', pattern: /Version\/(\d+)(?:\.\d+)*\s+(?:Mobile\/\S+\s+)?Safari\// },
];

/**
 * Names the browser behind a user agent string, with its major version.
 * @param userAgent - The `navigator.userAgent` value to read.
 * @returns A label such as `Chrome 141`, or `Unknown` when nothing matches.
 */
export function describeBrowser(userAgent: string): string {
  for (const { name, pattern } of BROWSER_PATTERNS) {
    const match = pattern.exec(userAgent);
    if (match) {
      return `${name} ${match[1]}`;
    }
  }
  return 'Unknown';
}

/**
 * Names the operating system behind a user agent string.
 *
 * Only what the user agent can actually support is reported: Windows 10 and 11
 * are indistinguishable there, and Safari/Chrome freeze the macOS version at
 * 10.15.7, so neither is given a version it cannot back up.
 * @param userAgent - The `navigator.userAgent` value to read.
 * @returns A label such as `macOS` or `Android 14`, or `Unknown`.
 */
export function describeOperatingSystem(userAgent: string): string {
  const windows = /Windows NT ([\d.]+)/.exec(userAgent);
  if (windows) {
    return windows[1] === '10.0' ? 'Windows 10 or 11' : `Windows (NT ${windows[1]})`;
  }
  // ChromeOS and Android both carry "Linux" in their user agent, so they have
  // to be matched before the bare Linux check below.
  if (userAgent.includes('CrOS')) {
    return 'ChromeOS';
  }
  const android = /Android ([\d.]+)/.exec(userAgent);
  if (android) {
    return `Android ${android[1]}`;
  }
  if (userAgent.includes('Android')) {
    return 'Android';
  }
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    const ios = /OS ([\d_]+) like Mac OS X/.exec(userAgent);
    return ios ? `iOS ${ios[1].replace(/_/g, '.')}` : 'iOS';
  }
  if (userAgent.includes('Mac OS X')) {
    return 'macOS';
  }
  if (userAgent.includes('Linux')) {
    return 'Linux';
  }
  return 'Unknown';
}

/**
 * Decides whether a script URL is served by the page's own origin or by a
 * separate host.
 * @param scriptUrl - Absolute URL of the script that loaded maidr.js.
 * @param pageUrl - Absolute URL of the page hosting the chart.
 * @returns `local`, `cdn`, or `unknown` when either URL cannot be parsed.
 */
export function classifyScriptOrigin(scriptUrl: string, pageUrl: string): MaidrSourceKind {
  let script: URL;
  let page: URL;
  try {
    script = new URL(scriptUrl);
    page = new URL(pageUrl);
  } catch {
    return 'unknown';
  }

  // Every `file://` URL reports its origin as the opaque string "null", so
  // comparing origins would call any pair of them same-origin. Compare the
  // protocol instead: a bundle read off the filesystem next to a `file://`
  // page — how py-maidr's saved HTML and the static examples load — is local.
  if (script.protocol === 'file:' || page.protocol === 'file:') {
    return script.protocol === page.protocol ? 'local' : 'cdn';
  }
  return script.origin === page.origin ? 'local' : 'cdn';
}

/**
 * Reports whether a script URL looks like a maidr bundle.
 * @param url - The script URL to test.
 * @returns True when the URL names a maidr package directory or bundle file.
 */
export function isMaidrScriptUrl(url: string): boolean {
  return MAIDR_SCRIPT_PATTERN.test(url);
}

/**
 * Finds the URL of the script that loaded maidr.js, falling back to a scan of
 * the document when the bundle was loaded as an ES module (module scripts do
 * not set `document.currentScript`).
 * @returns The script's absolute URL, or `null` if none can be attributed.
 */
function findMaidrScriptUrl(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');
  for (const script of scripts) {
    if (isMaidrScriptUrl(script.src)) {
      return script.src;
    }
  }
  return null;
}

/**
 * Reports where the running bundle came from.
 * @returns The source kind and, when known, the script URL behind it.
 */
export function detectMaidrSource(): MaidrSource {
  const pageUrl = typeof window === 'undefined' ? null : window.location.href;
  if (!pageUrl) {
    return { kind: 'unknown', url: null };
  }

  // A `<script>` with no `src` carries the bundle in its own body — that is how
  // a notebook cell or a self-contained HTML export ships maidr.js. Known gap:
  // this only recognises an inlined *classic* script, because per spec
  // `document.currentScript` is null while a module script evaluates. An
  // inlined `<script type="module">` therefore reports `unknown` rather than
  // `inline` — deliberately, since nothing distinguishes it at that point from
  // a bundle rolled into a host application's own chunk.
  const url = loadingScript ? loadingScript.src || null : findMaidrScriptUrl();
  if (!url) {
    return { kind: loadingScript ? 'inline' : 'unknown', url: null };
  }
  return { kind: classifyScriptOrigin(url, pageUrl), url };
}

/**
 * Renders a source as a short label for the settings dialog.
 * @param source - The detected bundle source.
 * @returns A label such as `CDN` or `Local assets`.
 */
export function describeMaidrSource(source: MaidrSource): string {
  switch (source.kind) {
    case 'cdn':
      return 'CDN';
    case 'local':
      return 'Local assets';
    case 'inline':
      return 'Embedded in the page';
    case 'unknown':
      return 'Unknown';
  }
}

/**
 * Collects everything the settings dialog reports about the running bundle and
 * the browser it is running in.
 * @returns The current diagnostics snapshot.
 */
export function collectDiagnostics(): Diagnostics {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return {
    version: MAIDR_VERSION,
    browser: describeBrowser(userAgent),
    operatingSystem: describeOperatingSystem(userAgent),
    source: detectMaidrSource(),
    userAgent,
  };
}

/**
 * Formats a diagnostics snapshot as the plain-text block copied to the
 * clipboard, ready to paste into a bug report.
 *
 * The page URL is deliberately left out: it is the one field here that can
 * carry private paths or credentials in a query string, and it tells a
 * maintainer nothing they cannot get from the report itself.
 * @param diagnostics - The snapshot to format.
 * @returns A newline-separated `key: value` block.
 */
export function formatDiagnostics(diagnostics: Diagnostics): string {
  const { version, browser, operatingSystem, source, userAgent } = diagnostics;
  const loadedFrom = source.url
    ? `${describeMaidrSource(source)} (${source.url})`
    : describeMaidrSource(source);

  return [
    'MAIDR diagnostics',
    `maidr.js version: ${version}`,
    `Loaded from: ${loadedFrom}`,
    `Browser: ${browser}`,
    `Operating system: ${operatingSystem}`,
    `User agent: ${userAgent}`,
  ].join('\n');
}
