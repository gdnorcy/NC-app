<template>
  <view class="member-page" :style="[navVars, themeStyle, brandVars, tabBarPad]">
    <view class="hero g3" :style="heroStyle">
      <!-- 🔴 2026-10-21 真机报修「会员中心也有上轮的换行问题」：原 hero 用
           padding-top(状态栏+导航行高) 把「返回+标题」整体推到胶囊行下方，
           与上轮 cardDetail/create 修复前同病。改为 PageNav 沉浸式导航行
           （返回+标题与胶囊同排，bg 透明融入渐变），hero 渐变区只留副标题。 -->
      <view class="hero-nav">
        <PageNav title="会员中心" back bg="transparent" :color="heroInk" font-size="30rpx" />
      </view>
      <view class="hero-sub">当前：{{ currentLevelText }}{{ isMember ? ' · 有效期至 ' + memberExpire : ' · 尚未开通' }}</view>
    </view>

    <!-- ===== 租户会员卡（1:1 复刻菜鸟云会员中心） ===== -->
    <block v-if="showTenantMember">
      <!-- 会员卡 -->
      <view v-if="memberCard" class="tcard" :style="cardBg">
        <view class="tc-top">
          <view class="tc-level">{{ memberCard.levelName || '普通会员' }}</view>
          <view class="tc-badge" v-if="memberCard.levelNo">Lv{{ memberCard.levelNo }}</view>
        </view>
        <view class="tc-no">卡号：{{ memberCard.cardNo }}</view>
        <view class="tc-foot">
          <view class="tc-cell"><text class="tc-label">到期时间</text><text class="tc-val">{{ memberCard.expireAt || '永久有效' }}</text></view>
          <view class="tc-cell"><text class="tc-label">积分</text><text class="tc-val">{{ memberCard.score }}</text></view>
          <view class="tc-cell"><text class="tc-label">余额</text><text class="tc-val">¥{{ (memberCard.balance / 100).toFixed(2) }}</text></view>
        </view>
      </view>

      <!-- 等级购买/申请 -->
      <!-- 🔴 2026-10-27 职责重划：租户等级档位改横向滑动（档位条 + 下方选中档详情）。
           原实现 4 张大卡纵向堆叠 → 页面极长、对比档位要上下扫。
           现在：横向 scroll-view 一条紧凑档位条（等级名 + 价格），选中后下方展开该档
           权益说明与购买/申请按钮。MP 端必须用 scroll-view（裸 overflow 横向滚动在真机不跟手）。
           ⚠️ 签到已迁至个人中心（日常动作），本页只留「等级 / 权益 / 购买」；分销入口同步移除。 -->
      <view class="sec-t">会员等级<small>升级解锁更多权益</small></view>
      <view v-if="tenantLevels.length" class="tlevels">
        <!-- 档位条（横向滑动） -->
        <scroll-view class="tlv-scroll" scroll-x :show-scrollbar="false" :scroll-into-view="curLevelAnchor">
          <view class="tlv-track">
            <view
              v-for="lv in tenantLevels"
              :key="lv.id"
              class="tlv-chip"
              :class="{ cur: lv.id === selLevelId }"
              :id="'tlv-' + lv.id"
              @click="selLevelId = lv.id"
            >
              <text class="tlc-name">{{ lv.name }}</text>
              <text class="tlc-price" v-if="lv.buy_price > 0">¥{{ (lv.buy_price / 100).toFixed(0) }}</text>
              <text class="tlc-price cur-tag" v-else-if="lv.id === memberCardLevelId">当前</text>
              <text class="tlc-price" v-else>—</text>
            </view>
          </view>
        </scroll-view>

        <!-- 选中档详情（纵向展开） -->
        <view v-if="selLevel" class="tlv-detail">
          <view class="td-head">
            <view class="td-name">{{ selLevel.name }}</view>
            <view class="td-no" v-if="selLevel.level_no">Lv{{ selLevel.level_no }}</view>
          </view>
          <view class="td-desc">{{ selLevel.description || (selLevel.upgrade_mode === 'apply' ? '申请模式：提交申请，审核通过后开通' : '消费模式：累计消费满额自动升级') }}</view>
          <view v-if="memberCardLevelId === selLevel.id" class="tlv-btn on">当前等级</view>
          <view v-else-if="selLevel.upgrade_mode === 'consume' && selLevel.buy_price > 0" class="tlv-btn buy" @click="buyLevel(selLevel)">¥{{ (selLevel.buy_price / 100).toFixed(0) }} 购买</view>
          <view v-else-if="selLevel.upgrade_mode === 'apply'" class="tlv-btn apply" @click="applyLevel(selLevel)">申请开通</view>
          <view v-else class="tlv-btn disabled">满额自动升级</view>
        </view>
      </view>

      <!-- 申请状态提示 -->
      <view v-if="applyStatus" class="apply-tip" :class="'st-' + applyStatus.status">
        {{ applyTipText }}
      </view>
    </block>

    <!-- ===== 我的权益（按应用分区 + 应用色标 + 紧凑两列网格）=====
         🔴 表达改造（用户诉求：不够高级美观 / 很占位置 / 难分清是哪个应用）：
           - 应用名 → 带色标圆徽（appIcon），一眼分清归属应用
           - 权益名 → 服务端 displayLabel（消费感知短词），不再直给后台配置口径
           - 权益值 → 服务端 valueText（C 端零逻辑），未生效置灰
           - 布局 → 两列网格（原为整行列表，20 项权益会拉出 20 行 → 页面极长）
           - 卡片头 → 统计「已开通 N / 共 M 项」，替代逐条罗列 -->
    <block v-if="appBenefits.length">
      <view class="sec-t">我的权益<small>{{ currentLevelText || '免费版' }}</small></view>
      <view class="ent-card" v-for="app in appBenefits" :key="app.code">
        <view class="ent-head">
          <view class="ent-badge">
            <SIcon :name="app.appIcon" size="small" :color="appInk(app.code)" />
          </view>
          <view class="ent-head-main">
            <text class="ent-app">{{ app.name }}</text>
            <text class="ent-stat">已开通 {{ app.stats.active }} / {{ app.stats.total }} 项</text>
          </view>
        </view>
        <view class="ent-grid">
          <view class="ent-cell" v-for="it in app.items" :key="it.type" :class="{ off: !it.active }">
            <text class="ent-k">{{ it.displayLabel }}</text>
            <text class="ent-v">{{ it.valueText }}</text>
          </view>
        </view>
      </view>
    </block>

    <!-- 🔴 2026-10-27 空白页修复：旧版本页有一张不受 v-if 控制的分销大卡垫底，
         上轮迁走后暴露「游客 / 请求全失败时数据全空 → 页面只剩 hero+tabbar」的死寂空白
         （Promise.all 任一 reject → catch 吞掉 → 三个内容区全隐藏，且 tenantUnbound 仍为 false
         → 连未入驻引导也不显示）。这里给唯一兜底卡，按「未登录 / 未入驻 / 加载失败」三态给文案与动作，
         不再无声空白。条件=三个内容区全空（showTenantMember 与 appBenefits 都为假）。 -->
    <view v-if="!showTenantMember && !appBenefits.length" class="unbound-tip">
      <!-- ⚠️ MP 模板用 view 承载 v-if/v-else-if 链（不用 <template>，规避 MP 编译坑） -->
      <view v-if="!loggedIn">
        <view class="ut-title">登录后查看会员权益</view>
        <view class="ut-sub">登录并入驻后即可开通会员、每日签到领积分、按应用查看专属权益。</view>
        <view class="ut-btn" @click="goLoginThenLoad">去登录</view>
      </view>
      <view v-else-if="tenantUnbound">
        <view class="ut-title">会员开通</view>
        <view class="ut-sub">你还未入驻任何客户，暂无法购买会员卡。入驻后即可开通会员，解锁全部权益。</view>
      </view>
      <view v-else>
        <view class="ut-title">内容加载失败</view>
        <view class="ut-sub">网络开小差了，请重试。</view>
        <view class="ut-btn" @click="loadMemberData">重新加载</view>
      </view>
    </view>

    <!-- 🔴 #312-18c 动作守卫改原地登录：购买/申请未登录时当页弹浮层，登录成功自动继续 -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
    <!-- 底部TabBar（公共组件） -->
    <CardTabBar active="member" />
  </view>
