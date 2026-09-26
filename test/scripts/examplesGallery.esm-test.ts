import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from '@jest/globals';
import {
  buildGallery,
  CHART_TITLES,
  CHART_TYPES,
  EXCLUDED_EXAMPLES,
  EXPERIMENTAL_MARK,
  listExamplePages,
  PAGE_TYPES,
  renderGallery,
  STABLE_TYPES,
  TITLES,
} from '../../scripts/examplesGallery';

/**
 * Keeps every page in `examples/` reachable from the gallery on `examples.html`.
 *
 * The gallery used to be a hand-written list of `loadHTML(...)` calls in
 * `scripts/build-site.js`. It named 88 pages; the directory held 199. Nothing
 * failed when someone added the 200th, so 127 examples — the whole amCharts,
 * Highcharts, Vega-Lite and Google Charts families among them — shipped inside
 * the site and were reachable from nothing on it. That is the failure this
 * guards: not a broken link, but a page with no link at all, which no build
 * step and no browser can notice.
 *
 * `scripts/build-site.js` now derives the list from the directory, so the
 * arithmetic works out on its own. What still needs guarding is the deny-list —
 * the one place a page can be kept out — and the labels, because a generated
 * list can go wrong in a way the old one could not: two pages resolving to the
 * same link text. A link is announced by its text alone, so two links reading
 * "Dodged Barplot" and opening different charts are, to anyone not looking at
 * the address bar, the same link twice.
 *
 * Jest runs from `rootDir`, so this is the repository root; `import.meta` is
 * usable in this project but `process.cwd()` is what the other ESM script tests
 * already use.
 */
const ROOT = process.cwd();
const EXAMPLES = join(ROOT, 'examples');

const pages = listExamplePages(EXAMPLES);
const { sections, unclaimed } = buildGallery(pages);

/** Every page the gallery links, in section order. */
function linkedPages(): string[] {
  return sections.flatMap(section => section.items.map(item => item.page).filter(page => page !== undefined));
}

