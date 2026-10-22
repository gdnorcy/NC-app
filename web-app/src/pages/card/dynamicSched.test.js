/**
 * 🔴 #312-5 定时发布 回归锁
 *
 * 背景：写好内容先不发，到时间自动上架（竞品都有草稿箱/定时）。一期风险是「漏加时间条件 → 提前曝光」，
 * 所以本测试重点钉死：① 后端 INSERT 落 scheduled_at + status；② 列表查询必须叠加时间条件；
 * ③ 未来时间置 pending 且不进公开列表；④ 前端发布器出现定时开关 + 日期/时间选择，且提交体带 scheduledAt。
 *
 * 注意：vitest 不编译 SFC，对 .vue / .js 源码做正则断言（与 dynamicLink/dynamicRef/dynamicTitle 同套路）。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const dynamicPage = () => stripComments(read('./dynamic.vue'));
const cardRoute = () => stripComments(read('../../../../server/src/routes/card.js'));
const dbInit = () => stripComments(read('../../../../server/src/db.js'));

describe('#312-5 前端发布器：定时发布开关 + 日期/时间选择', () => {
  test('发布弹窗出现「定时发布」开关（switch）与日期/时间两个 picker', () => {
    const s = dynamicPage();
    expect(s).toMatch(/定时发布/);
    expect(s).toMatch(/<switch :checked="schedEnabled" @change="onSchedToggle" color="#165dff" \/>/);
    expect(s).toMatch(/<picker mode="date" :value="schedDate" @change="onSchedDate" class="sched-picker">/);
    expect(s).toMatch(/<picker mode="time" :value="schedTime" @change="onSchedTime" class="sched-picker">/);
  });

  test('scheduledActive 由 schedEnabled + 日期 + 时间共同决定', () => {
    const s = dynamicPage();
    expect(s).toMatch(/const schedEnabled = ref\(false\);/);
    expect(s).toMatch(/const schedDate = ref\(''\);/);
    expect(s).toMatch(/const schedTime = ref\(''\);/);
    expect(s).toMatch(/const scheduledActive = computed\(\(\) => schedEnabled\.value && !!schedDate\.value && !!schedTime\.value\);/);
  });

  test('onSchedToggle 关开关时清空日期/时间；buildScheduledAt 选齐则返回 ISO 否则空串', () => {
    const s = dynamicPage();
    expect(s).toMatch(/function onSchedToggle\(e\) \{/);
    expect(s).toMatch(/if \(!schedEnabled\.value\) \{ schedDate\.value = ''; schedTime\.value = ''; \}/);
    expect(s).toMatch(/function buildScheduledAt\(\) \{/);
    expect(s).toMatch(/return local\.toISOString\(\);/);
    expect(s).toMatch(/return '';/);
  });

  test('publish 提交体带 scheduledAt: buildScheduledAt()，且重置清空定时开关/日期/时间', () => {
    const s = dynamicPage();
    expect(s).toMatch(/scheduledAt: buildScheduledAt\(\),/);
    expect(s).toMatch(/schedEnabled\.value = false;/);
    expect(s).toMatch(/schedDate\.value = '';/);
    expect(s).toMatch(/schedTime\.value = '';/);
  });

  test('列表对 pending（定时中）动态显示「定时发布中」徽标', () => {
    const s = dynamicPage();
    expect(s).toMatch(/<view class="sched-tag" v-if="d\.status === 'pending'">/);
    expect(s).toMatch(/schedLabel/);
  });
});

describe('#312-5 服务端链路（钉死防回归）', () => {
  test('POST /dynamics INSERT 写 scheduled_at + status 两列', () => {
    const s = cardRoute();
    expect(s).toMatch(/INSERT INTO card_dynamic \(user_id, card_id, title, content, images, visibility, link_title, link_img, link_desc, link_url, link_type, ref_type, ref_id, scheduled_at, status\)/);
  });

  test('toDynamic 序列化出口带 scheduledAt 与 status（前端管理/徽标用）', () => {
    const s = cardRoute();
    expect(s).toMatch(/scheduledAt: \(row\.scheduled_at \|\| ''\)\.toString\(\),/);
    expect(s).toMatch(/status: \(row\.status \|\| 'active'\)\.toString\(\),/);
  });

  test('normalizeScheduledAt：未来时间置 pending，空/过去置 active，并归一为 UTC', () => {
    const s = cardRoute();
    expect(s).toMatch(/function normalizeScheduledAt\(raw\) \{/);
    expect(s).toMatch(/const status = t > Date\.now\(\) \? 'pending' : 'active';/);
  });

  test('promoteScheduled：到点把 pending 翻 active（幂等，无 cron 下的收口点）', () => {
    const s = cardRoute();
    expect(s).toMatch(/function promoteScheduled\(\) \{/);
    expect(s).toMatch(/UPDATE card_dynamic SET status='active', updated_at=datetime\('now'\) WHERE status='pending' AND scheduled_at IS NOT NULL AND scheduled_at != '' AND scheduled_at <= datetime\('now'\)/);
  });

  test('公开列表查询叠加时间条件（漏一处就提前曝光）', () => {
    const s = cardRoute();
    // 🔴 关键防回归：名片公开动态列表必须排除未来定时项
    expect(s).toMatch(/AND \(d\.scheduled_at = '' OR d\.scheduled_at IS NULL OR d\.scheduled_at <= datetime\('now'\)\)/);
    // 两个列表入口都应调用 promoteScheduled（作者列表 / 公开列表）
    const calls = (s.match(/promoteScheduled\(\);/g) || []);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test('card_dynamic 表加 scheduled_at 列（迁移幂等）', () => {
    const s = dbInit();
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN scheduled_at TEXT NOT NULL DEFAULT ''/);
  });
});
