# Tài Liệu Yêu Cầu (Requirements Document)

## Giới thiệu

**KK-Kiro-Kit** là một bộ công cụ kết hợp giữa GitHub repository và npm CLI tool, cho phép người dùng Kiro khởi tạo workspace một cách tức thì với một bộ artifacts được tuyển chọn ở quy mô engineer-grade.

Người dùng chỉ cần dán link GitHub của repository vào Kiro chat. Kiro nhận diện link, gợi ý chạy lệnh `npx kiro-kit init`. CLI sau đó hiển thị giao diện tương tác cho phép chọn nhiều preset (Frontend, Backend, Fullstack, Mobile, DevOps, Data/AI), gộp các artifacts một cách thông minh và sinh ra cấu trúc thư mục `.kiro/` hoàn chỉnh trong workspace của người dùng.

**Phạm vi mở rộng (Full Parity):** KK-Kiro-Kit, khi xây dựng đầy đủ, chứa **6 preset hoàn toàn độc lập** (self-contained), mỗi preset là một bộ kit "engineer-grade" có nội dung đầy đủ ngang hàng với bộ kit tham chiếu Claude Code (`.claude/`). Mỗi preset cài đặt vào workspace của người dùng tạo ra một cấu trúc `.kiro/` song song với `.claude/` (parallel namespace mirror), bao gồm: agents, skills (Powers), commands có phân cấp 1-3 lớp, hooks đa nền tảng, workflows luôn-bật, steering, settings, statusline, metadata, và các file env example đa cấp.

Mỗi preset chứa **bộ artifacts đầy đủ riêng** (không chia sẻ core) gồm tối thiểu: 12-16 agents, 20-30 skills, 25+ commands (có nesting 1-3 cấp), 6+ hooks (có biến thể đa nền tảng), 4 workflow files, 1 metadata.json, 1 bộ statusline triple, 1 settings.json, 1 .mcp.json.example, 1 .env.example. Nội dung được điều chỉnh theo ngữ cảnh (Frontend tập trung React/Next; Backend tập trung Node/Python/Go; v.v.) nhưng skeleton cấu trúc giống nhau giữa 6 preset.

Sản phẩm cuối cùng phải là một repository production-ready, sẵn sàng push lên GitHub và publish npm package, với đầy đủ tài liệu, CI/CD, license, và 6 preset có nội dung thực tế (không phải stub).

## Glossary

- **Kiro**: Môi trường phát triển AI-powered nơi người dùng làm việc với agents.
- **KK-Kiro-Kit / Kit**: Tên gọi chung của dự án (GitHub repo + npm package).
- **CLI**: Công cụ dòng lệnh `kiro-kit` được phân phối qua npm.
- **Preset**: Một bộ artifacts hoàn chỉnh, độc lập, được tuyển chọn cho một loại dự án cụ thể (ví dụ: Frontend, Backend). Có 6 preset chính thức, mỗi preset là một full kit riêng biệt.
- **Self-contained Preset**: Preset chứa bản sao đầy đủ của mọi loại artifact, không phụ thuộc shared core; cài đặt một preset duy nhất đã đủ tạo workspace hoàn chỉnh.
- **Artifact**: Một loại tài nguyên mà preset cung cấp (steering file, hook, MCP config, skill/power, agent, command, workflow file, statusline, metadata, settings, env example, spec template, docs template).
- **Manifest**: File `manifest.json` trong mỗi preset, mô tả các artifacts mà preset cung cấp cùng metadata.
- **Workspace**: Thư mục dự án của người dùng, nơi CLI sinh ra `.kiro/`.
- **Parallel Namespace Mirror**: Cấu trúc `.kiro/` được tổ chức song song với `.claude/` (cùng tên thư mục con: agents/, skills/, commands/, hooks/, workflows/, steering/, settings/) để Kiro nhận diện và sử dụng các artifact tương tự cách Claude Code dùng `.claude/`.
- **Steering File**: File markdown trong `.kiro/steering/` định nghĩa coding rules, conventions, workflows có điều kiện (manual/fileMatch/always).
- **Workflow File**: File markdown trong `.kiro/workflows/` được luôn inject vào agent context (always-on), khác với steering ở chỗ workflows không có inclusion conditional.
- **Agent**: File `.md` trong `.kiro/agents/` với YAML front-matter, định nghĩa một agent tuỳ chỉnh có system prompt, tool whitelist, và metadata invocation.
- **Skill / Power**: Một thư mục trong `.kiro/skills/<skill-name>/` chứa `SKILL.md` (hoặc `skill.md`) với front-matter, kèm các thư mục tuỳ chọn `references/`, `scripts/`, `assets/`, `tests/`, hỗ trợ progressive disclosure (SKILL.md ngắn gọn, references/ chi tiết).
- **Sub-skill Container**: Skill folder không có `SKILL.md` riêng mà chứa nhiều sub-skill, mỗi sub-skill có `SKILL.md` riêng (ví dụ `document-skills/docx/`, `document-skills/pdf/`).
- **Command**: File `.md` trong `.kiro/commands/[<group>/[<subgroup>/]]<name>.md` với YAML front-matter, hỗ trợ nesting 1-3 cấp; sử dụng `$1`, `$2` làm placeholder argument.
- **Hook**: File trong `.kiro/hooks/` định nghĩa automation triggers (PreToolUse, PostToolUse, fileEdited, agentStop, v.v.). Một hook script có thể có 3 biến thể đa nền tảng: `.js` (Node), `.sh` (bash), `.ps1` (PowerShell).
- **Cross-platform Script (Tri-script)**: Bộ ba script `<name>.js` + `<name>.sh` + `<name>.ps1` cho cùng một logic, dùng cho hooks và statusline để hoạt động trên Windows/macOS/Linux.
- **Statusline**: Bộ script tại `.kiro/statusline.js`, `.kiro/statusline.sh`, `.kiro/statusline.ps1` xuất một dòng thông tin trạng thái (branch, time, project name) được Kiro hiển thị; được khai báo qua `settings.json` field `statusLine.command`.
- **MCP Server**: Model Context Protocol server, cấu hình trong `.kiro/settings/mcp.json` (canonical) và `.kiro/.mcp.json.example` (template với placeholder).
- **Settings File (`settings.json`)**: File cấu hình chung tại `.kiro/settings.json` đăng ký hooks, statusLine, và preferences chung; phân biệt với `settings/mcp.json` chuyên biệt cho MCP.
- **Metadata File (`metadata.json`)**: File `.kiro/metadata.json` chứa thông tin phiên bản preset, build date, repository, danh sách preset đã cài, kit version.
- **Spec Template**: Template cho requirements/design/tasks trong `.kiro/specs/_templates/<preset-name>/`.
- **Docs Template**: Template cho `docs/code-standards.md`, `docs/system-architecture.md`, `docs/project-roadmap.md`.
- **Backup Directory**: Thư mục `.kiro/.backup/<timestamp>/` chứa các file đã bị ghi đè.
- **Conflict Resolution**: Quy trình xử lý xung đột khi file đã tồn tại tại đích.
- **Merge**: Quy trình gộp nhiều preset thành cấu hình duy nhất.
- **Idempotency**: Tính chất chạy nhiều lần cho ra cùng kết quả.
- **Tracking File**: File `.kiro/.kiro-kit.json` lưu danh sách preset đã cài, version, timestamp, và file managed bởi kit; dùng cho `update`, `restore`, `doctor`.
- **Progressive Disclosure**: Nguyên tắc tổ chức skill: SKILL.md ngắn gọn (token-efficient), thông tin chi tiết nằm trong `references/` chỉ load khi cần.

## Yêu cầu (Requirements)

### Requirement 1: Trải nghiệm "Paste Link → Bootstrap"

**User Story:** Là một Kiro user, tôi muốn dán link GitHub của KK-Kiro-Kit vào Kiro chat và được hướng dẫn khởi tạo workspace ngay lập tức, để tôi có thể bắt đầu dự án mới với cấu hình tốt nhất mà không cần đọc tài liệu dài.

#### Acceptance Criteria

