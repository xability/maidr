import { afterEach, describe, expect, it } from '@jest/globals';
import {
  classifyScriptOrigin,
  describeBrowser,
  describeMaidrSource,
  describeOperatingSystem,
  detectMaidrSource,
  formatDiagnostics,
  isMaidrScriptUrl,
  redactScriptUrl,
} from '@util/diagnostics';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.14';
const OPERA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/124.0.0.0';
const OPERA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/16.0.7.121091 Mobile/15E148 Safari/9537.53';
const OPERA_TOUCH = 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.101 Mobile Safari/537.36 OPT/2.6';
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15';
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const CHROMEOS = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('describeBrowser', () => {
  it('names Chrome with its major version', () => {
    expect(describeBrowser(CHROME)).toBe('Chrome 141');
  });

  it('names Firefox with its major version', () => {
    expect(describeBrowser(FIREFOX)).toBe('Firefox 133');
  });

  it('reads Safari from Version/, not the WebKit build in Safari/', () => {
    expect(describeBrowser(SAFARI)).toBe('Safari 18');
    expect(describeBrowser(SAFARI_IOS)).toBe('Safari 17');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(describeBrowser(EDGE)).toBe('Microsoft Edge 140');
  });

  it('prefers Opera over the Chrome token it also carries', () => {
    expect(describeBrowser(OPERA)).toBe('Opera 124');
  });

  it('recognises Opera under each of its per-platform tokens', () => {
    // OPR is the desktop/Android token; iOS sends OPiOS and Opera Touch sends
    // OPT, and both would otherwise fall through to Safari or Chrome.
    expect(describeBrowser(OPERA_IOS)).toBe('Opera 16');
    expect(describeBrowser(OPERA_TOUCH)).toBe('Opera 2');
  });

  it('prefers Samsung Internet over the Chrome token it also carries', () => {
    expect(describeBrowser(SAMSUNG)).toBe('Samsung Internet 27');
  });

  it('falls back to Unknown for an unrecognised agent', () => {
    expect(describeBrowser('some-crawler/1.0')).toBe('Unknown');
    expect(describeBrowser('')).toBe('Unknown');
  });
});

describe('describeOperatingSystem', () => {
  it('reports Windows 10 and 11 together, since the agent cannot tell them apart', () => {
    expect(describeOperatingSystem(EDGE)).toBe('Windows 10 or 11');
  });

  it('reports older Windows releases by their NT version', () => {
    expect(describeOperatingSystem('Mozilla/5.0 (Windows NT 6.1; Win64; x64)')).toBe(
      'Windows (NT 6.1)',
    );
  });

  it('names macOS without a version, which the agent freezes', () => {
    expect(describeOperatingSystem(SAFARI)).toBe('macOS');
  });

  it('names Linux', () => {
    expect(describeOperatingSystem(CHROME)).toBe('Linux');
  });

  it('prefers ChromeOS over the Linux token it also carries', () => {
    expect(describeOperatingSystem(CHROMEOS)).toBe('ChromeOS');
  });

  it('prefers Android over the Linux token it also carries', () => {
    expect(describeOperatingSystem(SAMSUNG)).toBe('Android 14');
  });

  it('names iOS with its version', () => {
    expect(describeOperatingSystem(SAFARI_IOS)).toBe('iOS 17.4');
  });

  it('reads iPadOS Safari as macOS, which its user agent cannot distinguish', () => {
    // Known limitation, pinned so it is a documented answer rather than a
    // surprise: iPadOS Safari's default agent claims Macintosh and carries no
    // iPad token at all.
    expect(
      describeOperatingSystem(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
      ),
    ).toBe('macOS');
  });

  it('falls back to Unknown for an unrecognised agent', () => {
    expect(describeOperatingSystem('some-crawler/1.0')).toBe('Unknown');
  });
});

