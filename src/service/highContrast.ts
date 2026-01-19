import type { Context } from '@model/context';
import type { Figure } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import { PatternService } from '@service/pattern';

/**
 * Settings paths for high contrast configuration.
 */
enum HighContrastSettings {
  MODE = 'general.highContrastMode',
  LEVELS = 'general.highContrastLevels',
  LIGHT_COLOR = 'general.highContrastLightColor',
  DARK_COLOR = 'general.highContrastDarkColor',
}

/**
 * Constants for high contrast color calculations and visual effects.
 */
const HighContrastConstants = {
  // Luminance coefficients (ITU-R BT.709 standard for relative luminance)
  LUMINANCE_RED_COEFF: 0.299,
  LUMINANCE_GREEN_COEFF: 0.587,
  LUMINANCE_BLUE_COEFF: 0.114,

  // RGB channel values
  RGB_MAX_VALUE: 255,

  // Thresholds
  NEAR_WHITE_LUMINANCE_SCALE: 0.1,
  MIN_COMPLEX_PATH_LENGTH: 120,
  MIN_COLOR_INTERPOLATION_COUNT: 2,
  LIGHTNESS_MIDPOINT: 0.5,
  DEFAULT_MIDRANGE_LUMINANCE: 0.5,

  // Glow filter settings for line charts
  GLOW_FILTER_OFFSET: '-50%',
  GLOW_FILTER_SIZE: '200%',
  GLOW_BLUR_OUTER: 20,
  GLOW_BLUR_MIDDLE: 10,
  GLOW_BLUR_INNER: 5,

  // HSL conversion constants
  HSL_HUE_DIVISOR: 6,
  HSL_GREEN_HUE_OFFSET: 2,
  HSL_BLUE_HUE_OFFSET: 4,
  HSL_THRESHOLD_ONE_SIXTH: 1 / 6,
  HSL_THRESHOLD_ONE_HALF: 1 / 2,
  HSL_THRESHOLD_TWO_THIRDS: 2 / 3,
  HSL_THRESHOLD_ONE_THIRD: 1 / 3,
} as const;

interface ElementColorInfo {
  element: SVGElement;
  color: string;
  isInSelectors: boolean;
  cantBeBackground: boolean;
  attr: string;
  attrType?: 'style' | 'attribute';
}

/**
 * HighContrastService manages the high contrast accessibility mode.
 *
 * Key behaviors:
 * - Captures original colors in constructor (before any transformations)
 * - Applies high contrast on focus-in via initializeHighContrast()
 * - Restores original colors on blur via suspendHighContrast()
 * - Responds to settings changes (toggle via keyboard/UI)
 */
export class HighContrastService implements Disposable {
  private readonly settingsService: SettingsService;
  private readonly notificationService: NotificationService;
  private readonly displayService: DisplayService;
  private readonly figure: Figure;
  private readonly context: Context;

  // Disposable for settings change subscription
  private settingsDisposable: Disposable | null = null;

  // Cached original colors - captured once on first application
  private defaultBackgroundColor: string = '';
  private defaultForegroundColor: string = '';
  private originalColorInfo: ElementColorInfo[] | null = null;

  // Cache of all trace elements for high contrast mode
  private traceElementsCache: Set<SVGElement> | null = null;

  // Pattern service for high contrast mode patterns
  private patternService: PatternService | null = null;

  // Track previous high contrast mode state to detect changes
  private previousHighContrastMode: boolean = false;

  // Shared canvas context for color parsing (reused to avoid GC pressure)
  private sharedCanvasCtx: CanvasRenderingContext2D | null = null;

  /**
   * Returns a shared canvas 2D context for color parsing operations.
   * Creates the context on first use and reuses it to avoid GC pressure.
   */
  private getSharedCanvasContext(): CanvasRenderingContext2D | null {
    if (!this.sharedCanvasCtx) {
      this.sharedCanvasCtx = document.createElement('canvas').getContext('2d');
    }
    return this.sharedCanvasCtx;
  }

  // Computed getters that read from settings service (single source of truth)
  private get highContrastMode(): boolean {
    return this.settingsService.loadSettings().general.highContrastMode;
  }

