import {Plot} from "../../model/plot";
import {AudioService} from '../service/audio';
import {AutoplayService} from '../service/autoplay';
import {BrailleService} from '../service/braille';
import {ReviewService} from '../service/review';
import {TextService} from '../service/text';

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  plot: Plot;

  audio: AudioService;
  braille: BrailleService;
  text: TextService;
  review: ReviewService;

  autoplay: AutoplayService;
};
