# Implementation Plan: claudekit-vs-kirokit-audit

## Overview

Đây là tính năng one-shot tạo bộ tài liệu Markdown audit; KHÔNG sinh runtime code, KHÔNG cần build framework PBT. Pipeline gồm 6 bước (Scan → Inventory → Mapping → Structural Checks → Gap Aggregation → Recommendations + Summary), thực thi tuần tự bằng các tool có sẵn (`listDirectory`, `fileSearch`, `grepSearch`, `readFile`, `readMultipleFiles`, `fsWrite`, `fsAppend`).

Mỗi task sinh ra deliverable thực tế trong `docs/audits/claudekit-vs-kirokit/`. Properties trong design.md được dùng làm checklist verify khi sinh artifact tương ứng (không phải test runner).

Output language: Markdown (tất cả file viết bằng tiếng Việt, ngoại trừ tên trường JSON/CSV và artifact path).

## Tasks

- [ ] 1. Khởi tạo phạm vi audit và quét filesystem hai gốc
  - [x] 1.1 Tạo cấu trúc thư mục output
    - Tạo `docs/audits/claudekit-vs-kirokit/` và `docs/audits/claudekit-vs-kirokit/appendix/`
    - Khởi tạo `appendix/run.log` với header: timestamp, scope roots
    - _Requirements: 10.1, 10.2_

  - [x] 1.2 Quét Source_Kit và sinh file listing
    - Dùng `listDirectory` (depth lớn) hoặc `fileSearch` để liệt kê mọi file dưới `claudekit-engineer-main/`
    - Áp dụng exclude patterns: `node_modules/`, `dist/`, `.git/`, `.coverage`, `repomix-output.xml`, `*.tar.gz`, `*.zip`
    - Ghi danh sách path tương đối (so với workspace root) vào `appendix/source-files.txt`, một path/dòng
    - _Requirements: 1.1, 1.4, 11.3_
    - _Verify: Property 1 (Coverage scan đúng và đủ)_

  - [x] 1.3 Quét Target_Kit cho cả 7 preset và sinh file listings
    - Với mỗi preset trong `[backend, frontend, fullstack, mobile, devops, data-ai, _template]`: liệt kê mọi file dưới `presets/<preset>/`
    - Áp dụng cùng exclude patterns
    - Ghi vào `appendix/target-files-<preset>.txt` (7 file)
    - _Requirements: 1.1, 1.4, 3.1, 11.3_
    - _Verify: Property 1_

- [ ] 2. Build inventory cho Source_Kit
  - [x] 2.1 Phân loại artifact và trích metadata Source
    - Đọc `appendix/source-files.txt`; phân loại từng path theo bảng prefix trong design.md (agent, command, hook, skill, workflow, settings, statusline, metadata, mcp_template, env_example, docs_template)
    - Với mỗi agent/command: parse YAML front-matter (30 dòng đầu) qua `readFile`, trích `name`, `description`, `model`, `tools`, `inclusion`, `argument-hint`
    - Với mỗi skill: dùng `listDirectory` kiểm tra `SKILL.md` (case-insensitive), liệt kê subdirs (`references/`, `scripts/`, `assets/`, `tests/`, `workflows/`), xác định Sub_Skill_Container (≥2 sub có SKILL.md riêng), đếm số dòng `SKILL.md`
    - Với mỗi hook: trích extension, group basename để phát hiện Cross_Platform_Triple
    - Đọc `claudekit-engineer-main/.claude/settings.json` và `metadata.json`, parse JSON
    - Lưu kết quả vào `appendix/inventory-source.json` theo schema InventoryEntry
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
    - _Verify: Property 2 (phủ hết artifact theo prefix), Property 3 (đủ trường metadata theo type)_

  - [-] 2.2 Render `inventory-source.md`
    - Sinh bảng Markdown phân theo Artifact_Type (agent, command, hook, skill, workflow, settings, statusline, metadata, mcp_template, env_example, docs_template)
    - Mỗi bảng có cột: tên file, đường dẫn tương đối, kích thước (số dòng), front-matter present (Y/N), trường front-matter chính, ghi chú (vd Sub_Skill_Container, Cross_Platform_Triple group)
    - Thêm dòng cuối: `_Generated at: <ISO-8601>_`
    - _Requirements: 2.7_
    - _Verify: Property 20 (prefix + timestamp footer)_