describe('the examples gallery', () => {
  it('should reach every page in examples/', () => {
    const linked = new Set(linkedPages());
    const excluded = new Set(EXCLUDED_EXAMPLES.map(entry => entry.page));

    const unreachable = pages.filter(page => !linked.has(page) && !excluded.has(page));

    expect(unreachable).toEqual([]);
  });

  it('should put every page in a group rather than silently dropping it', () => {
    expect(unclaimed).toEqual([]);
  });

  it('should link something for every page it found', () => {
    // The counts are the assertion the issue was written about: 199 top-level
    // pages plus the integration subdirectories, minus the three Vite entry
    // points, all linked.
    expect(linkedPages()).toHaveLength(pages.length - EXCLUDED_EXAMPLES.length);
  });

  it('should link each page exactly once', () => {
    const linked = linkedPages();

    expect(new Set(linked).size).toBe(linked.length);
  });

  it('should link pages that exist', () => {
    const missing = linkedPages().filter(page => !existsSync(join(EXAMPLES, page)));

    expect(missing).toEqual([]);
  });

  it('should list the same pages before and after a build', () => {
    // `examples/react/` is written by `npm run build:react-example` and
    // `examples/*/dist/` by the Recharts and Victory builds, so a listing that
    // included them would give one gallery on a fresh checkout and another on
    // a built tree. The React entry those would add is the one `loadReact()`
    // already opens. Checked against a directory this test lays out, so it
    // holds whether or not a build has run here.
    const dir = mkdtempSync(join(tmpdir(), 'maidr-gallery-'));
    try {
      writeFileSync(join(dir, 'plotly-bar.html'), '');
      for (const built of ['react', 'dist', 'node_modules']) {
        mkdirSync(join(dir, built));
        writeFileSync(join(dir, built, 'index.html'), '');
      }
      mkdirSync(join(dir, 'chartjs'));
      writeFileSync(join(dir, 'chartjs', 'bar.html'), '');

      expect(listExamplePages(dir)).toEqual(['chartjs/bar.html', 'plotly-bar.html']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the gallery\'s deny-list', () => {
  it('should name pages that exist', () => {
    const missing = EXCLUDED_EXAMPLES
      .filter(entry => !existsSync(join(EXAMPLES, entry.page)))
      .map(entry => entry.page);

    // A stale entry is worse than no entry: it reads as a decision someone
    // made about a page that is no longer there, and hides the next page that
    // takes its name.
    expect(missing).toEqual([]);
  });

  it('should say why each page is excluded', () => {
    const unexplained = EXCLUDED_EXAMPLES
      .filter(entry => entry.reason.trim().length === 0)
      .map(entry => entry.page);

    expect(unexplained).toEqual([]);
  });

  it('should not exclude a page the gallery also links', () => {
    const linked = new Set(linkedPages());
    const both = EXCLUDED_EXAMPLES.filter(entry => linked.has(entry.page)).map(entry => entry.page);

    expect(both).toEqual([]);
  });
});

describe('the gallery\'s labels', () => {
  it('should give every entry in a group its own link text', () => {
    const collisions = sections.flatMap((section) => {
      const seen = new Set<string>();
      return section.items
        .filter(item => (seen.has(item.label) ? true : (seen.add(item.label), false)))
        .map(item => `${section.id}: ${item.label}`);
    });

    expect(collisions).toEqual([]);
  });

  it('should announce a heading for every entry', () => {
    const unnamed = sections.flatMap(section =>
      section.items.filter(item => item.heading.trim().length === 0).map(item => item.page ?? item.label));

    expect(unnamed).toEqual([]);
  });

  it('should not curate a title for a page that is gone', () => {
    const stale = Object.keys(TITLES).filter(page => !existsSync(join(EXAMPLES, page)));

    expect(stale).toEqual([]);
  });
});

describe('the gallery\'s markup', () => {
  const html = renderGallery(sections);

  it('should link the page and call loadHTML with it and its heading', () => {
    // A real href, not `#`: the gallery is the only path a crawler has to
    // the pages under `examples/`, and a link to `#` is not a link to
    // anyone who cannot see the iframe it fills.
    expect(html).toContain(
      '<li><a href="examples/barplot.html" onclick="loadHTML(\'barplot.html\', \'Barplot\'); return false;">Barplot</a></li>',
    );
    expect(html).toContain(
      '<li><a href="examples/plotly-bar.html" onclick="loadHTML(\'plotly-bar.html\', \'Plotly Bar Chart\'); return false;">Bar Chart</a></li>',
    );
  });

  it('should give every entry a real href', () => {
    expect(html).not.toContain('href="#"');
    expect(html.match(/<a href="examples\//g)).toHaveLength(
      sections.reduce((n, section) => n + section.items.length, 0),
    );
  });

  it('should keep the hand-written entries that are not pages', () => {
    expect(html).toContain('href="examples/react/index.html" onclick="loadReact(); return false;"');
    expect(html).toContain('href="examples/recharts/index.html" onclick="loadRecharts(); return false;"');
    expect(html).toContain('href="examples/victory/index.html" onclick="loadVictory(); return false;"');
  });

  it('should be what build-site.js drops into the page', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'build-site.js'), 'utf8');

    // The one interpolation stands in for the 88 `loadHTML` calls that used to
    // be written out here; if it goes, the gallery is hand-listed again.
    expect(script).toContain(`\${gallery}`);
    expect(script).toContain('renderGallery(sections)');
  });
});

/**
 * The types listed under one `###` heading of `docs/SCHEMA.md`'s stability
 * section. Read here rather than through `schemaTypes.ts`, which imports the
 * enum through a path alias this ESM project does not map;
 * `schemaStability.test.ts` already holds the two lists to the enum.
 */
function schemaListed(heading: string): string[] {
  const schema = readFileSync(join(ROOT, 'docs', 'SCHEMA.md'), 'utf8');
  const start = schema.indexOf(`### ${heading}\n`);
  const rest = schema.slice(start + heading.length + 5);
  const end = rest.indexOf('\n#');
  return [...(end === -1 ? rest : rest.slice(0, end)).matchAll(/`([a-z_0-9]+)`/g)].map(match => match[1]);
}

describe('the gallery\'s experimental marks', () => {
  const stable = schemaListed('Stable');
  const experimental = schemaListed('Experimental');
  const items = sections.flatMap(section => section.items.map(item => ({ section: section.id, ...item })));

  it('should take the stable set from docs/SCHEMA.md', () => {
    expect([...STABLE_TYPES].sort()).toEqual([...stable].sort());
  });

  it('should name only declarable trace types', () => {
    const known = new Set([...stable, ...experimental]);
    const unknown = [...Object.values(CHART_TYPES), ...Object.values(PAGE_TYPES)]
      .flat()
      .filter(type => !known.has(type));

    expect(unknown).toEqual([]);
  });

  it('should decide the types of every chart the shared vocabulary names', () => {
    // A title without types would put a new chart in the gallery unmarked
    // whatever its stability, which is the drift the mark exists to prevent.
    expect(Object.keys(CHART_TYPES).sort()).toEqual(Object.keys(CHART_TITLES).sort());
  });

  it('should decide, for every page, whether its charts are experimental', () => {
    const undecided = items
      .filter(item => item.page !== undefined && item.experimental === undefined)
      .map(item => item.page);

    expect(undecided).toEqual([]);
  });

  it('should not list types for a page that is gone', () => {
    const stale = Object.keys(PAGE_TYPES).filter(page => !existsSync(join(EXAMPLES, page)));

    expect(stale).toEqual([]);
  });

  it('should mark a hand-authored page by the types its MAIDR JSON declares', () => {
    // These pages carry their schema inline, so what they declare is the
    // ground truth the maps above are checked against. Integration pages are
    // not: their `type` keys are the charting library's, not MAIDR's.
    const declarable = new Set([...stable, ...experimental]);
    const wrong = items
      .filter(item => item.section === 'html' && item.page !== undefined)
      .flatMap((item) => {
        const source = readFileSync(join(EXAMPLES, item.page!), 'utf8').replace(/&quot;/g, '"');
        const declared = [...source.matchAll(/"type"\s*:\s*"([a-z_]+)"/g)]
          .map(match => match[1])
          .filter(type => declarable.has(type));
        if (declared.length === 0) {
          return [];
        }
        const expected = declared.every(type => experimental.includes(type));
        return item.experimental === expected ? [] : [`${item.page}: ${declared.join(', ')}`];
      });

    expect(wrong).toEqual([]);
  });

  it('should put the mark after the link text and the heading, and nowhere on a stable entry', () => {
    const html = renderGallery(sections);

    expect(html).toContain(
      `<li><a href="examples/roc.html" onclick="loadHTML('roc.html', 'ROC Curve ${EXPERIMENTAL_MARK}'); return false;">ROC Curve ${EXPERIMENTAL_MARK}</a></li>`,
    );
    const misplaced = items
      .filter(item => item.label.includes(EXPERIMENTAL_MARK) !== (item.experimental === true)
        || item.heading.includes(EXPERIMENTAL_MARK) !== (item.experimental === true)
        || (item.experimental === true && !item.label.endsWith(EXPERIMENTAL_MARK)))
      .map(item => item.page ?? item.label);

    expect(misplaced).toEqual([]);
  });
});
