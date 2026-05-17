# Tài Liệu Yêu Cầu (Requirements Document)

## Giới thiệu

**ClaudeKit Parity Sync** là một feature bổ sung (additive) cho dự án KK-Kiro-Kit nhằm rà soát và lấp các khoảng trống nội dung (content delta) giữa bộ kit tham chiếu **ClaudeKit** (`claudekit-engineer-main/.claude/`) và **6 preset self-contained** hiện có của KiroKit (`presets/{frontend,backend,fullstack,mobile,devops,data-ai}`).

Mục tiêu của feature này là copy + adapt mọi artifact có trong ClaudeKit nhưng còn thiếu hoặc chưa đầy đủ trong KiroKit, đồng thời tôn trọng:
- Chính sách self-contained (không có shared core, mỗi preset là một bản sao đầy đủ).
- Tailoring theo category (frontend/backend/fullstack/mobile/devops/data-ai).
- Manifest đầy đủ (`manifest.json`) cho mọi file mới.
- Cấu trúc cross-platform tri-script (`.js` bắt buộc, `.sh` hoặc `.ps1` bắt buộc).
- Không emoji và không PII.
- Không thay đổi CLI surface (đây là content-only delta trong `presets/`).

**Phạm vi bao phủ (Coverage Scope):** Source inventory đã được audit liệt kê **133 artifacts** ClaudeKit (`agent=16, command=53, docs_template=12, env_example=3, hook=7, mcp_template=1, metadata=1, settings=1, skill=32, statusline=3, workflow=4`); target inventory KiroKit hiện có **754 file** trải đều trên 7 thư mục preset (`_template=74, backend=107, frontend=110, fullstack=111, mobile=117, devops=115, data-ai=120`). Khoảng cách lớn nhất nằm ở danh mục **command** (KiroKit baseline ~25-28 command per preset vs ClaudeKit 53 command) và **skill** (KiroKit ~20 skill per preset vs ClaudeKit 32 skill, đa phần thiếu `references/` và `scripts/`).

**Source of Truth:** `docs/audits/claudekit-vs-kirokit/appendix/` (đặc biệt là `inventory-source.json`, `inventory-target.json`, `source-files.txt`, và `target-files-<preset>.txt`). Mọi delta liệt kê trong tài liệu này phải có đường dẫn tham chiếu cụ thể vào audit appendix.

**Phạm vi không bao gồm (Non-goals):**
- Không thay đổi/refactor CLI (`packages/cli/`).
- Không tạo shared core; mọi artifact mới phải copy vào từng preset (toàn bộ 6 hoặc tập con phù hợp category).
- Không port nội dung mang tính branding ClaudeKit gốc nguyên văn; mọi tham chiếu "Claude Code" / "ClaudeKit" trong nội dung copy phải được rebrand sang "Kiro" / "KiroKit" trong quá trình adapt.
- Không thay đổi spec hiện có `.kiro/specs/kk-kiro-kit/`; spec này là spec mới, độc lập, additive.

## Glossary

- **ClaudeKit / Source Kit**: Bộ kit tham chiếu tại `claudekit-engineer-main/.claude/`, dạng flat single-flavor.
- **KiroKit / Target Kit**: Bộ kit hiện tại tại `presets/`, gồm 6 preset self-contained + 1 `_template`.
- **Preset**: Một trong 6 thư mục `presets/{frontend,backend,fullstack,mobile,devops,data-ai}`. `presets/_template` là skeleton sinh-ra-preset, không phải preset người dùng cài trực tiếp.
- **Audit Appendix**: Thư mục `docs/audits/claudekit-vs-kirokit/appendix/` chứa 7 inventory file và `run.log`; được coi là ground truth cho mọi delta count.
- **Source Inventory Item**: Một entry trong `inventory-source.json` (133 entry tổng cộng).
- **Target Inventory Item**: Một entry trong `inventory-target.json`.
- **Parity Gap**: Một artifact tồn tại trong source inventory nhưng không tồn tại (hoặc tồn tại không đầy đủ về cấu trúc subdirectory) trong target inventory của một preset cụ thể.
- **Per-preset Tailoring**: Quá trình điều chỉnh nội dung khi copy từ source sang một preset cụ thể, ví dụ thay "React" bằng "Flutter" trong preset mobile.
- **Tri-script**: Bộ ba file `<name>.js` + `<name>.sh` + `<name>.ps1` cho cùng một logic.
- **Manifest**: File `presets/<preset>/manifest.json` liệt kê mọi artifact preset cung cấp với fields `source`, `target`, `type`.
- **Self-contained Policy**: Mỗi preset chứa bản sao đầy đủ của mọi artifact cần thiết, không phụ thuộc vào shared core hay preset khác.
- **Sub-skill Container**: Skill folder không có `SKILL.md` riêng mà chứa nhiều sub-skill (ví dụ `document-skills/docx/`, `document-skills/pdf/`, `document-skills/pptx/`, `document-skills/xlsx/`).
- **Progressive Disclosure**: SKILL.md ngắn gọn, nội dung chi tiết nằm trong `references/` chỉ load khi cần.
- **Rebrand Rule**: Quy tắc thay thế chuỗi `Claude Code` -> `Kiro`, `ClaudeKit` -> `KiroKit`, `.claude/` -> `.kiro/`, `claude-code` skill name -> `kiro` skill name (hoặc giữ `claude-code` làm tham chiếu read-only nếu nội dung là docs về Claude Code product).
- **Structural Test**: Test trong `packages/cli/tests/structural/` xác minh từng preset thoả mãn min thresholds về số agent/skill/command/hook/workflow.
- **Min Threshold**: Số tối thiểu của một loại artifact mà mỗi preset phải có để pass structural test.
- **Audit Run Log**: `docs/audits/claudekit-vs-kirokit/appendix/run.log` cung cấp count chính thức.

