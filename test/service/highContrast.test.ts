/**
 * @jest-environment jsdom
 */

/**
 * Tests for `HighContrastService` in `src/service/highContrast.ts`.
 *
 * The service repaints the page and the chart, so the only thing that makes
 * it safe is the snapshot it restores from. Every path that re-takes that
 * snapshot has to run against the chart's own colours; taking it while high
 * contrast is painted records the service's own output as the page default
 * and there is no way back to the original appearance.
 */

import type { Context } from '@model/context';
import type { Figure } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { StorageService } from '@service/storage';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HighContrastService } from '@service/highContrast';
import { SettingsService } from '@service/settings';

// `jest-environment-jsdom` does not expose `structuredClone`, which
// `SettingsService` uses to clone the default settings.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const PAGE_BACKGROUND = 'rgb(250, 250, 250)';
const PAGE_FOREGROUND = 'rgb(17, 17, 17)';
const BAR_FILL = '#dddddd';

/**
 * A path long enough to trip the "complex path" test, which marks an element
 * as one that must not be given the background colour.
 */
const COMPLEX_PATH = `M 0 0 ${Array.from({ length: 40 }, (_, i) => `L ${i} ${i}`).join(' ')}`;

/**
 * Minimal stand-in for the 2D canvas context the service uses to normalise CSS
 * colours. jsdom has no canvas, and the real one is a boundary worth mocking
 * rather than reaching through: assigning an unparseable colour leaves
 * `fillStyle` at its previous value, which is what the service relies on.
 */
function installCanvasStub(): void {
  const toHex = (value: string): string | null => {
    const trimmed = value.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    const rgb = trimmed.match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/);
    if (rgb) {
      const channels = [rgb[1], rgb[2], rgb[3]]
        .map(channel => Number.parseInt(channel, 10).toString(16).padStart(2, '0'));
      return `#${channels.join('')}`;
    }
    return null;
  };

  class CanvasContextStub {
    private currentFillStyle = '#000000';

    public get fillStyle(): string {
      return this.currentFillStyle;
    }

    public set fillStyle(value: string) {
      const hex = toHex(value);
      if (hex !== null) {
        this.currentFillStyle = hex;
      }
    }
  }

  const stub = new CanvasContextStub();
  HTMLCanvasElement.prototype.getContext
    = (() => stub) as unknown as HTMLCanvasElement['getContext'];
}

function createStorage(): StorageService {
  const store = new Map<string, unknown>();
  return {
    save: <T>(key: string, value: T): void => {
      store.set(key, value);
    },
    load: <T>(key: string): T | null => (store.get(key) as T) ?? null,
    remove: (key: string): void => {
      store.delete(key);
    },
  };
}

/**
 * An empty figure. The service only walks it to decide which elements belong
 * to a trace, and these tests assert on the page and on chart colours that do
 * not depend on that classification.
 */
function createFigure(): Figure {
  const figure: Pick<Figure, 'subplots'> = { subplots: [] };
  return figure as unknown as Figure;
}

interface MarkSpec {
  fill: string;
  /** Draw the mark as a long `<path>`, which may not take the background colour. */
  complexPath?: boolean;
}

interface Harness {
  service: HighContrastService;
  settings: SettingsService;
  marks: SVGElement[];
  bar: SVGElement;
}

function createHarness(
  specs: MarkSpec[] = [{ fill: BAR_FILL }],
  inlineBodyBackground?: string,
): Harness {
  document.head.innerHTML = `<style>body { background-color: ${PAGE_BACKGROUND}; color: ${PAGE_FOREGROUND}; }</style>`;
  document.body.innerHTML = '';
  // The service writes to the body's inline style, which survives a change of
  // its children; clear it so each test starts from the stylesheet alone.
  document.body.removeAttribute('style');
  if (inlineBodyBackground !== undefined) {
    document.body.style.backgroundColor = inlineBodyBackground;
  }

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('id', 'chart');
  const marks = specs.map((spec) => {
    const mark = document.createElementNS(SVG_NAMESPACE, spec.complexPath ? 'path' : 'rect');
    if (spec.complexPath) {
      mark.setAttribute('d', COMPLEX_PATH);
    }
    mark.setAttribute('fill', spec.fill);
    mark.setAttribute('stroke', '#1f77b4');
    svg.appendChild(mark);
    return mark as SVGElement;
  });
  document.body.appendChild(svg);

  const display: Pick<DisplayService, 'plot'> = { plot: svg as unknown as HTMLElement };
  const displayService = display as unknown as DisplayService;

  const settings = new SettingsService(createStorage(), displayService);
  settings.saveSettings({
    ...settings.loadSettings(),
    general: { ...settings.loadSettings().general, highContrastMode: true },
  });

  const notification: Pick<NotificationService, 'notify'> = { notify: () => {} };

  const context: Pick<Context, 'id' | 'instructionContext'> = {
    id: 'chart',
    instructionContext: {} as Context['instructionContext'],
  };

  const service = new HighContrastService(
    settings,
    notification as unknown as NotificationService,
    displayService,
    createFigure(),
    context as unknown as Context,
  );

  return { service, settings, marks, bar: marks[0] };
}

