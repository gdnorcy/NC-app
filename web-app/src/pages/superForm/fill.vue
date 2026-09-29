<template>
  <view class="sf-page">
    <view class="sf-form" :class="layout" :style="globalStyle">
      <view class="sf-form-name" v-if="form.name">{{ form.name }}</view>

      <template v-for="comp in currentPageComponents" :key="comp.id">
        <view class="sf-field">
          <view class="sf-label" v-if="!noTitleTypes.includes(comp.type)">
            {{ comp.content.label || '未命名' }}
            <text v-if="comp.content.required" class="sf-req">*</text>
          </view>

          <!-- 单行/多行文本 -->
          <textarea v-if="comp.type === 'textarea'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" />
          <input v-else-if="comp.type === 'text'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" />

          <!-- 数字 -->
          <input v-else-if="comp.type === 'number'" class="sf-input" type="number" v-model="values[comp.id]" :placeholder="comp.content.placeholder" />

          <!-- 时间 -->
          <input v-else-if="comp.type === 'time'" class="sf-input" :type="timeType(comp.content.dateType)" v-model="values[comp.id]" />

          <!-- 图片上传 -->
          <view v-else-if="comp.type === 'image'" class="sf-upload" @click="pickImage(comp.id)">
            <text v-if="!values[comp.id]">+ 上传图片（最多 {{ comp.content.maxCount }} 张）</text>
            <text v-else>{{ values[comp.id].length }} 张已选</text>
          </view>

          <!-- 附件 -->
          <view v-else-if="comp.type === 'attachment'" class="sf-upload" @click="pickFile(comp.id)">
            <text v-if="!values[comp.id] || !values[comp.id].length">+ 上传附件（最多 {{ comp.content.maxCount }} 个）</text>
            <text v-else>{{ values[comp.id].length }} 个文件已选</text>
          </view>

          <!-- 单项选择 -->
          <view v-else-if="comp.type === 'radio'" class="sf-opts">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt" :class="{ on: values[comp.id] === opt.value }" @click="values[comp.id] = opt.value">{{ opt.label }}</view>
          </view>

          <!-- 多项选择 -->
          <view v-else-if="comp.type === 'checkbox'" class="sf-opts">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt" :class="{ on: (values[comp.id] || []).includes(opt.value) }" @click="toggleCheck(comp.id, opt.value)">{{ opt.label }}</view>
          </view>

          <!-- 下拉选择 -->
          <select v-else-if="comp.type === 'select'" class="sf-input" v-model="values[comp.id]">
            <option value="" disabled>请选择</option>
            <option v-for="(opt, i) in comp.content.options" :key="i" :value="opt.value">{{ opt.label }}</option>
          </select>

          <!-- 日期 -->
          <input v-else-if="comp.type === 'date'" class="sf-input" :type="comp.content.dateType === 'time' ? 'datetime-local' : 'date'" v-model="values[comp.id]" />

          <!-- 定位 -->
          <view v-else-if="comp.type === 'location'" class="sf-loc" @click="getLocation(comp.id)">
            <text v-if="!values[comp.id]">📍 {{ comp.content.tipText || '点击获取定位' }}</text>
            <text v-else>{{ values[comp.id].address }}</text>
          </view>

          <!-- 协议 -->
          <view v-else-if="comp.type === 'agreement'" class="sf-agree" @click="toggleAgree(comp.id)">
            <text class="sf-check" :class="{ on: values[comp.id] }">✓</text>
            <text class="sf-agree-text">{{ comp.content.label }}</text>
            <text v-if="comp.content.linkText" class="sf-link" @click.stop="openLink(comp.content.linkUrl)">{{ comp.content.linkText }}</text>
          </view>

          <!-- 评分 -->
          <view v-else-if="comp.type === 'rate'" class="sf-rate">
            <text v-for="n in (comp.content.max || 5)" :key="n" class="sf-star" :class="{ on: (values[comp.id] || 0) >= n }" @click="values[comp.id] = n">★</text>
          </view>

          <!-- 文件下载 -->
          <view v-else-if="comp.type === 'filedownload'" class="sf-download" @click="openLink(comp.content.fileUrl)">
            📎 {{ comp.content.fileName || '文件下载' }}
          </view>

          <!-- 手机号授权 -->
          <view v-else-if="comp.type === 'phoneauth'" class="sf-auth" @click="authPhone(comp.id)">
            <text v-if="!values[comp.id]">{{ comp.content.placeholder || '授权手机号' }}</text>
            <text v-else>{{ values[comp.id] }}</text>
          </view>

          <!-- 车牌号 -->
          <input v-else-if="comp.type === 'carplate'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder || '请输入车牌号'" />

          <!-- 标题 -->
          <view v-else-if="comp.type === 'title'" class="sf-title" :style="{ fontSize: (comp.content.size || 18) + 'px', textAlign: comp.content.align || 'left', color: comp.content.color || '#303133' }">
            {{ comp.content.text }}
          </view>

          <!-- 富文本 -->
          <view v-else-if="comp.type === 'richtext'" class="sf-richtext" v-html="comp.content.html" />

          <!-- 空白块 -->
          <view v-else-if="comp.type === 'blank'" :style="{ height: (comp.content.height || 20) + 'px' }" />

          <!-- 辅助线 -->
          <view v-else-if="comp.type === 'line'" class="sf-line" :style="{ borderTopStyle: comp.content.style || 'solid', borderTopColor: comp.content.color || '#dcdfe6' }" />

          <!-- 轮播图 -->
          <view v-else-if="comp.type === 'swiper'" class="sf-swiper">
            <swiper v-if="(comp.content.images || []).length" autoplay circular :style="{ height: (comp.content.height || 160) + 'px' }">
              <swiper-item v-for="(img, si) in comp.content.images" :key="si">
                <image :src="img" class="sf-swiper-img" mode="aspectFill" />
              </swiper-item>
            </swiper>
            <view v-else class="sf-swiper-empty">轮播图（{{ (comp.content.images || []).length }} 张）</view>
          </view>

          <!-- 大图模块 -->
          <view v-else-if="comp.type === 'bigimage'" class="sf-bigimage" @click="openLink(comp.content.link)">
            <image v-if="comp.content.image" :src="comp.content.image" class="sf-bigimage-img" mode="widthFix" />
            <view v-else class="sf-bigimage-empty">大图模块</view>
          </view>

          <!-- 视频 -->
          <view v-else-if="comp.type === 'video'" class="sf-video">
            <video v-if="comp.content.src" :src="comp.content.src" :poster="comp.content.poster" controls class="sf-video-el" />
            <view v-else class="sf-video-empty">视频模块</view>
          </view>

          <!-- 后台描述 -->
          <view v-else-if="comp.type === 'backdesc'" class="sf-backdesc">{{ comp.content.text }}</view>

          <!-- 实时动态 -->
          <view v-else-if="comp.type === 'realtime'" class="sf-realtime">
            <text class="sf-realtime-label">{{ comp.content.label }}</text>
            <text class="sf-realtime-count">{{ comp.content.title }}</text>
          </view>

          <!-- 表单支付 -->
          <view v-else-if="comp.type === 'pay'" class="sf-pay">
            <view class="sf-pay-label">{{ comp.content.label }}<text v-if="!(comp.content.specs || []).length" class="sf-pay-amt">¥{{ comp.content.amount }}</text></view>
            <view v-if="(comp.content.specs || []).length" class="sf-pay-specs">
              <view v-for="(sp, spi) in comp.content.specs" :key="spi" class="sf-pay-spec" :class="{ on: (values[comp.id] || {}).spec === sp.name }" @click="selectPay(comp.id, sp)">
                <text class="sf-pay-spec-name">{{ sp.name }}</text>
                <text class="sf-pay-spec-price">¥{{ sp.price }}</text>
              </view>
            </view>
            <view v-else class="sf-pay-tip">需支付 ¥{{ comp.content.amount }}（实际支付将在发布后接入）</view>
          </view>

          <!-- 提交按钮 -->
          <button v-else-if="comp.type === 'submit'" class="sf-submit" @click="submit">{{ comp.content.label || '确认' }}</button>
        </view>
      </template>

      <!-- 分页：下一页 -->
      <view v-if="hasPages && currentPage < pages.length - 1" class="sf-next" @click="nextPage">下一页</view>

      <view v-if="ended" class="sf-ended">表单已结束，感谢您的参与。</view>
      <view v-if="!currentPageComponents.length" class="sf-empty">表单暂无内容，请返回。</view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';

