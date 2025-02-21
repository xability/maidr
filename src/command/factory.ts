import type { AudioService } from '@service/audio';
import type { AutoplayService } from '@service/autoplay';
import type { BrailleService } from '@service/braille';
import type { ReviewService } from '@service/review';
import type { TextService } from '@service/text';
import type { Keys } from '@type/keys';
import type { Plot } from '@type/plot';
import type { Command, CommandContext } from './command';
import { Scope } from '@type/keys';
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
  MoveToRightExtremeCommand,
  MoveToTopExtremeCommand,
  MoveUpCommand,
} from './move';
import {
  SwitchScopeCommand,
  ToggleAudioCommand,
  ToggleBrailleCommand,
  ToggleChatCommand,
  ToggleHelpCommand,
  ToggleReviewCommand,
  ToggleSettingsCommand,
  ToggleTextCommand,
} from './toggle';

export class CommandFactory {
  private readonly plot: Plot;

  private readonly audio: AudioService;
  private readonly braille: BrailleService;
  private readonly text: TextService;
  private readonly review: ReviewService;

  private readonly autoplay: AutoplayService;

  public constructor(commandContext: CommandContext) {
    this.plot = commandContext.plot;

    this.audio = commandContext.audio;
    this.braille = commandContext.braille;
    this.text = commandContext.text;
    this.review = commandContext.review;

    this.autoplay = commandContext.autoplay;
  }

  public create(command: Keys): Command {
    switch (command) {
      case 'MOVE_UP':
        return new MoveUpCommand(this.plot);
      case 'MOVE_DOWN':
        return new MoveDownCommand(this.plot);
      case 'MOVE_LEFT':
        return new MoveLeftCommand(this.plot);
      case 'MOVE_RIGHT':
        return new MoveRightCommand(this.plot);
      case 'MOVE_TO_TOP_EXTREME':
        return new MoveToTopExtremeCommand(this.plot);
      case 'MOVE_TO_BOTTOM_EXTREME':
        return new MoveToBottomExtremeCommand(this.plot);
      case 'MOVE_TO_LEFT_EXTREME':
        return new MoveToLeftExtremeCommand(this.plot);
      case 'MOVE_TO_RIGHT_EXTREME':
        return new MoveToRightExtremeCommand(this.plot);

      case 'TOGGLE_AUDIO':
        return new ToggleAudioCommand(this.audio);
      case 'TOGGLE_BRAILLE':
        return new ToggleBrailleCommand(this.plot, this.braille);
      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.text);
      case 'TOGGLE_REVIEW':
        return new ToggleReviewCommand(this.plot, this.review);

      case 'TOGGLE_HELP':
        return new ToggleHelpCommand();
      case 'TOGGLE_CHAT':
        return new ToggleChatCommand();
      case 'TOGGLE_SETTINGS':
        return new ToggleSettingsCommand();

      case 'DESCRIBE_X':
        return new DescribeXCommand(this.plot, this.text);
      case 'DESCRIBE_Y':
        return new DescribeYCommand(this.plot, this.text);
      case 'DESCRIBE_POINT':
        return new DescribePointCommand(this.plot, this.audio, this.braille, this.text);
      case 'DESCRIBE_TITLE':
        return new DescribeTitleCommand(this.plot, this.text);
      case 'DESCRIBE_SUBTITLE':
        return new DescribeSubtitleCommand(this.plot, this.text);
      case 'DESCRIBE_CAPTION':
        return new DescribeCaptionCommand(this.plot, this.text);

      case 'ACTIVATE_LABEL_SCOPE':
        return new SwitchScopeCommand(Scope.LABEL);
      case 'ACTIVATE_DEFAULT_SCOPE':
        return new SwitchScopeCommand(Scope.DEFAULT);

      case 'AUTOPLAY_UPWARD':
        return new AutoplayUpwardCommand(this.autoplay, this.plot);
      case 'AUTOPLAY_DOWNWARD':
        return new AutoplayDownwardCommand(this.autoplay, this.plot);
      case 'AUTOPLAY_FORWARD':
        return new AutoplayForwardCommand(this.autoplay, this.plot);
      case 'AUTOPLAY_BACKWARD':
        return new AutoplayBackwardCommand(this.autoplay, this.plot);
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
