# Tài Liệu Yêu Cầu (Requirements Document)

## Giới thiệu

**Tính năng:** Audit và so sánh hai bộ kit `claudekit-engineer-main/` (bộ kit gốc Claude Code, đặt tại thư mục con của workspace) và `kk-kiro-kit` (bộ kit Kiro hiện tại, gồm `presets/` cùng CLI tại `packages/cli/`).

**Mục tiêu:** Sản xuất một báo cáo audit có cấu trúc, dựa trên dữ liệu thực tế từ filesystem của hai kit, để trả lời ba câu hỏi:

1. **Inventory** - Mỗi kit thực sự chứa những artifact gì (agents, skills, commands, hooks, workflows, steering, settings, statusline, metadata, docs, spec templates)?
2. **Parity** - Bộ artifact của `kk-kiro-kit` (mỗi preset) đã đạt mức "engineer-grade ngang hàng `claudekit`" như mục tiêu trong spec `kk-kiro-kit` chưa, hay còn thiếu/thừa/lệch chuẩn ở đâu?
3. **Action items** - Cần port, sửa, hay loại bỏ những gì, và ưu tiên ra sao?

**Phạm vi:** Audit là một tính năng one-shot tạo ra tài liệu (báo cáo), không sinh code runtime. Đầu ra cuối cùng là một bộ tài liệu Markdown tại `docs/audits/claudekit-vs-kirokit/` gồm: báo cáo tổng hợp, bảng inventory, ma trận mapping, danh sách gap, danh sách recommendation có ưu tiên, và phụ lục dữ liệu thô.

**Ngoài phạm vi:** Tài liệu này không yêu cầu thực thi việc port/migrate. Việc port artifact thực tế từ `claudekit` sang preset Kiro (nếu có) sẽ là spec riêng, sinh ra dựa trên recommendation của audit này.

## Glossary

- **Source_Kit**: Bộ kit `claudekit-engineer-main/` đặt tại workspace path `claudekit-engineer-main/`, có `.claude/` chứa agents, commands, hooks, skills, workflows, settings.json, metadata.json, statusline triple.
- **Target_Kit**: Bộ kit `kk-kiro-kit` hiện tại; gồm `presets/<preset-name>/` (6 preset chính + 1 `_template`), CLI tại `packages/cli/`, docs tại `docs/`, và spec hiện có tại `.kiro/specs/kk-kiro-kit/`.
- **Preset**: Một trong 7 thư mục con của `presets/`: `backend`, `frontend`, `fullstack`, `mobile`, `devops`, `data-ai`, `_template`.
- **Artifact_Type**: Một trong các loại tài nguyên được audit: agent, skill, command, hook, workflow, steering, settings, statusline, metadata, manifest, mcp_template, env_example, spec_template, docs_template.
- **Audit_Process**: Quy trình thu thập, phân tích, và lập báo cáo so sánh hai kit; thực hiện thủ công có hỗ trợ tool (ripgrep, file scan).
- **Audit_Report**: Tài liệu Markdown cuối cùng, là deliverable của tính năng này.
- **Inventory**: Danh sách đầy đủ và có cấu trúc của mọi artifact trong một kit, kèm metadata cơ bản (tên, đường dẫn, kích thước, có front-matter hay không, biến thể đa nền tảng nếu có).
- **Mapping_Table**: Bảng tương ứng (1-1, 1-N, N-1, hoặc no-match) giữa từng artifact của Source_Kit và artifact tương đương trong từng preset của Target_Kit.
- **Gap**: Một sai lệch giữa Source_Kit và một preset của Target_Kit; phân loại thành: `missing` (thiếu trong target), `extra` (chỉ có trong target), `divergent` (cả hai có nhưng nội dung lệch), `structural` (cấu trúc thư mục/front-matter sai chuẩn).
- **Severity**: Mức độ nghiêm trọng của một gap, một trong: `critical`, `high`, `medium`, `low`, `informational`.
- **Recommendation**: Một action item được sinh ra từ một hoặc nhiều gap, có owner đề xuất, mức ưu tiên, và effort estimate (S/M/L).
- **Cross_Platform_Triple**: Bộ ba file `<name>.js` + `<name>.sh` + `<name>.ps1` cho cùng một logic; áp dụng cho hooks và statusline.
- **Front_Matter**: Khối YAML ở đầu file Markdown (giữa `---` và `---`) chứa metadata như `name`, `description`, `model`, `inclusion`, `argument-hint`.
- **Progressive_Disclosure**: Nguyên tắc tổ chức skill: `SKILL.md` ngắn gọn (token-efficient), thông tin chi tiết tách ra `references/`, `scripts/`, `assets/` chỉ load khi cần.
- **Sub_Skill_Container**: Một thư mục skill không có `SKILL.md` riêng nhưng chứa nhiều sub-skill (ví dụ `document-skills/docx/`, `document-skills/pdf/` trong Source_Kit).
- **Manifest**: File `presets/<preset>/manifest.json` của Target_Kit khai báo danh sách artifact mà preset cung cấp và đích cài đặt.

