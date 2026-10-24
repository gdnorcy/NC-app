import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 2026-10-19 用户第三轮反馈的 4 项修复回归：
//  ① 解析链接按钮与下方输入框贴太近 → 改为 .wk-parse-row（flex 行 + margin-top）
//  ② 分享链接从哪获取 → 解析链接按钮右侧加「帮助」按钮 + 自绘教程浮层
//  ③ 手动添加无预览图 / 找不到保存按钮 → 弹窗内预览卡 + 保存条 sticky 吸底
//  ④ 个人中心「编辑名片」疑似新建 + 编辑不该分三步 → profile 带 id 跳 create，
//     create 编辑态所有卡片平铺、底部只留「保存修改」
//
// 🔴 教训（本文件的钉法）：.card:not(.active){display:none} 这类「隐藏样式」不会被
//   toContain 类断言捕获——必须钉 class 绑定表达式本身，否则改回分步照样全绿。
const here = import.meta.url;
const vid = readFileSync(fileURLToPath(new URL('./videosEdit.vue', here)), 'utf8');
const create = readFileSync(fileURLToPath(new URL('./create.vue', here)), 'utf8');
const profile = readFileSync(fileURLToPath(new URL('./profile.vue', here)), 'utf8');
const cd = readFileSync(fileURLToPath(new URL('./cardDetail.vue', here)), 'utf8');
const dp = readFileSync(fileURLToPath(new URL('../../components/DesignPage.vue', here)), 'utf8');

describe('videosEdit.vue · ①解析按钮与输入框的间距', () => {
  test('解析按钮在独立的 .wk-parse-row 容器里，与 textarea 之间有间距', () => {
    expect(vid).toContain('class="wk-parse-row"');
    // 行容器必须带 margin-top（.wk-parse-btn 自身已不带 margin-top）
    const row = vid.match(/\.wk-parse-row\s*\{[^}]*\}/);
    expect(row).toBeTruthy();
    expect(row[0]).toMatch(/margin-top:\s*24rpx/);
    // textarea 不再紧贴按钮：按钮不再自带 margin-top
    const btn = vid.match(/\.wk-parse-btn\s*\{[^}]*\}/);
    expect(btn).toBeTruthy();
    expect(btn[0]).not.toMatch(/margin-top/);
  });
});