</template>

<script setup>
import { useTabBarPadding } from '../../utils/cardTabBarSpace.js';
import { heroBrandStyle } from '../../utils/templateTheme.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { onUnload } from '@dcloudio/uni-app';
import { cardApi, payOrder } from '../../utils/cardApi.js';
import LoginGateModal from '../../components/LoginGateModal.vue';
import { useInlineLogin } from '../../utils/loginGate.js';
// 🔴 #312-18c 原地登录守卫：requireLogin 返回 Promise，登录成功自动继续被拦下的动作
const { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess } = useInlineLogin();
import { heroGradient, brandPalette } from '../../utils/color.js';
import { trackPageView } from '../../utils/analytics.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import { getChannelTenantName } from './utils/joinMode.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { navVarsStyle } from '../../utils/navMetrics.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

const navVars = navVarsStyle();
const themeStyle = useDesignTheme();
// 底部导航条实测占位（高度随设计方案浮动，禁止写死 → 见 utils/cardTabBarSpace.js）
const tabBarPad = useTabBarPadding();
const { brandVars, brandPrimary } = useBrandOverride();
// SIcon 不能消费 var()（构建期烘焙 hex），用真实 hex 喂图标：主题主色，回落品牌蓝
// （勿改 --design-subtext：那是租户可配文字辅色，配了会与其他页图标色漂移）
// 🔴 2026-10-27：分销入口大卡移除后 themeColor 暂无消费者，但**保留**——
//    全站品牌色口径统一约定（brandCoverage.test.js 逐页扫这一行），删掉会破坏一致性契约；
//    会员卡等级徽章等后续带色图标位直接复用。
const themeColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');
const isMember = ref(false);
// 🔴 2026-10-27：等级名统一走服务端 /member/status 的 levelName（租户档位真名）。
//    旧版这里的 currentLevelText 用前端硬编码映射表 {free,silver,gold,diamond}，
//    租户自建档位（pkg_level=NULL → level='custom'）查不到 → 显示空白；
//    且与会员卡上的档位真名（memberCard.levelName）不同口径 → 同页两种等级名。
//    现统一消费服务端一个字段，本页不再有等级名映射表。
const memberLevelName = ref('');
const memberExpire = ref('');
// 第21轮：套餐权益实况（/member/status 的 entitlements），让「买了什么」在会员中心对得上
const entitlements = ref(null);
// 第22轮：按应用分区的全量权益（/member/status 的 appBenefits），含目录/矩阵/已用量
const appBenefits = ref([]);
// 租户会员卡（1:1 复刻菜鸟云）
const memberCard = ref(null);
const tenantLevels = ref([]);
// 1b：未入驻租户（my-card 返回 unbound）→ 展示购买引导而非无声隐藏
const tenantUnbound = ref(false);
// 🔴 2026-10-27：等级档位改横向滑动 —— 选中档位 id（点档位条切换下方详情）
const selLevelId = ref(0);
// 当前会员所在档位 id（memberCard.levelId，无会员卡时 0）
const memberCardLevelId = computed(() => (memberCard.value && memberCard.value.levelId) || 0);
// 选中档位详情对象
const selLevel = computed(() => tenantLevels.value.find((l) => l.id === selLevelId.value) || null);
// 档位条自动定位到当前会员档位（scroll-into-view 只能定位到某个 id；未选时用当前档位）
const curLevelAnchor = computed(() => {
  const id = selLevelId.value || memberCardLevelId.value;
  return id ? 'tlv-' + id : '';
});
const applyStatus = ref(null);
const showTenantMember = computed(() => !!memberCard.value || tenantLevels.value.length > 0);
// 品牌 5 色 hero：本人名片优先，无则回退品牌蓝渐变（对象形式，与 cardDetail 一致）
const brand = ref({ primary: '', gradient: '', secondary: '', text: '', subText: '' });
// hero 前景（SIcon / PageNav 需要真实 hex，吃不了 var()）：与 heroStyle 同判据产出，
// 品牌亮黄时自动转深灰，避免白图标白字消失在黄底上
const heroInk = computed(() => heroStyle.value.color);
const heroStyle = computed(() => heroBrandStyle(brand.value, 'linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))'));
const paying = ref(false);
// 第20轮：渠道租户名（购买成功文案消费）
const tenantName = computed(() => getChannelTenantName());

