# Requirements Document

## Introduction

Tính năng tích hợp Kiro Powers, MCP Server configs, và domain-specific Agent Hooks vào từng preset của Kiro Kit. Khi user chạy `kiro-kit init`, CLI sẽ tự động cài đặt MCP servers và Agent Hooks phù hợp với role/preset đã chọn, đồng thời recommend các Kiro Powers tương ứng (vì Powers chỉ cài được qua Kiro IDE marketplace, không qua file copy).

## Glossary

- **CLI**: Command-line interface tool `kiro-kit` (npm package)
- **Preset**: Bộ cấu hình sẵn cho một role cụ thể (frontend, backend, fullstack, mobile, devops, data-ai)
- **Powers**: Kiro IDE feature đóng gói MCP tools + POWER.md steering + hooks thành các đơn vị cài đặt được, kích hoạt bằng keyword
- **Powers_Config**: File JSON (`powers.json`) trong mỗi preset, chứa danh sách Powers được recommend cho preset đó
- **Agent_Hook**: Script chạy tự động khi có sự kiện trong Kiro IDE (file save, task complete, etc.), thực hiện các tác vụ domain-specific
- **MCP_Server**: Model Context Protocol server cung cấp tools cho AI agent trong Kiro IDE
- **MCP_Config**: File `.mcp.json` chứa cấu hình các MCP servers cho workspace
- **Setup_Guide**: File markdown hướng dẫn user cài đặt Powers và cấu hình MCP servers sau khi init
- **Marketplace**: Kiro IDE Powers marketplace tại kiro.dev/powers

## Requirements

### Requirement 1: Powers Configuration per Preset

**User Story:** As a developer, I want each preset to include a curated list of recommended Kiro Powers, so that I know which Powers are relevant to my role without manual research.

#### Acceptance Criteria

1. THE CLI SHALL include a `powers.json` file in each preset directory containing an array of recommended Powers
2. WHEN a preset is initialized, THE CLI SHALL read the `powers.json` from the selected preset
3. THE Powers_Config SHALL contain for each Power: name, marketplace URL, description, and priority level (essential/recommended/optional)
4. THE CLI SHALL categorize Powers into "essential" (core workflow), "recommended" (high value), and "optional" (nice-to-have) tiers
5. WHEN multiple presets are selected, THE CLI SHALL merge Powers recommendations and deduplicate entries

### Requirement 2: Powers Recommendation Output

**User Story:** As a developer, I want to see which Powers I should install after running init, so that I can quickly set up my IDE with the right tools.

#### Acceptance Criteria

1. WHEN init completes, THE CLI SHALL display a formatted list of recommended Powers grouped by priority tier
2. THE CLI SHALL display the marketplace URL for each recommended Power
3. WHEN the `--quiet` flag is set, THE CLI SHALL suppress Powers recommendations from terminal output
4. THE CLI SHALL generate a `POWERS-SETUP.md` file in `.kiro/` directory containing full installation instructions for all recommended Powers
5. THE Setup_Guide SHALL include step-by-step instructions to install each Power via Kiro IDE marketplace

### Requirement 3: Domain-Specific Agent Hooks

**User Story:** As a developer, I want preset-specific Agent Hooks that automate domain tasks, so that my workflow is optimized for my role beyond generic notification hooks.

#### Acceptance Criteria

1. THE CLI SHALL include domain-specific Agent Hooks in each preset alongside existing generic hooks
2. WHEN the frontend preset is selected, THE CLI SHALL install hooks for: accessibility-check, bundle-size-guard, component-test-reminder
3. WHEN the backend preset is selected, THE CLI SHALL install hooks for: api-schema-validate, migration-safety-check, endpoint-test-coverage
4. WHEN the fullstack preset is selected, THE CLI SHALL install hooks for: type-sync-check, api-client-gen, deployment-readiness
5. WHEN the mobile preset is selected, THE CLI SHALL install hooks for: platform-parity-check, asset-optimization, release-checklist
6. WHEN the devops preset is selected, THE CLI SHALL install hooks for: terraform-plan-review, container-scan, cost-estimation
7. WHEN the data-ai preset is selected, THE CLI SHALL install hooks for: data-drift-check, model-card-update, experiment-log
8. THE Agent_Hook SHALL follow the existing hook format: `.js` primary file with optional `.sh` and `.ps1` fallbacks

