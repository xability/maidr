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
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
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

interface Harness {
  service: HighContrastService;
  settings: SettingsService;
  bar: SVGElement;
}

function createHarness(): Harness {
  document.head.innerHTML = `<style>body { background-color: ${PAGE_BACKGROUND}; color: ${PAGE_FOREGROUND}; }</style>`;
  document.body.innerHTML = '';
  // The service writes to the body's inline style, which survives a change of
  // its children; clear it so each test starts from the stylesheet alone.
  document.body.removeAttribute('style');

  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('id', 'chart');
  const bar = document.createElementNS(SVG_NAMESPACE, 'rect');
  bar.setAttribute('fill', BAR_FILL);
  svg.appendChild(bar);
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

  return { service, settings, bar };
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
});
