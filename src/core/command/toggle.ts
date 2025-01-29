import hotkeys from 'hotkeys-js';
import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Command} from './command';
import {Plot} from '../interface';
import ReviewManager from '../manager/review';
import TextManager from '../manager/text';
import {Scope} from '../manager/keymap';

export class ToggleBrailleCommand implements Command {
  private readonly plot: Plot;
  private readonly braille: BrailleManager;

  constructor(plot: Plot, braille: BrailleManager) {
    this.plot = plot;
    this.braille = braille;
  }

  public execute(): void {
    this.braille.toggle(this.plot.state);
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

export class ToggleReviewCommand implements Command {
  private readonly plot: Plot;
  private readonly review: ReviewManager;

  constructor(plot: Plot, review: ReviewManager) {
    this.plot = plot;
    this.review = review;
  }

  public execute(): void {
    this.review.toggle(this.plot.state);
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
