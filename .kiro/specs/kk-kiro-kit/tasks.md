# Kế Hoạch Triển Khai (Implementation Plan): KK-Kiro-Kit

Implementation plan for KK-Kiro-Kit. Tasks reference requirements.md and design.md.

Mỗi task được thiết kế để hoàn thành trong 30 phút - 2 giờ. Sub-task đánh dấu `*` (ví dụ `- [ ]* 2.1 Task`) là OPTIONAL và có thể bỏ qua. Top-level task không bao giờ optional. Mọi task đều tham chiếu requirement clauses và design sections.

## Tasks

## 1. Bootstrap Repository và Tooling

- [x] 1. Khởi tạo monorepo skeleton và tooling nền tảng
  - [x] 1.1 Tạo cấu trúc thư mục root và `package.json` workspace root
    - Tạo `package.json` ở root với `private: true`, `type: module`, `engines.node >= 18`
    - Tạo `pnpm-workspace.yaml` khai báo `packages/*` và `presets/*`
    - Tạo `tsconfig.base.json` chia sẻ giữa packages
    - _Requirements: 2.4, 2.5, 19.1_
    - _Design: cấu-trúc-repository-monorepo_

  - [x] 1.2 Cấu hình ESLint + Prettier + EditorConfig
    - Tạo `.eslintrc.cjs` với rule TypeScript cơ bản
    - Tạo `.prettierrc` (2-space indent, single quote, trailing comma es5)
    - Tạo `.editorconfig` (LF cho JSON/YAML, indent 2 spaces)
    - _Requirements: 22.4, 19.3_

  - [x] 1.3 Cấu hình Vitest test runner ở root
    - Tạo `vitest.config.ts` với coverage v8
    - Cấu hình test paths cho unit/e2e/property/structural
    - _Requirements: 22.1_

  - [x] 1.4 Tạo `.gitignore` chuẩn
    - Loại trừ `node_modules`, `dist`, `.env*` (giữ `.env.example`), `.kiro/.backup`, `.kiro/settings/mcp.json`, `coverage`, `.DS_Store`, `*.log`
    - _Requirements: 23.5, 40.3_

  - [x] 1.5 Tạo GitHub Actions CI workflow
    - Tạo `.github/workflows/ci.yml` chạy trên PR và push tới `main`
    - Steps: install, lint, typecheck, test, build, structural test
    - Matrix: `os: [ubuntu-latest, macos-latest, windows-latest]`, `node: [18, 20, 22]`
    - _Requirements: 22.4, 22.5, 26.1, 26.2, 26.5, 26.6_

  - [x] 1.6 Tạo GitHub Actions publish workflow
    - Tạo `.github/workflows/publish.yml` trigger trên tag `v*.*.*`
    - Build + test + publish lên npm với `NPM_TOKEN`, dùng `--provenance`
    - _Requirements: 26.3, 26.4_

  - [x] 1.7 Tạo issue templates và PR template
    - Tạo `.github/ISSUE_TEMPLATE/bug-report.yml`, `feature-request.yml`, `preset-request.yml`
    - Tạo `.github/PULL_REQUEST_TEMPLATE.md`
    - _Requirements: 26.7_

  - [x] 1.8 Tạo các file root: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG
    - LICENSE: MIT chuẩn với placeholder `[year]` `[author]`
    - CONTRIBUTING.md: setup local, run test, mở PR
    - SECURITY.md: cách báo lỗ hổng (private email/issue)
    - CODE_OF_CONDUCT.md: Contributor Covenant 2.1
    - CHANGELOG.md: Keep a Changelog format với mục `Unreleased`
    - _Requirements: 20.5, 21.1, 21.4, 21.5, 21.6_


## 2. CLI Core Modules