- [ ] 3. Build inventory cho Target_Kit (7 preset)
  - [x] 3.1 Phân loại artifact và trích metadata Target cho cả 7 preset
    - Tương tự task 2.1 nhưng áp dụng cho từng preset trong `presets/<preset>/`
    - Parse `presets/<preset>/manifest.json`: trích `files`, `minCounts`, `mcpServers`, `hooks`
    - Phát hiện manifest mismatch: file trên disk thiếu trong `manifest.files`, hoặc entry trong `manifest.files` không có file đích trên disk → ghi nhận vào extras để bước 5 dùng
    - Lưu kết quả gộp vào `appendix/inventory-target.json` (key theo preset)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
    - _Verify: Property 2, Property 3, Property 4 (manifest mismatch phát hiện đầy đủ)_

  - [-] 3.2 Render `inventory-target-<preset>.md` cho cả 7 preset
    - Sinh 7 file Markdown, mỗi file có cấu trúc giống `inventory-source.md` nhưng thêm cột "in manifest? (Y/N)" và section "Manifest Mismatches"
    - Thêm timestamp footer cho mỗi file
    - _Requirements: 3.5_
    - _Verify: Property 20_

  - [-] 3.3 Render `inventory-target-summary.md`
    - Bảng đếm artifact theo (Artifact_Type × preset): rows là Artifact_Type, columns là 7 preset
    - Thêm cột "Source count" để dễ so sánh ngay tại summary
    - Thêm timestamp footer
    - _Requirements: 3.5_

- [ ] 4. Tính mapping và similarity Source ↔ Target
  - [ ] 4.1 Khớp artifact và tính similarity
    - Với mỗi artifact Source và mỗi preset trong 7 preset, áp dụng thuật toán khớp 4 bước (basename → relative path normalize → agent name → command slug)
    - Với cặp tìm thấy: đọc nội dung qua `readMultipleFiles`, tính line-based Jaccard similarity (split `\n`, strip whitespace, bỏ dòng rỗng, |intersect|/|union|, ×100, làm tròn nguyên)
    - Gán nhãn theo quy tắc: similarity ≥ 95 + có context keyword phù hợp preset → `match`; similarity ≥ 95 không có keyword → `match` + ghi nhận để sinh gap "chưa tùy biến"; 20 < similarity < 95 → `divergent`; ≤ 20 hoặc không tìm thấy → `missing`; không áp dụng → `n/a`
    - Phát hiện Source-only và Target-only artifacts
    - Lưu vào `appendix/mapping.json`
    - Context keywords mỗi preset (đề xuất, ghi vào methodology.md): backend → `[fastify, nodejs, api, postgres, prisma]`; frontend → `[react, next.js, tailwind, vite, component]`; fullstack → cả hai bộ trên; mobile → `[flutter, react native, ios, android, swift, kotlin]`; devops → `[docker, kubernetes, ci, terraform, pipeline]`; data-ai → `[python, pandas, ml, llm, embedding, rag]`; `_template` → bỏ qua check keyword
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2_
    - _Verify: Property 5 (mapping cell schema), Property 6 (bao phủ hai chiều), Property 19 (similarity range)_

  - [ ] 4.2 Render `mapping.md`
    - Một bảng tổng cho mỗi Artifact_Type: hàng = artifact Source, cột = 7 preset, ô = `<label> <similarity>%`
    - Section "Source-only artifacts" liệt kê artifact không khớp được preset nào
    - Section "Target-only artifacts (per preset)" liệt kê 7 nhóm
    - Thêm timestamp footer
    - _Requirements: 4.6_

  - [ ] 4.3* Render `mapping.csv`
    - Format flat: `source_path,target_path,preset,artifact_type,label,similarity`
    - Một dòng cho mỗi cell trong mapping (kể cả `missing` với target_path rỗng)
    - _Requirements: 4.6_

