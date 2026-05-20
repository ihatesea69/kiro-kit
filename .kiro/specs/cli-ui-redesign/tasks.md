# Implementation Plan: CLI UI Redesign

## Overview

Triển khai lớp UI mới cho `kiro-kit` theo kiến trúc presentation-pure, tách hoàn toàn khỏi core. Build từ dưới lên: bắt đầu với `vendor.ts` (lazy adapter) và `capability.ts` (single source of truth), tiếp đến các component render thuần (Theme, Logo, ThemedBox), rồi lớp tương tác (Spinner, ThemedPrompt, TaskRunner), compose vào Init Screens, và cuối cùng wire vào `init.ts` cùng `scripts/postinstall.js`.

Ngôn ngữ implementation: TypeScript (theo design). Test framework: vitest + fast-check (đã có sẵn). Mỗi task tham chiếu requirements granular cụ thể.


## Tasks

- [x] 1. Cài đặt dependencies và setup vendor adapter
  - [x] 1.1 Thêm runtime dependencies pinned vào `packages/cli/package.json`
    - Thêm runtime: `chalk@5.3.0`, `figlet@1.7.0`, `gradient-string@2.0.2`, `boxen@7.1.1`, `ora@8.0.1`, `listr2@8.0.1`, `prompts@2.4.2`, `terminal-link@3.0.0`
    - Thêm dev: `@types/figlet@^1.5.8`, `@types/gradient-string@^1.1.6`, `@types/prompts@^2.4.9`, `strip-ansi@7.1.0`
    - Update `tsup.config.ts`: thêm các package trên vào `external` để giữ bundle nhẹ
    - _Requirements: 13.1, 13.2_

  - [x] 1.2 Tạo `src/ui/vendor.ts` lazy import adapter
    - Mỗi vendor module có hàm `loadX()` dùng `await import()` với try/catch
    - Cache promise sau lần resolve đầu để tránh re-import
    - Trả `null` khi load fail; component caller phải handle null fallback
    - _Requirements: 11.1, 13.1, 13.2_

  - [ ]* 1.3 Property test cho vendor adapter
    - **Property: Vendor load fail không throw, luôn trả null hoặc module hợp lệ**
    - **Validates: Requirements 11.1, 13.1**

- [x] 2. Implement TerminalCapability detector
  - [x] 2.1 Tạo `src/ui/capability.ts` với interface và `detectCapability()`
    - Implement theo `Algorithm: detectCapability` trong design
    - Đọc `NO_COLOR`, `FORCE_COLOR`, `CI`, `TERM`, `COLORTERM`, `WT_SESSION`, `TERM_PROGRAM`
    - Detect win32 cmd (không có `WT_SESSION`/`TERM_PROGRAM`) thì set `unicode = false`
    - Clamp `columns >= 20` (fallback 80 nếu nhỏ hơn)
    - Return `Object.freeze(...)` để immutable
    - Đảm bảo invariants: `truecolor → color`, `animate → isTTY`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11_

  - [ ]* 2.2 Property test cho capability invariants
    - **Property 1: Capability invariants luôn giữ (truecolor implies color, animate implies isTTY, columns >= 20)**
    - **Validates: Requirements 1.6, 1.7, 1.8**

  - [ ]* 2.3 Unit test cho capability matrix
    - Test: `NO_COLOR=1` thì `color=false, truecolor=false` (Req 1.2)
    - Test: `CI=true` không `FORCE_COLOR` thì `animate=false` (Req 1.4)
    - Test: `COLORTERM=truecolor` thì `truecolor=true` (Req 1.5)
    - Test: `TERM=dumb` thì `unicode=false` (Req 1.11)
    - Test: win32 không `WT_SESSION`/`TERM_PROGRAM` thì `unicode=false` (Req 1.10)
    - Test: không mutate input env/argv/stream (Req 1.9)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.9, 1.10, 1.11_

- [x] 3. Implement Theme builder
  - [x] 3.1 Tạo `src/ui/theme.ts` với palette default và `createTheme()`
    - Default palette: primary `#a970ff`, secondary `#8bd5ff`, muted `#6f6a7c`, text `#f4f1ff`, danger `#ff5c8a`, success `#22c55e`, warn `#f5b042`
    - Validate palette hex regex `/^#[0-9a-fA-F]{6}$/` cho mỗi field; throw error mô tả field vi phạm
    - Validate `primary !== secondary`
    - Khi `capability.color === false`: trả identity functions (no chalk)
    - Khi `capability.truecolor === false && color === true`: dùng `chalk.ansi256(...)` fallback
    - `link(label, url)`: validate scheme `https://` hoặc `mailto:`, throw nếu không match
    - `link()` dùng `terminal-link` khi `capability.hyperlink === true`, fallback `label (url)`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 12.3, 12.4_

  - [ ]* 3.2 Property test cho theme color stripping
    - **Property: Khi color=false thì strip-ansi(method(s)) === s cho mọi method và string**
    - **Validates: Requirements 2.4**

  - [ ]* 3.3 Unit test cho theme validation và link
    - Test: palette hex invalid thì throw kèm field name (Req 2.2)
    - Test: `primary === secondary` thì throw (Req 2.3)
    - Test: link với scheme `http://` thì throw (Req 12.4)
    - Test: link với `hyperlink=false` thì output chứa cả label và url (Req 2.7)
    - Test: `truecolor=false` thì dùng ANSI 256 fallback (Req 2.5)
    - _Requirements: 2.2, 2.3, 2.5, 2.7, 12.3, 12.4_

