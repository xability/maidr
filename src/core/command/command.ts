import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Plot} from '../../plot/plot';
import TextManager from '../manager/text';

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  audio: AudioManager;
  text: TextManager;
  braille: BrailleManager;
  plot: Plot;
};
