import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { HighlightService } from '@service/highlight';
import type { SettingsService } from '@service/settings';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
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
  settingsService: SettingsService;

  brailleViewModel: BrailleViewModel;
  chatViewModel: ChatViewModel;
  helpViewModel: HelpViewModel;
  reviewViewModel: ReviewViewModel;
  settingsViewModel: SettingsViewModel;
  textViewModel: TextViewModel;
}
