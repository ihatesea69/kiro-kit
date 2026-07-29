import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Provider } from '@/components/provider';
import { appName } from '@/lib/shared';
import './global.css';

const inter = Inter({
  subsets: ['latin'],
});

// The docs pages set their own title via generateMetadata; `template` wraps
// those, and `default` covers the home page, which otherwise rendered an empty
// <title> and showed the bare URL as the tab name.
export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description:
    'Bootstrap an engineer-grade Kiro workspace with one command. Self-contained presets of agents, skills, commands, hooks, and spec templates.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