## Yêu cầu (Requirements)

### Requirement 1: Audit Delta Report là Đầu Vào Bắt Buộc

**User Story:** Là maintainer KiroKit, tôi muốn mọi quyết định port artifact đều dựa trên audit delta report cụ thể, để tránh copy nhầm hoặc bỏ sót.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL đọc `docs/audits/claudekit-vs-kirokit/appendix/inventory-source.json` và bảy file `target-files-*.txt` (`_template`, `backend`, `frontend`, `fullstack`, `mobile`, `devops`, `data-ai`) trước khi sinh ra danh sách file cần port.
2. THE Parity_Sync_Process SHALL sinh ra một file `docs/audits/claudekit-vs-kirokit/delta-report.md` liệt kê, cho mỗi cặp `(source_artifact, preset)`, một trong các trạng thái: `present`, `missing`, `partial`, `category-skip`.
3. WHEN một artifact ClaudeKit thuộc category trùng với một preset (ví dụ skill `frontend-development` đối với preset `frontend`), THE Parity_Sync_Process SHALL gán trạng thái `missing` hoặc `partial` thay vì `category-skip` nếu artifact đó vắng mặt hoặc không đủ subdirectory.
4. IF audit appendix file không tồn tại hoặc rỗng, THEN THE Parity_Sync_Process SHALL dừng và in thông báo lỗi yêu cầu chạy lại audit script `_build-inventory-source.cjs` và `_build-inventory-target.cjs` trước.
5. THE Delta_Report SHALL chứa một bảng tổng kết hàng đầu liệt kê số `missing` và `partial` cho mỗi preset, khớp với tổng count trong `run.log`.
6. THE Delta_Report SHALL không chứa emoji.

### Requirement 2: Bảo toàn Self-contained Policy

**User Story:** Là người dùng cuối, tôi muốn cài một preset duy nhất là đủ tạo workspace hoàn chỉnh, không phụ thuộc shared core.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL không tạo bất kỳ thư mục `presets/_shared/` hoặc `presets/_core/` nào để chia sẻ artifact giữa các preset.
2. WHEN một artifact được port, THE Parity_Sync_Process SHALL copy file vào trong từng preset đích, không sử dụng symlink hoặc reference cross-preset.
3. THE Parity_Sync_Process SHALL không sửa CLI source code tại `packages/cli/src/` nhằm thêm logic shared-core resolution.
4. FOR ALL preset P trong {frontend, backend, fullstack, mobile, devops, data-ai}, mỗi artifact trong `presets/P/manifest.json` SHALL trỏ tới một file vật lý nằm trong `presets/P/`.
5. THE _template_Preset (`presets/_template/`) SHALL chứa skeleton tương đương 6 preset chính nhưng KHÔNG được phân phối tới end-user qua CLI; nó là nguồn để regenerate preset mới.

### Requirement 3: Port Đủ 16 Agents Sang Mọi Preset

