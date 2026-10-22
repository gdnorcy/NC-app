<template>
  <view class="dynamic-page" :style="[themeStyle, brandVars, brandInkVars]">
<!-- PageNav -->
<PageNav title="我的动态" back>
      <template #right>
        <view class="publish-btn" @click="openPublish">+ 发布</view>
      </template>
    </PageNav>

    <view class="dynamic-list" v-if="dynamics.length">
      <view class="dynamic-item" v-for="d in dynamics" :key="d.id">
        <view class="dynamic-header">
          <view class="dynamic-avatar">{{ user.nickname?.[0] || '我' }}</view>
          <view class="dynamic-info">
            <view class="dynamic-name">{{ user.nickname || '我' }}</view>
            <view class="dynamic-time">{{ d.createdAt?.slice(0, 16) }}</view>
          </view>
          <!-- 🔴 #312-4：可见范围三态：公开 / 仅登录可见 / 仅自己 -->
          <view class="visibility-tag">{{ d.visibility === 'private' ? '仅自己' : d.visibility === 'login' ? '登录可见' : '公开' }}</view>
          <!-- 🔴 #312-5：定时发布中徽标（status=pending 即已设未来时间、尚未到点上架） -->
          <view class="sched-tag" v-if="d.status === 'pending'">{{ schedLabel(d) }}</view>
        </view>
        <!-- 🔴 #312-1：title 字段早在库里（db.js card_dynamic.title）+ INSERT 已写入，
             只差前端输入框。列表页标题加粗单行，超长省略（给转发卡片用的一句话标题）。 -->
        <view class="dynamic-title" v-if="d.title">{{ d.title }}</view>
        <!-- 🔴 反馈 #312-7：动态独立封面（头图）。有 cover 就只放头图，不再重复铺配图，
             否则同一条动态「头图 + 九宫格」两套图挤在一起。点击统一走全量预览。 -->
        <image v-if="d.cover" class="dynamic-cover" :src="d.cover" mode="aspectFill" @click="previewList(d)"/>
        <view class="dynamic-content">{{ d.content }}</view>
        <view class="dynamic-images" v-if="!d.cover && d.images?.length">
          <image v-for="(img, i) in d.images" :key="i" :src="img" mode="aspectFill" class="dynamic-img" @click="previewList(d)"/>
        </view>
        <!-- 🔴 #312-2：链接预览卡片 + 小程序卡片（linkUrl 非空即渲染）；
             🔴 #312-3：名片模块引用（d.ref 非空即渲染，优先于链接卡片）。两者互斥，不会同时出现。 -->
        <DynamicLinkCard v-if="d.linkUrl || d.ref" :d="d" :refObj="d.ref || null" />
        <!-- 🔴 #312-6：本人动态可编辑 / 删除（软删） -->
        <view class="dyn-actions">
          <view class="dyn-action" @click="openEdit(d)">编辑</view>
          <view class="dyn-action danger" @click="removeDynamic(d)">删除</view>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <view class="empty-icon"><SIcon name="dynamic" size="xlarge" :color="ICON_DECOR" /></view>
      <view class="empty-text">暂无动态</view>
      <view class="empty-hint">发布第一条动态吧</view>
    </view>

    <!-- 封面图压缩用屏幕外 canvas（MP type=2d；🔴 禁 display:none——MP 节点查不到 → fixed 移出屏幕） -->
    <canvas type="2d" id="coverCompressCanvas" class="offscreen-canvas" />

    <!-- 发布弹窗
         🔴 反馈 #312-7-6「点了定时发布后页面滚不动，变成滚动弹窗后面的页面」：
         滚动穿透。mask 拦截 touchmove（.stop 阻止冒泡 + .prevent 阻止默认滚动），
         sheet 侧再用 .stop 把内部滚动**截断在 sheet 内**——否则 sheet-body 的滚动会冒泡到
         mask 被一起 preventDefault，表现为「弹窗内也滚不动」。两者必须成对出现。 -->
    <view class="modal-mask" v-if="showPublish" @click="closePublish" @touchmove.stop.prevent="noopScroll">
      <view class="bottom-sheet" @click.stop @touchmove.stop="noopScroll">
        <view class="sheet-header">
          <text class="sheet-title">{{ isEditing ? '编辑动态' : '发布动态' }}</text>
          <text class="sheet-close" @click="closePublish">✕</text>
        </view>
        <view class="sheet-body">
          <!-- 🔴 #312-1：标题输入框。title 字段库里早有 + INSERT 早写，前端一直没入口。
               选填；maxlength 30——朋友圈分享卡片标题 48 字符截断，标题就是给转发用的一句话。 -->
          <!-- 🔴 反馈 #312-7-3：动态自己的封面头图。与下面「链接卡片的封面图」是两个东西——
               这张是动态列表/名片详情里的头图；链接卡片封面只用在链接卡片那张小图上。
               放在最上面是因为它就是「头图」，视觉顺序应与最终展示一致。 -->
          <view class="cover-block">
            <view class="cover-block-head">
              <text class="form-label">动态封面（选填）</text>
              <text class="cover-block-tip">{{ newDynamic.cover ? '已压缩上传' : '不设则默认展示配图' }}</text>
            </view>
            <view class="cover-row">
              <view class="cover-preview" v-if="newDynamic.cover">
                <image :src="newDynamic.cover" mode="aspectFill" class="cover-img" @click="previewCover"/>
                <view class="cover-del" @click="newDynamic.cover = ''">✕</view>
              </view>
              <view class="cover-add" v-else @click="pickDynCover">
                <text class="cover-add-icon">＋</text>
                <text class="cover-add-text">上传封面</text>
              </view>
            </view>
          </view>
          <input class="title-input" v-model="newDynamic.title" placeholder="添加标题（选填）" placeholder-class="ph" :maxlength="30"/>
          <textarea class="publish-input" v-model="newDynamic.content" placeholder="分享你的想法..." placeholder-class="ph" :maxlength="500"/>
          <!-- 🔴 反馈 #295：动态发布原本**只能发纯文字**（表单里根本没有图片入口，
               后端 images 字段与列表渲染其实早都支持）→ 补上选图入口 + 预览 + 删除。
               🔴 反馈 #312-7-5：超过 IMG_SCROLL_THRESHOLD(3) 张改**横向滚动**，不再把 9 张全铺开
               （弹窗高度有限，全铺会把下面的选项顶出屏外）；点任意一张进全屏预览。 -->
          <view class="img-picker" v-if="!linkActive">
            <view class="img-grid" v-if="newDynamic.images.length && newDynamic.images.length <= IMG_SCROLL_THRESHOLD">
              <view class="img-cell" v-for="(img, i) in newDynamic.images" :key="img + i">
                <image class="img-thumb" :src="img" mode="aspectFill" @click="previewPicked(i)"/>
                <view class="img-del" @click.stop="removeImage(i)">✕</view>
              </view>
            </view>
            <scroll-view scroll-x class="img-scroll" v-else-if="newDynamic.images.length" :show-scrollbar="false">
              <view class="img-scroll-inner">
                <view class="img-cell img-cell-fixed" v-for="(img, i) in newDynamic.images" :key="img + i">
                  <image class="img-thumb" :src="img" mode="aspectFill" @click="previewPicked(i)"/>
                  <view class="img-del" @click.stop="removeImage(i)">✕</view>
                </view>
              </view>
            </scroll-view>
            <view class="img-add" v-if="newDynamic.images.length < MAX_DYNAMIC_IMAGES" @click="pickImages">
              <text class="img-add-icon">＋</text>
              <text class="img-add-text">{{ newDynamic.images.length }}/{{ MAX_DYNAMIC_IMAGES }}</text>
            </view>
          </view>
          <!-- 🔴 #312-2：链接预览卡片 + 小程序卡片（与图片/引用互斥，企微 attachments 三选一）。
               反馈：默认收缩（否则一打开弹窗就是一面墙）；编辑带回链接时自动展开。 -->
          <view class="form-item">
            <view class="sec-head" @click="linkOpen = !linkOpen">
              <text class="form-label">链接卡片（可选）</text>
              <view class="sec-head-right">
                <!-- 🔴 反馈 #312-7-3「没有看到封面的入口」：封面原先深埋在**默认收缩**的分区里，
                     折叠状态下完全找不到 → 在分区头右侧直接给出封面入口（有图显示缩略图，
                     没图显示「＋封面」），不用展开也能一键上传。@click.stop 避免顺带切换展开态。 -->
                <image v-if="newDynamic.link.img" :src="newDynamic.link.img" class="sec-thumb" mode="aspectFill" @click.stop="pickCover"/>
                <!-- 复用 .sec-added 的既有徽标样式（不再新写一份 rgba 底：会破 tokenAudit 基线） -->
                <text v-else class="sec-added" @click.stop="pickCover">＋封面</text>
                <text v-if="linkActive" class="sec-added">已添加</text>
                <text class="sec-toggle">{{ linkOpen ? '收起' : '展开' }}</text>
                <text class="sec-arrow" :class="{ open: linkOpen }">›</text>
              </view>
            </view>
            <template v-if="linkOpen">
              <!-- 🔴 反馈 #312-7-4「展开后的内容显得很拥挤」：展开体整块包进 sec-panel
                   （浅底卡片 + 内边距 + 统一纵向间距），控件不再贴着分区头挤成一团。 -->
              <view class="sec-panel">
              <view v-if="imagesActive || refActive" class="form-hint">图片与链接卡片互斥（先移除图片/引用）</view>
              <template v-else>
                <view class="link-type">
                  <view class="link-type-opt" :class="{ active: newDynamic.link.type === 'page' }" @click="newDynamic.link.type='page'">跳内页</view>
                  <view class="link-type-opt" :class="{ active: newDynamic.link.type === 'url' }" @click="newDynamic.link.type='url'">外链</view>
                </view>
                <input class="link-input" v-model="newDynamic.link.url" @input="onLinkInput" :placeholder="newDynamic.link.type === 'url' ? '粘贴外链 https://...' : '内页路径 /pages/xxx'" placeholder-class="ph" />
                <input class="link-input" v-model="newDynamic.link.title" placeholder="卡片标题（选填）" placeholder-class="ph" />
                <input class="link-input" v-model="newDynamic.link.desc" placeholder="卡片描述（选填）" placeholder-class="ph" />
                <!-- 🔴 封面图不再让用户手填 URL：拍照/相册 →（MP）系统裁切 1:1 → 压缩 → 上传换 URL。
                     卡片封面是 120rpx 方形（DynamicLinkCard aspectFill），故按方形裁、限幅 720、JPEG 0.85。 -->
                <view class="form-label">封面图（选填）</view>
                <view class="cover-row">
                  <view class="cover-preview" v-if="newDynamic.link.img">
                    <image :src="newDynamic.link.img" mode="aspectFill" class="cover-img" />
                    <view class="cover-del" @click="newDynamic.link.img = ''">✕</view>
                  </view>
                  <view class="cover-add" v-else @click="pickCover">
                    <text class="cover-add-icon">＋</text>
                    <text class="cover-add-text">拍照 / 上传</text>
                  </view>
                  <view v-if="newDynamic.link.img" class="cover-tip">已裁切压缩</view>
                </view>
              </template>
              </view>
            </template>
          </view>

          <!-- 🔴 #312-3：名片模块引用（案例/作品 / 产品），与图片/链接卡片互斥（三选一）。默认收缩。 -->
          <view class="form-item">
            <view class="sec-head" @click="refOpen = !refOpen">
              <text class="form-label">引用名片模块（可选）</text>
              <view class="sec-head-right">
                <text v-if="refActive" class="sec-added">已添加</text>
                <text class="sec-toggle">{{ refOpen ? '收起' : '展开' }}</text>
                <text class="sec-arrow" :class="{ open: refOpen }">›</text>
              </view>
            </view>
            <template v-if="refOpen">
              <view class="sec-panel">
              <view v-if="imagesActive || linkActive" class="form-hint">图片/链接与引用互斥（先移除图片或清空链接）</view>
              <template v-else>
                <view v-if="newDynamic.ref" class="ref-chip" @click="clearRef">
                  <image v-if="newDynamic.ref.cover" :src="newDynamic.ref.cover" class="ref-chip-img" mode="aspectFill" />
                  <view v-else class="ref-chip-img ref-chip-ph">＋</view>
                  <view class="ref-chip-info">
                    <view class="ref-chip-title">{{ newDynamic.ref.title }}</view>
                    <view class="ref-chip-type">{{ newDynamic.ref.type === 'goods' ? '产品' : '案例/作品' }}</view>
                  </view>
                  <text class="ref-chip-del">✕</text>
                </view>
                <template v-else>
                  <view class="ref-tabs">
                    <view class="ref-tab" :class="{ active: refTab === 'works' }" @click="refTab='works'">案例/作品</view>
                    <view class="ref-tab" :class="{ active: refTab === 'goods' }" @click="refTab='goods'">产品</view>
                  </view>
                  <view class="ref-list" v-if="showRefPicker">
                    <view v-if="refLoading" class="ref-loading">加载中…</view>
                    <view v-else-if="refItems.length === 0" class="ref-empty">暂无{{ refTab === 'goods' ? '产品' : '案例/作品' }}</view>
                    <scroll-view scroll-x class="ref-scroll" v-else>
                      <view class="ref-item" v-for="item in refItems" :key="item.id" @click="selectRef(item)">
                        <image v-if="item.cover" :src="item.cover" class="ref-item-img" mode="aspectFill" />
                        <view v-else class="ref-item-img ref-item-ph">＋</view>
                        <view class="ref-item-title">{{ item.title }}</view>
                      </view>
                    </scroll-view>
                  </view>
                  <view v-if="!showRefPicker" class="ref-open" @click="openRefPicker">＋ 选择{{ refTab === 'goods' ? '产品' : '案例/作品' }}</view>
                </template>
              </template>
              </view>
            </template>
          </view>

          <view class="form-item">
            <view class="form-label">可见范围</view>
            <view class="visibility-options">
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'public' }" @click="newDynamic.visibility='public'">公开</view>
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'login' }" @click="newDynamic.visibility='login'">登录可见</view>
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'private' }" @click="newDynamic.visibility='private'">仅自己</view>
            </view>
          </view>
          <!-- 🔴 #312-5：定时发布。开启后选「日期 + 时间」，到点由服务端自动上架（status pending→active）。
               与图片/链接/引用不冲突（同一动态既挂图又可定时）。 -->
          <view class="form-item">
            <view class="sched-label">
              <text>定时发布</text>
              <switch :checked="schedEnabled" @change="onSchedToggle" :color="schedSwitchColor" />
            </view>
            <block v-if="schedEnabled">
              <picker mode="date" :value="schedDate" @change="onSchedDate" class="sched-picker">
                <view class="sched-picker-inner">{{ schedDate || '选择日期' }}</view>
              </picker>
              <picker mode="time" :value="schedTime" @change="onSchedTime" class="sched-picker">
                <view class="sched-picker-inner">{{ schedTime || '选择时间' }}</view>
              </picker>
              <view class="form-hint" v-if="scheduledActive">将于 {{ schedDate }} {{ schedTime }} 自动发布</view>
              <view class="form-hint" v-else>请选择完整的日期与时间</view>
            </block>
          </view>
        </view>
        <view class="sheet-footer">
          <button class="submit-btn" @click="publish">{{ isEditing ? '保存' : '发布' }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ICON_DECOR } from '../../utils/iconColor.js';
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi, hasCardToken } from '../../utils/cardApi.js';
import { API_HOST } from '../../utils/apiBase.js';
import { mallApi } from '../../utils/mallApi.js';
import { getTid } from '../../utils/mallUtil.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';
import DynamicLinkCard from '../../components/DynamicLinkCard.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary, brandInkVars } = useBrandOverride();

