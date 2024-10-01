import BrailleManager from '../manager/braille';
import {Command} from './command';
import KeyBinding from '../key_binding';
import TextManager from '../manager/text';
import AudioManager from '../manager/audio';

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

export class ToggleCommandScope implements Command {
  private keyBinding: KeyBinding;

  constructor(keyBinding: KeyBinding) {
    this.keyBinding = keyBinding;
  }

  execute(): void {
    if (this.keyBinding.scope === 'limited') {
      this.keyBinding.scope = 'default';
      console.log(`Scope updated to: ${this.keyBinding.scope}`);
      this.keyBinding.unregister();
      this.keyBinding.register();
    }
  }
}
