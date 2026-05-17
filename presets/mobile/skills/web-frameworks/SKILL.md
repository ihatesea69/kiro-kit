---
name: web-frameworks
description: >-
  Build companion web applications or admin panels with Next.js and React. Use
  when the mobile project needs a web dashboard, landing page, or backend admin
  interface.
license: MIT
version: 1.0.0
---

# Web Frameworks

Activate this skill when building web companions for mobile applications.

## When to Use

- Building admin dashboards for mobile app backends
- Creating landing pages for app store marketing
- Implementing web-based configuration panels
- Building companion web apps that share logic with mobile
- Setting up monorepo structures with shared packages

## Next.js Patterns

- App Router with Server Components by default
- API routes for mobile app backends
- Server-side rendering for SEO (landing pages)
- Static generation for documentation sites

## Shared Code Strategy

- Extract business logic into shared packages
- Use TypeScript for type safety across platforms
- Share API client code between web and React Native
- Maintain consistent data models across platforms

## Rules

- Web admin panels should be responsive but desktop-optimized
- Landing pages must be mobile-first (users browse on phones)
- Share validation logic between web and mobile
- Keep web dependencies separate from mobile dependencies
