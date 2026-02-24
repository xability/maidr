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
  review: ReviewViewModel;
  settings: SettingsViewModel;
  text: TextViewModel;
  rotor: RotorNavigationViewModel;
}

/**
 * Registry for managing and accessing view models within a single MAIDR plot instance.
 * Each Controller owns its own ViewModelRegistry for state isolation.
 */
export class ViewModelRegistry implements Disposable {
  private readonly viewModels = new Map<keyof ViewModelMap, ViewModelMap[keyof ViewModelMap]>();

  /**
   * Registers a view model instance with the registry.
   * @param key - The key identifying the view model
   * @param viewModel - The view model instance to register
   */
  public register<K extends keyof ViewModelMap>(key: K, viewModel: ViewModelMap[K]): void {
    this.viewModels.set(key, viewModel);
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
   * Clears all registered view model references.
   * Note: This does NOT dispose individual view models -- the Controller
   * is responsible for disposing each view model before calling this.
   */
  public dispose(): void {
    this.viewModels.clear();
  }
}