- [x] 4. Implement Logo renderer
  - [x] 4.1 Tạo `src/ui/Logo.ts` với `createLogo()` và `LogoRenderer`
    - Implement theo `Algorithm: renderLogo` trong design
    - Default font `ANSI Shadow`, default text `kiro-kit`
    - Khi `unicode=true && color=true && columns>=60`: figlet + gradient
    - Khi `color=false`: figlet plain, không byte `\x1B[`
    - Khi `unicode=false || columns<60`: compact form `kiro-kit vX.Y.Z` + subtitle muted
    - Khi vendor figlet/gradient-string không khả dụng: tự động fallback compact
    - Không in trực tiếp ra stdout, chỉ trả string
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 11.2_

  - [ ]* 4.2 Property test cho Logo NO_COLOR và unicode
    - **Property 2: NO_COLOR triệt tiêu mọi byte ANSI trong logo output**
    - **Validates: Requirements 3.2**
    - **Property: unicode=false thì output chỉ chứa byte ASCII (<= 0x7F)**
    - **Validates: Requirements 3.5**

  - [ ]* 4.3 Unit test cho Logo modes
    - Test: full TTY truecolor thì output chứa figlet ASCII và ANSI escape
    - Test: `columns=40` thì compact form
    - Test: vendor figlet=null thì fallback compact (Req 11.2)
    - _Requirements: 3.1, 3.3, 11.2_

- [x] 5. Implement ThemedBox renderer
  - [x] 5.1 Tạo `src/ui/ThemedBox.ts` với `createThemedBox()`
    - Map variant -> borderColor: info=primary, tip=secondary, success=success, warn=warn, error=danger
    - Khi `unicode=false`: border style `classic` (`+`/`-`/`|`)
    - Khi `unicode=true`: border style `round`
    - Width default: `min(capability.columns - 4, 80)`
    - Khi `columns < 40`: padding=0 (graceful narrow mode)
    - Wrap text sao cho mỗi dòng visible width <= `width - 2*padding - 2`
    - Khi vendor boxen=null: fallback ASCII border tự code
    - Title render trên border top khi `opts.title` được cung cấp
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 11.3, 11.7_

  - [ ]* 5.2 Property test cho ThemedBox width fit
    - **Property 3: Output luôn fit trong capability.columns (visible width <= columns)**
    - **Validates: Requirements 4.5, 4.7**

  - [ ]* 5.3 Unit test cho variant mapping và fallback
    - Test: mỗi variant render đúng border color (Req 4.2)
    - Test: `unicode=false` thì border là `classic` (Req 4.3)
    - Test: vendor boxen=null thì ASCII fallback hoạt động (Req 11.3)
    - Test: `columns<40` thì padding=0 (Req 11.7)
    - _Requirements: 4.2, 4.3, 11.3, 11.7_

- [x] 6. Checkpoint - Render layer xong
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Implement Spinner
  - [x] 7.1 Tạo `src/ui/Spinner.ts` với `createSpinner()` và `SpinnerHandle`
    - Khi `animate=true`: wrap `ora`, render spinner animation
    - Khi `animate=false`: `start(t)` in `-> {t}`, `succeed(t)` in `[ok] {t}`, `fail(t)` in `[x] {t}`, `warn(t)` in `[!] {t}`
    - Đăng ký `process.once('SIGINT', cleanup)` và `process.once('exit', cleanup)` để stop spinner
    - `setText()` cập nhật text khi đang chạy
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 7.2 Unit test cho Spinner fallback
    - Test: `animate=false` start in `->` prefix (Req 9.2)
    - Test: `animate=false` succeed in `[ok]` prefix (Req 9.2)
    - Test: setText sau start update text (Req 9.4)
    - _Requirements: 9.2, 9.4_