- [x] 2. Triển khai package CLI và core modules tại `packages/cli/`

  - [x] 2.1 Setup cấu trúc package CLI
    - Tạo `packages/cli/package.json` với `name: kiro-kit`, `bin: { kiro-kit: ./dist/index.js }`, `engines.node >= 18`, `type: module`
    - Tạo `packages/cli/tsconfig.json` extends base
    - Tạo `packages/cli/tsup.config.ts` để bundle ESM, copy `presets/` vào `dist/`
    - Tạo skeleton `src/`, `tests/{unit,e2e,property,structural,fixtures}/`
    - _Requirements: 2.1, 2.2, 2.5, 18.2_
    - _Design: cấu-trúc-repository-monorepo_

  - [x] 2.2 Triển khai entry point `index.ts`
    - Shebang `#!/usr/bin/env node`
    - Node version check: nếu major < 18 thì in lỗi `KK001` và exit 1
    - Setup global commander instance
    - Wire 8 commands (placeholder ở giai đoạn này)
    - _Requirements: 2.6, 19.4_
    - _Design: cli-surface_

  - [x] 2.3 Triển khai commander setup với global flags
    - Khai báo flags: `--verbose`, `--quiet`, `--help`, `-h`, `--version`, `-v`, `--no-color`
    - Hỗ trợ `--help` cho mọi command/sub-command
    - _Requirements: 20.1, 28.5, 28.6_

  - [x] 2.4 Triển khai utilities cốt lõi: logger, error class
    - `src/utils/color.ts`: wrapper picocolors với check `NO_COLOR` env và `isTTY`
    - `src/utils/logger.ts`: API `logger.info/warn/error/success/debug` với màu nhất quán (green/yellow/red)
    - `src/core/errors.ts`: class `KKError` chứa `code` (KK001-KK091), `message`, `suggestion`
    - _Requirements: 28.1, 28.2, 28.3, 28.4_
    - _Design: bảng-mã-lỗi-error-codes_

  - [x] 2.5 Triển khai manifest parser
    - `src/core/ManifestParser.ts` với zod schema cho `Manifest`
    - API: `parse(json)`, `print(m)`, `validate(m, presetDir)`
    - Validate file completeness và no-orphan
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7, 10.8, 30.1, 30.2, 30.3_
    - _Design: manifestparser, manifest-schema_

  - [x] 2.5.1 Property test cho manifest parser round-trip
    - **Property 2: Manifest parse-print round-trip**
    - **Validates: Requirements 30.4**

  - [x] 2.6 Triển khai preset loader
    - `src/core/PresetLoader.ts` load preset từ `dist/presets/<name>/`
    - API: `load(name)`, `loadAll(names)`, `listAvailable()`
    - Build catalog từ manifest, validate qua ManifestParser
    - _Requirements: 10.5, 18.2, 24.1_
    - _Design: presetloader_

  - [x] 2.7 Triển khai front-matter parser
    - `src/core/FrontMatterParser.ts` dùng `js-yaml` + custom delimiters
    - API: `parse(content)` trả về `{ frontMatter, body }`, `print(fm, body)`
    - Validation theo artifact type: agent (name+description), command (description), skill (name+description), steering (inclusion+description, +fileMatchPattern nếu fileMatch)
    - _Requirements: 13.2, 13.3, 30.7, 31.2, 31.3, 31.6, 32.3, 32.6, 33.3_
    - _Design: frontmatterparser_

  - [x] 2.7.1 Property test cho front-matter round-trip
    - **Property 2 (extended): Front-matter parse-print round-trip**
    - **Validates: Requirements 30.7**

  - [x] 2.8 Triển khai conflict resolver
    - `src/core/ConflictResolver.ts` với enum action `WRITE_NEW`, `OVERWRITE_WITH_BACKUP`, `SKIP`, `NO_OP`
    - Logic theo pseudocode trong design (byte-equal -> NO_OP, force, skip-existing, overwriteAll session state)
    - Tích hợp 4-option prompt và diff loop
    - _Requirements: 9.1, 9.3, 9.5, 9.6, 9.7, 9.8_
    - _Design: conflictresolver_

  - [x] 2.9 Triển khai diff renderer
    - `src/prompts/DiffViewer.ts` in unified diff bằng `diff` package
    - Highlight thêm/bớt với màu (NO_COLOR aware)
    - _Requirements: 9.4_

  - [x] 2.10 Triển khai backup manager
    - `src/core/BackupManager.ts`
    - API: `backup(target, timestamp)`, `restore(timestamp?)`, `listTimestamps()`
    - Timestamp format `YYYYMMDD-HHmmss-mmm`
    - Bảo toàn đường dẫn tương đối: `.kiro/.backup/<ts>/<rel-path>`
    - Không xoá backup sau restore
    - _Requirements: 8.1, 8.3, 8.5, 9.2, 9.9_
    - _Design: backupmanager_

  - [x] 2.11 Triển khai MCP merger
    - `src/core/merge/mergeMCP.ts`: user-priority, không xoá server user
    - Cảnh báo khi có cross-preset conflict cùng tên server
    - Pass schema validation MCP
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
    - _Design: mergeengine-mcp-hooks-settings_

  - [x] 2.12 Triển khai settings merger
    - `src/core/merge/mergeSettings.ts`: concat-dedupe arrays `hooks.PreToolUse`/`PostToolUse` theo field `command`
    - Last-write-wins cho non-array (statusLine, includeCoAuthoredBy) kèm warning
    - Bảo toàn field user thêm thủ công
    - _Requirements: 12.5, 12.6, 12.7_
    - _Design: settings-merger_

  - [x] 2.13 Triển khai hooks files merger
    - `src/core/merge/mergeHooks.ts`: dedupe theo tên file (case-sensitive)
    - Conflict file -> delegate sang ConflictResolver (Req 9)
    - Bảo toàn hook user tạo (không trong manifest)
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 2.14 Triển khai tracking store
    - `src/core/TrackingStore.ts` đọc/ghi `.kiro/.kiro-kit.json`
    - Schema: `kitVersion`, `installedAt`, `updatedAt`, `presets[]`, mỗi preset có `files[]` với `target`/`sourcePreset`/`contentHash`/`installedAt`
    - Validate JSON; nếu corrupt -> warning + exit code KK040 (không destructive)
    - Write-tracking-last sau mọi file đã ghi
    - _Requirements: 12.4, 42.1, 42.2, 42.3, 42.4, 42.5, 42.6_
    - _Design: trackingstore, tracking-file-kiro-kiro-kit-json_

  - [x] 2.15 Triển khai metadata.json writer
    - `src/core/MetadataWriter.ts` compose `version`, `name`, `description`, `buildDate`, `repository`, `presets[]`, `installedAt`, `kitVersion`
    - Khi cài nhiều preset -> gộp metadata
    - _Requirements: 37.1, 37.2, 37.3, 37.4_
    - _Design: metadata-file-kiro-metadata-json_

  - [x] 2.16 Triển khai statusline installer + selector
    - `src/core/StatuslineSelector.ts`: chọn command theo `process.platform`
    - Ghi triple `.js` + `.sh` + `.ps1` vào `.kiro/`
    - Set chmod +x cho `.sh` trên Unix
    - Resolve `statusLine.command` trong `settings.json` theo platform tại `init`
    - _Requirements: 36.1, 36.2, 36.4, 36.5, 36.6_
    - _Design: statuslineselector_

  - [x] 2.17 Triển khai cross-platform path utilities
    - `src/utils/paths.ts` wrapper `path.join`, `path.sep`, `path.resolve`
    - Helper `relativeFromWorkspace`, `safePathInside(workspace)` chống path traversal
    - _Requirements: 19.2_

  - [x] 2.18 Triển khai line-ending writer (atomic write)
    - `src/utils/fs-safe.ts`: `atomicWrite(target, content)` ghi `.tmp.<random>` cùng dir rồi rename
    - LF cho `.json`, `.yaml`, `.yml`; OS-default cho `.md`, `.sh`, `.ps1`, `.js`
    - _Requirements: 19.3_
    - _Design: atomic-write-strategy_


