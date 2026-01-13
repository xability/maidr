import type { CommandExecutor } from '@service/commandExecutor';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { CommandPaletteViewModel } from '@state/viewModel/commandPaletteViewModel';
import type { DisplayViewModel } from '@state/viewModel/displayViewModel';
import type { GoToExtremaViewModel } from '@state/viewModel/goToExtremaViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { JumpToMarkViewModel } from '@state/viewModel/jumpToMarkViewModel';
import type { ReviewViewModel } from '@state/viewModel/reviewViewModel';
import type { Disposable } from '@type/disposable';
import type { RotorNavigationViewModel } from './rotorNavigationViewModel';
import type { SettingsViewModel } from './settingsViewModel';
import type { TextViewModel } from './textViewModel';

/**
 * Interface mapping view model keys to their corresponding view model types.
 */
export interface ViewModelMap {
  braille: BrailleViewModel;
  chat: ChatViewModel;
  commandExecutor: CommandExecutor;
  commandPalette: CommandPaletteViewModel;
  display: DisplayViewModel;
  goToExtrema: GoToExtremaViewModel;
  help: HelpViewModel;
  jumpToMark: JumpToMarkViewModel;
  review: ReviewViewModel;
  settings: SettingsViewModel;
  text: TextViewModel;
  rotor: RotorNavigationViewModel;
}

/**
 * Singleton registry for managing and accessing view models throughout the application.
 */
export class ViewModelRegistry implements Disposable {
  private static registry: ViewModelRegistry | null;

  private readonly viewModels: Map<keyof ViewModelMap, ViewModelMap[keyof ViewModelMap]>;

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {
    this.viewModels = new Map();
  }

  /**
   * Gets the singleton instance of the ViewModelRegistry.
   * @returns The ViewModelRegistry instance
   */
  public static get instance(): ViewModelRegistry {
    if (!this.registry) {
      this.registry = new ViewModelRegistry();
    }
    return this.registry;
  }

  /**
   * Registers a view model instance with the registry.
   * @param key - The key identifying the view model
   * @param factory - The view model instance to register
   */
  public register<K extends keyof ViewModelMap>(key: K, factory: ViewModelMap[K]): void {
    this.viewModels.set(key, factory);
  }

  /**
   * Retrieves a registered view model by key.
   * @param key - The key identifying the view model
   * @returns The registered view model instance
   * @throws Error if the view model is not found
   */
  public get<K extends keyof ViewModelMap>(key: K): ViewModelMap[K] {
    if (!this.viewModels.has(key)) {
      throw new Error(`Error while loading view model for ${key}`);
    }
    return this.viewModels.get(key)! as ViewModelMap[K];
  }

  /**
   * Disposes the registry and clears all registered view models.
   */
  public dispose(): void {
    this.viewModels.clear();
    ViewModelRegistry.registry = null;
  }
}
