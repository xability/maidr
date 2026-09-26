/**
 * Reads the adapter options a dashboard extension saved with its workbook.
 *
 * `tableau.extensions.settings` stores strings, so the extension stores one:
 * the JSON of a {@link TableauAdapterOptions}, which was made JSON-serializable
 * for exactly this. Parsing it is the easy half. The half that matters is
 * refusing what is not an options object, because a setting is written once by
 * an author and then read on every load by every viewer — a typo that parsed
 * silently would be a wrong figure for everyone, forever, with nobody watching
 * the console. So the whole object is checked, unknown keys included, and a
 * setting that fails is reported in the dialog where the author typed it.
 */

import type { StepDirection } from '../../type/grammar';
import type { TableauAdapterOptions } from './types';
import { Orientation, TraceType } from '../../type/grammar';

/** The result of reading a setting: options, or the reason there are none. */
export type TableauSettingsResult
  = | { readonly options: TableauAdapterOptions; readonly error?: undefined }
    | { readonly options?: undefined; readonly error: string };

const TRACE_TYPES: ReadonlySet<string> = new Set(Object.values(TraceType));
const ORIENTATIONS: ReadonlySet<string> = new Set(Object.values(Orientation));
const STEP_DIRECTIONS: ReadonlySet<StepDirection> = new Set<StepDirection>(['hv', 'vh', 'mid']);
const LAYOUTS: ReadonlySet<string> = new Set(['grid', 'column']);

const OPTION_KEYS = ['id', 'title', 'live', 'worksheets', 'overrides', 'anchorLabel', 'layout'] as const;
const OVERRIDE_KEYS = ['skip', 'traceType', 'title', 'x', 'y', 'z', 'orientation', 'stepDirection', 'axes'] as const;
const AXIS_KEYS = ['x', 'y', 'z'] as const;

/**
 * Whether a value is a plain JSON object rather than an array or `null`.
 *
 * @param value - Anything `JSON.parse` returned.
 * @returns True for an object literal.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Name the first key of an object that is not in the allowed list.
 *
 * @param record - The object to check.
 * @param allowed - The keys it may have.
 * @param where - Where the object sits, for the message.
 * @returns An error message, or `null` when every key is allowed.
 */
function unknownKey(
  record: Record<string, unknown>,
  allowed: readonly string[],
  where: string,
): string | null {
  const extra = Object.keys(record).find(key => !allowed.includes(key));
  if (extra === undefined) {
    return null;
  }
  return `${where} has no option "${extra}". The options are: ${allowed.join(', ')}.`;
}

/**
 * Check one value against the type its option takes.
 *
 * @param value - The value, which is present.
 * @param kind - The type the option takes.
 * @param where - The option's path, for the message.
 * @returns An error message, or `null` when the value fits.
 */
function checkPrimitive(
  value: unknown,
  kind: 'string' | 'boolean',
  where: string,
): string | null {
  const fits = kind === 'string' ? typeof value === 'string' : typeof value === 'boolean';
  return fits ? null : `${where} must be a ${kind}.`;
}

/**
 * Check one value against a closed set of strings.
 *
 * @param value - The value, which is present.
 * @param allowed - The strings it may be.
 * @param where - The option's path, for the message.
 * @returns An error message, or `null` when the value is one of them.
 */
function checkOneOf(
  value: unknown,
  allowed: ReadonlySet<string>,
  where: string,
): string | null {
  if (typeof value === 'string' && allowed.has(value)) {
    return null;
  }
  return `${where} must be one of ${[...allowed].map(item => `"${item}"`).join(', ')}.`;
}

/**
 * Check one worksheet's override.
 *
 * @param value - The override as parsed.
 * @param where - Its path, for the message.
 * @returns An error message, or `null` when it is a valid override.
 */
