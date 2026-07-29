export const appName = 'Kiro-Kit';

/**
 * Prefix a `public/` asset with the deployment base path.
 *
 * Under `output: 'export'` with `images.unoptimized`, `next/image` passes `src`
 * straight through without applying `basePath`, so a bare `/logo.png` resolves
 * to the domain root and 404s on GitHub Pages. Metadata icons (`app/icon.png`)
 * are prefixed correctly by Next; public assets are not.
 */
export function assetPath(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`;
}
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'ihatesea69',
  repo: 'kiro-kit',
  branch: 'main',
};
