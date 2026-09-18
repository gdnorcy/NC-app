<template>
  <div>
    <AppPageHeader title="基础设置" desc="1:1 nshop 连锁门店基础设置：模式/优惠券/会员卡/提现方式/抽成/门店入口">
      <template #default>
        <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
      </template>
    </AppPageHeader>

    <el-card>
      <el-alert type="warning" :closable="false" show-icon title="门店模式暂不支持虚拟卡密、预约到店、积分商城" style="margin-bottom:16px" />

      <el-form :model="form" label-width="150px" class="setting-form">
        <el-form-item label="连锁门店模式">
          <el-switch v-model="form.chainMode" :active-value="1" :inactive-value="0" />
          <div class="form-tip">启用后移动端下单必须选择门店方可访问商城</div>
        </el-form-item>
        <el-form-item label="总部优惠券">
          <el-radio-group v-model="form.couponBearer">
            <el-radio value="head">总部承担</el-radio>
            <el-radio value="store">门店承担</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="付费会员卡">
          <el-radio-group v-model="form.memberCardBearer">
            <el-radio value="head">总部</el-radio>
            <el-radio value="store">门店</el-radio>
          </el-radio-group>
          <div class="form-tip">例：会员卡售价 10 元，总部设置免费赠送（10 元由总部承担）</div>
        </el-form-item>
        <el-form-item label="门店提现方式">
          <el-checkbox-group v-model="form.withdrawMethods">
            <el-checkbox value="alipay">支付宝</el-checkbox>
            <el-checkbox value="wechat">微信</el-checkbox>
            <el-checkbox value="bank">银行卡</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="门店提现抽成">
          <el-radio-group v-model="form.withdrawRatioType">
            <el-radio value="custom">自定义
              <el-input-number v-model="form.withdrawRatio" :min="0" :max="100" size="small" style="width:90px" /> %
            </el-radio>
            <el-radio value="none">不抽成</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="门店入口">
          <div class="entry-row">
            <el-input v-model="form.storeEntryUrl" placeholder="门店后台管理地址" readonly style="width:360px" />
            <el-button @click="copyEntry">复制链接</el-button>
          </div>
          <div class="form-tip">门店后台管理地址（点击访问）</div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const saving = ref(false);
const form = ref({ chainMode: 0, couponBearer: 'head', memberCardBearer: 'head', withdrawMethods: ['alipay', 'wechat'], withdrawRatioType: 'custom', withdrawRatio: 10, storeEntryUrl: '' });

async function load() {
  try {
    const r = await customerApiCall.get('/store/settings');
    form.value = { ...form.value, ...(r.settings || {}) };
    if (!form.value.storeEntryUrl) form.value.storeEntryUrl = `${location.origin}/store/entry`;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  }
}

async function save() {
  saving.value = true;
  try {
    await customerApiCall.put('/store/settings', { settings: form.value });
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

function copyEntry() {
  try {
    navigator.clipboard.writeText(form.value.storeEntryUrl);
    ElMessage.success('链接已复制');
  } catch {
    ElMessage.info(form.value.storeEntryUrl);
  }
}

onMounted(load);
</script>

<style scoped>
.setting-form { max-width: 720px; }
.form-tip { font-size: 12px; color: #86909c; width: 100%; margin-top: 4px; }
.entry-row { display: flex; gap: 8px; }
</style>
