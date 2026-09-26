// 门店商品模式解析服务（商城二期，2026-09-26）
// 由 store.price_mode / stock_mode / shelf_mode 驱动 goods_store 关系表生效：
//  - price_mode: unified 总部统一价 / custom 门店自定义价（goods_store.price，0=跟随总部）
//  - stock_mode: unified 总部统一库存 / independent 门店独立库存（goods_store.stock / sku_stock，-1=跟随总部）
//  - shelf_mode: unified 总部统一上下架 / store 门店独立上下架（goods_store.status=off → 门店不售）
// 生效点：下单（createOrder 按门店取价/库存/可售）、支付扣库存/退款回补、门店商品设置接口。
export function createStoreGoodsService(db) {
  const svc = {};

  function getStore(customerId, storeId) {
    return db.prepare('SELECT * FROM store WHERE id = ? AND customer_id = ? AND status = 1').get(Number(storeId), customerId);
  }

  function getRelation(customerId, goodsId, storeId) {
    return db.prepare('SELECT * FROM goods_store WHERE customer_id = ? AND goods_id = ? AND store_id = ?')
      .get(customerId, Number(goodsId), Number(storeId));
  }

  /** 门店可售判定：总部未上架 → 不可售；shelf_mode=store 时关系行 off → 门店不售（无关系行默认可售） */
  svc.isStoreSellable = ({ customerId, goodsId, storeId, goodsStatus = 'sell' }) => {
    const store = getStore(customerId, storeId);
    if (!store) return false;
    if (goodsStatus !== 'sell') return false;
    if (store.shelf_mode !== 'store') return true; // unified 跟随总部
    const rel = getRelation(customerId, goodsId, storeId);
    return !rel || rel.status !== 'off';
  };

  /** 门店价解析：custom 且关系行 price>0 → 门店价；否则跟随总部价（返回分） */
  svc.resolvePrice = ({ customerId, goodsId, storeId, basePrice }) => {
    const store = getStore(customerId, storeId);
    if (!store || store.price_mode !== 'custom') return { price: basePrice, priceMode: 'unified' };
    const rel = getRelation(customerId, goodsId, storeId);
    if (rel && Number(rel.price) > 0) return { price: Math.round(Number(rel.price) * 100), priceMode: 'custom' };
    return { price: basePrice, priceMode: 'unified' };
  };

  /** 门店库存解析：independent 且关系行有门店库存（>=0）→ 门店库存；否则跟随总部（单规格/多规格通用） */
  svc.resolveStock = ({ customerId, goodsId, storeId, baseStock, skuId = 0, baseSkuStock = 0 }) => {
    const store = getStore(customerId, storeId);
    if (!store || store.stock_mode !== 'independent') {
      return { stock: skuId ? baseSkuStock : baseStock, stockMode: 'unified' };
    }
    const rel = getRelation(customerId, goodsId, storeId);
    if (!rel) return { stock: skuId ? baseSkuStock : baseStock, stockMode: 'unified' };
    if (skuId) {
      let skuStock = {};
      try { skuStock = JSON.parse(rel.sku_stock || '{}'); } catch { skuStock = {}; }
      const v = skuStock[String(skuId)];
      const stock = v === undefined || Number(v) < 0 ? baseSkuStock : Number(v);
      return { stock, stockMode: 'independent' };
    }
    const stock = Number(rel.stock) < 0 ? baseStock : Number(rel.stock);
    return { stock, stockMode: 'independent' };
  };

  /** 门店库存扣减：返回 true=已扣门店库存（调用方无需扣总部）；false=跟随总部（调用方扣总部） */
  svc.deductStock = ({ customerId, goodsId, storeId, skuId = 0, num }) => {
    const store = getStore(customerId, storeId);
    if (!store || store.stock_mode !== 'independent') return false;
    const rel = getRelation(customerId, goodsId, storeId);
    if (!rel) return false;
    if (skuId) {
      let skuStock = {};
      try { skuStock = JSON.parse(rel.sku_stock || '{}'); } catch { skuStock = {}; }
      const cur = skuStock[String(skuId)];
      if (cur === undefined || Number(cur) < 0) return false; // 该 SKU 跟随总部
      skuStock[String(skuId)] = Number(cur) - num;
      db.prepare("UPDATE goods_store SET sku_stock = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(skuStock), rel.id);
      return true;
    }
    if (Number(rel.stock) < 0) return false;
    db.prepare("UPDATE goods_store SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?").run(num, rel.id);
    return true;
  };

  /** 门店库存回补（退款）：与 deductStock 对称，返回 true=已回补门店库存 */
  svc.restoreStock = ({ customerId, goodsId, storeId, skuId = 0, num }) => {
    const store = getStore(customerId, storeId);
    if (!store || store.stock_mode !== 'independent') return false;
    const rel = getRelation(customerId, goodsId, storeId);
    if (!rel) return false;
    if (skuId) {
      let skuStock = {};
      try { skuStock = JSON.parse(rel.sku_stock || '{}'); } catch { skuStock = {}; }
      const cur = skuStock[String(skuId)];
      if (cur === undefined || Number(cur) < 0) return false;
      skuStock[String(skuId)] = Number(cur) + num;
      db.prepare("UPDATE goods_store SET sku_stock = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(skuStock), rel.id);
      return true;
    }
    if (Number(rel.stock) < 0) return false;
    db.prepare("UPDATE goods_store SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(num, rel.id);
    return true;
  };

  return svc;
}
