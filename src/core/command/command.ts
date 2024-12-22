import AudioManager from '../manager/audio';
import AutoplayManager from '../manager/autoplay';
import BrailleManager from '../manager/braille';
import {Plot} from '../interface';
import TextManager from '../manager/text';
import FrontendManager from '../manager/frontend';

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  plot: Plot;

  audio: AudioManager;
  braille: BrailleManager;
  text: TextManager;

  autoplay: AutoplayManager;
  frontend: FrontendManager;
};
