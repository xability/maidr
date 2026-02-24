import type { AppStore } from '@state/store';
import type { Disposable } from '@type/disposable';
import type { Maidr, NavigateCallback } from '@type/grammar';
import type { Observer } from '@type/observable';
import type { TraceState } from '@type/state';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { AudioService } from '@service/audio';
import { AutoplayService } from '@service/autoplay';
import { BrailleService } from '@service/braille';
import { ChatService } from '@service/chat';
import { CommandExecutor } from '@service/commandExecutor';
import { CommandPaletteService } from '@service/commandPalette';
import { DisplayService } from '@service/display';
import { FormatterService } from '@service/formatter';
import { GoToExtremaService } from '@service/goToExtrema';
import { HelpService } from '@service/help';
import { HighContrastService } from '@service/highContrast';
import { HighlightService } from '@service/highlight';
import { KeybindingService, Mousebindingservice } from '@service/keybinding';
import { NotificationService } from '@service/notification';
import { ReviewService } from '@service/review';
import { RotorNavigationService } from '@service/rotor';
import { SettingsService } from '@service/settings';
import { LocalStorageService } from '@service/storage';
import { TextService } from '@service/text';
import { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import { ChatViewModel } from '@state/viewModel/chatViewModel';
import { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import { DisplayViewModel } from '@state/viewModel/displayViewModel';
import { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import { HelpViewModel } from '@state/viewModel/helpViewModel';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { TextViewModel } from '@state/viewModel/textViewModel';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * Main controller class that orchestrates all services, view models, and interactions for the MAIDR application.
 */
export class Controller implements Disposable {
  private readonly figure: Figure;
  private readonly context: Context;

  private readonly displayService: DisplayService;
  private readonly notificationService: NotificationService;
  private readonly settingsService: SettingsService;
  private readonly formatterService: FormatterService;

  private readonly audioService: AudioService;
  private readonly brailleService: BrailleService;
  private readonly goToExtremaService: GoToExtremaService;
  private readonly textService: TextService;
  private readonly reviewService: ReviewService;
  private readonly rotorNavigationService: RotorNavigationService;

  private readonly autoplayService: AutoplayService;
  private readonly highContrastService: HighContrastService;
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
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  private readonly keybinding: KeybindingService;
  private readonly mousebinding: Mousebindingservice;
  private readonly commandExecutor: CommandExecutor;
  private readonly viewModelRegistry: ViewModelRegistry;

  /**
   * Initializes the controller with all necessary services, view models, and bindings.
   * @param maidr - The MAIDR configuration object containing plot data and settings
   * @param plot - The HTML element containing the plot to be made accessible
   * @param store - The Redux store instance for this plot's state management
   */
  public constructor(maidr: Maidr, plot: HTMLElement, store: AppStore) {
    this.viewModelRegistry = new ViewModelRegistry();
    this.figure = new Figure(maidr);
    this.figure.applyLayout(resolveSubplotLayout(this.figure.subplots));
    this.context = new Context(this.figure);

    this.notificationService = new NotificationService();
    this.formatterService = new FormatterService(maidr);
    this.textService = new TextService(this.notificationService, this.formatterService);
    this.displayService = new DisplayService(this.context, plot, this.textService);
    this.settingsService = new SettingsService(
      new LocalStorageService(),
      this.displayService,
    );
    this.audioService = new AudioService(this.notificationService, this.settingsService, this.context.state);

    this.brailleService = new BrailleService(
      this.context,
      this.notificationService,
      this.displayService,
    );
    this.goToExtremaService = new GoToExtremaService(
      this.context,
      this.displayService,
    );
    this.reviewService = new ReviewService(
      this.notificationService,
      this.displayService,
      this.textService,
    );

    this.autoplayService = new AutoplayService(this.context, this.notificationService, this.settingsService);
    this.highContrastService = new HighContrastService(
      this.settingsService,
      this.notificationService,
      this.displayService,
      this.figure,
      this.context,
    );
    this.highlightService = new HighlightService(this.settingsService);
    this.helpService = new HelpService(this.context, this.displayService);
    this.chatService = new ChatService(
      this.displayService,
      this.textService,
      maidr,
    );

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
    this.settingsViewModel = new SettingsViewModel(store, this.settingsService);

    this.rotorNavigationService = new RotorNavigationService(
      this.context,
      this.textService,
    );
    this.rotorNavigationViewModel = new RotorNavigationViewModel(
      store,
      this.rotorNavigationService,
    );
    this.chatViewModel = new ChatViewModel(
      store,
      this.chatService,
      this.audioService,
    );

    const commandPaletteService = new CommandPaletteService(
      this.context,
      this.displayService,
    );
    this.commandPaletteViewModel = new CommandPaletteViewModel(
      store,
      commandPaletteService,
    );

    this.keybinding = new KeybindingService({
      context: this.context,

      audioService: this.audioService,
      autoplayService: this.autoplayService,
      displayService: this.displayService,
      highContrastService: this.highContrastService,
      highlightService: this.highlightService,
      rotorNavigationService: this.rotorNavigationService,
      settingsService: this.settingsService,
      textService: this.textService,

      brailleViewModel: this.brailleViewModel,
      chatViewModel: this.chatViewModel,
      commandPaletteViewModel: this.commandPaletteViewModel,
      goToExtremaViewModel: this.goToExtremaViewModel,
      helpViewModel: this.helpViewModel,
      reviewViewModel: this.reviewViewModel,
      settingsViewModel: this.settingsViewModel,
      textViewModel: this.textViewModel,
      rotorNavigationViewModel: this.rotorNavigationViewModel,
    });
    this.mousebinding = new Mousebindingservice(
      {
        context: this.context,

        audioService: this.audioService,
        autoplayService: this.autoplayService,
        displayService: this.displayService,
        highContrastService: this.highContrastService,
        highlightService: this.highlightService,
        rotorNavigationService: this.rotorNavigationService,
        settingsService: this.settingsService,
        textService: this.textService,

        brailleViewModel: this.brailleViewModel,
        chatViewModel: this.chatViewModel,
        commandPaletteViewModel: this.commandPaletteViewModel,
        goToExtremaViewModel: this.goToExtremaViewModel,
        helpViewModel: this.helpViewModel,
        reviewViewModel: this.reviewViewModel,
        settingsViewModel: this.settingsViewModel,
        textViewModel: this.textViewModel,
        rotorNavigationViewModel: this.rotorNavigationViewModel,
      },
      this.settingsService,
      this.displayService,
    );

    this.commandExecutor = new CommandExecutor(
      {
        context: this.context,

        audioService: this.audioService,
        autoplayService: this.autoplayService,
        displayService: this.displayService,
        highContrastService: this.highContrastService,
        highlightService: this.highlightService,
        rotorNavigationService: this.rotorNavigationService,
        settingsService: this.settingsService,
        textService: this.textService,

        brailleViewModel: this.brailleViewModel,
        chatViewModel: this.chatViewModel,
        commandPaletteViewModel: this.commandPaletteViewModel,
        goToExtremaViewModel: this.goToExtremaViewModel,
        helpViewModel: this.helpViewModel,
        reviewViewModel: this.reviewViewModel,
        settingsViewModel: this.settingsViewModel,
        textViewModel: this.textViewModel,
        rotorNavigationViewModel: this.rotorNavigationViewModel,
      },
      this.context.scope,
    );
    this.registerViewModels();
    this.registerObservers();
    if (maidr.onNavigate) {
      this.registerNavigateCallback(maidr.onNavigate);
    }
    this.keybinding.register(this.context.scope);
    this.mousebinding.registerEvents();
  }

  /**
   * Announces the initial instruction to screen readers using a live region.
   */
  public announceInitialInstruction(): void {
    const instruction = this.displayService.getInstruction(false);
    // Use textViewModel.update() so the revision counter is bumped,
    // which forces the View to re-mount the role="alert" element and
    // triggers a screen-reader announcement.
    this.textViewModel.update(instruction);
  }

  /**
   * Retrieves the initial instruction text for the plot.
   * @returns The initial instruction text
   */
  public getInitialInstruction(): string {
    return this.displayService.getInstruction(false);
  }

  /**
   * Displays the initial instruction in the text view without announcing it to screen readers.
   */
  public showInitialInstructionInText(): void {
    const text = this.displayService.getInstruction(false);
    // Keep initial instruction visual-only; enable announce later on first nav update
    this.textViewModel.setAnnounce(false);
    this.textViewModel.update(text);
  }

  /**
   * Initialize high contrast mode if enabled in settings.
   * Call this after the Controller is fully set up and will persist (not the throwaway init).
   */
  public initializeHighContrast(): void {
    this.highContrastService.initializeHighContrast();
  }

  /**
   * Suspend high contrast mode visually (restore original colors).
   * Call this on blur to return the chart to its original appearance.
   */
  public suspendHighContrast(): void {
    this.highContrastService.suspendHighContrast();
  }

  /**
   * Cleans up all services, view models, and event listeners.
   */
  public dispose(): void {
    this.keybinding.unregister();
    this.mousebinding.dispose();
    this.commandExecutor.dispose();

    this.viewModelRegistry.dispose();
    this.settingsViewModel.dispose();
    this.chatViewModel.dispose();
    this.helpViewModel.dispose();
    this.displayViewModel.dispose();
    this.goToExtremaViewModel.dispose();
    this.reviewViewModel.dispose();
    this.brailleViewModel.dispose();
    this.textViewModel.dispose();
    this.commandPaletteViewModel.dispose();
    this.rotorNavigationViewModel.dispose();

    this.highContrastService.dispose();
    this.highlightService.dispose();
    this.autoplayService.dispose();

    this.textService.dispose();
    this.reviewService.dispose();
    this.brailleService.dispose();
    this.audioService.dispose();
    this.formatterService.dispose();

    this.settingsService.dispose();
    this.notificationService.dispose();
    this.displayService.dispose();
    this.context.dispose();
    this.figure.dispose();
  }

  /**
   * Returns the context value for React dependency injection.
   * Used by the React component tree to access view models and command executor.
   */
  public getContextValue(): { viewModelRegistry: ViewModelRegistry; commandExecutor: CommandExecutor } {
    return {
      viewModelRegistry: this.viewModelRegistry,
      commandExecutor: this.commandExecutor,
    };
  }

  /**
   * Registers all view models with this controller's registry.
   */
  private registerViewModels(): void {
    this.viewModelRegistry.register('text', this.textViewModel);
    this.viewModelRegistry.register('braille', this.brailleViewModel);
    this.viewModelRegistry.register('goToExtrema', this.goToExtremaViewModel);
    this.viewModelRegistry.register('review', this.reviewViewModel);
    this.viewModelRegistry.register('display', this.displayViewModel);
    this.viewModelRegistry.register('help', this.helpViewModel);
    this.viewModelRegistry.register('chat', this.chatViewModel);
    this.viewModelRegistry.register('settings', this.settingsViewModel);
    this.viewModelRegistry.register('commandPalette', this.commandPaletteViewModel);
    this.viewModelRegistry.register('commandExecutor', this.commandExecutor);
    this.viewModelRegistry.register('rotor', this.rotorNavigationViewModel);
  }

  /**
   * Registers observers to the figure, subplots, and traces for state updates.
   */
  private registerObservers(): void {
    this.figure.addObserver(this.textService);
    this.figure.addObserver(this.audioService);
    this.figure.addObserver(this.highlightService);
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

  /**
   * Registers a navigate callback observer on all traces.
   * Used by canvas-based charting libraries (e.g., Chart.js) for visual highlighting.
   */
  private registerNavigateCallback(callback: NavigateCallback): void {
    const observer: Observer<TraceState> = {
      update: (state: TraceState) => {
        if (!state.empty) {
          callback({
            layerId: state.layerId,
            row: state.audio.panning.y,
            col: state.audio.panning.x,
          });
        }
      },
    };
    this.figure.subplots.forEach(subplotRow => subplotRow.forEach((subplot) => {
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(observer);
      }));
    }));
  }
}
