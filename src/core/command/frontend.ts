import FrontendManager from '../manager/frontend';
import {Command} from './command';

export class HelpMenuCommand implements Command {
  private readonly frontendManager: FrontendManager;

  constructor(frontendManager: FrontendManager) {
    this.frontendManager = frontendManager;
  }

  public execute(): void {
    this.frontendManager.execute('HELP_MENU');
  }
}

export class LLMDialogCommand implements Command {
  private readonly frontendManager: FrontendManager;

  constructor(frontendManager: FrontendManager) {
    this.frontendManager = frontendManager;
  }

  public execute(): void {
    this.frontendManager.execute('LLM_DIALOG');
  }
}

export class ConfigurationDialogCommand implements Command {
  private readonly frontendManager: FrontendManager;

  constructor(frontendManager: FrontendManager) {
    this.frontendManager = frontendManager;
  }

  public execute(): void {
    this.frontendManager.execute('CONFIGURATION_DIALOG');
  }
}
