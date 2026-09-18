<template>
  <div>
    <AppPageHeader title="提现管理" desc="1:1 nshop 门店提现（列结构：门店 / 提现方式·业绩 / 实际提现 / 扣除抽成 / 状态）">
      <template #default>
        <el-button @click="ElMessage.info(note)">导出</el-button>
      </template>
    </AppPageHeader>

    <el-card>
      <el-form inline class="filter-bar">
        <el-form-item label="门店名称"><el-input placeholder="请输入门店名称" clearable style="width:180px" /></el-form-item>
        <el-form-item label="申请时间"><el-date-picker type="daterange" placeholder="选择时间范围" style="width:240px" /></el-form-item>
        <el-form-item label="提现状态">
          <el-select placeholder="全部" clearable style="width:130px">
            <el-option label="待审核" value="pending" />
            <el-option label="已打款" value="done" />
            <el-option label="已驳回" value="rejected" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary">搜索</el-button><el-button>重置</el-button></el-form-item>
      </el-form>

      <el-empty v-if="!loading" description="暂无提现数据（提现功能需接入门店业绩结算体系，P1 排期）" :image-size="80" />
      <el-table v-else v-loading="loading" :data="[]" size="default">
        <el-table-column prop="store_name" label="门店" min-width="180" />
        <el-table-column label="提现方式·提现业绩" min-width="160" />
        <el-table-column prop="actual" label="实际提现" width="120" />
        <el-table-column prop="ratio" label="扣除抽成" width="120" />
        <el-table-column prop="status" label="提现状态" width="120" />
        <el-table-column label="操作" width="120" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const loading = ref(false);
const note = ref('提现功能需接入门店业绩结算体系（P1），当前暂无数据');

onMounted(async () => {
  loading.value = true;
  try {
    const r = await customerApiCall.get('/store/withdrawals');
    note.value = r.note || note.value;
  } catch (e) {
    ElMessage.error(e || '加载失败');
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.filter-bar { margin-bottom: 8px; }
</style>
