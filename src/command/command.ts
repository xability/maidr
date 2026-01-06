import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { HighlightService } from '@service/highlight';
import type { MarkService } from '@service/mark';
import type { RotorNavigationService } from '@service/rotor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';

/**
 * Interface for command pattern implementation.
 */
export interface Command {
  /**
   * Executes the command.
   * @param {Event} [event] - Optional event that triggered the command.
   */
  execute: (event?: Event) => void;
}

/**
 * Context containing all services and view models required for command execution.
 */
export interface CommandContext {
  /** The application context. */
  context: Context;

  /** Audio service for managing sound playback. */
  audioService: AudioService;
  /** Autoplay service for automated navigation. */
  autoplayService: AutoplayService;
  /** Highlight service for visual highlighting. */
  highlightService: HighlightService;
  /** Rotor navigation service for alternative navigation. */
  rotorNavigationService: RotorNavigationService;

  /** Braille view model for braille display. */
  brailleViewModel: BrailleViewModel;
  /** Chat view model for chat interface. */
  chatViewModel: ChatViewModel;
  /** Command palette view model for command selection. */
  commandPaletteViewModel: CommandPaletteViewModel;
  /** Go to extrema view model for navigating to extrema points. */
  goToExtremaViewModel: GoToExtremaViewModel;
  /** Help view model for help interface. */
  helpViewModel: HelpViewModel;
  /** Review view model for review functionality. */
  reviewViewModel: ReviewViewModel;
  /** Settings view model for application settings. */
  settingsViewModel: SettingsViewModel;
  /** Text view model for text display. */
  textViewModel: TextViewModel;
  /** Rotor navigation view model for rotor interface. */
  rotorNavigationViewModel: RotorNavigationViewModel;
  /** Mark service for position bookmarking. */
  markService: MarkService;
}
