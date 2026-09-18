<template>
  <div>
    <AppPageHeader title="购买门店" desc="nshop 原机制：总后台授权配额，数量不够时可购买门店增加额度（本地为模拟购买，确认即生效）" />

    <el-row :gutter="16">
      <el-col :span="8">
        <el-card class="quota-box">
          <div class="q-label">剩余可创建数量</div>
          <div class="q-num remain">{{ quota.remaining }}</div>
          <div class="q-label" style="margin-top:16px">当前已创建数量</div>
          <div class="q-num">{{ quota.used }}</div>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card>
          <el-form :model="form" label-width="130px">
            <el-form-item label="购买门店数量" required>
              <el-input-number v-model="form.count" :min="1" :max="1000" style="width:200px" />
              <span class="unit">个</span>
            </el-form-item>
            <el-form-item label="选择充值套餐">
              <div class="packs">
                <div v-for="p in packs" :key="p.count" class="pack" :class="{ active: form.count === p.count }" @click="form.count = p.count">
                  <div class="pack-count">{{ p.count }} 个门店</div>
                  <div class="pack-price">¥{{ p.price }}</div>
                </div>
              </div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="buying" @click="buy">确认购买</el-button>
              <span class="buy-tip">本地环境为模拟购买：确认后配额立即增加（正式计费需接入支付体系）</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const quota = ref({ quota: 50, used: 0, remaining: 50 });
const buying = ref(false);
const form = ref({ count: 10 });
// nshop 充值套餐示例：数量阶梯
const packs = [
  { count: 10, price: 99 },
  { count: 50, price: 399 },
  { count: 100, price: 699 },
  { count: 500, price: 2999 },
];

async function load() {
  try {
    const r = await customerApiCall.get('/store/quota');
    quota.value = r || quota.value;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  }
}

async function buy() {
  const count = form.value.count;
  try {
    await ElMessageBox.confirm(`确认购买 ${count} 个门店？购买后配额立即增加 ${count} 个`, '确认购买', { type: 'info' });
  } catch {
    return;
  }
  buying.value = true;
  try {
    const r = await customerApiCall.post('/store/purchase', { count });
    quota.value = r || quota.value;
    ElMessage.success(`购买成功：剩余可创建数量 ${quota.value.remaining} 个`);
  } catch (e) {
    ElMessage.error(e || '购买失败');
  } finally {
    buying.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.quota-box { text-align: center; padding: 12px 0; }
.q-label { font-size: 13px; color: #86909c; }
.q-num { font-size: 36px; font-weight: 600; color: #1d2129; margin-top: 4px; }
.remain { color: #ff7d00; }
.unit { margin-left: 8px; color: #86909c; }
.packs { display: flex; gap: 12px; flex-wrap: wrap; }
.pack {
  width: 140px; border: 1px solid #e5e6eb; border-radius: 8px; padding: 14px 12px; cursor: pointer; text-align: center; transition: all 0.2s;
}
.pack:hover { border-color: #165dff; }
.pack.active { border-color: #165dff; background: #f7fbff; }
.pack-count { font-size: 15px; font-weight: 600; color: #1d2129; }
.pack-price { font-size: 14px; color: #f53f3f; margin-top: 6px; }
.buy-tip { font-size: 12px; color: #86909c; margin-left: 12px; }
</style>
