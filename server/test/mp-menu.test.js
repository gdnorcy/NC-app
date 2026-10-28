/**
 * 公众号自定义菜单「UI 语义类型 → 微信 menu/create 真实 type」映射单测
 *
 * 为什么测：微信自定义菜单 API 的 type 枚举里**没有**「跳转小店 / 跳转商品 / 跳转账号主页」，
 * 这三个只是网页版编辑器的 UI 选项。若直接把 UI 语义当 type 下发，微信必然报 40001/40007。
 * 本模块是唯一的转换事实来源，改错 = 线上菜单全部发不出去，且前端校验全绿也照漏。
 *
 * 覆盖：名称长度阈值（4 汉字 / 8 汉字 + 16/60 字节）、send→click/media_id、
 *       shop/goods→miniprogram、home→view、缺字段必抛错、历史微信格式草稿回读。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toWechatMenu, normalizeSavedMenu, checkMenuName, countNameUnits, countUtf8Bytes,
  MENU_NAME_LIMIT, WECHAT_MENU_TYPES,
} from '../src/services/mp-menu.js';

test('名称计量：汉字算 2、字母算 1', () => {
  assert.equal(countNameUnits('商品'), 4);
  assert.equal(countNameUnits('ABCD'), 4);
  assert.equal(countNameUnits('小卖部'), 6);
});

test('名称计量：UTF-8 字节数（微信 40018 判定口径）', () => {
  assert.equal(countUtf8Bytes('ABCD'), 4);
  assert.equal(countUtf8Bytes('商品'), 6);
  assert.equal(countUtf8Bytes('小卖部'), 9);
});

test('名称长度：一级 4 汉字 / 8 字母，二级 8 汉字 / 16 字母', () => {
  assert.equal(checkMenuName('商品', 'top').ok, true);
  assert.equal(checkMenuName('小卖部吧', 'top').ok, true);      // 4 汉字 = 8 units
  assert.equal(checkMenuName('小卖部吧呀', 'top').ok, false);    // 5 汉字 = 10 units → 超
  assert.equal(checkMenuName('ABCDEFGH', 'top').ok, true);     // 8 字母
  assert.equal(checkMenuName('ABCDEFGHI', 'top').ok, false);   // 9 字母 → 超
  assert.equal(checkMenuName('一二三四五', 'sub').ok, true);   // 5 汉字（二级可到 8）
  assert.equal(checkMenuName('一二三四五六七八', 'sub').ok, true);
  assert.equal(checkMenuName('一二三四五六七八九', 'sub').ok, false);
  assert.equal(checkMenuName('', 'top').ok, false);
});

test('名称长度：字节上限独立生效（emoji 计 1 unit 但占 4 字节）', () => {
  // 计量口径：汉字算 2 units、字母/emoji 算 1 unit；
  // 但字节口径独立生效 —— 一级 16 字节上限：
  // '商品' = 6 字节 OK；+'🎉' = 10 字节 OK；再+'🎉🎉' = 18 字节 → 超字节上限
  // （units 仍只有 7 未超，说明拦下它的是字节规则而非字���规则）
  assert.equal(checkMenuName('商品', 'top').ok, true);
  assert.equal(checkMenuName('商品🎉', 'top').ok, true);
  assert.equal(checkMenuName('商品🎉🎉🎉', 'top').ok, false);
  assert.equal(MENU_NAME_LIMIT.top.maxBytes, 16);
  assert.equal(MENU_NAME_LIMIT.sub.maxBytes, 60);
});

test('send（文字）→ click', () => {
  const r = toWechatMenu({
    button: [{ name: '菜单', type: 'send', contentType: 'text', key: 'NEWS_LATEST' }],
  });
  assert.deepEqual(r.button[0], { type: 'click', name: '菜单', key: 'NEWS_LATEST' });
});

test('send（图片/音频/视频）→ media_id', () => {
  for (const ct of ['image', 'voice', 'video']) {
    const r = toWechatMenu({
      button: [{ name: '菜单', type: 'send', contentType: ct, mediaId: 'MEDIA_1' }],
    });
    assert.deepEqual(r.button[0], { type: 'media_id', name: '菜单', media_id: 'MEDIA_1' });
  }
});

test('view → view', () => {
  const r = toWechatMenu({
    button: [{ name: '官网', type: 'view', url: 'https://example.com' }],
  });
  assert.deepEqual(r.button[0], { type: 'view', name: '官网', url: 'https://example.com' });
});

test('miniprogram → miniprogram（appid 小写要求由用户保证，服务端不吞字段）', () => {
  const r = toWechatMenu({
    button: [{ name: '小程序', type: 'miniprogram', appid: 'wx123', pagepath: 'pages/index/index' }],
  });
  assert.deepEqual(r.button[0], {
    type: 'miniprogram', name: '小程序', appid: 'wx123', pagepath: 'pages/index/index',
  });
});

test('shop（跳转小店）→ miniprogram', () => {
  const r = toWechatMenu({
    button: [{ name: '小店', type: 'shop', appid: 'wx888', pagepath: 'pages/index/index' }],
  });
  assert.deepEqual(r.button[0], {
    type: 'miniprogram', name: '小店', appid: 'wx888', pagepath: 'pages/index/index',
  });
});

test('goods（跳转商品）→ miniprogram（与 shop 同型，靠页面路径区分商品）', () => {
  const r = toWechatMenu({
    button: [{ name: '商品', type: 'goods', appid: 'wx888', pagepath: 'pages/product/detail?id=1' }],
  });
  assert.equal(r.button[0].type, 'miniprogram');
  assert.equal(r.button[0].pagepath, 'pages/product/detail?id=1');
});

test('home（跳转账号主页）→ view', () => {
  const r = toWechatMenu({
    button: [{ name: '主页', type: 'home', url: 'https://mp.weixin.qq.com/mp/profile_ext?action=home' }],
  });
  assert.deepEqual(r.button[0], {
    type: 'view', name: '主页', url: 'https://mp.weixin.qq.com/mp/profile_ext?action=home',
  });
});

test('子菜单走 sub_button，父级不带 type', () => {
  const r = toWechatMenu({
    button: [{
      name: '更多', hasSub: true,
      sub: [
        { name: '官网', type: 'view', url: 'https://example.com' },
        { name: '联系', type: 'send', contentType: 'text', key: 'CONTACT' },
      ],
    }],
  });
  assert.equal(r.button[0].type, undefined);
  assert.equal(r.button[0].sub_button.length, 2);
  assert.deepEqual(r.button[0].sub_button[0], { type: 'view', name: '官网', url: 'https://example.com' });
});

test('下发前必填校验：缺 url / key / media_id / appid / pagepath 一律抛错', () => {
  assert.throws(() => toWechatMenu({ button: [{ name: '官网', type: 'view' }] }), /缺少跳转链接/);
  assert.throws(() => toWechatMenu({ button: [{ name: '联系', type: 'send', contentType: 'text' }] }), /缺少事件 Key/);
  assert.throws(() => toWechatMenu({ button: [{ name: '图', type: 'send', contentType: 'image' }] }), /缺少素材 media_id/);
  assert.throws(() => toWechatMenu({ button: [{ name: '小店', type: 'shop' }] }), /缺少小程序 AppID/);
  assert.throws(() => toWechatMenu({ button: [{ name: '小店', type: 'shop', appid: 'wx1' }] }), /缺少小程序页面路径/);
});

test('数量上限：一级 3 个、二级 5 个', () => {
  const one = (i) => ({ name: `菜${i}`, type: 'view', url: 'https://e.com' });
  assert.throws(() => toWechatMenu({ button: [one(1), one(2), one(3), one(4)] }), /一级菜单最多 3 个/);
  const many = Array.from({ length: 6 }, (_, i) => one(i));
  assert.throws(() => toWechatMenu({ button: [{ name: '更多', hasSub: true, sub: many }] }), /子菜单最多 5 个/);
  assert.throws(() => toWechatMenu({ button: [] }), /菜单为空/);
});

test('下发的 type 必须都在微信官方白名单内', () => {
  // 一级上限 3 → 前 3 个放一级，其余放进子菜单，再统一校验 type 白名单
  const r = toWechatMenu({
    button: [
      { name: '文字', type: 'send', contentType: 'text', key: 'K1' },
      { name: '图片', type: 'send', contentType: 'image', mediaId: 'M1' },
      {
        name: '更多', hasSub: true,
        sub: [
          { name: '官网', type: 'view', url: 'https://e.com' },
          { name: '小店', type: 'shop', appid: 'wx1', pagepath: 'p' },
          { name: '主页', type: 'home', url: 'https://mp.weixin.qq.com/x' },
        ],
      },
    ],
  });
  const all = [
    ...r.button.filter((b) => b.type),
    ...r.button[2].sub_button,
    { type: 'miniprogram', name: '小程序', appid: 'wx2', pagepath: 'p' },
    { type: 'media_id', name: '音频', media_id: 'M2' },
  ];
  for (const b of all) {
    assert.ok(WECHAT_MENU_TYPES.includes(b.type), `type ${b.type} 不在官方白名单`);
  }
  assert.equal(r.button.length, 3);
  assert.equal(r.button[2].sub_button.length, 3);
});

test('历史微信格式草稿回读：click → send+text，media_id → send+image', () => {
  const list = normalizeSavedMenu({
    button: [
      { name: '联系', type: 'click', key: 'K1' },
      { name: '图', type: 'media_id', media_id: 'M1' },
      { name: '更多', sub_button: [{ name: '官网', type: 'view', url: 'https://e.com' }] },
    ],
  });
  assert.equal(list[0].type, 'send');
  assert.equal(list[0].contentType, 'text');
  assert.equal(list[0].key, 'K1');
  assert.equal(list[1].type, 'send');
  assert.equal(list[1].contentType, 'image');
  assert.equal(list[1].mediaId, 'M1');
  assert.equal(list[2].hasSub, true);
  assert.equal(list[2].sub[0].url, 'https://e.com');
});

test('历史微信格式草稿可直接再次下发（幂等）', () => {
  const r = toWechatMenu({
    button: [{ name: '联系', type: 'click', key: 'K1' }],
  });
  assert.deepEqual(r.button[0], { type: 'click', name: '联系', key: 'K1' });
});
