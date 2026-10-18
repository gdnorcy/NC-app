import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

// 访客视角预览 + 悬浮双丸 + 转发分享（2026-10-21）。
// 背景：用户反馈「操作栏预览看不到」——myCard「预览」跳 cardDetail 但 isMine 不变，
//   引导条(拨号/收藏)对本人整条隐藏；且 cardDetail 无 onShareAppMessage，转发走系统默认。
// 修法：?preview=1 强制走访客视图（只读态），换模板移到右侧悬浮双丸，补转发配置。

const src = readFileSync(fileURLToPath(new URL('./cardDetail.vue', import.meta.url)), 'utf8');
const mySrc = readFileSync(fileURLToPath(new URL('./myCard.vue', import.meta.url)), 'utf8');

describe('cardDetail 访客视角预览', () => {
  test('路由 ?preview=1 初始化 previewMode', () => {
    expect(src).toMatch(/options\.preview[^\n]*previewMode\.value\s*=\s*true/);
  });

  test('isMine 预览时降级为访客（isRealMine && !previewMode）', () => {
    expect(src).toMatch(/const isMine = computed\(\(\) => isRealMine\.value && !previewMode\.value\)/);
  });

  test('预览只读：收藏/关注/点赞/评论/表单提交统一拦截', () => {
    // previewBlocked 守卫函数
    expect(src).toMatch(/function previewBlocked\(\)/);
    expect(src).toMatch(/if \(!previewMode\.value\) return false;/);
    // 五个写操作入口都有守卫（容忍守卫前的一行说明注释）
    for (const fn of ['toggleCollect', 'followCard', 'toggleLike', 'submitComment', 'submitForm']) {
      const re = new RegExp(`async function ${fn}\\([^)]*\\)\\s*\\{\\s*(//[^\\n]*\\n\\s*)?if \\(previewBlocked\\(\\)\\) return;`);
      expect(src, `${fn} 缺 previewBlocked 守卫`).toMatch(re);
    }
  });

  test('预览浮条 + 退出入口', () => {
    expect(src).toMatch(/class="pv-bar" v-if="previewMode"/);
    expect(src).toMatch(/@click="exitPreview"/);
    expect(src).toMatch(/function exitPreview\(\)\s*\{\s*previewMode\.value = false/);
  });
});

describe('换模板悬浮双丸入口', () => {
  test('quickbar 不再含换模板（移到悬浮轨）', () => {
    expect(src).not.toMatch(/class="qb" @click="goTemplateSelect"/);
  });

  test('右侧悬浮轨：仅名片主人可见，含预览/换模板两丸', () => {
    expect(src).toMatch(/class="float-rail" v-if="isRealMine"/);
    expect(src).toMatch(/class="fr-btn" @click="enterPreview"/);
    expect(src).toMatch(/class="fr-btn" @click="goTemplateSelect"/);
    // 预览模式变退出丸
    expect(src).toMatch(/class="fr-btn fr-exit" v-else @click="exitPreview"/);
  });

  test('goTemplateSelect 仍校验本人（防体验版/分享链路误入）', () => {
    expect(src).toMatch(/function goTemplateSelect\(\)\s*\{\s*if \(!isMine\.value\) return;/);
  });
});

describe('cardDetail 转发分享配置', () => {
  test('import onShareAppMessage 并定义转发内容', () => {
    expect(src).toMatch(/import \{[^}]*onShareAppMessage[^}]*\} from '@dcloudio\/uni-app'/);
    expect(src).toMatch(/onShareAppMessage\(\(\) => \{/);
  });

  test('转发标题=姓名·职位·公司，路径带名片 id，头像需完整 URL', () => {
    expect(src).toMatch(/\[c\.name, c\.position, c\.company\]\.filter\(Boolean\)\.join\(' · '\)/);
    expect(src).toMatch(/path: `\/pages\/card\/cardDetail\?id=\$\{c\.id \|\| ''\}`/);
    expect(src).toMatch(/imageUrl: \/\^https\?:\/\.test\(c\.avatar \|\| ''\) \? c\.avatar : ''/);
  });
});

describe('myCard 预览入口带 preview=1', () => {
  test('previewCard 跳转带 preview=1（否则预览看到的还是本人视图）', () => {
    expect(mySrc).toMatch(/cardDetail\?id=\$\{pageCardId\.value\}&preview=1/);
  });
});