**User Story:** Là Kiro user, tôi muốn mỗi preset cung cấp đầy đủ bộ agent core của ClaudeKit, để tôi không phải tự copy thủ công.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL port cả 16 agent từ `claudekit-engineer-main/.claude/agents/` sang `presets/<preset>/agents/` cho cả 6 preset chính: `brainstormer`, `code-reviewer`, `copywriter`, `database-admin`, `debugger`, `docs-manager`, `git-manager`, `journal-writer`, `mcp-manager`, `planner`, `project-manager`, `researcher`, `scout-external`, `scout`, `tester`, `ui-ux-designer`.
2. WHEN một agent đã tồn tại trong preset đích, THE Parity_Sync_Process SHALL diff nội dung; nếu khác biệt do drift, áp dụng quy tắc tại Requirement 12 (Conflict Resolution).
3. THE Parity_Sync_Process SHALL giữ lại các agent KiroKit-specific (ví dụ `api-developer`, `database-architect`, `devops-engineer`, `security-auditor`, `mobile-developer`, `frontend-developer`, v.v.) đã có sẵn trong preset, không xóa.
4. WHEN agent được port có nội dung tham chiếu `Claude Code` hoặc `.claude/`, THE Parity_Sync_Process SHALL áp dụng Rebrand Rule (Requirement 11).
5. WHEN agent có YAML front-matter `name`, THE Parity_Sync_Process SHALL giữ nguyên giá trị `name`; nếu YAML có field `inclusion: manual`, giữ nguyên field này.
6. THE Min_Agent_Threshold SHALL được nâng từ 12 lên 16 trong tất cả structural test tại `packages/cli/tests/structural/`.
7. WHILE quá trình port đang chạy, IF một agent file trong source không có YAML front-matter hợp lệ, THEN THE Parity_Sync_Process SHALL ghi warning vào `delta-report.md` và bỏ qua agent đó.

### Requirement 4: Port Đủ 32 Skills Với Cấu Trúc Đầy Đủ

**User Story:** Là Kiro user, tôi muốn mỗi preset cung cấp đầy đủ skill (kèm `references/` và `scripts/`) ngang ClaudeKit, để các agent có đủ progressive disclosure context.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL port toàn bộ 32 skill từ `claudekit-engineer-main/.claude/skills/` sang `presets/<preset>/skills/` cho cả 6 preset chính, áp dụng quy tắc category tailoring tại Requirement 5.
2. WHEN một skill có thư mục `references/` trong source, THE Parity_Sync_Process SHALL copy đầy đủ file markdown trong `references/` sang preset đích, không chỉ copy `SKILL.md`.
3. WHEN một skill có thư mục `scripts/` trong source, THE Parity_Sync_Process SHALL copy đầy đủ file script (`.py`, `.js`, `.sh`) sang preset đích cùng với `requirements.txt` hoặc `package.json` đi kèm.
4. THE Parity_Sync_Process SHALL xử lý đúng các Sub-skill Container (`document-skills/docx/`, `document-skills/pdf/`, `document-skills/pptx/`, `document-skills/xlsx/`) bằng cách copy mỗi sub-skill như một skill độc lập có `SKILL.md` riêng.
5. WHERE preset là `frontend` hoặc `fullstack`, THE Parity_Sync_Process SHALL ưu tiên port skill: `frontend-development`, `frontend-design`, `ui-styling`, `threejs`, `web-frameworks`, `aesthetic`, `chrome-devtools`.
6. WHERE preset là `backend` hoặc `fullstack`, THE Parity_Sync_Process SHALL ưu tiên port skill: `backend-development`, `better-auth`, `databases`, `payment-integration`, `shopify`.
7. WHERE preset là `mobile`, THE Parity_Sync_Process SHALL ưu tiên port skill: `mobile-development`, `frontend-design`, `aesthetic`, `ui-styling`.
8. WHERE preset là `devops`, THE Parity_Sync_Process SHALL ưu tiên port skill: `devops`, `databases`, `chrome-devtools`, `repomix`.
9. WHERE preset là `data-ai`, THE Parity_Sync_Process SHALL ưu tiên port skill: `ai-multimodal`, `google-adk-python`, `databases`, `media-processing`, `document-skills`.
10. THE Generic_Skills SHALL được port vào tất cả 6 preset, gồm: `claude-code` (rebrand thành `kiro` hoặc giữ làm tham chiếu read-only theo Requirement 11), `code-review`, `common`, `debugging`, `docs-seeker`, `mcp-builder`, `mcp-management`, `planning`, `problem-solving`, `repomix`, `research`, `sequential-thinking`, `skill-creator`, `template-skill`.
11. THE Min_Skill_Threshold SHALL được nâng từ 20 lên 28 cho mỗi preset (cho phép một số skill category-specific bị skip ở preset không liên quan).
12. IF một skill được skip ở một preset do không phù hợp category, THEN THE Manifest_Entry tương ứng SHALL không xuất hiện trong `manifest.json` của preset đó, và `delta-report.md` SHALL ghi trạng thái `category-skip` kèm lý do.
13. WHEN skill `document-skills/docx/`, `document-skills/pptx/` chứa thư mục `ooxml/schemas/` với file `.xsd` lớn, THE Parity_Sync_Process SHALL copy nguyên xi không tinh chỉnh nội dung.

