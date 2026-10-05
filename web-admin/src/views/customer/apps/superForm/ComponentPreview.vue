<template>
  <div class="cmpv" :class="[styleCls, layoutCls]">
    <div v-if="!noLabel.includes(comp.type)" class="cmpv-label">
      {{ comp.content.label || '未命名' }}
      <span v-if="comp.content.required" class="cmpv-req">*</span>
    </div>

    <!-- 单行/多行文本：textarea 必须用 <textarea> 渲染（此前与text 共用 <input>，
         导致设计器里看不出「这是多行」，且字数统计缺失，与 C 端不一致） -->
    <template v-if="comp.type === 'text'">
      <input class="cmpv-input" :placeholder="comp.content.placeholder" :value="comp.content.prefill" disabled />
    </template>

    <template v-else-if="comp.type === 'textarea'">
      <div class="cmpv-textarea-box">
        <textarea
          class="cmpv-input cmpv-textarea"
          :placeholder="comp.content.placeholder"
          :value="comp.content.prefill"
          disabled
        />
        <!-- 字数统计：对齐 C 端原生 textarea 的 maxlength 提示（0/400），ew 也有该计数 -->
        <span v-if="comp.content.maxLength > 0" class="cmpv-counter">{{ (comp.content.prefill || '').length }}/{{ comp.content.maxLength }}</span>
      </div>
    </template>

    <template v-else-if="comp.type === 'image'">
      <!-- ew picture-upload-widget：上下布局=rowsShow 等分正方形框(边框/背景走 底框边框/背景颜色)；
           左右布局=框/线风格字段行 + uploadBoxSize 小方框(图片背景/图片边框)；身份证/营业执照=固定槽 -->
      <template v-if="layout !== 'horizontal'">
        <div class="cmpv-img-body">
          <template v-if="comp.content.imageType === 'idcard'">
            <div class="cmpv-id-row">
              <div class="cmpv-id-box"><img class="cmpv-id-bg" :src="idFront" /><span class="cmpv-camera-circle"><span class="cmpv-camera" /></span><span class="cmpv-id-text">证件人像面</span></div>
              <div class="cmpv-id-box"><img class="cmpv-id-bg" :src="idBack" /><span class="cmpv-camera-circle"><span class="cmpv-camera" /></span><span class="cmpv-id-text">证件国徽面</span></div>
            </div>
          </template>
          <template v-else-if="comp.content.imageType === 'license'">
            <div class="cmpv-id-row">
              <div class="cmpv-id-box cmpv-license-box"><img class="cmpv-id-bg" :src="licenseImg" /><span class="cmpv-camera-circle"><span class="cmpv-camera" /></span></div>
            </div>
          </template>
          <template v-else>
            <div class="cmpv-normal-box">
              <img v-if="comp.content.sampleImg" class="cmpv-sample" :src="comp.content.sampleImg" />
              <span v-else class="cmpv-camera" />
            </div>
            <div class="cmpv-upload-tip">上传图片（{{ limitText(comp) }}）</div>
          </template>
        </div>
      </template>
      <template v-else>
        <div class="cmpv-image-h" :class="{ 'is-line': comp.style && comp.style.styleType === 'line' }">
          <div class="cmpv-image-h-label">{{ comp.content.label || '未命名' }}<span v-if="comp.content.required" class="cmpv-req">*</span></div>
          <template v-if="comp.content.imageType === 'idcard'">
            <div class="cmpv-h-box cmpv-h-slot"><img class="cmpv-id-bg" :src="idFront" /></div>
          </template>
          <template v-else-if="comp.content.imageType === 'license'">
            <div class="cmpv-h-box cmpv-h-slot"><img class="cmpv-id-bg" :src="licenseImg" /></div>
          </template>
          <template v-else>
            <div class="cmpv-h-box">
              <img v-if="comp.content.sampleImg" class="cmpv-sample" :src="comp.content.sampleImg" />
              <span v-else class="cmpv-camera" />
            </div>
          </template>
        </div>
      </template>
    </template>

    <template v-else-if="comp.type === 'radio'">
      <div class="cmpv-opt-box" :class="optsCls(comp)">
        <!-- 首个选项演示选中态：设计器里必须能看到选中长什么样（对标站画布即带选中演示） -->
        <div v-for="(opt, i) in comp.content.options" :key="i" class="cmpv-opt-row" :class="[optType(comp), { on: i === 0 }]">
          <span class="cmpv-circle" :class="{ on: i === 0 }" />
          <!-- 图片/图文：未配图时用占位块 + 序号（对标站画布是灰色占位块），空 src 会渲染破图 -->
          <template v-if="optType(comp) === 'image' || optType(comp) === 'imageText'">
            <img v-if="opt.image" class="cmpv-opt-img" :src="opt.image" alt="" />
            <span v-else class="cmpv-opt-img cmpv-opt-img-ph">{{ i + 1 }}</span>
          </template>
          <span v-if="optType(comp) === 'text' || optType(comp) === 'imageText'" class="cmpv-opt-label">{{ opt.label }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="comp.type === 'checkbox'">
      <div class="cmpv-opt-box" :class="optsCls(comp)">
        <div v-for="(opt, i) in comp.content.options" :key="i" class="cmpv-opt-row" :class="[optType(comp), { on: i === 0 }]">
          <span class="cmpv-square" :class="{ on: i === 0 }" />
          <!-- 图片/图文：未配图时用占位块 + 序号（对标站画布是灰色占位块），空 src 会渲染破图 -->
          <template v-if="optType(comp) === 'image' || optType(comp) === 'imageText'">
            <img v-if="opt.image" class="cmpv-opt-img" :src="opt.image" alt="" />
            <span v-else class="cmpv-opt-img cmpv-opt-img-ph">{{ i + 1 }}</span>
          </template>
          <span v-if="optType(comp) === 'text' || optType(comp) === 'imageText'" class="cmpv-opt-label">{{ opt.label }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="comp.type === 'select'">
      <div class="cmpv-input cmpv-select">{{ comp.content.options?.[0]?.label || '请选择' }}</div>
    </template>

    <template v-else-if="comp.type === 'date'">
      <!-- 对标站：单个日期 / 日期范围（范围 = 双输入 + ~） -->
      <div v-if="comp.content.dateType === 'range'" class="cmpv-range">
        <div class="cmpv-input cmpv-range-cell">开始日期</div>
        <span class="cmpv-range-sep">~</span>
        <div class="cmpv-input cmpv-range-cell">结束日期</div>
      </div>
      <div v-else class="cmpv-input">{{ comp.content.prefill || '选择日期' }}</div>
    </template>

    <template v-else-if="comp.type === 'number'">
      <!-- 组件风格：增减类型(step) / 滑块风格(slider)。此前预览只有裸input，
           与 C 端不一致 → 设计器里看不到这两个风格的真实形态 -->
      <div v-if="comp.style && comp.style.styleType === 'step'" class="cmpv-num">
        <span class="cmpv-step-btn">−</span>
        <input class="cmpv-input cmpv-num-in" :placeholder="comp.content.placeholder || '请输入数字'" :value="comp.content.prefill" disabled />
        <span class="cmpv-step-btn">+</span>
      </div>
      <div v-else-if="comp.style && comp.style.styleType === 'slider'" class="cmpv-num">
        <div class="cmpv-slider">
          <div class="cmpv-slider-track"><div class="cmpv-slider-fill" :style="{ width: sliderPct(comp) + '%' }" /><div class="cmpv-slider-thumb" :style="{ left: sliderPct(comp) + '%' }" /></div>
        </div>
        <span class="cmpv-slider-val">{{ sliderVal(comp) }}</span>
      </div>
      <input v-else class="cmpv-input" :placeholder="comp.content.placeholder || '请输入数字'" :value="comp.content.prefill" disabled />
    </template>

    <template v-else-if="comp.type === 'time'">
      <!-- 对标站：时间点 / 时间段 -->
      <div v-if="comp.content.dateType === 'timerange'" class="cmpv-range">
        <div class="cmpv-input cmpv-range-cell">开始时间</div>
        <span class="cmpv-range-sep">~</span>
        <div class="cmpv-input cmpv-range-cell">结束时间</div>
      </div>
      <div v-else class="cmpv-input">{{ comp.content.prefill || '选择时间' }}</div>
    </template>

    <template v-else-if="comp.type === 'location'">
      <div class="cmpv-loc">📍 {{ comp.content.tipText || '点击获取定位' }}</div>
    </template>

    <template v-else-if="comp.type === 'attachment'">
      <div class="cmpv-upload">+</div>
    </template>

    <template v-else-if="comp.type === 'agreement'">
      <div class="cmpv-agree"><span class="cmpv-square" />{{ comp.content.label }} <a>{{ comp.content.linkText }}</a></div>
    </template>

    <template v-else-if="comp.type === 'rate'">
      <div v-if="comp.content.desc" class="cmpv-rate-desc">{{ comp.content.desc }}</div>
      <div class="cmpv-rate">
        <span
          v-for="n in (comp.content.max || 3)" :key="n"
          class="cmpv-rate-ic"
          :style="{ color: 'var(--c-inactive-color, #C6D1DE)' }"
        >{{ comp.style && comp.style.icon === 'heart' ? '♥' : comp.style && comp.style.icon === 'star' ? '★' : '☺' }}</span>
      </div>
    </template>

    <template v-else-if="comp.type === 'filedownload'">
      <div class="cmpv-download">📎 {{ comp.content.fileName || '文件名称' }}（点击下载）</div>
    </template>

    <template v-else-if="comp.type === 'phoneauth'">
      <button class="cmpv-auth">{{ comp.content.placeholder || '授权手机号' }}</button>
    </template>

    <template v-else-if="comp.type === 'sms'">
      <div class="cmpv-sms">
        <input class="cmpv-input" :placeholder="comp.content.placeholder || '请输入手机号'" disabled />
        <button class="cmpv-auth-btn">{{ comp.content.buttonText || '获取验证码' }}</button>
      </div>
    </template>

    <template v-else-if="comp.type === 'carplate'">
      <!-- 对标站画布实测（car-number-widget data 预填 + scoped CSS）：格 1 预填演示省份字（粤），
           新能源开启时格 8 为绿框绿字「新能源」位，卡 1/卡 2 之间 4px 圆点分隔符。
           关闭新能源时渲染 7 位普通车牌（无绿框/无新能源占位）。 -->
      <div class="cmpv-plate">
        <span
          v-for="n in (comp.content.newEnergy !== false ? 8 : 7)"
          :key="n"
          class="cmpv-plate-cell"
          :class="{ 'cmpv-plate-cell--ne': n === (comp.content.newEnergy !== false ? 8 : 7) && comp.content.newEnergy !== false }"
        >{{ n === 1 ? '粤' : ((n === (comp.content.newEnergy !== false ? 8 : 7) && comp.content.newEnergy !== false) ? '新能源' : '') }}</span>
        <i class="cmpv-plate-dot" />
      </div>
    </template>

            <template v-else-if="comp.type === 'title'">
              <div class="cmpv-title" :style="{ fontSize: (comp.style && comp.style.titleSize || comp.content.size || 17) + 'px', textAlign: comp.content.align || 'left', color: comp.style && comp.style.labelColor || comp.content.color || '#000000' }">{{ comp.content.text }}<div v-if="comp.content.subtitle" class="cmpv-title-sub">{{ comp.content.subtitle }}</div><div v-if="comp.content.tip" class="cmpv-title-tip">{{ comp.content.tip }}</div></div>
            </template>

    <template v-else-if="comp.type === 'richtext'">
      <div class="cmpv-richtext" v-html="comp.content.html" />
    </template>

    <template v-else-if="comp.type === 'blank'">
      <div :style="{ height: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : comp.content.height || 20) + 'px' }" />
    </template>

    <template v-else-if="comp.type === 'line'">
      <div class="cmpv-line" :style="{ borderTopStyle: comp.content.style || 'solid', borderTopWidth: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : 1) + 'px', borderTopColor: comp.style && comp.style.dividerColor || comp.content.color || '#000000' }" />
    </template>

    <template v-else-if="comp.type === 'swiper'">
      <div v-if="(comp.content.images || []).length" class="cmpv-swiper">
        <img :src="comp.content.images[0]" class="cmpv-swiper-img" :style="{ height: (comp.style && comp.style.inputHeight || 64) + 'px' }" />
      </div>
      <div v-else class="cmpv-swiper-empty">轮播图（{{ (comp.content.images || []).length }} 张）</div>
    </template>

    <template v-else-if="comp.type === 'bigimage'">
      <div v-if="comp.content.image" class="cmpv-bigimg" :style="{ backgroundImage: 'url(' + comp.content.image + ')' }" />
      <div v-else class="cmpv-bigimg-empty">大图模块</div>
    </template>

    <template v-else-if="comp.type === 'video'">
      <div class="cmpv-video-empty">视频模块</div>
    </template>

    <template v-else-if="comp.type === 'backdesc'">
      <div class="cmpv-backdesc">{{ comp.content.text }}</div>
    </template>

    <template v-else-if="comp.type === 'realtime'">
      <div class="cmpv-realtime">{{ comp.content.label }} · {{ comp.content.title }}</div>
    </template>

    <template v-else-if="comp.type === 'pagebreak'">
      <div class="cmpv-pagebreak">
        <button class="cmpv-pb-btn cmpv-pb-prev">上一步</button>
        <button class="cmpv-pb-btn cmpv-pb-next">下一步</button>
      </div>
    </template>

    <template v-else-if="comp.type === 'pay'">
      <div class="cmpv-pay">
        <div class="cmpv-pay-label">{{ comp.content.label }} <span v-if="!(comp.content.specs || []).length">¥{{ comp.content.amount }}</span></div>
        <div v-if="(comp.content.specs || []).length" class="cmpv-pay-specs">
          <div v-for="(sp, spi) in comp.content.specs" :key="spi" class="cmpv-pay-spec">{{ sp.name }} ¥{{ sp.price }}</div>
        </div>
        <div v-else class="cmpv-pay-tip">需支付（发布后接入）</div>
      </div>
    </template>

    <template v-else-if="comp.type === 'submit'">
      <button class="cmpv-submit">{{ comp.content.label || '确认' }}</button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
// 风格卡值→语义 class 的映射与 C 端渲染器共用（web-app/src/utils/sfComponentStyle.js）
import { styleVariant, optType as optTypeOf, isImgOptionType as sfIsImgOptionType } from '../../../../../../web-app/src/utils/sfComponentStyle.js';
import idFront from '../../../../assets/superform/id-front.png';
import idBack from '../../../../assets/superform/id-beck.png';
import licenseImg from '../../../../assets/superform/license.png';

const props = defineProps({
  comp: { type: Object, required: true },
  layout: { type: String, default: 'vertical' },
});
const noLabel = ['submit', 'title', 'richtext', 'blank', 'line', 'swiper', 'bigimage', 'video', 'backdesc', 'realtime', 'pagebreak', 'pay'];
/**
 * 「组件风格」风格卡 → 预览容器 class（sfv-box / sfv-plain / sfv-line / sfx-opt* …）。
 * 此前预览根节点不挂任何风格 class，导致「框风格/框风格1/框风格2/线风格」点击后预览无变化
 * （用户反馈「三个风格无效」）。现与 C 端 .sf-field 走同一个 styleVariant() 映射，三端天然一致，
 * 且新增的 s2/s3/slider 值也自动有了视觉（此前这些值无对应规则 = 死参数）。
 */
const styleCls = computed(() => styleVariant(props.comp));
// 组件级「上下布局 / 左右布局」直接读表单级 layout（settings.layout）——
// 顶栏「基础布局」与「全局样式 → 基础布局」是唯一切换入口，面板不另设开关（否则两套打架）。
// 对标站对应 field-wrapper-radio-top / field-wrapper-radio-left：左右布局标题固定 90px。
const layoutCls = computed(() => (props.layout === 'horizontal' ? { 'sf-layout-left': true } : {}));
// 数量限制文案（ew：0 = 不限制）
/**
 * 选择类的「选项类型」（文字 / 图片 / 图文）→ 渲染端值。
 * 与 C 端 SuperFormRender.optType 同一口径：老数据没有 content.optionType 时兜底 'text'。
 */
function optType(comp) {
  return optTypeOf(comp);
}
const isImgOptionType = (comp) => sfIsImgOptionType(comp);
/** 选项区 class：与 C 端 SuperFormRender.optsCls 同一口径（list 纵向列表 / grid 网格） */
function optsCls(comp) {
  if (optType(comp) === 'text') return {};
  const grid = comp.style && comp.style.optImgLayout === 'grid';
  return { 'opts-img': true, 'opts-img-grid': !!grid };
}
function limitText(comp) {
  const min = comp.content.minCount || 0;
  const max = comp.content.maxCount || 0;
  if (min && max) return `最少 ${min} 张，最多 ${max} 张`;
  if (max) return `最多 ${max} 张`;
  return '数量不限';
}
// 数字滑块风格：当前值（无值时取 min）与百分比位置，供预览渲染滑轨
function sliderVal(comp) {
  const v = comp.content.prefill;
  return v != null && v !== '' ? v : (comp.content.min != null ? comp.content.min : 0);
}
function sliderPct(comp) {
  const min = Number(comp.content.min != null ? comp.content.min : 0);
  const max = Number(comp.content.max != null ? comp.content.max : 100);
  const v = Number(sliderVal(comp));
  if (max === min) return 0;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}
</script>

<style scoped>
/* 所有样式均消费「组件样式 → CSS 变量」（ew 四段：背景/整体/风格/颜色），与 C 端 fill.vue 同一套语义 */
.cmpv-label { font-size: var(--c-title-size, 14px); color: var(--c-title-color, #000000); margin-bottom: 6px; }
.cmpv-req { color: var(--c-error-color, #ED4F4F); margin-left: 2px; }
.cmpv-input { width: 100%; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); background: var(--c-input-bg, #F7F9FA); color: var(--c-input-color, #333333); box-sizing: border-box; }
/* 多行文本：与 C 端 textarea.sf-input 同构（min-height 走 --c-input-height，默认 84px），
   外层relative 供右下角字数统计定位。对齐 C 端原生 textarea 的 0/400 提示。 */
.cmpv-textarea-box { position: relative; }
.cmpv-textarea { min-height: var(--c-input-height, 84px); resize: none; display: block; }
.cmpv-counter { position: absolute; right: var(--c-input-pad-x, 10px); bottom: 6px; font-size: var(--c-prompt-size, 12px); color: var(--c-count-color, #909399); line-height: 1; pointer-events: none; }
.cmpv-input::placeholder { color: var(--c-prompt-color, #CCCCCC); }
.cmpv-select { display: flex; align-items: center; justify-content: space-between; }
.cmpv-select::after { content: '▾'; color: var(--c-icon-color, #000000); }
/* 数字组件的两种风格（对齐 C 端 .sf-number / .sf-slider） */
.cmpv-num { display: flex; align-items: stretch; gap: 8px; }
.cmpv-num-in { flex: 1; text-align: center; }
.cmpv-step-btn { width: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 20px; line-height: 1; background: var(--c-operate-bg, #FFFFFF); color: var(--c-title-color, #333333); border: 1px solid var(--c-operate-border, #dcdfe6); border-radius: var(--c-operate-radius, 3px); }
.cmpv-slider { flex: 1; display: flex; align-items: center; height: 24px; }
.cmpv-slider-track { position: relative; width: 100%; height: 4px; border-radius: 2px; background: var(--c-inactive-color, #C6D1DE); }
.cmpv-slider-fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; background: var(--c-active-color, #2667EC); }
.cmpv-slider-thumb { position: absolute; top: 50%; width: 18px; height: 18px; margin-left: -9px; transform: translateY(-50%); border-radius: 50%; background: #FFFFFF; border: 1px solid var(--c-active-color, #2667EC); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.cmpv-slider-val { min-width: 40px; text-align: right; font-size: var(--c-input-size, 14px); color: var(--c-title-color, #000000); font-weight: 600; }
.cmpv-upload { min-width: var(--c-upload-size, 45px); min-height: var(--c-upload-size, 45px); display: flex; align-items: center; justify-content: center; border: 1px dashed var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); background: var(--c-input-bg, #F7F9FA); color: var(--c-prompt-color, #999999); font-size: var(--c-prompt-size, 14px); overflow: hidden; box-sizing: border-box; }
/* —— 图片上传（ew 实测）：上下布局普通模式 = rowsShow 等分正方形框（ew getImgHeight 令高=宽） —— */
.cmpv-img-body { padding: 0 var(--c-input-pad-x, 10px); }
.cmpv-normal-box { width: calc(100% / var(--c-img-rows, 2) - 15px); aspect-ratio: 1; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; box-sizing: border-box; border: 1px var(--c-img-border-style, solid) var(--c-border-color, #F5F2F2); background: var(--c-input-bg, #F7F9FA); border-radius: var(--c-input-radius, 3px); }
.cmpv-normal-box .cmpv-camera { color: #CED3D6; font-size: 27px; width: 27px; height: 27px; }
/* 左右布局：框/线风格字段行 + uploadBoxSize 小方框（ew leftBoxStyle：imgBg/imgBorder/imgRadius） */
.cmpv-image-h { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 3px); background: var(--c-input-bg, #F7F9FA); box-sizing: border-box; }
.cmpv-image-h.is-line { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
.cmpv-image-h-label { flex: 1; font-size: var(--c-title-size, 16px); color: var(--c-title-color, #000000); }
.cmpv-h-box { width: var(--c-upload-size, 45px); height: var(--c-upload-size, 45px); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; box-sizing: border-box; border: 1px var(--c-img-border-style, solid) var(--c-img-border, #CED3D6); background: var(--c-img-bg, #FFFFFF); border-radius: var(--c-img-radius, 3px); }
.cmpv-h-box .cmpv-camera { color: #CED3D6; font-size: 21px; width: 21px; height: 21px; }
/* 相机图标：ew iconfont \e6e7（字体取自 ew 原包） */
@font-face { font-family: 'SfIconfont'; src: url('../../../../assets/superform/iconfont.woff2') format('woff2'); }
.cmpv-camera { font-family: 'SfIconfont'; font-style: normal; color: #ADBAC6; font-size: 26px; width: 26px; height: 26px; line-height: 1; }
.cmpv-camera::before { content: '\e6e7'; }
.cmpv-sample { width: 100%; height: 100%; object-fit: cover; display: block; }
.cmpv-upload-tip { font-size: var(--c-prompt-size, 12px); color: var(--c-prompt-color, #999999); margin-top: 6px; }
.cmpv-id-row { display: flex; gap: 15px; flex-wrap: wrap; }
/* ew boxStyle（id/license 槽与普通框共用）：边框=底框边框(直线/虚线)、背景=背景颜色、圆角=底框圆角 */
.cmpv-id-box { width: 165px; padding: 15px 26px; position: relative; text-align: center; border-radius: var(--c-input-radius, 3px); background: var(--c-input-bg, #F7F9FA); border: 1px var(--c-img-border-style, solid) var(--c-border-color, #F5F2F2); box-sizing: border-box; }
.cmpv-id-bg { width: 100%; display: block; }
.cmpv-camera-circle { position: absolute; width: 57px; height: 57px; line-height: 57px; text-align: center; background: rgba(0, 0, 0, 0.16); border-radius: 50%; top: 15px; left: 54px; color: #FFFFFF; font-size: 27px; }
.cmpv-camera-circle .cmpv-camera { display: inline-block; vertical-align: middle; line-height: inherit; }
.cmpv-id-text { display: block; font-size: 13px; font-weight: 500; color: #666666; line-height: 20px; }
.cmpv-license-box { width: 155px; padding: 23px 17px 12px; }
.cmpv-license-box .cmpv-camera-circle { top: 30px; left: 32px; }
.cmpv-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--c-option-color, #333333); margin: 6px 0; }
/* 选项容器：默认（sfv-box）白底+圆角（消费 --c-input-radius）与边框（--c-inactive-border）。
   三种选择类风格（s1/s2/s3）由根节点的 sfx-optbox / sfx-optplain / sfx-optline 驱动。 */
.cmpv-opt-box { border: 1px solid var(--c-inactive-border, #dcdfe6); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); background: #fff; }
/* 「组件风格」语义 class（值→语义映射见 sfComponentStyle.styleVariant，与 C 端 .sf-field 同一套）：
     sfv-box   描边 + 浅底（= 基础样式，也是无风格时的默认）
     sfv-plain 白底 + 极淡描边（弱框；白底无框会在白卡片上「消失」，同 C 端 sfv-plain）
     sfv-line  去框只留底线
   此前预览根节点不挂风格 class、box1/box2 也没有对应规则 → 三个风格卡点了没反应。
   ⚠️ 覆盖清单必须与「有风格卡的组件的实际容器 class」一一对齐，漏一个该组件的风格卡就是死参数
   （已漏过 pay / realtime / opt-box / image-h / id-box，2026-10-04 审计补齐）。*/
.cmpv.sfv-box .cmpv-input,
.cmpv.sfv-box .cmpv-loc,
.cmpv.sfv-box .cmpv-auth,
.cmpv.sfv-box .cmpv-download,
.cmpv.sfv-box .cmpv-upload,
.cmpv.sfv-box .cmpv-pay,
.cmpv.sfv-box .cmpv-realtime,
.cmpv.sfv-box .cmpv-image-h,
.cmpv.sfv-box .cmpv-id-box,
.cmpv.sfv-box .cmpv-opt-box { background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.cmpv.sfv-plain .cmpv-input,
.cmpv.sfv-plain .cmpv-loc,
.cmpv.sfv-plain .cmpv-auth,
.cmpv.sfv-plain .cmpv-download,
.cmpv.sfv-plain .cmpv-upload,
.cmpv.sfv-plain .cmpv-pay,
.cmpv.sfv-plain .cmpv-realtime,
.cmpv.sfv-plain .cmpv-image-h,
.cmpv.sfv-plain .cmpv-id-box,
.cmpv.sfv-plain .cmpv-opt-box { background: #FFFFFF; border: 1px solid var(--c-plain-border, #EBEEF5); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
/* 线风格：输入类控件去边框仅保留底线（对齐 C 端 .sfv-line） */
.cmpv.sfv-line .cmpv-input,
.cmpv.sfv-line .cmpv-loc,
.cmpv.sfv-line .cmpv-auth,
.cmpv.sfv-line .cmpv-download,
.cmpv.sfv-line .cmpv-upload,
.cmpv.sfv-line .cmpv-pay,
.cmpv.sfv-line .cmpv-realtime,
.cmpv.sfv-line .cmpv-image-h,
.cmpv.sfv-line .cmpv-id-box,
.cmpv.sfv-line .cmpv-opt-box { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
/* 选择类三态（s1 描边整块 / s2 每项独立成卡 / s3 仅行间底线），与 C 端 sfx-opt* 同语义 */
.cmpv.sfx-optbox .cmpv-opt-box { background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-inactive-border, #dcdfe6); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.cmpv.sfx-optbox .cmpv-opt-row + .cmpv-opt-row { border-top: 1px solid var(--c-inactive-border, #dcdfe6); }
.cmpv.sfx-optplain .cmpv-opt-box { background: transparent; border: none; border-radius: 0; display: flex; flex-direction: column; gap: var(--c-input-pad-x, 10px); }
.cmpv.sfx-optplain .cmpv-opt-row { background: #FFFFFF; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); margin: 0; }
.cmpv.sfx-optline .cmpv-opt-box { background: transparent; border: none; border-radius: 0; }
.cmpv.sfx-optline .cmpv-opt-row + .cmpv-opt-row { border-top: 1px solid var(--c-border-color, #dcdfe6); }
/* 选项行：消费「组件风格」的 --c-input-pad-x（左右边距）与 --c-input-radius（输入框圆角）。
   此前写死 `padding: 6px 0` 且不引用这两个变量 → 选择类的左右边距/输入框圆角是死参数
   （变量已注入但无元素消费，实测 paddingLeft 恒 0px）。此处补上消费，与输入类组件同语义。
   圆角由外层 .cmpv-opt-box 承担（选项行本身无边框，圆角无处可见）。 */
.cmpv-opt-row { display: flex; align-items: center; gap: 8px; font-size: var(--c-input-size, 14px); color: var(--c-option-color, #333333); margin: 6px 0; padding: 6px var(--c-input-pad-x, 10px); }
/* 「选项类型」三态（content.optionType：文字/图片/图文）—— 与 C 端 .sf-opt-row.image/.imageText 同语义。
   图片/图文排布：list=纵向大图列表（对标站 .static-radio，img height:95px max-width:200px）/
                  grid=网格排列（每行 --c-opt-img-per-row 个，边长 --c-option-img-size）。 */
.cmpv-opt-box.opts-img { display: flex; flex-direction: column; }
.cmpv-opt-box.opts-img .cmpv-opt-row { margin: 0; align-items: center; gap: 10px; }
/* 列表模式：图片固定高 95px（对标站 .static-radio-image），宽度按比例自适应。
   未配图的占位块是 <span>，没有内在宽度，必须给显式宽高，否则会塌成一条细线。
   ⚠️ 两条规则必须保持这个先后顺序 —— 特异性相同（同 4 个 class），
   若 .cmpv-opt-img-ph 写在前面会被 width:auto 覆盖成 6px 细线（C 端踩过这个坑）。 */
.cmpv-opt-box.opts-img .cmpv-opt-row .cmpv-opt-img { height: var(--c-opt-img-h, 95px); width: auto; max-width: 200px; max-height: none; }
.cmpv-opt-box.opts-img .cmpv-opt-row .cmpv-opt-img-ph { width: var(--c-opt-img-ph-w, 130px); flex-shrink: 0; }
.cmpv-opt-box.opts-img .cmpv-opt-row.image,
.cmpv-opt-box.opts-img .cmpv-opt-row.imageText { flex-direction: row; align-items: center; gap: 10px; padding: 10px 0; }
.cmpv-opt-box.opts-img .cmpv-opt-row + .cmpv-opt-row { border-top: none; }
/* 网格模式 */
.cmpv-opt-box.opts-img.opts-img-grid { display: grid; grid-template-columns: repeat(var(--c-opt-img-per-row, 3), minmax(0, 1fr)); gap: 8px; }
.cmpv-opt-box.opts-img.opts-img-grid .cmpv-opt-row,
.cmpv-opt-box.opts-img.opts-img-grid .cmpv-opt-row.image,
.cmpv-opt-box.opts-img.opts-img-grid .cmpv-opt-row.imageText { flex-direction: column; gap: 4px; padding: 4px 0; align-items: center; }
/* 网格模式图片边长由「选项图片大小」控制（--c-option-img-size，缺省 64px）。
   不能写 width:100% —— 会被格子宽度覆盖把图撑满格，参数退化成死参数。 */
.cmpv-opt-box.opts-img.opts-img-grid .cmpv-opt-row .cmpv-opt-img,
.cmpv-opt-box.opts-img.opts-img-grid .cmpv-opt-row .cmpv-opt-img-ph { width: var(--c-option-img-size, 64px); max-width: 100%; height: auto; aspect-ratio: 1; max-height: none; }
.cmpv-opt-box.opts-img.opts-img-grid .cmpv-opt-label { text-align: center; }
/* 圆点/勾选框在模板里已是第一个子元素，column 布局下自然落在图上方（勿加 order:-1，会被推出选项行）。 */
.cmpv-opt-img { width: var(--c-option-img-size, 40px); height: var(--c-option-img-size, 40px); border-radius: var(--c-option-img-radius, 3px); background: var(--c-input-bg, #F7F9FA); object-fit: cover; flex-shrink: 0; }
/* 未配图的选项：灰色占位块 + 序号（对齐对标站画布；空 src 的 <img> 会显示破图图标） */
.cmpv-opt-img-ph { display: inline-flex; align-items: center; justify-content: center; font-size: 13px; color: #a8abb2; background: #f0f1f3; }
.cmpv-opt-label { flex: 1; min-width: 0; }
.cmpv-circle { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; flex-shrink: 0; position: relative; box-sizing: border-box; }
.cmpv-circle.on { border-color: var(--c-active-color, #2667EC); }
.cmpv-circle.on::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--c-active-color, #2667EC); }
.cmpv-square { width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; flex-shrink: 0; position: relative; box-sizing: border-box; }
.cmpv-square.on { border-color: var(--c-active-color, #2667EC); background: var(--c-active-color, #2667EC); }

/* ── 对标站 CSSOM 实测补齐（2026-10-04 精读）────────────────────────────
   风格3 = 胶囊按钮，选中态填 --c-active-color 蓝底白字：
     .top-box3-radio .el-radio.is-checked .el-radio__label {
       background: var(--active-color); border-color: var(--active-color); color: #fff; }
   我方此前三档选中态都只改圆点/勾选框颜色，选项胶囊本身不变色 → 风格3 视觉缺失。
   sfx-optfill 仅在 styleVariant 判定 styleType==='s3' 时挂载。 */
.cmpv.sfx-optfill .cmpv-opt-row { border-radius: var(--c-input-radius, 3px); }
.cmpv.sfx-optfill .cmpv-opt-row.on { background: var(--c-active-color, #2667EC); border-color: var(--c-active-color, #2667EC); }
.cmpv.sfx-optfill .cmpv-opt-row.on .cmpv-opt-label { color: #FFFFFF; }
.cmpv.sfx-optfill .cmpv-opt-row.on .cmpv-circle { border-color: #FFFFFF; background: #FFFFFF; }
.cmpv.sfx-optfill .cmpv-opt-row.on .cmpv-circle::after { background: var(--c-active-color, #2667EC); }
.cmpv.sfx-optfill .cmpv-opt-row.on .cmpv-square { border-color: #FFFFFF; background: #FFFFFF; }

/* 「选项文字对齐」（对标站 --align-items，默认 left） */
.cmpv-opt-box { text-align: var(--c-opt-align, left); }
.cmpv-opt-label { text-align: inherit; }

/* ── 组件级「上下布局 / 左右布局」（对标站 field-wrapper-radio-top / -left）──
   左右布局：标题固定 90px 与内容同行（对标站 label width:90px; content margin-left:90px） */
.cmpv.sf-layout-left { display: flex; align-items: flex-start; }
.cmpv.sf-layout-left > .cmpv-label { width: 90px; flex-shrink: 0; line-height: 20px; padding-top: 2px; }
.cmpv.sf-layout-left > .cmpv-opt-box,
.cmpv.sf-layout-left > .cmpv-input,
.cmpv.sf-layout-left > .cmpv-textarea-box,
.cmpv.sf-layout-left > .cmpv-number,
.cmpv.sf-layout-left > .cmpv-realtime,
.cmpv.sf-layout-left > .cmpv-pay,
.cmpv.sf-layout-left > .cmpv-upload { flex: 1; min-width: 0; margin-left: 90px; }
.cmpv.sf-layout-left.sfx-optbox > .cmpv-label,
.cmpv.sf-layout-left.sfx-optplain > .cmpv-label,
.cmpv.sf-layout-left.sfx-optline > .cmpv-label { padding-top: 10px; }
.cmpv-square.on::after { content: '✓'; position: absolute; inset: 0; color: #fff; font-size: 11px; line-height: 14px; text-align: center; }
.cmpv-submit { width: 100%; border: 1px solid var(--c-border-color, #0076F0); border-radius: var(--c-input-radius, 24px); padding: 10px; background: var(--c-input-bg, #0076F0); color: var(--c-title-color, #FFFFFF); font-size: 15px; }
.cmpv-loc { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-icon-color, #000000); background: var(--c-input-bg, #F7F9FA); box-sizing: border-box; }
/* 日期范围 / 时间段 / 车牌号（对标站形态） */
.cmpv-range { display: flex; align-items: center; gap: 8px; }
.cmpv-range .cmpv-range-cell { flex: 1; min-width: 0; }
.cmpv-range .cmpv-range-sep { color: var(--c-prompt-color, #CCCCCC); flex-shrink: 0; }
/* 车牌号：与 C 端 .sf-plate 同构 —— 每格独立圆角卡片（高 49px、居中、卡间留缝 2.5%），
   格 1 预填「粤」、格 8 新能源位绿框绿字、卡 1/2 之间 4px 圆点分隔符（对标站画布实测）。 */
.cmpv-plate { position: relative; display: flex; gap: 2.5%; }
.cmpv-plate .cmpv-plate-cell { width: 0; flex: 1; min-width: 0; height: 49px; display: flex; align-items: center; justify-content: center; font-size: var(--c-input-size, 14px); background: transparent; border: none; border-radius: 0; overflow: hidden; white-space: nowrap; box-sizing: border-box; }
.cmpv.sfv-box .cmpv-plate .cmpv-plate-cell { background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.cmpv.sfv-line .cmpv-plate .cmpv-plate-cell { background: transparent; border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; }
.cmpv-plate .cmpv-plate-cell--ne { border-color: rgb(0, 181, 0) !important; color: rgb(0, 181, 0) !important; }
.cmpv-plate-dot { position: absolute; left: 23%; top: 50%; width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: var(--c-input-color, #333333); }
.cmpv-agree { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--c-input-color, #333333); }
.cmpv-agree a { color: var(--c-agree-btn, #2667EC); }
.cmpv-rate { display: flex; font-size: 20px; letter-spacing: 2px; }
.cmpv-rate-ic { font-size: 24px; margin-right: 4px; }
.cmpv-rate-desc { color: var(--c-desc-color, #999999); font-size: 12px; margin-bottom: 4px; }
.cmpv-download { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-file-size, 13px); color: var(--c-file-title, #333333); background: var(--c-input-bg, #F7F9FA); }
.cmpv-download::after { content: ' 下载'; color: var(--c-down-color, #4385FF); }
.cmpv-auth { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); background: var(--c-input-bg, #F7F9FA); color: var(--c-empower-color, #4385FF); }
.cmpv-sms { display: flex; gap: var(--c-inner-margin, 8px); align-items: stretch; }
.cmpv-sms .cmpv-input { flex: 1; }
.cmpv-auth-btn { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 3px); padding: 0 12px; font-size: 13px; background: #fff; color: var(--c-msg-color, #4385FF); white-space: nowrap; cursor: default; }
.cmpv-title { font-weight: 600; }
.cmpv-title-sub { display: block; font-size: var(--c-subtitle-size, 13px); color: var(--c-subtitle-color, #909399); margin-top: 4px; font-weight: 400; }
.cmpv-title-tip { display: block; font-size: 12px; color: var(--c-desc-color, #999999); margin-top: 4px; }
.cmpv-richtext { font-size: 13px; color: #303133; line-height: 1.6; }
.cmpv-line { margin: 4px 0; }
.cmpv-swiper { width: 100%; border-radius: var(--c-img-radius, 0px); overflow: hidden; }
.cmpv-swiper-img { width: 100%; height: 64px; object-fit: cover; display: block; }
.cmpv-swiper-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 4px); padding: 16px; text-align: center; color: #909399; font-size: 12px; }
.cmpv-bigimg { width: 100%; height: 80px; background-size: cover; background-position: center; border-radius: var(--c-img-radius, 3px); }
.cmpv-bigimg-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 4px); padding: 24px; text-align: center; color: #909399; font-size: 12px; }
.cmpv-video-empty { background: #000; color: #fff; text-align: center; padding: 24px; font-size: 12px; border-radius: var(--c-input-radius, 4px); }
.cmpv-backdesc { font-size: var(--c-title-size, 14px); color: var(--c-input-color, #333333); line-height: 1.6; }
/* 实时动态：此前只有圆角+padding、无边框无底色 → 风格卡的「框风格」无任何基础样式可改，
   视觉上也与 C 端 .sf-realtime（描边+底色）不一致。现补齐基础样式，风格 class 才有作用对象。 */
.cmpv-realtime { font-size: 12px; color: var(--c-title-color, #000000); border-radius: var(--c-input-radius, 10px); padding: 8px 10px; background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-border-color, #F5F2F2); }
.cmpv-pagebreak { display: flex; gap: 10px; }
.cmpv-pb-btn { flex: 1; border-radius: var(--c-input-radius, 19px); padding: 8px; font-size: 14px; }
.cmpv-pb-prev { background: var(--c-prev-bg, #EDF1F3); color: var(--c-prev-color, #333333); border: 1px solid var(--c-prev-border, #EDF1F3); }
.cmpv-pb-next { background: var(--c-next-bg, #0076F0); color: var(--c-next-color, #FFFFFF); border: 1px solid var(--c-next-border, #0076F0); }
.cmpv-pay { border: 1px solid var(--c-border-color, #F7F9FA); border-radius: var(--c-input-radius, 3px); padding: var(--c-model-margin-y, 10px); background: var(--c-input-bg, #F7F9FA); }
.cmpv-pay-label { font-size: var(--c-title-size, 16px); color: var(--c-title-color, #000000); font-weight: 600; margin-bottom: 6px; }
.cmpv-pay-specs { display: flex; flex-direction: column; gap: 4px; }
.cmpv-pay-spec { font-size: 12px; color: var(--c-spec-color, #000000); border: 1px solid var(--c-border-color, #F7F9FA); border-radius: var(--c-input-radius, 3px); padding: 4px 6px; }
.cmpv-pay-spec .cmpv-pay-price { color: var(--c-price-color, #FF1C1C); }
.cmpv-pay-tip { font-size: 12px; color: var(--c-count-color, #79797B); }
</style>