const dynamics = ref([]);
const user = ref({});
const showPublish = ref(false);
// 🔴 反馈 #295：补 images 字段（原来只有 content + visibility，导致「不能加图」）
// 🔴 #312-1：补 title 字段（库里早有，前端一直没输入框）
// 🔴 #312-2：补 link 字段（链接预览卡片 + 小程序卡片）。type: 'page' 跳内页 | 'url' 外链。
// 🔴 #312-3：补 ref 字段（名片模块引用：{type:'works'|'goods', id, title, cover}）。与图片/链接互斥。
// 🔴 #312-7：补 cover 字段（动态自己的封面头图，与 link.img 两码事）。
const newDynamic = ref({ content: '', title: '', cover: '', images: [], visibility: 'public', link: { type: 'page', url: '', title: '', desc: '', img: '' }, ref: null });
const MAX_DYNAMIC_IMAGES = 9;
// 🔴 反馈 #312-7-5：已选图 ≤3 张走九宫格；超过 3 张改横向滚动，不再全铺占满弹窗。
const IMG_SCROLL_THRESHOLD = 3;
/** 空壳表单：发布成功 / 关闭弹窗 / 打开弹窗 三处共用，杜绝「上一条动态被带进新页面」 */
function emptyDynamic() {
  return { content: '', title: '', cover: '', images: [], visibility: 'public', link: { type: 'page', url: '', title: '', desc: '', img: '' }, ref: null };
}
/** 弹窗滚动穿透防护的空处理器（mask 与 sheet 上成对使用，见模板注释） */
function noopScroll() {}
// 🔴 #312-2 / #312-3：图片 / 链接卡片 / 名片模块引用 三者互斥（企微 attachments 三选一）。
//   三 computed 驱动发布器禁用另外两项入口。
const linkActive = computed(() => !!(newDynamic.value.link.url && newDynamic.value.link.url.trim()));
const imagesActive = computed(() => newDynamic.value.images.length > 0);
const refActive = computed(() => !!newDynamic.value.ref);

