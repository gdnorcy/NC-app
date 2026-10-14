import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 商城 mall 系列配色收敛回归锁（2026-10-15 全站配色审计 P1 第六批，收尾）。
// 范围：cart/detail/order-detail/checkout/index/orders 六页。
// ⚠️ 遵守「不动商城」的按钮规范决策（WeUI 方角/尺寸/结构一律不碰），
// 本批只改色值：CTA/激活态/指示器 → 主题。
//
// 保留（有据）：订单状态机语义色（order-detail hd-* 八态头图 + orders st-*
// 状态文字：pending 红/paid 琥珀/shipped 蓝/done 绿/closed 灰/refunding
// 琥珀/refunded 灰——与 customers 四态同款判定）；价格红 #f53f3f；
// 角标红；中性 #c9cdd4/#86909c/#4e5969/#1d2129/#f2f3f5/#f7f8fa/#e5e6eb。
//
// 锁：① 六页平台位全部主题；② 状态机/价格红/中性保留；
//     ③ detail 双 CTA 分层（add 次级/buy 主）；④ swiper prop 主题化。

const here = import.meta.url;
const read = (f) => readFileSync(fileURLToPath(new URL(`./${f}`, here)), 'utf8');

const CART = read('cart.vue');
const DETAIL = read('detail.vue');
const ORDER_DETAIL = read('order-detail.vue');
const CHECKOUT = read('checkout.vue');
const INDEX = read('index.vue');
const ORDERS = read('orders.vue');

function styleBlock(s) {
  const m = s.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}
