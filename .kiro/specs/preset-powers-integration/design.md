# Design Document: Preset Powers Integration

## Overview

Tính năng này mở rộng CLI `kiro-kit` để tích hợp Kiro Powers, MCP Server auto-configuration, và domain-specific Agent Hooks vào từng preset. Khi user chạy `kiro-kit init`, CLI sẽ:

1. Đọc `powers.json` từ preset đã chọn và hiển thị danh sách Powers recommend theo tier (essential/recommended/optional)
2. Cài đặt domain-specific Agent Hooks phù hợp với role/preset
3. Tự động generate `.mcp.json` functional (không chỉ example) với merge logic cho existing config
4. Tạo `POWERS-SETUP.md` hướng dẫn cài đặt Powers qua Kiro IDE marketplace
5. Generate/update `.env.example` với tất cả environment variables cần thiết

Flow chính: User chọn preset → CLI load powers.json + domain hooks → Prompt confirm MCP servers → Write files → Display Powers recommendations → Generate setup guide.

## Architecture

### High-Level Architecture

```mermaid
graph TD
    A[kiro-kit init] --> B[PresetLoader]
    B --> C[PowersLoader]
    B --> D[HookInstaller]
    B --> E[MCPConfigurator]
    
    C --> F[PowersRecommender]
    F --> G[SetupGuideGenerator]
    F --> H[Terminal Output]
    
    E --> I[MCP Merge Logic]
    I --> J[.mcp.json]
    
    D --> K[Domain Hooks]
    K --> L[.kiro/hooks/]
    
    G --> M[POWERS-SETUP.md]
    
    E --> N[EnvTemplateGenerator]
    N --> O[.env.example]
```

### Sequence Diagram - Init Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as kiro-kit init
    participant PL as PresetLoader
    participant PW as PowersLoader
    participant MC as MCPConfigurator
    participant HI as HookInstaller
    participant SG as SetupGuideGenerator

    U->>CLI: kiro-kit init --preset frontend
    CLI->>PL: load("frontend")
    PL-->>CLI: manifest + presetDir
    CLI->>PW: loadPowers(presetDir)
    PW-->>CLI: PowersConfig[]
    CLI->>MC: configureMCP(preset, workspaceRoot)
    MC->>U: Confirm MCP server installation?
    U-->>MC: Yes
    MC-->>CLI: .mcp.json written
    CLI->>HI: installDomainHooks(preset, workspaceRoot)
    HI-->>CLI: hooks installed
    CLI->>SG: generate(powersConfig, tier)
    SG-->>CLI: POWERS-SETUP.md written
    CLI->>U: Display Powers recommendations
```

### Tích hợp vào Init Flow hiện tại

Hiện tại `runInit()` xử lý theo thứ tự:
1. Select presets → 2. Load presets → 3. Plan operations → 4. Confirm → 5. Resolve conflicts → 6. Process files → 7. Write metadata → 8. Write tracking → 9. Print summary

Tính năng mới sẽ thêm các bước sau step 6 (Process files):
- **6a.** Process domain-specific hooks (cùng flow với regular files)
- **6b.** MCP auto-configuration (thay thế logic `.mcp.json.example` hiện tại)
- **6c.** Powers loading & recommendation
- **6d.** Generate POWERS-SETUP.md
- **6e.** Generate/update .env.example

## Components and Interfaces

### 1. PowersLoader (`packages/cli/src/core/PowersLoader.ts`)

Đọc và validate `powers.json` từ preset directory.

```typescript
import { z } from 'zod';

const PowerTierSchema = z.enum(['essential', 'recommended', 'optional']);

const PowerEntrySchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().min(1),
  tier: PowerTierSchema,
});

const PowersConfigSchema = z.object({
  powers: z.array(PowerEntrySchema),
});

export type PowerTier = z.infer<typeof PowerTierSchema>;
export type PowerEntry = z.infer<typeof PowerEntrySchema>;
export type PowersConfig = z.infer<typeof PowersConfigSchema>;

export interface LoadPowersResult {
  ok: boolean;
  powers: PowerEntry[];
  error?: string;
}

/**
 * Load powers.json from a preset directory.
 * Returns empty array if file doesn't exist (graceful degradation).
 */
export function loadPowers(presetDir: string): LoadPowersResult;

/**
 * Merge powers from multiple presets, deduplicating by name.
 * When duplicates exist, keep the highest tier (essential > recommended > optional).
 */
