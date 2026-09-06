<template>
  <div>
    <div class="page-header">
      <div>
        <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <h2 class="page-title" style="display:inline;margin-left:8px;">{{ isEdit ? '编辑客户' : '新建客户' }}</h2>
      </div>
      <el-button type="primary" @click="save" :loading="saving">保存</el-button>
    </div>

    <el-tabs v-model="activeTab" class="customer-tabs">
      <!-- 基本信息 -->
      <el-tab-pane label="基本信息" name="basic">
        <div class="page-card">
          <el-form :model="form" label-width="100px">
            <el-form-item label="客户名称" required>
              <el-input v-model="form.customerName" placeholder="如：某某科技有限公司" />
            </el-form-item>
            <el-form-item label="联系人">
              <el-input v-model="form.contactName" />
            </el-form-item>
            <el-form-item label="联系电话">
              <el-input v-model="form.contactPhone" />
            </el-form-item>
            <el-form-item label="联系邮箱">
              <el-input v-model="form.contactEmail" />
            </el-form-item>
            <el-form-item label="有效期至">
              <el-date-picker v-model="form.validUntil" type="date" value-format="YYYY-MM-DD" style="width:100%;" />
            </el-form-item>
            <el-form-item label="状态">
              <el-switch v-model="form.status" active-value="active" inactive-value="disabled" />
            </el-form-item>
            <el-form-item label="开通解决方案">
              <el-checkbox-group v-model="form.solutions">
                <el-checkbox v-for="s in solutions" :key="s.id" :label="s.code">{{ s.name }}</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 独立配置 -->
      <el-tab-pane label="独立配置" name="config" v-if="isEdit">
        <div class="page-card">
          <el-form :model="form.config" label-width="120px">
            <el-form-item label="底部版权文字">
              <el-input v-model="form.config.footerCopyright" placeholder="留空则使用平台版权" />
            </el-form-item>
            <el-form-item label="远程附件">
              <el-radio-group v-model="form.config.storageMode">
                <el-radio label="platform">借用平台</el-radio>
                <el-radio label="independent">自主接入</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="短信配置">
              <el-radio-group v-model="form.config.smsMode">
                <el-radio label="platform">借用平台</el-radio>
                <el-radio label="independent">自主接入</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="微信支付模式">
              <el-radio-group v-model="form.config.wechatPayMode">
                <el-radio label="normal">普通商户号</el-radio>
                <el-radio label="service">系统服务商</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="图片上传大小(MB)">
              <el-input-number v-model="form.config.maxImageSize" :min="1" :max="500" />
            </el-form-item>
            <el-form-item label="视频上传大小(MB)">
              <el-input-number v-model="form.config.maxVideoSize" :min="1" :max="2048" />
            </el-form-item>
            <el-form-item label="音频上传大小(MB)">
              <el-input-number v-model="form.config.maxAudioSize" :min="1" :max="500" />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- 渠道管理 -->
      <el-tab-pane label="渠道管理" name="channel" v-if="isEdit">
        <div class="channel-list">
          <div class="channel-item" v-for="ch in channelList" :key="ch.type">
            <div class="channel-item-header">
              <span class="channel-item-icon">{{ ch.icon }}</span>
              <div class="channel-item-info">
                <div class="channel-item-name">{{ ch.name }}</div>
                <div class="channel-item-desc">{{ ch.desc }}</div>
              </div>
              <el-tag :type="ch.enabled ? 'success' : 'info'" size="small">{{ ch.enabled ? '已开通' : '未开通' }}</el-tag>
            </div>
            <div class="channel-item-body" v-if="ch.type === 'mini'">
              <div v-if="ch.appid" class="channel-detail">
                <span class="detail-label">AppID：</span><code>{{ ch.appid }}</code>
                <span class="detail-label" style="margin-left:16px;">版本：</span>{{ ch.version || '未发布' }}
                <span class="detail-label" style="margin-left:16px;">状态：</span>
                <el-tag :type="auditStatusType(ch.auditStatus)" size="small">{{ auditStatusText(ch.auditStatus) }}</el-tag>
              </div>
              <div v-else class="channel-empty">
                <span>未授权独立小程序，使用平台统一小程序</span>
                <el-button size="small" type="primary" @click="goAuthMini">去授权</el-button>
              </div>
              <div style="margin-top:12px;display:flex;align-items:center;gap:12px;">
                <span style="font-size:13px;color:#606266;">启用渠道</span>
                <el-switch v-model="ch.enabled" @change="saveChannel(ch)" />
                <span style="font-size:12px;color:#909399;">{{ ch.enabled ? '已启用，客户可通过小程序访问' : '已禁用，小程序将无法访问' }}</span>
              </div>
            </div>
            <div class="channel-item-body" v-else>
              <el-form :model="ch.config" label-width="100px" size="small" inline>
                <el-form-item label="品牌名称">
                  <el-input v-model="ch.config.brandName" placeholder="留空使用客户名称" style="width:180px;" />
                </el-form-item>
                <el-form-item label="主题色">
                  <el-color-picker v-model="ch.config.primaryColor" />
                </el-form-item>
                <el-form-item label="自定义域名" v-if="ch.type !== 'mp'">
                  <el-input v-model="ch.config.customDomain" placeholder="如 vr.example.com" style="width:200px;" />
                </el-form-item>
                <el-form-item label="启用">
                  <el-switch v-model="ch.enabled" @change="saveChannel(ch)" />
                </el-form-item>
                <el-form-item v-if="ch.type === 'h5'">
                  <el-button size="small" @click="copyLink(ch)">复制访问链接</el-button>
                </el-form-item>
              </el-form>
            </div>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchCustomers, createCustomer, updateCustomer, fetchSolutions,
  fetchTenantChannels, updateTenantChannel, getChannelAuthUrl,
} from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id && route.params.id !== 'new');
const saving = ref(false);
const solutions = ref([]);
const activeTab = ref('basic');

