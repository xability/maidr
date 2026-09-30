/**
 * @jest-environment jsdom
 */
import type { MaidrLayer, WordCloudPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/** Two terms, so a selector matching three glyphs cannot be paired up. */
const TERMS: WordCloudPoint[] = [
  { x: 'neural', y: 128 },
  { x: 'machine', y: 412 },
];

/**
 * Create a word cloud layer whose selector matches every `text.w` glyph.
 * @returns Word cloud layer definition
 */
function createLayer(): MaidrLayer {
  return {
    id: 'test-word-cloud-highlight',
    type: TraceType.WORD_CLOUD,
    selectors: 'text.w',
    data: TERMS,
  };
}

describe('WordCloudTrace highlight resolution', () => {
  beforeEach(() => {
    // Three glyphs for two terms: a title sharing the class, say.
    document.body.innerHTML = `
      <svg>
        <text class="w">Title</text>
        <text class="w">neural</text>
        <text class="w">machine</text>
      </svg>`;
  });

  test('leaves no hidden clones behind when the glyph count does not match', () => {
    // Declining after cloning left every copy in the chart for dispose()
    // never to reach -- and each later resolution matched the copies too.
    for (let i = 0; i < 2; i++) {
      TraceFactory.create(createLayer()).dispose();
    }

    expect(document.querySelectorAll('text').length).toBe(3);
  });
});
