<template>
  <!-- ===== 视频号作品管理·轻量编辑页（我的名片「名片内容」入口分流）
       视频号链接调用方案（2026-10 改造）：不再上传相册视频，改为录入视频号
       finderUserName + feedId，访客点击封面走 wx.openChannelsActivity 跳转具体视频
       （无主体限制）。封面统一默认图 + 播放键（微信反爬致封面无法服务端抓取）。
       支持：粘贴分享链接自动解析 / 手动填 ID 兜底 / 测试预览 / 多条排序 / 启停开关。 ===== -->
  <view class="wk-page" :style="[themeStyle, brandVars]">
    <PageNav title="视频管理" back></PageNav>

    <view class="pg-error" v-if="loadFailed">
      <view class="pg-err-text">{{ loadFailedMsg }}</view>
      <view class="pg-btn" @click="reloadPage">重新加载</view>
    </view>

    <view class="wk-body" v-else>
      <view class="wk-desc">
        添加你的视频号作品，访客在名片详情页点击封面即可跳转观看，支持多条与排序。
        <text class="wk-quota" :class="{ full: videos.length >= videosLimit }">已添加 {{ videos.length }}/{{ videosLimit }} 个</text>
      </view>

      <!-- 无视频位（free）或已达上限：升级引导卡 -->
      <view class="vt-upgrade" v-if="videosLimit <= 0 || videos.length >= videosLimit">
        <view class="vt-up-t">视频号作品需白银及以上会员</view>
        <view class="vt-up-d">白银可添加 2 个、黄金 6 个、钻石 20 个视频号作品</view>
        <view class="vt-up-btn" @click="goUpgrade">去升级</view>
      </view>

      <view class="wk-empty" v-if="!videos.length && !loading && videosLimit > 0">
        <view class="wk-empty-t">还没有视频号作品</view>
        <view class="wk-empty-d">点击下方按钮，粘贴视频号分享链接即可添加</view>
      </view>

      <view class="wk-list">
        <view class="wk-row" v-for="(v, i) in videos" :key="v.id" :class="{ 'row-off': !v.isShow }">
          <view class="wk-idx">{{ i + 1 }}</view>
          <!-- 默认封面：品牌渐变底 + 播放键（无上传封面，coverUrl 恒空） -->
          <view class="wk-cover">
            <view class="wk-play"></view>
          </view>
          <view class="wk-mid">
            <input
              class="wk-title-input"
              v-model="v.title"
              placeholder="视频标题（选填）"
              placeholder-class="ph"
              @blur="saveMeta(v)"
            />
            <view class="wk-ids">finder: {{ v.finderUserName }}</view>
            <view class="wk-ids wk-feed">feedId: {{ v.feedId }}</view>
            <view class="wk-ops">
              <text class="wk-op" :class="{ off: i === 0 }" @click="move(v, -1)">上移</text>
              <text class="wk-op" :class="{ off: i === videos.length - 1 }" @click="move(v, 1)">下移</text>
              <text class="wk-op" @click="testVideo(v)">测试</text>
              <text class="wk-op del" @click="remove(v)">删除</text>
            </view>
          </view>
          <!-- 启停开关：隐藏后访客不可见，仅自己可见 -->
          <view class="wk-switch" :class="{ on: v.isShow }" @click="toggleShow(v)">
            <view class="wk-dot"></view>
          </view>
        </view>
      </view>

      <view class="wk-add" @click="openPopup" v-if="videosLimit > 0 && videos.length < videosLimit">
        <text class="wk-add-plus">＋</text>
        <text>添加视频号视频</text>
      </view>
    </view>

    <!-- ===== 添加弹窗：手动填 ID 为主 / 粘贴链接为次 =====
         🔴 2026-10-19 方向修正（实测 + 官方文档核实）：
         微信 2026 年改版后，「分享 → 复制链接」给的是加密短链 weixin.qq.com/sph/xxxx，
         它 301 到 channels.weixin.qq.com/finder-preview/pages/sph?id=xxx（实测落地页
         feedId/finderUserName 命中 0 处），短码是路由密文不是 ID 本身，无法解析出作品。
         曾以为「单条视频链接」是 channels.weixin.qq.com/...?finderUserName=&feedId= 明文参数，
         那是旧版形态、微信已不再对外分享——照旧教程操作只会让用户找不到该复制的链接。
         openChannelsActivity 所需两值，合规来源只有视频号助手（官方文档唯一口径）：
         finderUserName = 助手首页「视频号ID」（sph 开头）；feedId = 助手「内容管理」单条作品复制。
         故默认落在 id 模式，链接模式降级为次要入口（仅兼容带明文参数的旧链接/助手网页链接）。 -->
    <view class="wk-mask" v-if="popup.show" @click="closePopup"></view>
    <view class="wk-popup" v-if="popup.show">
      <view class="wk-pop-title">添加视频号视频</view>

      <view class="wk-mode">
        <view class="wk-mode-item" :class="{ on: popup.mode === 'id' }" @click="popup.mode = 'id'">填写视频号 ID</view>
        <view class="wk-mode-item" :class="{ on: popup.mode === 'link' }" @click="popup.mode = 'link'">粘贴链接</view>
      </view>

      <!-- 手动填 ID 模式（默认）：唯一合规且真实可用的路径 -->
      <block v-if="popup.mode === 'id'">
        <view class="wk-hint">
          <text class="wk-hint-t">在电脑端「视频号助手」获取：首页复制视频号ID（sph 开头），内容管理里复制对应作品的 feedId</text>
          <text class="wk-help-btn wk-help-btn--inline" @click="showIdHelp">查看图文教程</text>
        </view>
        <input class="wk-id-input" v-model="popup.finder" placeholder="视频号ID（finderUserName，sph 开头）" placeholder-class="ph" />
        <input class="wk-id-input" v-model="popup.feed" placeholder="作品ID（feedId）" placeholder-class="ph" />
      </block>

      <!-- 链接模式（次要）：仅对带 finderUserName/feedId 明文参数的链接有效 -->
      <block v-else>
        <view class="wk-hint wk-hint--warn">
          <text class="wk-hint-t">微信里复制的 weixin.qq.com/sph/ 短链是加密链接，无法解析出作品，请改用「填写视频号 ID」。仅支持带 finderUserName 与 feedId 参数的链接。</text>
        </view>
        <textarea
          class="wk-link-input"
          v-model="popup.link"
          placeholder="粘贴带 finderUserName 与 feedId 参数的视频号链接"
          placeholder-class="ph"
          :maxlength="500"
        />
        <view class="wk-parse-row">
          <view class="wk-parse-btn" @click="doParse">
            <text v-if="!popup.parsing">解析链接</text>
            <text v-else>解析中…</text>
          </view>
          <view class="wk-help-btn" @click="showLinkHelp">说明</view>
        </view>
      </block>

      <!-- 预览卡：既是「访客看到的封面」，也是 ID 回显（原 wk-parsed 独立块已并入，
           两块紧邻内容重复）。未填 ID 时为虚线占位提示，填好后转实线。 -->
      <view class="wk-prev" :class="{ ready: popup.finder && popup.feed }">
        <view class="wk-prev-label">访客看到的封面</view>
        <view class="wk-prev-row">
          <view class="wk-cover wk-cover--sm">
            <view class="wk-play"></view>
          </view>
          <view class="wk-prev-txt">
            <view class="wk-prev-title">{{ popup.title || '（未填标题）' }}</view>
            <view class="wk-prev-ids" v-if="popup.finder && popup.feed">{{ popup.finder }} · {{ popup.feed }}</view>
            <view class="wk-prev-tip">
              {{ popup.finder && popup.feed ? (popup.mode === 'link' ? '✓ 链接解析成功，可先「测试预览」验证' : '✓ ID 已填写，可先「测试预览」验证') : '填写上方 ID 后此处即为最终效果' }}
            </view>
          </view>
        </view>
      </view>

      <input class="wk-id-input" v-model="popup.title" placeholder="视频标题（选填，访客点封面后看到）" placeholder-class="ph" />

      <view class="wk-test" @click="testPopup">测试预览（跳转视频号验证）</view>

      <!-- 合规承诺（开发文档 7.5）：平台仅跳转不存储视频内容 -->
      <view class="wk-agree" @click="popup.agree = !popup.agree">
        <view class="wk-checkbox" :class="{ on: popup.agree }"></view>
        <text class="wk-agree-t">我承诺拥有该视频内容版权、内容合法合规，平台仅做跳转、不存储视频</text>
      </view>

      <!-- 保存条：sticky 吸底（弹窗内容可滚动，滚动时按钮若跟着走会让人以为「没有保存按钮」，
           2026-10-19 用户反馈）。文案直说「保存到名片」，不用含糊的「提交」。 -->
      <view class="wk-pop-btns">
        <view class="wk-pop-btn cancel" @click="closePopup">取消</view>
        <view class="wk-pop-btn ok" @click="saveVideo">
          <text v-if="!popup.saving">保存到名片</text>
          <text v-else>保存中…</text>
        </view>
      </view>
    </view>

    <!-- ===== 帮助浮层：教程文本自绘（showModal 在 MP 会截断长文） ===== -->
    <view class="wk-mask" v-if="help.show" @click="closeHelp"></view>
    <view class="wk-help" v-if="help.show">
      <view class="wk-help-title">{{ helpTitle }}</view>
      <view class="wk-help-body">
        <view class="wk-help-step" v-for="(s, i) in HELP_STEPS" :key="i">
          <view class="wk-help-n">{{ i + 1 }}</view>
          <view class="wk-help-txt">
            <view class="wk-help-t">{{ s.t }}</view>
            <view class="wk-help-d">{{ s.d }}</view>
          </view>
        </view>
        <view class="wk-help-warn">{{ help.tab === 'link' ? HELP_LINK_NOTE : HELP_WARN }}</view>
      </view>
      <view class="wk-help-btn" @click="closeHelp">知道了</view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, reactive, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
