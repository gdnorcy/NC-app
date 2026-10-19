<template>
  <!-- ===== 装修我的名片 · 自定义组件列表管理（2026-10-20 V1）
       产品形态来自《手机端名片装修模块》文档，实现对齐项目现状：
       uni-app 页面（非原生小程序代码）；type/props 对齐 web-admin componentRegistry
       （视频号是 finderUserName+feedId，不是旧文档的 feedToken）；母版组件由服务端
       注入 isLock，本页只读置灰；保存走 PUT 整存（server card.js 归属校验+白名单）。 ===== -->
  <view class="ce-page" :style="[themeStyle, brandVars]">
    <PageNav title="装修我的名片" back></PageNav>

    <view class="ce-body">
      <view class="ce-desc">
        组件展示在名片详情页「简介」标签下方。企业母版组件由租户统一设置，不可修改。
        <text class="ce-quota" :class="{ full: mine.length >= COMP_MAX }">已添加 {{ mine.length }}/{{ COMP_MAX }} 个</text>
      </view>

      <view class="ce-empty" v-if="!comps.length && !loading">
        <view class="ce-empty-t">还没有自定义组件</view>
        <view class="ce-empty-d">点击下方「添加组件」，放图片、视频号、文本等到名片里</view>
      </view>

      <view class="ce-list">
        <block v-for="(c, i) in comps" :key="c.key">
          <view class="ce-card" :class="{ lock: c.isLock }">
            <view class="ce-head">
              <text class="ce-icon">{{ iconOf(c.type) }}</text>
              <text class="ce-name">{{ nameOf(c.type) }}</text>
              <text v-if="c.isLock" class="ce-lock-tag">企业母版</text>
            </view>
            <view class="ce-preview">{{ previewOf(c) }}</view>
            <view class="ce-ops">
              <text class="ce-op" :class="{ off: c.isLock || !canMove(i, -1) }" @click="move(i, -1)">上移</text>
              <text class="ce-op" :class="{ off: c.isLock || !canMove(i, 1) }" @click="move(i, 1)">下移</text>
              <text class="ce-op" :class="{ off: c.isLock }" @click="openEdit(c)">编辑</text>
              <text class="ce-op del" :class="{ off: c.isLock }" @click="remove(c)">删除</text>
            </view>
            <view v-if="c.isLock" class="ce-lock-tip">企业母版组件，不可修改</view>
          </view>
        </block>
      </view>

      <view class="ce-add" @click="showPanel = true">
        <text class="ce-add-plus">＋</text>
        <text>{{ mine.length >= COMP_MAX ? '已达上限' : '添加组件' }}</text>
      </view>
    </view>

    <!-- 底部组件选择面板 -->
    <view v-if="showPanel" class="ce-mask" @click="showPanel = false"></view>
    <view v-if="showPanel" class="ce-panel">
      <view class="ce-panel-t">选择组件</view>
      <view class="ce-grid">
        <view v-for="t in CARD_COMP_REGISTRY" :key="t.type" class="ce-grid-item" @click="add(t.type)">
          <text class="ce-grid-icon">{{ ICONS[t.type] }}</text>
          <text class="ce-grid-text">{{ t.name }}</text>
        </view>
      </view>
      <view class="ce-cancel" @click="showPanel = false">取消</view>
    </view>

    <!-- 组件配置弹窗（按注册表 schema 渲染控件子集） -->
    <view v-if="editing" class="ce-mask" @click="closeEdit"></view>
    <view v-if="editing" class="ce-modal">
      <view class="ce-modal-t">{{ nameOf(editing.type) }}配置</view>
      <scroll-view scroll-y class="ce-modal-body">
        <view v-for="f in schemaOf(editing.type)" :key="f.key" class="ce-field">
          <text class="ce-label">{{ f.label }}</text>
          <input
            v-if="f.control === 'input' || f.control === 'link'"
            class="ce-input"
            v-model="editing.props[f.key]"
            :placeholder="f.placeholder || ('请输入' + f.label)"
            placeholder-class="ph"
          />
          <view v-else-if="f.control === 'image'" class="ce-img-row" @click="pickImage(f.key)">
            <image v-if="editing.props[f.key]" :src="editing.props[f.key]" class="ce-img" mode="aspectFill" />
            <view v-else class="ce-img-empty">＋ 上传图片</view>
            <text class="ce-img-tip">点击更换</text>
          </view>
          <view v-else-if="f.control === 'color'" class="ce-color-row">
            <view class="ce-swatches">
              <view
                v-for="col in SWATCHES"
                :key="col.name"
                class="ce-sw"
                :class="{ on: (editing.props[f.key] || '') === col.value, none: col.value === '' }"
                :style="{ background: col.value || '#fff' }"
                @click="editing.props[f.key] = col.value"
              ></view>
            </view>
            <input class="ce-input ce-hex" v-model="editing.props[f.key]" placeholder="留空=透明，或 #RRGGBB" placeholder-class="ph" />
          </view>
          <view v-else-if="f.control === 'slider'" class="ce-slider-row">
            <slider
              class="ce-slider"
              :min="f.min"
              :max="f.max"
              :value="sliderVal(f)"
              :activeColor="activeColor"
              backgroundColor="#e5e6eb"
              block-size="20"
              @change="onSlide(f.key, $event)"
            />
            <text class="ce-slider-v">{{ sliderVal(f) }}</text>
          </view>
          <view v-else-if="f.control === 'radio'" class="ce-radios">
            <view
              v-for="o in f.options"
              :key="String(o.value)"
              class="ce-radio"
              :class="{ on: String(editing.props[f.key]) === String(o.value) }"
              @click="editing.props[f.key] = o.value"
            >{{ o.label }}</view>
          </view>
          <view v-else-if="f.control === 'switch'" class="ce-switch-row">
            <switch :checked="!!editing.props[f.key]" :color="activeColor" @change="editing.props[f.key] = $event.detail.value" />
          </view>
        </view>
      </scroll-view>
      <view class="ce-modal-btns">
        <view class="ce-mbtn cancel" @click="closeEdit">取消</view>
        <view class="ce-mbtn save" @click="saveEdit">保存</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, computed, onMounted } from 'vue';
