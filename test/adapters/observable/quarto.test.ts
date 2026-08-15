/**
 * What these tests protect.
 *
 * In a Quarto document nothing calls the adapter. An `{ojs}` cell's value *is*
 * the chart, and Quarto inserts it into the page — so the adapter has to
 * notice. Two things about that are easy to get wrong and invisible when they
 * are:
 *
 * - A cell that depends on a `viewof` input re-runs on every change and
 *   replaces its output node. If the watcher only scanned once, the chart
 *   works until the reader touches a slider and then silently stops.
 * - A watcher that does not remember what it bound re-binds the same chart on
 *   every mutation, stacking duplicate schemas on one element.
 */

import { bindObservablePlot, initQuartoObservable } from '@adapters/observable/quarto';
import { FIXTURES } from './fixtures';
import { mountFixture } from './helpers';

/** Installs a JSDOM's globals for the duration of one test. */
function useDom(dom: MountedDom): () => void {
  const saved = {
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
    CustomEvent: globalThis.CustomEvent,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  Object.assign(globalThis, {
    document: dom.window.document,
    MutationObserver: dom.window.MutationObserver,
    CustomEvent: dom.window.CustomEvent,
    // Drive the watcher's coalescing off the macrotask queue so a test can
    // await it without a real frame.
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  });
  return () => Object.assign(globalThis, saved);
}

type MountedDom = ReturnType<typeof mountFixture>['dom'];

/**
 * Resolves after the watcher's coalesced scan has run.
 *
 * Several turns rather than one: the scan is scheduled through the
 * `requestAnimationFrame` stub, and a binding pass can schedule another, so a
 * single short sleep is enough only while the machine is idle. On a loaded CI
 * runner it was not, and the test that depended on it failed there and nowhere
 * else.
 */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn++)
    await new Promise(resolve => setTimeout(resolve, 5));
}

/**
 * Does to a chart what MAIDR's mount does: replace it with a wrapper, then
 * adopt it into React's tree.
 *
 * The chart therefore leaves the document and comes back, which is the reason
 * the adapter cannot treat a chart's absence as a discard until it has seen
 * that chart in the document at least once since binding.
 */
function mountLikeRuntime(chart: Element): void {
  const wrapper = chart.ownerDocument.createElement('div');
  chart.parentNode!.replaceChild(wrapper, chart);
  wrapper.append(chart);
}

