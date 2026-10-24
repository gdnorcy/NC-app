/**
 * 🔴 回归锁：#312-18 登录不再跳两次页面（改为页面内原地登录）
 *
 * 反馈 → 修法：
 *  「我的名片」未登录 → reLaunch 到 pages/cardMain/login → 登录完再 reLaunch 回名片页，
 *  「去、回」两次跳转，用户看着两个页面各闪一遍。
 *  改为：当前页直接出「微信一键登录」，登录成功后**原地重入**本人名片流程（0 次跳转）；
 *  只有新用户/没名片的人才跳一次去建名片（否则会落在空壳页）。
 *
 * 本测试钉死：
 *  1 登录请求只有一份实现（登录页与页面内浮层共用，禁两端漂移）；
 *  2 myCard 不再把人送去登录页；
 *  3 进入逻辑被抽成可重入函数（登录成功能原地再跑一遍）；
 *  4 登录后必须落 token/user + 清品牌色缓存 + 带默认租户；
 *  5 浮层防连点（微信 code 一次性）；
 *  6 无名片判定语义。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

describe('登录：原地化与单点实现', () => {
  it('登录请求收敛到 utils/inlineLogin.js，登录页与浮层都只调它（禁两份实现漂移）', () => {
    const loginPage = read('../pages/cardMain/login.vue');
    const gate = read('../components/LoginGate.vue');
    expect(loginPage).toMatch(/import \{ performWxLogin, mustCreateCard \} from '\.\.\/\.\.\/utils\/inlineLogin\.js'/);
    expect(gate).toMatch(/import \{ performWxLogin \} from '\.\.\/utils\/inlineLogin\.js'/);
    // 两边都不许再自己拼 wxLogin（H5 模拟码/租户兜底/清缓存三条任一条漏写都会「能登录但首页空白」）
    expect(loginPage).not.toMatch(/cardApi\.wxLogin\(/);
    expect(gate).not.toMatch(/cardApi\.wxLogin\(/);
  });

  it('performWxLogin 落 token/user + 清品牌色缓存 + 带部署默认租户', () => {
    const s = read('./inlineLogin.js');
    expect(s).toMatch(/uni\.setStorageSync\('card_token', result\.token\)/);
    expect(s).toMatch(/uni\.setStorageSync\('card_user', result\.user\)/);
    expect(s).toMatch(/resetBrandCache\(\)/);
    expect(s).toMatch(/cardApi\.wxLogin\(code, parentId, DEFAULT_TENANT_ID \|\| '', appid\)/);
    // 取码：小程序带自身 appid（后端据此走 component 模式），H5 走模拟码
    expect(s).toMatch(/appid = uni\.getAccountInfoSync\(\)\.miniProgram\.appId/);
    expect(s).toMatch(/'h5_mock_' \+ Date\.now\(\)/);
  });

  it('🔴 myCard 不再把人送去登录页（原来是去+回两次跳转）', () => {
    const s = read('../pages/card/myCard.vue');
    expect(s).not.toMatch(/function goApply/);
    expect(s).not.toMatch(/loginEntryUrl\(LOGIN_PATH, '\/pages\/card\/myCard'\)/);
    // 未登录态放的是原地登录浮层
    expect(s).toMatch(/<LoginGate @success="onInlineLogin" \/>/);
    expect(s).toMatch(/import LoginGate from '\.\.\/\.\.\/components\/LoginGate\.vue'/);
  });

  it('🔴 进入流程抽成 bootOwner 可被原地登录重入（onMounted 与登录成功都调它）', () => {
    const s = read('../pages/card/myCard.vue');
    expect(s).toMatch(/async function bootOwner\(\)/);
    const onMounted = s.slice(s.indexOf('onMounted(async () => {'), s.indexOf('async function bootOwner()'));
    expect(onMounted).toMatch(/await bootOwner\(\);/);
    // 登录成功回调：清掉未登录态后原地重入（顺序不能反，否则会先拉数据再被 notLogin 顶掉）
    const cb = s.slice(s.indexOf('async function onInlineLogin'), s.indexOf('async function onInlineLogin') + 400);
    expect(cb).toMatch(/notLogin\.value = false;/);
    expect(cb).toMatch(/await bootOwner\(\);/);
    expect(cb.indexOf('notLogin.value = false;')).toBeGreaterThan(-1);
    expect(cb.indexOf('notLogin.value = false;')).toBeLessThan(cb.indexOf('await bootOwner();'));
  });

  it('新用户/没名片才跳一次去建名片，否则原地进（不落空壳页）', () => {
    const s = read('../pages/card/myCard.vue');
    const cb = s.slice(s.indexOf('async function onInlineLogin'), s.indexOf('async function onInlineLogin') + 400);
    expect(cb).toMatch(/if \(mustCreateCard\(result\)\)/);
    expect(cb).toMatch(/uni\.reLaunch\(\{ url: '\/pages\/card\/create' \}\)/);
    expect(cb).toMatch(/notLogin\.value = false;/);
  });

  it('浮层防连点：微信 code 一次性，busy/inflight 双闸', () => {
    const g = read('../components/LoginGate.vue');
    expect(g).toMatch(/if \(busy\.value \|\| inflight\) return;/);
    // 模板里不加 .value（MP 模板解构/.value 写法会静默失效）
    expect(g).toMatch(/\{\{ busy \? '登录中…' : '微信一键登录' \}\}/);
    expect(g).toMatch(/defineEmits\(\['success', 'fail'\]\)/);
  });

  it('mustCreateCard：新用户或没名片都算「必须先建名片」', () => {
    const s = read('./inlineLogin.js');
    expect(s).toMatch(/export function mustCreateCard\(result\)/);
    expect(s).toMatch(/result\.isNew \|\| !result\.hasCard/);
  });
});
