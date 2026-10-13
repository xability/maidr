import type { Rgb, Rgba } from '@type/color';
import { DomEventType } from '@type/event';
import { Color } from '@util/color';
import { Constant } from '@util/constant';

/** WCAG 2.1 AA for text: the least contrast a field is left at. */
const MIN_CONTRAST = 4.5;

/**
 * How many animation frames in a row must find a field's colours unchanged
 * before the floor stops checking them after a change (see `framesOf`).
 */
const QUIET_FRAMES = 5;

/**
 * The most animation frames the floor checks after one change, so colours
 * that never stop changing are not followed for ever.
 */
const MAX_FRAMES = 120;

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
 * Reads a computed colour, or a colour in hex.
 * @param doc - The document the colour was computed in
 * @param value - The colour, as `getComputedStyle` gave it, or in hex
 * @returns The colour, or null when it cannot be read
 */
function parseColour(doc: Document, value: string): Rgba | null {
  const rgba = Color.parseRgba(value);
  if (rgba !== null) {
    return rgba;
  }
  // Hex, as the reader's high contrast colours are written.
  const hex = Color.parse(value);
  if (hex !== null) {
    return { ...hex, a: 1 };
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

/** The media query forced colours match. */
const FORCED_COLOURS = '(forced-colors: active)';

/**
 * Whether a window matches a media query.
 * @param view - The window
 * @param query - The query
 * @returns Whether it matches, false where the window has no `matchMedia`, as in jsdom
 */
function matchesMedia(view: Window | null, query: string): boolean {
  return typeof view?.matchMedia === 'function' && view.matchMedia(query).matches;
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
  const scheme = [
    view.getComputedStyle(root).colorScheme,
    doc.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
    matchesMedia(view, '(prefers-color-scheme: dark)'),
    matchesMedia(view, FORCED_COLOURS),
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
 * floor measures and sets, and one that is moving: neither paused nor held
 * at a `playbackRate` of 0, as a page can leave one. A transition that is not
 * moving shows the colours it is held at for as long as the page holds it,
 * so those are the colours to measure; and finishing one held at a rate of 0
 * throws.
 * @param animation - An animation running on an element
 * @returns Whether it moves `color` or `background-color` towards new colours
 */
function isMovingColourTransition(animation: Animation): animation is CSSTransition {
  return 'transitionProperty' in animation
    && typeof animation.transitionProperty === 'string'
    && (PROPERTIES as readonly string[]).includes(animation.transitionProperty)
    && animation.playState === 'running'
    && animation.playbackRate !== 0;
}

/**
 * Finishes any transition running on the field's colours, so they read as
 * they settle rather than as they start. A transition starts from the colours
 * being left, which are the floor's own just after it is undone, or the
 * reader's high contrast pair just after that is turned off: measured then,
 * the field reads as readable and fades to the page's colours after all.
 * Finished again once the floor has set its pair, so the field shows the pair
 * at once instead of fading to it. A transition the page has paused or
 * frozen is left as it is (see `isMovingColourTransition`).
 * @param field - The field
 */
function settleColourTransitions(field: HTMLElement): void {
  // jsdom has no Web Animations.
  if (typeof field.getAnimations !== 'function') {
    return;
  }
  for (const animation of field.getAnimations()) {
    if (isMovingColourTransition(animation)) {
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
 * The reader's high contrast pair, while high contrast mode paints it: the
 * field inherits both colours, as custom properties, from the chart's
 * backdrop (see `HighContrastService`).
 * @param field - The field
 * @returns The pair, or null while high contrast mode is not painted
 */
function readersPairOf(field: HTMLElement): Pair | null {
  const style = field.ownerDocument.defaultView?.getComputedStyle(field);
  const light = style?.getPropertyValue(Constant.HIGH_CONTRAST_LIGHT_PROPERTY).trim() ?? '';
  const dark = style?.getPropertyValue(Constant.HIGH_CONTRAST_DARK_PROPERTY).trim() ?? '';
  return light === '' || dark === '' ? null : { 'color': light, 'background-color': dark };
}

/**
 * Whether a paint is a pair's two colours.
 * @param doc - The document the paint was computed in
 * @param paint - The paint
 * @param pair - The pair
 * @returns Whether the paint shows the pair, false where the pair cannot be read
 */
function shows(doc: Document, paint: Paint, pair: Pair): boolean {
  const text = parseColour(doc, pair.color);
  const background = parseColour(doc, pair['background-color']);
  return text !== null && background !== null
    && Color.rgbToString(over(background, paint.background)) === Color.rgbToString(paint.background)
    && Color.rgbToString(over(text, paint.background)) === Color.rgbToString(paint.text);
}

/**
 * The pair a field needs, if it needs one.
 *
 * While high contrast mode is painted, the reader's own pair, wherever the
 * field does not show it already: `FIELD_HIGH_CONTRAST_RULE` gives it to
 * the field, and only a page's own `!important` field colour outweighs the
 * rule. The pair's contrast is the reader's to choose, and not measured: a
 * reader who dimmed it, against light sensitivity say, keeps it dim.
 * @param field - The field, without the floor's pair
 * @returns The two colours to set, or null where the field is right as it is
 */
function pairFor(field: HTMLElement): Pair | null {
  // Forced colours replace both colours, whatever is set.
  if (matchesMedia(field.ownerDocument.defaultView, FORCED_COLOURS)) {
    return null;
  }
  const own = paintOf(field);
  if (own === null) {
    return null;
  }
  const readers = readersPairOf(field);
  if (readers !== null) {
    return shows(field.ownerDocument, own, readers) ? null : readers;
  }
  if (contrastOf(own) >= MIN_CONTRAST) {
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

/** A field's floor, without what tells it when to check. */
interface Floor {
  /**
   * Measures the field if anything `inputsOf` reads has changed since the
   * last measure, and writes nothing to the page where nothing has.
   * @returns Whether it measured
   */
  check: () => boolean;
  /** Puts back what the floor's pair replaced, if anything. */
  restore: () => void;
}

/**
 * Makes a field's floor (see `keepFieldReadable`).
 * @param field - The field
 * @returns Its floor, which has not measured it yet
 */
function floorOf(field: HTMLElement): Floor {
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
      if (inputsOf(field) === inputs) {
        return false;
      }
      measure();
      return true;
    },
    restore: () => {
      restore();
      inputs = null;
    },
  };
}

/**
 * Logs an error a check the floor makes on its own threw, which no caller is
 * there to catch. The field is left as the failed check left it.
 * @param when - When the check was made
 * @param error - What it threw
 */
function reportFailure(when: string, error: unknown): void {
  console.error(`[keepFieldReadable] Checking a field's colours ${when} failed; the field is left as it is:`, error);
}

/** Checks a floor once an animation frame while what it reads keeps changing. */
interface Frames {
  /** Starts checking, or keeps checking for longer, from the next frame. */
  follow: () => void;
  /** Stops checking, cancelling a frame still to come. */
  stop: () => void;
}

/**
 * Checks a floor on animation frames after a change, at most once a frame,
 * until `QUIET_FRAMES` frames in a row find nothing changed, or `MAX_FRAMES`
 * have passed since the last change was reported. That covers a change that
 * lands a frame or more after the event that announced it -- a stylesheet a
 * theme switch enables applies once it loads -- and colours that transition
 * after a change: the floor follows them frame by frame, and is left with
 * those they settle on.
 * @param view - The window whose frames to check on, if any
 * @param check - Checks the floor, returning whether it measured
 * @returns The calls that start and stop it
 */
function framesOf(view: Window | null, check: () => boolean): Frames {
  // jsdom has animation frames only when it pretends to be visual.
  if (view === null || typeof view.requestAnimationFrame !== 'function') {
    return { follow: () => {}, stop: () => {} };
  }
  // The frame still to come, if any.
  let frame: number | null = null;
  let quiet = 0;
  let left = 0;

  const onFrame = (): void => {
    frame = null;
    try {
      quiet = check() ? 0 : quiet + 1;
    } catch (error) {
      // Nothing above a frame callback catches it: stop here, rather than
      // fail the same way on every frame still to come.
      reportFailure('on an animation frame', error);
      return;
    }
    left -= 1;
    if (quiet < QUIET_FRAMES && left > 0) {
      frame = view.requestAnimationFrame(onFrame);
    }
  };

  return {
    follow: () => {
      quiet = 0;
      left = MAX_FRAMES;
      if (frame === null) {
        frame = view.requestAnimationFrame(onFrame);
      }
    },
    stop: () => {
      if (frame !== null) {
        view.cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}

/**
 * Whether an event's target is a stylesheet: a `<link>` or a `<style>`.
 * Read by name, not by class, so a field in another window's document is
 * matched too.
 * @param target - The target
 * @returns Whether it is one
 */
function isStylesheet(target: EventTarget | null): boolean {
  if (target === null || !('localName' in target)) {
    return false;
  }
  return target.localName === 'link' || target.localName === 'style';
}

/** One field's floor, for as long as the field is drawn. */
export interface ReadableField {
  /**
   * Checks the field now, and on the next few frames (see `framesOf`). A
   * check measures the field only if anything the floor reads has changed
   * since it last measured, and changes nothing on the page where nothing
   * has. The checks the floor makes on its own, on a frame or on focus, log
   * what they throw; this one leaves it to its caller.
   * @throws Whatever reading or setting the field's colours throws
   */
  check: () => void;
  /**
   * Stops checking, and puts back what the floor replaced, if anything.
   * @throws Whatever setting the field's colours back throws
   */
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
 * text is unreadable too. While high contrast mode is painted, the pair is
 * always the reader's own, set only where a page's `!important` colour
 * keeps the field from showing it, and never measured (see `pairFor`).
 *
 * Measured, not cascaded, because no rule of a fixed specificity can be sure
 * of both colours: a page that sets one of them at the same specificity or
 * more, or in a reset that inherits one and clears the other, splits any
 * pair a rule hands the field. Under forced colours, which replace both
 * colours whatever is set, the floor stays out.
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
 *
 * Checked whenever its caller asks (see `useReadableField`), and whenever
 * the field's colours can change without the reader doing anything, which
 * review, taking no steps while it is open, would otherwise never catch:
 *
 * - at once, when it gains or loses focus, so a page's `:focus` rule is
 *   measured (braille is measured before it takes focus);
 * - on the next frame, when the page's root or body changes an attribute's
 *   value, which is how a theme toggle switches theme (a class, a
 *   `data-theme`, a style): a write of the value already there is no change,
 *   and a page that writes to its root every frame is checked once a frame,
 *   which reads what that frame's style recalculation has already computed;
 * - on the next frame, when the system's colour scheme changes, which a
 *   page's `prefers-color-scheme` rules follow;
 * - on the next frame, when a stylesheet or a `<style>` finishes loading,
 *   which is when a theme switch that enables a stylesheet takes effect:
 *   Quarto's switches the dark sheet's `rel` and then the body's class, and
 *   the sheet applies once it has loaded, after the class change has been
 *   checked (Chromium fires `load` then, Firefox `error`, so both count).
 *
 * Each is followed by a few frames more (see `framesOf`), which also see the
 * colours around the field transition. A theme a page switches in any other
 * way -- a class on an element between the body and the chart, a rule
 * inserted into a stylesheet already there -- is caught up with on the
 * reader's next step, or the field's next focus.
 * @param field - The field
 * @returns Its floor, which has not measured it yet
 */
export function keepFieldReadable(field: HTMLElement): ReadableField {
  const doc = field.ownerDocument;
  const view = doc.defaultView;
  const floor = floorOf(field);
  const frames = framesOf(view, floor.check);
  const check = (): void => {
    floor.check();
    frames.follow();
  };
  const onFocus = (): void => {
    try {
      check();
    } catch (error) {
      reportFailure('as it gained or lost focus', error);
    }
  };

  field.addEventListener(DomEventType.FOCUS_IN, onFocus);
  field.addEventListener(DomEventType.FOCUS_OUT, onFocus);

  const watched = [doc.documentElement, doc.body].filter((element): element is HTMLElement => element !== null);
  const changed = (record: MutationRecord): boolean => {
    const element = watched.find(candidate => candidate === record.target);
    return element !== undefined
      && record.attributeName !== null
      && element.getAttribute(record.attributeName) !== record.oldValue;
  };
  const theme = new MutationObserver((records) => {
    if (records.some(changed)) {
      frames.follow();
    }
  });
  for (const element of watched) {
    theme.observe(element, { attributes: true, attributeOldValue: true });
  }

  // jsdom has no matchMedia.
  const scheme = typeof view?.matchMedia === 'function' ? view.matchMedia('(prefers-color-scheme: dark)') : null;
  scheme?.addEventListener('change', frames.follow);

  // Neither event bubbles, so both are caught on their way down.
  const onStylesheet = (event: Event): void => {
    if (isStylesheet(event.target)) {
      frames.follow();
    }
  };
  doc.addEventListener(DomEventType.LOAD, onStylesheet, true);
  doc.addEventListener(DomEventType.ERROR, onStylesheet, true);

  return {
    check,
    dispose: () => {
      frames.stop();
      field.removeEventListener(DomEventType.FOCUS_IN, onFocus);
      field.removeEventListener(DomEventType.FOCUS_OUT, onFocus);
      theme.disconnect();
      scheme?.removeEventListener('change', frames.follow);
      doc.removeEventListener(DomEventType.LOAD, onStylesheet, true);
      doc.removeEventListener(DomEventType.ERROR, onStylesheet, true);
      floor.restore();
    },
  };
}
