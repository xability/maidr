import {AudioManager} from '../manager/audio';
import {AutoplayManager} from '../manager/autoplay';
import {BrailleManager} from '../manager/braille';
import {Plot} from '../interface';
import {ReviewManager} from '../manager/review';
import {TextManager} from '../manager/text';

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  plot: Plot;

  audio: AudioManager;
  braille: BrailleManager;
  text: TextManager;
  review: ReviewManager;

  autoplay: AutoplayManager;
};
