export default class Command {
  private readonly executeAction: () => void;

  constructor(executeAction: () => void) {
    this.executeAction = executeAction;
  }

  public execute(): void {
    this.executeAction();
  }
}
