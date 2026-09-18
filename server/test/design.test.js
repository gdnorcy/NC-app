/**
 * 设计中心服务测试：素材/分类/引用追踪/风格/导航/模板/页面草稿-发布-版本回滚/租户隔离
 */
import { test, describe, before, after, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createDb } from '../src/db.js';
import { createDesignService, buildDesignPreviewUrl, DESIGN_PREVIEW_SECRET } from '../src/services/design.js';

describe('设计中心（素材/风格/导航/模板/页面装修）', () => {
  let db, svc;
  const DB_PATH = path.join(os.tmpdir(), `design-test-${Date.now()}.db`);
  const T1 = 8801; // 租户A
  const T2 = 8802; // 租户B

  before(() => {
    db = createDb(DB_PATH);
    svc = createDesignService(db);
  });
  after(() => {
    try { db.close(); } catch {}
    try { fs.rmSync(DB_PATH, { force: true }); } catch {}
  });

  // ============ 素材分类 ============
  it('P1 素材分类：新建/重名拒绝/改名/删除', () => {
    const r1 = svc.saveCategory(T1, { name: '名片背景' });
    assert.equal(r1.ok, true);
    const dup = svc.saveCategory(T1, { name: '名片背景' });
    assert.equal(dup.ok, false); // 重名拒绝
    const r2 = svc.saveCategory(T1, { name: '海报' });
    assert.ok(r2.ok);
    const list = svc.listCategories(T1);
    assert.equal(list.length, 2);
    const ren = svc.saveCategory(T1, { id: r1.id, name: '名片背景V2' });
    assert.equal(ren.ok, true);
    assert.equal(svc.listCategories(T1)[0].category_name, '名片背景V2');
  });

  it('P2 素材：新增/列表/分类移动/删除', () => {
    const cat = svc.listCategories(T1)[0];
    const m1 = svc.addMaterial(T1, { categoryId: cat.id, fileName: 'bg-a.jpg', fileUrl: '/uploads/a.jpg', fileSize: 1024, fileType: 'jpg' });
    assert.equal(m1.ok, true);
    svc.addMaterial(T1, { categoryId: null, fileName: 'poster.png', fileUrl: '/uploads/p.png', fileSize: 2048, fileType: 'png' });
    let list = svc.listMaterials(T1, {});
    assert.equal(list.total, 2);
    // 分类筛选
    list = svc.listMaterials(T1, { categoryId: cat.id });
    assert.equal(list.total, 1);
    // 关键词
    list = svc.listMaterials(T1, { keyword: 'poster' });
    assert.equal(list.total, 1);
    // 移动
    const mv = svc.moveMaterial(T1, [m1.id], null);
    assert.equal(mv.moved, 1);
    list = svc.listMaterials(T1, {});
    assert.equal(list.total, 2);
    // 删除（无引用可删）
    const del = svc.deleteMaterial(T1, m1.id);
    assert.equal(del.ok, true);
    list = svc.listMaterials(T1, {});
    assert.equal(list.total, 1);
  });

  it('P3 引用追踪：被页面引用素材禁止删除；引用明细可查', () => {
    const m = svc.addMaterial(T1, { fileName: 'used.png', fileUrl: '/uploads/used.png' });
    assert.ok(m.ok);
    // 页面设计引用该素材（materialId 字段在组件 JSON 内）
    const design = { components: [{ type: 'image', materialId: m.id, url: '/uploads/used.png' }] };
    svc.syncRefs(T1, 'page', 'home', design);
    const refs = svc.checkMaterialRefs(T1, m.id);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].ref_type, 'page');
    const del = svc.deleteMaterial(T1, m.id);
    assert.equal(del.ok, false); // 被引用禁止删除
    assert.match(del.error, /引用/);
    // 解除引用后可删
    svc.clearRefs(T1, 'page', 'home');
    assert.equal(svc.deleteMaterial(T1, m.id).ok, true);
  });

  it('P4 租户隔离：T2 看不到 T1 的分类/素材/模板；删除不影响', () => {
    assert.equal(svc.listCategories(T2).length, 0);
    assert.equal(svc.listMaterials(T2, {}).total, 0);
    // T2 删除 T1 的素材应失败（不存在）
    const m = svc.addMaterial(T2, { fileName: 't2.png', fileUrl: '/uploads/t2.png' });
    assert.ok(m.ok);
    const bad = svc.deleteMaterial(T1, m.id);
    assert.equal(bad.ok, false);
    assert.equal(svc.listMaterials(T1, {}).total, 1); // T1 只剩 poster.png，不受 T2 影响
  });

  // ============ 系统风格 ============
  it('P5 系统风格：保存/读取（含素材引用同步）', () => {
    const m = svc.addMaterial(T1, { fileName: 'bg.png', fileUrl: '/uploads/bg.png' });
    const style = { primaryColor: '#165DFF', radius: 8, bgImage: '/uploads/bg.png', materialId: m.id };
    assert.equal(svc.saveStyle(T1, style).ok, true);
    const got = svc.getStyle(T1);
    assert.equal(got.primaryColor, '#165DFF');
    assert.equal(svc.checkMaterialRefs(T1, m.id).length, 1); // 风格引用已登记
  });

  // ============ 底部导航 ============
  it('P6 底部导航：新建自动默认/编辑/复制/默认禁删/停用', () => {
    const r1 = svc.saveTabScheme(T1, { name: '主导航', tabJson: [{ text: '首页', url: '/pages/card/myCard' }] });
    assert.ok(r1.ok);
    // 首个方案自动默认
    let list = svc.listTabSchemes(T1);
    assert.equal(list.length, 1);
    assert.equal(list[0].is_default, 1);
    // 第二个方案不自动默认
    const r2 = svc.saveTabScheme(T1, { name: '备用导航', tabJson: [] });
    assert.ok(r2.ok);
    list = svc.listTabSchemes(T1);
    assert.equal(list.filter((x) => x.is_default === 1).length, 1);
    // 默认方案禁删
    assert.equal(svc.deleteTabScheme(T1, r1.id).ok, false);
    // 编辑
    const upd = svc.saveTabScheme(T1, { id: r2.id, name: '备用V2', tabJson: [{ text: '集市', url: '/pages/card/market' }] });
    assert.equal(upd.ok, true);
    assert.equal(svc.listTabSchemes(T1).find((x) => x.id === r2.id).scheme_name, '备用V2');
    // 复制
    const cp = svc.copyTabScheme(T1, r2.id);
    assert.ok(cp.ok);
    assert.equal(svc.listTabSchemes(T1).length, 3);
    // 非默认可删
    assert.equal(svc.deleteTabScheme(T1, cp.id).ok, true);
    // 设默认后原默认失去默认
    assert.equal(svc.setDefaultTabScheme(T1, r2.id).ok, true);
    const after = svc.listTabSchemes(T1);
    assert.equal(after.find((x) => x.id === r2.id).is_default, 1);
    assert.equal(after.find((x) => x.id === r1.id).is_default, 0);
  });

  // ============ 首页跳转 ============
  it('P7 首页跳转：按应用维度化（homePages 对象）+ 旧单值兼容', () => {
    assert.deepEqual(svc.getHomeConfig(T1).homePages, {});
    // 新调用：按应用存对象（card 智能名片 / panorama 360全景）
    assert.equal(svc.saveHomeConfig(T1, { card: '/pages/cardMain/home?pageType=home', panorama: '/pages/index/index' }).ok, true);
    let cfg = svc.getHomeConfig(T1);
    assert.equal(cfg.homePages.card, '/pages/cardMain/home?pageType=home');
    assert.equal(cfg.homePages.panorama, '/pages/index/index');
    // 兼容旧单值调用（字符串 → card 应用；旧 key 原样存，由 C 端/管理端映射）
    assert.equal(svc.saveHomeConfig(T1, 'market').ok, true);
    cfg = svc.getHomeConfig(T1);
    assert.equal(cfg.homePages.card, 'market');
    assert.equal(cfg.homePages.panorama, undefined); // 字符串调用只覆盖 card
    // 'card' = 该应用不跳转（展示 DIY 装修首页），不落库
    assert.equal(svc.saveHomeConfig(T1, { card: 'card', panorama: '/pages/viewer/viewer' }).ok, true);
    cfg = svc.getHomeConfig(T1);
    assert.equal(cfg.homePages.card, undefined);
    assert.equal(cfg.homePages.panorama, '/pages/viewer/viewer');
    // home_page 列与 homePages.card 同步（C 端旧字段兼容）
    const row = db.prepare('SELECT home_page FROM tenant_home_config WHERE tenant_id = ?').get(T1);
    assert.equal(row.home_page, 'card');
  });

  // ============ 系统模板 ============
  it('P8 模板：另存/市场与私有列表/导出/删除/应用覆盖', () => {
    const t = svc.saveTemplate(T1, { name: '商务风', templateJson: { style: { primaryColor: '#123456' }, homePage: 'card' } });
    assert.ok(t.ok);
    assert.equal(svc.listTemplates(T1, 'mine').length, 1);
    assert.equal(svc.listTemplates(T1, 'public').length, 0);
    const exp = svc.exportTemplateJson(T1, t.id);
    assert.equal(exp.style.primaryColor, '#123456');
    // 应用：覆盖风格
    assert.equal(svc.applyTemplate(T1, t.id).ok, true);
    assert.equal(svc.getStyle(T1).primaryColor, '#123456');
    // 公共模板：平台模板（tenant_id=0）对租户可见可应用
    const pubPages = { mine: { components: [{ id: 'x1', type: 'title', props: { text: '模板首页' } }] } };
    const pub = svc.saveTemplate(0, { name: '平台标准', templateJson: { style: { primaryColor: '#0AF' }, homePage: 'market', pages: pubPages }, isPublic: true });
    assert.ok(pub.ok);
    assert.equal(svc.listTemplates(T1, 'public').length, 1);
    assert.equal(svc.applyTemplate(T1, pub.id).ok, true);
    assert.equal(svc.getStyle(T1).primaryColor, '#0AF');
    // 应用模板须同步草稿与发布：预览（读草稿）与实际启用（读发布）一致
    const draftRow = svc.getPageDesign(T1, 'mine', false);
    const pubRow = svc.getPageDesign(T1, 'mine', true);
    assert.ok(draftRow && pubRow, '应用模板后应同时存在草稿与发布');
    assert.equal(JSON.stringify(draftRow.design_json), JSON.stringify(pubRow.design_json), '草稿与发布内容应一致');
    assert.ok(JSON.stringify(pubRow.design_json).includes('模板首页'), '发布内容应为模板组件');
    // 平台公共模板租户无权删除
    assert.equal(svc.deleteTemplate(T1, pub.id).ok, false);
  });

  it('P8.1 应用模板→新建页面：不覆盖现有页面/风格、名称重名后缀、无页面内容拒绝', () => {
    const before = svc.listPageDesigns(T1).length;
    const pubPages = { home: { components: [{ id: 'y1', type: 'title', props: { text: '模板新建页' } }] } };
    const pub = svc.saveTemplate(0, { name: '模板新建A', templateJson: { style: { primaryColor: '#BEE' }, pages: pubPages }, isPublic: true });
    assert.ok(pub.ok);
    const r = svc.applyTemplateAsNew(T1, pub.id);
    assert.ok(r.ok, '应成功基于模板新建页面');
    assert.equal(r.pageName, '模板新建A');
    assert.equal(svc.listPageDesigns(T1).length, before + 2, '应新增发布+草稿两条记录（前端按 page_type 合并显示为一个页面）');
    const created = svc.listPageDesigns(T1).find((p) => p.page_name === '模板新建A');
    assert.ok(created && !created.isHome, '新页面不应为首页');
    assert.ok(JSON.stringify(svc.getPageDesign(T1, r.pageType, true).design_json).includes('模板新建页'), '新页面内容应为模板组件');
    // 全局风格不被覆盖
    assert.notEqual(svc.getStyle(T1).primaryColor, '#BEE', '应用模板新建页面不应覆盖系统风格');
    // 重名自动加后缀
    const r2 = svc.applyTemplateAsNew(T1, pub.id);
    assert.ok(r2.ok && r2.pageName === '模板新建A(2)', '重名页面应加后缀');
    // 无页面内容模板拒绝
    const empty = svc.saveTemplate(0, { name: '空模板', templateJson: { style: {} }, isPublic: true });
    assert.equal(svc.applyTemplateAsNew(T1, empty.id).ok, false, '无页面内容的模板应拒绝新建');
  });

  // ============ 页面装修：草稿/发布/版本回滚 ============
  it('P9 页面草稿保存（含并发锁）', () => {
    const design1 = { components: [{ type: 'title', text: '欢迎' }] };
    const r1 = svc.savePageDraft(T1, 'home', '首页', design1, 1);
    assert.equal(r1.ok, true);
    assert.equal(r1.version, 1);
    // 并发冲突：baseVersion 不匹配
    const r2 = svc.savePageDraft(T1, 'home', '首页', { components: [] }, 99);
    assert.equal(r2.ok, false);
    assert.equal(r2.conflict, true);
    // 正确版本可保存
    const r3 = svc.savePageDraft(T1, 'home', '首页', { components: [{ type: 'title', text: '改1' }] }, r1.version);
    assert.equal(r3.ok, true);
  });

  it('P10 发布/历史版本/回滚（最近3版裁剪）', () => {
    // 发布 v1
    const p1 = svc.publishPage(T1, 'home');
    assert.equal(p1.published, true);
    assert.equal(p1.version, 1);
    // 改草稿 → 发布 v2（v1 入历史）
    svc.savePageDraft(T1, 'home', '首页', { components: [{ type: 'title', text: 'v2' }] }, 1);
    const p2 = svc.publishPage(T1, 'home');
    assert.equal(p2.version, 2);
    // 再改 → 发布 v3（历史 v1,v2）
    svc.savePageDraft(T1, 'home', '首页', { components: [{ type: 'title', text: 'v3' }] }, 2);
    const p3 = svc.publishPage(T1, 'home');
    assert.equal(p3.version, 3);
    // 再改 → 发布 v4（历史 v1,v2,v3，恰好 3 条不裁剪）
    svc.savePageDraft(T1, 'home', '首页', { components: [{ type: 'title', text: 'v4' }] }, 3);
    const p4 = svc.publishPage(T1, 'home');
    assert.equal(p4.version, 4);
    let versions = svc.listPageVersions(T1, 'home');
    assert.equal(versions.length, 3);
    // 再发布 v5：历史 v1..v4 → 裁剪 v1，保留最近 3（v2,v3,v4）
    svc.savePageDraft(T1, 'home', '首页', { components: [{ type: 'title', text: 'v5' }] }, 4);
    svc.publishPage(T1, 'home');
    versions = svc.listPageVersions(T1, 'home');
    assert.equal(versions.length, 3);
    assert.ok(!versions.some((v) => v.version === 1)); // v1 已裁剪
    assert.ok(versions.some((v) => v.version === 4));
    // 已发布数据
    const pub = svc.getPageDesign(T1, 'home', true);
    assert.equal(pub.version, 5);
    // 回滚到 v2：生成草稿
    const rb = svc.rollbackPage(T1, 'home', 2);
    assert.equal(rb.ok, true);
    const draft = svc.getPageDesign(T1, 'home', false);
    assert.equal(draft.design_json.components[0].text, 'v2');
  });

  it('P11 页面多类型隔离：card 与 home 互不影响', () => {
    svc.savePageDraft(T1, 'card', '名片详情页', { components: [{ type: 'image', materialId: 12345 }] });
    const home = svc.getPageDesign(T1, 'home', true);
    assert.ok(home);
    const cardDraft = svc.getPageDesign(T1, 'card', false);
    assert.ok(cardDraft);
    assert.notEqual(home.page_type, cardDraft.page_type);
  });

  it('P12 首页切换：setHomePage 标记唯一首页 + 列表返回 isHome + 删除首页保护', () => {
    // 迁移后 home 页自动 is_home=1
    let list = svc.listPageDesigns(T1);
    const homePage = list.find((p) => p.page_type === 'home');
    assert.ok(homePage);
    assert.equal(homePage.isHome, true);

    // 新建一个自定义页，默认非首页
    const created = svc.createPage(T1, '活动页');
    assert.equal(created.ok, true);
    list = svc.listPageDesigns(T1);
    const custom = list.find((p) => p.page_type === created.pageType);
    assert.ok(custom);
    assert.equal(custom.isHome, false);

    // 切首页：目标页全部行置 1，原 home 页全部行置 0（按页面唯一）
    const r = svc.setHomePage(T1, created.id);
    assert.equal(r.ok, true);
    list = svc.listPageDesigns(T1);
    const homePageTypes = new Set(list.filter((p) => p.isHome).map((p) => p.page_type));
    assert.equal(homePageTypes.size, 1);
    assert.equal(homePageTypes.has(created.pageType), true);
    assert.equal(list.find((p) => p.page_type === 'home').isHome, false);

    // 切回 home
    const back = svc.setHomePage(T1, homePage.id);
    assert.equal(back.ok, true);
    list = svc.listPageDesigns(T1);
    assert.equal(list.find((p) => p.id === homePage.id).isHome, true);

    // 缺失/不存在页面拒绝
    assert.equal(svc.setHomePage(T1, 0).ok, false);
    assert.equal(svc.setHomePage(T1, 999999).ok, false);

    // 删除首页保护：把 custom 设为首页后删除应被拒；切回后删除成功
    svc.setHomePage(T1, created.id);
    assert.equal(svc.deletePage(T1, created.pageType).ok, false);
    svc.setHomePage(T1, homePage.id);
    assert.equal(svc.deletePage(T1, created.pageType).ok, true);
  });

  it('P13 页面排序：sortPageDesigns 持久化 + listPageDesigns 按 sort_order 返回', () => {
    // 建两个自定义页（home 已存在），得到 page_type 集合
    const p1 = svc.createPage(T1, '排序页A');
    const p2 = svc.createPage(T1, '排序页B');
    assert.equal(p1.ok && p2.ok, true);
    const types = ['home', p1.pageType, p2.pageType];

    // 首页始终最前（is_home DESC 优先），其余按 sort_order
    const r = svc.sortPageDesigns(T1, types);
    assert.equal(r.ok, true);
    let list = svc.listPageDesigns(T1);
    let seq = [...new Set(list.map((x) => x.page_type))];
    assert.equal(seq[0], 'home');
    assert.equal(seq.indexOf(p1.pageType) < seq.indexOf(p2.pageType), true);

    // 倒序再排：p2 应排到 p1 前
    svc.sortPageDesigns(T1, ['home', p2.pageType, p1.pageType]);
    list = svc.listPageDesigns(T1);
    seq = [...new Set(list.map((x) => x.page_type))];
    assert.equal(seq.indexOf(p2.pageType) < seq.indexOf(p1.pageType), true);

    // 空列表拒绝
    assert.equal(svc.sortPageDesigns(T1, []).ok, false);

    // 同 page_type 草稿+发布行共享排序位（发布后仍保持一致顺序）
    const t = svc.savePageDraft(T1, p2.pageType, '排序页B-v2', { components: [] });
    assert.equal(t.ok, true);
    const pub = svc.publishPage(T1, p2.pageType);
    assert.equal(pub.ok, true);
    list = svc.listPageDesigns(T1);
    const rows = list.filter((x) => x.page_type === p2.pageType);
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].sortOrder > 0, true);
  });

  it('P14 首页预览 URL：统一读草稿实时最新（带 preview=1 触发免缓存+草稿），发布后与真实首页一致；签名可校验', () => {
    const url = buildDesignPreviewUrl(T1);
    assert.ok(url.includes(`tid=${T1}`), '应携带租户 ID');
    assert.ok(url.includes('preview=1'), '预览应带 preview=1（草稿实时，避免内容偏旧）');
    assert.match(url, /exp=\d+&sig=[0-9a-f]{32}/, '应携带有效签名参数');
    // 签名可复验
    const exp = Number(url.match(/exp=(\d+)/)[1]);
    const sig = url.match(/sig=([0-9a-f]{32})/)[1];
    const expect = createHash('sha256').update(`${T1}:${exp}:${DESIGN_PREVIEW_SECRET}`).digest('hex').slice(0, 32);
    assert.equal(sig, expect, '签名应与服务端一致');

    const draftUrl = buildDesignPreviewUrl(T1, true);
    assert.ok(draftUrl.includes('preview=1'), '草稿预览应带 preview=1');
    assert.ok(draftUrl.includes(`tid=${T1}`));
  });
});
