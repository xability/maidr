import type { Llm, LlmVersion } from './llm';
import { DEFAULT_OLLAMA_BASE_URL } from './llm';

/**
 * Default number of characters rendered per braille row when no user setting
 * is configured. 32 matches the most common physical braille display width.
 */
export const DEFAULT_BRAILLE_SIZE = 32;

/**
 * Default number of physical braille rows. 1 means single-line mode, where
 * the braille output is a flat string without row reversal or space-padding.
 */
export const DEFAULT_BRAILLE_LINES = 1;

/**
 * Upper bound on the configured number of braille rows. Acts as a sanity cap
 * so that pathological settings cannot produce extremely large braille
 * strings at render time.
 */
export const MAX_BRAILLE_LINES = 20;

// 160 = 2x the largest known single-line display (80 cells) — generous
// headroom for unrecognized hardware while still rejecting obviously bogus
// manual input.
export const MAX_BRAILLE_SIZE = 160;

/**
 * Upper bound on `general.echoCount`.
 *
 * The Settings field is free-typed and its value persists, so both the dialog
 * and the audio service clamp against this — a stray digit would otherwise
 * queue that many oscillator and convolver graphs on every navigation step.
 */
export const MAX_ECHO_COUNT = 20;

/** Echoes a point at z = zMax produces, before the user changes it. */
export const DEFAULT_ECHO_COUNT = 5;

/** Bounds on `general.echoDuration`, the gap between successive echoes (seconds). */
export const MIN_ECHO_DURATION = 0.05;
export const MAX_ECHO_DURATION = 2;

/** Gap between successive echoes, in seconds, before the user changes it. */
export const DEFAULT_ECHO_DURATION = 0.3;

/**
 * Brings an echo count into the range the audio service can schedule.
 *
 * @param value - The raw setting value, which may come from a free-typed field
 * @returns A whole count within [0, {@link MAX_ECHO_COUNT}]
 */
export function clampEchoCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ECHO_COUNT;
  }
  return Math.min(MAX_ECHO_COUNT, Math.max(0, Math.floor(value)));
}

/**
 * Brings an echo duration into the range the audio service can schedule.
 *
 * @param value - The raw setting value in seconds
 * @returns A duration within [{@link MIN_ECHO_DURATION}, {@link MAX_ECHO_DURATION}]
 */
export function clampEchoDuration(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ECHO_DURATION;
  }
  return Math.min(MAX_ECHO_DURATION, Math.max(MIN_ECHO_DURATION, value));
}

export const BRAILLE_DISPLAY_KINDS = ['single', 'multi', 'manual'] as const;
export type BrailleDisplayKind = (typeof BRAILLE_DISPLAY_KINDS)[number];

// 'manual' preserves whatever cells/lines numbers an older saved settings
// object already has, so users upgrading from before the preset selector
// see the same effective configuration.
export const DEFAULT_BRAILLE_DISPLAY_KIND: BrailleDisplayKind = 'manual';

export interface BrailleDisplayPreset {
  id: string;
  label: string;
  manufacturer: string;
  cells: number;
  lines: number;
}

// Discriminated union: the manual variant has no preset id and intentionally
// omits cells/lines so callers spreading the slice over previous state
// (`{ ...prev, ...slice }`) preserve the user's existing values; the preset
// variant always supplies cells/lines together with a non-null id.
export type BraillePresetSelection
  = | {
    brailleDisplayKind: 'single' | 'multi';
    brailleDisplayPresetId: string;
    brailleDisplaySize: number;
    brailleDisplayLines: number;
  }
  | {
    brailleDisplayKind: 'manual';
    brailleDisplayPresetId: null;
  };

/**
 * ARIA live region politeness level for screen reader announcements.
 */
export type AriaMode = 'assertive' | 'polite';

/**
 * User expertise level for tailoring AI chat responses.
 */
export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced' | 'custom';

/**
 * Mouse hover interaction mode for plot navigation.
 */