const formId = ref(null);
const form = reactive({ name: '', config: { components: [], settings: {} } });
const values = reactive({});
const ended = ref(false);
const submitting = ref(false);
const currentPage = ref(0);

// 自带标题/纯展示型组件，不在渲染器中再显示通用标题
const noTitleTypes = ['submit', 'agreement', 'backdesc', 'title', 'richtext', 'blank', 'line', 'swiper', 'bigimage', 'video', 'realtime', 'pagebreak', 'filedownload', 'pay'];

// 纯展示 / 非输入型组件，不参与校验
const DISPLAY_TYPES = ['submit', 'filedownload', 'backdesc', 'title', 'richtext', 'blank', 'line', 'swiper', 'bigimage', 'video', 'realtime', 'pagebreak'];

const layout = computed(() => form.config.settings?.layout || 'vertical');
const globalStyle = computed(() => {
  const g = form.config.settings?.globalStyle || {};
  return {
    marginTop: (g.marginTop || 0) + 'px',
    paddingTop: (g.marginY || 0) + 'px',
    paddingBottom: (g.marginY || 0) + 'px',
    paddingLeft: (g.marginX || 0) + 'px',
    paddingRight: (g.marginX || 0) + 'px',
  };
});

const components = computed(() => form.config.components || []);

// when 联动：被规则隐藏的字段默认不可见，条件满足才显示
const visibleComponents = computed(() => {
  const logic = form.config.settings?.logic || [];
  const targeted = new Set();
  const shown = new Set();
  logic.filter((r) => r.action === 'show').forEach((r) => {
    (r.showIds || []).forEach((id) => targeted.add(id));
    if (values[r.compId] === r.option) (r.showIds || []).forEach((id) => shown.add(id));
  });
  const hidden = [...targeted].filter((id) => !shown.has(id));
  // 结束表单规则
  const endRule = logic.find((r) => r.action === 'end' && values[r.compId] === r.option);
  if (endRule) ended.value = true;
  return components.value.filter((c) => !hidden.includes(c.id));
});