- [ ] 5. Chạy structural checks
  - [ ] 5.1 Kiểm tra front-matter agent và command
    - Đọc lại inventory JSON; với mỗi agent thiếu một trong `inclusion`, `name`, `description`, `model` → finding `FM-AGENT` severity `medium`
    - Với mỗi command thiếu một trong `inclusion`, `description`, `argument-hint` → finding `FM-CMD` severity `low`
    - Áp dụng cho cả Source và Target
    - Lưu vào `appendix/structural-findings.json` (append mode)
    - _Requirements: 5.1, 5.2_
    - _Verify: Property 7_

  - [ ] 5.2 Kiểm tra cấu trúc skill
    - Với mỗi skill folder không có `SKILL.md` và không phải Sub_Skill_Container → finding `SKILL-MD` severity `high`
    - Với `SKILL.md` > 200 dòng và không có subdir `references/` → finding `SKILL-PD` severity `low`
    - Áp dụng cho cả Source và Target; append vào `structural-findings.json`
    - _Requirements: 5.3, 5.4_
    - _Verify: Property 8_

  - [ ] 5.3 Kiểm tra hook reference và Cross_Platform_Triple
    - Parse `hooks` trong `settings.json` của Source và mỗi preset Target; với mỗi reference không có file đích → finding `HOOK-REF` severity `critical`
    - Với mỗi triple group đầy đủ trong Source mà preset Target thiếu ≥1 biến thể → finding `TRIPLE` severity `medium`, liệt kê biến thể thiếu
    - Append vào `structural-findings.json`
    - _Requirements: 5.5, 5.6_
    - _Verify: Property 9, Property 10_

  - [ ] 5.4 Kiểm tra emoji và PII trong Target
    - Dùng `grepSearch` với pattern Unicode emoji block (vd `[\x{1F300}-\x{1FAFF}]` hoặc đơn giản `[😀-🙏]` + ký hiệu) và pattern email `[\w.-]+@[\w.-]+\.\w+`, pattern phone `\+?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}`
    - Mỗi vi phạm → finding `EMOJI` hoặc `PII` severity `low`, kèm path + số dòng
    - Append vào `structural-findings.json`
    - _Requirements: 7.3_
    - _Verify: Property 11_

  - [ ] 5.5 Kiểm tra link nội bộ broken trong Target Markdown
    - Dùng `grepSearch` pattern `\]\((\.\.?/[^)]+)\)` trên `presets/**/*.md` và `docs/**/*.md`
    - Với mỗi link tương đối, kiểm tra file đích tồn tại (qua inventory hoặc `fileSearch`); nếu không → finding `LINK` severity `medium`
    - Append vào `structural-findings.json`
    - _Requirements: 7.4_
    - _Verify: Property 12_

  - [ ] 5.6 Kiểm tra minCount manifest và mismatch
    - Với mỗi preset có `minCounts.<type> = N`: đếm artifact thực tế trên disk (từ inventory); nếu < N → finding `MIN-COUNT` severity `high`, kèm count thực tế và threshold
    - Với mismatch đã phát hiện ở task 3.1 (file ⇄ manifest.files): finding `MANIFEST-MISMATCH` severity `medium`
    - Append vào `structural-findings.json`
    - _Requirements: 12.1, 12.2, 12.3_
    - _Verify: Property 4, Property 16_

- [ ] 6. Checkpoint - Review intermediate JSON outputs
  - Mở `appendix/inventory-source.json`, `inventory-target.json`, `mapping.json`, `structural-findings.json`
  - Verify schema hợp lệ, không có entry null bắt buộc, count tổng artifact khớp giữa scan và inventory
  - Ensure all checks complete, ask the user if questions arise.

