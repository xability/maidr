# PR example previews

Every pull request gets a **live, browsable preview of the example gallery**,
deployed to Cloudflare Pages. Reviewers (including screen-reader users) can open
a URL instead of pulling the branch and running `npm run build` locally.

- **Stable per-PR URL:** `https://pr-<number>.maidr-preview.pages.dev`
- A bot posts (and keeps updating) a comment on the PR with the link.
- The preview refreshes automatically on every new commit to the PR.
- **Nothing is committed to the PR branch.** The built site lives only in a CI
  artifact and on Cloudflare Pages, so the PR's git history stays clean.

## How it works

Two workflows implement GitHub's recommended secure pattern for previewing
pull requests — including PRs from forks — without exposing secrets to
untrusted code:

| Workflow | Trigger | Context | Secrets? | Job |
| --- | --- | --- | --- | --- |
| [`pr-preview-build.yml`](workflows/pr-preview-build.yml) | `pull_request` | untrusted (PR code) | **no** | `npm run build:preview` → uploads `_site` + PR number as artifacts |
| [`pr-preview-deploy.yml`](workflows/pr-preview-deploy.yml) | `workflow_run` | trusted (base repo) | **yes** | downloads the artifacts, deploys to Cloudflare Pages, comments the URL |

The build job never sees the Cloudflare secrets, and the deploy job never checks
out or runs the PR's code — it only publishes the pre-built files. The PR number
is passed between them via an artifact (the `workflow_run` event doesn't carry it
for fork PRs) and validated as strictly numeric before use.

`npm run build:preview` produces `_site/` — all `dist` bundles (core + every
adapter), the recharts/victory/react single-file examples, and the example
gallery. It is the same pipeline as the published docs site minus TypeDoc, so
the `/api` link in the preview's navbar is the only intentionally dead link.

You can run the exact same build locally:

```bash
npm run build:preview
npx http-server _site -o     # then open /examples.html
```

## One-time setup

The workflows are safe to merge before this is done — the deploy job just logs a
warning and skips until the two secrets exist.

1. **Create a Cloudflare API token** (Cloudflare dashboard → **Manage Account →
   API Tokens → Create Token → Custom token**). Give it exactly one permission:
   **Account → Cloudflare Pages → Edit**.
2. **Find your Account ID** (Cloudflare dashboard → account **Overview**, right-hand
   **API** panel).
3. **Add both as repository secrets** (GitHub → repo **Settings → Secrets and
   variables → Actions → New repository secret**):
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. *(Optional)* **Pre-create the Pages project** so its production branch is
   pinned to `main` from the start. The deploy workflow also attempts this
   automatically, but you can do it once by hand:
   ```bash
   npx wrangler pages project create maidr-preview --production-branch=main
   ```

That's it. Open a PR and the preview comment appears once the build + deploy
finish.

## Notes

- The Cloudflare **project name** is `maidr-preview` (referenced in
  `pr-preview-deploy.yml`). Change it there and in step 4 if you prefer a
  different name.
- This is entirely separate from the production docs site at
  [maidr.ai](https://maidr.ai), which is still deployed by
  [`docs.yml`](workflows/docs.yml) via GitHub Pages. PR previews don't touch it.
- Preview deployments count against the Cloudflare Pages free tier (500
  builds/month at the time of writing) — generous for typical PR volume.
- To disable previews, delete the two `pr-preview-*.yml` workflows (or remove the
  secrets to leave them dormant).