// 会员卡背景：等级背景色 → 默认蓝渐变
const cardBg = computed(() => {
  const c = memberCard.value;
  if (c && c.levelBgColor) return { background: c.levelBgColor };
  return { background: 'linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff))' };
});

const applyTipText = computed(() => {
  const s = applyStatus.value;
  if (!s) return '';
  if (s.status === 'pending') return '你的会员申请正在审核中，请耐心等待';
  if (s.status === 'approved') return '你的会员申请已通过';
  return `你的会员申请已被驳回：${s.reason || '未填写原因'}`;
});


// 🔴 2026-10-27：分销中心入口已从本页移除（与个人中心菜单重复；分销是独立业务线，
//    放在会员中心会让人误以为「买会员才能做分销」）→ 统一只在个人中心入口。
//    分销页本身不受影响，仍可从个人中心 / 首页宫格进入。

// 等级名：只用服务端统一口径（租户档位真名），本页不再有映射表
const currentLevelText = computed(() => memberLevelName.value || (isMember.value ? '' : '免费版'));

onShow(() => {
  trackPageView('/pages/card/member');
  // 退出登录原地翻态（记忆 #8）：tab 切回本页时同步登录态，兜底卡按最新态渲染
  loggedIn.value = !!(uni.getStorageSync('card_user') || {}).id;
});

