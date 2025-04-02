import type { AudioService } from '@service/audio';
import type { ChatService } from '@service/chat';
import type { ControllerService } from '@service/controller';
import type { DisplayService } from '@service/display';
import type { HelpService } from '@service/help';
import type { SettingsService } from '@service/settings';
import type { TextService } from '@service/text';

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

  public get display(): DisplayService {
    if (!this.controller) {
      throw new Error('Display is unavailable');
    }
    return this.controller.display;
  }

  public get audio(): AudioService {
    if (!this.controller) {
      throw new Error('Audio is unavailable');
    }
    return this.controller.audio;
  }

  public get chat(): ChatService {
    if (!this.controller) {
      throw new Error('Chat is unavailable');
    }
    return this.controller.chat;
  }

  public get help(): HelpService {
    if (!this.controller) {
      throw new Error('Help is unavailable');
    }
    return this.controller.help;
  }

  public get settings(): SettingsService {
    if (!this.controller) {
      throw new Error('Settings is unavailable');
    }
    return this.controller.settings;
  }

  public get text(): TextService {
    if (!this.controller) {
      throw new Error('Text is unavailable');
    }
    return this.controller.text;
  }

  public setController(controller: ControllerService | null): void {
    this.controller = controller;
  }
}
