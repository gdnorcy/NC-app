/**
 * 🔴 #312-1 动态标题 title 回归锁
 *
 * 背景：card_dynamic.title 字段早在库里（db.js:1137）、INSERT 早写入（card.js:2142），
 * 但前端发布弹窗一直没有输入框 → 字段写了空串，「白捡的能力」空转了一整年。
 * 本测试钉死全链路：弹窗输入 → 提交带 title → 列表页/名片页渲染 → 服务端序列化出口。
 *
 * 附带护栏（来自过往教训）：
 * - 标题必须**单行省略**：标题超长会把列表卡片撑出两行，破坏列表节奏；
 * - 重置必须清 title：与 images 同一个坑（上次的标题残留在下次弹窗里）。
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
const cardRoute = () => stripComments(read('../../../../server/src/routes/card.js'));
const dbInit = () => stripComments(read('../../../../server/src/db.js'));

describe('#312-1 动态标题：发布弹窗必须能填标题', () => {
  test('弹窗有标题输入框，绑 newDynamic.title', () => {
    const s = dynamicPage();
    expect(s).toMatch(/<input[^>]*v-model="newDynamic\.title"/);
    // 选填：placeholder 明说；30 字上限（分享卡片 48 字符截断，标题就是转发用的一句话）
    expect(s).toMatch(/v-model="newDynamic\.title"[^>]*placeholder="[^"]*选填/);
    expect(s).toMatch(/v-model="newDynamic\.title"[^>]*:maxlength="30"/);
  });

  test('newDynamic 初始值含 title，publish 提交带 title', () => {
    const s = dynamicPage();
    expect(s).toMatch(/newDynamic = ref\(\{ content: '', title: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '' \}, ref: null \}\)/);
    // 提交体必须带 title（缺这项 = 前端填了也传不到后端）；publish 组装 payload 后交给 createDynamic
    expect(s).toMatch(/title: newDynamic\.value\.title \|\| ''/);
    expect(s).toMatch(/cardApi\.createDynamic\(payload\)/);
  });

  test('发布成功后的重置必须清 title（与 images 同一个坑）', () => {
    const s = dynamicPage();
    // 🔴 #312-7-2 后：重置收敛成 resetForm()+emptyDynamic()（原来只在发布成功那条路径清，
    //   取消/点遮罩关闭会残留）。断言「空壳工厂含 title/cover 且被 resetForm 赋值」。
    expect(s).toMatch(/function emptyDynamic\(\) \{\s*return \{ content: '', title: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '' \}, ref: null \};\s*\}/);
    expect(s).toMatch(/function resetForm\(\) \{[\s\S]*?newDynamic\.value = emptyDynamic\(\);/);
  });
});

describe('#312-1 动态标题：两处列表都要渲染', () => {
  test('「我的动态」列表标题加粗单行省略', () => {
    const s = dynamicPage();
    expect(s).toMatch(/<view class="dynamic-title" v-if="d\.title">\{\{ d\.title \}\}<\/view>/);
    // 单行省略：缺 nowrap/ellipsis 标题会把卡片撑出两行
    const css = read('./dynamic.vue');
    expect(css).toMatch(/\.dynamic-title \{[\s\S]*?white-space: nowrap;/);
    expect(css).toMatch(/\.dynamic-title \{[\s\S]*?text-overflow: ellipsis;/);
    expect(css).toMatch(/\.dynamic-title \{[\s\S]*?font-weight: 700;/);
  });

  test('名片详情页动态列表已渲染 title（v-if 判空，无标题不占位）', () => {
    const s = cardDetail();
    expect(s).toMatch(/<h4 v-if="d\.title">\{\{ d\.title \}\}<\/h4>/);
  });
});

describe('#312-1 动态标题：服务端链路（本次未改，钉死防回归）', () => {
  test('toDynamic 序列化出口带 title', () => {
    const s = cardRoute();
    expect(s).toMatch(/title: row\.title \|\| ''/);
  });

  test('POST /dynamics INSERT 写 title', () => {
    const s = cardRoute();
    expect(s).toMatch(/INSERT INTO card_dynamic \(user_id, card_id, title, content, images, visibility, link_title, link_img, link_desc, link_url, link_type, ref_type, ref_id, scheduled_at, status\)/);
  });

  test('card_dynamic 表有 title 列', () => {
    const s = dbInit();
    expect(s).toMatch(/CREATE TABLE IF NOT EXISTS card_dynamic \([\s\S]*?title TEXT NOT NULL DEFAULT ''/);
  });
});

describe('#312-4 可见范围三态：公开 / 仅登录可见 / 仅自己', () => {
  test('列表标签三态映射：private→仅自己, login→登录可见, 其余→公开', () => {
    const s = dynamicPage();
    expect(s).toMatch(/d\.visibility === 'private' \? '仅自己' : d\.visibility === 'login' \? '登录可见' : '公开'/);
  });

  test('发布弹窗三个可见范围选项含「登录可见」(值 login)', () => {
    const s = dynamicPage();
    expect(s).toMatch(/newDynamic\.visibility === 'login' \}\" @click=\"newDynamic\.visibility='login'\"\>登录可见<\/view>/);
    // 公开 / 仅自己 两个老选项仍在
    expect(s).toMatch(/newDynamic\.visibility === 'public' \}\" @click=\"newDynamic\.visibility='public'\"\>公开<\/view>/);
    expect(s).toMatch(/newDynamic\.visibility === 'private' \}\" @click=\"newDynamic\.visibility='private'\"\>仅自己<\/view>/);
  });

  test('服务端三处三态归一：POST + 序列化出口 + 名片列表过滤', () => {
    const s = cardRoute();
    // POST 归一
    expect(s).toMatch(/const vis = \(visibility === 'private' \|\| visibility === 'login'\) \? visibility : 'public';/);
    // 序列化出口
    expect(s).toMatch(/visibility: \(row\.visibility === 'private' \|\| row\.visibility === 'login'\) \? row\.visibility : 'public'/);
    // 名片公开列表：public 或（login 且已登录）
    expect(s).toMatch(/\(d\.visibility='public' OR \(d\.visibility='login' AND \?\)\)/);
  });
});