import { cardApi } from '../../utils/cardApi.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
import { CARD_COMP_REGISTRY, getCompDef, compDefaultProps } from '../../utils/cardCompRegistry.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary } = useBrandOverride();
// slider/switch 的 color 不吃 var()（同 SIcon 纪律），喂真实 hex：品牌色优先，回落主题色
const activeColor = computed(() => brandPrimary.value || themeStyle.value['--design-primary'] || '#FE0137');

// 服务端 card.js COMP_MAX 同源（超限 400）；单测钉两边一致
const COMP_MAX = 20;

const ICONS = { image: '🖼️', 'channel-video': '🎬', notice: '📝', divider: '➖', spacer: '▭' };
const SWATCHES = [
  { name: 'transparent', value: '' },
  { name: 'white', value: '#FFFFFF' },
  { name: 'gray', value: '#F7F8FA' },
  { name: 'line', value: '#E5E6EB' },
  { name: 'cream', value: '#FFF7E8' },
  { name: 'orange', value: '#FF7D00' },
  { name: 'blue', value: '#165DFF' },
  { name: 'green', value: '#00B42A' },
  { name: 'red', value: '#F53F3F' },
  { name: 'ink', value: '#1D2129' },
];

const cardId = ref(null);
const comps = ref([]); // 合并列表：母版(isLock) 在前，个人组件随后（与服务端返回顺序一致）
const loading = ref(false);
const loadFailed = ref(false);
const loadFailedMsg = ref('加载失败，请检查网络后重试');
const showPanel = ref(false);
const editing = ref(null); // { key, type, props } 编辑中的副本
const saving = ref(false);

// 个人自建组件（母版不含）；保存只提交这部分
const mine = computed(() => comps.value.filter((c) => !c.isLock));

function iconOf(type) { return ICONS[type] || '📦'; }
function nameOf(type) { const d = getCompDef(type); return d ? d.name : '组件'; }
function schemaOf(type) { const d = getCompDef(type); return d ? d.schema : []; }

function previewOf(c) {
  const p = c.props || {};
  switch (c.type) {
    case 'image': return p.url ? '图片' : '未设置图片';
    case 'channel-video': return p.title || (p.finderUserName ? `视频号 ${p.finderUserName}` : '未设置视频号');
    case 'notice': return p.text || '未设置文字';
    case 'divider': return p.text ? `分割线（${p.text}）` : '分割线';
    case 'spacer': return `空白 ${p.height ?? 20}px`;
    default: return '';
  }
}

