import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from '@jest/globals';
import { CREATORS, dublinCorePairs, dublinCoreTags, PUBLISHER, RIGHTS, stripSiteName } from '../../scripts/dublinCore';
import { firstCommitDate, lastCommitDate } from '../../scripts/gitDates';
import { inlineJson } from '../../scripts/jsonLd';
import { findOffenders, HARD_LIMIT, limitFor, SOFT_LIMIT } from '../../scripts/pageSizes';
import { fallbackDescription, MAX_DESCRIPTION, PROJECT_PAGES, truncate } from '../../scripts/typedocSeo';

/**
 * Tests for the pieces of the site build that decide what search engines see:
 * the git-derived dates behind sitemap `<lastmod>` and TechArticle
 * `datePublished`/`dateModified` (`scripts/gitDates.js`), the Googlebot page
 * budget (`scripts/pageSizes.js`), the description text on TypeDoc pages
 * (`scripts/typedocSeo.js`), and the Dublin Core block reference managers
 * read (`scripts/dublinCore.js`).
 *
 * `scripts/build-site.js` itself writes `_site/` and shells out on import, so
 * these modules hold the logic it delegates to, and are tested here directly.
 *
 * It runs in the `esm` project because the modules under test are ESM — the
 * repo is `"type": "module"` — and the CommonJS project cannot require them,
 * the same arrangement as `testArgs.esm-test.ts`.
 */

/** A throwaway repository with one file, renamed once, committed on known dates. */
function repoWithRename(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'maidr-gitdates-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const git = (args: string[], date: string): void => {
    execFileSync('git', args, {
      cwd,
      env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      stdio: 'ignore',
    });
  };
  git(['init', '-q'], '2024-01-15T12:00:00Z');
  writeFileSync(join(cwd, 'guide.md'), '# Guide\n');
  git(['add', 'guide.md'], '2024-01-15T12:00:00Z');
  git(['commit', '-q', '-m', 'add guide'], '2024-01-15T12:00:00Z');
  git(['mv', 'guide.md', 'renamed.md'], '2024-02-20T12:00:00Z');
  git(['commit', '-q', '-m', 'rename guide'], '2024-02-20T12:00:00Z');
  writeFileSync(join(cwd, 'renamed.md'), '# Guide\n\nMore.\n');
  git(['add', 'renamed.md'], '2024-03-05T12:00:00Z');
  git(['commit', '-q', '-m', 'extend guide'], '2024-03-05T12:00:00Z');
  return cwd;
}

describe('gitDates', () => {
  const cwd = repoWithRename();

  it('should date a page by the last commit that touched it', () => {
    expect(lastCommitDate(cwd, 'renamed.md', 'fallback')).toBe('2024-03-05');
  });

  it('should find the commit that first added a page even across a rename', () => {
    expect(firstCommitDate(cwd, 'renamed.md', 'fallback')).toBe('2024-01-15');
  });

  it('should fall back for a path git has never seen', () => {
    expect(lastCommitDate(cwd, 'missing.md', 'fallback')).toBe('fallback');
    expect(firstCommitDate(cwd, 'missing.md', 'fallback')).toBe('fallback');
  });

  it('should fall back outside a git checkout', () => {
    const bare = mkdtempSync(join(tmpdir(), 'maidr-nogit-'));
    expect(lastCommitDate(bare, 'anything.md', '2026-01-01')).toBe('2026-01-01');
    expect(firstCommitDate(bare, 'anything.md', '2026-01-01')).toBe('2026-01-01');
  });
});

describe('pageSizes', () => {
  it('should hold ordinary pages to the limit with headroom', () => {
    expect(limitFor('index.html')).toBe(SOFT_LIMIT);
    expect(limitFor('docs/SCHEMA.html')).toBe(SOFT_LIMIT);
  });

  it('should hold API pages to the Googlebot cutoff itself', () => {
    expect(limitFor('api/classes/Controller.html')).toBe(HARD_LIMIT);
    expect(HARD_LIMIT).toBe(2_097_152);
  });

  it('should exempt the noindex example demos', () => {
    expect(limitFor('examples/recharts/index.html')).toBeNull();
  });

  it('should report each offender with the limit it broke', () => {
    const offenders = findOffenders([
      { file: 'index.html', size: SOFT_LIMIT },
      { file: 'react.html', size: SOFT_LIMIT + 1 },
      { file: 'api/classes/Big.html', size: HARD_LIMIT - 1 },
      { file: 'api/classes/Bigger.html', size: HARD_LIMIT + 1 },
      { file: 'examples/recharts/index.html', size: HARD_LIMIT * 2 },
    ]);
    expect(offenders).toEqual([
      { file: 'react.html', size: SOFT_LIMIT + 1, limit: SOFT_LIMIT },
      { file: 'api/classes/Bigger.html', size: HARD_LIMIT + 1, limit: HARD_LIMIT },
    ]);
  });
});

