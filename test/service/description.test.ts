import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { PlotState, SubplotSummary } from '@type/state';
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
  authored?: string[];
  subplotSummaries?: SubplotSummary[];
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
    isAuthoredTitle: (value: string) => authored.has(value),
    isAuthoredSubtitle: (value: string) => authored.has(value),
    isAuthoredCaption: (value: string) => authored.has(value),
    getSubplotSummaries: () => overrides.subplotSummaries ?? [],
  } as unknown as Context;
}

function createMockDisplayService(): DisplayService {
  return {
    toggleFocus: jest.fn(),
  } as unknown as DisplayService;
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

    const service = new DescriptionService(context, createMockDisplayService());
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.chartType).toBe('Multi-panel figure');
    expect(description!.title).toBe('My Figure');
    expect(description!.axes).toEqual({});
    expect(description!.dataTable).toEqual({ headers: [], rows: [] });
    expect(description!.subplots).toEqual(subplots);
    expect(description!.stats).toEqual([{ label: 'Subplots', value: 2 }]);
  });

  test('includes authored subtitle and caption as stats', () => {
    const context = createMockContext({
      state: figureState(3),
      figureSubtitle: 'A subtitle',
      figureCaption: 'A caption',
      authored: ['A subtitle', 'A caption'],
    });

    const service = new DescriptionService(context, createMockDisplayService());
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.stats).toEqual([
      { label: 'Subplots', value: 3 },
      { label: 'Subtitle', value: 'A subtitle' },
      { label: 'Caption', value: 'A caption' },
    ]);
  });

  test('omits unauthored title, subtitle, and caption', () => {
    const context = createMockContext({
      state: figureState(4),
      figureTitle: 'MAIDR Plot',
      figureSubtitle: 'unavailable',
      figureCaption: 'unavailable',
      authored: [],
    });

    const service = new DescriptionService(context, createMockDisplayService());
    const description = service.getDescription();

    expect(description).not.toBeNull();
    expect(description!.title).toBe('');
    expect(description!.stats).toEqual([{ label: 'Subplots', value: 4 }]);
  });

  test('returns null for an empty figure state', () => {
    const context = createMockContext({
      state: { empty: true, type: 'figure' } as unknown as PlotState,
    });

    const service = new DescriptionService(context, createMockDisplayService());

    expect(service.getDescription()).toBeNull();
  });
});