1. THE Repository SHALL chứa một file `README.md` ở root với section "Quick Start" trình bày lệnh khởi tạo `npx kiro-kit init` ở vị trí trên cùng (above-the-fold).
2. THE Repository SHALL cung cấp metadata GitHub (description, topics, badges) cho phép Kiro nhận diện đây là một bootstrap kit.
3. WHEN người dùng dán link GitHub của repository vào Kiro chat, THE Repository SHALL trình bày README đủ rõ để Kiro có thể gợi ý lệnh `npx kiro-kit init` cho người dùng.
4. THE README SHALL chứa một bảng liệt kê 6 preset chính thức kèm mô tả ngắn gọn (một câu) về mục đích của từng preset.
5. THE README SHALL chứa các badges sau ở đầu file: build status, npm version, license, npm downloads, node version. Các badge phải sử dụng SVG từ shields.io.
6. THE README SHALL không chứa bất kỳ emoji nào trong toàn bộ nội dung.

### Requirement 2: Phân phối CLI qua npm

**User Story:** Là một developer, tôi muốn cài đặt và chạy CLI qua `npx` mà không cần cài global, để tôi luôn nhận phiên bản mới nhất và không làm bẩn môi trường global.

#### Acceptance Criteria

1. THE NPM_Package SHALL được publish với tên `kiro-kit` trên npm registry.
2. THE NPM_Package SHALL khai báo `bin` trong `package.json` ánh xạ tên `kiro-kit` tới entry point của CLI.
3. WHEN người dùng chạy `npx kiro-kit <command>`, THE CLI SHALL thực thi command tương ứng.
4. THE NPM_Package SHALL hỗ trợ Node.js phiên bản 18 trở lên, được khai báo qua field `engines.node` trong `package.json`.
5. THE NPM_Package SHALL được build dưới dạng ESM (ECMAScript Modules).
6. IF người dùng chạy CLI trên Node.js phiên bản dưới 18, THEN THE CLI SHALL in thông báo lỗi rõ ràng nêu rõ phiên bản tối thiểu và thoát với exit code 1.

### Requirement 3: Lệnh `init` - Khởi tạo Tương tác

**User Story:** Là một Kiro user, tôi muốn chạy `npx kiro-kit init` để được hướng dẫn từng bước chọn preset và sinh ra `.kiro/`, để tôi có thể tùy biến cấu hình theo nhu cầu dự án.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit init` trong một workspace, THE CLI SHALL hiển thị prompt tương tác cho phép chọn nhiều preset từ danh sách 6 preset chính thức.
2. THE Init_Command SHALL cho phép người dùng chọn ít nhất một preset trước khi tiếp tục.
3. IF người dùng không chọn preset nào, THEN THE Init_Command SHALL hiển thị thông báo và thoát với exit code 0 mà không tạo file nào.
4. WHEN người dùng đã chọn xong preset, THE Init_Command SHALL hiển thị tóm tắt các file sẽ được sinh ra và yêu cầu xác nhận trước khi ghi.
5. WHEN người dùng xác nhận, THE Init_Command SHALL sinh các file vào `.kiro/` và các thư mục đích tương ứng (ví dụ `docs/`).
6. WHEN quá trình init hoàn tất thành công, THE Init_Command SHALL thoát với exit code 0 và in thông báo tóm tắt số file đã tạo.
7. IF người dùng huỷ prompt (Ctrl+C), THEN THE Init_Command SHALL thoát với exit code 130 mà không ghi file nào.
8. WHERE người dùng truyền flag `--yes` hoặc `-y`, THE Init_Command SHALL bỏ qua xác nhận và sử dụng giá trị mặc định cho mọi prompt.
9. WHERE người dùng truyền flag `--preset <name>` (có thể nhiều lần), THE Init_Command SHALL bỏ qua bước chọn preset và dùng các preset được chỉ định.

### Requirement 4: Lệnh `add` - Bổ sung Preset

**User Story:** Là một Kiro user đã init kit trước đó, tôi muốn thêm một preset mới vào workspace hiện có, để mở rộng cấu hình mà không phải làm lại từ đầu.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit add <preset>`, THE Add_Command SHALL gộp artifacts của preset đó vào cấu hình hiện có trong `.kiro/`.
2. IF preset truyền vào không tồn tại trong danh sách preset hợp lệ, THEN THE Add_Command SHALL in thông báo lỗi liệt kê các preset hợp lệ và thoát với exit code 1.
3. IF người dùng chạy `add` mà chưa từng chạy `init`, THEN THE Add_Command SHALL tự động khởi tạo `.kiro/` và áp dụng preset như khi `init`.
4. WHEN một file của preset đã tồn tại trong workspace, THE Add_Command SHALL áp dụng quy tắc xử lý xung đột được định nghĩa tại Requirement 9.
5. THE Add_Command SHALL có hành vi tương đương `init` với cùng tập preset nếu chạy trên workspace trống (idempotency với init).

### Requirement 5: Lệnh `list` - Liệt kê Preset

**User Story:** Là một Kiro user, tôi muốn xem danh sách preset có sẵn để biết tôi có thể chọn gì.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit list`, THE List_Command SHALL in danh sách 6 preset chính thức kèm mô tả ngắn (một dòng) cho mỗi preset.
2. THE List_Command SHALL in tổng số artifact mà mỗi preset cung cấp (số agent, số skill, số command, số hook, số workflow, số MCP server, v.v.).
3. THE List_Command SHALL thoát với exit code 0 sau khi in xong.
4. WHERE người dùng truyền flag `--json`, THE List_Command SHALL in danh sách dưới dạng JSON hợp lệ thay vì văn bản.

### Requirement 6: Lệnh `info` - Chi tiết Preset

**User Story:** Là một Kiro user, tôi muốn xem chi tiết một preset cụ thể để biết chính xác nó cung cấp những file nào.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit info <preset>`, THE Info_Command SHALL in mô tả đầy đủ của preset, danh sách tất cả file mà preset cung cấp, và đường dẫn đích tương ứng trong workspace.
2. IF preset không tồn tại, THEN THE Info_Command SHALL in thông báo lỗi và thoát với exit code 1.
3. THE Info_Command SHALL in danh sách MCP server, hook name, command name, agent name, skill name, workflow name, và spec/docs template name mà preset cung cấp.
4. WHERE người dùng truyền flag `--json`, THE Info_Command SHALL in thông tin dưới dạng JSON hợp lệ.

### Requirement 7: Lệnh `update` - Cập nhật Preset

**User Story:** Là một Kiro user, tôi muốn cập nhật các preset đã cài lên phiên bản mới nhất, để nhận các cải tiến và sửa lỗi.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit update`, THE Update_Command SHALL phát hiện các preset đã cài trong workspace dựa trên file metadata `.kiro/.kiro-kit.json`.
2. THE Update_Command SHALL so sánh phiên bản preset đã cài với phiên bản trong CLI và liệt kê các file có thay đổi.
3. WHEN có file thay đổi, THE Update_Command SHALL áp dụng quy tắc xử lý xung đột (Requirement 9) cho từng file.
4. IF không có preset nào được cài trước đó, THEN THE Update_Command SHALL in thông báo và thoát với exit code 0.
5. WHEN cập nhật hoàn tất, THE Update_Command SHALL ghi phiên bản mới vào `.kiro/.kiro-kit.json`.

### Requirement 8: Lệnh `restore` - Khôi phục Backup

**User Story:** Là một Kiro user, tôi muốn khôi phục các file đã bị ghi đè khi quyết định không thích thay đổi mới, để tôi có thể quay về trạng thái trước.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit restore`, THE Restore_Command SHALL khôi phục từ backup mới nhất trong `.kiro/.backup/`.
2. IF không có backup nào tồn tại, THEN THE Restore_Command SHALL in thông báo và thoát với exit code 1.
3. WHERE người dùng truyền flag `--timestamp <ts>`, THE Restore_Command SHALL khôi phục từ backup có timestamp tương ứng.
4. WHEN restore hoàn tất, THE Restore_Command SHALL in danh sách file đã khôi phục và thoát với exit code 0.
5. THE Restore_Command SHALL không xoá thư mục backup sau khi restore (để cho phép restore lại nếu cần).
6. FOR ALL cặp thao tác (backup, restore), việc backup rồi restore SHALL tạo ra trạng thái workspace giống hệt trạng thái trước khi backup (round-trip property).

### Requirement 9: Xử lý Xung đột File (Conflict Resolution)

**User Story:** Là một Kiro user, tôi muốn được hỏi trước khi CLI ghi đè file đã tồn tại, để tránh mất công việc.

#### Acceptance Criteria

