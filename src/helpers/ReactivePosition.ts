import { Position } from "./Position";

export class ReactivePosition extends Position {
  private subscribers: ((x: number, y: number, z: number) => void)[] = [];

  constructor(x = 0, y = 0, z = -1) {
    super(x, y, z);
  }

  set(x: number, y: number, z: number = this.z) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.notifySubscribers();
  }

  subscribe(callback: (x: number, y: number, z: number) => void) {
    this.subscribers.push(callback);
  }

  private notifySubscribers() {
    this.subscribers.forEach((callback) => callback(this.x, this.y, this.z));
  }
}