  private get highContrastLightColor(): string {
    return this.settingsService.loadSettings().general.highContrastLightColor;
  }

  private get highContrastDarkColor(): string {
    return this.settingsService.loadSettings().general.highContrastDarkColor;
  }

  private get highContrastLevels(): number {
    return this.settingsService.loadSettings().general.highContrastLevels;
  }

  /**
   * Computed color equivalents based on current settings.
   * Interpolates between light and dark colors based on contrast levels.
   */
  private get colorEquivalents(): string[] {
    return this.interpolateColors(
      this.highContrastLightColor,
      this.highContrastDarkColor,
      this.highContrastLevels,
    );
  }

  public constructor(
    settings: SettingsService,
    notification: NotificationService,
    displayService: DisplayService,
    figure: Figure,
    context: Context,
  ) {
    this.settingsService = settings;
    this.notificationService = notification;
    this.displayService = displayService;
    this.figure = figure;
    this.context = context;

    // Initialize previous state from settings to track changes
    this.previousHighContrastMode = this.highContrastMode;

    // Subscribe to settings changes using the modern event pattern
    this.settingsDisposable = this.settingsService.onChange((event) => {
      if (event.affectsSetting(HighContrastSettings.MODE)) {
        this.handleHighContrastModeChange(event.get<boolean>(HighContrastSettings.MODE));
      }
    });

    // IMPORTANT: Always capture original colors first, before any high contrast is applied.
    // The DOM has the true original colors at this point (page just loaded).
    // This ensures we have the correct colors for restoration.
    this.captureOriginalColors();

    // NOTE: We do NOT apply high contrast here in the constructor.
    // The first Controller created on page load is immediately disposed (see index.ts).
    // If we applied high contrast here, it would persist in the DOM but the Controller
    // (and its captured original colors) would be gone.
    //
    // High contrast will be applied when:
    // 1. The real Controller is created on focus-in (via initializeHighContrast)
    // 2. The user toggles high contrast mode via keyboard/settings
  }

  /**
   * Initialize high contrast mode after the Controller is fully set up.
   * Call this from the Controller after construction to apply high contrast if enabled.
   */
  public initializeHighContrast(): void {
    if (this.highContrastMode) {
      this.applyHighContrast();
    }
  }

  /**
   * Suspend high contrast mode visually (restore original colors).
   * Called on blur to return the chart to its original appearance.
   * The setting remains ON - this just hides the visual effect while unfocused.
   */
  public suspendHighContrast(): void {
    if (this.highContrastMode && this.originalColorInfo) {
      this.restoreOriginalColors();
    }
  }

  /**
   * Capture original colors from the DOM before any high contrast changes.
   */
  private captureOriginalColors(): void {
    // Capture body styles
    const bodyStyle = window.getComputedStyle(document.body);
    this.defaultBackgroundColor = bodyStyle.backgroundColor;
    this.defaultForegroundColor = bodyStyle.color;

    // Capture SVG element colors
    this.originalColorInfo = this.getOriginalColorInfo();
  }

  /**
   * Validates that captured elements still exist in the DOM.
   * Returns true if all elements are valid, false if any are stale/removed.
   */
  private validateCapturedElements(): boolean {
    if (!this.originalColorInfo || this.originalColorInfo.length === 0) {
      return false;
    }

    return this.originalColorInfo.every(
      info => info.element && document.body.contains(info.element),
    );
  }

  /**
   * Re-captures original colors if DOM has changed since initial capture.
   * Call this before applying high contrast to ensure color data is fresh.
   */
  private recaptureIfNeeded(): void {
    if (!this.validateCapturedElements()) {
      console.warn(
        'HighContrastService: DOM changed since capture, re-capturing colors',
      );
      this.captureOriginalColors();
    }
  }

  public dispose(): void {
    // Unsubscribe from settings changes
    if (this.settingsDisposable) {
      this.settingsDisposable.dispose();
      this.settingsDisposable = null;
    }

    // Clean up pattern service if exists
    if (this.patternService) {
      this.patternService.dispose();
      this.patternService = null;
    }

    // Note: Colors are restored via suspendHighContrast() before dispose is called.
    // See index.ts onFocusOut handler.
  }

