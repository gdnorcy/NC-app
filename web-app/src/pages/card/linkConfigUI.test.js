/**
 * 链接配置交互回归（🔴 反馈 #321，2026-10-21）
 *
 * #321 用户四条反馈逐条对应：
 *  ①「点链接框会弹出内部链接的选择器，要求要去掉的，手动填写就好了」
 *      → **删除** CardLinkPicker 组件；链接框改成普通 <input>，直接手填。
 *      ⚠️ 曾经把「内部页面」从类型里删掉（#301）是**误读**：用户不要的是弹窗，
 *         不是这一类型。
 *  ②「切换成外部小程序后，再点网页链接或是拨打电话，上面的输入框都是灰色的」
 *      → 删掉 .dim 置灰。网页/电话恰恰要把网址/号码填进去，置灰等于不让填。
 *  ③「类型那里还是增加一个内部链接吧」→ linkType 恢复四种，internal 是一等类型。
 *  ④「按钮组的配置的跳转类型你也理解错了，跳转类型跟按钮配置同步」
 *      → 按钮组里**每个按钮**都有自己的类型选择 + 地址 + AppID，与 button 组件同一套。
 *
 * 这些是纯 UI 约定，单测用源码正则钉死（与 cardEdit.test.js / tokenAudit 同款做法）。
 * 🔴 数「出现次数」前必须先剥注释——注释里常写着这些词，直接正则会连注释一起命中。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const edit = () => stripComments(read('./cardEdit.vue'));
const registry = () => stripComments(read('./cardCompRegistry.js'));
const item = () => stripComments(read('../../components/CardCompItem.vue'));
const model = () => read('../../utils/compLinkModel.js');
const admin = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js'));
const exists = (rel) => {
  try { read(rel); return true; } catch (e) { return false; }
};

describe('① 点链接框不再弹选择器（手动填写）', () => {
  test('CardLinkPicker 组件已删除（不是「不用就行」，是文件本身下线）', () => {
    expect(exists('./CardLinkPicker.vue'), 'CardLinkPicker.vue 应已删除').toBe(false);
  });

  test('cardEdit 不再 import / 调用 CardLinkPicker', () => {
    expect(edit()).not.toContain('CardLinkPicker');
    expect(edit()).not.toContain('openLinkPicker');
    expect(edit()).not.toContain('showLinkPicker');
  });

  test('link 控件是真正的 input（能打字），不是只读 view', () => {
    const s = edit();
    // v-if="f.control === 'link'" 分支里必须有 <input v-model="editing.props[f.key]">
    expect(s).toMatch(/f\.control === 'link'[\s\S]{0,600}?<input[\s\S]{0,200}?v-model="editing\.props\[f\.key\]"/);
  });

  test('链接框不再有置灰态（.dim 一并下线）', () => {
    const s = edit();
    expect(s).not.toContain('ce-link-display');
    expect(s).not.toContain('linkIsExternal');
    expect(s).not.toMatch(/dim:\s*linkIsExternal\(/);
  });

  test('按钮组的跳转框也是 input（同样能手填）', () => {
    expect(edit()).toMatch(/<input[\s\S]{0,160}?v-model="b\.url"/);
  });
});

describe('② 跳转类型恢复「内部链接」为一等类型', () => {
  test('LINK_TYPES 四种，internal 在列', () => {
    const m = model();
    const m2 = m.match(/LINK_TYPES = \[([\s\S]*?)\]/);
    expect(m2, 'LINK_TYPES 未找到').toBeTruthy();
    for (const v of ['internal', 'miniapp', 'web', 'phone']) {
      expect(m2[1], `LINK_TYPES 缺 ${v}`).toContain(`value: '${v}'`);
    }
    expect(m2[1]).toContain("label: '内部链接'");
  });

  test('normalizeLinkType 吸收两个内部页面写法：空串与 internal', () => {
    // 🔴 存量数据两种写法都有（未设 / 'internal'），且 #301 期间新建的是空串。
    // 若不吸收空串，UI 上「当前选中哪个类型」会分裂（值为空时四个选项都不亮）。
    const m = model();
    expect(m).toMatch(/if \(!t \|\| t === LINK_INTERNAL\) return LINK_INTERNAL;/);
    expect(m).toContain("export const LINK_INTERNAL = 'internal'");
  });

  test('isExternalType 判据用 LINK_INTERNAL 比较（不再是空串）', () => {
    const m = model();
    expect(m).toMatch(/isExternalType[\s\S]{0,120}?normalizeLinkType\(type\) !== LINK_INTERNAL/);
    // 内部页面分支不得再写 !l.linkType（旧模型用空串表示）
    expect(m).not.toMatch(/if \(!l\.linkType\) return/);
    expect(m).not.toMatch(/if \(!l\.linkType\) \{/);
  });

  test('移动端注册表 linkType 选项含内部链接，default 为 internal', () => {
    const s = registry();
    const m = s.match(/key: 'linkType'[\s\S]{0,500}?options: \[([^\]]+)\]/);
    expect(m, '注册表找不到 linkType 选项').toBeTruthy();
    expect(m[1]).toContain("label: '内部链接'");
    expect(m[1]).toContain("value: 'internal'");
    expect(s).toMatch(/key: 'linkType', label: '跳转类型', control: 'radio', default: 'internal'/);
  });

  test('admin 端 button 与 button-group 同步（两处都含内部链接 + default internal）', () => {
    const s = admin();
    const all = s.match(/key: 'linkType'[^}]*options: \[([^\]]+)\]/g) || [];
    expect(all.length, 'admin 至少应有 button + button-group 两处').toBeGreaterThanOrEqual(2);
    for (const one of all) {
      expect(one, 'admin linkType 选项里应有内部链接').toContain("label: '内部链接'");
      expect(one, "admin linkType 的 default 必须是 'internal'").toContain("default: 'internal'");
    }
  });

  test('tips 不再说「不选 = 内部页面」（内部链接已是显式类型）', () => {
    const s = registry();
    const m = s.match(/key: 'linkType'[\s\S]{0,600}?tips: '([^']*)'/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toContain('不选 = 内部页面');
  });
});

describe('③ 按钮组跳转类型与 button 组件同步', () => {
  test('按钮组每个按钮都有类型 radio（走 LINK_TYPES，不另抄一份）', () => {
    const s = edit();
    expect(s).toMatch(/v-for="t in LINK_TYPES"/);
    expect(s).toMatch(/onLinkTypeChange\(\{ scope: 'btn', index: bi \}, t\.value\)/);
  });

  test('按钮组的类型/地址/AppID 改的是 buttons[bi]（子配置），不是组件级 props', () => {
    const s = edit();
    // 🔴 记忆规则「子组件自身配置 ≠ 父级配置」：linkHostOf 对 scope:'btn' 取 buttons[index]
    expect(s).toMatch(/if \(t\.scope === 'btn'\)[\s\S]{0,200}?list\[t\.index\]/);
    expect(s).toMatch(/v-model="b\.url"/);
    expect(s).toMatch(/v-model="b\.miniAppId"/);
    expect(s).toMatch(/v-model="b\.miniAppPath"/);
  });

  test('切换类型时清掉语义不兼容的旧值，但不误清 web↔phone', () => {
    const s = edit();
    expect(s).toMatch(/function onLinkTypeChange\(target, value\)/);
    // 内部路径 vs 地址/号码 是两种语义 → 要清；地址↔号码语义相同 → 不清
    expect(s).toMatch(/prevUrlMeaning !== nextUrlMeaning/);
  });

  test('外部小程序专属输入内联可见（不再藏进弹窗）', () => {
    const s = edit();
    expect(s).toMatch(/linkTypeOf\(\) === 'miniapp'/);
    expect(s).toMatch(/v-model="editing\.props\.miniAppId"/);
    expect(s).toMatch(/v-model="editing\.props\.miniAppPath"/);
    // 跳转版本仍折叠在高级选项里
    expect(s).toContain('advOpen');
  });

  test('网页链接保留注意事项说明', () => {
    const s = edit();
    expect(s).toContain('ce-note');
    expect(s).toMatch(/剪贴板/);
  });

  test('链接 placeholder 随类型变（别让用户往电话框里填路径）', () => {
    const s = edit();
    expect(s).toMatch(/function linkPlaceholder\(target\)/);
    expect(s).toMatch(/t === 'web'[\s\S]{0,120}?https:\/\/example\.com/);
    expect(s).toMatch(/t === 'phone'[\s\S]{0,120}?13800138000/);
  });
});

describe('链接模型仍是单一事实来源', () => {
  test('cardEdit / CardCompItem 都从 compLinkModel 取口径', () => {
    expect(edit()).toContain("from '../../utils/compLinkModel.js'");
    expect(item()).toContain("from '../utils/compLinkModel.js'");
  });

  test('UI 选项直接用 LINK_TYPES / LINK_ENVS，组件内不另抄一份', () => {
    expect(edit()).toMatch(/import \{ LINK_TYPES, LINK_ENVS, normalizeLinkType \}/);
    expect(edit()).not.toMatch(/value: 'miniapp'/);
  });

  test('跳转执行：内部页面分支是兜底（三个外链都在前面 return）', () => {
    const link = read('../../utils/compLink.js');
    expect(link).toMatch(/type === 'miniapp'[\s\S]*?return true;/);
    expect(link).toMatch(/type === 'web'[\s\S]*?return true;/);
    expect(link).toMatch(/type === 'phone'[\s\S]*?return true;/);
    expect(link).toMatch(/内部页面[\s\S]{0,80}?if \(!url\) return false;/);
  });
});