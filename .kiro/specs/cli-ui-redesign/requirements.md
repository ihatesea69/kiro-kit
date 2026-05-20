# Requirements Document

## Introduction

Tài liệu này định nghĩa các yêu cầu cho việc thiết kế lại lớp giao diện dòng lệnh (CLI) của `kiro-kit`. Mục tiêu là chuyển trải nghiệm `npx kiro-kit init` từ các `console.log` thô sang một flow trực quan với ASCII logo, gradient màu, themed boxes, task progress đẹp và success summary, đồng thời giữ nguyên semantic của các luồng nghiệp vụ hiện có (preset selection, conflict resolution, Powers prompts, MCP config, setup guide, tracking metadata).

Hệ thống tách rõ hai bề mặt: (1) một postinstall script nhẹ, không block cài đặt, không prompt; và (2) một rich UI layer chỉ kích hoạt cho `npx kiro-kit init` và mở rộng dần sang các command khác. Toàn bộ ANSI output đi qua một `TerminalCapability` detector tôn trọng `NO_COLOR`, `--no-color`, non-TTY, `CI`, `TERM=dumb`, có ASCII fallback cho mỗi component.


## Glossary

- **CLI**: Command-line interface của `kiro-kit`, được khởi chạy thông qua `npx kiro-kit <command>`.
- **Postinstall_Script**: Script `scripts/postinstall.js` được npm gọi tự động sau khi `npm install kiro-kit` hoàn tất.
- **UI_Layer**: Module presentation thuần tại `src/ui/`, không gọi vào core, chỉ nhận data và callback.
- **Capability_Detector**: Hàm `detectCapability(env, argv, stream)` trả về object `TerminalCapability` mô tả khả năng render của terminal hiện tại.
- **TerminalCapability**: Object immutable gồm 7 field: `isTTY`, `color`, `truecolor`, `unicode`, `hyperlink`, `animate`, `columns`.
- **Theme_Builder**: Hàm `createTheme(capability, palette?)` trả về `ThemeTokens` để render màu/style theo capability.
- **Logo_Renderer**: Component render ASCII logo (figlet) với gradient màu, có compact fallback cho terminal hẹp hoặc non-unicode.
- **Themed_Box**: Component render box có border tím với padding, title và variant (info, tip, success, warn, error).
- **Task_Runner**: Component hiển thị task progress dạng list (spinner + check/cross) dùng `listr2`, có simple renderer fallback.
- **Spinner**: Component spinner ngắn (`ora`) cho thao tác không nằm trong Task_Runner.
- **Themed_Prompt**: Wrapper `prompts` cho multi-select preset, single-select tier, confirm, conflict-choice.
- **Init_Screens**: Tập các "màn hình" (welcome, summary, errorBox) compose từ các UI component.
- **Vendor_Adapter**: Module `src/ui/vendor.ts` cung cấp lazy dynamic-import isolation cho thư viện bên ngoài.
- **Core**: Các module business logic không thuộc UI: `PresetLoader`, `ConflictResolver`, `PowersLoader`, `MCPConfigurator`, `TrackingStore`, `BackupManager`.
- **Tip_Text**: Nội dung hiển thị trong "Did you know?" box, là hằng số định nghĩa trong source.
- **Setup_Guide**: File `.kiro/POWERS-SETUP.md` được sinh ra khi Powers được cấu hình.


## Requirements

### Requirement 1: Phát hiện khả năng terminal

**User Story:** As a CLI user trên nhiều môi trường (TTY, CI, pipe, Windows cmd), I want hệ thống tự phát hiện khả năng render của terminal, so that output luôn được fallback đúng cách thay vì in raw ANSI gây lỗi.

#### Acceptance Criteria

