/**
 * 🔴 回归锁：动态相关第八轮真机反馈（#312-11）
 *
 * 反馈 → 修法：
 *   1a 未登录进「我的动态」只 toast 不跳转 → ensureLogin 硬编码 '/pages/card/login'
 *       （**路径不存在**，reLaunch 静默失败）。改 loginEntryUrl(LOGIN_PATH, 回跳)——
 *       登录页实际在 /pages/cardMain/login，且必须带 manual=1（冷启动首页联动）。
 *       🔴 #312-18b 再升级：本页改为**当页登录浮层**，一次都不跳（见 1a describe 注释）。
 *   1b 个人中心未登录还显示「退出登录」→ 菜单项按 loggedIn 切换：已登录=退出，
 *       未登录=登录（goLogin 引导登录页）；onShow 同步登录态；logout 加 token 守卫。
 *   2  「我的动态」圆形头像显示错误（灰色圆里溢出 "objec"）→ 两个根因：
 *       ① 模板 `user.nickname?.[0]` 在 MP 端被编译降级成**整个昵称**塞进 72rpx 圆；
 *       ② 头像区从来没渲染过图片，只有首字母占位。
 *       修法：显示 user.avatar 图片（absUrl + @error 回落首字母），首字母改 computed。
 *   3  名片详情时间/字号（第七轮已修，见 dynamicRound8 的 #312-10 钉子）。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const dyn = () => stripComments(read('./dynamic.vue'));
const dynCss = () => read('./dynamic.vue');
const prof = () => stripComments(read('./profile.vue'));

/**
 * 🔴 #312-11 原反馈：未登录进「我的动态」只 toast 不跳转——ensureLogin 硬编码
 *    '/pages/card/login'（**路径不存在**，reLaunch 静默失败）。
 *    那一轮的修法是改走 loginEntryUrl(LOGIN_PATH, 回跳)+manual=1；
 * 🔴 #312-18b 再进一步：**本页不再跳转登录页**（去+回两次跳转太晃），改成当页登录浮层。
 *    所以这里钉的语义从「跳转目标必须正确」升级成「根本不跳转」——
 *    原风险（硬编码不存在路径）随之消失，但反向钉死仍保留，防后人把跳转加回来。
 */
describe('1a 登录守卫：本页原地登录，不再跳登录页', () => {
  test('dynamic 里没有任何「跳登录页」的跳转（含历史硬编码的不存在路径）', () => {
    const s = dyn();
    expect(s).not.toMatch(/url: '\/pages\/card\/login'/);
    expect(s).not.toMatch(/loginEntryUrl\(LOGIN_PATH/);
    // 页内唯一保留的跳转：新用户/没名片 → 去建名片
    expect(s).toMatch(/uni\.reLaunch\(\{ url: '\/pages\/card\/create' \}\)/);
  });

  test('未登录放登录浮层（LoginGate），登录成功原地重入取数', () => {
    const s = dyn();
    expect(s).toMatch(/const showLoginGate = ref\(false\);/);
    expect(s).toMatch(/<LoginGate @success="onLoginGateSuccess" \/>/);
    expect(s).toMatch(/await bootDynamic\(\);/);
  });

  test('登录页真实路径是 /pages/cardMain/login（pages.json 第一个页面）', () => {
    const pj = read('../../pages.json');
    expect(pj).toMatch(/"path":\s*"pages\/cardMain\/login"/);
    const loginEntry = stripComments(read('../../utils/loginEntry.js'));
    expect(loginEntry).toMatch(/const DEFAULT_LOGIN_PATH = '\/pages\/cardMain\/login';/);
  });
});

describe('1b 个人中心：退出登录按登录态显示', () => {
  test('已登录=退出登录 / 未登录=登录（v-if/v-else 成对）', () => {
    const s = prof();
    expect(s).toMatch(/<view v-if="loggedIn" class="menu-item logout" @click="logout">/);
    expect(s).toMatch(/<view v-else class="menu-item" @click="goLogin">/);
    expect(s).toMatch(/<view class="menu-label">登录<\/view>/);
  });

  test('loggedIn 随 onShow 同步（别处清凭证后回前台立刻翻成「登录」）', () => {
    const s = prof();
    expect(s).toMatch(/const loggedIn = ref\(hasCardToken\(\)\);/);
    expect(s).toMatch(/onShow\(\(\) => \{[\s\S]*?loggedIn\.value = hasCardToken\(\);/);
  });

  test('goLogin 带 manual=1 + 回跳（防冷启动联动弹走）；logout 加 token 双保险', () => {
    const s = prof();
    expect(s).toMatch(/function goLogin\(\) \{\s*uni\.reLaunch\(\{ url: loginEntryUrl\(LOGIN_PATH, '\/pages\/card\/profile'\) \}\);\s*\}/);
    // src() 已剥注释，只钉语义：logout 第一件事就是 token 守卫
    expect(s).toMatch(/function logout\(\) \{\s*if \(!hasCardToken\(\)\) return;/);
  });
});

describe('2 我的动态头像：图片 + 首字母兜底（MP 模板禁写 ?.[0]）', () => {
  test('头像渲染 user.avatar 图片（absUrl 补基址）+ 破图回落首字母', () => {
    const s = dyn();
    expect(s).toMatch(/<image v-if="user\.avatar && !avatarError" :src="absUrl\(user\.avatar\)" mode="aspectFill" @error="avatarError = true" \/>/);
    expect(s).toMatch(/<text v-else>\{\{ userInitial \}\}<\/text>/);
  });

  test('首字母走 computed（MP 模板编译器会把 昵称?.[0] 降级成整个昵称→溢出圆外）', () => {
    const s = dyn();
    expect(s).toMatch(/const userInitial = computed\(\(\) => \(user\.value\.nickname \|\| '我'\)\.charAt\(0\)\);/);
    // 反向钉死：模板与脚本里都不再出现昵称后跟 [0] 的取下标写法
    expect(s).not.toMatch(/nickname\?\.\[0\]/);
  });

  test('头像容器图片 100% 填满（MP image 无显式宽高会塌缩）', () => {
    const c = dynCss();
    expect(c).toMatch(/\.dynamic-avatar \{[^}]*overflow: hidden;/);
    expect(c).toMatch(/\.dynamic-avatar image \{[^}]*width: 100%;/);
    expect(c).toMatch(/\.dynamic-avatar image \{[^}]*height: 100%;/);
  });

  test('profile 的首字母同样走 computed（同源降级坑）', () => {
    const s = prof();
    expect(s).toMatch(/const userInitial = computed\(\(\) => \(user\.value\.nickname \|\| '用'\)\.charAt\(0\)\);/);
    expect(s).not.toMatch(/nickname\?\.\[0\]/);
  });
});