function turnHighContrastOff(settings: SettingsService): void {
  settings.saveSettings({
    ...settings.loadSettings(),
    general: { ...settings.loadSettings().general, highContrastMode: false },
  });
}

describe('highContrastService', () => {
  let harness: Harness;

  beforeEach(() => {
    installCanvasStub();
    harness = createHarness();
  });

  afterEach(() => {
    harness.service.dispose();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  /** Replaces the default single-mark harness with one built for a test. */
  function rebuild(specs: MarkSpec[], inlineBodyBackground?: string): void {
    harness.service.dispose();
    harness = createHarness(specs, inlineBodyBackground);
  }

  it('recolours the page and the chart while high contrast is on', () => {
    harness.service.initializeHighContrast();

    expect(window.getComputedStyle(document.body).backgroundColor).toBe('rgb(0, 0, 0)');
    expect(harness.bar.getAttribute('fill')).not.toBe(BAR_FILL);
  });

  it('restores the page and the chart when high contrast is turned off', () => {
    harness.service.initializeHighContrast();

    turnHighContrastOff(harness.settings);

    expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
    expect(harness.bar.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('restores the page and the chart after a live update taken while high contrast is on', () => {
    harness.service.initializeHighContrast();

    harness.service.setFigure(createFigure());
    turnHighContrastOff(harness.settings);

    expect(window.getComputedStyle(document.body).backgroundColor).toBe(PAGE_BACKGROUND);
    expect(harness.bar.getAttribute('fill')).toBe(BAR_FILL);
  });

  it('keeps high contrast applied across a live update', () => {
    harness.service.initializeHighContrast();

    harness.service.setFigure(createFigure());

    expect(window.getComputedStyle(document.body).backgroundColor).toBe('rgb(0, 0, 0)');
    expect(harness.bar.getAttribute('fill')).not.toBe(BAR_FILL);
  });

  it('interpolates the colour ramp once per apply, not once per colour', () => {
    rebuild(Array.from({ length: 16 }, () => ({ fill: BAR_FILL })));
    const interpolate = jest.spyOn(harness.service, 'interpolateColors');

    harness.service.initializeHighContrast();

    expect(interpolate).toHaveBeenCalledTimes(1);
  });

  it('walks an element ancestry once per element, not once per captured colour', () => {
    // Every mark contributes a fill and a stroke, and the ancestor walk that
    // decides whether it is text was run for each of them and then again for
    // the glow filter.
    rebuild(Array.from({ length: 16 }, () => ({ fill: BAR_FILL })));
    const capturedColours = harness.marks.length * 2;
    const descriptor = Object.getOwnPropertyDescriptor(Node.prototype, 'parentElement');
    let ancestorReads = 0;
    Object.defineProperty(Node.prototype, 'parentElement', {
      configurable: true,
      get(this: Node) {
        ancestorReads++;
        return descriptor?.get?.call(this);
      },
    });

    try {
      harness.service.initializeHighContrast();
    } finally {
      if (descriptor) {
        Object.defineProperty(Node.prototype, 'parentElement', descriptor);
      }
    }

    expect(ancestorReads).toBeLessThan(capturedColours);
  });

  it('leaves no inline body colours behind once high contrast is turned off', () => {
    harness.service.initializeHighContrast();

    turnHighContrastOff(harness.settings);

    // An inline declaration outranks the page's own stylesheet, so leaving one
    // here would freeze the page at whatever it looked like on the way in --
    // a host theme toggle would stop changing the body.
    expect(document.body.style.backgroundColor).toBe('');
    expect(document.body.style.color).toBe('');
  });

  it('restores an inline body colour the page set for itself', () => {
    rebuild([{ fill: BAR_FILL }], 'rgb(200, 0, 0)');

    harness.service.initializeHighContrast();
    turnHighContrastOff(harness.settings);

    expect(document.body.style.backgroundColor).toBe('rgb(200, 0, 0)');
  });

  it('leaves the ramp intact for later marks when one may not take the background', () => {
    rebuild([{ fill: BAR_FILL, complexPath: true }, { fill: BAR_FILL }, { fill: BAR_FILL }]);

    harness.service.initializeHighContrast();

    const [complex, ...rest] = harness.marks.map(mark => mark.getAttribute('fill'));
    expect(complex).toBe('#ffffff');
    expect(rest).toEqual(['#000000', '#000000']);
  });
});
