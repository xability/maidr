import type { Maidr } from '@type/grammar';

declare global {
  interface Window {
    maidr: Maidr;
  }
}