## Yêu cầu (Requirements)

### Requirement 1: Phạm vi và đầu vào audit được cố định

**User Story:** Là một người chạy audit, tôi muốn phạm vi và nguồn dữ liệu của audit được khai báo tường minh, để báo cáo có thể tái lập và không bỏ sót thư mục quan trọng.

#### Acceptance Criteria

1. THE Audit_Process SHALL chỉ đọc dữ liệu từ hai gốc cố định: thư mục `claudekit-engineer-main/` (Source_Kit) và workspace root cho Target_Kit (gồm `presets/`, `packages/cli/`, `docs/`, `.kiro/`).
2. THE Audit_Process SHALL ghi lại trong Audit_Report giá trị hash hoặc snapshot timestamp của hai gốc tại thời điểm chạy audit, gồm: ngày giờ chạy (ISO-8601), số file đã quét trong mỗi gốc, tổng dung lượng (bytes).
3. WHEN Source_Kit hoặc Target_Kit không tồn tại tại đường dẫn khai báo, THE Audit_Process SHALL dừng và ghi lỗi rõ ràng nêu đường dẫn bị thiếu, không sinh báo cáo một phần.
4. THE Audit_Process SHALL bỏ qua các thư mục sau khi quét: `node_modules/`, `dist/`, `.git/`, `.coverage`, `repomix-output.xml`, `*.tar.gz`, `*.zip`.
5. THE Audit_Report SHALL liệt kê tường minh trong section "Scope" danh sách thư mục đã quét và danh sách pattern đã loại trừ.

### Requirement 2: Kiểm kê (Inventory) Source_Kit

**User Story:** Là một auditor, tôi muốn có danh sách đầy đủ artifact trong Source_Kit theo từng loại, để biết đối tượng so sánh chuẩn là gì.

#### Acceptance Criteria

1. THE Audit_Process SHALL sinh một Inventory cho Source_Kit chứa danh sách artifact của mỗi Artifact_Type sau: agent, command, hook, skill, workflow, steering, settings, statusline, metadata, mcp_template, env_example, docs_template.
2. FOR EACH agent file dưới `claudekit-engineer-main/.claude/agents/`, THE Inventory SHALL ghi: tên file, đường dẫn tương đối, sự hiện diện của Front_Matter, các trường front-matter chính (`name`, `description`, `model`, `tools`, `inclusion`), và độ dài file (số dòng).
3. FOR EACH command file dưới `claudekit-engineer-main/.claude/commands/`, THE Inventory SHALL ghi: tên file, đường dẫn tương đối, độ sâu nesting (1, 2, hoặc 3), các trường front-matter chính (`description`, `argument-hint`, `inclusion`), và slug command suy ra từ đường dẫn.
4. FOR EACH skill folder dưới `claudekit-engineer-main/.claude/skills/`, THE Inventory SHALL ghi: tên skill, sự hiện diện của `SKILL.md` (hoặc `skill.md`), danh sách subdirectory (`references/`, `scripts/`, `assets/`, `tests/`, `workflows/`), có phải Sub_Skill_Container hay không, và kích thước `SKILL.md` (số dòng).
5. FOR EACH hook file dưới `claudekit-engineer-main/.claude/hooks/`, THE Inventory SHALL ghi: tên file, extension (`.js`, `.sh`, `.ps1`, `.md`), nhóm Cross_Platform_Triple (nếu thuộc), và việc có được khai báo trong `claudekit-engineer-main/.claude/settings.json` hay không.
6. THE Inventory SHALL ghi nhận sự tồn tại và đường dẫn của: `metadata.json`, `settings.json`, `.mcp.json.example`, `.env.example`, `statusline.js`, `statusline.sh`, `statusline.ps1` trong `claudekit-engineer-main/.claude/`.
7. THE Inventory SHALL được lưu thành một file riêng `docs/audits/claudekit-vs-kirokit/inventory-source.md` với bảng Markdown phân theo Artifact_Type.