## 3. CLI Commands

- [x] 3. Triển khai 8 commands của CLI

  - [x] 3.1 Triển khai `init` command
    - `src/commands/init.ts`: prompt multi-pick presets (space để select, `<a>` toggle all)
    - Hiển thị tóm tắt số file sẽ ghi và yêu cầu xác nhận
    - Hỗ trợ flags: `--yes`/`-y`, `--preset <name>` (lặp), `--force`, `--skip-existing`, `--no-color`
    - Empty selection -> exit 0 không tạo file
    - SIGINT -> exit 130
    - Ghi tracking file sau khi mọi file đã ghi xong
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_
    - _Design: init-flow_

  - [x] 3.2 Triển khai `add <preset>` command
    - `src/commands/add.ts`: gộp preset mới vào tracking
    - Auto-init nếu workspace chưa có `.kiro/`
    - Reject preset không hợp lệ với danh sách hợp lệ + exit 1
    - Conflict resolution theo Req 9
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
    - _Design: add-flow_

  - [x] 3.3 Triển khai `list` command
    - `src/commands/list.ts`: in 6 preset + mô tả 1 dòng + count artifact (agents/skills/commands/hooks/workflows/MCP)
    - `--json` flag: in JSON hợp lệ
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.4 Triển khai `info <preset>` command
    - `src/commands/info.ts`: in mô tả đầy đủ + danh sách file + target path
    - Liệt kê MCP servers, hooks, agents, skills, commands, workflows, spec/docs templates
    - Reject preset không tồn tại + exit 1
    - `--json` flag
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.5 Triển khai `update` command
    - `src/commands/update.ts`: đọc tracking -> so sánh version preset đã cài với bundled
    - Diff file thay đổi -> conflict resolution
    - Empty installed -> exit 0 với thông báo
    - Network unreachable -> warning + exit 0 (không phải lỗi)
    - Bump version trong tracking sau khi xong
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 18.4_
    - _Design: update-flow_

  - [x] 3.6 Triển khai `restore` command
    - `src/commands/restore.ts`: restore từ backup mới nhất hoặc `--timestamp <iso>`
    - `--list` flag: in danh sách backup timestamps có sẵn
    - Không có backup -> exit 1
    - In danh sách file đã khôi phục
    - Idempotent: không xoá backup sau restore
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
    - _Design: restore-flow_

  - [x] 3.7 Triển khai `doctor` command
    - `src/commands/doctor.ts`: 8 health checks
    - (a) Node >= 18, (b) `.kiro/` tồn tại, (c) `mcp.json` valid JSON, (d) tracking file valid, (e) tracked files đều tồn tại, (f) no trailing whitespace trong steering front-matter, (g) `metadata.json` valid, (h) statusline executable bit (Unix)
    - In `[PASS]/[FAIL]/[WARN]` cho mỗi check
    - All pass -> exit 0; có fail -> exit 1
    - `--fix` flag: tự sửa lỗi sửa được (format JSON, set exec bit)
    - _Requirements: 16.1, 16.2, 16.3, 16.4_
    - _Design: doctor_

  - [x] 3.8 Triển khai `telemetry enable/disable/status` commands
    - `src/commands/telemetry.ts`: ghi flag opt-in vào `~/.kiro-kit/config.json`
    - Default: disabled
    - Không gửi data trừ khi enable
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x] 3.9 Đảm bảo `--help` cho mọi command và sub-command
    - Verify mỗi command có description, options, examples
    - Test với `kiro-kit <cmd> --help`
    - _Requirements: 28.6_


