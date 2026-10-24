/**
 * 🔴 回归锁：#312-16 名片二维码/分享海报升级为「真小程序码」
 *
 * 反馈 → 修法：
 *  用户已接入小程序渠道，但弹层/海报里仍是普通网页二维码，文案还写着
 *  「当前小程序渠道未接入」。根因：/wxacode 只认第三方平台已授权
 *  （auth_status='authorized'）的租户，自运营租户（自己填 AppID+AppSecret）
 *  被直接排除 → 全部落到 H5 兜底，且失败被静默吞掉、无从诊断。
 *
 * 本测试钉死：
 *  1 渠道查询不再过滤 auth_status（自运营租户也要能查到）；
 *  2 三级通道：授权 → 自运营直连 → H5 兜底；
 *  3 env 级联 release→trial→develop（41030 = 该版本没这个页面）；
 *  4 失败必须打日志（原实现静默吞错）；
 *  5 密钥走 readSecret 解密后再送微信；
 *  6 前端文案不再声称「小程序渠道未接入」。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

describe('名片小程序码三级通道', () => {
  test('渠道查询不得再过滤 auth_status（否则自运营租户永远拿不到小程序码）', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    assert.match(seg, /SELECT \* FROM channel_apps WHERE customer_id = \? AND channel_type = 'mini' ORDER BY id DESC LIMIT 1/);
    assert.doesNotMatch(seg, /channel_type = 'mini' AND auth_status = 'authorized'/);
  });

  test('三级通道齐全：授权→自运营直连→H5 兜底', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    assert.match(seg, /auth_status === 'authorized'/);
    assert.match(seg, /new WxComponentService\(db\)\.getWxacode\(/);
    assert.match(seg, /standaloneWxacode\(channel\.appid, secret,/);
    assert.match(seg, /type: 'h5'/);
    assert.match(seg, /type: 'wxacode'/);
  });

  test('env 级联 release/trial/develop 且逐个版本尝试（41030 页面不存在）', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    assert.match(seg, /'release', 'trial', 'develop'|\ 'trial', 'develop', 'release'/);
    assert.match(seg, /for \(const env of envs\)/);
  });

  test('🔴 失败必须打日志，禁止静默吞错（原来 catch{} 空转导致线上无从诊断）', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    assert.match(seg, /console\.warn\(`\[wxacode\] card=/);
  });

  test('自运营分支的密钥必须 readSecret 解密后再送微信（落库是密文）', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    assert.match(seg, /const secret = channel \? readSecret\(channel\.app_secret\) : '';/);
    assert.doesNotMatch(seg, /standaloneWxacode\([^)]*channel\.app_secret/);
  });

  test('两个取码实现都抛出带 wxErrcode 的错误（供 env 级联判断）', () => {
    const svc = read('../src/services/wx-component.js');
    assert.match(svc, /export async function standaloneWxacode\(/);
    // getWxacode 与 standaloneWxacode 都要带 wxErrcode
    const standalone = svc.slice(svc.indexOf('export async function standaloneWxacode'));
    assert.match(standalone, /wxErrcode: json\.errcode/);
    const member = svc.slice(svc.indexOf('async getWxacode('), svc.indexOf('// —— 记录发布日志 ——'));
    assert.match(member, /wxErrcode: json\.errcode/);
  });

  test('🔴 降级必须把原因透出（原接口只回「网页码」，租户会一直以为是没接上）', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    // 线上实证：小程序从未上传代码 → release/trial/develop 三个版本全 41030
    assert.match(seg, /if \(!makers\.length\) out\.reason = 'no_channel'/);
    assert.match(seg, /else if \(\/\\\(41030\\\)\/\.test\(lastErr\)\)/);
    assert.match(seg, /else out\.reason = 'failed'/);
    assert.match(seg, /res\.json\(out\)/);
  });

  test('失败原因保留到最后一条（供 41030 判定），不能只 log 不留值', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    assert.match(seg, /lastErr = String\(\(e && e\.message\) \|\| e\);/);
  });

  test('🔴 check_path 二次机会：逐页校验失灵的已发布账号（任何显式 page 都 41030），探测通过才跳过校验补 release', () => {
    const s = read('../src/routes/card.js');
    const seg = s.slice(s.indexOf("router.get('/wxacode'"), s.indexOf("router.get('/distribution/qrcode'"));
    // 守卫：只对自运营 + 首轮确实是 41030 的账号做二次机会
    assert.match(seg, /channel\.auth_status !== 'authorized' && \/\\\(41030\\\)\/\.test\(lastErr\)/);
    // 先用「真实 scene + 不带 page + 校验」探测账号是否真的已发布（探测不过就老实回落 H5，不发死码）
    assert.match(seg, /standaloneWxacode\(channel\.appid, secret, `id=\$\{cardId\}`, '', 'release'\)/);
    // 补枪固定 release：二维码是给访客扫的，trial/develop 普通用户打不开
    assert.match(seg, /standaloneWxacode\(channel\.appid, secret, `id=\$\{cardId\}`, 'pages\/card\/cardDetail', 'release', \{ checkPath: false \}\)/);
  });

  test('standaloneWxacode 支持 checkPath:false 且 page 为空时不带 page 字段（探测用主页）', () => {
    const svc = read('../src/services/wx-component.js');
    const standalone = svc.slice(svc.indexOf('export async function standaloneWxacode'));
    assert.match(standalone, /if \(opts\.checkPath === false\) body\.check_path = false;/);
    assert.match(standalone, /if \(page\) body\.page = page;/);
    assert.doesNotMatch(standalone, /page: page,/);
  });

  test('前端按 type+reason 出文案，不再声称「小程序渠道未接入」', () => {
    const vue = read('../../web-app/src/pages/card/myCard.vue');
    assert.doesNotMatch(vue, /当前小程序渠道未接入/);
    assert.doesNotMatch(vue, /qs-sub">\{\{ qrType === 'wxacode'/);
    assert.match(vue, /qrType\.value === 'wxacode'\) return '微信扫一扫，直达小程序名片'/);
    assert.match(vue, /qrReason\.value === 'no_page'\) return '小程序还没上传代码，暂用网页链接码'/);
    assert.match(vue, /qrReason\.value = res\.reason \|\| '';/);
    // 🔴 文案走 computed：MP 模板不堆三元
    assert.match(vue, /const qrSubText = computed\(\(/);
    assert.match(vue, /\{\{ qrSubText \}\}/);
  });
});
