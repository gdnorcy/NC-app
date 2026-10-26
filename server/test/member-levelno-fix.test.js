/**
 * 会员等级 Lv 序号修复（2026-10-27，用户报修「黄金会员 Lv1 排最前，高等级的放前面了」）
 *
 * 根因链：
 *   ① addLevel 默认 level_no=1 → 管理员先自建「黄金会员」抢到 Lv1
 *   ② ensureTenantDefaultLevels 播种时「免费版/白银」按 MAX+1 顺延得 2/3，
 *      轮到「黄金会员」同名认领（只打 pkg_level 标记）→ 保留错误的 level_no=1
 *   ③ C 端档位条与后台列表都按 level_no ASC → 高档反而排最前
 *
 * 本文件钉死：
 *   ① 播种认领错序档后，标准档相对序必须满足 free<silver<gold<diamond（自动重编）
 *   ② 标准档相对序正确时 normalize 不触发（管理员手动调档位序不被启动播种覆盖）
 *   ③ addLevel 默认序号 = MAX(level_no)+1（不再写死 1）
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb, ensureTenantDefaultLevels } from '../src/db.js';
import { createMemberService } from '../src/services/member.js';

describe('会员等级 Lv 序号修复', () => {
  let db, member;
  const DB_PATH = path.join(os.tmpdir(), `member-levelno-test-${Date.now()}.db`);
  const T2 = 88511; // 错序场景租户
  const T3 = 88512; // 不错乱场景租户

  before(() => {
    db = createDb(DB_PATH);
    member = createMemberService(db);
  });

  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  /** 模拟管理员先自建同名空壳档位（认领的前置状态） */
  const seedCustomShell = (tenantId, name, levelNo) => {
    db.prepare(
      "INSERT INTO member_levels (tenant_id, level_no, name, status, upgrade_mode, consume_amount, buy_price, benefits, sort_order, review_mode, valid_days) VALUES (?,?,?,1,'consume',0,0,'{}',?,'manual',0)"
    ).run(tenantId, levelNo, name, levelNo);
  };

  const levelNoOf = (tenantId, pkgLevel) =>
    db.prepare('SELECT level_no FROM member_levels WHERE tenant_id = ? AND pkg_level = ?').get(tenantId, pkgLevel)?.level_no;

  it('① 认领错序自建档后：标准档相对序 free<silver<gold<diamond（自动重编）', () => {
    // 复刻用户报修场景：管理员先自建「黄金会员」（得 Lv1），播种顺延免费/白银
    seedCustomShell(T2, '黄金会员', 1);
    ensureTenantDefaultLevels(db, T2);
    const free = Number(levelNoOf(T2, 'free'));
    const silver = Number(levelNoOf(T2, 'silver'));
    const gold = Number(levelNoOf(T2, 'gold'));
    const diamond = Number(levelNoOf(T2, 'diamond'));
    assert.ok(free < silver, `免费版(${free}) 应在白银(${silver}) 之前`);
    assert.ok(silver < gold, `白银(${silver}) 应在黄金(${gold}) 之前——认领档 level_no 必须被重排`);
    assert.ok(gold < diamond, `黄金(${gold}) 应在钻石(${diamond}) 之前`);
    // sort_order 与 level_no 同步（后台列表显示序一致）
    const goldRow = db.prepare("SELECT level_no, sort_order FROM member_levels WHERE tenant_id = ? AND pkg_level = 'gold'").get(T2);
    assert.equal(Number(goldRow.sort_order), Number(goldRow.level_no), '认领档 sort_order 须与 level_no 同步');
  });

  it('② 标准档相对序正确时 normalize 不触发（自建档位置不被启动播种覆盖）', () => {
    ensureTenantDefaultLevels(db, T3);
    // 管理员自建档插到最前（level_no=0，无 pkg_level）
    seedCustomShell(T3, '内测档', 0);
    // 幂等重入（模拟每次启动的存量播种）
    ensureTenantDefaultLevels(db, T3);
    const custom = db.prepare("SELECT level_no FROM member_levels WHERE tenant_id = ? AND name = '内测档'").get(T3);
    assert.equal(Number(custom.level_no), 0, '标准档相对序正确时，自建档 level_no 不得被重排');
    // 标准档序不受影响
    const free = Number(levelNoOf(T3, 'free'));
    const diamond = Number(levelNoOf(T3, 'diamond'));
    assert.ok(free < diamond, `标准档序应保持 free(${free}) < diamond(${diamond})`);
  });

  it('③ addLevel 默认序号 = MAX(level_no)+1（不再写死 1）', () => {
    const maxNo = db.prepare('SELECT COALESCE(MAX(level_no), 0) AS n FROM member_levels WHERE tenant_id = ?').get(T2).n;
    const lv = member.addLevel(T2, { name: '测试自建档' });
    assert.equal(Number(lv.level_no), Number(maxNo) + 1, `新自建档默认序号应为 ${Number(maxNo) + 1}`);
  });
});