1. WHEN một file mà CLI định ghi đã tồn tại trong workspace với nội dung khác, THE CLI SHALL hiển thị prompt tương tác với 4 lựa chọn: `overwrite`, `skip`, `view diff`, `overwrite all`.
2. WHEN người dùng chọn `overwrite`, THE CLI SHALL sao chép file hiện tại vào `.kiro/.backup/<timestamp>/` trước khi ghi đè.
3. WHEN người dùng chọn `skip`, THE CLI SHALL bỏ qua file đó và tiếp tục với các file còn lại.
4. WHEN người dùng chọn `view diff`, THE CLI SHALL hiển thị unified diff giữa file hiện tại và file mới, sau đó hiển thị lại 3 lựa chọn còn lại.
5. WHEN người dùng chọn `overwrite all`, THE CLI SHALL áp dụng `overwrite` (kèm backup) cho tất cả các xung đột còn lại trong session hiện tại.
6. IF file mới có nội dung giống hệt file hiện tại, THEN THE CLI SHALL không hiển thị prompt và bỏ qua file (no-op).
7. WHERE người dùng truyền flag `--force`, THE CLI SHALL ghi đè tất cả file (kèm backup) mà không hiển thị prompt.
8. WHERE người dùng truyền flag `--skip-existing`, THE CLI SHALL bỏ qua tất cả file đã tồn tại mà không hiển thị prompt.
9. THE Backup_Directory SHALL có cấu trúc bảo toàn đường dẫn tương đối: `.kiro/.backup/<timestamp>/<original-relative-path>`.

### Requirement 10: Schema Manifest

**User Story:** Là một maintainer của KK-Kiro-Kit, tôi muốn mỗi preset có một manifest có cấu trúc rõ ràng, để CLI có thể parse và validate một cách tin cậy.

#### Acceptance Criteria

1. EACH Preset SHALL chứa file `manifest.json` ở thư mục gốc của preset.
2. THE Manifest SHALL có các field bắt buộc: `name` (string), `version` (semver string), `description` (string), `category` (enum: frontend/backend/fullstack/mobile/devops/data-ai), `files` (array of file entries).
3. EACH File_Entry trong manifest SHALL có các field: `source` (đường dẫn tương đối trong preset), `target` (đường dẫn tương đối trong workspace), `type` (enum: steering/hook/mcp/skill/agent/command/workflow/statusline/metadata/settings/env/spec/docs/other).
4. THE Manifest SHALL có thể có field tuỳ chọn: `dependencies` (array of preset names), `mcpServers` (object định nghĩa MCP servers), `hooks` (object định nghĩa hooks), `tags` (array of strings), `minCounts` (object khai báo ngưỡng tối thiểu cho từng loại artifact).
5. WHEN CLI load một preset, THE Manifest_Parser SHALL validate manifest theo schema và từ chối preset có manifest không hợp lệ.
6. IF manifest không hợp lệ, THEN THE Manifest_Parser SHALL trả về thông báo lỗi rõ ràng nêu field nào sai và lý do.
7. FOR ALL preset, mọi file được khai báo trong manifest `files` SHALL tồn tại trong thư mục preset.
8. FOR ALL preset, mọi file thực tế trong thư mục preset (trừ `manifest.json` và `README.md`) SHALL được khai báo trong manifest `files`.

### Requirement 11: Quy tắc Gộp MCP Servers

**User Story:** Là một Kiro user đã có sẵn cấu hình MCP servers, tôi muốn CLI gộp servers của preset vào cấu hình hiện có mà không xoá những gì tôi đã có, để bảo toàn cấu hình của tôi.

#### Acceptance Criteria

1. WHEN CLI ghi `.kiro/settings/mcp.json` và file đã tồn tại, THE MCP_Merger SHALL đọc nội dung hiện có và gộp với MCP servers từ preset.
2. WHEN một MCP server name xuất hiện ở cả file hiện có và preset, THE MCP_Merger SHALL giữ nguyên định nghĩa của file hiện có (user-priority).
3. THE MCP_Merger SHALL không xoá MCP server nào của người dùng mà preset không khai báo.
4. WHEN nhiều preset cung cấp cùng một MCP server name với cấu hình khác nhau, THE MCP_Merger SHALL chọn định nghĩa của preset được áp dụng cuối cùng và in cảnh báo.
5. THE MCP_Merger SHALL bảo toàn các field tuỳ chỉnh của user trong các MCP server đã có (ví dụ env vars, args).
6. THE Merged_MCP_File SHALL là JSON hợp lệ và pass validation theo schema MCP của Kiro.

### Requirement 12: Quy tắc Gộp Hooks và Settings

**User Story:** Là một Kiro user, tôi muốn CLI gộp hooks và settings từ nhiều preset mà không tạo trùng lặp hoặc xoá cấu hình của tôi, để workspace của tôi sạch sẽ và an toàn.

#### Acceptance Criteria

1. WHEN nhiều preset cung cấp hook có cùng tên file, THE Hook_Merger SHALL áp dụng quy tắc xử lý xung đột (Requirement 9).
2. THE Hook_Merger SHALL dedupe hooks dựa trên tên file (case-sensitive).
3. THE Hook_Merger SHALL bảo toàn các hook do người dùng tạo (không thuộc bất kỳ preset nào) bằng cách không động đến file không nằm trong manifest.
4. EACH installed hook SHALL được ghi tracking metadata vào `.kiro/.kiro-kit.json` (preset nguồn, version) để hỗ trợ `update` và `restore`.
5. WHEN gộp `settings.json` từ nhiều preset, THE Settings_Merger SHALL nối (concatenate) và dedupe các phần tử trong các array `hooks.PreToolUse` và `hooks.PostToolUse` dựa trên giá trị `command`.
6. WHEN gộp các field non-array trong `settings.json` (ví dụ `statusLine`, `includeCoAuthoredBy`), THE Settings_Merger SHALL áp dụng last-write-wins và in cảnh báo nêu preset nào đã ghi đè giá trị.
7. THE Settings_Merger SHALL không xoá field nào do người dùng thêm thủ công vào `settings.json`.

### Requirement 13: Cài đặt Steering Files

**User Story:** Là một Kiro user, tôi muốn các steering files được đặt vào đúng vị trí với metadata phù hợp, để Kiro tự động áp dụng chúng.

#### Acceptance Criteria

1. THE CLI SHALL ghi các steering files vào `.kiro/steering/` với tên file giữ nguyên từ preset.
2. EACH Steering_File SHALL có front-matter YAML hợp lệ tại đầu file với ít nhất các field: `inclusion` (enum: always/manual/fileMatch), `description` (string).
3. WHERE một steering file có `inclusion: fileMatch`, THE Steering_File SHALL có thêm field `fileMatchPattern` (glob string).
4. WHEN nhiều preset cung cấp steering file cùng tên, THE CLI SHALL áp dụng quy tắc xử lý xung đột (Requirement 9).
5. THE CLI SHALL không tự động sửa nội dung steering file có sẵn của user.

### Requirement 14: Tính Idempotency

**User Story:** Là một Kiro user, tôi muốn chạy lại `init` hoặc `add` nhiều lần mà không gây hỏng workspace, để tôi yên tâm khi thử nghiệm.

#### Acceptance Criteria

1. WHEN `kiro-kit init` được chạy hai lần liên tiếp với cùng tập preset và người dùng chọn `skip` cho mọi xung đột, THE Workspace_State SHALL giống trạng thái sau lần chạy đầu tiên.
2. WHEN `kiro-kit add <preset>` được chạy hai lần liên tiếp với cùng preset và người dùng chọn `skip` cho mọi xung đột, THE Workspace_State SHALL giống trạng thái sau lần chạy đầu tiên.
3. WHEN `kiro-kit init` chạy với cùng preset bằng `--skip-existing`, THE Result SHALL không sinh thêm file nào sau lần chạy đầu tiên thành công.
4. FOR ALL cặp preset (A, B) không có xung đột file, `init A` rồi `add B` SHALL cho ra trạng thái workspace giống hệt `init A B` (commutativity của merge với non-conflict).

### Requirement 15: Thứ tự Áp dụng và Tính Kết hợp (Associativity)

**User Story:** Là một maintainer, tôi muốn merge logic có tính chất toán học rõ ràng, để dễ kiểm thử và bảo trì.

#### Acceptance Criteria

1. FOR ALL preset (A, B, C) không có xung đột pairwise giữa các file, kết quả merge `(A merge B) merge C` SHALL bằng `A merge (B merge C)` (associative property).
2. FOR ALL preset (A, B) không có xung đột file, kết quả merge `A merge B` SHALL bằng `B merge A` (commutative property cho non-conflicting case).
3. WHEN có xung đột file giữa các preset, THE Merge_Order SHALL là thứ tự người dùng chọn trong prompt (left-to-right wins khi `--force`, hoặc tương tác khi không có flag).

