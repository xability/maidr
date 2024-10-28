import AudioManager from "../manager/audio";
import BrailleManager from '../manager/braille';
import Command from './command';
import TextManager from '../manager/text';

export class ToggleBraille implements Command {
  private readonly braille: BrailleManager;

  constructor(braille: BrailleManager) {
    this.braille = braille;
  }

  public execute(): void {
    this.braille.toggle();
  }
}

export class ToggleText implements Command {
  private readonly text: TextManager;

  constructor(text: TextManager) {
    this.text = text;
  }

  public execute(): void {
    this.text.toggle();
  }
}

export class ToggleAudio implements Command {
  private readonly audio: AudioManager;

  constructor(audio: AudioManager) {
    this.audio = audio;
  }

  public execute(): void {
    this.audio.toggle();
  }
}
