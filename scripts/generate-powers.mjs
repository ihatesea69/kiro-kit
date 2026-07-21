#!/usr/bin/env node
/**
 * generate-powers.mjs
 *
 * Emits an enriched `powers.json` into every preset from a single catalog.
 * Each entry carries category / auth / envVars / mcpBacked metadata so the CLI
 * can auto-wire credential-free MCP-backed Powers and scaffold credentialed ones
 * disabled. Backward compatible: the four core fields (name/url/description/tier)
 * are always present.
 *
 * Usage: node scripts/generate-powers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');

const slug = (n) => n.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const url = (n) => `https://kiro.dev/powers/${slug(n)}`;

/** Master catalog: name -> metadata (tier is assigned per preset below). */
const CATALOG = {
  Supabase: { d: 'Backend-as-a-service: Postgres, auth, storage, and realtime', category: 'database', auth: 'apiKey', envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'], mcpBacked: true },
  Neon: { d: 'Serverless Postgres with branching and autoscaling', category: 'database', auth: 'apiKey', envVars: ['DATABASE_URL'] },
  ClickHouse: { d: 'Column-oriented OLAP database for analytics at scale', category: 'database', auth: 'apiKey', envVars: ['CLICKHOUSE_URL'] },
  Upstash: { d: 'Serverless Redis and Kafka with per-request pricing', category: 'database', auth: 'apiKey', envVars: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'] },
  Pinecone: { d: 'Managed vector database for semantic search and RAG', category: 'database', auth: 'apiKey', envVars: ['PINECONE_API_KEY'] },
  Firebase: { d: 'App platform: Firestore, auth, hosting, and messaging', category: 'database', auth: 'apiKey', envVars: ['FIREBASE_PROJECT_ID', 'FIREBASE_API_KEY'] },
  Clerk: { d: 'Drop-in authentication and user management', category: 'auth', auth: 'apiKey', envVars: ['CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY'] },
  Stripe: { d: 'Payments, subscriptions, and billing', category: 'payments', auth: 'apiKey', envVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], mcpBacked: true },
  RevenueCat: { d: 'In-app subscriptions and purchases for mobile', category: 'payments', auth: 'apiKey', envVars: ['REVENUECAT_API_KEY'] },
  Figma: { d: 'Design source of truth; import frames and tokens', category: 'design', auth: 'oauth', mcpBacked: true },
  Storybook: { d: 'Component workshop and visual documentation', category: 'design', auth: 'none' },
  Netlify: { d: 'Edge hosting, previews, and serverless functions', category: 'hosting', auth: 'apiKey', envVars: ['NETLIFY_AUTH_TOKEN'] },
  Vercel: { d: 'Frontend cloud with instant previews and edge functions', category: 'hosting', auth: 'apiKey', envVars: ['VERCEL_TOKEN'] },
  Cloudflare: { d: 'CDN, Workers, R2 storage, and DNS at the edge', category: 'hosting', auth: 'apiKey', envVars: ['CLOUDFLARE_API_TOKEN'], mcpBacked: true },
  Expo: { d: 'Build, submit, and OTA-update React Native apps (EAS)', category: 'hosting', auth: 'apiKey', envVars: ['EXPO_TOKEN'] },
  Sentry: { d: 'Error tracking and performance monitoring', category: 'observability', auth: 'apiKey', envVars: ['SENTRY_AUTH_TOKEN'], mcpBacked: true },
  Datadog: { d: 'Metrics, logs, traces, and dashboards', category: 'observability', auth: 'apiKey', envVars: ['DD_API_KEY', 'DD_APP_KEY'] },
  PostHog: { d: 'Product analytics, feature flags, and session replay', category: 'observability', auth: 'apiKey', envVars: ['POSTHOG_API_KEY'] },
  Grafana: { d: 'Observability dashboards over metrics and logs', category: 'observability', auth: 'apiKey', envVars: ['GRAFANA_API_KEY'] },
  'New Relic': { d: 'Full-stack observability and APM', category: 'observability', auth: 'apiKey', envVars: ['NEW_RELIC_API_KEY'] },
  LangSmith: { d: 'Tracing, evals, and monitoring for LLM apps', category: 'observability', auth: 'apiKey', envVars: ['LANGCHAIN_API_KEY'] },
  Context7: { d: 'Up-to-date library and framework documentation lookup', category: 'docs', auth: 'none', mcpBacked: true },
  Exa: { d: 'Neural web search API for agents and research', category: 'ai', auth: 'apiKey', envVars: ['EXA_API_KEY'] },
  'Hugging Face': { d: 'Models, datasets, and inference endpoints', category: 'ai', auth: 'apiKey', envVars: ['HF_TOKEN'] },
  'Weights & Biases': { d: 'Experiment tracking, sweeps, and model registry', category: 'ai', auth: 'apiKey', envVars: ['WANDB_API_KEY'] },
  ElevenLabs: { d: 'Text-to-speech and voice generation', category: 'ai', auth: 'apiKey', envVars: ['ELEVENLABS_API_KEY'] },
  Bria: { d: 'Licensed generative image editing and backgrounds', category: 'ai', auth: 'apiKey', envVars: ['BRIA_API_TOKEN'] },
  Postman: { d: 'API testing, collections, and mock servers', category: 'testing', auth: 'apiKey', envVars: ['POSTMAN_API_KEY'] },
  Snyk: { d: 'Dependency and container vulnerability scanning', category: 'testing', auth: 'apiKey', envVars: ['SNYK_TOKEN'] },
  ScoutQA: { d: 'Autonomous end-to-end QA test generation', category: 'testing', auth: 'apiKey', envVars: ['SCOUTQA_API_KEY'] },
  Terraform: { d: 'Infrastructure as code across cloud providers', category: 'infra', auth: 'apiKey', envVars: ['TF_API_TOKEN'] },
  Pulumi: { d: 'Infrastructure as code in general-purpose languages', category: 'infra', auth: 'apiKey', envVars: ['PULUMI_ACCESS_TOKEN'] },
  Depot: { d: 'Fast remote container image builds', category: 'infra', auth: 'apiKey', envVars: ['DEPOT_TOKEN'] },
  Harness: { d: 'CI/CD, feature flags, and deployment automation', category: 'infra', auth: 'apiKey', envVars: ['HARNESS_API_KEY'] },
  'AWS CDK': { d: 'Define AWS infrastructure with code', category: 'infra', auth: 'apiKey', envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] },
  LaunchDarkly: { d: 'Feature flag management and progressive delivery', category: 'infra', auth: 'apiKey', envVars: ['LAUNCHDARKLY_SDK_KEY'] },
  Resend: { d: 'Transactional email API for developers', category: 'other', auth: 'apiKey', envVars: ['RESEND_API_KEY'] },
  OneSignal: { d: 'Push notifications across mobile and web', category: 'other', auth: 'apiKey', envVars: ['ONESIGNAL_APP_ID', 'ONESIGNAL_API_KEY'] },
};