// 分页：按 pagebreak 把可见组件切成多页（pagebreak 本身只是分隔符，不渲染）
const pages = computed(() => {
  const all = visibleComponents.value;
  if (!all.length) return [[]];
  if (!all.some((c) => c.type === 'pagebreak')) return [all];
  const result = [];
  let cur = [];
  for (const c of all) {
    if (c.type === 'pagebreak') { result.push(cur); cur = []; }
    else cur.push(c);
  }
  result.push(cur);
  return result;
});

// 删除分页导致页数变少时，把当前页收敛回有效范围
watch(pages, () => {
  const max = pages.value.length - 1;
  if (currentPage.value > max) currentPage.value = Math.max(0, max);
});

const hasPages = computed(() => pages.value.length > 1);
const currentPageComponents = computed(() => pages.value[currentPage.value] || []);

onLoad((opts) => {
  formId.value = opts?.formId || opts?.id;
  if (formId.value) load();
});

async function load() {
  try {
    const res = await cardApi.getSuperForm(formId.value);
    form.name = res.name;
    form.config = res.config || { components: [], settings: {} };
    currentPage.value = 0;
    // 无规格的支付项预置金额，便于提交时记录
    components.value.forEach((c) => {
      if (c.type === 'pay' && (!c.content.specs || !c.content.specs.length)) {
        values[c.id] = { amount: c.content.amount || 0 };
      }
    });
  } catch (e) {
    uni.showToast({ title: '表单加载失败', icon: 'none' });
  }
}

function toggleCheck(id, val) {
  if (!Array.isArray(values[id])) values[id] = [];
  const arr = values[id];
  const i = arr.indexOf(val);
  if (i >= 0) arr.splice(i, 1); else arr.push(val);
}

function pickImage(id) {
  // P1 简化：记录文件名（真实上传在后续迭代补全）
  uni.chooseImage({
    count: 9,
    success: (r) => { values[id] = r.tempFiles.map((f) => f.name); },
  });
}

function timeType(dt) {
  if (dt === 'time') return 'time';
  if (dt === 'datetime') return 'datetime-local';
  return 'date';
}

function pickFile(id) {
  const max = compMax(id);
  // H5 端用 input file；小程序端走 chooseMessageFile（此处 H5 简化记录文件名）
  uni.chooseMessageFile
    ? uni.chooseMessageFile({
        count: max,
        success: (r) => { values[id] = r.tempFiles.map((f) => f.name); },
      })
    : uni.chooseImage({ count: max, success: (r) => { values[id] = r.tempFiles.map((f) => f.name); } });
}

function compMax(id) {
  const c = components.value.find((x) => x.id === id);
  return c?.content?.maxCount || 9;
}

function getLocation(id) {
  uni.getLocation({
    type: 'gcj02',
    success: (res) => { values[id] = { address: `${res.latitude.toFixed(4)}, ${res.longitude.toFixed(4)}`, lat: res.latitude, lng: res.longitude }; },
    fail: () => uni.showToast({ title: '获取定位失败', icon: 'none' }),
  });
}

