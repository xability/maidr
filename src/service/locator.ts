import type { ChatService } from '@service/chat';
import type { ControllerService } from '@service/controller';
import type { HelpService } from '@service/help';
import type { SettingsService } from '@service/settings';

export class ServiceLocator {
  private static locator: ServiceLocator;

  private controller: ControllerService | null;

  private constructor() {
    this.controller = null;
  }

  public static get instance(): ServiceLocator {
    if (!ServiceLocator.locator) {
      ServiceLocator.locator = new ServiceLocator();
    }
    return ServiceLocator.locator;
  }

  public get chat(): ChatService {
    if (!this.controller) {
      throw new Error('Chat has not been initialized.');
    }
    return this.controller.chat;
  }

  public get help(): HelpService {
    if (!this.controller) {
      throw new Error('Help has not been initialized.');
    }
    return this.controller.help;
  }

  public get settings(): SettingsService {
    if (!this.controller) {
      throw new Error('Settings has not been initialized.');
    }
    return this.controller.settings;
  }

  public setController(controller: ControllerService | null): void {
    this.controller = controller;
  }
}