/** Per-preset selection with tier assignment. */
const PRESETS = {
  frontend: { essential: ['Figma'], recommended: ['Netlify', 'Vercel', 'Context7', 'Storybook'], optional: ['Sentry', 'PostHog', 'ScoutQA'] },
  backend: { essential: ['Supabase'], recommended: ['Neon', 'Postman', 'Context7', 'Upstash'], optional: ['Stripe', 'Snyk', 'Sentry'] },
  fullstack: { essential: ['Supabase'], recommended: ['Figma', 'Netlify', 'Stripe', 'Context7', 'Clerk'], optional: ['Firebase', 'LaunchDarkly', 'Sentry', 'Resend'] },
  mobile: { essential: ['Firebase'], recommended: ['Figma', 'Context7', 'Expo'], optional: ['ElevenLabs', 'Bria', 'RevenueCat', 'OneSignal', 'Sentry'] },
  devops: { essential: ['Terraform'], recommended: ['Datadog', 'Snyk', 'Depot', 'Context7'], optional: ['Harness', 'AWS CDK', 'Pulumi', 'Grafana'] },
  'data-ai': { essential: ['ClickHouse'], recommended: ['Context7', 'Exa', 'Hugging Face'], optional: ['Neon', 'New Relic', 'Weights & Biases', 'Pinecone', 'LangSmith'] },
};

function entry(name, tier) {
  const meta = CATALOG[name];
  if (!meta) throw new Error(`Unknown power in catalog: ${name}`);
  const e = { name, url: url(name), description: meta.d, tier };
  if (meta.category) e.category = meta.category;
  if (meta.auth) e.auth = meta.auth;
  if (meta.envVars) e.envVars = meta.envVars;
  if (meta.mcpBacked) e.mcpBacked = true;
  return e;
}

let count = 0;
for (const [preset, tiers] of Object.entries(PRESETS)) {
  const powers = [];
  for (const tier of ['essential', 'recommended', 'optional']) {
    for (const name of tiers[tier] ?? []) powers.push(entry(name, tier));
  }
  const target = path.join(presetsDir, preset, 'powers.json');
  fs.writeFileSync(target, JSON.stringify({ powers }, null, 2) + '\n', 'utf-8');
  count += powers.length;
  console.log(`[${preset}] wrote ${powers.length} powers`);
}
console.log(`\nDone. ${count} power entries across ${Object.keys(PRESETS).length} presets.`);
