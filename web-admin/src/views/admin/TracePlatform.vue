<template>
  <div class="trace-platform">
    <div class="page-head">
      <h2 class="page-title">防伪溯源 · 平台设置</h2>
      <p class="page-desc">平台运营统一管控防伪溯源的应用级能力。以下配置对全部租户生效。</p>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="关于防伪码算法密钥"
      description="防伪码的码制密钥（前缀、批次号长度、流水号长度、校验位、总长以及 5 组校验字符集 k1–k5）是平台级常量，由系统统一固化维护，不在此处开放编辑。改动这些密钥会使所有已发出的防伪码立即失效，如需调整请联系研发通过平台常量变更流程处理。"
      style="margin-bottom: 16px"
    />

    <el-form label-width="140px" size="default">
      <!-- #474 自定义域名 -->
      <el-divider content-position="left">自定义域名（溯源页根域名）</el-divider>
      <el-form-item label="站点根域名">
        <el-input v-model="form.siteRoot" placeholder="如 https://trace.example.com（留空则使用租户自有配置）" style="max-width: 480px" />
        <div class="hint">C 端生成防伪码与溯源链接时优先使用此平台域名；未配置时回落各租户自有设置。</div>
      </el-form-item>

      <!-- #475 API 授权 -->
      <el-divider content-position="left">API 授权（IP 白名单 + 通信密钥）</el-divider>
      <el-form-item label="授权 IP 白名单">
        <el-select
          v-model="form.apiAuth.allowedIps"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入允许调用防伪验真 API 的服务器 IP"
          style="max-width: 480px; width: 100%"
        >
          <el-option v-for="ip in form.apiAuth.allowedIps" :key="ip" :label="ip" :value="ip" />
        </el-select>
        <div class="hint">仅列表中的 IP 可调用 /api/trace/public/api/verify；支持多个 IP。</div>
      </el-form-item>
      <el-form-item label="通信密钥">
        <el-input
          v-model="form.apiAuth.commKey"
          type="password"
          show-password
          placeholder="32 位以上通信密钥（留空/脱敏串表示不修改）"
          style="max-width: 480px"
        />
        <el-button style="margin-left: 8px" @click="genCommKey">生成随机密钥</el-button>
        <div class="hint">密钥加密存储，前端仅回显掩码。第三方调用需按 md5(租户ID+码+IP+密钥) 签名。</div>
      </el-form-item>

      <!-- #472 生成权限 -->
      <el-divider content-position="left">生成权限</el-divider>
      <el-form-item label="防伪码生成">
        <el-radio-group v-model="form.generation.mode">
          <el-radio value="open">租户可自助生成</el-radio>
          <el-radio value="platformOnly">仅平台可生成（租户端关闭）</el-radio>
          <el-radio value="closed">全局关闭生成</el-radio>
        </el-radio-group>
        <div class="hint">平台统一管控谁能生成防伪码，防止租户滥用库存。</div>
      </el-form-item>

      <!-- #473 手机端模板 -->
      <el-divider content-position="left">手机端模板</el-divider>
      <el-form-item label="手机端模板配置">
        <el-input
          v-model="form.mobileTemplate"
          type="textarea"
          :rows="4"
          placeholder="手机端溯源页模板标识或配置（运行时消费待接入，先存配置）"
          style="max-width: 480px"
        />
        <div class="hint">平台定义 C 端模板，租户可选。当前为配置占位，运行时渲染接入后续跟进。</div>
      </el-form-item>

      <!-- #476 服务商微信支付 -->
      <el-divider content-position="left">服务商微信支付（平台级）</el-divider>
      <el-form-item label="AppID">
        <el-input v-model="form.serviceProvider.wxAppId" placeholder="服务商 AppID" style="max-width: 480px" />
      </el-form-item>
      <el-form-item label="商户号">
        <el-input v-model="form.serviceProvider.mchId" placeholder="服务商商户号" style="max-width: 480px" />
      </el-form-item>
      <el-form-item label="API 密钥">
        <el-input
          v-model="form.serviceProvider.apiKey"
          type="password"
          show-password
          placeholder="服务商 API 密钥（留空/脱敏串表示不修改）"
          style="max-width: 480px"
        />
      </el-form-item>
      <el-form-item label="KQF">
        <el-input v-model="form.serviceProvider.kqf" placeholder="服务商其他参数（如渠道标识）" style="max-width: 480px" />
        <div class="hint">凭据加密存储、脱敏回显。与租户「自运营商户」(#466) 分流；运行时支付适配器待接入。</div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="saveConfig">保存平台配置</el-button>
        <el-button @click="loadConfig" :disabled="saving">重新加载</el-button>
      </el-form-item>
    </el-form>

    <!-- #471 库存与充值台账 -->
    <el-divider content-position="left">防伪码库存 / 充值台账（按租户）</el-divider>
    <el-table :data="cocomList" border stripe style="width: 100%; max-width: 760px">
      <el-table-column prop="tenantId" label="租户ID" width="90" />
      <el-table-column prop="name" label="客户名称" min-width="160" />
      <el-table-column label="当前库存" width="140">
        <template #default="{ row }">
          <span :class="{ unlimited: row.cocom === -888 }">{{ row.cocom === -888 ? '不限' : row.cocom }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button size="small" @click="openAdjust(row)">调整</el-button>
          <el-button size="small" @click="openLedger(row)">台账</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 调整库存 -->
    <el-dialog v-model="adjustVisible" title="调整防伪码库存" width="420px">
      <el-form label-width="90px">
        <el-form-item label="租户">
          <span>{{ adjustRow?.name }}（#{{ adjustRow?.tenantId }}）</span>
        </el-form-item>
        <el-form-item label="当前库存">
          <span>{{ adjustRow?.cocom === -888 ? '不限' : adjustRow?.cocom }}</span>
        </el-form-item>
        <el-form-item label="目标库存">
          <el-input-number v-model="adjustForm.cocom" :min="-888" style="width: 200px" />
          <div class="hint">填 -888 表示不限量。</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="adjustForm.note" placeholder="如：平台充值 10000 个" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjustSaving" @click="submitAdjust">确定</el-button>
      </template>
    </el-dialog>

    <!-- 台账 -->
    <el-drawer v-model="ledgerVisible" title="充值台账" size="460px">
      <el-timeline v-if="ledgerList.length">
        <el-timeline-item
          v-for="item in ledgerList"
          :key="item.id"
          :timestamp="item.created_at"
          placement="top"
        >
          <div>变动：{{ item.delta }}　结存：{{ item.balance_after === -888 ? '不限' : item.balance_after }}</div>
          <div class="ledger-note">操作人：{{ item.operator || '—' }}　备注：{{ item.note || '—' }}</div>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无台账记录" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  fetchTracePlatformSettings,
  saveTracePlatformSettings,
  fetchTraceCocomTenants,
  adjustTraceCocom,
  fetchTraceCocomLedger,
} from '../../api';

function emptyForm() {
  return {
    siteRoot: '',
    apiAuth: { allowedIps: [], commKey: '' },
    generation: { mode: 'open' },
    mobileTemplate: '',
    serviceProvider: { wxAppId: '', mchId: '', apiKey: '', kqf: '' },
  };
}

const form = reactive(emptyForm());
const saving = ref(false);
const cocomList = ref([]);
const adjustVisible = ref(false);
const adjustSaving = ref(false);
const adjustRow = ref(null);
const adjustForm = reactive({ cocom: 0, note: '' });
const ledgerVisible = ref(false);
const ledgerList = ref([]);

function loadConfig() {
  return fetchTracePlatformSettings()
    .then((res) => {
      const c = res.config || {};
      form.siteRoot = c.siteRoot || '';
      form.apiAuth.allowedIps = Array.isArray(c.apiAuth?.allowedIps) ? c.apiAuth.allowedIps : [];
      form.apiAuth.commKey = c.apiAuth?.commKey || '';
      form.generation.mode = c.generation?.mode || 'open';
      form.mobileTemplate = c.mobileTemplate || '';
      form.serviceProvider.wxAppId = c.serviceProvider?.wxAppId || '';
      form.serviceProvider.mchId = c.serviceProvider?.mchId || '';
      form.serviceProvider.apiKey = c.serviceProvider?.apiKey || '';
      form.serviceProvider.kqf = c.serviceProvider?.kqf || '';
    })
    .catch((e) => ElMessage.error(e || '加载平台配置失败'));
}

async function loadCocom() {
  try {
    const res = await fetchTraceCocomTenants();
    cocomList.value = res.list || [];
  } catch (e) {
    ElMessage.error(e || '加载库存列表失败');
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    await saveTracePlatformSettings({
      siteRoot: form.siteRoot,
      apiAuth: { allowedIps: form.apiAuth.allowedIps, commKey: form.apiAuth.commKey },
      generation: { mode: form.generation.mode },
      mobileTemplate: form.mobileTemplate,
      serviceProvider: {
        wxAppId: form.serviceProvider.wxAppId,
        mchId: form.serviceProvider.mchId,
        apiKey: form.serviceProvider.apiKey,
        kqf: form.serviceProvider.kqf,
      },
    });
    ElMessage.success('保存成功');
    await loadConfig();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

function genCommKey() {
  const buf = new Uint8Array(24);
  window.crypto.getRandomValues(buf);
  form.apiAuth.commKey = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function openAdjust(row) {
  adjustRow.value = row;
  adjustForm.cocom = row.cocom;
  adjustForm.note = '';
  adjustVisible.value = true;
}

async function submitAdjust() {
  if (!adjustRow.value) return;
  adjustSaving.value = true;
  try {
    await adjustTraceCocom(adjustRow.value.tenantId, { cocom: adjustForm.cocom, note: adjustForm.note });
    ElMessage.success('已调整');
    adjustVisible.value = false;
    await loadCocom();
  } catch (e) {
    ElMessage.error(e || '调整失败');
  } finally {
    adjustSaving.value = false;
  }
}

async function openLedger(row) {
  ledgerVisible.value = true;
  ledgerList.value = [];
  try {
    const res = await fetchTraceCocomLedger(row.tenantId);
    ledgerList.value = res.list || [];
  } catch (e) {
    ElMessage.error(e || '加载台账失败');
  }
}

onMounted(() => {
  loadConfig();
  loadCocom();
});
</script>

<style scoped>
.trace-platform { padding: 4px; }
.page-head { margin-bottom: 12px; }
.page-title { font-size: 18px; font-weight: 600; margin: 0 0 4px; }
.page-desc { color: #86909c; font-size: 13px; margin: 0; }
.hint { color: #a9aeb8; font-size: 12px; line-height: 1.6; margin-top: 4px; }
.unlimited { color: #165dff; font-weight: 600; }
.ledger-note { color: #86909c; font-size: 12px; margin-top: 2px; }
</style>
