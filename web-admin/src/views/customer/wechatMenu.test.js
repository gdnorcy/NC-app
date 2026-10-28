/**
 * 自定义菜单「UI 语义类型」契约单测
 *
 * 为什么测：微信 menu/create 的 type 枚举里**没有**「跳转小店 / 跳转商品 / 跳转账号主页」，
 * 这三个只是网页版编辑器的 UI 选项。前端若把它们当 type 直接下发，微信必然报错。
 * 本测试锁住「前端草稿模型只使用 UI 语义类型」这条契约 —— 与服务端 mp-menu.js 的转换层配套。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, 'WechatHome.vue');
const src = fs.readFileSync(SRC, 'utf8');
const script = src.slice(src.indexOf('<script setup>'), src.indexOf('</script>'));
// 模板段（不含 style，避免匹配到 CSS 注释里的同名文案）
const tpl = src.slice(src.indexOf('<template>'), src.indexOf('<script setup>'));

describe('自定义菜单 UI 语义类型', () => {
  it('类型常量覆盖全部 6 个官方 UI 选项', () => {
    const m = script.match(/const UI_TYPES = \[([^\]]+)\]/);
    expect(m).toBeTruthy();
    const list = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(list.slice().sort()).toEqual(['goods', 'home', 'miniprogram', 'send', 'shop', 'view']);
  });

  it('三个原本被禁用的选项现在可点击（仅父菜单场景才禁用，与官方一致）', () => {
    for (const t of ['shop', 'goods', 'home']) {
      const m = tpl.match(new RegExp(`<el-radio label="${t}"[^>]*>`));
      expect(m, `未找到 ${t} 的 radio`).toBeTruthy();
      // 允许 :disabled="isParent"（父菜单不能设类型），禁止无条件 disabled
      const disabled = m[0].match(/disabled="([^"]*)"/);
      if (disabled) expect(disabled[1], `${t} 被无条件禁用`).toBe('isParent');
    }
  });

  it('旧的 click 类型不再作为 UI 选项出现（统一为 send）', () => {
    expect(src).not.toMatch(/<el-radio label="click"/);
    expect(script).toContain("t === 'click' ? 'send'");
  });

  it('反序列化兼容历史微信格式（click / media_id）', () => {
    expect(script).toContain("t === 'media_id' ? 'send'");
    expect(script).toContain("x.media_id || ''");
  });

  it('草稿序列化产出 UI 语义字段（contentType / mediaId），而非按微信 type 分支', () => {
    const m = script.match(/function serializeLeaf\(x\) \{([\s\S]*?)\n\}/);
    expect(m).toBeTruthy();
    const body = m[1];
    expect(body).toContain('contentType');
    expect(body).toContain('mediaId');
    expect(body).not.toMatch(/type === 'click'/);
  });

  it('菜单内容 chip：文字/图片/音频/视频可点，三项 API 不支持的置灰', () => {
    for (const t of ['text', 'image', 'voice', 'video']) {
      expect(src, `chip ${t} 不可点击`).toContain(`currentMenu.contentType = '${t}'`);
    }
    for (const off of ['已发表内容', '视频号动态', '卡券']) {
      expect(src, `${off} 未标记为不可用`).toMatch(new RegExp(`wxchip is-off[^>]*title="[^"]*${off}`));
    }
  });

  it('子菜单在样机内直接新增，无需「设为含子菜单」勾选', () => {
    // 断言的是「没有该勾选控件」，而不是「源码里不出现这几个字」
    // （注释里会解释这个交互，故不能按字面匹配）
    expect(tpl).not.toMatch(/el-checkbox[^>]*hasSub/);
    expect(tpl).not.toMatch(/toggleParent/);
    expect(tpl).toContain('＋ 添加');
    expect(tpl).toContain('wp-subinput');
    expect(tpl).toContain('wp-del');
  });

  it('删除一级/二级菜单后 hasSub 与选中态同步收敛', () => {
    expect(script).toContain('if (!top.sub.length) top.hasSub = false;');
    expect(script).toContain('top.sub.splice(selectedSub.value, 1);');
  });

  it('菜单名称长度按层级区分（一级 4 汉字 / 二级 8 汉字）', () => {
    expect(src).toContain('一级菜单不超过 4 个汉字或 8 个字母');
    expect(src).toContain('二级菜单不超过 8 个汉字或 16 个字母');
  });

  it('名称长度阈值来自服务端接口（不在前端硬编码阈值）', () => {
    expect(script).toContain('menuLimits');
    expect(script).toContain('r.limits');
  });
});
