<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">远程附件</h2>
      <p class="page-desc">配置文件存储方式，支持借用平台存储或自主接入云存储</p>
    </div>

    <div class="card">
      <el-tabs v-model="storageTab" class="storage-tabs">
        <!-- 本地存储 -->
        <el-tab-pane label="本地存储" name="local">
          <div class="tab-content">
            <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px;">
              借用平台存储，无需额外配置，文件存储在平台服务器。
            </el-alert>
            <el-button type="primary" @click="saveStorage('local')" :loading="saving">保存并启用</el-button>
          </div>
        </el-tab-pane>

        <!-- 阿里云OSS -->
        <el-tab-pane label="阿里云OSS" name="aliyun">
          <div class="tab-content">
            <el-form :model="storage.aliyun" label-width="160px" size="default">
              <el-form-item label="AccessKey ID" required>
                <el-input v-model="storage.aliyun.accessKeyId" placeholder="请输入AccessKey ID" />
              </el-form-item>
              <el-form-item label="AccessKey Secret" required>
                <el-input v-model="storage.aliyun.accessKeySecret" type="password" show-password placeholder="请输入AccessKey Secret" />
              </el-form-item>
              <el-form-item label="Region区域" required>
                <el-input v-model="storage.aliyun.region" placeholder="如：oss-cn-hangzhou" />
              </el-form-item>
              <el-form-item label="Bucket" required>
                <el-input v-model="storage.aliyun.bucket" placeholder="请输入Bucket名称" />
              </el-form-item>
              <el-form-item label="文件夹前缀">
                <el-input v-model="storage.aliyun.prefix" placeholder="如：panorama/" />
              </el-form-item>
              <el-form-item label="CDN域名">
                <el-input v-model="storage.aliyun.cdnDomain" placeholder="如：https://cdn.example.com" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="saveStorage('aliyun')" :loading="saving">保存并启用</el-button>
                <el-button @click="testConnection('aliyun')">测试连接</el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>

        <!-- 七牛云 -->
        <el-tab-pane label="七牛云" name="qiniu">
          <div class="tab-content">
            <el-form :model="storage.qiniu" label-width="160px" size="default">
              <el-form-item label="AccessKey" required>
                <el-input v-model="storage.qiniu.accessKey" placeholder="请输入AccessKey" />
              </el-form-item>
              <el-form-item label="SecretKey" required>
                <el-input v-model="storage.qiniu.secretKey" type="password" show-password placeholder="请输入SecretKey" />
              </el-form-item>
              <el-form-item label="所属区域" required>
                <el-select v-model="storage.qiniu.region" style="width: 100%;">
                  <el-option label="华东-浙江 (z0)" value="z0" />
                  <el-option label="华北-河北 (z1)" value="z1" />
                  <el-option label="华南-广东 (z2)" value="z2" />
                  <el-option label="北美 (na0)" value="na0" />
                  <el-option label="东南亚 (as0)" value="as0" />
                </el-select>
              </el-form-item>
              <el-form-item label="空间名" required>
                <el-input v-model="storage.qiniu.bucket" placeholder="请输入Bucket空间名" />
              </el-form-item>
              <el-form-item label="文件夹前缀">
                <el-input v-model="storage.qiniu.prefix" placeholder="如：panorama/" />
              </el-form-item>
              <el-form-item label="CDN域名" required>
                <el-input v-model="storage.qiniu.cdnDomain" placeholder="如：https://cdn.example.com" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="saveStorage('qiniu')" :loading="saving">保存并启用</el-button>
                <el-button @click="testConnection('qiniu')">测试连接</el-button>
              </el-form-item>
            </el-form>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage } from 'element-plus';

const storageTab = ref('local');
const saving = ref(false);
const storage = reactive({
  aliyun: { accessKeyId: '', accessKeySecret: '', region: '', bucket: '', prefix: '', cdnDomain: '' },
  qiniu: { accessKey: '', secretKey: '', region: 'z0', bucket: '', prefix: '', cdnDomain: '' },
});

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/profile');
    if (data.customer?.config?.storage) {
      const s = data.customer.config.storage;
      storageTab.value = s.type || 'local';
      if (s.aliyun) Object.assign(storage.aliyun, s.aliyun);
      if (s.qiniu) Object.assign(storage.qiniu, s.qiniu);
    }
  } catch (e) {}
});

async function saveStorage(type) {
  saving.value = true;
  try {
    const config = { storage: { type, ...storage[type] } };
    await customerApiCall.put('/config', config);
    ElMessage.success('保存成功，已启用' + { local: '本地存储', aliyun: '阿里云OSS', qiniu: '七牛云' }[type]);
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function testConnection(type) {
  ElMessage.info('连接测试功能开发中');
}
</script>

<style scoped>
.settings-page { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #86909c; margin: 0; }
.card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.storage-tabs :deep(.el-tabs__header) { margin-bottom: 20px; }
.tab-content { padding-top: 8px; }
</style>
