import { drawsPrCurves, namesRate } from '@adapters/shared/prCurveAxes';
import { describe, expect, it } from '@jest/globals';

const CURVE = [[{ x: 0, y: 1 }, { x: 0.5, y: 0.8 }, { x: 1, y: 0.4 }]];

describe('reading a precision-recall curve off its axes', () => {
  it('names a rate only by the rate itself, case and space aside', () => {
    expect(namesRate(' Recall ', 'recall')).toBe(true);
    expect(namesRate('Recall at k', 'recall')).toBe(false);
    expect(namesRate(undefined, 'precision')).toBe(false);
  });

  it('reads lines of precision against recall as curves', () => {
    expect(drawsPrCurves('Recall', 'Precision', CURVE)).toBe(true);
  });

  it('keeps a chart drawn the other way round a line', () => {
    expect(drawsPrCurves('Precision', 'Recall', CURVE)).toBe(false);
  });

  it('keeps rates written as percentages a line', () => {
    expect(drawsPrCurves('Recall', 'Precision', [[{ x: 0, y: 100 }, { x: 50, y: 80 }]])).toBe(false);
  });

  it('keeps a chart with no points a line', () => {
    expect(drawsPrCurves('Recall', 'Precision', [[]])).toBe(false);
  });
});
