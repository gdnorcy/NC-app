<template>
  <view class="dynamic-page" :style="[themeStyle, brandVars, brandInkVars]">
<!-- PageNav -->
<PageNav title="我的动态" back>
      <template #right>
        <view class="publish-btn" @click="showPublish = true">+ 发布</view>
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
        <view class="dynamic-content">{{ d.content }}</view>
        <view class="dynamic-images" v-if="d.images?.length">
          <image v-for="(img, i) in d.images" :key="i" :src="img" mode="aspectFill" class="dynamic-img"/>
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

    <!-- 发布弹窗 -->
    <view class="modal-mask" v-if="showPublish" @click="closePublish">
      <view class="bottom-sheet" @click.stop>
        <view class="sheet-header">
          <text class="sheet-title">{{ isEditing ? '编辑动态' : '发布动态' }}</text>
          <text class="sheet-close" @click="closePublish">✕</text>
        </view>
        <view class="sheet-body">
          <!-- 🔴 #312-1：标题输入框。title 字段库里早有 + INSERT 早写，前端一直没入口。
               选填；maxlength 30——朋友圈分享卡片标题 48 字符截断，标题就是给转发用的一句话。 -->
          <input class="title-input" v-model="newDynamic.title" placeholder="添加标题（选填）" placeholder-class="ph" :maxlength="30"/>
          <textarea class="publish-input" v-model="newDynamic.content" placeholder="分享你的想法..." placeholder-class="ph" :maxlength="500"/>
          <!-- 🔴 反馈 #295：动态发布原本**只能发纯文字**（表单里根本没有图片入口，
               后端 images 字段与列表渲染其实早都支持）→ 补上选图入口 + 预览 + 删除。 -->
          <view class="img-picker" v-if="!linkActive">
            <view class="img-grid" v-if="newDynamic.images.length">
              <view class="img-cell" v-for="(img, i) in newDynamic.images" :key="img + i">
                <image class="img-thumb" :src="img" mode="aspectFill"/>
                <view class="img-del" @click="removeImage(i)">✕</view>
              </view>
            </view>
            <view class="img-add" v-if="newDynamic.images.length < MAX_DYNAMIC_IMAGES" @click="pickImages">
              <text class="img-add-icon">＋</text>
              <text class="img-add-text">{{ newDynamic.images.length }}/{{ MAX_DYNAMIC_IMAGES }}</text>
            </view>
          </view>
          <!-- 🔴 #312-2：链接预览卡片 + 小程序卡片（与图片/引用互斥，企微 attachments 三选一） -->
          <view class="form-item" v-if="!imagesActive && !refActive">
            <view class="form-label">链接卡片（可选）</view>
            <view class="link-type">
              <view class="link-type-opt" :class="{ active: newDynamic.link.type === 'page' }" @click="newDynamic.link.type='page'">跳内页</view>
              <view class="link-type-opt" :class="{ active: newDynamic.link.type === 'url' }" @click="newDynamic.link.type='url'">外链</view>
            </view>
            <input class="link-input" v-model="newDynamic.link.url" @input="onLinkInput" :placeholder="newDynamic.link.type === 'url' ? '粘贴外链 https://...' : '内页路径 /pages/xxx'" placeholder-class="ph" />
            <input class="link-input" v-model="newDynamic.link.title" placeholder="卡片标题（选填）" placeholder-class="ph" />
            <input class="link-input" v-model="newDynamic.link.desc" placeholder="卡片描述（选填）" placeholder-class="ph" />
            <input class="link-input" v-model="newDynamic.link.img" placeholder="封面图 URL（选填）" placeholder-class="ph" />
          </view>
          <view class="form-hint" v-if="linkActive">已添加链接卡片，图片与链接互斥</view>

          <!-- 🔴 #312-3：名片模块引用（案例/作品 / 产品），与图片/链接卡片互斥（三选一） -->
          <view class="form-item" v-if="!imagesActive && !linkActive">
            <view class="form-label">引用名片模块（可选）</view>
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
          </view>
          <view class="form-hint" v-else-if="imagesActive">已添加图片，引用与图片互斥（先移除图片）</view>
          <view class="form-hint" v-else-if="linkActive">已添加链接卡片，引用与链接互斥</view>

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
              <switch :checked="schedEnabled" @change="onSchedToggle" color="#165dff" />
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
import { cardApi } from '../../utils/cardApi.js';
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
const newDynamic = ref({ content: '', title: '', images: [], visibility: 'public', link: { type: 'page', url: '', title: '', desc: '', img: '' }, ref: null });
const MAX_DYNAMIC_IMAGES = 9;
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
  editingId.value = d.id;
  // 还原正文/标题/图片/可见范围
  newDynamic.value = {
    content: d.content || '',
    title: d.title || '',
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

/** 关闭弹窗：重置编辑态与定时选择，避免下次「发布」误走「更新」 */
function closePublish() {
  showPublish.value = false;
  editingId.value = null;
  schedEnabled.value = false;
  schedDate.value = '';
  schedTime.value = '';
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
    uni.showLoading({ title: '上传中…', mask: true });
    let ok = 0;
    try {
      for (const f of list) {
        const p = f.tempFilePath || f;
        if (!p) continue;
        const data = await cardApi.uploadDynamicImage(p, f.file);
        if (data && data.url) {
          newDynamic.value.images.push(data.url);
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

onShow(() => { trackPageView('/pages/card/dynamic'); });

onMounted(async () => {
  try {
    const res = await cardApi.getDynamics();
    dynamics.value = res.dynamics || [];
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
    // 🔴 重置必须把 images、title、link、ref、编辑态、定时一并清空，否则下次打开弹窗还挂着上次状态
    newDynamic.value = { content: '', title: '', images: [], visibility: 'public', link: { type: 'page', url: '', title: '', desc: '', img: '' }, ref: null };
    schedEnabled.value = false;
    schedDate.value = '';
    schedTime.value = '';
    editingId.value = null;
    const res = await cardApi.getDynamics();
    dynamics.value = res.dynamics || [];
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
.bottom-sheet {
  width: 100%;
  background: var(--white);
  border-radius: 32rpx 32rpx 0 0;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1px solid var(--bg-hover);
}
.sheet-title { font-size: var(--fs-6); font-weight: 600; color: var(--t1); }
.sheet-close { font-size: var(--fs-6); color: var(--t3); }
.sheet-body { padding: 32rpx; }
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
.form-item { margin-bottom: 20rpx; }
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
.sheet-footer { padding: 0 32rpx 72rpx; }
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
