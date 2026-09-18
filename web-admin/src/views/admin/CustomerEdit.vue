<template>
  <div>
    <div class="page-header">
      <div>
        <el-button text @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
        <h2 class="page-title" style="display:inline;margin-left:8px;">{{ isEdit ? '编辑客户项目' : '新建客户项目' }}</h2>
      </div>
      <el-button type="primary" @click="save" :loading="saving">保存</el-button>
    </div>

    <!-- 锚点导航：内容滚动联动高亮 -->
    <div class="anchor-nav">
      <a
        v-for="sec in sections"
        :key="sec.id"
        class="anchor-item"
        :class="{ active: activeSection === sec.id }"
        @click="scrollTo(sec.id)"
      >{{ sec.label }}</a>
    </div>

    <div class="edit-body">
      <!-- ① 项目信息 -->
      <section id="sec-basic" :ref="setSecEls" class="page-card" data-sec="basic">
        <div class="section-title">项目信息</div>
        <el-form :model="form" label-width="140px">
          <el-form-item label="项目名称" required>
            <el-input v-model="form.customerName" placeholder="如：某某科技有限公司" maxlength="50" show-word-limit />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="form.remark" placeholder="选填，内部备注" maxlength="200" show-word-limit />
          </el-form-item>
          <el-form-item label="有效期至">
            <el-date-picker v-model="form.validUntil" type="date" value-format="YYYY-MM-DD" style="width:100%;" placeholder="不填表示长期有效" />
          </el-form-item>
          <el-form-item label="项目状态">
            <el-switch v-model="form.status" active-value="active" inactive-value="disabled" />
            <span class="form-help">{{ form.status === 'active' ? '启用：客户可正常登录使用' : '停用：客户无法访问' }}</span>
          </el-form-item>
          <el-form-item label="选择管理员">
            <el-select v-model="form.adminUserId" placeholder="选择该客户的管理员账号" clearable style="width:100%;">
              <el-option v-for="u in adminUsers" :key="u.id" :label="`${u.nickname || u.username}（${u.username}）`" :value="u.id" />
            </el-select>
            <div class="form-help">管理员从该客户已创建的账号中选择；无账号时请先在「用户管理」创建</div>
          </el-form-item>
        </el-form>
      </section>

      <!-- ② 解决方案 + 应用及功能 -->
      <section id="sec-solution" :ref="setSecEls" class="page-card" data-sec="solution">
        <div class="section-title">解决方案</div>
        <div class="solution-list">
          <div
            v-for="s in solutionOptions"
            :key="s.code"
            class="solution-card"
            :class="{ selected: form.solutions[0] === s.code }"
            @click="selectSolution(s.code)"
          >
            <div class="solution-card-head">
              <span class="radio-dot" :class="{ checked: form.solutions[0] === s.code }" />
              <SIcon :name="getAppIcon(s.icon)" size="default" />
              <span class="solution-card-name">{{ s.name }}</span>
            </div>
            <div class="solution-card-desc">{{ s.description || '暂无描述' }}</div>
            <el-tag size="small" type="success" effect="light">上架中</el-tag>
          </div>
        </div>
        <div class="form-help" style="margin-top:8px;">选择方案后自动纳入方案包含的应用；下方可对应用及其功能逐项调整（项目级覆盖，仅影响本项目）</div>

        <div class="perm-toolbar" style="margin-top:24px;">
          <div class="section-title" style="margin:0;">应用及其功能</div>
          <el-button size="small" text type="primary" :disabled="!form.solutions.length" @click="resetFromSolutions">重置为方案默认权限</el-button>
        </div>
        <div v-if="!form.solutions.length" class="perm-empty">
          <el-empty description="请先在上方选择解决方案" :image-size="80" />
        </div>
        <div v-else class="app-perm-list">
          <div v-for="app in appPermissions" :key="app.code" class="app-perm-item">
            <div class="app-perm-head">
              <SIcon :name="getAppIcon(app.icon)" size="small" />
              <span class="app-perm-name">{{ app.name }}</span>
              <el-switch v-model="app.enabled" size="small" />
              <span class="form-help">{{ app.enabled ? '已开通' : '未开通' }}</span>
            </div>
            <div v-if="app.enabled && app.code === 'store'" class="app-perm-quota">
              <span class="quota-label">门店数量配额（总后台授权时填写）：</span>
              <el-input-number v-model="app.quota" :min="0" :max="10000" size="small" style="width:140px" />
              <span class="form-help">租户端数量不够时可「购买门店」增加</span>
            </div>
            <div v-if="app.enabled && app.menus.length" class="app-perm-menus">
              <el-checkbox
                v-for="m in app.menus"
                :key="m.key"
                v-model="m.enabled"
                size="small"
              >{{ m.label }}</el-checkbox>
            </div>
            <div v-else-if="app.enabled && !app.menus.length" class="form-help">该应用暂无功能菜单</div>
          </div>
        </div>
      </section>

      <!-- ③ 独立配置 -->
      <section id="sec-config" :ref="setSecEls" class="page-card" data-sec="config">
        <div class="section-title">独立配置</div>
        <el-form :model="form.config" label-width="140px">
          <el-form-item label="底部版权文字">
            <el-input v-model="form.config.footerCopyright" placeholder="留空则使用平台版权；自定义文字显示在手机端页面底部" maxlength="60" />
          </el-form-item>
          <el-form-item label="远程附件">
            <el-radio-group v-model="form.config.storageMode">
              <el-radio label="platform">借用平台</el-radio>
              <el-radio label="independent">自主接入</el-radio>
            </el-radio-group>
            <div class="form-help">借用平台：文件存储于平台云存储；自主接入：客户自行配置七牛云/阿里云等</div>
          </el-form-item>
          <el-form-item label="短信配置">
            <el-radio-group v-model="form.config.smsMode">
              <el-radio label="platform">借用平台</el-radio>
              <el-radio label="independent">自主接入</el-radio>
              <el-radio label="both">平台+自主</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="微信支付">
            <el-radio-group v-model="form.config.wechatPayMode">
              <el-radio label="normal">普通商户号</el-radio>
              <el-radio label="service">系统服务商</el-radio>
              <el-radio label="independent">独立服务商</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>

        <div class="sub-section">
          <div class="section-title">素材与容量</div>
          <el-form :model="form.config" label-width="140px">
            <el-form-item label="图片上传大小(MB)">
              <el-input-number v-model="form.config.maxImageSize" :min="1" :max="500" />
              <div class="form-help">上传的单张图片大小上限，默认 2MB</div>
            </el-form-item>
            <el-form-item label="视频上传大小(MB)">
              <el-input-number v-model="form.config.maxVideoSize" :min="1" :max="2048" />
              <div class="form-help">上传的单个视频大小上限，默认 50MB</div>
            </el-form-item>
            <el-form-item label="音频上传大小(MB)">
              <el-input-number v-model="form.config.maxAudioSize" :min="1" :max="500" />
              <div class="form-help">上传的单个音频大小上限，默认 2MB</div>
            </el-form-item>
            <el-form-item label="赠送存储空间(MB)">
              <el-input-number v-model="form.config.giftStorageMb" :min="0" :max="102400" />
              <div class="form-help">客户可用的存储空间大小，默认 50MB</div>
            </el-form-item>
            <el-form-item label="存储位置">
              <el-radio-group v-model="form.config.storageLocation">
                <el-radio label="server">系统服务器</el-radio>
                <el-radio label="remote">远程附件</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-form>
        </div>
      </section>

      <!-- ④ 注册续费 -->
      <section id="sec-renew" :ref="setSecEls" class="page-card" data-sec="renew">
        <div class="section-title">注册续费（仅总后台可配置）</div>
        <el-form :model="form.config" label-width="150px">
          <el-form-item label="小程序端到期">
            <el-radio-group v-model="form.config.miniExpireMode">
              <el-radio label="prompt">提示到期</el-radio>
              <el-radio label="allow">正常访问</el-radio>
            </el-radio-group>
            <div class="form-help">提示到期：访问时提示已到期，可继续浏览；正常访问：不拦截</div>
          </el-form-item>
          <el-form-item label="管理员端到期">
            <el-radio-group v-model="form.config.adminExpireMode">
              <el-radio label="deny">提示到期，且无法使用</el-radio>
              <el-radio label="allow">提示到期，可继续使用</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="自主续费">
            <el-switch v-model="form.config.selfRenew" />
            <div class="form-help">开启后客户可在客户后台自助完成续费</div>
          </el-form-item>
        </el-form>
      </section>

      <!-- ⑤ 选择平台 -->
      <section id="sec-channel" :ref="setSecEls" class="page-card" data-sec="channel">
        <div class="section-title">选择平台（全端渠道）</div>
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
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  fetchCustomerDetail, createCustomer, updateCustomer, fetchSolutions, fetchSolutionDetail,
  fetchTenantChannels, updateTenantChannel, getChannelAuthUrl,
} from '../../api';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../components/SIcon.vue';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id && route.params.id !== 'new');
const saving = ref(false);
const solutionOptions = ref([]);
const adminUsers = ref([]);
const appPermissions = ref([]);

