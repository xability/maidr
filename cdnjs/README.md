# cdnjs submission

`maidr.json` in this directory is the payload for listing MAIDR on
[cdnjs](https://cdnjs.com). It is not read by any build step here — cdnjs
serves packages from its own repository, and a copy has to be sent there. It
lives in this repo so the contents are reviewed, versioned and tested alongside
the build that produces the files it mirrors, rather than being retyped from
memory the next time something about `dist` changes.

## Why cdnjs as well as jsDelivr

jsDelivr already serves every published version, and the documentation points
at it. The reason to be on both is that sandboxed embedding contexts allow a
fixed set of CDN hosts, and the two big ones are not interchangeable: a page
whose `script-src` names `cdnjs.cloudflare.com` cannot load MAIDR from
jsDelivr, however well jsDelivr works everywhere else. Being on both removes a
class of "the CDN I was told to use does not carry it" failure, and costs one
JSON file.

## Submitting

Fork [`cdnjs/packages`](https://github.com/cdnjs/packages) — **not**
`cdnjs/cdnjs`, which is robot-only — and copy this file verbatim:

```bash
cp cdnjs/maidr.json path/to/packages/packages/m/maidr.json
```

Work on a branch rather than `master` — cdnjs asks for a descriptive name, so
`add-maidr` — and commit as `Add maidr w/ npm auto-update`, which is their
`Add <library> w/ npm/git auto-update` convention. Then open the pull request.
CI validates the file against cdnjs's schema, and approval is at cdnjs
maintainer discretion.

The branch convention, the commit format and the minification cdnjs performs
were read from
[their CONTRIBUTING.md](https://github.com/cdnjs/packages/blob/master/CONTRIBUTING.md)
on 2026-08-03. That process has changed before, so read it again rather than
trusting this file if the submission happens much later.

After the first release lands on cdnjs, nothing further is needed for
subsequent releases: `autoupdate` pulls each new version straight from npm.
Changing what is mirrored, though, means another pull request to
`cdnjs/packages` — this file is the source to edit, and the change only takes
effect once that pull request is merged.

## What is mirrored, and why only this

```
dist/maidr.js        the library
dist/maidr.css       the stylesheet every integration links by name
dist/maidr-math.css  KaTeX, fetched at runtime when a chat response has maths
```

Three files, listed one by one. cdnjs
[asks explicitly](https://github.com/cdnjs/packages/issues/186) that file globs
stay narrow, and a `dist/*.js` here would pull in every adapter bundle
(amcharts, chartjs, vegalite and the rest, each around 1.9 MB) plus their
sourcemaps — `dist/maidr.js.map` alone is 8.7 MB. None of that belongs on a
CDN mirror.

`maidr-math.css` is the one entry that is easy to leave out and expensive to
get wrong. `src/util/katex.ts` links it at runtime, resolving it _relative to
the URL `maidr.js` was loaded from_ — so on a page served from cdnjs it
resolves to a cdnjs URL, and if cdnjs is not mirroring the file that URL 404s.
The failure is quiet and narrow: LaTeX in AI chat responses renders unstyled,
everything else is fine, and no page that never opens the chat notices. Keep it
in the `fileMap`.

Adding a file to `dist` does not mean adding it here. Mirror a file when a page
loading MAIDR from a CDN needs to fetch it by URL — which is what separates
these three from the adapter bundles, whose users name them in a `<script>` tag
and can be served by either CDN.

`filename` names the file cdnjs offers as the default copy-paste URL. It is
`maidr.min.js`, a file cdnjs will have even though this build never emits one:
their CONTRIBUTING.md commits to generating it — "for JavaScript and CSS files,
we'll automatically generate minified versions of them and make them available
at `filename.min.js` or `filename.min.css`" — and that generation is on unless a
package opts out through the optional `optimization` property, which this
manifest does not set. KaTeX's own cdnjs entry names `katex.min.js` on the same
basis. Should their checker disagree anyway, `maidr.js` is the safe substitute.

## Keeping it honest

`test/cdnjs/manifest.test.ts` pins this file to the rest of the repository:
`name`, `description`, `homepage`, `license` and `repository` against
`package.json`, and every mirrored filename against what `scripts/build.js`
actually emits. Rename an output or drop a field and that test fails here,
rather than the mirror quietly serving a 404 for however long it takes someone
to notice.

The test cannot see cdnjs. It checks that this file is right about _this_
repository; whether cdnjs has been told about a change is still a matter of
having opened that second pull request.

## Once it is listed

- Add the cdnjs URLs alongside the jsDelivr ones in `README.md` and `docs/`.
  Until then those URLs 404, so this is deliberately not done in advance.
- Check `https://cdnjs.com/libraries/maidr` picks up the following release
  automatically. If it does not, the `autoupdate` block is wrong and needs
  another pull request to `cdnjs/packages`.
