# Danh Sách Tác Vụ (Tasks Document)

Triển khai theo design tại `.kiro/specs/claudekit-parity-sync/design.md`. Mọi task tuân thủ Requirements 18 và 20: KHÔNG sửa `packages/cli/src/`, KHÔNG tạo shared core, KHÔNG tạo preset thứ 7. Dùng Node.js (CommonJS) cho `scripts/parity-sync/`, không cần build step.

## Phase 1: Foundation

- [x] 1. Tạo cấu trúc thư mục `scripts/parity-sync/`
  - [x] 1.1 Tạo skeleton `scripts/parity-sync/run.js` với arg parser (`--dry-run`, `--apply`, `--preset <name>`)
  - [x] 1.2 Tạo `scripts/parity-sync/lib/path-utils.js` (normalizeRelPath, joinPreset, stripClaudePrefix)
  - [x] 1.3 Tạo `scripts/parity-sync/lib/hash-utils.js` (sha256 file content cho idempotency)
  - [x] 1.4 Tạo `scripts/parity-sync/lib/yaml-front-matter.js` (parse + serialize YAML front-matter, dùng `gray-matter` từ npm)
  - [x] 1.5 Khai báo `package.json` cho `scripts/parity-sync/` với dep `fast-check`, `gray-matter`, devDep `vitest`

- [x] 2. Implement `inventory-reader.js`
  - [x] 2.1 Đọc `inventory-source.json`, validate schema (mảng object có `id`, `kit`, `artifact_type`, `path`)
  - [x] 2.2 Đọc 7 file `target-files-*.txt`, parse line-by-line thành `TargetItem[]` per preset
  - [x] 2.3 Throw `InventoryError` với hướng dẫn rebuild nếu file thiếu/rỗng (Req 1.4, error code E_INV_MISSING)
  - [x] 2.4 (PBT) Property test P1 — InventoryReader Soundness: random fixture → đúng count, parse round-trip

- [x] 3. Khai báo `category-rules.js` (data-only module)
  - [x] 3.1 Định nghĩa `CATEGORY_RULES` array khớp 1:1 với "Bảng phân loại" trong design.md (16 agent, 32 skill, 53 command + hooks/workflows/statusline/etc.)
  - [x] 3.2 Export helper `lookupRule(artifactType, basename)` trả về `target_presets: PresetName[]`
  - [x] 3.3 Unit test: assert mọi source artifact ID trong `inventory-source.json` đều có rule (no orphan source)

## Phase 2: Delta Detection và Planning

- [x] 4. Implement `delta-detector.js`
  - [x] 4.1 Pairwise loop `(SourceItem, PresetName)` sinh `DeltaEntry` với status `present|missing|partial` (chưa áp category)
  - [x] 4.2 Logic detect `partial` cho skill thiếu `references/` hoặc `scripts/` (so sánh subdir presence)
  - [x] 4.3 (PBT) Property test P2 — Delta Status Totality: random inventory → mỗi pair có duy nhất 1 status enum

- [x] 5. Implement `category-mapper.js`
  - [x] 5.1 Áp `CATEGORY_RULES` lên `DeltaEntry[]`, đổi status `missing → category-skip` khi preset không match
  - [x] 5.2 Sinh reason string khi gán category-skip (ví dụ "frontend-only", "backend-only")
  - [x] 5.3 (PBT) Property test P3 — Category Mapping Correctness: random (artifact, preset) → status khớp table

- [x] 6. Implement `port-planner.js`
  - [x] 6.1 Convert `DeltaEntry[]` filtered → `PortPlan[]` với transform list per file
  - [x] 6.2 Logic `sub-skill-split` cho `document-skills/{docx,pdf,pptx,xlsx}/` (mỗi sub-skill = 1 PortPlan)
  - [x] 6.3 Logic `tri-script-extend` cho hook source `.sh` only (skip nếu KiroKit đã có tri-script tương đương)
  - [x] 6.4 Logic `frontmatter-keep` flag cho mọi `.md` có front-matter
  - [x] 6.5 Logic `json-merge` cho settings.json/metadata.json/manifest.json/.mcp.json.example
  - [x] 6.6 Logic `env-merge` cho `.env.example` files
  - [x] 6.7 Unit test: fixture sub-skill → 4 PortPlan; fixture .sh hook → tri-script-extend đúng