### Requirement 16: Lệnh `doctor` - Chẩn đoán

**User Story:** Là một Kiro user, tôi muốn có một lệnh chẩn đoán nhanh khi gặp vấn đề, để biết nên sửa gì.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit doctor`, THE Doctor_Command SHALL kiểm tra các điều kiện sau và in kết quả pass/fail cho từng mục: (a) Node version >= 18, (b) `.kiro/` tồn tại, (c) `.kiro/settings/mcp.json` là JSON hợp lệ, (d) `.kiro/.kiro-kit.json` tồn tại và hợp lệ, (e) tất cả file được tracking đều tồn tại trên disk, (f) không có trailing whitespace trong steering front-matter, (g) `.kiro/metadata.json` là JSON hợp lệ, (h) statusline scripts có quyền execute (trên Unix).
2. WHEN tất cả kiểm tra pass, THE Doctor_Command SHALL in thông báo "All checks passed" và thoát với exit code 0.
3. WHEN có ít nhất một kiểm tra fail, THE Doctor_Command SHALL in danh sách lỗi cùng gợi ý sửa và thoát với exit code 1.
4. WHERE người dùng truyền flag `--fix`, THE Doctor_Command SHALL tự động sửa các lỗi sửa được (ví dụ format JSON, set executable bit) và in danh sách thay đổi đã thực hiện.

### Requirement 17: Telemetry và Quyền Riêng Tư

**User Story:** Là một Kiro user, tôi muốn CLI không gửi bất kỳ dữ liệu nào về server mà không có sự đồng ý của tôi, để bảo vệ quyền riêng tư.

#### Acceptance Criteria

1. THE CLI SHALL không gửi dữ liệu telemetry mặc định.
2. THE CLI SHALL không thu thập thông tin người dùng (username, hostname, IP, file paths) nếu chưa có opt-in tường minh.
3. WHERE người dùng chạy `kiro-kit telemetry enable`, THE CLI SHALL ghi flag opt-in vào file cấu hình user (`~/.kiro-kit/config.json`) và bắt đầu gửi telemetry ẩn danh từ lần chạy tiếp theo.
4. WHERE người dùng chạy `kiro-kit telemetry disable`, THE CLI SHALL gỡ flag opt-in và ngừng gửi telemetry.
5. THE README SHALL trình bày rõ chính sách telemetry trong section "Privacy".

### Requirement 18: Hành vi Offline

**User Story:** Là một developer làm việc trong môi trường hạn chế mạng, tôi muốn CLI hoạt động được sau lần cài đầu tiên, để không bị chặn công việc.

#### Acceptance Criteria

1. WHEN CLI đã được cài qua npm và chạy với cache có sẵn, THE CLI SHALL hoạt động đầy đủ mọi lệnh không yêu cầu fetch remote.
2. THE CLI SHALL chứa toàn bộ định nghĩa preset trong package npm (không fetch từ GitHub khi chạy `init`/`add`).
3. WHERE một command yêu cầu kết nối mạng (ví dụ kiểm tra version mới), THE CLI SHALL bắt timeout sau 5 giây và tiếp tục offline-mode với cảnh báo.
4. IF không thể kết nối npm registry khi chạy `update`, THEN THE Update_Command SHALL in cảnh báo và thoát với exit code 0 (không phải lỗi).

### Requirement 19: Tương thích Đa nền tảng

**User Story:** Là một developer dùng Windows/macOS/Linux, tôi muốn CLI hoạt động giống nhau trên cả ba nền tảng, để team đồng nhất.

#### Acceptance Criteria

1. THE CLI SHALL chạy được trên Windows 10+, macOS 12+, và các bản Linux phổ biến (Ubuntu 20.04+, Debian 11+).
2. THE CLI SHALL sử dụng `path.join` và `path.sep` cho mọi thao tác đường dẫn (không hard-code dấu `/` hoặc `\`).
3. THE CLI SHALL ghi file với line ending phù hợp với nền tảng đang chạy (LF trên Unix, CRLF trên Windows) trừ khi file là JSON/YAML thì luôn dùng LF.
4. THE CLI SHALL không phụ thuộc vào shell scripts (bash, zsh) cho các lệnh chính của CLI.
5. THE CI SHALL chạy test matrix trên Windows, macOS, và Ubuntu trên Node 18, 20, và 22.

### Requirement 20: Versioning

**User Story:** Là một Kiro user, tôi muốn biết phiên bản CLI và preset, để theo dõi thay đổi và báo bug chính xác.

#### Acceptance Criteria

1. THE CLI SHALL hỗ trợ flag `--version` (và `-v`) trả về semver version của CLI.
2. EACH Preset SHALL có field `version` trong manifest theo định dạng semver.
3. THE CLI Version SHALL được giữ đồng bộ với version trong `package.json`.
4. WHEN có breaking change trong manifest schema hoặc CLI behavior, THE CLI SHALL tăng major version.
5. THE CHANGELOG SHALL được duy trì tại `CHANGELOG.md` theo chuẩn Keep a Changelog.

### Requirement 21: Cấu trúc README và Tài liệu Dự án

**User Story:** Là một contributor tiềm năng, tôi muốn dự án có tài liệu đầy đủ và chuyên nghiệp, để tôi tin tưởng và đóng góp.

#### Acceptance Criteria

1. THE Repository SHALL chứa các file ở root: `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`.
2. THE README SHALL có các section theo thứ tự: badges, project description, Quick Start, Presets table, Commands reference, Architecture overview, Contributing link, License.
3. THE README SHALL không chứa emoji ở bất kỳ vị trí nào.
4. THE LICENSE SHALL là MIT License chuẩn với năm và tên người giữ bản quyền hợp lệ.
5. THE CONTRIBUTING SHALL hướng dẫn quy trình setup local, chạy test, mở PR.
6. THE SECURITY SHALL nêu cách báo cáo lỗ hổng bảo mật (private email/issue).
7. EACH Preset Folder SHALL có file `README.md` riêng mô tả: mục đích, danh sách artifact, recommended usage, ví dụ.

### Requirement 22: Yêu cầu Kiểm thử (Testing)

**User Story:** Là một maintainer, tôi muốn có test bao phủ các đường đi quan trọng và các bất biến cấu trúc, để tự tin khi merge PR.

#### Acceptance Criteria

1. THE Project SHALL sử dụng Vitest làm test runner cho unit tests và e2e tests.
2. THE Test_Suite SHALL có unit test cho các module: preset loader, manifest parser, file conflict resolver, merge logic (MCP, hooks, settings), backup/restore, statusline selector, agent front-matter parser, command path parser, skill structure validator.
3. THE Test_Suite SHALL có e2e test thực thi các lệnh `init`, `add`, `update`, `restore`, `doctor` trong thư mục tạm và xác nhận file output.
4. THE CI SHALL chạy `lint`, `typecheck`, và `test` trên mỗi PR và push lên branch chính.
5. WHEN bất kỳ bước CI nào fail, THE PR SHALL bị chặn merge cho đến khi pass.
6. THE Test_Suite SHALL bao phủ các edge case: empty workspace, workspace có file conflict, manifest không hợp lệ, preset không tồn tại, JSON corrupt.
7. THE E2E Test SHALL không phụ thuộc vào kết nối mạng (sử dụng cached preset trong package).
8. THE Test_Suite SHALL có structural test xác nhận mỗi preset chứa đầy đủ skeleton tối thiểu: >= 12 agents, >= 20 skills, >= 25 commands, >= 6 hooks, >= 4 workflows, 1 statusline triple, 1 metadata.json, 1 settings.json, 1 .mcp.json.example, 1 .env.example.
9. THE Test_Suite SHALL xác nhận mọi skill folder có file `SKILL.md` hoặc `skill.md` với front-matter hợp lệ, hoặc là sub-skill container không có SKILL.md ở root nhưng có ít nhất một sub-folder hợp lệ.
10. THE Test_Suite SHALL xác nhận mọi agent file `.md` trong `agents/` có front-matter YAML hợp lệ với các field bắt buộc.
11. THE Test_Suite SHALL xác nhận mọi command file `.md` trong `commands/` có front-matter YAML hợp lệ.
12. THE Test_Suite SHALL xác nhận mọi cross-platform hook script có đủ biến thể cần thiết (`.js` bắt buộc, `.sh` hoặc `.ps1` ít nhất một) và tất cả có cú pháp hợp lệ trên platform tương ứng.

### Requirement 23: Bảo mật và Xử lý Secret

**User Story:** Là một security-conscious developer, tôi muốn CLI không vô tình commit secrets hoặc fetch nội dung từ nguồn không tin cậy, để bảo vệ project.

#### Acceptance Criteria

1. THE CLI SHALL không bao giờ ghi giá trị từ biến môi trường vào file output.
2. THE Preset SHALL không chứa giá trị API key, token, password thực; chỉ chứa placeholder dạng `${ENV_VAR}` hoặc `<your-key-here>`.
3. WHERE preset cần biến môi trường, THE Preset SHALL cung cấp file `.env.example` mẫu (nếu phù hợp) chứ không phải `.env`.
4. THE CLI SHALL không fetch và thực thi remote code (không có `eval`, không tải script từ URL).
5. THE Repository SHALL có `.gitignore` chuẩn loại trừ `.env`, `.env.*` (trừ `.env.example`), `node_modules`, `dist`, `.kiro/.backup`, `.kiro/settings/mcp.json` (canonical MCP file gitignored để tránh leak token).
6. IF user truyền URL tuỳ chỉnh để fetch preset (tính năng tương lai), THEN THE CLI SHALL hiển thị URL và yêu cầu xác nhận trước khi fetch.
7. THE Repository SHALL không chứa PII thực (tên người thật, email thật, số điện thoại thật) trong bất kỳ template hay example nào; chỉ dùng placeholder dạng `[name]`, `[email]`, `[phone]`.


### Requirement 24: Sáu Preset Tự-chứa với Bộ Artifact Đầy đủ

**User Story:** Là một Kiro user mới, tôi muốn mỗi preset là một bộ kit hoàn chỉnh ngang tầm `.claude/` của Claude Code, để tôi cài một preset duy nhất đã có ngay workspace engineer-grade mà không cần ghép từ nhiều nguồn.

#### Acceptance Criteria

1. THE Repository SHALL chứa 6 preset chính thức: `frontend`, `backend`, `fullstack`, `mobile`, `devops`, `data-ai`.
2. EACH Preset SHALL là **self-contained**: chứa bản sao đầy đủ của mọi loại artifact cần thiết, không tham chiếu hay phụ thuộc vào shared core giữa các preset.
3. EACH Preset SHALL chứa tối thiểu các artifact sau (skeleton structure giống nhau giữa 6 preset, nội dung điều chỉnh theo ngữ cảnh):
   - **Agents**: tối thiểu 12 agent file `.md` trong `agents/`, bao gồm baseline 16 agent: `brainstormer`, `code-reviewer`, `copywriter`, `database-admin`, `debugger`, `docs-manager`, `git-manager`, `journal-writer`, `mcp-manager`, `planner`, `project-manager`, `researcher`, `scout`, `scout-external`, `tester`, `ui-ux-designer` (preset có thể bổ sung agent chuyên biệt).
   - **Skills**: tối thiểu 20 skill folder trong `skills/`, mỗi folder có cấu trúc tuân thủ Requirement 33.
   - **Commands**: tối thiểu 25 command file `.md` trong `commands/`, có nesting 1-3 cấp, phân chia thành các category: top-level, `design/`, `docs/`, `fix/`, `git/`, `plan/`, `review/`, `scout/`, `skill/`, kèm category đặc thù preset (ví dụ `frontend/`, `backend/`).
   - **Hooks**: tối thiểu 6 hook trong `hooks/`, bao gồm: `scout-block` (security), `modularization-hook` (code quality), Discord notification, Telegram notification, plus 2 hook đặc thù preset.
   - **Workflows**: tối thiểu 4 workflow file trong `workflows/`: `development-rules.md`, `primary-workflow.md`, `orchestration-protocol.md`, `documentation-management.md`.
   - **Settings**: 1 file `settings.json` đăng ký hooks và statusLine.
   - **Statusline**: bộ ba `statusline.js`, `statusline.sh`, `statusline.ps1`.
   - **Metadata**: 1 file `metadata.json` theo schema tại Requirement 36.
   - **MCP example**: 1 file `.mcp.json.example` với placeholder.
   - **Env examples**: tối thiểu `.env.example` (project-level), `hooks/.env.example` (hook-level), `skills/.env.example` (skills shared).
   - **Spec template**: ít nhất một bộ `.kiro/specs/_templates/<preset-name>/{requirements.md,design.md,tasks.md}`.
   - **Docs template**: ít nhất 3 file `code-standards.md`, `system-architecture.md`, `project-roadmap.md` đặt vào `docs/`.
4. THE Frontend_Preset SHALL điều chỉnh nội dung tập trung vào React/Next.js + TypeScript, với skills chuyên biệt: `frontend-design`, `frontend-development`, `ui-styling`, `web-frameworks`, `chrome-devtools`, `threejs`, `aesthetic`, kèm steering chứa convention React/Next.js.
5. THE Backend_Preset SHALL điều chỉnh nội dung tập trung vào Node.js/Python/Go API, với skills chuyên biệt: `backend-development`, `databases`, `mcp-builder`, `mcp-management`, `devops`, `better-auth`, kèm steering chứa convention API design, error handling, security.
6. THE Fullstack_Preset SHALL điều chỉnh nội dung cho Next.js/T3 stack, bao gồm cả frontend và backend skill sets, plus `shopify`, `payment-integration`.
7. THE Mobile_Preset SHALL điều chỉnh nội dung cho Flutter/React Native (focus chính: Flutter), với skills `mobile-development`, `ai-multimodal`, `ui-styling`.
8. THE DevOps_Preset SHALL điều chỉnh nội dung cho Docker/Kubernetes/Terraform, với skills `devops`, `debugging`, `repomix`, `sequential-thinking`, kèm hook CI checks.
9. THE Data_AI_Preset SHALL điều chỉnh nội dung cho Python/ML, với skills `google-adk-python`, `ai-multimodal`, `document-skills`, `research`, `repomix`, `sequential-thinking`.
10. EACH Preset SHALL bao gồm core MCP servers trong `.mcp.json.example`: `filesystem`, `git`, `docs-seeker` (hoặc `context7`), `playwright`, `fetch`, plus MCP servers đặc thù preset.
11. EACH Preset SHALL có ít nhất các hook entry trong `settings.json`: `PreToolUse` (scout-block), `PostToolUse` (modularization-hook), `agentStop` (notification).

### Requirement 25: Cấu trúc `.kiro/` Sau Cài Đặt - Parallel Namespace Mirror

**User Story:** Là một Kiro user, tôi muốn workspace `.kiro/` sau khi cài có cấu trúc song song với `.claude/` của Claude Code, để cùng một mental model áp dụng được cho cả hai môi trường.

#### Acceptance Criteria

1. WHEN người dùng chạy `kiro-kit init` thành công, THE Workspace `.kiro/` SHALL chứa các thư mục con: `agents/`, `skills/`, `commands/`, `hooks/`, `steering/`, `workflows/`, `settings/`, `specs/_templates/`.
2. THE Workspace `.kiro/` SHALL chứa các file ở root: `metadata.json`, `statusline.js`, `statusline.sh`, `statusline.ps1`, `.env.example`, `.mcp.json.example`, `settings.json`, `.kiro-kit.json` (tracking file).
3. THE Directory `.kiro/agents/` SHALL chứa các file `.md`, mỗi file là một custom agent theo Requirement 31.
4. THE Directory `.kiro/skills/` SHALL chứa các skill folder, mỗi folder theo cấu trúc Requirement 33, kèm các file ecosystem `README.md`, `INSTALLATION.md`, `THIRD_PARTY_NOTICES.md`, `agent_skills_spec.md`, và folder `template-skill/`.
5. THE Directory `.kiro/commands/` SHALL chứa các file `.md` có thể nằm ở 1, 2, hoặc 3 cấp nesting theo Requirement 32.
6. THE Directory `.kiro/hooks/` SHALL chứa các file hook script (có thể có biến thể tri-platform), kèm `README.md` và `.env.example` cho hook-level env vars.
7. THE Directory `.kiro/workflows/` SHALL chứa các file markdown workflow always-on theo Requirement 34.
8. THE Directory `.kiro/settings/` SHALL chứa `mcp.json` (canonical MCP config); file này được gitignored nhưng được tạo từ template `.kiro/.mcp.json.example`.
9. THE Directory `.kiro/specs/_templates/` SHALL chứa một sub-folder cho mỗi preset đã cài, mỗi sub-folder có bộ `requirements.md`, `design.md`, `tasks.md`.
10. THE Structure SHALL phản ánh 1-1 với `.claude/` của bộ kit tham chiếu (parallel namespace), cho phép người đã quen `.claude/` chuyển sang `.kiro/` mà không phải học cấu trúc mới.

### Requirement 26: GitHub Actions CI/CD

**User Story:** Là một maintainer, tôi muốn CI/CD tự động để giảm việc thủ công và đảm bảo chất lượng release.

#### Acceptance Criteria

1. THE Repository SHALL có workflow `.github/workflows/ci.yml` chạy trên mỗi PR và push tới `main`.
2. THE CI Workflow SHALL chạy các bước: install dependencies, lint, typecheck, test, build, structural test (Requirement 22.8-22.12).
3. THE Repository SHALL có workflow `.github/workflows/publish.yml` chạy khi push tag dạng `v*.*.*`.
4. THE Publish Workflow SHALL build package, chạy test, và publish lên npm registry với token từ secret `NPM_TOKEN`.
5. THE CI SHALL chạy trên matrix: `os: [ubuntu-latest, macos-latest, windows-latest]`, `node: [18, 20, 22]`.
6. WHEN một step fail, THE Workflow SHALL không tiếp tục các step còn lại.
7. THE Repository SHALL có template cho issue và PR trong `.github/ISSUE_TEMPLATE/` và `.github/PULL_REQUEST_TEMPLATE.md`.

### Requirement 27: Spec Templates và Docs Templates

**User Story:** Là một Kiro user, tôi muốn có template sẵn cho specs và docs, để tôi bắt đầu nhanh và đồng nhất.

#### Acceptance Criteria

1. EACH Preset SHALL cung cấp ít nhất một bộ spec template gồm 3 file: `requirements.md`, `design.md`, `tasks.md` được đặt vào `.kiro/specs/_templates/<preset-name>/`.
2. EACH Preset SHALL cung cấp ít nhất 3 docs template: `code-standards.md`, `system-architecture.md`, `project-roadmap.md` được đặt vào `docs/`.
3. THE Spec_Templates SHALL chứa placeholder rõ ràng (ví dụ `<feature-name>`, `<role>`) để user thay thế.
4. THE Docs_Templates SHALL chứa các section tiêu chuẩn rỗng để user điền (không phải nội dung mẫu của dự án khác).
5. WHEN docs template đã tồn tại trong workspace, THE CLI SHALL áp dụng quy tắc xử lý xung đột (Requirement 9).

### Requirement 28: Định dạng Output và Lỗi của CLI

**User Story:** Là một developer dùng CLI, tôi muốn output rõ ràng, có màu sắc nhất quán, và lỗi dễ hiểu, để debug nhanh.

#### Acceptance Criteria

1. THE CLI SHALL sử dụng màu xanh (green) cho thông báo thành công, vàng (yellow) cho cảnh báo, đỏ (red) cho lỗi.
2. WHEN terminal không hỗ trợ màu (`process.stdout.isTTY === false` hoặc `NO_COLOR` env var được set), THE CLI SHALL in plain text không có ANSI codes.
3. EACH Error_Message SHALL bao gồm: mã lỗi (ví dụ `KK001`), mô tả lỗi, gợi ý sửa (nếu có).
4. WHEN CLI gặp lỗi không xử lý được (uncaught exception), THE CLI SHALL in stack trace ngắn gọn và thoát với exit code 2.
5. THE CLI SHALL có flag `--verbose` để in log chi tiết và `--quiet` để chỉ in lỗi.
6. THE CLI SHALL có flag `--help` (và `-h`) cho mọi command và sub-command.

### Requirement 29: Tính chất Toán học cho Property-Based Testing

**User Story:** Là một maintainer, tôi muốn các tính chất toán học và bất biến cấu trúc của hệ thống được phát biểu rõ ràng để có thể viết property-based tests.

#### Acceptance Criteria

1. FOR ALL preset (A, B) không có file conflict, `merge(A, B)` SHALL bằng `merge(B, A)` (commutativity của non-conflicting merge).
2. FOR ALL preset (A, B, C) đôi một không có file conflict, `merge(merge(A, B), C)` SHALL bằng `merge(A, merge(B, C))` (associativity).
3. FOR ALL workspace state W và bất kỳ chuỗi thao tác kit nào, sau khi `backup(W)` rồi `restore()` SHALL cho ra workspace state bằng W (round-trip identity).
4. FOR ALL preset P, `init(P)` rồi `init(P)` với `--skip-existing` SHALL cho ra cùng kết quả như `init(P)` chạy một lần (idempotency).
5. FOR ALL preset (A, B) không có conflict, `init(A) → add(B)` SHALL cho ra workspace state bằng `init(A, B)` (order-equivalence).
6. FOR ALL valid manifest M, mọi file khai báo trong `M.files` SHALL tồn tại vật lý trên disk (manifest completeness).
7. FOR ALL preset folder, mọi file vật lý SHALL được khai báo trong manifest (no orphan files).
8. FOR ALL preset cài đặt, không có preset nào ghi đè file thuộc về preset khác mà không có conflict marker (preset isolation).
9. FOR ALL preset P, `count(agents in P) >= 12 AND count(skills in P) >= 20 AND count(commands in P) >= 25 AND count(hooks in P) >= 6 AND count(workflows in P) >= 4` (structural threshold property).
10. FOR ALL cross-platform hook script H trong preset, `exists(H.js) AND (exists(H.sh) OR exists(H.ps1))` (cross-platform completeness property).
11. FOR ALL skill folder S trong preset, `exists(S/SKILL.md) OR exists(S/skill.md) OR S là sub-skill container có ít nhất một sub-folder hợp lệ` (skill discoverability property).
12. FOR ALL agent file F trong `agents/`, `parse(frontMatter(F))` SHALL trả về object có field `name` và `description` (agent front-matter completeness).
13. FOR ALL command file F trong `commands/`, `parse(frontMatter(F))` SHALL trả về object có field `description` (command front-matter completeness).

### Requirement 30: Parser cho Manifest và Tracking File

**User Story:** Là một maintainer, tôi muốn có parser tin cậy cho manifest và tracking file, vì parser sai dễ sinh bug.

#### Acceptance Criteria

1. WHEN một manifest hợp lệ được cấp, THE Manifest_Parser SHALL trả về object có cấu trúc đúng theo schema.
2. WHEN một manifest không hợp lệ được cấp, THE Manifest_Parser SHALL trả về error rõ ràng nêu lỗi nằm ở field nào.
3. THE Pretty_Printer SHALL chuyển object manifest thành JSON formatted với 2-space indent.
4. FOR ALL valid manifest object M, `parse(print(M))` SHALL bằng M (round-trip property cho manifest).
5. FOR ALL valid tracking file object T, `parse(print(T))` SHALL bằng T (round-trip property cho tracking file).
6. WHEN file JSON corrupt, THE Parser SHALL không crash mà trả về error có line number và column.
7. FOR ALL valid front-matter YAML block Y trong agent/command/skill file, `parse(print(Y))` SHALL bằng Y (round-trip property cho front-matter).

### Requirement 31: Định dạng File Agent

**User Story:** Là một preset author, tôi muốn agent file có định dạng chuẩn với front-matter rõ ràng, để CLI và Kiro nhận diện được agent metadata.

#### Acceptance Criteria

1. EACH Agent SHALL là một file `.md` đặt tại `.kiro/agents/<agent-name>.md`.
2. THE Agent_File SHALL bắt đầu bằng block YAML front-matter (giữa hai dòng `---`) với các field bắt buộc: `name` (string, kebab-case), `description` (string, mô tả khi nào nên invoke agent này).
3. THE Agent_File Front-matter SHALL có thể có các field tuỳ chọn: `inclusion` (enum: `manual`/`always`/`fileMatch`, mặc định `manual`), `model` (string, ví dụ `inherit`/`sonnet`/`haiku`), `tools` (array of tool names whitelist).
4. THE Agent_File Body (sau front-matter) SHALL chứa system prompt chi tiết của agent, có thể bao gồm core responsibilities, working process, output format, quality standards.
5. EACH Preset SHALL chứa tối thiểu 12 agent file, ưu tiên bao phủ baseline 16 agent đã liệt kê tại Requirement 24.3.
6. WHEN CLI parse agent file, THE Agent_Parser SHALL validate front-matter theo schema và từ chối file không hợp lệ với thông báo rõ ràng.

### Requirement 32: Định dạng File Command và Phân Cấp

**User Story:** Là một preset author, tôi muốn commands có hệ thống phân cấp rõ ràng để tổ chức nhiều lệnh theo nhóm chức năng.

#### Acceptance Criteria

1. EACH Command SHALL là một file `.md` đặt tại `.kiro/commands/[<group>/[<subgroup>/]]<command-name>.md`.
2. THE Command_System SHALL hỗ trợ nesting 1, 2, và 3 cấp (ví dụ `bootstrap.md`, `bootstrap/auto.md`, `bootstrap/auto/fast.md`).
3. THE Command_File SHALL bắt đầu bằng block YAML front-matter với các field: `inclusion` (enum, mặc định `manual`), `description` (string), tuỳ chọn `argument-hint` (string mô tả định dạng argument như `[arg-1] [arg-2]`).
4. THE Command_File Body SHALL có thể sử dụng placeholder `$1`, `$2`, ... để tham chiếu argument từ user.
5. EACH Preset SHALL cung cấp tối thiểu 25 command, phân chia thành các category bắt buộc: top-level commands, plus categories `design/`, `docs/`, `fix/`, `git/`, `plan/`, `review/`, `scout/`, `skill/`, plus 1 category đặc thù preset.
6. WHEN CLI parse command file, THE Command_Parser SHALL validate front-matter và path nesting <= 3 cấp; từ chối file vi phạm với thông báo rõ ràng.

### Requirement 33: Cấu trúc và Phát hiện Skill (Power)

**User Story:** Là một preset author và Kiro user, tôi muốn skill có cấu trúc nhất quán hỗ trợ progressive disclosure, để token consumption efficient mà vẫn cung cấp đủ thông tin chi tiết khi cần.

#### Acceptance Criteria

1. EACH Skill SHALL là một thư mục đặt tại `.kiro/skills/<skill-name>/`.
2. EACH Skill_Folder SHALL có file `SKILL.md` hoặc `skill.md` (case variant được chấp nhận) ở root của folder, trừ trường hợp là sub-skill container.
3. THE SKILL.md SHALL bắt đầu bằng block YAML front-matter với các field bắt buộc: `name` (string), `description` (string ngắn gọn dùng để LLM quyết định khi nào kích hoạt skill).
4. THE Skill_Folder SHALL có thể chứa các thư mục/file tuỳ chọn: `references/` (tài liệu chi tiết phục vụ progressive disclosure), `scripts/` (helper scripts có thể execute), `assets/` (binary/static assets), `tests/`, `workflows/`, `.env.example`, `LICENSE.txt`, `package.json`, `README.md`.
5. WHERE một skill là sub-skill container, THE Skill_Folder SHALL không có `SKILL.md`/`skill.md` ở root mà chứa các sub-folder, mỗi sub-folder là một skill độc lập tuân thủ Requirement 33.1-33.4 (ví dụ `document-skills/docx/SKILL.md`).
6. THE Directory `.kiro/skills/` SHALL chứa các file ecosystem chung: `README.md` (overview), `INSTALLATION.md` (hướng dẫn cài skill), `THIRD_PARTY_NOTICES.md` (third-party attributions), `agent_skills_spec.md` (skills spec), và folder `template-skill/` (template tạo skill mới).
7. EACH Skill SHALL tuân thủ progressive disclosure: SKILL.md ngắn gọn (token-efficient), thông tin chi tiết đặt trong `references/`.
8. EACH Preset SHALL chứa tối thiểu 20 skill (tính cả sub-skill trong sub-skill container).

### Requirement 34: Workflows Directory (Always-on Context)

**User Story:** Là một Kiro user, tôi muốn các quy tắc cốt lõi (development rules, primary workflow) luôn được Kiro inject vào context, để mọi agent đều tuân thủ mà tôi không phải nhắc lại.

#### Acceptance Criteria

1. THE Directory `.kiro/workflows/` SHALL chứa các file markdown được luôn inject vào agent context (always-on, không có inclusion conditional).
2. EACH Preset SHALL cài tối thiểu 4 workflow file: `development-rules.md` (YAGNI/KISS/DRY, file size, file naming), `primary-workflow.md` (core dev workflow plan → implement → test → review), `orchestration-protocol.md` (multi-agent coordination patterns), `documentation-management.md` (docs auto-update triggers).
3. THE Workflow_File SHALL có thể có front-matter YAML tuỳ chọn nhưng không cần `inclusion` field (mặc định always-on).
4. THE Workflows SHALL khác Steering ở chỗ: workflows always-on cho mọi context; steering có thể conditional (manual/fileMatch).
5. WHEN nhiều preset cung cấp workflow file cùng tên với nội dung khác nhau, THE CLI SHALL áp dụng quy tắc xử lý xung đột (Requirement 9).

### Requirement 35: Hooks Đa Nền tảng

**User Story:** Là một Kiro user trên Windows/macOS/Linux, tôi muốn hooks chạy được trên nền tảng của tôi mà không cần config thêm, để kit hoạt động ngay sau cài đặt.

#### Acceptance Criteria

1. WHERE một hook thực thi script logic, THE Preset SHALL cung cấp tối thiểu biến thể `.js` (Node.js, primary).
2. WHERE hook cần native shell execution, THE Preset SHALL cung cấp thêm biến thể `.sh` (bash cho Unix) và/hoặc `.ps1` (PowerShell cho Windows).
3. THE Hook_Configuration trong `settings.json` SHALL chọn script phù hợp theo platform tại runtime, ưu tiên `.js` để đảm bảo cross-platform.
4. EACH Preset SHALL bao gồm các core hook cross-platform: `scout-block` (security guard), `modularization-hook` (file size enforcement), Discord notification, Telegram notification.
5. EACH Preset SHALL bao gồm `.kiro/hooks/.env.example` với các biến môi trường cấp hook (ví dụ `DISCORD_WEBHOOK_URL`, `TELEGRAM_BOT_TOKEN`) ở dạng placeholder.
6. EACH Preset SHALL bao gồm `.kiro/hooks/README.md` documenting tất cả hook, trigger, và cấu hình env yêu cầu.
7. FOR ALL hook script H trong preset, IF `H.js` tồn tại THEN `H.js` SHALL có shebang Node hợp lệ hoặc được register trong `settings.json` với runner Node.

### Requirement 36: Statusline Cross-platform

**User Story:** Là một Kiro user, tôi muốn statusline hiển thị thông tin hữu ích (branch, project, time) ở cuối terminal, để có context nhanh khi làm việc.

#### Acceptance Criteria

1. EACH Preset SHALL cài bộ ba statusline scripts vào `.kiro/`: `statusline.js`, `statusline.sh`, `statusline.ps1`.
2. EACH Statusline_Script SHALL output đúng một dòng plain text chứa thông tin trạng thái (ví dụ git branch, project name, current time).
3. THE Statusline_Script SHALL không crash khi chạy trong workspace không phải git repo (gracefully omit branch info).
4. THE Settings_File `.kiro/settings.json` SHALL có field `statusLine.type = "command"` và `statusLine.command` trỏ tới script phù hợp với platform.
5. THE CLI SHALL set executable bit (`chmod +x`) cho `statusline.sh` và các shell hook script trên Unix sau khi ghi file.
6. WHEN Kiro execute statusline trên nền tảng không hỗ trợ script chính, THE Settings SHALL có fallback chain để chọn script khả thi.

### Requirement 37: File Metadata.json

**User Story:** Là một Kiro user, tôi muốn workspace có file metadata mô tả phiên bản preset đã cài, để debug và báo bug chính xác.

#### Acceptance Criteria

1. EACH Preset SHALL bao gồm `metadata.json` được copy vào `.kiro/metadata.json` khi cài.
2. THE Metadata_File SHALL chứa các field bắt buộc: `version` (semver, khớp version preset), `name` (string, ví dụ `kk-kiro-kit-frontend`), `description` (string), `buildDate` (ISO 8601 string), `repository.type` (`"git"`), `repository.url` (string).
3. WHEN cài nhiều preset, THE CLI SHALL gộp metadata: field `presets` (array of installed preset names), `installedAt` (ISO 8601), `kitVersion` (CLI version đã cài).
4. THE Metadata_File SHALL là JSON hợp lệ và pass `JSON.parse`.
5. WHEN `kiro-kit doctor` chạy, THE Doctor SHALL kiểm tra `metadata.json` tồn tại và hợp lệ; báo lỗi nếu thiếu.

### Requirement 38: File Settings.json

**User Story:** Là một Kiro user, tôi muốn `settings.json` đăng ký hooks và statusline tự động sau khi cài, để Kiro nhận diện ngay mà không cần config thủ công.

#### Acceptance Criteria

1. EACH Preset SHALL cài file `.kiro/settings.json` với các field: `statusLine.type` (`"command"`), `statusLine.command` (string), `hooks.PreToolUse` (array), `hooks.PostToolUse` (array), `includeCoAuthoredBy` (boolean, mặc định `false`).
2. THE Settings_File SHALL phân biệt với `.kiro/settings/mcp.json` (chuyên biệt cho MCP); `settings.json` ở root xử lý các config chung.
3. WHEN gộp `settings.json` từ nhiều preset, THE Settings_Merger SHALL áp dụng quy tắc tại Requirement 12.5-12.7.
4. THE Settings_File SHALL là JSON hợp lệ.
5. WHEN người dùng đã có `settings.json` thủ công, THE CLI SHALL không xoá field do user thêm; áp dụng merge an toàn.

### Requirement 39: MCP Config với Example File

**User Story:** Là một Kiro user, tôi muốn có file MCP example với placeholder để biết cần API key gì, mà không vô tình commit token thật.

#### Acceptance Criteria

1. EACH Preset SHALL cài file `.kiro/.mcp.json.example` chứa template MCP servers với placeholder dạng `${ENV_VAR}` hoặc `<your-key-here>`.
2. THE Canonical MCP file `.kiro/settings/mcp.json` SHALL được gitignored để tránh leak token.
3. THE Example file `.kiro/.mcp.json.example` SHALL được commit và là nguồn tham chiếu cho user copy sang `.kiro/settings/mcp.json` rồi điền key thật.
4. WHEN người dùng chạy `kiro-kit init`, THE CLI SHALL tạo cả `.kiro/.mcp.json.example` và một bản `.kiro/settings/mcp.json` (với placeholder) để Kiro hoạt động ngay.
5. THE Example file SHALL không bao giờ chứa giá trị API key thật (chỉ placeholder).

### Requirement 40: File `.env.example` Đa cấp

**User Story:** Là một Kiro user, tôi muốn biết rõ env var nào cần khai báo ở cấp project, cấp hooks, cấp skills, để config theo phạm vi phù hợp.

#### Acceptance Criteria

1. EACH Preset SHALL cài tối thiểu các file `.env.example` tại các cấp:
   - `.kiro/.env.example` (project-level env vars).
   - `.kiro/hooks/.env.example` (hook-specific env vars như `DISCORD_WEBHOOK_URL`).
   - `.kiro/skills/.env.example` (skills-level shared env vars).
2. WHERE một skill cần env var riêng, THE Skill_Folder SHALL có thể có `.env.example` riêng (ví dụ `.kiro/skills/ai-multimodal/.env.example` cho `GEMINI_API_KEY`).
3. THE Repository `.gitignore` SHALL loại trừ tất cả file `.env*` ngoại trừ `.env.example` ở mọi cấp.
4. EACH `.env.example` SHALL chỉ chứa placeholder, không chứa giá trị thật.
5. EACH `.env.example` SHALL có comment giải thích mục đích và format của mỗi env var.

### Requirement 41: Hệ sinh thái File trong Skills Directory

**User Story:** Là một preset author, tôi muốn skills directory có các file ecosystem chung (README, INSTALLATION, spec) để người dùng và contributor hiểu cấu trúc skill.

#### Acceptance Criteria

1. THE Directory `.kiro/skills/` SHALL chứa các file ecosystem chung: `README.md` (overview directory), `INSTALLATION.md` (hướng dẫn cài skill mới), `THIRD_PARTY_NOTICES.md` (attribution), `agent_skills_spec.md` (skills spec).
2. THE Directory `.kiro/skills/` SHALL chứa folder `template-skill/` làm template cho contributor tạo skill mới.
3. THE Directory `.kiro/skills/` MAY chứa các archive `<skill-name>.tar.gz` cho portable distribution của một skill.
4. THE Directory `.kiro/skills/` MAY chứa folder `common/` chứa shared utilities (ví dụ `api_key_helper.py`) dùng chung giữa nhiều skill.
5. EACH Preset SHALL cài đầy đủ các file ecosystem trên (Requirement 41.1-41.2 bắt buộc; 41.3-41.4 tuỳ chọn).

### Requirement 42: Tracking Metadata cho Workspace

**User Story:** Là CLI, tôi cần biết workspace đã cài preset nào và phiên bản gì, để hỗ trợ `update` và `restore`.

#### Acceptance Criteria

1. WHEN `kiro-kit init` hoặc `add` ghi file thành công, THE CLI SHALL tạo/cập nhật file `.kiro/.kiro-kit.json` chứa: danh sách preset đã cài, version mỗi preset, timestamp install, danh sách file managed bởi kit.
2. THE Tracking_File SHALL là JSON hợp lệ, có thể được parse bởi `JSON.parse`.
3. WHEN `update` chạy, THE CLI SHALL đọc tracking file để xác định preset nào cần cập nhật.
4. WHEN `restore` chạy, THE CLI SHALL đọc tracking file để biết file nào thuộc về kit và file nào của user.
5. IF tracking file bị corrupt, THEN THE CLI SHALL in cảnh báo, gợi ý chạy `doctor --fix`, và không thực hiện thao tác phá huỷ.
6. THE Tracking_File `.kiro/.kiro-kit.json` SHALL phân biệt với `metadata.json`: tracking file ghi nhận lịch sử cài đặt; metadata.json mô tả phiên bản tĩnh của preset.

### Requirement 43: Cô lập Preset và Chính sách Trùng lặp

**User Story:** Là một maintainer, tôi muốn biết rõ cách xử lý khi nhiều preset chứa file cùng tên (như `code-reviewer.md`), để có quy tắc nhất quán.

#### Acceptance Criteria

1. EACH Preset SHALL chứa bản sao đầy đủ và độc lập của artifact, kể cả các artifact có tên file giống nhau giữa các preset (ví dụ `code-reviewer.md` tồn tại độc lập trong cả 6 preset).
2. THE Same-named Artifact giữa các preset MAY có nội dung khác nhau (ví dụ `code-reviewer.md` của Frontend nhấn mạnh React patterns; của Backend nhấn mạnh API design).
3. WHEN cài đồng thời nhiều preset có same-named artifact với nội dung khác nhau, THE CLI SHALL trigger conflict resolution (Requirement 9).
4. WHEN cài đồng thời nhiều preset có same-named artifact với nội dung **giống hệt** (byte-equal), THE CLI SHALL không hiển thị prompt và bỏ qua file (Requirement 9.6).
5. THE Preset_Isolation SHALL không cho phép preset A tham chiếu trực tiếp file của preset B; mọi shared concept phải được sao chép độc lập vào mỗi preset.

### Requirement 44: Quy tắc Toàn cục No-Emoji và No-PII

**User Story:** Là một maintainer cẩn trọng về thương hiệu và quyền riêng tư, tôi muốn quy tắc no-emoji và no-PII áp dụng toàn cục, để repository giữ tone chuyên nghiệp và tuân thủ.

#### Acceptance Criteria

1. THE Repository SHALL không chứa bất kỳ emoji nào trong toàn bộ nội dung, bao gồm: README, code comments, agent prompts, skill descriptions, command descriptions, workflow files, steering files, docs templates, spec templates.
2. THE Repository SHALL không chứa PII thực: tên người thật, email thật, số điện thoại thật, địa chỉ thật trong template hay example; chỉ dùng placeholder dạng `[name]`, `[email]`, `[phone]`, `[address]`.
3. THE Repository SHALL không chứa giá trị API key, token, password thật trong bất kỳ file nào; chỉ chứa placeholder.
4. THE CI SHALL có một step lint kiểm tra emoji unicode range trong các file `.md`, `.json`, `.js`, `.ts` và fail nếu phát hiện.
5. THE CI SHALL có một step lint kiểm tra pattern PII phổ biến (email regex, phone regex) trong template/example file và cảnh báo nếu phát hiện.

