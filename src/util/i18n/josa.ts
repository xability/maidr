/**
 * Korean postpositional particles (조사) whose form depends on whether the
 * preceding syllable ends in a consonant (받침).
 *
 * A template cannot hard-code the particle because the word it attaches to
 * is usually chart data — an axis label, a category name — that the author
 * chose. "가격은" and "온도는" both read naturally; "가격는" does not. A
 * translation therefore writes `{label|은는}` and the pair is resolved here
 * against the actual word at render time.
 *
 * Each entry lists the form after a consonant first and the form after a
 * vowel second.
 */
const JOSA_PAIRS: Record<string, readonly [string, string]> = {
  은는: ['은', '는'],
  이가: ['이', '가'],
  을를: ['을', '를'],
  과와: ['과', '와'],
  으로: ['으로', '로'],
  이다: ['이다', '다'],
};

const HANGUL_SYLLABLE_START = 0xAC00;
const HANGUL_SYLLABLE_END = 0xD7A3;
const JONGSEONG_COUNT = 28;
/** Index of ㄹ among the 28 possible final consonants (0 = none). */
const RIEUL_JONGSEONG = 8;

/**
 * Digits, as Korean reads them: 일, 이, 삼, 사, 오, 육, 칠, 팔, 구, 영.
 * `true` where the reading ends in a consonant.
 */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  0: true,
  1: true,
  2: false,
  3: true,
  4: false,
  5: false,
  6: true,
  7: true,
  8: true,
  9: false,
};

/**
 * Latin letters whose usual Korean transliteration keeps a final consonant.
 * Most English endings gain a vowel in Korean ("count" → 카운트), so only
 * these three are treated as closed syllables: "team" → 팀, "region" → 리전,
 * "total" → 토탈.
 */
const LATIN_HAS_BATCHIM = new Set(['l', 'm', 'n']);

interface Ending {
  hasBatchim: boolean;
  /** Whether the final consonant is ㄹ, which takes 로 rather than 으로. */
  isRieul: boolean;
}

/**
 * Reads the last pronounceable character of a word.
 *
 * Trailing punctuation and closing brackets are skipped so "값(원)" and
 * "5]" are judged on the character a reader actually hears last.
 * @param word - The word the particle attaches to
 * @returns How that word ends, or null when nothing in it can be judged
 */
function ending(word: string): Ending | null {
  const trimmed = word.replace(/[\s)\]}"'»”’.,!?%]+$/u, '');
  if (trimmed.length === 0) {
    return null;
  }
  const last = trimmed[trimmed.length - 1];
  const code = last.charCodeAt(0);
  if (code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END) {
    const jongseong = (code - HANGUL_SYLLABLE_START) % JONGSEONG_COUNT;
    return { hasBatchim: jongseong !== 0, isRieul: jongseong === RIEUL_JONGSEONG };
  }
  if (last in DIGIT_HAS_BATCHIM) {
    return { hasBatchim: DIGIT_HAS_BATCHIM[last], isRieul: false };
  }
  const lower = last.toLowerCase();
  if (lower >= 'a' && lower <= 'z') {
    return { hasBatchim: LATIN_HAS_BATCHIM.has(lower), isRieul: lower === 'l' };
  }
  return null;
}

/**
 * Whether `pair` names a particle pair this module can resolve.
 * @param pair - The modifier text after `|` in a placeholder
 * @returns True for a known pair such as `은는`
 */
export function isJosaPair(pair: string): boolean {
  return Object.hasOwn(JOSA_PAIRS, pair);
}

/**
 * Appends the correct form of a Korean particle to a word.
 *
 * A word whose ending cannot be judged — a symbol, an empty string — gets
 * the vowel form, which is the more common reading of foreign words.
 * @param word - The word the particle attaches to
 * @param pair - Which particle, as its two forms run together: `은는`, `이가`, `을를`, `과와`, `으로`, `이다`
 * @returns The word with the particle attached
 */
export function attachJosa(word: string, pair: string): string {
  const forms = JOSA_PAIRS[pair];
  if (!forms) {
    return word;
  }
  const end = ending(word);
  if (!end) {
    return `${word}${forms[1]}`;
  }
  if (pair === '으로' && end.isRieul) {
    return `${word}로`;
  }
  return `${word}${end.hasBatchim ? forms[0] : forms[1]}`;
}
