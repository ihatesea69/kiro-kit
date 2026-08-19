#!/usr/bin/env node
/**
 * generate-native-hooks.mjs
 *
 * Emits native Kiro Agent Hooks into every preset's `hooks/` directory, plus the
 * shared set into the repo's own `.kiro/hooks/`.
 *
 * Format: the **v1 schema** introduced in Kiro IDE 1.0 / CLI 3.0 —
 *   { version: "v1", hooks: [{ name, description, enabled, trigger, matcher, action, timeout? }] }
 *
 * Files are `.json` (not the retired `.kiro.hook`), triggers are PascalCase
 * (`PostFileSave`, not `fileEdited`), and `matcher` is a single **regex** tested
 * against the event subject — replacing 0.x's `when.patterns` glob array.
 * See https://kiro.dev/docs/hooks/ for the field reference.
 *
 * Design decisions:
 *  - Every hook ships DISABLED (`enabled:false`) so a fresh `kiro-kit init` never
 *    surprises a user with agent-credit usage. Users flip `enabled:true` to opt in.
 *  - `action.type: "agent"` hooks consume credits (they start an agent loop);
 *    `"command"` hooks do not. We prefer agent only where reasoning is needed.
 *  - One hook per file. The v1 schema allows several per `hooks[]` array, but the
 *    preset manifests map one file to one declaration and `mergeHooks` resolves
 *    conflicts per filename — bundling would make a single user edit conflict
 *    against the whole set.
 *  - 0.x's `userTriggered` trigger was removed in v1; those hooks now ship as
 *    manual steering files (`.kiro/steering/*.md`, invoked as `/slash-commands`).
 *    See MANUAL_STEERING below.
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

/**
 * Every shipped preset. Unlike the 0.x version of this script — which listed only
 * six and silently left `ai-engineer`, `kiro-kit-dev`, and `sa` to drift — this is
 * the full set, so a re-run regenerates everything the kit ships.
 */
const PRESETS = [
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'devops',
  'data-ai',
  'kiro-kit-dev',
  'sa',
  'ai-engineer',
];

/** Wrap a single v1 hook definition in its file envelope. */
function hookFile(h) {
  return { version: 'v1', hooks: [h] };
}

/** Build a v1 hook object with sane defaults. */
function hook({ name, description, trigger, matcher, action }) {
  const h = { name, description, enabled: false, trigger };
  if (matcher) h.matcher = matcher;
  h.action = action;
  return h;
}

/** An `agent` action injects a prompt into the agent's context. Consumes credits. */
function agent(prompt) {
  return { type: 'agent', prompt };
}

// ---------------------------------------------------------------------------
// Shared hooks — installed into every preset + the repo's own .kiro/hooks/
// ---------------------------------------------------------------------------

const SHARED_HOOKS = [
  hook({
    name: 'Run Tests on Save',
    description:
      'When a test file is saved, run its suite and surface failures. Disabled by default (agent actions use credits).',
    trigger: 'PostFileSave',
    matcher: '(\\.(test|spec)\\.[^/]+|_test\\.[^/]+|(^|/)test_[^/]+\\.py)$',
    action: agent(
      'A test file was just saved. Run the test suite that covers this file. If any tests fail, summarize the failures and propose the minimal fix. Report a concise pass/fail result — do not modify unrelated files.',
    ),
  }),
  hook({
    name: 'Spec Task Sync',
    description:
      'When a spec tasks.md changes, reconcile checkbox state against the actual implementation and preserve requirement traceability.',
    trigger: 'PostFileSave',
    matcher: '^\\.kiro/specs/.+/tasks\\.md$',
    action: agent(
      'The tasks.md of a spec changed. For each checked task, verify the described work actually exists in the codebase; for unchecked tasks, note any that appear already implemented. Flag mismatches and keep every task\'s _Requirements: Rx.y_ traceability line intact. Only edit the tasks.md checklist — do not change product code.',
    ),
  }),
  hook({
    name: 'Secret Scan on Save',
    description:
      'When a code or config file is saved, scan it for hardcoded secrets. Scoped to file writes so it does not run on every tool call.',
    trigger: 'PostFileSave',
    matcher: '(^(src|lib|app)/.+|\\.(env|ya?ml|json|tf|tfvars))$',
    action: agent(
      'The saved file changed. Inspect it for hardcoded secrets: API keys, access tokens, passwords, private keys, and database connection strings with embedded credentials. If any are found, report the exact location and a safe alternative (environment variable via .env). Do not modify unrelated files.',
    ),
  }),
  hook({
    name: 'Docs Drift Guard',
    description:
      'When source changes, update any README / API docs / steering that now reference stale symbols. Documentation-only edits.',
    trigger: 'PostFileSave',
    matcher: '^(src|lib)/.+\\.(ts|tsx|js|jsx|py|go|rs)$',
    action: agent(
      'Source code changed. Check whether any README, docs/**, or .kiro/steering files reference symbols, signatures, or behavior that this change made stale, and update only that documentation to match. Do not modify source or tests.',
    ),
  }),
];