function authPhone(id) {
  // 真实环境下走微信授权拿手机号；此处简化为填入测试号
  uni.showModal({
    title: '手机号授权',
    editable: true,
    placeholderText: '请输入手机号',
    success: (r) => { if (r.confirm && r.content) values[id] = r.content; },
  });
}

function toggleAgree(id) {
  values[id] = !values[id];
}

function openLink(url) {
  if (!url) return;
  // 小程序/ H5 统一用 webview 或外链打开
  if (url.startsWith('http')) {
    // H5 直接打开；小程序端应跳 web-view 页，此处兜底
    window?.open ? window.open(url, '_blank') : uni.navigateTo({ url: '/pages/webview?src=' + encodeURIComponent(url) });
  } else {
    uni.navigateTo({ url });
  }
}

function selectPay(id, sp) {
  values[id] = { spec: sp.name, amount: sp.price };
}

// 校验指定组件列表，返回第一条错误文案或 null
function validateList(list) {
  for (const c of list) {
    if (DISPLAY_TYPES.includes(c.type)) continue;
    const v = values[c.id];
    const ct = c.content;

    // 协议：必须勾选
    if (c.type === 'agreement') {
      if (ct.required && !v) return '请先勾选：' + (ct.label || '协议');
      continue;
    }
    // 评分：必填需 >0
    if (c.type === 'rate') {
      if (ct.required && !(Number(v) > 0)) return (ct.label || '评分') + '为必填项';
      continue;
    }

    // 支付：有规格时必须选择
    if (c.type === 'pay') {
      if (ct.specs && ct.specs.length) {
        if (!v || !v.spec) return (ct.label || '支付项') + '请选择规格';
      }
      continue;
    }

    if (ct.required) {
      const empty = v == null || v === '' || (Array.isArray(v) ? v.length === 0 : (typeof v === 'object' && !v.address ? true : String(v).trim() === ''));
      if (empty) return (ct.label || '该项') + '为必填项';
    }
    if (c.type === 'text' && v) {
      const s = String(v).trim();
      if (ct.minLength && s.length < ct.minLength) return ct.label + `至少 ${ct.minLength} 位`;
      if (ct.maxLength && s.length > ct.maxLength) return ct.label + `最多 ${ct.maxLength} 位`;
      if (ct.contentType === 'phone' && !/^1[3-9]\d{9}$/.test(s)) return ct.label + '格式不正确（手机号）';
      if (ct.contentType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return ct.label + '格式不正确（邮箱）';
      if (ct.contentType === 'idcard' && !/(^\d{15}$)|(^\d{17}[\dXx]$)/.test(s)) return ct.label + '格式不正确（身份证）';
    }
    if (c.type === 'number' && v !== '' && v != null) {
      const n = Number(v);
      if (ct.min != null && n < ct.min) return (ct.label || '数字') + `不能小于 ${ct.min}`;
      if (ct.max != null && n > ct.max) return (ct.label || '数字') + `不能大于 ${ct.max}`;
    }
    if (c.type === 'carplate' && v) {
      const re = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]$/;
      if (!re.test(String(v).trim().toUpperCase())) return (ct.label || '车牌号') + '格式不正确';
    }
  }
  return null;
}

// 提交时校验全部可见组件（跨页）
function validate() {
  return validateList(visibleComponents.value);
}

// 翻页时只校验当前页
function validatePage(i) {
  return validateList(pages.value[i] || []);
}