### Requirement 4: MCP Server Auto-Configuration

**User Story:** As a developer, I want MCP servers to be automatically configured (not just example files), so that I can start using MCP tools immediately after init.

#### Acceptance Criteria

1. WHEN init completes, THE CLI SHALL generate a functional `.mcp.json` file (not `.mcp.json.example`) in the workspace root
2. THE MCP_Config SHALL include only MCP servers that require no external credentials by default
3. WHEN an MCP server requires credentials, THE CLI SHALL include the server entry commented out with a placeholder for the required environment variable
4. THE CLI SHALL prompt the user to confirm MCP server installation before writing `.mcp.json`
5. IF a `.mcp.json` file already exists, THEN THE CLI SHALL merge new servers with existing configuration without overwriting user entries
6. THE MCP_Config SHALL include preset-specific servers: filesystem and git for all presets, playwright for frontend/fullstack, postgres/docker for backend/fullstack/devops, fetch for all presets

### Requirement 5: Powers-to-Preset Mapping

**User Story:** As a developer, I want each preset to recommend the most relevant Powers from the marketplace, so that I get maximum value from the Kiro Powers ecosystem.

#### Acceptance Criteria

1. THE Powers_Config for frontend preset SHALL recommend: Figma (essential), Netlify (recommended), Context7 (recommended), Snyk (optional), ScoutQA (optional)
2. THE Powers_Config for backend preset SHALL recommend: Supabase (essential), Neon (recommended), Postman (recommended), Context7 (recommended), Stripe (optional), Snyk (optional)
3. THE Powers_Config for fullstack preset SHALL recommend: Supabase (essential), Figma (recommended), Netlify (recommended), Stripe (recommended), Context7 (recommended), Firebase (optional), LaunchDarkly (optional)
4. THE Powers_Config for mobile preset SHALL recommend: Firebase (essential), Figma (recommended), Context7 (recommended), ElevenLabs (optional), Bria (optional)
5. THE Powers_Config for devops preset SHALL recommend: Terraform (essential), Datadog (recommended), Snyk (recommended), Depot (recommended), Harness (optional), AWS CDK (optional)
6. THE Powers_Config for data-ai preset SHALL recommend: ClickHouse (essential), Context7 (recommended), Exa (recommended), Neon (optional), New Relic (optional)

### Requirement 6: Manifest Integration

**User Story:** As a maintainer, I want new files (powers.json, domain hooks, setup guide) to be properly registered in the preset manifest, so that structural tests continue to pass.

#### Acceptance Criteria

1. THE CLI SHALL register `powers.json` in each preset's `manifest.json` with type "powers"
2. THE CLI SHALL register all new domain-specific hooks in the manifest with type "hook" and `executable: true`
3. THE CLI SHALL register `POWERS-SETUP.md` as a generated output in the manifest with type "doc"
4. WHEN structural tests run, THE CLI SHALL pass all existing threshold checks with the new files included

### Requirement 7: CLI Interactive Powers Setup

**User Story:** As a developer, I want the CLI to interactively guide me through Powers setup, so that I can choose which Powers to install based on my needs.

#### Acceptance Criteria

1. WHEN init runs in interactive mode, THE CLI SHALL display Powers recommendations after file installation
2. THE CLI SHALL allow the user to select which Power tiers to include in the setup guide (essential only, essential+recommended, all)
3. WHEN the `--powers=none` flag is set, THE CLI SHALL skip Powers recommendation entirely
4. WHEN the `--powers=all` flag is set, THE CLI SHALL include all Powers in the setup guide without prompting
5. THE CLI SHALL display a summary count of recommended Powers per tier at the end of init

### Requirement 8: Environment Variable Template

**User Story:** As a developer, I want a consolidated environment variable template for all MCP servers and Powers, so that I can configure credentials in one place.

#### Acceptance Criteria

1. THE CLI SHALL generate or update `.env.example` with all required environment variables for configured MCP servers
2. THE CLI SHALL group environment variables by service (MCP servers, Powers) with comments explaining each variable
3. IF an `.env.example` already exists, THEN THE CLI SHALL append new variables without duplicating existing entries
4. THE CLI SHALL include placeholder values that clearly indicate the expected format for each variable