### Requirement 5: Per-preset Tailoring cho Skill và Command

**User Story:** Là Kiro user của preset mobile, tôi không muốn thấy skill `shopify` hay command `integrate/sepay` vì chúng không liên quan, để workspace gọn gàng.

#### Acceptance Criteria

1. THE Category_Mapping_Table SHALL được định nghĩa cụ thể trong design document (giai đoạn tiếp theo) liệt kê mỗi skill/command thuộc category nào.
2. WHEN một skill thuộc category `frontend-only` (ví dụ `threejs`, `ui-styling`), THE Parity_Sync_Process SHALL không port skill đó vào preset `backend`, `devops`, hoặc `data-ai`.
3. WHEN một skill thuộc category `backend-only` (ví dụ `payment-integration`, `shopify`, `better-auth`), THE Parity_Sync_Process SHALL không port skill đó vào preset `frontend`, `mobile`, hoặc `devops`.
4. WHEN một command có liên kết payment (`integrate/polar`, `integrate/sepay`), THE Parity_Sync_Process SHALL chỉ port vào preset `backend`, `fullstack`.
5. WHEN một command có liên kết content marketing (`content/cro`, `content/enhance`, `content/fast`, `content/good`), THE Parity_Sync_Process SHALL port vào tất cả 6 preset (vì copywriter agent có ở mọi preset).
6. WHEN một command có liên kết design tool (`design/3d`, `design/screenshot`, `design/video`), THE Parity_Sync_Process SHALL port vào preset `frontend`, `fullstack`, `mobile`.
7. THE Generic_Commands SHALL được port vào tất cả 6 preset, gồm: `ask`, `brainstorm`, `code`, `cook`, `cook/auto`, `cook/auto/fast`, `debug`, `journal`, `use-mcp`, `watzup`, `fix/*`, `plan/*`, `git/*`, `review/codebase`, `skill/*`, `bootstrap`, `bootstrap/auto`, `bootstrap/auto/fast`, `test`, `scout`, `scout/ext`, `docs/*`.
8. IF một artifact rơi vào trạng thái mơ hồ (ví dụ skill `web-frameworks` cho preset `mobile`), THEN THE Design_Document SHALL quyết định rõ ràng và document trong Category_Mapping_Table.

### Requirement 6: Port Đủ Command Catalog (Tối thiểu 40 command/preset)

**User Story:** Là Kiro user, tôi muốn có đủ slash command tương đương ClaudeKit để tăng năng suất.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL port các command sau từ `claudekit-engineer-main/.claude/commands/` vào tất cả 6 preset: `ask.md`, `brainstorm.md`, `code.md`, `cook.md`, `cook/auto.md`, `cook/auto/fast.md`, `debug.md`, `journal.md`, `use-mcp.md`, `watzup.md`, `bootstrap/auto.md`, `bootstrap/auto/fast.md`, `review/codebase.md`, `skill/create.md`, `skill/fix-logs.md`, `git/cm.md`, `git/cp.md`, `git/pr.md`.
2. THE Parity_Sync_Process SHALL port nhóm `fix/*` (`fix/ci.md`, `fix/fast.md`, `fix/hard.md`, `fix/logs.md`, `fix/test.md`, `fix/types.md`, `fix/ui.md`) vào tất cả 6 preset, hợp nhất với các command `fix/*` đã có (KiroKit baseline có `fix/build.md`, `fix/lint.md`, `fix/tests.md`).
3. THE Parity_Sync_Process SHALL port nhóm `plan/*` (`plan/ci.md`, `plan/cro.md`, `plan/fast.md`, `plan/hard.md`, `plan/two.md`) vào tất cả 6 preset, hợp nhất với `plan/feature.md`, `plan/refactor.md` đã có.
4. THE Parity_Sync_Process SHALL port nhóm `content/*` và `design/*` theo Requirement 5.5 và 5.6.
5. WHEN một command có YAML front-matter với field `argument-hint`, THE Parity_Sync_Process SHALL giữ nguyên field này.
6. WHEN một command tham chiếu agent qua tên (ví dụ `Use planner agent`), THE Parity_Sync_Process SHALL không thay đổi tên agent vì các agent này đã được port theo Requirement 3.
7. THE Min_Command_Threshold SHALL được nâng từ 25 lên 40 trong structural test cho mỗi preset.
8. IF một command source có nội dung tham chiếu tool/skill không tồn tại trong KiroKit (ví dụ `Use mcp__sepay__*`), THEN THE Parity_Sync_Process SHALL giữ nguyên tham chiếu nhưng thêm comment `<!-- KiroKit: requires X MCP server -->` ở đầu file.
9. WHEN một command source nằm ở root (ví dụ `commands/scout.md`) trùng tên với command đã có ở preset đích, THE Parity_Sync_Process SHALL áp dụng Conflict Resolution (Requirement 12) và mặc định giữ phiên bản KiroKit nếu phiên bản đó dài hơn 50% nội dung source.

