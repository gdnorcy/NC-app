import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect, vi } from 'vitest';
import { pickPrimarySubject, findMarketItem, syncMarketWithIsPublic } from './utils/marketLink.js';

// 「公开到人脉集市」开关 ↔ 集市场上架记录联动回归（2026-10-15 真机报修）。
// 病根：displaySettings/create 的开关只写 card_profile.is_public（服务端仅 admin 客户列表消费），
// 从不建 card_market_items；myCard 集市状态 / market 列表只认 card_market_items →
// 「开关已开、toast 已公开到集市」但 myCard 永远显示「未上架」，两套体系永久不一致。
// 修法：开关就是集市场上架控制，is_public 降级为可见性派生 flag；两端共用 utils/marketLink.js。

const dsSrc = readFileSync(fileURLToPath(new URL('./displaySettings.vue', import.meta.url)), 'utf8');
const createSrc = readFileSync(fileURLToPath(new URL('./create.vue', import.meta.url)), 'utf8');
const myCardSrc = readFileSync(fileURLToPath(new URL('./myCard.vue', import.meta.url)), 'utf8');

// ===== 纯函数 =====
describe('pickPrimarySubject（主体解析，与 myCard activeSubject 同源）', () => {
  test('空/无 active → null', () => {
    expect(pickPrimarySubject([])).toBe(null);
    expect(pickPrimarySubject(null)).toBe(null);
    expect(pickPrimarySubject([{ subjectType: 'individual', status: 'pending' }])).toBe(null);
  });

  test('active 个体优先于员工（与 myCard 的 find(individual) || subs[0] 一致）', () => {
    const subs = [
      { subjectType: 'employee', subjectId: 9, status: 'active' },
      { subjectType: 'individual', subjectId: 3, status: 'active' },
    ];
    expect(pickPrimarySubject(subs)).toEqual({ subjectType: 'individual', subjectId: 3, status: 'active' });
  });

  test('无个体时回落首个 active', () => {
    const subs = [
      { subjectType: 'employee', subjectId: 9, status: 'active' },
      { subjectType: 'employee', subjectId: 10, status: 'active' },
    ];
    expect(pickPrimarySubject(subs)).toEqual({ subjectType: 'employee', subjectId: 9, status: 'active' });
  });

  test('null 条目防御（服务端脏数据不炸）', () => {
    expect(pickPrimarySubject([null, { subjectType: 'individual', subjectId: 1, status: 'active' }]))
      .toEqual({ subjectType: 'individual', subjectId: 1, status: 'active' });
  });
});

describe('findMarketItem（subjectType+subjectId 双匹配）', () => {
  const subject = { subjectType: 'individual', subjectId: 3 };

  test('subject 为空 → null', () => {
    expect(findMarketItem([{ subjectType: 'individual', subjectId: 3 }], null)).toBe(null);
  });

  test('双匹配才命中（防不同主体同 id 误配）', () => {
    const items = [
      { subjectType: 'employee', subjectId: 3 },
      { subjectType: 'individual', subjectId: 4 },
    ];
    expect(findMarketItem(items, subject)).toBe(null);
    expect(findMarketItem([...items, { subjectType: 'individual', subjectId: 3 }], subject))
      .toEqual({ subjectType: 'individual', subjectId: 3 });
  });

  test('null 条目防御', () => {
    expect(findMarketItem([null, { subjectType: 'individual', subjectId: 3 }], subject))
      .toEqual({ subjectType: 'individual', subjectId: 3 });
  });
});

// ===== 联动流程（fake api 精确镜像服务端 toggle 语义：建=带 auditStatus，删=不带） =====
function fakeApi({ subjects = [], items = [], toggleThrow = null } = {}) {
  const state = { items: [...items] };
  return {
    state,
    getMarketMyStatus: vi.fn(async () => ({ subjects, items: state.items })),
    toggleMarket: vi.fn(async (d) => {
      if (toggleThrow) throw new Error(toggleThrow);
      const idx = state.items.findIndex((it) => it.subjectType === d.subjectType && it.subjectId === d.subjectId);
      if (idx >= 0) {
        state.items.splice(idx, 1);
        return { success: true, inMarket: false };
      }
      state.items.push({ subjectType: d.subjectType, subjectId: d.subjectId });
      return { success: true, inMarket: true, auditStatus: 'approved' };
    }),
  };
}

const ACTIVE_IND = [{ subjectType: 'individual', subjectId: 3, status: 'active' }];

