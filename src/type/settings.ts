export type AriaMode = 'assertive' | 'polite';

export interface GeneralSettings {
  volume: number;
  highlightColor: string;
  brailleDisplaySize: number;
  minFrequency: number;
  maxFrequency: number;
  autoplayDuration: number;
  ariaMode: AriaMode;
}

export interface Settings {
  general: GeneralSettings;
}
