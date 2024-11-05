import {MovableDirection, Movable} from '../interface';

export class AutoplayManager {
  private playId?: NodeJS.Timeout | null;
  private rate: number;
  private currentDirection?: MovableDirection;

  private readonly movable: Movable;

  constructor(movable: Movable) {
    this.movable = movable;
    this.rate = 250;
  }

  public start(direction: MovableDirection): void {
    stop();
    this.currentDirection = direction;
    const move = this.getMove(direction);
    this.playId = setInterval(() => {
      if (this.movable.isMovable(direction)) {
        move();
      } else {
        this.stop();
      }
    }, this.rate);
  }

  private getMove(direction: MovableDirection): () => void {
    switch (direction) {
      case MovableDirection.UPWARD:
        return () => this.movable.moveUp();

      case MovableDirection.DOWNWARD:
        return () => this.movable.moveDown();

      case MovableDirection.FORWARD:
        return () => this.movable.moveRight();

      case MovableDirection.BACKWARD:
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
