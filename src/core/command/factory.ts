import AudioManager from '../manager/audio';
import BrailleManager from '../manager/braille';
import {Command, CommandContext} from './command';
import {
  DescribePointCommand,
  DescribeXCommand,
  DescribeYCommand,
} from './describe';
import {
  MoveDownCommand,
  MoveLeftCommand,
  MoveRightCommand,
  MoveUpCommand,
} from './move';
import {Keys} from '../manager/keymap';
import TextManager from '../manager/text';
import {
  ToggleAudioCommand,
  ToggleBrailleCommand,
  SwitchScopeCommand,
  ToggleTextCommand,
} from './toggle';
import {Plot} from '../../model/plot';

export class CommandFactory {
  private readonly plot: Plot;
  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;

  constructor(commandContext: CommandContext) {
    this.plot = commandContext.plot;
    this.audio = commandContext.audio;
    this.braille = commandContext.braille;
    this.text = commandContext.text;
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

      case 'TOGGLE_AUDIO':
        return new ToggleAudioCommand(this.audio);
      case 'TOGGLE_BRAILLE':
        return new ToggleBrailleCommand(this.braille);
      case 'TOGGLE_TEXT':
        return new ToggleTextCommand(this.text);

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

      case 'ACTIVATE_LABEL_SCOPE':
        return new SwitchScopeCommand('LABEL');
      case 'ACTIVATE_DEFAULT_SCOPE':
        return new SwitchScopeCommand('DEFAULT');

      default:
        throw new Error(`Invalid command name: ${command}`);
    }
  }
}
