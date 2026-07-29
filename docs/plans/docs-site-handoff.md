# Documentation site: design record and operating notes

> **Status: shipped.** The site is live at https://ihatesea69.github.io/kiro-kit/
> (built in PR #19, favicon and logo in PR #20). This file began as the build
> hand-off; it is kept as the design record — why the site is shaped the way it is,
> and the constraints that still bind anyone editing it. Sections 2–5 remain
> operating guidance; §6 records what shipped.
>
> **The one rule to remember:** everything under `/docs/reference` is generated from
> `presets/*/manifest.json` at build time and is gitignored. Never hand-edit it —
> your changes will vanish on the next build. Edit the presets, or the generator at
> `scripts/generate-docs-reference.mjs`.

Framework choice was made by the repo owner: Fumadocs (https://www.fumadocs.dev).
Facts below were verified against fumadocs.dev on 2026-07-29; version-sensitive
details are flagged so they can be re-checked rather than trusted blindly.

## 1. Objective

Publish a documentation site for Kiro-Kit at
`https://ihatesea69.github.io/kiro-kit/`, built with Fumadocs and deployed to GitHub
Pages by its own workflow.

Two things make this project different from a generic docs site, and both should
drive the design:

1. **The reference surface is enormous and hand-maintained.** 9 presets ×
   ~70 commands, ~25 agents, ~25 skills each. Writing those pages by hand guarantees
   drift.
2. **Drift has already happened twice.** The `init` selector advertised "19 agents,
   20 skills" for a preset shipping 25/23 (fixed in v0.10.1, PR #16). Any docs page
   that restates counts or catalogs by hand will rot the same way.

**So the core requirement is: the entire reference section is generated from the
repo, never authored.** Prose pages are hand-written; catalogs are not.

## 2. Verified facts about Fumadocs

From https://www.fumadocs.dev/docs (fetched 2026-07-29):

- Scaffold with `npm create fumadocs-app`.
- **Node.js ≥ 22 required.** This matters — see Risk 1.
- Framework options: Next.js, Astro (with React), Waku, React Router, Tanstack Start.
  **Choose Next.js** — it is the primary target and every community GitHub-Pages
  walkthrough assumes it.
- Packages: `fumadocs-core`, `fumadocs-ui`, `fumadocs-mdx`.
- Structure: content in `content/docs/*.mdx`, config in `source.config.ts`, a source
  adapter (commonly `lib/source.ts`), docs layout at `app/(docs)/layout.tsx`,
  sidebar order/labels via `meta.json` files inside content folders.

From https://www.fumadocs.dev/docs/deploying/static:

- Static export = `output: 'export'` in `next.config.mjs`; optional `trailingSlash`,
  `skipTrailingSlashRedirect`. All server-side loaders must pre-render.
- **Search must be switched to static mode**, otherwise it silently does nothing on
  a static host. Export `staticGET` as `GET` from the search route with
  `export const revalidate = false`, and on the client use
  `useDocsSearch({ type: 'static', initOrama })` from `fumadocs-core/search/client`.
  The browser then downloads the index and searches locally.

GitHub-Pages specifics (community walkthrough, treat as a starting point and verify:
https://zephinax.com/blog/deploy-nextjs-fumadocs-github-pages):

- `basePath: '/kiro-kit'` in production, `assetPrefix` to the full
  `https://ihatesea69.github.io/kiro-kit/` URL, `images: { unoptimized: true }`
  (mandatory under `output: 'export'`), `trailingSlash: true`.
- Write an empty `.nojekyll` into the output, or GitHub strips `_next/`.
- **Gotcha:** with `basePath` set, the static search index must be fetched from
  `/kiro-kit/api/search/static.json`, not `/api/search/static.json`. This is the
  single most likely reason search "works locally, breaks in production".

## 3. Repo constraints you must respect

Read these before writing any config. Each has bitten this repo before.

### Workspace layout
`pnpm-workspace.yaml` currently declares `packages/*`, `presets/*`,
`scripts/parity-sync`; root `package.json` `workspaces` declares `packages/*`,
`presets/*`. **Both must be updated** if the docs app lands outside those globs.
Recommended location: `apps/docs`.

### Do NOT name the docs build script `build`
Root scripts are recursive: `"build": "pnpm -r --if-present run build"`. CI runs
that across a Node **18/20/22** matrix. Fumadocs needs Node ≥22, so a docs package
exposing `build` would fail the Node-18 leg and add a fourth reason CI is red.
Expose `docs:build` / `docs:dev` instead, and run them explicitly.

### The docs app must be private
`packages/cli` is the only published artifact and its `files` field is
`dist/**, scripts/postinstall.js, README.md, LICENSE, CHANGELOG.md`. Mark the docs
app `"private": true` so no future `pnpm -r publish` can leak it to npm.

### Never write generated output into `presets/`
A structural test enforces a strict no-orphan invariant: every file inside a preset
must be declared in that preset's `manifest.json`
(`packages/cli/tests/structural/manifest-no-orphan.test.ts`). A generator that
drops files into `presets/` will break the suite. Generate into
`apps/docs/content/docs/reference/` and gitignore it.

### CI and release are already broken — stay out of them
CI has failed on every commit for months; the Publish workflow has failed on every
tag since v0.4.1 (npm releases are done by hand). Three known root causes:
`pnpm/action-setup` receiving both `version: 9` and a `packageManager` field; the
`packages/cli` `test` script finding no tests unless run with `--root ../..`; and
`pnpm run lint` failing because there is no eslint config and eslint is not a
dependency. **Do not try to fix these here.** Ship a standalone
`.github/workflows/docs.yml` that depends on none of them.

## 4. Existing content to reuse

`docs/` already holds ~1,300 lines of usable prose. Migrate, do not rewrite:

| File | Destination |
|---|---|
| `docs/how-it-works.md` | `guide/how-it-works` |
| `docs/architecture.md`, `docs/system-architecture.md` | `guide/architecture` (merge — they overlap) |
| `docs/creating-presets.md` | `guide/creating-presets` |
| `docs/code-standards.md` | `contributing/code-standards` |
| `docs/release-process.md` | `contributing/releasing` |
| `docs/faq.md` | `faq` |
| `docs/project-roadmap.md` | `roadmap` |
| `docs/guide/COMMANDS.md`, `docs/guide/SKILLS.md` | **delete — superseded by generated reference** |
| `docs/plans/**`, `docs/audits/**` | leave in place, not part of the site |

`.md` → `.mdx` is mostly a rename; check for raw HTML and `<` characters in prose,
which MDX will try to parse as JSX.

## 5. The generator (the important part)

`scripts/generate-docs-reference.mjs`, zero dependencies, run before every docs
build.

**Inputs:** `presets/*/manifest.json` (name, description, `files[]`), plus YAML
frontmatter from each declared file — commands expose `description`, agents expose
`name` + `description`, skills expose `name` + `description` in `SKILL.md`.
A frontmatter parser already exists in
`packages/cli/tests/structural/frontmatter-validation.test.ts` — copy its approach
rather than adding a YAML dependency.

**Outputs** (all gitignored, all regenerated):

```
apps/docs/content/docs/reference/
  index.mdx                    # preset comparison table, counts computed live
  presets/<preset>.mdx         # one page per preset: description, counts,
                               # command/agent/skill tables, hooks, example specs
  meta.json                    # sidebar order
```

**Rules for the generator:**

- Every number on every page is computed by counting files. Never hardcode a count.
- If a declared file is missing, or a command/agent lacks frontmatter `description`,
  **fail loudly with a non-zero exit** — a silent blank cell is how the last drift
  went unnoticed for four releases.
- Link each item to its source on GitHub at `main`.
- Emit a "generated by `scripts/generate-docs-reference.mjs` — do not edit" banner in
  every file.

Wire it as `predocs:build` and `predocs:dev` so it cannot be skipped.

## 6. What shipped

All five phases below landed in PR #19 (site) and PR #20 (favicon and logo). Where
the implementation differs from the plan, the difference is noted. Concretely, on
`main` today:

| Piece | Where it lives |
|-------|----------------|
| Fumadocs app (private, Next.js) | `apps/docs/` |
| Prose pages | `apps/docs/content/docs/{index,faq}.mdx`, `guide/`, `features/`, `contributing/` |
| Generated reference (gitignored) | `apps/docs/content/docs/reference/` |
| Generator | `scripts/generate-docs-reference.mjs` |
| Build entry points | root `pnpm docs:dev` / `pnpm docs:build` → `@kiro-kit/docs` |
| Deploy | `.github/workflows/docs.yml`, standalone from `ci.yml` and `publish.yml` |

Two deviations from the plan worth knowing:

- The generator is wired as an explicit `docs:generate` step inside `docs:dev` and
  `docs:build` rather than the `pre*` hooks §5 suggested. Same guarantee — it cannot
  be skipped — but it is visible in the script instead of implied by npm.
- `basePath` is read from `NEXT_PUBLIC_BASE_PATH` and applied only when set, so a
  local build serves from `/` while the deployed build serves from `/kiro-kit/`.

The original phase plan, kept for the reasoning behind each step:

**Phase 1 — scaffold, local only.** `npm create fumadocs-app` into `apps/docs`
(Next.js). Add `apps/*` to `pnpm-workspace.yaml` and root `workspaces`. Mark the app
private, rename its scripts to `docs:dev` / `docs:build`. Get `pnpm docs:dev` serving
a placeholder page.
*Exit:* dev server runs; `pnpm -r run build` at the root still behaves as before.

**Phase 2 — content migration.** Move the files in §4, fix MDX breakage, write
`meta.json` sidebar structure, write `content/docs/index.mdx` (landing) and a
`guide/quick-start`.
*Exit:* every page renders, no broken internal links.

**Phase 3 — generated reference.** Write the generator, gitignore its output, wire
the pre-hooks, delete `docs/guide/COMMANDS.md` and `SKILLS.md`.
*Exit:* `pnpm docs:build` from a clean checkout produces all 9 preset pages with
counts matching `find`; deleting a preset file and rebuilding changes the page.

**Phase 4 — static export + deploy.** `output: 'export'`, `basePath`,
`assetPrefix`, `images.unoptimized`, `trailingSlash`, `.nojekyll`. Convert search to
static (`staticGET` + `useDocsSearch({type:'static'})`) **and fix the index URL for
`basePath`**. Add `.github/workflows/docs.yml`: trigger on push to `main` touching
`docs/**`, `presets/**`, `apps/docs/**`; steps = checkout → pnpm → Node 22 →
install → `pnpm docs:build` → `actions/upload-pages-artifact` →
`actions/deploy-pages`. Repo owner must set Settings → Pages → Source: **GitHub
Actions** (not a `gh-pages` branch).
*Exit:* site live at `https://ihatesea69.github.io/kiro-kit/`; **search returns
results on the deployed site**, not just locally.

**Phase 5 — README slimming.** Cut the README to badges, a 5-line pitch, quick
start, and a link to the site. Move the preset matrix, Powers matrix, and feature
sections into the site. This removes the duplication that caused the count drift.
*Exit:* no counts or catalogs remain in the README.

## 7. Risks / decisions — and how they landed

1. **Node 22 vs the repo's `engines: >=18`.** The docs app needs 22; the CLI must
   keep supporting 18. *Resolved as planned:* the constraint stayed local to
   `apps/docs/`, the root engine was not raised, and the docs workflow pins Node 22
   independently of `ci.yml`.
2. **Static search is easy to ship broken.** It fails only in production, only with
   `basePath` — a green workflow is not evidence. *Still the standing check:* after
   any change to `next.config`, `basePath`, or the search wiring, query the deployed
   site, not localhost.
3. **i18n (Vietnamese + English).** *Shipped English-only*, no locale layer. Content
   sits directly under `content/docs/`, so adding i18n later means moving pages into
   a locale folder — deliberate, but not free.
4. **Static-export bundle size.** The search index covers every page including the
   generated reference. If it gets heavy, cut the generated pages out of the index
   rather than reaching for a hosted search service.
5. **Fumadocs moves fast.** These notes are from 2026-07-29. If the framework's
   current docs disagree with §2, trust the framework, not this file.

## 8. Effort, as spent

Roughly as estimated: the generator (§5) was the substantial piece, and the
static-search-under-`basePath` issue in Phase 4 took most of the deploy session.

## Sources

- Fumadocs quick start — https://www.fumadocs.dev/docs
- Fumadocs static build — https://www.fumadocs.dev/docs/deploying/static
- Fumadocs UI — https://www.fumadocs.dev/docs/ui
- Next.js + Fumadocs on GitHub Pages (community, verify before trusting) —
  https://zephinax.com/blog/deploy-nextjs-fumadocs-github-pages
