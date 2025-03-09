import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { NotificationService } from '@service/notification';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';
import type { Scope } from '@type/keys';
import type { Command } from './command';
import { ScatterPlot } from '@model/scatter';
import { toggleChat } from '@redux/slice/chatSlice';
import { toggleHelpMenu } from '@redux/slice/helpSlice';
import { toggleSettings } from '@redux/slice/settingsSlice';
import { store } from '@redux/store';
import hotkeys from 'hotkeys-js';

export class ToggleBrailleCommand implements Command {
  private readonly context: ContextService;
  private readonly braille: BrailleService;

  public constructor(context: ContextService, braille: BrailleService) {
    this.context = context;
    this.braille = braille;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.braille.toggle(state);
    }
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
  private readonly context: ContextService;
  private readonly review: ReviewService;

  public constructor(context: ContextService, review: ReviewService) {
    this.context = context;
    this.review = review;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.review.toggle(state);
    }
  }
}

export class ToggleScatterNavigationCommand implements Command {
  private readonly context: ContextService;
  private readonly notification: NotificationService;

  public constructor(context: ContextService, notification: NotificationService) {
    this.context = context;
    this.notification = notification;
  }

  public execute(): void {
    const activeContext = this.context.active;
    if (activeContext instanceof ScatterPlot) {
      (activeContext as ScatterPlot).toggleNavigation(this.notification);
    }
  }
}

export class ToggleHelpCommand implements Command {
  public execute(): void {
    store.dispatch(toggleHelpMenu());
  }
}

export class ToggleChatCommand implements Command {
  public execute(): void {
    store.dispatch(toggleChat());
  }
}

export class ToggleSettingsCommand implements Command {
  public execute(): void {
    store.dispatch(toggleSettings());
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
