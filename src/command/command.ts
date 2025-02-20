import type { Plot } from '@model/plot';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { HelpService } from '@service/help';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';

export interface Command {
  execute: (event?: Event) => void;
}

export interface CommandContext {
  plot: Plot;

  audio: AudioService;
  braille: BrailleService;
  text: TextService;
  review: ReviewService;

  autoplay: AutoplayService;
  help: HelpService;
}
