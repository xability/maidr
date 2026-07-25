import type { VegaView } from '@adapters/vegalite/types';

/**
 * Build a {@link VegaView} stub backed by a dataset dump, mirroring how a
 * live Vega view answers `data(name)` — including throwing for names the
 * compiled spec never registered, which is what makes the adapter's
 * fallback chain observable in tests.
 */
export function makeView(datasets: Record<string, unknown[]>): VegaView {
  const view = {
    data: (name: string): Record<string, unknown>[] => {
      if (!(name in datasets))
        throw new Error(`no dataset ${name}`);
      return datasets[name] as Record<string, unknown>[];
    },
    // Real Vega views expose every registered dataset here; the adapter
    // uses it to enumerate pipelines it cannot address by name.
    getState: (opts?: { data?: boolean }) =>
      (opts?.data ? { data: datasets } : {}),
    container: () => null,
    runAsync: async () => view,
    scale: () => undefined,
  };
  return view as unknown as VegaView;
}