// 登录态（兜底卡三态判定用；与 buyLevel 同判据：card_user 本地缓存）
const loggedIn = ref(!!(uni.getStorageSync('card_user') || {}).id);

// 🔴 2026-10-27 空白页修复：加载逻辑抽成可重入函数 ——
//   「登录跳两次」通解（记忆 #8）：未登录当页弹登录浮层，登录成功原地重入 loadMemberData()，0 次跳转。
//   旧版逻辑内联在 onMounted，请求全失败时页面死寂空白且无法重试。
async function loadMemberData() {
  // 登录类数据：未登录/游客降级为默认态，不阻塞页面
  try {
    const [memberRes, cardsRes, tCardRes, tLevelsRes] = await Promise.all([
      cardApi.getMemberStatus(),
      cardApi.getCardsSafe(),
      cardApi.memberMyCard(),
      cardApi.memberLevels(),
    ]);
    const myCard0 = (cardsRes.cards || [])[0];
    if (myCard0) { const b = brandPalette(myCard0); if (b.primary) Object.assign(brand.value, b); }
    isMember.value = memberRes.isMember;
    // 🔴 等级名统一口径（服务端出，租户档位真名；custom 自建档位不再空白）
    memberLevelName.value = memberRes.levelName || '';
    memberExpire.value = memberRes.expireAt?.slice(0, 10) || '';
    entitlements.value = memberRes.entitlements || null;
    appBenefits.value = memberRes.appBenefits || [];
    // 租户会员卡：未入驻租户不展示区块（降级为购买引导）
    tenantUnbound.value = !!(tCardRes && tCardRes.unbound);
    if (tCardRes && !tCardRes.unbound) {
      memberCard.value = tCardRes.card;
      tenantLevels.value = tCardRes.levels || [];
      applyStatus.value = tCardRes.applyStatus || null;
    }
    // 🔴 档位条初始选中：优先当前会员档位；无会员卡则选第一档（别让详情区空着）
    const lvList = tenantLevels.value.length ? tenantLevels.value : (tLevelsRes?.levels || []);
    if (!tenantLevels.value.length) tenantLevels.value = lvList;
    if (lvList.length) {
      const cur = (tCardRes && tCardRes.card && tCardRes.card.levelId) || 0;
      selLevelId.value = lvList.some((l) => l.id === cur) ? cur : lvList[0].id;
    }
  } catch (e) {
    console.warn('会员信息加载失败（未登录或接口异常，保持默认态）', e);
  }
}

