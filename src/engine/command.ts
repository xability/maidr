import Action from "./Action";

export abstract class Command {
  protected readonly action: Action;

  protected constructor(action: Action) {
    this.action = action;
  }

  public abstract execute(event?: KeyboardEvent): void;
}

export class MoveUpCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  public execute(): void {
    this.action.moveUp();
  }
}

export class MoveDownCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  public execute(): void {
    this.action.moveDown();
  }
}

export class MoveLeftCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  public execute(): void {
    this.action.moveLeft();
  }
}

export class MoveRightCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  public execute(): void {
    this.action.moveRight();
  }
}

export class ToggleSoundCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  public execute(): void {
    this.action.toggleSound();
  }
}

export class ToggleTextCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  public execute(): void {
    this.action.toggleText();
  }
}

export class ToggleBrailleCommand extends Command {
  constructor(action: Action) {
    super(action);
  }

  execute(): void {
    this.action.toggleBraille();
  }
}
