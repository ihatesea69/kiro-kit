/**
 * Property test P4 — Rebrand Correctness.
 *
 * Spec: .kiro/specs/upstream-parity-sync/design.md > Correctness Properties >
 *       Property 4.
 * Task: tasks.md > 7.6 (PBT) Property test P4.
 *
 * **Validates: Requirements 3.4, 11.1, 11.2, 11.3, 11.4**
 *
 * Statement (design.md): For all file đã được Porter ghi ra target (trừ file
 * nằm trong `skills/claude-code/`), nội dung không chứa các pattern
 * `Claude Code`, `the upstream kit`, hoặc đường dẫn `.claude/`. Mọi URL khớp pattern
 * `https://docs.claude.com/...` trong source phải xuất hiện nguyên văn trong
 * target. Basename của file không thay đổi giữa source và target (trừ một
 * rule duy nhất: root file `CLAUDE.md` → `KIRO.md`).
 *
 * Stage scope: Rebrander là pure-string transform; basename rule (CLAUDE.md
 * → KIRO.md) thuộc về root-level porter (task 17.4), không phải Rebrander.
 * Property này test 3 invariant Rebrander chịu trách nhiệm:
 *   - Pattern leak: output không còn `Claude Code`, `the upstream kit`, `.claude/`
 *     khi targetPath KHÔNG nằm trong `skills/claude-code/`.
 *   - URL preservation: mọi URL `https://*.claude.com/...` và
 *     `https://docs.anthropic.com/...` trong source xuất hiện nguyên văn
 *     trong output.
 *   - Skills/claude-code/ exception: khi targetPath match marker, phrase
 *     `Claude Code` được giữ; nhưng `the upstream kit` và `.claude/` VẪN bị rebrand.
 *
 * Generators (xem comment cấu trúc bên dưới):
 *   - `arbBodySegment` — đoạn ngắn ngẫu nhiên có thể là plain text, một
 *     trong các pattern target, hoặc URL Anthropic.
 *   - `arbBody` — body markdown ráp từ 1..15 segment.
 *   - `arbTargetPath` — chuỗi path random; 30% chance match marker
 *     `skills/claude-code/`.
 *   - `arbInput` — tuple (body, targetPath).
 *
 * Note: KHÔNG sinh `.claude.com` (chỉ một literal `.com`). Các URL Anthropic
 * có dạng đầy đủ với scheme `https://`. Điều này tránh confound: `.claude/`
 * trong path khác `.claude.com` trong URL.
 */

'use strict';

const fc = require('fast-check');

const {
  rebrand,
  CLAUDE_CODE_SKILL_MARKER,
  URL_PROTECT_RE,
} = require('../../rebrander');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbAlnumChar = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
);
const arbToken = fc
  .array(arbAlnumChar, { minLength: 1, maxLength: 8 })
  .map((arr) => arr.join(''));

// URL Anthropic pattern (subdomain optional + path). Constrain ký tự để stay
// within URL_PROTECT_RE (no whitespace/closing brackets).
const arbAnthropicUrl = fc.tuple(
  fc.constantFrom('docs.claude.com', 'console.claude.com', 'api.claude.com', 'docs.anthropic.com'),
  fc.array(arbToken, { minLength: 1, maxLength: 4 }),
).map(([host, segs]) => `https://${host}/${segs.join('/')}`);

// Plain text segment (alnum + space + punctuation safe). 1..30 chars.
const arbPlainText = fc.string({
  minLength: 1,
  maxLength: 30,
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:-'.split('')),
}).map((s) => s.length === 0 ? 'x' : s);

// Path-like ".claude/<seg>" used to test path substitution.
const arbClaudePath = fc.tuple(
  fc.constantFrom('agents', 'skills', 'commands', 'hooks', 'workflows'),
  arbToken,
).map(([cat, name]) => `.claude/${cat}/${name}`);

// One body segment — bias towards including target patterns so the property
// is meaningful (random plain text alone rarely contains "Claude Code").
const arbBodySegment = fc.oneof(
  { weight: 3, arbitrary: arbPlainText },
  { weight: 2, arbitrary: fc.constant('Claude Code') },
  { weight: 2, arbitrary: fc.constant('the upstream kit') },
  { weight: 2, arbitrary: arbClaudePath },
  { weight: 1, arbitrary: arbAnthropicUrl },
  { weight: 1, arbitrary: fc.constant('Use Claude Code with the upstream kit.') },
);

