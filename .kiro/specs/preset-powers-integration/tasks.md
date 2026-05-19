# Implementation Plan: Preset Powers Integration

## Overview

Triển khai tích hợp Kiro Powers, MCP Server auto-configuration, và domain-specific Agent Hooks vào CLI `kiro-kit`. Mỗi task xây dựng incremental trên task trước, kết thúc bằng wiring tất cả components vào init flow hiện tại.

## Tasks

- [x] 1. Core data types và PowersLoader module
  - [x] 1.1 Implement PowersLoader với Zod schema validation
    - Tạo `packages/cli/src/core/PowersLoader.ts`
    - Define `PowerTierSchema`, `PowerEntrySchema`, `PowersConfigSchema` với Zod
    - Export types: `PowerTier`, `PowerEntry`, `PowersConfig`, `LoadPowersResult`
    - Implement `loadPowers(presetDir)`: đọc `powers.json`, validate, return result
    - Implement `mergePowers(configs)`: deduplicate by name, keep highest tier
    - Implement `filterByTier(powers, tiers)`: filter by selected tiers
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 1.2 Write property tests for PowersLoader
    - **Property 1: Powers schema validation**
    - **Property 2: Powers tier filtering**
    - **Property 3: Powers merge deduplication**
    - Tạo `packages/cli/src/core/__tests__/PowersLoader.prop.test.ts`
    - Sử dụng fast-check với minimum 100 iterations
    - **Validates: Requirements 1.3, 1.4, 1.5**

  - [ ]* 1.3 Write unit tests for PowersLoader
    - Tạo `packages/cli/src/core/__tests__/PowersLoader.test.ts`
    - Test graceful degradation khi file không tồn tại
    - Test invalid JSON handling
    - Test schema validation failures
    - Test specific preset mappings (Figma essential for frontend, etc.)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. MCPConfigurator module
  - [x] 2.1 Implement MCPConfigurator
    - Tạo `packages/cli/src/core/MCPConfigurator.ts`
    - Define interfaces: `MCPServerEntry`, `MCPPresetConfig`
    - Implement `getMCPConfig(presetName)`: return preset-specific MCP servers theo mapping table trong design
    - Implement `mergeMCPConfig(existing, incoming)`: merge without overwriting user entries
    - Implement `writeMCPConfig(workspaceRoot, config)`: write `.mcp.json`
    - Servers không cần credentials: filesystem, git, fetch, playwright (frontend/fullstack)
    - Servers cần credentials: postgres, docker — dùng `_disabled_` prefix convention
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [ ]* 2.2 Write property tests for MCPConfigurator
    - **Property 6: MCP credential partitioning**
    - **Property 7: MCP merge preserves existing entries**
    - Tạo `packages/cli/src/core/__tests__/MCPConfigurator.prop.test.ts`
    - **Validates: Requirements 4.2, 4.3, 4.5**

  - [ ]* 2.3 Write unit tests for MCPConfigurator
    - Tạo `packages/cli/src/core/__tests__/MCPConfigurator.test.ts`
    - Test mỗi preset trả về đúng servers
    - Test merge logic với existing config
    - Test invalid existing JSON handling
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. SetupGuideGenerator và EnvTemplateGenerator modules
  - [x] 4.1 Implement SetupGuideGenerator
    - Tạo `packages/cli/src/core/SetupGuideGenerator.ts`
    - Define interface `SetupGuideOptions`
    - Implement `generateSetupGuide(options)`: tạo markdown content với Powers grouped by tier, marketplace URLs, step-by-step instructions
    - Implement `writeSetupGuide(workspaceRoot, content)`: write to `.kiro/POWERS-SETUP.md`
    - _Requirements: 2.4, 2.5_

  - [ ]* 4.2 Write property test for SetupGuideGenerator
    - **Property 5: Setup guide contains all power information**
    - Tạo `packages/cli/src/core/__tests__/SetupGuideGenerator.prop.test.ts`
    - **Validates: Requirements 2.4, 2.5**

  - [x] 4.3 Implement EnvTemplateGenerator
    - Tạo `packages/cli/src/core/EnvTemplateGenerator.ts`
    - Define interface `EnvVariable`
    - Implement `collectEnvVars(mcpConfig, powers)`: collect all required env vars
    - Implement `parseExistingEnv(content)`: parse existing `.env.example` keys
    - Implement `generateEnvTemplate(existing, newVars)`: generate/append without duplicates, grouped by service
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 4.4 Write property tests for EnvTemplateGenerator
    - **Property 8: Env template completeness and grouping**
    - **Property 9: Env template append idempotence**
    - Tạo `packages/cli/src/core/__tests__/EnvTemplateGenerator.prop.test.ts`
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 5. PowersPrompter module
  - [x] 5.1 Implement PowersPrompter
    - Tạo `packages/cli/src/prompts/PowersPrompter.ts`
    - Implement `promptPowersTier(powers, flags)`: interactive tier selection, respect `--powers` and `--yes` flags
    - Implement `displayPowersRecommendations(powers, quiet)`: formatted terminal output grouped by tier, show URLs, summary count
    - Skip display khi `quiet=true`
    - _Requirements: 2.1, 2.2, 2.3, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 5.2 Write property test for PowersPrompter display
    - **Property 4: Display output completeness**
    - Tạo `packages/cli/src/prompts/__tests__/PowersPrompter.prop.test.ts`
    - **Validates: Requirements 2.1, 2.2, 7.5**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Preset content files: powers.json cho 6 presets
  - [x] 7.1 Create powers.json for frontend preset
    - Tạo `presets/frontend/powers.json`
    - Powers: Figma (essential), Netlify (recommended), Context7 (recommended), Snyk (optional), ScoutQA (optional)
    - _Requirements: 5.1_

  - [x] 7.2 Create powers.json for backend preset
    - Tạo `presets/backend/powers.json`
    - Powers: Supabase (essential), Neon (recommended), Postman (recommended), Context7 (recommended), Stripe (optional), Snyk (optional)
    - _Requirements: 5.2_

  - [x] 7.3 Create powers.json for fullstack preset
    - Tạo `presets/fullstack/powers.json`
    - Powers: Supabase (essential), Figma (recommended), Netlify (recommended), Stripe (recommended), Context7 (recommended), Firebase (optional), LaunchDarkly (optional)
    - _Requirements: 5.3_

  - [x] 7.4 Create powers.json for mobile preset
    - Tạo `presets/mobile/powers.json`
    - Powers: Firebase (essential), Figma (recommended), Context7 (recommended), ElevenLabs (optional), Bria (optional)
    - _Requirements: 5.4_

  - [x] 7.5 Create powers.json for devops preset
    - Tạo `presets/devops/powers.json`
    - Powers: Terraform (essential), Datadog (recommended), Snyk (recommended), Depot (recommended), Harness (optional), AWS CDK (optional)
    - _Requirements: 5.5_

  - [x] 7.6 Create powers.json for data-ai preset
    - Tạo `presets/data-ai/powers.json`
    - Powers: ClickHouse (essential), Context7 (recommended), Exa (recommended), Neon (optional), New Relic (optional)
    - _Requirements: 5.6_

