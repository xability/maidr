import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { PlotState } from '@type/state';
import { AnnounceXCommand, AnnounceYCommand, AnnounceZCommand } from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { Scope } from '@type/event';

/**
 * Builds a figure-level PlotState (the multi-panel "figure lobby") whose active
 * subplot's active trace carries the given axis labels.
 */
function figureLobbyState(xAxis: string, yAxis: string, index = 2): PlotState {
  return {
    empty: false,
    type: 'figure',
    index,
    subplot: {
      empty: false,
      type: 'subplot',
      trace: { empty: false, type: 'trace', xAxis, yAxis },
    },
  } as unknown as PlotState;
}

interface ContextOverrides {
  figureXAxis?: string;
  figureYAxis?: string;
  scope?: Scope;
}

function createMockContext(state: PlotState, overrides: ContextOverrides = {}): Context {
  return {
    scope: overrides.scope ?? Scope.FIGURE_LABEL,
    state,
    figureXAxis: overrides.figureXAxis ?? '',
    figureYAxis: overrides.figureYAxis ?? '',
    isAuthoredAxisLabel: (label: string) => label.trim() !== '',
  } as unknown as Context;
}

function createMockTextViewModel(): TextViewModel {
  return { update: jest.fn() } as unknown as TextViewModel;
}

function createMockTextService(terse = false): TextService {
  return { isTerse: () => terse } as unknown as TextService;
}

function createMockAudioService(): AudioService {
  return { playWarningToneIfEnabled: jest.fn() } as unknown as AudioService;
}

function createMockDisplayService(): DisplayService {
  return { exitLabelScope: jest.fn() } as unknown as DisplayService;
}

describe('AnnounceXCommand at the figure lobby', () => {
  test('prefers an authored figure-wide X label over the subplot fallback', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceXCommand(
      createMockContext(figureLobbyState('Month', 'Sales'), { figureXAxis: 'Fiscal Year' }),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Figure X label is Fiscal Year');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('falls back to the focused subplot X label when no figure-wide label is authored', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceXCommand(
      createMockContext(figureLobbyState('Month', 'Sales')),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Subplot 2, X label is Month');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces just the value in terse mode (no subplot prefix)', () => {
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceXCommand(
      createMockContext(figureLobbyState('Month', 'Sales')),
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Month');
  });

  test('still announces the trace X label at trace level (single-panel)', () => {
    const textViewModel = createMockTextViewModel();
    const state = {
      empty: false,
      type: 'trace',
      xAxis: 'Year',
      yAxis: 'Count',
    } as unknown as PlotState;
    const command = new AnnounceXCommand(
      createMockContext(state, { scope: Scope.TRACE_LABEL }),
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('X label is Year');
  });

  test('falls back to "not available" when the active trace is empty', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const state = {
      empty: false,
      type: 'figure',
      subplot: {
        empty: false,
        type: 'subplot',
        trace: { empty: true, type: 'trace' },
      },
    } as unknown as PlotState;
    const command = new AnnounceXCommand(
      createMockContext(state),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('X label is not available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });
});

describe('AnnounceYCommand at the figure lobby', () => {
  test('prefers an authored figure-wide Y label over the subplot fallback', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceYCommand(
      createMockContext(figureLobbyState('Month', 'Sales'), { figureYAxis: 'Total Revenue' }),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Figure Y label is Total Revenue');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('falls back to the focused subplot Y label when no figure-wide label is authored', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceYCommand(
      createMockContext(figureLobbyState('Month', 'Sales')),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Subplot 2, Y label is Sales');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces just the value in terse mode (no subplot prefix)', () => {
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceYCommand(
      createMockContext(figureLobbyState('Month', 'Sales')),
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Sales');
  });

  test('still announces the trace Y label at trace level (single-panel)', () => {
    const textViewModel = createMockTextViewModel();
    const state = {
      empty: false,
      type: 'trace',
      xAxis: 'Year',
      yAxis: 'Count',
    } as unknown as PlotState;
    const command = new AnnounceYCommand(
      createMockContext(state, { scope: Scope.TRACE_LABEL }),
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Y label is Count');
  });

  test('falls back to "not available" when the active state is empty', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const state = { empty: true, type: 'figure' } as unknown as PlotState;
    const command = new AnnounceYCommand(
      createMockContext(state),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Y label is not available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });
});

describe('AnnounceZCommand at the figure lobby', () => {
  test('announces the active subplot trace Z label from figure-level state', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const state = {
      empty: false,
      type: 'figure',
      index: 2,
      subplot: {
        empty: false,
        type: 'subplot',
        trace: {
          empty: false,
          type: 'trace',
          text: { z: { label: 'Trend', value: 'up' } },
        },
      },
    } as unknown as PlotState;
    const command = new AnnounceZCommand(
      createMockContext(state),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Subplot 2, Z label is Trend');
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces just the value in terse mode (no subplot prefix)', () => {
    const textViewModel = createMockTextViewModel();
    const state = {
      empty: false,
      type: 'figure',
      index: 2,
      subplot: {
        empty: false,
        type: 'subplot',
        trace: {
          empty: false,
          type: 'trace',
          text: { z: { label: 'Trend', value: 'up' } },
        },
      },
    } as unknown as PlotState;
    const command = new AnnounceZCommand(
      createMockContext(state),
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Trend');
  });

  test('announces the trace Z label at trace level (single-panel)', () => {
    const textViewModel = createMockTextViewModel();
    const state = {
      empty: false,
      type: 'trace',
      text: { z: { label: 'Trend', value: 'up' } },
    } as unknown as PlotState;
    const command = new AnnounceZCommand(
      createMockContext(state, { scope: Scope.TRACE_LABEL }),
      textViewModel,
      createMockAudioService(),
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Z label is Trend');
  });

  test('falls back to "not available" when the active trace has no z data', () => {
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const state = {
      empty: false,
      type: 'figure',
      subplot: {
        empty: false,
        type: 'subplot',
        trace: { empty: false, type: 'trace', text: {} },
      },
    } as unknown as PlotState;
    const command = new AnnounceZCommand(
      createMockContext(state),
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('Z-axis is not available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });
});