const sections = [
  { id: 'basic', label: '项目信息' },
  { id: 'solution', label: '解决方案与权限' },
  { id: 'config', label: '独立配置' },
  { id: 'renew', label: '注册续费' },
  { id: 'channel', label: '选择平台' },
];
const activeSection = ref('basic');
const secEls = ref([]);
function setSecEls(el) { if (el) secEls.value.push(el); }

const form = reactive({
  customerName: '', remark: '', validUntil: '', status: 'active', adminUserId: null,
  solutions: [],
  config: {
    footerCopyright: '', storageMode: 'platform', smsMode: 'platform', wechatPayMode: 'normal',
    maxImageSize: 2, maxVideoSize: 50, maxAudioSize: 2,
    giftStorageMb: 50, storageLocation: 'server',
    miniExpireMode: 'prompt', adminExpireMode: 'deny', selfRenew: true,
  },
});

const channelList = reactive([
  { type: 'mini', name: '微信小程序', icon: '💬', desc: '客户独立AppID，第三方平台代开发', enabled: false, appid: '', version: '', auditStatus: 'none', config: {} },
  { type: 'h5', name: 'H5手机端', icon: '📱', desc: '/mobile路径，支持独立域名', enabled: false, config: { brandName: '', primaryColor: '#165DFF', customDomain: '' } },
  { type: 'mp', name: '微信公众号', icon: '📢', desc: 'OAuth授权 + H5嵌入', enabled: false, config: { brandName: '', primaryColor: '#165DFF' } },
  { type: 'pc', name: 'PC网站', icon: '💻', desc: '独立域名，PC适配', enabled: false, config: { brandName: '', primaryColor: '#165DFF', customDomain: '' } },
]);