// ---------------------------------------------------------------------------
// Domain hooks — per preset
// ---------------------------------------------------------------------------

/** Backend's three, shared verbatim with kiro-kit-dev (itself a Node/TS API repo). */
const BACKEND_DOMAIN_HOOKS = [
  hook({
    name: 'Migration Safety Review',
    description:
      'When a DB migration is created, generate the down migration and review for unsafe operations.',
    trigger: 'PostFileCreate',
    matcher: '(/migrations?/.+\\.(sql|ts|js|py)|/migrate/.+\\.(sql|ts))$',
    action: agent(
      'A new database migration was created. Verify it has a correct reversible down migration (generate one if missing), and review for unsafe operations: dropping columns/tables with data, non-concurrent index creation on large tables, NOT NULL additions without defaults, and locking DDL. Report risks with safer alternatives.',
    ),
  }),
  hook({
    name: 'API Contract Sync',
    description: 'When a route/handler changes, update the OpenAPI spec to match.',
    trigger: 'PostFileSave',
    matcher: '/(routes|controllers|api)/.+\\.(ts|js|py|go)$',
    action: agent(
      'An API route or handler changed. Update the OpenAPI/Swagger definition (paths, params, request/response schemas, status codes, error shapes) to match the new behavior. If no OpenAPI file exists, note that and propose creating one. Only edit the API contract and its docs.',
    ),
  }),
  hook({
    name: 'Endpoint Test Coverage',
    description:
      'When a new endpoint is added, scaffold integration tests for its success and error paths.',
    trigger: 'PostFileCreate',
    matcher: '/(routes|controllers)/.+\\.(ts|js|py|go)$',
    action: agent(
      'A new endpoint was added. Scaffold integration tests covering the happy path plus auth failures, validation errors, and not-found cases, asserting status codes and response shapes. Use the project\'s existing test framework and helpers.',
    ),
  }),
];

/** Devops' two, shared verbatim with sa (both IaC-centric). */
const DEVOPS_DOMAIN_HOOKS = [
  hook({
    name: 'Terraform Plan Review',
    description: 'When Terraform changes, summarize the plan risks before apply.',
    trigger: 'PostFileSave',
    matcher: '\\.(tf|tfvars)$',
    action: agent(
      'Terraform configuration changed. Summarize the likely plan impact and flag risky changes: resource replacement/destruction, security-group or IAM widening, public exposure, and unversioned/unpinned providers or modules. Report each risk with the safer approach. Do not run apply.',
    ),
  }),
  hook({
    name: 'Container Scan',
    description: 'When a Dockerfile changes, review it for security and efficiency issues.',
    trigger: 'PostFileSave',
    matcher: '(Dockerfile[^/]*|\\.dockerfile)$',
    action: agent(
      'A Dockerfile changed. Review for security and efficiency: unpinned base images, running as root, secrets in layers, missing multi-stage build, unnecessary packages, and cache-busting layer order. Report each finding with the fix.',
    ),
  }),
];

