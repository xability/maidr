import type { ControllerService } from '@service/controller';
import type { HelpService } from '@service/help';

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

  public get help(): HelpService {
    if (!this.controller) {
      throw new Error('Help has not been initialized.');
    }
    return this.controller.help;
  }

  public setController(controller: ControllerService | null): void {
    this.controller = controller;
  }
}