describe('videosEdit.vue · 默认入口是「填写视频号 ID」（2026-10-19 方向修正）', () => {
  test('默认 mode 为 id，标签顺序也是 ID 在前', () => {
    expect(vid).toMatch(/const popup = reactive\(\{[\s\S]*?mode:\s*'id',/);
    expect(vid).toMatch(/popup\.mode = 'id';\s*\/\/ 默认给手动填 ID/);
    const idxId = vid.indexOf("@click=\"popup.mode = 'id'\">填写视频号 ID");
    const idxLink = vid.indexOf("@click=\"popup.mode = 'link'\">粘贴链接");
    expect(idxId).toBeGreaterThan(-1);
    expect(idxLink).toBeGreaterThan(idxId);
  });

  test('🔴 链接模式必须前置警告「sph 短链无法解析」', () => {
    // 否则用户会以为「粘贴链接」是主路径，反复粘贴分享短链失败
    expect(vid).toContain('wk-hint--warn');
    expect(vid).toMatch(/weixin\.qq\.com\/sph\/ 短链是加密链接，无法解析出作品/);
  });

  test('前端对 sph 短链先行拦截（省一次往返 + 更准话术）', () => {
    expect(vid).toContain("if (/\\/sph\\/[A-Za-z0-9_-]+/.test(link)) {");
    expect(vid).toContain('微信分享链接已加密');
  });
});

describe('videosEdit.vue · ②帮助教程（2026-10-19 事实修正）', () => {
  test('解析链接旁有「说明」入口，手动填 ID 有「图文教程」入口', () => {
    expect(vid).toContain('@click="showLinkHelp"');
    expect(vid).toContain('@click="showIdHelp"');
    expect(vid).toMatch(/function showLinkHelp\(\)\s*\{\s*help\.show = true;/);
    expect(vid).toMatch(/function showIdHelp\(\)\s*\{\s*help\.show = true;/);
  });

  test('教程自绘浮层（非 showModal：MP 会截断长文本）且 z-index 不新增写法', () => {
    expect(vid).toContain('class="wk-help"');
    // 🔴 不可写成 calc(var(--z-popup) + 10) / var(--z-toast)：tokenAudit 按写法种类计数
    expect(vid).toContain('z-index: var(--z-popup); max-height: 80vh');
    expect(vid).not.toMatch(/z-index:\s*calc\(/);
  });

  test('🔴 教程不得再把 sph 短链称作「主页链接」或让用户去复制它', () => {
    // 事实：sph 是微信 2026 改版后的统一加密短链（分享任何单条视频都是），
    // 落地页 0 命中 feedId，服务端无法反解。旧文案会让用户永远找不到「该复制的链接」。
    expect(vid).toContain('加密');
    expect(vid).toContain('视频号助手');
    expect(vid).not.toMatch(/不能复制视频号主页链接/);
    expect(vid).not.toMatch(/一定要复制「单条视频」的链接/);
  });

  test('教程覆盖「电脑端助手」路径（作品ID 唯一来源）', () => {
    expect(vid).toContain('channels.weixin.qq.com');
    expect(vid).toContain('内容管理');
  });

  test('🔴 教程第 1 步必须是手机端取视频号ID，不得再写成「必须开电脑」', () => {
    // 2026-10-19 二次修正：曾把 finderUserName 与 feedId 都写成「只能开电脑 + 视频号助手」，
    // 用户真机截图证伪——手机「我 → 视频号 → 右上角人像 → 点头像进资料页」即可复制视频号ID。
    // 护栏目的：钉住「手机端可拿视频号ID」这个事实，防止后续又被改回全电脑路径。
    const m = vid.match(/const HELP_STEPS = \[([\s\S]*?)\n\];/);
    expect(m).toBeTruthy();
    const steps = m[1];
    expect(steps).toMatch(/手机上复制视频号ID/);
    expect(steps).toContain('不用电脑');
    // 作品ID 仍只在助手拿，教程要如实区分，不能统称「两个都能手机拿」
    expect(steps).toMatch(/作品ID 只有这里能拿|复制视频ID/);
  });
});

describe('视频号唤起 · 取消不算失败（2026-10-20 用户反馈）', () => {
  // 🔴 用户打开视频号后主动返回也走 fail（errMsg 含 cancel），
  // 旧代码一律弹「打开失败，请确认小程序已关联视频号」——取消是正常路径。
  // 护栏钉法：每处 wx.openChannels* 的 fail 回调都必须先拦 /cancel/i 再谈失败。
  const CANCEL_GUARD = /\/cancel\/i\.test\(String\(err\.errMsg\)\)\) return;/;

  test('cardDetail.vue 两处（主页入口 + 具体视频）都先拦 cancel', () => {
    const fails = cd.match(/fail: \(err\) => \{[\s\S]*?\n      \},/g) || [];
    const guards = cd.match(/\/cancel\/i\.test\(String\(err\.errMsg\)\)/g) || [];
    // 两处 openChannels* fail：openVideo（主页）+ openChannelVideo（视频卡片）
    expect(guards.length).toBeGreaterThanOrEqual(2);
    expect(CANCEL_GUARD.test(cd)).toBe(true);
  });

  test('DesignPage.vue 装修组件的 openChannel fail 也先拦 cancel', () => {
    expect(dp).toMatch(/\/cancel\/i\.test\(String\(err\.errMsg\)\)/);
    expect(dp).toContain('取消是正常路径');
  });

  test('videosEdit.vue 测试预览的 fail 同样不把取消当失败', () => {
    expect(vid).toMatch(/取消预览（看了就返回）不是失败/);
    expect(vid).toMatch(/\/cancel\/i\.test\(String\(err\.errMsg\)\)/);
  });
});

describe('cardDetail.vue · 导航无坐标时引导主人去补坐标（2026-10-20）', () => {
  test('🔴 降级分支区分主人/访客：主人弹引导跳编辑页，访客才复制地址', () => {
    // 旧代码无坐标一律复制地址 → 主人自己测试时「导航还是复制地址」，体验像坏的。
    // 真因是名片没落库经纬度（openLocation 必须坐标），主人补一次即永久直开地图。
    const nav = cd.match(/function navigateTo\(\) \{[\s\S]*?\n\}/);
    expect(nav).toBeTruthy();
    expect(nav[0]).toContain('isRealMine.value');
    expect(nav[0]).toContain('名片还没设置位置');
    expect(nav[0]).toMatch(/\/pages\/card\/create\?id=/);
    // 访客降级复制仍保留
    expect(nav[0]).toContain('地址已复制');
  });
});

describe('videosEdit.vue · ③手动模式的预览图与保存按钮', () => {
  test('弹窗内有封面预览卡（与访客看到的默认封面一致）', () => {
    expect(vid).toContain('class="wk-prev"');
    expect(vid).toContain('访客看到的封面');
    expect(vid).toContain('wk-cover--sm');
  });

  test('保存条 sticky 吸底 + 文案直说「保存到名片」', () => {
    const btns = vid.match(/\.wk-pop-btns\s*\{[^}]*\}/);
    expect(btns).toBeTruthy();
    expect(btns[0]).toMatch(/position:\s*sticky/);
    expect(btns[0]).toMatch(/bottom:\s*0/);
    expect(vid).toContain('保存到名片');
  });

  test('两种模式的回显用不同文案（链接解析成功 / ID 已填写）', () => {
    expect(vid).toContain("'✓ 链接解析成功，可先「测试预览」验证'");
    expect(vid).toContain("'✓ ID 已填写，可先「测试预览」验证'");
    // ID 回显已并入预览卡，不再保留独立的 .wk-parsed 块（两块紧邻内容重复）
    expect(vid).not.toContain('class="wk-parsed"');
  });
});

describe('profile.vue · ④「编辑名片」必须带 id 进编辑态', () => {
  test('菜单绑 goEditCard（不再直接跳无 id 的 create）', () => {
    expect(profile).toContain('@click="goEditCard"');
    expect(profile).not.toMatch(/@click="goPage\('\/pages\/card\/create'\)"/);
  });

  test('goEditCard 取本人名片 id 拼 create?id=，无名片才回落新建', () => {
    expect(profile).toContain('`/pages/card/create?id=${myCardId.value}`');
    expect(profile).toMatch(/myCardId\.value = res\.card\.id \|\| null/);
  });

  test('名片 id 来自 /user/profile 的 res.card（onMounted 已拉，无需额外接口）', () => {
    expect(profile).toContain('const res = await cardApi.getProfile();');
    expect(profile).toContain('myCardId.value = res.card.id || null;');
  });

  test('未登录入口守卫：编辑名片先校验 token', () => {
    expect(profile).toMatch(/async function goEditCard\(\)\s*\{\s*if \(!\(await requireLogin\(\)\)\) return;/);
  });
});

describe('create.vue · ④编辑态单页平铺，不分三步', () => {
  test('四张卡片的 active 判定都带 isEdit 短路', () => {
    const cards = create.match(/<view class="card" :class="\{[^"]*\}">/g) || [];
    expect(cards.length).toBe(4);
    for (const c of cards) {
      expect(c).toMatch(/active:\s*isEdit\s*\|\|/);
      expect(c).toMatch(/prev:\s*!isEdit\s*&&/);
    }
  });

  test('底部按钮：编辑态只有「保存修改」，翻页按钮仅新建态', () => {
    expect(create).toContain('<template v-if="isEdit">');
    expect(create).toMatch(/<button class="btn-primary" @click="submit" :disabled="submitting">\s*\{\{ submitting \? '提交中\.\.\.' : '保存修改' \}\}/);
    expect(create).toContain('<template v-else>');
    // 翻页按钮必须落在 v-else 分支内（编辑态不可见）
    const btnBlock = create.match(/<template v-else>[\s\S]*?<\/template>/);
    expect(btnBlock).toBeTruthy();
    expect(btnBlock[0]).toContain('nextStep');
    expect(btnBlock[0]).toContain('prevStep');
  });

  test('步骤指示器仍只在新建态显示（编辑态无 1/3 计数）', () => {
    expect(create).toContain('<view class="stepnum" v-if="!isEdit">{{ currentStep + 1 }} / 3</view>');
  });
});
