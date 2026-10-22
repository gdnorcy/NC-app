/**
 * 🔴 #312-2 链接预览卡片 + 小程序卡片 回归锁
 *
 * 背景：名片场景核心转化能力——一条动态挂一张可跳转卡片（link 四字段 + targetType: page/url）。
 * 一期约束（来自方案文档 §6.1）：
 *  - 多图和链接卡片互斥（企微 attachments 三选一），前端禁用另一入口 + 服务端兜底清空图片；
 *  - 优先只支持跳自家小程序内页，外链走复制链接兜底（web-view 需业务域名白名单，一期未配）。
 *
 * 本测试钉死全链路：发布器表单 → 提交带 link 字段 → 两处列表渲染卡片 → 组件跳转逻辑 → 服务端序列化/INSERT/表列。
 * 注意：vitest 不编译 SFC，这里对 .vue / .js 源码做正则断言（与 dynamicTitle.test.js 同套路）。
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

describe('#312-2 发布器：链接卡片表单与互斥', () => {
  test('newDynamic 初始含 link 对象（type 默认 page）', () => {
    const s = dynamicPage();
    expect(s).toMatch(/newDynamic = ref\(\{ content: '', title: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '', title: '', desc: '', img: '' \}, ref: null \}\)/);
  });

  test('发布弹窗出现「链接卡片」表单，含 page/url 两个 targetType 选项', () => {
    const s = dynamicPage();
    expect(s).toMatch(/<view class="form-item" v-if="!imagesActive && !refActive">/);
    expect(s).toMatch(/newDynamic\.link\.type='page'/);
    expect(s).toMatch(/newDynamic\.link\.type='url'/);
    expect(s).toMatch(/v-model="newDynamic\.link\.url"/);
    expect(s).toMatch(/v-model="newDynamic\.link\.title"/);
    expect(s).toMatch(/v-model="newDynamic\.link\.desc"/);
    expect(s).toMatch(/v-model="newDynamic\.link\.img"/);
  });

  test('图片/链接卡片/引用 三者互斥：入口互禁（v-if 反向）', () => {
    const s = dynamicPage();
    // 图片选择器：链接激活时隐藏
    expect(s).toMatch(/<view class="img-picker" v-if="!linkActive">/);
    // 链接表单：图片或引用存在时隐藏（#312-3 新增 refActive 互斥）
    expect(s).toMatch(/<view class="form-item" v-if="!imagesActive && !refActive">/);
    // 引用表单：图片或链接存在时隐藏
    expect(s).toMatch(/<view class="form-item" v-if="!imagesActive && !linkActive">/);
    // 三个 computed 驱动互斥
    expect(s).toMatch(/const linkActive = computed\(/);
    expect(s).toMatch(/const imagesActive = computed\(/);
    expect(s).toMatch(/const refActive = computed\(/);
  });

  test('publish 提交体带全部 link 字段；重置清空 link', () => {
    const s = dynamicPage();
    expect(s).toMatch(/linkTitle: newDynamic\.value\.link\.title \|\| ''/);
    expect(s).toMatch(/linkImg: newDynamic\.value\.link\.img \|\| ''/);
    expect(s).toMatch(/linkDesc: newDynamic\.value\.link\.desc \|\| ''/);
    expect(s).toMatch(/linkUrl: newDynamic\.value\.link\.url \|\| ''/);
    expect(s).toMatch(/linkType: newDynamic\.value\.link\.type \|\| 'page'/);
    // 重置把 link 一并清掉（否则下次弹窗残留）
    expect(s).toMatch(/newDynamic\.value = \{ content: '', title: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '', title: '', desc: '', img: '' \}, ref: null \};/);
  });
});

describe('#312-2 两处列表都渲染链接卡片（共用组件，防漂移）', () => {
  test('「我的动态」列表渲染 DynamicLinkCard（linkUrl 非空或引用非空才显示）', () => {
    const s = dynamicPage();
    expect(s).toMatch(/<DynamicLinkCard v-if="d\.linkUrl \|\| d\.ref" :d="d" :refObj="d\.ref \|\| null" \/>/);
    expect(s).toMatch(/import DynamicLinkCard from '\.\.\/\.\.\/components\/DynamicLinkCard\.vue';/);
  });

  test('名片详情页也渲染 DynamicLinkCard', () => {
    const s = cardDetail();
    expect(s).toMatch(/<DynamicLinkCard v-if="d\.linkUrl \|\| d\.ref" :d="d" :refObj="d\.ref \|\| null" \/>/);
    expect(s).toMatch(/import DynamicLinkCard from '\.\.\/\.\.\/components\/DynamicLinkCard\.vue';/);
  });
});

describe('#312-2 跳转逻辑：内页/引用走 navigateTo / 外链复制兜底', () => {
  test('外链(url)走复制链接兜底，内页(page)与引用(ref)走 navigateTo 且校验 / 开头', () => {
    const s = linkCard();
    // 引用卡片或内页链接都走 navigateTo；仅 url 外链走复制兜底
    expect(s).toMatch(/if \(isRef\.value \|\| props\.d\.linkType !== 'url'\)/);
    expect(s).toMatch(/uni\.setClipboardData\(/);
    expect(s).toMatch(/u\.startsWith\('\/'\)/);
    expect(s).toMatch(/uni\.navigateTo\(/);
  });
});

describe('#312-2 服务端链路（本次改动，钉死防回归）', () => {
  test('toDynamic 序列化出口带 link 字段，linkType 归一 page/url', () => {
    const s = cardRoute();
    expect(s).toMatch(/linkUrl: rawLinkUrl,/);
    expect(s).toMatch(/linkType: row\.link_type === 'url' \? 'url' : 'page',/);
  });

  test('POST /dynamics INSERT 写 5 个 link 列', () => {
    const s = cardRoute();
    expect(s).toMatch(/INSERT INTO card_dynamic \(user_id, card_id, title, content, images, visibility, link_title, link_img, link_desc, link_url, link_type, ref_type, ref_id, scheduled_at, status\)/);
  });

  test('card_dynamic 表加 5 个 link 列（迁移幂等）', () => {
    const s = dbInit();
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN link_title TEXT NOT NULL DEFAULT ''/);
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN link_img TEXT NOT NULL DEFAULT ''/);
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN link_desc TEXT NOT NULL DEFAULT ''/);
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN link_url TEXT NOT NULL DEFAULT ''/);
    expect(s).toMatch(/ALTER TABLE card_dynamic ADD COLUMN link_type TEXT NOT NULL DEFAULT 'page'/);
  });
});
