import AudioManager from '../manager/audio';
import TextManager from '../manager/text';
import BrailleManager from '../manager/braille';
import {Plot} from '../../model/plot';

export interface Command {
  execute(event?: Event): void;
}

export type CommandContext = {
  audio: AudioManager;
  text: TextManager;
  braille: BrailleManager;
  plot: Plot;
};
