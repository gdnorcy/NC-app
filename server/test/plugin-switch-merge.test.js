/**
 * 回归锁：插件「安装/启用」双开关合并为单一「启用」开关（第28轮）
 *
 * 背景：旧设计是 is_install && is_enable 与运算，两个开关制造了
 *      「装了但没启」的无意义中间态，且分散在 4 个页面让管理员多点 4 次。
 *      合并后：对外只有「启用」一个语义，is_install 退化为内部派生字段（= is_enable）。
 *
 * 覆盖四条判据：
 *   1) setPlugin 只认 enable：传 enable=1 → is_enable=1 且 is_install 自动=1
 *   2) 存量兼容：历史 install=1&enable=0 的行，迁移后仍停用（不误开）
 *   3) 真门控仍在：enable=0 → computeOrderSplit 不分账；enable=1 → 分账
 *   4) 旧调用方兼容：仅传 install=true（老前端）也能启用
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDb } from '../src/db.js';
import { createDistributionService } from '../src/services/distribution.js';

describe('插件开关：安装/启用合并为单一启用（第28轮）', () => {
  let db, dist;
  const DB_PATH = path.join(os.tmpdir(), `plugin-merge-${Date.now()}.db`);
  const TENANT = 88801;

  before(() => {
    db = createDb(DB_PATH);
    dist = createDistributionService(db);
    const ins = db.prepare("INSERT OR IGNORE INTO platform_user (id, openid, nickname, identity_type, customer_id) VALUES (?, ?, ?, ?, ?)");
    for (const [id, openid, name] of [
      [8100, 'pm-u8100', '上级A'],
      [8101, 'pm-u8101', '买家B'],
    ]) {
      ins.run(id, openid, name, 'individual', TENANT);
    }
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  function makeOrder(id, userId) {
    return {
      id, orderNo: `PM${id}`, status: 'paid', payerType: 'tenant',
      customerId: TENANT, userId, buyerIdentityType: 'individual',
      amount: 10000, originalAmount: 10000, solution: 'card', productType: 'member',
    };
  }

  it('setPlugin 只认 enable：启用时 is_install 自动同步为 1（消除装了没启的中间态）', () => {
    const p = dist.setPlugin(TENANT, 'partner', { enable: 1 });
    assert.equal(p.is_enable, 1, '启用态应写入 is_enable');
    assert.equal(p.is_install, 1, '启用时 is_install 应自动同步为 1（派生字段）');

    const off = dist.setPlugin(TENANT, 'partner', { enable: 0 });
    assert.equal(off.is_enable, 0, '停用态应写入 is_enable=0');
    assert.equal(off.is_install, 0, '停用时 is_install 应同步为 0，不留「装了没启」中间态');
  });

  it('旧调用方兼容：仅传 install=true 也能启用（老前端 DistHome 口径）', () => {
    const p = dist.setPlugin(TENANT, 'share-cat', { install: true });
    assert.equal(p.is_enable, 1, '仅传 install=true 应等价于启用');
    assert.equal(p.is_install, 1, 'is_install 应同步为 1');
  });

  it('存量兼容：历史 install=1 & enable=0 的行，读取时仍为停用（不误开）', () => {
    // 手工造一条旧形态数据（install 与 enable 不一致的中间态）
    db.prepare(`INSERT INTO sys_tenant_plugin (tenant_id, plugin_code, is_install, is_enable, config)
                VALUES (?, 'share-area', 1, 0, '{}')`).run(TENANT);
    const p = dist.getPlugin(TENANT, 'share-area');
    assert.equal(p.is_enable, 0, '存量 enable=0 应仍读出停用');
    assert.equal(p.is_install, 1, '存量 is_install 列原样保留（列不删，避免破坏性迁移）');
  });

  it('真门控仍在：enable=0 时订单不分账，enable=1 时正常分账', () => {
    dist.bindRelation(TENANT, 8101, 'individual', 8100, 'card');

    // 关：不分账
    dist.setPlugin(TENANT, 'dist', { enable: 0 });
    const off = dist.computeOrderSplit(makeOrder(88001, 8101));
    assert.equal(off, null, '插件停用时不应产生分账快照');

    // 开：分账
    dist.setPlugin(TENANT, 'dist', { enable: 1 });
    const on = dist.computeOrderSplit(makeOrder(88002, 8101));
    assert.ok(on, '插件启用后应产生分账快照');
    assert.ok(Number(on.commission1) > 0, '应给一级上级产生佣金');
  });

  it('合并后仍只暴露一个对外开关语义（服务端只读 is_enable）', () => {
    dist.setPlugin(TENANT, 'share-all', { enable: 1 });
    // 直接写库造出 is_install=0 / is_enable=1 的矛盾行 → 服务端按 is_enable 判定为启用
    db.prepare(`UPDATE sys_tenant_plugin SET is_install = 0, is_enable = 1
                WHERE tenant_id = ? AND plugin_code = 'share-all'`).run(TENANT);
    const p = dist.getPlugin(TENANT, 'share-all');
    assert.equal(p.is_enable, 1, '判定只认 is_enable');
  });
});
