<template>
  <div class="gift-home">
    <!-- 应用内 Tab（对齐菜鸟云 giftForYou：商品列表 / 基础设置） -->
    <div class="card-tabs">
      <div class="ctab" :class="{ active: activeTab === 'products' }" @click="activeTab = 'products'">
        <span>商品列表</span>
      </div>
      <div class="ctab" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'; loadSettings()">
        <span>基础设置</span>
      </div>
    </div>

    <template v-if="activeTab === 'products'">
      <AppPageHeader title="送礼物" desc="从商品库绑定礼物商品，购买后支持转赠好友（1:1 复刻菜鸟云 giftForYou）">
        <el-select v-model="q.cateId" placeholder="请选择分类" clearable style="width: 180px" @change="loadProducts">
          <el-option v-for="c in cates" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input v-model="q.kw" placeholder="关键词" clearable style="width: 200px" @keyup.enter="loadProducts" />
        <el-button type="primary" @click="openBind">添加礼物商品</el-button>
        <el-button type="success" plain :disabled="!selection.length" @click="batchToggle(1)">批量开启</el-button>
        <el-button type="danger" plain :disabled="!selection.length" @click="batchToggle(0)">批量关闭</el-button>
      </AppPageHeader>

      <div class="card">
        <el-table :data="products" v-loading="loading" @selection-change="(r) => (selection = r)">
          <el-table-column type="selection" width="44" :selectable="(row) => row.bound === 1" />
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column label="缩略图" width="90">
            <template #default="{ row }">
              <el-image v-if="row.thumb" :src="row.thumb" style="width: 48px; height: 48px; border-radius: 6px" fit="cover" :preview-src-list="[row.thumb]" preview-teleported />
              <span v-else class="no-img">无图</span>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column label="价格" width="100">
            <template #default="{ row }">¥{{ fen(row.price) }}</template>
          </el-table-column>
          <el-table-column label="库存" width="90">
            <template #default="{ row }">{{ row.stock }}</template>
          </el-table-column>
          <el-table-column label="绑定状态" width="110">
            <template #default="{ row }">
              <el-tag v-if="row.bound === 1" size="small" type="success" effect="light">已开启</el-tag>
              <el-tag v-else-if="row.isBound" size="small" type="warning" effect="light">已关闭</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">未绑定</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <template v-if="row.isBound">
                <el-button link type="success" :disabled="row.bound === 1" @click="toggleOne(row, 1)">开启</el-button>
                <el-button link type="warning" :disabled="row.bound === 0" @click="toggleOne(row, 0)">关闭</el-button>
                <el-button link type="danger" @click="unbind(row)">移除</el-button>
              </template>
              <el-button v-else link type="primary" @click="bindOne(row)">绑定</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- 基础设置（对齐菜鸟云 setView） -->
    <template v-else>
      <AppPageHeader title="基础设置" desc="送礼物全局配置（对齐菜鸟云 setView）">
        <el-button type="primary" :loading="setSaving" @click="saveSettings">确定</el-button>
      </AppPageHeader>
      <div class="card set-card">
        <el-form label-width="110px">
          <el-form-item label="送礼物">
            <el-radio-group v-model="settings.status">
              <el-radio :value="1">开启</el-radio>
              <el-radio :value="0">关闭</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="分享样式">
            <div class="style-group">
              <div
                v-for="s in shareStyles"
                :key="s.id"
                class="style-card"
                :class="{ active: settings.shareStyle === s.id }"
                @click="settings.shareStyle = s.id"
              >
                <div class="style-thumb">
                  <img :src="s.img" :alt="s.label" />
                  <span v-if="settings.shareStyle === s.id" class="style-check">✓</span>
                </div>
                <span class="style-num">{{ s.label }}</span>
              </div>
            </div>
          </el-form-item>
          <el-form-item label="过期时间">
            <el-input-number v-model="settings.expireHour" :min="0" :max="720" controls-position="right" />
            <span class="unit">小时</span>
            <div class="form-tip">超过此时间未领取，则礼物退回</div>
          </el-form-item>
          <el-form-item label="标准运费">
            <el-input-number v-model="settings.normDeliveryFee" :min="0" :precision="2" controls-position="right" />
            <span class="unit">元</span>
            <div class="form-tip">运费在好友填入地址后将重新计算，多出的金额将会退回</div>
          </el-form-item>
          <el-form-item label="礼物赠言">
            <div class="msg-list">
              <div v-for="(m, i) in settings.messages" :key="i" class="msg-row">
                <el-input v-model="settings.messages[i]" placeholder="例如：送你一份心意~" style="max-width: 320px" />
                <el-button link type="danger" @click="settings.messages.splice(i, 1)">删除</el-button>
              </div>
              <el-button @click="settings.messages.push('')">添加</el-button>
            </div>
          </el-form-item>
        </el-form>
      </div>
    </template>

    <!-- 添加礼物商品：商品选择弹窗 -->
    <el-dialog v-model="bindShow" title="添加礼物商品" width="820px" top="6vh">
      <div class="bind-toolbar">
        <el-select v-model="pickCate" placeholder="请选择分类" clearable style="width: 180px" @change="loadPick">
          <el-option v-for="c in cates" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input v-model="pickKw" placeholder="搜索商品标题" clearable style="width: 220px" @keyup.enter="loadPick" />
      </div>
      <el-table :data="pickList" v-loading="pickLoading" height="400" @selection-change="(r) => (pickSel = r)">
        <el-table-column type="selection" width="44" :selectable="(row) => row.bound === 0" />
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="缩略图" width="80">
          <template #default="{ row }">
            <el-image v-if="row.thumb" :src="row.thumb" style="width: 44px; height: 44px; border-radius: 6px" fit="cover" />
            <span v-else class="no-img">无图</span>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="绑定状态" width="90">
          <template #default="{ row }">
            <el-tag v-if="row.bound === 1" size="small" type="success" effect="light">已绑定</el-tag>
            <el-tag v-else size="small" type="info" effect="plain">未绑定</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="bindShow = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!pickSel.length" @click="doBind">确定绑定（{{ pickSel.length }}）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import { customerApiCall } from '../../../api';

