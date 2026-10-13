import type { Rgb, Rgba } from '@type/color';
import { DomEventType } from '@type/event';
import { Color } from '@util/color';
import { Constant } from '@util/constant';

/** WCAG 2.1 AA for text: the least contrast a field is left at. */
const MIN_CONTRAST = 4.5;

/** What an element paints its text with, and over. */
interface Paint {
  /** Its text colour, composited over its background. */
  text: Rgb;
  /** Its own background composited over every ancestor's, and the canvas. */
  background: Rgb;
}

/** A field's inline declaration, as it was before the floor replaced it. */
interface Declaration {
  property: string;
  value: string;
  priority: string;
}

/** The two properties the floor sets, always together. */
const PROPERTIES = ['color', 'background-color'] as const;

/** The two colours the floor sets on a field, by property. */
type Pair = Record<typeof PROPERTIES[number], string>;

/**
 * The 2D context each document's colours are painted on, one 1x1 canvas per
 * document, made the first time one is needed. Null where nothing can paint,
 * as in jsdom.
 */
const painters = new WeakMap<Document, CanvasRenderingContext2D | null>();

/**
 * The context `paintColour` paints on in a document.
 * @param doc - The document
 * @returns Its context, or null where it has none
 */
function painterOf(doc: Document): CanvasRenderingContext2D | null {
  if (!painters.has(doc)) {
    // jsdom has a <canvas> but no 2D context, and says so on the console when
    // asked for one: check for the context's class first.
    let context: CanvasRenderingContext2D | null = null;
    if (doc.defaultView?.CanvasRenderingContext2D !== undefined) {
      const canvas = doc.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      context = canvas.getContext('2d', { willReadFrequently: true });
    }
    painters.set(doc, context);
  }
  return painters.get(doc) ?? null;
}

/**
 * Resolves a colour `Color.parseRgba` cannot read -- `oklch()`, `lab()`,
 * `color(srgb ...)` and the other spaces a computed colour can stay in -- by
 * painting it.
 * @param doc - The document the colour was computed in
 * @param value - The computed colour
 * @returns The colour, or null where nothing can paint it
 */
function paintColour(doc: Document, value: string): Rgba | null {
  const context = painterOf(doc);
  if (context === null) {
    return null;
  }
  // A value the canvas cannot parse leaves `fillStyle` as it was: set over
  // two different colours, it reads back the same only when it parsed.
  context.fillStyle = '#000';
  context.fillStyle = value;
  const overBlack = context.fillStyle;
  context.fillStyle = '#fff';
  context.fillStyle = value;
  if (context.fillStyle !== overBlack) {
    return null;
  }
  // Cleared first: a colour with alpha is painted over what is already there.
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: a / 255 };
}

/**
 * Reads a computed colour.
 * @param doc - The document the colour was computed in
 * @param value - The colour, as `getComputedStyle` gave it
 * @returns The colour, or null when it cannot be read
 */
function parseColour(doc: Document, value: string): Rgba | null {
  const rgba = Color.parseRgba(value);
  if (rgba !== null) {
    return rgba;
  }
  // A keyword left unresolved (jsdom's `initial`, `canvas`) or an empty value
  // is not a colour anything can paint.
  if (!value.includes('(')) {
    return null;
  }
  return paintColour(doc, value);
}

/**
 * Lays one colour over another.
 * @param top - The colour on top, with its alpha
 * @param bottom - The opaque colour under it
 * @returns The colour that shows
 */
function over(top: Rgba, bottom: Rgb): Rgb {
  const mix = (t: number, b: number): number => Math.round(t * top.a + b * (1 - top.a));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b) };
}

/** The canvas colour last read in a document, and the colour scheme it was read under. */
interface CanvasReading {
  scheme: string;
  colour: Rgba | null;
}

/** Each document's canvas colour, read again only when its colour scheme changes. */
const canvases = new WeakMap<Document, CanvasReading>();

