<template>
  <div class="cmpv">
    <div v-if="!noLabel.includes(comp.type)" class="cmpv-label">
      {{ comp.content.label || '未命名' }}
      <span v-if="comp.content.required" class="cmpv-req">*</span>
    </div>

    <template v-if="comp.type === 'text' || comp.type === 'textarea'">
      <input class="cmpv-input" :placeholder="comp.content.placeholder" :value="comp.content.prefill" disabled />
    </template>

    <template v-else-if="comp.type === 'image'">
      <div class="cmpv-upload">+ 上传图片（最多 {{ comp.content.maxCount }} 张）</div>
    </template>

    <template v-else-if="comp.type === 'radio'">
      <div class="cmpv-opts">
        <div v-for="(opt, i) in comp.content.options" :key="i"
             class="cmpv-opt" :class="{ on: i === 0, line: comp.style && comp.style.styleType === 'line' }">{{ opt.label }}</div>
      </div>
    </template>

    <template v-else-if="comp.type === 'checkbox'">
      <div class="cmpv-opts">
        <div v-for="(opt, i) in comp.content.options" :key="i"
             class="cmpv-opt" :class="{ on: i === 0, line: comp.style && comp.style.styleType === 'line' }">{{ opt.label }}</div>
      </div>
    </template>

    <template v-else-if="comp.type === 'select'">
      <div class="cmpv-input cmpv-select">{{ comp.content.options?.[0]?.label || '请选择' }}</div>
    </template>

    <template v-else-if="comp.type === 'date'">
      <div class="cmpv-input">选择{{ comp.content.dateType === 'time' ? '日期时间' : '日期' }}</div>
    </template>

    <template v-else-if="comp.type === 'number'">
      <input class="cmpv-input" :placeholder="comp.content.placeholder || '请输入数字'" :value="comp.content.prefill" disabled />
    </template>

    <template v-else-if="comp.type === 'time'">
      <div class="cmpv-input">选择{{ comp.content.dateType === 'time' ? '时间' : (comp.content.dateType === 'datetime' ? '日期时间' : '日期') }}</div>
    </template>

    <template v-else-if="comp.type === 'location'">
      <div class="cmpv-loc">📍 {{ comp.content.tipText || '点击获取定位' }}</div>
    </template>

    <template v-else-if="comp.type === 'attachment'">
      <div class="cmpv-upload">+ 上传附件（最多 {{ comp.content.maxCount }} 个）</div>
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
      <input class="cmpv-input" :placeholder="comp.content.placeholder || '请输入车牌号'" disabled />
    </template>

    <template v-else-if="comp.type === 'title'">
      <div class="cmpv-title" :style="{ fontSize: (comp.style && comp.style.titleSize || comp.content.size || 17) + 'px', textAlign: comp.content.align || 'left', color: comp.style && comp.style.labelColor || comp.content.color || '#000000' }">{{ comp.content.text }}</div>
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
defineProps({ comp: { type: Object, required: true } });
const noLabel = ['submit', 'title', 'richtext', 'blank', 'line', 'swiper', 'bigimage', 'video', 'backdesc', 'realtime', 'pagebreak', 'pay'];
</script>