// 兜底卡「去登录」：原地登录浮层（requireLogin 返回 Promise），成功后原地重入加载 —— 不跳登录页
async function goLoginThenLoad() {
  if (await requireLogin()) {
    loggedIn.value = true;
    await loadMemberData();
  }
}

onMounted(() => {
  restoreScrollTop('member');
  loadMemberData();
});

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('member', { scrollTop: h5ScrollTop() });
});

// ===== 租户会员卡：购买 / 申请 =====
// 🔴 #312-18c：老 gotoLogin（toast + reLaunch 登录页）已删除——原地登录由
// useInlineLogin 的 requireLogin 提供，调用方 `if (!(await requireLogin())) return;`。
// 🔴 2026-10-27：签到已迁至个人中心（日常动作），本页不再有签到逻辑；
//    服务端 /member/my-card 的 signed 字段本页不再消费（签到事实统一走 /member/status）。

async function refreshMemberCard() {
  try {
    const res = await cardApi.memberMyCard();
    if (res && !res.unbound) memberCard.value = res.card;
  } catch (e) {}
}

/**
 * 购买会员卡（1b 收敛后全页唯一购买路径：租户等级 member_levels → /member/buy → productType=member_card）。
 *
 * 🔴 支付确认必须 await：`try{} finally{ paying=false }` 只包住「创建订单」的同步段，
 *    showModal 是异步的 → 弹窗还没点，`paying` 锁已释放 → 用户再点一个等级会重复下单。
 *    ✅ 把 showModal 包成 Promise，让锁覆盖到「支付回调结束」为止（与已下线的老 A 路同修法）。
 */
async function buyLevel(lv) {
  if (paying.value) return;
  const userInfo = uni.getStorageSync('card_user') || {};
  if (!userInfo.id && !(await requireLogin())) return;
  paying.value = true;
  uni.showLoading({ title: '创建订单...' });
  try {
    const res = await cardApi.memberBuy({ levelId: lv.id, channel: 'wechat' });
    const orderNo = res.orderNo;
    uni.hideLoading();

    const payConfirmed = await new Promise((resolve) => {
      uni.showModal({
        title: '确认支付',
        content: `确认支付 ¥${(res.amount / 100).toFixed(2)} 开通「${lv.name}」？`,
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false),
      });
    });
    if (!payConfirmed) return;

    uni.showLoading({ title: '支付中...' });
    try {
      // 真实微信支付：预下单 → 调起支付（未配置真实商户号时服务端回落 mock）
      const pay = await payOrder(orderNo, { allowMock: true });
      uni.hideLoading();
      if (pay.paid) {
        uni.showToast({ title: pay.mock ? '开通成功（模拟）' : '开通成功', icon: 'success' });
        setTimeout(async () => {
          await refreshMemberCard();
          // 第20轮口径：purchase 模式购买含场席等级且授予成功 → 补一句场席说明
          try {
            const st = await cardApi.getMemberStatus();
            if (st.marketSubject && st.marketSubject.hasSeat) {
              uni.showToast({ title: `已开通会员，并获得${tenantName.value || '本租户'}集市场席`, icon: 'none' });
            }
          } catch (e) {}
        }, 600);
      } else if (pay.canceled) {
        uni.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        uni.showToast({ title: pay.message || '支付失败', icon: 'none' });
      }
    } catch (e) {
      uni.hideLoading();
      uni.showToast({ title: e.message || '支付失败', icon: 'none' });
    }
  } catch (e) {
    uni.hideLoading();
    uni.showToast({ title: e.message || '创建订单失败', icon: 'none' });
  } finally {
    paying.value = false;
  }
}

