<template>
  <div>
    <div class="page-header"><h2 class="page-title">存储设置</h2></div>
    <div class="page-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="本地存储" name="local">
          <p style="color:#909399;margin-bottom:16px;">图片保存在服务器磁盘，无需额外配置，适合开发与内网环境。</p>
          <el-button type="primary" @click="save('local')">保存并启用</el-button>
        </el-tab-pane>
        <el-tab-pane label="阿里云OSS" name="aliyun">
          <el-form :model="form.aliyun" label-width="140px">
            <el-form-item label="AccessKey ID"><el-input v-model="form.aliyun.accessKeyId" /></el-form-item>
            <el-form-item label="AccessKey Secret"><el-input v-model="form.aliyun.accessKeySecret" type="password" placeholder="留空保持不变" /></el-form-item>
            <el-form-item label="Region区域"><el-input v-model="form.aliyun.region" placeholder="如：oss-cn-hangzhou" /></el-form-item>
            <el-form-item label="Bucket"><el-input v-model="form.aliyun.bucket" /></el-form-item>
            <el-form-item label="文件夹前缀"><el-input v-model="form.aliyun.prefix" placeholder="如：panorama/" /></el-form-item>
            <el-form-item label="CDN域名"><el-input v-model="form.aliyun.cdnDomain" placeholder="如：https://cdn.example.com" /></el-form-item>
          </el-form>
          <div style="display:flex;gap:8px;">
            <el-button @click="test('aliyun')">测试连接</el-button>
            <el-button type="primary" @click="save('aliyun')">保存并启用</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane label="七牛云" name="qiniu">
          <el-form :model="form.qiniu" label-width="140px">
            <el-form-item label="AccessKey"><el-input v-model="form.qiniu.accessKey" /></el-form-item>
            <el-form-item label="SecretKey"><el-input v-model="form.qiniu.secretKey" type="password" placeholder="留空保持不变" /></el-form-item>
            <el-form-item label="所属区域">
              <el-select v-model="form.qiniu.region" style="width:100%;">
                <el-option label="华东-浙江" value="z0" />
                <el-option label="华北-河北" value="z1" />
                <el-option label="华南-广东" value="z2" />
                <el-option label="北美-美西" value="na0" />
                <el-option label="东南亚-新加坡" value="as0" />
              </el-select>
            </el-form-item>
            <el-form-item label="空间名"><el-input v-model="form.qiniu.bucket" /></el-form-item>
            <el-form-item label="文件夹前缀"><el-input v-model="form.qiniu.prefix" placeholder="如：panorama/" /></el-form-item>
            <el-form-item label="CDN域名"><el-input v-model="form.qiniu.cdnDomain" placeholder="如：https://cdn.example.com" /></el-form-item>
          </el-form>
          <div style="display:flex;gap:8px;">
            <el-button @click="test('qiniu')">测试连接</el-button>
            <el-button type="primary" @click="save('qiniu')">保存并启用</el-button>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { fetchStorageConfig, saveStorageConfig, testStorage } from '../../../api';
import { ElMessage } from 'element-plus';

const activeTab = ref('local');
const form = reactive({
  aliyun: { accessKeyId: '', accessKeySecret: '', region: '', bucket: '', prefix: '', cdnDomain: '' },
  qiniu: { accessKey: '', secretKey: '', region: 'z0', bucket: '', prefix: '', cdnDomain: '' },
});

onMounted(async () => {
  try {
    const res = await fetchStorageConfig();
    if (res.config) {
      activeTab.value = res.config.type || 'local';
      if (res.config.aliyun) Object.assign(form.aliyun, res.config.aliyun);
      if (res.config.qiniu) Object.assign(form.qiniu, res.config.qiniu);
    }
  } catch (e) {}
});

async function test(type) {
  try {
    await testStorage({ type, ...form[type] });
    ElMessage.success('连接成功');
  } catch (e) { ElMessage.error('连接失败：' + e); }
}
async function save(type) {
  try {
    await saveStorageConfig({ type, ...form[type] });
    ElMessage.success('保存成功，已切换为' + type + '存储');
  } catch (e) { ElMessage.error(e); }
}
</script>
