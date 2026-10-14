// 一次性存量修复：card_profile 死 template_id 引用 → 平台默认模板
// 背景：模板库重建后旧 id（4、11 等）已不存在，存量名片挂着死引用，
// 编辑名片保存被 canCUseTemplate 400 拦截（「模板不存在或不可用」）。
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
const db = new DatabaseSync(fileURLToPath(new URL('../server/data/panorama.db', import.meta.url)));
const dead = db.prepare(
  "SELECT id, user_id, name, template_id FROM card_profile WHERE template_id IS NOT NULL AND template_id != '' AND CAST(template_id AS INTEGER) NOT IN (SELECT id FROM card_templates)"
).all();
console.log('死引用名片:', JSON.stringify(dead));
const def = db.prepare(
  'SELECT id, name FROM card_templates WHERE tenant_id = 0 AND enabled = 1 AND is_default = 1 ORDER BY id LIMIT 1'
).get();
console.log('默认模板:', JSON.stringify(def));
if (!def) { console.error('无默认模板，中止'); process.exit(1); }
const upd = db.prepare('UPDATE card_profile SET template_id = ? WHERE id = ?');
for (const c of dead) {
  upd.run(String(def.id), c.id);
  console.log('card', c.id, 'template', c.template_id, '->', def.id);
}
const ids = dead.map((d) => d.id);
if (ids.length) {
  console.log('复查:', JSON.stringify(db.prepare(`SELECT id, template_id FROM card_profile WHERE id IN (${ids.join(',')})`).all()));
}
db.close();
