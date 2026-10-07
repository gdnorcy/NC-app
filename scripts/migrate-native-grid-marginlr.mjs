/**
 * 存量迁移：名片宫格（native-grid）补marginLR。
 *
 * 🔴 背景（2026-10-07 用户反馈「小程序端左右边距没渲染出来，后台预览有」）：
 *   `nativeMargin()` 原先只输出上下边距，`marginLR` 被完全丢弃 →
 *   宫格（`.grid-section` 是**通栏白底**）直接贴到屏幕左右边缘。
 *   而 admin 设计器因为 `.pe-comp` 自身有内缩，看起来「有边距」→ 两端不一致。
 *
 * 迁移原则（定向，只动「等于旧默认值」的）：
 *   - 仅 native-grid（其余 native-* 存量已有 6~7px，本来就正常）
 *   - 仅 marginLR 为 0 /undefined（0 是 schema 旧默认，不是用户刻意设的通栏）
 *   - 用户手动设过非 0 的一律不动
 *   - 幂等：已是 12 的不会被再次改写
 *
 * 用法：node scripts/migrate-native-grid-marginlr.mjs [--apply]
 */
import { DatabaseSync } from 'node:sqlite';

const APPLY = process.argv.includes('--apply');
const TARGET = 12; // 新默认值，与 componentRegistry.js defaultProps.marginLR 保持一致

const db = new DatabaseSync('/Users/linping/Downloads/360全景/server/data/panorama.db');
const rows = db.prepare('SELECT id, page_type, design_json, version FROM tenant_page_design').all();

const plan = [];
for (const row of rows) {
  let design;
  try { design = JSON.parse(row.design_json || '{}'); } catch { continue; }
  const comps = design.components || [];
  let changed = 0;
  for (const c of comps) {
    if (c?.type !== 'native-grid') continue;
    const p = c.props || (c.props = {});
    const cur = p.marginLR;
    if (cur === TARGET) continue;      // 已迁过
    if (cur !== 0 && cur !== undefined && cur !== null && cur !== '') continue; // 用户设过 → 不动
    p.marginLR = TARGET;
    changed++;
  }
  if (changed) plan.push({ row, design, changed });
}

console.log(`迁移预演：${plan.length} 个页面 / ${plan.reduce((s, x) => s + x.changed, 0)} 个宫格组件将 marginLR 0 → ${TARGET}`);
for (const { row, changed } of plan) {
  console.log(`  page ${row.id} (${row.page_type}) v${row.version}：${changed} 个宫格`);
  console.log(`    改前: ${JSON.stringify(row.design_json).match(/"type":"native-grid".{0,120}/)?.[0] || ''}`);
}

if (!APPLY) {
  console.log('\n预演模式，未写库。加 --apply 执行。');
  process.exit(0);
}

const upd = db.prepare("UPDATE tenant_page_design SET design_json = ?, updated_at = datetime('now') WHERE id = ?");
for (const { row, design } of plan) {
  upd.run(JSON.stringify(design), row.id);
  // 同时写一份版本快照，保持版本链完整
  // ⚠️ tenant_page_version 没有 page_id 列（只有 tenant_id/page_type/version/...）
  try {
    const maxV = db.prepare('SELECT MAX(version) v FROM tenant_page_version WHERE tenant_id = ? AND page_type = ?')
      .get(row.tenant_id, row.page_type)?.v || 0;
    db.prepare("INSERT INTO tenant_page_version (tenant_id, page_type, version, design_json, created_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .run(row.tenant_id, row.page_type, maxV + 1, JSON.stringify(design));
  } catch (e) {
    console.warn(`  page ${row.id} 版本快照跳过: ${e.message}`);
  }
  console.log(`  ✓ 已写入 page ${row.id}`);
}
console.log('\n完成。');