describe('binding a chart', () => {
  it('writes the schema to the svg and announces it to the runtime', () => {
    const { dom, svg, element } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const events: Event[] = [];
      dom.window.document.addEventListener('maidr:bindchart', event => events.push(event));

      const result = bindObservablePlot(element);

      expect(result).not.toBeNull();
      expect(svg.getAttribute('maidr-data')).toBe(JSON.stringify(result?.maidr));
      expect(events).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('leaves the DOM alone when the caller asked for the schema only', () => {
    const { dom, svg, element } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const result = bindObservablePlot(element, { autoApply: false });

      expect(result?.maidr).toBeTruthy();
      expect(svg.hasAttribute('maidr-data')).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('watching a Quarto document', () => {
  it('binds a chart an OJS cell inserts after the page has loaded', async () => {
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1" data-nodetype="expression"></div>';
      const bound: unknown[] = [];
      const stop = initQuartoObservable({ onBind: result => bound.push(result) });

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.bar.html;
      await settle();

      expect(bound).toHaveLength(1);
      expect(cell?.querySelector('svg')?.hasAttribute('maidr-data')).toBe(true);
      stop();
    } finally {
      restore();
    }
  });

  it('binds the replacement when a reactive cell re-runs', async () => {
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const bound: unknown[] = [];
      const stop = initQuartoObservable({ onBind: result => bound.push(result) });

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.bar.html;
      await settle();
      // What OJS does on every input change: throw the node away and insert a
      // freshly drawn one.
      cell!.innerHTML = FIXTURES.scatter.html;
      await settle();

      expect(bound).toHaveLength(2);
      stop();
    } finally {
      restore();
    }
  });

  it('does not bind the same chart twice', async () => {
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = `<div id="ojs-cell-1">${FIXTURES.bar.html}</div>`;
      const bound: unknown[] = [];
      const stop = initQuartoObservable({ onBind: result => bound.push(result) });

      // Any mutation triggers another scan; the chart is already bound.
      document.body.appendChild(document.createElement('p'));
      await settle();

      expect(bound).toHaveLength(1);
      stop();
    } finally {
      restore();
    }
  });

  it('stops watching when the returned function is called', async () => {
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const bound: unknown[] = [];
      const stop = initQuartoObservable({ onBind: result => bound.push(result) });
      stop();

      document.querySelector('#ojs-cell-1')!.innerHTML = FIXTURES.bar.html;
      await settle();

      expect(bound).toHaveLength(0);
    } finally {
      restore();
    }
  });
});

describe('charts a reactive cell replaces', () => {
  it('tears down the chart a re-run superseded', async () => {
    // An OJS cell re-runs on every input change and the runtime replaces its
    // output. The chart it replaced is gone from the page but not from MAIDR,
    // which still holds the mounted instance and everything that instance
    // registered — so a reader dragging a slider accumulates one whole chart
    // per frame unless the adapter says the old one is finished.
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const released: Element[] = [];
      document.addEventListener('maidr:unbindchart', (event) => {
        released.push((event as CustomEvent<Element>).detail);
      });
      const stop = initQuartoObservable();

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.bar.html;
      await settle();
      const first = cell!.querySelector('svg')!;
      mountLikeRuntime(first);
      await settle();

      cell!.innerHTML = FIXTURES.scatter.html;
      await settle();

      expect(released).toEqual([first]);
      stop();
    } finally {
      restore();
    }
  });

  it('does not tear down a chart that was only moved', async () => {
    // Binding a chart moves it: the runtime replaces it with a wrapper and
    // adopts it into React's tree, which React commits on its own schedule. So
    // a chart can be out of the document for a frame or two while it is being
    // mounted, and treating that as a removal would tear down the chart that
    // was just bound.
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const released: Element[] = [];
      document.addEventListener('maidr:unbindchart', (event) => {
        released.push((event as CustomEvent<Element>).detail);
      });
      const stop = initQuartoObservable();

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.bar.html;
      await settle();

      mountLikeRuntime(cell!.querySelector('svg')!);
      await settle();

      expect(released).toEqual([]);
      stop();
    } finally {
      restore();
    }
  });

  it('tears down a chart discarded before any sweep saw it mounted', async () => {
    // The case absence alone cannot decide: a chart bound and then discarded
    // without a single sweep ever finding it in the document. The `scatter`
    // fixture is the one that makes it bite — Plot returns a bare `<svg>`
    // unless the chart has a title or a caption to wrap in a `<figure>`, and
    // `innerHTML` leaves a bare one parented to nothing, which is also what a
    // chart mid-mount looks like. Waiting on those would retain a whole chart
    // per redraw, which on a slider drag is a chart per frame.
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const released: Element[] = [];
      document.addEventListener('maidr:unbindchart', (event) => {
        released.push((event as CustomEvent<Element>).detail);
      });
      const stop = initQuartoObservable();

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.scatter.html;
      await settle();
      const first = cell!.querySelector('svg')!;
      expect(first.parentNode).toBe(cell);

      cell!.innerHTML = FIXTURES.bar.html;
      await settle();

      expect(first.parentNode).toBeNull();
      expect(released).toEqual([first]);
      stop();
    } finally {
      restore();
    }
  });

  it('waits for a chart the runtime has not finished mounting', async () => {
    // Mounting detaches the chart and re-attaches it a React commit later, and
    // in between it has no parent. Releasing it there would tear down a chart
    // that is about to appear — the reader sees it and has no way into it.
    // What separates that from the case above is that the runtime takes the
    // chart synchronously, while the adapter is still binding it.
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const released: Element[] = [];
      document.addEventListener('maidr:unbindchart', (event) => {
        released.push((event as CustomEvent<Element>).detail);
      });

      // The runtime's half of the mount, on the event that triggers it: the
      // wrapper takes the chart's place and the chart waits, parentless, for
      // the commit that will adopt it.
      let container: Element | undefined;
      let chart: Element | undefined;
      document.addEventListener('maidr:bindchart', (event) => {
        chart = event.target as Element;
        container = document.createElement('div');
        chart.parentNode?.replaceChild(container, chart);
      });
      const stop = initQuartoObservable();

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.scatter.html;
      await settle();
      // The state under test: out of the page, and belonging to nothing.
      expect(chart?.parentNode).toBeNull();
      expect(container?.isConnected).toBe(true);

      // Several passes, none of which may release it.
      for (let frame = 0; frame < 3; frame++) {
        document.body.appendChild(document.createElement('p'));
        await settle();
      }
      expect(released).toEqual([]);

      // The commit lands and the chart is in the page again.
      container?.append(chart!);
      await settle();

      expect(released).toEqual([]);
      stop();
    } finally {
      restore();
    }
  });
});

describe('a cell holding more than one chart', () => {
  it('keeps both when an OJS cell returns two plots side by side', async () => {
    // A single `{ojs}` cell can return several plots — the standard
    // side-by-side idiom puts them in one container — and they are siblings,
    // not replacements. Treating the second as having superseded the first
    // tears the first one's instance down while it is still on screen: the
    // chart stays visible and silently loses every way in.
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const released: Element[] = [];
      document.addEventListener('maidr:unbindchart', (event) => {
        released.push((event as CustomEvent<Element>).detail);
      });
      const stop = initQuartoObservable();

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.bar.html + FIXTURES.scatter.html;
      await settle();

      expect(cell?.querySelectorAll('svg[maidr-data]')).toHaveLength(2);
      expect(released).toEqual([]);
      stop();
    } finally {
      restore();
    }
  });

  it('tears down both when that cell re-runs', async () => {
    const { dom } = mountFixture('bar');
    const restore = useDom(dom);
    try {
      const { document } = dom.window;
      document.body.innerHTML = '<div id="ojs-cell-1"></div>';
      const released: Element[] = [];
      document.addEventListener('maidr:unbindchart', (event) => {
        released.push((event as CustomEvent<Element>).detail);
      });
      const stop = initQuartoObservable();

      const cell = document.querySelector('#ojs-cell-1');
      cell!.innerHTML = FIXTURES.bar.html + FIXTURES.scatter.html;
      await settle();
      const first = Array.from(cell!.querySelectorAll('svg'));
      first.forEach(mountLikeRuntime);
      await settle();

      cell!.innerHTML = FIXTURES.multiline.html;
      await settle();

      expect(released).toEqual(first);
      stop();
    } finally {
      restore();
    }
  });
});