### Requirement 7: Port Đủ Hooks Đa Nền Tảng

**User Story:** Là Kiro user trên Windows, macOS, hay Linux, tôi muốn mọi hook đều có biến thể chạy được trên hệ điều hành của tôi.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL đảm bảo mỗi preset có đủ các hook sau: `discord-notify` (tri-script), `telegram-notify` (tri-script), `modularization-hook.js`, `scout-block` (tri-script), `pre-commit-lint.js`, `git-status-tracker.js`, `README.md`, `.env.example`.
2. WHEN ClaudeKit có hook `send-discord.sh` (single-platform), THE Parity_Sync_Process SHALL extend thành tri-script `send-discord.{js,sh,ps1}` trước khi port; nếu logic đã được hợp nhất trong `discord-notify.{js,sh,ps1}` của KiroKit, KHÔNG port `send-discord.*`.
3. THE Parity_Sync_Process SHALL port hai file docs `discord-hook-setup.md` và `telegram-hook-setup.md` vào `presets/<preset>/hooks/` cho cả 6 preset.
4. FOR ALL hook script tri-script, mỗi nhóm SHALL có tối thiểu file `.js`; thêm tối thiểu một trong `.sh` hoặc `.ps1` (cả hai được khuyến nghị).
5. WHEN một hook script được port từ source `.sh` only (ví dụ `discord_notify.sh`, `telegram_notify.sh`), THE Parity_Sync_Process SHALL tạo bản `.js` tương đương hoặc xác minh KiroKit đã có bản `.js` thay thế tương đương; nếu không có cả hai, ghi vào `delta-report.md` trạng thái `partial`.
6. THE Min_Hook_Threshold SHALL giữ nguyên ở 6 (KiroKit baseline) hoặc nâng lên 8 nếu thêm `discord-hook-setup.md` và `telegram-hook-setup.md` được tính.
7. THE Hook_Env_Example SHALL hợp nhất nội dung từ `claudekit-engineer-main/.claude/hooks/.env.example` vào `presets/<preset>/hooks/.env.example` mà không xoá biến đã có; trùng key thì giữ giá trị KiroKit.

### Requirement 8: Port Workflows Và Files Cấp Cao

**User Story:** Là Kiro user, tôi muốn mọi workflow always-on (development-rules, primary-workflow, v.v.) đều phản ánh quy tắc ClaudeKit mới nhất.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL diff bốn workflow file giữa source và mỗi preset: `development-rules.md`, `documentation-management.md`, `orchestration-protocol.md`, `primary-workflow.md`.
2. WHEN nội dung workflow source đã được cập nhật so với target, THE Parity_Sync_Process SHALL hợp nhất các section mới vào target và áp dụng Rebrand Rule (Requirement 11).
3. THE Min_Workflow_Threshold SHALL giữ nguyên ở 4.
4. THE Parity_Sync_Process SHALL port `claudekit-engineer-main/.claude/metadata.json` schema-relevant fields vào `presets/<preset>/metadata.json` (giữ `kit_version` và `preset_version` của KiroKit, chỉ thêm field mới nếu source có).
5. THE Parity_Sync_Process SHALL diff `claudekit-engineer-main/.claude/settings.json` với `presets/<preset>/settings.json`; nếu source có hook entry hoặc statusLine command mà target thiếu, hợp nhất với policy "không xoá entry KiroKit-specific".
6. THE Parity_Sync_Process SHALL diff `.mcp.json.example` source vs target; thêm MCP server entry mới (nếu có) vào template, không xoá entry hiện có.

### Requirement 9: Port Statusline Tri-script

**User Story:** Là Kiro user, tôi muốn statusline hoạt động đa nền tảng giống ClaudeKit.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL đảm bảo mỗi preset có đủ ba file `statusline.js`, `statusline.sh`, `statusline.ps1` ở root preset.
2. WHEN nội dung statusline ClaudeKit khác KiroKit, THE Parity_Sync_Process SHALL diff và áp dụng Conflict Resolution (Requirement 12); ưu tiên giữ logic KiroKit nếu phong phú hơn.
3. THE Settings_Json SHALL có field `statusLine.command` trỏ tới đúng `statusline.{js|sh|ps1}` tuỳ platform default của Kiro.

