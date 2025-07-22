import type { MovableDirection } from '@type/movable';

export function isBoundary<T>(row: number, col: number, grid: T[][], direction: MovableDirection): boolean {
  switch (direction) {
    case 'UPWARD':
      return row >= grid.length - 1;
    case 'DOWNWARD':
      return row <= 0;
    case 'FORWARD':
      return col >= grid[row].length - 1;
    case 'BACKWARD':
      return col <= 0;
    default:
      return false;
  }
}
