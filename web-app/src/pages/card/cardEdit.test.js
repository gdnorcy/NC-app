import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from './cardCompRegistry.js';

// 名片自定义装修组件（2026-10-20 V1）回归：
//  - cardEdit.vue 结构：母版置灰、整存只提交个人组件、品牌链完整、数量上限同源
//  - cardDetail.vue 渲染：加载并渲染合并组件（母版+个人）
//  - myCard.vue 入口：编辑列表跳 cardEdit
//  - server COMP_MAX 与前端常量一致（跨包钉）
const cardEditSrc = readFileSync(fileURLToPath(new URL('./cardEdit.vue', import.meta.url)), 'utf8');
const cardDetailSrc = readFileSync(fileURLToPath(new URL('./cardDetail.vue', import.meta.url)), 'utf8');
const myCardSrc = readFileSync(fileURLToPath(new URL('./myCard.vue', import.meta.url)), 'utf8');
const serverCard = readFileSync(fileURLToPath(new URL('../../../../server/src/routes/card.js', import.meta.url)), 'utf8');

describe('cardEdit.vue 装修编辑页', () => {
  test('数据来源：getCardComponents / saveCardComponents（整存 PUT）', () => {
    expect(cardEditSrc).toMatch(/cardApi\.getCardComponents\(/);
    expect(cardEditSrc).toMatch(/cardApi\.saveCardComponents\(/);
    expect(cardEditSrc).toMatch(/mine\.value\.map\(\(c\) => \(\{ type: c\.type, props: c\.props \|\| \{\} \}\)\)/);
  });

  test('品牌链：根视图绑 themeStyle + brandVars（禁硬编码微信绿）', () => {
    expect(cardEditSrc).toMatch(/:style="\[themeStyle, brandVars\]"/);
    // CSS 里不出现微信绿硬编码（tokenAudit 已扫裸值，这里钉语义）
    const style = cardEditSrc.slice(cardEditSrc.indexOf('<style scoped>'));
    expect(style).not.toContain('#07c160');
  });

  test('母版锁定：isLock 项操作按钮置灰 + 锁定提示', () => {
    expect(cardEditSrc).toMatch(/:class="\{ lock: c\.isLock \}"/);
    expect(cardEditSrc).toMatch(/off: c\.isLock \|\|/);
    expect(cardEditSrc).toContain('企业母版组件，不可修改');
  });

  test('母版永在个人组件前（canMove 不允许穿越母版）', () => {
    expect(cardEditSrc).toMatch(/return !comps\.value\[i\]\.isLock && !comps\.value\[j\]\.isLock/);
  });

  test('新增组件后直接进配置弹窗（必填项当场补）', () => {
    expect(cardEditSrc).toMatch(/comps\.value\.push\(item\);[\s\S]*?openEdit\(item\)/);
  });

  test('数量上限与 server COMP_MAX 一致（20）', () => {
    expect(cardEditSrc).toContain('const COMP_MAX = 20;');
    expect(serverCard).toMatch(/const COMP_MAX = 20;/);
  });

  test('图片上传走通用上传（uploadUserAvatar），非自建上传链路', () => {
    expect(cardEditSrc).toMatch(/cardApi\.uploadUserAvatar\(f\.tempFilePath\)/);
  });
});

describe('cardDetail.vue 组件渲染', () => {
  test('加载并渲染自定义组件区（母版+个人）', () => {
    expect(cardDetailSrc).toMatch(/cardApi\.getCardComponents\(id\)/);
    expect(cardDetailSrc).toMatch(/cardComps\.value = cc\.components \|\| \[\]/);
    expect(cardDetailSrc).toContain('class="cc-list"');
  });

  test('五种组件都有渲染分支（与注册表类型一一对应）', () => {
    for (const t of ['image', 'channel-video', 'notice', 'divider', 'spacer']) {
      expect(cardDetailSrc, `cardDetail 缺少 ${t} 渲染分支`).toContain(`c.type === '${t}'`);
    }
  });

  test('视频号组件走 openChannelVideo（finderUserName + feedId）', () => {
    expect(cardDetailSrc).toMatch(/openChannelVideo\(c\.props\)/);
  });

  test('组件边距助手 ccStyle 存在（props px → 内联样式）', () => {
    expect(cardDetailSrc).toMatch(/function ccStyle\(c\)/);
    expect(cardDetailSrc).toMatch(/marginTop: \(p\.marginTop \|\| 0\) \+ 'px'/);
  });
});

describe('myCard.vue 入口', () => {
  test('编辑列表有「装修我的名片」入口，跳 cardEdit 带名片 id', () => {
    expect(myCardSrc).toContain('装修我的名片');
    expect(myCardSrc).toMatch(/uni\.navigateTo\(\{ url: `\/pages\/card\/cardEdit\?id=\$\{pageCardId\.value\}` \}\)/);
  });
});

describe('注册表与页面消费一致', () => {
  test('cardEdit 面板遍历 CARD_COMP_REGISTRY（不另写类型清单）', () => {
    expect(cardEditSrc).toMatch(/v-for="t in CARD_COMP_REGISTRY"/);
  });

  test('新增组件用 compDefaultProps 深拷贝默认值', () => {
    expect(cardEditSrc).toMatch(/props: compDefaultProps\(type\)/);
    // 深拷贝验证：改返回值不污染注册表
    const p = compDefaultProps('notice');
    p.text = '改坏了';
    expect(compDefaultProps('notice').text).not.toBe('改坏了');
    expect(getCompDef('notice').defaultProps.text).not.toBe('改坏了');
    expect(CARD_COMP_REGISTRY).toHaveLength(5);
  });
});