// 🔴 #312-5：定时发布开关 + 日期/时间选择。scheduledActive 表示已选齐日期与时间（可提交定时）。
const schedEnabled = ref(false);
const schedDate = ref('');
const schedTime = ref('');
const scheduledActive = computed(() => schedEnabled.value && !!schedDate.value && !!schedTime.value);
// 🔴 定时开关配色必须跟品牌走：硬编码 #165dff 在绿色品牌租户下会露蓝（违反主题一致性纪律，
//   cardEntryThemeConsistency 有禁硬编码断言）。取法同 market.vue：品牌主色 → 设计主题 → 兜底。
const schedSwitchColor = computed(() => brandPrimary.value || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');
// 🔴 #312-6：编辑模式。editingId 非空表示正在编辑已有动态；isEditing 驱动弹窗标题/按钮文案。
const editingId = ref(null);
const isEditing = computed(() => !!editingId.value);

// 🔴 #312-3：引用名片模块选择器状态
const showRefPicker = ref(false);
const refTab = ref('works');
const refLoading = ref(false);
const worksList = ref([]);
const goodsList = ref([]);
const myCardId = ref(null);
const refItems = computed(() => (refTab.value === 'goods' ? goodsList.value : worksList.value));
// 🔴 反馈：链接卡片 / 引用名片模块默认收缩（一打开弹窗不该是一面墙）；
//   编辑带回内容时由 openEdit 自动展开。
const linkOpen = ref(false);
const refOpen = ref(false);

/**
 * 未登录守卫（mall orders/cart 同款范式，hasCardToken 即 cardApi 为此导出的）：
 * 发布/编辑入口 + 页面进入都过一遍——否则未登录也能打开发布页，填完才 401。
 */
function ensureLogin() {
  if (hasCardToken()) return true;
  uni.showToast({ title: '请先登录', icon: 'none' });
  uni.reLaunch({ url: '/pages/card/login' });
  return false;
}
/**
 * 🔴 反馈 #312-7-2「发布新动态，会把最后一条动态的内容带到新页面」：
 * 根因是 closePublish 只清了开关类状态（定时/展开态），**没清表单内容**——
 * 只有发布成功那条路径才 reset，取消/点遮罩关闭就会把上次的 content/title/图 留到下次。
 * 修法：抽 resetForm()，打开与关闭**都**调一次（幂等）。
 */
function resetForm() {
  newDynamic.value = emptyDynamic();
  editingId.value = null;
  schedEnabled.value = false;
  schedDate.value = '';
  schedTime.value = '';
  linkOpen.value = false;
  refOpen.value = false;
  showRefPicker.value = false;
}

/** 导航栏「+ 发布」：先过登录守卫，再重置表单后开弹窗 */
function openPublish() {
  if (!ensureLogin()) return;
  resetForm();
  showPublish.value = true;
}
/**
 * 🔴 存储回传的是 /uploads/ 相对路径（storage/local.js）：H5 同源可直接用，
 * 但 MP 的 <image> 会把它当小程序包内路径解析 → 上传成功却显示空白（真机实测）。
 * 按端补全基址：MP 的 API_HOST 是完整域名，H5 是空串（保持同源相对）。
 */
const absUrl = (u) => (typeof u === 'string' && u.startsWith('/') ? API_HOST + u : u);
/** 列表加载/编辑回填统一过一遍：配图、链接封面、引用封面都可能存的是相对路径（含历史数据） */
function hydrateUrls(d) {
  const out = { ...d };
  if (Array.isArray(d.images)) out.images = d.images.map(absUrl);
  if (d.linkImg) out.linkImg = absUrl(d.linkImg);
  if (d.cover) out.cover = absUrl(d.cover);
  if (d.ref && d.ref.cover) out.ref = { ...d.ref, cover: absUrl(d.ref.cover) };
  return out;
}

/** 取本人名片 id（发布动态自动挂在最近一张卡上，引用作品也需要它） */
async function getMyCardId() {
  if (myCardId.value) return myCardId.value;
  if (dynamics.value.length && dynamics.value[0].cardId) { myCardId.value = dynamics.value[0].cardId; return myCardId.value; }
  try {
    const r = await cardApi.getCards();
    const list = r.cards || r.list || (Array.isArray(r) ? r : []);
    myCardId.value = list[0]?.id || null;
  } catch { /* 忽略 */ }
  return myCardId.value;
}

/** 🔴 #312-3：打开引用选择器，懒加载案例/作品 + 产品列表 */
async function openRefPicker() {
  showRefPicker.value = true;
  if (worksList.value.length || goodsList.value.length) return;
  refLoading.value = true;
  try {
    const cid = await getMyCardId();
    if (cid) {
      const w = await cardApi.getCardWorks(cid);
      worksList.value = (w.works || []).map((x) => ({ id: x.id, title: x.title || '案例', cover: x.imageUrl || '' }));
    }
  } catch { /* 无作品则留空 */ }
  try {
    const g = await mallApi.getGoods({ pageSize: 50, tid: getTid() });
    const arr = g.list || g.goods || [];
    goodsList.value = arr.map((x) => ({ id: x.id, title: x.title || '产品', cover: x.thumb || (Array.isArray(x.images) ? x.images[0] : '') }));
  } catch { /* 未开通商城则无产品可引 */ }
  refLoading.value = false;
}

/** 选中某条引用：写入 ref，并清掉图片/链接（互斥） */
function selectRef(item) {
  newDynamic.value.ref = { type: refTab.value, id: item.id, title: item.title, cover: item.cover };
  newDynamic.value.images = [];
  newDynamic.value.link = { type: 'page', url: '', title: '', desc: '', img: '' };
  showRefPicker.value = false;
}

/** 移除已选引用 */
function clearRef() {
  newDynamic.value.ref = null;
}

/** 一旦在链接输入框里打字，清掉已选引用（互斥） */
function onLinkInput() {
  if (newDynamic.value.ref) newDynamic.value.ref = null;
}

// 🔴 #312-5：定时发布开关与日期/时间选择
function onSchedToggle(e) {
  schedEnabled.value = !!e.detail.value;
  if (!schedEnabled.value) { schedDate.value = ''; schedTime.value = ''; }
}
function onSchedDate(e) { schedDate.value = e.detail.value; }
function onSchedTime(e) { schedTime.value = e.detail.value; }
/** 把本地「日期 + 时间」组成本地 ISO 串（带时区），服务端会归一为 UTC 再存 */
function buildScheduledAt() {
  if (!scheduledActive.value) return '';
  const local = new Date(`${schedDate.value}T${schedTime.value}:00`);
  if (isNaN(local.getTime())) return '';
  return local.toISOString();
}
/** 列表「定时发布中」徽标文案 */
function schedLabel() {
  return '定时发布中';
}

// 🔴 #312-6：编辑 / 删除（仅本人）。openEdit 把已有动态灌进表单（含定时还原）；removeDynamic 软删。
function openEdit(d) {
  if (!ensureLogin()) return;
  editingId.value = d.id;
  // 还原正文/标题/图片/封面/可见范围
  newDynamic.value = {
    content: d.content || '',
    title: d.title || '',
    cover: d.cover || '',
    images: Array.isArray(d.images) ? [...d.images] : [],
    visibility: d.visibility || 'public',
    // 还原链接卡片（有 linkUrl 才填，否则给空壳）
    link: d.linkUrl
      ? { type: d.linkType || 'page', url: d.linkUrl || '', title: d.linkTitle || '', desc: d.linkDesc || '', img: d.linkImg || '' }
      : { type: 'page', url: '', title: '', desc: '', img: '' },
    ref: d.ref || null,
  };
  // 定时：pending 且带 scheduledAt → 把 UTC 还原成本地日期/时间回填选择器
  schedEnabled.value = false;
  schedDate.value = '';
  schedTime.value = '';
  if (d.status === 'pending' && d.scheduledAt) fillSchedFromUtc(d.scheduledAt);
  // 链接/引用分区默认收缩，但编辑带回内容时要自动展开（否则用户看不到已配的链接/引用）
  linkOpen.value = !!d.linkUrl;
  refOpen.value = !!d.ref;
  showPublish.value = true;
}

/** 把服务端 UTC 'YYYY-MM-DD HH:MM:SS' 还原成本地日期/时间（回填定时选择器） */
function fillSchedFromUtc(utc) {
  const dt = new Date(String(utc).replace(' ', 'T') + 'Z');
  if (isNaN(dt.getTime())) return;
  const pad = (n) => String(n).padStart(2, '0');
  schedDate.value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  schedTime.value = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  schedEnabled.value = true;
}

/** 软删：弹确认框后调 DELETE，本地即时移除 */
async function removeDynamic(d) {
  uni.showModal({
    title: '删除动态',
    content: '确定删除这条动态吗？删除后不可恢复',
    success: async (r) => {
      if (!r.confirm) return;
      try {
        await cardApi.deleteDynamic(d.id);
        uni.showToast({ title: '已删除', icon: 'success' });
        dynamics.value = dynamics.value.filter((x) => x.id !== d.id);
      } catch (e) {
        uni.showToast({ title: e.message || '删除失败', icon: 'none' });
      }
    },
  });
}

/** 关闭弹窗：整表重置（含正文/标题/配图/封面），避免下次「发布」误走「更新」或带上旧内容 */
function closePublish() {
  showPublish.value = false;
  resetForm();
}

/** 选图：uni.chooseMedia 在 H5 端不保证可用，降级 chooseImage（MP 端 chooseMedia 更完整，支持压缩） */
function chooseImageSource(count, onPicked) {
  if (typeof uni.chooseMedia === 'function') {
    uni.chooseMedia({
      count,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: onPicked,
    });
    return;
  }
  uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: onPicked });
}