- [x] 8. Implement ThemedPrompt
  - [x] 8.1 Tạo `src/ui/ThemedPrompt.ts` với `createPrompt()`
    - Wrap `prompts` library với theme primitives
    - `multiPickPresets(items)`: validate `items.length >= 1` và unique names; render multiselect
    - `confirm(msg, defaultYes)`: render Y/n prompt
    - `selectTier(title, options, defaultIndex)`: render single select
    - `conflictChoice(targetRel)`: render select cho overwrite/skip/view-diff/overwrite-all
    - Khi `!isTTY`: `multiPickPresets→[]`, `confirm→defaultYes`, `conflictChoice→'skip'` (không block)
    - Khi user nhấn Ctrl+C: cleanup raw mode, reject `new Error('SIGINT')`
    - Khi `color=false` nhưng isTTY: vẫn interactive, strip màu
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [ ]* 8.2 Property test cho non-TTY semantics
    - **Property 6: Prompt non-TTY giữ nguyên semantics (multiPickPresets→[], confirm→default, conflictChoice→skip)**
    - **Validates: Requirements 7.2, 7.3, 7.4**

  - [ ]* 8.3 Unit test cho prompt validation và SIGINT
    - Test: items có name trùng thì throw (Req 7.8)
    - Test: SIGINT trong prompt thì reject `Error('SIGINT')` và cleanup raw mode (Req 7.5, 7.7)
    - _Requirements: 7.5, 7.7, 7.8_

- [x] 9. Implement TaskRunner
  - [x] 9.1 Tạo `src/ui/TaskRunner.ts` với `createTaskRunner()` và `TaskDef`
    - Khi `animate=true && color=true`: dùng `listr2` renderer `default`
    - Khi `animate=false || !isTTY`: dùng renderer `simple` (in `-> task ... done`)
    - Khi `columns < 40`: force renderer `simple`
    - `TaskHelpers.setOutput()` stream sub-text dưới spinner
    - `TaskHelpers.setTitle()` mutate task title
    - `task.skip(ctx)` trả true/string thì skip task, tiếp task kế
    - Throttle re-render >= 100ms
    - Reject với error đính `taskTitle`; stop tất cả spinner đã start (cleanup)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 11.7_

  - [ ]* 9.2 Property test cho TaskRunner monotonicity
    - **Property 4: ctx.filesWritten chỉ tăng monotonic qua các task**
    - **Validates: Requirements 8.6**

  - [ ]* 9.3 Unit test cho TaskRunner fallback và skip
    - Test: `animate=false` thì simple renderer in `->` lines (Req 8.3)
    - Test: `task.skip` trả string thì skip với reason (Req 8.7)
    - Test: task throw thì reject với taskTitle attached (Req 8.4)
    - Test: reject thì spinner đã start được stop (Req 8.5)
    - _Requirements: 8.3, 8.4, 8.5, 8.7_

- [x] 10. Implement Init Screens
  - [x] 10.1 Tạo `src/ui/screens/InitScreens.ts` với `createInitScreens()`
    - `welcome(data)`: theo `Algorithm: renderInitWelcome` - in Logo → blank → tip box → blank → heading "Available commands" → command list (name padded 20 + muted description)
    - `summary(data)`: render success box variant=success chứa filesWritten/filesSkipped/presets/setupGuidePath?/envExamplePath?/nextSteps/docsUrl
    - Omit setupGuidePath/envExamplePath nếu undefined
    - `docsUrl` render qua `theme.link()` để OSC-8 hyperlink khi có thể
    - `errorBox(err)`: render box variant=error chứa `err.message` + hint "see logs with --verbose"
    - Sanitize: strip `\x1B`/`\x9B` khỏi mọi string từ filesystem path trước khi render
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.1, 10.2, 10.3, 10.4, 10.5, 11.4, 12.1, 12.2_

  - [ ]* 10.2 Property test cho welcome strip-ansi cấu trúc
    - **Property: color=false, strip-ansi(welcome output) giữ nguyên các tokens (logo text, commands, tip)**
    - **Validates: Requirements 6.6**

  - [ ]* 10.3 Unit test cho InitScreens
    - Test: summary với `setupGuidePath=undefined` thì output không chứa "Setup guide" (Req 10.3)
    - Test: errorBox được gọi đúng 1 lần render variant=error chứa err.message (Req 11.4)
    - Test: path chứa `\x1B[31m...` thì strip trước khi render (Req 12.1)
    - _Requirements: 10.3, 10.4, 11.4, 12.1_