async function applyLevel(lv) {
  const userInfo = uni.getStorageSync('card_user') || {};
  if (!userInfo.id && !(await requireLogin())) return;
  uni.showModal({
    title: '申请开通',
    content: `确认申请开通「${lv.name}」会员？审核通过后自动开卡。`,
    success: async (r) => {
      if (!r.confirm) return;
      uni.showLoading({ title: '提交中...' });
      try {
        await cardApi.memberApply({ name: userInfo.nickname || '', phone: userInfo.phone || '', levelId: lv.id });
        uni.hideLoading();
        uni.showToast({ title: '已提交申请', icon: 'success' });
        setTimeout(refreshMemberCard, 600);
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: e.message || '提交失败', icon: 'none' });
      }
    },
  });
}

// 🔴 2026-10-27：doSign 已迁至个人中心（profile.vue）——签到是每天都要来一次的日常动作，
//    会员中心只负责「等级 / 权益 / 购买」。本页不再有签到逻辑。

/** 折扣数值 → 中文几折（0.85 → 8.5 折） */
/**
 * 折扣文案（第22轮起 mall.discount 为百分比口径：0=无折扣，10=打9折，80=打二折）。
 * 🔴 旧版按小数口径（0.8→8折）已在百分比模型下彻底错乱，勿回退。
 */
/** 权益行取值文案：switch→开通态；折扣→折数；配额→已用/上限（0=不限）；其余→值+单位 */
// 🔴 权益展示值改由服务端算好（valueText），C 端零逻辑 → 避免各处口径漂移。
//    旧 entValueText / isEntOff 已删除（前端拼串必然与后台口径分叉）。

/** 应用色标的图标色（SIcon 不能消费 var()，必须喂真实 hex） */
const APP_INK = {
  card: '#165dff',
  member: '#7c3aed',
  mall: '#e8590c',
  market: '#0ca678',
  radar: '#0b7285',
};
function appInk(code) {
  return APP_INK[code] || '#165dff';
}
</script>

<style scoped>
.member-page {
  min-height: 100vh;
  background: var(--bg-page);
  /* 兜底值：真实占位由根视图内联的 tabBarPad 给出（CardTabBar 实测高度 + 24rpx 呼吸间隙）。
     🔴 旧版只靠这个写死的 160rpx，而导航条在「凸起/嵌入 + 安全区」下可达 190rpx+
        → 最后一个套餐卡被导航条压住（真机报修）。勿删内联 tabBarPad。 */
  padding-bottom: 160rpx;
}

/* ===== hero（主题渐变；内联 heroStyle 恒定覆盖此兜底，保持一致防内联失效露 demo 色）===== */
/* 沉浸式：状态栏占位按机型动态取（刘海机 ~44px / 非刘海 ~20px），
   右侧留出胶囊宽度（最小化 + 三个点），不再用写死的 88rpx。 */
.hero.g3 {
  position: relative;
  /* 状态栏+导航行占位由 PageNav 自理（与 create/cardDetail 同方案）；
     hero 渐变区只留副标题行。右侧仍避让胶囊宽度。 */
  padding: 0 40rpx 36rpx;
  padding-right: calc(var(--pnv-capsule-pad, 7px) + 40rpx);
  color: var(--design-text, #fff);
  background: linear-gradient(155deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff));
  overflow: hidden;
}
/* PageNav 负 margin 通栏：抵消 hero 的 40rpx 左右内边距，让导航条背景（透明）通栏 */
.hero-nav { margin: 0 -40rpx; }
.hero-sub { font-size: var(--fs-3); opacity: 0.85; padding-top: 8rpx; }

