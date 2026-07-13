#!/usr/bin/env node
/**
 * generate-native-hooks.mjs
 *
 * Emits native Kiro Agent Hooks (`*.kiro.hook` JSON files) into every preset's
 * `hooks/` directory, plus the shared set into the repo's own `.kiro/hooks/`.
 *
 * Native hooks are Kiro's real event-driven automation format:
 *   { enabled, name, description, version, when:{type,patterns?}, then:{type,prompt|command} }
 *
 * Design decisions:
 *  - Every hook ships DISABLED (`enabled:false`) so a fresh `kiro-kit init` never
 *    surprises a user with agent-credit usage. Users flip `enabled:true` to opt in.
 *  - `askAgent` hooks consume credits (they start an agent loop); `runCommand`
 *    hooks do not. We prefer askAgent only where reasoning is needed.
 *  - This script is idempotent — re-run any time to regenerate the hook files.
 *
 * Usage: node scripts/generate-native-hooks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const presetsDir = path.join(repoRoot, 'presets');
const PRESETS = ['frontend', 'backend', 'fullstack', 'mobile', 'devops', 'data-ai'];

/** Build a native hook object with sane defaults. */
function hook({ name, description, when, then }) {
  return {
    enabled: false,
    name,
    description,
    version: '1',
    when,
    then,
  };
}

function askAgent(prompt) {
  return { type: 'askAgent', prompt };
}

// ---------------------------------------------------------------------------
// Shared hooks — installed into every preset + the repo's own .kiro/hooks/
// ---------------------------------------------------------------------------

const SHARED_HOOKS = [
  hook({
    name: 'Run Tests on Save',
    description:
      'When a test file is saved, run its suite and surface failures. Disabled by default (askAgent uses credits).',
    when: {
      type: 'fileEdited',
      patterns: ['**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/test_*.py'],
    },
    then: askAgent(
      'A test file was just saved. Run the test suite that covers this file. If any tests fail, summarize the failures and propose the minimal fix. Report a concise pass/fail result — do not modify unrelated files.',
    ),
  }),
  hook({
    name: 'Spec Task Sync',
    description:
      'When a spec tasks.md changes, reconcile checkbox state against the actual implementation and preserve requirement traceability.',
    when: {
      type: 'fileEdited',
      patterns: ['.kiro/specs/**/tasks.md'],
    },
    then: askAgent(
      'The tasks.md of a spec changed. For each checked task, verify the described work actually exists in the codebase; for unchecked tasks, note any that appear already implemented. Flag mismatches and keep every task\'s _Requirements: Rx.y_ traceability line intact. Only edit the tasks.md checklist — do not change product code.',
    ),
  }),
  hook({
    name: 'Secret Scan on Save',
    description:
      'When a code or config file is saved, scan it for hardcoded secrets. Scoped to file writes so it does not run on every tool call.',
    when: {
      type: 'fileEdited',
      patterns: [
        'src/**/*.*',
        'lib/**/*.*',
        'app/**/*.*',
        '**/*.{env,yaml,yml,json,tf,tfvars}',
      ],
    },
    then: askAgent(
      'The saved file changed. Inspect it for hardcoded secrets: API keys, access tokens, passwords, private keys, and database connection strings with embedded credentials. If any are found, report the exact location and a safe alternative (environment variable via .env). Do not modify unrelated files.',
    ),
  }),
  hook({
    name: 'Docs Drift Guard',
    description:
      'When source changes, update any README / API docs / steering that now reference stale symbols. Documentation-only edits.',
    when: {
      type: 'fileEdited',
      patterns: ['src/**/*.{ts,tsx,js,jsx,py,go,rs}', 'lib/**/*.{ts,js,py,go}'],
    },
    then: askAgent(
      'Source code changed. Check whether any README, docs/**, or .kiro/steering files reference symbols, signatures, or behavior that this change made stale, and update only that documentation to match. Do not modify source or tests.',
    ),
  }),
];

// ---------------------------------------------------------------------------
// Domain hooks — 3 per preset
// ---------------------------------------------------------------------------