### Requirement 10: Port Files Cấp Repository (Root-level)

**User Story:** Là maintainer KiroKit, tôi muốn các file chuẩn hoá quy trình release/git của ClaudeKit cũng có ở repository root để giữ tooling parity.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL evaluate copy các file root sau từ `claudekit-engineer-main/` vào root KiroKit nếu chưa tồn tại: `.commitlintrc.json`, `.releaserc.json`, `.repomixignore`, `CLAUDE.md` (rename thành `KIRO.md`), `GEMINI.md`.
2. THE Parity_Sync_Process SHALL evaluate copy thư mục `claudekit-engineer-main/guide/` vào `docs/guide/` nếu source có nội dung và target chưa có.
3. THE Parity_Sync_Process SHALL evaluate copy `claudekit-engineer-main/scripts/test-scout-block.sh` và `test-scout-block.ps1` vào `scripts/` của KiroKit, kèm bản `.js` tương đương để tuân thủ tri-script.
4. WHEN các root file đã tồn tại trong KiroKit, THE Parity_Sync_Process SHALL diff và áp dụng Conflict Resolution.
5. IF việc port root file gây xung đột với CI hiện tại của KiroKit, THEN THE Parity_Sync_Process SHALL skip file đó và ghi `delta-report.md` trạng thái `blocked-by-ci` kèm lý do cụ thể.
6. THE Root_File_Port SHALL không vi phạm chính sách self-contained (vì root file thuộc repository, không thuộc preset content).

### Requirement 11: Rebrand Rule Khi Port Nội Dung

**User Story:** Là Kiro user, tôi không muốn thấy "Claude Code" trong agent prompt, vì tôi đang dùng Kiro.

#### Acceptance Criteria

1. THE Rebrand_Rule SHALL áp dụng các thay thế sau khi port nội dung từ source sang target:
   - Chuỗi `Claude Code` -> `Kiro` (trừ khi tham chiếu read-only đến Claude Code product trong skill `claude-code`).
   - Chuỗi `ClaudeKit` -> `KiroKit`.
   - Đường dẫn `.claude/` -> `.kiro/`.
   - Tên skill `claude-code` -> giữ nguyên (vì đây là tên skill ghi lại docs về Claude Code product).
2. WHEN một file source có front-matter `name: claude-code`, THE Parity_Sync_Process SHALL giữ nguyên tên skill `claude-code` và không rebrand thành `kiro`.
3. THE Rebrand_Rule SHALL không thay đổi tên file (basename) trừ trường hợp `CLAUDE.md` -> `KIRO.md` ở root.
4. THE Rebrand_Rule SHALL không thay đổi URL trỏ tới docs Anthropic chính thức (ví dụ `https://docs.claude.com/`).
5. WHEN nội dung port chứa tham chiếu tới `npx claude-code` hoặc lệnh CLI Claude Code, THE Parity_Sync_Process SHALL thêm comment `<!-- KiroKit: this references Claude Code CLI; replace with kiro-kit equivalent if applicable -->` ở đầu section thay vì xoá.
6. THE Rebrand_Rule SHALL không tạo PII hoặc emoji mới trong quá trình thay thế.

### Requirement 12: Conflict Resolution Khi File Đã Tồn Tại

**User Story:** Là maintainer, tôi muốn quy trình port có rule rõ ràng khi file đích đã tồn tại để tránh ghi đè bừa bãi.

#### Acceptance Criteria

1. WHEN file source và file target có cùng path tương đối nhưng khác nội dung, THE Conflict_Resolution SHALL áp dụng theo thứ tự ưu tiên:
   - Ưu tiên 1: Nếu target dài hơn 1.5 lần source (line count), giữ target và ghi `delta-report.md` trạng thái `kept-target`.
   - Ưu tiên 2: Nếu source có YAML front-matter mới mà target thiếu, merge front-matter và giữ body target.
   - Ưu tiên 3: Nếu cả hai gần tương đương (chênh lệch <20% dòng), tạo file `<basename>.source.md` cạnh target để maintainer review thủ công.
   - Ưu tiên 4: Mặc định giữ target và ghi `kept-target`.
2. THE Conflict_Resolution SHALL không tự động xoá file target hiện có.
3. WHEN một file `<basename>.source.md` được tạo theo Ưu tiên 3, THE Parity_Sync_Process SHALL liệt kê file đó trong `delta-report.md` mục "Manual Review Needed".
4. IF maintainer đã review và xoá file `<basename>.source.md`, THEN THE Parity_Sync_Process SHALL coi conflict đã được giải quyết ở lần chạy tiếp theo.
5. THE Conflict_Resolution SHALL ghi log mọi quyết định vào `docs/audits/claudekit-vs-kirokit/conflict-log.md`.