const themeStyle = useDesignTheme();
const { brandVars } = useBrandOverride();

const cardId = ref(null);
const videos = ref([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
// 会员分级权益（benefits.js 单一来源经 /member/status 下发；free 档 videosLimit=0）
const videosLimit = ref(0);

// 无显式 id 时按本人名片兜底（与 worksEdit 同款）
async function resolveCardId() {
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  if (opts.id) return opts.id;
  try {
    const safe = await cardApi.getCardsSafe();
    return (safe.cards && safe.cards[0] && safe.cards[0].id) || null;
  } catch (e) { return null; }
}

async function load() {
  loading.value = true;
  const id = await resolveCardId();
  if (!id) {
    loadFailed.value = true;
    loadFailedMsg.value = '未找到你的名片，请先创建名片';
    loading.value = false;
    return;
  }
  cardId.value = id;
  try {
    // 权益快照 + 视频列表（并行，互不依赖）
    const [st, res] = await Promise.all([
      cardApi.getMemberStatus().catch(() => null),
      cardApi.getCardVideos(id),
    ]);
    const b = (st && st.benefits) || {};
    videosLimit.value = Number(b.videosLimit) >= 0 ? Number(b.videosLimit) : 0;
    videos.value = (res.videos || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '视频加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

// 升级引导（超限/无视频位共用）
function showUpgrade(text) {
  uni.showModal({
    title: '升级会员',
    content: text,
    confirmText: '去升级',
    cancelText: '以后再说',
    success: (r) => {
      if (r.confirm) uni.navigateTo({ url: '/pages/card/member' });
    },
  });
}

function goUpgrade() {
  showUpgrade('视频号作品是白银及以上会员权益：白银 2 个、黄金 6 个、钻石 20 个，升级后即可添加');
}

// ===== 添加弹窗 =====
const popup = reactive({
  show: false,
  mode: 'id',       // id=手动填 ID（默认，唯一合规路径）/ link=粘贴带明文参数的链接（次要）
  link: '',
  finder: '',
  feed: '',
  title: '',
  agree: false,
  parsing: false,
  saving: false,
});

function openPopup() {
  if (!cardId.value) return;
  // 前端预检（服务端同样强制，双保险）
  if (videosLimit.value <= 0) { goUpgrade(); return; }
  if (videos.value.length >= videosLimit.value) {
    showUpgrade(`视频号作品数量已达上限（${videos.value.length}/${videosLimit.value} 个），升级会员可添加更多`);
    return;
  }
  popup.show = true;
  popup.mode = 'id';   // 默认给手动填 ID：链接解析对微信 sph 短链无效（见弹窗顶部注释）
  popup.link = '';
  popup.finder = '';
  popup.feed = '';
  popup.title = '';
  popup.agree = false;
  popup.parsing = false;
  popup.saving = false;
}

function closePopup() {
  popup.show = false;
}

// ===== 获取 ID 的教程 =====
// 🔴 2026-10-19 修正：上一版教程把 weixin.qq.com/sph/ 短链说成「主页链接、不能用」，
// 是错的。实测该形态 301 → channels.weixin.qq.com/finder-preview/pages/sph?id=xxx，
// 落地页无 feedId/finderUserName（0 命中），它是微信 2026 改版后的**统一加密短链**，
// 分享任何单条视频都长这样，短码是路由密文不是 ID。
// openChannelsActivity 的两值，官方唯一合规来源就是视频号助手，故教程只讲助手路径。
// 帮助浮层状态：自绘而非 uni.showModal —— showModal 的 content 在小程序端会截断长文本，
// 教程必须完整可读。DOM 在添加弹窗之后 → 同用 --z-popup 天然压住上一层。
const help = reactive({ show: false, tab: 'id' });
const HELP_STEPS = [
  { t: '第 1 步：电脑上打开视频号助手', d: '浏览器访问 channels.weixin.qq.com，用该视频号的管理员微信扫码登录。' },
  { t: '第 2 步：复制视频号ID', d: '登录后首页顶部会直接显示「视频号ID」，形如 sph4cDqEd8vU0AB，复制它 → 填入第一个输入框。' },
  { t: '第 3 步：复制作品ID', d: '进入「内容管理」→ 找到要添加的那条作品 → 点右侧「···」→ 复制视频ID（feedId）→ 填入第二个输入框。' },
  { t: '第 4 步：回本页保存', d: '两个都填好后可先点「测试预览」验证能正常跳转，再点底部「保存到名片」。' },
];
const HELP_WARN = '为什么不能直接粘贴微信里的分享链接？\n\n微信现在分享单条视频复制到的是 weixin.qq.com/sph/ 开头的加密短链，它是跳转路由、不含作品 ID，平台无法从中定位到具体作品。请按上面四步到视频号助手获取，这是微信官方文档给出的唯一途径。';
const HELP_LINK_NOTE = '这个入口只支持带 finderUserName 与 feedId 明文参数的链接（例如视频号助手网页端复制的作品地址）。\n\n微信里「分享 → 复制链接」得到的是 sph 加密短链，解析不出作品，请改用「填写视频号 ID」标签页——那里有图文教程。';

const helpTitle = computed(() => (help.tab === 'link' ? '关于链接解析' : '如何获取视频号 ID'));

function showLinkHelp() {
  help.show = true;
  help.tab = 'link';
}

function showIdHelp() {
  help.show = true;
  help.tab = 'id';
}

function closeHelp() {
  help.show = false;
}

// 链接解析：只对带 finderUserName/feedId 明文参数的链接有效。
// 微信 sph 加密短链由服务端识别为 channelHomeLink（见 card.js parseChannelLink），
// 失败一律回落到手动填 ID 并给出「为什么不行」的解释，不再让用户以为是操作错了。
async function doParse() {
  const link = String(popup.link || '').trim();
  if (!link) {
    uni.showToast({ title: '请先粘贴链接', icon: 'none' });
    return;
  }
  // 前端先拦最常见的一类：微信 sph 短链，服务端也会拦，这里省一次往返并给更准的话术
  if (/\/sph\/[A-Za-z0-9_-]+/.test(link)) {
    popup.mode = 'id';
    uni.showModal({ title: '微信分享链接已加密', content: HELP_WARN, showCancel: false, confirmText: '看教程' });
    return;
  }
  popup.parsing = true;
  try {
    const data = await cardApi.parseChannelLink(cardId.value, link);
    popup.finder = data.finderUserName || '';
    popup.feed = data.feedId || '';
    uni.showToast({ title: '解析成功', icon: 'success' });
  } catch (e) {
    popup.mode = 'id';
    if (e.data && e.data.code === 'channelHomeLink') {
      uni.showModal({ title: '该链接无法解析', content: e.message, showCancel: false, confirmText: '看教程' });
    } else {
      uni.showToast({ title: e.message || '解析失败，请手动填写ID', icon: 'none' });
    }
  } finally {
    popup.parsing = false;
  }
}

// 测试预览：MP 走 wx.openChannelsActivity；H5 无该能力，提示去小程序验证
function testPreview(finder, feed) {
  if (!/^sph/i.test(String(finder || '')) || !feed) {
    uni.showToast({ title: '请先填写有效的 finderUserName 与 feedId', icon: 'none' });
    return;
  }
  // #ifdef MP-WEIXIN
  wx.openChannelsActivity({
    finderUserName: finder,
    feedId: feed,
    fail: () => uni.showToast({ title: '视频不存在或已被删除', icon: 'none' }),
  });
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: '测试预览请在小程序端进行', icon: 'none' });
  // #endif
}

function testVideo(v) {
  testPreview(v.finderUserName, v.feedId);
}

function testPopup() {
  testPreview(popup.finder, popup.feed);
}

// 保存：JSON 落库（服务端 sph 校验 + 同卡去重 + 会员门禁）
async function saveVideo() {
  if (popup.saving) return;
  if (!/^sph/i.test(String(popup.finder || '').trim())) {
    uni.showToast({ title: 'finderUserName 需以 sph 开头', icon: 'none' });
    return;
  }
  const feed = String(popup.feed || '').trim();
  if (!feed) {
    uni.showToast({ title: '请填写 feedId', icon: 'none' });
    return;
  }
  if (!popup.agree) {
    uni.showToast({ title: '请先勾选内容合规承诺', icon: 'none' });
    return;
  }
  popup.saving = true;
  try {
    const data = await cardApi.addCardVideo(cardId.value, {
      finderUserName: String(popup.finder).trim(),
      feedId: feed,
      title: String(popup.title || '').trim(),
    });
    if (data && data.video) {
      videos.value.push(data.video);
      videos.value.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      closePopup();
      uni.showToast({ title: '已添加', icon: 'success' });
    }
  } catch (e) {
    // 403 limitHit → 升级引导；409 duplicated → 重复提示；其余普通错误
    if (e.data && e.data.code === 'limitHit') {
      showUpgrade(e.message);
    } else if (e.data && e.data.code === 'duplicated') {
      uni.showToast({ title: '该视频已添加过', icon: 'none' });
    } else {
      uni.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  } finally {
    popup.saving = false;
  }
}

function remove(v) {
  uni.showModal({
    title: '删除视频',
    content: '确定删除这个视频号作品吗？',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteCardVideo(cardId.value, v.id);
        videos.value = videos.value.filter((x) => x.id !== v.id);
        uni.showToast({ title: '已删除', icon: 'success' });
      } catch (e) {
        uni.showToast({ title: e.message || '删除失败', icon: 'none' });
      }
    },
  });
}

async function move(v, dir) {
  const i = videos.value.indexOf(v);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= videos.value.length) return;
  const arr = videos.value.slice();
  const tmp = arr[i];
  arr[i] = arr[j];
  arr[j] = tmp;
  videos.value = arr;
  try {
    await cardApi.sortCardVideos(cardId.value, arr.map((x) => x.id));
  } catch (e) {
    uni.showToast({ title: '排序保存失败', icon: 'none' });
  }
}

// 启停开关：乐观更新，失败回滚（访客只看 is_show=1）
async function toggleShow(v) {
  const next = !v.isShow;
  v.isShow = next;
  try {
    await cardApi.updateCardVideo(cardId.value, v.id, { isShow: next });
  } catch (e) {
    v.isShow = !next;
    uni.showToast({ title: '操作失败', icon: 'none' });
  }
}

let metaTimer = null;
function saveMeta(v) {
  // 防抖：聚焦连续编辑只保存一次（仅标题；duration 已随方案废弃，不传即保留）
  if (metaTimer) clearTimeout(metaTimer);
  metaTimer = setTimeout(async () => {
    try {
      await cardApi.updateCardVideo(cardId.value, v.id, { title: v.title || '' });
    } catch (e) { /* 静默：失焦保存失败不打扰，用户可再次编辑触发 */ }
  }, 300);
}

function reloadPage() { load(); }

onMounted(() => {
  // 登录门禁：与 worksEdit 同款（未登录跳登录并回跳本页）
  const pages = getCurrentPages();
  const opts = (pages[pages.length - 1] || {}).options || {};
  const me = uni.getStorageSync('card_user') || {};
  if (!me.id && !uni.getStorageSync('card_token')) {
    uni.redirectTo({ url: loginEntryUrl(LOGIN_PATH, '/pages/card/videosEdit' + (opts.id ? `?id=${opts.id}` : '')) });
    return;
  }
  load();
});
</script>

<style scoped>
.wk-page { min-height: 100vh; background: var(--bg-page); }
.wk-body { padding: 20rpx 24rpx 80rpx; }
.wk-desc { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; margin-bottom: 24rpx; }
.wk-quota { margin-left: 16rpx; color: var(--t3); }
.wk-quota.full { color: var(--t1); font-weight: 500; }
.vt-upgrade { background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 32rpx 24rpx; text-align: center; margin-bottom: 24rpx; }
.vt-up-t { font-size: var(--fs-4); font-weight: 500; color: var(--t1); }
.vt-up-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; line-height: 1.5; }
.vt-up-btn { margin: 24rpx auto 0; display: inline-block; padding: 12rpx 48rpx; border-radius: 40rpx; background: var(--design-primary); color: var(--white); font-size: var(--fs-4); }
.wk-empty { text-align: center; padding: 80rpx 40rpx; background: var(--white); border-radius: 20rpx; }
.wk-empty-t { font-size: var(--fs-5); font-weight: 500; color: var(--t5); }
.wk-empty-d { font-size: var(--fs-2); color: var(--t3); margin-top: 10rpx; }
.wk-list { display: flex; flex-direction: column; gap: 20rpx; }
.wk-row { display: flex; align-items: center; gap: 18rpx; background: var(--white); border: 1rpx solid var(--border-strong); border-radius: 18rpx; padding: 20rpx; }
.wk-row.row-off { opacity: 0.55; }
.wk-idx { width: 36rpx; text-align: center; font-size: var(--fs-4); color: var(--t3); flex-shrink: 0; }
/* 默认封面：品牌渐变 + 居中播放键（CSS 三角，跨端稳定；不用 color-mix，MP 老版本不识别） */
.wk-cover {
  width: 120rpx; height: 120rpx; border-radius: 12rpx; flex-shrink: 0;
  background: var(--design-primary);
  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.32));
  display: flex; align-items: center; justify-content: center;
}
.wk-play {
  width: 0; height: 0;
  border-top: 16rpx solid transparent;
  border-bottom: 16rpx solid transparent;
  border-left: 26rpx solid rgba(255, 255, 255, 0.92);
  margin-left: 8rpx;
}.wk-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10rpx; }
.wk-title-input { font-size: var(--fs-4); color: var(--t1); border-bottom: 1rpx solid var(--border-strong); padding: 8rpx 0; }
.wk-ids { font-size: var(--fs-1); color: var(--t3); word-break: break-all; }
.wk-feed { opacity: 0.8; }
.ph { color: var(--t3); }
.wk-ops { display: flex; gap: 24rpx; }
.wk-op { font-size: var(--fs-3); color: var(--design-primary); }
.wk-op.off { color: var(--t3); opacity: 0.5; }
.wk-op.del { color: var(--danger); }
/* 启停开关（view 手写，避免组件跨端差异） */
.wk-switch { width: 84rpx; height: 44rpx; border-radius: 22rpx; background: var(--border-strong); flex-shrink: 0; padding: 4rpx; transition: background 0.2s; }
.wk-switch.on { background: var(--design-primary); }
.wk-dot { width: 36rpx; height: 36rpx; border-radius: 50%; background: var(--white); transition: transform 0.2s; }
.wk-switch.on .wk-dot { transform: translateX(40rpx); }
.wk-add {
  margin-top: 28rpx; height: 92rpx; border-radius: 20rpx; border: 2rpx dashed var(--border-strong);
  display: flex; align-items: center; justify-content: center; gap: 12rpx;
  color: var(--design-primary); font-size: var(--fs-4); background: var(--white);
}
.wk-add-plus { font-size: 34rpx; }
.pg-error { padding: 200rpx 60rpx; text-align: center; }
.pg-err-text { font-size: var(--fs-4); color: var(--t3); }
.pg-btn { margin: 24rpx auto 0; display: inline-block; padding: 16rpx 56rpx; border-radius: 40rpx; background: var(--design-primary); color: var(--white); font-size: var(--fs-5); }

