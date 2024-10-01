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
import {
  ToggleAudio,
  ToggleBraille,
  ToggleText,
  ToggleCommandScope,
} from './command/toggle';

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

  // Scopes
  LIMITED_SCOPE = 'l',

  // Special Functions
  ESCAPE = 'esc',
}

interface CommandConfig {
  scopes: string[];
  createCommand: (...args: any[]) => Command;
}

const commandConfigs: {[key: string]: CommandConfig} = {
  [Keymap.MOVE_UP]: {
    scopes: ['default'],
    createCommand: (plot, audio, braille, text) =>
      new MoveUpCommand(plot, audio, braille, text),
  },
  [Keymap.MOVE_DOWN]: {
    scopes: ['default'],
    createCommand: (plot, audio, braille, text) =>
      new MoveDownCommand(plot, audio, braille, text),
  },
  [Keymap.MOVE_RIGHT]: {
    scopes: ['default'],
    createCommand: (plot, audio, braille, text) =>
      new MoveRightCommand(plot, audio, braille, text),
  },
  [Keymap.MOVE_LEFT]: {
    scopes: ['default'],
    createCommand: (plot, audio, braille, text) =>
      new MoveLeftCommand(plot, audio, braille, text),
  },
  [Keymap.TOGGLE_BRAILLE]: {
    scopes: ['default'],
    createCommand: braille => new ToggleBraille(braille),
  },
  [Keymap.TOGGLE_TEXT]: {
    scopes: ['default'],
    createCommand: text => new ToggleText(text),
  },
  [Keymap.TOGGLE_AUDIO]: {
    scopes: ['default'],
    createCommand: audio => new ToggleAudio(audio),
  },
  [Keymap.DESCRIBE_X]: {
    scopes: ['limited'],
    createCommand: (plot, text) => new DescribeXCommand(plot, text),
  },
  [Keymap.DESCRIBE_Y]: {
    scopes: ['limited'],
    createCommand: (plot, text) => new DescribeYCommand(plot, text),
  },
  [Keymap.DESCRIBE_POINT]: {
    scopes: ['default'],
    createCommand: (plot, audio, braille, text) =>
      new DescribePointCommand(plot, audio, braille, text),
  },
  [Keymap.ESCAPE]: {
    scopes: ['default', 'limited'],
    createCommand: (keyBinding: KeyBinding) =>
      new ToggleCommandScope(keyBinding),
  },
};
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

  private createBindings(): Map<string, Command> {
    const bindings = new Map<string, Command>();

    for (const key of Object.values(Keymap)) {
      if (key === Keymap.LIMITED_SCOPE) {
        bindings.set(key, {
          execute: () => {
            this.scope = this.scope === 'default' ? 'limited' : 'default';
            console.log(`Scope updated to: ${this.scope}`);
            this.unregister();
            this.register();
          },
        });
        continue;
      }
      const commandConfig = commandConfigs[key];
      if (commandConfig) {
        switch (key) {
          case Keymap.TOGGLE_BRAILLE:
            bindings.set(key, commandConfig.createCommand(this.braille));
            break;
          case Keymap.TOGGLE_TEXT:
            bindings.set(key, commandConfig.createCommand(this.text));
            break;
          case Keymap.TOGGLE_AUDIO:
            bindings.set(key, commandConfig.createCommand(this.audio));
            break;
          case Keymap.DESCRIBE_X:
          case Keymap.DESCRIBE_Y:
            bindings.set(
              key,
              commandConfig.createCommand(this.plot, this.text)
            );
            break;
          case Keymap.DESCRIBE_POINT:
          case Keymap.MOVE_UP:
          case Keymap.MOVE_DOWN:
          case Keymap.MOVE_RIGHT:
          case Keymap.MOVE_LEFT:
            bindings.set(
              key,
              commandConfig.createCommand(
                this.plot,
                this.audio,
                this.braille,
                this.text
              )
            );
            break;
          case Keymap.ESCAPE:
            bindings.set(key, commandConfig.createCommand(this));
            break;
          default:
            console.log(key, 'is Unsupported');
        }
      }
    }

    return bindings;
  }

  // private getCommand(key: string): Command | undefined {
  //   if (key === Keymap.LIMITED_SCOPE) {
  //     this.scope = this.scope === 'default' ? 'limited' : 'default';
  //     return undefined;
  //   }

  //   const commandConfig = commandConfigs[key];
  //   if (!commandConfig || !commandConfig.scopes.includes(this.scope)) {
  //     return undefined;
  //   }

  //   return this.bindings.get(key);
  // }

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
      if (
        key === Keymap.LIMITED_SCOPE ||
        commandConfigs[key].scopes.includes(this.scope)
      ) {
        console.log(`Key pressed: ${key}`, `Scope: ${this.scope}`);
        hotkeys(key, (event: KeyboardEvent): void => {
          event.preventDefault();
          command.execute(event);
        });
      }
    }
  }

  public unregister(): void {
    for (const [key] of this.bindings.entries()) {
      if (key !== Keymap.LIMITED_SCOPE && key !== Keymap.ESCAPE) {
        hotkeys.unbind(key);
      }
    }
  }
}
