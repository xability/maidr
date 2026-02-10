/**
 * Generic stack data structure implementation with LIFO (Last In, First Out) behavior.
 * @template T - The type of elements stored in the stack
 */
export class Stack<T> {
  private readonly items: T[];

  /**
   * Creates a new empty stack.
   */
  public constructor() {
    this.items = new Array<T>();
  }

  /**
   * Adds an item to the top of the stack.
   * @param item - The item to push onto the stack
   */
  public push(item: T): void {
    this.items.push(item);
  }

  /**
   * Removes and returns the top item from the stack.
   * @returns The removed item, or undefined if the stack is empty
   */
  public pop(): T | undefined {
    return this.items.pop();
  }

  /**
   * Returns the top item without removing it from the stack.
   * @returns The top item, or undefined if the stack is empty
   */
  public peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  /**
   * Removes the last occurrence of a specific element from the stack.
   * @param element - The element to remove
   * @param deleteCount - Number of elements to delete (default: 1)
   * @returns True if the element was found and removed, false otherwise
   */
  public removeLast(element: T, deleteCount = 1): boolean {
    const index = this.items.lastIndexOf(element);
    if (index !== -1) {
      this.items.splice(index, deleteCount);
      return true;
    } else {
      return false;
    }
  }

  /**
   * Checks if the stack is empty.
   * @returns True if the stack contains no items, false otherwise
   */
  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Returns the number of items in the stack.
   * @returns The count of items currently in the stack
   */
  public size(): number {
    return this.items.length;
  }

  /**
   * Removes all items from the stack.
   */
  public clear(): void {
    this.items.length = 0;
  }
}
