export class Stack<T> {
  private readonly items: T[];

  public constructor() {
    this.items = new Array<T>();
  }

  public push(item: T): void {
    this.items.push(item);
  }

  public pop(): T | undefined {
    return this.items.pop();
  }

  public peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  public removeLast(element: T, deleteCount = 1): boolean {
    const index = this.items.lastIndexOf(element);
    if (index !== -1) {
      this.items.splice(index, deleteCount);
      return true;
    } else {
      return false;
    }
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public size(): number {
    return this.items.length;
  }

  public clear(): void {
    this.items.length = 0;
  }
}
