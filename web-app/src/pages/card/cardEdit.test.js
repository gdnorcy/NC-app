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

  test('七种组件都有渲染分支（与注册表类型一一对应）', () => {
    for (const t of ['image', 'channel-video', 'notice', 'divider', 'spacer', 'button', 'rich-text']) {
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

  test('新增组件用 compDefaultProps 深拷贝默认值（含 hidden 初始位）', () => {
    expect(cardEditSrc).toMatch(/props: \{ \.\.\.compDefaultProps\(type\), hidden: false \}/);
    // 深拷贝验证：改返回值不污染注册表
    const p = compDefaultProps('notice');
    p.text = '改坏了';
    expect(compDefaultProps('notice').text).not.toBe('改坏了');
    expect(getCompDef('notice').defaultProps.text).not.toBe('改坏了');
    expect(CARD_COMP_REGISTRY).toHaveLength(7);
  });
});

describe('配置弹窗控件形态（2026-10-22 样式报修回归锁）', () => {
  test('input 用视图包层承载边框/box-sizing，内层原生控件去边框只 width:100%（防 MP 溢出）', () => {
    // 病根演进：① 只设 padding → MP 矮到一行；② width:100%+box-sizing:border-box → MP 按 100%+padding 撑宽溢出；
    //   ③ 去掉 width（对齐 customers.vue）→ MP 原生 input 不设宽反而默认更宽仍溢出。
    // 终解：用 .ce-input-wrap 视图包一层，边框/圆角/box-sizing 落在 view（MP 对 view 可靠），
    //   原生 input/textarea 去边框去 padding、只 width:100% 填满包层，MP/H5 都不溢出。
    const style = cardEditSrc.slice(cardEditSrc.indexOf('<style scoped>'));
    expect(style).toMatch(/\.ce-input-wrap\s*\{[^}]*box-sizing:\s*border-box/);
    expect(style).toMatch(/\.ce-input-wrap\s*\{[^}]*border:\s*1rpx solid var\(--border\)/);
    expect(style).toMatch(/\.ce-input\s*\{[^}]*height:\s*80rpx/);
    expect(style).toMatch(/\.ce-input\s*\{[^}]*padding:\s*0\s+var\(--space-r4\)/);
    expect(style).toMatch(/\.ce-input\s*\{[^}]*border:\s*none/);
    // 水平 padding 改由内层 ce-modal-pad 承载，scroll-view 不再直接 padding（避免 MP 尺寸退化）
    expect(style).toMatch(/\.ce-modal-pad\s*\{[^}]*padding:\s*var\(--space-r3\)\s+var\(--space-r6\)/);
  });

  test('richtext 控件已实现（textarea 输 HTML 源码）', () => {
    expect(cardEditSrc).toMatch(/f\.control === 'richtext'/);
    expect(cardEditSrc).toContain('class="ce-textarea"');
  });

  test('schema when 条件显隐：editFields 分组渲染 + fieldVisible', () => {
    // 病根：同元素 v-for+v-if 拿不到作用域变量；条件字段（描边色/宽度百分比）必须整行隐藏
    expect(cardEditSrc).toMatch(/<template v-for="f in editFields"/);
    expect(cardEditSrc).toMatch(/v-else-if="fieldVisible\(f\) && \(f\.section !== 'style' \|\| styleOpen\)"/);
    expect(cardEditSrc).toMatch(/function fieldVisible\(f\)[\s\S]*?f\.when/);
  });

  test('图片加载失败回退上传占位（示例图走网络图，真机域名没配会裂）', () => {
    expect(cardEditSrc).toMatch(/@error="onImgError\(f\.key\)"/);
    expect(cardEditSrc).toMatch(/const imgFailed = ref\(new Set\(\)\)/);
    expect(cardEditSrc).toMatch(/function onImgError\(key\)/);
  });

  test('弹窗滚动区显式定高（MP scroll-view 需确定高度才滚动，flex:1 不定高会顶出弹窗压住按钮）', () => {
    // 病根：flex:1+min-height:0 在 H5 有效，MP 端 scroll-view 不定高 → 不滚、内容溢出弹窗
    const style = cardEditSrc.slice(cardEditSrc.indexOf('<style scoped>'));
    expect(style).toMatch(/\.ce-modal-body\s*\{[^}]*flex:\s*none/);
    expect(style).toMatch(/\.ce-modal-body\s*\{[^}]*height:\s*46vh/);
  });
});

describe('cardDetail 新组件渲染助手', () => {
  test('按钮宽度走共享 buttonSizeStyle（禁私藏副本）', () => {
    expect(cardDetailSrc).toMatch(/import \{ buttonSizeStyle \} from '\.\.\/\.\.\/utils\/btnSize\.js'/);
    expect(cardDetailSrc).toMatch(/function ccBtnStyle\(p\)[\s\S]*?buttonSizeStyle\(p\)/);
    // cardDetail 容器窄于视口：max-width 只在本页调用点夹，共享实现里禁加
    expect(cardDetailSrc).toMatch(/Object\.assign\(s, buttonSizeStyle\(p\), \{ maxWidth: '100%' \}\)/);
  });

  test('富文本渲染前消毒（剥 script/style/on*/javascript:）', () => {
    expect(cardDetailSrc).toMatch(/function sanitizeRichHtml\(h\)/);
    // 分组+反向引用形态：禁拆成含 <script>/<style 字面量的两条（测试提取会误吞 script 段）
    expect(cardDetailSrc).toMatch(/<\(script\|style\)\[\\s\\S\]\*\?<\\\/\\1>/i);
    expect(cardDetailSrc).toMatch(/\\son\[a-z\]\+\\s\*=/);
    expect(cardDetailSrc).toMatch(/javascript\\s\*:/);
    expect(cardDetailSrc).toMatch(/:nodes="sanitizeRichHtml\(/);
  });

  test('富文本样式与 admin richTextStyle 对齐（compBgColor/圆角/投影/描边）', () => {
    expect(cardDetailSrc).toMatch(/function ccRichStyle\(p\)/);
    expect(cardDetailSrc).toMatch(/background: p\.compBgColor \|\| 'transparent'/);
  });
});

describe('装修 V1.1 增强（默认值 / 隐藏开关 / 页内预览）', () => {
  test('新组件默认值：上边距 6、圆角 6（两端 toEqual 已钉一致，这里钉业务值）', () => {
    expect(compDefaultProps('image').marginTop).toBe(6);
    expect(compDefaultProps('image').radius).toBe(6);
    expect(compDefaultProps('button').marginTop).toBe(6);
    expect(compDefaultProps('button').radius).toBe(6);
    expect(compDefaultProps('notice').marginTop).toBe(6);
    expect(compDefaultProps('notice').radiusTop).toBe(6);
    expect(compDefaultProps('notice').radiusBottom).toBe(6);
    expect(compDefaultProps('rich-text').marginTop).toBe(6);
    expect(compDefaultProps('rich-text').radiusTop).toBe(6);
    expect(compDefaultProps('divider').marginTop).toBe(6);
  });

  test('显示/隐藏开关：hidden 存 props，列表可切换，cardDetail 渲染过滤', () => {
    expect(cardEditSrc).toMatch(/function toggleHide\(c\)/);
    expect(cardEditSrc).toMatch(/@click="toggleHide\(c\)"/);
    expect(cardEditSrc).toMatch(/c\.props && c\.props\.hidden \? '显示' : '隐藏'/);
    expect(cardDetailSrc).toMatch(
      /const shownComps = computed\(\(\) => cardComps\.value\.filter\(\(c\) => !\(c\.props && c\.props\.hidden\)\)\)/
    );
    expect(cardDetailSrc).toMatch(/v-for="\(c, i\) in shownComps"/);
  });

  test('配置弹窗按 section 分组：内容段展开、样式段默认折叠', () => {
    expect(cardEditSrc).toMatch(/const editFields = computed/);
    expect(cardEditSrc).toMatch(/__toggle/);
    expect(cardEditSrc).toMatch(/styleOpen\.value = false; \/\/ 每次打开默认收起样式段/);
  });

  test('页内预览：预览按钮 + 全屏层 + 过滤隐藏组件（不用退出到名片详情）', () => {
    expect(cardEditSrc).toMatch(/@click="openPreview"/);
    expect(cardEditSrc).toMatch(
      /const previewComps = computed\(\(\) => comps\.value\.filter\(\(c\) => !\(c\.props && c\.props\.hidden\)\)\)/
    );
    expect(cardEditSrc).toContain('class="ce-preview-layer"');
    expect(cardEditSrc).toMatch(/:nodes="sanitizeRichHtml\(c\.props\.html/);
    expect(cardEditSrc).toMatch(/:style="pvRichStyle\(c\.props\)"/);
  });

  test('预览层可用性：custom nav 避让 + 返回入口 + 物理返回键拦截 + 滚动区定高', () => {
    // 头部避让：状态栏占位 + 胶囊右侧避让必须 JS 实测内联（写死百分比真机必压）
    expect(cardEditSrc).toMatch(/import \{ getNavMetrics \} from '\.\.\/\.\.\/utils\/navMetrics\.js'/);
    expect(cardEditSrc).toMatch(/const pvHeadStyle = \{ paddingTop: navM\.statusBarHeight \+ 'px', paddingRight: navM\.capsuleRightPad \+ 'px' \}/);
    expect(cardEditSrc).toMatch(/:style="pvHeadStyle"/);
    // 返回入口双保险：左上「‹ 返回」+ 右侧「完成」
    expect(cardEditSrc).toMatch(/class="ce-preview-back" @click="closePreview"/);
    expect(cardEditSrc).toMatch(/class="ce-preview-done" @click="closePreview"/);
    // Android 物理返回/侧滑：先关预览层，不直接丢掉未保存修改退页
    expect(cardEditSrc).toMatch(/import \{ onBackPress \} from '@dcloudio\/uni-app'/);
    expect(cardEditSrc).toMatch(/onBackPress\(\(\) => \{/);
    expect(cardEditSrc).toMatch(/if \(showPreview\.value\) \{ showPreview\.value = false; return true; \}/);
    // MP 滚动区显式定高（flex:1+min-height:0 在 MP 无效，同弹窗 46vh 的坑）
    expect(cardEditSrc).toMatch(/height: `calc\(100vh - \$\{navM\.statusBarHeight \+ navM\.navBarHeight\}px\)`/);
    expect(cardEditSrc).toMatch(/:style="pvBodyStyle"/);
  });

  test('预览入口不必滚到列表末尾：导航栏常驻 + 底部吸底双入口', () => {
    // 组件一多，只放在列表最末就得滑到底才能预览（用户反馈）
    expect(cardEditSrc).toMatch(/<PageNav title="装修我的名片" back>/);
    expect(cardEditSrc).toMatch(/<template #right>\s*\n\s*<text class="ce-nav-preview" @click="openPreview">预览<\/text>/);
    // 底部入口改为吸底（包裹层自带底色，防止列表内容从按钮两侧透出）
    expect(cardEditSrc).toMatch(/class="ce-preview-bar-wrap"/);
    expect(cardEditSrc).toMatch(/\.ce-preview-bar-wrap \{[\s\S]*?position: sticky;/);
    expect(cardEditSrc).toMatch(/\.ce-preview-bar-wrap \{[\s\S]*?bottom: 0;/);
    expect(cardEditSrc).toMatch(/\.ce-preview-bar-wrap \{[\s\S]*?background: var\(--bg-page\);/);
  });

  test('预览渲染与 cardDetail 同口径：notice 圆点 / divider 单线 / 按钮共享尺寸 / 图片失败占位', () => {
    expect(cardEditSrc).toMatch(/import \{ buttonSizeStyle \} from '\.\.\/\.\.\/utils\/btnSize\.js'/);
    expect(cardEditSrc).toMatch(/Object\.assign\(s, buttonSizeStyle\(p\), \{ maxWidth: '100%' \}\)/);
    expect(cardEditSrc).toMatch(/class="pv-notice-dot"/);
    expect(cardEditSrc).toMatch(/@error="pvImgFail\('pv:' \+ c\.key\)"/);
    expect(cardEditSrc).toMatch(/class="pv-img-fallback"/);
    // 预览内可试跳站内链接（按钮/图片/公告）
    expect(cardEditSrc).toMatch(/function pvJump\(link\)/);
  });
});
