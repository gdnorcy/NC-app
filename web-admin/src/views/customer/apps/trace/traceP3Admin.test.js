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
    expect(pageSrc).toContain('activityCoverPicker');
    expect(pageSrc).toContain('onPickActivityCover');
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