1. WHEN `detectCapability(env, argv, stream)` được gọi, THE Capability_Detector SHALL trả về object `TerminalCapability` chứa đủ 7 field: `isTTY`, `color`, `truecolor`, `unicode`, `hyperlink`, `animate`, `columns`.
2. IF `env.NO_COLOR` được set với giá trị khác rỗng OR `argv` chứa `--no-color`, THEN THE Capability_Detector SHALL đặt `color = false` AND `truecolor = false`.
3. IF `stream.isTTY` là false AND `env.FORCE_COLOR` không được set, THEN THE Capability_Detector SHALL đặt `color = false` AND `animate = false`.
4. IF `env.CI` được set với giá trị khác rỗng AND `env.FORCE_COLOR` không được set, THEN THE Capability_Detector SHALL đặt `animate = false`.
5. WHEN `env.COLORTERM` có giá trị `truecolor` hoặc `24bit`, THE Capability_Detector SHALL đặt `truecolor = true`.
6. WHEN `stream.columns` nhỏ hơn 20, THE Capability_Detector SHALL clamp `columns` lên giá trị 80.
7. THE Capability_Detector SHALL đảm bảo invariant `truecolor === true` kéo theo `color === true` trong mọi giá trị trả về.
8. THE Capability_Detector SHALL đảm bảo invariant `animate === true` kéo theo `isTTY === true` trong mọi giá trị trả về.
9. THE Capability_Detector SHALL không mutate `env`, `argv`, hoặc `stream` truyền vào.
10. WHEN platform là `win32` AND cả `env.WT_SESSION` AND `env.TERM_PROGRAM` đều undefined, THE Capability_Detector SHALL đặt `unicode = false`.
11. IF `env.TERM` có giá trị `dumb`, THEN THE Capability_Detector SHALL đặt `unicode = false`.

### Requirement 2: Theme và token màu

**User Story:** As a CLI developer, I want một theme builder tập trung quản lý palette và style primitives, so that các UI component có thể render màu nhất quán và testable.

#### Acceptance Criteria

1. WHEN `createTheme(capability, palette?)` được gọi với palette hợp lệ, THE Theme_Builder SHALL trả về `ThemeTokens` chứa các method: `heading`, `command`, `flag`, `pathStyle`, `success`, `danger`, `muted`, `link`, `logoGradient`.
2. IF bất kỳ field nào trong `palette` không match regex `/^#[0-9a-fA-F]{6}$/`, THEN THE Theme_Builder SHALL reject palette với error mô tả field vi phạm.
3. IF `palette.primary` bằng `palette.secondary`, THEN THE Theme_Builder SHALL reject palette để đảm bảo gradient có ý nghĩa.
4. WHILE `capability.color === false`, THE Theme_Builder SHALL trả về các style method là identity function sao cho output `strip-ansi(method(s))` bằng `s`.
5. WHILE `capability.truecolor === false` AND `capability.color === true`, THE Theme_Builder SHALL fallback xuống ANSI 256 cho các method màu.
6. WHEN `theme.link(label, url)` được gọi AND `capability.hyperlink === true`, THE Theme_Builder SHALL emit OSC-8 hyperlink sequence chứa `url`.
7. WHEN `theme.link(label, url)` được gọi AND `capability.hyperlink === false`, THE Theme_Builder SHALL trả về string chứa cả `label` AND `url` dưới dạng plain text.

### Requirement 3: ASCII logo

**User Story:** As a CLI user, I want thấy ASCII logo `kiro-kit` lớn với gradient tím-xanh khi mở init flow, so that trải nghiệm cảm thấy "premium" và dễ nhận diện thương hiệu.

#### Acceptance Criteria

1. WHEN `Logo.render(opts)` được gọi với `capability.unicode === true` AND `capability.color === true` AND `capability.columns >= 60`, THE Logo_Renderer SHALL trả về figlet ASCII art với gradient áp dụng từ `theme.logoGradient`.
2. WHEN `Logo.render(opts)` được gọi với `capability.color === false`, THE Logo_Renderer SHALL trả về figlet plain text không chứa byte ANSI escape `\x1B[`.
3. WHEN `capability.unicode === false` OR `capability.columns < 60`, THE Logo_Renderer SHALL trả về compact form `kiro-kit vX.Y.Z` cộng với subtitle.
4. THE Logo_Renderer SHALL trả về string không rỗng trong mọi cấu hình capability.
5. WHEN `capability.unicode === false`, THE Logo_Renderer SHALL đảm bảo output chỉ chứa ASCII byte (mã <= 0x7F).
6. THE Logo_Renderer SHALL không in trực tiếp ra stdout, chỉ trả về string cho caller.
7. WHEN `opts.font` không được cung cấp, THE Logo_Renderer SHALL dùng font mặc định `ANSI Shadow`.

### Requirement 4: Themed box

**User Story:** As a CLI user, I want các thông tin (Did you know, Success, Warning, Error) được hiển thị trong box có border màu rõ ràng, so that tôi dễ phân biệt loại thông tin và đọc nội dung.

#### Acceptance Criteria