const iconMap = {
  panorama: 'panorama', card: 'card', devices: 'devices', template: 'template',
  market: 'market', chart: 'chart', building: 'building', dynamic: 'dynamic', apps: 'apps',
};
function getAppIcon(icon) { return iconMap[icon] || 'apps'; }

// —— 锚点滚动联动（滚动容器为主内容区 .main-content） ——
function scrollContainer() {
  const main = document.querySelector('.main-content');
  return main && main.scrollHeight > main.clientHeight ? main : document.scrollingElement;
}
function onScroll() {
  const navHeight = 64;
  let current = 'basic';
  for (const el of secEls.value) {
    if (el && el.getBoundingClientRect().top <= navHeight + 8) current = el.dataset.sec;
  }
  activeSection.value = current;
}
function scrollTo(id) {
  const el = document.getElementById(`sec-${id}`);
  if (el) {
    const sc = scrollContainer();
    const top = el.getBoundingClientRect().top + (sc === document.scrollingElement ? sc.scrollTop : sc.scrollTop) - 70;
    sc.scrollTo({ top, behavior: 'smooth' });
    activeSection.value = id;
  }
}

onMounted(async () => {
  const sc = scrollContainer();
  sc.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  try {
    const list = await fetchSolutions();
    solutionOptions.value = (list.solutions || []).filter((s) => s.status === 'on');
  } catch (e) {}
  if (isEdit.value) {
    try {
      const res = await fetchCustomerDetail(route.params.id);
      const c = res.project;
      if (c) {
        Object.assign(form, {
          customerName: c.customerName, remark: c.remark, validUntil: c.validUntil || '',
          status: c.status, adminUserId: c.adminUserId || null,
          solutions: Array.isArray(c.solutions) && c.solutions.length ? [c.solutions[0]] : [],
          config: { ...form.config, ...(c.config || {}) },
        });
      }
      adminUsers.value = res.adminUsers || [];
      if (Array.isArray(res.appPermissions)) appPermissions.value = res.appPermissions;
      if (!appPermissions.value.length && form.solutions[0]) {
        mergeSolutionDefault(form.solutions[0]);
      }
      loadChannels();
    } catch (e) { ElMessage.error(e); }
  }
});
onUnmounted(() => {
  const sc = scrollContainer();
  sc.removeEventListener('scroll', onScroll);
});