- [ ] 7. Tổng hợp Gap_List
  - [ ] 7.1 Gom mapping `missing`/`divergent` + structural findings thành Gap_List
    - Mỗi finding tạo một gap candidate với fields: `id` (sinh sau khi sort), `type`, `severity`, `artifact_path_source`, `artifact_path_target`, `preset_affected` (mảng), `description`, `evidence`
    - Áp dụng quy tắc dedup: cùng `(type, artifact_path_source, description)` → gom thành một gap với `preset_affected` là union
    - Sort theo (severity desc: critical > high > medium > low > informational, type asc, artifact_path asc), gán `id = GAP-001`, `GAP-002`, ...
    - Lưu vào `appendix/gaps.json`
    - _Requirements: 6.1, 6.4_
    - _Verify: Property 13 (schema), Property 15 (dedup)_

  - [ ] 7.2 Render `gaps.md`
    - Section "Tổng quan": bảng đếm gap theo (severity × type × preset)
    - Section "Detailed Gaps": bảng có cột `id`, `type`, `severity`, `artifact_path`, `preset_affected`, `description`, `evidence`
    - Sort gap theo severity (critical đầu)
    - Thêm timestamp footer
    - _Requirements: 6.3, 6.5_

  - [ ] 7.3* Render `gaps.csv`
    - Một dòng cho mỗi (gap, preset) cặp (flatten `preset_affected`): `id,type,severity,artifact_path_source,artifact_path_target,preset,description`
    - _Requirements: 6.5_

- [ ] 8. Sinh Recommendations có ưu tiên
  - [ ] 8.1 Group gap thành recommendations và assign priority
    - Đọc `appendix/gaps.json`
    - Group heuristic: cùng `(type, artifact_type, action_group)` với `action_group` là nhóm thư mục đích (vd `agents/`, `hooks/`, `skills/<skill_name>/`)
    - Map severity → priority cố định: `critical → P0`, `high → P1`, `medium → P2`, `low → P3`, `informational → P3`
    - Effort heuristic: đơn artifact đơn preset → S; ≤5 artifact hoặc 1 artifact qua nhiều preset → M; > 5 artifact hoặc cấu trúc phức tạp → L
    - Owner heuristic: hook/settings → `cli-maintainer`; agent/skill/command/workflow → `preset-author`
    - Sort theo (priority asc: P0 đầu, effort asc: S < M < L)
    - Mỗi entry: `id (REC-NNN)`, `title`, `linked_gap_ids`, `proposed_action` (kèm path nguồn + path đích đề xuất nếu là port), `affected_presets`, `priority`, `effort`, `owner_role`
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
    - _Verify: Property 14 (severity → priority), Property 17 (schema + ordering), Property 18 (dedup)_

  - [ ] 8.2 Render `recommendations.md`
    - Một bảng tổng có cột: `id`, `priority`, `effort`, `owner`, `title`, `affected_presets`, `linked_gaps`
    - Theo sau là chi tiết mỗi recommendation có heading, `proposed_action` đầy đủ, ghi chú về context tùy biến nếu là port
    - Sort theo priority asc, effort asc
    - Thêm timestamp footer
    - _Requirements: 8.5_

