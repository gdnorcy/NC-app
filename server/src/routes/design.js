/**
 * 设计中心租户路由
 * - /api/design/page/*      页面装修（草稿/发布/版本/回滚）
 * - /api/design/style/*     系统风格
 * - /api/design/tab/*       底部导航
 * - /api/design/template/*  系统模板（市场/私有/应用/导出/导入）
 * - /api/design/home        首页跳转
 * - /api/material/*         素材中心（分类/上传/列表/移动/删除/引用校验）
 * 全部要求租户登录；写操作要求租户管理员；统一携带 tenant_id 隔离
 */
import { Router } from 'express';
import { createHash } from 'node:crypto';
import multer from 'multer';
import { createDesignService } from '../services/design.js';
import { tenantState } from '../tenant.js';
import { getStorage } from '../storage/index.js';

// 与 card.js 一致的预览签名密钥
const PREVIEW_SECRET = 'nuok-design-preview-secret-2026';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 素材单文件上限 5MB
});

const IMG_WHITELIST = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function createDesignRouter(db, deps = {}) {
  const router = Router();
  const svc = createDesignService(db);
  const audit = deps.audit || (() => {});

  // 本地租户中间件（到期 allow 模式只读放行）
  function tenant(req, res, next) {
    const user = req.user;
    if (!user || !['tenant_admin', 'tenant_member'].includes(user.role)) {
      return res.status(403).json({ error: '无权访问客户后台' });
    }
    if (!user.customerId) return res.status(403).json({ error: '账号未关联客户项目' });
    const state = tenantState(db, user.customerId, { ctx: 'admin' });
    if (state.missing) return res.status(404).json({ error: '客户项目不存在' });
    if (!state.active) {
      if (state.readonly && req.method === 'GET') {
        req.customerId = user.customerId;
        req.tenantReadonly = true;
        return next();
      }
      return res.status(403).json({ error: state.reason });
    }
    req.customerId = user.customerId;
    next();
  }
  function tenantAdmin(req, res, next) {
    if (req.user?.role !== 'tenant_admin') return res.status(403).json({ error: '仅租户管理员可操作' });
    next();
  }

  // ==================== 素材中心 /api/material ====================
  const material = Router();

  material.get('/category/list', tenant, (req, res) => res.json({ list: svc.listCategories(req.customerId) }));
  material.post('/category/save', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveCategory(req.customerId, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true, id: r.id });
  });
  material.post('/category/delete', tenant, tenantAdmin, (req, res) => {
    const r = svc.deleteCategory(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'delete_material_category', 'material_category', Number(req.body?.id), '删除素材分类');
    res.json({ ok: true });
  });

  material.get('/list', tenant, (req, res) => {
    res.json(svc.listMaterials(req.customerId, {
      categoryId: req.query.categoryId, keyword: req.query.keyword,
      page: req.query.page, pageSize: req.query.pageSize,
    }));
  });

  material.post('/upload', tenant, tenantAdmin, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '素材大小不能超过 5MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      if (!IMG_WHITELIST.includes(req.file.mimetype)) {
        return res.status(400).json({ error: '仅支持 jpg / png / webp / gif 格式' });
      }
      try {
        const storage = await getStorage(db);
        const key = `material/${req.customerId}/${Date.now()}-${req.file.originalname.replace(/[^\w.\-]/g, '_')}`;
        const fileUrl = await storage.put(req.file.buffer, key);
        const r = svc.addMaterial(req.customerId, {
          categoryId: req.body?.categoryId, fileName: req.file.originalname,
          fileUrl, fileSize: req.file.size, fileType: req.file.mimetype.split('/')[1],
        });
        if (!r.ok) return res.status(400).json({ error: r.error });
        audit(db, req, 'create_material', 'material', r.id, `上传素材: ${req.file.originalname}`);
        res.status(201).json({ ok: true, id: r.id, url: fileUrl });
      } catch (e) {
        console.error('素材上传失败:', e);
        res.status(400).json({ error: '素材上传失败，请检查存储配置' });
      }
    });
  });

  material.post('/move', tenant, tenantAdmin, (req, res) => {
    const r = svc.moveMaterial(req.customerId, req.body?.ids, req.body?.categoryId);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });
  material.post('/delete', tenant, tenantAdmin, (req, res) => {
    const r = svc.deleteMaterial(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'delete_material', 'material', Number(req.body?.id), '删除素材');
    res.json({ ok: true });
  });
  material.get('/refCheck', tenant, (req, res) => {
    const refs = svc.checkMaterialRefs(req.customerId, Number(req.query.id));
    const types = { page: '页面', style: '系统风格', tab: '底部导航', template: '模板', home: '首页' };
    res.json({ refs, names: [...new Set(refs.map((r) => types[r.ref_type] || r.ref_type))] });
  });

  // ==================== 设计中心 /api/design ====================
  const design = Router();

  // ---- 页面装修 ----
  design.get('/page/list', tenant, (req, res) => res.json({ list: svc.listPageDesigns(req.customerId) }));
  design.get('/page/detail', tenant, (req, res) => {
    const pageType = req.query.pageType;
    if (!pageType) return res.status(400).json({ error: '缺少 pageType' });
    res.json({ page: svc.getPageDesign(req.customerId, pageType, req.query.published === '1') });
  });
  design.post('/page/saveDraft', tenant, tenantAdmin, (req, res) => {
    const r = svc.savePageDraft(req.customerId, req.body?.pageType, req.body?.pageName, req.body?.designJson, req.body?.baseVersion);
    if (!r.ok) {
      if (r.conflict) return res.status(409).json({ error: r.error, currentVersion: r.currentVersion });
      return res.status(400).json({ error: r.error });
    }
    res.json(r);
  });
  design.post('/page/publish', tenant, tenantAdmin, (req, res) => {
    const r = svc.publishPage(req.customerId, req.body?.pageType);
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'publish_page', 'tenant_page_design', req.customerId, `发布页面: ${req.body?.pageType}`);
    res.json(r);
  });
  design.get('/page/versionList', tenant, (req, res) => {
    res.json({ list: svc.listPageVersions(req.customerId, req.query.pageType) });
  });
  design.post('/page/rollback', tenant, tenantAdmin, (req, res) => {
    const r = svc.rollbackPage(req.customerId, req.body?.pageType, Number(req.body?.version));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'rollback_page', 'tenant_page_design', req.customerId, `回滚页面 ${req.body?.pageType} 到 v${req.body?.version}`);
    res.json(r);
  });

  // ---- 系统风格 ----
  design.get('/style/get', tenant, (req, res) => res.json({ style: svc.getStyle(req.customerId) }));
  design.post('/style/save', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveStyle(req.customerId, req.body?.style || {});
    audit(db, req, 'update_style', 'tenant_style_config', req.customerId, '更新系统风格');
    res.json(r);
  });

  // ---- 底部导航 ----
  design.get('/tab/list', tenant, (req, res) => res.json({ list: svc.listTabSchemes(req.customerId) }));
  design.post('/tab/save', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveTabScheme(req.customerId, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'save_tab_scheme', 'tenant_tab_scheme', r.id, `保存导航方案: ${req.body?.name}`);
    res.json({ ok: true, id: r.id });
  });
  design.post('/tab/copy', tenant, tenantAdmin, (req, res) => {
    const r = svc.copyTabScheme(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true, id: r.id });
  });
  design.post('/tab/delete', tenant, tenantAdmin, (req, res) => {
    const r = svc.deleteTabScheme(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'delete_tab_scheme', 'tenant_tab_scheme', Number(req.body?.id), '删除导航方案');
    res.json({ ok: true });
  });
  design.post('/tab/setDefault', tenant, tenantAdmin, (req, res) => {
    const r = svc.setDefaultTabScheme(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });

  // ---- 系统模板 ----
  design.get('/template/publicList', tenant, (req, res) => res.json({ list: svc.listTemplates(req.customerId, 'public') }));
  design.get('/template/myList', tenant, (req, res) => res.json({ list: svc.listTemplates(req.customerId, 'mine') }));
  design.post('/template/apply', tenant, tenantAdmin, (req, res) => {
    const r = svc.applyTemplate(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'apply_template', 'tenant_template', Number(req.body?.id), '应用模板');
    res.json(r);
  });
  design.post('/template/saveMy', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveTemplate(req.customerId, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'create_template', 'tenant_template', r.id, `另存模板: ${req.body?.name}`);
    res.json({ ok: true, id: r.id });
  });
  design.post('/template/export', tenant, (req, res) => {
    const r = svc.exportTemplateJson(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });
  design.post('/template/import', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveTemplate(req.customerId, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'import_template', 'tenant_template', r.id, `导入模板: ${req.body?.name}`);
    res.json({ ok: true, id: r.id });
  });
  design.post('/template/delete', tenant, tenantAdmin, (req, res) => {
    const r = svc.deleteTemplate(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });

  // ---- 首页跳转 ----
  design.get('/home/get', tenant, (req, res) => res.json(svc.getHomeConfig(req.customerId)));
  design.post('/home/save', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveHomeConfig(req.customerId, req.body?.homePage);
    res.json(r);
  });

  // ---- 保存并预览：生成带签名的一次性预览 URL（30 分钟内有效） ----
  design.get('/previewUrl', tenant, (req, res) => {
    const tid = req.customerId;
    const exp = Math.floor(Date.now() / 1000) + 1800;
    const sig = createHash('sha256').update(`${tid}:${exp}:${PREVIEW_SECRET}`).digest('hex').slice(0, 32);
    res.json({ url: `/card/?nc=preview#/pages/cardMain/home?preview=1&tid=${tid}&exp=${exp}&sig=${sig}` });
  });

  return { material, design };
}