const DOMAIN_HOOKS = {
  frontend: [
    hook({
      name: 'Component Scaffold',
      description:
        'When a new component is created, scaffold a matching test and Storybook story.',
      trigger: 'PostFileCreate',
      matcher: '(/components/.+\\.(tsx|jsx)|\\.component\\.tsx)$',
      action: agent(
        'A new React component was created. Scaffold a co-located test file (React Testing Library) covering render + key interactions, and a Storybook story with default and edge-case args. Infer props from the component. Do not modify the component itself unless it is missing an explicit export.',
      ),
    }),
    hook({
      name: 'Accessibility Review',
      description: 'When a component changes, audit it against WCAG 2.1 AA and report violations.',
      trigger: 'PostFileSave',
      matcher: '/components/.+\\.(tsx|jsx)$',
      action: agent(
        'A component changed. Audit it for WCAG 2.1 AA issues: semantic elements, ARIA correctness, keyboard operability, focus management, color-contrast risks, and alt text. Report concrete violations with the exact fix. Only apply low-risk, obviously-correct fixes.',
      ),
    }),
    hook({
      name: 'Bundle Size Guard',
      description:
        'When app code changes, flag heavy or duplicate imports that could bloat the bundle.',
      trigger: 'PostFileSave',
      matcher: '^(src|app)/.+\\.(ts|tsx)$',
      action: agent(
        'App code changed. Inspect new imports for bundle-size risks: full-library imports that should be tree-shaken or deep-imported, heavy dependencies (moment, lodash, large icon sets), and duplicate functionality already present. Report each risk with a lighter alternative. Do not refactor automatically.',
      ),
    }),
  ],
  backend: BACKEND_DOMAIN_HOOKS,
  'kiro-kit-dev': BACKEND_DOMAIN_HOOKS,
  devops: DEVOPS_DOMAIN_HOOKS,
  sa: DEVOPS_DOMAIN_HOOKS,
  fullstack: [
    hook({
      name: 'Type Sync',
      description:
        'When an API route changes, regenerate shared client types so frontend and backend stay in lockstep.',
      trigger: 'PostFileSave',
      matcher: '/(api|server|routers)/.+\\.(ts|tsx)$',
      action: agent(
        'A server API route or router changed. Update the shared TypeScript types (and any generated client) consumed by the frontend so request/response shapes stay in sync. Flag any frontend call site now type-incompatible. Only edit types and generated clients.',
      ),
    }),
    hook({
      name: 'Env Schema Sync',
      description: 'When .env.example changes, update the runtime env validation schema.',
      trigger: 'PostFileSave',
      matcher: '(^|/)\\.env\\.example$',
      action: agent(
        'The .env.example changed. Update the runtime environment validation schema (e.g. a Zod env schema in env.ts) to add/remove the corresponding variables with correct types and required/optional status, and note any code that reads a now-removed variable.',
      ),
    }),
  ],
  mobile: [
    hook({
      name: 'Platform Parity Check',
      description: 'When a screen/widget changes, check iOS and Android behave equivalently.',
      trigger: 'PostFileSave',
      matcher: '/(screens|widgets|components)/.+\\.(tsx|dart)$',
      action: agent(
        'A screen or widget changed. Check for iOS/Android parity risks: platform-specific APIs used without a fallback, safe-area/notch handling, keyboard avoidance, back-button/gesture behavior, and permission flows. Report divergences with the platform-correct fix.',
      ),
    }),
    hook({
      name: 'Asset Optimization',
      description:
        'When an image/asset is added, verify it is optimized and has correct density variants.',
      trigger: 'PostFileCreate',
      matcher: '/assets/.+\\.(png|jpg|jpeg|webp)$',
      action: agent(
        'A new image asset was added. Verify it is reasonably sized and compressed, has the required density variants (@2x/@3x or drawable buckets), and is referenced through the asset index. Report any missing variant or oversized file with the recommended target size.',
      ),
    }),
  ],
  'data-ai': [
    hook({
      name: 'Experiment Log',
      description:
        'When a notebook or training script changes, append a structured experiment log entry.',
      trigger: 'PostFileSave',
      matcher: '(\\.ipynb|/train[^/]*\\.py|/experiments/.+\\.py)$',
      action: agent(
        'A notebook or training script changed. Append a structured entry to the experiment log (experiments/EXPERIMENTS.md or similar): date, hypothesis, dataset/version, key hyperparameters, metrics, and a one-line conclusion. Only edit the experiment log.',
      ),
    }),
    hook({
      name: 'Data Validation',
      description: 'When a new dataset or loader is added, generate a schema/validation check.',
      trigger: 'PostFileCreate',
      matcher: '(/data/.+\\.(csv|parquet|json)|/(loaders|datasets)/.+\\.py)$',
      action: agent(
        'A new dataset or data loader was added. Generate a validation check (e.g. pandera/great_expectations or explicit assertions) for expected columns, dtypes, null rates, ranges, and class balance, so schema drift is caught early. Wire it into the pipeline\'s validation step.',
      ),
    }),
  ],
  'ai-engineer': [
    hook({
      name: 'Prompt Change Eval',
      description:
        'When a system prompt, agent definition, or model id changes, re-run the offline eval set before it ships.',
      trigger: 'PostFileSave',
      matcher: '(/prompts/.+\\.(md|txt|py|ya?ml)|/agents/.+\\.py|[^/]*prompt[^/]*\\.py|(^|/)agent[^/]*\\.py)$',
      action: agent(
        'A prompt, agent definition, or model id changed. Prompts are code: (1) identify which golden-set cases in evals/ exercise the changed behaviour; (2) run the offline eval harness and compare against the thresholds in evals/thresholds.yaml; (3) report any metric that regressed — especially faithfulness, citation coverage, and tool-selection accuracy — with the specific failing cases. Do not loosen a threshold; if the change is intentional, say so and leave the threshold decision to the reviewer.',
      ),
    }),
    hook({
      name: 'Tool Contract Check',
      description:
        'When an agent tool or MCP tool definition is added, check its schema, description, and error contract.',
      trigger: 'PostFileCreate',
      matcher: '(/(tools|mcp)/.+\\.(py|ts)|_tool\\.py)$',
      action: agent(
        'A new agent or MCP tool was added. Review it against this workspace\'s tool contract: (1) the description states what it does AND when NOT to use it — it is read by a retriever and a model, not a human; (2) every argument is typed with a clear description; (3) errors are returned as data with an error message and a retryable flag, never raised into the tool loop; (4) results are truncated at the boundary so a large payload is not re-paid on every subsequent turn; (5) the IAM permissions it needs are scoped to this tool alone. Report gaps and propose the fix.',
      ),
    }),
  ],
};

