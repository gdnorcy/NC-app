<template>
  <div class="hew">
    <!-- 背景设置：无 / 自定义背景（ew 1:1） -->
    <div class="hew-sec">背景设置</div>
    <div class="hew-row">
      <el-radio-group v-model="m.bgMode" size="small">
        <el-radio value="none">无</el-radio>
        <el-radio value="custom">自定义背景</el-radio>
      </el-radio-group>
    </div>
    <template v-if="m.bgMode === 'custom'">
      <div class="hew-row">
        <div class="hew-label">背景色</div>
        <el-color-picker v-model="m.bgColor" size="small" />
        <el-input v-model="m.bgColor" size="small" class="hew-hex" />
      </div>
      <div class="hew-row">
        <div class="hew-label">背景图</div>
        <el-button size="small" @click="pickImg('bgImage')">设置</el-button>
        <el-button v-if="m.bgImage" size="small" text type="danger" @click="m.bgImage = ''">清除</el-button>
      </div>
    </template>

    <!-- 头部设置 -->
    <div class="hew-sec">头部设置</div>
    <div class="hew-tip">当头部无功能模块时，背景样式设置仅在APP、微信小程序中生效。</div>
    <div class="hew-row">
      <div class="hew-label">功能模块</div>
      <el-radio-group v-model="m.funcModule" size="small">
        <el-radio value="none">无</el-radio>
        <el-radio value="single">单层模块</el-radio>
        <el-radio value="double">双层模块</el-radio>
      </el-radio-group>
    </div>

    <!-- 功能模块=无：文字颜色（黑/白） -->
    <div v-if="m.funcModule === 'none'" class="hew-row">
      <div class="hew-label">文字颜色</div>
      <el-radio-group v-model="m.textColor" size="small">
        <el-radio value="black">黑色</el-radio>
        <el-radio value="white">白色</el-radio>
      </el-radio-group>
    </div>

    <!-- 左/中/右（单层1组 / 双层2组） -->
    <template v-for="(layer, li) in shownLayers" :key="li">
      <div v-if="m.funcModule === 'double'" class="hew-subsec">第{{ li + 1 }}层</div>

      <!-- 左侧部分 -->
      <div class="hew-row">
        <div class="hew-label">左侧部分</div>
        <el-select v-model="layer.left.type" size="small" class="hew-select">
          <el-option label="不显示" value="none" />
          <el-option label="图片" value="image" />
          <el-option label="图标" value="icon" />
          <el-option label="门店定位" value="store" />
          <el-option label="城市定位" value="city" />
        </el-select>
      </div>
      <template v-if="layer.left.type === 'image'">
        <div class="hew-row">
          <div class="hew-label">图片</div>
          <el-button size="small" @click="pickImg('leftImage', li)">选择图片</el-button>
          <el-button v-if="layer.left.image" size="small" text type="danger" @click="layer.left.image = ''">清除</el-button>
        </div>
        <div class="hew-tip">建议尺寸: 45x45</div>
        <div class="hew-row">
          <div class="hew-label">链接</div>
          <el-input v-model="layer.left.link" size="small" placeholder="请选择链接" class="hew-flex" readonly @click="pickLink('left', li)" />
        </div>
      </template>
      <template v-else-if="layer.left.type === 'icon'">
        <div class="hew-row">
          <div class="hew-label">图标</div>
          <el-select v-model="layer.left.icon" size="small" class="hew-select">
            <el-option v-for="ic in icons" :key="ic" :label="ic" :value="ic" />
          </el-select>
        </div>
        <div class="hew-row">
          <div class="hew-label">颜色</div>
          <el-color-picker v-model="layer.left.color" size="small" />
          <el-input v-model="layer.left.color" size="small" class="hew-hex" />
        </div>
        <div class="hew-row">
          <div class="hew-label">链接</div>
          <el-input v-model="layer.left.link" size="small" placeholder="请选择链接" class="hew-flex" readonly @click="pickLink('left', li)" />
        </div>
      </template>
      <template v-else-if="layer.left.type === 'store'">
        <div class="hew-row"><div class="hew-label">信息</div><el-input v-model="layer.left.store.info" size="small" class="hew-flex" placeholder="门店信息" /></div>
        <div class="hew-row hew-3"><div class="hew-label">省</div><el-input v-model="layer.left.store.province" size="small" placeholder="省" /></div>
        <div class="hew-row hew-3"><div class="hew-label">市</div><el-input v-model="layer.left.store.city" size="small" placeholder="市" /></div>
        <div class="hew-row hew-3"><div class="hew-label">区</div><el-input v-model="layer.left.store.district" size="small" placeholder="区" /></div>
        <div class="hew-row"><div class="hew-label">详细地址</div><el-input v-model="layer.left.store.address" size="small" class="hew-flex" /></div>
        <div class="hew-row"><div class="hew-label">门店名称</div><el-input v-model="layer.left.store.name" size="small" class="hew-flex" /></div>
        <div class="hew-row">
          <div class="hew-label">颜色</div>
          <el-color-picker v-model="layer.left.store.color" size="small" />
          <el-input v-model="layer.left.store.color" size="small" class="hew-hex" />
        </div>
      </template>
      <template v-else-if="layer.left.type === 'city'">
        <div class="hew-row">
          <div class="hew-label">颜色</div>
          <el-color-picker v-model="layer.left.color" size="small" />
          <el-input v-model="layer.left.color" size="small" class="hew-hex" />
        </div>
      </template>

      <!-- 中间部分 -->
      <div class="hew-row">
        <div class="hew-label">中间部分</div>
        <el-select v-model="layer.middle.type" size="small" class="hew-select">
          <el-option label="不显示" value="none" />
          <el-option label="图片" value="image" />
          <el-option label="搜索框" value="search" />
        </el-select>
      </div>
      <template v-if="layer.middle.type === 'image'">
        <div class="hew-row">
          <div class="hew-label">图片</div>
          <el-button size="small" @click="pickImg('middleImage', li)">选择图片</el-button>
          <el-button v-if="layer.middle.image" size="small" text type="danger" @click="layer.middle.image = ''">清除</el-button>
        </div>
        <div class="hew-tip">建议尺寸: 96x30</div>
        <div class="hew-row">
          <div class="hew-label">链接</div>
          <el-input v-model="layer.middle.link" size="small" placeholder="请选择链接" class="hew-flex" readonly @click="pickLink('middle', li)" />
        </div>
      </template>
      <template v-else-if="layer.middle.type === 'search'">
        <div class="hew-row"><div class="hew-label">填充背景</div><el-color-picker v-model="layer.middle.search.fillBg" size="small" /><el-input v-model="layer.middle.search.fillBg" size="small" class="hew-hex" /></div>
        <div class="hew-row"><div class="hew-label">边框背景</div><el-color-picker v-model="layer.middle.search.borderBg" size="small" /><el-input v-model="layer.middle.search.borderBg" size="small" class="hew-hex" /></div>
        <div class="hew-row"><div class="hew-label">图标颜色</div><el-color-picker v-model="layer.middle.search.iconColor" size="small" /><el-input v-model="layer.middle.search.iconColor" size="small" class="hew-hex" /></div>
        <div class="hew-row"><div class="hew-label">默认文字颜色</div><el-color-picker v-model="layer.middle.search.textColor" size="small" /><el-input v-model="layer.middle.search.textColor" size="small" class="hew-hex" /></div>
        <div class="hew-row">
          <div class="hew-label">默认文字</div>
          <el-input-number v-model="layer.middle.search.placeholderLen" :min="0" :max="10" size="small" />
          <span class="hew-slash">/</span>
          <el-input-number v-model="layer.middle.search.placeholderMax" :min="0" :max="10" size="small" />
        </div>
        <div class="hew-row">
          <div class="hew-label">搜索热词</div>
          <el-radio-group v-model="layer.middle.search.hotword" size="small">
            <el-radio :value="true">显示</el-radio>
            <el-radio :value="false">隐藏</el-radio>
          </el-radio-group>
        </div>
        <div class="hew-tip">将随机显示1个设置中配置的搜索热词。</div>
        <div class="hew-row hew-go"><el-button size="small" text type="primary">去设置</el-button></div>
        <div class="hew-row">
          <div class="hew-label">搜索按钮</div>
          <el-radio-group v-model="layer.middle.search.showBtn" size="small">
            <el-radio :value="true">显示</el-radio>
            <el-radio :value="false">隐藏</el-radio>
          </el-radio-group>
        </div>
      </template>

      <!-- 右侧部分 -->
      <div class="hew-row">
        <div class="hew-label">右侧部分</div>
        <el-select v-model="layer.right.type" size="small" class="hew-select">
          <el-option label="不显示" value="none" />
          <el-option label="图片" value="image" />
          <el-option label="图标" value="icon" />
        </el-select>
      </div>
      <template v-if="layer.right.type === 'image'">
        <div class="hew-row">
          <div class="hew-label">图片</div>
          <el-button size="small" @click="pickImg('rightImage', li)">选择图片</el-button>
          <el-button v-if="layer.right.image" size="small" text type="danger" @click="layer.right.image = ''">清除</el-button>
        </div>
        <div class="hew-tip">建议尺寸: 45x45</div>
        <div class="hew-row">
          <div class="hew-label">链接</div>
          <el-input v-model="layer.right.link" size="small" placeholder="请选择链接" class="hew-flex" readonly @click="pickLink('right', li)" />
        </div>
      </template>
      <template v-else-if="layer.right.type === 'icon'">
        <div class="hew-row">
          <div class="hew-label">图标</div>
          <el-select v-model="layer.right.icon" size="small" class="hew-select">
            <el-option v-for="ic in icons" :key="ic" :label="ic" :value="ic" />
          </el-select>
        </div>
        <div class="hew-row">
          <div class="hew-label">颜色</div>
          <el-color-picker v-model="layer.right.color" size="small" />
          <el-input v-model="layer.right.color" size="small" class="hew-hex" />
        </div>
        <div class="hew-row">
          <div class="hew-label">链接</div>
          <el-input v-model="layer.right.link" size="small" placeholder="请选择链接" class="hew-flex" readonly @click="pickLink('right', li)" />
        </div>
      </template>
    </template>

    <!-- 头部背景 -->
    <div class="hew-sec">头部背景</div>
    <div class="hew-row">
      <el-radio-group v-model="m.headBg.mode" size="small">
        <el-radio value="color">纯色</el-radio>
        <el-radio value="image">背景图片</el-radio>
      </el-radio-group>
    </div>
    <div v-if="m.headBg.mode === 'color'" class="hew-row">
      <div class="hew-label">颜色</div>
      <el-color-picker v-model="m.headBg.color" size="small" />
      <el-input v-model="m.headBg.color" size="small" class="hew-hex" />
    </div>
    <div v-else class="hew-row">
      <div class="hew-label">背景图</div>
      <el-button size="small" @click="pickImg('headBg')">选择图片</el-button>
      <el-button v-if="m.headBg.image" size="small" text type="danger" @click="m.headBg.image = ''">清除</el-button>
    </div>
    <div v-if="m.headBg.mode === 'image'" class="hew-tip">建议尺寸: 750*225</div>

    <!-- 滚动后头部背景 -->
    <div class="hew-sec">滚动后头部背景</div>
    <div class="hew-row">
      <el-radio-group v-model="m.scrollBg.mode" size="small">
        <el-radio value="color">纯色</el-radio>
        <el-radio value="image">背景图片</el-radio>
      </el-radio-group>
    </div>
    <div v-if="m.scrollBg.mode === 'color'" class="hew-row">
      <div class="hew-label">颜色</div>
      <el-color-picker v-model="m.scrollBg.color" size="small" />
      <el-input v-model="m.scrollBg.color" size="small" class="hew-hex" />
    </div>
    <div v-else class="hew-row">
      <div class="hew-label">背景图</div>
      <el-button size="small" @click="pickImg('scrollBg')">选择图片</el-button>
      <el-button v-if="m.scrollBg.image" size="small" text type="danger" @click="m.scrollBg.image = ''">清除</el-button>
    </div>
    <div v-if="m.scrollBg.mode === 'image'" class="hew-tip">建议尺寸: 750*225</div>

    <!-- 版权样式 -->
    <div class="hew-sec">版权样式</div>
    <div class="hew-row">
      <el-radio-group v-model="m.copyright" size="small">
        <el-radio value="default">系统默认</el-radio>
        <el-radio value="custom">自定义</el-radio>
      </el-radio-group>
    </div>

    <!-- 素材选择 / 链接选择 -->
    <MaterialPicker v-model="imgSel.show" @confirm="confirmImgSel" />
    <LinkPicker v-model="linkSel.show" :model-link="linkSel.current" @confirm="confirmLinkSel" />
  </div>
