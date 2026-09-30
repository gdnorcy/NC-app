<template>
  <view class="sf-page" :style="pageBgStyle">
    <view class="sf-form" :class="layout" :style="globalStyle">
      <view class="sf-form-name" v-if="form.name">{{ form.name }}</view>

      <template v-for="comp in currentPageComponents" :key="comp.id">
        <view class="sf-field" :class="{ 'cs-line': comp.style && comp.style.styleType === 'line' }" :style="fieldStyle(comp)">
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

          <!-- 图片上传（ew picture-upload：普通/身份证/营业执照 三种模式联动） -->
          <view v-else-if="comp.type === 'image'">
            <!-- 普通：示例图 + 多选上传（最少/最多限制） -->
            <template v-if="(comp.content.imageType || 'normal') === 'normal'">
              <view class="sf-upload" :class="{ 'has-sample': comp.content.sampleImg }" @click="pickImage(comp.id)">
                <image v-if="comp.content.sampleImg" class="sf-sample" :src="comp.content.sampleImg" mode="aspectFill" />
                <text v-else class="sf-camera">+</text>
              </view>
              <text class="sf-upload-tip">上传图片（{{ limitText(comp.content) }}）</text>
              <view v-if="(values[comp.id] || []).length" class="sf-upload-list">
                <text v-for="(n, i) in values[comp.id]" :key="i" class="sf-upload-item">已选 {{ i + 1 }} · {{ n }}</text>
              </view>
            </template>
            <!-- 身份证：人像面 / 国徽面 双槽 -->
            <template v-else-if="comp.content.imageType === 'idcard'">
              <view class="sf-id-row">
                <view class="sf-id-box" @click="pickIdFace(comp.id, 'ward')">
                  <image class="sf-id-bg" src="/static/superform/id-front.png" mode="widthFix" />
                  <text class="sf-camera-circle">+</text>
                  <text class="sf-id-face" v-if="values[comp.id] && values[comp.id].ward">已上传</text>
                  <text class="sf-id-text">证件人像面</text>
                </view>
                <view class="sf-id-box" @click="pickIdFace(comp.id, 'back')">
                  <image class="sf-id-bg" src="/static/superform/id-beck.png" mode="widthFix" />
                  <text class="sf-camera-circle">+</text>
                  <text class="sf-id-face" v-if="values[comp.id] && values[comp.id].back">已上传</text>
                  <text class="sf-id-text">证件国徽面</text>
                </view>
              </view>
            </template>
            <!-- 营业执照：单槽 -->
            <template v-else>
              <view class="sf-id-row">
                <view class="sf-id-box sf-license-box" @click="pickLicense(comp.id)">
                  <image class="sf-id-bg" src="/static/superform/license.png" mode="widthFix" />
                  <text class="sf-camera-circle">+</text>
                  <text class="sf-id-face" v-if="values[comp.id]">已上传</text>
                </view>
              </view>
            </template>
          </view>

          <!-- 附件 -->
          <view v-else-if="comp.type === 'attachment'" class="sf-upload" @click="pickFile(comp.id)">
            <text v-if="!values[comp.id] || !values[comp.id].length">+ 上传附件（{{ comp.content.minCount ? `最少 ${comp.content.minCount} 个，` : '' }}最多 {{ comp.content.maxCount }} 个）</text>
            <text v-else>{{ values[comp.id].length }} 个文件已选</text>
          </view>

          <!-- 单项选择 -->
          <view v-else-if="comp.type === 'radio'" class="sf-opts">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt-row" :class="{ on: values[comp.id] === opt.value, line: comp.style && comp.style.styleType === 'line' }" @click="values[comp.id] = opt.value">
              <text class="sf-dot" :class="{ on: values[comp.id] === opt.value }" />{{ opt.label }}
            </view>
          </view>

          <!-- 多项选择 -->
          <view v-else-if="comp.type === 'checkbox'" class="sf-opts">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt-row" :class="{ on: (values[comp.id] || []).includes(opt.value), line: comp.style && comp.style.styleType === 'line' }" @click="toggleCheck(comp.id, opt.value)">
              <text class="sf-checkbox" :class="{ on: (values[comp.id] || []).includes(opt.value) }">✓</text>{{ opt.label }}
            </view>
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

          <!-- 评分（图标/颜色/描述文字随组件样式） -->
          <view v-else-if="comp.type === 'rate'" class="sf-rate">
            <text v-if="comp.content.desc" class="sf-rate-desc">{{ comp.content.desc }}</text>
            <view class="sf-rate-icons">
              <text
                v-for="n in (comp.content.max || 3)" :key="n"
                class="sf-star"
                :class="{ on: (values[comp.id] || 0) >= n }"
                :style="{ color: (values[comp.id] || 0) >= n ? (comp.style && comp.style.activeColor || '#F7BA2A') : (comp.style && comp.style.inactiveColor || '#C6D1DE') }"
                @click="values[comp.id] = n"
              >{{ comp.style && comp.style.icon === 'heart' ? '♥' : comp.style && comp.style.icon === 'star' ? '★' : '☺' }}</text>
            </view>
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

          <!-- 短信认证 -->
          <view v-else-if="comp.type === 'sms'" class="sf-sms">
            <view class="sf-sms-row">
              <input class="sf-input sf-sms-phone" v-model="values[comp.id].phone" :placeholder="comp.content.placeholder || '请输入手机号'" />
              <view class="sf-sms-btn" @click="authSms(comp.id)">{{ comp.content.buttonText || '获取验证码' }}</view>
            </view>
            <input class="sf-input sf-sms-code" v-model="values[comp.id].code" placeholder="请输入验证码" />
          </view>

          <!-- 车牌号 -->
          <input v-else-if="comp.type === 'carplate'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder || '请输入车牌号'" />

          <!-- 标题 -->
          <!-- 标题：组件样式的主标题大小/颜色优先，回退内容配置 -->
          <view v-else-if="comp.type === 'title'" class="sf-title" :style="{ fontSize: (comp.style && comp.style.titleSize || comp.content.size || 17) + 'px', textAlign: comp.content.align || 'left', color: comp.style && comp.style.labelColor || comp.content.color || '#000000' }">
            {{ comp.content.text }}
          </view>

          <!-- 富文本 -->
          <view v-else-if="comp.type === 'richtext'" class="sf-richtext" v-html="comp.content.html" />

          <!-- 空白块：样式「空白高度」优先 -->
          <view v-else-if="comp.type === 'blank'" :style="{ height: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : comp.content.height || 20) + 'px' }" />

          <!-- 辅助线：样式「线条粗细 / 线条颜色」优先 -->
          <view v-else-if="comp.type === 'line'" class="sf-line" :style="{ borderTopStyle: comp.content.style || 'solid', borderTopWidth: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : 1) + 'px', borderTopColor: comp.style && comp.style.dividerColor || comp.content.color || '#000000' }" />

          <!-- 轮播图 -->
          <view v-else-if="comp.type === 'swiper'" class="sf-swiper">
            <swiper v-if="(comp.content.images || []).length" autoplay circular :style="{ height: (comp.style && comp.style.inputHeight || comp.content.height || 160) + 'px' }">
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
import { componentStyleVars } from './componentStyle.js';

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
    // 全局圆角（组件圆角 / 输入框圆角），供各字段经 CSS 变量消费
    '--g-radius': (g.radius || 0) + 'px',
    '--g-input-radius': (g.inputRadius != null ? g.inputRadius : 3) + 'px',
    // 组件颜色（对齐 ew）
    '--c-border-color': g.cBorder || '#F5F2F2',
    '--c-title-color': g.cTitle || '#000000',
    '--c-input-color': g.cInput || '#333333',
    '--c-error-color': g.cError || '#ED4F4F',
  };
});
// 页面背景：颜色 / 图片+颜色（平铺/位置/图片样式对齐 ew 全局样式）
const pageBgStyle = computed(() => {
  const g = form.config.settings?.globalStyle || {};
  const s = {};
  if (g.pageBgColor) s.backgroundColor = g.pageBgColor;
  if (g.pageBgType === 'imgcolor' && g.pageBgImage) {
    s.backgroundImage = 'url("' + g.pageBgImage + '")';
    s.backgroundRepeat = g.bgRepeat || 'repeat-x';
    s.backgroundPosition = (g.bgPosX || 'left') + ' ' + (g.bgPosY || 'top');
    if (g.bgImgStyle === 'fill') s.backgroundSize = 'cover';
    else if (g.bgImgStyle === 'fixed') s.backgroundSize = 'contain';
    else s.backgroundSize = (g.bgImgW != null ? g.bgImgW : 20) + '% ' + (g.bgImgH != null ? g.bgImgH : 20) + '%';
  }
  return s;
});
// 组件级样式：对齐 ew 四段（组件背景 / 组件整体 / 组件风格 / 组件颜色），按类型逐组件生效
function fieldStyle(comp) {
  return componentStyleVars(comp, form.config.settings?.globalStyle || {});
}

