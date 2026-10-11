// The page's own AMD code, run on demand by e2e_tests/specs/amdHost.spec.ts and
// amdAdapters.spec.ts: `requireLater(names, config)` is the page's next
// `require()`, after an optional `require.config(config)`. require.js's default onError is left in
// place, as on a Quarto page, so a mismatch throws here. A module that is one
// of the adapters' page globals is named after it, so the spec can tell the
// registration hands back the object the page reads.
window.requireLater = (names, config) => {
  const globals = ['maidrObservable', 'maidrECharts', 'maidrHighcharts'];
  const describe = (module) => {
    const global = globals.find(name => module && module === window[name]);
    return global ? `window.${global}` : typeof module;
  };
  return new Promise((resolve) => {
    try {
      if (config)
        require.config(config);
      require(
        names,
        (...modules) => resolve({ resolved: modules.map(describe) }),
        error => resolve({ failed: String(error.message) }),
      );
    } catch (error) {
      resolve({ threw: String(error.message) });
    }
  });
};
