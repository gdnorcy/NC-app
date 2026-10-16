<template>
  <view class="profile-page" :style="[themeStyle, brandVars, tabBarPad, brandInkVars]">
<!-- PageNav -->
<PageNav title="个人中心" back />
    <!-- 用户信息头部 -->
    <view class="header">
        <view class="user-info">
          <image v-if="user.avatar && !avatarError" class="avatar-img" :src="user.avatar" mode="aspectFill" @error="avatarError = true" />
          <view v-else class="avatar">{{ user.nickname?.[0] || '用' }}</view>
          <view class="info">
            <view class="nickname">{{ user.nickname || '未设置昵称' }}</view>
            <view class="member-tag" v-if="isMember"><SIcon name="crown" size="small" color="#ffffff" /><text>{{ memberLevelText }}</text></view>
          </view>
          <view class="edit-btn" @click="openEdit">编辑</view>
        </view>

      <!-- 数据看板 -->
      <view class="stats-row">
        <view class="stat-item">
          <view class="stat-num">{{ stats.cardCount }}</view>
          <view class="stat-label">名片</view>
        </view>
        <view class="stat-item">
          <view class="stat-num">{{ stats.visitorCount }}</view>
          <view class="stat-label">访客</view>
        </view>
        <view class="stat-item">
          <view class="stat-num">{{ stats.customerCount }}</view>
          <view class="stat-label">客户</view>
        </view>
        <view class="stat-item">
          <view class="stat-num">{{ stats.exchangeCount }}</view>
          <view class="stat-label">交换</view>
        </view>
      </view>
    </view>

    <!-- 功能菜单 -->
    <view class="menu-section">
      <view class="menu-group">
        <view class="menu-item" @click="goPage('/pages/card/myCard')">
          <view class="menu-icon"><SIcon name="card" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">我的名片</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="goPage('/pages/card/create')">
          <view class="menu-icon"><SIcon name="template" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">编辑名片</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="goPage('/pages/card/distribution')">
          <view class="menu-icon"><SIcon name="wallet" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">分销中心</view>
          <view class="menu-arrow">›</view>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @click="goPage('/pages/card/member')">
          <view class="menu-icon"><SIcon name="crown" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">会员中心</view>
          <view class="menu-value" v-if="isMember">{{ memberLevelText }}</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="goPage('/pages/card/dynamic')">
          <view class="menu-icon"><SIcon name="dynamic" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">我的动态</view>
          <view class="menu-arrow">›</view>
        </view>
      </view>

      <view class="menu-group">
        <view class="menu-item" @click="showSettings">
          <view class="menu-icon"><SIcon name="settings" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">设置</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item" @click="showAbout">
          <view class="menu-icon"><SIcon name="audit" size="default" :color="ICON_T2" /></view>
          <view class="menu-label">关于我们</view>
          <view class="menu-arrow">›</view>
        </view>
        <view class="menu-item logout" @click="logout">
          <view class="menu-icon"><SIcon name="key" size="default" color="#f53f3f" /></view>
          <view class="menu-label">退出登录</view>
        </view>
      </view>
    </view>

    <!-- 编辑资料弹层：头像 + 昵称（用户反馈：原「编辑」跳创建名片，应为编辑头像/昵称） -->
    <view v-if="showEdit" class="mask" @click="closeEdit">
      <view class="sheet" @click.stop>
        <view class="sheet-title">编辑资料</view>
        <!-- MP：open-type=chooseAvatar 拉起微信头像选择；H5：点击走 uni.chooseImage 相册 -->
        <button
          class="avatar-choose"
          open-type="chooseAvatar"
          @chooseavatar="onChooseAvatar"
          @click="h5ChooseAvatar"
        >
          <image v-if="editForm.avatar && !editAvatarError" class="ac-img" :src="editForm.avatar" mode="aspectFill" @error="editAvatarError = true" />
          <view v-else class="ac-img ac-ph">{{ user.nickname?.[0] || '用' }}</view>
          <view class="ac-tip">点击更换头像</view>
        </button>
        <view class="field">
          <view class="field-label">昵称</view>
          <input class="field-input" type="nickname" v-model="editForm.nickname" placeholder="填写昵称" placeholder-class="ph" />
        </view>
        <view class="sheet-actions">
          <view class="sheet-btn cancel" @click="closeEdit">取消</view>
          <view class="sheet-btn ok" @click="saveProfile">{{ saving ? '保存中…' : '保存' }}</view>
        </view>
      </view>
    </view>
    <!-- 底部TabBar（公共组件） -->
    <!-- 🔴 底部菜单的「个人中心/我的」指向本页（design.js DEFAULT_DESIGN_TABS 与租户发布
         方案同指），漏挂就会「点个人中心进来后底部菜单消失」（2026-10-15 真机报修）。
         active 留空：默认导航四键（名片/雷达/集市/会员）不含本页，不硬造高亮；
         设计配置模式下 CardTabBar 按路由匹配自动高亮。 -->
    <CardTabBar />
  </view>
</template>