## Phase 3: Port Execution

- [x] 7. Implement `rebrander.js`
  - [x] 7.1 String substitution rules theo design (`.claude/`→`.kiro/`, `ClaudeKit`→`KiroKit`, `Claude Code`→`Kiro` với exception list)
  - [x] 7.2 Logic giữ URL `https://docs.claude.com/...` nguyên văn (kiểm tra trước substitution)
  - [x] 7.3 Prepend comment khi gặp `npx claude-code` (Req 11.5)
  - [x] 7.4 Front-matter `name: claude-code` giữ nguyên (Req 11.2)
  - [x] 7.5 Golden-file tests: 15 cặp fixture input/expected trong `__tests__/golden/`
  - [x] 7.6 (PBT) Property test P4 — Rebrand Correctness: random markdown content → output không còn pattern (trừ exception)
  - [x] 7.7 (PBT) Property test P5 — Front-matter Round-trip: random source front-matter → target giữ nguyên `name`, `inclusion`, `argument-hint`

- [x] 8. Implement `atomic-writer.js`
  - [x] 8.1 Function `writeAtomic(targetPath, content)` ghi `.tmp.<pid>.<random>` rồi rename
  - [x] 8.2 Fallback `copyFile + unlink tmp` cho Windows file lock (retry 3 lần)
  - [x] 8.3 Unit test: mock fs, simulate ENOENT/EACCES, verify retry behavior

- [x] 9. Implement `conflict-resolver.js`
  - [x] 9.1 Cây quyết định 4 tier: hash equal (no-op), Tier 1 (kept-target), Tier 2 (merged-frontmatter), Tier 3 (sidecar), Tier 4 (default kept-target)
  - [x] 9.2 JSON deep-merge strategy riêng cho settings.json/metadata.json/.mcp.json.example (giữ key target)
  - [x] 9.3 Sinh sidecar `<basename>.source.md` cho Tier 3
  - [x] 9.4 Trả về `ConflictDecision` với hash, reason, timestamp
  - [x] 9.5 (PBT) Property test P6 — Conflict Resolution Decision Tree: random (source_lines, target_lines) → decision khớp tier
  - [x] 9.6 Unit test edge 12.4: chạy lần 1 sinh sidecar, xoá, chạy lần 2 không sinh lại

- [x] 10. Implement `porter.js`
  - [x] 10.1 Loop từng `PortPlan`: đọc source → Rebrander → ConflictResolver → AtomicWriter
  - [x] 10.2 Track `portedFiles` list cho rollback per preset
  - [x] 10.3 Skip file source thiếu front-matter hợp lệ (edge 3.7), ghi warning vào delta-report buffer
  - [x] 10.4 Unit test: fixture với 5 PortPlan có conflict mix → assert đúng decision per file

## Phase 4: Manifest và Reporter

- [x] 11. Implement `manifest-updater.js`
  - [x] 11.1 Read `presets/<P>/manifest.json`, append entries cho file mới với 3 field `source`, `target`, `type`
  - [x] 11.2 Sort entries theo `target` ascending, atomic write qua AtomicWriter
  - [x] 11.3 Validate: round-trip JSON.parse → JSON.stringify, no orphan, no broken link
  - [x] 11.4 Throw `E_MANIFEST_INVALID` hoặc `E_MANIFEST_NO_ORPHAN` với rollback portedFiles nếu fail
  - [x] 11.5 (PBT) Property test P7 — Manifest Coverage and Closure: random valid manifest → 3 invariant đồng thời

- [x] 12. Implement `reporter.js`
  - [x] 12.1 Sinh `delta-report.md` với bảng tổng kết + chi tiết per-pair sort `(preset, source.path)`
  - [x] 12.2 Sinh `conflict-log.md` với entry per-decision (target_path, decision, reason, hash, timestamp)
  - [x] 12.3 Sinh `parity-sync-report.md` với front-matter timestamp + bảng before/after + top 20 manual-review
  - [x] 12.4 Final check Property 11 (no emoji + no PII) trên 3 file output
  - [x] 12.5 Snapshot tests: 3 fixture deterministic input → expected report markdown

## Phase 5: CLI Orchestration

