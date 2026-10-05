/**
 * 设计中心租户路由
 * - /api/design/page/*      页面装修（草稿/发布/版本/回滚）
 * - /api/design/style/*     系统风格
 * - /api/design/tab/*       底部导航
 * - /api/design/template/*  系统模板（市场/私有/应用/导出/导入）
 * - /api/design/home        首页跳转
 * - /api/design/plans       全景方案只读列表（链接选择器；按 tenant 隔离）
 * - /api/material/*         素材中心（分类/上传/列表/移动/删除/引用校验）
 * 全部要求租户登录；写操作要求租户管理员；统一携带 tenant_id 隔离
 */
import { Router } from 'express';
import multer from 'multer';
import { createDesignService, buildDesignPreviewUrl } from '../services/design.js';
import { tenantState } from '../tenant.js';
import { getStorage } from '../storage/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 单文件上限 50MB（视频）
});

const IMG_WHITELIST = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_WHITELIST = ['video/mp4'];
const IMG_EXT_RE = /\.(gif|jpe?g|png|webp)$/i;

/** MIME → 扩展名（缺扩展名时用于补全存储 key） */
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
};

/**
 * 补全文件名的扩展名。
 *
 * 背景：上传的 originalname 常常没有扩展名（前端拼的 filename 丢失后缀），
 * 存储 key 变成 `...-400` 这类无扩展名文件。此时 `express.static` 无法推断
 * MIME，`Content-Type` 回落成 `application/octet-stream`，
 * 而**微信小程序 `<image>` 只接受合法图片 MIME** → 真机不显示（开发者工具可能侥幸显示）。
 * 故按已知 MIME 补后缀；MIME 也不认识时按内容嗅探兜底。
 */
function ensureExtension(filename, mimetype, buffer) {
  const name = String(filename || '').replace(/[^\w.\-]/g, '_');
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  let ext = MIME_EXT[String(mimetype || '').toLowerCase().split(';')[0]];
  if (!ext && buffer && buffer.length >= 12) {
    // PNG: 89 50 4E 47 | JPEG: FF D8 FF | GIF: 47 49 46 38 | WEBP: RIFF....WEBP
    const b = buffer;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ext = '.png';
    else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = '.jpg';
    else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) ext = '.gif';
    else if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') ext = '.webp';
  }
  return name + (ext || '');
}