// ---------------------------------------------------------------------------
// Manual steering files — the v1 replacement for 0.x's `userTriggered` trigger
// ---------------------------------------------------------------------------

/**
 * v1 removed `userTriggered`. Kiro's migration guidance is to ship these as
 * manual steering files: markdown in `.kiro/steering/` with `inclusion: manual`,
 * which the IDE surfaces as `/<filename>` slash commands (and `#<filename>`
 * references in chat). The prompt body carries over unchanged.
 */
function steeringDoc({ title, description, body }) {
  return `---
inclusion: manual
---

# ${title}

${description}

${body}
`;
}

const DEEP_SCAN_STEERING = {
  slug: 'deep-scan-stale',
  title: 'Deep Scan Stale',
  description:
    'Run on demand to check whether the last deep security scan is stale (>30 days) or predates significant source changes.',
  body: 'Check the freshness of the last deep security scan. Find the most recent directory under .kiro/security/scans/ and read its report.md and findings.json. Report: the scan date and how many days old it is; the count of findings still marked status: open by severity; and whether source files have changed materially since the scan (use git log since that date, ignoring docs and tests). Recommend a re-scan if the scan is older than 30 days, if open CRITICAL or HIGH findings remain, or if changes since the scan touched files listed in any open finding — and say which scoped path to re-scan with /security:deep-scan. If no scan directory exists, say so and recommend an initial full scan. Do not modify any files.',
};

const COST_ESTIMATE_STEERING = {
  slug: 'cost-estimate',
  title: 'Cost Estimate',
  description: 'Run on demand for an infrastructure cost estimate of the current IaC.',
  body: "Estimate the monthly cost of the infrastructure defined in this workspace's IaC. Break down by resource type, flag the top cost drivers, and suggest concrete savings (right-sizing, spot/reserved, autoscaling floors, storage tiers). State assumptions and note where a real pricing API would refine the estimate.",
};

