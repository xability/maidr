import type { CommandExecutor } from '@service/commandExecutor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { DisplayViewModel } from '@state/viewModel/displayViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import type { Disposable } from '@type/disposable';
import type { RotorNavigationViewModel } from './rotorNavigationViewModel';
import type { SettingsViewModel } from './settingsViewModel';
import type { TextViewModel } from './textViewModel';

export interface ViewModelMap {
  braille: BrailleViewModel;
  chat: ChatViewModel;
  commandExecutor: CommandExecutor;
  commandPalette: CommandPaletteViewModel;
  display: DisplayViewModel;
  goToExtrema: GoToExtremaViewModel;
  help: HelpViewModel;
  review: ReviewViewModel;
  settings: SettingsViewModel;
  text: TextViewModel;
  rotor: RotorNavigationViewModel;
}

export class ViewModelRegistry implements Disposable {
  private static registry: ViewModelRegistry | null;

  private readonly viewModels: Map<keyof ViewModelMap, ViewModelMap[keyof ViewModelMap]>;

  private constructor() {
    this.viewModels = new Map();
  }

  public static get instance(): ViewModelRegistry {
    if (!this.registry) {
      this.registry = new ViewModelRegistry();
    }
    return this.registry;
  }

  public register<K extends keyof ViewModelMap>(key: K, factory: ViewModelMap[K]): void {
    this.viewModels.set(key, factory);
  }

  public get<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
    if (!this.viewModels.has(key)) {
      throw new Error(`Error while loading view model for ${key}`);
    }
    return this.viewModels.get(key)! as ViewModelMap[K];
  }

  public dispose(): void {
    this.viewModels.clear();
    ViewModelRegistry.registry = null;
  }
}
