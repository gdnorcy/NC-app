import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 访客详情时间线圆点配色回归锁（2026-10-16，真机截图报修）：
// 「我的动态」圆点是 2026-10-14 四域收敛的漏网旧 9 彩紫（与首页人脉集市同源遗留，
// 见 gridDomainPalette 补漏锁）。我的动态属**关系域**，圆点取域起点 #0a9f8f。
// 其余圆点：view 跟主题色 var(--primary)；video 语义红；exchange 旧绿另案
// （名片交换按四域属身份域，待用户确认后同批收敛，不在本锁范围）。
//
// 锁：① 动态圆点=关系域起点；② 全文件零旧紫残留（含注释——故修复注释禁写旧 hex 字面量，
//    与 gridDomainPalette「零残留」锁同纪律）。

const here = import.meta.url;
const TIMELINE = fileURLToPath(new URL('./visitorTimeline.vue', here));
const src = readFileSync(TIMELINE, 'utf8');

// 剥离 CSS 注释后的样式文本（防注释里的历史说明误伤断言）
function styleNoComments(s) {
  const m = s.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1].replace(/\/\*[\s\S]*?\*\//g, '') : '';
}

describe('visitorTimeline 圆点配色', () => {
  test('动态圆点用关系域起点 #0a9f8f（禁收敛前旧紫）', () => {
    const dot = styleNoComments(src).match(/\.timeline-dot\.dynamic\s*\{[^}]*\}/);
    expect(dot, '.timeline-dot.dynamic 规则块应存在').not.toBeNull();
    expect(dot[0]).toContain('#0a9f8f');
  });
  test('全文件零旧紫残留（含注释）', () => {
    for (const bad of ['#722ed1', '#9254de']) {
      expect(src, `不得残留旧紫 ${bad}`).not.toContain(bad);
    }
  });
});
