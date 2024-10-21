import hotkeys from 'hotkeys-js';
import AudioManager from './manager/audio';
import {
  AutoplayBackwardCommand,
  AutoplayForwardCommand
} from "./command/autoplay";
import {AutoplayManager} from "./manager/autoplay";
import BrailleManager from './manager/braille';
import Command from './command/command';
import Constant from '../util/constant';
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

  // Autoplay
  AUTOPLAY_FORWARD = 'command+shift+right',
  AUTOPLAY_BACKWARD = 'command+shift+left',

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
  private readonly autoplay: AutoplayManager;

  constructor(
    plot: Plot,
    audio: AudioManager,
    braille: BrailleManager,
    text: TextManager,
    autoplay: AutoplayManager,
  ) {
    this.plot = plot;
    this.audio = audio;
    this.braille = braille;
    this.text = text;
    this.autoplay = autoplay;

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
        return new MoveUpCommand(this.plot);
      case Keymap.MOVE_DOWN:
        return new MoveDownCommand(this.plot);
      case Keymap.MOVE_RIGHT:
        return new MoveRightCommand(this.plot);
      case Keymap.MOVE_LEFT:
        return new MoveLeftCommand(this.plot);

      case Keymap.AUTOPLAY_FORWARD:
        return new AutoplayForwardCommand(this.autoplay);
      case Keymap.AUTOPLAY_BACKWARD:
        return new AutoplayBackwardCommand(this.autoplay);

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
    hotkeys.filter = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Allow keybindings only for MAIDR braille input.
      if (target.isContentEditable) {
        return target.id.startsWith(Constant.BRAILLE_INPUT);
      }

      // Allow keybindings for all other non-editable elements.
      return true;
    };

    // Register all bindings.
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
