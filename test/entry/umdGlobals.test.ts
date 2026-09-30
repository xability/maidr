/**
 * The UMD build hands each entry an object that is already the page global
 * (`global.maidrApexCharts = {}`) and writes the remaining exports, among
 * them the `TraceType` and `Orientation` enums, onto it after the module body
 * has run. An entry that replaced the global in its body left those exports
 * on an object the page could no longer reach, so a script-tag consumer read
 * `maidrApexCharts.TraceType` as undefined. Each entry merges instead.
 */

import { describe, expect, it } from '@jest/globals';

// The Vega-Lite entry pulls in the React app to mount MAIDR; none of that is
// under test here and its ESM-only dependencies do not load under Jest.
jest.mock('@util/initMaidr', () => ({ initMaidrOnElement: jest.fn() }));

type Globals = Record<string, unknown>;

const ENTRIES: Array<[string, string]> = [
  ['maidrApexCharts', '../../src/apexcharts-entry'],
  ['maidrFrappe', '../../src/frappe-entry'],
  ['maidrGoogleCharts', '../../src/google-charts-entry'],
  ['maidrVegaLite', '../../src/vegalite-entry'],
];

describe.each(ENTRIES)('the %s global', (name, entry) => {
  it('keeps the object the UMD wrapper made it', () => {
    const umd: Globals = {};
    const saved = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { [name]: umd };
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line ts/no-require-imports -- a fresh load per window
        require(entry);
      });
      const page = (globalThis as unknown as { window: Globals }).window;

      // Still the wrapper's object, so the exports it writes next reach the
      // page, and the entry's own functions are on it as well.
      expect(page[name]).toBe(umd);
      expect(Object.keys(umd).length).toBeGreaterThan(1);
    } finally {
      (globalThis as { window?: unknown }).window = saved;
    }
  });
});

describe('the maidrVegaLite global', () => {
  it('keeps its debug toggle live after merging', () => {
    const umd: Globals = {};
    const saved = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { maidrVegaLite: umd };
    try {
      let setDebug: ((enabled: boolean) => void) | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line ts/no-require-imports -- a fresh load per window
        setDebug = require('../../src/vegalite-entry').setDebug;
      });
      expect(umd.debug).toBe(false);
      umd.debug = true;
      expect(umd.debug).toBe(true);
      setDebug!(false);
      expect(umd.debug).toBe(false);
    } finally {
      (globalThis as { window?: unknown }).window = saved;
    }
  });
});
