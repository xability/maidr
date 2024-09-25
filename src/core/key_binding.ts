import hotkeys from 'hotkeys-js';
import AudioManager from './manager/audio';
import BrailleManager from './manager/braille';
import {Command, CommandContext} from './command/command';
import {
  DescribePointCommand,
  DescribeXCommand,
  DescribeYCommand,
} from './command/describe';
import {
  MoveDownCommand,
  MoveLeftCommand,
  MoveRightCommand,
  MoveUpCommand,
} from './command/move';
import {Plot} from '../plot/plot';
import TextManager from './manager/text';
import {ToggleAudio, ToggleBraille, ToggleText} from './command/toggle';

enum Keymap {
  // Navigation
  MOVE_UP = 'up',
  MOVE_DOWN = 'down',
  MOVE_RIGHT = 'right',
  MOVE_LEFT = 'left',

  // BTS
  TOGGLE_BRAILLE = 'b',
  TOGGLE_TEXT = 't',
  TOGGLE_AUDIO = 's',

  // Description
  DESCRIBE_X = 'l+x',
  DESCRIBE_Y = 'l+y',
  DESCRIBE_POINT = 'space',
}

export default class KeyBinding {
  private readonly bindings: Map<string, Command>;

  private readonly plot: Plot;
  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  private readonly text: TextManager;

  constructor(commandContext: CommandContext) {
    this.plot = commandContext.plot;
    this.audio = commandContext.audio;
    this.braille = commandContext.braille;
    this.text = commandContext.text;

    this.bindings = this.createBindings();
  }

  private createBindings(): Map<string, Command> {
    const bindings = new Map<string, Command>();

    for (const key of Object.values(Keymap)) {
      const command = this.getCommand(key);
      bindings.set(key, command);
    }

    return bindings;
  }

  private getCommand(key: string): Command {
    switch (key) {
      case Keymap.MOVE_UP:
        return new MoveUpCommand(
          this.plot,
          this.audio,
          this.braille,
          this.text
        );
      case Keymap.MOVE_DOWN:
        return new MoveDownCommand(
          this.plot,
          this.audio,
          this.braille,
          this.text
        );
      case Keymap.MOVE_RIGHT:
        return new MoveRightCommand(
          this.plot,
          this.audio,
          this.braille,
          this.text
        );
      case Keymap.MOVE_LEFT:
        return new MoveLeftCommand(
          this.plot,
          this.audio,
          this.braille,
          this.text
        );

      case Keymap.TOGGLE_BRAILLE:
        return new ToggleBraille(this.braille);
      case Keymap.TOGGLE_TEXT:
        return new ToggleText(this.text);
      case Keymap.TOGGLE_AUDIO:
        return new ToggleAudio(this.audio);

      case Keymap.DESCRIBE_X:
        return new DescribeXCommand(this.plot, this.text);
      case Keymap.DESCRIBE_Y:
        return new DescribeYCommand(this.plot, this.text);
      case Keymap.DESCRIBE_POINT:
        return new DescribePointCommand(
          this.plot,
          this.audio,
          this.braille,
          this.text
        );

      default:
        throw new Error(`Unsupported key: ${key}`);
    }
  }

  public register(): void {
    for (const [key, command] of this.bindings.entries()) {
      hotkeys(key, (event: KeyboardEvent): void => {
        event.preventDefault();
        command.execute(event);
      });
    }
  }

  public unregister(): void {
    this.bindings.clear();
    hotkeys.unbind();
  }
}
