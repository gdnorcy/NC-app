import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 第 20 轮「三层身份 + 租户双模开关」后台回归锁（2026-10-24）。
// 背景：租户可在「口令+审核」与「购买会员套餐自助获得场席」两种个人入驻模式间切换，
// 平台侧 MemberPackages 用 market_subject 标记哪些套餐含集市场席。
// 后台两处必须与 C 端 / 服务端口径一致：
//   ① MarketManage.vue：个人入驻模式 radio 绑定 settings.individualJoinMode（code/purchase）
//   ② MemberPackages.vue：套餐开关 marketSubject（服务端 memberAdmin 转 market_subject 0/1）
// 锁：radio 两值齐全 + settings 默认 code + 保存走 PUT /market/settings（服务端已支持该字段）；
//     MemberPackages 开关读写映射 + 表格列展示。

const MARKET_MANAGE = fileURLToPath(new URL('../customer/apps/card/MarketManage.vue', import.meta.url));
const MEMBER_PACKAGES = fileURLToPath(new URL('./MemberPackages.vue', import.meta.url));
const MEMBER_ADMIN_ROUTE = fileURLToPath(new URL('../../../../server/src/routes/memberAdmin.js', import.meta.url));

const marketSrc = readFileSync(MARKET_MANAGE, 'utf8');
const pkgSrc = readFileSync(MEMBER_PACKAGES, 'utf8');
const routeSrc = readFileSync(MEMBER_ADMIN_ROUTE, 'utf8');

describe('MarketManage.vue 个人入驻模式', () => {
  test('settings 默认 code（保守默认：存量行为）', () => {
    expect(marketSrc).toContain("individualJoinMode: 'code'");
  });

  test('radio 提供 code / purchase 两个值', () => {
    expect(marketSrc).toContain('v-model="settings.individualJoinMode"');
    expect(marketSrc).toMatch(/<el-radio value="code">[^<]*<\/el-radio>/);
    expect(marketSrc).toMatch(/<el-radio value="purchase">[^<]*<\/el-radio>/);
  });

  test('form-tip 说明两种模式差异与会员过期行为', () => {
    expect(marketSrc).toContain('会员过期将移出集市（主体保留）');
    expect(marketSrc).toContain('切换只影响新入驻，存量主体不受影响');
  });

  test('保存走 PUT /card-market/market/settings（服务端已支持 individualJoinMode）', () => {
    expect(marketSrc).toContain("publicApi.put('/card-market/market/settings'");
  });
});

describe('MemberPackages.vue 含集市场席开关', () => {
  test('表单开关绑定 dialog.form.marketSubject', () => {
    expect(pkgSrc).toContain('v-model="dialog.form.marketSubject"');
  });

  test('开关提示仅对「购买会员套餐」入驻模式租户生效', () => {
    expect(pkgSrc).toContain('购买会员套餐');
  });

  test('表格列展示 market_subject（含/—）', () => {
    expect(pkgSrc).toMatch(/label="集市场席"[\s\S]*?row\.market_subject \? '含' : '—'/);
  });

  test('openDialog 双向映射：row.market_subject → form / form → 保存', () => {
    expect(pkgSrc).toContain('marketSubject: !!row.market_subject,');
    // 新建默认 false
    expect(pkgSrc).toMatch(/form: \{ level: '', name: '', price: 0[\s\S]*?marketSubject: false,/);
  });
});

describe('服务端口径对齐（memberAdmin 落库列）', () => {
  test('INSERT 与 UPDATE 均含 market_subject，且 form 字段为 marketSubject', () => {
    expect(routeSrc).toMatch(/INSERT INTO member_package[\s\S]*?market_subject\)/);
    expect(routeSrc).toMatch(/UPDATE member_package SET[\s\S]*?market_subject=\?/);
    expect(routeSrc).toContain('b.marketSubject ? 1 : 0');
    expect(routeSrc).toContain('b.marketSubject !== undefined ? (b.marketSubject ? 1 : 0) : p.market_subject');
  });
});
