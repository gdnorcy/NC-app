import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 防伪溯源后台（web-admin）：扫码方案「按批次冻结」（#520）+ 独立活动广告位（#522）。
//
// 锁四件事：
//   1) 冻结开关在批次编辑弹窗里可见、可存（表单 → openBatchEdit 回填 → saveBatch 提交 → 服务端落库 四处对齐）
//   2) 冻结开关的两个字段名与后端 SQL 列一一对应（前端叫 scanModeFollow，后端列叫 scan_mode_follow，
//      名字对不上 = 开关存了但服务端不认 = 静默失效）
//   3) 活动广告位是**独立 Tab + 独立 settings 字段**，不复用首页展示位 displaySlots
//   4) 过时文案必须已被替换（旧文案还在说"旧码不会被改动"，与新增的冻结开关自相矛盾）

const PAGE = fileURLToPath(new URL('./index.vue', import.meta.url));
const SERVER_ROUTE = fileURLToPath(new URL('../../../../../../server/src/routes/trace.js', import.meta.url));

const pageSrc = readFileSync(PAGE, 'utf8');
const routeSrc = readFileSync(SERVER_ROUTE, 'utf8');

describe('#520 批次「方案冻结」开关（后台）', () => {
  test('批次编辑弹窗有冻结开关，绑到 scanModeFollow（1=跟随 / 0=冻结）', () => {
    expect(pageSrc).toContain('label="方案冻结"');
    expect(pageSrc).toContain('v-model="batchDlg.form.scanModeFollow"');
    expect(pageSrc).toContain(':active-value="1"');
    expect(pageSrc).toContain(':inactive-value="0"');
  });

  test('openBatchEdit 从库里回填两个字段（不回填 = 开关每次打开都显示错值）', () => {
    expect(pageSrc).toContain('scanModeFollow: Number(row.scan_mode_follow ?? 1)');
    expect(pageSrc).toContain("printScanMode: row.print_scan_mode || ''");
  });

  test('saveBatch 把两个字段提交给服务端（不改就是空操作）', () => {
    expect(pageSrc).toContain('scanModeFollow: Number(f.scanModeFollow ?? 1)');
    expect(pageSrc).toContain("printScanMode: f.printScanMode || ''");
  });

  test('服务端确实有这两列（前端字段名与 SQL 列名对齐）', () => {
    expect(routeSrc).toContain('scan_mode_follow = ?');
    expect(routeSrc).toContain('print_scan_mode = ?');
    // 公开段验真必须按冻结开关取方案
    expect(routeSrc).toContain('batch.scan_mode_follow');
    expect(routeSrc).toContain('batch.print_scan_mode');
  });

  test('已冻结时能看到记录到的方案名（否则用户不知道自己冻的是哪一档）', () => {
    expect(pageSrc).toContain('batchFrozenLabel');
    expect(pageSrc).toContain('BATCH_MODE_LABELS');
  });

  test('旧文案已替换（原文案与新增的冻结开关自相矛盾）', () => {
    expect(pageSrc).not.toContain('已印刷在外的旧码仍按其自身方式可用，不会被改动');
    expect(pageSrc).toContain('方案冻结');
  });
});

describe('#522 独立活动广告位（后台）', () => {
  test('设置里有独立的「活动设置」Tab（不复用首页展示位所在的 Tab）', () => {
    expect(pageSrc).toContain("key: 'activity', label: '活动设置'");
    expect(pageSrc).toContain("v-show=\"settingTab === 'activity'\"");
  });

  test('活动位是独立字段 activity（不是塞进 displaySlots）', () => {
    expect(pageSrc).toContain('activity: { enabled: false, cover:');
    expect(pageSrc).toContain('s.activity.enabled');
    expect(pageSrc).toContain('s.activity.cover');
    expect(pageSrc).toContain('s.activity.title');
    expect(pageSrc).toContain('s.activity.link');
    expect(pageSrc).toContain('s.activity.linkKey');
    expect(pageSrc).toContain('s.activity.when');
  });

  test('界面把 [FWM]/[KEY] 变量写清楚（商户不知道占位符就不会用）', () => {
    expect(pageSrc).toContain('[FWM]');
    expect(pageSrc).toContain('[KEY]');
  });

  test('活动位封面上传复用系统素材选择器（与展示位同一套）', () => {
    // 🔴 2026-10-30：活动位封面也并进通用图片选择器（imgPicker，target='activity'），
    //    少一个入口 = 少一处口径不一致。
    expect(pageSrc).toContain("openImgPicker('activity', 'cover')");
    expect(pageSrc).toContain("picker.target === 'activity'");
    expect(pageSrc).toContain('onPickImg');
  });

  test('活动位回填走「默认值 ⊕ 已存字段」合并（库里存 null 不能把设置页搞崩）', () => {
    expect(pageSrc).toContain('activityForForm');
    expect(pageSrc).toContain('s.activity = activityForForm(src.activity)');
    // 通用赋值循环必须**跳过** activity，否则整体覆盖 → 模板读 s.activity.enabled 时 null 会抛错白屏
    expect(pageSrc).toContain("if (key === 'activity') continue;");
  });

  test('服务端按 [FWM]/[KEY] 替换后下发（防空头开关）', () => {
    expect(routeSrc).toContain('buildTraceActivity');
    expect(routeSrc).toContain('\\[FWM\\]');
    expect(routeSrc).toContain('\\[KEY\\]');
  });
});

