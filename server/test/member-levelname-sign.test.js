/**
 * 会员等级名统一口径 + 签到事实来源（2026-10-27 个人中心/会员中心职责重划）
 *
 * 背景（用户反馈「个人中心和会员中心重复，说不出的感觉」的真因）：
 *   改造前等级名在 C 端出现 5 处、3 种口径（前端硬编码映射表 / 租户档位真名 / TIER_PKG 模板名），
 *   且租户自建档位 pkg_level 为 NULL → effectiveMembership 返回 level='custom'
 *   → 前端映射表查不到 → 徽章显示空白。
 *
 * 本文件钉死：
 *   ① resolveLevelName：租户档位真名优先 / 旧镜像回落模板名 / 非会员「免费版」/ **永不空串**
 *   ② signSummary：签到事实独立于「是否已开通会员卡」（score_sign='all' 时非会员也能签 → 不再是空头）
 *   ③ signSummary 权限口径：score_sign='member' 时非会员 canSign=false 且给 reason
 *   ④ sign() 返回 totalScore（签到卡要显示累计积分，不必再发一次请求）
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb, ensureTenantDefaultLevels } from '../src/db.js';
import { createMemberService, resolveLevelName } from '../src/services/member.js';

describe('等级名统一口径 + 签到事实来源', () => {
  let db, member;
  const DB_PATH = path.join(os.tmpdir(), `member-levelname-test-${Date.now()}.db`);
  const T = 88501;

  before(() => {
    db = createDb(DB_PATH);
    member = createMemberService(db);
    ensureTenantDefaultLevels(db, T);
    const ins = db.prepare('INSERT INTO platform_user (id, openid, customer_id) VALUES (?,?,?)');
    ins.run(9101, 'ln-u1', T);    // 有效会员（gold 标准档）
    ins.run(9102, 'ln-u2', T);    // 租户自建档位会员（pkg_level 为 NULL）
    ins.run(9103, 'ln-u3', T);    // 非会员（已入驻但没开卡）
    ins.run(9104, 'ln-u4', 0);    // 未入驻任何租户
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  const openLevel = (userId, name, pkgLevel = null) => {
    const info = db.prepare(
      'INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, pkg_level, review_mode, valid_days) VALUES (?,?,?,1,\'consume\',0,0,\'{}\',999,?,\'manual\',0)'
    ).run(T, 99, name, pkgLevel);
    db.prepare(
      "INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at, updated_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59', datetime('now'))"
    ).run(T, userId, info.lastInsertRowid);
    return info.lastInsertRowid;
  };

  it('① 租户档位真名优先（标准档：取 member_levels.name）', () => {
    const gold = db.prepare("SELECT id FROM member_levels WHERE tenant_id = ? AND pkg_level = 'gold'").get(T);
    db.prepare(
      "INSERT INTO member_user (tenant_id, user_id, level_id, status, expire_at, updated_at) VALUES (?,?,?, 'active', '2999-12-31 23:59:59', datetime('now'))"
    ).run(T, 9101, gold.id);
    const r = resolveLevelName(db, 9101, T);
    assert.equal(r.isMember, true);
    assert.ok(r.levelName, 'levelName 不得为空');
    // 标准档名（播种时用 TIER_PKG 的名字，adopt 时也用模板名）
    assert.ok(r.levelName.length > 0);
    assert.equal(r.level, 'gold');
  });

  it('② 租户自建档位（pkg_level=NULL）→ level=custom 但 levelName 取真名，不空白', () => {
    openLevel(9102, '铂金卡', null);
    const r = resolveLevelName(db, 9102, T);
    assert.equal(r.level, 'custom', 'pkg_level 为 NULL 时 level 仍是 custom');
    assert.equal(r.levelName, '铂金卡', 'levelName 必须取租户档位真名（这是修复前的空白点）');
  });

  it('③ 非会员 → levelName=免费版（不留空串）', () => {
    const r = resolveLevelName(db, 9103, T);
    assert.equal(r.isMember, false);
    assert.equal(r.levelName, '免费版');
    assert.ok(r.levelName.length > 0, '永不返回空串');
  });

  it('④ 未入驻用户 → 免费版', () => {
    const r = resolveLevelName(db, 9104, 0);
    assert.equal(r.isMember, false);
    assert.equal(r.levelName, '免费版');
  });

  it('⑤ 签到事实独立于会员卡：score_sign=all 时非会员也能签到（不再是空头）', () => {
    // 默认 permissions 为空 → score_sign 回落 'all'
    const s = member.signSummary(T, 9103);
    assert.equal(s.canSign, true, '非会员但全员可签 → 应可签');
    assert.equal(s.signed, false);
    assert.equal(s.score, 0);
  });

  it('⑥ 签到后事实翻转为已签到，累计积分 +2 且 totalScore 正确', () => {
    const r = member.sign(T, 9103);
    assert.equal(r.ok, true);
    assert.equal(r.score, 2, 'score = 本次获得');
    assert.equal(r.totalScore, 2, 'totalScore = 累计');
    const s = member.signSummary(T, 9103);
    assert.equal(s.signed, true, '签到后 signed 必须为 true');
    assert.equal(s.score, 2);
    // 重复签到被拦（同一口径）
    const again = member.sign(T, 9103);
    assert.equal(again.ok, false);
    assert.equal(again.error, '今日已签到');
  });

  it('⑦ 未入驻用户：canSign=false 且 reason 明确', () => {
    const s = member.signSummary(0, 9104);
    assert.equal(s.canSign, false);
    assert.ok(s.reason, '必须给 C 端可用的原因文案');
  });

  it('⑧ score_sign=member 时非会员不可签到（后台权限真的生效）', () => {
    db.prepare('INSERT OR REPLACE INTO member_settings (tenant_id, card_enabled, expire_remind_days, show_name, show_expire, permissions) VALUES (?,1,7,1,1,?)')
      .run(T, JSON.stringify({ score_sign: 'member' }));
    const s = member.signSummary(T, 9103);
    assert.equal(s.canSign, false, '仅会员可签到 → 非会员应被拦');
    assert.ok(s.reason.includes('会员'), 'reason 应说明仅会员可签到');
    // 会员本人不受影响
    const s2 = member.signSummary(T, 9101);
    assert.equal(s2.canSign, true);
  });
});