function checkOverride(value: unknown, where: string): string | null {
  if (!isRecord(value)) {
    return `${where} must be an object.`;
  }
  const extra = unknownKey(value, OVERRIDE_KEYS, where);
  if (extra !== null) {
    return extra;
  }
  for (const key of OVERRIDE_KEYS) {
    const field = value[key];
    if (field === undefined) {
      continue;
    }
    const path = `${where}.${key}`;
    let problem: string | null;
    switch (key) {
      case 'skip':
        problem = checkPrimitive(field, 'boolean', path);
        break;
      case 'traceType':
        problem = checkOneOf(field, TRACE_TYPES, path);
        break;
      case 'orientation':
        problem = checkOneOf(field, ORIENTATIONS, path);
        break;
      case 'stepDirection':
        problem = checkOneOf(field, STEP_DIRECTIONS, path);
        break;
      case 'axes':
        problem = checkAxes(field, path);
        break;
      case 'title':
      case 'x':
      case 'y':
      case 'z':
        problem = checkPrimitive(field, 'string', path);
        break;
    }
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}

/**
 * Check an override's axis captions.
 *
 * @param value - The `axes` value as parsed.
 * @param where - Its path, for the message.
 * @returns An error message, or `null` when every caption is a string.
 */
function checkAxes(value: unknown, where: string): string | null {
  if (!isRecord(value)) {
    return `${where} must be an object.`;
  }
  const extra = unknownKey(value, AXIS_KEYS, where);
  if (extra !== null) {
    return extra;
  }
  for (const key of AXIS_KEYS) {
    if (value[key] !== undefined) {
      const problem = checkPrimitive(value[key], 'string', `${where}.${key}`);
      if (problem !== null) {
        return problem;
      }
    }
  }
  return null;
}

/**
 * Check a whole options object.
 *
 * @param value - The object as parsed.
 * @returns An error message, or `null` when it is valid.
 */
function checkOptions(value: Record<string, unknown>): string | null {
  const extra = unknownKey(value, OPTION_KEYS, 'The settings object');
  if (extra !== null) {
    return extra;
  }
  for (const key of OPTION_KEYS) {
    const field = value[key];
    if (field === undefined) {
      continue;
    }
    let problem: string | null;
    switch (key) {
      case 'live':
        problem = checkPrimitive(field, 'boolean', key);
        break;
      case 'layout':
        problem = checkOneOf(field, LAYOUTS, key);
        break;
      case 'worksheets':
        problem = Array.isArray(field) && field.every(name => typeof name === 'string')
          ? null
          : 'worksheets must be a list of worksheet names.';
        break;
      case 'overrides':
        problem = isRecord(field)
          ? Object.entries(field)
            .map(([name, override]) => checkOverride(override, `overrides["${name}"]`))
            .find(message => message !== null) ?? null
          : 'overrides must be an object keyed by worksheet name.';
        break;
      case 'id':
      case 'title':
      case 'anchorLabel':
        problem = checkPrimitive(field, 'string', key);
        break;
    }
    if (problem !== null) {
      return problem;
    }
  }
  return null;
}

/**
 * Read the options a dashboard extension saved.
 *
 * A missing or blank setting is the empty options object — the extension's
 * defaults — rather than an error: a freshly added extension has saved nothing
 * yet, and that is the normal first state, not a broken one.
 *
 * @param raw - The setting's value, as `settings.get` returns it.
 * @returns The options, or a message saying exactly what is wrong with them.
 */
export function parseTableauSettings(raw: string | undefined): TableauSettingsResult {
  if (raw === undefined || raw.trim() === '') {
    return { options: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: unknown) {
    const detail = error instanceof Error ? ` (${error.message})` : '';
    return { error: `The settings are not valid JSON${detail}.` };
  }
  if (!isRecord(parsed)) {
    return { error: 'The settings must be a JSON object, written between { and }.' };
  }
  const problem = checkOptions(parsed);
  if (problem !== null) {
    return { error: problem };
  }
  // Every key and value has been checked against the option it names, so this
  // is the shape the checks above just established rather than an assertion.
  return { options: parsed as TableauAdapterOptions };
}
