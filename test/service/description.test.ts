import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { FormatterService } from '@service/formatter';
import type { RotorNavigationService } from '@service/rotor';
import type { LayerSummary, PlotState, SubplotSummary } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { DescriptionService } from '@service/description';

/**
 * Mock configuration for the figure-level surface used by DescriptionService.
 */
interface ContextOverrides {
  state: PlotState;
  figureTitle?: string;
  figureSubtitle?: string;
  figureCaption?: string;
  figureXAxis?: string;
  figureYAxis?: string;
  authored?: string[];
  subplotSummaries?: SubplotSummary[];
  layerSummaries?: LayerSummary[];
}

/**
 * Creates a mock Context exposing only the surface DescriptionService touches
 * for the figure-level (multi-panel lobby) branch. `active` is a plain object
 * so it is never an AbstractTrace instance, forcing the figure branch.
 */
function createMockContext(overrides: ContextOverrides): Context {
  const authored = new Set(overrides.authored ?? []);
  return {
    active: { state: overrides.state },
    figureTitle: overrides.figureTitle ?? 'unavailable',
    figureSubtitle: overrides.figureSubtitle ?? 'unavailable',
    figureCaption: overrides.figureCaption ?? 'unavailable',
    figureXAxis: overrides.figureXAxis ?? '',
    figureYAxis: overrides.figureYAxis ?? '',
    isAuthoredTitle: (value: string) => authored.has(value),
    isAuthoredSubtitle: (value: string) => authored.has(value),
    isAuthoredCaption: (value: string) => authored.has(value),
    isAuthoredAxisLabel: (value: string) => value.trim() !== '',
    getSubplotSummaries: () => overrides.subplotSummaries ?? [],
    getLayerSummaries: () => overrides.layerSummaries ?? [],
    // The cheap accessor the service asks instead of building the whole
    // figure state to read one field off it.
    activeLevel: overrides.state.type,
  } as unknown as Context;
}

/**
 * The rotor surface `DescriptionService` touches: picking a layer hands the
 * rotor back to data mode while the outgoing layer is still active.
 */
function createMockRotorService(): RotorNavigationService {
  return { resetToDataMode: jest.fn() } as unknown as RotorNavigationService;
}

function createMockDisplayService(): DisplayService {
  return {
    toggleFocus: jest.fn(),
  } as unknown as DisplayService;
}

/**
 * The formatter surface `DescriptionService` touches. The figure-level branch
 * never reaches a layer's formats, so answering "nothing was authored" is the
 * whole contract here; `descriptionRounding.test.ts` drives a real
 * `FormatterService` for the branch that does.
 */
function createMockFormatterService(): FormatterService {
  return {
    hasAuthoredFormat: () => false,
    getFormatter: () => String,
  } as unknown as FormatterService;
}

function figureState(size: number): PlotState {
  return { empty: false, type: 'figure', size } as unknown as PlotState;
}

describe('descriptionService figure-level description', () => {
  test('summarizes a multi-panel figure when the active element is the figure', () => {
    const subplots: SubplotSummary[] = [
      { index: 1, title: 'Left', traceTypes: ['bar'], isActive: true },
      { index: 2, title: 'Right', traceTypes: ['line'], isActive: false },
    ];
    const context = createMockContext({
      state: figureState(2),
      figureTitle: 'My Figure',
      authored: ['My Figure'],
      subplotSummaries: subplots,
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.chartType).toBe('Multi-panel figure');
    expect(description!.title).toBe('My Figure');
    expect(description!.axes).toEqual({});
    expect(description!.dataTable).toEqual({ headers: [], rows: [] });
    expect(description!.subplots).toEqual(subplots);
    // Not the subplot count: the list the dialog renders is headed with that
    // already. Where the reader is standing, and what kinds of chart the
    // figure holds, are what the list cannot tell them.
    expect(description!.stats).toEqual([
      { label: 'Currently on', value: 'subplot 1 of 2' },
      { label: 'Chart types', value: 'bar, line' },
    ]);
  });

  test('includes authored subtitle and caption as stats', () => {
    const context = createMockContext({
      state: figureState(3),
      figureSubtitle: 'A subtitle',
      figureCaption: 'A caption',
      authored: ['A subtitle', 'A caption'],
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.stats).toEqual([
      { label: 'Subtitle', value: 'A subtitle' },
      { label: 'Caption', value: 'A caption' },
    ]);
  });

  test('surfaces authored figure-wide axes at the lobby', () => {
    const context = createMockContext({
      state: figureState(2),
      figureXAxis: 'Year',
      figureYAxis: 'Revenue',
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.axes).toEqual({ x: 'Year', y: 'Revenue' });
  });

  test('includes only the authored figure-wide axis when just one is set', () => {
    const context = createMockContext({
      state: figureState(2),
      figureXAxis: 'Year',
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.axes).toEqual({ x: 'Year' });
  });

  test('omits a figure-wide axis whose authored label is blank/whitespace', () => {
    // Mirrors the "blank label -> not available" handling tested for the
    // `l x` / `l y` commands: an authored-but-blank `axes.x.label: ""` is
    // filtered out of the `d` description modal too, via isAuthoredAxisLabel.
    const context = createMockContext({
      state: figureState(2),
      figureXAxis: '   ',
      figureYAxis: 'Revenue',
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.axes).toEqual({ y: 'Revenue' });
  });

  test('omits unauthored title, subtitle, and caption', () => {
    const context = createMockContext({
      state: figureState(4),
      figureTitle: 'MAIDR Plot',
      figureSubtitle: 'unavailable',
      figureCaption: 'unavailable',
      authored: [],
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.title).toBe('');
    // Nothing left to say: the subplot count is the heading of the list the
    // dialog renders, and this mock supplies no summaries to census.
    expect(description!.stats).toEqual([]);
  });

  // Documents the defensive null contract that DescriptionViewModel's guard
  // relies on. The stack never exposes a bare Subplot at runtime (a Subplot is
  // always pushed with a Trace on top — see Context.enterSubplot), so this
  // fabricates one via the mock.
  test('returns null when the active element is neither a trace nor the figure', () => {
    const context = createMockContext({
      state: { empty: false, type: 'subplot' } as unknown as PlotState,
    });

    const service = new DescriptionService(
      context,
      createMockDisplayService(),
      createMockRotorService(),
      createMockFormatterService(),
    );

    expect(service.getDescription()).toBeNull();
  });
});