  /**
   * Handle high contrast mode setting change.
   * Called when user toggles high contrast via keyboard or settings UI.
   */
  private handleHighContrastModeChange(newHighContrastMode: boolean): void {
    // Only act if high contrast mode actually changed
    if (newHighContrastMode !== this.previousHighContrastMode) {
      this.previousHighContrastMode = newHighContrastMode;

      if (newHighContrastMode) {
        this.applyHighContrast();
      } else {
        this.restoreOriginalColors();
      }
    }
  }

  /**
   * Toggle high contrast mode on/off.
   * Called from keyboard shortcut (C key).
   */
  public toggleHighContrast(): void {
    const currentSettings = this.settingsService.loadSettings();
    const newHighContrastMode = !currentSettings.general.highContrastMode;

    // Update settings through the settings service (persists and notifies observers)
    this.settingsService.saveSettings({
      ...currentSettings,
      general: {
        ...currentSettings.general,
        highContrastMode: newHighContrastMode,
      },
    });

    // The update() method will be called via observer pattern to apply/restore colors

    const message = `High Contrast Mode ${newHighContrastMode ? 'on' : 'off'}`;
    this.notificationService.notify(message);
  }

  /**
   * Apply high contrast colors to all elements.
   */
  private applyHighContrast(): void {
    // Validate and re-capture colors if DOM has changed
    this.recaptureIfNeeded();

    // Apply body styles
    document.body.style.backgroundColor = this.highContrastDarkColor;
    document.body.style.color = this.highContrastLightColor;

    // Get high contrast colors for all elements
    const highContrastElInfo = this.getHighContrastColors();

    // Apply high contrast colors to elements
    for (const item of highContrastElInfo) {
      if (item.element && item.attrType === 'style') {
        const style = item.element.getAttribute('style') || '';
        const newStyle = style.replace(
          new RegExp(`${item.attr}:\\s*[^;]+`, 'i'),
          `${item.attr}:${item.color}`,
        );
        item.element.setAttribute('style', newStyle);
      } else if (item.element && item.attrType === 'attribute') {
        item.element.setAttribute(item.attr, item.color);
      }
    }

    // Add text shadow filter
    this.addGlowShadowFilter(this.displayService.plot);

    // Apply shadow to text elements
    this.originalColorInfo?.forEach((item) => {
      if (this.hasParentWithStringInID(item.element, 'text')) {
        item.element.setAttribute('filter', 'url(#glow-shadow)');
      }
    });

    // Handle line chart exception
    if ('type' in this.context.instructionContext) {
      if (this.context.instructionContext.type === 'line') {
        document.getElementById(this.context.id)?.classList.add('high-contrast');
      }
    }

    // Apply plot fill style
    this.displayService.plot.setAttribute(
      'style',
      `fill:${this.highContrastLightColor}`,
    );

    // Handle stacked/dodged bar exception: apply patterns
    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'stacked_bar'
        || this.context.instructionContext.type === 'dodged_bar'
      ) {
        this.applyPatternsToElements(highContrastElInfo);
      }
    }
  }

  /**
   * Restore original colors when turning off high contrast.
   */
  private restoreOriginalColors(): void {
    if (!this.originalColorInfo) {
      return;
    }

    // Restore body styles
    document.body.style.backgroundColor = this.defaultBackgroundColor;
    document.body.style.color = this.defaultForegroundColor;

    // Restore SVG element colors
    this.originalColorInfo.forEach((item) => {
      if (item.element && item.attrType === 'style') {
        const style = item.element.getAttribute('style') || '';
        const newStyle = style.replace(
          new RegExp(`${item.attr}:\\s*[^;]+`, 'i'),
          `${item.attr}:${item.color}`,
        );
        item.element.setAttribute('style', newStyle);
      } else if (item.element && item.attrType === 'attribute') {
        item.element.setAttribute(item.attr, item.color);
      }

      // Remove text shadow filter
      if (item.element.getAttribute('filter') === 'url(#glow-shadow)') {
        item.element.removeAttribute('filter');
      }
    });

    // Handle line chart exception
    if ('type' in this.context.instructionContext) {
      if (this.context.instructionContext.type === 'line') {
        document
          .getElementById(this.context.id)
          ?.classList
          .remove('high-contrast');
      }
    }

    // Restore plot fill style
    this.displayService.plot.setAttribute(
      'style',
      `fill:${this.defaultForegroundColor}`,
    );

    // Clean up pattern service
    if (this.patternService) {
      this.patternService.dispose();
      this.patternService = null;
    }
  }

  // ========== Helper Methods ==========

  /**
   * Get all SVG elements from all traces in the Figure hierarchy.
   */
  private getAllTraceElements(): Set<SVGElement> {
    if (this.traceElementsCache !== null) {
      return this.traceElementsCache;
    }

    const elements = new Set<SVGElement>();

    for (const subplotRow of this.figure.subplots) {
      for (const subplot of subplotRow) {
        for (const traceRow of subplot.traces) {
          for (const trace of traceRow) {
            const traceElements = trace.getAllOriginalElements();
            for (const el of traceElements) {
              elements.add(el);
            }
          }
        }
      }
    }

    this.traceElementsCache = elements;
    return elements;
  }

  private isTraceElement(
    element: Element,
    traceElements: Set<SVGElement>,
  ): boolean {
    return traceElements.has(element as SVGElement);
  }

  private getOriginalColorInfo(): ElementColorInfo[] | null {
    const svg = this.displayService.plot;
    if (!svg)
      return null;
    const svgElements = svg.querySelectorAll('*');

    const traceElements = this.getAllTraceElements();
    const originalColorInfo: ElementColorInfo[] = [];

    for (let i = 0; i < svgElements.length; i++) {
      const el = svgElements[i];

      if (el.getAttribute('visibility') === 'hidden') {
        continue;
      }

      const style = el.getAttribute('style') || '';
      const styleFillMatch = style.match(/fill:\s*([^;]+)/i);
      const styleStrokeMatch = style.match(/stroke:\s*([^;]+)/i);

      const isInSelectors = this.isTraceElement(el, traceElements);

      const complexPath = el.getAttribute('d');
      let isComplexPath = false;
      if (complexPath) {
        isComplexPath
          = complexPath.length > HighContrastConstants.MIN_COMPLEX_PATH_LENGTH;
      }
      const cantBeBackground = isComplexPath;

      if (styleFillMatch) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: styleFillMatch[1].trim(),
          isInSelectors,
          cantBeBackground,
          attr: 'fill',
          attrType: 'style',
        });
      }
      if (styleStrokeMatch) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: styleStrokeMatch[1].trim(),
          isInSelectors,
          cantBeBackground,
          attr: 'stroke',
          attrType: 'style',
        });
      }

      const attrFill = el.getAttribute('fill');
      if (attrFill) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: attrFill.trim(),
          isInSelectors,
          cantBeBackground,
          attr: 'fill',
          attrType: 'attribute',
        });
      }
      const attrStroke = el.getAttribute('stroke');
      if (attrStroke) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: attrStroke.trim(),
          isInSelectors,
          cantBeBackground,
          attr: 'stroke',
          attrType: 'attribute',
        });
      }
    }

    return originalColorInfo;
  }

  private getHighContrastColors(): ElementColorInfo[] {
    const originalColorInfo = this.originalColorInfo;
    if (!originalColorInfo)
      return [];

    const spreadColors
      = this.spreadColorsAcrossLuminanceSpectrum(originalColorInfo);

    const highContrastElInfo = spreadColors.map(item => ({
      ...item,
      color: this.toColorStep(item),
    }));

    return highContrastElInfo;
  }

  private hasParentWithStringInID(
    el: Element,
    searchString: string = '',
    notString: string = '',
  ): boolean {
    let current = el.parentElement;

    while (current) {
      if (current.tagName === 'svg' || current.tagName === 'BODY') {
        break;
      }

      if (notString.length > 0) {
        if (current.id.startsWith(notString)) {
          return false;
        }
      }

      if (searchString.length > 0) {
        if (current.id.startsWith(searchString)) {
          return true;
        }
      }

      current = current.parentElement;
    }

    return false;
  }

  private addGlowShadowFilter(svgHtml: HTMLElement): void {
    const svg = svgHtml as unknown as SVGSVGElement;

    if (svg.querySelector('#glow-shadow')) {
      return;
    }

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    const filter = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'filter',
    );
    filter.setAttribute('id', 'glow-shadow');
    filter.setAttribute('x', HighContrastConstants.GLOW_FILTER_OFFSET);
    filter.setAttribute('y', HighContrastConstants.GLOW_FILTER_OFFSET);
    filter.setAttribute('width', HighContrastConstants.GLOW_FILTER_SIZE);
    filter.setAttribute('height', HighContrastConstants.GLOW_FILTER_SIZE);

    const filterHTML = `
    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_OUTER}" result="blur1"/>
    <feOffset dx="0" dy="0" result="offsetblur1" in="blur1"/>
    <feFlood flood-color="black" result="color1"/>
    <feComposite in="color1" in2="offsetblur1" operator="in" result="shadow1"/>

    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_MIDDLE}" result="blur2"/>
    <feOffset dx="0" dy="0" result="offsetblur2" in="blur2"/>
    <feFlood flood-color="black" result="color2"/>
    <feComposite in="color2" in2="offsetblur2" operator="in" result="shadow2"/>

    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_MIDDLE}" result="blur3"/>
    <feOffset dx="0" dy="0" result="offsetblur3" in="blur3"/>
    <feFlood flood-color="black" result="color3"/>
    <feComposite in="color3" in2="offsetblur3" operator="in" result="shadow3"/>

    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_INNER}" result="blur4"/>
    <feOffset dx="0" dy="0" result="offsetblur4" in="blur4"/>
    <feFlood flood-color="black" result="color4"/>
    <feComposite in="color4" in2="offsetblur4" operator="in" result="shadow4"/>

    <feMerge>
      <feMergeNode in="shadow1"/>
      <feMergeNode in="shadow2"/>
      <feMergeNode in="shadow3"/>
      <feMergeNode in="shadow4"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `;

    filter.innerHTML = filterHTML;
    defs.appendChild(filter);
  }

  private toColorStep(colorInfo: ElementColorInfo): string {
    const value = colorInfo.color;
    if (value === 'none' || value === 'transparent') {
      return value;
    }

    if (this.hasParentWithStringInID(colorInfo.element, 'text')) {
      return this.highContrastLightColor;
    }

    const colorEquivalents = [...this.colorEquivalents];

    const ctx = this.getSharedCanvasContext();
    if (!ctx)
      return value;
    ctx.fillStyle = '#000';
    ctx.fillStyle = value.trim();
    let hex = ctx.fillStyle;

    if (/^#[0-9a-f]{8}$/i.test(hex)) {
      const r = Number.parseInt(hex.slice(1, 3), 16);
      const g = Number.parseInt(hex.slice(3, 5), 16);
      const b = Number.parseInt(hex.slice(5, 7), 16);
      const a
        = Number.parseInt(hex.slice(7, 9), 16)
          / HighContrastConstants.RGB_MAX_VALUE;

      const blendedR = Math.round(
        r * a + HighContrastConstants.RGB_MAX_VALUE * (1 - a),
      );
      const blendedG = Math.round(
        g * a + HighContrastConstants.RGB_MAX_VALUE * (1 - a),
      );
      const blendedB = Math.round(
        b * a + HighContrastConstants.RGB_MAX_VALUE * (1 - a),
      );

      hex = `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
    } else if (!/^#[0-9a-f]{6}$/i.test(hex)) {
      return value;
    }

    let useNearWhite = false;
    const nearWhiteScale = HighContrastConstants.NEAR_WHITE_LUMINANCE_SCALE;

    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'bar'
        || this.context.instructionContext.type === 'histogram'
      ) {
        if (colorInfo.isInSelectors) {
          useNearWhite = true;
        }
      }
    }

    const outputColorHex = this.findClosestColor(
      value,
      colorEquivalents,
      useNearWhite,
      nearWhiteScale,
      colorInfo.cantBeBackground,
    );

    return outputColorHex;
  }

  private findClosestColor(
    inputColor: string,
    colorArray: string[],
    useNearWhite: boolean,
    nearWhiteScale: number,
    cantBeBackground: boolean,
  ): string {
    if (colorArray.length === 0) {
      throw new Error('Color array cannot be empty');
    }

    const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
      const normalized = hex.replace('#', '');
      return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
      };
    };

    const getLuminance = (rgb: { r: number; g: number; b: number }): number => {
      return (
        HighContrastConstants.LUMINANCE_RED_COEFF * rgb.r
        + HighContrastConstants.LUMINANCE_GREEN_COEFF * rgb.g
        + HighContrastConstants.LUMINANCE_BLUE_COEFF * rgb.b
      );
    };

    const colorDistance = (
      c1: { r: number; g: number; b: number },
      c2: { r: number; g: number; b: number },
    ): number => {
      return Math.sqrt(
        (c1.r - c2.r) ** 2
        + (c1.g - c2.g) ** 2
        + (c1.b - c2.b) ** 2,
      );
    };

    const inputRgb = hexToRgb(inputColor);

    if (cantBeBackground) {
      const backgroundIndex = colorArray.indexOf(this.highContrastDarkColor);
      if (backgroundIndex !== -1) {
        colorArray.splice(backgroundIndex, 1);
      }
    }

    if (useNearWhite) {
      const inputLuminance = getLuminance(inputRgb);
      const nearWhiteThreshold
        = HighContrastConstants.RGB_MAX_VALUE * (1 - nearWhiteScale);

      if (inputLuminance >= nearWhiteThreshold) {
        return colorArray[0];
      }

      if (colorArray.length === 1) {
        return colorArray[0];
      }

      let closestColor = colorArray[0];
      if (colorArray.length > 1) {
        let minDistance = colorDistance(inputRgb, hexToRgb(colorArray[1]));

        for (let i = 1; i < colorArray.length; i++) {
          const distance = colorDistance(inputRgb, hexToRgb(colorArray[i]));
          if (distance < minDistance) {
            minDistance = distance;
            closestColor = colorArray[i];
          }
        }
      }

      return closestColor;
    } else {
      let closestColor = colorArray[0];
      let minDistance = colorDistance(inputRgb, hexToRgb(colorArray[0]));

      for (let i = 1; i < colorArray.length; i++) {
        const distance = colorDistance(inputRgb, hexToRgb(colorArray[i]));
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = colorArray[i];
        }
      }

      const index = colorArray.indexOf(closestColor);
      const reversedIndex = colorArray.length - 1 - index;
      return colorArray[reversedIndex];
    }
  }

  public interpolateColors(
    startColor: string,
    endColor: string,
    count: number,
  ): string[] {
    const numColors = Math.max(2, Math.floor(count));

    const startRgb = this.parseColorToRgb(startColor);
    const endRgb = this.parseColorToRgb(endColor);

    if (!startRgb || !endRgb) {
      return [startColor, endColor];
    }

    if (numColors === 2) {
      return [startColor, endColor];
    }

    const colors: string[] = [];

    const interpolateAt = (t: number): string => {
      const r = Math.round(startRgb.r + t * (endRgb.r - startRgb.r));
      const g = Math.round(startRgb.g + t * (endRgb.g - startRgb.g));
      const b = Math.round(startRgb.b + t * (endRgb.b - startRgb.b));
      return this.rgbToHex({ r, g, b });
    };

    for (let i = 0; i < numColors; i++) {
      const t = i / (numColors - 1);
      colors.push(interpolateAt(t));
    }

    return colors;
  }

  private parseColorToRgb(
    color: string,
  ): { r: number; g: number; b: number } | null {
    const trimmed = color.trim();

    const ctx = this.getSharedCanvasContext();
    if (!ctx)
      return null;

    ctx.fillStyle = '#000';
    ctx.fillStyle = trimmed;
    const hex = ctx.fillStyle;

    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: Number.parseInt(hex.slice(1, 3), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        b: Number.parseInt(hex.slice(5, 7), 16),
      };
    }

    return null;
  }

  private rgbToHex(rgb: { r: number; g: number; b: number }): string {
    const toHex = (n: number): string => {
      const clamped = Math.max(0, Math.min(HighContrastConstants.RGB_MAX_VALUE, n));
      return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  private normalizeColor(color: string): string {
    const ctx = this.getSharedCanvasContext();
    if (!ctx)
      return color.toLowerCase().replace(/\s/g, '');

    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    return ctx.fillStyle.toLowerCase();
  }

  private spreadColorsAcrossLuminanceSpectrum(
    colorInfos: ElementColorInfo[],
  ): ElementColorInfo[] {
    const rgbToHsl = (rgb: {
      r: number;
      g: number;
      b: number;
    }): { h: number; s: number; l: number } => {
      const r = rgb.r / HighContrastConstants.RGB_MAX_VALUE;
      const g = rgb.g / HighContrastConstants.RGB_MAX_VALUE;
      const b = rgb.b / HighContrastConstants.RGB_MAX_VALUE;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      if (max === min) {
        return { h: 0, s: 0, l };
      }

      const d = max - min;
      const s
        = l > HighContrastConstants.LIGHTNESS_MIDPOINT
          ? d / (2 - max - min)
          : d / (max + min);

      let h = 0;
      if (max === r) {
        h
          = ((g - b) / d
            + (g < b ? HighContrastConstants.HSL_HUE_DIVISOR : 0))
          / HighContrastConstants.HSL_HUE_DIVISOR;
      } else if (max === g) {
        h
          = ((b - r) / d + HighContrastConstants.HSL_GREEN_HUE_OFFSET)
            / HighContrastConstants.HSL_HUE_DIVISOR;
      } else {
        h
          = ((r - g) / d + HighContrastConstants.HSL_BLUE_HUE_OFFSET)
            / HighContrastConstants.HSL_HUE_DIVISOR;
      }

      return { h, s, l };
    };

    const hslToRgb = (hsl: {
      h: number;
      s: number;
      l: number;
    }): { r: number; g: number; b: number } => {
      const { h, s, l } = hsl;

      if (s === 0) {
        const gray = Math.round(l * HighContrastConstants.RGB_MAX_VALUE);
        return { r: gray, g: gray, b: gray };
      }

      const hue2rgb = (p: number, q: number, t: number): number => {
        let tNorm = t;
        if (tNorm < 0)
          tNorm += 1;
        if (tNorm > 1)
          tNorm -= 1;
        if (tNorm < HighContrastConstants.HSL_THRESHOLD_ONE_SIXTH)
          return p + (q - p) * HighContrastConstants.HSL_HUE_DIVISOR * tNorm;
        if (tNorm < HighContrastConstants.HSL_THRESHOLD_ONE_HALF)
          return q;
        if (tNorm < HighContrastConstants.HSL_THRESHOLD_TWO_THIRDS) {
          return (
            p
            + (q - p)
            * (HighContrastConstants.HSL_THRESHOLD_TWO_THIRDS - tNorm)
            * HighContrastConstants.HSL_HUE_DIVISOR
          );
        }
        return p;
      };

      const q
        = l < HighContrastConstants.LIGHTNESS_MIDPOINT
          ? l * (1 + s)
          : l + s - l * s;
      const p = 2 * l - q;

      return {
        r: Math.round(
          hue2rgb(p, q, h + HighContrastConstants.HSL_THRESHOLD_ONE_THIRD)
          * HighContrastConstants.RGB_MAX_VALUE,
        ),
        g: Math.round(hue2rgb(p, q, h) * HighContrastConstants.RGB_MAX_VALUE),
        b: Math.round(
          hue2rgb(p, q, h - HighContrastConstants.HSL_THRESHOLD_ONE_THIRD)
          * HighContrastConstants.RGB_MAX_VALUE,
        ),
      };
    };

    const selectorItems: {
      index: number;
      luminance: number;
      hsl: { h: number; s: number; l: number };
    }[] = [];

    for (let i = 0; i < colorInfos.length; i++) {
      const item = colorInfos[i];
      if (item.color === 'none' || item.color === 'transparent') {
        continue;
      }
      if (item.isInSelectors) {
        const rgb = this.parseColorToRgb(item.color);
        if (rgb) {
          const hsl = rgbToHsl(rgb);
          selectorItems.push({
            index: i,
            luminance: hsl.l,
            hsl,
          });
        }
      }
    }

    if (selectorItems.length <= 1) {
      return colorInfos.map(item => ({ ...item }));
    }

    const luminances = selectorItems.map(item => item.luminance);
    const minLum = Math.min(...luminances);
    const maxLum = Math.max(...luminances);
    const lumRange = maxLum - minLum;

    const result: ElementColorInfo[] = colorInfos.map(item => ({ ...item }));

    for (const selectorItem of selectorItems) {
      let newLuminance: number;

      if (lumRange === 0) {
        newLuminance = HighContrastConstants.DEFAULT_MIDRANGE_LUMINANCE;
      } else {
        const normalizedPosition = (selectorItem.luminance - minLum) / lumRange;
        newLuminance = normalizedPosition;
      }

      const newHsl = {
        h: selectorItem.hsl.h,
        s: selectorItem.hsl.s,
        l: newLuminance,
      };
      const newRgb = hslToRgb(newHsl);
      const newColor = this.rgbToHex(newRgb);

      result[selectorItem.index].color = newColor;
    }

    return result;
  }

  private applyPatternsToElements(
    highContrastElInfo: ElementColorInfo[],
  ): void {
    if (!this.originalColorInfo)
      return;

    if (!this.patternService) {
      this.patternService = new PatternService();
      const svg = this.displayService.plot as unknown as SVGSVGElement;
      this.patternService.initialize(svg);
    }

    const elementToHighContrastColor = new Map<SVGElement, string>();
    for (const item of highContrastElInfo) {
      if (item.isInSelectors && item.attr === 'fill') {
        elementToHighContrastColor.set(item.element, item.color);
      }
    }

    const colorGroups = new Map<string, ElementColorInfo[]>();

    for (const item of this.originalColorInfo) {
      if (item.isInSelectors && item.attr === 'fill') {
        const normalizedColor = this.normalizeColor(item.color);
        if (!colorGroups.has(normalizedColor)) {
          colorGroups.set(normalizedColor, []);
        }
        colorGroups.get(normalizedColor)!.push(item);
      }
    }

    let patternIndex = 0;
    for (const [_color, elements] of colorGroups) {
      const patternType
        = this.patternService.getPatternTypeByIndex(patternIndex);

      for (const item of elements) {
        const baseColor
          = elementToHighContrastColor.get(item.element)
            || this.highContrastLightColor;

        const patternColor = this.getMostContrastingColor(baseColor);

        this.patternService.applyPattern(item.element, {
          type: patternType,
          baseColor,
          patternColor,
        });
      }

      patternIndex++;
    }
  }

  private getMostContrastingColor(color: string): string {
    const colorLuminance = this.getRelativeLuminance(color);
    const darkLuminance = this.getRelativeLuminance(this.highContrastDarkColor);
    const lightLuminance = this.getRelativeLuminance(
      this.highContrastLightColor,
    );

    const darkContrast = Math.abs(colorLuminance - darkLuminance);
    const lightContrast = Math.abs(colorLuminance - lightLuminance);

    return darkContrast > lightContrast
      ? this.highContrastDarkColor
      : this.highContrastLightColor;
  }

  private getRelativeLuminance(color: string): number {
    const rgb = this.parseColorToRgb(color);
    if (!rgb)
      return HighContrastConstants.DEFAULT_MIDRANGE_LUMINANCE;

    return (
      (HighContrastConstants.LUMINANCE_RED_COEFF * rgb.r
        + HighContrastConstants.LUMINANCE_GREEN_COEFF * rgb.g
        + HighContrastConstants.LUMINANCE_BLUE_COEFF * rgb.b)
      / HighContrastConstants.RGB_MAX_VALUE
    );
  }
}
