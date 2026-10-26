<template>
  <div class="trace-admin">
    <!-- 🔴 标准 §5.1/§5.3：后台页必须挂 AppPageHeader；禁止 el-tabs border-card，改用 CardTabs 范式 -->
    <AppPageHeader title="防伪溯源" desc="管理防伪码制、批次与查询记录，消费者扫码后可于 C 端溯源页验真领奖">
      <div class="hd-actions">
        <el-tag v-if="cocom === -888" type="success" effect="plain">防伪码库存：不限</el-tag>
        <el-tag v-else type="warning" effect="plain">防伪码库存：{{ cocom }}</el-tag>
        <el-button @click="openRecharge">充值库存</el-button>
      </div>
    </AppPageHeader>

    <div class="card-tabs">
      <div v-for="t in tabs" :key="t.key" class="ctab" :class="{ active: activeTab === t.key }" @click="switchTab(t.key)">
        <SIcon :name="t.icon" size="default" :color="activeTab === t.key ? '#165dff' : '#4e5969'" />
        <span>{{ t.label }}</span>
      </div>
    </div>

    <main class="trace-content">
      <!-- ============ 批次管理 ============ -->
      <section v-show="activeTab === 'batches'">
        <div class="filter-bar">
          <el-input v-model.trim="batchQuery.keyword" placeholder="批次号 / 产品 / 厂家 / 品牌" class="w260" clearable
            @keyup.enter="batchQuery.page = 1; loadBatches()" @clear="batchQuery.page = 1; loadBatches()" />
          <el-button type="primary" @click="batchQuery.page = 1; loadBatches()"><el-icon><Search /></el-icon>查询</el-button>
          <el-button type="success" @click="openBatchCreate"><el-icon><Plus /></el-icon>新增批次</el-button>
          <span class="list-total">共 {{ batchTotal }} 个批次</span>
        </div>

        <el-table v-loading="batchLoading" :data="batchList" class="mt12" empty-text="暂无批次">
          <el-table-column prop="batch" label="批次号" width="140" />
          <el-table-column prop="product" label="产品" min-width="160" show-overflow-tooltip />
          <el-table-column prop="factory" label="厂家" width="140" show-overflow-tooltip />
          <el-table-column prop="brand" label="品牌" width="140" show-overflow-tooltip />
          <el-table-column label="已查次数" width="100" align="center">
            <template #default="{ row }"><span>{{ Number(row.rcon || 0) }}</span></template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="Number(row.is_active) ? 'success' : 'info'" size="small">{{ Number(row.is_active) ? '已激活' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="280" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openGen(row)">生成</el-button>
              <el-button link type="primary" size="small" @click="downloadCodes(row)">下载码包</el-button>
              <el-button link type="primary" size="small" @click="openBatchEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeBatch(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination v-model:current-page="batchQuery.page" :page-size="batchQuery.pageSize" :total="batchTotal"
            layout="total, prev, pager, next" @current-change="loadBatches" />
        </div>
      </section>

      <!-- ============ 防伪码记录 ============ -->
      <section v-show="activeTab === 'codes'">
        <div class="filter-bar">
          <el-input v-model.trim="codeQuery.code" placeholder="防伪码" class="w260" clearable
            @keyup.enter="codeQuery.page = 1; loadCodes()" @clear="codeQuery.page = 1; loadCodes()" />
          <el-button type="primary" @click="codeQuery.page = 1; loadCodes()"><el-icon><Search /></el-icon>查询</el-button>
          <span class="list-total">共 {{ codeTotal }} 条</span>
        </div>

        <el-table v-loading="codeLoading" :data="codeList" class="mt12" empty-text="暂无防伪码">
          <el-table-column prop="code" label="防伪码" min-width="200" show-overflow-tooltip />
          <el-table-column prop="batch" label="批次" width="140" />
          <el-table-column prop="product" label="产品" min-width="160" show-overflow-tooltip />
          <el-table-column label="查询次数" width="100" align="center">
            <template #default="{ row }"><span>{{ Number(row.num || 0) }}</span></template>
          </el-table-column>
          <el-table-column label="异常" width="90" align="center">
            <template #default="{ row }"><el-tag v-if="Number(row.is_err)" type="danger" size="small">异常</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="danger" size="small" @click="markError(row)">标记异常</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination v-model:current-page="codeQuery.page" :page-size="codeQuery.pageSize" :total="codeTotal"
            layout="total, prev, pager, next" @current-change="loadCodes" />
        </div>
      </section>

      <!-- ============ 防伪设置（码制 + 系统设置） ============ -->
      <section v-show="activeTab === 'settings'">
        <el-card class="set-card" shadow="never">
          <template #header><span class="card-title">码制配置</span></template>
          <el-alert v-if="ruleSelfCheck !== ''" type="warning" :closable="false" show-icon :title="ruleSelfCheck" class="mb12" />
          <el-form label-width="130px" class="rule-form">
            <el-row :gutter="20">
              <el-col :span="8">
                <el-form-item label="码前缀 m1" required>
                  <el-input v-model.trim="ruleForm.m1" maxlength="2" placeholder="2 位，如 FW" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="批次号长度 m2">
                  <el-input-number v-model="ruleForm.m2" :min="1" :max="12" controls-position="right" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="流水号长度 m3">
                  <el-input-number v-model="ruleForm.m3" :min="1" :max="12" controls-position="right" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="校验位长度 m4">
                  <el-input-number v-model="ruleForm.m4" :min="1" :max="12" controls-position="right" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="防伪码总长 m5">
                  <el-input-number v-model="ruleForm.m5" :min="6" :max="40" controls-position="right" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="错误次数上限">
                  <el-input-number v-model="ruleForm.zdl" :min="1" :max="999" controls-position="right" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="校验字符集 k1" required>
              <el-input v-model.trim="ruleForm.k1" maxlength="10" placeholder="10 位" />
            </el-form-item>
            <el-form-item label="校验字符集 k2" required>
              <el-input v-model.trim="ruleForm.k2" maxlength="10" placeholder="10 位" />
            </el-form-item>
            <el-form-item label="校验字符集 k3" required>
              <el-input v-model.trim="ruleForm.k3" maxlength="10" placeholder="10 位" />
            </el-form-item>
            <el-form-item label="校验字符集 k4" required>
              <el-input v-model.trim="ruleForm.k4" maxlength="10" placeholder="10 位" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="ruleSaving" @click="saveRule">保存码制</el-button>
              <span class="form-hint">已生成过防伪码后，前缀/各长度参数将被锁定不可改，否则已印码全部失效</span>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card class="set-card" shadow="never">
          <template #header><span class="card-title">系统设置</span></template>
          <el-form label-width="130px" class="set-form">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="欢迎语">
                  <el-input v-model.trim="s.welcome" placeholder="验真页欢迎语" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="首次查询提示">
                  <el-input v-model.trim="s.suc_one" placeholder="如：验证通过" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="二次查询提示">
                  <el-input v-model.trim="s.suc_two" placeholder="如：请勿重复验证" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="查询次数上限">
                  <el-input-number v-model="s.upperlimit" :min="0" :max="9999" controls-position="right" />
                  <span class="form-hint">0 表示不限制</span>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="超限提示">
                  <el-input v-model.trim="s.con_msg" placeholder="达到上限时提示" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="客服电话">
                  <el-input v-model.trim="s.ftel" placeholder="400-xxx" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="厂家电话">
                  <el-input v-model.trim="s.dtel" placeholder="厂家联系电话" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="溯源页域名">
                  <el-input v-model.trim="s.siteroot" placeholder="留空则用当前站点域名" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="历史记录条数">
                  <el-input-number v-model="s.history_limit" :min="1" :max="50" controls-position="right" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="高级设置">
              <el-switch v-model="advancedMode" active-text="编辑原始 JSON" />
            </el-form-item>
            <el-form-item v-if="advancedMode" label=" " label-width="0">
              <el-input v-model="rawJson" type="textarea" :rows="10" class="raw-json" @input="onRawInput" />
              <div v-if="rawError" class="raw-err">JSON 解析失败：{{ rawError }}</div>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="setSaving" @click="saveSettings">保存设置</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 首页展示位：C 端验真结果页下方的推广位（多展位，各配封面图+颜色+展示条件） -->
        <el-card class="set-card" shadow="never">
          <template #header>
            <div class="slot-head">
              <span class="card-title">首页展示位</span>
              <span class="form-hint">最多 {{ SLOT_MAX }} 个（与公众号图文消息单条 1~8 图文的接口上限一致）</span>
            </div>
          </template>

          <el-empty v-if="!s.displaySlots.length" description="还没有展示位，点下方「新增展示位」开始配置" :image-size="60" />

          <div v-for="(it, i) in s.displaySlots" :key="i" class="slot-item">
            <div class="slot-item-hd">
              <span class="slot-idx">第 {{ i + 1 }} 位</span>
              <el-tag v-if="it.when === 0" type="info" size="small" effect="plain">已关闭</el-tag>
              <div class="slot-ops">
                <el-button link size="small" :disabled="i === 0" @click="moveSlot(i, -1)">上移</el-button>
                <el-button link size="small" :disabled="i === s.displaySlots.length - 1" @click="moveSlot(i, 1)">下移</el-button>
                <el-button link size="small" type="danger" @click="removeSlot(i)">删除</el-button>
              </div>
            </div>
            <el-form label-width="90px" class="slot-form">
              <el-form-item label="封面图">
                <el-upload :show-file-list="false" :http-request="(o) => uploadSlotCover(o, i)" accept="image/*">
                  <img v-if="it.cover" :src="it.cover" class="slot-thumb" />
                  <div v-else class="slot-add">+ 选择图片</div>
                </el-upload>
                <span class="form-hint">建议 240×180；未上传时 C 端显示占位底色</span>
              </el-form-item>
              <el-form-item label="标题">
                <el-input v-model.trim="it.title" maxlength="32" placeholder="展示位标题" class="slot-in" />
              </el-form-item>
              <el-form-item label="颜色">
                <el-color-picker v-model="it.color" />
                <span class="form-hint">用于 C 端标题文字色；留空则跟随页面主文本色</span>
              </el-form-item>
              <el-form-item label="展示条件">
                <el-select v-model="it.when" class="slot-when">
                  <el-option v-for="w in SLOT_WHEN_OPTIONS" :key="w.value" :label="w.label" :value="w.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="跳转链接">
                <el-input v-model.trim="it.link" placeholder="/pages/xxx 或 https://..." class="slot-in" />
                <span class="form-hint">http(s) 开头按网页打开（小程序端降级为复制链接），其余按内部页面跳转</span>
              </el-form-item>
              <el-form-item label="接口密钥">
                <el-input v-model.trim="it.accessKey" show-password placeholder="用于代理外部接口调用" class="slot-in" />
                <span class="form-hint">保存后仅回显脱敏串；原样提交表示不修改，输入新值才会覆盖。当前为预留字段，暂不影响展示位行为</span>
              </el-form-item>
            </el-form>
          </div>

          <div class="slot-foot">
            <el-button :disabled="s.displaySlots.length >= SLOT_MAX" @click="addSlot">+ 新增展示位</el-button>
            <el-button type="primary" :loading="setSaving" @click="saveSettings">保存展示位</el-button>
          </div>
        </el-card>
      </section>
    </main>

    <!-- 新增/编辑批次弹窗 -->
    <el-dialog v-model="batchDlg.visible" :title="batchDlg.isEdit ? '编辑批次' : '新增批次'" width="640px" :close-on-click-modal="false">
      <el-form label-width="100px" class="batch-form">
        <el-form-item label="批次号" required>
          <el-input v-model.trim="batchDlg.form.batch" placeholder="由码制「批次号长度」决定，如 7 位" />
        </el-form-item>
        <el-form-item label="产品"><el-input v-model.trim="batchDlg.form.product" /></el-form-item>
        <el-form-item label="厂家"><el-input v-model.trim="batchDlg.form.factory" /></el-form-item>
        <el-form-item label="品牌"><el-input v-model.trim="batchDlg.form.brand" /></el-form-item>
        <el-form-item label="原产地"><el-input v-model.trim="batchDlg.form.origin" /></el-form-item>
        <el-form-item label="省"><el-input v-model.trim="batchDlg.form.province" /></el-form-item>
        <el-form-item label="市"><el-input v-model.trim="batchDlg.form.city" /></el-form-item>
        <el-form-item label="区"><el-input v-model.trim="batchDlg.form.district" /></el-form-item>
        <el-form-item label="窜货检测">
          <el-select v-model="batchDlg.form.isChuanhuo" class="w200">
            <el-option :value="0" label="关闭" />
            <el-option :value="2" label="按省" />
            <el-option :value="3" label="按市" />
            <el-option :value="4" label="按区县" />
          </el-select>
        </el-form-item>
        <template v-if="batchDlg.isEdit">
          <el-form-item label="Logo"><el-input v-model.trim="batchDlg.form.logo" placeholder="图片 URL" /></el-form-item>
          <el-form-item label="主图"><el-input v-model.trim="batchDlg.form.banner" placeholder="图片 URL" /></el-form-item>
          <el-form-item label="视频"><el-input v-model.trim="batchDlg.form.video" placeholder="视频 URL" /></el-form-item>
          <el-form-item label="购买链接"><el-input v-model.trim="batchDlg.form.buyLink" /></el-form-item>
          <el-form-item label="状态">
            <el-switch v-model="batchDlg.form.isActive" active-text="已激活" inactive-text="停用" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="batchDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="saveBatch">保存</el-button>
      </template>
    </el-dialog>

    <!-- 生成防伪码弹窗（🔴 用 el-input-number 替代 window.prompt） -->
    <el-dialog v-model="genDlg.visible" :title="`生成防伪码：${genDlg.row?.batch || ''}`" width="460px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="码型">
          <el-select v-model="genDlg.codetype" class="w240">
            <el-option :value="1" label="普通文本码（含校验位，可扫码/手输）" />
            <el-option :value="6" label="纯数字码" />
          </el-select>
        </el-form-item>
        <el-form-item label="生成数量">
          <el-input-number v-model="genDlg.count" :min="1" :max="10000" :step="100" controls-position="right" />
          <span class="form-hint">最多 10000 个</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="genDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="genSaving" @click="confirmGen">生成</el-button>
      </template>
    </el-dialog>

    <!-- 充值库存弹窗 -->
    <el-dialog v-model="rechargeDlg.visible" title="充值防伪码库存" width="420px" :close-on-click-modal="false">
      <el-form label-width="90px">
        <el-form-item label="充值数量">
          <el-input-number v-model="rechargeDlg.amount" :min="1" :max="9999999" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rechargeDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="rechargeSaving" @click="confirmRecharge">确认充值</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
