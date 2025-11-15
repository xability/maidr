import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { HighlightService } from '@service/highlight';
import type { RotorNavigationService } from '@service/rotor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import type { RotorNavigationViewModel } from '@state/viewModel/rotorNavigationViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Keys } from '@type/event';
import type { Command, CommandContext } from './command';
import { ViolinBoxTrace, ViolinTrace } from '@model/violin';
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

export class CommandFactory {
  private readonly context: Context;

  private readonly audioService: AudioService;
  private readonly autoplayService: AutoplayService;
  private readonly highlightService: HighlightService;
  private readonly rotorService: RotorNavigationService;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly chatViewModel: ChatViewModel;
  private readonly commandPaletteViewModel: CommandPaletteViewModel;
  private readonly goToExtremaViewModel: GoToExtremaViewModel;
  private readonly helpViewModel: HelpViewModel;
  private readonly reviewViewModel: ReviewViewModel;
  private readonly settingsViewModel: SettingsViewModel;
  private readonly textViewModel: TextViewModel;
  private readonly rotorNavigationViewModel: RotorNavigationViewModel;

  public constructor(commandContext: CommandContext) {
    this.context = commandContext.context;

    this.audioService = commandContext.audioService;
    this.autoplayService = commandContext.autoplayService;
    this.highlightService = commandContext.highlightService;
    this.rotorService = commandContext.rotorNavigationService;

    this.brailleViewModel = commandContext.brailleViewModel;
    this.chatViewModel = commandContext.chatViewModel;
    this.commandPaletteViewModel = commandContext.commandPaletteViewModel;
    this.goToExtremaViewModel = commandContext.goToExtremaViewModel;
    this.helpViewModel = commandContext.helpViewModel;
    this.reviewViewModel = commandContext.reviewViewModel;
    this.settingsViewModel = commandContext.settingsViewModel;
    this.textViewModel = commandContext.textViewModel;
    this.rotorNavigationViewModel = commandContext.rotorNavigationViewModel;
  }

  /**
   * Checks if the current active trace is a violin plot (either ViolinTrace or ViolinBoxTrace).
   * Violin plots require special handling for up/down arrow navigation to ensure
   * ViolinTrace methods are called instead of rotor navigation.
   *
   * @returns true if the current trace is a violin plot, false otherwise
   */
  private isViolinPlot(): boolean {
    const active = this.context.active;
    return active instanceof ViolinTrace || active instanceof ViolinBoxTrace;
  }

  public create(command: Keys): Command {
    switch (command) {
      case 'MOVE_UP':
        // For violin plots, always use MoveUpCommand to ensure ViolinTrace methods are called
        // For other plot types, use rotor navigation if enabled
        if (this.context.isRotorEnabled() && !this.isViolinPlot()) {
          return new RotorNavigationMoveUpCommand(this.rotorNavigationViewModel);
        }
        return new MoveUpCommand(this.context);
      case 'MOVE_DOWN':
        // For violin plots, always use MoveDownCommand to ensure ViolinTrace methods are called
        // For other plot types, use rotor navigation if enabled
        if (this.context.isRotorEnabled() && !this.isViolinPlot()) {
          return new RotorNavigationMoveDownCommand(this.rotorNavigationViewModel);
        }
        return new MoveDownCommand(this.context);
      case 'MOVE_LEFT':
        // Allow left arrow for violin plots to switch between violin layers
        if (this.context.isRotorEnabled()) {
          return new RotorNavigationMoveLeftCommand(this.rotorNavigationViewModel);
        }
        return new MoveLeftCommand(this.context);
      case 'MOVE_RIGHT':
        // Allow right arrow for violin plots to switch between violin layers
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
      default:
        throw new Error(`Invalid command name: ${command}`);
    }
  }
}
