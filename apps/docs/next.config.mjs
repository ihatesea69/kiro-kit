import path from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// The repo root. Pinned explicitly because Next's workspace-root inference
// picks the wrong lockfile when this checkout is nested inside another one
// (e.g. a git worktree under `.claude/worktrees/`), which breaks module
// resolution against the hoisted pnpm store.
const repoRoot = path.resolve(import.meta.dirname, '../..');

// Empty for local dev (served at http://localhost:3000), `/kiro-kit` for the
// GitHub Pages deployment at https://ihatesea69.github.io/kiro-kit/. Set by
// .github/workflows/docs.yml. Re-exported through `env` so client components
// can build absolute paths that survive the basePath prefix -- see
// components/search.tsx.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  reactStrictMode: true,
  // GitHub Pages serves `/foo/` -> `/foo/index.html`.
  trailingSlash: true,
  // Required under `output: 'export'`: there is no server to optimize images.
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    root: repoRoot,
  },
};

export default withMDX(config);
