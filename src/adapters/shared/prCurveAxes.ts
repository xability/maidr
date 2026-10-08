/**
 * Reading a precision-recall curve off the axes it is drawn against.
 *
 * Most charting libraries have no precision-recall series: scikit-learn's
 * `PrecisionRecallDisplay`, TensorBoard's PR curves and a hand-drawn curve are
 * all an ordinary line of precision against recall. Where a library gives a
 * series no slot to declare one in, the axes are the only thing that says
 * what the line is -- the reading the Vega-Lite adapter gives the same chart
 * (#1366). Both axes have to say it, exactly, and the points have to agree.
 */

/**
 * Whether an axis label is exactly one rate's name, case and surrounding
 * space aside.
 *
 * @param label - The axis label, with any decoration the library adds removed
 * @param rate - The rate's name, in lower case
 * @returns True when the label names that rate and nothing else
 */
export function namesRate(label: string | undefined, rate: 'recall' | 'precision'): boolean {
  return typeof label === 'string' && label.trim().toLowerCase() === rate;
}

/**
 * Whether a value is a rate: a finite number from 0 to 1.
 *
 * @param value - A coordinate
 * @returns True for a fraction of one
 */
function isRate(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Whether lines drawn against two axes are precision-recall curves: the x
 * axis named exactly `recall` and the y axis `precision`, and every point of
 * every line a number from 0 to 1 on both. A chart drawn the other way round,
 * a label such as "Recall at k", or rates written as percentages keep the
 * line reading, which is never wrong about a line.
 *
 * @param xLabel - The x axis label
 * @param yLabel - The y axis label
 * @param lines - The lines' points, one array per line
 * @returns True for precision-recall curves
 */
export function drawsPrCurves(
  xLabel: string | undefined,
  yLabel: string | undefined,
  lines: readonly (readonly { x: unknown; y: unknown }[])[],
): boolean {
  return namesRate(xLabel, 'recall')
    && namesRate(yLabel, 'precision')
    && lines.some(points => points.length > 0)
    && lines.every(points => points.every(point => isRate(point.x) && isRate(point.y)));
}