async function selectSolution(code) {
  if (form.solutions[0] === code) return;
  form.solutions = [code];
  appPermissions.value = [];
  await mergeSolutionDefault(code);
}

async function mergeSolutionDefault(code) {
  try {
    const sol = solutionOptions.value.find((s) => s.code === code);
    if (!sol) return;
    const detail = await fetchSolutionDetail(sol.id);
    const perms = (detail.solution && detail.solution.appPermissions) || [];
    perms.forEach((app) => {
      if (!app.enabled) return;
      const target = appPermissions.value.find((a) => a.code === app.code);
      if (!target) {
        appPermissions.value.push({ code: app.code, name: app.name, icon: app.icon, description: app.description, enabled: true, menus: app.menus.map((m) => ({ ...m })) });
        return;
      }
      if (!target.enabled) target.enabled = true;
      app.menus.forEach((m) => {
        if (!m.enabled) return;
        const tm = target.menus.find((x) => x.key === m.key);
        if (tm) tm.enabled = true;
      });
    });
  } catch (e) {}
}

async function resetFromSolutions() {
  if (!form.solutions.length) return;
  const confirmed = await ElMessageBox.confirm('将按当前勾选的解决方案重新计算应用及功能权限，覆盖当前调整。确认重置？', '重置权限', {
    confirmButtonText: '重置', cancelButtonText: '取消', type: 'warning',
  }).catch(() => false);
  if (!confirmed) return;
  appPermissions.value = [];
  await mergeSolutionDefault(form.solutions[0]);
  ElMessage.success('已重置为方案默认权限');
}