### Requirement 13: Cập Nhật Manifest Mỗi Preset

**User Story:** Là CLI engineer, tôi muốn `manifest.json` luôn liệt kê đầy đủ artifact để CLI sinh đúng `.kiro/`.

#### Acceptance Criteria

1. WHEN một artifact mới được port vào preset, THE Manifest_Update SHALL thêm entry vào `presets/<preset>/manifest.json` với fields `source` (đường dẫn trong preset), `target` (đường dẫn workspace người dùng), `type` (agent|skill|command|hook|workflow|steering|statusline|settings|metadata|docs|env-example|spec-template).
2. THE Manifest_Json SHALL không chứa entry trỏ tới file không tồn tại trong preset.
3. THE Manifest_Json SHALL không chứa file vật lý nào trong preset mà không có entry tương ứng (no orphan).
4. WHEN một skill có sub-skill (ví dụ `document-skills/docx`), THE Manifest_Json SHALL có entry riêng cho mỗi sub-skill.
5. THE Manifest_Json SHALL parse được dưới dạng JSON hợp lệ.
6. WHEN port hoàn tất cho một preset, THE Parity_Sync_Process SHALL chạy `node scripts/validate-manifest.js <preset>` (hoặc lệnh tương đương đã tồn tại) và đảm bảo exit code 0.

### Requirement 14: Cập Nhật Structural Tests

**User Story:** Là CI maintainer, tôi muốn structural test phản ánh đúng min thresholds mới sau parity sync để tránh regression.

#### Acceptance Criteria

1. THE Structural_Test_Update SHALL nâng `MIN_AGENTS` từ 12 lên 16 trong `packages/cli/tests/structural/`.
2. THE Structural_Test_Update SHALL nâng `MIN_SKILLS` từ 20 lên 28 (per preset, với category-skip được tính).
3. THE Structural_Test_Update SHALL nâng `MIN_COMMANDS` từ 25 lên 40.
4. THE Structural_Test_Update SHALL giữ `MIN_HOOKS` ở 6 hoặc nâng lên 8 tuỳ Requirement 7.6.
5. THE Structural_Test_Update SHALL giữ `MIN_WORKFLOWS` ở 4.
6. WHEN structural test chạy, THE Test_Suite SHALL pass cho cả 6 preset chính (`frontend`, `backend`, `fullstack`, `mobile`, `devops`, `data-ai`).
7. THE Structural_Test_Update SHALL có một test mới `manifest-no-orphan.test` xác minh Requirement 13.3.
8. THE Structural_Test_Update SHALL có một test mới `manifest-no-broken-link.test` xác minh Requirement 13.2.

### Requirement 15: Idempotency Của Parity Sync

**User Story:** Là engineer chạy script port, tôi muốn chạy đi chạy lại nhiều lần ra cùng kết quả để debug an toàn.

#### Acceptance Criteria

1. WHEN parity sync script chạy lần thứ hai trên cùng workspace ngay sau lần thứ nhất, THE Parity_Sync_Process SHALL không tạo file mới và không sửa file nào (no-op).
2. THE Parity_Sync_Process SHALL không ghi log timestamp khác biệt làm thay đổi nội dung file (timestamp chỉ ghi vào `run.log` và `delta-report.md`, không vào file artifact).
3. WHEN script bị huỷ giữa chừng (Ctrl+C), THE Parity_Sync_Process SHALL tránh tình trạng partial-write bằng cách viết vào file tạm `.tmp` rồi rename atomic.
4. FOR ALL preset P, lần chạy thứ hai SHALL có git diff trống đối với `presets/P/`.

### Requirement 16: Không Emoji, Không PII

**User Story:** Là maintainer, tôi muốn mọi nội dung port tuân thủ chính sách no-emoji và no-PII có sẵn trong KiroKit.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL chạy regex check `/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u` trên mọi file đã port; nếu match, ghi `delta-report.md` trạng thái `emoji-found` và remove các emoji đó.
2. THE Parity_Sync_Process SHALL chạy PII check (email pattern, phone pattern, real-name pattern) trên mọi file đã port.
3. WHEN PII match được tìm thấy, THE Parity_Sync_Process SHALL thay thế bằng placeholder (`[email]`, `[phone_number]`, `[name]`).
4. THE Parity_Sync_Process SHALL không thêm emoji mới trong rebrand hoặc adapt step.

### Requirement 17: Báo Cáo Kết Thúc

**User Story:** Là maintainer, tôi muốn một báo cáo cuối cùng mô tả những gì đã port để review.