/**
 * The colour of the canvas under the page, which follows its colour scheme.
 *
 * Read through a probe element added to the page and removed at once, which
 * a page's own MutationObserver sees: so read once per colour scheme -- the
 * root's `color-scheme`, a `color-scheme` meta tag, the system's preference
 * and forced colours, which are all the canvas follows -- not once per
 * measure, where a page that answers each change to its document with one of
 * its own would answer every measure.
 * @param doc - The document
 * @returns The canvas colour, or null when the browser does not resolve it
 */
function canvasColour(doc: Document): Rgba | null {
  const view = doc.defaultView;
  const root = doc.documentElement;
  if (view === null || root === null) {
    return null;
  }
  // jsdom has no matchMedia.
  const matches = (query: string): boolean => typeof view.matchMedia === 'function' && view.matchMedia(query).matches;
  const scheme = [
    view.getComputedStyle(root).colorScheme,
    doc.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
    matches('(prefers-color-scheme: dark)'),
    matches('(forced-colors: active)'),
  ].join('|');
  const last = canvases.get(doc);
  if (last?.scheme === scheme) {
    return last.colour;
  }

  const probe = doc.createElement('div');
  probe.style.backgroundColor = 'Canvas';
  root.appendChild(probe);
  const colour = parseColour(doc, view.getComputedStyle(probe).backgroundColor);
  probe.remove();
  canvases.set(doc, { scheme, colour });
  return colour;
}

/**
 * What an element paints its text with, and the background that text sits
 * on: its own background composited over its ancestors', down to the first
 * opaque one or to the canvas.
 *
 * Computed colours only: a background image, a gradient, a filter, opacity
 * or a blend mode is not seen.
 * @param element - The element
 * @returns Its paint, or null when a colour cannot be read
 */
function paintOf(element: Element): Paint | null {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  if (view === null) {
    return null;
  }

  const layers: Rgba[] = [];
  let opaque = false;
  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    const layer = parseColour(doc, view.getComputedStyle(current).backgroundColor);
    if (layer === null) {
      return null;
    }
    if (layer.a > 0) {
      layers.push(layer);
    }
    if (layer.a >= 1) {
      opaque = true;
      break;
    }
  }

  const canvas = opaque ? { r: 0, g: 0, b: 0, a: 1 } : canvasColour(doc);
  const text = parseColour(doc, view.getComputedStyle(element).color);
  if (canvas === null || text === null) {
    return null;
  }

  const background = layers.reduceRight<Rgb>((under, layer) => over(layer, under), canvas);
  return { text: over(text, background), background };
}

/**
 * The contrast ratio of a paint.
 * @param paint - The paint
 * @returns The ratio, from 1 to 21
 */
function contrastOf(paint: Paint): number {
  return Color.getContrastRatio(paint.text, paint.background);
}

/**
 * Whether an animation is a CSS transition of one of the two colours the
 * floor measures and sets.
 * @param animation - An animation running on the field
 * @returns Whether it transitions `color` or `background-color`
 */
function isColourTransition(animation: Animation): animation is CSSTransition {
  return 'transitionProperty' in animation
    && typeof animation.transitionProperty === 'string'
    && (PROPERTIES as readonly string[]).includes(animation.transitionProperty);
}

/**
 * Finishes any transition running on the field's colours, so they read as
 * they settle rather than as they start. A transition starts from the colours
 * being left, which are the floor's own just after it is undone, or the
 * reader's high contrast pair just after that is turned off: measured then,
 * the field reads as readable and fades to the page's colours after all.
 * Finished again once the floor has set its pair, so the field shows the pair
 * at once instead of fading to it.
 * @param field - The field
 */
function settleColourTransitions(field: HTMLElement): void {
  // jsdom has no Web Animations.
  if (typeof field.getAnimations !== 'function') {
    return;
  }
  for (const animation of field.getAnimations()) {
    if (isColourTransition(animation)) {
      animation.finish();
    }
  }
}