## 4. Preset Content - Shared Infrastructure (Baseline)

- [x] 4. Tạo baseline preset template cùng artifacts dùng chung

  - [x] 4.1 Tạo skeleton thư mục cho preset template
    - Tạo `presets/_template/` chứa skeleton: `manifest.json`, `README.md`, `agents/`, `skills/`, `commands/`, `hooks/`, `steering/`, `workflows/`, `settings/`, `specs/_templates/_template/`, `docs/`
    - Tạo các file rỗng làm placeholder để giữ thư mục
    - Document schema manifest và file conventions
    - _Requirements: 24.3, 25.1, 25.2_
    - _Design: cấu-trúc-repository-monorepo_

  - [x] 4.2 Author 16 baseline agent files
    - Tạo agent `.md` với front-matter + system prompt đầy đủ cho: `brainstormer`, `code-reviewer`, `copywriter`, `database-admin`, `debugger`, `docs-manager`, `git-manager`, `journal-writer`, `mcp-manager`, `planner`, `project-manager`, `researcher`, `scout`, `scout-external`, `tester`, `ui-ux-designer`
    - Front-matter mỗi agent: `name` (kebab-case), `description`, optional `inclusion`/`model`/`tools`
    - Body chứa core responsibilities, working process, output format, quality standards
    - Lưu ở `presets/_template/agents/`
    - _Requirements: 24.3, 31.1, 31.2, 31.3, 31.4, 31.5_

  - [x] 4.3 Author 4 baseline workflow files
    - `workflows/development-rules.md`: YAGNI/KISS/DRY, file naming, file size <200 lines
    - `workflows/primary-workflow.md`: plan -> implement -> test -> review
    - `workflows/orchestration-protocol.md`: sequential chaining + parallel execution
    - `workflows/documentation-management.md`: docs auto-update triggers
    - Lưu ở `presets/_template/workflows/`
    - _Requirements: 24.3, 34.1, 34.2, 34.3_

  - [x] 4.4 Author 6 baseline cross-platform hooks
    - `scout-block.{js,sh,ps1}`: security guard chặn lệnh dangerous
    - `modularization-hook.js`: enforce file size <200 lines (PostToolUse)
    - `discord-notify.{js,sh,ps1}`: gửi notification qua Discord webhook
    - `telegram-notify.{js,sh,ps1}`: gửi notification qua Telegram bot
    - 2 hook bổ sung: `pre-commit-lint.js`, `git-status-tracker.js`
    - Mọi `.js` có shebang Node hợp lệ
    - Tạo `hooks/.env.example` với placeholder `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`, etc.
    - Tạo `hooks/README.md` documenting tất cả hook + trigger + env yêu cầu
    - _Requirements: 24.3, 35.1, 35.2, 35.4, 35.5, 35.6, 35.7_

  - [x] 4.5 Author statusline triple
    - `statusline.js`: Node script output 1 line gồm git branch + project name + time
    - `statusline.sh`: bash equivalent, gracefully omit git branch nếu không phải repo
    - `statusline.ps1`: PowerShell equivalent
    - Lưu ở `presets/_template/`
    - _Requirements: 36.1, 36.2, 36.3_

  - [x] 4.6 Author baseline `settings.json` template
    - Field `statusLine.type = "command"`, `statusLine.command` (placeholder, sẽ resolve theo platform tại init)
    - `hooks.PreToolUse[]` (scout-block), `hooks.PostToolUse[]` (modularization-hook), `hooks.agentStop[]` (notification)
    - `includeCoAuthoredBy: false`
    - _Requirements: 24.11, 38.1, 38.4_
    - _Design: settings-file-kiro-settings-json_

  - [x] 4.7 Author baseline `.mcp.json.example`
    - Khai báo MCP servers core: `filesystem`, `git`, `docs-seeker`, `playwright`, `fetch`
    - Mỗi server dùng placeholder `${ENV_VAR}` hoặc `<your-key-here>`, không có giá trị thật
    - _Requirements: 23.2, 24.10, 39.1, 39.5_

  - [x] 4.8 Author multi-level `.env.example` files
    - `.env.example` (project-level): các env vars chung
    - `hooks/.env.example`: hook-specific (DISCORD_WEBHOOK_URL, TELEGRAM_BOT_TOKEN)
    - `skills/.env.example`: skills-shared
    - Mỗi file có comment giải thích mục đích và format
    - _Requirements: 23.3, 40.1, 40.2, 40.4, 40.5_

  - [x] 4.9 Author 4 baseline skills ecosystem files + template-skill
    - `skills/README.md`: overview directory
    - `skills/INSTALLATION.md`: hướng dẫn cài skill mới
    - `skills/THIRD_PARTY_NOTICES.md`: third-party attributions
    - `skills/agent_skills_spec.md`: skills spec
    - `skills/template-skill/SKILL.md` + `references/`, `scripts/`, `assets/` folders
    - _Requirements: 25.4, 33.6, 41.1, 41.2_

  - [x] 4.10 Author 25+ baseline command files
    - Top-level: `bootstrap.md`, `clean.md`, `lint.md`, `test.md`, `release.md`
    - `design/`: `figma.md`, `system.md`, `wireframe.md`
    - `docs/`: `summarize.md`, `update.md`, `architecture.md`
    - `fix/`: `lint.md`, `tests.md`, `build.md`
    - `git/`: `pr.md`, `commit.md`, `branch.md`
    - `plan/`: `feature.md`, `refactor.md`
    - `review/`: `code.md`, `security.md`
    - `scout/`: top-level `scout.md`, `scout/ext.md`
    - `skill/`: `add.md`, `optimize.md`, `create.md`
    - Mỗi command có front-matter (description, inclusion, argument-hint) và body dùng `$1`, `$2`
    - Nesting tối đa 3 cấp (rare, ví dụ `bootstrap/auto/fast.md`)
    - _Requirements: 24.3, 32.1, 32.2, 32.3, 32.4, 32.5_


