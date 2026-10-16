import { isJoinedSets } from '@adapters/shared/venn';
import { describe, expect, it } from '@jest/globals';

describe('isJoinedSets', () => {
  it('matches the sets joined by ∩ in any order and spacing', () => {
    expect(isJoinedSets('A∩B', ['A', 'B'])).toBe(true);
    expect(isJoinedSets('B∩A', ['A', 'B'])).toBe(true);
    expect(isJoinedSets('A ∩ B', ['A', 'B'])).toBe(true);
    expect(isJoinedSets(' C ∩A∩ B', ['A', 'B', 'C'])).toBe(true);
  });

  it('does not match a name of the author\'s own, even one naming the sets', () => {
    expect(isJoinedSets('A and B', ['A', 'B'])).toBe(false);
    expect(isJoinedSets('Both', ['A', 'B'])).toBe(false);
    expect(isJoinedSets('A∩B', ['A', 'B', 'C'])).toBe(false);
    expect(isJoinedSets('A∩C', ['A', 'B'])).toBe(false);
  });
});
