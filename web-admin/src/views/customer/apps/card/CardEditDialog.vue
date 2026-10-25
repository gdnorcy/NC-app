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
        <!-- 第26轮：认证/集市双开关（仅个人名片且非企业员工身份；操作走独立端点并落操作记录） -->
        <template v-if="showCertifySwitches">
          <el-form-item label="认证身份">
            <el-switch v-model="certified" :loading="certBusy" active-text="认证个人" inactive-text="未认证" @change="onCertifyChange" />
            <span class="form-tip-inline">认证后可上架集市、可被人交换名片</span>
          </el-form-item>
          <el-form-item label="上架集市">
            <el-switch v-model="inMarket" :disabled="!certified" :loading="marketBusy" active-text="已上架" inactive-text="未上架" @change="onMarketChange" />
            <span v-if="!certified" class="form-tip-inline">需先完成认证</span>
            <span v-else-if="marketStatus === 'pending'" class="form-tip-inline">当前为待审核状态</span>
          </el-form-item>
        </template>
      </el-form>
      <!-- 第26轮：认证/集市操作记录（含管理员直操作与 C 端申请审核的落库日志） -->
      <el-collapse v-if="logs.length" class="oplogs">
        <el-collapse-item :title="`操作记录（${logs.length}）`" name="logs">
          <div v-for="(l, i) in logs" :key="i" class="oplog-row">
            <span class="oplog-time">{{ String(l.created_at || '').replace('T', ' ').slice(0, 16) }}</span>
            <span class="oplog-detail">{{ l.detail || l.action }}</span>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
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

// —— 第26轮：认证/集市双开关状态（仅个人名片且非企业员工身份展示） ——
const certified = ref(false);
const inMarket = ref(false);
const marketStatus = ref('');
const certBusy = ref(false);
const marketBusy = ref(false);
const logs = ref([]);
const showCertifySwitches = computed(() => form.cardType === 'personal' && form.identity !== 'employee');

async function onCertifyChange(v) {
  const name = form.name || '该用户';
  const tip = v
    ? `确定认证「${name}」为认证个人？通过后可上架集市、可被人交换名片。`
    : `取消认证将同时把该用户移出集市、名片转为未公开，确定？`;
  try {
    await ElMessageBox.confirm(tip, v ? '认证个人' : '取消认证', { type: v ? 'success' : 'warning' });
  } catch { certified.value = !v; return; }
  certBusy.value = true;
  try {
    await customerApiCall.post(`/card/manage/${props.cardId}/certify`, { certified: v });
    ElMessage.success(v ? '已认证' : '已取消认证');
    if (!v) { inMarket.value = false; marketStatus.value = ''; }
    loadDetail();
    emit('saved');
  } catch (e) {
    certified.value = !v;
    ElMessage.error(e?.response?.data?.error || '操作失败');
  } finally {
    certBusy.value = false;
  }
}

async function onMarketChange(v) {
  const name = form.name || '该名片';
  try {
    await ElMessageBox.confirm(
      v ? `确定将「${name}」上架到人脉集市？` : `确定将「${name}」移出集市？`,
      v ? '上架集市' : '下架集市',
      { type: v ? 'success' : 'warning' }
    );
  } catch { inMarket.value = !v; return; }
  marketBusy.value = true;
  try {
    const res = await customerApiCall.post(`/card/manage/${props.cardId}/market`, { inMarket: v });
    if (v && res?.auditStatus === 'pending') ElMessage.success('已上架，等待审核');
    else ElMessage.success(v ? '已上架' : '已下架');
    loadDetail();
    emit('saved');
  } catch (e) {
    inMarket.value = !v;
    ElMessage.error(e?.response?.data?.error || '操作失败');
  } finally {
    marketBusy.value = false;
  }
}

async function loadDetail() {
  if (!props.cardId) return;
  loading.value = true;
  try {
    const res = await customerApiCall.get(`/card/manage/${props.cardId}`);
    const detail = res.card || {};
    Object.assign(form, detail);
    certified.value = !!detail.certified;
    marketStatus.value = detail.marketStatus || '';
    inMarket.value = !!detail.marketItemId && detail.marketStatus !== 'rejected';
    try {
      const res2 = await customerApiCall.get(`/card/manage/${props.cardId}/oplogs`);
      logs.value = res2.logs || [];
    } catch { logs.value = []; }
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

<style scoped>
.form-tip-inline { margin-left: 10px; font-size: 12px; color: #86909c; }
.oplogs { margin-top: 4px; border-top: 1px solid #e5e6eb; padding-top: 6px; }
.oplog-row { display: flex; gap: 10px; font-size: 12px; line-height: 1.8; color: #4e5969; }
.oplog-time { color: #86909c; flex-shrink: 0; }
.oplog-detail { word-break: break-all; }
</style>
