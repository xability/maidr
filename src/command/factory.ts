import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { HighlightService } from '@service/highlight';
import type { MarkService } from '@service/mark';
import type { RotorNavigationService } from '@service/rotor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { JumpToMarkViewModel } from '@state/viewModel/jumpToMarkViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Keys } from '@type/event';
import type { Command, CommandContext } from './command';
import { Scope } from '@type/event';
import {
  AutoplayBackwardCommand,
  AutoplayDownwardCommand,
  AutoplayForwardCommand,
  AutoplayUpwardCommand,
  ResetAutoplaySpeedCommand,
  SpeedDownAutoplayCommand,
  SpeedUpAutoplayCommand,
  StopAutoplayCommand,
} from './autoplay';
import {
  DescribeCaptionCommand,
  DescribeFillCommand,
  DescribePointCommand,
  DescribeSubtitleCommand,
  DescribeTitleCommand,
  DescribeXCommand,
  DescribeYCommand,
} from './describe';
import { GoToExtremaToggleCommand } from './goTo';
import {
  GoToExtremaCloseCommand,
  GoToExtremaMoveDownCommand,
  GoToExtremaMoveUpCommand,
  GoToExtremaSelectCommand,
} from './goToExtremaNavigation';
import {
  ActivateMarkJumpScopeCommand,
  ActivateMarkPlayScopeCommand,
  ActivateMarkSetScopeCommand,
  DeactivateMarkScopeCommand,
  JumpToMarkCloseCommand,
  JumpToMarkMoveDownCommand,
  JumpToMarkMoveUpCommand,
  JumpToMarkSelectCommand,
  JumpToSlotCommand,
  PlayMarkCommand,
  SetMarkCommand,
} from './mark';
import {
  MoveDownCommand,
  MoveLeftCommand,
  MoveRightCommand,
  MoveToBottomExtremeCommand,
  MoveToLeftExtremeCommand,
  MoveToNextTraceCommand,
  MoveToPrevTraceCommand,
  MoveToRightExtremeCommand,
  MoveToSubplotContextCommand,
  MoveToTopExtremeCommand,
  MoveToTraceContextCommand,
  MoveUpCommand,
} from './move';
import {
  RotorNavigationMoveDownCommand,
  RotorNavigationMoveLeftCommand,
  RotorNavigationMoveRightCommand,
  RotorNavigationMoveUpCommand,
  RotorNavigationNextNavUnitCommand,
  RotorNavigationPrevNavUnitCommand,
} from './rotorNavigation';
import {
  CommandPaletteCloseCommand,
  CommandPaletteMoveDownCommand,
  CommandPaletteMoveUpCommand,
  CommandPaletteSelectCommand,
  ToggleAudioCommand,
  ToggleBrailleCommand,
  ToggleChatCommand,
  ToggleCommandPaletteCommand,
  ToggleHelpCommand,
  ToggleReviewCommand,
  ToggleScopeCommand,
  ToggleSettingsCommand,
  ToggleTextCommand,
} from './toggle';

/**
 * Factory for creating command instances based on key input.
 */
export class CommandFactory {
  private readonly context: Context;

  private readonly audioService: AudioService;
  private readonly autoplayService: AutoplayService;
  private readonly highlightService: HighlightService;
  private readonly markService: MarkService;
  private readonly rotorService: RotorNavigationService;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly chatViewModel: ChatViewModel;
  private readonly commandPaletteViewModel: CommandPaletteViewModel;
  private readonly goToExtremaViewModel: GoToExtremaViewModel;
  private readonly helpViewModel: HelpViewModel;
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;
  private readonly reviewViewModel: ReviewViewModel;
  private readonly settingsViewModel: SettingsViewModel;
  private readonly textViewModel: TextViewModel;
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  /**
   * Creates an instance of CommandFactory.
   * @param {CommandContext} commandContext - The command context containing services and view models.
   */
  public constructor(commandContext: CommandContext) {
    this.context = commandContext.context;

    this.audioService = commandContext.audioService;
    this.autoplayService = commandContext.autoplayService;
    this.highlightService = commandContext.highlightService;
    this.markService = commandContext.markService;
    this.rotorService = commandContext.rotorNavigationService;

    this.brailleViewModel = commandContext.brailleViewModel;
    this.chatViewModel = commandContext.chatViewModel;
    this.commandPaletteViewModel = commandContext.commandPaletteViewModel;
    this.goToExtremaViewModel = commandContext.goToExtremaViewModel;
    this.helpViewModel = commandContext.helpViewModel;
    this.jumpToMarkViewModel = commandContext.jumpToMarkViewModel;
    this.reviewViewModel = commandContext.reviewViewModel;
    this.settingsViewModel = commandContext.settingsViewModel;
    this.textViewModel = commandContext.textViewModel;
    this.rotorNavigationViewModel = commandContext.rotorNavigationViewModel;
  }