async function loadChannels() {
  try {
    const res = await fetchTenantChannels(route.params.id);
    const channels = res.channels || [];
    channelList.forEach((ch) => {
      const found = channels.find((c) => c.channelType === ch.type);
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
  if (!form.customerName) { ElMessage.error('请输入项目名称'); return; }
  saving.value = true;
  try {
    const baseData = {
      customerName: form.customerName,
      remark: form.remark,
      validUntil: form.validUntil,
      status: form.status,
      adminUserId: form.adminUserId,
      solutions: form.solutions,
      config: form.config,
      apps: appPermissions.value.map((a) => ({ code: a.code, enabled: a.enabled, quota: a.code === 'store' ? a.quota : undefined })),
      menus: appPermissions.value.flatMap((a) => a.menus.map((m) => ({ appCode: a.code, key: m.key, enabled: m.enabled }))),
    };
    if (isEdit.value) await updateCustomer(route.params.id, baseData);
    else await createCustomer(baseData);
    ElMessage.success('保存成功');
    router.push('/customers');
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>

<style scoped>
.page-card { background:#fff; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.section-title { font-size:15px; font-weight:600; color:#1D2129; margin-bottom:16px; }
.sub-section { border-top:1px solid #F2F3F5; margin-top:20px; padding-top:20px; }
.form-help { font-size:12px; color:#86909C; margin-left:8px; display:inline-block; vertical-align:middle; }

.anchor-nav {
  position: sticky; top:0; z-index:20; display:flex; gap:4px;
  background:#fff; border-radius:8px; padding:8px 12px;
  box-shadow:0 2px 8px rgba(0,0,0,0.06); margin-bottom:16px; overflow-x:auto;
}
.anchor-item {
  flex:0 0 auto; padding:7px 16px; border-radius:8px; font-size:13px; color:#4E5969;
  cursor:pointer; transition:all .2s; white-space:nowrap;
}
.anchor-item:hover { background:#F2F3F5; color:#1D2129; }
.anchor-item.active { background:#E8F3FF; color:#165DFF; font-weight:500; }

.edit-body { display:flex; flex-direction:column; gap:16px; }

.solution-list { display:flex; gap:16px; overflow-x:auto; padding-bottom:6px; }
.solution-list::-webkit-scrollbar { height:6px; }
.solution-list::-webkit-scrollbar-thumb { background:#E5E6EB; border-radius:3px; }
.solution-card {
  flex:0 0 260px; border:1px solid #E5E6EB; border-radius:8px; padding:16px; cursor:pointer;
  transition:border-color .2s, box-shadow .2s; background:#fff;
}
.radio-dot {
  width:14px; height:14px; border-radius:50%; border:1px solid #C9CDD4; box-sizing:border-box;
  display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;
}
.radio-dot.checked { border-color:#165DFF; }
.radio-dot.checked::after { content:''; width:8px; height:8px; border-radius:50%; background:#165DFF; }
.solution-card:hover { border-color:#165DFF; box-shadow:0 4px 12px rgba(22,93,255,0.1); }
.solution-card.selected { border-color:#165DFF; background:#F7FBFF; }
.solution-card-head { display:flex; align-items:center; gap:10px; }
.solution-card-name { font-size:14px; font-weight:600; color:#1D2129; }
.solution-card-desc { font-size:12px; color:#86909C; margin:8px 0 10px; min-height:32px; line-height:1.5; }

.perm-toolbar { display:flex; align-items:center; justify-content:space-between; }
.perm-empty { padding:16px 0; }
.app-perm-list { display:flex; flex-direction:column; gap:12px; }
.app-perm-item { border:1px solid #E5E6EB; border-radius:8px; padding:12px 16px; }
.app-perm-head { display:flex; align-items:center; gap:8px; }
.app-perm-name { font-size:14px; font-weight:600; color:#1D2129; }
.app-perm-head .el-switch { margin-left:auto; }
.app-perm-menus { display:flex; flex-wrap:wrap; gap:4px 20px; padding:10px 0 0 24px; margin-top:10px; border-top:1px dashed #F2F3F5; }
.app-perm-quota { display:flex; align-items:center; gap:10px; padding:10px 0 0 24px; margin-top:10px; border-top:1px dashed #F2F3F5; font-size:13px; color:#4E5969; }
.app-perm-quota .quota-label { white-space:nowrap; }

.channel-list { display:flex; flex-direction:column; gap:16px; }
.channel-item { background:#fff; border-radius:8px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
.channel-item-header { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.channel-item-icon { font-size:28px; }
.channel-item-name { font-size:15px; font-weight:600; color:#1a1b1c; }
.channel-item-desc { font-size:12px; color:#909399; margin-top:2px; }
.channel-item-header .el-tag { margin-left:auto; }
.channel-item-body { border-top:1px solid #f0f0f0; padding-top:16px; }
.channel-detail { font-size:13px; color:#606266; display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
.channel-detail code { font-size:12px; background:#f5f7fa; padding:2px 6px; border-radius:4px; }
.detail-label { color:#909399; }
.channel-empty { display:flex; align-items:center; justify-content:space-between; font-size:13px; color:#909399; }
</style>