describe('isMaidrScriptUrl', () => {
  it('matches the bundle filename, versioned or not', () => {
    expect(isMaidrScriptUrl('https://example.com/dist/maidr.js')).toBe(true);
    expect(isMaidrScriptUrl('https://example.com/maidr.mjs')).toBe(true);
    expect(isMaidrScriptUrl('https://example.com/maidr.min.js')).toBe(true);
    expect(isMaidrScriptUrl('https://example.com/lib/maidr-3.74.0.js')).toBe(true);
    expect(isMaidrScriptUrl('https://example.com/maidr.js?v=3')).toBe(true);
  });

  it('matches per-adapter bundles under a maidr package directory', () => {
    expect(
      isMaidrScriptUrl('https://cdn.jsdelivr.net/npm/maidr@latest/dist/recharts.mjs'),
    ).toBe(true);
    expect(
      isMaidrScriptUrl('https://cdn.jsdelivr.net/npm/maidr@3.74.0/dist/vegalite.js'),
    ).toBe(true);
    expect(isMaidrScriptUrl('/lib/maidr-3.74.0/maidr.js')).toBe(true);
    expect(isMaidrScriptUrl('/node_modules/maidr/dist/chartjs.js')).toBe(true);
  });

  it('does not match unrelated scripts whose name merely starts with maidr', () => {
    // The scan returns the first match in document order, so a false positive
    // here would shadow the real bundle.
    expect(isMaidrScriptUrl('https://example.com/maidrical.js')).toBe(false);
    expect(isMaidrScriptUrl('https://example.com/maidr-analytics/tracker.js')).toBe(false);
    expect(isMaidrScriptUrl('https://example.com/maidrify.js')).toBe(false);
    expect(isMaidrScriptUrl('https://example.com/vendor/analytics.js')).toBe(false);
  });

  it('does not match unrelated assets served under a bare /maidr/ path', () => {
    // The project's own docs and examples live at xability.github.io/maidr/,
    // so every asset there carries a /maidr/ segment.
    expect(
      isMaidrScriptUrl('https://xability.github.io/maidr/assets/javascripts/bundle.8f2a91c4.min.js'),
    ).toBe(false);
    // ...while the real bundle on that same host still matches, by filename.
    expect(isMaidrScriptUrl('https://xability.github.io/maidr/dist/maidr.js')).toBe(true);
  });

  it('accepts a bare maidr package directory only under npm or node_modules', () => {
    expect(isMaidrScriptUrl('https://cdn.jsdelivr.net/npm/maidr/dist/recharts.mjs')).toBe(true);
    expect(isMaidrScriptUrl('/node_modules/maidr/dist/chartjs.js')).toBe(true);
    // Known, deliberate miss: an unversioned unpkg path has neither marker, so
    // it reports unknown rather than risking the wrong script.
    expect(isMaidrScriptUrl('https://unpkg.com/maidr/dist/recharts.mjs')).toBe(false);
  });
});

describe('detectMaidrSource', () => {
  /**
   * `document.currentScript` is null under the node test environment, which is
   * exactly the module-script path where the URL is recovered by scanning the
   * document — so these stubs exercise the real fallback rather than a mock of
   * it.
   */
  function stubPage(scriptUrls: readonly string[], pageUrl: string): void {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { href: pageUrl } },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: { querySelectorAll: () => scriptUrls.map(src => ({ src })) },
      configurable: true,
      writable: true,
    });
  }

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('is not shadowed by an unrelated script that loads first', () => {
    // Regression guard: on the project's own GitHub Pages host every asset URL
    // contains /maidr/, and the docs bundle is emitted before the chart script.
    stubPage(
      [
        'https://xability.github.io/maidr/assets/javascripts/bundle.8f2a91c4.min.js',
        'https://xability.github.io/maidr/dist/maidr.js',
      ],
      'https://xability.github.io/maidr/examples/barplot.html',
    );

    expect(detectMaidrSource()).toEqual({
      kind: 'local',
      url: 'https://xability.github.io/maidr/dist/maidr.js',
    });
  });

  it('takes the first genuine match in document order', () => {
    stubPage(
      [
        'https://cdn.jsdelivr.net/npm/maidr@3.74.0/dist/maidr.js',
        'https://example.com/dist/maidr.js',
      ],
      'https://example.com/report.html',
    );

    expect(detectMaidrSource()).toEqual({
      kind: 'cdn',
      url: 'https://cdn.jsdelivr.net/npm/maidr@3.74.0/dist/maidr.js',
    });
  });

  it('reports unknown when no script can be attributed', () => {
    stubPage(
      ['https://example.com/vendor/analytics.js'],
      'https://example.com/report.html',
    );

    expect(detectMaidrSource()).toEqual({ kind: 'unknown', url: null });
  });

  it('reports unknown outside a browser', () => {
    expect(detectMaidrSource()).toEqual({ kind: 'unknown', url: null });
  });
});

describe('classifyScriptOrigin', () => {
  it('treats a script from the page origin as local', () => {
    expect(
      classifyScriptOrigin(
        'https://example.com/lib/maidr-3.74.0/maidr.js',
        'https://example.com/report.html',
      ),
    ).toBe('local');
  });

  it('treats a script from another origin as CDN', () => {
    expect(
      classifyScriptOrigin(
        'https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js',
        'https://example.com/report.html',
      ),
    ).toBe('cdn');
  });

  it('distinguishes ports and schemes on the same host', () => {
    expect(
      classifyScriptOrigin('http://localhost:8080/maidr.js', 'http://localhost:3000/index.html'),
    ).toBe('cdn');
    expect(
      classifyScriptOrigin('http://example.com/maidr.js', 'https://example.com/index.html'),
    ).toBe('cdn');
  });

  it('treats a bundle sitting next to a file:// page as local', () => {
    // Both file:// URLs report an opaque "null" origin, so this can only be
    // decided on the protocol.
    expect(
      classifyScriptOrigin('file:///home/user/dist/maidr.js', 'file:///home/user/chart.html'),
    ).toBe('local');
  });

  it('treats a remote bundle on a file:// page as CDN', () => {
    expect(
      classifyScriptOrigin(
        'https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js',
        'file:///home/user/chart.html',
      ),
    ).toBe('cdn');
  });

  it('returns unknown when a URL cannot be parsed', () => {
    expect(classifyScriptOrigin('not a url', 'https://example.com')).toBe('unknown');
    expect(classifyScriptOrigin('https://example.com/maidr.js', 'not a url')).toBe('unknown');
  });
});

