/**
 * 设计中心核心服务（租户可视化装修）
 * 素材中心 / 系统风格 / 底部导航 / 系统模板 / 首页跳转 / 页面装修（拖拽编辑器+版本回滚）
 * 全部 tenant_id 租户隔离；素材引用追踪（被引用禁止删除）；页面发布乐观锁
 */
import { createHash } from 'node:crypto';

export const DESIGN_PREVIEW_SECRET = 'nuok-design-preview-secret-2026';

/**
 * 生成 C 端首页预览 URL（带一次性签名，30 分钟内有效，免登录）。
 * draft=true 生成草稿预览（preview=1，装修页「保存并预览」）；默认与真实首页一致（读发布版/同一缓存）。
 */
export function buildDesignPreviewUrl(tenantId, draft = false) {
  const exp = Math.floor(Date.now() / 1000) + 1800;
  const sig = createHash('sha256').update(`${tenantId}:${exp}:${DESIGN_PREVIEW_SECRET}`).digest('hex').slice(0, 32);
  // 预览统一读草稿(实时最新)：装修中显示最新草稿；发布后草稿=发布，与真实首页自然一致
  return `/card/?nc=preview#/pages/cardMain/home?preview=1&tid=${tenantId}&exp=${exp}&sig=${sig}`;
}

