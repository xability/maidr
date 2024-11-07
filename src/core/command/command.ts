import AudioManager from '../manager/audio';
import AutoplayManager from '../manager/autoplay';
import BrailleManager from '../manager/braille';
import {Plot} from '../interface';
import TextManager from '../manager/text';

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  plot: Plot;
  audio: AudioManager;
  text: TextManager;
  braille: BrailleManager;
  autoplay: AutoplayManager;
};
