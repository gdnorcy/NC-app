<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">全端渠道</h2>
      <el-button type="primary" @click="showComponent = true">第三方平台配置</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ stats.totalChannels || 0 }}</div><div class="stat-label">渠道配置总数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.authorized || 0 }}</div><div class="stat-label">已授权</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.released || 0 }}</div><div class="stat-label">已发布上线</div></div>
      <div class="stat-card">
        <div class="stat-value" :class="{ warning: !componentConfig.hasVerifyTicket }">{{ componentConfig.hasVerifyTicket ? '正常' : '待配置' }}</div>
        <div class="stat-label">第三方平台状态</div>
      </div>
    </div>

    <!-- 四渠道卡片 -->
    <div class="channel-grid">
      <!-- H5 -->
      <div class="channel-card" v-for="ch in channels" :key="ch.type">
        <div class="channel-header">
          <span class="channel-icon">{{ ch.icon }}</span>
          <div>
            <div class="channel-name">{{ ch.name }}</div>
            <div class="channel-desc">{{ ch.desc }}</div>
          </div>
          <el-tag :type="ch.statusType" size="small">{{ ch.statusText }}</el-tag>
        </div>
        <div class="channel-body">
          <div class="channel-info">
            <span class="info-label">已开通</span>
            <span class="info-value">{{ ch.count }} 个租户</span>
          </div>
          <div class="channel-info" v-if="ch.appid">
            <span class="info-label">AppID</span>
            <span class="info-value"><code>{{ ch.appid }}</code></span>
          </div>
        </div>
        <div class="channel-footer">
          <el-button size="small" @click="goDetail(ch.type)">管理</el-button>
        </div>
      </div>
    </div>

    <!-- 快捷操作 -->
    <div class="page-card" style="margin-top:16px;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;">
          <div style="font-size:14px;font-weight:600;color:#1a1b1c;">平台默认配置</div>
          <div style="font-size:12px;color:#909399;margin-top:4px;">配置未开通独立渠道的租户使用的默认参数</div>
        </div>
        <el-button type="primary" @click="$router.push('/channel/defaults')">去配置</el-button>
      </div>
    </div>

    <!-- 第三方平台配置弹窗 -->
    <el-dialog v-model="showComponent" title="微信第三方平台配置" width="560px">
      <el-form :model="componentForm" label-width="140px">
        <el-form-item label="第三方平台AppID">
          <el-input v-model="componentForm.component_appid" placeholder="wx开头的AppID" />
        </el-form-item>
        <el-form-item label="第三方平台AppSecret">
          <el-input v-model="componentForm.component_appsecret" type="password" show-password placeholder="AppSecret" />
        </el-form-item>
        <el-form-item label="消息校验Token">
          <el-input v-model="componentForm.message_token" placeholder="与微信开放平台配置一致" />
        </el-form-item>
        <el-form-item label="消息加解密Key">
          <el-input v-model="componentForm.encoding_aes_key" placeholder="43位EncodingAESKey" />
        </el-form-item>
        <el-form-item label="授权事件接收URL">
          <el-input :value="callbackUrl" readonly>
            <template #append><el-button text @click="copy(callbackUrl)">复制</el-button></template>
          </el-input>
        </el-form-item>
        <el-form-item label="消息接收URL">
          <el-input :value="messageUrl" readonly>
            <template #append><el-button text @click="copy(messageUrl)">复制</el-button></template>
          </el-input>
        </el-form-item>
        <el-alert v-if="!componentConfig.hasVerifyTicket" type="warning" :closable="false" style="margin-bottom:12px;">
          保存配置后，请确保微信开放平台的授权事件接收URL能正常访问。微信会每10分钟推送一次component_verify_ticket，收到后状态会变为"正常"。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showComponent = false">取消</el-button>
        <el-button type="primary" @click="saveComponent">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  fetchChannelComponent, updateChannelComponent, fetchChannelStats,
} from '../../../api';
import { ElMessage } from 'element-plus';

const router = useRouter();
const showComponent = ref(false);
const stats = ref({});
const componentConfig = ref({});
const componentForm = reactive({ component_appid: '', component_appsecret: '', message_token: '', encoding_aes_key: '' });

const callbackUrl = `${location.origin}/api/channel/wx-callback`;
const messageUrl = `${location.origin}/api/channel/wx-message/$APPID$`;

const channels = [
  { type: 'mini', name: '微信小程序', icon: '💬', desc: '租户独立AppID，第三方平台代开发', statusText: '运行中', statusType: 'success', count: 0, appid: '' },
  { type: 'h5', name: 'H5手机端', icon: '📱', desc: '/mobile路径，支持独立域名', statusText: '运行中', statusType: 'success', count: 0, appid: '' },
  { type: 'mp', name: '微信公众号', icon: '📢', desc: 'OAuth授权 + H5嵌入', statusText: '运行中', statusType: 'success', count: 0, appid: '' },
  { type: 'pc', name: 'PC网站', icon: '💻', desc: '独立域名，PC适配', statusText: '待开通', statusType: 'info', count: 0, appid: '' },
];

async function loadData() {
  try {
    stats.value = await fetchChannelStats();
    componentConfig.value = (await fetchChannelComponent()).config;
    // 更新各渠道的已开通数量
    const byType = stats.value.byType || [];
    channels.forEach(ch => {
      const found = byType.find(b => b.channelType === ch.type);
      ch.count = found?.count || 0;
    });
  } catch (e) { ElMessage.error(e); }
}

async function saveComponent() {
  try {
    await updateChannelComponent(componentForm);
    ElMessage.success('保存成功');
    showComponent.value = false;
    loadData();
  } catch (e) { ElMessage.error(e); }
}

function goDetail(type) {
  router.push(`/channel/${type}`);
}

function copy(text) {
  navigator.clipboard.writeText(text);
  ElMessage.success('已复制');
}

onMounted(loadData);
</script>

<style scoped>
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.stat-value { font-size: 28px; font-weight: 700; color: #165DFF; }
.stat-value.warning { color: #fa8c16; font-size: 20px; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
.channel-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.channel-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.channel-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.channel-icon { font-size: 32px; }
.channel-name { font-size: 15px; font-weight: 600; color: #1a1b1c; }
.channel-desc { font-size: 12px; color: #909399; margin-top: 2px; }
.channel-header .el-tag { margin-left: auto; }
.channel-body { margin-bottom: 16px; }
.channel-info { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
.info-label { color: #909399; }
.info-value { color: #303133; }
.info-value code { font-size: 12px; background: #f5f7fa; padding: 2px 6px; border-radius: 4px; }
.channel-footer { border-top: 1px solid #f0f0f0; padding-top: 12px; }
</style>