## 5. Preset Content - 6 Presets

- [x] 5. Tailor 6 preset chính thức (mỗi preset là self-contained kit đầy đủ)

  - [x] 5.1 Author Frontend preset
    - Copy baseline từ `_template/` sang `presets/frontend/`
    - Tailor agents/steering theo React/Next.js + TypeScript
    - Thêm 7 frontend-specific skills: `frontend-design`, `frontend-development`, `ui-styling`, `web-frameworks`, `chrome-devtools`, `threejs`, `aesthetic`
    - Thêm command category `frontend/` (component, hook, page, layout commands)
    - Thêm steering files: React/TSX conventions, Next.js patterns
    - Thêm spec template `specs/_templates/frontend/{requirements,design,tasks}.md`
    - Thêm docs templates: `code-standards.md`, `system-architecture.md`, `project-roadmap.md` (frontend tone)
    - Verify min thresholds: >=12 agents, >=20 skills, >=25 commands, >=6 hooks, >=4 workflows
    - _Requirements: 24.1, 24.3, 24.4, 24.10, 25.9, 27.1, 27.2_
    - _Design: cấu-trúc-repository-monorepo_

  - [x] 5.2 Author Backend preset
    - Copy baseline + tailor cho Node.js/Python/Go API
    - Thêm 6 backend skills: `backend-development`, `databases`, `mcp-builder`, `mcp-management`, `devops`, `better-auth`
    - Thêm command category `backend/` (route, middleware, migration commands)
    - Steering: API design, error handling, security
    - Spec + docs templates phù hợp backend
    - Verify min thresholds
    - _Requirements: 24.1, 24.3, 24.5, 24.10, 25.9, 27.1, 27.2_

  - [x] 5.3 Author Fullstack preset
    - Copy baseline + tailor cho Next.js/T3 stack
    - Bao gồm cả frontend + backend skill sets
    - Thêm `shopify`, `payment-integration` skills
    - Spec + docs templates fullstack
    - Verify min thresholds
    - _Requirements: 24.1, 24.3, 24.6, 24.10, 25.9, 27.1, 27.2_

  - [x] 5.4 Author Mobile preset
    - Copy baseline + tailor cho Flutter (focus chính) + React Native
    - Thêm `mobile-development`, `ai-multimodal`, `ui-styling` skills
    - Thêm command category `mobile/`
    - Spec + docs templates mobile
    - Verify min thresholds
    - _Requirements: 24.1, 24.3, 24.7, 24.10, 25.9, 27.1, 27.2_

  - [x] 5.5 Author DevOps preset
    - Copy baseline + tailor cho Docker/K8s/Terraform
    - Thêm `devops`, `debugging`, `repomix`, `sequential-thinking` skills
    - Thêm hook CI checks (build verify, image scan)
    - Spec + docs templates devops
    - Verify min thresholds
    - _Requirements: 24.1, 24.3, 24.8, 24.10, 25.9, 27.1, 27.2_

  - [x] 5.6 Author Data-AI preset
    - Copy baseline + tailor cho Python/ML
    - Thêm `google-adk-python`, `ai-multimodal`, `document-skills` (sub-skill container với docx/pdf/pptx/xlsx), `research`, `repomix`, `sequential-thinking` skills
    - Spec + docs templates data-ai
    - Verify min thresholds
    - _Requirements: 24.1, 24.3, 24.9, 24.10, 25.9, 27.1, 27.2, 33.5_

  - [x] 5.7 Generate `manifest.json` cho mỗi trong 6 preset
    - Liệt kê mọi file với `source`, `target`, `type`, optional `executable`
    - Khai báo `mcpServers`, `hooks`, `tags`, `minCounts`
    - Bảo đảm file completeness và no-orphan
    - Validate qua ManifestParser
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.7, 10.8, 20.2_

  - [x] 5.8 Author preset-specific README.md cho mỗi preset
    - Mục đích, danh sách artifact, recommended usage, ví dụ
    - Liệt kê MCP servers, hooks, special skills của preset đó
    - _Requirements: 21.7_


