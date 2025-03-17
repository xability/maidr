import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { ContextService } from '@service/context';
import type { NotificationService } from '@service/notification';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';
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
  ToggleScatterNavigationCommand,
  ToggleScopeCommand,
  ToggleSettingsCommand,
  ToggleTextCommand,
} from './toggle';

export class CommandFactory {
  private readonly context: ContextService;

  private readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly text: TextService;
  private readonly review: ReviewService;

  private readonly notification: NotificationService;
  private readonly autoplay: AutoplayService;

  public constructor(commandContext: CommandContext) {
    this.context = commandContext.context;

    this.audio = commandContext.audio;
    this.braille = commandContext.braille;
    this.text = commandContext.text;
    this.review = commandContext.review;

    this.notification = commandContext.notification;
    this.autoplay = commandContext.autoplay;
  }

  public create(command: Keys): Command {
    switch (command) {
      case 'MOVE_UP':
        return new MoveUpCommand(this.context);
      case 'MOVE_DOWN':
        return new MoveDownCommand(this.context);
      case 'MOVE_LEFT':
        return new MoveLeftCommand(this.context);
      case 'MOVE_RIGHT':
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
        return new ToggleAudioCommand(this.audio);
      case 'TOGGLE_BRAILLE':
        return new ToggleBrailleCommand(this.context, this.braille);
      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.text);
      case 'TOGGLE_REVIEW':
        return new ToggleReviewCommand(this.context, this.review);

      case 'TOGGLE_SCATTER_NAVIGATION':
        return new ToggleScatterNavigationCommand(this.context, this.notification);
      case 'TOGGLE_HELP':
        return new ToggleHelpCommand();
      case 'TOGGLE_CHAT':
        return new ToggleChatCommand();
      case 'TOGGLE_SETTINGS':
        return new ToggleSettingsCommand();

      case 'DESCRIBE_X':
        return new DescribeXCommand(this.context, this.text);
      case 'DESCRIBE_Y':
        return new DescribeYCommand(this.context, this.text);
      case 'DESCRIBE_FILL':
        return new DescribeFillCommand(this.context, this.text);
      case 'DESCRIBE_POINT':
        return new DescribePointCommand(this.context, this.audio, this.braille, this.text);
      case 'DESCRIBE_TITLE':
        return new DescribeTitleCommand(this.context, this.text);
      case 'DESCRIBE_SUBTITLE':
        return new DescribeSubtitleCommand(this.context, this.text);
      case 'DESCRIBE_CAPTION':
        return new DescribeCaptionCommand(this.context, this.text);

      case 'ACTIVATE_FIGURE_LABEL_SCOPE':
      case 'DEACTIVATE_FIGURE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.context, Scope.FIGURE_LABEL);
      case 'ACTIVATE_TRACE_LABEL_SCOPE':
      case 'DEACTIVATE_TRACE_LABEL_SCOPE':
        return new ToggleScopeCommand(this.context, Scope.TRACE_LABEL);

      case 'AUTOPLAY_UPWARD':
        return new AutoplayUpwardCommand(this.context, this.autoplay);
      case 'AUTOPLAY_DOWNWARD':
        return new AutoplayDownwardCommand(this.context, this.autoplay);
      case 'AUTOPLAY_FORWARD':
        return new AutoplayForwardCommand(this.context, this.autoplay);
      case 'AUTOPLAY_BACKWARD':
        return new AutoplayBackwardCommand(this.context, this.autoplay);
      case 'STOP_AUTOPLAY':
        return new StopAutoplayCommand(this.autoplay);
      case 'SPEED_UP_AUTOPLAY':
        return new SpeedUpAutoplayCommand(this.autoplay);
      case 'SPEED_DOWN_AUTOPLAY':
        return new SpeedDownAutoplayCommand(this.autoplay);
      case 'RESET_AUTOPLAY_SPEED':
        return new ResetAutoplaySpeedCommand(this.autoplay);

      default:
        throw new Error(`Invalid command name: ${command}`);
    }
  }
}
