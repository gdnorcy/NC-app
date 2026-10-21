/**
 * 链接配置交互回归（🔴 反馈 #301，2026-10-21）
 *
 * 用户四条反馈逐条对应：
 *  ① 「把内部页面取消吧」      → linkType 选项里不再有「内部页面」；内部页面靠链接框填路径
 *  ② 「跳转版本似乎多余」      → miniAppEnv 折叠进「高级选项」，不常驻展示
 *  ③ 「操作习惯不合理」：
 *       - 选外部小程序后，原来的跳转框要**置灰**
 *       - 网页链接要有**注意事项说明**
 *       - 跳转输入框末尾的**箭头**要去掉
 *  ④ 「按钮组也要同步」        → button-group 的每个按钮支持同样的外链配置
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

const picker = () => stripComments(read('./CardLinkPicker.vue'));
const edit = () => stripComments(read('./cardEdit.vue'));
const registry = () => stripComments(read('./cardCompRegistry.js'));
const item = () => stripComments(read('../../components/CardCompItem.vue'));

describe('① 内部页面不再是「类型」', () => {
  test('选择器的类型分段只剩三种外链', () => {
    const s = picker();
    // 分段选项来自 LINK_TYPES 常量，组件里不再硬编码 internal
    expect(s).toContain('TYPE_OPTIONS = LINK_TYPES');
    expect(s).not.toMatch(/value:\s*'internal'/);
  });

  test('注册表 linkType 选项里没有「内部页面」', () => {
    const s = registry();
    const m = s.match(/key: 'linkType'[\s\S]{0,400}?options: \[([^\]]+)\]/);
    expect(m, '注册表找不到 linkType 选项').toBeTruthy();
    expect(m[1]).not.toContain('internal');
    expect(m[1]).not.toContain('内部页面');
  });

  test('注册表 linkType 默认值为空串（= 内部页面）', () => {
    expect(registry()).toMatch(/linkType: ''/);
  });

  test('tips 明确告知「不选 = 内部页面」', () => {
    const s = registry();
    const m = s.match(/key: 'linkType'[\s\S]{0,500}?tips: '([^']+)'/);
    expect(m, 'linkType 缺 tips').toBeTruthy();
    expect(m[1]).toContain('内部页面');
  });
});

describe('② 跳转版本折叠进高级选项', () => {
  test('选择器里版本区在「高级选项」折叠块内', () => {
    const s = picker();
    expect(s).toContain('高级选项');
    expect(s).toMatch(/lp-adv[\s\S]{0,400}?lp-radio/);
    // 折叠开关控制版本区的显示
    expect(s).toContain('advOpen');
    expect(s).toMatch(/v-if="advOpen"/);
  });

  test('版本区不再无条件展示（不再有独立的「跳转版本」常驻块）', () => {
    const s = picker();
    // 🔴 要定位**真实渲染的标签**，不是文件里第一次出现的字样——
    //    模板注释里也写着「跳转版本」（第 65 行），全文件搜会先命中注释。
    //    真实标签的标记是 class="lp-field-label"。
    const label = s.match(/<view class="lp-field-label">跳转版本<\/view>/);
    expect(label, '找不到「跳转版本」的真实标签').toBeTruthy();
    const labelAt = s.indexOf(label[0]);
    // 高级选项的折叠开关（真实标签）
    const adv = s.match(/lp-adv-t[^>]*>[^<]*高级选项/);
    expect(adv, '找不到「高级选项」折叠开关').toBeTruthy();
    const advAt = s.indexOf(adv[0]);
    expect(labelAt, '「跳转版本」须排在「高级选项」折叠开关之后（即折叠在其内）').toBeGreaterThan(advAt);
    // 且版本区必须被 v-if="advOpen" 包住
    expect(s).toMatch(/v-if="advOpen"[\s\S]{0,600}?lp-field-label">跳转版本/);
  });
});

describe('③ 交互优化：置灰 / 注意事项 / 去箭头', () => {
  test('跳转框末尾的箭头已移除', () => {
    expect(edit()).not.toContain('ce-link-arrow');
  });

  test('外链类型时跳转框置灰（dim 类）', () => {
    const s = edit();
    expect(s).toContain('linkIsExternal');
    // 模板里是 :class="{ ph: ..., dim: linkIsExternal(f.key) }" 这种写法
    expect(s).toMatch(/dim:\s*linkIsExternal\(/);
    expect(s).toContain('.ce-link-display.dim');
  });

  test('按钮组的按钮跳转框同样置灰', () => {
    const s = edit();
    expect(s).toContain('btnLinkIsExternal');
    expect(s).toMatch(/dim:\s*btnLinkIsExternal\(/);
  });

  test('网页链接有注意事项说明块', () => {
    const s = picker();
    expect(s).toContain('注意事项');
    expect(s).toContain('lp-note');
    // 说明要讲清小程序端的行为差异（不能直接开外链 → 复制到剪贴板）
    expect(s).toMatch(/剪贴板/);
    expect(s).toMatch(/业务域名/);
  });
});

describe('④ 按钮组同步外链能力', () => {
  test('按钮组 defaultProps 里每个按钮都带外链字段', () => {
    const s = registry();
    const m = s.match(/type: 'button-group'[\s\S]{0,1200}?defaultProps: \{[\s\S]{0,900}?buttons: \[([\s\S]{0,700}?)\]/);
    expect(m, '注册表找不到 button-group.buttons').toBeTruthy();
    const btns = m[1];
    expect(btns).toContain('linkType');
    expect(btns).toContain('miniAppId');
    expect(btns).toContain('miniAppPath');
    expect(btns).toContain('miniAppEnv');
  });

  test('按钮组编辑器里每个按钮的跳转框走同一套选择器', () => {
    const s = edit();
    expect(s).toMatch(/openLinkPicker\(\{ scope: 'btn', index: bi \}\)/);
    expect(s).toContain('btnLinkDisplay');
  });

  test('C 端渲染：按钮组每个按钮传自己的链接配置', () => {
    const s = item();
    // onTap 必须接收第三个参数（链接配置），否则按钮组永远按组件级 internal 跳
    expect(s).toMatch(/onTap\('link', b\.url, b\)/);
    expect(s).toMatch(/function onTap\(kind, extra, linkCfg\)/);
    expect(s).toContain('linkCfg || compLinkOf(props.value)');
  });

  test('新增按钮时带上外链字段默认值', () => {
    const s = edit();
    expect(s).toMatch(/list\.push\(\{[^}]*linkType/);
  });
});

describe('链接模型单一事实来源', () => {
  test('cardEdit / CardLinkPicker / CardCompItem 都从 compLinkModel 取口径', () => {
    expect(edit()).toContain("from '../../utils/compLinkModel.js'");
    expect(picker()).toContain("from '../../utils/compLinkModel.js'");
    expect(item()).toContain("from '../utils/compLinkModel.js'");
  });

  test('组件内不再手搓 linkType 默认值（防与模型漂移）', () => {
    expect(edit()).not.toMatch(/linkType:\s*[^,]*\|\|\s*'internal'/);
    expect(item()).not.toMatch(/linkType:\s*[^,]*\|\|\s*'internal'/);
  });
});

describe('admin 端：radio 控件的「空值取第一个选项」陷阱', () => {
  // 🔴 admin 的 PageEditor 有两处「值为空 → 取 options[0].value」的逻辑：
  //   addListItem（新增列表项）与 listVal（列表项回显）。
  //   若 linkType 不显式给 default:''，按钮组新增按钮的 linkType 会变成
  //   第一个选项 'miniapp' → 违背「不选 = 内部页面」的设计，且会误显 AppID 输入框。
  const admin = () => stripComments(read('../../../../web-admin/src/views/customer/apps/design/componentRegistry.js'));

  test('admin button-group 的 linkType 显式声明 default:""', () => {
    const s = admin();
    const m = s.match(/key: 'linkType'[^}]*default: ''[^}]*options: \[\{ label: '外部小程序'/);
    expect(m, 'admin button-group 的 linkType 缺 default:""（会被 options[0] 顶成 miniapp）').toBeTruthy();
  });

  test('admin button 组件的 linkType 也显式声明 default:""', () => {
    const s = admin();
    // button 的 linkType 在顶层 schema（不在 itemFields 里）
    const idx = s.indexOf("type: 'button',");
    const seg = s.slice(idx, idx + 2000);
    expect(seg).toMatch(/key: 'linkType'[^}]*default: ''/);
  });

  test('admin 注册表里 linkType 的选项不含「内部页面」', () => {
    const s = admin();
    const m = s.match(/key: 'linkType'[^}]*options: \[([^\]]+)\]/g) || [];
    expect(m.length, 'admin 注册表找不到 linkType 选项').toBeGreaterThan(0);
    for (const one of m) {
      expect(one, 'admin linkType 选项里不应有 internal').not.toContain("'internal'");
      expect(one, 'admin linkType 选项里不应有「内部页面」').not.toContain('内部页面');
    }
  });
});
