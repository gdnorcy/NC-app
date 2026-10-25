/**
 * 租户默认套餐播种（ensureTenantDefaultLevels）测试
 *
 * P1f 落地后线上发现：租户若已有自建等级，首版「有等级就跳过」的守卫会让四档标准套餐
 * 完全不播种 → 权益矩阵 0 行 → 新模型在该租户形同虚设（全部回落旧镜像）。
 * 本文件钉死播种规则：四档必建 / 同名空壳认领 / 自定义权益不覆盖 / 幂等。
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb, ensureTenantDefaultLevels } from '../src/db.js';
import { TIER_PKG, resolveAppBenefits } from '../src/services/member.js';

describe('租户默认套餐播种', () => {
  let db;
  const DB_PATH = path.join(os.tmpdir(), `member-seed-test-${Date.now()}.db`);
  const TENANT = 88001;

  before(() => {
    db = createDb(DB_PATH);
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  const levels = (tid) => db.prepare('SELECT id, name, pkg_level FROM member_levels WHERE tenant_id = ? ORDER BY level_no').all(tid);
  const matrixRows = (tid) => db.prepare('SELECT COUNT(*) AS n FROM member_level_app_benefits WHERE tenant_id = ?').get(tid).n;

  it('全新租户：四档标准套餐 + 每档 5 个应用矩阵齐全', () => {
    ensureTenantDefaultLevels(db, TENANT);
    const ls = levels(TENANT);
    assert.equal(ls.length, 4);
    assert.deepEqual(ls.map((l) => l.pkg_level), ['free', 'silver', 'gold', 'diamond']);
    // 每档 5 个应用（card/member/mall/market/radar）
    assert.equal(matrixRows(TENANT), 20);
  });

  it('幂等：重复播种不新增等级、不覆盖已有矩阵', () => {
    const before = levels(TENANT).length;
    const goldId = levels(TENANT).find((l) => l.pkg_level === 'gold').id;
    // 手动改掉 gold 的矩阵（模拟租户自定义）
    db.prepare("UPDATE member_level_app_benefits SET benefits = ? WHERE tenant_id = ? AND level_id = ? AND app_code = 'card'")
      .run(JSON.stringify({ works_limit: 999 }), TENANT, goldId);
    ensureTenantDefaultLevels(db, TENANT);
    assert.equal(levels(TENANT).length, before, '重复播种不应新增等级');
    const row = db.prepare("SELECT benefits FROM member_level_app_benefits WHERE tenant_id = ? AND level_id = ? AND app_code = 'card'")
      .get(TENANT, goldId);
    assert.equal(JSON.parse(row.benefits).works_limit, 999, '租户已配置的矩阵不得被种子覆盖');
  });

  it('存量同名空壳等级（无启用权益）→ 认领为标准档，不重复建名', () => {
    const T2 = 88002;
    const info = db.prepare(
      `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
       VALUES (?,1,'黄金会员',1,'consume',0,9900,'{}',1,'manual',0)`
    ).run(T2);
    ensureTenantDefaultLevels(db, T2);
    const gold = levels(T2).find((l) => l.pkg_level === 'gold');
    assert.ok(gold, '应认领出 gold 标准档');
    assert.equal(gold.id, info.lastInsertRowid, '应认领存量那一行，而不是新建');
    assert.equal(levels(T2).filter((l) => l.name === '黄金会员').length, 1, '不应出现重名档位');
    assert.equal(matrixRows(T2), 20, '认领后矩阵应补齐');
  });

  it('存量同名但启用了自定义权益的等级 → 不认领，另建「（标准档）」避让', () => {
    const T3 = 88003;
    db.prepare(
      `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
       VALUES (?,1,'黄金会员',1,'consume',0,9900,'{"discount":{"enabled":true,"value":80}}',1,'manual',0)`
    ).run(T3);
    ensureTenantDefaultLevels(db, T3);
    const gold = levels(T3).find((l) => l.pkg_level === 'gold');
    assert.ok(gold, '应另建 gold 标准档');
    assert.equal(gold.name, '黄金会员（标准档）', '同名冲突时新档应加后缀避让');
    const custom = levels(T3).find((l) => l.name === '黄金会员');
    assert.equal(custom.pkg_level, null, '自定义等级不得被标记成标准档');
    assert.equal(custom.id !== gold.id, true);
  });

  it('认领后：该档成员真正拿到该档权益（不再是空头套餐）', () => {
    const T4 = 88004;
    db.prepare(
      `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
       VALUES (?,1,'黄金会员',1,'consume',0,9900,'{"discount":{"enabled":false}}',1,'manual',0)`
    ).run(T4);
    ensureTenantDefaultLevels(db, T4);
    const gold = levels(T4).find((l) => l.pkg_level === 'gold');
    db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)').run(88041, 'seed-u1', T4);
    db.prepare("INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59')")
      .run(T4, 88041, gold.id);
    const b = resolveAppBenefits(db, T4, 88041, 'card');
    assert.equal(b.works_limit, TIER_PKG.gold.card.works_limit, '认领档成员应拿到 gold 档权益');
    assert.equal(b.voice_enabled, true);
  });

  it('其它自建等级不动（无矩阵 → resolver 回落旧镜像兜底，存量不降权）', () => {
    const T5 = 88005;
    db.prepare(
      `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
       VALUES (?,1,'我的专属档',1,'consume',0,0,'{}',1,'manual',0)`
    ).run(T5);
    ensureTenantDefaultLevels(db, T5);
    const custom = levels(T5).find((l) => l.name === '我的专属档');
    assert.equal(custom.pkg_level, null, '自建等级不应被标成标准档');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM member_level_app_benefits WHERE tenant_id = ? AND level_id = ?').get(T5, custom.id).n, 0,
      '自建等级不应被塞进标准矩阵');
    // 旧镜像兜底：镜像为 gold 的存量 VIP 仍享 gold 权益
    db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)').run(88051, 'seed-u2', T5);
    db.prepare("UPDATE platform_user SET member_level = 'gold', member_expire_at = '2999-12-31 23:59:59' WHERE id = ?").run(88051);
    const b = resolveAppBenefits(db, T5, 88051, 'card');
    assert.equal(b.works_limit, TIER_PKG.gold.card.works_limit, '无矩阵时应回落旧镜像档位权益');
  });

  // ===== 1b：member_package 升级为「套餐模板库」后的播种规则 =====
  const marketOf = (tid, tier) => db.prepare(
    "SELECT benefits FROM member_level_app_benefits WHERE tenant_id = ? AND app_code = 'market' AND level_id = (SELECT id FROM member_levels WHERE tenant_id = ? AND pkg_level = ?)"
  ).get(tid, tid, tier);

  it('模板驱动：总后台改 member_package.price → 新租户 buy_price 跟随（修复旧不一致）', () => {
    db.prepare("UPDATE member_package SET price = 199 WHERE level = 'gold'").run();
    ensureTenantDefaultLevels(db, 88010);
    const gold = db.prepare('SELECT name, buy_price FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(88010, 'gold');
    assert.equal(gold.name, '黄金会员');
    assert.equal(gold.buy_price, 19900, '新租户 buy_price 应取模板 price×100');
    db.prepare("UPDATE member_package SET price = 99 WHERE level = 'gold'").run();
  });

  it('模板驱动：模板 market_subject=0 → 新租户矩阵 market 应用不授场席', () => {
    db.prepare("UPDATE member_package SET market_subject = 0 WHERE level = 'silver'").run();
    ensureTenantDefaultLevels(db, 88011);
    assert.equal(JSON.parse(marketOf(88011, 'silver').benefits).market_subject, 0);
    db.prepare("UPDATE member_package SET market_subject = 1 WHERE level = 'silver'").run();
  });

  it('模板停用（enabled=0）：该档不向新租户播种，其余档不受影响', () => {
    db.prepare("UPDATE member_package SET enabled = 0 WHERE level = 'diamond'").run();
    ensureTenantDefaultLevels(db, 88012);
    assert.deepEqual(levels(88012).map((l) => l.pkg_level), ['free', 'silver', 'gold']);
    db.prepare("UPDATE member_package SET enabled = 1 WHERE level = 'diamond'").run();
  });

  it('模板行缺失 → 回落 TIER_PKG 硬编码安全网（四档仍在，价格/名称取硬编码）', () => {
    const saved = db.prepare("SELECT * FROM member_package WHERE level = 'gold'").get();
    db.prepare("DELETE FROM member_package WHERE level = 'gold'").run();
    ensureTenantDefaultLevels(db, 88013);
    const ls = levels(88013);
    assert.deepEqual(ls.map((l) => l.pkg_level), ['free', 'silver', 'gold', 'diamond']);
    const gold = db.prepare('SELECT name, buy_price FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(88013, 'gold');
    assert.equal(gold.name, TIER_PKG.gold.name);
    assert.equal(gold.buy_price, Math.round(TIER_PKG.gold.price * 100));
    // 还原被删模板行（按原值整行插回）
    const cols = Object.keys(saved);
    db.prepare(`INSERT INTO member_package (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .run(...cols.map((c) => saved[c]));
  });

  it('模板改名 → 新租户标准档用新名（档位身份以模板为准）', () => {
    db.prepare("UPDATE member_package SET name = '黄金会员Pro' WHERE level = 'gold'").run();
    ensureTenantDefaultLevels(db, 88014);
    assert.equal(db.prepare('SELECT name FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(88014, 'gold').name, '黄金会员Pro');
    db.prepare("UPDATE member_package SET name = '黄金会员' WHERE level = 'gold'").run();
  });

  it('认领匹配按模板名：模板改名后，存量同名空壳按新名认领、不重名', () => {
    db.prepare("UPDATE member_package SET name = '铂金会员' WHERE level = 'silver'").run();
    const T = 88015;
    db.prepare(
      `INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days)
       VALUES (?,1,'铂金会员',1,'consume',0,2990,'{}',1,'manual',0)`
    ).run(T);
    ensureTenantDefaultLevels(db, T);
    const silver = db.prepare('SELECT id, name, pkg_level FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(T, 'silver');
    assert.ok(silver, '应按模板新名认领空壳');
    assert.equal(silver.name, '铂金会员');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM member_levels WHERE tenant_id = ? AND name = ?').get(T, '铂金会员').n, 1, '不得重名');
    db.prepare("UPDATE member_package SET name = '白银会员' WHERE level = 'silver'").run();
  });

  it('存量不覆盖：模板改价/改场席不影响已播种租户（重启式补种幂等）', () => {
    const T = 88016;
    ensureTenantDefaultLevels(db, T); // 先按现模板播种
    const before = db.prepare('SELECT buy_price FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(T, 'gold');
    db.prepare("UPDATE member_package SET price = 5, market_subject = 0 WHERE level = 'gold'").run();
    ensureTenantDefaultLevels(db, T); // 模拟重启补种
    assert.equal(db.prepare('SELECT buy_price FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(T, 'gold').buy_price, before.buy_price,
      '已播种档的 buy_price 不得被模板改动覆盖');
    assert.equal(JSON.parse(marketOf(T, 'gold').benefits).market_subject, 1, '已播种档的矩阵不得被模板改动覆盖');
    db.prepare("UPDATE member_package SET price = 99, market_subject = 1 WHERE level = 'gold'").run();
  });
});
