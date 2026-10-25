import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 第 21 轮「入驻兑换码」后台回归锁（2026-10-24）。
// 背景：个人入驻凭证从「一租户一个静态 projects.invite_code」换成「一人一码、用完即废」的
// 兑换码（server/services/joinCode.js 负责核销，routes/joinCode.js 负责生成与管理）。
// 后台必须给租户一条「生成 + 管理」的闭环，否则切了核销却发不出码 = 入驻直接断供。
// 锁三处：① 新页面存在且具备生成/列表/作废/导出 ② 路由与 Tab 注册 ③ 服务端路由口径对齐。

const PAGE = fileURLToPath(new URL('./JoinCodeManage.vue', import.meta.url));
const ROUTER = fileURLToPath(new URL('../../../../router/customer.js', import.meta.url));
const TABS = fileURLToPath(new URL('./CardTabs.vue', import.meta.url));
const TENANT = fileURLToPath(new URL('./TenantManage.vue', import.meta.url));
const SERVER_ROUTE = fileURLToPath(new URL('../../../../../../server/src/routes/joinCode.js', import.meta.url));
const APP = fileURLToPath(new URL('../../../../../../server/src/app.js', import.meta.url));
const MARKET = fileURLToPath(new URL('./MarketManage.vue', import.meta.url));

const pageSrc = readFileSync(PAGE, 'utf8');
const routerSrc = readFileSync(ROUTER, 'utf8');
const tabsSrc = readFileSync(TABS, 'utf8');
const tenantSrc = readFileSync(TENANT, 'utf8');
const routeSrc = readFileSync(SERVER_ROUTE, 'utf8');
const appSrc = readFileSync(APP, 'utf8');
const marketSrc = readFileSync(MARKET, 'utf8');

describe('JoinCodeManage.vue 入驻兑换码管理页', () => {
  test('页面存在且走租户后台 API 通道（customerApiCall → /api/customer）', () => {
    expect(pageSrc).toContain("from '../../../../api'");
    expect(pageSrc).toContain("customerApiCall.get('/join-code/stats')");
  });

  test('四项管理能力齐全：生成 / 列表 / 作废 / 导出', () => {
    expect(pageSrc).toContain("customerApiCall.post('/join-code/batches'");
    expect(pageSrc).toContain("customerApiCall.get('/join-code/codes'");
    expect(pageSrc).toContain("customerApiCall.post(`/join-code/codes/${row.id}/void`)");
    expect(pageSrc).toContain("customerApiCall.post('/join-code/codes/batch-void'");
    expect(pageSrc).toContain("customerApiCall.get('/join-code/codes/export'");
  });

  test('生成表单含数量/批次名/有效期/备注', () => {
    expect(pageSrc).toContain('v-model="genDlg.form.count"');
    expect(pageSrc).toContain('v-model="genDlg.form.name"');
    expect(pageSrc).toContain('v-model="genDlg.form.expiresAt"');
    expect(pageSrc).toContain('v-model="genDlg.form.remark"');
  });

  test('列表支持状态筛选与模糊搜索，且带分页', () => {
    expect(pageSrc).toContain('v-model="filter.status"');
    expect(pageSrc).toContain('v-model="filter.key"');
    expect(pageSrc).toMatch(/<el-pagination[\s\S]*?:total="total"/);
  });

  test('状态四态展示（未使用/已占用/已核销/已作废）', () => {
    expect(pageSrc).toMatch(/:value="0">未使用/);
    expect(pageSrc).toMatch(/:value="1">已占用/);
    expect(pageSrc).toMatch(/:value="2">已核销/);
    expect(pageSrc).toMatch(/:value="3">已作废/);
  });

  test('已核销的码不允许作废（服务端同为硬约束，前端先置灰）', () => {
    expect(pageSrc).toMatch(/:disabled="row\.status === 2 \|\| row\.status === 3"/);
  });

  test('展示使用人与入驻主体（可追溯谁用了哪个码）', () => {
    expect(pageSrc).toContain('row.usedByName');
    expect(pageSrc).toContain('row.applyName');
  });
});

describe('路由与导航注册', () => {
  test('customer.js 注册 /apps/card/join-codes', () => {
    expect(routerSrc).toContain("path: 'apps/card/join-codes'");
    expect(routerSrc).toContain('JoinCodeManage.vue');
  });

  test('入驻兑换码入口收口到「入驻管理-入驻企业」工具栏（顶部分类导航不再单列）', () => {
    // 入口已从 CardTabs 顶栏移入 TenantManage 的「入驻企业」工具栏
    expect(tenantSrc).toContain("router.push('/apps/card/join-codes')");
    expect(tenantSrc).toContain('入驻兑换码');
    // 顶部分类导航不再单列入驻兑换码 Tab
    expect(tabsSrc).not.toContain("label: '入驻兑换码'");
  });
});

describe('服务端路由口径对齐', () => {
  test('router 挂到 /api/customer/join-code 且带 requireAuth', () => {
    expect(appSrc).toContain("app.use('/api/customer/join-code', requireAuth, createJoinCodeRouter(database))");
  });

  test('租户隔离：customer_id 只取认证上下文，全部 SQL 带 customer_id', () => {
    // 列表/统计/作废/导出 四条主查询都必须带 customer_id = ?
    expect(routeSrc).toMatch(/SELECT status, COUNT\(\*\) n FROM tenant_join_code WHERE customer_id = \?/);
    expect(routeSrc).toMatch(/WHERE \$\{where\}[\s\S]*?customer_id = \?/);
    expect(routeSrc).toMatch(/UPDATE tenant_join_code SET status = 3[\s\S]*?WHERE id = \? AND customer_id = \?/);
  });

  test('批量作废只命中未使用/已占用，跳过已核销', () => {
    expect(routeSrc).toContain('AND status IN (0, 1)');
  });

  test('已核销的码拒绝作废（既成事实不可抹）', () => {
    expect(routeSrc).toContain('已核销的兑换码不可作废');
  });

  test('本轮范围锁：只允许生成个人入驻码', () => {
    expect(routeSrc).toContain('当前仅支持生成个人入驻兑换码');
  });

  test('生成走事务型 generateJoinCodes（utils/codes.js 保证同批不重码）', () => {
    expect(routeSrc).toContain("from '../utils/codes.js'");
    expect(routeSrc).toContain('generateJoinCodes(db, {');
  });
});

describe('集市管理页话术同步（第21轮：个人入驻不再用静态口令）', () => {
  test('个人入驻模式 radio 文案改为兑换码', () => {
    expect(marketSrc).toMatch(/<el-radio value="code">兑换码\+审核（默认）<\/el-radio>/);
  });

  test('说明里点明「入驻兑换码」页并保留两条模式差异', () => {
    expect(marketSrc).toContain('「入驻兑换码」页批量生成一人一码');
    expect(marketSrc).toContain('会员过期将移出集市（主体保留）');
    expect(marketSrc).toContain('切换只影响新入驻，存量主体不受影响');
  });
});
