<template>
  <div>
    <div class="page-header">
      <h2 class="page-title">开放平台</h2>
      <el-button type="primary" @click="showCreate = true"><el-icon><Plus /></el-icon>创建应用</el-button>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-value">{{ stats.totalApps || 0 }}</div><div class="stat-label">应用总数</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.activeApps || 0 }}</div><div class="stat-label">运行中</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.totalTokens || 0 }}</div><div class="stat-label">有效令牌</div></div>
      <div class="stat-card"><div class="stat-value">{{ stats.todayCalls || 0 }}</div><div class="stat-label">今日调用</div></div>
    </div>

    <!-- Tab切换 -->
    <el-tabs v-model="activeTab" class="page-card">
      <el-tab-pane label="应用管理" name="apps">
        <el-table :data="apps" stripe>
          <el-table-column prop="name" label="应用名称" width="180">
            <template #default="{ row }">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:20px;">{{ row.icon || '📦' }}</span>
                <span>{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="appId" label="AppID" width="220">
            <template #default="{ row }">
              <code style="font-size:12px;">{{ row.appId }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="appSecret" label="AppSecret" width="160">
            <template #default="{ row }">
              <code style="font-size:12px;">{{ row.appSecret }}</code>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ row.status === 'active' ? '运行中' : '已禁用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="rateLimit" label="限流(次/分)" width="120" />
          <el-table-column prop="createdAt" label="创建时间" width="180" />
          <el-table-column label="操作" width="240">
            <template #default="{ row }">
              <el-button size="small" @click="edit(row)">编辑</el-button>
              <el-button size="small" type="warning" @click="resetSecret(row)">重置密钥</el-button>
              <el-button size="small" :type="row.status === 'active' ? 'danger' : 'success'" @click="toggle(row)">
                {{ row.status === 'active' ? '禁用' : '启用' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!apps.length" description="暂无应用，点击右上角创建" />
      </el-tab-pane>

      <el-tab-pane label="调用日志" name="logs">
        <div style="margin-bottom:12px;display:flex;gap:8px;">
          <el-input v-model="logFilter" placeholder="按AppID筛选" clearable style="width:240px;" @input="loadLogs" />
          <el-button @click="loadLogs">刷新</el-button>
        </div>
        <el-table :data="logs" stripe size="small">
          <el-table-column prop="createdAt" label="时间" width="180" />
          <el-table-column prop="appId" label="AppID" width="200">
            <template #default="{ row }"><code style="font-size:11px;">{{ row.appId || '-' }}</code></template>
          </el-table-column>
          <el-table-column prop="method" label="方法" width="80" />
          <el-table-column prop="endpoint" label="接口" />
          <el-table-column prop="statusCode" label="状态码" width="100">
            <template #default="{ row }">
              <el-tag :type="row.statusCode < 400 ? 'success' : 'danger'" size="small">{{ row.statusCode }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="responseTime" label="耗时(ms)" width="100" />
          <el-table-column prop="ip" label="IP" width="140" />
          <el-table-column prop="errorMessage" label="错误" show-overflow-tooltip />
        </el-table>
        <el-empty v-if="!logs.length" description="暂无调用日志" />
      </el-tab-pane>

      <el-tab-pane label="API文档" name="docs">
        <div style="line-height:1.8;">
          <h3>基础信息</h3>
          <el-descriptions :column="1" border style="margin-bottom:20px;">
            <el-descriptions-item label="Base URL"><code>https://your-domain.com</code></el-descriptions-item>
            <el-descriptions-item label="认证方式"><code>Authorization: Bearer {access_token}</code></el-descriptions-item>
            <el-descriptions-item label="授权流程">OAuth2.0 授权码模式（authorization_code）</el-descriptions-item>
            <el-descriptions-item label="令牌有效期">7天，支持refresh_token刷新</el-descriptions-item>
          </el-descriptions>

          <h3>OAuth2.0 授权流程</h3>
          <el-steps :active="4" finish-status="success" style="margin-bottom:20px;">
            <el-step title="1.引导用户授权" description="跳转 /oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code" />
            <el-step title="2.用户同意授权" description="平台返回 code 到 redirect_uri" />
            <el-step title="3.换取令牌" description="POST /oauth/token 用 code 换取 access_token" />
            <el-step title="4.调用API" description="携带 Bearer Token 调用 /openapi/* 接口" />
          </el-steps>

          <h3>接口列表</h3>
          <el-table :data="apiList" stripe size="small">
            <el-table-column prop="method" label="方法" width="80">
              <template #default="{ row }"><el-tag :type="row.method === 'GET' ? 'success' : 'warning'" size="small">{{ row.method }}</el-tag></template>
            </el-table-column>
            <el-table-column prop="path" label="路径" width="240"><template #default="{ row }"><code>{{ row.path }}</code></template></el-table-column>
            <el-table-column prop="desc" label="说明" />
            <el-table-column prop="scope" label="权限" width="100" />
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 创建/编辑应用弹窗 -->
    <el-dialog v-model="showCreate" :title="editing ? '编辑应用' : '创建应用'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="应用名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="图标"><el-input v-model="form.icon" placeholder="emoji，如 🌐" /></el-form-item>
        <el-form-item label="应用描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
        <el-form-item label="回调地址">
          <el-input v-model="redirectUrisText" type="textarea" :rows="3" placeholder="每行一个URL，如 https://example.com/callback" />
        </el-form-item>
        <el-form-item label="IP白名单">
          <el-input v-model="ipWhitelistText" type="textarea" :rows="2" placeholder="每行一个IP，留空不限制" />
        </el-form-item>
        <el-form-item label="权限范围">
          <el-checkbox-group v-model="form.scopes">
            <el-checkbox label="read">读取（read）</el-checkbox>
            <el-checkbox label="write">写入（write）</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="限流(次/分)"><el-input-number v-model="form.rateLimit" :min="10" :max="10000" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="saveApp">保存</el-button>
      </template>
    </el-dialog>

    <!-- 密钥展示弹窗 -->
    <el-dialog v-model="showSecret" title="应用凭证" width="500px">
      <el-alert type="warning" :closable="false" style="margin-bottom:16px;">
        请妥善保存 AppSecret，关闭后将不再完整显示。重置密钥会使所有现有令牌失效。
      </el-alert>
      <el-form label-width="100px">
        <el-form-item label="AppID">
          <el-input v-model="secretForm.appId" readonly>
            <template #append><el-button text @click="copy(secretForm.appId)">复制</el-button></template>
          </el-input>
        </el-form-item>
        <el-form-item label="AppSecret">
          <el-input v-model="secretForm.appSecret" readonly>
            <template #append><el-button text @click="copy(secretForm.appSecret)">复制</el-button></template>
          </el-input>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import {
  fetchOAuthApps, createOAuthApp, updateOAuthApp, resetOAuthSecret,
  toggleOAuthApp, fetchOAuthStats, fetchApiLogs,
} from '../../../api';
import { ElMessage, ElMessageBox } from 'element-plus';

const activeTab = ref('apps');
const apps = ref([]);
const logs = ref([]);
const stats = ref({});
const logFilter = ref('');
const showCreate = ref(false);
const showSecret = ref(false);
const editing = ref(null);
const redirectUrisText = ref('');
const ipWhitelistText = ref('');
const secretForm = reactive({ appId: '', appSecret: '' });

const form = reactive({ name: '', icon: '', description: '', scopes: ['read'], rateLimit: 100 });

const apiList = [
  { method: 'GET', path: '/openapi/plans', desc: '获取方案列表', scope: 'read' },
  { method: 'GET', path: '/openapi/plans/:id', desc: '获取方案详情', scope: 'read' },
  { method: 'GET', path: '/openapi/plans/:planId/scenes', desc: '获取场景列表', scope: 'read' },
  { method: 'GET', path: '/openapi/scenes/:id', desc: '获取场景详情', scope: 'read' },
  { method: 'POST', path: '/openapi/scenes', desc: '创建场景', scope: 'write' },
  { method: 'POST', path: '/openapi/upload', desc: '上传全景图', scope: 'write' },
  { method: 'POST', path: '/openapi/share', desc: '生成分享链接', scope: 'read' },
  { method: 'GET', path: '/openapi/userinfo', desc: '获取用户信息', scope: 'read' },
];

async function loadApps() {
  try { apps.value = (await fetchOAuthApps()).apps || []; } catch (e) { ElMessage.error(e); }
}
async function loadStats() {
  try { stats.value = await fetchOAuthStats(); } catch (e) {}
}
async function loadLogs() {
  try {
    const params = {};
    if (logFilter.value) params.appId = logFilter.value;
    logs.value = (await fetchApiLogs(params)).logs || [];
  } catch (e) {}
}

function edit(row) {
  editing.value = row;
  Object.assign(form, { name: row.name, icon: row.icon, description: row.description, scopes: row.scopes, rateLimit: row.rateLimit });
  redirectUrisText.value = (row.redirectUris || []).join('\n');
  ipWhitelistText.value = (row.ipWhitelist || []).join('\n');
  showCreate.value = true;
}

async function saveApp() {
  if (!form.name) { ElMessage.error('请输入应用名称'); return; }
  const data = {
    ...form,
    redirectUris: redirectUrisText.value.split('\n').map(s => s.trim()).filter(Boolean),
    ipWhitelist: ipWhitelistText.value.split('\n').map(s => s.trim()).filter(Boolean),
  };
  try {
    if (editing.value) {
      await updateOAuthApp(editing.value.id, data);
      ElMessage.success('更新成功');
    } else {
      const res = await createOAuthApp(data);
      secretForm.appId = res.app.appId;
      secretForm.appSecret = res.app.appSecret;
      showSecret.value = true;
    }
    showCreate.value = false;
    loadApps(); loadStats();
  } catch (e) { ElMessage.error(e); }
}

async function resetSecret(row) {
  try {
    await ElMessageBox.confirm(`确定重置「${row.name}」的密钥？重置后所有现有令牌将失效。`, '确认', { type: 'warning' });
    const res = await resetOAuthSecret(row.id);
    secretForm.appId = row.appId;
    secretForm.appSecret = res.appSecret;
    showSecret.value = true;
  } catch (e) {}
}

async function toggle(row) {
  try {
    await toggleOAuthApp(row.id);
    ElMessage.success(row.status === 'active' ? '已禁用' : '已启用');
    loadApps();
  } catch (e) { ElMessage.error(e); }
}

function copy(text) {
  navigator.clipboard.writeText(text);
  ElMessage.success('已复制');
}

onMounted(() => { loadApps(); loadStats(); loadLogs(); });
</script>

<style scoped>
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px; }
.stat-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.stat-value { font-size: 28px; font-weight: 700; color: #165DFF; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
</style>
