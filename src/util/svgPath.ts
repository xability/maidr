/**
 * Reading the vertices out of an SVG path's `d` attribute.
 *
 * Shared by the line family, which places a marker on each vertex, and the
 * scatter, which centres an inline marker on the box they span.
 */

/** One vertex of a path, in the path's own user units. */
export interface PathVertex {
  x: number;
  y: number;
}

/**
 * Splits a path `d` attribute into commands, each with its argument text.
 *
 * `A`/`a` is listed here but absent from {@link SVG_PATH_ARITY}, so an arc is
 * recognised and then skipped. Both halves matter. It has to be *recognised*
 * because the argument group runs to the next command letter: leaving `A` out
 * of the class would sweep an arc's flags and coordinates into the preceding
 * command's arguments, where they are consumed as further repetitions of that
 * command's arity. Measured on `M 0 0 L 10 10 A 5 5 0 0 1 20 20 L 30 30`,
 * that fabricated three vertices — `(5,5)`, `(0,0)`, `(1,20)` — rather than
 * leaving the arc merely unread.
 *
 * It is then *skipped* because an arc's flag arguments are legally written
 * without separators — `a1 1 0 011 1` is three flags and a coordinate pair —
 * so a plain number scan cannot tell where the endpoint starts. That leaves
 * the current point stale across an arc, which only misplaces a *relative*
 * command that follows one; line-family geometry contains neither.
 */
const SVG_PATH_COMMAND_REGEX = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;

/** One number of a path argument list, including exponent notation. */
const SVG_PATH_NUMBER_REGEX = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/**
 * How many numbers each path command takes per repetition.
 *
 * A command may carry several repetitions in one argument list — `L1 2 3 4`
 * is two linetos — so the arity is what the argument list is walked in.
 *
 * `Z` and `A` are absent, and an absent entry contributes no vertices: the
 * walk's bound is `i + arity <= args.length`, and `undefined` makes that
 * comparison false at once. `Z` is handled before the lookup because it still
 * moves the pen; `A` is not, for the reason
 * {@link SVG_PATH_COMMAND_REGEX} gives.
 */
const SVG_PATH_ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
};

/**
 * The vertices an SVG path `d` attribute draws.
 *
 * One vertex per drawing command, taken at that command's endpoint — which
 * for a curve is where it lands, not where its control points sit. The path
 * is walked rather than pattern-matched because the endpoint of `H`, `V`,
 * and every relative command is only defined against the current point,
 * which a regex over the whole string cannot know.
 *
 * That is what this used to be, and it left `H`/`V` unread. A staircase is
 * precisely the shape a renderer draws with them, every segment being
 * axis-aligned, so a Plotly step chart parsed to its single `M` and nothing
 * else: measured, `M0,399H246.67V147H493.33V273H740V21` yielded 1 vertex for
 * 4 samples. `LineTrace.reconcilePathCoordinates` then padded with `NaN`, the series
 * was marked failed, and `mapToSvgElements` returned null — correct audio,
 * braille and text, no highlight, and nothing anywhere saying why (#907).
 *
 * `M`, `L` and `C` behave exactly as they did; a cubic still contributes its
 * endpoint alone.
 *
 * @param pathD - The `d` attribute of the rendered path
 * @returns The vertices, in drawing order
 */
export function pathVertices(pathD: string): PathVertex[] {
  const coordinates: PathVertex[] = [];
  let x = 0;
  let y = 0;
  // Where the current subpath began, which is where `Z` returns to.
  let startX = 0;
  let startY = 0;

  SVG_PATH_COMMAND_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = SVG_PATH_COMMAND_REGEX.exec(pathD);
  while (match !== null) {
    const command = match[1];
    const absolute = command.toUpperCase();
    const isRelative = command !== absolute;
    const args = (match[2].match(SVG_PATH_NUMBER_REGEX) ?? []).map(Number);
    match = SVG_PATH_COMMAND_REGEX.exec(pathD);

    if (absolute === 'Z') {
      // A closepath draws back to a vertex already recorded, so it moves the
      // pen without adding a point. Emitting one would duplicate the start.
      x = startX;
      y = startY;
      continue;
    }

    const arity = SVG_PATH_ARITY[absolute];
    for (let i = 0; i + arity <= args.length; i += arity) {
      if (absolute === 'H') {
        x = isRelative ? x + args[i] : args[i];
      } else if (absolute === 'V') {
        y = isRelative ? y + args[i] : args[i];
      } else {
        // The endpoint is the last pair of every remaining command; the
        // control points before it are not on the drawn path.
        const endX = args[i + arity - 2];
        const endY = args[i + arity - 1];
        x = isRelative ? x + endX : endX;
        y = isRelative ? y + endY : endY;
      }

      // Only the first pair of a moveto starts a subpath; the repetitions
      // after it are implicit linetos, per the SVG path grammar.
      if (absolute === 'M' && i === 0) {
        startX = x;
        startY = y;
      }
      coordinates.push({ x, y });
    }
  }

  return coordinates;
}