/* ===== 选择套餐区（1b 收敛：A 路 member_package 购买已下线，CSS 随模板一并移除） ===== */
.sec-t {
  margin: 36rpx 32rpx 20rpx;
  font-size: var(--fs-5);
  font-weight: 600;
  display: flex;
  align-items: center;
  /* 副标题内联跟在标题后（勿用 space-between 顶到最右侧——悬空在卡片右上角不和谐） */
  gap: 12rpx;
  color: var(--t5);
}
.sec-t small {
  font-size: var(--fs-2);
  color: var(--t4);
  font-weight: 400;
}

/* 1b：未入驻租户的购买引导（替代无声隐藏） */
.unbound-tip {
  margin: 28rpx 28rpx 0; background: var(--white); border-radius: var(--radius-md);
  border: 1px solid var(--border); padding: 32rpx 28rpx;
}
.ut-title { font-size: var(--fs-5); font-weight: 600; color: var(--t5); }
.ut-sub { font-size: var(--fs-3); color: var(--t4); margin-top: 10rpx; line-height: 1.6; }
/* 兜底卡动作按钮（去登录 / 重新加载）：整页唯一强 CTA 口径 = 主色实心 */
.ut-btn {
  margin-top: 24rpx; text-align: center; padding: 18rpx;
  border-radius: var(--radius-md); font-size: var(--fs-4); font-weight: 600;
  background: var(--design-primary); color: var(--design-text, #fff);
}
.ut-btn:active { opacity: 0.8; }

/* 第21轮：我的权益（套餐实况）；第22轮改按应用分区（每应用一张卡） */
/* ===== 我的权益（紧凑卡片 + 两列网格）===== */
.ent-card {
  background: var(--white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  margin: 0 28rpx 20rpx;
}
/* 应用色标：一眼分清权益归属哪个应用（用户原话「很难分清是哪个应用」）
   ⚠️ 底色统一走令牌 --bg-hover（禁裸 rgba：memberColorSystem 锁死 rgba(22, 93, 255 等品牌蓝写法，
      tokenAudit 也有 rgba 裸值基线）→ 靠**图标颜色**区分应用，而非底色。 */
.ent-head { display: flex; align-items: center; margin-bottom: 20rpx; }
.ent-badge {
  width: 56rpx; height: 56rpx; border-radius: var(--radius-md); margin-right: 16rpx;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: var(--bg-hover);
}
.ent-head-main { display: flex; flex-direction: column; }
.ent-app {
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--t1);
  line-height: 1.3;
}
.ent-stat {
  font-size: var(--fs-1);
  color: var(--t4);
  margin-top: 4rpx;
}
/* 两列网格：20 项权益从 20 行压到 10 行，页面长度砍半 */
.ent-grid { display: flex; flex-wrap: wrap; }
.ent-cell {
  width: 50%;
  box-sizing: border-box;
  padding: 12rpx 8rpx 12rpx 0;
  display: flex;
  flex-direction: column;
}
.ent-cell.off { opacity: 0.55; }
.ent-k {
  font-size: var(--fs-2);
  color: var(--t2);
  line-height: 1.4;
}
.ent-v {
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--design-primary);
  margin-top: 4rpx;
}

/* 🔴 2026-10-27：分销中心大卡（.dist-entry/.de-*）已从本页移除，
   入口统一收敛到个人中心菜单（分销是独立业务线，不属于会员中心）。 */

