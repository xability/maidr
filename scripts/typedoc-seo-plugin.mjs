/**
 * TypeDoc plugin: per-page SEO tags for the API reference at maidr.ai/api/.
 *
 * TypeDoc 0.28 hard-codes one `<meta name="description">` ("Documentation for
 * <project name>") for every page, emits a canonical link only on index.html
 * (from `hostedBaseUrl`), and has no option for either. Its renderer hooks
 * can add to `<head>` but not remove from it, so this plugin adds the
 * per-page tags and `scripts/add-navbar-to-typedoc.js` strips the generic
 * description afterwards, leaving exactly one.
 *
 * Emitted on every page, from the reflection being rendered:
 * - `<link rel="canonical">` (skipped on index.html, which TypeDoc handles)
 * - `<meta name="description">` from the doc comment's summary
 * - Open Graph title, description, url and type
 * - JSON-LD: a TechArticle for the page, in a @graph with minimal stubs of
 *   the site-wide nodes it references (#website, #software, #organization),
 *   so every @id resolves on the page itself. `docs/template.html` carries
 *   the full nodes; Google parses each page on its own, so the stubs cannot
 *   be left out here.
 * - JSON-LD: a BreadcrumbList on pages that show TypeDoc's own breadcrumb
 *   trail, built from the same parent chain (Home > API Reference > module
 *   > symbol). index.html and hierarchy.html show no trail and get none.
 *
 * The description is the same text the page shows in its comment block, so
 * the structured data mirrors visible content, as Google asks.
 *
 * Registered in `typedoc.json` under `plugin` with a `./`-relative path,
 * which TypeDoc resolves against the config file.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Comment, JSX, ReflectionKind } from 'typedoc';
import { dublinCorePairs } from './dublinCore.js';
import { lastCommitDate } from './gitDates.js';
import { inlineJson } from './jsonLd.js';
import { fallbackDescription, PROJECT_PAGES, truncate } from './typedocSeo.js';

const SITE_URL = 'https://maidr.ai/';
const API_URL = 'https://maidr.ai/api/';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The API reference is generated from `src`, so the last commit touching it
 * dates every page. Resolved once: the hook below runs for each of ~1,600
 * pages and shelling out to git that many times would dominate the build.
 */
const SRC_DATE = lastCommitDate(ROOT, 'src', new Date().toISOString().slice(0, 10));

/** Minimal stubs of the nodes docs/template.html declares in full. */
const SITE_NODES = [
  {
    '@type': 'Organization',
    '@id': `${SITE_URL}#organization`,
    'name': '(x)Ability Design Lab',
    'url': 'https://xabilitylab.ischool.illinois.edu/',
  },
  {
    '@type': 'WebSite',
    '@id': `${SITE_URL}#website`,
    'name': 'MAIDR',
    'url': SITE_URL,
  },
  {
    '@type': ['SoftwareSourceCode', 'SoftwareApplication'],
    '@id': `${SITE_URL}#software`,
    'name': 'MAIDR',
    'url': SITE_URL,
  },
];

/**
 * The reflection's summary as one line of plain text, or an empty string
 * when it has none.
 *
 * A function or method keeps its comment on the signature rather than on the
 * declaration, so that is the second place to look. Inline tags are reduced
 * to their text (`{@link AmRoot}` reads "AmRoot") and code spans lose their
 * backticks, since the result goes into a meta attribute, not a page.
 */
function summaryOf(model) {
  const comment = model.comment ?? model.signatures?.find(signature => signature.comment)?.comment;
  if (!comment) {
    return '';
  }
  const parts = comment.summary.map(part => part.kind === 'inline-tag' ? { kind: 'text', text: part.text } : part);
  return Comment.combineDisplayParts(parts).replace(/`/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * The meta description for a page: its summary, or a fallback naming the
 * kind, the symbol and its module, so that identically named exports (every
 * `default`, say) do not all describe themselves the same way.
 */
function describe(model, page) {
  const projectPage = PROJECT_PAGES[page.url];
  if (projectPage) {
    return projectPage.description;
  }
  const summary = summaryOf(model);
  if (summary) {
    return truncate(summary);
  }
  const kind = model.kind === undefined ? 'Symbol' : ReflectionKind.singularString(model.kind);
  const moduleName = model.parent?.isProject() ? '' : model.parent?.getFullName();
  return fallbackDescription(kind, model.name, moduleName);
}

/**
 * The reflections TypeDoc's own breadcrumb lists for `model`: its ancestors
 * below the project that have a page of their own, then the model itself.
 */
function trailOf(model, router) {
  const trail = [];
  for (let current = model; current && !current.isProject(); current = current.parent) {
    if (router.hasOwnDocument(current)) {
      trail.unshift(current);
    }
  }
  return trail;
}

function ldScript(value) {
  return JSX.createElement('script', { type: 'application/ld+json' }, JSX.createElement(JSX.Raw, { html: inlineJson(value) }));
}

export function load(app) {
  app.renderer.hooks.on('head.end', (context) => {
    const { page, router } = context;
    const project = page.project;
    const model = page.model ?? project;
    const projectPage = PROJECT_PAGES[page.url];
    const isIndex = page.url === 'index.html';
    const canonical = isIndex ? API_URL : new URL(page.url, API_URL).toString();
    const pageName = projectPage ? projectPage.title : model.name;
    const headline = pageName ? `${pageName} | ${project.name}` : project.name;
    const description = describe(model, page);

    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        ...SITE_NODES,
        {
          '@type': 'TechArticle',
          'headline': headline,
          'description': description,
          'url': canonical,
          'isPartOf': { '@id': `${SITE_URL}#website` },
          'about': { '@id': `${SITE_URL}#software` },
          'publisher': { '@id': `${SITE_URL}#organization` },
          'author': { '@id': `${SITE_URL}#organization` },
        },
      ],
    };

    // The trail mirrors the tsd-breadcrumb the page shows; project pages
    // have none, so they get no BreadcrumbList either.
    let breadcrumb = null;
    if (!projectPage) {
      const crumbs = [
        { name: 'Home', item: SITE_URL },
        { name: 'API Reference', item: API_URL },
        ...trailOf(model, router).map(reflection => ({
          name: reflection.name,
          item: new URL(router.getFullUrl(reflection), API_URL).toString(),
        })),
      ];
      breadcrumb = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': crumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'name': crumb.name,
          'item': crumb.item,
        })),
      };
    }

    return JSX.createElement(
      JSX.Fragment,
      null,
      isIndex ? null : JSX.createElement('link', { rel: 'canonical', href: canonical }),
      JSX.createElement('meta', { name: 'description', content: description }),
      JSX.createElement('meta', { property: 'og:title', content: headline }),
      JSX.createElement('meta', { property: 'og:description', content: description }),
      JSX.createElement('meta', { property: 'og:url', content: canonical }),
      JSX.createElement('meta', { property: 'og:type', content: 'article' }),
      JSX.createElement('meta', { property: 'og:site_name', content: 'MAIDR' }),
      ...dublinCorePairs({
        title: headline,
        siteName: project.name,
        description,
        identifier: canonical,
        date: SRC_DATE,
      }).map(([name, content]) => JSX.createElement('meta', { name, content })),
      ldScript(graph),
      breadcrumb ? ldScript(breadcrumb) : null,
    );
  });
}
