import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { HighlightService } from '@service/highlight';
import { RotorNavigationService } from '@service/rotor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';

export interface Command {
  execute: (event?: Event) => void;
}

export interface CommandContext {
  context: Context;

  audioService: AudioService;
  autoplayService: AutoplayService;
  highlightService: HighlightService;
  rotorNavigationService: RotorNavigationService;

  brailleViewModel: BrailleViewModel;
  chatViewModel: ChatViewModel;
  commandPaletteViewModel: CommandPaletteViewModel;
  goToExtremaViewModel: GoToExtremaViewModel;
  helpViewModel: HelpViewModel;
  reviewViewModel: ReviewViewModel;
  settingsViewModel: SettingsViewModel;
  textViewModel: TextViewModel;
  rotorNavigationViewModel: RotorNavigationViewModel;
}
