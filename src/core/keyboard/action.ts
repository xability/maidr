export default interface Action {
  moveUp(): void;
  moveDown(): void;
  moveLeft(): void;
  moveRight(): void;

  toggleSound(): void;
  toggleBraille(): void;
  toggleText(): void;

  repeatPoint(): void;
}