## 6. Testing

- [x] 6. Triển khai test suite đầy đủ

  - [x] 6.1 Write unit tests cho manifest parser
    - Test cases: valid manifest, invalid JSON, missing required field, wrong type, file completeness fail, orphan file detect
    - _Requirements: 10.5, 10.6, 22.2_

  - [x] 6.2 Write unit tests cho preset loader
    - Test cases: load single, load all, missing preset, invalid manifest, catalog building
    - _Requirements: 22.2_

  - [x] 6.3 Write unit tests cho front-matter parser
    - Test cases: valid YAML, malformed YAML, missing required field per type, round-trip
    - _Requirements: 22.2, 30.7_

  - [x] 6.4 Write unit tests cho file conflict resolver
    - Test cases mỗi nhánh: file missing -> WRITE_NEW, byte-equal -> NO_OP, force -> OVERWRITE_WITH_BACKUP, skip-existing -> SKIP, overwriteAll session, interactive overwrite/skip/diff/overwrite-all
    - _Requirements: 9.1, 9.3, 9.5, 9.6, 9.7, 9.8, 22.2_

  - [x] 6.5 Write unit tests cho backup manager
    - Test cases: backup tạo file đúng path, restore round-trip byte-equal, list timestamps sortable, missing backup error
    - _Requirements: 8.1, 8.2, 8.3, 22.2_

  - [x] 6.6 Write unit tests cho MCP merger
    - Test cases: user-priority (existing wins), no deletion, cross-preset conflict warning, không xoá user custom field
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 22.2_

  - [x] 6.7 Write unit tests cho settings merger
    - Test cases: array dedupe theo command, non-array last-write-wins với warning, bảo toàn user-only field
    - _Requirements: 12.5, 12.6, 12.7, 22.2_

  - [x] 6.8 Write unit tests cho tracking store
    - Test cases: write/read round-trip, corrupt detection (KK040), partial state, version bump
    - _Requirements: 22.2, 42.5_

  - [x] 6.9 Write unit tests cho statusline installer
    - Test cases: 3 scripts được produce, executable bit set trên Unix (mocked), command resolved đúng theo platform
    - _Requirements: 22.2, 36.1, 36.5_

  - [x] 6.10 Write unit tests cho line-ending writer
    - Test cases: LF cho `.json`/`.yaml`, OS-default cho `.md`/`.sh`/`.ps1`, atomic rename
    - _Requirements: 19.3, 22.2_

  - [x] 6.11 Write e2e test cho `init` command
    - Setup tmpdir, simulate multi-preset selection, verify file output đầy đủ
    - Verify tracking file, metadata.json, settings.json
    - _Requirements: 22.3, 22.7_

  - [x] 6.12 Write e2e test cho `add` command
    - Existing `.kiro/` setup, add preset thứ hai, simulate conflict resolution (overwrite/skip)
    - Verify tracking được merge đúng
    - _Requirements: 22.3, 22.7_

  - [x] 6.13 Write e2e test cho `update` command
    - Setup workspace với preset version cũ, run update với version mới, verify file changes
    - _Requirements: 22.3_

  - [x] 6.14 Write e2e test cho `restore` command
    - Backup -> modify -> restore -> verify byte-equal với original
    - _Requirements: 8.6, 22.3_

  - [x] 6.15 Write e2e test cho `doctor` command
    - Pass scenario (clean workspace), fail scenarios (corrupt JSON, missing tracked file, no exec bit), `--fix` verification
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 22.3_

  - [x] 6.16 Write structural tests cho min thresholds mỗi preset
    - For all 6 preset: assert >=12 agents, >=20 skills, >=25 commands, >=6 hooks, >=4 workflows, statusline triple, metadata, settings, env examples đầy đủ
    - _Requirements: 22.8, 24.3_

  - [x] 6.17 Write structural tests cho skill discoverability
    - Mỗi skill folder có `SKILL.md`/`skill.md` HOẶC là sub-skill container có >=1 sub-folder hợp lệ
    - _Requirements: 22.9, 33.5_

  - [x] 6.18 Write structural tests cho agent/command front-matter
    - Mọi agent file có `name`+`description` trong front-matter
    - Mọi command file có `description` trong front-matter
    - Path nesting <= 3 cấp
    - _Requirements: 22.10, 22.11, 32.6_

  - [x] 6.19 Write structural tests cho cross-platform hook completeness
    - Mọi hook H trong preset: `H.js` tồn tại VÀ (`H.sh` HOẶC `H.ps1` tồn tại)
    - _Requirements: 22.12, 35.1, 35.2_

  - [x] 6.20 Write property-based tests dùng fast-check
    - **Property 1: Backup-restore round-trip identity** _Requirements: 8.6, 29.3_
    - **Property 3: Merge commutativity** _Requirements: 14.4, 15.2, 29.1_
    - **Property 4: Merge associativity (non-conflicting)** _Requirements: 15.1, 29.2_
    - **Property 5: Idempotency với --skip-existing** _Requirements: 14.1, 14.2, 14.3, 29.4_
    - **Property 6: Order-equivalence init(A,B) tương đương init(A)+add(B)** _Requirements: 14.4, 29.5_
    - **Property 7: Manifest completeness no-orphan** _Requirements: 10.7, 10.8, 29.6, 29.7_
    - **Property 8: Preset isolation** _Requirements: 29.8, 43.5_

  - [x] 6.21 Write CI lint script cho emoji + PII detection
    - Script Node scan unicode emoji range trong `.md`/`.json`/`.js`/`.ts`
    - Script regex email/phone PII trong template/example file
    - Wire vào CI workflow như step lint riêng
    - **Validates: Requirements 1.6, 21.3, 23.7, 44.1, 44.2, 44.4, 44.5**