  /**
   * Creates a command instance based on the provided key input.
   * @param {Keys} command - The key command to create a Command instance for.
   * @returns {Command} The corresponding command instance for the given key.
   */
  public create(command: Keys): Command {
    switch (command) {
      case 'MOVE_UP':
        if (this.context.isRotorEnabled()) {
          return new RotorNavigationMoveUpCommand(this.rotorNavigationViewModel);
        }
        return new MoveUpCommand(this.context);
      case 'MOVE_DOWN':
        if (this.context.isRotorEnabled()) {
          return new RotorNavigationMoveDownCommand(this.rotorNavigationViewModel);
        }
        return new MoveDownCommand(this.context);
      case 'MOVE_LEFT':
        if (this.context.isRotorEnabled()) {
          return new RotorNavigationMoveLeftCommand(this.rotorNavigationViewModel);
        }
        return new MoveLeftCommand(this.context);
      case 'MOVE_RIGHT':
        if (this.context.isRotorEnabled()) {
          return new RotorNavigationMoveRightCommand(this.rotorNavigationViewModel);
        }
        return new MoveRightCommand(this.context);
      case 'MOVE_TO_TOP_EXTREME':
        return new MoveToTopExtremeCommand(this.context);
      case 'MOVE_TO_BOTTOM_EXTREME':
        return new MoveToBottomExtremeCommand(this.context);
      case 'MOVE_TO_LEFT_EXTREME':
        return new MoveToLeftExtremeCommand(this.context);
      case 'MOVE_TO_RIGHT_EXTREME':
        return new MoveToRightExtremeCommand(this.context);

      case 'MOVE_TO_TRACE_CONTEXT':
        return new MoveToTraceContextCommand(this.context);
      case 'MOVE_TO_SUBPLOT_CONTEXT':
        return new MoveToSubplotContextCommand(this.context);
      case 'MOVE_TO_NEXT_TRACE':
        return new MoveToNextTraceCommand(this.context);
      case 'MOVE_TO_PREV_TRACE':
        return new MoveToPrevTraceCommand(this.context);

      case 'TOGGLE_AUDIO':
        return new ToggleAudioCommand(this.audioService);
      case 'TOGGLE_BRAILLE':
        return new ToggleBrailleCommand(this.context, this.brailleViewModel);
      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.textViewModel);
      case 'TOGGLE_REVIEW':
        return new ToggleReviewCommand(this.context, this.reviewViewModel);

      case 'TOGGLE_HELP':
        return new ToggleHelpCommand(this.helpViewModel);
      case 'TOGGLE_CHAT':
        return new ToggleChatCommand(this.chatViewModel);
      case 'TOGGLE_COMMAND_PALETTE':
        return new ToggleCommandPaletteCommand(this.commandPaletteViewModel);
      case 'TOGGLE_SETTINGS':
        return new ToggleSettingsCommand(this.settingsViewModel);

      case 'GO_TO_EXTREMA_MOVE_UP':
        return new GoToExtremaMoveUpCommand(this.goToExtremaViewModel);
      case 'GO_TO_EXTREMA_MOVE_DOWN':
        return new GoToExtremaMoveDownCommand(this.goToExtremaViewModel);
      case 'GO_TO_EXTREMA_SELECT':
        return new GoToExtremaSelectCommand(this.goToExtremaViewModel);
      case 'GO_TO_EXTREMA_CLOSE':
        return new GoToExtremaCloseCommand(this.goToExtremaViewModel);
      case 'GO_TO_EXTREMA_TOGGLE':
        return new GoToExtremaToggleCommand(this.context, this.goToExtremaViewModel);
      case 'COMMAND_PALETTE_MOVE_UP':
        return new CommandPaletteMoveUpCommand(this.commandPaletteViewModel);
      case 'COMMAND_PALETTE_MOVE_DOWN':
        return new CommandPaletteMoveDownCommand(this.commandPaletteViewModel);
      case 'COMMAND_PALETTE_SELECT':
        return new CommandPaletteSelectCommand(this.commandPaletteViewModel);
      case 'COMMAND_PALETTE_CLOSE':
        return new CommandPaletteCloseCommand(this.commandPaletteViewModel);
      case 'DESCRIBE_X':
        return new DescribeXCommand(this.context, this.textViewModel);
      case 'DESCRIBE_Y':
        return new DescribeYCommand(this.context, this.textViewModel);
      case 'DESCRIBE_FILL':
        return new DescribeFillCommand(this.context, this.textViewModel);
      case 'DESCRIBE_POINT':
        return new DescribePointCommand(
          this.context,
          this.audioService,
          this.highlightService,
          this.brailleViewModel,
          this.textViewModel,
        );
      case 'DESCRIBE_TITLE':
        return new DescribeTitleCommand(this.context, this.textViewModel);
      case 'DESCRIBE_SUBTITLE':
        return new DescribeSubtitleCommand(this.context, this.textViewModel);
      case 'DESCRIBE_CAPTION':
        return new DescribeCaptionCommand(this.context, this.textViewModel);

      case 'ACTIVATE_FIGURE_LABEL_SCOPE':
      case 'DEACTIVATE_FIGURE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.context, Scope.FIGURE_LABEL);
      case 'ACTIVATE_TRACE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.context, Scope.TRACE_LABEL);
      case 'DEACTIVATE_TRACE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.context, Scope.TRACE);
      case 'AUTOPLAY_UPWARD':
        return new AutoplayUpwardCommand(this.context, this.autoplayService);
      case 'AUTOPLAY_DOWNWARD':
        return new AutoplayDownwardCommand(this.context, this.autoplayService);
      case 'AUTOPLAY_FORWARD':
        return new AutoplayForwardCommand(this.context, this.autoplayService);
      case 'AUTOPLAY_BACKWARD':
        return new AutoplayBackwardCommand(this.context, this.autoplayService);
      case 'STOP_AUTOPLAY':
        return new StopAutoplayCommand(this.autoplayService);
      case 'SPEED_UP_AUTOPLAY':
        return new SpeedUpAutoplayCommand(this.autoplayService);
      case 'SPEED_DOWN_AUTOPLAY':
        return new SpeedDownAutoplayCommand(this.autoplayService);
      case 'RESET_AUTOPLAY_SPEED':
        return new ResetAutoplaySpeedCommand(this.autoplayService);
      case 'ROTOR_NEXT_NAV':
        return new RotorNavigationNextNavUnitCommand(this.context, this.rotorNavigationViewModel);
      case 'ROTOR_PREV_NAV':
        return new RotorNavigationPrevNavUnitCommand(this.context, this.rotorNavigationViewModel);

      // Mark and recall commands
      case 'ACTIVATE_MARK_SET_SCOPE':
        return new ActivateMarkSetScopeCommand(this.markService);
      case 'ACTIVATE_MARK_PLAY_SCOPE':
        return new ActivateMarkPlayScopeCommand(this.markService);
      case 'ACTIVATE_MARK_JUMP_SCOPE':
        return new ActivateMarkJumpScopeCommand(this.jumpToMarkViewModel);

      // Jump to mark dialog navigation
      case 'JUMP_TO_MARK_MOVE_UP':
        return new JumpToMarkMoveUpCommand(this.jumpToMarkViewModel);
      case 'JUMP_TO_MARK_MOVE_DOWN':
        return new JumpToMarkMoveDownCommand(this.jumpToMarkViewModel);
      case 'JUMP_TO_MARK_SELECT':
        return new JumpToMarkSelectCommand(this.jumpToMarkViewModel);
      case 'JUMP_TO_MARK_CLOSE':
        return new JumpToMarkCloseCommand(this.jumpToMarkViewModel);

      case 'DEACTIVATE_MARK_SCOPE':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_0':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_1':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_2':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_3':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_4':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_5':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_6':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_7':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_8':
      case 'DEACTIVATE_MARK_SCOPE_CHORD_9':
        return new DeactivateMarkScopeCommand(this.markService);

      default:
        // Handle slot-based mark commands dynamically
        return this.createSlotCommand(command);
    }
  }

  /**
   * Creates slot-based mark commands (SET_MARK_*, PLAY_MARK_*, JUMP_TO_SLOT_*).
   * Extracts the slot number from the command string and returns the appropriate command.
   * @param command - The command key
   * @returns The corresponding command instance
   * @throws Error if the command is not a valid slot-based command
   */
  private createSlotCommand(command: Keys): Command {
    const commandStr = command as string;
    const slot = this.extractSlotNumber(commandStr);

    if (commandStr.startsWith('SET_MARK_') && slot !== null) {
      return new SetMarkCommand(this.markService, slot);
    }
    if (commandStr.startsWith('PLAY_MARK_') && slot !== null) {
      return new PlayMarkCommand(this.markService, slot);
    }
    if (commandStr.startsWith('JUMP_TO_SLOT_') && slot !== null) {
      return new JumpToSlotCommand(this.jumpToMarkViewModel, slot);
    }

    throw new Error(`Invalid command name: ${commandStr}`);
  }

  /**
   * Extracts the slot number (0-9) from a command string.
   * @param command - The command key (e.g., 'SET_MARK_5', 'PLAY_MARK_3')
   * @returns The slot number or null if not found
   */
  private extractSlotNumber(command: string): number | null {
    const match = command.match(/_(\d)$/);
    if (match) {
      const slot = Number.parseInt(match[1], 10);
      if (slot >= 0 && slot <= 9) {
        return slot;
      }
    }
    return null;
  }
}