#### Acceptance Criteria

1. WHEN parity sync hoàn tất cho tất cả 6 preset, THE Parity_Sync_Process SHALL sinh `docs/audits/claudekit-vs-kirokit/parity-sync-report.md` chứa: tổng số file đã port, số file đã skip (kèm lý do), số conflict đã giải quyết, số manual-review pending.
2. THE Parity_Sync_Report SHALL có bảng so sánh trước-sau cho mỗi preset (count agent/skill/command/hook/workflow).
3. THE Parity_Sync_Report SHALL liệt kê tối đa 20 file đầu tiên trong nhóm "Manual Review Needed".
4. THE Parity_Sync_Report SHALL không chứa emoji.
5. THE Parity_Sync_Report SHALL có timestamp ISO 8601 ở đầu file.

### Requirement 18: Bảo Toàn Backward Compatibility CLI

**User Story:** Là người dùng đã cài `kiro-kit` từ trước, tôi muốn nâng cấp parity-sync content không phá vỡ CLI tôi đang dùng.

#### Acceptance Criteria

1. THE Parity_Sync_Process SHALL không thay đổi public API của CLI (lệnh `init`, `add`, `list`, `info`, `update`, `restore`, `doctor`).
2. THE Parity_Sync_Process SHALL không thay đổi schema `manifest.json` (chỉ thêm entry, không thêm field mới ở root manifest).
3. WHEN CLI đọc preset với manifest đã được mở rộng, THE CLI SHALL xử lý đúng các entry mới mà không cần update phiên bản CLI.
4. IF việc port artifact bắt buộc field manifest mới, THEN THE Design_Document (giai đoạn tiếp theo) SHALL đề xuất bump CLI minor version và document migration path.

### Requirement 19: Correctness Properties (Parity Invariants)

**User Story:** Là QA engineer, tôi muốn các invariant kiểm chứng tự động để đảm bảo parity duy trì sau mọi PR.

#### Acceptance Criteria

1. FOR ALL preset P trong {frontend, backend, fullstack, mobile, devops, data-ai}, THE Invariant_Agent_Coverage SHALL hold: số agent file `.md` trong `presets/P/agents/` SHALL >= 16.
2. FOR ALL preset P, THE Invariant_Manifest_Closure SHALL hold: tập file vật lý trong `presets/P/` (trừ `manifest.json`, `README.md`) SHALL bằng tập file được liệt kê trong `presets/P/manifest.json`.
3. FOR ALL preset P, THE Invariant_No_Emoji SHALL hold: không file `.md` nào trong `presets/P/` chứa emoji.
4. FOR ALL hook script tri-script trong `presets/P/hooks/`, THE Invariant_Tri_Script_Js SHALL hold: nếu tồn tại `<name>.sh` hoặc `<name>.ps1`, thì cũng tồn tại `<name>.js`.
5. THE Invariant_Idempotency SHALL hold: chạy parity sync lần 2 ra git diff trống.
6. THE Invariant_Round_Trip_Manifest SHALL hold: parse rồi stringify lại `manifest.json` SHALL giữ nguyên bộ entry (so sánh sau khi sort theo target path).
7. THE Invariant_Source_Reachability SHALL hold: cho mọi entry `manifest.json` có field `source`, đường dẫn `presets/P/<source>` tồn tại trên đĩa.
8. THE Invariant_Min_Threshold SHALL hold: structural test pass với MIN_AGENTS=16, MIN_SKILLS=28, MIN_COMMANDS=40, MIN_HOOKS>=6, MIN_WORKFLOWS>=4.

### Requirement 20: Phạm Vi Loại Trừ

**User Story:** Là maintainer, tôi muốn rõ ràng về những gì spec này KHÔNG làm để tránh scope creep.

#### Acceptance Criteria

1. THE Parity_Sync_Spec SHALL không sửa file `packages/cli/src/**` ngoài việc cập nhật min threshold trong test.
2. THE Parity_Sync_Spec SHALL không thay đổi file `.kiro/specs/kk-kiro-kit/**`.
3. THE Parity_Sync_Spec SHALL không tạo preset thứ 7.
4. THE Parity_Sync_Spec SHALL không tạo branch hay PR tự động (việc đó là quyết định của maintainer).
5. THE Parity_Sync_Spec SHALL không port nội dung mang tính branding gốc của ClaudeKit (logo, screenshot, marketing copy) vào KiroKit.
6. THE Parity_Sync_Spec SHALL không ngụ ý migration người dùng đã cài KiroKit cũ; lần upgrade tiếp theo của họ qua `kiro-kit update` sẽ tự áp dụng nội dung mới.