describe('#522 展示位双开关（区块总开关 + 每位隐藏）', () => {
  test('区块头部有「展示位开关」总开关，绑到 s.slotsEnabled', () => {
    expect(pageSrc).toContain('v-model="s.slotsEnabled"');
    expect(pageSrc).toContain('slotsEnabled: 1');
  });

  test('每个位有显示/隐藏开关，绑到 it.hidden（1=隐藏）', () => {
    // 🔴 2026-10-30：语义改成「显示」向 —— 开关打开=这个位显示，关闭=隐藏（与用户口语一致），
    //    底层字段仍是 hidden（1=隐藏），模板里做一层取反映射，不动服务端契约。
    expect(pageSrc).toContain(':model-value="Number(it.hidden) === 1 ? 0 : 1"');
    expect(pageSrc).toContain('it.hidden = Number(v) === 1 ? 0 : 1;');
  });

  test('两个开关的文字都只显示一个词（inline-prompt），不能两侧并排各一个', () => {
    // 🔴 用户反馈：开关两侧同时渲染「显示 | 已隐藏」，看不出当前状态。
    //    Element Plus 的 active-text/inactive-text 会把两侧都渲染出来（未激活那侧 opacity:0 也占位），
    //    只有 inline-prompt 才是「文字画在开关内部、只显示当前状态那一个词」。
    expect(pageSrc).toContain('inline-prompt');
    expect(pageSrc).toContain('active-text="显示"');
    expect(pageSrc).toContain('inactive-text="隐藏"');
    // 旧的「已隐藏」文案不能再作为开关文字（改由卡片上的状态标签承担）
    expect(pageSrc).not.toContain('active-text="已隐藏"');
  });

  test('表单回填把 hidden 归一化成 0/1（undefined 进 el-switch 会被误判成已隐藏）', () => {
    expect(pageSrc).toContain('hidden: Number(it.hidden) === 1 ? 1 : 0,');
  });

  test('保存时把 hidden 一起提交给服务端（不提交 = 开关存了但没生效）', () => {
    expect(pageSrc).toContain('when: it.when,\n        hidden: Number(it.hidden) === 1 ? 1 : 0,');
  });

  test('服务端归一化总开关，且总开关关掉时不下发展示位', () => {
    expect(routeSrc).toContain("if ('slotsEnabled' in patch) patch.slotsEnabled = normalizeTraceSwitch(patch.slotsEnabled)");
    expect(routeSrc).toContain('slotsEnabled(settings) ? pickDisplaySlots');
  });

  test('过时注释必须改掉：不能再把 8 说成「公众号图文消息单条 1~8 图文的接口上限」', () => {
    // 🔴 微信被动回复图文只能 1 条；8 是我们自定的产品上限。注释说错会导致下次照着它去配展示位。
    expect(pageSrc).not.toContain('与公众号图文消息单条 1~8 图文的接口上限一致');
  });
});

// #526 应用里图片/视频字段一律走系统链接选择器（用户 2026-10-30 拍板）
describe('#526 图片/视频字段走系统素材选择器', () => {
  test('企业 Logo/主图、批次 Logo/主图/视频不再让运营手填 URL', () => {
    // 🔴 手填 URL 的坑：相对路径在 C 端 MP 端全断、外链可能失效、商品图与微信封面规格对不上。
    expect(pageSrc).not.toContain('placeholder="图片 URL"');
    expect(pageSrc).not.toContain('placeholder="视频 URL"');
    expect(pageSrc).toContain("openImgPicker('settings', 'logo')");
    expect(pageSrc).toContain("openImgPicker('settings', 'banner')");
    expect(pageSrc).toContain("openImgPicker('batch', 'logo')");
    expect(pageSrc).toContain("openImgPicker('batch', 'banner')");
    expect(pageSrc).toContain("openVidPicker('batch', 'video')");
  });

  test('图片与视频各一个选择器实例（MaterialPicker 的 accept 在 setup 时定死，不能复用同一个实例改 fileType）', () => {
    expect(pageSrc).toContain('<MaterialPicker v-model="imgPicker.show" file-type="image"');
    expect(pageSrc).toContain('<MaterialPicker v-model="vidPicker.show" file-type="video"');
  });

  test('选中后按 target/field 写回正确对象（写错对象 = 素材选了但值没落到表单上）', () => {
    expect(pageSrc).toContain("picker.target === 'settings'");
    expect(pageSrc).toContain("picker.target === 'batch'");
    expect(pageSrc).toContain("picker.target === 'activity'");
  });
});