- [x] 6.22 Checkpoint - Đảm bảo tất cả tests pass
  - Chạy `pnpm test` ở root và verify mọi test pass trên ít nhất 1 platform local
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 22.4, 22.5_


## 7. Documentation

- [x] 7. Viết tài liệu dự án

  - [x] 7.1 Viết README.md chính
    - Badges shields.io SVG: build status, npm version, license, downloads, node version (KHÔNG emoji)
    - Sections theo thứ tự: badges -> project description -> Quick Start (`npx kiro-kit init` above-the-fold) -> Presets table -> Commands reference -> Architecture overview -> Privacy section -> Contributing link -> License
    - Bảng 6 preset kèm mô tả 1 câu mỗi preset
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 17.5, 21.2, 21.3_

  - [x] 7.2 Hoàn thiện CONTRIBUTING.md
    - Local setup (clone, pnpm install, build presets)
    - Cách chạy test (unit, e2e, structural)
    - Quy trình PR (branch naming, commit conventions, review)
    - Conventional commit format
    - _Requirements: 21.5_

  - [x] 7.3 Hoàn thiện SECURITY.md
    - Cách báo lỗ hổng: private email hoặc GitHub Security Advisory
    - SLA phản hồi
    - Disclosure policy
    - _Requirements: 21.6_

  - [x] 7.4 Hoàn thiện CODE_OF_CONDUCT.md
    - Contributor Covenant 2.1 chuẩn
    - Contact để báo cáo
    - _Requirements: 21.1_

  - [x] 7.5 Hoàn thiện CHANGELOG.md
    - Keep a Changelog format
    - Mục `Unreleased`, semver tags, sections Added/Changed/Deprecated/Removed/Fixed/Security
    - _Requirements: 20.5_

  - [x] 7.6 Viết `docs/architecture.md`
    - CLI architecture, module breakdown
    - Sơ đồ component (sao chép/refer design.md)
    - Atomic write strategy, cross-platform considerations
    - _Requirements: 21.2_

  - [x] 7.7 Viết `docs/how-it-works.md`
    - Preset model, self-contained policy
    - Merge semantics (MCP, hooks, settings)
    - Lifecycle: init -> add -> update -> restore
    - Conflict resolution UX
    - _Requirements: 21.2_

  - [x] 7.8 Viết `docs/creating-presets.md`
    - Manifest schema chi tiết
    - File conventions cho mỗi artifact type
    - Contribution guide cho preset mới
    - Validation checklist
    - _Requirements: 10.1, 21.5_

  - [x] 7.9 Viết `docs/faq.md`
    - Câu hỏi thường gặp về install, conflict resolution, telemetry, updates

  - [x] 7.10 Hoàn thiện LICENSE
    - MIT License chuẩn với năm và tên người giữ bản quyền hợp lệ (placeholder `[year]` `[author]` thay bằng giá trị thực khi release)
    - _Requirements: 21.4_

