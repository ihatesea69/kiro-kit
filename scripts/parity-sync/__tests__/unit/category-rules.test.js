/**
 * Unit test: CATEGORY_RULES no-orphan completeness.
 *
 * Spec: .kiro/specs/upstream-parity-sync/{design,tasks}.md
 * Task: tasks.md > 3.3 — assert mọi source artifact ID trong
 *       inventory-source.json đều có rule (no orphan source).
 *
 * Đây là test của tính đầy đủ (not PBT): nếu inventory thêm artifact mới,
 * test này fail → maintainer phải bổ sung CATEGORY_RULES.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { lookupRule, idOf } = require('../../category-rules');

const APPENDIX_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'audits',
  'upstream-parity',
  'appendix',
);
const SOURCE_INVENTORY = path.join(APPENDIX_DIR, 'inventory-source.json');

describe('CATEGORY_RULES — no orphan source (task 3.3)', () => {
  it('mọi entry trong inventory-source.json đều có rule khớp (lookupRule != null)', () => {
    const raw = fs.readFileSync(SOURCE_INVENTORY, 'utf8');
    const items = JSON.parse(raw);

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    const orphans = [];
    for (const item of items) {
      const id = idOf(item);
      const rule = id == null ? null : lookupRule(item.artifact_type, id);
      if (rule == null) {
        orphans.push({
          id: item.id,
          artifact_type: item.artifact_type,
          path: item.path,
          derived_id: id,
        });
      }
    }

    if (orphans.length > 0) {
      // Surface up to first 5 cho dễ debug; assert sẽ làm test fail.
      // eslint-disable-next-line no-console
      console.error(
        'CATEGORY_RULES thiếu rule cho %d artifact(s):\n%s',
        orphans.length,
        JSON.stringify(orphans.slice(0, 5), null, 2),
      );
    }
    expect(orphans).toEqual([]);
  });
});