describe('typedocSeo', () => {
  it('should leave a short summary alone', () => {
    expect(truncate('Main controller class.')).toBe('Main controller class.');
  });

  it('should cut a long summary at a word boundary with an ellipsis', () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const cut = truncate(words);
    expect(cut.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(cut.endsWith('...')).toBe(true);
    // The kept text is a prefix that stops on a word boundary, not mid-word.
    expect(words.startsWith(cut.slice(0, -3))).toBe(true);
    expect(words[cut.length - 3]).toBe(' ');
  });

  it('should name the kind, symbol and module when there is no doc comment', () => {
    expect(fallbackDescription('Variable', 'default', 'adapters/amcharts')).toBe(
      'Variable default in module adapters/amcharts of the MAIDR JavaScript API reference.',
    );
    expect(fallbackDescription('Module', 'controller')).toBe(
      'Module controller of the MAIDR JavaScript API reference.',
    );
  });

  it('should keep every project page description within a snippet', () => {
    for (const { description } of Object.values(PROJECT_PAGES)) {
      expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    }
  });
});

describe('jsonLd', () => {
  it('should escape a less-than sign so a value cannot close the script tag', () => {
    const json = inlineJson({ description: 'Closes early? </script><img src=x>' });
    expect(json).not.toContain('</script>');
    expect(json).toContain('\\u003c/script');
    expect(JSON.parse(json)).toEqual({ description: 'Closes early? </script><img src=x>' });
  });

  it('should indent when asked, for a node spliced into the template graph', () => {
    expect(inlineJson({ '@id': 'https://maidr.ai/#software' }, 2)).toBe(
      '{\n  "@id": "https://maidr.ai/#software"\n}',
    );
  });
});

describe('dublinCore', () => {
  const base = {
    title: 'A Page',
    description: 'What the page is about.',
    identifier: 'https://maidr.ai/a-page.html',
  };

  /** The pairs for `opts`, collapsed to a name -> values lookup. */
  function byName(opts: Parameters<typeof dublinCorePairs>[0]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [name, content] of dublinCorePairs(opts)) {
      (out[name] ??= []).push(content);
    }
    return out;
  }

  it('carries the facts Zotero needs when a page has no citation_ tags', () => {
    const tags = byName(base);
    expect(tags['DC.title']).toEqual(['A Page']);
    expect(tags['DC.creator']).toEqual(CREATORS);
    expect(tags['DC.publisher']).toEqual([PUBLISHER]);
    expect(tags['DC.identifier']).toEqual([base.identifier]);
    expect(tags['DC.rights']).toEqual([RIGHTS]);
    expect(tags['DC.language']).toEqual(['en']);
  });

  it('never emits citation_ tags, which Google Scholar reserves for papers', () => {
    const names = dublinCorePairs(base).map(([name]) => name);
    expect(names.every(name => name.startsWith('DC.'))).toBe(true);
  });

  it('writes surname-first creators so Zotero splits the name', () => {
    for (const creator of CREATORS) {
      expect(creator).toMatch(/^[^,]+, .+$/);
    }
  });

  it('gives one DC.creator tag per author rather than one joined string', () => {
    const creators = ['Seo, JooYoung', 'Venkatesh, Saairam'];
    expect(byName({ ...base, creators })['DC.creator']).toEqual(creators);
  });

  it('types the home page as Software and other pages as Text', () => {
    expect(byName({ ...base, type: 'Software' })['DC.type']).toEqual(['Software']);
    expect(byName(base)['DC.type']).toEqual(['Text']);
  });

  it('omits DC.date rather than emitting an empty one', () => {
    expect(byName(base)['DC.date']).toBeUndefined();
    expect(byName({ ...base, date: '2026-09-06' })['DC.date']).toEqual(['2026-09-06']);
  });

  it('escapes a title that would otherwise close the content attribute', () => {
    const rendered = dublinCoreTags({ ...base, title: 'A "quoted" <b>title</b> & more' });
    expect(rendered).toContain('content="A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt; &amp; more"');
    expect(rendered).not.toContain('<b>');
  });

  it('files the page under its own title, not the browser-tab one', () => {
    // <title>, og:title and twitter:title keep the suffix; a bibliographic
    // record should not, and the sibling sites strip theirs too.
    const suffixed = { ...base, title: 'React Accessibility Integration - MAIDR', siteName: 'MAIDR' };
    expect(byName(suffixed)['DC.title']).toEqual(['React Accessibility Integration']);

    const api = { ...base, title: 'HighlightOverlay | MAIDR JavaScript API', siteName: 'MAIDR JavaScript API' };
    expect(byName(api)['DC.title']).toEqual(['HighlightOverlay']);
  });

  it('leaves a title that only contains a separator intact', () => {
    // The home page's own title carries no suffix, and a colon or a dash
    // inside a title is not a site name.
    const home = 'MAIDR: Accessible Data Visualization with Sonification, Braille and Text';
    expect(stripSiteName(home, 'MAIDR')).toBe(home);
    expect(stripSiteName('Braille - Text - MAIDR', 'MAIDR')).toBe('Braille - Text');
  });

  it('never strips a title down to nothing', () => {
    expect(stripSiteName('MAIDR', 'MAIDR')).toBe('MAIDR');
    expect(stripSiteName(' - MAIDR', 'MAIDR')).toBe(' - MAIDR');
  });

  it('leaves the title alone when no site name is given', () => {
    expect(stripSiteName('Anything - MAIDR', '')).toBe('Anything - MAIDR');
  });

  it('renders one meta tag per pair', () => {
    const opts = { ...base, date: '2026-09-06' };
    const rendered = dublinCoreTags(opts);
    expect(rendered.match(/<meta /g)).toHaveLength(dublinCorePairs(opts).length);
  });
});
