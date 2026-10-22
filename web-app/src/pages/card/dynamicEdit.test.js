/**
 * 🔴 #312-6 编辑 + 删除 回归锁
 *
 * 背景：本人动态要能改、能删。核心约束：
 *  - 只能改/删自己的（跨用户访问服务端 404）；
 *  - 删除走软删（status='deleted'），自己列表与公开列表都按 status 过滤，不物理删；
 *  - 前端发布弹窗复用为「编辑」态（标题/按钮切换，回填正文/图片/链接/引用/定时）。
 *
 * vitest 不编译 SFC，对 .vue / .js 源码做正则断言。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const dynamicPage = () => stripComments(read('./dynamic.vue'));
const cardApi = () => stripComments(read('../../utils/cardApi.js'));
const cardRoute = () => stripComments(read('../../../../server/src/routes/card.js'));

describe('#312-6 前端：发布弹窗复用为编辑态', () => {
  test('列表每项出现「编辑 / 删除」操作入口', () => {
    const s = dynamicPage();
    expect(s).toMatch(/@click="openEdit\(d\)"/);
    expect(s).toMatch(/@click="removeDynamic\(d\)"/);
  });

  test('弹窗标题 / 按钮文案随编辑态切换（发布 ↔ 保存）', () => {
    const s = dynamicPage();
    expect(s).toMatch(/{{ isEditing \? '编辑动态' : '发布动态' }}/);
    expect(s).toMatch(/{{ isEditing \? '保存' : '发布' }}/);
  });

  test('openEdit 回填表单（含链接/引用/定时还原）；closePublish 清编辑态', () => {
    const s = dynamicPage();
    expect(s).toMatch(/function openEdit\(d\) \{/);
    // 回填链接卡片（有 linkUrl 才填）
    expect(s).toMatch(/link: d\.linkUrl/);
    // 回填引用
    expect(s).toMatch(/ref: d\.ref \|\| null/);
    // 定时还原
    expect(s).toMatch(/if \(d\.status === 'pending' && d\.scheduledAt\) fillSchedFromUtc\(d\.scheduledAt\);/);
    expect(s).toMatch(/function closePublish\(\) \{/);
    // 关闭时清空编辑态与定时
    expect(s).toMatch(/editingId\.value = null;/);
  });

  test('publish 按 editingId 走 PUT（updateDynamic）或 POST（createDynamic）', () => {
    const s = dynamicPage();
    expect(s).toMatch(/if \(editingId\.value\) \{/);
    expect(s).toMatch(/await cardApi\.updateDynamic\(editingId\.value, payload\);/);
    expect(s).toMatch(/await cardApi\.createDynamic\(payload\);/);
  });

  test('removeDynamic 调 cardApi.deleteDynamic 并本地移除', () => {
    const s = dynamicPage();
    expect(s).toMatch(/await cardApi\.deleteDynamic\(d\.id\)/);
    expect(s).toMatch(/dynamics\.value = dynamics\.value\.filter\(\(x\) => x\.id !== d\.id\);/);
  });
});

describe('#312-6 前端 API：updateDynamic / deleteDynamic 已注册', () => {
  test('cardApi 暴露 updateDynamic(PUT) 与 deleteDynamic(DELETE)', () => {
    const s = cardApi();
    expect(s).toMatch(/updateDynamic: \(id, data\) => request/);
    expect(s).toMatch(/deleteDynamic: \(id\) => request/);
  });
});

describe('#312-6 服务端：PUT / DELETE 仅本人 + 软删 + 列表过滤', () => {
  test('PUT /dynamics/:id 与 DELETE /dynamics/:id 路由存在（auth）', () => {
    const s = cardRoute();
    expect(s).toMatch(/router\.put\('\/dynamics\/:id', auth/);
    expect(s).toMatch(/router\.delete\('\/dynamics\/:id', auth/);
  });

  test('编辑/删除都先校验归属（user_id 匹配且未软删），越权一律 404', () => {
    const s = cardRoute();
    expect(s).toMatch(/SELECT \* FROM card_dynamic WHERE id = \? AND user_id = \? AND status != 'deleted'/);
  });

  test('删除走软删（status=deleted），不物理删', () => {
    const s = cardRoute();
    expect(s).toMatch(/UPDATE card_dynamic SET status='deleted', updated_at=datetime\('now'\) WHERE id=\?/);
  });

  test('作者自己列表排除软删 status != deleted', () => {
    const s = cardRoute();
    expect(s).toMatch(/SELECT \* FROM card_dynamic WHERE user_id=\? AND status != 'deleted' ORDER BY created_at DESC/);
  });

  test('PUT 复用归一逻辑：写同样的 15 列（含 scheduled_at + status）', () => {
    const s = cardRoute();
    expect(s).toMatch(/UPDATE card_dynamic SET title=\?, content=\?, images=\?, visibility=\?, link_title=\?, link_img=\?, link_desc=\?, link_url=\?, link_type=\?, ref_type=\?, ref_id=\?, scheduled_at=\?, status=\?, updated_at=datetime\('now'\) WHERE id=\?/);
  });
});
