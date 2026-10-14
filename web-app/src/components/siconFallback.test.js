import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// SIcon MP 分支回退链回归（2026-10-15 真机报修）：
// 「切换主题色为草绿时，名片内容中的图标是黑色的，没有跟主题色」。
// 病根：MP 端 SIcon 查构建期烘焙的 sicons-base64（色板=构建那一刻的颜色），
// 租户切换主题色后运行期颜色不在表里 → 旧代码兜底黑色变体 → 全黑。
// 修复：精确命中走离线 base64；合法 hex 未命中走服务端按需渲染
// （GET /api/card/sicon，任意颜色/自定义色）；非 hex 脏值才回落黑色。
// 本测试锁三处：SIcon.vue 回退链、服务端路由存在性、提取 computed 真实执行。

const siconSrc = readFileSync(fileURLToPath(new URL('./SIcon.vue', import.meta.url)), 'utf8');
const cardRouteSrc = readFileSync(
  fileURLToPath(new URL('../../../server/src/routes/card.js', import.meta.url)), 'utf8'
);

/** 提取 mpIconSrc computed 的函数体，注入依赖后真实执行 */
function runMpIconSrc(props, siconsBase64, API_DOMAIN) {
  const start = siconSrc.indexOf('const mpIconSrc = computed(() => {');
  expect(start, 'mpIconSrc computed 应存在').toBeGreaterThan(-1);
  const bodyStart = siconSrc.indexOf('{', start);
  const bodyEnd = siconSrc.indexOf('\n});', bodyStart);
  const body = siconSrc.slice(bodyStart + 1, bodyEnd);
  // eslint-disable-next-line no-new-func
  const fn = new Function('props', 'siconsBase64', 'API_DOMAIN', body);
  return fn(props, siconsBase64, API_DOMAIN);
}

describe('SIcon.vue MP 分支回退链', () => {
  test('MP 分支引入 API_DOMAIN（服务端图标URL 的前缀来源）', () => {
    const mpBlock = siconSrc.slice(siconSrc.indexOf('// #ifdef MP-WEIXIN'), siconSrc.indexOf('// #endif'));
    expect(mpBlock).toMatch(/import\s*\{\s*API_DOMAIN\s*\}\s*from\s*'\.\.\/utils\/cardApi\.js'/);
  });

  test('精确色命中烘焙表 → 离线 base64（零请求，现状不变）', () => {
    const src = runMpIconSrc(
      { name: 'card', color: '#165dff' },
      { 'card-165dff': 'BBB64' },
      'http://localhost:3000'
    );
    expect(src).toBe('data:image/png;base64,BBB64');
  });

  test('无 color（hex=000000）→ 命中黑色烘焙（全图标都烘了黑）', () => {
    const src = runMpIconSrc({ name: 'card', color: '' }, { 'card-000000': 'BLACK' }, 'http://x');
    expect(src).toBe('data:image/png;base64,BLACK');
  });

  test('合法 hex 未烘焙（草绿主题色）→ 服务端按需渲染 URL', () => {
    const src = runMpIconSrc(
      { name: 'card', color: '#4FA140' },
      { 'card-000000': 'BLACK' },
      'http://localhost:3000'
    );
    expect(src).toBe('http://localhost:3000/api/card/sicon?name=card&color=4fa140');
  });

  test('URL 拼接防注入：name/color 均 encodeURIComponent', () => {
    const src = runMpIconSrc(
      { name: 'a b&c', color: '#ffffff' },
      {},
      'http://h'
    );
    expect(src).toContain('name=a%20b%26c');
    expect(src).toContain('color=ffffff');
  });

  test('非 hex 脏值（配置异常）→ 回落黑色烘焙变体，不全空白', () => {
    const src = runMpIconSrc(
      { name: 'card', color: 'not-a-color' },
      { 'card-000000': 'BLACK' },
      'http://h'
    );
    expect(src).toBe('data:image/png;base64,BLACK');
  });

  test('非 hex 且黑变体也没有 → 空串（与旧行为一致，不发明新兜底）', () => {
    const src = runMpIconSrc({ name: 'ghost', color: 'oops' }, {}, 'http://h');
    expect(src).toBe('');
  });

  test('防回退：不再「未命中即无条件 000000 黑图」', () => {
    // 旧代码：let b64 = ...; if (!b64) b64 = siconsBase64[`${props.name}-000000`];
    expect(siconSrc).not.toMatch(/if\s*\(!b64\)\s*b64\s*=\s*siconsBase64\[/);
  });
});

describe('服务端 /api/card/sicon 路由（回退链的另一半）', () => {
  test('路由存在且免鉴权（静态渲染器，同 /cards/:id/works）', () => {
    expect(cardRouteSrc).toMatch(/router\.get\('\/sicon'/);
  });

  test('svgMap 单一事实来源：读 web-app SIcon.vue，禁复制一份', () => {
    expect(cardRouteSrc).toMatch(/readFileSync\(new URL\('\.\.\/\.\.\/\.\.\/web-app\/src\/components\/SIcon\.vue'/);
    expect(cardRouteSrc).toMatch(/loadSiconSvgMap/);
  });

  test('渲染参数校验：name 限 [a-z0-9-]，color 限 hex（防 SVG 注入）', () => {
    expect(cardRouteSrc).toMatch(/\^\[a-z0-9-\]\+\$\/\.test\(name\)/);
    expect(cardRouteSrc).toMatch(/\^\[0-9a-fA-F\]\{3,8\}\$\/\.test\(color\)/);
  });

  test('PNG 响应带长缓存头（微信 image 本地缓存，二次零请求）', () => {
    expect(cardRouteSrc).toMatch(/Cache-Control', 'public, max-age=86400, immutable'/);
  });

  test('内存缓存 + FIFO 上限（防任意颜色组合打爆内存）', () => {
    expect(cardRouteSrc).toMatch(/SICON_CACHE_CAP/);
    expect(cardRouteSrc).toMatch(/siconCache\.set\(key, png\)/);
  });

  test('sharp 渲染与 gen-mp-sicons 同管线：color 属性必须给（currentColor 实心点）', () => {
    expect(cardRouteSrc).toMatch(/color="#\$\{hex\}" stroke="#\$\{hex\}"/);
  });
});