const products = ref([]);
const loading = ref(false);
const selection = ref([]);
const q = reactive({ cateId: null, kw: '' });
const cates = ref([]);
const activeTab = ref('products');

// 分享样式（1:1 复刻菜鸟云 giftForYou setView：样式一=深蓝金丝带 / 样式二=橙红礼盒 / 样式三=黑金蝴蝶结）
const shareStyles = [
  { id: 1, label: '样式一', img: '/gift-share/gift3.jpg' },
  { id: 2, label: '样式二', img: '/gift-share/gift2.jpg' },
  { id: 3, label: '样式三', img: '/gift-share/gift1.jpg' },
];

// ---------- 基础设置 ----------
const settings = reactive({ status: 1, shareStyle: 1, expireHour: 0, normDeliveryFee: 0, messages: [] });
const setSaving = ref(false);
async function loadSettings() {
  try {
    const s = await customerApiCall.get('/gift/settings');
    settings.status = s.status;
    settings.shareStyle = s.shareStyle;
    settings.expireHour = s.expireHour;
    settings.normDeliveryFee = s.normDeliveryFee;
    settings.messages = [...(s.messages || [])];
  } catch (e) { ElMessage.error(e); }
}
async function saveSettings() {
  setSaving.value = true;
  try {
    await customerApiCall.put('/gift/settings', { ...settings, messages: settings.messages.filter((m) => String(m || '').trim()) });
    ElMessage.success('保存成功');
  } catch (e) { ElMessage.error(e); } finally { setSaving.value = false; }
}

const bindShow = ref(false);
const pickList = ref([]);
const pickLoading = ref(false);
const pickSel = ref([]);
const pickCate = ref(null);
const pickKw = ref('');
const saving = ref(false);

function fen(v) { return ((v || 0) / 100).toFixed(2); }

