import type { Maidr } from '@model/grammar';

declare global {
  interface Window {
    maidr: Maidr;
  }
}
