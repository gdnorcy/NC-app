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
      <div v-for="(opt, i) in comp.content.options" :key="i" class="cmpv-opt"><span class="cmpv-circle" />{{ opt.label }}</div>
    </template>

    <template v-else-if="comp.type === 'checkbox'">
      <div v-for="(opt, i) in comp.content.options" :key="i" class="cmpv-opt"><span class="cmpv-square" />{{ opt.label }}</div>
    </template>

    <template v-else-if="comp.type === 'select'">
      <div class="cmpv-input cmpv-select">{{ comp.content.options?.[0]?.label || '请选择' }} ▾</div>
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
      <div class="cmpv-rate">{{ '★'.repeat(comp.content.defaultValue || 0) }}{{ '☆'.repeat((comp.content.max || 5) - (comp.content.defaultValue || 0)) }}</div>
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
      <div class="cmpv-title" :style="{ fontSize: (comp.content.size || 18) + 'px', textAlign: comp.content.align || 'left', color: comp.content.color || '#303133' }">{{ comp.content.text }}</div>
    </template>

    <template v-else-if="comp.type === 'richtext'">
      <div class="cmpv-richtext" v-html="comp.content.html" />
    </template>

    <template v-else-if="comp.type === 'blank'">
      <div :style="{ height: (comp.content.height || 20) + 'px' }" />
    </template>

    <template v-else-if="comp.type === 'line'">
      <div class="cmpv-line" :style="{ borderTopStyle: comp.content.style || 'solid', borderTopColor: comp.content.color || '#dcdfe6' }" />
    </template>

    <template v-else-if="comp.type === 'swiper'">
      <div v-if="(comp.content.images || []).length" class="cmpv-swiper">
        <img :src="comp.content.images[0]" class="cmpv-swiper-img" />
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
      <div class="cmpv-pagebreak">— 分页 —</div>
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
.cmpv-label { font-size: var(--c-title-size, 14px); color: #303133; margin-bottom: 6px; }
.cmpv-req { color: #f56c6c; margin-left: 2px; }
.cmpv-input { width: 100%; border: 1px solid #dcdfe6; border-radius: var(--c-input-radius, var(--g-input-radius, 4px)); padding: 8px 10px; font-size: var(--c-input-size, 14px); background: #fff; color: #909399; box-sizing: border-box; }
.cmpv-select { display: flex; align-items: center; }
.cmpv-upload { border: 1px dashed #c0c4cc; border-radius: var(--g-radius, 6px); padding: 16px; text-align: center; color: #909399; font-size: 13px; }
.cmpv-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #303133; margin: 6px 0; }
.cmpv-circle { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #c0c4cc; }
.cmpv-square { width: 16px; height: 16px; border-radius: 3px; border: 1px solid #c0c4cc; }
.cmpv-submit { width: 100%; border: none; border-radius: 6px; padding: 10px; background: #409eff; color: #fff; font-size: 15px; }
.cmpv-loc { border: 1px solid #dcdfe6; border-radius: var(--g-radius, 4px); padding: 8px 10px; font-size: 14px; color: #409eff; background: #ecf5ff; box-sizing: border-box; }
.cmpv-agree { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #606266; }
.cmpv-agree a { color: #409eff; }
.cmpv-rate { font-size: 20px; color: #f7ba2a; letter-spacing: 2px; }
.cmpv-download { border: 1px solid #dcdfe6; border-radius: var(--g-radius, 4px); padding: 8px 10px; font-size: 13px; color: #409eff; background: #ecf5ff; }
.cmpv-auth { border: 1px solid #dcdfe6; border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 8px 12px; font-size: var(--c-input-size, 14px); background: #fff; color: #409eff; }
.cmpv-sms { display: flex; gap: 8px; align-items: stretch; }
.cmpv-sms .cmpv-input { flex: 1; }
.cmpv-auth-btn { border: 1px solid #dcdfe6; border-radius: 4px; padding: 0 12px; font-size: 13px; background: #fff; color: #409eff; white-space: nowrap; cursor: default; }
.cmpv-title { font-weight: 600; }
.cmpv-richtext { font-size: 13px; color: #303133; line-height: 1.6; }
.cmpv-line { border-top-width: 1px; margin: 4px 0; }
.cmpv-swiper { width: 100%; border-radius: 4px; overflow: hidden; }
.cmpv-swiper-img { width: 100%; height: 64px; object-fit: cover; display: block; }
.cmpv-swiper-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: 4px; padding: 16px; text-align: center; color: #909399; font-size: 12px; }
.cmpv-bigimg { width: 100%; height: 80px; background-size: cover; background-position: center; border-radius: 4px; }
.cmpv-bigimg-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: 4px; padding: 24px; text-align: center; color: #909399; font-size: 12px; }
.cmpv-video-empty { background: #000; color: #fff; text-align: center; padding: 24px; font-size: 12px; border-radius: 4px; }
.cmpv-backdesc { font-size: 12px; color: #909399; background: #f5f6f8; border-radius: 4px; padding: 8px 10px; line-height: 1.6; }
.cmpv-realtime { font-size: 12px; color: #606266; background: #ecf5ff; border-radius: 4px; padding: 8px 10px; }
.cmpv-pagebreak { text-align: center; color: #909399; font-size: 12px; border-top: 1px dashed #c0c4cc; padding-top: 6px; }
.cmpv-pay { border: 1px solid #f0c78a; border-radius: 4px; padding: 8px; background: #fffaf0; }
.cmpv-pay-label { font-size: 13px; color: #303133; font-weight: 600; margin-bottom: 6px; }
.cmpv-pay-specs { display: flex; flex-direction: column; gap: 4px; }
.cmpv-pay-spec { font-size: 12px; color: #606266; border: 1px solid #dcdfe6; border-radius: 4px; padding: 4px 6px; }
.cmpv-pay-tip { font-size: 12px; color: #909399; }
</style>