### Requirement 3: Kiểm kê (Inventory) Target_Kit

**User Story:** Là một auditor, tôi muốn có inventory tương ứng cho từng preset của Target_Kit, để chuẩn bị cho việc so khớp trên cùng sơ đồ phân loại.

#### Acceptance Criteria

1. THE Audit_Process SHALL sinh một Inventory riêng cho mỗi preset trong `presets/` gồm 7 preset: `backend`, `frontend`, `fullstack`, `mobile`, `devops`, `data-ai`, `_template`.
2. FOR EACH preset, THE Inventory SHALL liệt kê artifact theo đúng các Artifact_Type như Requirement 2, áp dụng cùng các trường metadata (front-matter, nesting depth, kích thước, biến thể đa nền tảng).
3. THE Inventory SHALL parse `presets/<preset>/manifest.json` của mỗi preset và ghi nhận: tổng số entry trong field `files`, các giá trị `minCounts` (nếu có), và các MCP server được khai báo.
4. FOR EACH preset, THE Audit_Process SHALL phát hiện các sai lệch nội tại sau và ghi vào Inventory: file có trong filesystem nhưng không có entry trong `manifest.json.files`, entry trong `manifest.json.files` nhưng file nguồn không tồn tại trên disk, hook script không có biến thể đa nền tảng đầy đủ.
5. THE Inventory SHALL được lưu thành 7 file riêng `docs/audits/claudekit-vs-kirokit/inventory-target-<preset>.md` cộng với một file tổng hợp `inventory-target-summary.md` chứa bảng đếm artifact theo loại cho từng preset.

### Requirement 4: Bảng Mapping Source ↔ Target

**User Story:** Là một auditor, tôi muốn biết mỗi artifact trong Source_Kit ánh xạ sang artifact nào trong từng preset của Target_Kit, để định lượng được mức parity.

#### Acceptance Criteria

1. THE Audit_Process SHALL sinh một Mapping_Table tổng cho mỗi Artifact_Type, mỗi hàng là một artifact trong Source_Kit, mỗi cột là một preset trong Target_Kit, mỗi ô chứa một trong các giá trị: `match` (có file cùng tên/cùng vai trò), `divergent` (có file tương đương nhưng nội dung khác >20% theo độ tương tự), `missing` (preset không có), hoặc `n/a` (artifact không áp dụng cho preset đó).
2. THE Mapping_Table SHALL khớp artifact theo thứ tự ưu tiên: trùng tên file, trùng đường dẫn tương đối (loại trừ phần `.claude` ↔ `presets/<preset>` ↔ `.kiro`), trùng `name` trong front-matter (đối với agent), trùng slug command suy ra từ đường dẫn.
3. WHEN một artifact trong Source_Kit không có ánh xạ tương đương trong bất kỳ preset nào, THE Mapping_Table SHALL đánh dấu artifact đó là `unmapped` và đưa vào danh sách "Source-only artifacts".
4. WHEN một artifact xuất hiện trong một preset của Target_Kit nhưng không tương ứng với artifact nào trong Source_Kit, THE Mapping_Table SHALL ghi nhận artifact đó vào danh sách "Target-only artifacts" của preset tương ứng.
5. FOR EACH cặp `match` và `divergent`, THE Mapping_Table SHALL tính một similarity score đơn giản dựa trên tỉ lệ dòng giống nhau giữa hai file (line-based diff hoặc token Jaccard) và lưu vào ô tương ứng dưới dạng phần trăm.
6. THE Mapping_Table SHALL được lưu vào `docs/audits/claudekit-vs-kirokit/mapping.md` cộng với một bản CSV `mapping.csv` để có thể xử lý chương trình.

### Requirement 5: Kiểm tra cấu trúc và metadata chuẩn

**User Story:** Là một auditor, tôi muốn phát hiện các artifact không tuân thủ chuẩn cấu trúc/front-matter, để các preset duy trì được tính máy đọc được.

#### Acceptance Criteria

