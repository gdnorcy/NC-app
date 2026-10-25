// 方案 B 令牌化进度 / 回归护栏
// - 硬保证：token.scss 已定义 B 所需的全部令牌（CSS 变量形态）。
// - 回归护栏：源码 <style> 块与 .scss 的「裸值」残留数不得超过基线；
//   每完成一批迁移（B-2/B-3/B-4），对应计数应下降，届时下调 BASELINE 常量。
// 注意：只扫 CSS 上下文（<style> / .scss），JS 与内联 style 不能用 var()（SIcon 烘焙链路硬约束），不计入。
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'src');
const tokenScss = path.join(root, 'styles', 'token.scss');

// ---------- 基线（2026-10-16 首次扫描；迁移一批后下调） ----------
// B-2 灰阶色值→令牌后：裸 hex 1542→573（剩 573 为非映射色：品牌橙/绿/红、黑、杂灰等，待后续令牌化）
// 2026-10-25 B-2 收官：573→465（567→465，替换 102 处：灰阶/近黑/媒体黑/白 + 品牌精确等值附带）。
//   残留 465 = 彩色语义色（dist 绿/红/金 ~60 种）+ tint 浅彩底 38 处/15 种 + 超浅装饰灰 8 种
//   + 纸艺主题对(#2b2723/#fdfcf9) + 遮罩渐变(#08060a) + var() 兜底位 309+ + JS 侧默认值。
//   ⚠️ 已知盲区：create/templateSelect/App 三文件 script 区注释含 `<style>` 字样，
//   正则 span 吞进 script，计数含 ~20 个 JS hex（themeColor 兜底 #165dff 等）——
//   属「多算」方向（护栏偏保守），暂不改扫描语义，后续单独修。
const BASELINE = {
  // 2026-10-22：574（573→574 有意 +1：a64da993 名片装修五项反馈 #275-#280 落地时新增的
  // 组件图标底色一处，提交时未同步基线 → 本次一并补齐护栏）
  // 2026-10-25 B-2：465（见上方注释）
  hex: 465,
  rgba: 288, // B-2/B-3/B-4 后 275；2026-10-16 视觉得分修（方案A 浅底彩图标）有意 +6：分销四图标 tint 底×4、会员徽章白底/细边框×2；2026-10-22 视频号链接调用有意 +8：默认封面斜向光影渐变×2（videosEdit/cardDetail 同款）、播放键白 0.92×1、选中/解析底 0.04×2；2026-10-22 反馈 #297/#298 语音历史弹层与链接选择器改用 --bg-mask/--white 令牌（-1）
  fontKinds: 74,
  radiusKinds: 73,
  shadowKinds: 46,
  zKinds: 27, // 2026-10-21 myCard 二维码/海报弹层有意 +1：var(--z-popup)（mask 与 sheet 同层靠 DOM 顺序）
};

// ---------- 令牌定义硬保证 ----------
const REQUIRED_VARS = [
  '--white', '--decor', '--decor-2', '--bg-card-2', '--media-bg',
  '--radius-xs', '--radius-pill',
  '--space-r1', '--space-r2', '--space-r3', '--space-r4', '--space-r5', '--space-r6',
  '--fs-1', '--fs-2', '--fs-3', '--fs-4', '--fs-5', '--fs-6', '--fs-7', '--fs-8',
  '--shadow-xs', '--shadow-sm', '--shadow-md', '--focus-ring',
  '--z-base', '--z-content', '--z-sticky', '--z-nav', '--z-popup', '--z-toast',
  // 既有核心令牌（B-0 不得破坏）
  '--t1', '--t2', '--t3', '--primary', '--bg-card', '--border', '--card-shadow', '--card-radius',
];

describe('方案B·令牌定义硬保证', () => {
  const css = fs.readFileSync(tokenScss, 'utf8');
  for (const v of REQUIRED_VARS) {
    it(`token.scss 定义 ${v}`, () => {
      expect(css).toContain(v + ':');
    });
  }
});

// ---------- 裸值扫描 ----------
function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.vue$/.test(name)) {
      const c = fs.readFileSync(p, 'utf8');
      const m = c.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
      acc.push(...m.map((s) => s.replace(/<style[^>]*>/, '').replace(/<\/style>/, '')));
    } else if (/\.scss$/.test(name) && p !== tokenScss) {
      acc.push(fs.readFileSync(p, 'utf8'));
    }
  }
}

function clean(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/url\([^)]*\)/g, 'url()');
}

function tally(blocks, re) {
  const map = new Map();
  for (const b of blocks) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(b)) !== null) {
      const k = m[0].toLowerCase().replace(/\s+/g, ' ');
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return { total, kinds: map.size };
}

const blocks = [];
walk(root, blocks);
const cleaned = blocks.map(clean);

const hex = tally(cleaned, /#[0-9a-fA-F]{3,8}\b/g);
const rgba = tally(cleaned, /rgba?\([^)]*\)/g);
const fsz = tally(cleaned, /font-size\s*:\s*[^;]+/g);
const rad = tally(cleaned, /border-radius\s*:\s*[^;]+/g);
const sh = tally(cleaned, /box-shadow\s*:\s*[^;]+/g);
const zi = tally(cleaned, /z-index\s*:\s*[^;]+/g);

describe('方案B·裸值残留（进度 / 回归护栏）', () => {
  it('裸 hex 色值 ≤ 基线', () => {
    console.log(`[B进度] 裸hex: ${hex.total}处/${hex.kinds}种 (基线 ${BASELINE.hex})`);
    expect(hex.total).toBeLessThanOrEqual(BASELINE.hex);
  });
  it('rgba/rgb 写法 ≤ 基线', () => {
    console.log(`[B进度] rgba/rgb: ${rgba.total}处/${rgba.kinds}种 (基线 ${BASELINE.rgba})`);
    expect(rgba.total).toBeLessThanOrEqual(BASELINE.rgba);
  });
  it('font-size 写法种类 ≤ 基线', () => {
    console.log(`[B进度] font-size: ${fsz.kinds}种 (基线 ${BASELINE.fontKinds})`);
    expect(fsz.kinds).toBeLessThanOrEqual(BASELINE.fontKinds);
  });
  it('border-radius 写法种类 ≤ 基线', () => {
    console.log(`[B进度] border-radius: ${rad.kinds}种 (基线 ${BASELINE.radiusKinds})`);
    expect(rad.kinds).toBeLessThanOrEqual(BASELINE.radiusKinds);
  });
  it('box-shadow 写法种类 ≤ 基线', () => {
    console.log(`[B进度] box-shadow: ${sh.kinds}种 (基线 ${BASELINE.shadowKinds})`);
    expect(sh.kinds).toBeLessThanOrEqual(BASELINE.shadowKinds);
  });
  it('z-index 写法种类 ≤ 基线', () => {
    console.log(`[B进度] z-index: ${zi.kinds}种 (基线 ${BASELINE.zKinds})`);
    expect(zi.kinds).toBeLessThanOrEqual(BASELINE.zKinds);
  });
});