const components = computed(() => form.config.components || []);

// when 联动：对齐 ew 逻辑语义
// - 单选/多选：选择了任一（选项交集）；下拉：选择了（单值）；评分：介于 min~max
// - 规则内多条件支持 且/或（rule.operator，旧数据默认 or）；兼容旧单条件 compId/option（字符串）
function condHit(c) {
  const val = values[c.compId];
  if (val == null || val === '') return false;
  const opts = Array.isArray(c.option) ? c.option : (c.option === '' || c.option == null ? [] : [c.option]);
  const cmp = c.comparator || (Array.isArray(opts) && opts.length === 2 && opts.every((o) => o !== '' && !isNaN(Number(o))) ? 'between' : 'select_any');
  if (cmp === 'between') {
    const n = Number(val);
    const lo = Number(opts[0]);
    const hi = Number(opts[1]);
    return !isNaN(n) && !isNaN(lo) && !isNaN(hi) && n >= lo && n <= hi;
  }
  if (cmp === 'equal') return String(val) === String(opts[0]);
  // select_any：多选/单选均取交集
  const vals = Array.isArray(val) ? val.map(String) : [String(val)];
  return opts.map(String).some((o) => vals.includes(o));
}
function ruleMatched(r) {
  const conds = (r.conditions && r.conditions.length) ? r.conditions : [{ compId: r.compId, option: r.option, comparator: '' }];
  const valid = conds.filter((c) => c.compId);
  if (!valid.length) return false;
  return r.operator === 'and' ? valid.every(condHit) : valid.some(condHit);
}
const visibleComponents = computed(() => {
  const logic = form.config.settings?.logic || [];
  const targeted = new Set();
  const shown = new Set();
  logic.filter((r) => r.action === 'show').forEach((r) => {
    (r.showIds || []).forEach((id) => targeted.add(id));
    if (ruleMatched(r)) (r.showIds || []).forEach((id) => shown.add(id));
  });
  const hidden = [...targeted].filter((id) => !shown.has(id));
  // 结束表单规则
  const endRule = logic.find((r) => r.action === 'end' && ruleMatched(r));
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
      // 短信认证预置 {phone, code}，供 v-model 绑定
      if (c.type === 'sms' && !values[c.id]) {
        values[c.id] = { phone: '', code: '' };
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
  const c = components.value.find((x) => x.id === id);
  const max = (c?.content?.maxCount || 0) || 9;
  // P1 简化：记录文件名（真实上传在后续迭代补全）
  uni.chooseImage({
    count: max,
    success: (r) => { values[id] = r.tempFiles.map((f) => f.name); },
  });
}

// 身份证：人像面(ward) / 国徽面(back) 各传一张 —— ew 用 {ward, back} 结构
function pickIdFace(id, face) {
  uni.chooseImage({
    count: 1,
    success: (r) => {
      const v = values[id];
      values[id] = { ward: '', back: '', ...(typeof v === 'object' && v && !Array.isArray(v) ? v : {}), [face]: r.tempFiles[0].name };
    },
  });
}

// 营业执照：单张
function pickLicense(id) {
  uni.chooseImage({
    count: 1,
    success: (r) => { values[id] = r.tempFiles[0].name; },
  });
}

// 数量限制文案（ew：0 = 不限制）
function limitText(ct) {
  const min = ct.minCount || 0;
  const max = ct.maxCount || 0;
  if (min && max) return `最少 ${min} 张，最多 ${max} 张`;
  if (max) return `最多 ${max} 张`;
  return '数量不限';
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

function authSms(id) {
  // 演示交互：校验手机号格式后模拟下发验证码（真实环境接入短信服务）
  const v = values[id] || (values[id] = { phone: '', code: '' });
  const phone = (v.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
    return;
  }
  uni.showToast({ title: '验证码已发送（演示）', icon: 'none' });
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

    // 短信认证：手机号必填 + 格式校验
    if (c.type === 'sms') {
      const phone = (v && typeof v === 'object' && v.phone) ? v.phone : (typeof v === 'string' ? v : '');
      if (ct.required && !phone) return (ct.label || '短信认证') + '为必填项';
      if (phone && !/^1[3-9]\d{9}$/.test(String(phone).trim())) return (ct.label || '短信认证') + '手机号格式不正确';
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

    // 图片上传：普通=数组（最少/最多张数），身份证=两面都要，营业执照=单张
    if (c.type === 'image') {
      const imgType = ct.imageType || 'normal';
      if (imgType === 'idcard') {
        if (ct.required && (!v || !v.ward || !v.back)) return (ct.label || '上传身份证照片') + '请上传证件人像面与国徽面';
        continue;
      }
      if (imgType === 'license') {
        if (ct.required && !v) return (ct.label || '上传营业执照') + '为必填项';
        continue;
      }
      const arr = Array.isArray(v) ? v : [];
      const min = ct.minCount || 0;
      const max = ct.maxCount || 0;
      if (ct.required && !arr.length) return (ct.label || '图片上传') + '为必填项';
      if (min && arr.length < min) return (ct.label || '图片上传') + `最少上传 ${min} 张`;
      if (max && arr.length > max) return (ct.label || '图片上传') + `最多上传 ${max} 张`;
      continue;
    }

    // 附件：最少/最多个数（ew insertLimit）
    if (c.type === 'attachment') {
      const arr = Array.isArray(v) ? v : [];
      const amin = ct.minCount || 0;
      const amax = ct.maxCount || 0;
      if (ct.required && !arr.length) return (ct.label || '附件') + '为必填项';
      if (amin && arr.length < amin) return (ct.label || '附件') + `最少上传 ${amin} 个`;
      if (amax && arr.length > amax) return (ct.label || '附件') + `最多上传 ${amax} 个`;
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
      if (Array.isArray(ct.inputType) && ct.inputType.length > 0) {
        const rules = [];
        if (ct.inputType.includes('chinese')) rules.push('\\u4e00-\\u9fa5');
        if (ct.inputType.includes('english')) rules.push('a-zA-Z');
        if (ct.inputType.includes('number')) rules.push('0-9');
        if (ct.inputType.includes('symbol')) rules.push('\\p{P}\\p{S}');
        const re = new RegExp('^[' + rules.join('') + ']+$', 'u');
        if (!re.test(s)) return ct.label + '包含不允许的字符';
      }
    }
    if (c.type === 'textarea' && v) {
      const s = String(v).trim();
      if (ct.minLength && s.length < ct.minLength) return ct.label + `至少 ${ct.minLength} 位`;
      if (ct.maxLength && s.length > ct.maxLength) return ct.label + `最多 ${ct.maxLength} 位`;
    }
    if (c.type === 'number' && v !== '' && v != null) {
      const n = Number(v);
      if (ct.min != null && n < ct.min) return (ct.label || '数字') + `不能小于 ${ct.min}`;
      if (ct.max != null && n > ct.max) return (ct.label || '数字') + `不能大于 ${ct.max}`;
      if (ct.step != null && ct.step > 1 && n % ct.step !== 0) return (ct.label || '数字') + `需为 ${ct.step} 的倍数`;
    }
    if (c.type === 'radio' && ct.required && !v) return (ct.label || '单项选择') + '为必选项';
    if (c.type === 'select' && ct.required && !v) return (ct.label || '下拉选择') + '为必选项';
    if (c.type === 'checkbox' && Array.isArray(v)) {
      if (ct.required && v.length === 0) return (ct.label || '多项选择') + '为必选项';
      if (ct.minSelect && v.length < ct.minSelect) return (ct.label || '多项选择') + `至少选择 ${ct.minSelect} 项`;
      if (ct.maxSelect && v.length > ct.maxSelect) return (ct.label || '多项选择') + `最多选择 ${ct.maxSelect} 项`;
    }
    if (c.type === 'location' && ct.required && v && typeof v === 'object' && !v.address) return (ct.label || '定位') + '为必选项';
    if (c.type === 'date' && v) {
      const s = String(v);
      if (ct.dateType === 'range' && !Array.isArray(v)) return (ct.label || '日期') + '请选择日期范围';
    }
    if (c.type === 'time' && v) {
      if (ct.dateType === 'timerange' && !Array.isArray(v)) return (ct.label || '时间') + '请选择时间段';
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
/* 所有组件样式均消费「组件样式 → CSS 变量」（ew 四段：背景/整体/风格/颜色），与设计器预览同一套语义 */
.sf-field { padding: 12px 16px; }
.sf-label { font-size: var(--c-title-size, 14px); color: var(--c-title-color, #000000); margin-bottom: 8px; }
.sf-req { color: var(--c-error-color, #ED4F4F); margin-left: 2px; }
.sf-input { width: 100%; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); box-sizing: border-box; background: var(--c-input-bg, #F7F9FA); color: var(--c-input-color, #333333); }
textarea.sf-input { min-height: var(--c-input-height, 84px); }
.sf-upload { min-width: var(--c-upload-size, 45px); min-height: var(--c-upload-size, 45px); display: flex; align-items: center; justify-content: center; border: 1px dashed var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 10px var(--c-input-pad-x, 10px); text-align: center; color: var(--c-prompt-color, #999999); font-size: var(--c-prompt-size, 13px); background: var(--c-input-bg, #F7F9FA); box-sizing: border-box; }
/* 图片上传：普通（示例图）/ 身份证（双面）/ 营业执照（单槽），对齐 ew picture-upload-widget */
.sf-upload.has-sample { padding: 0; overflow: hidden; }
.sf-sample { width: var(--c-upload-size, 45px); height: var(--c-upload-size, 45px); display: block; }
.sf-camera { color: #ADBAC6; font-size: 30px; line-height: 1; }
.sf-upload-tip { display: block; font-size: 12px; color: var(--c-prompt-color, #999999); margin-top: 6px; }
.sf-upload-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.sf-upload-item { font-size: 12px; color: var(--c-input-color, #333333); }
.sf-id-row { display: flex; gap: 15px; flex-wrap: wrap; }
/* ew .id-card-box（实测 167x129）：宽165 含左右内边距26，示例图通栏，半透明圆形相机 57x57 居中，文字13/#666 */
.sf-id-box { width: 165px; padding: 15px 26px; position: relative; text-align: center; border-radius: 3px; background: var(--c-img-bg, #FFFFFF); border: 1px solid var(--c-img-border, #CED3D6); box-sizing: border-box; }
.sf-license-box { width: 155px; padding: 23px 17px 12px; }
.sf-id-bg { width: 100%; display: block; }
.sf-camera-circle { position: absolute; width: 57px; height: 57px; line-height: 57px; text-align: center; background: rgba(0, 0, 0, 0.16); border-radius: 50%; top: 15px; left: 54px; color: #FFFFFF; font-size: 27px; }
.sf-license-box .sf-camera-circle { top: 30px; left: 32px; }
.sf-id-face { position: absolute; right: 6px; top: 6px; font-size: 11px; color: #4385FF; background: rgba(255, 255, 255, 0.85); border-radius: 3px; padding: 1px 5px; z-index: 1; }
.sf-id-text { display: block; font-size: 13px; font-weight: 500; color: #666666; line-height: 20px; }
/* 线风格：输入类控件去边框，仅保留底线（对齐 ew 组件风格） */
.cs-line .sf-input,
.cs-line .sf-loc,
.cs-line .sf-auth,
.cs-line .sf-download,
.cs-line .sf-upload { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
.sf-opts { display: flex; flex-direction: column; gap: 0; }
.sf-opt-row { display: flex; align-items: center; gap: 8px; font-size: var(--c-input-size, 14px); color: var(--c-option-color, #333333); padding: 8px 0; }
.sf-opt-row.line { border-bottom: 1px solid var(--c-border-color, #dcdfe6); }
.sf-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; position: relative; flex-shrink: 0; box-sizing: border-box; }
.sf-dot.on { border-color: var(--c-active-color, #2667EC); }
.sf-dot.on::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--c-active-color, #2667EC); }
.sf-checkbox { width: 18px; height: 18px; border-radius: 3px; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; text-align: center; line-height: 18px; font-size: 12px; color: #fff; flex-shrink: 0; box-sizing: border-box; }
.sf-checkbox.on { background: var(--c-active-color, #2667EC); border-color: var(--c-active-color, #2667EC); }
.sf-submit { width: 100%; border: 1px solid var(--c-border-color, #0076F0); border-radius: var(--c-input-radius, 22px); padding: 12px; background: var(--c-input-bg, #0076F0); color: var(--c-title-color, #FFFFFF); font-size: 16px; margin-top: 6px; }
.sf-ended { text-align: center; color: #909399; padding: 30px; }
.sf-empty { text-align: center; color: #c0c4cc; padding: 30px; }
.sf-loc { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-icon-color, #000000); background: var(--c-input-bg, #F7F9FA); text-align: center; }
.sf-agree { display: flex; align-items: flex-start; gap: 8px; font-size: var(--c-input-size, 13px); color: var(--c-input-color, #333333); flex-wrap: wrap; }
.sf-check { width: 18px; height: 18px; border: 1px solid var(--c-inactive-border, #F5F2F2); border-radius: 4px; text-align: center; line-height: 18px; color: #fff; flex-shrink: 0; }
.sf-check.on { background: var(--c-check-color, #4385FF); border-color: var(--c-check-color, #4385FF); }
.sf-agree-text { flex: 1; }
.sf-link { color: var(--c-input-color, #2667EC); }
.sf-rate { display: flex; flex-direction: column; gap: 4px; }
.sf-rate-desc { color: var(--c-desc-color, #999999); font-size: 12px; }
.sf-rate-icons { display: flex; gap: 4px; }
.sf-star { font-size: 26px; color: var(--c-inactive-color, #C6D1DE); }
.sf-star.on { color: var(--c-active-color, #F7BA2A); }
.sf-download { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-file-size, 14px); color: var(--c-file-title, #333333); background: var(--c-input-bg, #F7F9FA); text-align: center; }
.sf-download::after { content: ' 下载'; color: var(--c-down-color, #4385FF); }
.sf-auth { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-empower-color, #4385FF); text-align: center; background: var(--c-input-bg, #F7F9FA); }
.sf-sms { display: flex; flex-direction: column; gap: 8px; }
.sf-sms-row { display: flex; gap: 8px; align-items: stretch; }
.sf-sms-phone { flex: 1; }
.sf-sms-code { width: 100%; }
.sf-sms-btn { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 6px); padding: 0 14px; font-size: 13px; color: var(--c-msg-color, #4385FF); background: #fff; display: flex; align-items: center; white-space: nowrap; flex-shrink: 0; }
.sf-title { font-weight: 600; padding: 4px var(--c-input-pad-x, 10px); font-size: var(--c-title-size, 17px); color: var(--c-title-color, #000000); }
.sf-richtext { font-size: 14px; color: #303133; line-height: 1.6; }
.sf-line { border-top-width: var(--c-divider-height, 1px); border-top-color: var(--c-divider-color, #000000); margin: 4px 0; }
.sf-swiper { width: 100%; border-radius: var(--c-img-radius, 0px); overflow: hidden; }
.sf-swiper-img { width: 100%; height: 100%; display: block; }
.sf-swiper-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 6px); padding: 24px; text-align: center; color: #909399; font-size: 13px; }
.sf-bigimage { width: 100%; border-radius: var(--c-img-radius, 8px); overflow: hidden; }
.sf-bigimage-img { width: 100%; display: block; }
.sf-bigimage-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 6px); padding: 30px; text-align: center; color: #909399; font-size: 13px; }
.sf-video { width: 100%; border-radius: var(--c-input-radius, 8px); overflow: hidden; }
.sf-video-el { width: 100%; display: block; }
.sf-video-empty { background: #000; color: #fff; text-align: center; padding: 30px; font-size: 13px; }
.sf-backdesc { font-size: var(--c-title-size, 14px); color: var(--c-input-color, #333333); line-height: 1.6; }
.sf-realtime { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--c-title-color, #000000); background: var(--c-input-bg, #F7F9FA); border-radius: var(--c-input-radius, 10px); padding: 10px 12px; }
.sf-realtime-label { font-weight: 600; }
.sf-realtime-count { color: var(--c-active-color, #2667EC); }
.sf-next { width: 100%; border: 1px solid var(--c-next-border, #0076F0); border-radius: var(--c-input-radius, 19px); padding: 12px; background: var(--c-next-bg, #0076F0); color: var(--c-next-color, #FFFFFF); font-size: 16px; text-align: center; margin-top: 6px; }
.sf-pay { border: 1px solid var(--c-border-color, #F7F9FA); border-radius: var(--c-input-radius, 3px); padding: var(--c-model-margin-y, 10px); background: var(--c-input-bg, #F7F9FA); }
.sf-pay-label { font-size: var(--c-title-size, 16px); color: var(--c-title-color, #000000); font-weight: 600; margin-bottom: 8px; }
.sf-pay-amt { color: var(--c-price-color, #FF1C1C); margin-left: 6px; }
.sf-pay-specs { display: flex; flex-direction: column; gap: 8px; }
.sf-pay-spec { display: flex; justify-content: space-between; border: 1px solid var(--c-border-color, #F7F9FA); border-radius: var(--c-input-radius, 3px); padding: 10px 12px; font-size: 14px; color: var(--c-spec-color, #000000); }
.sf-pay-spec.on { border-color: var(--c-active-color, #2667EC); background: var(--c-input-bg, #F7F9FA); }
.sf-pay-spec-price { color: var(--c-price-color, #FF1C1C); font-weight: 600; }
.sf-pay-tip { font-size: 12px; color: var(--c-count-color, #79797B); }
</style>
