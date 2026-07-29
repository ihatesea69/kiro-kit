import Image from 'next/image';
import Link from 'next/link';
import { appName, assetPath } from '@/lib/shared';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      {/* The mark is a transparent cut-out, so no rounding or box shadow here —
          those belong to the purple tile used for the favicon, not to the ghost. */}
      <Image
        src={assetPath('/logo.png')}
        alt=""
        width={144}
        height={144}
        className="mb-6"
        priority
      />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">{appName}</h1>
      <p className="mb-8 max-w-xl text-fd-muted-foreground">
        A Kiro workspace takes a lot of files to set up. Pick a preset and Kiro-Kit writes the
        agents, skills, commands, hooks, and spec templates for you.
      </p>
      <pre className="mb-8 rounded-lg border bg-fd-secondary px-4 py-3 text-sm">
        <code>npx kiro-kit init</code>
      </pre>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/docs/guide/quick-start"
          className="rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
        >
          Quick Start
        </Link>
        <Link href="/docs" className="rounded-lg border px-4 py-2 text-sm font-medium">
          Documentation
        </Link>
        <Link href="/docs/reference" className="rounded-lg border px-4 py-2 text-sm font-medium">
          Preset Reference
        </Link>
      </div>
    </main>
  );
}