</template>

<script>
/** ew 头部方案默认结构（供 PageEditor defaultMeta/全局默认复用） */
export function mkEwHeader() {
  return {
    bgMode: 'none',
    bgColor: '#ffffff',
    bgImage: '',
    funcModule: 'none',
    textColor: 'black',
    headBg: { mode: 'color', color: '#ffffff', image: '' },
    scrollBg: { mode: 'color', color: 'transparent', image: '' },
    layers: [mkEwLayer(), mkEwLayer()],
    copyright: 'default',
  };
}
function mkEwLayer() {
  return {
    left: { type: 'none', image: '', icon: '', color: '#ffffff', link: '', store: { info: '', province: '', city: '', district: '', address: '', name: '', color: '#ffffff' } },
    middle: { type: 'none', image: '', link: '', search: { fillBg: '#f2f2f2', borderBg: '#ffffff', iconColor: '#3d404d', textColor: '#ffffff', placeholder: '', placeholderLen: 0, placeholderMax: 10, hotword: false, showBtn: true } },
    right: { type: 'none', image: '', icon: '', color: '#ffffff', link: '' },
  };
}
</script>

<script setup>
import { ref, computed, watch } from 'vue';
import MaterialPicker from './MaterialPicker.vue';
import LinkPicker from './LinkPicker.vue';

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['update:modelValue']);
function normLayer(layer) {
  const l = layer || {};
  const mk = mkEwLayer();
  return {
    left: { ...mk.left, ...(l.left || {}), store: { ...mk.left.store, ...(l.left?.store || {}) } },
    middle: { ...mk.middle, ...(l.middle || {}), search: { ...mk.middle.search, ...(l.middle?.search || {}) } },
    right: { ...mk.right, ...(l.right || {}) },
  };
}
function normEw(raw) {
  const r = raw || {};
  const base = mkEwHeader();
  const out = { ...base, ...r };
  out.headBg = { ...base.headBg, ...(r.headBg || {}) };
  out.scrollBg = { ...base.scrollBg, ...(r.scrollBg || {}) };
  const arr = Array.isArray(r.layers) && r.layers.length ? r.layers : base.layers;
  out.layers = [normLayer(arr[0] || {}), normLayer(arr[1] || {})];
  return out;
}
const m = ref(normEw(props.modelValue));
let syncing = false;
watch(
  () => props.modelValue,
  (v) => {
    syncing = true;
    m.value = normEw(v);
    setTimeout(() => { syncing = false; }, 0);
  },
  { deep: true },
);
watch(
  m,
  (v) => {
    if (!syncing) emit('update:modelValue', normEw(v));
  },
  { deep: true },
);
const shownLayers = computed(() => {
  const all = m.value.layers;
  if (m.value.funcModule === 'none') return [];
  return m.value.funcModule === 'double' ? all : [all[0]];
});

