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

/**
 * 🔴 回归锁：#312-18b「动态」页一并原地化 + #312-18c 守卫收编到共享基建
 *
 * 与 myCard 同款范式，但多了一层：动态页的「发布 / 编辑」是**动作**，
 * 老实现是点一下就被 reLaunch 弹走，登录完回来还得**再点一次**。
 * 18c 起 Promise 守卫与浮层实现收编到 utils/loginGate.js + components/LoginGateModal.vue，
 * 本组测试钉「dynamic 消费共享基建」与「共享基建自身的语义」两层。
 */
describe('登录：动态页原地化（#312-18b/18c）', () => {
  it('🔴 dynamic 不再把人送去登录页（含历史硬编码的不存在路径 /pages/card/login）', () => {
    const s = read('../pages/card/dynamic.vue');
    expect(s).not.toMatch(/loginEntryUrl\(LOGIN_PATH/);
    expect(s).not.toMatch(/\.\.\/utils\/loginEntry/);
    // 页内唯一允许的跳转是「去建名片」（由共享守卫的 mustCreateCard 分支执行）
    expect(s).toMatch(/useInlineLogin\(\(\) => bootDynamic\(\)\)/);
    expect(s).toMatch(/<LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" \/>/);
  });

  it('🔴 守卫语义收敛在 utils/loginGate.js（唯一实现，禁页面再各抄一份）', () => {
    const s = read('./loginGate.js');
    expect(s).toMatch(/export function useInlineLogin\(onLoginSuccess\)/);
    expect(s).toMatch(/if \(hasCardToken\(\)\) return Promise\.resolve\(true\);/);
    expect(s).toMatch(/return new Promise\(\(resolve\) => \{ gateResolve = resolve; \}\);/);
    // 取消必须把 Promise 结掉（否则 await 永远挂住，按钮看着「点了没反应」）
    expect(s).toMatch(/gateResolve\(false\)/);
    // 新用户/没名片：跳一次 create 且不放行原动作
    const cb = s.slice(s.indexOf('async function onLoginGateSuccess'));
    expect(cb).toMatch(/if \(mustCreateCard\(result\)\)/);
    expect(cb).toMatch(/uni\.reLaunch\(\{ url: '\/pages\/card\/create' \}\)/);
    expect(cb.indexOf('if (mustCreateCard(result))')).toBeLessThan(cb.indexOf('if (onLoginSuccess)'));
    // 成功回调：先原地重入 boot，再放行原动作（顺序不能反）
    expect(cb).toMatch(/if \(onLoginSuccess\) await onLoginSuccess\(\);/);
    expect(cb).toMatch(/if \(done\) done\(true\);/);
    expect(cb.indexOf('if (onLoginSuccess) await onLoginSuccess();')).toBeLessThan(cb.indexOf('if (done) done(true);'));
  });

  it('浮层实现单点：LoginGateModal 走令牌（遮罩 --bg-mask、层级 --z-popup）', () => {
    const s = read('../components/LoginGateModal.vue');
    expect(s).toMatch(/background: var\(--bg-mask\);/);
    expect(s).toMatch(/z-index: var\(--z-popup\);/);
    expect(s).toMatch(/border-radius: var\(--radius-lg\);/);
    expect(s).toMatch(/<LoginGate @success/);
    // 滚动穿透防护：mask 与 sheet 成对出现
    expect(s).toMatch(/class="lgm-mask"[^>]*@touchmove\.stop\.prevent/);
    expect(s).toMatch(/class="lgm-sheet"[^>]*@touchmove\.stop/);
    // dynamic 不得再留一份 lgmask 私有实现
    const dyn = read('../pages/card/dynamic.vue');
    expect(dyn).not.toMatch(/\.lgmask \{/);
  });

  it('发布/编辑：先过守卫，登录成功后**自动继续**（不用再点一次）', () => {
    const s = read('../pages/card/dynamic.vue');
    expect(s).toMatch(/async function openPublish\(\) \{/);
    expect(s).toMatch(/async function openEdit\(d\) \{/);
    expect(s).toMatch(/if \(!\(await requireLogin\(\)\)\) return;/);
  });

  it('取数流程抽成 bootDynamic，onMounted 与登录成功（经守卫回调）都调它', () => {
    const s = read('../pages/card/dynamic.vue');
    expect(s).toMatch(/async function bootDynamic\(\) \{/);
    const onMounted = s.slice(s.indexOf('onMounted(async () => {'), s.indexOf('/\*\* 本页取数流程'));
    expect(onMounted).toMatch(/if \(!hasCardToken\(\)\)/);
    expect(onMounted).toMatch(/showLoginGate\.value = true;/);
    expect(onMounted).toMatch(/await bootDynamic\(\);/);
  });

  it('🔴 onShow 不无脑弹走：只有「已加载过内容且登录态掉了」才补弹浮层', () => {
    const s = read('../pages/card/dynamic.vue');
    const onShow = s.slice(s.indexOf('onShow(() => {'), s.indexOf('onMounted(async () => {'));
    expect(onShow).toMatch(/if \(!hasCardToken\(\) && dynamics\.value\.length\) showLoginGate\.value = true;/);
    expect(onShow).not.toMatch(/uni\.reLaunch/);
  });
});

/**
 * 🔴 回归锁：#312-18c 老登录入口全量原地化
 *
 * 反馈：「为什么有时是原地登录白页，有时是蓝色品牌登录页？」——因为 myCard/dynamic 已原地化，
 * 而个人中心/编辑页等 8 处老入口还跳 pages/cardMain/login（manual=1），两套并存。
 * 本组钉死：这些页面一律消费共享基建（useInlineLogin + LoginGateModal），
 * 不得再出现任何「跳登录页」的写法；蓝页只剩冷启动首页一闪这一条路。
 */
describe('登录：老入口全量原地化（#312-18c）', () => {
  const PAGES = [
    'profile.vue', 'worksEdit.vue', 'displaySettings.vue', 'videosEdit.vue',
    'member.vue', 'create.vue', 'needTagsEdit.vue', 'cardDetail.vue', 'myCard.vue', 'dynamic.vue',
  ];

  it('🔴 card 包全部页面零登录跳转：loginEntryUrl / 蓝页路径一个不许剩', () => {
    for (const p of PAGES) {
      const s = read(`../pages/card/${p}`);
      expect(s, `${p} 不得再引用 loginEntry`).not.toMatch(/loginEntryUrl|LOGIN_PATH/);
      expect(s, `${p} 不得出现蓝页路径`).not.toMatch(/cardMain\/login/);
    }
  });

  it('全部消费同一份共享基建（组件 + 守卫），禁再抄内联浮层', () => {
    // myCard 例外：它的未登录态是**整页空态**里内联 LoginGate（18 轮设计，非弹层），登出原地重入见下
    for (const p of PAGES.filter((x) => x !== 'myCard.vue')) {
      const s = read(`../pages/card/${p}`);
      expect(s, `${p} 应挂 LoginGateModal`).toMatch(
        new RegExp(`<LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />`)
      );
      expect(s, `${p} 应解构 useInlineLogin`).toMatch(/useInlineLogin\(/);
      expect(s, `${p} 不得有私有 lgmask 实现`).not.toMatch(/\.lgmask \{/);
    }
    // myCard：内联 LoginGate + 登出原地重入
    const my = read('../pages/card/myCard.vue');
    expect(my).toMatch(/<LoginGate @success="onInlineLogin" \/>/);
    expect(my).toMatch(/async function bootOwner\(\)/);
  });

  it('动作守卫一律 await requireLogin()（登录成功自动继续，禁同步 return true/false 老形态）', () => {
    expect(read('../pages/card/cardDetail.vue')).toMatch(/async function toggleLike\(d\) \{\s*if \(!\(await requireLogin\(\)\)\) return;/);
    expect(read('../pages/card/cardDetail.vue')).toMatch(/async function openComments\(d\) \{\s*if \(!\(await requireLogin\(\)\)\) return;/);
    expect(read('../pages/card/cardDetail.vue')).toMatch(/if \(!\(await requireLogin\(\)\)\) return;/);
    expect(read('../pages/card/member.vue')).toMatch(/if \(!userInfo\.id && !\(await requireLogin\(\)\)\) return;/);
    expect(read('../pages/card/profile.vue')).toMatch(/async function openEdit\(\) \{\s*if \(!\(await requireLogin\(\)\)\) return;/);
  });

  it('页面级门禁（worksEdit/displaySettings/videosEdit/create/needTagsEdit）改为当页浮层 + 原地 boot', () => {
    for (const p of ['worksEdit.vue', 'videosEdit.vue', 'needTagsEdit.vue']) {
      const s = read(`../pages/card/${p}`);
      expect(s, `${p} 门禁判据保留（card_user.id 或 token）`).toMatch(
        /const needLogin = !me\.id && !uni\.getStorageSync\('card_token'\);\s*if \(needLogin && !\(await requireLogin\(\)\)\) return;\s*load\(\);/
      );
    }
    expect(read('../pages/card/displaySettings.vue')).toMatch(/const needLogin = !me\.id && !uni\.getStorageSync\('card_token'\);\s*if \(needLogin && !\(await requireLogin\(\)\)\) return;\s*load\(\);/);
    expect(read('../pages/card/create.vue')).toMatch(/const needLogin = !cachedMe\.id && !uni\.getStorageSync\('card_token'\);\s*if \(needLogin && !\(await requireLogin\(\)\)\) return;/);
  });

  it('profile：登录菜单当页弹层 + 登录成功原地刷新；退出登录原地翻态（不再 reLaunch 蓝页）', () => {
    const s = read('../pages/card/profile.vue');
    expect(s).toMatch(/function goLogin\(\) \{\s*requireLogin\(\);\s*\}/);
    expect(s).toMatch(/useInlineLogin\(onAfterLogin\)/);
    expect(s).toMatch(/async function onAfterLogin\(\) \{\s*loggedIn\.value = hasCardToken\(\);\s*await loadProfile\(\);/);
    // logout：清凭证后原地翻回未登录态（loggedIn=false + 数据清零），不跳任何页
    const out = s.slice(s.indexOf('function logout()'));
    expect(out).toMatch(/loggedIn\.value = false;/);
    expect(out).not.toMatch(/uni\.reLaunch/);
  });

  it('myCard：退出平台同样原地重入 bootOwner（不再 reLaunch 蓝页）', () => {
    const s = read('../pages/card/myCard.vue');
    const leave = s.slice(s.indexOf('function leaveTenant()'));
    expect(leave).toMatch(/notLogin\.value = true;/);
    expect(leave).toMatch(/bootOwner\(\);/);
    expect(leave).not.toMatch(/uni\.reLaunch/);
  });
});
