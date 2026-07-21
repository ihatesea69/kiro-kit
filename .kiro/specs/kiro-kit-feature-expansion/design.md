# Design: Kiro-Kit Feature Expansion

## Architecture

### System Context

Kiro-Kit is a monorepo: a `kiro-kit` CLI (`packages/cli`) and six self-contained
presets (`presets/*`). The CLI reads each preset's `manifest.json` and copies the
declared files into a user's `.kiro/` workspace using atomic writes, a
user-priority merge, and a strict no-orphan manifest contract. This feature adds
new file *types* to the presets and new *validation/generation* logic to the CLI;
it deliberately reuses the existing install pipeline rather than adding a parallel
one.

### Component Design

```
scripts/generate-native-hooks.mjs  ──emits──▶  presets/*/hooks/*.kiro.hook
scripts/sync-preset-manifests.mjs  ──reconciles──▶  presets/*/manifest.json
                                                          │
subagents (authoring) ──▶ presets/*/specs/examples/*/     │
                                                          ▼
packages/cli
  ├── core/PowersLoader.ts        (enriched schema: category/auth/env/mcp)
  ├── core/MCPConfigurator.ts     (expanded no-cred server catalog → auto-wire)
  ├── commands/spec.ts   (new)    (kiro-kit spec new <name>)
  └── commands/doctor.ts (extend) (native-hook + example-spec checks)
```

### Data Flow

- **Build-time**: `generate-native-hooks.mjs` produces `.kiro.hook` files from a
  single data definition; `sync-preset-manifests.mjs` walks each preset and adds
  any undeclared hook/spec file to its manifest with the correct `type`/`target`.
- **Install-time (`init`)**: native hooks and example specs flow through the
  existing "regular files" copy path (they are ordinary files). Powers auto-wire
  runs in the existing "Configuring Powers" task, extended to emit enabled
  MCP entries for `auth: none` Powers.
- **Verification**: `doctor` and the structural tests read the installed/preset
  files and assert schema + completeness invariants.

## Data Models

### Native Agent Hook (`*.kiro.hook`)

```jsonc
{
  "enabled": false,                      // opt-in; askAgent hooks never auto-run
  "name": "Migration Safety Review",
  "description": "…",
  "version": "1",
  "when": { "type": "fileCreated", "patterns": ["**/migrations/**/*.sql"] },
  "then": { "type": "askAgent", "prompt": "…" }  // or { type: "runCommand", command }
}
```

### Enriched Power entry (`powers.json`)

```ts
interface PowerEntry {
  name: string;
  url: string;
  description: string;
  tier: 'essential' | 'recommended' | 'optional';
  category?: 'hosting' | 'database' | 'auth' | 'payments' | 'observability'
    | 'design' | 'testing' | 'ai' | 'infra' | 'docs';
  auth?: 'none' | 'apiKey' | 'oauth';
  envVars?: string[];
  mcpBacked?: boolean;
}
```

The `category`, `auth`, `envVars`, and `mcpBacked` fields are **optional** in the
Zod schema so existing `powers.json` files remain valid (backward compatible).

## Component / API Design

### `kiro-kit spec new <name>` (new command)

| Aspect | Behavior |
|--------|----------|
| Input | spec name (kebab-cased), optional `--from <preset>` template |
| Output | `.kiro/specs/<name>/{requirements,design,tasks}.md` + `.config.kiro` |
| Source | copies the installed `specs/_templates/<preset>/` trio, or a generic template |
| Safety | refuses to overwrite an existing spec dir unless `--force` |

### Doctor checks (extended)

- `native-hooks`: walk `.kiro/hooks/*.kiro.hook`; each must `JSON.parse` and have
  `name`, `when.type`, and `then.type`. Any failure → FAIL (not fixable).
- `example-specs`: for each `.kiro/specs/examples/*/`, assert the three files
  exist → FAIL if incomplete.

### Manifest reconciliation script

`sync-preset-manifests.mjs` is a maintenance tool (not shipped in the tarball):
parse `manifest.json`, walk the preset dir, and for any file not already declared
and not ignored, append `{ source, target: '.kiro/' + source, type }` where `type`
is inferred (`*.kiro.hook` and `hooks/**` → `hook`; `specs/**` → `spec`; etc.).
Entries are sorted to keep diffs stable. This guarantees valid JSON and satisfies
the no-orphan invariant deterministically.

## State Management

No runtime state is added. The tracking store (`.kiro/.kiro-kit.json`) already
records every written file via the existing install path, so native hooks and
example specs are tracked automatically once declared in the manifest.

## Error Handling

- **Malformed hook JSON**: caught by `doctor` (FAIL) and by a structural test at
  build time; the generator always emits valid JSON so this only guards manual edits.
- **Powers auto-wire failure**: remains non-blocking — the existing task wraps
  Powers work in try/catch and logs a warning without aborting `init`.
- **Existing MCP entry present**: `mergeMCPConfig` already skips keys that exist
  (enabled or `_disabled_`), so auto-wire never clobbers user config.
- **Missing example-spec file**: `doctor` reports which file is missing.

## Security

Native hooks default to disabled, so no automation runs without explicit opt-in.
The `Secret Scan Before Write` shared hook adds a defensive `preToolUse` check.
Powers requiring credentials are scaffolded disabled with env-var placeholders,
never with real secrets, consistent with the existing MCP `_disabled_` convention.

## Performance

Generation and reconciliation are build-time only. At install time the added
files are a modest count (~7 hooks + 3 spec files per preset) copied through the
existing atomic-write loop; no measurable init slowdown.

## Testing Strategy

- **Unit**: PowersLoader accepts enriched entries and remains backward-compatible
  with minimal entries; `spec new` refuses to overwrite without `--force`.
- **Structural**: every preset has ≥ the required native hook count and exactly
  one complete example spec; every `.kiro.hook` parses against the schema.
- **Property**: existing manifest round-trip / no-orphan invariants continue to hold.
- **Manual/e2e**: run `kiro-kit init --preset backend --yes` into a temp dir and
  confirm native hooks + example spec land and `doctor` passes.