1. WHEN `ThemedBox.render(content, opts)` được gọi, THE Themed_Box SHALL trả về string chứa border bao quanh `content` cộng padding theo `opts.padding`.
2. THE Themed_Box SHALL map `opts.variant` sang `borderColor` theo bảng: `info` → primary, `tip` → secondary, `success` → success, `warn` → warn, `error` → danger.
3. WHEN `capability.unicode === false`, THE Themed_Box SHALL dùng border style `classic` với ký tự `+`, `-`, `|`.
4. WHEN `capability.unicode === true`, THE Themed_Box SHALL dùng border style `round`.
5. THE Themed_Box SHALL đảm bảo độ rộng visible của mọi dòng output không vượt quá `min(capability.columns - 4, 80)` khi `opts.width` không được cung cấp.
6. WHEN `opts.title` được cung cấp, THE Themed_Box SHALL render title trên border top.
7. THE Themed_Box SHALL wrap `content` sao cho mỗi dòng đã wrap có visible width <= `opts.width - 2 * opts.padding - 2`.

### Requirement 5: Postinstall script nhẹ

**User Story:** As a npm user vừa chạy `npm install kiro-kit`, I want thấy một welcome message ngắn gọn với hint command kế tiếp, so that tôi biết phải làm gì tiếp mà không bị block install hay prompt.

#### Acceptance Criteria

1. THE Postinstall_Script SHALL luôn thoát với exit code 0 trong mọi tình huống bao gồm lỗi runtime.
2. THE Postinstall_Script SHALL không import figlet, gradient-string, boxen, ora, listr2, prompts, hoặc terminal-link.
3. IF `env.KIRO_KIT_SKIP_POSTINSTALL` được set, THEN THE Postinstall_Script SHALL exit 0 ngay mà không in gì.
4. IF `env.CI` được set OR `stream.isTTY === false`, THEN THE Postinstall_Script SHALL in plain text dạng `kiro-kit <version> installed.\nNext: npx kiro-kit init\n` AND không render box.
5. WHEN chạy trong interactive TTY không phải CI, THE Postinstall_Script SHALL render một welcome box gọn chứa version, hint `npx kiro-kit init`, link docs `https://github.com/ihatesea69/kiro-kit`, AND danh sách 6 preset names.
6. WHEN `env.NO_COLOR` được set OR `stream.isTTY === false`, THE Postinstall_Script SHALL không phát byte ANSI escape `\x1B[` ra stdout.
7. THE Postinstall_Script SHALL không tạo prompt AND không đọc từ stdin.
8. THE Postinstall_Script SHALL giới hạn tổng kích thước output <= 600 bytes AND <= 12 dòng.

### Requirement 6: Welcome screen cho init

**User Story:** As a CLI user chạy `npx kiro-kit init`, I want thấy welcome screen gồm logo, "Did you know?" box và danh sách command, so that tôi có ngữ cảnh trước khi chọn presets.

#### Acceptance Criteria

1. WHEN init command bắt đầu chạy, THE UI_Layer SHALL render welcome screen theo thứ tự: Logo, dòng trống, "Did you know?" box, dòng trống, heading "Available commands", danh sách command.
2. THE UI_Layer SHALL render Logo bằng `Logo_Renderer` với `text = 'kiro-kit'`, `version = cliVersion`, `subtitle = 'Engineer-grade Kiro presets'`.
3. THE UI_Layer SHALL render "Did you know?" content trong `Themed_Box` với `variant = 'tip'`.
4. THE UI_Layer SHALL hiển thị tối thiểu 4 command: `init`, `add`, `list`, `doctor` cùng description ngắn cho mỗi command.
5. THE UI_Layer SHALL render mỗi command dòng dạng `  <name>` padded 20 ký tự cộng `<description>` được muted-styled.
6. WHILE `capability.color === false`, THE UI_Layer SHALL render welcome screen mà output sau strip-ansi giữ nguyên cấu trúc nội dung.

### Requirement 7: Themed prompt cho preset selection và conflict resolution

**User Story:** As a CLI user, I want các prompt (chọn presets, confirm, conflict choice) được render với theme nhất quán và có hành vi xác định khi non-TTY, so that flow init làm việc trên cả terminal tương tác và pipe/CI.

#### Acceptance Criteria