- [x] 13. Hoàn thiện `run.js` orchestration
  - [x] 13.1 Pipeline tuần tự: InventoryReader → DeltaDetector → CategoryMapper → PortPlanner
  - [x] 13.2 Chế độ `--dry-run` (default): chỉ sinh delta-report, không ghi preset
  - [x] 13.3 Chế độ `--apply`: chạy Porter + ManifestUpdater + Reporter
  - [x] 13.4 Filter `--preset <name>` chỉ port một preset
  - [x] 13.5 Final check: chạy structural validation (Property 8 thresholds), abort code E_THRESHOLD_FAIL nếu thiếu
  - [x] 13.6 Final check: rebrand leak scan (Property 4), abort code E_REBRAND_LEAK nếu còn pattern
  - [x] 13.7 (PBT) Property test P10 — Idempotency: chạy 2 lần liên tiếp → byte-identical output

## Phase 6: Apply parity-sync và Threshold Migration

- [x] 14. Chạy parity-sync `--apply` lần đầu cho 6 preset
  - [x] 14.1 Run `node scripts/parity-sync/run.js --dry-run` review delta-report.md
  - [x] 14.2 Resolve manual-review sidecar files (xoá, edit, hoặc accept)
  - [x] 14.3 Run `node scripts/parity-sync/run.js --apply`
  - [x] 14.4 Commit kết quả: `presets/**`, `docs/audits/claudekit-vs-kirokit/{delta,conflict,parity-sync}-report.md`

- [ ] 15. Cập nhật structural tests trong `packages/cli/tests/structural/`
  - [x] 15.1 Nâng `MIN_AGENTS=12 → 16` trong tất cả 6 preset structural test
  - [x] 15.2 Nâng `MIN_SKILLS=20 → 28`
  - [x] 15.3 Nâng `MIN_COMMANDS=25 → 40`
  - [x] 15.4 Quyết định `MIN_HOOKS` (giữ 6 hoặc nâng 8 dựa trên kết quả Phase 14)
  - [x] 15.5 Tạo `manifest-no-orphan.test.js` (Req 14.7)
  - [x] 15.6 Tạo `manifest-no-broken-link.test.js` (Req 14.8)
  - [x] 15.7 (PBT) Property test P8 — Threshold Compliance: load 6 preset → count >= MIN_X
  - [x] 15.8 (PBT) Property test P9 — Tri-script Completeness: với mọi `.sh`/`.ps1` → tồn tại `.js`

- [ ] 16. Validation cuối
  - [x] 16.1 Run `npm test -- structural` xác minh 6 preset pass
  - [x] 16.2 Run `node scripts/validate-manifest.js <preset>` cho cả 6 preset, exit 0
  - [x] 16.3 Run `node scripts/parity-sync/run.js --apply` lần 2 → assert git diff trống (Property 10)
  - [x] 16.4 (PBT) Property test P11 — No Emoji + No PII: scan toàn bộ presets/ và docs/audits/
  - [x] 16.5 (PBT) Property test P12 — Sub-skill Subtree Completeness: data-ai preset có 4 sub-skill độc lập với SKILL.md riêng

## Phase 7: Root-level files (Req 10)

- [x] 17. Port root-level files (separate from preset content)
  - [x] 17.1 Copy `claudekit-engineer-main/.commitlintrc.json` → `./.commitlintrc.json` nếu chưa tồn tại
  - [x] 17.2 Copy `.releaserc.json` (skip nếu CI đã có cấu hình khác — Req 10.5)
  - [x] 17.3 Copy + merge `.repomixignore`
  - [x] 17.4 Copy + rebrand `CLAUDE.md` → `./KIRO.md` (rename rule, Req 11.3)
  - [x] 17.5 Copy `GEMINI.md` nếu chưa tồn tại
  - [x] 17.6 Copy `claudekit-engineer-main/guide/` → `./docs/guide/` nếu target rỗng
  - [x] 17.7 Copy `scripts/test-scout-block.{sh,ps1}` + sinh `.js` tương đương để tuân thủ tri-script

## Acceptance Gate

Tất cả task hoàn thành khi:
- 12 property tests pass với numRuns=100
- 6 structural tests pass với threshold mới
- 2 manifest tests mới pass
- `git diff` trống sau khi chạy parity-sync lần 2
- 3 report files (delta, conflict, parity-sync) có ISO 8601 timestamp ở front-matter và không có emoji
- CLI public API không thay đổi (Req 18.1) — verify bằng snapshot test trên `kiro-kit --help` output
