import type { Rgb } from '@type/color';
import { Color } from '@util/color';
import { Constant } from '@util/constant';

/** WCAG 2.1 AA for text: the least contrast a field is left at. */
const MIN_CONTRAST = 4.5;

/** A colour as the browser computed it, with its alpha from 0 to 1. */
interface Rgba extends Rgb {
  a: number;
}

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

/** `rgb()` and `rgba()`, with commas or spaces, as browsers serialise colours. */
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/i;

/** `color(srgb ...)`, which Chromium serialises some colours as. */
const SRGB = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%)?)?\s*\)$/i;

/**
 * Reads an alpha component, a fraction or a percentage.
 * @param value - The component, or undefined when the colour had none
 * @param percent - Whether it was written as a percentage
 * @returns The alpha, from 0 to 1
 */
function alpha(value: string | undefined, percent: string | undefined): number {
  if (value === undefined) {
    return 1;
  }
  return percent ? Number(value) / 100 : Number(value);
}

/**
 * Resolves a colour the regular expressions cannot read -- `oklch()`, `lab()`
 * and the other spaces a computed colour can stay in -- by painting it.
 * @param doc - The document the colour was computed in
 * @param value - The computed colour
 * @returns The colour, or null where nothing can paint it, as in jsdom
 */
function paintColour(doc: Document, value: string): Rgba | null {
  // jsdom has a <canvas> but no 2D context, and says so on the console when
  // asked for one: check for the context's class first.
  if (doc.defaultView?.CanvasRenderingContext2D === undefined) {
    return null;
  }
  const canvas = doc.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return null;
  }
  context.fillStyle = value;
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
  const rgb = RGB.exec(value);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alpha(rgb[4], rgb[5]) };
  }
  const srgb = SRGB.exec(value);
  if (srgb) {
    const [r, g, b] = [srgb[1], srgb[2], srgb[3]].map(channel => Math.round(Number(channel) * 255));
    return { r, g, b, a: alpha(srgb[4], srgb[5]) };
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

/**
 * The colour of the canvas under the page, which follows its colour scheme.
 * @param doc - The document
 * @returns The canvas colour, or null when the browser does not resolve it
 */
function canvasColour(doc: Document): Rgba | null {
  const view = doc.defaultView;
  const root = doc.documentElement;
  if (view === null || root === null) {
    return null;
  }
  const probe = doc.createElement('div');
  probe.style.backgroundColor = 'Canvas';
  root.appendChild(probe);
  const value = view.getComputedStyle(probe).backgroundColor;
  probe.remove();
  return parseColour(doc, value);
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
 * Keeps one of MAIDR's fields -- the braille textarea or the review input --
 * readable on whatever page it is drawn in.
 *
 * A field left at 4.5:1 or more is left alone, so a page that styles its
 * fields keeps its own look. Below that, the field takes both colours, as a
 * pair, inline: those of the article around it, which is the text the page
 * itself shows around the chart, or the browser's own field colours where
 * that text is unreadable too.
 *
 * Measured, not cascaded, because no rule of a fixed specificity can be sure
 * of both colours: a page that sets one of them at the same specificity or
 * more, or in a reset that inherits one and clears the other, splits any
 * pair a rule hands the field. Forced colours are already in the computed
 * colours, so under them the floor finds the field readable and stays out.
 * @param field - The field
 * @returns An undo that puts back what the floor replaced, if anything
 */
export function keepFieldReadable(field: HTMLElement): () => void {
  const own = paintOf(field);
  if (own === null || contrastOf(own) >= MIN_CONTRAST) {
    return () => {};
  }

  const article = field.closest(`article[id^="${Constant.MAIDR_ARTICLE}-"]`) ?? field.parentElement;
  const around = article === null ? null : paintOf(article);
  const pair = around !== null && contrastOf(around) >= MIN_CONTRAST
    ? { 'color': Color.rgbToString(around.text), 'background-color': Color.rgbToString(around.background) }
    : { 'color': 'FieldText', 'background-color': 'Field' };

  const replaced: Declaration[] = PROPERTIES.map(property => ({
    property,
    value: field.style.getPropertyValue(property),
    priority: field.style.getPropertyPriority(property),
  }));
  for (const property of PROPERTIES) {
    field.style.setProperty(property, pair[property]);
  }

  return () => {
    for (const { property, value, priority } of replaced) {
      if (value === '') {
        field.style.removeProperty(property);
      } else {
        field.style.setProperty(property, value, priority);
      }
    }
  };
}