/** 校验图片体积（按租户配置，单位 MB） */
function checkImgSize(buffer, maxMb) {
  const max = maxMb * 1024 * 1024;
  if (buffer.length > max) return { ok: false, error: `图片大小不能超过 ${maxMb}MB` };
  return { ok: true };
}

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
    res.set('Cache-Control', 'no-store');
    const data = svc.listMaterials(req.customerId, {
      categoryId: req.query.categoryId, keyword: req.query.keyword,
      dateFrom: req.query.dateFrom, dateTo: req.query.dateTo, fileType: req.query.fileType,
      page: req.query.page, pageSize: req.query.pageSize,
    });
    res.json({ ...data, limits: svc.getUploadLimits(req.customerId) });
  });

  material.post('/upload', tenant, tenantAdmin, (req, res) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? '素材大小不能超过 50MB' : err.message;
        return res.status(400).json({ error: message });
      }
      if (!req.file) return res.status(400).json({ error: '未收到文件' });
      const limits = svc.getUploadLimits(req.customerId);
      const mt = req.file.mimetype;
      if (IMG_WHITELIST.includes(mt)) {
        const chk = checkImgSize(req.file.buffer, limits.maxImageSize);
        if (!chk.ok) return res.status(400).json({ error: chk.error });
      } else if (VIDEO_WHITELIST.includes(mt)) {
        if (req.file.size > limits.maxVideoSize * 1024 * 1024) return res.status(400).json({ error: `视频大小不能超过 ${limits.maxVideoSize}MB` });
      } else {
        return res.status(400).json({ error: '仅支持 jpg / png / gif / webp 图片与 mp4 视频' });
      }
      try {
        const storage = await getStorage(db);
        const key = `material/${req.customerId}/${Date.now()}-${ensureExtension(req.file.originalname, mt, req.file.buffer)}`;
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

  // 网络提取：粘贴图片 URL 下载入库（大小/格式按租户限制校验）
  material.post('/import', tenant, tenantAdmin, async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: '图片地址需以 http:// 或 https:// 开头' });
    const limits = svc.getUploadLimits(req.customerId);
    try {
      const resp = await fetch(url, {
        redirect: 'follow', signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nuok-designer/1.0)' },
      });
      if (!resp.ok) return res.status(400).json({ error: `提取失败：目标地址返回 ${resp.status}` });
      const ctype = String(resp.headers.get('content-type') || '').toLowerCase().split(';')[0];
      const buf = Buffer.from(await resp.arrayBuffer());
      const isImg = IMG_WHITELIST.includes(ctype) || IMG_EXT_RE.test(url);
      const isVid = VIDEO_WHITELIST.includes(ctype) || /\.mp4(\?|$)/i.test(url);
      if (!isImg && !isVid) return res.status(400).json({ error: '仅支持 gif / jpg / png / webp 图片与 mp4 视频' });
      if (isVid && buf.length > limits.maxVideoSize * 1024 * 1024) return res.status(400).json({ error: `视频大小不能超过 ${limits.maxVideoSize}MB` });
      if (isImg) {
        const chk = checkImgSize(buf, limits.maxImageSize);
        if (!chk.ok) return res.status(400).json({ error: chk.error });
      }
    const storage = await getStorage(db);
      // 网络 URL 常常没有可用的文件名（无扩展名 / 无文件名），统一用 ensureExtension 补全
      const rawName = decodeURIComponent(url.split('/').pop() || '').replace(/[^\w.\-]/g, '_');
      const name = rawName && rawName !== '_' ? rawName : `net-${Date.now()}`;
      const key = `material/${req.customerId}/${Date.now()}-${ensureExtension(name, ctype, buf)}`;
      const fileUrl = await storage.put(buf, key);
      const type = isVid ? 'mp4' : (ctype.split('/')[1] || (IMG_EXT_RE.exec(url) ? IMG_EXT_RE.exec(url)[1].replace('jpeg', 'jpg') : 'jpg'));
      const r = svc.addMaterial(req.customerId, {
        categoryId: req.body?.categoryId || null, fileName: name,
        fileUrl, fileSize: buf.length, fileType: type,
      });
      if (!r.ok) return res.status(400).json({ error: r.error });
      audit(db, req, 'create_material', 'material', r.id, `网络提取素材: ${url}`);
      res.status(201).json({ ok: true, id: r.id, url: fileUrl });
    } catch (e) {
      console.error('网络提取失败:', e);
      res.status(400).json({ error: '提取失败：地址不可访问或请求超时' });
    }
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
  design.post('/page/rename', tenant, tenantAdmin, (req, res) => {
    const r = svc.renamePage(req.customerId, req.body?.pageType, req.body?.pageName);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });
  design.post('/page/sort', tenant, tenantAdmin, (req, res) => {
    const r = svc.sortPageDesigns(req.customerId, req.body?.pageTypes);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json({ ok: true });
  });
  design.post('/page/delete', tenant, tenantAdmin, (req, res) => {
    const r = svc.deletePage(req.customerId, req.body?.pageType);
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'delete_page', 'tenant_page_design', req.customerId, `删除页面: ${req.body?.pageType}`);
    res.json({ ok: true });
  });
  design.post('/page/copy', tenant, tenantAdmin, (req, res) => {
    const r = svc.copyPage(req.customerId, req.body?.pageType);
    if (!r.ok) return res.status(400).json({ error: r.error });
    res.json(r);
  });
  design.post('/page/create', tenant, tenantAdmin, (req, res) => {
    const r = svc.createPage(req.customerId, req.body?.pageName);
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'create_page', 'tenant_page_design', r.id, `新建页面: ${req.body?.pageName || '新建页面'}`);
    res.json(r);
  });
  design.post('/page/setHome', tenant, tenantAdmin, (req, res) => {
    const r = svc.setHomePage(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'set_home_page', 'tenant_page_design', Number(req.body?.id), '切换首页');
    res.json({ ok: true });
  });

  // ---- 全局配置（启动页广告 / 全局设置） ----
  design.get('/global/get', tenant, (req, res) => res.json(svc.getGlobal(req.customerId)));
  design.post('/global/save', tenant, tenantAdmin, (req, res) => {
    const r = svc.saveGlobal(req.customerId, req.body?.config || {});
    audit(db, req, 'save_design_global', 'tenant_design_global', req.customerId, '保存全局配置（启动页/全局设置）');
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
  design.get('/template/publicList', tenant, (req, res) => res.json({ list: svc.listTemplates(req.customerId, 'public', req.query?.category) }));
  design.get('/template/myList', tenant, (req, res) => res.json({ list: svc.listTemplates(req.customerId, 'mine', req.query?.category) }));
  design.post('/template/apply', tenant, tenantAdmin, (req, res) => {
    const r = svc.applyTemplate(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'apply_template', 'tenant_template', Number(req.body?.id), '应用模板');
    res.json(r);
  });
  design.post('/template/applyAsNew', tenant, tenantAdmin, (req, res) => {
    const r = svc.applyTemplateAsNew(req.customerId, Number(req.body?.id));
    if (!r.ok) return res.status(400).json({ error: r.error });
    audit(db, req, 'apply_template_as_new', 'tenant_template', Number(req.body?.id), '基于模板新建页面');
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
    // 兼容旧调用（{homePage:'x'} 单值）与新调用（{homePages:{card,panorama}} 按应用维度化）
    const body = req.body || {};
    const payload = body.homePages !== undefined ? body.homePages : body.homePage;
    const r = svc.saveHomeConfig(req.customerId, payload);
    res.json(r);
  });

  // ---- 全景方案（链接选择器用）----
  // 只读列表：按 tenant 隔离。公开的 GET /api/plans 不带客户过滤（跨客户），
  // 客户后台不能直接用，否则会把所有客户的方案都列出来。
  // 注意：projects 表用 id 直接当客户 id（user.customerId / req.customerId 对应的就是 projects.id），
  // 该表没有 customer_id 列，误写会直接 500。
  design.get('/plans', tenant, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const rows = db.prepare(
      `SELECT p.id, p.name, p.description, p.cover_path, p.published, p.share_enabled, p.sort_order,
              (SELECT COUNT(*) FROM scenes s WHERE s.plan_id = p.id AND s.published = 1) AS scene_count
         FROM plans p
         JOIN projects c ON c.id = p.project_id
        WHERE c.id = ?
        ORDER BY p.sort_order ASC, p.id ASC`
    ).all(req.customerId);
    res.json({
      plans: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        coverPath: r.cover_path,
        published: !!r.published,
        shareEnabled: !!r.share_enabled,
        sceneCount: r.scene_count,
      })),
    });
  });

  // ---- 首页预览 URL：默认生成与 C 端真实首页一致的一次性签名 URL（普通模式，读发布版/同缓存）；
  // ---- ?draft=1 时生成草稿预览 URL（preview=1，装修页「保存并预览」用）----
  design.get('/previewUrl', tenant, (req, res) => {
    // 预览必须与「设为首页(is_home)」的页面一致：查当前首页 pageType，再生成对应 C 端预览 URL
    const homeRow = db.prepare("SELECT page_type FROM tenant_page_design WHERE tenant_id = ? AND is_home = 1 ORDER BY id DESC LIMIT 1").get(req.customerId);
    // 编辑器画布（B1）会传入当前正在编辑的 pageType，保证 iframe 预览与编辑页一致
    const homePageType = String(req.query.pageType || '').trim() || homeRow?.page_type || 'home';
    res.json({ url: buildDesignPreviewUrl(req.customerId, String(req.query.draft) === '1', homePageType) });
  });

  return { material, design };
}