/** 🔴 反馈 #295：动态配图上传（先传到服务端换 URL，再随发布提交） */
async function pickImages() {
  const remain = MAX_DYNAMIC_IMAGES - newDynamic.value.images.length;
  if (remain <= 0) return;
  chooseImageSource(remain, async (res) => {
    const files = res.tempFiles || [];
    const paths = res.tempFilePaths || [];
    const list = files.length ? files : paths.map((p) => ({ tempFilePath: p }));
    if (!list.length) return;
    uni.showLoading({ title: '处理中…', mask: true });
    let ok = 0;
    try {
      for (const f of list) {
        const p = f.tempFilePath || f;
        if (!p) continue;
        // 🔴 反馈 #312-7-1「除了封面相片，其他上传的相片有加压缩吗」——原先**没有**：
        //   正文图只靠 chooseMedia 的 sizeType:['compressed']（微信自己的二次压缩，H5 端等于没有），
        //   原图直传既慢又占空间。现在与封面共用同一套 canvas 压缩，只是**保持原比例**、长边 1280。
        let upPath = p;
        let upFile = f.file;
        try {
          const out = await compressImage(p, { square: false, max: CONTENT_MAX, quality: CONTENT_QUALITY });
          if (out && (out.path || out.file)) { upPath = out.path || ''; upFile = out.file; }
        } catch { /* 压缩失败不阻塞发布：原图直传 */ }
        const data = await cardApi.uploadDynamicImage(upPath, upFile);
        if (data && data.url) {
          newDynamic.value.images.push(absUrl(data.url));
          ok++;
        }
      }
    } catch (e) {
      uni.showToast({ title: e.message || '图片上传失败', icon: 'none' });
    } finally {
      uni.hideLoading();
      if (ok) {
        // 🔴 #312-3：加了图片即清空引用与链接（三者互斥），保持发布器状态一致
        newDynamic.value.ref = null;
        newDynamic.value.link = { type: 'page', url: '', title: '', desc: '', img: '' };
        uni.showToast({ title: `已添加 ${ok} 张`, icon: 'none' });
      }
    }
  });
}

