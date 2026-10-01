import type { NavigationSnapshot } from '@model/context';
import type { AppendedPointInfo, LiveReaderModes } from '@service/liveData';
import type { AppStore } from '@state/store';
import type { Disposable } from '@type/disposable';
import type { Keys } from '@type/event';
import type { Maidr, NavigateCallback, NavigationTarget } from '@type/grammar';
import { getPlotlyOverlayLayers } from '@adapters/plotly/normalizer';
import { Context } from '@model/context';
import { Figure } from '@model/plot';
import { AudioService } from '@service/audio';
import { AutoplayService } from '@service/autoplay';
import { BrailleService } from '@service/braille';
import { CandlestickDeltaService } from '@service/candlestickDelta';
import { ChatService } from '@service/chat';
import { CommandExecutor } from '@service/commandExecutor';
import { CommandPaletteService } from '@service/commandPalette';
import { DescriptionService } from '@service/description';
import { DisplayService } from '@service/display';
import { FormatterService } from '@service/formatter';
import { FrameFocusService } from '@service/frameFocus';
import { GoToExtremaService } from '@service/goToExtrema';
import { HelpService } from '@service/help';
import { HighContrastService } from '@service/highContrast';
import { HighlightService } from '@service/highlight';
import { KeybindingService, Mousebindingservice, resolveOverrides } from '@service/keybinding';
import { appendedPointPosition, isAppendedPointFocused } from '@service/liveData';
import { MonitorService } from '@service/monitor';
import { NotificationService } from '@service/notification';
import { ReviewService } from '@service/review';
import { RotorNavigationService } from '@service/rotor';
import { loadStoredGeneralSettings, SettingsService } from '@service/settings';
import { LocalStorageService } from '@service/storage';
import { TactileService } from '@service/tactile';
import { TextMode, TextService } from '@service/text';
import { setWebMcpEnabled } from '@service/webMcp';
import { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import { CandlestickDeltaViewModel } from '@state/viewModel/candlestickDeltaViewModel';
import { ChatViewModel } from '@state/viewModel/chatViewModel';
import { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import { DisplayViewModel } from '@state/viewModel/displayViewModel';
import { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import { HelpViewModel } from '@state/viewModel/helpViewModel';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { TextViewModel } from '@state/viewModel/textViewModel';
import { Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';
import { t } from '@util/i18n';
import { createNavigateObserver } from '@util/navigateObserver';
import { resolveSubplotLayout } from '@util/subplotLayout';

/** The scopes from which a keyboard move to another data point is possible. */
const NAVIGABLE_SCOPES: ReadonlySet<Scope> = new Set<Scope>([
  Scope.SUBPLOT,
  Scope.TRACE,
  Scope.GRID_CELL,
  Scope.CANDLESTICK_DELTA,
]);

/**
 * The scopes from which a command asked for on the reader's behalf runs: the
 * navigable ones, and the braille field. A braille reader reads and moves
 * through the chart from that field, and its keymap binds the toggles,
 * autoplay and moves they would ask an agent for -- turning braille off among
 * them. Every other scope is a dialog, a text field or a label chord the
 * reader is operating, and a command run under it would switch the keyboard
 * scope out from beneath them.
 */
const COMMAND_SCOPES: ReadonlySet<Scope> = new Set<Scope>([...NAVIGABLE_SCOPES, Scope.BRAILLE]);

/**
 * What a reader had in a chart when they left it: where they were and the
 * modes they had set. Captured before the controller is disposed on
 * focus-out and handed to the one built on the next focus-in, so a reader
 * who Tabs to another control and back picks up where they left off.
 */
export interface ControllerSession {
  /** The reader's position, or null when they never moved from the start. */
  navigation: NavigationSnapshot | null;
  textMode: TextMode;
  soundOn: boolean;
  brailleOn: boolean;
}

/**
 * Main controller class that orchestrates all services, view models, and interactions for the MAIDR application.
 */
export class Controller implements Disposable {
  // Mutable: replaced in place on live data updates (see updateData).
  private figure: Figure;
  private readonly context: Context;

  private readonly displayService: DisplayService;
  private readonly notificationService: NotificationService;
  private readonly settingsService: SettingsService;
  private readonly formatterService: FormatterService;
  private readonly frameFocusService: FrameFocusService;

  private readonly audioService: AudioService;
  private readonly brailleService: BrailleService;
  private readonly candlestickDeltaService: CandlestickDeltaService;
  private readonly goToExtremaService: GoToExtremaService;
  private readonly textService: TextService;
  private readonly reviewService: ReviewService;
  private readonly rotorNavigationService: RotorNavigationService;

  private readonly autoplayService: AutoplayService;
  private readonly highContrastService: HighContrastService;
  private readonly monitorService: MonitorService;
  private readonly highlightService: HighlightService;
  private readonly tactileService: TactileService;
  private readonly descriptionService: DescriptionService;
  private readonly helpService: HelpService;
  private readonly chatService: ChatService;

  private readonly textViewModel: TextViewModel;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly candlestickDeltaViewModel: CandlestickDeltaViewModel;
  private readonly goToExtremaViewModel: GoToExtremaViewModel;
  private readonly reviewViewModel: ReviewViewModel;
  private readonly descriptionViewModel: DescriptionViewModel;
  private readonly displayViewModel: DisplayViewModel;
  private readonly helpViewModel: HelpViewModel;
  private readonly chatViewModel: ChatViewModel;
  private readonly settingsViewModel: SettingsViewModel;
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  private readonly keybinding: KeybindingService;
  private readonly mousebinding: Mousebindingservice;
  /** Carries `Context`'s scope changes to the service that owns the hotkeys scope. */
  private readonly scopeSubscription: Disposable;
  private readonly agentToolsSubscription: Disposable;
  private readonly commandExecutor: CommandExecutor;
  private readonly viewModelRegistry: ViewModelRegistry;

  /** The session this controller was built to resume, until {@link resume} runs. */
  private pendingSession: ControllerSession | null;
  /** Whether the reader's position was put back from {@link pendingSession}. */
  private readonly positionResumed: boolean;

  /**
   * Initializes the controller with all necessary services, view models, and bindings.
   * @param maidr - The MAIDR configuration object containing plot data and settings
   * @param plot - The HTML element containing the plot to be made accessible
   * @param store - The Redux store instance for this plot's state management
   * @param session - What the reader had when they last left this chart, to
   *   put back before anything is built on the model
   */
  public constructor(
    maidr: Maidr,
    plot: HTMLElement,
    store: AppStore,
    session: ControllerSession | null = null,
  ) {
    this.viewModelRegistry = new ViewModelRegistry();
    this.figure = new Figure(maidr);
    this.figure.applyLayout(resolveSubplotLayout(this.figure.subplots));
    this.context = new Context(this.figure);
    // Before any service reads the position: the audio mode and the display's
    // focus stack are both taken from the level the reader is on. A figure
    // whose shape changed while they were away starts over.
    this.positionResumed = session?.navigation != null
      && this.context.resumeNavigation(session.navigation);
    this.pendingSession = session;

    this.notificationService = new NotificationService();
    this.formatterService = new FormatterService(maidr);
    this.frameFocusService = new FrameFocusService();
    this.textService = new TextService(this.notificationService, this.formatterService);
    this.displayService = new DisplayService(this.context, plot, this.textService);
    this.settingsService = new SettingsService(
      new LocalStorageService(),
      this.displayService,
    );
    // The WebMCP tools are shared by every chart on the page and outlive this
    // controller, so the setting is handed to them rather than observed: one
    // call registers or removes them at once, whichever chart it came from.
    this.agentToolsSubscription = this.settingsService.onChange((event) => {
      const enabled = event.newSettings.general.agentTools;
      if (enabled !== event.oldSettings.general.agentTools) {
        setWebMcpEnabled(enabled);
      }
    });
    this.audioService = new AudioService(this.notificationService, this.settingsService, this.context.state);
    this.monitorService = new MonitorService(
      maidr.live === true,
      this.audioService,
      this.textService,
      this.notificationService,
    );

    this.brailleService = new BrailleService(
      this.context,
      this.notificationService,
      this.displayService,
      this.settingsService,
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

    this.autoplayService = new AutoplayService(
      this.context,
      this.notificationService,
      this.settingsService,
      this.audioService,
    );
    this.highContrastService = new HighContrastService(
      this.settingsService,
      this.notificationService,
      this.displayService,
      this.figure,
      this.context,
      () => getPlotlyOverlayLayers(this.displayService.plot),
    );
    this.highlightService = new HighlightService(this.settingsService);
    this.tactileService = new TactileService(
      this.displayService,
      this.brailleService,
      this.notificationService,
      this.textService,
      this.figure,
    );
    // Before the description service, which needs it: picking a layer from the
    // description dialog has to hand the rotor back to data mode the way a
    // PageUp step does.
    this.rotorNavigationService = new RotorNavigationService(
      this.context,
      this.textService,
      this.notificationService,
    );
    this.descriptionService = new DescriptionService(
      this.context,
      this.displayService,
      this.rotorNavigationService,
      this.formatterService,
    );
    this.helpService = new HelpService(this.context, this.displayService, this.settingsService);
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
      this.audioService,
    );
    this.brailleViewModel = new BrailleViewModel(store, this.brailleService);
    this.goToExtremaViewModel = new GoToExtremaViewModel(
      store,
      this.goToExtremaService,
      this.context,
      this.formatterService,
    );
    this.reviewViewModel = new ReviewViewModel(store, this.reviewService);
    this.descriptionViewModel = new DescriptionViewModel(store, this.descriptionService);
    this.displayViewModel = new DisplayViewModel(store, this.displayService, this.audioService);
    this.helpViewModel = new HelpViewModel(store, this.helpService);
    this.settingsViewModel = new SettingsViewModel(store, this.settingsService, this.helpService);

    this.rotorNavigationViewModel = new RotorNavigationViewModel(
      store,
      this.rotorNavigationService,
    );
    this.candlestickDeltaService = new CandlestickDeltaService(
      this.context,
      this.notificationService,
      this.displayService,
      this.rotorNavigationService,
    );
    // Runtime-created virtual traces are not covered by registerObservers(),
    // so the delta service wires the same observer set itself on creation.
    this.candlestickDeltaService.setObserverWirer((trace) => {
      trace.addObserver(this.audioService);
      trace.addObserver(this.brailleService);
      trace.addObserver(this.textService);
      trace.addObserver(this.reviewService);
      trace.addObserver(this.highlightService);
      trace.addObserver(this.tactileService);
    });
    this.candlestickDeltaViewModel = new CandlestickDeltaViewModel(
      store,
      this.candlestickDeltaService,
      this.notificationService,
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
      brailleService: this.brailleService,
      candlestickDeltaService: this.candlestickDeltaService,
      displayService: this.displayService,
      goToExtremaService: this.goToExtremaService,
      highContrastService: this.highContrastService,
      highlightService: this.highlightService,
      monitorService: this.monitorService,
      notificationService: this.notificationService,
      rotorNavigationService: this.rotorNavigationService,
      settingsService: this.settingsService,
      tactileService: this.tactileService,
      textService: this.textService,

      brailleViewModel: this.brailleViewModel,
      candlestickDeltaViewModel: this.candlestickDeltaViewModel,
      chatViewModel: this.chatViewModel,
      commandPaletteViewModel: this.commandPaletteViewModel,
      descriptionViewModel: this.descriptionViewModel,
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
        brailleService: this.brailleService,
        candlestickDeltaService: this.candlestickDeltaService,
        displayService: this.displayService,
        goToExtremaService: this.goToExtremaService,
        highContrastService: this.highContrastService,
        highlightService: this.highlightService,
        monitorService: this.monitorService,
        notificationService: this.notificationService,
        rotorNavigationService: this.rotorNavigationService,
        settingsService: this.settingsService,
        tactileService: this.tactileService,
        textService: this.textService,

        brailleViewModel: this.brailleViewModel,
        candlestickDeltaViewModel: this.candlestickDeltaViewModel,
        chatViewModel: this.chatViewModel,
        commandPaletteViewModel: this.commandPaletteViewModel,
        descriptionViewModel: this.descriptionViewModel,
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
        brailleService: this.brailleService,
        candlestickDeltaService: this.candlestickDeltaService,
        displayService: this.displayService,
        goToExtremaService: this.goToExtremaService,
        highContrastService: this.highContrastService,
        highlightService: this.highlightService,
        monitorService: this.monitorService,
        notificationService: this.notificationService,
        rotorNavigationService: this.rotorNavigationService,
        settingsService: this.settingsService,
        tactileService: this.tactileService,
        textService: this.textService,

        brailleViewModel: this.brailleViewModel,
        candlestickDeltaViewModel: this.candlestickDeltaViewModel,
        chatViewModel: this.chatViewModel,
        commandPaletteViewModel: this.commandPaletteViewModel,
        descriptionViewModel: this.descriptionViewModel,
        goToExtremaViewModel: this.goToExtremaViewModel,
        helpViewModel: this.helpViewModel,
        reviewViewModel: this.reviewViewModel,
        settingsViewModel: this.settingsViewModel,
        textViewModel: this.textViewModel,
        rotorNavigationViewModel: this.rotorNavigationViewModel,
      },
    );

    // Inject command execution callback into CommandPaletteViewModel (deferred due to circular dependency)
    this.commandPaletteViewModel.setExecuteCommandCallback(
      commandKey => this.commandExecutor.executeCommand(commandKey),
    );

    this.registerViewModels();
    this.registerObservers();
    if (maidr.onNavigate) {
      this.registerNavigateCallback(maidr.onNavigate);
    }
    // The model decides which scope the reader is in; the keybinding service
    // owns the hotkeys-js scope that decides which bindings fire. `Context`
    // announces the change and this hands it over, so the model never reaches
    // for the keyboard library itself.
    this.scopeSubscription = this.context.onScopeChange(
      scope => this.keybinding.setScope(scope),
    );
    this.keybinding.register(
      this.context.scope,
      resolveOverrides(this.settingsService.loadSettings().general.keybindings),
    );
    this.settingsService.addObserver(this.keybinding);
    this.mousebinding.registerEvents();

    // The modes are the reader's choices, not the position's, so they come
    // back even when the position could not.
    if (session !== null) {
      this.textViewModel.restoreMode(session.textMode);
      this.audioService.setOn(session.soundOn);
    }
  }

  /**
   * Captures what the reader has in this chart, for the controller built when
   * they come back to it.
   *
   * @returns The reader's position and modes
   */
  public captureSession(): ControllerSession {
    const navigation = this.context.captureNavigation();
    // A reader who never left the start has no position to resume, and so
    // meets the initial instruction again.
    const moved = navigation !== null
      && !(navigation.figureEntry && navigation.subplotEntry && navigation.traceEntry);
    return {
      navigation: moved ? navigation : null,
      textMode: this.textService.currentMode,
      soundOn: this.audioService.isOn,
      brailleOn: this.brailleService.isEnabled,
    };
  }

  /**
   * Picks up where the reader left off: reopens braille if it was open and
   * announces the point they are back on, the way a move to it would.
   *
   * Runs once, on the focus-in that built this controller, in place of the
   * initial instruction -- a reader coming back needs to know where they are,
   * not how to start.
   *
   * @returns False when there is no position to resume, and the caller shows
   *   the initial instruction instead
   */
  public resume(): boolean {
    const session = this.pendingSession;
    this.pendingSession = null;
    if (session === null) {
      return false;
    }
    // Braille comes back even without a position: it can be opened on the
    // first point, before any move.
    const state = this.context.state;
    if (session.brailleOn && state.type === 'trace' && !this.brailleService.isEnabled) {
      this.brailleViewModel.toggle(state);
    }
    if (!this.positionResumed) {
      return false;
    }
    this.context.notifyStateUpdate();
    return true;
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
   * Moves the reader to a position the host chose -- the mark a sighted user
   * clicked in the host's own chart.
   *
   * The target is checked before anything is touched: a position the figure
   * does not have is refused with the delta layer, the grid cell and the rotor
   * mode all exactly as they were. Only then are the modes that re-route the
   * arrow keys left, the way a data update leaves them -- the candlestick delta
   * layer closed silently, a rotor mode (grid, point, intersection) reset to
   * data mode, since the target is spelled in the trace's data coordinates and
   * would land somewhere else read through a mode's own cursor -- and the
   * model does the move and announces the landing point once.
   *
   * @param target - The layer and the cell or data point to land on
   * @returns True when the cursor moved there; false leaves everything as it was
   */
  public navigateTo(target: NavigationTarget): boolean {
    if (!this.context.canNavigateTo(target)) {
      return false;
    }
    if (this.candlestickDeltaService.isActive) {
      this.candlestickDeltaService.deactivate({ silent: true });
    }
    this.context.exitGridCell();
    this.rotorNavigationService.resetToDataMode();
    return this.context.navigateTo(target);
  }

  /**
   * Whether the reader is somewhere a keyboard move to another point is not
   * available -- a MAIDR dialog (chat, settings, help, the command palette,
   * go-to-extreme), the braille or review field, or a label chord.
   *
   * {@link navigateTo} leaves only the modes that re-route the arrow keys
   * (grid cell, candlestick delta, rotor); it does not close a dialog, and a
   * move made under one switches the keyboard scope out from beneath it. A
   * caller acting on its own schedule, such as an in-browser agent, asks this
   * first.
   *
   * @returns True while such a scope is active
   */
  public isNavigationBlocked(): boolean {
    return !NAVIGABLE_SCOPES.has(this.context.scope);
  }

  /**
   * Runs one of the reader's commands for a caller acting on its own
   * schedule, such as an in-browser agent.
   *
   * Goes through the executor the command palette uses, in the scope the
   * reader is in, so it does exactly what their key would do there -- and
   * nothing where that key does nothing.
   *
   * @param command - The keymap's name for the command
   * @returns `now` when it ran, `unavailable` when the reader's scope has no
   *   key for it, and `blocked` while {@link isCommandBlocked}
   */
  public runCommand(command: Keys): 'now' | 'unavailable' | 'blocked' {
    if (this.isCommandBlocked()) {
      return 'blocked';
    }
    return this.commandExecutor.executeCommand(command) ? 'now' : 'unavailable';
  }

  /**
   * Whether the reader is in a MAIDR dialog, a text field or a label chord,
   * where {@link runCommand} refuses.
   *
   * Unlike {@link isNavigationBlocked}, the braille field does not count: it
   * is where a braille reader reads the chart from, and its own keymap
   * decides which commands run there.
   *
   * @returns True while such a scope is active
   */
  public isCommandBlocked(): boolean {
    return !COMMAND_SCOPES.has(this.context.scope);
  }

  /**
   * The reader's modes, read without changing or announcing anything.
   *
   * @returns What the palette's toggles and autoplay keys would change
   */
  public getModes(): LiveReaderModes {
    return {
      text: this.textService.currentMode,
      sound: this.audioService.isOn,
      braille: this.brailleService.isEnabled,
      highContrast: this.settingsService.loadSettings().general.highContrastMode,
      monitor: this.monitorService.isEnabled,
      autoplay: this.autoplayService.isPlaying,
      navigationMode: this.rotorNavigationService.getModeKey(),
    };
  }

  /**
   * The modes a controller built from a session would have once it resumed,
   * for a caller asking while no controller is alive.
   *
   * Monitoring, autoplay and the rotor mode are not carried over, so a new
   * controller always starts them off and in data mode; high contrast is a
   * saved setting.
   *
   * @param session - What the reader had when they left, or `null`
   * @returns The modes the next controller starts with
   */
  public static startingModes(session: ControllerSession | null): LiveReaderModes {
    const highContrast = loadStoredGeneralSettings(new LocalStorageService()).highContrastMode;
    return {
      text: session?.textMode ?? TextMode.VERBOSE,
      sound: session?.soundOn ?? true,
      braille: session?.brailleOn ?? false,
      highContrast: typeof highContrast === 'boolean' ? highContrast : DEFAULT_SETTINGS.general.highContrastMode,
      monitor: false,
      autoplay: false,
      navigationMode: 'data',
    };
  }

  /**
   * The text the reader's screen reader last spoke for their position -- the
   * point, its axis labels and values -- as the text mode renders it.
   *
   * Read-only: asking changes nothing and announces nothing.
   *
   * @returns The position text, or `null` before the reader has landed on a
   *   data point
   */
  public getPositionText(): string | null {
    return this.textService.getCoordinateText();
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
   * Replaces the chart data in place (live/realtime update).
   *
   * Rebuilds the model layer (Figure/Subplot/Trace) from the new data while
   * preserving the user's navigation position, then rewires all observers.
   * Services, view models, and keybindings are untouched, so the update is
   * cheap enough for streaming scenarios.
   *
   * The swap itself is silent; when monitor mode is enabled and the update
   * appended a point, that point is sonified and announced without moving
   * the user's position.
   *
   * @param maidr - The complete replacement MAIDR config (caller-owned copy)
   * @param appended - Location of the newly appended point, for appendData updates
   */
  public updateData(maidr: Maidr, appended?: AppendedPointInfo): void {
    // The virtual delta layer is derived from the current model; a data
    // update rebuilds the figure underneath it, so close it first to keep
    // the navigation stack and keyboard scope consistent.
    if (this.candlestickDeltaService.isActive) {
      this.candlestickDeltaService.deactivate({ silent: true });
      this.notificationService.notify(t('notification.deltaClosedByUpdate'));
    }

    // A rotor mode is an index on the service but a flag on the trace, and the
    // swap below replaces every trace. Reset while the current trace is still
    // active so its flag is cleared with it; otherwise the rotor would keep
    // routing arrow keys into a mode the rebuilt trace never entered.
    this.rotorNavigationService.resetToDataMode();

    // Ordering is load-bearing: the sliding-window shift must be resolved
    // against the OLD figure (the user's current position) before the swap,
    // while announceAppendedPoint below runs against the NEW figure.
    const activeColShift = this.resolveActiveColShift(appended);
    const activeRowShift = this.resolveActiveRowShift(appended);

    this.figure = this.context.replaceFigure(() => {
      const figure = new Figure(maidr);
      figure.applyLayout(resolveSubplotLayout(figure.subplots));
      return figure;
    }, { activeColShift, activeRowShift });

    this.highContrastService.setFigure(this.figure);
    this.tactileService.setFigure(this.figure);
    this.formatterService.refresh(maidr);
    this.chatService.updateData(maidr);
    this.monitorService.setLive(maidr.live === true);
    this.registerObservers();
    if (maidr.onNavigate) {
      this.registerNavigateCallback(maidr.onNavigate);
    }

    if (appended) {
      this.announceAppendedPoint(appended);
    }
  }

  /**
   * Computes how far the active trace's cursor must shift left so it stays
   * on the same data point after a sliding-window trim. Zero when nothing
   * was trimmed or the user is positioned on a different trace/group.
   *
   * @param appended - Append info for the incoming update, if any
   * @returns The column shift to apply during position restoration
   */
  private resolveActiveColShift(appended?: AppendedPointInfo): number {
    // `colShift` rather than `trimmed`: a trim drops points, but how far that
    // moves the cursor along the column axis is the trace's business — zero
    // where the columns are not the data points in arrival order.
    if (!appended || appended.colShift === 0) {
      return 0;
    }
    try {
      // The cursor follows trimmed data only on the focused layer/series —
      // the same focus rule that scopes monitor announcements. Evaluating the
      // predicate against the OLD figure is safe even for appends that start
      // a new series: the window trims per group, so a brand-new group (one
      // point) always has trimmed === 0 and returns above.
      return isAppendedPointFocused(this.figure, appended) ? appended.colShift : 0;
    } catch (error) {
      console.warn('[maidr] Failed to resolve sliding-window shift:', error);
      return 0;
    }
  }

  /**
   * Computes how far the active trace's cursor must move down so it stays on
   * the same data point after an append inserted rows before it. Zero when
   * the append inserted none or the user is positioned on a different
   * trace/group.
   *
   * @param appended - Append info for the incoming update, if any
   * @returns The row shift to apply during position restoration
   */
  private resolveActiveRowShift(appended?: AppendedPointInfo): number {
    if (!appended || appended.rowShift === 0) {
      return 0;
    }
    try {
      return isAppendedPointFocused(this.figure, appended) ? appended.rowShift : 0;
    } catch (error) {
      console.warn('[maidr] Failed to resolve appended row shift:', error);
      return 0;
    }
  }

  /**
   * Sonifies and announces a newly appended data point through the monitor
   * service, computing its state without moving the user's cursor.
   *
   * Only appends to the layer the user is currently focused on are
   * announced: multi-layer charts stream one point per layer per tick, and
   * sonifying every layer would bury the focused signal in overlapping
   * tones. Switching layers (PageUp/PageDown) switches what is monitored.
   *
   * @param appended - Location of the appended point in the new figure
   */
  private announceAppendedPoint(appended: AppendedPointInfo): void {
    if (!this.monitorService.isEnabled) {
      return;
    }
    try {
      if (!isAppendedPointFocused(this.figure, appended)) {
        return;
      }
      // The focused layer's trace IS the active trace (one single-trace row
      // per layer; see Subplot.activeLayerIndex); the focus predicate above
      // guarantees the indices are in range. It is null only for a subplot
      // with no layers, which has no appended point to announce. Compute the
      // new point's state without moving the user's cursor; observers are
      // only notified via MonitorService.
      const trace = this.figure.activeSubplot.activeTrace;
      if (!trace) {
        return;
      }
      // Announce coordinates come from the trace itself where the data order
      // is not the navigation order (a scatter groups its points by sorted x).
      const position = appendedPointPosition(trace, appended);
      const state = trace.getStateAt(position.row, position.col);
      this.monitorService.handleNewPoint(state);
    } catch (error) {
      console.warn('[maidr] Failed to announce appended data point:', error);
    }
  }

  /**
   * Cleans up all services, view models, and event listeners.
   */
  public dispose(): void {
    this.scopeSubscription.dispose();
    this.agentToolsSubscription.dispose();
    this.settingsService.removeObserver(this.keybinding);
    this.keybinding.unregister();
    this.mousebinding.dispose();
    this.commandExecutor.dispose();

    this.viewModelRegistry.dispose();
    this.settingsViewModel.dispose();
    this.chatViewModel.dispose();
    this.helpViewModel.dispose();
    this.descriptionViewModel.dispose();
    this.displayViewModel.dispose();
    this.goToExtremaViewModel.dispose();
    this.reviewViewModel.dispose();
    this.candlestickDeltaViewModel.dispose();
    this.brailleViewModel.dispose();
    this.textViewModel.dispose();
    this.commandPaletteViewModel.dispose();
    this.rotorNavigationViewModel.dispose();

    this.highContrastService.dispose();
    this.highlightService.dispose();
    this.tactileService.dispose();
    this.autoplayService.dispose();
    this.monitorService.dispose();

    this.chatService.dispose();
    this.candlestickDeltaService.dispose();
    this.textService.dispose();
    this.reviewService.dispose();
    this.brailleService.dispose();
    this.audioService.dispose();
    this.formatterService.dispose();
    this.frameFocusService.dispose();

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
    this.viewModelRegistry.register('candlestickDelta', this.candlestickDeltaViewModel);
    this.viewModelRegistry.register('goToExtrema', this.goToExtremaViewModel);
    this.viewModelRegistry.register('review', this.reviewViewModel);
    this.viewModelRegistry.register('description', this.descriptionViewModel);
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
    this.figure.addObserver(this.reviewService);
    this.figure.addObserver(this.tactileService);
    this.figure.subplots.forEach(subplotRow => subplotRow.forEach((subplot) => {
      subplot.addObserver(this.textService);
      subplot.addObserver(this.audioService);
      subplot.addObserver(this.brailleService);
      subplot.addObserver(this.highlightService);
      subplot.addObserver(this.tactileService);
      subplot.addObserver(this.reviewService);
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(this.audioService);
        trace.addObserver(this.brailleService);
        trace.addObserver(this.textService);
        trace.addObserver(this.reviewService);
        trace.addObserver(this.highlightService);
        trace.addObserver(this.tactileService);
      }));
    }));
  }

  /**
   * Registers a navigate callback observer on all traces.
   * Used by canvas-based charting libraries (e.g., Chart.js) for visual highlighting.
   */
  private registerNavigateCallback(callback: NavigateCallback): void {
    this.figure.subplots.forEach(subplotRow => subplotRow.forEach((subplot) => {
      subplot.traces.forEach(traceRow => traceRow.forEach((trace) => {
        trace.addObserver(createNavigateObserver(trace, callback));
      }));
    }));

    // Leaving a subplot makes the figure active rather than a trace, so the
    // trace observers above go quiet and say nothing about having stopped.
    // A consumer drawing an overlay would keep the last point highlighted and
    // carry it to whichever panel the user moved to next, pointing at a chart
    // it does not belong to. The figure is the only element that hears the
    // move, so it is what reports the selection ending.
    this.figure.addObserver({
      update: () => callback(null),
    });
  }
}
