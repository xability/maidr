import AudioManager from '../manager/audio';
import AutoplayManager from '../manager/autoplay';
import BrailleManager from '../manager/braille';
import TextManager from '../manager/text';
import {Plottable} from "../interface";

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  plot: Plottable;
  audio: AudioManager;
  text: TextManager;
  braille: BrailleManager;
  autoplay: AutoplayManager;
};
