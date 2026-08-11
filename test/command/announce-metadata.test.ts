import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { TextService } from '@service/text';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import {
  AnnounceCaptionCommand,
  AnnounceSubtitleCommand,
} from '@command/describe';
import { describe, expect, jest, test } from '@jest/globals';
import { DEFAULT_CAPTION, DEFAULT_SUBTITLE } from '@model/plot';

/**
 * Mock factory configuration for the metadata-related context surface.
 */
interface ContextOverrides {
  figureSubtitle?: string;
  figureCaption?: string;
  authoredSubtitles?: string[];
  authoredCaptions?: string[];
}

/**
 * Creates a mock Context exposing only the surface AnnounceSubtitleCommand
 * and AnnounceCaptionCommand need. `authoredSubtitles` / `authoredCaptions`
 * list the strings that should pass the model's placeholder filter; any
 * other value is treated as a placeholder default.
 */
function createMockContext(overrides: ContextOverrides = {}): Context {
  const authoredSub = new Set(overrides.authoredSubtitles ?? []);
  const authoredCap = new Set(overrides.authoredCaptions ?? []);
  return {
    figureSubtitle: overrides.figureSubtitle ?? DEFAULT_SUBTITLE,
    figureCaption: overrides.figureCaption ?? DEFAULT_CAPTION,
    isAuthoredSubtitle: (subtitle: string) => authoredSub.has(subtitle),
    isAuthoredCaption: (caption: string) => authoredCap.has(caption),
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

describe('AnnounceSubtitleCommand', () => {
  test('announces the authored subtitle verbosely', () => {
    const context = createMockContext({
      figureSubtitle: 'A descriptive subtitle',
      authoredSubtitles: ['A descriptive subtitle'],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceSubtitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Subtitle is A descriptive subtitle',
    );
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces just the value in terse mode', () => {
    const context = createMockContext({
      figureSubtitle: 'A descriptive subtitle',
      authoredSubtitles: ['A descriptive subtitle'],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceSubtitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('A descriptive subtitle');
  });

  test('announces "No subtitle available" verbosely when no subtitle is authored', () => {
    const context = createMockContext(); // defaults — nothing authored
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceSubtitleCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('No subtitle available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces "unavailable" in terse mode when no subtitle is authored', () => {
    const context = createMockContext();
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceSubtitleCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('unavailable');
  });
});

describe('AnnounceCaptionCommand', () => {
  test('announces the authored caption verbosely', () => {
    const context = createMockContext({
      figureCaption: 'A figure caption',
      authoredCaptions: ['A figure caption'],
    });
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceCaptionCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith(
      'Caption is A figure caption',
    );
    expect(audioService.playWarningToneIfEnabled).not.toHaveBeenCalled();
  });

  test('announces just the value in terse mode', () => {
    const context = createMockContext({
      figureCaption: 'A figure caption',
      authoredCaptions: ['A figure caption'],
    });
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceCaptionCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('A figure caption');
  });

  test('announces "No caption available" verbosely when no caption is authored', () => {
    const context = createMockContext();
    const textViewModel = createMockTextViewModel();
    const audioService = createMockAudioService();
    const command = new AnnounceCaptionCommand(
      context,
      textViewModel,
      audioService,
      createMockTextService(),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('No caption available');
    expect(audioService.playWarningToneIfEnabled).toHaveBeenCalled();
  });

  test('announces "unavailable" in terse mode when no caption is authored', () => {
    const context = createMockContext();
    const textViewModel = createMockTextViewModel();
    const command = new AnnounceCaptionCommand(
      context,
      textViewModel,
      createMockAudioService(),
      createMockTextService(true),
      createMockDisplayService(),
    );

    command.execute();

    expect(textViewModel.update).toHaveBeenCalledWith('unavailable');
  });
});