/* ===== 添加弹窗 ===== */
/* mask 与 popup 同用 --z-popup，靠 DOM 顺序保证弹窗压遮罩（同 myCard 海报弹层模式） */
.wk-mask { position: fixed; top: 0; right: 0; bottom: 0; left: 0; background: var(--bg-mask); z-index: var(--z-popup); }
.wk-popup {
  position: fixed; left: 24rpx; right: 24rpx; top: 50%; transform: translateY(-50%);
  background: var(--white); border-radius: 24rpx; padding: 36rpx 28rpx; z-index: var(--z-popup);
  max-height: 82vh; overflow-y: auto;
}
.wk-pop-title { font-size: var(--fs-5); font-weight: 600; color: var(--t1); text-align: center; margin-bottom: 28rpx; }
.wk-mode { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.wk-mode-item {
  flex: 1; text-align: center; font-size: var(--fs-3); color: var(--t3);
  border: 1rpx solid var(--border-strong); border-radius: 12rpx; padding: 14rpx 0;
}
.wk-mode-item.on { color: var(--design-primary); border-color: var(--design-primary); background: rgba(0, 0, 0, 0.04); }
/* 输入框对齐 customers.vue .form-input / customerDetail.vue .picker-value 规范：
   height 80rpx + line-height 80rpx（MP 原生 input 垂直 padding 不生效，必须显式高度，
   否则塌成一行矮盒——2026-10-19 开发者工具实测反馈）+ fs-5 + radius-xs */
.wk-link-input {
  width: 100%; height: 160rpx; box-sizing: border-box; font-size: var(--fs-5); color: var(--t1);
  background: var(--bg-card); border-radius: var(--radius-xs); padding: 20rpx 24rpx; line-height: 1.5;
}
.wk-id-input {
  width: 100%; box-sizing: border-box; height: 80rpx; line-height: 80rpx;
  background: var(--bg-card); border-radius: var(--radius-xs);
  padding: 0 24rpx; font-size: var(--fs-5); color: var(--t1); margin-bottom: 20rpx;
}
.wk-hint {
  font-size: var(--fs-2); color: var(--t3); line-height: 1.5; margin-bottom: 16rpx;
  background: var(--bg-card); border-radius: var(--radius-xs); padding: 16rpx 20rpx;
}
.wk-hint-t { display: block; }
/* 警示态：链接模式置顶说明「sph 短链无法解析」，避免用户误以为粘贴分享链接是主路径 */
.wk-hint--warn { background: rgba(255, 138, 0, 0.08); color: var(--t1); }
/* 解析行：主按钮撑满 + 右侧「帮助」（2026-10-19 用户要求在解析链接后加帮助按钮） */
.wk-parse-row { display: flex; align-items: center; gap: 16rpx; margin-top: 24rpx; }
.wk-parse-btn {
  flex: 1; text-align: center; font-size: var(--fs-4); color: var(--design-primary);
  border: 1rpx solid var(--design-primary); border-radius: 12rpx; padding: 18rpx 0;
}
.wk-help-btn {
  flex-shrink: 0; font-size: var(--fs-3); color: var(--t3);
  border: 1rpx solid var(--border-strong); border-radius: 12rpx; padding: 18rpx 28rpx;
}
.wk-help-btn--inline {
  display: inline-block; margin-top: 10rpx; padding: 8rpx 20rpx; color: var(--design-primary);
  border-color: var(--design-primary);
}
/* 弹窗内预览卡：把「封面长什么样」提前给用户看（微信不开放封面接口，只能默认图） */
.wk-prev {
  margin-top: 20rpx; background: var(--bg-card); border-radius: 14rpx; padding: 20rpx;
  border: 2rpx dashed var(--border-strong);
}
.wk-prev.ready { border-style: solid; border-color: var(--design-primary); }
.wk-prev-label { font-size: var(--fs-1); color: var(--t3); margin-bottom: 14rpx; }
.wk-prev-row { display: flex; align-items: center; gap: 16rpx; }
.wk-cover--sm { width: 96rpx; height: 96rpx; }
.wk-cover--sm .wk-play {
  border-top-width: 13rpx; border-bottom-width: 13rpx; border-left-width: 21rpx; margin-left: 6rpx;
}
.wk-prev-txt { flex: 1; min-width: 0; }
.wk-prev-title { font-size: var(--fs-4); color: var(--t1); }
.wk-prev-ids { display: block; font-size: var(--fs-1); color: var(--t3); margin-top: 8rpx; word-break: break-all; }
.wk-prev-tip { font-size: var(--fs-1); color: var(--t3); margin-top: 8rpx; line-height: 1.5; }
.wk-test { margin-top: 24rpx; text-align: center; font-size: var(--fs-3); color: var(--design-primary); text-decoration: underline; }
.wk-agree { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 28rpx; }
.wk-checkbox {
  width: 32rpx; height: 32rpx; border-radius: 8rpx; border: 2rpx solid var(--border-strong);
  flex-shrink: 0; margin-top: 4rpx; position: relative;
}
.wk-checkbox.on { background: var(--design-primary); border-color: var(--design-primary); }
.wk-checkbox.on::after {
  content: ''; position: absolute; left: 9rpx; top: 4rpx; width: 10rpx; height: 16rpx;
  border-right: 4rpx solid var(--white); border-bottom: 4rpx solid var(--white); transform: rotate(45deg);
}
.wk-agree-t { font-size: var(--fs-2); color: var(--t3); line-height: 1.5; }
/* 保存条：sticky 吸底——弹窗 max-height 82vh 且可滚动，按钮随内容滚走会让人以为
   「没有保存按钮」（2026-10-19 用户反馈）。负 margin 顶掉自身 margin-top，
   sticky 的 bottom:0 让它在滚动容器内恒可见。 */
.wk-pop-btns {
  position: sticky; bottom: 0;
  display: flex; gap: 20rpx; margin: 32rpx -28rpx -36rpx;
  padding: 20rpx 28rpx 28rpx;
  background: var(--white);
  border-top: 1rpx solid var(--border-strong);
}
.wk-pop-btn { flex: 1; text-align: center; font-size: var(--fs-4); border-radius: 14rpx; padding: 20rpx 0; }
.wk-pop-btn.cancel { color: var(--t3); background: var(--bg-page); }
.wk-pop-btn.ok { color: var(--white); background: var(--design-primary); }

/* ===== 帮助浮层（教程） ===== */
/* 同用 --z-popup（帮助层 DOM 在添加弹窗之后 → 天然压住 mask 与弹窗，同 myCard 海报弹层模式）。
   🔴 不要为「再高一层」引入 calc(var(--z-popup) + 10) 或 --z-toast：tokenAudit 按
   z-index 写法「种类」计数，新写法会顶破基线。 */
.wk-help {
  position: fixed; left: 40rpx; right: 40rpx; top: 50%; transform: translateY(-50%);
  background: var(--white); border-radius: 24rpx; padding: 36rpx 28rpx 28rpx;
  z-index: var(--z-popup); max-height: 80vh; overflow-y: auto;
}
.wk-help-title { font-size: var(--fs-5); font-weight: 600; color: var(--t1); text-align: center; margin-bottom: 28rpx; }
.wk-help-step { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.wk-help-n {
  width: 40rpx; height: 40rpx; border-radius: 50%; flex-shrink: 0;
  background: var(--design-primary); color: var(--white);
  font-size: var(--fs-3); text-align: center; line-height: 40rpx;
}
.wk-help-txt { flex: 1; min-width: 0; }
.wk-help-t { font-size: var(--fs-4); color: var(--t1); line-height: 1.5; }
.wk-help-d { font-size: var(--fs-2); color: var(--t3); margin-top: 8rpx; line-height: 1.6; }
.wk-help-warn {
  font-size: var(--fs-2); color: var(--t1); line-height: 1.6;
  background: rgba(255, 138, 0, 0.08); border-radius: 14rpx; padding: 20rpx;
}
.wk-help-btn {
  margin-top: 32rpx; text-align: center; font-size: var(--fs-4); color: var(--white);
  background: var(--design-primary); border-radius: 14rpx; padding: 20rpx 0;
}
</style>