function ruleBlock(s, sel) {
  const css = styleBlock(s);
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}');
  const m = css.match(re);
  return m ? m[0] : '';
}
function styleNoComments(s) {
  return styleBlock(s).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('mall 平台硬编码蓝清零（状态机语义位除外）', () => {
  // 订单状态机的「已发货=蓝」是有意保留的语义色（hd-shipped/st-shipped）
  const driftPages = [
    ['cart', CART, []],
    ['detail', DETAIL, []],
    ['order-detail', ORDER_DETAIL, ['.hd-shipped']],
    ['checkout', CHECKOUT, []],
    ['index', INDEX, []],
    ['orders', ORDERS, ['.st-shipped']],
  ];
  for (const [name, src, keep] of driftPages) {
    test(`${name} 禁 #165dff/#e8f3ff/#ffb400 硬编码（保留位与主题 fallback 除外）`, () => {
      const css = styleNoComments(src);
      // 坏行 = 命中硬编码色、且不是 var(--design-* 的 fallback 参数、且不在保留位
      const lines = css.split('\n').filter((l) => /#165dff|#e8f3ff|#ffb400/.test(l));
      const bad = lines.filter((l) => !l.includes('var(--design') && !keep.some((k) => l.includes(k)));
      expect(bad, `${name} 残留硬编码: ${bad.join(' | ')}`).toEqual([]);
    });
  }
});

describe('mall 平台 UI 强调位归主题', () => {
  test('cart：勾选/空态钮/结算钮主题', () => {
    expect(ruleBlock(CART, '.check.checked')).toContain('background: var(--design-primary); border-color: var(--design-primary);');
    expect(ruleBlock(CART, '.empty-btn')).toContain('background: var(--design-primary);');
    expect(ruleBlock(CART, '.settle-btn')).toContain('background: var(--design-primary);');
  });
  test('detail：swiper 指示器 prop 主题化', () => {
    expect(DETAIL).toContain(':indicator-active-color="themeColor"');
    expect(DETAIL).not.toContain('indicator-active-color="#165dff"');
  });
  test('detail：双 CTA 分层（add 次级样式 / buy 实底主题，唯一强 CTA）', () => {
    const add = ruleBlock(DETAIL, '.action-btn.add');
    expect(add).toContain('var(--design-secondary)');
    expect(add).toContain('var(--design-primary)');
    expect(ruleBlock(DETAIL, '.action-btn.buy')).toContain('background: var(--design-primary);');
  });
  test('detail：类型标签/SKU 选中主题', () => {
    expect(ruleBlock(DETAIL, '.type-tag')).toContain('rgba(var(--design-primary-rgb, 22, 93, 255), 0.08)');
    expect(ruleBlock(DETAIL, '.sku-option.active')).toContain('var(--design-primary, #165dff)');
  });
  test('order-detail：提货码/支付钮主题', () => {
    expect(ruleBlock(ORDER_DETAIL, '.code-value')).toContain('var(--design-primary, #165dff)');
    expect(ruleBlock(ORDER_DETAIL, '.mini-btn.pay')).toContain('var(--design-primary)');
  });
  test('checkout：配送选项/门店选中/提交钮/关闭链接主题', () => {
    expect(ruleBlock(CHECKOUT, '.delivery-option.active')).toContain('rgba(var(--design-primary-rgb, 22, 93, 255), 0.08)');
    expect(ruleBlock(CHECKOUT, '.store-item.active')).toContain('var(--design-primary)');
    expect(ruleBlock(CHECKOUT, '.submit-btn')).toContain('background: var(--design-primary);');
    expect(ruleBlock(CHECKOUT, '.panel-close')).toContain('var(--design-primary, #165dff)');
  });
  test('index：分类激活/排序激活主题', () => {
    expect(ruleBlock(INDEX, '.cate-item.active')).toContain('rgba(var(--design-primary-rgb, 22, 93, 255), 0.08)');
    expect(ruleBlock(INDEX, '.sort-item.active')).toContain('var(--design-primary, #165dff)');
  });
  test('orders：状态 Tab 激活/支付钮主题', () => {
    expect(ruleBlock(ORDERS, '.status-item.active')).toContain('var(--design-primary, #165dff)');
    expect(ruleBlock(ORDERS, '.mini-btn.pay')).toContain('var(--design-primary)');
  });
});

describe('mall 六页根视图绑 themeStyle', () => {
  const pages = [
    ['cart', CART, 'cart-page'],
    ['detail', DETAIL, 'detail-page'],
    ['order-detail', ORDER_DETAIL, 'order-detail-page'],
    ['checkout', CHECKOUT, 'checkout-page'],
    ['index', INDEX, 'mall-page'],
    ['orders', ORDERS, 'orders-page'],
  ];
  for (const [name, src, cls] of pages) {
    test(`${name} 根视图 :style="themeStyle"`, () => {
      expect(src).toMatch(new RegExp(`<view class="${cls}" :style="themeStyle">`));
      expect(src).toContain('const themeStyle = useDesignTheme();');
    });
  }
});

describe('mall 语义色与中性保留', () => {
  test('订单状态机八态保留（order-detail 头图）', () => {
    expect(ruleBlock(ORDER_DETAIL, '.hd-pending')).toContain('#f53f3f');
    expect(ruleBlock(ORDER_DETAIL, '.hd-paid')).toContain('#ff7d00');
    expect(ruleBlock(ORDER_DETAIL, '.hd-shipped')).toContain('#165dff');
    expect(ruleBlock(ORDER_DETAIL, '.hd-done')).toContain('#00b42a');
    expect(ruleBlock(ORDER_DETAIL, '.hd-closed')).toContain('#86909c');
    expect(ruleBlock(ORDER_DETAIL, '.hd-refunding')).toContain('#ff7d00');
    expect(ruleBlock(ORDER_DETAIL, '.hd-refunded')).toContain('#86909c');
  });
  test('订单状态文字保留（orders st-*）', () => {
    expect(ruleBlock(ORDERS, '.st-pending')).toContain('#f53f3f');
    expect(ruleBlock(ORDERS, '.st-paid')).toContain('#ff7d00');
    expect(ruleBlock(ORDERS, '.st-shipped')).toContain('#165dff');
    expect(ruleBlock(ORDERS, '.st-done')).toContain('#00b42a');
    expect(ruleBlock(ORDERS, '.st-closed')).toContain('#c9cdd4');
  });
  test('价格红 #f53f3f 保留（六页价格/角标/合计）', () => {
    for (const [name, src] of [['cart', CART], ['detail', DETAIL], ['order-detail', ORDER_DETAIL], ['checkout', CHECKOUT], ['index', INDEX], ['orders', ORDERS]]) {
      expect(src, `${name} 价格红应保留`).toContain('#f53f3f');
    }
  });
  test('中性承载保留（#c9cdd4/#86909c/#4e5969/#1d2129/#f2f3f5/#f7f8fa）', () => {
    for (const c of ['#c9cdd4', '#86909c', '#4e5969', '#1d2129', '#f2f3f5', '#f7f8fa']) {
      expect(CART, `中性色 ${c} 应保留`).toContain(c);
    }
  });
});
