import hotkeys from 'hotkeys-js';

import {Plot} from "../../model/plot";
import {AudioService} from '../service/audio';
import {BrailleService} from '../service/braille';
import {Scope} from '../service/keymap';
import {ReviewService} from '../service/review';
import {TextService} from '../service/text';
import {Command} from './command';

export class ToggleBrailleCommand implements Command {
  private readonly plot: Plot;
  private readonly braille: BrailleService;

  public constructor(plot: Plot, braille: BrailleService) {
    this.plot = plot;
    this.braille = braille;
  }

  public execute(): void {
    this.braille.toggle(this.plot.state);
  }
}

export class ToggleTextCommand implements Command {
  private readonly text: TextService;

  public constructor(text: TextService) {
    this.text = text;
  }

  public execute(): void {
    this.text.toggle();
  }
}

export class ToggleAudioCommand implements Command {
  private readonly audio: AudioService;

  public constructor(audio: AudioService) {
    this.audio = audio;
  }

  public execute(): void {
    this.audio.toggle();
  }
}

export class ToggleReviewCommand implements Command {
  private readonly plot: Plot;
  private readonly review: ReviewService;

  public constructor(plot: Plot, review: ReviewService) {
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