<script setup>
import { ICON_T2 } from '../../utils/iconColor.js';
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();
const { brandVars, brandPrimary, brandInkVars } = useBrandOverride();
const user = ref({});
// 头像破图兜底：服务端返回的 avatar 常是非空但加载失败的外链（DB 多为 EMPTY 或 aka.doubaocdn.com 破图），
// 若只判 v-if="user.avatar" 会因「非空」而走 <image> 分支、破图后只剩底色、首字母永远不渲染。
// 加 @error 回落到 v-else 首字母占位（与分销中心 user-avatar 同源处理，2026-10-16 真机报修「头像全黄/无字」）。
const avatarError = ref(false);
watch(() => user.value && user.value.avatar, () => { avatarError.value = false; });
const isMember = ref(false);
const memberLevel = ref('free');
const stats = ref({ cardCount: 0, visitorCount: 0, customerCount: 0, exchangeCount: 0 });

const memberLevelText = computed(() => ({ free: '', silver: '白银', gold: '黄金', diamond: '钻石' }[memberLevel.value]));

onShow(() => { trackPageView('/pages/card/profile'); });

onMounted(async () => {
  try {
    const res = await cardApi.getProfile();
    user.value = res.user;
    if (res.card) {
      stats.value.cardCount = 1;
      stats.value.visitorCount = res.card.viewCount;
      stats.value.exchangeCount = res.card.exchangeCount;
    }
    const member = await cardApi.getMemberStatus();
    isMember.value = member.isMember;
    memberLevel.value = member.level;
    const customers = await cardApi.getCustomers();
    stats.value.customerCount = customers.customers?.length || 0;
  } catch (e) {}
});

function goPage(path) {
  uni.navigateTo({ url: path });
}

// ===== 编辑资料（头像/昵称） =====
const showEdit = ref(false);
const saving = ref(false);
const editForm = ref({ nickname: '', avatar: '', avatarTemp: '' });
// 编辑资料弹层头像同样存在破图风险（editForm.avatar 可能承接破图外链）→ 兜底回落首字母
const editAvatarError = ref(false);
watch(() => editForm.value && editForm.value.avatar, () => { editAvatarError.value = false; });

function openEdit() {
  editForm.value = { nickname: user.value.nickname || '', avatar: user.value.avatar || '', avatarTemp: '' };
  showEdit.value = true;
}
function closeEdit() {
  showEdit.value = false;
}
// MP 微信头像选择（button open-type=chooseAvatar）
function onChooseAvatar(e) {
  const url = e?.detail?.avatarUrl;
  if (url) editForm.value.avatar = url;
}
// H5 相册选择兜底（open-type 在 H5 无效）；MP 端空实现避免与 chooseAvatar 双触发。
// ⚠️ 勿拆成两个 #ifdef 同名函数：uni 编译报 Identifier already declared（check-sfc 可定位）
function h5ChooseAvatar() {
  // #ifdef H5
  uni.chooseImage({
    count: 1,
    success: (res) => {
      const p = res.tempFilePaths && res.tempFilePaths[0];
      if (p) editForm.value.avatar = p;
    },
  });
  // #endif
}

