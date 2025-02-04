import FrontendService from "../service/frontend";
import { Command } from "./command";

export class HelpMenuCommand implements Command {
  private readonly frontendManager: FrontendService;

  constructor(frontendManager: FrontendService) {
    this.frontendManager = frontendManager;
  }

  public execute(): void {
    this.frontendManager.execute("HELP_MENU");
  }
}
