import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { HighContrastService } from '@service/highContrast';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Scope } from '@type/event';
import type { Command } from './command';

/**
 * Command to toggle the braille display on or off.
 */
export class ToggleBrailleCommand implements Command {
  private readonly context: Context;
  private readonly brailleViewModel: BrailleViewModel;

  /**
   * Creates an instance of ToggleBrailleCommand.
   * @param {Context} context - The application context.
   * @param {BrailleViewModel} brailleViewModel - The braille view model.
   */
  public constructor(context: Context, brailleViewModel: BrailleViewModel) {
    this.context = context;
    this.brailleViewModel = brailleViewModel;
  }

  /**
   * Toggles the braille display if the current state is a trace state.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.brailleViewModel.toggle(state);
    }
  }
}

/**
 * Command to toggle the text display on or off.
 */
export class ToggleTextCommand implements Command {
  private readonly textViewModel: TextViewModel;

  /**
   * Creates an instance of ToggleTextCommand.
   * @param {TextViewModel} textViewModel - The text view model.
   */
  public constructor(textViewModel: TextViewModel) {
    this.textViewModel = textViewModel;
  }

  /**
   * Toggles the text display.
   */
  public execute(): void {
    this.textViewModel.toggle();
  }
}

/**
 * Command to toggle the audio output on or off.
 */
export class ToggleAudioCommand implements Command {
  private readonly audio: AudioService;

  /**
   * Creates an instance of ToggleAudioCommand.
   * @param {AudioService} audio - The audio service.
   */
  public constructor(audio: AudioService) {
    this.audio = audio;
  }

  /**
   * Toggles the audio output.
   */
  public execute(): void {
    this.audio.toggle();
  }
}

/**
 * Command to toggle the review mode on or off.
 */
export class ToggleReviewCommand implements Command {
  private readonly context: Context;
  private readonly reviewViewModel: ReviewViewModel;

  /**
   * Creates an instance of ToggleReviewCommand.
   * @param {Context} context - The application context.
   * @param {ReviewViewModel} reviewViewModel - The review view model.
   */
  public constructor(context: Context, reviewViewModel: ReviewViewModel) {
    this.context = context;
    this.reviewViewModel = reviewViewModel;
  }

  /**
   * Toggles the review mode if the current state is a trace state.
   */
  public execute(): void {
    const state = this.context.state;
    if (state.type === 'trace') {
      this.reviewViewModel.toggle(state);
    }
  }
}

/**
 * Command to toggle the help panel on or off.
 */
export class ToggleHelpCommand implements Command {
  private readonly helpViewModel: HelpViewModel;

  /**
   * Creates an instance of ToggleHelpCommand.
   * @param {HelpViewModel} helpViewModel - The help view model.
   */
  public constructor(helpViewModel: HelpViewModel) {
    this.helpViewModel = helpViewModel;
  }

  /**
   * Toggles the help panel.
   */
  public execute(): void {
    this.helpViewModel.toggle();
  }
}

/**
 * Command to toggle the chat interface on or off.
 */
export class ToggleChatCommand implements Command {
  private readonly chatViewModel: ChatViewModel;

  /**
   * Creates an instance of ToggleChatCommand.
   * @param {ChatViewModel} chatViewModel - The chat view model.
   */
  public constructor(chatViewModel: ChatViewModel) {
    this.chatViewModel = chatViewModel;
  }

  /**
   * Toggles the chat interface.
   */
  public execute(): void {
    this.chatViewModel.toggle();
  }
}

/**
 * Command to toggle the settings panel on or off.
 */
export class ToggleSettingsCommand implements Command {
  private readonly settingsViewModel: SettingsViewModel;

  /**
   * Creates an instance of ToggleSettingsCommand.
   * @param {SettingsViewModel} settingsViewModel - The settings view model.
   */
  public constructor(settingsViewModel: SettingsViewModel) {
    this.settingsViewModel = settingsViewModel;
  }

  /**
   * Toggles the settings panel.
   */
  public execute(): void {
    this.settingsViewModel.toggle();
  }
}

/**
 * Command to toggle the command palette on or off.
 */
export class ToggleCommandPaletteCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  /**
   * Creates an instance of ToggleCommandPaletteCommand.
   * @param {CommandPaletteViewModel} commandPaletteViewModel - The command palette view model.
   */
  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  /**
   * Toggles the command palette.
   */
  public execute(): void {
    this.commandPaletteViewModel.toggle();
  }
}

/**
 * Command to close the command palette.
 */
export class CommandPaletteCloseCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  /**
   * Creates an instance of CommandPaletteCloseCommand.
   * @param {CommandPaletteViewModel} commandPaletteViewModel - The command palette view model.
   */
  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  /**
   * Hides the command palette.
   */
  public execute(): void {
    this.commandPaletteViewModel.hide();
  }
}

/**
 * Command to move the selection up in the command palette.
 */
export class CommandPaletteMoveUpCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  /**
   * Creates an instance of CommandPaletteMoveUpCommand.
   * @param {CommandPaletteViewModel} commandPaletteViewModel - The command palette view model.
   */
  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  /**
   * Moves the selection up in the command palette.
   */
  public execute(): void {
    this.commandPaletteViewModel.moveUp();
  }
}

/**
 * Command to move the selection down in the command palette.
 */
export class CommandPaletteMoveDownCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  /**
   * Creates an instance of CommandPaletteMoveDownCommand.
   * @param {CommandPaletteViewModel} commandPaletteViewModel - The command palette view model.
   */
  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  /**
   * Moves the selection down in the command palette.
   */
  public execute(): void {
    this.commandPaletteViewModel.moveDown();
  }
}

/**
 * Command to select the current item in the command palette.
 */
export class CommandPaletteSelectCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  /**
   * Creates an instance of CommandPaletteSelectCommand.
   * @param {CommandPaletteViewModel} commandPaletteViewModel - The command palette view model.
   */
  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  /**
   * Selects the currently highlighted item in the command palette.
   */
  public execute(): void {
    this.commandPaletteViewModel.selectCurrent();
  }
}

/**
 * Command to toggle a specific scope in the application context.
 */
export class ToggleScopeCommand implements Command {
  private readonly context: Context;
  private readonly scope: Scope;

  /**
   * Creates an instance of ToggleScopeCommand.
   * @param {Context} context - The application context.
   * @param {Scope} scope - The scope to toggle.
   */
  public constructor(context: Context, scope: Scope) {
    this.context = context;
    this.scope = scope;
  }

  /**
   * Toggles the specified scope in the context.
   */
  public execute(): void {
    this.context.toggleScope(this.scope);
  }
}
export class ToggleHighContrast implements Command {
  private readonly highContrastService: HighContrastService;

  public constructor(highContrastService: HighContrastService) {
    this.highContrastService = highContrastService;
  }

  public execute(): void {
    this.highContrastService.toggleHighContrast();
  }
}