1. WHEN `prompt.multiPickPresets(items)` được gọi với `items.length >= 1`, THE Themed_Prompt SHALL trả về subset các `item.name` mà user chọn.
2. IF `capability.isTTY === false`, THEN THE Themed_Prompt SHALL trả về `[]` ngay từ `multiPickPresets` mà không block.
3. IF `capability.isTTY === false`, THEN THE Themed_Prompt SHALL trả về giá trị `defaultYes` từ `confirm` mà không block.
4. IF `capability.isTTY === false`, THEN THE Themed_Prompt SHALL trả về `'skip'` từ `conflictChoice` mà không block.
5. WHEN user nhấn Ctrl+C trong khi prompt đang hiển thị, THE Themed_Prompt SHALL reject với `Error('SIGINT')`.
6. WHEN `prompt.confirm(message, defaultYes)` được gọi trong TTY, THE Themed_Prompt SHALL hiển thị message AND chấp nhận `y`/`n` input.
7. WHILE prompt đang chạy, THE Themed_Prompt SHALL tự cleanup raw mode trước khi reject với SIGINT.
8. THE Themed_Prompt SHALL yêu cầu mỗi `item.name` trong `multiPickPresets` là duy nhất.

### Requirement 8: Task runner cho init flow

**User Story:** As a CLI user, I want thấy progress của các bước init (load presets, write files, configure Powers, write tracking) qua spinner/check, so that tôi biết flow đang làm gì và bước nào fail.

#### Acceptance Criteria

1. WHEN `taskRunner.run(ctx)` được gọi với `tasks.length >= 1`, THE Task_Runner SHALL chạy từng task tuần tự AND resolve với `ctx` cuối cùng nếu không có task fail không-recoverable.
2. WHILE `capability.animate === true` AND `capability.color === true`, THE Task_Runner SHALL dùng `listr2` renderer mặc định hiển thị spinner cho task running, dấu check cho ok, dấu cross cho fail.
3. WHILE `capability.animate === false` OR `capability.isTTY === false`, THE Task_Runner SHALL dùng renderer `simple` in tuần tự dạng `-> task name ... done`.
4. WHEN một task throw error không phải SIGINT, THE Task_Runner SHALL reject với error đính kèm `taskTitle` của task fail.
5. WHEN Task_Runner reject, THE Task_Runner SHALL stop tất cả spinner đã start để không leak ANSI sequence.
6. THE Task_Runner SHALL đảm bảo `ctx.filesWritten + ctx.filesSkipped` chỉ tăng monotonic qua các task.
7. WHEN `task.skip(ctx)` trả true hoặc string, THE Task_Runner SHALL skip task đó AND tiếp tục với task kế.
8. WHEN init flow chạy, THE Task_Runner SHALL execute tối thiểu các task: Load presets, Plan operations, Write workspace files, Configure Powers (skip nếu disabled), Write tracking metadata.
9. THE Task_Runner SHALL không re-render nhanh hơn 100ms một lần.

### Requirement 9: Spinner

**User Story:** As a CLI user, I want spinner ngắn cho các thao tác async không thuộc task list, so that tôi biết app đang busy chứ không bị treo.

#### Acceptance Criteria

1. WHEN `spinner.start(text)` được gọi với `capability.animate === true`, THE Spinner SHALL hiển thị spinner animation cùng `text`.
2. WHILE `capability.animate === false`, THE Spinner SHALL khi `start(text)` in dòng `-> {text}`, khi `succeed(text)` in `[ok] {text}`, khi `fail(text)` in `[x] {text}`.
3. WHEN process nhận signal exit, THE Spinner SHALL tự gọi `stop()` để cleanup.
4. WHEN `spinner.setText(text)` được gọi sau `start`, THE Spinner SHALL cập nhật text hiển thị.

### Requirement 10: Success summary

**User Story:** As a CLI user vừa hoàn tất init, I want thấy summary box gồm số file đã viết, presets đã cài, đường dẫn setup guide và next steps, so that tôi biết kết quả và bước kế tiếp.

#### Acceptance Criteria

1. WHEN init flow hoàn tất thành công, THE UI_Layer SHALL render summary trong `Themed_Box` với `variant = 'success'`.
2. THE UI_Layer SHALL hiển thị trong summary: số `filesWritten`, số `filesSkipped`, danh sách `presets`, đường dẫn `setupGuidePath` (nếu được viết), đường dẫn `envExamplePath` (nếu được viết), danh sách `nextSteps`, link `docsUrl`.
3. WHEN `setupGuidePath` undefined, THE UI_Layer SHALL omit dòng setup guide khỏi summary.
4. WHEN `envExamplePath` undefined, THE UI_Layer SHALL omit dòng env example khỏi summary.
5. THE UI_Layer SHALL render `docsUrl` qua `theme.link(label, url)` để dùng OSC-8 hyperlink khi capability cho phép.