function removeImage(i) {
  newDynamic.value.images.splice(i, 1);
}

// 🔴 封面图改造（反馈）：不再让用户手填 URL。拍照/相册选图 →（MP）系统裁切 1:1 → 压缩 → 上传换 URL。
//   为什么按方形：链接卡片封面在 DynamicLinkCard 里是 120rpx 见方（aspectFill），非方形图会被
//   显示层中心裁掉——不如上传前裁好。服务端上传上限 10MB，压缩后（≤720px JPEG）远低于此。
const COVER_MAX = 720;      // 封面最大边长 px（卡片显示仅 60pt，720 余量充足又不过大）
const COVER_QUALITY = 0.85; // JPEG 压缩质量
// 🔴 #312-7-1：正文配图压缩参数。保持**原比例**（不裁方形——正文图要完整构图），
//   只把长边限到 1280：手机屏最宽 ~1170px，1280 已够看又显著小于原图（4000px 级直传太浪费）。
const CONTENT_MAX = 1280;
const CONTENT_QUALITY = 0.85;

/** MP：微信系统裁切（基础库 2.22.0+）。用户取消 / 低版本不支持 → 返回原图（下一步 canvas 中心裁切兜底） */
function cropCoverSquare(src) {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && typeof wx.cropImage === 'function') {
      wx.cropImage({
        src,
        cropScale: '1:1',
        success: (r) => resolve(r.tempFilePath || src),
        fail: () => resolve(src),
      });
      return;
    }
    // #endif
    resolve(src);
  });
}

/**
 * 🔴 #312-7-1：图片压缩**统一入口**（封面与正文图共用一套 canvas 实现，只是参数不同）。
 *   square=true  → 中心裁方形（链接卡片封面 120rpx 见方，非方图会被显示层裁掉，不如上传前裁好）
 *   square=false → 保持原比例，只按 max 限长边（正文图要保留完整构图）
 * 限幅后的最大边长 = max；JPEG 质量 = quality。
 * MP：屏幕外 2d canvas（createImage → drawImage → toTempFilePath）。
 * H5：脱离文档的 canvas（Image → drawImage → toBlob → File）。
 * 返回 { path, file }：MP 给 path（uni.uploadFile 用）；H5 给 file（FormData 必须真 File）。
 */
