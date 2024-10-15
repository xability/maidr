import hotkeys from 'hotkeys-js';
import AudioManager from './manager/audio';
import BrailleManager from './manager/braille';
import {Command, CommandContext} from './command/command';
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
import {DefaultKeyScope, LabelKeyScope} from './key_toggle_scope';

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
  DESCRIBE_X = 'x',
  DESCRIBE_Y = 'y',
  DESCRIBE_POINT = 'space',

  // Key Scope
  SET_DEFAULT_SCOPE = 'esc',
  SET_LABEL_SCOPE = 'l',
}

export default class KeyBinding {
  private readonly bindings: Map<string, Command>;

  private readonly plot: Plot;
  private readonly audio: AudioManager;
  private readonly braille: BrailleManager;
  public scope = 'default';
  private readonly text: TextManager;

  constructor(commandContext: CommandContext) {
    this.plot = commandContext.plot;
    this.audio = commandContext.audio;
    this.braille = commandContext.braille;
    this.text = commandContext.text;

    this.bindings = this.createBindings();
  }

  // returns scope of the provided key
  private getScopeForKey(key: string): string {
    switch (key) {
      case Keymap.MOVE_UP:
      case Keymap.MOVE_DOWN:
      case Keymap.MOVE_RIGHT:
      case Keymap.MOVE_LEFT:
      case Keymap.TOGGLE_AUDIO:
      case Keymap.TOGGLE_BRAILLE:
      case Keymap.TOGGLE_TEXT:
      case Keymap.DESCRIBE_POINT:
      case Keymap.SET_LABEL_SCOPE:
        return Constant.HOTKEYS_SCOPE_DEFAULT;
      case Keymap.SET_DEFAULT_SCOPE:
      case Keymap.DESCRIBE_X:
      case Keymap.DESCRIBE_Y:
        return Constant.HOTKEYS_SCOPE_LABEL;
      default:
        return Constant.HOTKEYS_SCOPE_DEFAULT;
    }
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

      // Sets key binding scope
      case Keymap.SET_DEFAULT_SCOPE:
        return new DefaultKeyScope(this.text);
      case Keymap.SET_LABEL_SCOPE:
        return new LabelKeyScope(this.text);
      default:
        throw new Error(`Unsupported key: ${key}`);
    }
  }

  public register(): void {
    hotkeys.filter = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Allow keybindings only for MAIDR braille input.
      if (target.isContentEditable) {
        return target.id === Constant.BRAILLE_INPUT_ID;
      }

      // Allow keybindings for all other non-editable elements.
      return true;
    };
    hotkeys.unbind();
    console.log(this.scope);
    // Register all bindings.
    for (const [key, command] of this.bindings.entries()) {
      const scope = this.getScopeForKey(key);
      hotkeys(key, {scope}, (event: KeyboardEvent): void => {
        event.preventDefault();
        // Check the scope along with the command execution
        if (hotkeys.getScope() === scope) {
          console.log(`KeyBinding - ${key} - ${scope}`);
          command.execute(event);
        }
      });
    }
  }
  public unregister(): void {
    this.bindings.clear();
    hotkeys.unbind();
  }
}