// 母版永远排在个人组件前（服务端注入顺序），上移/下移只在个人组件区间内发生
function canMove(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= comps.value.length) return false;
  return !comps.value[i].isLock && !comps.value[j].isLock;
}

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
    const res = await cardApi.getCardComponents(id);
    comps.value = (res.components || []).map((c, i) => ({ ...c, key: c.id != null ? `s${c.id}` : `t${i}` }));
    loadFailed.value = false;
  } catch (e) {
    loadFailed.value = true;
    loadFailedMsg.value = '组件加载失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

let keySeq = 0;
function add(type) {
  if (mine.value.length >= COMP_MAX) {
    uni.showToast({ title: `自定义组件最多 ${COMP_MAX} 个`, icon: 'none' });
    return;
  }
  showPanel.value = false;
  const item = { key: `n${Date.now()}${keySeq++}`, type, props: compDefaultProps(type), isLock: false };
  comps.value.push(item);
  openEdit(item); // 新增后直接进配置，必填项（视频号ID/视频ID）当场补
}

function move(i, dir) {
  if (!canMove(i, dir)) return;
  const arr = comps.value.slice();
  const tmp = arr[i];
  arr[i] = arr[i + dir];
  arr[i + dir] = tmp;
  comps.value = arr;
  saveAll('已保存');
}

function remove(c) {
  if (c.isLock) return;
  uni.showModal({
    title: '删除组件',
    content: `确定删除「${nameOf(c.type)}」吗？`,
    success: async (r) => {
      if (!r.confirm) return;
      comps.value = comps.value.filter((x) => x.key !== c.key);
      saveAll('已删除');
    },
  });
}

function openEdit(c) {
  if (c.isLock) return;
  // 深拷贝 props：弹窗内改动不直接落列表，点保存才生效
  editing.value = { key: c.key, type: c.type, props: JSON.parse(JSON.stringify(c.props || {})) };
}
function closeEdit() { editing.value = null; }

function saveEdit() {
  const target = comps.value.find((x) => x.key === editing.value.key);
  if (target) target.props = editing.value.props;
  closeEdit();
  saveAll('已保存');
}

function sliderVal(f) {
  const v = Number(editing.value && editing.value.props[f.key]);
  return Number.isFinite(v) ? v : f.min;
}
function onSlide(key, e) {
  if (editing.value) editing.value.props[key] = e.detail.value;
}

async function pickImage(key) {
  uni.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
    success: async (res) => {
      const f = (res.tempFiles && res.tempFiles[0]) || {};
      if (!f.tempFilePath) return;
      uni.showLoading({ title: '上传中…', mask: true });
      try {
        // 复用通用图片上传（/user/avatar-upload 只做存储，返回 URL）
        const data = await cardApi.uploadUserAvatar(f.tempFilePath);
        uni.hideLoading();
        if (data && data.url && editing.value) editing.value.props[key] = data.url;
      } catch (e) {
        uni.hideLoading();
        uni.showToast({ title: e.message || '上传失败', icon: 'none' });
      }
    },
  });
}

// 整存：只提交个人组件（剥离 id/isLock/sortOrder，服务端按数组序重排）
// 个人名片单编辑场景，last-write-wins 可接受；多端同编冲突留 V1.2 加版本号
async function saveAll(okText) {
  if (!cardId.value || saving.value) return;
  saving.value = true;
  try {
    const payload = mine.value.map((c) => ({ type: c.type, props: c.props || {} }));
    await cardApi.saveCardComponents(cardId.value, payload);
    uni.showToast({ title: okText || '已保存', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '保存失败', icon: 'none' });
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* 设计令牌纪律：新页面一律 var(--token)（tokenAudit.test.js 扫裸值）；
   --design-primary 由页面根 themeStyle/brandVars 注入，无需 hex 兜底 */
.ce-page { min-height: 100vh; background: var(--bg-page); }
.ce-body { padding: var(--space-r5) var(--space-r5) 160rpx; }

.ce-desc {
  font-size: var(--fs-3); color: var(--decor); line-height: 1.6;
  background: var(--white); border-radius: var(--radius-md); padding: var(--space-r5); margin-bottom: var(--space-r5);
}
.ce-quota { float: right; color: var(--t2); }
.ce-quota.full { color: var(--danger); }

.ce-empty { text-align: center; padding: 120rpx 0; }
.ce-empty-t { font-size: var(--fs-5); color: var(--t2); font-weight: 500; }
.ce-empty-d { font-size: var(--fs-3); color: var(--decor); margin-top: var(--space-r2); }

.ce-card {
  background: var(--white); border: 1rpx solid var(--border); border-radius: var(--radius-md);
  padding: var(--space-r5); margin-bottom: var(--space-r4);
}
.ce-card.lock { background: var(--bg-card); }
.ce-head { display: flex; align-items: center; }
.ce-icon { font-size: var(--fs-7); margin-right: var(--space-r2); }
.ce-name { font-size: var(--fs-5); color: var(--t1); font-weight: 500; flex: 1; }
.ce-lock-tag {
  font-size: var(--fs-1); color: var(--brand-orange); background: var(--bg-hover);
  border-radius: var(--radius-sm); padding: var(--space-r1) var(--space-r2);
}
.ce-preview { font-size: var(--fs-3); color: var(--decor); margin: var(--space-r2) 0 var(--space-r3); }
.ce-ops { display: flex; gap: var(--space-r2); }
.ce-op {
  font-size: var(--fs-3); color: var(--design-primary);
  border: 1rpx solid var(--design-primary); border-radius: var(--radius-sm);
  padding: var(--space-r1) var(--space-r5);
}
.ce-op.off { color: var(--decor-2); border-color: var(--border); pointer-events: none; }
.ce-op.del { color: var(--danger); border-color: var(--danger); }
.ce-op.del.off { color: var(--decor-2); border-color: var(--border); }
.ce-lock-tip { font-size: var(--fs-2); color: var(--danger); margin-top: var(--space-r2); }

.ce-add {
  margin-top: var(--space-r1); height: 88rpx; border-radius: var(--radius-pill);
  background: var(--design-primary); color: var(--white);
  display: flex; align-items: center; justify-content: center; gap: var(--space-r2);
  font-size: var(--fs-5);
}
.ce-add-plus { font-size: var(--fs-7); }

/* 遮罩 / 底部面板 / 弹窗：同层 var(--z-popup) 靠 DOM 顺序分层（myCard 同款纪律） */
.ce-mask { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-mask); z-index: var(--z-popup); }
.ce-panel {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-popup);
  background: var(--white); border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-r6) var(--space-r5) calc(var(--space-r5) + env(safe-area-inset-bottom));
}
.ce-panel-t { text-align: center; font-size: var(--fs-6); font-weight: 500; color: var(--t1); margin-bottom: var(--space-r6); }
.ce-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-r5); margin-bottom: var(--space-r5); }
.ce-grid-item { display: flex; flex-direction: column; align-items: center; }
.ce-grid-icon { font-size: var(--fs-8); margin-bottom: var(--space-r2); }
.ce-grid-text { font-size: var(--fs-3); color: var(--t1); }
.ce-cancel {
  text-align: center; height: 80rpx; line-height: 80rpx;
  font-size: var(--fs-5); color: var(--t2); border-top: 1rpx solid var(--bg-hover);
}