describe('syncMarketWithIsPublic（开关值 ⇔ 上架记录）', () => {
  test('开着但无记录 → 发起上架，changed=true，auditStatus 透传', async () => {
    const api = fakeApi({ subjects: ACTIVE_IND });
    const r = await syncMarketWithIsPublic(api, true);
    expect(r).toEqual({ ok: true, changed: true, auditStatus: 'approved' });
    expect(api.toggleMarket).toHaveBeenCalledWith({ subjectType: 'individual', subjectId: 3 });
  });

  test('manual 审核模式 → auditStatus=pending 透传（myCard 显示「待审核」）', async () => {
    const api = fakeApi({ subjects: ACTIVE_IND });
    api.toggleMarket = vi.fn(async () => ({ success: true, inMarket: true, auditStatus: 'pending' }));
    const r = await syncMarketWithIsPublic(api, true);
    expect(r.auditStatus).toBe('pending');
  });

  test('开着且已有记录 → 不 toggle（幂等，重复进入页面不重复上架）', async () => {
    const api = fakeApi({
      subjects: ACTIVE_IND,
      items: [{ subjectType: 'individual', subjectId: 3 }],
    });
    const r = await syncMarketWithIsPublic(api, true);
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(false);
    expect(api.toggleMarket).not.toHaveBeenCalled();
  });

  test('关着且有记录 → 发起下架', async () => {
    const api = fakeApi({
      subjects: ACTIVE_IND,
      items: [{ subjectType: 'individual', subjectId: 3 }],
    });
    const r = await syncMarketWithIsPublic(api, false);
    expect(r).toEqual({ ok: true, changed: true, auditStatus: undefined });
    expect(api.toggleMarket).toHaveBeenCalledWith({ subjectType: 'individual', subjectId: 3 });
  });

  test('关着且无记录 → 不 toggle', async () => {
    const api = fakeApi({ subjects: ACTIVE_IND });
    const r = await syncMarketWithIsPublic(api, false);
    expect(r.changed).toBe(false);
    expect(api.toggleMarket).not.toHaveBeenCalled();
  });

  test('无 active 主体 → no-subject，绝不 toggle（未入驻/审核中本就不能上架）', async () => {
    const api = fakeApi({ subjects: [{ subjectType: 'individual', subjectId: 3, status: 'pending' }] });
    const r = await syncMarketWithIsPublic(api, true);
    expect(r.reason).toBe('no-subject');
    expect(r.ok).toBe(true);
    expect(api.toggleMarket).not.toHaveBeenCalled();
  });

  test('my-status 查询失败 → soft 失败，不 toggle（调用方据此不回滚 is_public）', async () => {
    const api = fakeApi({ subjects: ACTIVE_IND });
    api.getMarketMyStatus = vi.fn(async () => { throw new Error('网络请求失败'); });
    const r = await syncMarketWithIsPublic(api, true);
    expect(r.ok).toBe(false);
    expect(r.soft).toBe(true);
    expect(r.error).toBe('网络请求失败');
    expect(api.toggleMarket).not.toHaveBeenCalled();
  });

  test('toggle 被服务端拒绝（集市未开启/配额满）→ ok=false 且错误文案透传', async () => {
    const api = fakeApi({ subjects: ACTIVE_IND, toggleThrow: '集市未开启' });
    const r = await syncMarketWithIsPublic(api, true);
    expect(r.ok).toBe(false);
    expect(r.changed).toBe(false);
    expect(r.error).toBe('集市未开启');
  });

  test('多主体时只看主解析主体（个体优先），不碰其他主体的上架记录', async () => {
    // 设计决策：myCard 集市状态展示的是主解析主体，开关就管同一个主体；
    // 员工主体的记录是 market.vue 独立开关管的，这里不误伤。
    const subs = [
      { subjectType: 'employee', subjectId: 9, status: 'active' },
      { subjectType: 'individual', subjectId: 3, status: 'active' },
    ];
    const api = fakeApi({ subjects: subs, items: [{ subjectType: 'employee', subjectId: 9 }] });
    const r = await syncMarketWithIsPublic(api, true);
    expect(r.changed).toBe(true);
    expect(api.toggleMarket).toHaveBeenCalledWith({ subjectType: 'individual', subjectId: 3 });
    // 员工主体的记录原样保留
    expect(api.state.items).toEqual([
      { subjectType: 'employee', subjectId: 9 },
      { subjectType: 'individual', subjectId: 3 },
    ]);
  });
});

