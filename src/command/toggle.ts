import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { NotificationService } from '@service/notification';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';
import type { Scope } from '@type/keys';
import type { Plot } from '@type/plot';
import type { Command } from './command';
import { ScatterPlot } from '@model/scatter';
import { toggleHelpMenu } from '@redux/slice/helpMenuSlice';
import { store } from '@redux/store';
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

export class ToggleScatterNavigationCommand implements Command {
  private readonly plot: Plot;
  private readonly notification: NotificationService;

  public constructor(plot: Plot, notification: NotificationService) {
    this.plot = plot;
    this.notification = notification;
  }

  public execute(): void {
    if (this.plot instanceof ScatterPlot) {
      (this.plot as ScatterPlot).toggleNavigation(this.notification);
    }
  }
}

export class ToggleHelpCommand implements Command {
  public execute(): void {
    store.dispatch(toggleHelpMenu());
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