.ce-modal {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 85%; max-height: 76vh; z-index: var(--z-popup);
  background: var(--white); border-radius: var(--radius-lg); display: flex; flex-direction: column;
}
.ce-modal-t { text-align: center; font-size: var(--fs-6); font-weight: 500; color: var(--t1); padding: var(--space-r6) 0 var(--space-r1); }
.ce-modal-body { padding: var(--space-r3) var(--space-r6) var(--space-r1); }
.ce-field { margin-bottom: var(--space-r5); }
.ce-label { display: block; font-size: var(--fs-4); color: var(--t1); margin-bottom: var(--space-r2); }
.ce-input {
  width: 100%; box-sizing: border-box; border: 1rpx solid var(--border); border-radius: var(--radius-sm);
  padding: var(--space-r3) var(--space-r4); font-size: var(--fs-4); background: var(--white);
}
.ph { color: var(--decor-2); }

.ce-img-row { display: flex; align-items: center; gap: var(--space-r4); }
.ce-img { width: 160rpx; height: 120rpx; border-radius: var(--radius-sm); background: var(--bg-hover); }
.ce-img-empty {
  width: 160rpx; height: 120rpx; border-radius: var(--radius-sm); border: 1rpx dashed var(--border);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--fs-2); color: var(--decor);
}
.ce-img-tip { font-size: var(--fs-2); color: var(--decor); }

.ce-color-row { display: flex; align-items: center; gap: var(--space-r3); }
.ce-swatches { display: flex; flex-wrap: wrap; gap: var(--space-r1); flex: 1; }
.ce-sw { width: 40rpx; height: 40rpx; border-radius: var(--radius-sm); border: 1rpx solid var(--border); }
.ce-sw.on { outline: 3rpx solid var(--design-primary); }
.ce-sw.none { background: var(--white); border-style: dashed; }
.ce-hex { width: 200rpx; }

.ce-slider-row { display: flex; align-items: center; gap: var(--space-r4); }
.ce-slider { flex: 1; }
.ce-slider-v { font-size: var(--fs-3); color: var(--t2); width: 72rpx; text-align: right; }

.ce-radios { display: flex; flex-wrap: wrap; gap: var(--space-r3); }
.ce-radio {
  font-size: var(--fs-3); color: var(--t2); border: 1rpx solid var(--border);
  border-radius: var(--radius-sm); padding: var(--space-r1) var(--space-r5);
}
.ce-radio.on { color: var(--design-primary); border-color: var(--design-primary); background: var(--bg-tag); }

.ce-switch-row { display: flex; justify-content: flex-end; }

.ce-modal-btns { display: flex; gap: var(--space-r4); padding: var(--space-r3) var(--space-r6) var(--space-r6); }
.ce-mbtn { flex: 1; height: 80rpx; line-height: 80rpx; text-align: center; border-radius: var(--radius-sm); font-size: var(--fs-5); }
.ce-mbtn.cancel { background: var(--bg-hover); color: var(--t2); }
.ce-mbtn.save { background: var(--design-primary); color: var(--white); }
</style>