// ===== displaySettings.vue：开关必须联动集市（防回退成只写 is_public） =====
describe('displaySettings.vue 开关联动', () => {
  test('引入共用联动模块 marketLink.js', () => {
    // 2026-10-17：模块移入 card 分包（pages/card/utils/）——只被本分包使用，
    // 放主包会被 devtools 判「主包未使用 JS」且占主包体积
    expect(dsSrc).toMatch(/import\s*\{\s*syncMarketWithIsPublic\s*\}\s*from\s*'\.\/utils\/marketLink\.js'/);
  });

  test('onPublicChange 保存 is_public 后必须调 syncMarket（不能只 updateCard 就 toast）', () => {
    expect(dsSrc).toMatch(/await cardApi\.updateCard\(cardId\.value,\s*\{\s*isPublic:\s*val\s*\}\)/);
    expect(dsSrc).toMatch(/await syncMarket\(val\)/);
  });

  test('无主体时回滚 is_public=false + 双模引导话术（第20轮：purchase=去开通 / code=输兑换码）', () => {
    expect(dsSrc).toMatch(/await rollbackPublic\(false\)/);
    expect(dsSrc).toMatch(/开通会员套餐即可上架至名片集市/);
    // 第21轮：个人入驻凭证改为兑换码（一人一码），话术同步
    expect(dsSrc).toMatch(/入驻后可上架至名片集市，请向管理员获取入驻兑换码/);
    // 两条引导都要落到动作：member 页 / 兑换码浮层
    expect(dsSrc).toMatch(/\/pages\/card\/member/);
    expect(dsSrc).toMatch(/showInviteSheet\.value = true/);
  });

  test('manual 审核模式 toast「已提交上架申请，等待审核」', () => {
    expect(dsSrc).toMatch(/已提交上架申请，等待审核/);
  });

  test('load() 载入 isPublic 后跑存量自愈（开着却没上架的旧数据补建一次）', () => {
    expect(dsSrc).toMatch(/if \(isPublic\.value\) await healMarketLink\(\)/);
    expect(dsSrc).toMatch(/healMarketLink[\s\S]*?syncMarketWithIsPublic\(cardApi,\s*true\)/);
  });

  test('存量自愈只补「开着但没上架」方向，且硬失败回滚开关', () => {
    // 已补齐 / 无主体回滚 / 硬失败回滚 三个分支都要在 healMarketLink 内
    const heal = dsSrc.slice(dsSrc.indexOf('async function healMarketLink'));
    expect(heal).toMatch(/已补齐集镇上架/);
    expect(heal).toMatch(/r\.reason === 'no-subject'[\s\S]*?rollbackPublic\(false\)/);
    expect(heal).toMatch(/!r\.ok && !r\.soft[\s\S]*?rollbackPublic\(false\)/);
  });
});

// ===== create.vue：保存后同源联动（与 displaySettings 不漂移） =====
describe('create.vue 保存后集市联动', () => {
  test('引入共用联动模块 marketLink.js', () => {
    // 2026-10-17：模块移入 card 分包（pages/card/utils/）——只被本分包使用，
    // 放主包会被 devtools 判「主包未使用 JS」且占主包体积
    expect(createSrc).toMatch(/import\s*\{\s*syncMarketWithIsPublic\s*\}\s*from\s*'\.\/utils\/marketLink\.js'/);
  });

  test('submit 成功路径（三种保存）后调 syncMarketAfterSave(form.isPublic)', () => {
    expect(createSrc).toMatch(/syncMarketAfterSave\(!!form\.isPublic\)/);
  });

  test('syncMarketAfterSave 内部用 syncMarketWithIsPublic(cardApi, …)（同一实现，禁各写一份）', () => {
    const fn = createSrc.slice(createSrc.indexOf('async function syncMarketAfterSave'));
    expect(fn).toMatch(/syncMarketWithIsPublic\(cardApi,\s*isPublic\)/);
  });

  test('no-subject 静默（入驻审核中本就不能上架，不弹错误惊吓用户）', () => {
    const fn = createSrc.slice(createSrc.indexOf('async function syncMarketAfterSave'));
    expect(fn).toMatch(/r\.reason !== 'no-subject'/);
  });

  test('同步失败不阻断导航（名片已保存成功，仅延迟轻提示）', () => {
    const fn = createSrc.slice(createSrc.indexOf('async function syncMarketAfterSave'));
    expect(fn).toMatch(/setTimeout\([\s\S]*?uni\.showToast/);
  });
});

// ===== myCard.vue：集市状态唯一数据源不变（仍是 my-status，没有被改成 is_public） =====
describe('myCard.vue 集市状态读取链（防被「简化」成读 is_public）', () => {
  test('myMarketItem 仍从 myStatus.items 按 subjectType+subjectId 匹配', () => {
    expect(myCardSrc).toMatch(/myStatus\.value\?\.items \|\| \[\]\)\.find\(/);
    expect(myCardSrc).toMatch(/it\.subjectType === activeSubject\.value\.subjectType && it\.subjectId === activeSubject\.value\.subjectId/);
  });

  test('数据来源仍是 getMarketMyStatus（card_market_items 体系）', () => {
    expect(myCardSrc).toMatch(/cardApi\.getMarketMyStatus\(\)/);
  });
});
