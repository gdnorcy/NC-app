// 幂等迁移：清理 mall-home 早期装修稿中的幽灵组件
// 背景：mall-home 早期模板含 type:'goods-nav'（商品分类导航，已废弃，registry/画布/C 端均无此组件）
//      与 type:'goods-list'（旧版商品列表，现行为 goods-group，画布与 C 端均不渲染旧 type），
//      导致画布与 C 端均出现空区域、C 端 hasGoodsList 误判走兜底列表 → 装修内容与 C 端不一致。
// 处理：移除 goods-nav；goods-list → goods-group（props 同语义）。幂等，可重复执行。
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(path.join(root, 'server/data/panorama.db'));

const rows = db.prepare('SELECT id, tenant_id, page_type, status FROM tenant_page_design').all();
let removed = 0, fixed = 0;
for (const r of rows) {
  const row = db.prepare('SELECT design_json FROM tenant_page_design WHERE id = ?').get(r.id);
  if (!row) continue;
  let j;
  try { j = JSON.parse(row.design_json); } catch { continue; }
  const comps = j.components || [];
  const before = JSON.stringify(j);
  j.components = comps.filter((c) => {
    if (c && c.type === 'goods-nav') { removed++; return false; }
    if (c && c.type === 'goods-list') { c.type = 'goods-group'; fixed++; }
    return true;
  });
  if (JSON.stringify(j) !== before) {
    db.prepare('UPDATE tenant_page_design SET design_json = ? WHERE id = ?').run(JSON.stringify(j), r.id);
  }
}
console.log(`✅ 迁移完成：移除 goods-nav ${removed} 个，归一化 goods-list → goods-group ${fixed} 个`);