async function compressImage(src, { square = true, max = COVER_MAX, quality = COVER_QUALITY } = {}) {
  // #ifdef MP-WEIXIN
  const node = await new Promise((resolve) => {
    uni.createSelectorQuery().select('#coverCompressCanvas').fields({ node: true }).exec((r) => {
      resolve(r && r[0] ? r[0].node : null);
    });
  });
  if (!node) return { path: src };
  const img = node.createImage();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  const w = img.width;
  const h = img.height;
  // 取源区：方形取中心正方形，非方形取整图
  const sw = square ? Math.min(w, h) : w;
  const sh = square ? Math.min(w, h) : h;
  if (!sw || !sh) return { path: src };
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  const scale = Math.min(1, max / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));
  node.width = outW;
  node.height = outH;
  const ctx = node.getContext('2d');
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  const path = await new Promise((resolve) => {
    node.toTempFilePath({
      x: 0, y: 0, width: outW, height: outH, destWidth: outW, destHeight: outH,
      fileType: 'jpg', quality,
      success: (r) => resolve(r.tempFilePath),
      fail: () => resolve(src),
    });
  });
  return { path };
  // #endif
  // #ifndef MP-WEIXIN
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const sw = square ? Math.min(w, h) : w;
  const sh = square ? Math.min(w, h) : h;
  if (!sw || !sh) return { path: src };
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  const scale = Math.min(1, max / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));
  const cv = document.createElement('canvas');
  cv.width = outW;
  cv.height = outH;
  cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return { path: src };
  return { path: '', file: new File([blob], 'upload.jpg', { type: 'image/jpeg' }) };
  // #endif
}

/**
 * 封面压缩：中心裁方形 + 限幅 COVER_MAX + JPEG。
 * （保留独立函数名：链接卡片封面的方形语义与正文图不同，调用处一眼能分清。）
 */
async function compressCover(src) {
  return compressImage(src, { square: true, max: COVER_MAX, quality: COVER_QUALITY });
}