const DOMAIN_HOOKS = {
  frontend: [
    hook({
      name: 'Component Scaffold',
      description: 'When a new component is created, scaffold a matching test and Storybook story.',
      when: { type: 'fileCreated', patterns: ['**/components/**/*.{tsx,jsx}', 'src/**/*.component.tsx'] },
      then: askAgent(
        'A new React component was created. Scaffold a co-located test file (React Testing Library) covering render + key interactions, and a Storybook story with default and edge-case args. Infer props from the component. Do not modify the component itself unless it is missing an explicit export.',
      ),
    }),
    hook({
      name: 'Accessibility Review',
      description: 'When a component changes, audit it against WCAG 2.1 AA and report violations.',
      when: { type: 'fileEdited', patterns: ['**/components/**/*.{tsx,jsx}'] },
      then: askAgent(
        'A component changed. Audit it for WCAG 2.1 AA issues: semantic elements, ARIA correctness, keyboard operability, focus management, color-contrast risks, and alt text. Report concrete violations with the exact fix. Only apply low-risk, obviously-correct fixes.',
      ),
    }),
    hook({
      name: 'Bundle Size Guard',
      description: 'When app code changes, flag heavy or duplicate imports that could bloat the bundle.',
      when: { type: 'fileEdited', patterns: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'] },
      then: askAgent(
        'App code changed. Inspect new imports for bundle-size risks: full-library imports that should be tree-shaken or deep-imported, heavy dependencies (moment, lodash, large icon sets), and duplicate functionality already present. Report each risk with a lighter alternative. Do not refactor automatically.',
      ),
    }),
  ],
  backend: [
    hook({
      name: 'Migration Safety Review',
      description: 'When a DB migration is created, generate the down migration and review for unsafe operations.',
      when: { type: 'fileCreated', patterns: ['**/migrations/**/*.{sql,ts,js,py}', '**/migrate/**/*.{sql,ts}'] },
      then: askAgent(
        'A new database migration was created. Verify it has a correct reversible down migration (generate one if missing), and review for unsafe operations: dropping columns/tables with data, non-concurrent index creation on large tables, NOT NULL additions without defaults, and locking DDL. Report risks with safer alternatives.',
      ),
    }),
    hook({
      name: 'API Contract Sync',
      description: 'When a route/handler changes, update the OpenAPI spec to match.',
      when: { type: 'fileEdited', patterns: ['**/routes/**/*.{ts,js,py,go}', '**/controllers/**/*.{ts,js}', '**/api/**/*.{ts,js}'] },
      then: askAgent(
        'An API route or handler changed. Update the OpenAPI/Swagger definition (paths, params, request/response schemas, status codes, error shapes) to match the new behavior. If no OpenAPI file exists, note that and propose creating one. Only edit the API contract and its docs.',
      ),
    }),
    hook({
      name: 'Endpoint Test Coverage',
      description: 'When a new endpoint is added, scaffold integration tests for its success and error paths.',
      when: { type: 'fileCreated', patterns: ['**/routes/**/*.{ts,js,py,go}', '**/controllers/**/*.{ts,js}'] },
      then: askAgent(
        'A new endpoint was added. Scaffold integration tests covering the happy path plus auth failures, validation errors, and not-found cases, asserting status codes and response shapes. Use the project\'s existing test framework and helpers.',
      ),
    }),
  ],
  fullstack: [
    hook({
      name: 'Type Sync',
      description: 'When an API route changes, regenerate shared client types so frontend and backend stay in lockstep.',
      when: { type: 'fileEdited', patterns: ['**/api/**/*.{ts,tsx}', '**/server/**/*.{ts}', '**/routers/**/*.{ts}'] },
      then: askAgent(
        'A server API route or router changed. Update the shared TypeScript types (and any generated client) consumed by the frontend so request/response shapes stay in sync. Flag any frontend call site now type-incompatible. Only edit types and generated clients.',
      ),
    }),
    hook({
      name: 'Env Schema Sync',
      description: 'When .env.example changes, update the runtime env validation schema.',
      when: { type: 'fileEdited', patterns: ['.env.example', '**/.env.example'] },
      then: askAgent(
        'The .env.example changed. Update the runtime environment validation schema (e.g. a Zod env schema in env.ts) to add/remove the corresponding variables with correct types and required/optional status, and note any code that reads a now-removed variable.',
      ),
    }),
    hook({
      name: 'Deployment Readiness',
      description: 'Manual pre-deploy checklist across frontend, backend, and infra.',
      when: { type: 'userTriggered' },
      then: askAgent(
        'Run a pre-deployment readiness review: confirm env vars are documented and set, migrations are applied and reversible, build passes, no debug/console leftovers, error boundaries and logging are in place, and third-party webhooks/keys are configured for the target environment. Produce a go/no-go checklist with blockers first.',
      ),
    }),
  ],
  mobile: [
    hook({
      name: 'Platform Parity Check',
      description: 'When a screen/widget changes, check iOS and Android behave equivalently.',
      when: { type: 'fileEdited', patterns: ['**/screens/**/*.{tsx,dart}', '**/widgets/**/*.dart', '**/components/**/*.tsx'] },
      then: askAgent(
        'A screen or widget changed. Check for iOS/Android parity risks: platform-specific APIs used without a fallback, safe-area/notch handling, keyboard avoidance, back-button/gesture behavior, and permission flows. Report divergences with the platform-correct fix.',
      ),
    }),
    hook({
      name: 'Asset Optimization',
      description: 'When an image/asset is added, verify it is optimized and has correct density variants.',
      when: { type: 'fileCreated', patterns: ['**/assets/**/*.{png,jpg,jpeg,webp}', 'assets/**/*.{png,jpg}'] },
      then: askAgent(
        'A new image asset was added. Verify it is reasonably sized and compressed, has the required density variants (@2x/@3x or drawable buckets), and is referenced through the asset index. Report any missing variant or oversized file with the recommended target size.',
      ),
    }),
    hook({
      name: 'Release Checklist',
      description: 'Manual pre-release checklist for a store submission.',
      when: { type: 'userTriggered' },
      then: askAgent(
        'Run a mobile release readiness review: version/build numbers bumped, changelog updated, app icons and splash present, permissions justified for store review, crash/analytics SDKs initialized, deep links tested, and signing config valid for both platforms. Output a checklist with blockers first.',
      ),
    }),
  ],
  devops: [
    hook({
      name: 'Terraform Plan Review',
      description: 'When Terraform changes, summarize the plan risks before apply.',
      when: { type: 'fileEdited', patterns: ['**/*.tf', '**/*.tfvars'] },
      then: askAgent(
        'Terraform configuration changed. Summarize the likely plan impact and flag risky changes: resource replacement/destruction, security-group or IAM widening, public exposure, and unversioned/unpinned providers or modules. Report each risk with the safer approach. Do not run apply.',
      ),
    }),
    hook({
      name: 'Container Scan',
      description: 'When a Dockerfile changes, review it for security and efficiency issues.',
      when: { type: 'fileEdited', patterns: ['**/Dockerfile', '**/Dockerfile.*', '**/*.dockerfile'] },
      then: askAgent(
        'A Dockerfile changed. Review for security and efficiency: unpinned base images, running as root, secrets in layers, missing multi-stage build, unnecessary packages, and cache-busting layer order. Report each finding with the fix.',
      ),
    }),
    hook({
      name: 'Cost Estimate',
      description: 'Manual infrastructure cost estimate for the current IaC.',
      when: { type: 'userTriggered' },
      then: askAgent(
        'Estimate the monthly cost of the infrastructure defined in this workspace\'s IaC. Break down by resource type, flag the top cost drivers, and suggest concrete savings (right-sizing, spot/reserved, autoscaling floors, storage tiers). State assumptions and note where a real pricing API would refine the estimate.',
      ),
    }),
  ],
  'data-ai': [
    hook({
      name: 'Experiment Log',
      description: 'When a notebook or training script changes, append a structured experiment log entry.',
      when: { type: 'fileEdited', patterns: ['**/*.ipynb', '**/train*.py', '**/experiments/**/*.py'] },
      then: askAgent(
        'A notebook or training script changed. Append a structured entry to the experiment log (experiments/EXPERIMENTS.md or similar): date, hypothesis, dataset/version, key hyperparameters, metrics, and a one-line conclusion. Only edit the experiment log.',
      ),
    }),
    hook({
      name: 'Data Validation',
      description: 'When a new dataset or loader is added, generate a schema/validation check.',
      when: { type: 'fileCreated', patterns: ['**/data/**/*.{csv,parquet,json}', '**/loaders/**/*.py', '**/datasets/**/*.py'] },
      then: askAgent(
        'A new dataset or data loader was added. Generate a validation check (e.g. pandera/great_expectations or explicit assertions) for expected columns, dtypes, null rates, ranges, and class balance, so schema drift is caught early. Wire it into the pipeline\'s validation step.',
      ),
    }),
    hook({
      name: 'Model Card Update',
      description: 'Manual model-card refresh capturing metrics, data, and intended use.',
      when: { type: 'userTriggered' },
      then: askAgent(
        'Update (or create) the model card: model version, training data and date, evaluation metrics with thresholds, intended use and out-of-scope uses, known limitations and bias considerations, and monitoring/retraining triggers. Pull metrics from the latest experiment log where available.',
      ),
    }),
  ],
};

// ---------------------------------------------------------------------------
// Guide doc emitted into each preset's hooks/ dir
// ---------------------------------------------------------------------------

function guideMarkdown(presetName, domainHooks) {
  const domainList = domainHooks
    .map((h) => `- **${h.name}** — ${h.description} (\`${h.when.type}\`)`)
    .join('\n');
  const sharedList = SHARED_HOOKS.map(
    (h) => `- **${h.name}** — ${h.description} (\`${h.when.type}\`)`,
  ).join('\n');
  return `# Native Kiro Agent Hooks

These \`*.kiro.hook\` files are **native Kiro Agent Hooks** — event-driven automation
that runs inside the Kiro IDE. They are Kiro's real hook format (JSON with a
\`when\` trigger and a \`then\` action), distinct from the cross-platform shell
notifier scripts (\`.js\`/\`.sh\`/\`.ps1\`) that also live in this folder.

## Enabling a hook

Every hook ships **disabled** (\`"enabled": false\`) so a fresh workspace never
triggers agent runs you didn't ask for. To turn one on, open it in the Kiro
**Agent Hooks** panel and toggle it, or set \`"enabled": true\` in the file.

## Credit note

- \`then.type: "askAgent"\` starts a new agent loop and **consumes credits**.
- \`then.type: "runCommand"\` runs a shell command and does **not** consume credits.

Prefer \`askAgent\` only for tasks that need reasoning; use the shell notifier
scripts or \`runCommand\` for deterministic checks.

## Shared hooks

${sharedList}

## ${presetName} domain hooks

${domainList}

## Triggers reference

\`fileEdited\`, \`fileCreated\`, \`fileDeleted\`, \`userTriggered\`, \`promptSubmit\`,
\`agentStop\`, \`preToolUse\`, \`postToolUse\`. File triggers take a \`patterns\` glob array.

See the [Kiro hooks docs](https://kiro.dev/docs/hooks/) for the full reference.
`;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function writeHook(dir, h) {
  const file = path.join(dir, `${slug(h.name)}.kiro.hook`);
  fs.writeFileSync(file, JSON.stringify(h, null, 2) + '\n', 'utf-8');
  return path.basename(file);
}

let total = 0;
for (const preset of PRESETS) {
  const hooksDir = path.join(presetsDir, preset, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const written = [];
  for (const h of SHARED_HOOKS) written.push(writeHook(hooksDir, h));
  for (const h of DOMAIN_HOOKS[preset]) written.push(writeHook(hooksDir, h));
  fs.writeFileSync(
    path.join(hooksDir, 'native-hooks.md'),
    guideMarkdown(preset, DOMAIN_HOOKS[preset]),
    'utf-8',
  );
  total += written.length;
  console.log(`[${preset}] wrote ${written.length} native hooks + native-hooks.md`);
}

// Also emit the shared set into the repo's own dogfood workspace.
const repoHooksDir = path.join(repoRoot, '.kiro', 'hooks');
if (fs.existsSync(repoHooksDir)) {
  for (const h of SHARED_HOOKS) writeHook(repoHooksDir, h);
  console.log(`[.kiro] wrote ${SHARED_HOOKS.length} shared native hooks`);
}

console.log(`\nDone. ${total} native hook files across ${PRESETS.length} presets.`);
