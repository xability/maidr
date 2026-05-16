import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { PlotState } from '@type/state';
import { AnnounceTitleCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { DEFAULT_SUBPLOT_TITLE } from '@model/abstract';

/**
 * Mock factory configuration for the title-related context surface.
 */
interface ContextOverrides {
  state: PlotState;
  figureTitle?: string;
  isMultiPanel?: boolean;
  authoredTitles?: string[];
}

/**
 * Creates a mock Context that mimics the title-related surface used by
 * AnnounceTitleCommand. `authoredTitles` lists the strings that should pass
 * the model's placeholder filter; any other value is treated as a placeholder.
 */
function createMockContext(overrides: ContextOverrides): Context {
  const authored = new Set(overrides.authoredTitles ?? []);
  return {
    state: overrides.state,
    figureTitle: overrides.figureTitle ?? DEFAULT_SUBPLOT_TITLE,
    isMultiPanel: overrides.isMultiPanel ?? false,
    isAuthoredTitle: (title: string) => authored.has(title),
  } as unknown as Context;
}

function createMockTextViewModel(): TextViewModel {
  return {
    update: jest.fn(),
  } as unknown as TextViewModel;
}

function createMockTextService(terse = false): TextService {
  return {
    isTerse: () => terse,
  } as unknown as TextService;
}

function createMockAudioService(): AudioService {
  return {
    playWarningToneIfEnabled: jest.fn(),
  } as unknown as AudioService;
}

function createMockDisplayService(): DisplayService {
  return {
    exitLabelScope: jest.fn(),
  } as unknown as DisplayService;
}

describe('AnnounceTitleCommand', () => {
  test('announces the authored figure title at figure-level scope', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'figure',
        title: 'My Authored Figure',
      } as unknown as PlotState,
      authoredTitles: ['My Authored Figure'],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Figure title is My Authored Figure',
    );
  });

  test('falls back to the authored layer title in single-panel figures', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'Basic Multiline Plot',
      } as unknown as PlotState,
      isMultiPanel: false,
      authoredTitles: ['Basic Multiline Plot'],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Title is Basic Multiline Plot',
    );
    // The authored layer title was found — no fallback warning tone.
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces "No title available" when neither figure nor layer title is authored', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'unavailable',
      } as unknown as PlotState,
      figureTitle: 'MAIDR Plot',
      isMultiPanel: false,
      authoredTitles: [],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('No title available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces "unavailable" in terse mode when no title is authored', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'unavailable',
      } as unknown as PlotState,
      figureTitle: 'MAIDR Plot',
      isMultiPanel: false,
      authoredTitles: [],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('unavailable');
  });

  test('labels the authored layer title as "Subplot title" in multi-panel figures', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'Layer One',
      } as unknown as PlotState,
      isMultiPanel: true,
      authoredTitles: ['Layer One'],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Subplot title is Layer One',
    );
  });

  test('falls back to the authored figure title when only the figure title is authored', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'unavailable',
      } as unknown as PlotState,
      figureTitle: 'My Authored Figure',
      isMultiPanel: false,
      authoredTitles: ['My Authored Figure'],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Title is My Authored Figure',
    );
  });

  test('labels the figure-title fallback as "Figure title" in multi-panel figures', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'unavailable',
      } as unknown as PlotState,
      figureTitle: 'My Authored Figure',
      isMultiPanel: true,
      authoredTitles: ['My Authored Figure'],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Figure title is My Authored Figure',
    );
  });

  test('announces "No title available" when the active state is empty', () => {
    const context = createMockContext({
      state: { empty: true, type: 'figure' } as unknown as PlotState,
      authoredTitles: [],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('No title available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces "No title available" for unexpected (subplot) state types', () => {
    const context = createMockContext({
      state: { empty: false, type: 'subplot' } as unknown as PlotState,
      authoredTitles: [],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('No title available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces "No title available" in multi-panel figures when neither layer nor figure title is authored', () => {
    const context = createMockContext({
      state: {
        empty: false,
        type: 'trace',
        title: 'unavailable',
      } as unknown as PlotState,
      figureTitle: 'MAIDR Plot',
      isMultiPanel: true,
      authoredTitles: [],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceTitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('No title available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });
});