/** Manual steering docs per preset, keyed by preset name. */
const MANUAL_STEERING = {
  backend: [DEEP_SCAN_STEERING],
  devops: [DEEP_SCAN_STEERING, COST_ESTIMATE_STEERING],
  sa: [DEEP_SCAN_STEERING, COST_ESTIMATE_STEERING],
  fullstack: [
    DEEP_SCAN_STEERING,
    {
      slug: 'deployment-readiness',
      title: 'Deployment Readiness',
      description: 'Run on demand for a pre-deploy checklist across frontend, backend, and infra.',
      body: 'Run a pre-deployment readiness review: confirm env vars are documented and set, migrations are applied and reversible, build passes, no debug/console leftovers, error boundaries and logging are in place, and third-party webhooks/keys are configured for the target environment. Produce a go/no-go checklist with blockers first.',
    },
  ],
  mobile: [
    {
      slug: 'release-checklist',
      title: 'Release Checklist',
      description: 'Run on demand for a pre-release checklist before a store submission.',
      body: 'Run a mobile release readiness review: version/build numbers bumped, changelog updated, app icons and splash present, permissions justified for store review, crash/analytics SDKs initialized, deep links tested, and signing config valid for both platforms. Output a checklist with blockers first.',
    },
  ],
  'data-ai': [
    {
      slug: 'model-card-update',
      title: 'Model Card Update',
      description: 'Run on demand to refresh the model card with metrics, data, and intended use.',
      body: 'Update (or create) the model card: model version, training data and date, evaluation metrics with thresholds, intended use and out-of-scope uses, known limitations and bias considerations, and monitoring/retraining triggers. Pull metrics from the latest experiment log where available.',
    },
  ],
  'ai-engineer': [
    {
      slug: 'agent-card-update',
      title: 'Agent Card Update',
      description:
        'Run on demand to refresh the agent card with tools, guardrails, eval results, limitations, and cost.',
      body: 'Update (or create) the agent card: agent name and version, model id and provider, deployment target (AgentCore Harness / Runtime / Lambda), the full tool inventory with each tool\'s data access, memory tiers used and their retention, guardrail configuration, latest evaluation results against evals/thresholds.yaml, known limitations and failure modes, cost per conversation, and the escalation path to a human. Pull metrics from the most recent eval report where available.',
    },
  ],
};

// ---------------------------------------------------------------------------
// Script hooks — the shell notifiers, migrated off settings.json
// ---------------------------------------------------------------------------

/**
 * 0.x registered these Node scripts in `settings.json` under a `hooks` key with
 * camelCase `agentStop`. Kiro 1.0 configures hooks *exclusively* in
 * `.kiro/hooks/*.json` and `settings.json` has no `hooks` key, so that
 * registration is inert — the scripts would silently stop firing.
 *
 * They ship ENABLED because they were active before and `command` actions cost no
 * credits. Each script no-ops when its required env var is unset (see
 * `hooks/.env.example`), so an unconfigured workspace stays quiet.
 */
function commandHook({ name, description, trigger, command, matcher, timeout }) {
  const h = { name, description, enabled: true, trigger };
  if (matcher) h.matcher = matcher;
  h.action = { type: 'command', command };
  if (timeout !== undefined) h.timeout = timeout;
  return h;
}

const SCRIPT_HOOKS = [
  commandHook({
    name: 'Scout Block',
    description:
      'Blocks obviously-dangerous shell commands (rm -rf /, drop database) before a tool runs. Defense-in-depth, not a security boundary.',
    trigger: 'PreToolUse',
    command: 'node .kiro/hooks/scout-block.js',
    timeout: 10,
  }),
  commandHook({
    name: 'Modularization Hook',
    description: 'Warns when an edited file grows past the 200-line guideline.',
    trigger: 'PostToolUse',
    command: 'node .kiro/hooks/modularization-hook.js',
    timeout: 10,
  }),
  commandHook({
    name: 'Discord Notify',
    description:
      'Sends a Discord notification when the agent finishes. No-ops unless DISCORD_WEBHOOK_URL is set.',
    trigger: 'Stop',
    command: 'node .kiro/hooks/discord-notify.js',
    timeout: 15,
  }),
  commandHook({
    name: 'Telegram Notify',
    description:
      'Sends a Telegram notification when the agent finishes. No-ops unless TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.',
    trigger: 'Stop',
    command: 'node .kiro/hooks/telegram-notify.js',
    timeout: 15,
  }),
];