export function mergePowers(configs: PowerEntry[][]): PowerEntry[];

/**
 * Filter powers by tier selection.
 */
export function filterByTier(
  powers: PowerEntry[],
  tiers: PowerTier[],
): PowerEntry[];
```

### 2. MCPConfigurator (`packages/cli/src/core/MCPConfigurator.ts`)

Quản lý auto-configuration của MCP servers, thay thế logic `.mcp.json.example` hiện tại.

```typescript
export interface MCPServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  requiresCredentials?: boolean;
  credentialEnvVars?: string[];
}

export interface MCPPresetConfig {
  servers: Record<string, MCPServerEntry>;
}

/**
 * Get preset-specific MCP server configuration.
 * Servers requiring no credentials are enabled by default.
 * Servers requiring credentials are included but commented/disabled.
 */
export function getMCPConfig(presetName: string): MCPPresetConfig;

/**
 * Merge new MCP config with existing .mcp.json without overwriting user entries.
 */
export function mergeMCPConfig(
  existing: Record<string, unknown> | null,
  incoming: MCPPresetConfig,
): Record<string, unknown>;

/**
 * Write the final .mcp.json to workspace root.
 */
export function writeMCPConfig(
  workspaceRoot: string,
  config: Record<string, unknown>,
): void;
```

### 3. SetupGuideGenerator (`packages/cli/src/core/SetupGuideGenerator.ts`)

Tạo file `POWERS-SETUP.md` với hướng dẫn cài đặt Powers.

```typescript
export interface SetupGuideOptions {
  powers: PowerEntry[];
  presetNames: string[];
  mcpServers: Record<string, MCPServerEntry>;
}

/**
 * Generate POWERS-SETUP.md content.
 */
export function generateSetupGuide(options: SetupGuideOptions): string;

/**
 * Write setup guide to .kiro/ directory.
 */
export function writeSetupGuide(
  workspaceRoot: string,
  content: string,
): void;
```

### 4. EnvTemplateGenerator (`packages/cli/src/core/EnvTemplateGenerator.ts`)

Generate/update `.env.example` với environment variables cho MCP servers.

```typescript
export interface EnvVariable {
  key: string;
  placeholder: string;
  comment: string;
  service: string;
}

/**
 * Collect all required env vars from MCP config and Powers.
 */
export function collectEnvVars(
  mcpConfig: MCPPresetConfig,
  powers: PowerEntry[],
): EnvVariable[];

/**
 * Parse existing .env.example to avoid duplicates.
 */
export function parseExistingEnv(content: string): Set<string>;

/**
 * Generate .env.example content, appending new vars without duplicating.
 */
export function generateEnvTemplate(
  existing: string | null,
  newVars: EnvVariable[],
): string;
```

### 5. PowersPrompter (`packages/cli/src/prompts/PowersPrompter.ts`)

Interactive prompts cho Powers setup trong init flow.

```typescript
export interface PowersPromptResult {
  selectedTiers: PowerTier[];
  confirmMCP: boolean;
}

/**
 * Prompt user for Powers tier selection.
 * Skipped when --powers=none or --powers=all or --yes flags are set.
 */
export function promptPowersTier(
  powers: PowerEntry[],
  flags: { powersFlag?: string; yes?: boolean },
): Promise<PowersPromptResult>;

/**
 * Display formatted Powers recommendations in terminal.
 */
export function displayPowersRecommendations(
  powers: PowerEntry[],
  quiet: boolean,
): void;
```

### 6. Manifest Schema Extension

Thêm type `"powers"` vào `ArtifactTypeSchema` trong ManifestParser:

```typescript
const ArtifactTypeSchema = z.enum([
  'steering', 'hook', 'mcp', 'skill', 'agent',
  'command', 'workflow', 'statusline', 'metadata',
  'settings', 'env', 'spec', 'docs', 'doc', 'config', 'other',
  'powers', // NEW
]);
```

### 7. CLI Options Extension

Thêm flags mới cho init command:

```typescript
.option('--powers <mode>', 'Powers setup mode: none, all, or interactive (default)')
.option('--quiet', 'Suppress non-essential output including Powers recommendations')
```

## Data Models

### powers.json Schema

Mỗi preset chứa file `powers.json` tại root directory:

```json
{
  "powers": [
    {
      "name": "Figma",
      "url": "https://kiro.dev/powers/figma",
      "description": "Design-to-code integration with Figma files",
      "tier": "essential"
    },
    {
      "name": "Context7",
      "url": "https://kiro.dev/powers/context7",
      "description": "Up-to-date documentation lookup for libraries",
      "tier": "recommended"
    }
  ]
}
```

### .mcp.json Output Format

File functional (không phải example) tại workspace root:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE_ROOT}"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git", "--repository", "${WORKSPACE_ROOT}"]
    },
    "_disabled_postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_URL": "${POSTGRES_URL}"
      },
      "_comment": "Requires POSTGRES_URL environment variable. Remove '_disabled_' prefix to enable."
    }
  }
}
```