export type HoverMode = 'off' | 'pointermove' | 'click';

/**
 * Configuration settings for a specific LLM model.
 */
export interface LlmModelSettings {
  name: string;
  /** API key for cloud providers; server base URL for Ollama. */
  apiKey: string;
  enabled: boolean;
  version: LlmVersion;
}

/**
 * LLM-specific settings including expertise level and model configurations.
 */
export interface LlmSettings {
  expertiseLevel: ExpertiseLevel;
  customExpertise?: string;
  customInstruction: string;
  models: Record<Llm, LlmModelSettings>;
}

/**
 * General application settings for audio, visual, and accessibility features.
 */
export interface GeneralSettings {
  volume: number;
  /**
   * Maximum number of echoes for 3D charts. A point with z = zMax produces this
   * many echoes; lower z values produce proportionally fewer. 0 disables echoes.
   */
  echoCount: number;
  /**
   * Volume of the final echo as a percentage (0–100) of the main tone's volume.
   * Echo volumes lerp from 100% (the original tone) down to this value at the
   * Nth echo, so each echo position has a fixed volume regardless of how many
   * actually play.
   */
  echoVolume: number;
  /**
   * Delay between successive echoes, in seconds.
   */
  echoDuration: number;
  highlightColor: string;
  highContrastMode: boolean;
  highContrastLevels: number;
  highContrastLightColor: string;
  highContrastDarkColor: string;
  brailleDisplaySize: number;
  brailleDisplayLines: number;
  brailleDisplayKind: BrailleDisplayKind;
  brailleDisplayPresetId: string | null;
  /**
   * Which tactile graphics display MAIDR drives over Bluetooth, or null when
   * the reader has not chosen one. Separate from the braille-display preset:
   * that one sizes the braille panel, this one names a device with a pin area
   * to draw the chart onto.
   */
  tactileDisplayDeviceId: string | null;
  minFrequency: number;
  maxFrequency: number;
  autoplayDuration: number;
  ariaMode: AriaMode;
  hoverMode: HoverMode;
}

/**
 * Root settings object containing all user preferences and configurations.
 */
export interface Settings {
  general: GeneralSettings;
  llm: LlmSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  general: {
    volume: 50,
    echoCount: DEFAULT_ECHO_COUNT,
    echoVolume: 50,
    echoDuration: DEFAULT_ECHO_DURATION,
    highlightColor: '#03c809',
    highContrastMode: false,
    highContrastLevels: 2,
    highContrastLightColor: '#ffffff',
    highContrastDarkColor: '#000000',
    brailleDisplaySize: DEFAULT_BRAILLE_SIZE,
    brailleDisplayLines: DEFAULT_BRAILLE_LINES,
    brailleDisplayKind: DEFAULT_BRAILLE_DISPLAY_KIND,
    brailleDisplayPresetId: null,
    tactileDisplayDeviceId: null,
    minFrequency: 200,
    maxFrequency: 1000,
    autoplayDuration: 4000,
    ariaMode: 'assertive',
    hoverMode: 'pointermove',
  },
  llm: {
    expertiseLevel: 'basic',
    customInstruction: '',
    models: {
      OPENAI: {
        enabled: false,
        apiKey: '',
        name: 'OpenAI',
        version: 'gpt-5.5',
      },
      ANTHROPIC_CLAUDE: {
        enabled: false,
        apiKey: '',
        name: 'Anthropic Claude',
        version: 'claude-opus-4-8',
      },
      GOOGLE_GEMINI: {
        enabled: false,
        apiKey: '',
        name: 'Google Gemini',
        version: 'gemini-3.5-flash',
      },
      // Ollama runs locally and needs no API key; the apiKey field holds the
      // server base URL instead, so the shared "enabled + non-empty key"
      // readiness checks apply uniformly across providers.
      OLLAMA: {
        enabled: false,
        apiKey: DEFAULT_OLLAMA_BASE_URL,
        name: 'Ollama',
        version: 'llama3.2',
      },
    },
  },
};
