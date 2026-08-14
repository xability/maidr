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

/** Resolves after the watcher's coalesced scan has run. */
async function settle(): Promise<void> {
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
    // The backstop for the case the rule above cannot decide: a chart bound and
    // then discarded without a single sweep ever finding it in the document. It
    // is indistinguishable from one still being mounted, so the adapter waits —
    // but not forever, or a chart that was never seen would be retained for the
    // life of the page.
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

      cell!.innerHTML = FIXTURES.scatter.html;
      await settle();
      expect(released).toEqual([]);

      // Each unrelated mutation is one more frame the mount did not land in.
      for (let frame = 0; frame < 2; frame++) {
        document.body.appendChild(document.createElement('p'));
        await settle();
      }

      expect(released).toEqual([first]);
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