export function createDesignService(db) {
  const svc = {};

  // ============ 素材中心 ============

  /** 分类列表 */
  svc.listCategories = (tenantId) =>
    db.prepare('SELECT id, category_name, sort, created_at FROM material_category WHERE tenant_id = ? ORDER BY sort ASC, id ASC').all(tenantId);

  svc.saveCategory = (tenantId, { id, name }) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '分类名称不能为空' };
    if (id) {
      const c = db.prepare('SELECT id FROM material_category WHERE tenant_id = ? AND id = ?').get(tenantId, id);
      if (!c) return { ok: false, error: '分类不存在' };
      db.prepare('UPDATE material_category SET category_name = ? WHERE id = ? AND tenant_id = ?').run(n, id, tenantId);
      return { ok: true, id };
    }
    const dup = db.prepare('SELECT id FROM material_category WHERE tenant_id = ? AND category_name = ?').get(tenantId, n);
    if (dup) return { ok: false, error: '分类名称已存在' };
    const max = db.prepare('SELECT COALESCE(MAX(sort), 0) m FROM material_category WHERE tenant_id = ?').get(tenantId).m;
    const r = db.prepare('INSERT INTO material_category (tenant_id, category_name, sort) VALUES (?, ?, ?)').run(tenantId, n, max + 1);
    return { ok: true, id: Number(r.lastInsertRowid) };
  };

  svc.deleteCategory = (tenantId, id) => {
    const cnt = db.prepare('SELECT COUNT(*) n FROM material WHERE tenant_id = ? AND category_id = ?').get(tenantId, id).n;
    if (cnt > 0) return { ok: false, error: `分类下还有 ${cnt} 个素材，请先移出或删除` };
    db.prepare('DELETE FROM material_category WHERE tenant_id = ? AND id = ?').run(tenantId, id);
    return { ok: true };
  };

  /** 租户上传限制（总后台客户项目独立配置，默认图片 2MB / 视频 50MB） */
  svc.getUploadLimits = (tenantId) => {
    const row = db.prepare('SELECT config FROM projects WHERE id = ?').get(tenantId);
    let cfg = {};
    try { cfg = row?.config ? JSON.parse(row.config) : {}; } catch { cfg = {}; }
    return {
      maxImageSize: Math.max(1, Number(cfg.maxImageSize) || 2),   // MB
      maxVideoSize: Math.max(1, Number(cfg.maxVideoSize) || 50),  // MB
    };
  };

  /** 新增素材（上传后登记） */
  svc.addMaterial = (tenantId, { categoryId, fileName, fileUrl, fileSize, fileType }) => {
    const name = String(fileName || '素材').trim();
    if (!fileUrl) return { ok: false, error: '缺少素材地址' };
    const r = db.prepare('INSERT INTO material (tenant_id, category_id, file_name, file_url, file_size, file_type) VALUES (?, ?, ?, ?, ?, ?)')
      .run(tenantId, categoryId || null, name, fileUrl, Number(fileSize) || 0, String(fileType || '').toLowerCase());
    return { ok: true, id: Number(r.lastInsertRowid) };
  };

  /** 素材列表 */
  svc.listMaterials = (tenantId, { categoryId, keyword, dateFrom, dateTo, fileType, page, pageSize } = {}) => {
    const where = ['m.tenant_id = ?'];
    const params = [tenantId];
    if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)); }
    if (keyword) { where.push('m.file_name LIKE ?'); params.push(`%${keyword}%`); }
    if (fileType && fileType !== 'all') {
      if (fileType === 'image') where.push("m.file_type IN ('jpg','jpeg','png','gif','webp')");
      else if (fileType === 'video') where.push("m.file_type = 'mp4'");
      else { where.push('m.file_type = ?'); params.push(String(fileType)); }
    }
    if (dateFrom) { where.push("substr(m.created_at, 1, 10) >= ?"); params.push(String(dateFrom)); }
    if (dateTo) { where.push("substr(m.created_at, 1, 10) <= ?"); params.push(String(dateTo)); }
    const total = db.prepare(`SELECT COUNT(*) n FROM material m WHERE ${where.join(' AND ')}`).get(...params).n;
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
    const rows = db.prepare(`
      SELECT m.*, c.category_name,
        (SELECT COUNT(*) FROM material_ref r WHERE r.tenant_id = m.tenant_id AND r.material_id = m.id) ref_count
      FROM material m LEFT JOIN material_category c ON c.id = m.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY m.id DESC LIMIT ? OFFSET ?
    `).all(...params, ps, (p - 1) * ps);
    return { total, page: p, pageSize: ps, list: rows };
  };

  /** 引用校验：返回被引用的明细（refType/refId） */
  svc.checkMaterialRefs = (tenantId, id) =>
    db.prepare('SELECT ref_type, ref_id FROM material_ref WHERE tenant_id = ? AND material_id = ?').all(tenantId, id);

  svc.deleteMaterial = (tenantId, id) => {
    const m = db.prepare('SELECT id FROM material WHERE tenant_id = ? AND id = ?').get(tenantId, id);
    if (!m) return { ok: false, error: '素材不存在' };
    const ref = svc.checkMaterialRefs(tenantId, id);
    if (ref.length) {
      const types = { page: '页面', style: '系统风格', tab: '底部导航', template: '模板', home: '首页' };
      const names = [...new Set(ref.map((r) => types[r.ref_type] || r.ref_type))].join('、');
      return { ok: false, error: `该素材正被「${names}」引用，无法删除` };
    }
    db.prepare('DELETE FROM material WHERE tenant_id = ? AND id = ?').run(tenantId, id);
    return { ok: true };
  };

  svc.moveMaterial = (tenantId, ids, categoryId) => {
    const list = Array.isArray(ids) ? ids.map(Number) : [Number(ids)];
    if (!list.length) return { ok: false, error: '未选择素材' };
    const stmt = db.prepare('UPDATE material SET category_id = ? WHERE tenant_id = ? AND id = ?');
    let n = 0;
    for (const id of list) { n += stmt.run(categoryId || null, tenantId, id).changes; }
    return { ok: true, moved: n };
  };

  /** 引用关系（幂等登记/全量重建） */
  svc.addRef = (tenantId, materialId, refType, refId) => {
    if (!materialId || !refType) return;
    db.prepare('INSERT OR IGNORE INTO material_ref (tenant_id, material_id, ref_type, ref_id) VALUES (?, ?, ?, ?)').run(tenantId, materialId, refType, refId);
  };
  svc.clearRefs = (tenantId, refType, refId) => {
    db.prepare('DELETE FROM material_ref WHERE tenant_id = ? AND ref_type = ? AND ref_id = ?').run(tenantId, refType, refId);
  };
  /** 从设计 JSON 中提取素材 id 列表（组件 image/icon/背景图字段） */
  svc.extractMaterialIds = (json) => {
    const ids = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      for (const [k, v] of Object.entries(node)) {
        if (k === 'materialId' && v) ids.push(Number(v));
        else if (typeof v === 'object' && v !== null) walk(v);
      }
    };
    walk(json);
    return [...new Set(ids)];
  };
  svc.syncRefs = (tenantId, refType, refId, designJson) => {
    svc.clearRefs(tenantId, refType, refId);
    const ids = svc.extractMaterialIds(designJson);
    for (const mid of ids) svc.addRef(tenantId, mid, refType, refId);
    return ids;
  };

  // ============ 系统风格 ============

  svc.getStyle = (tenantId) => {
    const row = db.prepare('SELECT style_json FROM tenant_style_config WHERE tenant_id = ?').get(tenantId);
    let style = {};
    try { style = row ? JSON.parse(row.style_json) : {}; } catch { style = {}; }
    return style;
  };

  svc.saveStyle = (tenantId, style) => {
    const json = JSON.stringify(style || {});
    db.prepare(`
      INSERT INTO tenant_style_config (tenant_id, style_json) VALUES (?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET style_json = excluded.style_json, updated_at = datetime('now')
    `).run(tenantId, json);
    // 风格中的素材引用（背景图等）
    svc.syncRefs(tenantId, 'style', tenantId, style || {});
    return { ok: true };
  };

  // ============ 底部导航 ============

  svc.listTabSchemes = (tenantId) =>
    db.prepare('SELECT id, scheme_name, tab_json, is_default, enabled, created_at, updated_at FROM tenant_tab_scheme WHERE tenant_id = ? ORDER BY is_default DESC, id ASC').all(tenantId);

  /** 新增/编辑 合并接口 */
  svc.saveTabScheme = (tenantId, { id, name, tabJson, enabled }) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '方案名称不能为空' };
    const json = JSON.stringify(tabJson || []);
    if (id) {
      const s = db.prepare('SELECT id FROM tenant_tab_scheme WHERE tenant_id = ? AND id = ?').get(tenantId, id);
      if (!s) return { ok: false, error: '方案不存在' };
      db.prepare("UPDATE tenant_tab_scheme SET scheme_name = ?, tab_json = ?, enabled = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .run(n, json, enabled === undefined ? 1 : (enabled ? 1 : 0), id, tenantId);
      svc.syncRefs(tenantId, 'tab', id, tabJson || []);
      return { ok: true, id };
    }
    const r = db.prepare('INSERT INTO tenant_tab_scheme (tenant_id, scheme_name, tab_json, is_default, enabled) VALUES (?, ?, ?, 0, 1)').run(tenantId, n, json);
    const nid = Number(r.lastInsertRowid);
    // 首个方案自动设为默认
    const cnt = db.prepare('SELECT COUNT(*) n FROM tenant_tab_scheme WHERE tenant_id = ?').get(tenantId).n;
    if (cnt === 1) svc.setDefaultTabScheme(tenantId, nid);
    svc.syncRefs(tenantId, 'tab', nid, tabJson || []);
    return { ok: true, id: nid };
  };

  svc.copyTabScheme = (tenantId, id) => {
    const s = db.prepare('SELECT * FROM tenant_tab_scheme WHERE tenant_id = ? AND id = ?').get(tenantId, id);
    if (!s) return { ok: false, error: '方案不存在' };
    const r = db.prepare("INSERT INTO tenant_tab_scheme (tenant_id, scheme_name, tab_json, is_default, enabled) VALUES (?, ?, ?, 0, 1)")
      .run(tenantId, `${s.scheme_name}（副本）`, s.tab_json);
    return { ok: true, id: Number(r.lastInsertRowid) };
  };

  svc.setDefaultTabScheme = (tenantId, id) => {
    const s = db.prepare('SELECT id FROM tenant_tab_scheme WHERE tenant_id = ? AND id = ?').get(tenantId, id);
    if (!s) return { ok: false, error: '方案不存在' };
    db.prepare('UPDATE tenant_tab_scheme SET is_default = 0 WHERE tenant_id = ?').run(tenantId);
    db.prepare("UPDATE tenant_tab_scheme SET is_default = 1, enabled = 1, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(id, tenantId);
    return { ok: true };
  };

  svc.deleteTabScheme = (tenantId, id) => {
    const s = db.prepare('SELECT is_default FROM tenant_tab_scheme WHERE tenant_id = ? AND id = ?').get(tenantId, id);
    if (!s) return { ok: false, error: '方案不存在' };
    if (s.is_default) return { ok: false, error: '默认导航方案不允许删除' };
    db.prepare('DELETE FROM tenant_tab_scheme WHERE tenant_id = ? AND id = ?').run(tenantId, id);
    db.prepare('DELETE FROM material_ref WHERE tenant_id = ? AND ref_type = ? AND ref_id = ?').run(tenantId, 'tab', id);
    return { ok: true };
  };

  // ============ 首页跳转 ============

  svc.getHomeConfig = (tenantId) => {
    const row = db.prepare('SELECT home_page FROM tenant_home_config WHERE tenant_id = ?').get(tenantId);
    return { homePage: row ? row.home_page : 'card' };
  };

  svc.saveHomeConfig = (tenantId, homePage) => {
    db.prepare(`
      INSERT INTO tenant_home_config (tenant_id, home_page) VALUES (?, ?)
      ON CONFLICT(tenant_id) DO UPDATE SET home_page = excluded.home_page, updated_at = datetime('now')
    `).run(tenantId, String(homePage || 'card'));
    return { ok: true };
  };

  // ============ 系统模板 ============

  svc.listTemplates = (tenantId, scope) => {
    if (scope === 'public') return db.prepare('SELECT id, template_name, cover_url, is_public, created_at FROM tenant_template WHERE is_public = 1 ORDER BY id DESC').all();
    if (scope === 'mine') return db.prepare('SELECT id, template_name, cover_url, is_public, created_at FROM tenant_template WHERE tenant_id = ? ORDER BY id DESC').all(tenantId);
    return db.prepare('SELECT id, template_name, cover_url, is_public, created_at FROM tenant_template WHERE tenant_id = ? OR is_public = 1 ORDER BY is_public DESC, id DESC').all(tenantId);
  };

  svc.getTemplate = (tenantId, id) => {
    const t = db.prepare('SELECT * FROM tenant_template WHERE id = ? AND (tenant_id = ? OR is_public = 1)').get(id, tenantId);
    if (!t) return null;
    try { t.template_json = JSON.parse(t.template_json); } catch { t.template_json = {}; }
    return t;
  };

  /** 另存为私有模板 */
  svc.saveTemplate = (tenantId, { name, coverUrl, templateJson, isPublic }) => {
    const n = String(name || '').trim();
    if (!n) return { ok: false, error: '模板名称不能为空' };
    const r = db.prepare('INSERT INTO tenant_template (tenant_id, template_name, cover_url, template_json, is_public) VALUES (?, ?, ?, ?, ?)')
      .run(tenantId, n, coverUrl || null, JSON.stringify(templateJson || {}), isPublic ? 1 : 0);
    return { ok: true, id: Number(r.lastInsertRowid) };
  };

  /** 导出模板 JSON（后端生成完整结构） */
  svc.exportTemplateJson = (tenantId, id) => {
    const t = svc.getTemplate(tenantId, id);
    if (!t) return { ok: false, error: '模板不存在' };
    return { ok: true, template_name: t.template_name, cover_url: t.cover_url, ...(t.template_json || {}) };
  };

  svc.deleteTemplate = (tenantId, id) => {
    const t = db.prepare('SELECT is_public FROM tenant_template WHERE id = ? AND tenant_id = ?').get(id, tenantId);
    if (!t) return { ok: false, error: '模板不存在或无权删除' };
    if (t.is_public) return { ok: false, error: '公共模板不允许删除' };
    db.prepare('DELETE FROM tenant_template WHERE id = ? AND tenant_id = ?').run(id, tenantId);
    db.prepare('DELETE FROM material_ref WHERE tenant_id = ? AND ref_type = ? AND ref_id = ?').run(tenantId, 'template', id);
    return { ok: true };
  };

  /** 应用模板：覆盖风格/首页/导航/页面，登记模板素材引用 */
  svc.applyTemplate = (tenantId, id) => {
    const t = svc.getTemplate(tenantId, id);
    if (!t) return { ok: false, error: '模板不存在' };
    const cfg = t.template_json || {};
    if (cfg.style) svc.saveStyle(tenantId, cfg.style);
    if (cfg.homePage) svc.saveHomeConfig(tenantId, cfg.homePage);
    if (cfg.tabs) {
      const tabs = Array.isArray(cfg.tabs) ? cfg.tabs : [cfg.tabs];
      for (const tItem of tabs) {
        const r = svc.saveTabScheme(tenantId, { name: tItem.name || '模板导航', tabJson: tItem.items || [] });
        if (r.ok) svc.setDefaultTabScheme(tenantId, r.id);
      }
    }
    const pages = cfg.pages || {};
    for (const [type, design] of Object.entries(pages)) {
      const names = { home: '首页', card: '名片详情页', dynamic: '个人动态页', mine: '个人中心' };
      const name = names[type] || type;
      const json = JSON.stringify(design || {});
      const exist = db.prepare("SELECT id FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 1").get(tenantId, type);
      if (exist) {
        db.prepare("UPDATE tenant_page_design SET design_json = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?").run(json, exist.id);
      } else {
        db.prepare("INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status, is_home) VALUES (?, ?, ?, ?, 1, 1, ?)").run(tenantId, type, name, json, type === 'home' ? 1 : 0);
      }
      // 同步草稿（status=0），保证「保存并预览」与实际启用首页一致（预览读草稿、线上读发布）
      const draft = db.prepare("SELECT id FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 0").get(tenantId, type);
      if (draft) {
        db.prepare("UPDATE tenant_page_design SET design_json = ?, page_name = ?, updated_at = datetime('now') WHERE id = ?").run(json, name, draft.id);
      } else {
        db.prepare("INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status, is_home) VALUES (?, ?, ?, ?, 1, 0, ?)").run(tenantId, type, name, json, type === 'home' ? 1 : 0);
      }
      svc.syncRefs(tenantId, 'page', type, design || {});
    }
    // 模板素材引用（封面等）
    svc.syncRefs(tenantId, 'template', id, cfg);
    return { ok: true };
  };

  /** 应用模板 → 新建页面：从模板提取页面内容创建全新页面，不覆盖现有风格/导航/首页/页面；重名自动加后缀 */
  svc.applyTemplateAsNew = (tenantId, id) => {
    const t = svc.getTemplate(tenantId, id);
    if (!t) return { ok: false, error: '模板不存在' };
    const cfg = t.template_json || {};
    const pages = cfg.pages || {};
    const entries = Object.entries(pages);
    if (!entries.length) return { ok: false, error: '该模板暂无页面内容，无法新建页面' };
    const [type, design] = entries[0];
    const baseName = String(t.template_name || '模板页面').trim() || '模板页面';
    let name = baseName;
    let suffix = 2;
    while (db.prepare('SELECT id FROM tenant_page_design WHERE tenant_id = ? AND page_name = ?').get(tenantId, name)) {
      name = `${baseName}(${suffix++})`;
    }
    const newType = `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const json = JSON.stringify(design || {});
    // 发布 + 草稿双行（草稿供「保存并预览」，发布供线上），is_home=0 不抢占首页
    const rid = Number(db.prepare("INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status, is_home) VALUES (?, ?, ?, ?, 1, 1, 0)").run(tenantId, newType, name, json).lastInsertRowid);
    db.prepare("INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status, is_home) VALUES (?, ?, ?, ?, 1, 0, 0)").run(tenantId, newType, name, json);
    svc.syncRefs(tenantId, 'page', newType, design || {});
    svc.syncRefs(tenantId, 'template', id, cfg);
    return { ok: true, pageType: newType, id: rid, pageName: name };
  };

  // ============ 页面装修（草稿/发布/版本回滚，乐观锁） ============

  svc.listPageDesigns = (tenantId) =>
    db.prepare('SELECT id, page_type, page_name, version, status, is_home, sort_order, updated_at, design_json FROM tenant_page_design WHERE tenant_id = ? ORDER BY is_home DESC, sort_order ASC, id ASC').all(tenantId)
      .map((row) => {
        let meta = {};
        try { meta = (JSON.parse(row.design_json) || {}).meta || {}; } catch { meta = {}; }
        return {
          id: row.id, page_type: row.page_type, page_name: row.page_name,
          version: row.version, status: row.status, updated_at: row.updated_at,
          isHome: !!row.is_home, sortOrder: row.sort_order,
          headerType: (meta.header && meta.header.type) || 'official',
          passwordEnabled: !!(meta.theme && meta.theme.passwordEnabled),
          memberOnly: !!(meta.theme && meta.theme.memberOnly),
        };
      });

  /** 页面列表拖拽排序：pageTypes 为合并后的页面顺序（同 page_type 草稿/发布行同步更新 sort_order） */
  svc.sortPageDesigns = (tenantId, pageTypes) => {
    const list = Array.isArray(pageTypes) ? pageTypes.filter((t) => typeof t === 'string' && t.trim()) : [];
    if (!list.length) return { ok: false, error: '排序列表不能为空' };
    try {
      db.exec('BEGIN');
      list.forEach((pageType, i) => {
        db.prepare('UPDATE tenant_page_design SET sort_order = ? WHERE tenant_id = ? AND page_type = ?').run(i + 1, tenantId, pageType);
      });
      db.exec('COMMIT');
      return { ok: true };
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      return { ok: false, error: '保存排序失败：' + e.message };
    }
  };

  /** 获取页面（published=true 返回已发布，否则返回草稿） */
  svc.getPageDesign = (tenantId, pageType, published = false) => {
    const status = published ? 1 : 0;
    const row = db.prepare('SELECT * FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = ? ORDER BY version DESC LIMIT 1').get(tenantId, pageType, status);
    if (!row) return null;
    try { row.design_json = JSON.parse(row.design_json); } catch { row.design_json = {}; }
    return row;
  };

  /** 保存草稿（并发锁：baseVersion 不匹配时拒绝） */
  /** 草稿行首页标记跟随该页发布行（同页 pub+draft 保持 is_home 一致；该页无发布行时不动草稿行） */
  function syncHomeFlag(tenantId, pageType) {
    db.prepare("UPDATE tenant_page_design SET is_home = 1 WHERE tenant_id = ? AND page_type = ? AND status = 0 AND EXISTS (SELECT 1 FROM tenant_page_design t2 WHERE t2.tenant_id = ? AND t2.page_type = ? AND t2.status = 1 AND t2.is_home = 1)")
      .run(tenantId, pageType, tenantId, pageType);
  }

  svc.savePageDraft = (tenantId, pageType, pageName, designJson, baseVersion) => {
    const exist = db.prepare('SELECT * FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 0').get(tenantId, pageType);
    if (exist && baseVersion !== undefined && Number(baseVersion) !== exist.version) {
      return { ok: false, conflict: true, error: '页面已被其他成员修改，请刷新后重试', currentVersion: exist.version };
    }
    if (exist) {
      db.prepare("UPDATE tenant_page_design SET design_json = ?, page_name = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(designJson || {}), pageName || pageType, exist.id);
      svc.syncRefs(tenantId, 'page', pageType, designJson || {});
      syncHomeFlag(tenantId, pageType);
      return { ok: true, id: exist.id, published: false, version: exist.version };
    }
    const r = db.prepare('INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status, is_home) VALUES (?, ?, ?, ?, 1, 0, ?)')
      .run(tenantId, pageType, pageName || pageType, JSON.stringify(designJson || {}), pageType === 'home' ? 1 : 0);
    svc.syncRefs(tenantId, 'page', pageType, designJson || {});
    syncHomeFlag(tenantId, pageType);
    return { ok: true, id: Number(r.lastInsertRowid), published: false, version: 1 };
  };

  /** 发布（草稿→发布；发布前把当前发布版存入版本历史，仅保留最近3版） */
  svc.publishPage = (tenantId, pageType) => {
    const draft = db.prepare('SELECT * FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 0').get(tenantId, pageType);
    if (!draft) return { ok: false, error: '没有待发布的草稿' };
    const exist = db.prepare("SELECT * FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 1").get(tenantId, pageType);
    if (exist) {
      // 当前发布版入历史
      db.prepare('INSERT INTO tenant_page_version (tenant_id, page_type, version, design_json) VALUES (?, ?, ?, ?)')
        .run(tenantId, pageType, exist.version, exist.design_json);
      db.prepare("UPDATE tenant_page_design SET design_json = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?").run(draft.design_json, exist.id);
      db.prepare('DELETE FROM tenant_page_design WHERE id = ?').run(draft.id);
      const publishedVersion = exist.version + 1;
      svc.pruneVersions(tenantId, pageType);
      return { ok: true, published: true, version: publishedVersion };
    }
    db.prepare("UPDATE tenant_page_design SET status = 1, updated_at = datetime('now') WHERE id = ?").run(draft.id);
    svc.pruneVersions(tenantId, pageType);
    return { ok: true, published: true, version: draft.version };
  };

  /** 历史版本列表（最近 N 条） */
  svc.listPageVersions = (tenantId, pageType) =>
    db.prepare('SELECT id, version, created_at FROM tenant_page_version WHERE tenant_id = ? AND page_type = ? ORDER BY version DESC LIMIT 10').all(tenantId, pageType);

  /** 回滚到指定历史版本（生成新草稿） */
  svc.rollbackPage = (tenantId, pageType, version) => {
    const v = db.prepare('SELECT design_json FROM tenant_page_version WHERE tenant_id = ? AND page_type = ? AND version = ?').get(tenantId, pageType, version);
    if (!v) return { ok: false, error: '历史版本不存在' };
    const design = JSON.parse(v.design_json || '{}');
    const names = { home: '首页', card: '名片详情页', dynamic: '个人动态页', mine: '个人中心' };
    return svc.savePageDraft(tenantId, pageType, names[pageType] || pageType, design);
  };

  /** 只保留最近3个历史版本 */
  svc.pruneVersions = (tenantId, pageType) => {
    const rows = db.prepare('SELECT id FROM tenant_page_version WHERE tenant_id = ? AND page_type = ? ORDER BY version DESC LIMIT -1 OFFSET 3').all(tenantId, pageType);
    const del = db.prepare('DELETE FROM tenant_page_version WHERE id = ?');
    for (const r of rows) del.run(r.id);
  };

  // ============ 全局配置（启动页广告 / 头部设置·全局部分） ============

  svc.getGlobal = (tenantId) => {
    const row = db.prepare('SELECT config_json FROM tenant_design_global WHERE tenant_id = ?').get(tenantId);
    if (!row) return { ok: true, config: {} };
    try { return { ok: true, config: JSON.parse(row.config_json || '{}') }; } catch { return { ok: true, config: {} }; }
  };

  svc.saveGlobal = (tenantId, config = {}) => {
    const json = JSON.stringify(config || {});
    const exist = db.prepare('SELECT id FROM tenant_design_global WHERE tenant_id = ?').get(tenantId);
    if (exist) db.prepare("UPDATE tenant_design_global SET config_json = ?, updated_at = datetime('now') WHERE id = ?").run(json, exist.id);
    else db.prepare('INSERT INTO tenant_design_global (tenant_id, config_json) VALUES (?, ?)').run(tenantId, json);
    return { ok: true };
  };

  // ============ 页面管理（重命名 / 删除 / 复制 / 新建） ============

  svc.renamePage = (tenantId, pageType, pageName) => {
    const name = String(pageName || '').trim();
    if (!name) return { ok: false, error: '页面名称不能为空' };
    const exist = db.prepare('SELECT id FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 1').get(tenantId, pageType);
    if (exist) db.prepare("UPDATE tenant_page_design SET page_name = ?, updated_at = datetime('now') WHERE id = ?").run(name, exist.id);
    const draft = db.prepare('SELECT id FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 0').get(tenantId, pageType);
    if (draft) db.prepare("UPDATE tenant_page_design SET page_name = ?, updated_at = datetime('now') WHERE id = ?").run(name, draft.id);
    return { ok: true };
  };

  svc.deletePage = (tenantId, pageType) => {
    const builtin = ['home', 'card', 'dynamic', 'mine'];
    if (builtin.includes(pageType)) return { ok: false, error: '内置页面（首页/名片详情/个人动态/个人中心）不可删除' };
    const home = db.prepare('SELECT id FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND is_home = 1').get(tenantId, pageType);
    if (home) return { ok: false, error: '当前页面为首页，请先切换首页后再删除' };
    db.prepare('DELETE FROM tenant_page_design WHERE tenant_id = ? AND page_type = ?').run(tenantId, pageType);
    db.prepare('DELETE FROM tenant_page_version WHERE tenant_id = ? AND page_type = ?').run(tenantId, pageType);
    return { ok: true };
  };

  svc.copyPage = (tenantId, pageType) => {
    const src = db.prepare("SELECT * FROM tenant_page_design WHERE tenant_id = ? AND page_type = ? AND status = 1 ORDER BY version DESC LIMIT 1").get(tenantId, pageType);
    if (!src) return { ok: false, error: '源页面不存在' };
    const newType = `custom-${Date.now()}`;
    const design = JSON.parse(src.design_json || '{}');
    const r = db.prepare('INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status) VALUES (?, ?, ?, ?, 1, 1)')
      .run(tenantId, newType, `${src.page_name} 副本`, JSON.stringify(design));
    svc.syncRefs(tenantId, 'page', newType, design);
    return { ok: true, pageType: newType, id: Number(r.lastInsertRowid) };
  };

  svc.createPage = (tenantId, pageName) => {
    const name = String(pageName || '').trim() || '新建页面';
    const newType = `custom-${Date.now()}`;
    const r = db.prepare('INSERT INTO tenant_page_design (tenant_id, page_type, page_name, design_json, version, status) VALUES (?, ?, ?, ?, 1, 1)')
      .run(tenantId, newType, name, JSON.stringify({ components: [] }));
    return { ok: true, pageType: newType, id: Number(r.lastInsertRowid) };
  };

  /** 设置首页：本租户全部置 0 → 目标页置 1（与云菜鸟 setindex 逻辑一致） */
  svc.setHomePage = (tenantId, pageId) => {
    const id = Number(pageId);
    if (!id) return { ok: false, error: '缺少页面 ID' };
    const exist = db.prepare('SELECT id FROM tenant_page_design WHERE tenant_id = ? AND id = ?').get(tenantId, id);
    if (!exist) return { ok: false, error: '页面不存在' };
    db.exec('BEGIN');
    try {
      // 页面级首页标记：目标页的全部行（发布+草稿）都置为首页，其余页全部取消
      db.prepare('UPDATE tenant_page_design SET is_home = 0 WHERE tenant_id = ?').run(tenantId);
      db.prepare("UPDATE tenant_page_design SET is_home = 1, updated_at = datetime('now') WHERE tenant_id = ? AND page_type = (SELECT page_type FROM tenant_page_design WHERE id = ?)").run(tenantId, id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return { ok: true, id };
  };

  return svc;
}
