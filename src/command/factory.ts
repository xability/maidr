import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { HighlightService } from '@service/highlight';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
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
  ToggleAudioCommand,
  ToggleBrailleCommand,
  ToggleChatCommand,
  ToggleHelpCommand,
  ToggleReviewCommand,
  ToggleScopeCommand,
  ToggleSettingsCommand,
  ToggleTextCommand,
} from './toggle';

export class CommandFactory {
  private readonly contextService: ContextService;

  private readonly audioService: AudioService;
  private readonly brailleService: BrailleService;

  private readonly autoplayService: AutoplayService;
  private readonly highlightService: HighlightService;

  private readonly textViewModel: TextViewModel;
  private readonly reviewViewModel: ReviewViewModel;
  private readonly chatViewModel: ChatViewModel;
  private readonly helpViewModel: HelpViewModel;
  private readonly settingsViewModel: SettingsViewModel;

  public constructor(commandContext: CommandContext) {
    this.contextService = commandContext.context;

    this.audioService = commandContext.audioService;
    this.brailleService = commandContext.brailleService;

    this.autoplayService = commandContext.autoplayService;
    this.highlightService = commandContext.highlightService;

    this.textViewModel = commandContext.textViewModel;
    this.reviewViewModel = commandContext.reviewViewModel;
    this.chatViewModel = commandContext.chatViewModel;
    this.helpViewModel = commandContext.helpViewModel;
    this.settingsViewModel = commandContext.settingsViewModel;
  }

  public create(command: Keys): Command {
    switch (command) {
      case 'MOVE_UP':
        return new MoveUpCommand(this.contextService);
      case 'MOVE_DOWN':
        return new MoveDownCommand(this.contextService);
      case 'MOVE_LEFT':
        return new MoveLeftCommand(this.contextService);
      case 'MOVE_RIGHT':
        return new MoveRightCommand(this.contextService);
      case 'MOVE_TO_TOP_EXTREME':
        return new MoveToTopExtremeCommand(this.contextService);
      case 'MOVE_TO_BOTTOM_EXTREME':
        return new MoveToBottomExtremeCommand(this.contextService);
      case 'MOVE_TO_LEFT_EXTREME':
        return new MoveToLeftExtremeCommand(this.contextService);
      case 'MOVE_TO_RIGHT_EXTREME':
        return new MoveToRightExtremeCommand(this.contextService);

      case 'MOVE_TO_TRACE_CONTEXT':
        return new MoveToTraceContextCommand(this.contextService);
      case 'MOVE_TO_SUBPLOT_CONTEXT':
        return new MoveToSubplotContextCommand(this.contextService);
      case 'MOVE_TO_NEXT_TRACE':
        return new MoveToNextTraceCommand(this.contextService);
      case 'MOVE_TO_PREV_TRACE':
        return new MoveToPrevTraceCommand(this.contextService);

      case 'TOGGLE_AUDIO':
        return new ToggleAudioCommand(this.audioService);
      case 'TOGGLE_BRAILLE':
        return new ToggleBrailleCommand(this.contextService, this.brailleService);
      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.textViewModel);
      case 'TOGGLE_REVIEW':
        return new ToggleReviewCommand(this.reviewViewModel);

      case 'TOGGLE_HELP':
        return new ToggleHelpCommand(this.helpViewModel);
      case 'TOGGLE_CHAT':
        return new ToggleChatCommand(this.chatViewModel);
      case 'TOGGLE_SETTINGS':
        return new ToggleSettingsCommand(this.settingsViewModel);

      case 'DESCRIBE_X':
        return new DescribeXCommand(this.contextService, this.textViewModel);
      case 'DESCRIBE_Y':
        return new DescribeYCommand(this.contextService, this.textViewModel);
      case 'DESCRIBE_FILL':
        return new DescribeFillCommand(this.contextService, this.textViewModel);
      case 'DESCRIBE_POINT':
        return new DescribePointCommand(this.contextService, this.textViewModel, this.audioService, this.brailleService, this.highlightService);
      case 'DESCRIBE_TITLE':
        return new DescribeTitleCommand(this.contextService, this.textViewModel);
      case 'DESCRIBE_SUBTITLE':
        return new DescribeSubtitleCommand(this.contextService, this.textViewModel);
      case 'DESCRIBE_CAPTION':
        return new DescribeCaptionCommand(this.contextService, this.textViewModel);

      case 'ACTIVATE_FIGURE_LABEL_SCOPE':
      case 'DEACTIVATE_FIGURE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.contextService, Scope.FIGURE_LABEL);
      case 'ACTIVATE_TRACE_LABEL_SCOPE':
      case 'DEACTIVATE_TRACE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.contextService, Scope.TRACE_LABEL);

      case 'AUTOPLAY_UPWARD':
        return new AutoplayUpwardCommand(this.contextService, this.autoplayService);
      case 'AUTOPLAY_DOWNWARD':
        return new AutoplayDownwardCommand(this.contextService, this.autoplayService);
      case 'AUTOPLAY_FORWARD':
        return new AutoplayForwardCommand(this.contextService, this.autoplayService);
      case 'AUTOPLAY_BACKWARD':
        return new AutoplayBackwardCommand(this.contextService, this.autoplayService);
      case 'STOP_AUTOPLAY':
        return new StopAutoplayCommand(this.autoplayService);
      case 'SPEED_UP_AUTOPLAY':
        return new SpeedUpAutoplayCommand(this.autoplayService);
      case 'SPEED_DOWN_AUTOPLAY':
        return new SpeedDownAutoplayCommand(this.autoplayService);
      case 'RESET_AUTOPLAY_SPEED':
        return new ResetAutoplaySpeedCommand(this.autoplayService);

      default:
        throw new Error(`Invalid command name: ${command}`);
    }
  }
}
