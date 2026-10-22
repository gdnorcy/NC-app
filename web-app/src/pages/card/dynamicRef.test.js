/**
 * 🔴 #312-3 名片模块引用 回归锁
 *
 * 背景：名片独有的转化能力——一条动态挂「我的案例/作品」或「我的产品」（名片上的结构化数据），
 * 渲染成一张带图带标题的卡片，点击跳到对应内页。竞品只能贴外链，我们直接引用名片结构化内容，
 * 用户零成本、转化路径最短。
 *
 * 与 #312-2 链接卡片同源约束：图片 / 链接卡片 / 名片模块引用 三者互斥（企微 attachments 三选一）。
 * 本测试钉死：发布器引用选择器 → 提交带 refType/refId → 两处列表渲染引用卡片 → 组件跳转 → 服务端 resolve/INSERT/表列。
 * vitest 不编译 SFC，对 .vue / .js 源码做正则断言（与 dynamicLink.test.js 同套路）。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const dynamicPage = () => stripComments(read('./dynamic.vue'));
const cardDetail = () => stripComments(read('./cardDetail.vue'));
const linkCard = () => stripComments(read('../../components/DynamicLinkCard.vue'));
const cardRoute = () => stripComments(read('../../../../server/src/routes/card.js'));
const dbInit = () => stripComments(read('../../../../server/src/db.js'));

describe('#312-3 发布器：名片模块引用选择器', () => {
  test('newDynamic 初始含 ref: null（互斥第三项）', () => {
    const s = dynamicPage();
    expect(s).toMatch(/ref: null \}\)/);
  });

  test('发布弹窗出现「引用名片模块」表单，含 案例/作品 + 产品 两个 tab', () => {
    const s = dynamicPage();
    expect(s).toMatch(/引用名片模块/);
    expect(s).toMatch(/refTab='works'/);
    expect(s).toMatch(/refTab='goods'/);
    expect(s).toMatch(/@click="selectRef\(item\)"/);
    expect(s).toMatch(/@click="clearRef"/);
    expect(s).toMatch(/@click="openRefPicker"/);
  });

  test('引用与图片/链接互斥：分区默认收缩，展开后按互斥态提示', () => {
    const s = dynamicPage();
    // 🔴 2026-10-22 反馈后改默认收缩：分区头常驻（点击展开），互斥提示在展开体内
    expect(s).toMatch(/<view class="sec-head" @click="refOpen = !refOpen">/);
    expect(s).toMatch(/<view v-if="imagesActive \|\| linkActive" class="form-hint">图片\/链接与引用互斥/);
    expect(s).toMatch(/const refActive = computed\(/);
  });

  test('选图后清空引用与链接；链接输入框打字清空引用（互斥保持一致）', () => {
    const s = dynamicPage();
    // pickImages 成功后清掉 ref 与 link
    expect(s).toMatch(/newDynamic\.value\.ref = null;/);
    // 链接输入框 @input 清引用
    expect(s).toMatch(/@input="onLinkInput"/);
    expect(s).toMatch(/function onLinkInput\(\)/);
  });

  test('publish 提交体带 refType/refId；重置清空 ref', () => {
    const s = dynamicPage();
    expect(s).toMatch(/refType: newDynamic\.value\.ref \? newDynamic\.value\.ref\.type : ''/);
    expect(s).toMatch(/refId: newDynamic\.value\.ref \? newDynamic\.value\.ref\.id : 0/);
    expect(s).toMatch(/function emptyDynamic\(\) \{\s*return \{ content: '', title: '', cover: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '', title: '', desc: '', img: '' \}, ref: null \};\s*\}/);
    expect(s).toMatch(/function resetForm\(\) \{[\s\S]*?newDynamic\.value = emptyDynamic\(\);/);
  });
});

describe('#312-3 两处列表都渲染引用卡片（共用 DynamicLinkCard，防漂移）', () => {
  test('「我的动态」与名片详情页都用 :refObj 渲染引用卡片', () => {
    const d = dynamicPage();
    const c = cardDetail();
    expect(d).toMatch(/<DynamicLinkCard v-if="d\.linkUrl \|\| d\.ref" :d="d" :refObj="d\.ref \|\| null" \/>/);
    expect(c).toMatch(/<DynamicLinkCard v-if="d\.linkUrl \|\| d\.ref" :d="d" :refObj="d\.ref \|\| null" \/>/);
  });
});

describe('#312-3 跳转逻辑：引用卡片走内页 navigateTo', () => {
  test('DynamicLinkCard 识别 refObj（isRef），badge 显示 案例/产品，引用走 navigateTo', () => {
    const s = linkCard();
    expect(s).toMatch(/const isRef = computed\(\(\) => !!props\.refObj\)/);
    expect(s).toMatch(/refObj\.type === 'goods' \? '产品' : '案例'/);
    expect(s).toMatch(/uni\.navigateTo\(/);
  });
});

describe('#312-3 服务端链路（本次改动，钉死防回归）', () => {
  test('toDynamic 回查被引用行，拼出 ref（works→作品页 / goods→商品详情页）', () => {
    const s = cardRoute();
    expect(s).toMatch(/SELECT id, image_url, title FROM card_works WHERE id = \? AND card_id = \?/);
    expect(s).toMatch(/SELECT id, title, thumb, images FROM goods WHERE id = \?/);
    expect(s).toMatch(/\/pages\/card\/works\?id=\${row\.card_id}/);
    expect(s).toMatch(/\/pages\/mall\/goods\?id=\${g\.id}/);
    expect(s).toMatch(/ref,/);
  });

  test('POST /dynamics INSERT 写 ref_type / ref_id 两列', () => {
    const s = cardRoute();
    expect(s).toMatch(/INSERT INTO card_dynamic \(user_id, card_id, title, content, cover, images, visibility, link_title, link_img, link_desc, link_url, link_type, ref_type, ref_id, scheduled_at, status\)/);
    // 引用校验：works 必须归属本人名片；goods 必须同租户
    expect(s).toMatch(/SELECT id FROM card_works WHERE id = \? AND card_id = \?/);
    expect(s).toMatch(/g\.customer_id === targetCard\.customer_id/);
  });

  test('card_dynamic 表加 ref_type / ref_id 两列（迁移幂等）', () => {
    const s = dbInit();
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN ref_type TEXT NOT NULL DEFAULT ''/);
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN ref_id INTEGER NOT NULL DEFAULT 0/);
  });
});