// 🔴 标准 §5.2：必须走 customerApiCall（baseURL=/api/customer），禁止裸 fetch / 自建 request
import { customerApiCall } from '../../../../api';
import AppPageHeader from '../../../../components/AppPageHeader.vue';
import SIcon from '../../../../components/SIcon.vue';

const tabs = [
  { key: 'batches', label: '批次管理', icon: 'box' },
  { key: 'codes', label: '防伪码记录', icon: 'list' },
  { key: 'settings', label: '防伪设置', icon: 'setting' },
];
const activeTab = ref('batches');
function switchTab(key) { activeTab.value = key; }

/* ----------------- 批次 ----------------- */
const batchQuery = reactive({ page: 1, pageSize: 20, keyword: '' });
const batchList = ref([]);
const batchTotal = ref(0);
const batchLoading = ref(false);
async function loadBatches() {
  batchLoading.value = true;
  try {
    const params = { page: batchQuery.page, pageSize: batchQuery.pageSize };
    if (batchQuery.keyword) params.keyword = batchQuery.keyword;
    const res = await customerApiCall.get('/trace/batches', { params });
    batchList.value = res.list || [];
    batchTotal.value = Number(res.total || 0);
  } catch (e) {
    ElMessage.error(e || '加载批次失败');
  } finally { batchLoading.value = false; }
}

