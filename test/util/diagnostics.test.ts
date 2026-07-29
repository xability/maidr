import { describe, expect, it } from '@jest/globals';
import {
  classifyScriptOrigin,
  describeBrowser,
  describeMaidrSource,
  describeOperatingSystem,
  formatDiagnostics,
  isMaidrScriptUrl,
} from '@util/diagnostics';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.3485.14';
const OPERA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 OPR/124.0.0.0';
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
});