- [x] 8. Domain-specific Agent Hooks (18 hook files)
  - [x] 8.1 Create frontend domain hooks
    - Tạo `presets/frontend/hooks/accessibility-check.js`
    - Tạo `presets/frontend/hooks/bundle-size-guard.js`
    - Tạo `presets/frontend/hooks/component-test-reminder.js`
    - Follow existing hook format (`.js` primary file)
    - _Requirements: 3.2, 3.8_

  - [x] 8.2 Create backend domain hooks
    - Tạo `presets/backend/hooks/api-schema-validate.js`
    - Tạo `presets/backend/hooks/migration-safety-check.js`
    - Tạo `presets/backend/hooks/endpoint-test-coverage.js`
    - _Requirements: 3.3, 3.8_

  - [x] 8.3 Create fullstack domain hooks
    - Tạo `presets/fullstack/hooks/type-sync-check.js`
    - Tạo `presets/fullstack/hooks/api-client-gen.js`
    - Tạo `presets/fullstack/hooks/deployment-readiness.js`
    - _Requirements: 3.4, 3.8_

  - [x] 8.4 Create mobile domain hooks
    - Tạo `presets/mobile/hooks/platform-parity-check.js`
    - Tạo `presets/mobile/hooks/asset-optimization.js`
    - Tạo `presets/mobile/hooks/release-checklist.js`
    - _Requirements: 3.5, 3.8_

  - [x] 8.5 Create devops domain hooks
    - Tạo `presets/devops/hooks/terraform-plan-review.js`
    - Tạo `presets/devops/hooks/container-scan.js`
    - Tạo `presets/devops/hooks/cost-estimation.js`
    - _Requirements: 3.6, 3.8_

  - [x] 8.6 Create data-ai domain hooks
    - Tạo `presets/data-ai/hooks/data-drift-check.js`
    - Tạo `presets/data-ai/hooks/model-card-update.js`
    - Tạo `presets/data-ai/hooks/experiment-log.js`
    - _Requirements: 3.7, 3.8_

