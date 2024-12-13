import hotkeys from 'hotkeys-js';
import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Command} from './command';
import TextManager from '../manager/text';
import {Scope} from '../manager/keymap';
import ReviewManager from '../manager/review';

export class ToggleBrailleCommand implements Command {
  private readonly braille: BrailleManager;

  constructor(braille: BrailleManager) {
    this.braille = braille;
  }

  public execute(): void {
    this.braille.toggle();
  }
}

export class ToggleTextCommand implements Command {
  private readonly text: TextManager;

  constructor(text: TextManager) {
    this.text = text;
  }

  public execute(): void {
    this.text.toggle();
  }
}

export class ToggleAudioCommand implements Command {
  private readonly audio: AudioManager;

  constructor(audio: AudioManager) {
    this.audio = audio;
  }

  public execute(): void {
    this.audio.toggle();
  }
}

export class SwitchScopeCommand implements Command {
  private readonly scopeName: Scope;

  constructor(scopeName: Scope) {
    this.scopeName = scopeName;
  }

  public execute() {
    hotkeys.setScope(this.scopeName);
  }
}

export class ToggleReviewCommand implements Command {
  private readonly review: ReviewManager;

  constructor(review: ReviewManager) {
    this.review = review;
  }

  public execute(): void {
    this.review.toggle();
  }
}
