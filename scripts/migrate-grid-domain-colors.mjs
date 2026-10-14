/**
 * 存量迁移：名片宫格（native-grid）底色 9 彩 → 4 业务域色。
 *
 * 🔴 背景（2026-10-14 全站配色审计，用户确认「宫格可自己配，不跟随租户主题」）：
 *   宫格九项底色 9 种色相各自为政（蓝/青/橙/紫/红/金/粉/灰…），一屏色相过杂。
 *   收敛为 4 业务域同域同色（与 docs/card-grid-4domain-preview.html 提案一致）：
 *     身份域 #3b6ef7→#6a4bf5（我的名片/名片交换）
 *     关系域 #0a9f8f→#10b981（访客雷达/人脉集市/我的动态）
 *     经营域 #e8590c→#f59e0b（客户管理/分销中心/会员中心）
 *     工具域 #5c6470→#3d424b（更多）
 *   收敛只落**默认值**：items.bg 取色器保留，用户后续仍可逐项自选。
 *
 * 迁移原则（定向，只动「等于历史默认值」的，参照 migrate-native-grid-marginlr.mjs）：
 *   - 仅 native-grid 组件的 items[].bg
 *   - 仅当前值命中历史默认色板（C 端/后台默认旧 9 彩 + 后台预览兜底旧 9 彩
 *     + 对比度修复前的 #ff6b35/#ffb300 两个中间值）—— 这些是未自定义的旧默认，
 *     用户手动选过的其他颜色一律不动
 *   - 幂等：已在新域色上的项不会再次改写
 *
 * 顺带修复：存量客户管理 #ff6b35（白图标 2.1:1）与会员中心 #ffb300（1.79:1）
 *   是对比度修复前写入的旧快照，本次迁移到经营域橙 #e8590c（3.4:1）后一并达标；
 *   「我的名片/人脉集市」重复紫 #7c4dff 也随之消除。
 *
 * 用法：node scripts/migrate-grid-domain-colors.mjs [--apply]
 */
import { DatabaseSync } from 'node:sqlite';

const APPLY = process.argv.includes('--apply');
const DB = '/Users/linping/Downloads/360全景/server/data/panorama.db';

// 图标 → 业务域渐变（与 componentRegistry.js native-grid 默认项、home.vue features 一致）
const DOMAIN_BY_ICON = {
  card: 'linear-gradient(135deg,#3b6ef7,#6a4bf5)',
  exchange: 'linear-gradient(135deg,#3b6ef7,#6a4bf5)',
  radar: 'linear-gradient(135deg,#0a9f8f,#10b981)',
  market: 'linear-gradient(135deg,#0a9f8f,#10b981)',
  dynamic: 'linear-gradient(135deg,#0a9f8f,#10b981)',
  customer: 'linear-gradient(135deg,#e8590c,#f59e0b)',
  dist: 'linear-gradient(135deg,#e8590c,#f59e0b)',
  crown: 'linear-gradient(135deg,#e8590c,#f59e0b)',
  apps: 'linear-gradient(135deg,#5c6470,#3d424b)',
};

// 历史默认色板（整串精确匹配）：C 端/后台默认旧 9 彩 + 后台预览兜底旧 9 彩 + 修复前中间值
const OLD_DEFAULT_BGS = new Set([
  'linear-gradient(135deg,#2979ff,#00b0ff)', 'linear-gradient(135deg,#00b8a9,#00d68f)',
  'linear-gradient(135deg,#e8590c,#f59e0b)', 'linear-gradient(135deg,#7c4dff,#b388ff)',
  'linear-gradient(135deg,#00b0ff,#536dfe)', 'linear-gradient(135deg,#ff3d3d,#ff7043)',
  'linear-gradient(135deg,#cc7a00,#f0a500)', 'linear-gradient(135deg,#ec407a,#ab47bc)',
  'linear-gradient(135deg,#78909c,#546e7a)',
  'linear-gradient(135deg,#165dff,#4080ff)', 'linear-gradient(135deg,#00b42a,#23c343)',
  'linear-gradient(135deg,#ff7d00,#ff9a2e)', 'linear-gradient(135deg,#722ed1,#9254de)',
  'linear-gradient(135deg,#f5319d,#ff7d9b)', 'linear-gradient(135deg,#0fc6c2,#35e0e0)',
  'linear-gradient(135deg,#f7ba1e,#ffd666)', 'linear-gradient(135deg,#4080ff,#7cc5ff)',
  'linear-gradient(135deg,#86909c,#a9b0bb)',
  'linear-gradient(135deg,#ff6b35,#ff9800)', 'linear-gradient(135deg,#ffb300,#ff8f00)',
]);

const db = new DatabaseSync(DB);
const rows = db.prepare('SELECT id, tenant_id, page_type, design_json, version FROM tenant_page_design').all();

const plan = [];
for (const row of rows) {
  let design;
  try { design = JSON.parse(row.design_json || '{}'); } catch { continue; }
  const comps = design.components || [];
  const moves = [];
  for (const c of comps) {
    if (c?.type !== 'native-grid') continue;
    for (const it of (c.props && c.props.items) || []) {
      const next = DOMAIN_BY_ICON[it.icon];
      if (!next) continue;                                   // 未识别图标 → 不动
      if (it.bg === next) continue;                          // 已在新域色 → 幂等
      if (!OLD_DEFAULT_BGS.has(it.bg)) {                     // 用户自选色 → 不动
        console.log(`  跳过（用户自选色，不动）: page ${row.id} ${it.icon}(${it.text}) ${it.bg}`);
        continue;
      }
      moves.push({ it, from: it.bg, to: next });
    }
  }
  if (moves.length) plan.push({ row, design, moves });
}

console.log(`迁移预演：${plan.length} 个页面 / ${plan.reduce((s, x) => s + x.moves.length, 0)} 个宫格项将迁到 4 业务域色`);
for (const { row, moves } of plan) {
  console.log(`  page ${row.id} (${row.page_type}) v${row.version}：${moves.length} 项`);
  for (const m of moves) console.log(`    ${m.it.icon}(${m.it.text}): ${m.from}  ->  ${m.to}`);
}

if (!APPLY) {
  console.log('\n预演模式，未写库。加 --apply 执行。');
  process.exit(0);
}

const upd = db.prepare("UPDATE tenant_page_design SET design_json = ?, updated_at = datetime('now') WHERE id = ?");
for (const { row, design, moves } of plan) {
  for (const m of moves) m.it.bg = m.to;
  upd.run(JSON.stringify(design), row.id);
  // 同时写一份版本快照，保持版本链完整（tenant_page_version 无 page_id 列，按 tenant_id+page_type 取最大版本）
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
db.close();