function nextPage() {
  const err = validatePage(currentPage.value);
  if (err) { uni.showToast({ title: err, icon: 'none' }); return; }
  if (currentPage.value < pages.value.length - 1) currentPage.value++;
  if (uni.pageScrollTo) uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

async function submit() {
  if (submitting.value) return;
  const err = validate();
  if (err) { uni.showToast({ title: err, icon: 'none' }); return; }
  const settings = form.config.settings || {};
  if (!settings.submit || settings.submit.secondConfirm !== false) {
    const ok = await uni.showModal({ title: '提示', content: (settings.basic?.tipText) || '确认提交？' });
    if (!ok.confirm) return;
  }
  submitting.value = true;
  try {
    await cardApi.submitSuperForm(formId.value, JSON.parse(JSON.stringify(values)));
    const jump = settings.submit?.jumpLink;
    if (jump) { uni.redirectTo({ url: jump }); return; }
    uni.showToast({ title: '提交成功', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style>
.sf-page { background: #f2f3f5; min-height: 100vh; padding: 16px; box-sizing: border-box; }
.sf-form { background: #fff; border-radius: 12px; }
.sf-form.horizontal { display: flex; flex-wrap: wrap; gap: 12px; }
.sf-form.horizontal .sf-field { flex: 1 1 45%; }
.sf-form-name { font-size: 18px; font-weight: 600; padding: 16px 16px 4px; }
.sf-field { padding: 12px 16px; }
.sf-label { font-size: 14px; color: #303133; margin-bottom: 8px; }
.sf-req { color: #f56c6c; margin-left: 2px; }
.sf-input { width: 100%; border: 1px solid #dcdfe6; border-radius: 6px; padding: 10px; font-size: 14px; box-sizing: border-box; background: #fff; }
textarea.sf-input { min-height: 84px; }
.sf-upload { border: 1px dashed #c0c4cc; border-radius: 6px; padding: 18px; text-align: center; color: #909399; font-size: 13px; }
.sf-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.sf-opt { border: 1px solid #dcdfe6; border-radius: 6px; padding: 8px 14px; font-size: 14px; }
.sf-opt.on { border-color: #409eff; color: #409eff; background: #ecf5ff; }
.sf-submit { width: 100%; border: none; border-radius: 8px; padding: 12px; background: #409eff; color: #fff; font-size: 16px; margin-top: 6px; }
.sf-ended { text-align: center; color: #909399; padding: 30px; }
.sf-empty { text-align: center; color: #c0c4cc; padding: 30px; }
.sf-loc { border: 1px solid #dcdfe6; border-radius: 6px; padding: 10px; font-size: 14px; color: #409eff; background: #ecf5ff; text-align: center; }
.sf-agree { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #606266; flex-wrap: wrap; }
.sf-check { width: 18px; height: 18px; border: 1px solid #c0c4cc; border-radius: 4px; text-align: center; line-height: 18px; color: #fff; flex-shrink: 0; }
.sf-check.on { background: #409eff; border-color: #409eff; }
.sf-agree-text { flex: 1; }
.sf-link { color: #409eff; }
.sf-rate { display: flex; gap: 4px; }
.sf-star { font-size: 26px; color: #dcdfe6; }
.sf-star.on { color: #f7ba2a; }
.sf-download { border: 1px solid #dcdfe6; border-radius: 6px; padding: 10px; font-size: 14px; color: #409eff; background: #ecf5ff; text-align: center; }
.sf-auth { border: 1px solid #dcdfe6; border-radius: 6px; padding: 10px; font-size: 14px; color: #409eff; text-align: center; background: #fff; }
.sf-title { font-weight: 600; padding: 4px 0; }
.sf-richtext { font-size: 14px; color: #303133; line-height: 1.6; }
.sf-line { border-top-width: 1px; margin: 4px 0; }
.sf-swiper { width: 100%; border-radius: 8px; overflow: hidden; }
.sf-swiper-img { width: 100%; height: 100%; display: block; }
.sf-swiper-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: 6px; padding: 24px; text-align: center; color: #909399; font-size: 13px; }
.sf-bigimage { width: 100%; border-radius: 8px; overflow: hidden; }
.sf-bigimage-img { width: 100%; display: block; }
.sf-bigimage-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: 6px; padding: 30px; text-align: center; color: #909399; font-size: 13px; }
.sf-video { width: 100%; border-radius: 8px; overflow: hidden; }
.sf-video-el { width: 100%; display: block; }
.sf-video-empty { background: #000; color: #fff; text-align: center; padding: 30px; font-size: 13px; }
.sf-backdesc { font-size: 13px; color: #909399; background: #f5f6f8; border-radius: 6px; padding: 10px 12px; line-height: 1.6; }
.sf-realtime { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #606266; background: #ecf5ff; border-radius: 6px; padding: 10px 12px; }
.sf-realtime-label { font-weight: 600; }
.sf-realtime-count { color: #409eff; }
.sf-next { width: 100%; border: 1px solid #409eff; border-radius: 8px; padding: 12px; background: #fff; color: #409eff; font-size: 16px; text-align: center; margin-top: 6px; }
.sf-pay { border: 1px solid #f0c78a; border-radius: 8px; padding: 12px; background: #fffaf0; }
.sf-pay-label { font-size: 14px; color: #303133; font-weight: 600; margin-bottom: 8px; }
.sf-pay-amt { color: #f56c6c; margin-left: 6px; }
.sf-pay-specs { display: flex; flex-direction: column; gap: 8px; }
.sf-pay-spec { display: flex; justify-content: space-between; border: 1px solid #dcdfe6; border-radius: 6px; padding: 10px 12px; font-size: 14px; }
.sf-pay-spec.on { border-color: #f0a020; background: #fff3e0; }
.sf-pay-spec-price { color: #f56c6c; font-weight: 600; }
.sf-pay-tip { font-size: 12px; color: #909399; }
</style>