- [x] 11. Wire UI layer vào init.ts
  - [x] 11.1 Refactor `src/commands/init.ts` để dùng UI layer
    - Tạo `capability` từ `detectCapability(process.env, process.argv, process.stdout)` ở entry
    - Tạo `theme = createTheme(capability)` và `screens = createInitScreens({ capability, theme, cliVersion })`
    - Tạo `prompt = createPrompt(capability, theme)`
    - Gọi `screens.welcome(...)` trước khi list presets
    - Thay readline custom prompts bằng `prompt.multiPickPresets`, `prompt.confirm`, `prompt.conflictChoice`
    - Build `tasks: TaskDef<InitTaskContext>[]` từ `buildInitTasks(presets, opts, prompt)` với chuỗi: Load presets → Plan → Write workspace files → Configure Powers (skip nếu disabled) → Write tracking metadata
    - Run `runner.run(initialContext(...))` và call `screens.summary(result)` khi xong
    - On error: call `screens.errorBox(err)` và `process.exit(1)`
    - On SIGINT: cleanup và `process.exit(130)`
    - UI_Layer không import core; init.ts là cầu nối duy nhất giữa Core và UI
    - _Requirements: 6.1, 8.8, 10.1, 11.4, 11.5, 11.6, 14.1, 14.2, 14.3, 14.4_

  - [ ]* 11.2 Property test cho UI ↔ Core isolation
    - **Property: src/ui/* không có file nào import từ src/core/* (kiểm tra qua AST/grep test)**
    - **Validates: Requirements 14.1, 14.3**

- [ ] 12. Implement Postinstall script
  - [x] 12.1 Tạo `packages/cli/scripts/postinstall.js` plain JS (không qua tsup)
    - Implement theo `Algorithm: postinstallEntry` trong design
    - Outer try/catch nuốt mọi exception, luôn `process.exit(0)`
    - Tôn trọng `KIRO_KIT_SKIP_POSTINSTALL` thì exit 0 ngay không in gì
    - CI hoặc non-TTY thì in plain `kiro-kit <version> installed.\nNext: npx kiro-kit init\n`
    - Interactive TTY thì render simple box (purple title qua truecolor ANSI inline) chứa version + Next + Docs + 6 preset names
    - NO_COLOR thì không phát byte `\x1B[`
    - Không import figlet/boxen/ora/listr2/prompts/terminal-link/gradient-string
    - Output <= 600 bytes và <= 12 dòng
    - Đọc version từ `../package.json` qua `require()`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 11.8_

  - [x] 12.2 Update `package.json`: thêm `scripts.postinstall` và `files`
    - Thêm `"postinstall": "node scripts/postinstall.js"` vào `scripts`
    - Thêm `"scripts/postinstall.js"` vào `files` array để package được publish kèm script
    - _Requirements: 5.1_

  - [ ]* 12.3 Property test cho Postinstall safety
    - **Property 5: Postinstall không bao giờ throw / exit non-zero với mọi env**
    - **Validates: Requirements 5.1, 11.8**

  - [ ]* 12.4 Unit/E2E test cho Postinstall
    - Test: spawn `node scripts/postinstall.js` với `CI=true` thì stdout chứa "npx kiro-kit init", exit 0 (Req 5.4)
    - Test: spawn với `NO_COLOR=1` thì stdout không chứa `\x1B[` (Req 5.6)
    - Test: spawn với `KIRO_KIT_SKIP_POSTINSTALL=1` thì stdout rỗng, exit 0 (Req 5.3)
    - _Requirements: 5.3, 5.4, 5.6_

- [x] 13. Checkpoint - Wire-up xong
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. E2E và performance verification
  - [ ]* 14.1 E2E test init UI flow
    - Spawn `node dist/index.js init --yes --preset=frontend` trong tempdir
    - Assert stdout contains "kiro-kit" và summary marker
    - Assert exit code 0; assert files được write
    - _Requirements: 6.1, 10.1_

  - [ ]* 14.2 E2E test capability fallback
    - Spawn cùng test với `NO_COLOR=1` thì assert output không chứa `\x1B[`
    - Spawn với `CI=true` thì assert TaskRunner dùng simple renderer (output chứa `->` patterns)
    - _Requirements: 1.2, 8.3_

  - [ ]* 14.3 Performance test cold start
    - Measure `kiro-kit --version`: <= 80ms trên Node 18
    - Measure init đến welcome render: <= 250ms
    - Measure postinstall: <= 30ms
    - _Requirements: 13.3, 13.4, 13.5_

- [x] 15. Final checkpoint - Toàn bộ flow chạy đầy đủ
  - Ensure all tests pass, ask the user if questions arise.
  - Verify build: `cd packages/cli && npx tsup` thành công
  - Verify structural tests vẫn pass
  - Verify no orphan files trong manifest

## Notes

- Tasks marked với `*` là optional (test-related); skip nếu cần MVP nhanh
- Mỗi task tham chiếu requirements granular cụ thể (sub-clauses, không chỉ user story)
- Property tests P1-P6 từ design được phân bổ vào sub-tasks gần với implementation
- TypeScript là implementation language (theo design); test framework: vitest + fast-check
- Vendor packages pin exact versions (Req 13.1)
- UI layer thuần presentation, không import core (Req 14.1, 14.3)
- Postinstall không bao giờ fail npm install (Req 5.1, 11.8)
