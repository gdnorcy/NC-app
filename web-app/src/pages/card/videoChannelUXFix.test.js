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

describe('videosEdit.vue · ②帮助按钮 + 教程', () => {
  test('解析链接按钮旁有「帮助」入口，两种模式都能打开教程', () => {
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

  test('教程含关键区分：单条视频链接 vs 主页短链', () => {
    expect(vid).toContain('HELP_LINK_WARN');
    expect(vid).toContain('单条视频');
    expect(vid).toContain('weixin.qq.com/sph/xxxx');
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
    expect(profile).toMatch(/async function goEditCard\(\)\s*\{\s*if \(!hasCardToken\(\)\) return guideLogin\(\);/);
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