// Full body: 0..15 segments joined by space + occasional newline. Lower bound
// 0 includes empty body to test edge.
const arbBody = fc
  .array(arbBodySegment, { minLength: 0, maxLength: 15 })
  .map((segs) => segs.join(' \n'));

// Target path: 30% chance contain marker "skills/claude-code/" → exception.
const arbTargetPath = fc.oneof(
  { weight: 7, arbitrary: fc.tuple(arbToken, arbToken).map(([a, b]) => `presets/frontend/${a}/${b}.md`) },
  { weight: 3, arbitrary: arbToken.map((t) => `presets/frontend/${CLAUDE_CODE_SKILL_MARKER}${t}.md`) },
  { weight: 1, arbitrary: fc.constant('') }, // no targetPath
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract all Anthropic-domain URLs from a string using the same regex the
 * rebrander uses for protection. Returns an array (preserves order +
 * duplicates) so we can compare set-equality between source and output.
 *
 * @param {string} s
 * @returns {string[]}
 */
function extractUrls(s) {
  // Reset stateful regex (g flag retains lastIndex giữa các match call).
  URL_PROTECT_RE.lastIndex = 0;
  return s.match(URL_PROTECT_RE) || [];
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('Property 4: Rebrand Correctness — **Validates: Requirements 3.4, 11.1, 11.2, 11.3, 11.4**', () => {
  // Feature: upstream-parity-sync, Property 4: Rebrand Correctness

  it('4a: pattern leak — non-claude-code targetPath → output không còn the upstream kit, .claude/, hoặc Claude Code (ngoài URL Anthropic)', () => {
    fc.assert(
      fc.property(arbBody, arbToken, (body, name) => {
        // Force non-claude-code targetPath (không chứa marker).
        const targetPath = `presets/frontend/agents/${name}.md`;
        const output = rebrand(body, { targetPath });

        // Strip out Anthropic URLs from output trước khi check leak — URL
        // được phép chứa ".claude.com" (substring ".claude" + "."), nhưng
        // không có ".claude/" sequence (URL tiếp theo là "." không phải "/").
        const outWithoutUrls = output.replace(URL_PROTECT_RE, '');

        expect(outWithoutUrls.includes('the upstream kit')).toBe(false);
        expect(outWithoutUrls.includes('.claude/')).toBe(false);
        expect(outWithoutUrls.includes('Claude Code')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('4b: URL preservation — mọi URL Anthropic trong source xuất hiện nguyên văn trong output', () => {
    fc.assert(
      fc.property(arbBody, arbTargetPath, (body, targetPath) => {
        const output = rebrand(body, { targetPath });

        const sourceUrls = extractUrls(body);
        const outputUrls = extractUrls(output);

        // Mỗi URL trong source phải tồn tại nguyên văn trong output —
        // dùng substring search vì URL có thể bị duplicate trong body.
        for (const url of sourceUrls) {
          expect(output.includes(url)).toBe(true);
        }

        // Số URL không thay đổi: rebrander không sinh URL mới và không xóa.
        expect(outputUrls.length).toBe(sourceUrls.length);
      }),
      { numRuns: 100 },
    );
  });

  it('4c: skills/claude-code/ exception — Claude Code phrase preserved nhưng the upstream kit và .claude/ vẫn bị rebrand', () => {
    fc.assert(
      fc.property(arbBody, arbToken, (body, name) => {
        const targetPath = `presets/frontend/${CLAUDE_CODE_SKILL_MARKER}${name}.md`;
        const output = rebrand(body, { targetPath });

        const outWithoutUrls = output.replace(URL_PROTECT_RE, '');

        // the upstream kit và .claude/ vẫn phải bị rebrand kể cả trong skill exception.
        expect(outWithoutUrls.includes('the upstream kit')).toBe(false);
        expect(outWithoutUrls.includes('.claude/')).toBe(false);

        // Nếu source có "Claude Code", output cũng phải có "Claude Code"
        // (không bị thay thành "Kiro").
        if (body.includes('Claude Code')) {
          expect(output.includes('Claude Code')).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('4d: idempotency — rebrand(rebrand(x)) === rebrand(x) (string transform deterministic)', () => {
    fc.assert(
      fc.property(arbBody, arbTargetPath, (body, targetPath) => {
        const once = rebrand(body, { targetPath });
        const twice = rebrand(once, { targetPath });
        expect(twice).toBe(once);
      }),
      { numRuns: 100 },
    );
  });
});