- [ ] 9. Sinh Executive Summary và Methodology
  - [ ] 9.1 Tính Parity Score cho mỗi preset
    - Từ `mapping.json`: với mỗi preset, đếm `matched_count`, `divergent_count`, và `source_total_artifact_count` (loại trừ cell `n/a`)
    - `parity = round((matched + 0.5 × divergent) / total × 100)`
    - Lưu vào `appendix/parity-scores.json` (helper trung gian)
    - Ghi nhận vào kết quả để render README
    - _Requirements: 9.2_
    - _Verify: Property 19_

  - [ ] 9.2 Tổng hợp section "kk-kiro-kit Spec Compliance"
    - Đọc `.kiro/specs/kk-kiro-kit/requirements.md` (nếu tồn tại); trích các requirement liên quan parity với Source_Kit
    - Đối chiếu mỗi requirement với gap/finding tương ứng; lập bảng "Spec Compliance" với cột: requirement id, status (đạt/chưa đạt), evidence (link tới gap nếu chưa đạt)
    - Đếm số đạt/chưa đạt
    - _Requirements: 12.4, 12.5_

  - [ ] 9.3 Viết `README.md` (Executive Summary)
    - Section bắt buộc: "Scope" (gốc đã quét + exclude patterns), "Key Findings" (3-5 bullet), "Parity Score by Preset" (bảng sort giảm dần), "Top 10 Recommendations" (chỉ title + priority + effort, không body), "kk-kiro-kit Spec Compliance" (từ task 9.2), "Reproduce" (lệnh shell tái lập + công cụ similarity), "Methodology" (1 paragraph tóm tắt + link sang `methodology.md`), "Links to Detail Files"
    - KHÔNG dùng emoji
    - Tối đa 200 dòng
    - Thêm timestamp footer
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 11.4, 12.5_
    - _Verify: Property 11 (no emoji), Property 17 (Top 10), Property 19 (parity sort)_

  - [ ] 9.4 Viết `methodology.md`
    - Header ghi tham số runtime đã dùng: similarity threshold (95% match, 20% divergent boundary), exclude patterns đầy đủ, danh sách context keywords cho mỗi preset, severity rules, severity → priority map
    - Section: pattern loại trừ chi tiết, quy tắc khớp tên 4 bước, công thức Jaccard similarity, công thức Parity Score, quy tắc severity, quy tắc dedup gap, quy tắc dedup recommendation
    - Section "Reproduce": cách regenerate parity từ `mapping.csv`, cách diff hai lần chạy
    - Thêm timestamp footer
    - _Requirements: 10.3, 11.1, 11.2, 11.4_
    - _Verify: Property 21 (methodology phản ánh tham số runtime)_

- [ ] 10. Final checkpoint và verification
  - [ ] 10.1 Verify cấu trúc output đúng và đầy đủ
    - Dùng `listDirectory` trên `docs/audits/claudekit-vs-kirokit/`; verify đủ 17 file: `README.md`, `methodology.md`, `inventory-source.md`, `inventory-target-summary.md`, 7 file `inventory-target-<preset>.md`, `mapping.md`, `gaps.md`, `recommendations.md`, và thư mục `appendix/`
    - Kiểm tra mỗi file Markdown có dòng cuối match `_Generated at: <ISO-8601>_`
    - Kiểm tra `README.md` không chứa emoji (grep Unicode emoji block)
    - Kiểm tra mọi file output đều nằm trong prefix `docs/audits/claudekit-vs-kirokit/`
    - _Requirements: 9.6, 10.1, 10.2, 10.4, 10.5_
    - _Verify: Property 11, Property 20_

  - [ ] 10.2* Sinh appendix raw data bổ sung
    - Lưu thêm `appendix/parity-scores.json` (đã sinh ở 9.1) nếu chưa có
    - Đảm bảo `run.log` ghi đầy đủ stage transitions với timestamp
    - _Requirements: 10.2, 11.3_

  - [ ] 10.3 Final review checkpoint
    - Ensure all output files exist, ask the user if questions arise.

## Notes

- Tasks marked với `*` là optional (CSV exports, raw data bổ sung); có thể skip cho bản MVP audit
- Properties trong design.md được dùng làm checklist verify thủ công khi sinh artifact tương ứng, không build framework PBT
- Mỗi task tham chiếu cụ thể requirement clause; properties tham chiếu khi áp dụng để verify
- Pipeline tuyến tính: hoàn thành task N trước khi sang N+1; trung gian JSON cho phép kiểm tra giữa chừng
- Output cuối cùng là 17 file Markdown + 1 thư mục appendix tại `docs/audits/claudekit-vs-kirokit/`