async function saveProfile() {
  if (saving.value) return;
  const nickname = (editForm.value.nickname || '').trim();
  if (!nickname) return uni.showToast({ title: '请填写昵称', icon: 'none' });
  saving.value = true;
  try {
    let avatar = user.value.avatar || '';
    // 头像被更换且是本地临时路径 → 先上传换 URL（网络图直接透传）
    const cur = editForm.value.avatar;
    if (cur && cur !== user.value.avatar) {
      if (/^https?:/.test(cur)) avatar = cur;
      else {
        const up = await cardApi.uploadUserAvatar(cur);
        avatar = up.url;
      }
    }
    const res = await cardApi.updateProfile({ nickname, avatar });
    user.value = res.user || user.value;
    // 同步本地登录缓存，避免分销中心等页面回退显示旧昵称/旧头像
    const cached = uni.getStorageSync('card_user') || {};
    uni.setStorageSync('card_user', { ...cached, nickname: user.value.nickname, avatar: user.value.avatar });
    uni.showToast({ title: '已保存', icon: 'success' });
    closeEdit();
  } catch (e) {
    uni.showToast({ title: String((e && e.message) || e || '保存失败'), icon: 'none' });
  } finally {
    saving.value = false;
  }
}
function showSettings() {
  uni.showToast({ title: '设置功能开发中', icon: 'none' });
}
function showAbout() {
  uni.showModal({
    title: '关于智能名片',
    content: '平台型智能名片系统\n个人自主创建 · 企业统一管理\n版本 1.0.0',
    showCancel: false,
  });
}
function logout() {
  uni.showModal({
    title: '提示',
    content: '确定退出登录吗？',
    success: (res) => {
      if (res.confirm) {
        uni.removeStorageSync('card_token');
        uni.removeStorageSync('card_user');
        // manual=1：登录页同时是冷启动首页，不带这个标记会被 onShow 的首页联动立刻弹走
        uni.reLaunch({ url: loginEntryUrl(LOGIN_PATH) });
      }
    },
  });
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--bg-hover);
  /* 底部TabBar避让：fixed 导航条 ≈110rpx + 安全区，160rpx 与 member 等同批页面一致 */
  padding-bottom: 160rpx;
}
.header {
  background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff));
  padding: 32rpx 32rpx 40rpx;
}
.user-info {
  display: flex;
  align-items: center;
  margin-bottom: 32rpx;
}
.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  /* 占位首字母：白底圆 + --brand-ink（亮黄主色在白底只有 1.75:1，写死主色=隐形） */
  background: var(--white);
  color: var(--brand-ink, var(--design-primary, #165dff));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  font-weight: 700;
  margin-right: 24rpx;
}
.info { flex: 1; }
.nickname {
  font-size: var(--fs-7);
  font-weight: 600;
  color: var(--white);
  margin-bottom: 8rpx;
}
/* 会员等级徽章（2026-10-16 三修）：头部其余药丸（.edit-btn / .user-level）都是
   frosted 半透明白（rgba(255,255,255,0.2) + 白字 + 32rpx 圆角）。第二版改成的
   实心白胶囊（0.95 不透明＋深棕字＋边框）虽然可读，但与头部整体「磨砂玻璃」风格不搭
   （用户反馈「钻石不搭、跟总体样式不搭」）。
   本版与 .edit-btn 完全同源：半透明白底＋白字＋白图标＋32rpx 圆角，坐进任意主题色
   头部都一致。SIcon color 不吃 var()（MP 按 name-ffffff 烘焙 / H5 currentColor 回落
   白），故显式 #ffffff。crown 字形勿改（会员徽章圆环对勾 v5 定稿）。 */
.member-tag {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  background: rgba(255,255,255,0.2);
  color: var(--white);
  padding: 4rpx 16rpx;
  border-radius: 32rpx;
  font-size: var(--fs-1);
  font-weight: 600;
}
.edit-btn {
  background: rgba(255,255,255,0.2);
  color: var(--white);
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  font-size: var(--fs-3);
}
.stats-row {
  display: flex;
  background: rgba(255,255,255,0.15);
  border-radius: 32rpx;
  padding: 24rpx 0;
}
.stat-item {
  flex: 1;
  text-align: center;
}
.stat-num {
  font-size: var(--fs-7);
  font-weight: 700;
  color: var(--white);
  margin-bottom: 6rpx;
}
.stat-label {
  font-size: var(--fs-2);
  color: rgba(255,255,255,0.8);
}
.menu-section {
  margin: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.menu-group {
  background: var(--white);
  border-radius: 32rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.04);
}
.menu-item {
  display: flex;
  align-items: center;
  padding: 28rpx 24rpx;
  border-bottom: 1px solid var(--bg-card);
}
.menu-item:last-child { border-bottom: none; }
.menu-icon {
  font-size: var(--fs-7);
  margin-right: 20rpx;
}
.menu-label {
  flex: 1;
  font-size: var(--fs-5);
  color: var(--t1);
}
.menu-value {
  font-size: var(--fs-3);
  color: var(--brand-orange);
  margin-right: 12rpx;
}
.menu-arrow {
  font-size: var(--fs-6);
  color: var(--border);
}
.menu-item.logout .menu-label {
  color: #f5222d;
  text-align: center;
}

/* 头像（真实图片与文字占位同尺寸） */
.avatar-img {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--white);
}

/* 编辑资料弹层 */
.mask { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: var(--z-sticky); display: flex; align-items: flex-end; }
.sheet { width: 100%; background: var(--white); border-radius: 32rpx 32rpx 0 0; padding: 36rpx 32rpx calc(40rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.sheet-title { font-size: var(--fs-6); font-weight: 600; color: var(--t5); text-align: center; margin-bottom: 28rpx; }
.avatar-choose { display: flex; flex-direction: column; align-items: center; gap: 12rpx; background: transparent; padding: 0; margin: 0 auto 24rpx; line-height: 1.4; border: none; }
.avatar-choose::after { border: none; }
.ac-img { width: 128rpx; height: 128rpx; border-radius: 50%; background: var(--bg-hover); }
.ac-ph { display: flex; align-items: center; justify-content: center; font-size: var(--fs-8); font-weight: 600; color: var(--white); background: var(--design-primary, #165dff); }
.ac-tip { font-size: var(--fs-2); color: var(--t3); }
.field { margin-bottom: 24rpx; }
.field-label { font-size: var(--fs-3); color: var(--t2); margin-bottom: 12rpx; }
.field-input { background: var(--bg-page); border-radius: var(--radius-md); padding: 20rpx 24rpx; font-size: var(--fs-5); color: var(--t5); }
.ph { color: var(--decor-2); }
.sheet-actions { display: flex; gap: 20rpx; margin-top: 32rpx; }
.sheet-btn { flex: 1; text-align: center; padding: 22rpx 0; border-radius: var(--radius-pill); font-size: 30rpx; }
.sheet-btn.cancel { background: var(--bg-page); color: var(--t2); }
.sheet-btn.ok { background: var(--design-primary, #165dff); color: var(--white); font-weight: 500; }
</style>