/** Extra script hooks for the IaC-heavy presets, which shipped two more. */
const EXTRA_SCRIPT_HOOKS = [
  commandHook({
    name: 'Build Verify',
    description: 'Runs the build before a tool call that could ship broken output.',
    trigger: 'PreToolUse',
    command: 'node .kiro/hooks/build-verify.js',
    timeout: 120,
  }),
  commandHook({
    name: 'Image Scan',
    description: 'Scans container images for known vulnerabilities after a tool call.',
    trigger: 'PostToolUse',
    command: 'node .kiro/hooks/image-scan.js',
    timeout: 120,
  }),
];

/** Presets that ship the two extra IaC script hooks. */
const EXTRA_SCRIPT_PRESETS = new Set(['devops', 'sa']);

function scriptHooksFor(preset) {
  return EXTRA_SCRIPT_PRESETS.has(preset)
    ? [...SCRIPT_HOOKS, ...EXTRA_SCRIPT_HOOKS]
    : SCRIPT_HOOKS;
}

// ---------------------------------------------------------------------------
// Guide doc emitted into each preset's hooks/ dir
// ---------------------------------------------------------------------------

function guideMarkdown(presetName, domainHooks, steeringDocs = [], scriptHooks = []) {
  const line = (h) => `- **${h.name}** — ${h.description} (\`${h.trigger}\`)`;
  const domainList = domainHooks.map(line).join('\n');
  const sharedList = SHARED_HOOKS.map(line).join('\n');
  const scriptSection = scriptHooks.length
    ? `\n## Script hooks (enabled)

0.x registered these in \`settings.json\` under a \`hooks\` key. Kiro 1.0 reads hooks
only from \`.kiro/hooks/*.json\`, so they now ship as v1 \`command\` hooks. They cost
no credits and no-op when their env vars are unset — see \`.env.example\`.

${scriptHooks.map(line).join('\n')}
`
    : '';
  const steeringSection = steeringDocs.length
    ? `\n## Manual steering commands

0.x shipped these as \`userTriggered\` hooks. That trigger no longer exists, so they
now install as manual steering files in \`.kiro/steering/\` — run them by typing the
slash command in chat.

${steeringDocs.map((s) => `- \`/${s.slug}\` — ${s.description}`).join('\n')}
`
    : '';
  return `# Native Kiro Agent Hooks

These \`.json\` files are **native Kiro Agent Hooks** — event-driven automation that
runs inside the Kiro IDE. They use the **v1 schema** (Kiro IDE 1.0 / CLI 3.0), and
are distinct from the cross-platform shell notifier scripts (\`.js\`/\`.sh\`/\`.ps1\`)
that also live in this folder.

\`\`\`json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Run Tests on Save",
      "enabled": false,
      "trigger": "PostFileSave",
      "matcher": "\\.(test|spec)\\.[^/]+$",
      "action": { "type": "agent", "prompt": "..." }
    }
  ]
}
\`\`\`

## Enabling a hook

Every **agent** hook ships **disabled** (\`"enabled": false\`) so a fresh workspace
never triggers agent runs you didn't ask for. To turn one on, open it in the Kiro
**Agent Hooks** panel and toggle it, or set \`"enabled": true\` in the file.

The **script** hooks below ship **enabled** — they run local Node scripts, cost no
credits, and no-op when their environment variables are unset.

## Credit note

- \`action.type: "agent"\` starts a new agent loop and **consumes credits**.
- \`action.type: "command"\` runs a shell command and does **not** consume credits.

Prefer \`agent\` only for tasks that need reasoning; use the shell notifier
scripts or a \`command\` action for deterministic checks.

## Shared hooks

${sharedList}

## ${presetName} domain hooks

${domainList}
${steeringSection}${scriptSection}
## Triggers reference

\`PostFileSave\`, \`PostFileCreate\`, \`PostFileDelete\`, \`PreToolUse\`, \`PostToolUse\`,
\`UserPromptSubmit\`, \`SessionStart\`, \`Stop\`, \`PreTaskExec\`, \`PostTaskExec\`.

\`matcher\` is a single **regex** tested against the event subject — the file path for
file triggers, the tool name for tool triggers. It replaces 0.x's \`when.patterns\`
glob array. Omit it to match everything.

## Migrating from 0.x

If you have \`.kiro.hook\` files from an earlier kit, they use the retired 0.x schema
and won't execute in IDE 1.0. Trigger mapping: \`fileEdited\`→\`PostFileSave\`,
\`fileCreated\`→\`PostFileCreate\`, \`fileDeleted\`→\`PostFileDelete\`,
\`promptSubmit\`→\`UserPromptSubmit\`, \`agentStop\`→\`Stop\`,
\`preTaskExecution\`→\`PreTaskExec\`, \`postTaskExecution\`→\`PostTaskExec\`. The
\`when\`/\`then\` pair becomes \`trigger\`/\`matcher\`/\`action\`, and \`userTriggered\` is
replaced by manual steering files.

See the [Kiro hooks docs](https://kiro.dev/docs/hooks/) for the full reference.
`;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Write one v1 hook file. Returns the basename written. */
function writeHook(dir, h) {
  const file = path.join(dir, `${slug(h.name)}.json`);
  fs.writeFileSync(file, JSON.stringify(hookFile(h), null, 2) + '\n', 'utf-8');
  return path.basename(file);
}

