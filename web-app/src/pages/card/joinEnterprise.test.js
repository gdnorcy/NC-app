/**
 * 🔴 回归锁：员工凭企业口令（ENT######）自助加入企业（#312-19）
 *
 * 背景：企业口令从 2026-09 起就能在后台生成/展示（customer.js /enterprise/invite-code
 * + 企业仪表盘），但**兑换闭环一直没做**——员工加入只能企业管理员从「未认证个人」
 * 池添加（/enterprise/candidates + POST /enterprise/employees，且 candidates 锁
 * `customer_id = 租户`，本租户外的人管理员根本看不见）。口令发得出去、兑不进来。
 *
 * 本测试钉死 C 端闭环：
 *   1 pages.json 已注册 joinEnterprise 页（跳未注册页 = 静默失败，不报错也不跳）；
 *   2 页面消费 #312-18c 共享基建（useInlineLogin + LoginGateModal），禁再抄内联浮层；
 *   3 submit：先 await requireLogin()（登录成功自动继续加入，不用再点一次），
 *     空口令只toast不发请求；口令统一大写后发给后端（后端大小写不敏感，双保险）；
 *   4 cardApi.joinEnterprise → POST /enterprise/join { inviteCode }（与后端路由对齐）；
 *   5 profile「加入企业」菜单仅未加入企业时出现，跳转路径与注册路径一致。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const src = () => stripComments(read('./joinEnterprise.vue'));
const pagesJson = JSON.parse(readFileSync(fileURLToPath(new URL('../../pages.json', import.meta.url)), 'utf8'));
const cardPages = pagesJson.subPackages.find((s) => s.root === 'pages/card').pages.map((p) => p.path);

describe('#312-19 企业口令自助加入：页面注册与入口', () => {
  test('joinEnterprise 已在 pages.json 注册（🔴 跳未注册页 = 不报错也不跳）', () => {
    expect(cardPages).toContain('joinEnterprise');
  });

  test('profile「加入企业」菜单仅未加入企业时出现，路径与注册一致', () => {
    const p = stripComments(read('./profile.vue'));
    // 已加入企业的用户看不到这一项（重复加入后端也会 400，前端先藏）
    expect(p).toMatch(/<view v-if="loggedIn && !user\.enterpriseId" class="menu-item" @click="goPage\('\/pages\/card\/joinEnterprise'\)">/);
    expect(p).toMatch(/menu-label">加入企业<\/view>/);
  });
});

describe('#312-19 企业口令自助加入：共享基建（#312-18c 纪律）', () => {
  test('消费 useInlineLogin + LoginGateModal，禁私有浮层 / 禁跳蓝页', () => {
    const s = src();
    expect(s).toMatch(/useInlineLogin\(/);
    expect(s).toMatch(/<LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" \/>/);
    expect(s).not.toMatch(/\.lgmask \{/);
    expect(s).not.toMatch(/loginEntryUrl|LOGIN_PATH/);
    expect(s).not.toMatch(/cardMain\/login/);
  });
});

describe('#312-19 企业口令自助加入：submit 行为', () => {
  test('先 await requireLogin() 再发请求（登录成功原地继续，不用再点一次）', () => {
    const s = src();
    // 守卫必须在 joinEnterprise 调用之前（await 形态，非同步 return）
    const guardIdx = s.indexOf('if (!(await requireLogin())) return;');
    const callIdx = s.indexOf('await cardApi.joinEnterprise(v)');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(callIdx);
  });

  test('空口令只 toast 不发请求；输入统一大写（后端大小写不敏感，双保险）', () => {
    const s = src();
    expect(s).toMatch(/const v = String\(code\.value \|\| ''\)\.trim\(\)\.toUpperCase\(\);/);
    expect(s).toMatch(/if \(!v\) \{[\s\S]{0,120}?uni\.showToast\(\{ title: '请输入企业口令', icon: 'none' \}\);\s*return;/);
  });

  test('busy 期间防重复提交；成功 toast 带企业名并返回上一页', () => {
    const s = src();
    expect(s).toMatch(/async function submit\(\) \{\s*if \(busy\.value\) return;/);
    expect(s).toMatch(/uni\.showToast\(\{ title: `已加入\$\{\(res && res\.enterprise && res\.enterprise\.name\) \|\| '企业'\}`, icon: 'success' \}\);/);
    expect(s).toMatch(/setTimeout\(\(\) => uni\.navigateBack\(\), 900\);/);
  });

  test('失败透出后端错误文案（口令无效/已加入企业/跨租户，不静默）', () => {
    const s = src();
    expect(s).toMatch(/uni\.showToast\(\{ title: String\(\(e && e\.message\) \|\| e \|\| '加入失败'\), icon: 'none' \}\);/);
  });
});

describe('#312-19 企业口令自助加入：API 与后端路由对齐', () => {
  test('cardApi.joinEnterprise → POST /enterprise/join { inviteCode }', () => {
    const api = read('../../utils/cardApi.js');
    expect(api).toMatch(/joinEnterprise: \(inviteCode\) => request\(MARKET_BASE_URL \+ '\/enterprise\/join', 'POST', \{ inviteCode \}\)/);
  });
});
