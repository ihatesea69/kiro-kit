import Image from 'next/image';
import Link from 'next/link';
import { appName, assetPath } from '@/lib/shared';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
      <Image
        src={assetPath('/logo.png')}
        alt=""
        width={128}
        height={128}
        className="mb-6 rounded-3xl shadow-lg"
        priority
      />
      <h1 className="mb-4 text-4xl font-bold tracking-tight">{appName}</h1>
      <p className="mb-8 max-w-xl text-fd-muted-foreground">
        Bootstrap an engineer-grade Kiro workspace with one command. Self-contained presets of
        agents, skills, commands, hooks, and spec templates.
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