/**
 * The element whose text the page shows around a field: the chart's article,
 * or the field's parent outside one.
 * @param field - The field
 * @returns The element, or null for a field outside the page
 */
function surroundingsOf(field: HTMLElement): Element | null {
  return field.closest(`article[id^="${Constant.MAIDR_ARTICLE}-"]`) ?? field.parentElement;
}

/**
 * The pair a field needs, if it needs one.
 * @param field - The field, without the floor's pair
 * @returns The two colours to set, or null where the field is readable as it is
 */
function pairFor(field: HTMLElement): Pair | null {
  const own = paintOf(field);
  if (own === null || contrastOf(own) >= MIN_CONTRAST) {
    return null;
  }
  const surroundings = surroundingsOf(field);
  const around = surroundings === null ? null : paintOf(surroundings);
  return around !== null && contrastOf(around) >= MIN_CONTRAST
    ? { 'color': Color.rgbToString(around.text), 'background-color': Color.rgbToString(around.background) }
    : { 'color': 'FieldText', 'background-color': 'Field' };
}

/**
 * Everything a measure of the field reads that can be read with the floor's
 * pair in place: the field's paint, and the paint of the text around it,
 * which is where the pair comes from and what a theme switch changes.
 * @param field - The field
 * @returns The two paints, as one string to compare
 */
function inputsOf(field: HTMLElement): string {
  const surroundings = surroundingsOf(field);
  return JSON.stringify([paintOf(field), surroundings === null ? null : paintOf(surroundings)]);
}

/** One field's floor, for as long as the field is drawn. */
export interface ReadableField {
  /**
   * Measures the field again if anything the floor reads has changed since it
   * last measured, and changes nothing on the page where nothing has.
   */
  check: () => void;
  /** Puts back what the floor replaced, if anything. */
  dispose: () => void;
}

/**
 * Keeps one of MAIDR's fields -- the braille textarea or the review input --
 * readable on whatever page it is drawn in.
 *
 * A field left at 4.5:1 or more is left alone, so a page that styles its
 * fields keeps its own look. Below that, the field takes both colours, as a
 * pair, inline and `!important` so that no rule of the page's outweighs
 * them: those of the article around it, which is the text the page itself
 * shows around the chart, or the browser's own field colours where that
 * text is unreadable too.
 *
 * Measured, not cascaded, because no rule of a fixed specificity can be sure
 * of both colours: a page that sets one of them at the same specificity or
 * more, or in a reset that inherits one and clears the other, splits any
 * pair a rule hands the field. Forced colours are already in the computed
 * colours, so under them the floor finds the field readable and stays out.
 * A transition on the field's colours is finished before it is measured, and
 * again after the pair is set (see `settleColourTransitions`).
 *
 * Each check first reads what it can without touching the page (see
 * `inputsOf`), and measures only when that has changed: taking the pair off
 * to measure the field's own colours, and setting it again, is a change to
 * the page that a page's own MutationObserver sees, and a page that answers
 * such a change by writing to its root or body would otherwise be answered
 * in turn, for ever. So a change to the field's own colours alone, with the
 * pair in place, waits for the colours around it to change.
 * @param field - The field
 * @returns Its floor, which has not measured it yet
 */
export function keepFieldReadable(field: HTMLElement): ReadableField {
  // What the floor's pair replaced, while it is set.
  let replaced: Declaration[] | null = null;
  // What the last measure read, with its pair in place.
  let inputs: string | null = null;

  const restore = (): void => {
    for (const { property, value, priority } of replaced ?? []) {
      if (value === '') {
        field.style.removeProperty(property);
      } else {
        field.style.setProperty(property, value, priority);
      }
    }
    replaced = null;
  };

  const measure = (): void => {
    restore();
    settleColourTransitions(field);
    const pair = pairFor(field);
    if (pair !== null) {
      replaced = PROPERTIES.map(property => ({
        property,
        value: field.style.getPropertyValue(property),
        priority: field.style.getPropertyPriority(property),
      }));
      for (const property of PROPERTIES) {
        // `important`, or a page's own `!important` colour outweighs the pair.
        field.style.setProperty(property, pair[property], 'important');
      }
      settleColourTransitions(field);
    }
    inputs = inputsOf(field);
  };

  return {
    check: () => {
      if (inputsOf(field) !== inputs) {
        measure();
      }
    },
    dispose: () => {
      restore();
      inputs = null;
    },
  };
}

