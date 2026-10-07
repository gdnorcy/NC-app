#!/usr/bin/env node
/**
 * 微信登录换真实通道后的账号接续脚本。
 *
 * 背景：旧 mock 通道 openid='mock_'+code（每次登录都变）→ 真机上每次登录都建新用户，
 * 名片/入驻/会员关系全丢。换成真实 code2session 后 openid 稳定，但真机首次登录又会
 * 新建一个「真实 openid」的空用户，而原来的名片仍挂在 mock 用户下。
 *
 * 作用：把「真实 openid」搬运到持有名片的旧账号上（旧账号获得稳定 openid，登录即可
 * 找回名片），并删掉新建的空用户。
 *
 * 用法：
 *   node scripts/rebind-wx-user.mjs            # 预演：只打印将要做什么
 *   node scripts/rebind-wx-user.mjs --apply    # 实际执行（执行前自动备份 DB）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 与 server/src/config.js 的 dbPath 保持一致（DATA_DIR 可覆盖）
const dbPath = process.env.DB_PATH || path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'server', 'data'), 'panorama.db');
if (!fs.existsSync(dbPath)) { console.error('找不到数据库：', dbPath); process.exit(1); }
const apply = process.argv.includes('--apply');
const db = new DatabaseSync(dbPath);

const users = db.prepare(
  `SELECT u.*, (SELECT COUNT(*) FROM card_profile c WHERE c.user_id = u.id) AS card_cnt
   FROM platform_user u ORDER BY u.id DESC`
).all();

// 真实微信 openid 特征：28 位、以 o 开头（种子/演示账号形如 openid_9024、dist-u1003，须排除）
const isRealOpenid = (o) => !!o && /^o[A-Za-z0-9_-]{24,32}$/.test(o);

const argOf = (k) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? Number(process.argv[i + 1]) : 0;
};
const fromId = argOf('--from');
const toId = argOf('--to');
const byId = (id) => users.find((u) => u.id === id);

// 显式指定优先；否则自动挑：真实 openid 且无名片（最新一个） + mock openid 且持名片（最新一个）
const from = fromId ? byId(fromId) : users.filter((u) => isRealOpenid(u.openid) && !u.card_cnt)[0];
const to = toId ? byId(toId) : users.filter((u) => (!u.openid || u.openid.startsWith('mock_')) && u.card_cnt > 0)[0];

console.log('== 候选：真实 openid 且无名片（真机登录新建的空账号） ==');
users.filter((u) => isRealOpenid(u.openid) && !u.card_cnt).slice(0, 5)
  .forEach((u) => console.log(`  #${u.id} openid=${u.openid} 昵称=${u.nickname} 名片=${u.card_cnt}`));
console.log('== 候选：mock openid 且持有名片（旧账号） ==');
users.filter((u) => (!u.openid || u.openid.startsWith('mock_')) && u.card_cnt > 0).slice(0, 5)
  .forEach((u) => console.log(`  #${u.id} openid=${u.openid} 昵称=${u.nickname} 名片=${u.card_cnt}`));

if (!from || !to) {
  console.log('\n无需接续（缺少候选账号）。真机登录一次后再来运行；或手动指定 --from <新账号id> --to <旧账号id>。');
  process.exit(0);
}
console.log(`\n计划：把 openid「${from.openid}」从空账号 #${from.id} 过户给持名片账号 #${to.id}（${to.nickname}，名片 ${to.card_cnt} 张），并删除空账号 #${from.id}`);
if (!apply) { console.log('（预演模式，加 --apply 执行）'); process.exit(0); }

const bak = `${dbPath}.bak-${Date.now()}`;
fs.copyFileSync(dbPath, bak);
console.log('已备份 →', bak);

db.prepare('UPDATE platform_user SET openid = ?, unionid = ? WHERE id = ?').run(from.openid, from.unionid || '', to.id);
db.prepare('DELETE FROM platform_user WHERE id = ?').run(from.id);
console.log('✅ 完成：登录小程序即可回到原账号（名片/入驻/会员保留）');