## 8. Release Prep

- [x] 8. Chuẩn bị release npm package

  - [x] 8.1 Configure npm package metadata
    - `package.json` của `packages/cli/`: `description`, `keywords`, `repository.url`, `homepage`, `bugs.url`, `author`, `license: MIT`
    - `files` allowlist: `dist/**`, `README.md`, `LICENSE`, `CHANGELOG.md`
    - Verify `bin: { kiro-kit: ./dist/index.js }`
    - _Requirements: 2.1, 2.2_

  - [x] 8.2 Verify CI pass trên toàn bộ matrix
    - 3 OS x 3 Node versions (18, 20, 22)
    - All steps pass: lint, typecheck, test, build, structural test
    - _Requirements: 22.4, 22.5, 26.5_

  - [x] 8.3 Run `npm pack` và verify package contents
    - Tarball chứa `dist/` đầy đủ với 6 preset bundle
    - Tarball không chứa `.env*`, `node_modules`, source `.ts`
    - Size hợp lý (< 5MB target)
    - _Requirements: 18.2, 23.5_

  - [x] 8.4 Test publish dry-run lên npm
    - Chạy `npm publish --dry-run` từ `packages/cli/`
    - Verify file list output match expected
    - Verify provenance metadata
    - _Requirements: 26.4_

  - [x] 8.5 Viết `docs/release-process.md`
    - Quy trình release: bump version -> CHANGELOG -> tag -> push -> CI publish
    - Checklist pre-release, post-release verification
    - Rollback procedure

- [x] 8.6 Final checkpoint - Verify production readiness
  - Run `kiro-kit doctor` trên test workspace mới sau init
  - Verify mọi command hoạt động: init, add, list, info, update, restore, doctor, telemetry
  - Verify tài liệu đầy đủ, không có emoji, không có PII
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 16.1, 21.3, 22.4, 23.7, 44.1, 44.2_

## Notes

- Tasks đánh dấu `*` là OPTIONAL và có thể bỏ qua cho MVP nhanh hơn (bao gồm 2.5.1, 2.7.1, 6.20, 6.21, 7.9, 8.5).
- Mỗi task tham chiếu requirements cụ thể (granular sub-requirements).
- Checkpoints tại 6.22 và 8.6 đảm bảo incremental validation.
- Property-based tests (6.20) validate universal correctness properties.
- Unit tests (6.1-6.10) validate specific examples và edge cases.
- E2E tests (6.11-6.15) validate end-to-end command flows.
- Structural tests (6.16-6.19) validate preset shape invariants.
- Tasks được order sao cho prerequisites đến trước (bootstrap -> core -> commands -> presets -> tests -> docs -> release).
- Mọi task code đều thuộc loại "writing/modifying/testing code" - không có user acceptance testing, deployment, hay performance gathering.
