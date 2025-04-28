import type { Disposable } from '@type/disposable';
import type { Maidr } from '@type/grammar';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { AudioService } from '@service/audio';
import { AutoplayService } from '@service/autoplay';
import { BrailleService } from '@service/braille';
import { ChatService } from '@service/chat';
import { DisplayService } from '@service/display';
import { HelpService } from '@service/help';
import { HighlightService } from '@service/highlight';
import { KeybindingService } from '@service/keybinding';
import { NotificationService } from '@service/notification';
import { ReviewService } from '@service/review';
import { SettingsService } from '@service/settings';
import { TextService } from '@service/text';
import { store } from '@state/store';
import { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import { ChatViewModel } from '@state/viewModel/chatViewModel';
import { DisplayViewModel } from '@state/viewModel/displayViewModel';
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
  private readonly textService: TextService;
  private readonly reviewService: ReviewService;

  private readonly autoplayService: AutoplayService;
  private readonly highlightService: HighlightService;
  private readonly helpService: HelpService;
  private readonly chatService: ChatService;

  private readonly textViewModel: TextViewModel;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly reviewViewModel: ReviewViewModel;
  private readonly displayViewModel: DisplayViewModel;
  private readonly helpViewModel: HelpViewModel;
  private readonly chatViewModel: ChatViewModel;
  private readonly settingsViewModel: SettingsViewModel;

  private readonly keybinding: KeybindingService;

  public constructor(maidr: Maidr, plot: HTMLElement, reactContainer: HTMLElement) {
    this.figure = new Figure(maidr);
    this.context = new Context(this.figure);

    this.displayService = new DisplayService(this.context, plot, reactContainer);
    this.notificationService = new NotificationService();
    this.settingsService = new SettingsService(this.displayService);

    this.audioService = new AudioService(this.notificationService, this.context.state);
    this.brailleService = new BrailleService(this.context, this.notificationService, this.displayService);
    this.textService = new TextService(this.notificationService);
    this.reviewService = new ReviewService(this.notificationService, this.displayService, this.textService);

    this.autoplayService = new AutoplayService(this.context, this.notificationService);
    this.highlightService = new HighlightService();
    this.helpService = new HelpService(this.context, this.displayService);
    this.chatService = new ChatService(this.displayService, maidr);

    this.textViewModel = new TextViewModel(store, this.textService, this.notificationService, this.autoplayService);
    this.brailleViewModel = new BrailleViewModel(store, this.brailleService);
    this.reviewViewModel = new ReviewViewModel(store, this.reviewService);
    this.displayViewModel = new DisplayViewModel(store, this.displayService);
    this.helpViewModel = new HelpViewModel(store, this.helpService);
    this.chatViewModel = new ChatViewModel(store, this.chatService, this.audioService);
    this.settingsViewModel = new SettingsViewModel(store, this.settingsService);

    this.notificationService.notify(this.context.getInstruction(false));

    this.keybinding = new KeybindingService(
      {
        context: this.context,

        audioService: this.audioService,
        autoplayService: this.autoplayService,
        highlightService: this.highlightService,

        brailleViewModel: this.brailleViewModel,
        chatViewModel: this.chatViewModel,
        helpViewModel: this.helpViewModel,
        reviewViewModel: this.reviewViewModel,
        settingsViewModel: this.settingsViewModel,
        textViewModel: this.textViewModel,
      },
    );

    this.registerViewModels();
    this.registerObservers();
    this.keybinding.register(this.context.scope);
  }

  public dispose(): void {
    this.keybinding.unregister();

    ViewModelRegistry.instance.dispose();
    this.settingsViewModel.dispose();
    this.chatViewModel.dispose();
    this.helpViewModel.dispose();
    this.displayViewModel.dispose();
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
    ViewModelRegistry.instance.register('review', this.reviewViewModel);
    ViewModelRegistry.instance.register('display', this.displayViewModel);
    ViewModelRegistry.instance.register('help', this.helpViewModel);
    ViewModelRegistry.instance.register('chat', this.chatViewModel);
    ViewModelRegistry.instance.register('settings', this.settingsViewModel);
  }

  private registerObservers(): void {
    this.figure.addObserver(this.textService);
    this.figure.subplots.forEach(subplotRow => subplotRow.forEach((subplot) => {
      subplot.addObserver(this.textService);
      subplot.addObserver(this.audioService);
      subplot.addObserver(this.brailleService);
      subplot.addObserver(this.highlightService);
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(this.audioService);
        trace.addObserver(this.brailleService);
        trace.addObserver(this.textService);
        trace.addObserver(this.reviewService);
        trace.addObserver(this.highlightService);
      }));
    }));
  }
}
