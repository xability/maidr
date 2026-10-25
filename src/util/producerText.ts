import type { Maidr, MaidrLayer, MaidrSubplot } from '@type/grammar';

/**
 * The text fields of a chart, made safe to read as text.
 *
 * The grammar types a chart's title, subtitle and caption, its layers' titles,
 * names and type labels, and every axis label as strings, and the model reads
 * them with string methods. A producer writing out a value it does not have
 * can put something else there: r-maidr wrote a layer with no title as
 * `"title": {}`, R's empty list (xability/r-maidr#402). The `.trim()` the
 * description and the title announcement call on a layer's title then threw,
 * so `d` opened no description and `L`, `T` said nothing.
 *
 * So the chart's text fields are read once, as the chart is built: a string is
 * kept, a number or a boolean is read as the string it prints as, and anything
 * else is dropped, as if the producer had written nothing there, with a console
 * warning naming the field. Every other field is passed on as given.
 *
 * The list is deliberate: these are the fields the model reads as plain text.
 * `selectors` has its own reader (`src/util/selectors.ts`), and the values and
 * labels inside a layer's `data` are read by each trace type, which knows
 * their shape.
 */

/** Warnings already given, so a chart built again does not repeat them. */
const reported = new Set<string>();

/**
 * Text as the model reads it, or undefined when the value is not text.
 *
 * @param value - The field as the producer wrote it
 * @param where - Where the field is, for the warning: `the chart's "title"`
 * @returns The text, or undefined
 */
export function producerText(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null || typeof value === 'string') {
    return value ?? undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const key = `${where}\u0000${describe(value)}`;
  if (!reported.has(key)) {
    reported.add(key);
    console.warn(
      `[MAIDR] ${where} is ${describe(value)}, not text, so it is read as if it were absent. `
      + 'Write it as a string, or leave it out.',
    );
  }
  return undefined;
}

/**
 * A value as the warning names it.
 *
 * @param value - A value that is not text
 * @returns `{}`, `[]`, or the value's JSON
 */
function describe(value: unknown): string {
  try {
    return JSON.stringify(value)?.slice(0, 40) ?? typeof value;
  } catch {
    return typeof value;
  }
}

/**
 * A field set to its text, or left out when it has none, so that a field the
 * producer wrote as something else reads exactly as a field it left out.
 *
 * @param object - The object the field is on
 * @param field - The field
 * @param where - Where the field is, for the warning
 * @returns The object, the same one when the field was already text or absent
 */
function withText<T extends object>(object: T, field: string, where: string): T {
  const value: unknown = (object as Record<string, unknown>)[field];
  if (value === undefined || typeof value === 'string') {
    return object;
  }
  const text = producerText(value, where);
  const copy: Record<string, unknown> = { ...(object as Record<string, unknown>) };
  if (text === undefined) {
    delete copy[field];
  } else {
    copy[field] = text;
  }
  return copy as unknown as T;
}

/**
 * An axes object with each axis' label made text.
 *
 * @param axes - The axes
 * @param where - Whose axes they are, for the warning
 * @returns The axes, the same object when every label was already text
 */
function axesWithText<A extends object>(axes: A | undefined, where: string): A | undefined {
  if (axes === null || typeof axes !== 'object') {
    return axes;
  }
  let result: Record<string, unknown> = axes as Record<string, unknown>;
  for (const axis of ['x', 'y', 'z']) {
    const config = result[axis];
    if (config === null || typeof config !== 'object') {
      continue;
    }
    const read = withText(config, 'label', `${where} ${axis} axis "label"`);
    if (read !== config) {
      result = { ...result, [axis]: read };
    }
  }
  return result as A;
}

/**
 * A layer with its title, name, type label and axis labels made text.
 *
 * @param layer - The layer as the producer wrote it
 * @returns The layer, the same object when every one of them was already text
 */
function layerWithText(layer: MaidrLayer): MaidrLayer {
  if (layer === null || typeof layer !== 'object') {
    return layer;
  }
  const where = `Layer "${String(layer.id)}" (${String(layer.type)})`;
  let result = withText(layer, 'title', `${where} "title"`);
  result = withText(result, 'name', `${where} "name"`);
  result = withText(result, 'typeLabel', `${where} "typeLabel"`);
  const axes = axesWithText(result.axes, where);
  return axes === result.axes ? result : { ...result, axes };
}

/**
 * A chart with every text field made text: its title, subtitle, caption and
 * axis labels, and each layer's title, name, type label and axis labels.
 *
 * Objects are copied only where a field changes, so a chart whose text is all
 * text comes back as the same object.
 *
 * @param maidr - The chart as the producer wrote it
 * @returns The chart, safe to read as text
 */
export function chartWithText(maidr: Maidr): Maidr {
  let result = withText(maidr, 'title', 'The chart\'s "title"');
  result = withText(result, 'subtitle', 'The chart\'s "subtitle"');
  result = withText(result, 'caption', 'The chart\'s "caption"');
  const axes = axesWithText(result.axes, 'The chart\'s');
  if (axes !== result.axes) {
    result = { ...result, axes };
  }
  if (!Array.isArray(result.subplots)) {
    return result;
  }
  let changed = false;
  const subplots = result.subplots.map((row) => {
    if (!Array.isArray(row)) {
      return row;
    }
    return row.map((subplot: MaidrSubplot) => {
      if (subplot === null || typeof subplot !== 'object' || !Array.isArray(subplot.layers)) {
        return subplot;
      }
      const layers = subplot.layers.map(layerWithText);
      if (layers.every((layer, i) => layer === subplot.layers[i])) {
        return subplot;
      }
      changed = true;
      return { ...subplot, layers };
    });
  });
  return changed ? { ...result, subplots } : result;
}

/**
 * Forgets the warnings already given. For tests, which build many charts with
 * the same layer ids and need each to warn afresh.
 */
export function resetProducerTextWarnings(): void {
  reported.clear();
}