1. FOR EACH agent file trong cả Source_Kit và Target_Kit, THE Audit_Process SHALL kiểm tra Front_Matter chứa tối thiểu các trường: `inclusion`, `name`, `description`, `model`. IF một trong các trường này thiếu, THEN THE Audit_Process SHALL ghi một Gap loại `structural` với severity `medium`.
2. FOR EACH command file trong cả hai kit, THE Audit_Process SHALL kiểm tra Front_Matter chứa tối thiểu các trường: `inclusion`, `description`, `argument-hint`. IF thiếu, THEN THE Audit_Process SHALL ghi một Gap `structural` với severity `low`.
3. FOR EACH skill folder trong cả hai kit, THE Audit_Process SHALL kiểm tra sự tồn tại của `SKILL.md` (case-insensitive với `skill.md`). IF không có `SKILL.md` và folder không phải Sub_Skill_Container hợp lệ, THEN THE Audit_Process SHALL ghi một Gap `structural` với severity `high`.
4. FOR EACH SKILL.md, THE Audit_Process SHALL kiểm tra Progressive_Disclosure: nếu `SKILL.md` dài hơn 200 dòng và không có thư mục `references/` đi kèm, THE Audit_Process SHALL ghi một Gap `structural` với severity `low` đề xuất tách reference.
5. FOR EACH hook script được khai báo trong `settings.json` (cả Source_Kit và mỗi preset Target_Kit), THE Audit_Process SHALL kiểm tra file đích tồn tại. IF không tồn tại, THEN THE Audit_Process SHALL ghi một Gap `structural` với severity `critical`.
6. FOR EACH Cross_Platform_Triple được Source_Kit cung cấp đầy đủ, THE Audit_Process SHALL kiểm tra preset Target_Kit cũng có đủ ba biến thể. IF thiếu một hoặc nhiều biến thể, THEN THE Audit_Process SHALL ghi một Gap `missing` với severity `medium` và liệt kê biến thể bị thiếu.

### Requirement 6: Phân tích Gap và phân loại theo mức độ

**User Story:** Là một auditor, tôi muốn mọi gap được phân loại theo type, severity, và preset bị ảnh hưởng, để có thể lọc và ưu tiên xử lý.

#### Acceptance Criteria

1. THE Audit_Process SHALL gom mọi gap phát hiện trong Requirement 4 và Requirement 5 thành một Gap_List duy nhất, mỗi entry chứa các trường: `id` (định danh duy nhất), `type` (`missing`/`extra`/`divergent`/`structural`), `severity`, `artifact_path_source`, `artifact_path_target`, `preset_affected`, `description`, `evidence` (trích đoạn ngắn hoặc số liệu).
2. THE Audit_Process SHALL gán severity theo các quy tắc cố định: hook hoặc settings reference bị broken → `critical`; thiếu agent/skill/workflow cốt lõi (có trong Source_Kit và là engineer-grade) → `high`; thiếu artifact bổ trợ hoặc nội dung lệch >50% → `medium`; thiếu artifact mở rộng hoặc nội dung lệch 20-50% → `low`; chỉ là khác biệt format/whitespace → `informational`.
3. THE Audit_Process SHALL nhóm Gap_List theo preset và xuất một bảng thống kê đếm số gap theo (severity × type × preset) trong Audit_Report.
4. WHEN một artifact bị thiếu ở nhiều preset, THE Gap_List SHALL gom thành một entry duy nhất với field `preset_affected` là danh sách, không tạo entry trùng lặp.
5. THE Gap_List SHALL được lưu vào `docs/audits/claudekit-vs-kirokit/gaps.md` (Markdown có bảng) và `gaps.csv` (cùng dữ liệu, dạng phẳng để filter).

### Requirement 7: Đánh giá chất lượng nội dung và tính nhất quán

**User Story:** Là một auditor, tôi muốn so sánh chất lượng nội dung của các artifact trùng tên giữa hai kit, để biết artifact đã được tùy biến đúng ngữ cảnh preset hay chỉ copy nguyên xi.

#### Acceptance Criteria