const form = reactive({
  customerName: '', contactName: '', contactPhone: '', contactEmail: '',
  validUntil: '', status: 'active', solutions: [],
  config: { footerCopyright: '', storageMode: 'platform', smsMode: 'platform', wechatPayMode: 'normal', maxImageSize: 50, maxVideoSize: 200, maxAudioSize: 50 },
});

const channelList = reactive([
  { type: 'mini', name: '微信小程序', icon: '💬', desc: '租户独立AppID，第三方平台代开发', enabled: false, appid: '', version: '', auditStatus: 'none', config: {} },
  { type: 'h5', name: 'H5手机端', icon: '📱', desc: '/mobile路径，支持独立域名', enabled: false, config: { brandName: '', primaryColor: '#165DFF', customDomain: '' } },
  { type: 'mp', name: '微信公众号', icon: '📢', desc: 'OAuth授权 + H5嵌入', enabled: false, config: { brandName: '', primaryColor: '#165DFF' } },
  { type: 'pc', name: 'PC网站', icon: '💻', desc: '独立域名，PC适配', enabled: false, config: { brandName: '', primaryColor: '#165DFF', customDomain: '' } },
]);

onMounted(async () => {
  try { solutions.value = (await fetchSolutions()).solutions || []; } catch (e) {}
  if (isEdit.value) {
    try {
      const res = await fetchCustomers();
      const c = (res.projects || []).find(p => p.id === Number(route.params.id));
      if (c) Object.assign(form, c, { config: { ...form.config, ...(c.config || {}) } });
      // 加载渠道配置
      loadChannels();
    } catch (e) { ElMessage.error(e); }
  }
});

async function loadChannels() {
  try {
    const res = await fetchTenantChannels(route.params.id);
    const channels = res.channels || [];
    channelList.forEach(ch => {
      const found = channels.find(c => c.channelType === ch.type);
      if (found) {
        ch.enabled = found.enabled;
        ch.appid = found.appid;
        ch.version = found.version;
        ch.auditStatus = found.auditStatus;
        ch.config = { brandName: found.brandName, primaryColor: found.primaryColor, customDomain: found.customDomain };
      }
    });
  } catch (e) {}
}

async function saveChannel(ch) {
  try {
    await updateTenantChannel(route.params.id, ch.type, {
      brandName: ch.config.brandName,
      primaryColor: ch.config.primaryColor,
      customDomain: ch.config.customDomain,
      enabled: ch.enabled,
    });
    ElMessage.success(`${ch.name}配置已保存`);
  } catch (e) { ElMessage.error(e); }
}

async function goAuthMini() {
  try {
    const redirectUri = `${location.origin}/admin#/customers/${route.params.id}/edit`;
    const res = await getChannelAuthUrl({ redirectUri, customerId: route.params.id, authType: 2 });
    window.open(res.authUrl, '_blank');
  } catch (e) { ElMessage.error(e); }
}

function copyLink(ch) {
  const domain = ch.config.customDomain || location.origin;
  const path = ch.type === 'h5' ? '/mobile' : '/';
  const link = `${domain}${path}?customer_id=${route.params.id}`;
  navigator.clipboard.writeText(link);
  ElMessage.success('链接已复制');
}

function auditStatusText(s) {
  return { none: '未上传', draft: '草稿', auditing: '审核中', approved: '审核通过', rejected: '审核拒绝', released: '已发布' }[s] || s;
}
function auditStatusType(s) {
  return { none: 'info', draft: 'warning', auditing: 'warning', approved: 'success', rejected: 'danger', released: 'success' }[s] || 'info';
}

async function save() {
  if (!form.customerName) { ElMessage.error('请输入客户名称'); return; }
  saving.value = true;
  try {
    if (isEdit.value) await updateCustomer(route.params.id, form);
    else await createCustomer(form);
    ElMessage.success('保存成功');
    router.push('/customers');
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.customer-tabs { margin-top: 0; }
.customer-tabs :deep(.el-tabs__content) { padding: 0; }
.channel-list { display: flex; flex-direction: column; gap: 16px; }
.channel-item { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.channel-item-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.channel-item-icon { font-size: 28px; }
.channel-item-name { font-size: 15px; font-weight: 600; color: #1a1b1c; }
.channel-item-desc { font-size: 12px; color: #909399; margin-top: 2px; }
.channel-item-header .el-tag { margin-left: auto; }
.channel-item-body { border-top: 1px solid #f0f0f0; padding-top: 16px; }
.channel-detail { font-size: 13px; color: #606266; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.channel-detail code { font-size: 12px; background: #f5f7fa; padding: 2px 6px; border-radius: 4px; }
.detail-label { color: #909399; }
.channel-empty { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #909399; }
</style>