<style scoped>
/* 所有样式均消费「组件样式 → CSS 变量」（ew 四段：背景/整体/风格/颜色），与 C 端 fill.vue 同一套语义 */
.cmpv-label { font-size: var(--c-title-size, 14px); color: var(--c-title-color, #000000); margin-bottom: 6px; }
.cmpv-req { color: var(--c-error-color, #ED4F4F); margin-left: 2px; }
.cmpv-input { width: 100%; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); background: var(--c-input-bg, #F7F9FA); color: var(--c-input-color, #333333); box-sizing: border-box; }
.cmpv-input::placeholder { color: var(--c-prompt-color, #CCCCCC); }
.cmpv-select { display: flex; align-items: center; justify-content: space-between; }
.cmpv-select::after { content: '▾'; color: var(--c-icon-color, #000000); }
.cmpv-upload { width: var(--c-upload-size, 45px); height: var(--c-upload-size, 45px); display: flex; align-items: center; justify-content: center; border: 1px dashed var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); background: var(--c-input-bg, #F7F9FA); color: var(--c-prompt-color, #999999); font-size: var(--c-prompt-size, 14px); }
.cmpv-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--c-option-color, #333333); margin: 6px 0; }
.cmpv-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.cmpv-opt { border: 1px solid var(--c-inactive-border, #F5F2F2); border-radius: var(--c-input-radius, 6px); padding: 8px 14px; font-size: var(--c-input-size, 14px); color: var(--c-option-color, #333333); background: var(--c-input-bg, #F7F9FA); }
.cmpv-opt.on { border-color: var(--c-active-color, #2667EC); color: var(--c-active-color, #2667EC); background: var(--c-input-bg, #F7F9FA); }
.cmpv-opt.line { border-radius: 0; background: transparent; }
.cmpv-opt.line:not(.on) { border-color: transparent; border-bottom: 1px solid var(--c-border-color, #dcdfe6); }
.cmpv-opt.on.line { border-color: transparent; border-bottom: 1px solid var(--c-active-color, #2667EC); }
.cmpv-circle { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--c-inactive-border, #F5F2F2); background: var(--c-input-bg, #F7F9FA); }
.cmpv-square { width: 16px; height: 16px; border-radius: 3px; border: 1px solid var(--c-inactive-border, #F5F2F2); background: var(--c-input-bg, #F7F9FA); }
.cmpv-submit { width: 100%; border: 1px solid var(--c-border-color, #0076F0); border-radius: var(--c-input-radius, 22px); padding: 10px; background: var(--c-input-bg, #0076F0); color: var(--c-title-color, #FFFFFF); font-size: 15px; }
.cmpv-loc { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-icon-color, #000000); background: var(--c-input-bg, #F7F9FA); box-sizing: border-box; }
.cmpv-agree { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--c-input-color, #333333); }
.cmpv-agree a { color: var(--c-input-color, #2667EC); }
.cmpv-rate { display: flex; font-size: 20px; letter-spacing: 2px; }
.cmpv-rate-ic { font-size: 24px; margin-right: 4px; }
.cmpv-rate-desc { color: var(--c-desc-color, #999999); font-size: 12px; margin-bottom: 4px; }
.cmpv-download { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-file-size, 13px); color: var(--c-file-title, #333333); background: var(--c-input-bg, #F7F9FA); }
.cmpv-download::after { content: ' 下载'; color: var(--c-down-color, #4385FF); }
.cmpv-auth { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 8px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); background: var(--c-input-bg, #F7F9FA); color: var(--c-empower-color, #4385FF); }
.cmpv-sms { display: flex; gap: 8px; align-items: stretch; }
.cmpv-sms .cmpv-input { flex: 1; }
.cmpv-auth-btn { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 3px); padding: 0 12px; font-size: 13px; background: #fff; color: var(--c-msg-color, #4385FF); white-space: nowrap; cursor: default; }
.cmpv-title { font-weight: 600; }
.cmpv-richtext { font-size: 13px; color: #303133; line-height: 1.6; }
.cmpv-line { margin: 4px 0; }
.cmpv-swiper { width: 100%; border-radius: var(--c-img-radius, 0px); overflow: hidden; }
.cmpv-swiper-img { width: 100%; height: 64px; object-fit: cover; display: block; }
.cmpv-swiper-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 4px); padding: 16px; text-align: center; color: #909399; font-size: 12px; }
.cmpv-bigimg { width: 100%; height: 80px; background-size: cover; background-position: center; border-radius: var(--c-img-radius, 3px); }
.cmpv-bigimg-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 4px); padding: 24px; text-align: center; color: #909399; font-size: 12px; }
.cmpv-video-empty { background: #000; color: #fff; text-align: center; padding: 24px; font-size: 12px; border-radius: var(--c-input-radius, 4px); }
.cmpv-backdesc { font-size: var(--c-title-size, 14px); color: var(--c-input-color, #333333); line-height: 1.6; }
.cmpv-realtime { font-size: 12px; color: var(--c-title-color, #000000); border-radius: var(--c-input-radius, 10px); padding: 8px 10px; }
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
/* 线风格：输入类控件去边框仅留底线（对齐 C 端 .cs-line，.cs-line 加在父级 wrap 上） */
:deep(.cs-line) .cmpv-input,
:deep(.cs-line) .cmpv-loc,
:deep(.cs-line) .cmpv-auth,
:deep(.cs-line) .cmpv-auth-btn,
:deep(.cs-line) .cmpv-download,
:deep(.cs-line) .cmpv-upload { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
</style>