const icons = ['user', 'building', 'team', 'market', 'exchange', 'pool', 'radar', 'customer', 'audit', 'key', 'chart', 'settings', 'template', 'dynamic', 'dashboard', 'apps', 'orders', 'wallet', 'storage', 'sms', 'panorama', 'card', 'channel', 'devices', 'solutions', 'users', 'logs', 'crown', 'no-ads', 'badge', 'analytics', 'palette', 'wechat', 'mobile', 'official', 'pc', 'dist', 'partner', 'share', 'category', 'area'];

// 素材选择：target 描述写回位置
const imgSel = ref({ show: false, target: null });
const linkSel = ref({ show: false, current: '', target: null });
function pickImg(type, layerIdx) {
  imgSel.value = { show: true, target: { type, layerIdx } };
}
function confirmImgSel(url) {
  const t = imgSel.value.target;
  if (url && t) {
    if (t.type === 'bgImage') m.value.bgImage = url;
    else if (t.type === 'headBg') m.value.headBg.image = url;
    else if (t.type === 'scrollBg') m.value.scrollBg.image = url;
    else if (t.type === 'leftImage') m.value.layers[t.layerIdx].left.image = url;
    else if (t.type === 'middleImage') m.value.layers[t.layerIdx].middle.image = url;
    else if (t.type === 'rightImage') m.value.layers[t.layerIdx].right.image = url;
  }
  imgSel.value.show = false;
}
function pickLink(pos, layerIdx) {
  const layer = m.value.layers[layerIdx];
  linkSel.value = { show: true, current: layer[pos].link || '', target: { pos, layerIdx } };
}
function confirmLinkSel(v) {
  const t = linkSel.value.target;
  if (t) m.value.layers[t.layerIdx][t.pos].link = v;
  linkSel.value.show = false;
}
</script>

<style scoped>
.hew { display: flex; flex-direction: column; gap: 10px; }
.hew-sec { font-size: 13px; font-weight: 600; color: #1d2129; margin-top: 4px; padding: 6px 10px; background: #f7f8fa; border-radius: 6px; }
.hew-subsec { font-size: 12px; font-weight: 600; color: #86909c; margin-top: 2px; }
.hew-tip { font-size: 12px; color: #86909c; line-height: 1.5; }
.hew-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hew-3 .el-input { width: 64px; }
.hew-label { width: 92px; font-size: 13px; color: #4e5969; flex-shrink: 0; white-space: nowrap; }
.hew-select { width: 108px; }
.hew-flex { flex: 1; min-width: 120px; }
.hew-hex { width: 86px; }
.hew-slash { color: #86909c; font-size: 12px; }
.hew-go { justify-content: flex-end; }
.hew :deep(.el-slider__input) { width: 72px; }
</style>