const batchDlg = reactive({ visible: false, isEdit: false, form: {} });
const batchSaving = ref(false);
function emptyBatch() {
  return { id: 0, batch: '', product: '', factory: '', brand: '', origin: '', province: '', city: '', district: '', isChuanhuo: 0, logo: '', banner: '', video: '', buyLink: '', isActive: true };
}
function openBatchCreate() { batchDlg.isEdit = false; batchDlg.form = emptyBatch(); batchDlg.visible = true; }
function openBatchEdit(row) {
  batchDlg.isEdit = true;
  batchDlg.form = {
    id: row.id,
    batch: row.batch,
    product: row.product || '',
    factory: row.factory || '',
    brand: row.brand || '',
    origin: row.origin || '',
    province: row.province || '',
    city: row.city || '',
    district: row.district || '',
    isChuanhuo: Number(row.is_chuanhuo || 0),
    logo: row.logo || '',
    banner: row.banner || '',
    video: row.video || '',
    buyLink: row.buy_link || '',
    isActive: !!Number(row.is_active),
  };
  batchDlg.visible = true;
}
async function saveBatch() {
  const f = batchDlg.form;
  if (!f.batch) { ElMessage.warning('批次号必填'); return; }
  batchSaving.value = true;
  try {
    if (batchDlg.isEdit) {
      await customerApiCall.put(`/trace/batches/${f.id}`, {
        product: f.product, factory: f.factory, brand: f.brand, origin: f.origin,
        logo: f.logo, banner: f.banner, video: f.video, buyLink: f.buyLink,
        province: f.province, city: f.city, district: f.district,
        isChuanhuo: Number(f.isChuanhuo || 0), isActive: f.isActive ? 1 : 0,
      });
    } else {
      await customerApiCall.post('/trace/batches', {
        batch: f.batch, product: f.product, factory: f.factory, brand: f.brand,
        origin: f.origin, province: f.province, city: f.city, district: f.district,
        isChuanhuo: Number(f.isChuanhuo || 0),
      });
    }
    ElMessage.success('保存成功');
    batchDlg.visible = false;
    loadBatches();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally { batchSaving.value = false; }
}
async function removeBatch(row) {
  try {
    await ElMessageBox.confirm(`确定删除批次「${row.batch}」吗？已有查询记录的批次会被停用而非删除。`, '删除批次', { type: 'warning' });
  } catch { return; }
  try {
    await customerApiCall.delete(`/trace/batches/${row.id}`);
    ElMessage.success('操作成功');
    loadBatches();
  } catch (e) { ElMessage.error(e || '删除失败'); }
}

/* ----------------- 生成 / 下载 ----------------- */
const genDlg = reactive({ visible: false, row: null, codetype: 1, count: 100 });
const genSaving = ref(false);
function openGen(row) { genDlg.row = row; genDlg.codetype = 1; genDlg.count = 100; genDlg.visible = true; }
async function confirmGen() {
  if (!genDlg.row) return;
  genSaving.value = true;
  try {
    const res = await customerApiCall.post(`/trace/batches/${genDlg.row.id}/generate-codes`, {
      codetype: genDlg.codetype,
      codeno: Number(genDlg.count || 1),
    });
    ElMessage.success(`已生成 ${res.created ?? 0} 个防伪码`);
    genDlg.visible = false;
    loadBatches();
  } catch (e) {
    ElMessage.error(e || '生成失败');
  } finally { genSaving.value = false; }
}
async function downloadCodes(row) {
  try {
    // 🔴 二维码/大批量码包走 GET 导出（attachment 下载），避免把大体积 HTML 拉进 JS 内存
    const res = await customerApiCall.get(`/trace/batches/${row.id}/export`, {
      params: { codetype: 2, codeno: 100 },
      responseType: 'blob',
    });
    const blob = res instanceof Blob ? res : new Blob([res]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `securitycode_${row.batch}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    ElMessage.success('码包已开始下载');
  } catch (e) {
    ElMessage.error(e || '下载失败');
  }
}

/* ----------------- 防伪码记录 ----------------- */
const codeQuery = reactive({ page: 1, pageSize: 20, code: '' });
const codeList = ref([]);
const codeTotal = ref(0);
const codeLoading = ref(false);
async function loadCodes() {
  codeLoading.value = true;
  try {
    const params = { page: codeQuery.page, pageSize: codeQuery.pageSize };
    if (codeQuery.code) params.code = codeQuery.code;
    const res = await customerApiCall.get('/trace/codes', { params });
    codeList.value = res.list || [];
    codeTotal.value = Number(res.total || 0);
  } catch (e) {
    ElMessage.error(e || '加载防伪码失败');
  } finally { codeLoading.value = false; }
}
async function markError(row) {
  try {
    await customerApiCall.post(`/trace/codes/${row.id}/mark-error`, { reason: '' });
    ElMessage.success('已标记为异常');
    loadCodes();
  } catch (e) { ElMessage.error(e || '标记失败'); }
}

/* ----------------- 码制配置 ----------------- */
const ruleForm = reactive({ m1: 'FW', m2: 7, m3: 6, m4: 5, m5: 20, k1: '', k2: '', k3: '', k4: '', zdl: 10 });
const ruleSaving = ref(false);
// 🔴 码长自洽校验：前缀长度 + m2 + m3 + m4 必须等于 m5，否则生成的码会被截断撞码
const ruleSelfCheck = computed(() => {
  const expect = String(ruleForm.m1 || '').length + Number(ruleForm.m2) + Number(ruleForm.m3) + Number(ruleForm.m4);
  if (expect !== Number(ruleForm.m5)) {
    return `码长不自洽：前缀(${String(ruleForm.m1 || '').length}) + 批次号(${ruleForm.m2}) + 流水号(${ruleForm.m3}) + 校验位(${ruleForm.m4}) = ${expect}，必须等于总长 ${ruleForm.m5}`;
  }
  if ([ruleForm.k1, ruleForm.k2, ruleForm.k3, ruleForm.k4].some((k) => String(k || '').length !== 10)) {
    return '校验字符集 k1~k4 必须为 10 位';
  }
  return '';
});
async function loadRule() {
  try {
    const res = await customerApiCall.get('/trace/code-rule');
    const r = res.rule || {};
    const m = r.m || {};
    const k = r.k || {};
    ruleForm.m1 = String(m[1] || 'FW');
    ruleForm.m2 = Number(m[2] || 7);
    ruleForm.m3 = Number(m[3] || 6);
    ruleForm.m4 = Number(m[4] || 5);
    ruleForm.m5 = Number(m[5] || 20);
    ruleForm.k1 = String(k[1] || '');
    ruleForm.k2 = String(k[2] || '');
    ruleForm.k3 = String(k[3] || '');
    ruleForm.k4 = String(k[4] || '');
    ruleForm.zdl = Number(r.zdl || 10);
  } catch (e) { ElMessage.error(e || '加载码制失败'); }
}
async function saveRule() {
  if (ruleSelfCheck.value) { ElMessage.warning(ruleSelfCheck.value); return; }
  ruleSaving.value = true;
  try {
    // 🔴 后端 saveRule 接收扁平字段（m1..m5, k1..k4, zdl），不是整包 rule 对象
    await customerApiCall.put('/trace/code-rule', {
      m1: ruleForm.m1, m2: ruleForm.m2, m3: ruleForm.m3, m4: ruleForm.m4, m5: ruleForm.m5,
      k1: ruleForm.k1, k2: ruleForm.k2, k3: ruleForm.k3, k4: ruleForm.k4, zdl: ruleForm.zdl,
    });
    ElMessage.success('码制已保存');
  } catch (e) {
    ElMessage.error(e || '保存码制失败');
  } finally { ruleSaving.value = false; }
}

/* ----------------- 系统设置 ----------------- */
// 🔴 s 为 settings 单一事实来源；常用字段直接 v-model 到 s.xxx，高级模式编辑原始 JSON
const s = reactive({ welcome: '', suc_one: '', suc_two: '', upperlimit: 0, con_msg: '', ftel: '', dtel: '', siteroot: '', history_limit: 10, displaySlots: [] });
const advancedMode = ref(false);

/* ----------------- 首页展示位 ----------------- */
/**
 * 展示位数量上限。
 * 🔴 依据：当前公众号「上传图文消息素材」接口限制一个图文消息支持 1 到 8 条图文，
 *   每条自带缩略图 + 标题 + 原文链接 —— 与展示位逐项对映。
 *   （对标系统的固定 10 位对应的是较早的接口口径，已超出当前上限，不跟。）
 */
const SLOT_MAX = 8;
const SLOT_WHEN_OPTIONS = [
  { value: 0, label: '关闭（不显示）' },
  { value: 1, label: '全部查询都显示' },
  { value: 2, label: '仅首次查询显示' },
  { value: 5, label: '首位查询人每次显示' },
  { value: 4, label: '非首位查询人显示' },
];
const EMPTY_SLOT = () => ({ when: 1, title: '', cover: '', link: '', color: null, accessKey: '' });

/**
 * 服务端下发的展示位 → 表单形状。
 * 🔴 两处必须归一：① el-color-picker 用 null 表示「未设置」，空串会渲染成黑色；
 *   ② 服务端剥掉了 keyCipher 只给脱敏的 accessKey，这里补成空串避免 undefined 进输入框。
 */
function slotsForForm(list) {
  return (Array.isArray(list) ? list : []).slice(0, SLOT_MAX).map((it) => ({
    when: Number(it.when) || 0,
    title: String(it.title || ''),
    cover: String(it.cover || ''),
    link: String(it.link || ''),
    color: it.color || null,
    accessKey: String(it.accessKey || ''),
  }));
}
function addSlot() {
  if (s.displaySlots.length >= SLOT_MAX) { ElMessage.warning(`展示位最多 ${SLOT_MAX} 个`); return; }
  s.displaySlots.push(EMPTY_SLOT());
}
function removeSlot(i) { s.displaySlots.splice(i, 1); }
function moveSlot(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= s.displaySlots.length) return;
  const a = s.displaySlots;
  const tmp = a[i];
  a[i] = a[j];
  a[j] = tmp;
}
async function uploadSlotCover(options, i) {
  try {
    const fd = new FormData();
    fd.append('file', options.file);
    const res = await customerApiCall.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    s.displaySlots[i].cover = res.url;
    ElMessage.success('上传成功');
  } catch (e) { ElMessage.error(e); }
}

const rawJson = ref('');
const rawError = ref('');
const setSaving = ref(false);
const cocom = ref(0);

function syncFormFromSettings(settings) {
  const src = settings || {};
  for (const key of Object.keys(s)) {
    // 🔴 展示位单独走 slotsForForm：要补默认值、还要把空色转成 null（el-color-picker 口径）
    if (key === 'displaySlots') continue;
    if (src[key] !== undefined && src[key] !== null) s[key] = src[key];
  }
  s.displaySlots = slotsForForm(src.displaySlots);
  // 高级模式原本是空的（读不到当前配置，只能盲打）→ 回填一次，编辑才有意义
  rawJson.value = JSON.stringify(s, null, 2);
}
async function loadSettings() {
  try {
    const res = await customerApiCall.get('/trace/settings');
    cocom.value = Number(res.cocom ?? 0);
    syncFormFromSettings(res.settings || {});
  } catch (e) { ElMessage.error(e || '加载设置失败'); }
}
function onRawInput(val) {
  try {
    const parsed = JSON.parse(val);
    Object.keys(s).forEach((k) => {
      if (parsed[k] === undefined) return;
      s[k] = k === 'displaySlots' ? slotsForForm(parsed[k]) : parsed[k];
    });
    rawError.value = '';
  } catch (err) {
    rawError.value = err.message;
  }
}
async function saveSettings() {
  if (advancedMode.value && rawError.value) { ElMessage.warning('高级设置 JSON 解析失败，请修正后再保存'); return; }
  if (s.displaySlots.length > SLOT_MAX) { ElMessage.warning(`展示位最多 ${SLOT_MAX} 个，请删除多余项后再保存`); return; }
  setSaving.value = true;
  try {
    // 🔴 后端 PUT /settings 接收 { settings }，settings 为对象（非字符串）
    const payload = {
      ...s,
      // 🔴 el-color-picker 的「未设置」是 null → 落库前转回空串（后端按「空 = 跟随主题色」处理）
      displaySlots: (s.displaySlots || []).map((it) => ({ ...it, color: it.color || '' })),
    };
    await customerApiCall.put('/trace/settings', { settings: payload });
    // 🔴 保存后必须回读：接口密钥提交的是明文、库里存的是密文，回读才能让输入框
    //    显示成脱敏串 —— 否则用户以为「明文保存成功了」，其实界面和库里是两套东西。
    await loadSettings();
    ElMessage.success('设置已保存');
  } catch (e) {
    ElMessage.error(e || '保存设置失败');
  } finally { setSaving.value = false; }
}

/* ----------------- 充值库存 ----------------- */
const rechargeDlg = reactive({ visible: false, amount: 1000 });
const rechargeSaving = ref(false);
function openRecharge() { rechargeDlg.amount = 1000; rechargeDlg.visible = true; }
async function confirmRecharge() {
  if (Number(rechargeDlg.amount) <= 0) { ElMessage.warning('充值数量必须大于 0'); return; }
  rechargeSaving.value = true;
  try {
    const res = await customerApiCall.post('/trace/recharge', { amount: Number(rechargeDlg.amount) });
    cocom.value = Number(res.cocom ?? 0);
    ElMessage.success('充值成功');
    rechargeDlg.visible = false;
  } catch (e) { ElMessage.error(e || '充值失败'); }
  finally { rechargeSaving.value = false; }
}

onMounted(() => {
  loadBatches();
  loadCodes();
  loadSettings();
  loadRule();
});
</script>

<style scoped>
.hd-actions { display: flex; align-items: center; gap: 12px; }
.card-tabs {
  display: flex; gap: 8px; background: #fff; border-radius: 8px; padding: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04); overflow-x: auto; margin-bottom: 16px;
}
.ctab {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 8px;
  font-size: 14px; color: #4e5969; cursor: pointer; white-space: nowrap; transition: all 0.2s;
}
.ctab:hover { background: #f2f3f5; color: #1d2129; }
.ctab.active { background: #e8f3ff; color: #165dff; font-weight: 500; }
.trace-content { min-height: 400px; }
.filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.list-total { font-size: 13px; color: #86909c; }
.w260 { width: 260px; } .w200 { width: 200px; } .w240 { width: 240px; }
.mt12 { margin-top: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
.set-card { margin-bottom: 16px; }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 8px; }
.raw-json { font-family: monospace; }
.raw-err { color: #f53f3f; font-size: 12px; margin-top: 4px; }
.rule-form :deep(.el-input-number), .set-form :deep(.el-input-number) { width: 160px; }

/* 首页展示位编辑器 */
.slot-head { display: flex; align-items: center; gap: 10px; }
.slot-item { border: 1px solid #e5e6eb; border-radius: 8px; padding: 12px 16px 0; margin-bottom: 12px; background: #fafbfc; }
.slot-item-hd { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.slot-idx { font-size: 13px; font-weight: 600; color: #1d2129; }
.slot-ops { margin-left: auto; display: flex; gap: 4px; }
.slot-thumb { width: 90px; height: 68px; object-fit: cover; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.slot-add {
  width: 90px; height: 68px; line-height: 68px; text-align: center; cursor: pointer;
  border: 1px dashed #c9cdd4; border-radius: 6px; color: #86909c; font-size: 13px; background: #fff;
}
.slot-add:hover { border-color: #165dff; color: #165dff; }
.slot-in { width: 420px; max-width: 100%; }
.slot-when { width: 260px; }
.slot-foot { display: flex; align-items: center; gap: 12px; }
</style>