Convention: Servers cần credentials sẽ có prefix `_disabled_` trong key name và `_comment` field giải thích cách enable.

### Domain Hook File Structure

Mỗi domain hook là một `.js` file trong `presets/{preset}/hooks/`:

```
presets/frontend/hooks/
  accessibility-check.js      # Domain hook
  bundle-size-guard.js        # Domain hook
  component-test-reminder.js  # Domain hook
  discord-notify.js           # Existing generic hook
  ...
```

### .env.example Output Format

```bash
# ============================================
# MCP Servers
# ============================================

# PostgreSQL MCP Server
# POSTGRES_URL=postgresql://user:password@localhost:5432/dbname

# Docker MCP Server
# DOCKER_HOST=unix:///var/run/docker.sock

# ============================================
# Kiro Powers (configure after installing from marketplace)
# ============================================

# Supabase Power
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_ANON_KEY=your-anon-key
```

### Manifest Entry Format cho Powers

```json
{
  "source": "powers.json",
  "target": ".kiro/powers.json",
  "type": "powers"
}
```

### MCP Server Mapping per Preset

| Preset | Default Servers (no credentials) | Optional Servers (credentials required) |
|--------|----------------------------------|----------------------------------------|
| frontend | filesystem, git, fetch, playwright | - |
| backend | filesystem, git, fetch | postgres, docker |
| fullstack | filesystem, git, fetch, playwright | postgres, docker |
| mobile | filesystem, git, fetch | - |
| devops | filesystem, git, fetch | docker, postgres |
| data-ai | filesystem, git, fetch | postgres |


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Powers schema validation

*For any* JSON object, if it passes the PowersConfig Zod schema validation, then it must contain a `powers` array where every entry has non-empty `name`, valid `url`, non-empty `description`, and `tier` that is one of "essential", "recommended", or "optional". Conversely, any object missing these fields must fail validation.

**Validates: Requirements 1.3**

### Property 2: Powers tier filtering

*For any* list of PowerEntry objects and any subset of tiers selected, `filterByTier(powers, selectedTiers)` should return exactly those powers whose `tier` field is in the selected tiers set, preserving order and without modifying the original array.

**Validates: Requirements 1.4, 7.2**

### Property 3: Powers merge deduplication

*For any* two or more lists of PowerEntry objects, `mergePowers(configs)` should produce a result where: (a) no two entries share the same `name`, (b) the result length is ≤ the sum of all input lengths, (c) for duplicate names, the entry with the highest tier (essential > recommended > optional) is kept, and (d) all unique entries from all inputs are present.

**Validates: Requirements 1.5**

### Property 4: Display output completeness

*For any* non-empty list of PowerEntry objects, the formatted display output should: (a) group powers by tier with tier headers appearing in order essential → recommended → optional, (b) include the marketplace URL for each power, and (c) show correct count per tier in the summary line.

**Validates: Requirements 2.1, 2.2, 7.5**

### Property 5: Setup guide contains all power information

*For any* list of PowerEntry objects passed to `generateSetupGuide`, the resulting markdown string should contain the `name` and `url` of every power in the input list.

**Validates: Requirements 2.4, 2.5**

### Property 6: MCP credential partitioning

*For any* preset MCP configuration, the output `.mcp.json` should partition servers such that: (a) servers with `requiresCredentials: false` appear as normal entries, and (b) servers with `requiresCredentials: true` appear with `_disabled_` prefix in their key name and include a `_comment` field.

**Validates: Requirements 4.2, 4.3**

### Property 7: MCP merge preserves existing entries

*For any* existing `.mcp.json` content (valid JSON with `mcpServers` object) and any incoming MCP config, `mergeMCPConfig(existing, incoming)` should produce a result where: (a) all keys from `existing.mcpServers` are preserved with their original values, and (b) new keys from incoming that don't conflict are added.