1. FOR EACH cặp artifact có nhãn `match` hoặc `divergent` trong Mapping_Table, THE Audit_Process SHALL ghi nhận: similarity score, danh sách header H1/H2 hai bên, và sự hiện diện của các từ khóa context-specific (ví dụ "React"/"Next.js" cho frontend, "Flutter"/"React Native" cho mobile).
2. WHEN một artifact trong preset Target_Kit có similarity score >95% với artifact gốc Source_Kit và không chứa từ khóa context-specific phù hợp với preset, THE Audit_Process SHALL ghi một Gap `divergent` với severity `medium` và mô tả là "chưa tùy biến theo preset".
3. THE Audit_Process SHALL kiểm tra emoji và PII: scan tất cả artifact của Target_Kit để phát hiện emoji (Unicode block) và pattern PII đơn giản (email, số điện thoại). IF phát hiện, THEN THE Audit_Process SHALL ghi một Gap `structural` với severity `low` và liệt kê file kèm dòng vi phạm.
4. THE Audit_Process SHALL kiểm tra mọi link nội bộ kiểu `./...` hoặc `../...` trong file Markdown của Target_Kit bằng cách kiểm tra file đích tồn tại. IF có link bị broken, THEN THE Audit_Process SHALL ghi một Gap `structural` với severity `medium`.
5. THE Audit_Process SHALL ghi vào Audit_Report một section "Content Quality" tổng hợp: số lượng cặp `match`/`divergent`, số artifact chưa tùy biến, số vi phạm emoji/PII, số link broken.

### Requirement 8: Khuyến nghị (Recommendations) có ưu tiên

**User Story:** Là một maintainer, tôi muốn nhận một danh sách action item có ưu tiên rõ ràng, để biết phải làm gì trước trong sprint kế tiếp.

#### Acceptance Criteria

1. THE Audit_Process SHALL sinh một Recommendation_List, mỗi entry chứa: `id`, `title`, `linked_gap_ids` (danh sách `id` từ Gap_List liên kết đến), `proposed_action` (mô tả ngắn cụ thể), `affected_presets`, `priority` (`P0`/`P1`/`P2`/`P3`), `effort` (`S` ≤ 1 ngày, `M` 1-3 ngày, `L` >3 ngày), và `owner_role` (ví dụ `cli-maintainer`, `preset-author`).
2. THE Audit_Process SHALL ánh xạ severity sang priority như sau: mọi gap `critical` → `P0`; gap `high` → `P1`; gap `medium` → `P2`; gap `low` hoặc `informational` → `P3`.
3. THE Recommendation_List SHALL gom các gap có cùng giải pháp thành một recommendation duy nhất; ví dụ "thêm 5 hook scripts còn thiếu cho preset frontend" gom thành một entry thay vì 5 entry riêng.
4. WHEN một recommendation đề xuất port artifact từ Source_Kit, THE Recommendation SHALL nêu rõ đường dẫn nguồn và đường dẫn đích đề xuất theo cấu trúc preset của Target_Kit, đồng thời cảnh báo các thay đổi cần thực hiện cho phù hợp ngữ cảnh preset (ví dụ đổi từ khóa Anthropic-only sang ngôn ngữ trung lập).
5. THE Recommendation_List SHALL được lưu vào `docs/audits/claudekit-vs-kirokit/recommendations.md` và sắp xếp giảm dần theo priority, sau đó tăng dần theo effort.

### Requirement 9: Báo cáo tổng hợp (Executive Summary)

**User Story:** Là một stakeholder, tôi muốn đọc một báo cáo tổng hợp ngắn gọn để nắm được kết luận chính trong dưới 5 phút.

#### Acceptance Criteria

1. THE Audit_Report SHALL có một file gốc `docs/audits/claudekit-vs-kirokit/README.md` chứa Executive Summary, không quá 200 dòng, với các section: "Scope", "Key Findings", "Parity Score by Preset", "Top 10 Recommendations", "Links to Detail Files".
2. THE Audit_Report SHALL tính một Parity Score cho mỗi preset theo công thức tham chiếu: `parity = (matched_count + 0.5 × divergent_count) / source_total_artifact_count` × 100%, làm tròn đến số nguyên, với `source_total_artifact_count` là tổng artifact của Source_Kit có thể áp dụng cho preset đó.
3. THE Executive Summary SHALL hiển thị Parity Score dưới dạng bảng có cột preset và cột parity, sắp xếp giảm dần theo điểm.
4. THE Executive Summary SHALL liệt kê tối đa 10 recommendation có priority cao nhất, với title và effort, không kèm body chi tiết.
5. THE Executive Summary SHALL có một section "Methodology" mô tả ngắn gọn cách audit được thực hiện và các giả định/giới hạn (ví dụ similarity score chỉ là heuristic line-based, không phân tích ngữ nghĩa).
6. THE Executive Summary SHALL không chứa emoji.

### Requirement 10: Cấu trúc thư mục đầu ra cố định

**User Story:** Là một người tiêu thụ báo cáo, tôi muốn tất cả file đầu ra nằm ở vị trí và cấu trúc dự đoán được, để có thể tham chiếu hoặc tự động hóa downstream.

