import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { HighlightService } from '@service/highlight';
import type { NotificationService } from '@service/notification';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';

export interface Command {
  execute: (event?: Event) => void;
}

export interface CommandContext {
  context: ContextService;

  audio: AudioService;
  braille: BrailleService;
  text: TextService;
  review: ReviewService;

  notification: NotificationService;
  autoplay: AutoplayService;
  highlight: HighlightService;
}