/** 选链接卡片封面：chooseMedia（MP 更完整，H5 降级 chooseImage）→ 裁切 → 压缩 → 上传 */
async function pickCover() {
  const res = await new Promise((resolve) => {
    const opts = { count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (r) => resolve(r), fail: () => resolve(null) };
    if (typeof uni.chooseMedia === 'function') {
      uni.chooseMedia({ ...opts, mediaType: ['image'] });
    } else {
      uni.chooseImage(opts);
    }
  });
  if (!res) return;
  const files = res.tempFiles || [];
  let path = (res.tempFilePaths && res.tempFilePaths[0]) || (files[0] && files[0].tempFilePath);
  if (!path) return;
  uni.showLoading({ title: '处理中…', mask: true });
  try {
    path = await cropCoverSquare(path);
    const out = await compressCover(path);
    const data = await cardApi.uploadDynamicImage(out.path, out.file);
    if (data && data.url) newDynamic.value.link.img = absUrl(data.url);
  } catch (e) {
    uni.showToast({ title: e.message || '封面上传失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

/**
 * 🔴 #312-7-3：选「动态封面」（头图）。与 pickCover 的唯一差别是**不裁方形**——
 * 头图是宽幅展示，裁成方的会把左右裁掉。限幅同样走 1280 长边。
 */
async function pickDynCover() {
  const res = await new Promise((resolve) => {
    const opts = { count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (r) => resolve(r), fail: () => resolve(null) };
    if (typeof uni.chooseMedia === 'function') {
      uni.chooseMedia({ ...opts, mediaType: ['image'] });
    } else {
      uni.chooseImage(opts);
    }
  });
  if (!res) return;
  const files = res.tempFiles || [];
  const path = (res.tempFilePaths && res.tempFilePaths[0]) || (files[0] && files[0].tempFilePath);
  if (!path) return;
  uni.showLoading({ title: '处理中…', mask: true });
  try {
    const out = await compressImage(path, { square: false, max: CONTENT_MAX, quality: CONTENT_QUALITY });
    const data = await cardApi.uploadDynamicImage(out.path, out.file);
    if (data && data.url) newDynamic.value.cover = absUrl(data.url);
  } catch (e) {
    uni.showToast({ title: e.message || '封面上传失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

/** 🔴 #312-7-5：发布弹窗里点已选图 → 全屏预览（左右可滑看其余已选） */
function previewPicked(i) {
  const urls = newDynamic.value.images || [];
  if (!urls.length) return;
  uni.previewImage({ urls, current: urls[i] || urls[0] });
}

/** 发布弹窗里点头图 → 预览该封面 */
function previewCover() {
  if (!newDynamic.value.cover) return;
  uni.previewImage({ urls: [newDynamic.value.cover], current: newDynamic.value.cover });
}

/** 列表页点图 → 预览整条动态的图（有封面时封面排第一，与展示顺序一致） */
function previewList(d) {
  const imgs = Array.isArray(d.images) ? d.images : [];
  const urls = d.cover ? [d.cover, ...imgs] : imgs;
  if (!urls.length) return;
  uni.previewImage({ urls });
}

onShow(() => {
  trackPageView('/pages/card/dynamic');
  // 登录态可能在前台过期（token 清除/过期）→ 回前台时补一次守卫
  if (!hasCardToken()) ensureLogin();
});

onMounted(async () => {
  if (!ensureLogin()) return;
  try {
    const res = await cardApi.getDynamics();
    dynamics.value = (res.dynamics || []).map(hydrateUrls);
    const profile = await cardApi.getProfile();
    user.value = profile.user;
  } catch (e) {}
});

async function publish() {
  if (!newDynamic.value.content) {
    uni.showToast({ title: '请输入内容', icon: 'none' });
    return;
  }
  try {
    // 🔴 #312-6：编辑模式走 PUT，发布模式走 POST；提交体字段完全一致（含定时 / 链接 / 引用）。
    const payload = {
      title: newDynamic.value.title || '',
      content: newDynamic.value.content,
      // 🔴 #312-7-3：动态封面头图（独立字段，服务端存 card_dynamic.cover）
      cover: newDynamic.value.cover || '',
      images: newDynamic.value.images,
      visibility: newDynamic.value.visibility,
      // 🔴 #312-2：链接卡片四字段 + targetType。空 url 时服务端会归一为空（不渲染卡片）。
      linkTitle: newDynamic.value.link.title || '',
      linkImg: newDynamic.value.link.img || '',
      linkDesc: newDynamic.value.link.desc || '',
      linkUrl: newDynamic.value.link.url || '',
      linkType: newDynamic.value.link.type || 'page',
      // 🔴 #312-3：名片模块引用。ref 为 null 时传空，服务端不存引用。
      refType: newDynamic.value.ref ? newDynamic.value.ref.type : '',
      refId: newDynamic.value.ref ? newDynamic.value.ref.id : 0,
      // 🔴 #312-5：定时发布。未选齐则传空串（立即发布）；选齐则传本地 ISO，服务端归一为 UTC 并置 pending。
      scheduledAt: buildScheduledAt(),
    };
    if (editingId.value) {
      await cardApi.updateDynamic(editingId.value, payload);
    } else {
      await cardApi.createDynamic(payload);
    }
    uni.showToast({ title: editingId.value ? '已保存' : '发布成功', icon: 'success' });
    showPublish.value = false;
    // 🔴 重置走同一个 resetForm()：images/title/cover/link/ref/编辑态/定时一次清干净，
    //   不再「发布成功才清、取消关闭不清」（反馈 #312-7-2 的根因）。
    resetForm();
    const res = await cardApi.getDynamics();
    dynamics.value = (res.dynamics || []).map(hydrateUrls);
  } catch (e) {
    uni.showToast({ title: e.message || (editingId.value ? '保存失败' : '发布失败'), icon: 'none' });
  }
}
</script>

<style scoped>
.dynamic-page {
  min-height: 100vh;
  background: var(--bg-hover);
  padding-bottom: 40rpx;
}
/* 🔴 发布入口进 PageNav #right 插槽（对齐 collects.vue 等全站子页约定）：
   删掉自绘渐变头 + 重复标题（历史遗留：与 PageNav 标题重复，且 setup 抛错时
   顶到状态栏与系统时间重叠）。胶囊避让由 PageNav rightStyle 负责，这里只管文字。
   品牌色三通道：页面根已合 brandVars（--design-primary/-rgb）+ brandInkVars（--brand-ink）。 */
.publish-btn {
  color: var(--brand-ink, var(--design-primary, var(--primary)));
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  padding: 10rpx 24rpx;
  border-radius: var(--radius-sm);
  font-size: var(--fs-4);
  font-weight: 600;
}
.dynamic-list {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.dynamic-item {
  background: var(--white);
  border-radius: 32rpx;
  padding: 28rpx 24rpx;
  box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.04);
}
.dynamic-header {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}
.dynamic-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--design-primary, var(--primary)), var(--design-gradient, var(--primary)));
  /* 同上：渐变圆上的首字母改走 --brand-hero-ink */
  color: var(--brand-hero-ink, var(--white));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-5);
  margin-right: 16rpx;
}
.dynamic-info { flex: 1; }
.dynamic-name {
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 4rpx;
}
.dynamic-time {
  font-size: var(--fs-2);
  color: var(--border);
}
.visibility-tag {
  font-size: var(--fs-1);
  color: var(--t3);
  background: var(--bg-hover);
  padding: 6rpx 16rpx;
  border-radius: var(--radius-sm);
}
.dynamic-content {
  font-size: var(--fs-5);
  color: var(--t1);
  line-height: 1.7;
  margin-bottom: 16rpx;
}
/* 🔴 #312-6：本人动态的编辑/删除操作区 */
.dyn-actions {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid var(--bg-hover);
}
.dyn-action {
  font-size: var(--fs-3);
  color: var(--design-primary, var(--primary));
  padding: 8rpx 28rpx;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
}
.dyn-action.danger {
  color: var(--danger);
}
/* 🔴 #312-1：列表页标题——加粗、单行、超长省略（对齐小红书/知乎「标题+正文」结构） */
.dynamic-title {
  font-size: var(--fs-6);
  font-weight: 700;
  color: var(--t1);
  margin-bottom: 8rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dynamic-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8rpx;
}
.dynamic-img {
  width: 100%;
  height: 180rpx;
  border-radius: var(--radius-sm);
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: var(--fs-5); color: var(--t2); margin-bottom: 8rpx; }
.empty-hint { font-size: var(--fs-3); color: var(--t3); }
.modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}
/* 🔴 反馈「弹窗无法上下滚动」：sheet 限高 + 纵向 flex，只有 body 区滚动。
   min-height:0 是关键——flex 子项默认 min-height:auto 会被内容撑高，max-height 形同虚设。 */
.bottom-sheet {
  width: 100%;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--white);
  border-radius: 32rpx 32rpx 0 0;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1px solid var(--bg-hover);
  flex-shrink: 0;
}
.sheet-title { font-size: var(--fs-6); font-weight: 600; color: var(--t1); }
.sheet-close { font-size: var(--fs-6); color: var(--t3); }
.sheet-body {
  padding: 32rpx;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.publish-input {
  width: 100%;
  height: 240rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 20rpx 24rpx;
  font-size: var(--fs-5);
  box-sizing: border-box;
  margin-bottom: 24rpx;
}
.ph { color: var(--border); }
/* 🔴 #312-1：发布弹窗标题输入框（选填，30 字上限） */
.title-input {
  width: 100%;
  height: 88rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 0 24rpx;
  font-size: var(--fs-6);
  font-weight: 600;
  color: var(--t1);
  box-sizing: border-box;
  margin-bottom: 16rpx;
}
/* 🔴 反馈 #295：动态配图选择器样式 */
.img-picker { margin-bottom: 24rpx; }
.img-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.img-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--bg-hover);
}
.img-thumb { width: 100%; height: 100%; display: block; }
.img-del {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: var(--white);
  font-size: 22rpx;
}
.img-add {
  width: 200rpx;
  height: 200rpx;
  border-radius: var(--radius-xs);
  border: 2rpx dashed var(--border);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.img-add-icon { font-size: 56rpx; color: var(--t3); line-height: 1; }
.img-add-text { font-size: var(--fs-2); color: var(--t3); margin-top: 8rpx; }
/* 🔴 反馈 #312-7-5：>3 张时横向滚动。scroll-view 内必须用**行内排布**的子容器，
   否则 MP 端会折行（scroll-view 不继承 flex 布局语义）；img-cell-fixed 给固定宽，
   横向滚动场景下 grid 的 1fr 宽度是算不出来的。 */
.img-scroll { width: 100%; white-space: nowrap; margin-bottom: 12rpx; }
.img-scroll-inner { display: inline-flex; gap: 12rpx; padding: 2rpx; }
.img-cell-fixed { width: 200rpx; height: 200rpx; flex-shrink: 0; }
.form-item { margin-bottom: 20rpx; }
/* 🔴 反馈 #312-7-4：展开体包成浅底卡片，纵向统一间距，控件不再贴头挤成一团。
   （margin-top 拉开与分区头的距离；gap 拉开控件彼此的距离） */
.sec-panel {
  margin-top: 20rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.sec-panel .form-label { margin-bottom: 0; }
.sec-panel .link-input,
.sec-panel .link-type,
.sec-panel .ref-tabs { margin-bottom: 0; }
/* 🔴 反馈 #312-7-3：分区头右侧的封面直达入口（折叠状态也能一眼看到）。
   有封面 → 32rpx 缩略图；无封面 → 「＋封面」文字按钮。 */
.sec-thumb {
  width: 40rpx;
  height: 40rpx;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}
/* 🔴 #312-7-3：动态封面（头图）区块。放在标题输入框之上，与最终展示顺序一致。 */
.cover-block { margin-bottom: 24rpx; }
.cover-block-head { display: flex; align-items: baseline; justify-content: space-between; }
.cover-block-head .form-label { margin-bottom: 12rpx; }
.cover-block-tip { font-size: var(--fs-1); color: var(--t3); }
/* 列表页动态封面头图：宽幅 16:9 观感，aspectFill 裁切居中 */
.dynamic-cover {
  width: 100%;
  height: 320rpx;
  border-radius: var(--radius-xs);
  display: block;
  margin-bottom: 16rpx;
  background: var(--bg-hover);
}
.form-label { font-size: var(--fs-4); color: var(--t2); margin-bottom: 12rpx; }
/* 🔴 #312-2：链接卡片表单控件 */
.link-type { display: flex; gap: 16rpx; margin-bottom: 16rpx; }
.link-type-opt {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: var(--fs-4);
  color: var(--t2);
  border: 4rpx solid transparent;
}
.link-type-opt.active {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, var(--primary));
  border-color: var(--design-primary, var(--primary));
}
.link-input {
  width: 100%;
  height: 80rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 0 24rpx;
  font-size: var(--fs-4);
  color: var(--t1);
  box-sizing: border-box;
  margin-bottom: 12rpx;
}
.form-hint { font-size: var(--fs-2); color: var(--t3); margin: 8rpx 0 20rpx; }
/* 🔴 #312-3：引用名片模块选择器 */
.ref-tabs { display: flex; gap: 16rpx; margin-bottom: 16rpx; }
.ref-tab {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: var(--fs-4);
  color: var(--t2);
  border: 4rpx solid transparent;
}
.ref-tab.active {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, var(--primary));
  border-color: var(--design-primary, var(--primary));
}
.ref-list { margin-bottom: 8rpx; }
.ref-loading, .ref-empty { font-size: var(--fs-3); color: var(--t3); padding: 16rpx 0; }
.ref-scroll { white-space: nowrap; }
.ref-item {
  display: inline-block;
  width: 160rpx;
  margin-right: 16rpx;
  vertical-align: top;
}
.ref-item-img {
  width: 160rpx;
  height: 160rpx;
  border-radius: var(--radius-xs);
  background: var(--bg-hover);
  display: block;
}
.ref-item-ph {
  line-height: 160rpx;
  text-align: center;
  font-size: 48rpx;
  color: var(--t3);
}
.ref-item-title {
  font-size: var(--fs-2);
  color: var(--t1);
  margin-top: 8rpx;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ref-open {
  text-align: center;
  padding: 24rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: var(--fs-4);
  color: var(--design-primary, var(--primary));
  margin-bottom: 8rpx;
}
.ref-chip {
  display: flex;
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 16rpx;
  gap: 16rpx;
}
.ref-chip-img {
  width: 96rpx;
  height: 96rpx;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  background: var(--bg-hover);
}
.ref-chip-ph { line-height: 96rpx; text-align: center; font-size: 40rpx; color: var(--t3); }
.ref-chip-info { flex: 1; min-width: 0; }
.ref-chip-title {
  font-size: var(--fs-4);
  font-weight: 600;
  color: var(--t1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ref-chip-type { font-size: var(--fs-2); color: var(--t3); margin-top: 4rpx; }
.ref-chip-del {
  color: var(--t3);
  font-size: 32rpx;
  padding: 8rpx 12rpx;
}
.visibility-options {
  display: flex;
  gap: 16rpx;
}
.visibility-option {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: var(--fs-4);
  color: var(--t2);
  border: 4rpx solid transparent;
}
.visibility-option.active {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, var(--primary));
  border-color: var(--design-primary, var(--primary));
}
/* 🔴 #312-5：定时发布控件 */
.sched-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--fs-4);
  color: var(--t2);
  margin-bottom: 12rpx;
}
.sched-picker { margin-bottom: 12rpx; }
.sched-picker-inner {
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 24rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: var(--fs-4);
  color: var(--t1);
}
/* 🔴 #312-5：列表「定时发布中」徽标 */
.sched-tag {
  font-size: var(--fs-1);
  color: var(--brand-hero-ink, var(--white));
  background: var(--design-primary, var(--primary));
  padding: 6rpx 16rpx;
  border-radius: var(--radius-sm);
}
.sheet-footer { padding: 0 32rpx 72rpx; flex-shrink: 0; }
/* 🔴 反馈：链接卡片 / 引用名片模块默认收缩——一行头 + 已添加徽标 + 箭头，点了才展开 */
.sec-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sec-head .form-label { margin-bottom: 0; }
.sec-head-right { display: flex; align-items: center; gap: 12rpx; }
/* 🔴 反馈：箭头旁加「展开/收起」文字，比裸箭头直观 */
.sec-toggle { font-size: var(--fs-2); color: var(--t3); }
.sec-added {
  font-size: var(--fs-1);
  color: var(--design-primary, var(--primary));
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  padding: 4rpx 14rpx;
  border-radius: var(--radius-sm);
}
.sec-arrow {
  font-size: var(--fs-5);
  color: var(--t3);
  transition: transform 0.15s;
}
.sec-arrow.open { transform: rotate(90deg); }
/* 🔴 封面图：拍照/上传 + 方形预览（不再手填 URL；上传前已系统裁切 1:1 + 压缩） */
.cover-row { display: flex; align-items: center; gap: 20rpx; }
.cover-preview {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--bg-hover);
  flex-shrink: 0;
}
.cover-img { width: 100%; height: 100%; display: block; }
.cover-del {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: var(--white);
  font-size: 22rpx;
}
.cover-add {
  width: 160rpx;
  height: 160rpx;
  border-radius: var(--radius-xs);
  border: 2rpx dashed var(--border);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cover-add-icon { font-size: 48rpx; color: var(--t3); line-height: 1; }
.cover-add-text { font-size: var(--fs-2); color: var(--t3); margin-top: 8rpx; }
.cover-tip { font-size: var(--fs-2); color: var(--t3); }
/* 封面压缩用屏幕外 canvas（禁 display:none——MP 节点查不到） */
.offscreen-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
  width: 360px;
  height: 360px;
}
.submit-btn {
  background: var(--design-primary, var(--primary));
  color: var(--white);
  border-radius: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
