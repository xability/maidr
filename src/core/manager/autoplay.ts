import {Movable} from '../interface';

export enum AutoplayDirection {
  UPWARD,
  DOWNWARD,
  FORWARD,
  BACKWARD,
}

export class AutoplayManager {
  private playId?: NodeJS.Timeout | null;
  private rate: number;
  private currentDirection?: AutoplayDirection;

  private readonly movable: Movable;

  constructor(movable: Movable) {
    this.movable = movable;
    this.rate = 250;
  }

  public start(direction: AutoplayDirection): void {
    stop();
    this.currentDirection = direction;
    const move = this.getMove(direction);
    this.playId = setInterval(() => {
      if (this.movable.isWithinRange()) {
        move();
      } else {
        this.stop();
      }
    }, this.rate);
  }

  private getMove(direction: AutoplayDirection): () => void {
    switch (direction) {
      case AutoplayDirection.UPWARD:
        return () => this.movable.moveUp();

      case AutoplayDirection.DOWNWARD:
        return () => this.movable.moveDown();

      case AutoplayDirection.FORWARD:
        return () => this.movable.moveRight();

      case AutoplayDirection.BACKWARD:
        return () => this.movable.moveLeft();
    }
  }

  public stop(): void {
    if (this.playId) {
      clearInterval(this.playId);
      this.playId = null;
    }
  }

  private restart(): void {
    if (this.playId) {
      clearInterval(this.playId);
    }

    if (this.currentDirection) {
      this.start(this.currentDirection);
    }
  }

  public speedUp(): void {}

  public speedDown(): void {}
}