async function loadCates() {
  try { cates.value = (await customerApiCall.get('/goods/categories')).tree || []; } catch (e) { /* 分类加载失败不阻断 */ }
}

async function loadProducts() {
  loading.value = true;
  try {
    products.value = await customerApiCall.get('/gift/products', { params: { cateId: q.cateId || '', key: q.kw } });
  } catch (e) { ElMessage.error(e); } finally { loading.value = false; }
}

async function loadPick() {
  pickLoading.value = true;
  try {
    pickList.value = await customerApiCall.get('/gift/products', { params: { cateId: pickCate.value || '', key: pickKw.value } });
  } catch (e) { ElMessage.error(e); } finally { pickLoading.value = false; }
}

function openBind() { bindShow.value = true; pickCate.value = null; pickKw.value = ''; pickSel.value = []; loadPick(); }

async function doBind() {
  const ids = pickSel.value.map((r) => r.id);
  if (!ids.length) return;
  saving.value = true;
  try {
    const r = await customerApiCall.post('/gift/products/bind', { productIds: ids });
    ElMessage.success(`已绑定 ${r.bound} 个礼物商品`);
    bindShow.value = false;
    loadProducts();
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

async function bindOne(row) {
  try {
    await customerApiCall.post('/gift/products/bind', { productIds: [row.id] });
    ElMessage.success('已绑定'); loadProducts();
  } catch (e) { ElMessage.error(e); }
}

async function batchToggle(status) {
  const ids = selection.value.map((r) => r.gpId);
  if (!ids.length) return;
  try {
    await customerApiCall.post('/gift/products/toggle', { ids, status });
    ElMessage.success(status ? '已批量开启' : '已批量关闭'); loadProducts();
  } catch (e) { ElMessage.error(e); }
}

async function toggleOne(row, status) {
  try {
    await customerApiCall.post(`/gift/products/${row.gpId}/toggle`, { status });
    ElMessage.success(status ? '已开启' : '已关闭'); loadProducts();
  } catch (e) { ElMessage.error(e); }
}

async function unbind(row) {
  try {
    await ElMessageBox.confirm('确定将该商品移出礼物列表吗？', '移除礼物', { type: 'warning' });
    await customerApiCall.delete(`/gift/products/${row.gpId}`);
    ElMessage.success('已移除'); loadProducts();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

onMounted(() => { loadCates(); loadProducts(); });
</script>

<style scoped>
.gift-home { padding: 0 20px 20px; }
.card { background: #fff; border-radius: 8px; padding: 20px; }
.no-img { font-size: 12px; color: #C9CDD4; }
.bind-toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.card-tabs { display: flex; gap: 8px; padding: 4px; background: #F2F3F5; border-radius: 8px; width: fit-content; margin-bottom: 16px; }
.ctab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #4E5969; }
.ctab.active { background: #fff; color: #165DFF; font-weight: 500; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.set-card { max-width: 680px; }
.unit { margin-left: 8px; color: #4E5969; }
.form-tip { font-size: 12px; color: #86909C; line-height: 1.5; margin-top: 4px; }
.style-group { display: flex; gap: 16px; flex-wrap: wrap; }
.style-card { width: 148px; border: 2px solid #E5E6EB; border-radius: 8px; overflow: hidden; cursor: pointer; background: #fff; transition: all 0.2s; }
.style-card:hover { border-color: #A9C4FF; }
.style-card.active { border-color: #165DFF; }
.style-thumb { position: relative; width: 100%; aspect-ratio: 750 / 1334; overflow: hidden; }
.style-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.style-check { position: absolute; top: 6px; right: 6px; width: 20px; height: 20px; border-radius: 50%; background: #165DFF; color: #fff; font-size: 12px; line-height: 20px; text-align: center; }
.style-num { display: block; padding: 6px 0; text-align: center; font-size: 13px; color: #4E5969; border-top: 1px solid #F2F3F5; }
.style-card.active .style-num { color: #165DFF; font-weight: 500; }
.msg-list { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.msg-row { display: flex; gap: 8px; align-items: center; }
</style>