/**
 * The transitions running on the colours of a field's ancestors.
 * @param field - The field
 * @returns The transitions, none where the browser has no Web Animations
 */
function ancestorColourTransitions(field: HTMLElement): CSSTransition[] {
  const transitions: CSSTransition[] = [];
  for (let current = field.parentElement; current !== null; current = current.parentElement) {
    if (typeof current.getAnimations !== 'function') {
      return transitions;
    }
    transitions.push(...current.getAnimations().filter(isColourTransition));
  }
  return transitions;
}

/**
 * Calls `then` once the transitions running on the colours of the field's
 * ancestors have ended, if any are running: until then the text and
 * background around the field are those being left -- the reader's high
 * contrast pair just after it is turned off, or the theme a page is
 * switching from -- and the floor took its pair from them.
 * @param field - The field
 * @param then - Measures the field again
 * @returns Cancels the call, if it is still to come
 */
export function whenColoursSettle(field: HTMLElement, then: () => void): () => void {
  const transitions = ancestorColourTransitions(field);
  if (transitions.length === 0) {
    return () => {};
  }
  let cancelled = false;
  void Promise.allSettled(transitions.map(transition => transition.finished)).then(() => {
    if (!cancelled) {
      then();
    }
  });
  return () => {
    cancelled = true;
  };
}

/**
 * Asks for a field to be measured again whenever its colours can change
 * without the reader taking a step, which review never takes while it is
 * open:
 *
 * - when it gains or loses focus, so a page's `:focus` rule is measured
 *   (braille is measured before it takes focus);
 * - when the page's root or body changes an attribute, which is how a theme
 *   toggle switches theme (a class, a `data-theme`, a style);
 * - when the system's colour scheme changes, which a page's
 *   `prefers-color-scheme` rules follow.
 *
 * Where the change starts transitions on the colours of the field's
 * ancestors, measured again once they end (see `whenColoursSettle`). A theme a
 * page switches in any other way -- a stylesheet swapped in its head -- is
 * caught up with on the reader's next step, or the field's next focus.
 * @param field - The field
 * @param recheck - Checks the field again (see `keepFieldReadable`)
 * @returns Stops asking
 */
export function watchFieldColours(field: HTMLElement, recheck: () => void): () => void {
  const doc = field.ownerDocument;
  const view = doc.defaultView;
  // Only the latest change waits for its transitions: an earlier one's would
  // measure a theme already left.
  let cancelWait = (): void => {};

  const onChange = (): void => {
    cancelWait();
    recheck();
    cancelWait = whenColoursSettle(field, recheck);
  };

  field.addEventListener(DomEventType.FOCUS_IN, onChange);
  field.addEventListener(DomEventType.FOCUS_OUT, onChange);

  const theme = new MutationObserver(onChange);
  for (const element of [doc.documentElement, doc.body]) {
    if (element !== null) {
      theme.observe(element, { attributes: true });
    }
  }

  // jsdom has no matchMedia.
  const scheme = typeof view?.matchMedia === 'function' ? view.matchMedia('(prefers-color-scheme: dark)') : null;
  scheme?.addEventListener('change', onChange);

  return () => {
    cancelWait();
    field.removeEventListener(DomEventType.FOCUS_IN, onChange);
    field.removeEventListener(DomEventType.FOCUS_OUT, onChange);
    theme.disconnect();
    scheme?.removeEventListener('change', onChange);
  };
}