/** Remove a retired 0.x hook file if it's still on disk. */
function removeLegacy(dir, h) {
  const legacy = path.join(dir, `${slug(h.name)}.kiro.hook`);
  if (fs.existsSync(legacy)) {
    fs.unlinkSync(legacy);
    return true;
  }
  return false;
}

let totalHooks = 0;
let totalSteering = 0;
let totalRemoved = 0;

for (const preset of PRESETS) {
  const hooksDir = path.join(presetsDir, preset, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  const domainHooks = DOMAIN_HOOKS[preset] ?? [];
  const steeringDocs = MANUAL_STEERING[preset] ?? [];
  const scriptHooks = scriptHooksFor(preset);
  const written = [];

  for (const h of [...SHARED_HOOKS, ...domainHooks, ...scriptHooks]) {
    written.push(writeHook(hooksDir, h));
    if (removeLegacy(hooksDir, h)) totalRemoved++;
  }

  // Sweep any remaining 0.x hook files — including ones whose trigger was retired
  // (`userTriggered`) and so have no v1 counterpart under the same name.
  for (const f of fs.readdirSync(hooksDir)) {
    if (f.endsWith('.kiro.hook')) {
      fs.unlinkSync(path.join(hooksDir, f));
      totalRemoved++;
    }
  }

  fs.writeFileSync(
    path.join(hooksDir, 'native-hooks.md'),
    guideMarkdown(preset, domainHooks, steeringDocs, scriptHooks),
    'utf-8',
  );

  const steeringDir = path.join(presetsDir, preset, 'steering');
  fs.mkdirSync(steeringDir, { recursive: true });
  for (const s of steeringDocs) {
    fs.writeFileSync(path.join(steeringDir, `${s.slug}.md`), steeringDoc(s), 'utf-8');
    totalSteering++;
  }

  totalHooks += written.length;
  const extra = steeringDocs.length ? ` + ${steeringDocs.length} manual steering` : '';
  console.log(`[${preset}] wrote ${written.length} v1 hooks${extra} + native-hooks.md`);
}

// Also emit the shared set into the repo's own dogfood workspace.
const repoHooksDir = path.join(repoRoot, '.kiro', 'hooks');
if (fs.existsSync(repoHooksDir)) {
  for (const h of [...SHARED_HOOKS, ...SCRIPT_HOOKS]) {
    writeHook(repoHooksDir, h);
    if (removeLegacy(repoHooksDir, h)) totalRemoved++;
  }
  for (const f of fs.readdirSync(repoHooksDir)) {
    if (f.endsWith('.kiro.hook')) {
      fs.unlinkSync(path.join(repoHooksDir, f));
      totalRemoved++;
    }
  }
  console.log(
    `[.kiro] wrote ${SHARED_HOOKS.length + SCRIPT_HOOKS.length} shared + script v1 hooks`,
  );
}

console.log(
  `\nDone. ${totalHooks} v1 hook files + ${totalSteering} manual steering docs across ${PRESETS.length} presets. Removed ${totalRemoved} retired .kiro.hook files.`,
);
console.log('Next: node scripts/sync-preset-manifests.mjs (then prune stale manifest entries).');