### Requirement 11: Error handling và xử lý lỗi

**User Story:** As a CLI user, I want các lỗi (vendor module fail, task fail, SIGINT, terminal hẹp) được xử lý gracefully với thông điệp rõ ràng, so that tôi biết nguyên nhân và cách phục hồi.

#### Acceptance Criteria

1. IF dynamic-import vendor module (figlet, boxen, ora, listr2, prompts, terminal-link, gradient-string, chalk) throw, THEN THE Vendor_Adapter SHALL catch error AND mark capability flag tương ứng là false AND không abort flow.
2. IF Logo_Renderer phát hiện vendor figlet/gradient-string không khả dụng, THEN THE Logo_Renderer SHALL fallback compact form.
3. IF Themed_Box phát hiện vendor boxen không khả dụng, THEN THE Themed_Box SHALL fallback ASCII border tự code.
4. WHEN Task_Runner reject với error không-recoverable, THE Init_Screens SHALL gọi `errorBox(err)` chính xác một lần để render error box variant `error` chứa `err.message`.
5. WHEN Task_Runner reject với error không-recoverable, THE CLI SHALL exit với mã 1.
6. WHEN user nhấn Ctrl+C bất kỳ lúc nào, THE CLI SHALL cleanup spinner/raw mode AND exit với mã 130.
7. IF `capability.columns < 40`, THEN THE Logo_Renderer SHALL dùng compact mode AND THE Themed_Box SHALL set padding xuống 0 AND THE Task_Runner SHALL force renderer `simple`.
8. THE Postinstall_Script SHALL có outer try/catch nuốt mọi exception AND luôn exit 0.

### Requirement 12: Sanitize input để render

**User Story:** As a CLI user, I want hệ thống không in raw ANSI escape từ filesystem path hoặc nội dung không kiểm soát, so that không bị tấn công ANSI injection.

#### Acceptance Criteria

1. WHEN UI_Layer render một string đến từ filesystem path, THE UI_Layer SHALL strip byte `\x1B` AND `\x9B` trước khi render.
2. THE UI_Layer SHALL chỉ render `tipText`, command descriptions, AND `nextSteps` từ hằng số định nghĩa trong source.
3. WHEN `theme.link(label, url)` được gọi, THE Theme_Builder SHALL chấp nhận `url` chỉ với scheme `https://` hoặc `mailto:`.
4. IF `url` truyền vào `theme.link` không match scheme cho phép, THEN THE Theme_Builder SHALL throw error mô tả URL bị reject.

### Requirement 13: Vendor lazy import isolation

**User Story:** As a CLI maintainer, I want các thư viện UI nặng được lazy-load qua một adapter duy nhất, so that các command nhẹ (`--version`, `list`) không trả phí cold-start.

#### Acceptance Criteria

1. THE Vendor_Adapter SHALL load figlet, gradient-string, boxen, ora, listr2, prompts, terminal-link, chalk qua `await import()` khi component cần dùng.
2. THE UI_Layer SHALL không có module trong `src/ui/` import đồng bộ (top-level `import`) các vendor module nặng nói trên.
3. WHEN command `kiro-kit --version` chạy, THE CLI SHALL hoàn tất trong tối đa 80ms cold start trên Node 18.
4. WHEN init command bắt đầu chạy đến lúc render welcome screen, THE CLI SHALL hoàn tất chuẩn bị trong tối đa 250ms cold start trên Node 18.
5. WHEN Postinstall_Script chạy, THE CLI SHALL hoàn tất trong tối đa 30ms.

### Requirement 14: Tách presentation khỏi core

**User Story:** As a CLI maintainer, I want UI layer thuần presentation không gọi core, so that core có thể test độc lập và UI có thể swap mà không ảnh hưởng business logic.

#### Acceptance Criteria

1. THE UI_Layer SHALL không import bất kỳ module nào từ `PresetLoader`, `ConflictResolver`, `PowersLoader`, `MCPConfigurator`, `TrackingStore`, `BackupManager`.
2. THE UI_Layer SHALL nhận data và callback qua parameter của các method (ví dụ `TaskDef.run`, `WelcomeData`, `SummaryData`).
3. THE Core SHALL không import bất kỳ module nào từ `src/ui/`.
4. WHEN init command orchestrate flow, THE init.ts SHALL là nơi duy nhất kết nối Core với UI_Layer.
