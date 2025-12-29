import type { Context } from "@model/context";
import type { AudioService } from "@service/audio";
import type { HighContrastService } from "@service/highContrast";
import type { BrailleViewModel } from "@state/viewModel/brailleViewModel";
import type { ChatViewModel } from "@state/viewModel/chatViewModel";
import type { CommandPaletteViewModel } from "@state/viewModel/commandPaletteViewModel";
import type { HelpViewModel } from "@state/viewModel/helpViewModel";
import type { ReviewViewModel } from "@state/viewModel/reviewViewModel";
import type { SettingsViewModel } from "@state/viewModel/settingsViewModel";
import type { TextViewModel } from "@state/viewModel/textViewModel";
import type { Scope } from "@type/event";
import type { Command } from "./command";

export class ToggleBrailleCommand implements Command {
  private readonly context: Context;
  private readonly brailleViewModel: BrailleViewModel;

  public constructor(context: Context, brailleViewModel: BrailleViewModel) {
    this.context = context;
    this.brailleViewModel = brailleViewModel;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === "trace") {
      this.brailleViewModel.toggle(state);
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
  private readonly context: Context;
  private readonly reviewViewModel: ReviewViewModel;

  public constructor(context: Context, reviewViewModel: ReviewViewModel) {
    this.context = context;
    this.reviewViewModel = reviewViewModel;
  }

  public execute(): void {
    const state = this.context.state;
    if (state.type === "trace") {
      this.reviewViewModel.toggle(state);
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

export class ToggleCommandPaletteCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  public execute(): void {
    this.commandPaletteViewModel.toggle();
  }
}

export class CommandPaletteCloseCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  public execute(): void {
    this.commandPaletteViewModel.hide();
  }
}

export class CommandPaletteMoveUpCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  public execute(): void {
    this.commandPaletteViewModel.moveUp();
  }
}

export class CommandPaletteMoveDownCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  public execute(): void {
    this.commandPaletteViewModel.moveDown();
  }
}

export class CommandPaletteSelectCommand implements Command {
  private readonly commandPaletteViewModel: CommandPaletteViewModel;

  public constructor(commandPaletteViewModel: CommandPaletteViewModel) {
    this.commandPaletteViewModel = commandPaletteViewModel;
  }

  public execute(): void {
    this.commandPaletteViewModel.selectCurrent();
  }
}

export class ToggleScopeCommand implements Command {
  private readonly context: Context;
  private readonly scope: Scope;

  public constructor(context: Context, scope: Scope) {
    this.context = context;
    this.scope = scope;
  }

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
