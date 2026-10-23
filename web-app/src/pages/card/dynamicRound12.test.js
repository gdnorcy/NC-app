/**
 * 🔴 回归锁：#312-12「名片详情动态头部还是不对，和我的动态页不统一」
 *
 * 根因（第 7 轮修错目标的真因）：cardDetail 动态项模板用裸 <b>/<text>/<h4>/<p> 标签
 * + 标签选择器（.dyn-who b / .dyn-who span / .dyn-body h4 / .dyn-body p）——
 *   H5 端：uni 把 <text> 编成 <span>、<b>/<h4>/<p> 保留 → 选择器命中，页面正常；
 *   MP 端：<b>/<h4>/<p> 全被编译成**无类名 <view>**，wxml 根本没有 span/b/h4/p 元素
 *          → 标签选择器整条落空 → 时间继承默认字号变大、标题不加粗。
 * 修法：类名选择器（.dyn-name/.dyn-time/.dyn-title/.dyn-content，MP 安全），
 *       字号层级与「我的动态」页 .dynamic-name/.dynamic-time/.dynamic-title/
 *       .dynamic-content 统一。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const detailCss = () => stripComments(read('./cardDetail.vue'));
const detailTpl = () => stripComments(read('./cardDetail.vue'));
const dynCss = () => stripComments(read('./dynamic.vue'));

describe('#312-12 动态项模板：禁裸 b/h4/p 标签（MP 端会编成无类名 view）', () => {
  test('dyn-who 头部不再使用 <b> 裸标签，昵称/时间改带类名元素', () => {
    const tpl = detailTpl();
    expect(tpl).toMatch(/<view class="dyn-name">\{\{ d\.authorName \|\| card\.name \}\}<\/view>/);
    expect(tpl).toMatch(/<text class="dyn-time">\{\{ timeText\(d\.createdAt\) \}\}<\/text>/);
  });

  test('dyn-body 不再使用 <h4>/<p> 裸标签，标题/正文改带类名 view', () => {
    const tpl = detailTpl();
    expect(tpl).toMatch(/<view class="dyn-title" v-if="d\.title">\{\{ d\.title \}\}<\/view>/);
    expect(tpl).toMatch(/<view class="dyn-content">\{\{ d\.content \}\}<\/view>/);
  });

  test('全模板禁止再出现动态项裸标签（回归反向锁）', () => {
    const tpl = detailTpl();
    expect(tpl).not.toMatch(/<b>\{\{/);
    expect(tpl).not.toMatch(/<h4 v-if="d\.title">/);
    expect(tpl).not.toMatch(/<p>\{\{ d\.content \}\}/);
  });
});

describe('#312-12 样式：类名选择器 + 两页数值统一', () => {
  test('标签选择器 .dyn-who b / .dyn-who span / .dyn-body h4 / .dyn-body p 禁止回来', () => {
    const css = detailCss();
    expect(css).not.toMatch(/\.dyn-who b\s*\{/);
    expect(css).not.toMatch(/\.dyn-who span\s*\{/);
    expect(css).not.toMatch(/\.dyn-body h4\s*\{/);
    expect(css).not.toMatch(/\.dyn-body p\s*\{/);
  });

  test('昵称/时间字号与「我的动态」页 .dynamic-name/.dynamic-time 同源（fs-5 / fs-1）', () => {
    const detail = detailCss();
    const dyn = dynCss();
    // cardDetail .dyn-name 的字号 == dynamic .dynamic-name 的字号（都取 var(--fs-5)）
    const nameSize = detail.match(/\.dyn-name\s*\{[^}]*font-size:\s*([^;]+);/);
    const dynNameSize = dyn.match(/\.dynamic-name\s*\{[^}]*font-size:\s*([^;]+);/);
    expect(nameSize).toBeTruthy();
    expect(dynNameSize).toBeTruthy();
    expect(nameSize[1].trim()).toBe(dynNameSize[1].trim());
    // 时间同理（var(--fs-1)）
    const timeSize = detail.match(/\.dyn-time\s*\{[^}]*font-size:\s*([^;]+);/);
    const dynTimeSize = dyn.match(/\.dynamic-time\s*\{[^}]*font-size:\s*([^;]+);/);
    expect(timeSize).toBeTruthy();
    expect(dynTimeSize).toBeTruthy();
    expect(timeSize[1].trim()).toBe(dynTimeSize[1].trim());
  });

  test('标题/正文与「我的动态」页 .dynamic-title/.dynamic-content 同源（fs-6/700、fs-5）', () => {
    const detail = detailCss();
    const dyn = dynCss();
    const titleW = detail.match(/\.dyn-body \.dyn-title\s*\{[^}]*font-weight:\s*([^;]+);/);
    const dynTitleW = dyn.match(/\.dynamic-title\s*\{[^}]*font-weight:\s*([^;]+);/);
    expect(titleW).toBeTruthy();
    expect(dynTitleW).toBeTruthy();
    expect(titleW[1].trim()).toBe(dynTitleW[1].trim());
    const titleSize = detail.match(/\.dyn-body \.dyn-title\s*\{[^}]*font-size:\s*([^;]+);/);
    const dynTitleSize = dyn.match(/\.dynamic-title\s*\{[^}]*font-size:\s*([^;]+);/);
    expect(titleSize[1].trim()).toBe(dynTitleSize[1].trim());
    const contentSize = detail.match(/\.dyn-body \.dyn-content\s*\{[^}]*font-size:\s*([^;]+);/);
    const dynContentSize = dyn.match(/\.dynamic-content\s*\{[^}]*font-size:\s*([^;]+);/);
    expect(contentSize).toBeTruthy();
    expect(dynContentSize).toBeTruthy();
    expect(contentSize[1].trim()).toBe(dynContentSize[1].trim());
  });
});
