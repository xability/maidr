import type { AudioService } from '@service/audio';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { NotificationService } from '@service/notification';
import type { ReviewService } from '@service/review';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Scope } from '@type/event';
import type { Command } from './command';
import { ScatterPlot } from '@model/scatter';

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
  private readonly textViewModel: TextViewModel;

  public constructor(textViewModel: TextViewModel) {
    this.textViewModel = textViewModel;
  }

  public execute(): void {
    this.textViewModel.toggle();
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
      const navMode = (activeContext as ScatterPlot).toggleNavigation();
      const message = `Switched to ${navMode} navigation`;
      this.notification.notify(message);
    }
  }
}

export class ToggleHelpCommand implements Command {
  private readonly helpViewModel: HelpViewModel;

  public constructor(helpViewModel: HelpViewModel) {
    this.helpViewModel = helpViewModel;
  }

  public execute(): void {
    this.helpViewModel.toggle();
  }
}

export class ToggleChatCommand implements Command {
  private readonly chatViewModel: ChatViewModel;

  public constructor(chatViewModel: ChatViewModel) {
    this.chatViewModel = chatViewModel;
  }

  public execute(): void {
    this.chatViewModel.toggle();
  }
}

export class ToggleSettingsCommand implements Command {
  private readonly settingsViewModel: SettingsViewModel;

  public constructor(settingsViewModel: SettingsViewModel) {
    this.settingsViewModel = settingsViewModel;
  }

  public execute(): void {
    this.settingsViewModel.toggle();
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
