import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { HighlightService } from '@service/highlight';
import type { ReviewService } from '@service/review';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';

export interface Command {
  execute: (event?: Event) => void;
}

export interface CommandContext {
  context: ContextService;

  audioService: AudioService;
  brailleService: BrailleService;
  reviewService: ReviewService;

  autoplayService: AutoplayService;
  highlightService: HighlightService;

  textViewModel: TextViewModel;
  helpViewModel: HelpViewModel;
  chatViewModel: ChatViewModel;
  settingsViewModel: SettingsViewModel;
}