- [x] 9. Manifest updates và schema extension
  - [x] 9.1 Extend ArtifactTypeSchema in ManifestParser
    - Thêm `'powers'` vào `ArtifactTypeSchema` enum trong `packages/cli/src/core/ManifestParser.ts`
    - _Requirements: 6.1_

  - [x] 9.2 Update all 6 preset manifest.json files
    - Thêm entry cho `powers.json` (type: "powers") vào mỗi manifest
    - Thêm entries cho domain hooks (type: "hook", executable: true) vào mỗi manifest
    - Update `minCounts.hooks` nếu cần
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 10. Checkpoint - Ensure structural tests pass
  - Ensure all tests pass including structural tests, ask the user if questions arise.

- [x] 11. CLI flag extensions và init flow integration
  - [x] 11.1 Add --powers and --quiet flags to init command
    - Modify `packages/cli/src/commands/init.ts`
    - Add `--powers <mode>` option (none | all | interactive)
    - Add `--quiet` flag
    - _Requirements: 2.3, 7.3, 7.4_

  - [x] 11.2 Wire PowersLoader into init flow
    - Sau step "Process files", gọi `loadPowers()` cho selected presets
    - Gọi `mergePowers()` khi multiple presets selected
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 11.3 Wire MCPConfigurator into init flow
    - Thay thế logic `.mcp.json.example` hiện tại bằng `getMCPConfig()` + `mergeMCPConfig()`
    - Prompt user confirm trước khi write `.mcp.json`
    - Skip khi user declines
    - _Requirements: 4.1, 4.4, 4.5_

  - [x] 11.4 Wire PowersPrompter and SetupGuideGenerator into init flow
    - Gọi `promptPowersTier()` theo flags
    - Gọi `displayPowersRecommendations()` (respect --quiet)
    - Gọi `generateSetupGuide()` và `writeSetupGuide()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.1, 7.2, 7.5_

  - [x] 11.5 Wire EnvTemplateGenerator into init flow
    - Gọi `collectEnvVars()` từ MCP config
    - Gọi `generateEnvTemplate()` với existing `.env.example` nếu có
    - Write output
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 12. Integration tests
  - [ ]* 12.1 Write integration tests for init-powers flow
    - Tạo `packages/cli/src/commands/__tests__/init-powers.test.ts`
    - Test full init flow với mock filesystem
    - Test `--powers=none` skips Powers entirely
    - Test `--powers=all` includes all without prompt
    - Test `--quiet` suppresses output
    - Test merge behavior khi `.mcp.json` already exists
    - Test `.env.example` append behavior
    - _Requirements: 2.3, 4.5, 7.3, 7.4, 8.3_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass (unit, property, structural, integration), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Mỗi task reference specific requirements cho traceability
- Property tests sử dụng fast-check (đã có trong devDependencies)
- Domain hooks follow existing hook format trong project
- Checkpoints đảm bảo incremental validation
- TypeScript là implementation language (design đã specify cụ thể)
