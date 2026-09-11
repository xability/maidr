import { attachJosa, isJosaPair } from '@util/i18n/josa';

describe('attachJosa', () => {
  it('should pick the consonant form after a syllable with a final consonant', () => {
    expect(attachJosa('가격', '은는')).toBe('가격은');
    expect(attachJosa('가격', '이가')).toBe('가격이');
    expect(attachJosa('가격', '을를')).toBe('가격을');
    expect(attachJosa('가격', '과와')).toBe('가격과');
    expect(attachJosa('가격', '으로')).toBe('가격으로');
  });

  it('should pick the vowel form after a syllable without a final consonant', () => {
    expect(attachJosa('온도', '은는')).toBe('온도는');
    expect(attachJosa('온도', '이가')).toBe('온도가');
    expect(attachJosa('온도', '을를')).toBe('온도를');
    expect(attachJosa('온도', '과와')).toBe('온도와');
    expect(attachJosa('온도', '으로')).toBe('온도로');
  });

  it('should use 로 after ㄹ', () => {
    expect(attachJosa('서울', '으로')).toBe('서울로');
    expect(attachJosa('서울', '은는')).toBe('서울은');
  });

  it('should read digits the way Korean pronounces them', () => {
    expect(attachJosa('1', '은는')).toBe('1은');
    expect(attachJosa('2', '은는')).toBe('2는');
    expect(attachJosa('10', '이가')).toBe('10이');
  });

  it('should treat most Latin endings as vowels and l, m, n as consonants', () => {
    expect(attachJosa('Price', '은는')).toBe('Price는');
    expect(attachJosa('Team', '은는')).toBe('Team은');
    expect(attachJosa('Region', '이가')).toBe('Region이');
    expect(attachJosa('Total', '으로')).toBe('Total로');
  });

  it('should judge the last pronounceable character, skipping closing punctuation', () => {
    expect(attachJosa('값(원)', '은는')).toBe('값(원)은');
    expect(attachJosa('온도.', '은는')).toBe('온도.는');
  });

  it('should fall back to the vowel form when nothing can be judged', () => {
    expect(attachJosa('', '은는')).toBe('는');
    expect(attachJosa('%', '이가')).toBe('%가');
  });

  it('should leave the word alone for an unknown pair', () => {
    expect(attachJosa('가격', 'xyz')).toBe('가격');
    expect(isJosaPair('은는')).toBe(true);
    expect(isJosaPair('xyz')).toBe(false);
  });
});
