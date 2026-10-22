/**
 * 🔴 回归锁：动态发布第五轮真机反馈（#312-8）
 *
 * 反馈 → 修法：
 *   1a 链接卡片展开后**滚不动**、内容显示不全 → 微信小程序的普通 view 设 overflow-y:auto
 *      **不保证能滚**，sheet-body 必须改成 `<scroll-view scroll-y>`（+ height:0 才能算出滚动区）。
 *   1b 「跳内页/外链」两个按钮样式奇怪 → 改一体化分段控件 .seg（灰底胶囊 + 白色滑块）。
 *   1c 卡片标题跟动态标题重复 → 卡片标题不再单独填，提交时直接用 newDynamic.title。
 *      描述与封面上传一并下线（用户看不出用途，只让弹窗更复杂）。
 *   1d 动态封面（头图）功能 → 整个去掉（前端 + 服务端 cover 字段一并回滚）。
 *   2  「我的动态」>3 张仍全部显示 → 列表页也改横向滚动（上轮只改了发布弹窗，理解窄了）。
 *   3  发布按钮挤在导航栏被微信胶囊顶到标题左边 → 改右下角悬浮圆按钮 .fab-publish。
 *   4a 名片详情动态头像一片灰 → authorAvatar 是 /uploads/ 相对路径，MP 加载不出来；
 *      水合时补域名 + 回落名片头像 + 首字母占位改品牌色底白字。
 *   4b 时间「9个小时前」不对 → 服务端存 UTC，前端按本地时区解析凭空多 8 小时（见 dynTime.test.js）。
 *   4c 两个 0 看不懂 → 图标后加文字「赞 / 评论」。
 *   4d 多图要能**左右滑动**看第二三张（带滑动动效），点击才放大 → swiper 轮播
 *      （上轮的「重叠堆叠 +N」是静态的，滑不动，不是用户要的）+ 页码「2/4」。
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { describe, test, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf-8');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const dyn = () => stripComments(read('./dynamic.vue'));
const dynCss = () => read('./dynamic.vue');
const detail = () => stripComments(read('./cardDetail.vue'));
const detailCss = () => read('./cardDetail.vue');

describe('1a 发布弹窗：链接卡片展开后必须能滚', () => {
  test('sheet-body 是 scroll-view scroll-y（MP 的普通 view 设 overflow-y:auto 滚不动）', () => {
    expect(dyn()).toMatch(/<scroll-view scroll-y class="sheet-body">/);
    const c = dynCss();
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?flex: 1;/);
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?height: 0;/);
    expect(c).toMatch(/\.sheet-body \{[\s\S]*?min-height: 0;/);
  });

  test('不再靠 CSS overflow-y 撑滚动（这条正是真机滚不动的原因）', () => {
    expect(dynCss()).not.toMatch(/\.sheet-body \{[\s\S]*?overflow-y: auto;/);
  });
});

describe('1b 链接类型：一体化分段控件（原来两个方块看着很奇怪）', () => {
  test('swiper…不，seg 是灰底胶囊 + 白色滑块，两个选项共用容器', () => {
    const s = dyn();
    expect(s).toMatch(/<view class="seg">/);
    expect(s).toMatch(/<view class="seg-opt" :class="\{ active: newDynamic\.link\.type === 'page' \}" @click="newDynamic\.link\.type='page'">跳内页<\/view>/);
    expect(s).toMatch(/<view class="seg-opt" :class="\{ active: newDynamic\.link\.type === 'url' \}" @click="newDynamic\.link\.type='url'">外链<\/view>/);
  });

  test('旧的 link-type 方块样式已移除（两套并存必漂移）', () => {
    const c = dynCss();
    expect(c).not.toMatch(/\.link-type-opt/);
  });

  test('滑块用 --white 实心底 + 主色字（不新增 rgba 裸值，tokenAudit 基线不许上调）', () => {
    const c = dynCss();
    expect(c).toMatch(/\.seg \{[\s\S]*?background: var\(--bg-hover\);/);
    expect(c).toMatch(/\.seg-opt\.active \{[\s\S]*?background: var\(--white\);/);
  });
});

describe('1c 卡片标题跟随动态标题（不再填两遍）', () => {
  test('提交体 linkTitle 直接取 newDynamic.title', () => {
    const s = dyn();
    expect(s).toMatch(/linkTitle: newDynamic\.value\.title \|\| '',/);
    expect(s).toMatch(/linkDesc: '',/);
    expect(s).toMatch(/linkImg: '',/);
  });

  test('表单里不再有卡片标题/描述/封面的输入项', () => {
    const s = dyn();
    expect(s).not.toMatch(/v-model="newDynamic\.link\.title"/);
    expect(s).not.toMatch(/v-model="newDynamic\.link\.desc"/);
    expect(s).not.toMatch(/newDynamic\.link\.img/);
  });

  test('给用户一句说明，避免以为漏了卡片标题', () => {
    expect(dyn()).toMatch(/卡片上的标题就用上面的动态标题，不用重复填/);
  });
});

describe('1d 动态封面（头图）已下线', () => {
  test('前端表单没有封面入口，列表也不再渲染封面', () => {
    const s = dyn();
    expect(s).not.toMatch(/pickDynCover/);
    expect(s).not.toMatch(/cover-block/);
    expect(s).not.toMatch(/class="dynamic-cover"/);
  });

  test('空壳表单与提交体都不再有 cover', () => {
    const s = dyn();
    expect(s).toMatch(/function emptyDynamic\(\) \{\s*return \{ content: '', title: '', images: \[\], visibility: 'public', link: \{ type: 'page', url: '' \}, ref: null \};\s*\}/);
    expect(s).not.toMatch(/cover: newDynamic\.value\.cover/);
  });
});

describe('2 我的动态列表：>3 张横向滚动 + 点击预览', () => {
  test('列表与发布弹窗共用同一个阈值常量 IMG_SCROLL_THRESHOLD', () => {
    const s = dyn();
    expect(s).toMatch(/const IMG_SCROLL_THRESHOLD = 3;/);
    // ≤3 张九宫格
    expect(s).toMatch(/<view class="dynamic-images" v-if="d\.images\?\.length && d\.images\.length <= IMG_SCROLL_THRESHOLD">/);
    // >3 张横向滚动
    expect(s).toMatch(/<scroll-view scroll-x class="dyn-img-scroll" v-else-if="d\.images\?\.length"/);
  });

  test('横向滚动内层 inline-flex + 定宽子项（scroll-view 内 flex 会折行）', () => {
    const c = dynCss();
    expect(c).toMatch(/\.dyn-img-scroll-inner \{[\s\S]*?display: inline-flex;/);
    expect(c).toMatch(/\.dynamic-img-h \{[\s\S]*?width: 240rpx;/);
    expect(c).toMatch(/\.dyn-img-scroll \{[\s\S]*?white-space: nowrap;/);
  });

  test('列表点图 → 预览整条动态的全部配图', () => {
    const s = dyn();
    expect(s).toMatch(/@click="previewList\(d\)"/);
    expect(s).toMatch(/function previewList\(d\) \{[\s\S]*?uni\.previewImage\(\{ urls \}\);/);
  });
});

describe('3 发布入口改右下角悬浮圆按钮', () => {
  test('按钮是 fixed 圆钮，不再进 PageNav 的 #right 插槽', () => {
    const s = dyn();
    expect(s).toMatch(/<view class="fab-publish" @click="openPublish">＋<\/view>/);
    expect(s).not.toMatch(/class="publish-btn"/);
    expect(s).toMatch(/<PageNav title="我的动态" back \/>/);
  });

  test('避让全面屏手势条 + 复用既有 z-index 令牌 + 列表留白避让', () => {
    const c = dynCss();
    expect(c).toMatch(/\.fab-publish \{[\s\S]*?position: fixed;/);
    expect(c).toMatch(/\.fab-publish \{[\s\S]*?bottom: calc\(40rpx \+ env\(safe-area-inset-bottom\)\);/);
    expect(c).toMatch(/\.fab-publish \{[\s\S]*?z-index: var\(--z-sticky\);/);
    expect(c).toMatch(/\.dynamic-list \{[\s\S]*?padding-bottom: 160rpx;/);
  });
});

describe('4a 名片详情：动态头像不再是灰片', () => {
  test('水合时给 authorAvatar 补域名（/uploads/ 相对路径在 MP 加载不出来）', () => {
    expect(detail()).toMatch(/authorAvatar: x\.authorAvatar \? absUrl\(x\.authorAvatar\) : '',/);
  });

  test('头像三级兜底：作者头像 → 名片头像 → 品牌色首字母', () => {
    const s = detail();
    expect(s).toMatch(/<image v-if="d\.authorAvatar" :src="d\.authorAvatar" mode="aspectFill" \/>/);
    expect(s).toMatch(/<image v-else-if="card\.avatar" :src="card\.avatar" mode="aspectFill" \/>/);
    expect(s).toMatch(/<view v-else class="dyn-av-ph">/);
  });

  test('首字母占位改品牌色底 + 白字（原来是浅灰底浅灰字，远看就是一片灰）', () => {
    const c = detailCss();
    // 注意：cardDetail 全文件禁漂移令牌，这里必须是不带兜底的写法
    expect(c).toMatch(/\.dyn-av-ph \{[\s\S]*?background: var\(--design-primary\);/);
    expect(c).toMatch(/\.dyn-av-ph \{[\s\S]*?color: var\(--white\);/);
  });
});

describe('4b 时间：两端共用同一份 UTC 解析实现', () => {
  test('名片详情与我的动态都 import 同一个 dynTime 工具（两端各写一份必漂移）', () => {
    expect(detail()).toMatch(/import \{ formatDynamicTime \} from '\.\/utils\/dynTime\.js';/);
    expect(dyn()).toMatch(/import \{ formatDynamicTime as dynTime \} from '\.\/utils\/dynTime\.js';/);
  });

  test('名片详情不再自己算差值（旧实现按本地时区解析 UTC → 凭空多 8 小时）', () => {
    const s = detail();
    expect(s).toMatch(/function timeText\(t\) \{\s*return formatDynamicTime\(t\);/);
    expect(s).not.toMatch(/t\.replace\(' ', 'T'\)\)\.getTime\(\)/);
  });

  test('我的动态列表不再直接 slice 截 UTC 字符串', () => {
    const s = dyn();
    expect(s).toMatch(/\{\{ dynTime\(d\.createdAt\) \}\}/);
    expect(s).not.toMatch(/d\.createdAt\?\.slice\(0, 16\)/);
  });
});

describe('4c 互动数字要有文字（不然 MP 图标挂了就剩两个裸 0）', () => {
  test('赞 / 评论 都带文字标签', () => {
    const s = detail();
    expect(s).toMatch(/赞 \{\{ d\.likeCount \|\| 0 \}\}/);
    expect(s).toMatch(/评论 \{\{ d\.commentCount \|\| 0 \}\}/);
  });

  test('仍保留图标（图文并存，缺一都看不懂）', () => {
    const s = detail();
    expect(s).toMatch(/<SIcon name="like" size="small"/);
    expect(s).toMatch(/<SIcon name="comment" size="small"/);
  });
});

describe('4d 名片详情多图：左右滑动看下一张（不是静态堆叠）', () => {
  test('多图走 swiper 轮播，前后露边提示可滑', () => {
    const s = detail();
    expect(s).toMatch(/<swiper class="dyn-swiper" :indicator-dots="false" :circular="false"/);
    expect(s).toMatch(/previous-margin="12px" next-margin="12px"/);
    expect(s).toMatch(/@change="onDynSwipe\(d, \$event\)"/);
  });

  test('上轮的静态堆叠已经拆掉（滑不动，不是用户要的）', () => {
    const s = detail();
    expect(s).not.toMatch(/class="dyn-stack"/);
    expect(s).not.toMatch(/function stackStyle/);
    expect(s).not.toMatch(/stackRest/);
  });

  test('滑动动效：非当前项缩放 + 降透明度，0.25s 过渡', () => {
    const c = detailCss();
    expect(c).toMatch(/\.sw-item \{[\s\S]*?transform: scale\(0\.94\);/);
    expect(c).toMatch(/\.sw-item \{[\s\S]*?transition: transform 0\.25s ease, opacity 0\.25s ease;/);
    expect(c).toMatch(/\.sw-item\.active \{[\s\S]*?transform: scale\(1\);/);
  });

  test('每条动态各自记下标（否则滑一条其余跟着跳）', () => {
    const s = detail();
    expect(s).toMatch(/const dynSwipeMap = ref\(\{\}\);/);
    expect(s).toMatch(/dynSwipeMap\.value = \{ \.\.\.dynSwipeMap\.value, \[d\.id\]: i \};/);
  });

  test('页码「2/4」：圆点看不出共有几张', () => {
    expect(detail()).toMatch(/\{\{ dynSwipeIdx\(d\) \+ 1 \}\}\/\{\{ d\.images\.length \}\}/);
  });

  test('点击才放大，且从当前那张开始（不是永远第一张）', () => {
    const s = detail();
    expect(s).toMatch(/@click="previewDyn\(d\)"/);
    expect(s).toMatch(/uni\.previewImage\(\{ urls, current: urls\[dynSwipeIdx\(d\)\] \|\| urls\[0\] \}\);/);
  });

  test('只有 1 张时不进 swiper（没必要也不显示页码）', () => {
    const s = detail();
    expect(s).toMatch(/v-if="\(d\.images \|\| \[\]\)\.length > 1" class="dyn-swiper-wrap"/);
    expect(s).toMatch(/v-else-if="\(d\.images \|\| \[\]\)\.length === 1" class="dyn-img"/);
  });

  test('swiper 容器必须有确定高度（item 绝对定位撑不高父容器）', () => {
    expect(detailCss()).toMatch(/\.dyn-swiper \{[\s\S]*?height: 340rpx;/);
  });
});