describe('describeMaidrSource', () => {
  it('labels every source kind', () => {
    expect(describeMaidrSource({ kind: 'cdn', url: 'https://cdn.example/maidr.js' })).toBe('CDN');
    expect(describeMaidrSource({ kind: 'local', url: '/maidr.js' })).toBe('Local assets');
    expect(describeMaidrSource({ kind: 'inline', url: null })).toBe('Embedded in the page');
    expect(describeMaidrSource({ kind: 'unknown', url: null })).toBe('Unknown');
  });
});

describe('redactScriptUrl', () => {
  it('keeps the origin and path of a hosted bundle', () => {
    expect(
      redactScriptUrl('https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js'),
    ).toBe('https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js');
  });

  it('drops the query and fragment, where a signed URL carries its token', () => {
    expect(redactScriptUrl('https://cdn.example/maidr.js?token=s3cret#frag')).toBe(
      'https://cdn.example/maidr.js',
    );
  });

  it('reduces a file:// bundle to its protocol and filename', () => {
    // The directory is the reporter's home directory, so it carries their OS
    // username — and this value is both displayed and copied.
    expect(redactScriptUrl('file:///Users/jane.doe/reports/dist/maidr.js')).toBe(
      'file:///.../maidr.js',
    );
  });

  it('returns null for a URL it cannot parse', () => {
    expect(redactScriptUrl('not a url')).toBeNull();
  });

  it('returns null for a file:// URL with no filename to keep', () => {
    // Degrades to the bare "Local assets" label rather than inventing a path.
    // Unreachable from a script that actually executed, but the redaction has
    // to fail closed rather than fall through to the unredacted URL.
    expect(redactScriptUrl('file:///Users/jane.doe/dist/')).toBeNull();
  });
});

describe('formatDiagnostics', () => {
  const diagnostics = {
    version: '3.74.0',
    browser: 'Chrome 141',
    operatingSystem: 'Linux',
    source: {
      kind: 'cdn' as const,
      url: 'https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js',
    },
    userAgent: CHROME,
  };

  it('reports every field on its own line', () => {
    expect(formatDiagnostics(diagnostics)).toBe(
      [
        'MAIDR diagnostics',
        'maidr.js version: 3.74.0',
        'Loaded from: CDN (https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js)',
        'Browser: Chrome 141',
        'Operating system: Linux',
        `User agent: ${CHROME}`,
      ].join('\n'),
    );
  });

  it('omits the URL when the source has none', () => {
    const report = formatDiagnostics({
      ...diagnostics,
      source: { kind: 'inline', url: null },
    });
    const loadedFrom = report
      .split('\n')
      .find(line => line.startsWith('Loaded from:'));
    expect(loadedFrom).toBe('Loaded from: Embedded in the page');
  });

  it('leaves the page URL out, which can carry private paths or tokens', () => {
    expect(formatDiagnostics(diagnostics)).not.toContain('report.html');
  });

  it('keeps the origin and path of a hosted bundle, which is the diagnostic part', () => {
    // A jsDelivr @latest against a pinned local copy is exactly the mismatch
    // this field exists to expose, so the path has to survive.
    expect(formatDiagnostics(diagnostics)).toContain(
      'Loaded from: CDN (https://cdn.jsdelivr.net/npm/maidr@latest/dist/maidr.js)',
    );
  });

  it('strips the query and fragment, which can carry signed-URL tokens', () => {
    const report = formatDiagnostics({
      ...diagnostics,
      source: { kind: 'cdn', url: 'https://cdn.example/maidr.js?token=s3cret#frag' },
    });
    expect(report).toContain('Loaded from: CDN (https://cdn.example/maidr.js)');
    expect(report).not.toContain('s3cret');
    expect(report).not.toContain('frag');
  });

  it('redacts the directory of a file:// bundle, which carries the OS username', () => {
    const report = formatDiagnostics({
      ...diagnostics,
      source: { kind: 'local', url: 'file:///Users/jane.doe/reports/dist/maidr.js' },
    });
    expect(report).toContain('Loaded from: Local assets (file:///.../maidr.js)');
    // The filename still says which bundle; the home directory does not travel.
    expect(report).not.toContain('jane.doe');
    expect(report).not.toContain('reports');
  });
});
