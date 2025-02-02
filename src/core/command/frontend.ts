import FrontendManager from "../service/frontend";
import { Command } from "./command";

export class HelpMenuCommand implements Command {
  private readonly frontendManager: FrontendManager;

  constructor(frontendManager: FrontendManager) {
    this.frontendManager = frontendManager;
  }

  public execute(): void {
    this.frontendManager.execute("HELP_MENU");
  }
}
