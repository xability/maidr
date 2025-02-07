import type { Plot } from '@model/plot';
import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { Scope } from '@service/keybinding';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';
import type { Command } from './command';
import hotkeys from 'hotkeys-js';

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

  public execute(): void {
    hotkeys.setScope(this.scopeName);
  }
}