#### Acceptance Criteria

1. THE Audit_Process SHALL ghi mọi file đầu ra dưới thư mục `docs/audits/claudekit-vs-kirokit/`.
2. THE Audit_Process SHALL tạo cấu trúc thư mục cố định gồm: `README.md` (Executive Summary), `inventory-source.md`, `inventory-target-summary.md`, `inventory-target-<preset>.md` (7 file, một cho mỗi preset gồm `_template`), `mapping.md`, `mapping.csv`, `gaps.md`, `gaps.csv`, `recommendations.md`, `methodology.md`, và thư mục `appendix/` chứa dữ liệu thô (file listing, similarity matrix dạng JSON).
3. THE Audit_Report SHALL có một file `methodology.md` mô tả chi tiết: pattern loại trừ, quy tắc khớp tên, công thức similarity, công thức Parity Score, ngưỡng severity, ánh xạ severity → priority.
4. WHEN audit chạy lại, THE Audit_Process SHALL ghi đè các file đầu ra mà không xóa thư mục gốc; mỗi file phải có một dòng cuối ghi lại timestamp lần chạy gần nhất.
5. THE Audit_Process SHALL không tạo file ngoài thư mục `docs/audits/claudekit-vs-kirokit/`, ngoại trừ trường hợp ghi log debug có thể đặt tại `docs/audits/claudekit-vs-kirokit/appendix/run.log`.

### Requirement 11: Tính tái lập và minh bạch

**User Story:** Là một người chạy audit lần thứ hai, tôi muốn có khả năng tái lập kết quả và phân biệt được khác biệt giữa hai lần chạy, để theo dõi tiến triển khi maintainer xử lý gap.

#### Acceptance Criteria

1. THE Audit_Report SHALL ghi lại trong `methodology.md` mọi tham số có thể ảnh hưởng kết quả: similarity threshold (mặc định 95% cho "chưa tùy biến", 20% cho biên `divergent` vs `match`), danh sách Artifact_Type được audit, danh sách pattern loại trừ, danh sách context keyword cho mỗi preset.
2. WHEN một tham số trong Requirement 11.1 thay đổi, THE Audit_Report SHALL ghi giá trị thực tế đã dùng vào header của file `methodology.md` của lần chạy đó, không chỉ giá trị mặc định.
3. THE appendix SHALL chứa file `appendix/source-files.txt` và `appendix/target-files-<preset>.txt` liệt kê đầy đủ đường dẫn file đã quét, để hai lần chạy có thể diff được.
4. THE Audit_Report SHALL ghi trong README.md section "Reproduce" các bước con người có thể làm để tái lập audit, gồm: lệnh shell để liệt kê file mỗi gốc, công cụ similarity (ví dụ `git diff --no-index` hoặc `diff -u`), và cách regenerate Parity Score từ `mapping.csv`.

### Requirement 12: Đối chiếu với spec hiện có của kk-kiro-kit

**User Story:** Là một maintainer, tôi muốn audit này phản chiếu lại các minCount và yêu cầu trong spec `kk-kiro-kit` hiện có, để biết preset hiện tại có đáp ứng chính cam kết của mình không.

#### Acceptance Criteria

1. THE Audit_Process SHALL đọc `presets/<preset>/manifest.json` của mỗi preset và trích field `minCounts` (nếu có) cùng nội dung field `files`.
2. THE Audit_Process SHALL đếm số agent, skill, command, hook, workflow thực tế (theo file trên disk) cho mỗi preset, và đối chiếu với `minCounts` của preset đó.
3. WHEN số đếm thực tế nhỏ hơn `minCounts` đã khai báo, THE Audit_Process SHALL ghi một Gap `missing` với severity `high` và đính kèm cả số đếm thực tế lẫn ngưỡng minCount.
4. THE Audit_Process SHALL tham chiếu file `.kiro/specs/kk-kiro-kit/requirements.md` và trích các yêu cầu liên quan đến parity với Source_Kit (Requirement 1, 5-9 trong spec đó nếu có); đối chiếu mỗi yêu cầu với phát hiện tương ứng trong audit, ghi vào một bảng "Spec Compliance" trong Audit_Report.
5. THE Audit_Report SHALL có một section riêng "kk-kiro-kit Spec Compliance" trong `README.md` tóm tắt: số yêu cầu đã đạt, số yêu cầu chưa đạt, danh sách yêu cầu chưa đạt kèm artifact bị thiếu liên quan.
