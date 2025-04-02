import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { NotificationService } from '@service/notification';
import type { ReviewService } from '@service/review';
import type { Scope } from '@type/event';
import type { Command } from './command';
import { ScatterPlot } from '@model/scatter';
import { toggleChat } from '@redux/slice/chatSlice';
import { toggleHelpMenu } from '@redux/slice/helpSlice';
import { toggleSettings } from '@redux/slice/settingsSlice';
import { toggleText } from '@redux/slice/textSlice';
import { store } from '@redux/store';

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
  public execute(): void {
    store.dispatch(toggleText());
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

export class ToggleScopeCommand implements Command {
  private readonly context: ContextService;
  private readonly scope: Scope;

  public constructor(context: ContextService, scope: Scope) {
    this.context = context;
    this.scope = scope;
  }

  public execute(): void {
    this.context.toggleScope(this.scope);
  }
}
