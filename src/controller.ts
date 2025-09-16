import type { Disposable } from '@type/disposable';
import type { Maidr } from '@type/grammar';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { AudioService } from '@service/audio';
import { AutoplayService } from '@service/autoplay';
import { BrailleService } from '@service/braille';
import { ChatService } from '@service/chat';
import { DisplayService } from '@service/display';
import { GoToExtremaService } from '@service/goToExtrema';
import { HelpService } from '@service/help';
import { HighlightService } from '@service/highlight';
import { KeybindingService, Mousebindingservice } from '@service/keybinding';
import { NotificationService } from '@service/notification';
import { ReviewService } from '@service/review';
import { SettingsService } from '@service/settings';
import { LocalStorageService } from '@service/storage';
import { TextService } from '@service/text';
import { store } from '@state/store';
import { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import { ChatViewModel } from '@state/viewModel/chatViewModel';
import { DisplayViewModel } from '@state/viewModel/displayViewModel';
import { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import { HelpViewModel } from '@state/viewModel/helpViewModel';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { TextViewModel } from '@state/viewModel/textViewModel';

export class Controller implements Disposable {
  private readonly figure: Figure;
  private readonly context: Context;

  private readonly displayService: DisplayService;
  private readonly notificationService: NotificationService;
  private readonly settingsService: SettingsService;

  private readonly audioService: AudioService;
  private readonly brailleService: BrailleService;
  private readonly goToExtremaService: GoToExtremaService;
  private readonly textService: TextService;
  private readonly reviewService: ReviewService;

  private readonly autoplayService: AutoplayService;
  private readonly highlightService: HighlightService;
  private readonly helpService: HelpService;
  private readonly chatService: ChatService;

  private readonly textViewModel: TextViewModel;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly goToExtremaViewModel: GoToExtremaViewModel;
  private readonly reviewViewModel: ReviewViewModel;
  private readonly displayViewModel: DisplayViewModel;
  private readonly helpViewModel: HelpViewModel;
  private readonly chatViewModel: ChatViewModel;
  private readonly settingsViewModel: SettingsViewModel;

  private readonly keybinding: KeybindingService;
  private readonly mousebinding: Mousebindingservice;

  public constructor(maidr: Maidr, plot: HTMLElement) {
    this.figure = new Figure(maidr);
    this.context = new Context(this.figure);

    this.displayService = new DisplayService(this.context, plot);
    this.notificationService = new NotificationService();
    this.settingsService = new SettingsService(
      new LocalStorageService(),
      this.displayService,
    );

    this.audioService = new AudioService(
      this.notificationService,
      this.context.state,
      this.settingsService,
    );
    this.brailleService = new BrailleService(
      this.context,
      this.notificationService,
      this.displayService,
    );
    this.goToExtremaService = new GoToExtremaService(
      this.context,
      this.displayService,
    );
    this.textService = new TextService(this.notificationService);
    this.reviewService = new ReviewService(
      this.notificationService,
      this.displayService,
      this.textService,
    );

    this.autoplayService = new AutoplayService(
      this.context,
      this.notificationService,
      this.settingsService,
    );
    this.highlightService = new HighlightService(this.settingsService);
    this.helpService = new HelpService(this.context, this.displayService);
    this.chatService = new ChatService(this.displayService, maidr);

    this.textViewModel = new TextViewModel(
      store,
      this.textService,
      this.notificationService,
      this.autoplayService,
    );
    this.brailleViewModel = new BrailleViewModel(store, this.brailleService);
    this.goToExtremaViewModel = new GoToExtremaViewModel(
      store,
      this.goToExtremaService,
      this.context,
    );
    this.reviewViewModel = new ReviewViewModel(store, this.reviewService);
    this.displayViewModel = new DisplayViewModel(store, this.displayService);
    this.helpViewModel = new HelpViewModel(store, this.helpService);
    this.chatViewModel = new ChatViewModel(
      store,
      this.chatService,
      this.audioService,
    );
    this.settingsViewModel = new SettingsViewModel(store, this.settingsService);

    this.keybinding = new KeybindingService({
      context: this.context,

      audioService: this.audioService,
      autoplayService: this.autoplayService,
      highlightService: this.highlightService,

      brailleViewModel: this.brailleViewModel,
      chatViewModel: this.chatViewModel,
      goToExtremaViewModel: this.goToExtremaViewModel,
      helpViewModel: this.helpViewModel,
      reviewViewModel: this.reviewViewModel,
      settingsViewModel: this.settingsViewModel,
      textViewModel: this.textViewModel,
    });
    this.mousebinding = new Mousebindingservice({
      context: this.context,

      audioService: this.audioService,
      autoplayService: this.autoplayService,
      highlightService: this.highlightService,

      brailleViewModel: this.brailleViewModel,
      chatViewModel: this.chatViewModel,
      goToExtremaViewModel: this.goToExtremaViewModel,
      helpViewModel: this.helpViewModel,
      reviewViewModel: this.reviewViewModel,
      settingsViewModel: this.settingsViewModel,
      textViewModel: this.textViewModel,
    });

    this.registerViewModels();
    this.registerObservers();
    this.keybinding.register(this.context.scope);
    this.mousebinding.registerEvents();
  }

  public announceInitialInstruction(): void {
    this.notificationService.notify(this.displayService.getInstruction(false));
  }

  public dispose(): void {
    this.keybinding.unregister();
    this.mousebinding.unregister();

    ViewModelRegistry.instance.dispose();
    this.settingsViewModel.dispose();
    this.chatViewModel.dispose();
    this.helpViewModel.dispose();
    this.displayViewModel.dispose();
    this.goToExtremaViewModel.dispose();
    this.reviewViewModel.dispose();
    this.brailleViewModel.dispose();
    this.textViewModel.dispose();

    this.highlightService.dispose();
    this.autoplayService.dispose();

    this.textService.dispose();
    this.reviewService.dispose();
    this.brailleService.dispose();
    this.audioService.dispose();

    this.notificationService.dispose();
    this.displayService.dispose();
    this.context.dispose();
    this.figure.dispose();
  }

  private registerViewModels(): void {
    ViewModelRegistry.instance.register('text', this.textViewModel);
    ViewModelRegistry.instance.register('braille', this.brailleViewModel);
    ViewModelRegistry.instance.register(
      'goToExtrema',
      this.goToExtremaViewModel,
    );
    ViewModelRegistry.instance.register('review', this.reviewViewModel);
    ViewModelRegistry.instance.register('display', this.displayViewModel);
    ViewModelRegistry.instance.register('help', this.helpViewModel);
    ViewModelRegistry.instance.register('chat', this.chatViewModel);
    ViewModelRegistry.instance.register('settings', this.settingsViewModel);
  }

  private registerObservers(): void {
    this.figure.addObserver(this.textService);
    this.figure.addObserver(this.audioService);
    this.figure.addObserver(this.highlightService);
    this.figure.subplots.forEach(subplotRow =>
      subplotRow.forEach((subplot) => {
        subplot.addObserver(this.textService);
        subplot.addObserver(this.brailleService);
        subplot.addObserver(this.highlightService);
        subplot.traces.forEach(traceRow =>
          traceRow.forEach((trace) => {
            trace.addObserver(this.audioService);
            trace.addObserver(this.brailleService);
            trace.addObserver(this.textService);
            trace.addObserver(this.reviewService);
            trace.addObserver(this.highlightService);
          }),
        );
      }),
    );
  }
}
