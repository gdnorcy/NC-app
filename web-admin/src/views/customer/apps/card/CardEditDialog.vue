<template>
  <el-dialog
    :model-value="modelValue"
    title="编辑名片"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="loadDetail"
  >
    <div v-loading="loading">
      <el-alert type="info" :closable="false" style="margin-bottom: 14px;">
        代员工编辑名片基础资料，保存后 H5/小程序立即生效。头像、作品集、视频请通知员工本人在手机端维护。
      </el-alert>
      <el-form :model="form" label-width="88px" size="default">
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="姓名"><el-input v-model="form.name" maxlength="40" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="职位"><el-input v-model="form.position" maxlength="40" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="公司"><el-input v-model="form.company" maxlength="60" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="行业"><el-input v-model="form.industry" maxlength="40" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="手机号"><el-input v-model="form.phone" maxlength="20" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="微信号"><el-input v-model="form.wechat" maxlength="40" /></el-form-item></el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12"><el-form-item label="邮箱"><el-input v-model="form.email" maxlength="60" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="城市"><el-input v-model="form.city" maxlength="40" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="一句话简介"><el-input v-model="form.slogan" maxlength="60" placeholder="展示在名片头部的 slogan" /></el-form-item>
        <el-form-item label="详细地址"><el-input v-model="form.address" maxlength="120" placeholder="如：东莞市南城区XX大厦X楼" /></el-form-item>
        <el-form-item label="视频号ID"><el-input v-model="form.videoChannel" maxlength="40" placeholder="sph 开头，留空则不展示视频号入口" /></el-form-item>
        <el-form-item label="个人简介"><el-input v-model="form.bio" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
        <el-form-item label="公开状态">
          <el-switch v-model="form.isPublic" active-text="公开（访客可见）" inactive-text="未公开" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../../api';

// 智能名片后台共用的「代编辑名片」弹窗：名片管理 / 员工名片 两页复用同一组件与同一接口
//（GET/PUT /card/manage/:id，租户作用域校验在服务端）。
const props = defineProps({
  modelValue: Boolean,
  cardId: [String, Number],
});
const emit = defineEmits(['update:modelValue', 'saved']);

const loading = ref(false);
const saving = ref(false);
const form = reactive({
  name: '', position: '', company: '', industry: '', phone: '', wechat: '',
  email: '', city: '', slogan: '', address: '', videoChannel: '', bio: '', isPublic: false,
});

async function loadDetail() {
  if (!props.cardId) return;
  loading.value = true;
  try {
    const res = await customerApiCall.get(`/card/manage/${props.cardId}`);
    Object.assign(form, res.card || {});
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '加载名片资料失败');
    emit('update:modelValue', false);
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  try {
    // 全量提交表单字段（服务端按白名单落库）；经纬度不在本弹窗维护，不提交
    await customerApiCall.put(`/card/manage/${props.cardId}`, {
      name: form.name, position: form.position, company: form.company, industry: form.industry,
      phone: form.phone, wechat: form.wechat, email: form.email, city: form.city,
      slogan: form.slogan, address: form.address, videoChannel: form.videoChannel,
      bio: form.bio, isPublic: form.isPublic,
    });
    ElMessage.success('已保存');
    emit('update:modelValue', false);
    emit('saved');
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}

// 关闭后清 loading 态，防止下次打开残留
watch(() => props.modelValue, (v) => { if (!v) saving.value = false; });
</script>
