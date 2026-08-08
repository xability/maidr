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
    // Real Vega views expose every registered dataset name here; the
    // adapter uses it to enumerate pipelines it cannot address by name.
    //
    // Two behaviours are reproduced deliberately, because a laxer stub
    // hides callers that would be dead code in production:
    //
    //  - `data` is a PREDICATE, not a boolean. Real Vega throws
    //    `options.data is not a function` when handed `true`.
    //  - The values are Vega's internal state descriptors, NOT rows.
    //    `getState(...).data.data_2` is `{}`; only `data('data_2')`
    //    returns records. A caller that reads rows off `getState` and
    //    tests them with `Array.isArray` silently finds nothing.
    getState: (opts?: { data?: (name?: string, object?: unknown) => boolean }) => {
      if (opts?.data === undefined)
        return {};
      if (typeof opts.data !== 'function')
        throw new TypeError('options.data is not a function');
      return {
        data: Object.fromEntries(
          Object.keys(datasets)
            .filter(name => opts.data!(name))
            .map(name => [name, {}]),
        ),
      };
    },
    container: () => null,
    runAsync: async () => view,
    scale: () => undefined,
  };
  return view as unknown as VegaView;
}
