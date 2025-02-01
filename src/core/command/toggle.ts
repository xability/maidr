import hotkeys from 'hotkeys-js';

import {Plot} from '../interface';
import {AudioManager} from '../manager/audio';
import {BrailleManager} from '../manager/braille';
import {Scope} from '../manager/keymap';
import {ReviewManager} from '../manager/review';
import {TextManager} from '../manager/text';
import {Command} from './command';

export class ToggleBrailleCommand implements Command {
  private readonly plot: Plot;
  private readonly braille: BrailleManager;

  public constructor(plot: Plot, braille: BrailleManager) {
    this.plot = plot;
    this.braille = braille;
  }

  public execute(): void {
    this.braille.toggle(this.plot.state);
  }
}

export class ToggleTextCommand implements Command {
  private readonly text: TextManager;

  public constructor(text: TextManager) {
    this.text = text;
  }

  public execute(): void {
    this.text.toggle();
  }
}

export class ToggleAudioCommand implements Command {
  private readonly audio: AudioManager;

  public constructor(audio: AudioManager) {
    this.audio = audio;
  }

  public execute(): void {
    this.audio.toggle();
  }
}

export class ToggleReviewCommand implements Command {
  private readonly plot: Plot;
  private readonly review: ReviewManager;

  public constructor(plot: Plot, review: ReviewManager) {
    this.plot = plot;
    this.review = review;
  }

  public execute(): void {
    this.review.toggle(this.plot.state);
  }
}

export class SwitchScopeCommand implements Command {
  private readonly scopeName: Scope;

  public constructor(scopeName: Scope) {
    this.scopeName = scopeName;
  }

  public execute() {
    hotkeys.setScope(this.scopeName);
  }
}