/* ===== 租户会员卡 ===== */
.tcard {
  margin: 28rpx 28rpx 0; border-radius: var(--radius-lg); padding: 36rpx 32rpx;
  color: var(--white); position: relative; overflow: hidden; box-shadow: 0 8px 24px rgba(var(--design-primary-rgb), 0.18);
}
.tcard::after {
  content: ''; position: absolute; right: -60rpx; top: -60rpx; width: 240rpx; height: 240rpx;
  border-radius: 50%; background: rgba(255,255,255,0.12);
}
.tc-top { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
.tc-level { font-size: 40rpx; font-weight: 700; }
.tc-badge { font-size: var(--fs-2); background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); padding: 6rpx 18rpx; border-radius: var(--radius-pill); }
.tc-no { font-size: var(--fs-3); opacity: 0.9; margin-top: 10rpx; position: relative; z-index: 1; }
.tc-foot { display: flex; margin-top: 36rpx; position: relative; z-index: 1; }
.tc-cell { flex: 1; }
.tc-label { display: block; font-size: 21rpx; opacity: 0.8; }
.tc-val { display: block; font-size: var(--fs-5); font-weight: 600; margin-top: 6rpx; }
/* 🔴 2026-10-27：签到行（sign-row / si-title / si-sub / sign-btn）已迁至个人中心 profile.vue，本页删除。
   等级档位：纵向大卡（tlv / tlv-head / tlv-name / tlv-no / tlv-desc）→ 横向档位条 + 下方详情。 */

/* ===== 横向档位条（scroll-view 承载横向滚动）=====
   🔴 MP 端铁律：横向滚动必须用 scroll-view（裸 overflow-x 在真机不跟手）。
   ⚠️ scroll-view 必须定高（否则内容被裁），这里给固定高度给内容留足空间。
   ⚠️ 内部 track 用 inline-flex + nowrap：多个 chip 排一行，超出部分由 scroll-view 滚。 */
.tlv-scroll {
  width: 100%;
  height: 132rpx;
  white-space: nowrap;
}
.tlv-track {
  display: inline-flex;
  flex-direction: row;
  align-items: stretch;
  height: 132rpx;
  padding: 0 28rpx;
  box-sizing: border-box;
}
.tlv-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 168rpx;
  height: 108rpx;
  margin-right: 16rpx;
  padding: 0 24rpx;
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-sizing: border-box;
}
.tlv-chip.cur {
  border-color: var(--design-primary);
  background: var(--design-secondary);
}
.tlc-name {
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--t5);
  line-height: 1.3;
  max-width: 200rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.tlc-price {
  font-size: var(--fs-2);
  color: var(--t4);
  margin-top: 8rpx;
}
.tlc-price.cur-tag { color: var(--design-primary); }

/* 选中档详情（纵向展开，与横向条配合） */
.tlv-detail {
  margin: 20rpx 28rpx 0;
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 28rpx;
  border: 1px solid var(--border);
}
.td-head { display: flex; align-items: center; justify-content: space-between; }
.td-name { font-size: var(--fs-6); font-weight: 700; color: var(--t5); }
.td-no { font-size: var(--fs-2); color: var(--design-primary); background: var(--design-secondary); padding: 4rpx 16rpx; border-radius: var(--radius-xs); }
.td-desc { font-size: var(--fs-3); color: var(--t4); margin-top: 12rpx; line-height: 1.6; }
.tlv-btn { margin-top: 24rpx; text-align: center; padding: 18rpx; border-radius: var(--radius-md); font-size: var(--fs-4); font-weight: 600; }
.tlv-btn.buy { background: var(--design-primary); color: var(--design-text, #fff); }
/* b 案：申请开通改次级样式（辅助色底 + 主色字），实心主色为整页唯一强 CTA */
.tlv-btn.apply { background: var(--design-secondary); color: var(--design-primary); border: 1px solid rgba(var(--design-primary-rgb), 0.35); }
.tlv-btn.on { background: var(--design-secondary); color: var(--design-primary); }
.tlv-btn.disabled { background: var(--bg-hover); color: var(--border-strong); }
.tlv-btn:active { opacity: 0.8; }
.apply-tip { margin: 20rpx 28rpx 0; padding: 20rpx 24rpx; border-radius: var(--radius-md); font-size: var(--fs-3); line-height: 1.5; }
.apply-tip.st-pending { background: #fff7e6; color: #ad6800; border: 1px solid #ffd591; }
.apply-tip.st-approved { background: #e7f7ee; color: #07893c; border: 1px solid #a9e7c1; }
.apply-tip.st-rejected { background: #fdecec; color: #b42318; border: 1px solid #f8c4c4; }
</style>
