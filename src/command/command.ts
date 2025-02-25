import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';
import type { Plot } from '@type/plot';

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
}