**Validates: Requirements 4.5**

### Property 8: Env template completeness and grouping

*For any* MCP configuration with credential-requiring servers, `generateEnvTemplate` should produce output containing: (a) every required environment variable key from the config, and (b) variables grouped by service with comment headers separating each group.

**Validates: Requirements 8.1, 8.2**

### Property 9: Env template append idempotence

*For any* existing `.env.example` content and any set of new environment variables, `generateEnvTemplate(existing, newVars)` should: (a) contain all new variable keys not already in existing, (b) not duplicate any key already present in existing, and (c) applying the function twice with the same newVars should produce identical output (idempotence).

**Validates: Requirements 8.3**

## Error Handling

### PowersLoader Errors

| Scenario | Behavior |
|----------|----------|
| `powers.json` không tồn tại | Graceful degradation: return empty array, log warning |
| `powers.json` invalid JSON | Return error result với message cụ thể, không crash CLI |
| `powers.json` fails schema validation | Return error với Zod validation issues, skip powers step |
| Power URL không hợp lệ | Zod URL validation reject, báo lỗi tại parse time |

### MCPConfigurator Errors

| Scenario | Behavior |
|----------|----------|
| Existing `.mcp.json` invalid JSON | Log warning, treat as null (fresh write) |
| Permission denied writing `.mcp.json` | Throw KKError với ErrorCodes.FILE_WRITE_FAILED |
| User declines MCP confirmation | Skip MCP step entirely, log info |

### EnvTemplateGenerator Errors

| Scenario | Behavior |
|----------|----------|
| Existing `.env.example` unreadable | Treat as empty, generate fresh |
| Write permission denied | Throw KKError, suggest manual creation |

### General Error Strategy

- Tất cả errors sử dụng `KKError` class hiện có với error codes
- Powers/MCP steps là non-blocking: nếu fail, CLI vẫn hoàn thành init cho files chính
- User-facing errors phải actionable (gợi ý cách fix)
- Không log sensitive data (env var values, credentials)

## Testing Strategy

### Property-Based Testing

Sử dụng **fast-check** (đã có trong devDependencies của project) cho property-based tests.

Mỗi property test chạy minimum **100 iterations** với random inputs.

#### Test Files

- `packages/cli/src/core/__tests__/PowersLoader.prop.test.ts` — Properties 1, 2, 3
- `packages/cli/src/core/__tests__/MCPConfigurator.prop.test.ts` — Properties 6, 7
- `packages/cli/src/core/__tests__/SetupGuideGenerator.prop.test.ts` — Property 5
- `packages/cli/src/core/__tests__/EnvTemplateGenerator.prop.test.ts` — Properties 8, 9
- `packages/cli/src/prompts/__tests__/PowersPrompter.prop.test.ts` — Property 4

#### Tag Format

Mỗi property test phải có comment tag:
```typescript
// Feature: preset-powers-integration, Property 1: Powers schema validation
```

### Unit Testing

Unit tests bổ sung cho các example/edge-case scenarios:

- **Structural tests**: Verify mỗi preset có `powers.json`, domain hooks đúng tên, manifest entries đúng type
- **Specific mappings**: Verify frontend preset recommend Figma (essential), backend recommend Supabase (essential), etc.
- **Flag behavior**: `--powers=none` skips, `--powers=all` includes all, `--quiet` suppresses output
- **Integration**: Full init flow với mock filesystem verify output files đúng vị trí

#### Test Files

- `packages/cli/src/core/__tests__/PowersLoader.test.ts`
- `packages/cli/src/core/__tests__/MCPConfigurator.test.ts`
- `packages/cli/src/core/__tests__/SetupGuideGenerator.test.ts`
- `packages/cli/src/core/__tests__/EnvTemplateGenerator.test.ts`
- `packages/cli/src/commands/__tests__/init-powers.test.ts`

### Structural Tests

Extend existing structural test suite (`vitest.structural.config.ts`) để verify:
- Mỗi preset có `powers.json` valid
- Mỗi domain hook có `.js` file
- Manifest entries cho powers.json và domain hooks tồn tại
- Threshold counts updated (hooks count tăng per preset)

### Test Runner

```bash
# All tests
cd packages/cli && npx vitest run

# Property tests only
cd packages/cli && npx vitest run --grep "prop"

# Structural tests
cd packages/cli && npx vitest run --config vitest.structural.config.ts
```
