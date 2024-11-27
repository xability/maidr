import AudioManager from '../manager/audio';
import AutoplayManager from '../manager/autoplay';
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
import BrailleManager from '../manager/braille';
import {Command, CommandContext} from './command';
import {
  DescribeCaptionCommand,
  DescribePointCommand,
  DescribeXCommand,
  DescribeYCommand,
  DescribeSubtitleCommand,
  DescribeTitleCommand,
} from './describe';
import {Keys} from '../manager/keymap';
import {
  MoveDownCommand,
  MoveLeftCommand,
  MoveRightCommand,
  MoveUpCommand,
  MoveToBottomExtremeCommand,
  MoveToLeftExtremeCommand,
  MoveToRightExtremeCommand,
  MoveToTopExtremeCommand,
} from './move';
import {Plot} from '../interface';
import TextManager from '../manager/text';
import ReviewManager from '../manager/review';
import {
  ToggleAudioCommand,
  ToggleBrailleCommand,
  SwitchScopeCommand,
  ToggleTextCommand,
  ToggleReviewCommand,
} from './toggle';

export class CommandFactory {
  private readonly plot: Plot;

  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;
  private readonly review: ReviewManager;

  private readonly autoplay: AutoplayManager;

  constructor(commandContext: CommandContext) {
    this.plot = commandContext.plot;

    this.audio = commandContext.audio;
    this.braille = commandContext.braille;
    this.text = commandContext.text;
    this.review = commandContext.review;

    this.autoplay = commandContext.autoplay;
  }

  create(command: Keys): Command {
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
        return new ToggleBrailleCommand(this.braille);
      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.text);
      case 'TOGGLE_REVIEW':
        return new ToggleReviewCommand(this.review);

      case 'DESCRIBE_X':
        return new DescribeXCommand(this.plot, this.text);
      case 'DESCRIBE_Y':
        return new DescribeYCommand(this.plot, this.text);
      case 'DESCRIBE_POINT':
        return new DescribePointCommand(
          this.plot,
          this.audio,
          this.braille,
          this.text
        );
      case 'DESCRIBE_TITLE':
        return new DescribeTitleCommand(this.plot, this.text);
      case 'DESCRIBE_SUBTITLE':
        return new DescribeSubtitleCommand(this.plot, this.text);
      case 'DESCRIBE_CAPTION':
        return new DescribeCaptionCommand(this.plot, this.text);

      case 'ACTIVATE_LABEL_SCOPE':
        return new SwitchScopeCommand('LABEL');
      case 'ACTIVATE_DEFAULT_SCOPE':
        return new SwitchScopeCommand('DEFAULT');

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
