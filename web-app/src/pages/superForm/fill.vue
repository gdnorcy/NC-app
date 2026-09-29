<template>
  <view class="sf-page">
    <view class="sf-form" :class="layout" :style="globalStyle">
      <view class="sf-form-name" v-if="form.name">{{ form.name }}</view>

      <template v-for="comp in visibleComponents" :key="comp.id">
        <view class="sf-field">
          <view class="sf-label" v-if="comp.type !== 'submit'">
            {{ comp.content.label || '未命名' }}
            <text v-if="comp.content.required" class="sf-req">*</text>
          </view>

          <!-- 单行/多行文本 -->
          <textarea v-if="comp.type === 'textarea'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" />
          <input v-else-if="comp.type === 'text'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" />

          <!-- 图片上传 -->
          <view v-else-if="comp.type === 'image'" class="sf-upload" @click="pickImage(comp.id)">
            <text v-if="!values[comp.id]">+ 上传图片（最多 {{ comp.content.maxCount }} 张）</text>
            <text v-else>{{ values[comp.id].length }} 张已选</text>
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

          <!-- 提交按钮 -->
          <button v-else-if="comp.type === 'submit'" class="sf-submit" @click="submit">{{ comp.content.label || '确认' }}</button>
        </view>
      </template>

      <view v-if="ended" class="sf-ended">表单已结束，感谢您的参与。</view>
      <view v-if="!visibleComponents.length" class="sf-empty">表单暂无内容，请返回。</view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';

const formId = ref(null);
const form = reactive({ name: '', config: { components: [], settings: {} } });
const values = reactive({});
const ended = ref(false);
const submitting = ref(false);

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

onLoad((opts) => {
  formId.value = opts?.formId || opts?.id;
  if (formId.value) load();
});

async function load() {
  try {
    const res = await cardApi.getSuperForm(formId.value);
    form.name = res.name;
    form.config = res.config || { components: [], settings: {} };
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

function validate() {
  for (const c of visibleComponents.value) {
    if (c.type === 'submit') continue;
    const v = values[c.id];
    const ct = c.content;
    if (ct.required) {
      const empty = v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '');
      if (empty) return ct.label + '为必填项';
    }
    if (c.type === 'text' && v) {
      const s = String(v).trim();
      if (ct.minLength && s.length < ct.minLength) return ct.label + `至少 ${ct.minLength} 位`;
      if (ct.maxLength && s.length > ct.maxLength) return ct.label + `最多 ${ct.maxLength} 位`;
      if (ct.contentType === 'phone' && !/^1[3-9]\d{9}$/.test(s)) return ct.label + '格式不正确（手机号）';
      if (ct.contentType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return ct.label + '格式不正确（邮箱）';
      if (ct.contentType === 'idcard' && !/(^\d{15}$)|(^\d{17}[\dXx]$)/.test(s)) return ct.label + '格式不正确（身份证）';
    }
  }
  return null;
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
</style>
