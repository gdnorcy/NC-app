<template>
  <div class="ticket-home">
    <!-- 应用内 Tab（对齐菜鸟云礼品卡券：卡券分类 / 卡券列表） -->
    <div class="card-tabs">
      <div class="ctab" :class="{ active: activeTab === 'cates' }" @click="activeTab = 'cates'">
        <SIcon name="apps" size="default" :color="activeTab === 'cates' ? '#165dff' : '#4e5969'" />
        <span>卡券分类</span>
      </div>
      <div class="ctab" :class="{ active: activeTab === 'cards' }" @click="activeTab = 'cards'">
        <SIcon name="voucher" size="default" :color="activeTab === 'cards' ? '#165dff' : '#4e5969'" />
        <span>卡券列表</span>
      </div>
    </div>

    <!-- ============ 卡券分类 ============ -->
    <div v-if="activeTab === 'cates'" class="panel">
      <AppPageHeader title="卡券分类" desc="按分类管理礼品卡券（排序数字越大越靠前）">
        <el-button type="primary" @click="openCate()">添加分类</el-button>
      </AppPageHeader>
      <div class="card">
        <el-table :data="cates" v-loading="cateLoading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="name" label="分类名称" min-width="160" />
          <el-table-column prop="sort" label="排序" width="90" />
          <el-table-column prop="cardCount" label="卡券数量" width="100" />
          <el-table-column prop="createdAt" label="创建时间" width="180" />
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCate(row)">编辑</el-button>
              <el-button link type="danger" @click="delCate(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- ============ 卡券列表 ============ -->
    <div v-else class="panel">
      <AppPageHeader title="卡券列表" desc="卡券可自己兑用或转赠他人兑用；上架后可见可购买">
        <el-select v-model="q.cateId" placeholder="请选择分类" clearable style="width: 180px" @change="loadCards">
          <el-option v-for="c in cates" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input v-model="q.kw" placeholder="搜索关键字" clearable style="width: 200px" @keyup.enter="loadCards" />
        <el-button type="primary" @click="openCard()">添加卡券</el-button>
        <el-button type="danger" plain :disabled="!selection.length" @click="batchDel">批量删除</el-button>
      </AppPageHeader>
      <div class="card">
        <el-table :data="cards" v-loading="cardLoading" @selection-change="(r) => (selection = r)">
          <el-table-column type="selection" width="44" />
          <el-table-column prop="sort" label="排序" width="80" />
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="cateName" label="所属分类" width="110" />
          <el-table-column label="缩略图" width="90">
            <template #default="{ row }">
              <el-image v-if="row.thumb" :src="row.thumb" style="width: 48px; height: 48px; border-radius: 6px" fit="cover" :preview-src-list="[row.thumb]" preview-teleported />
              <span v-else class="no-img">无图</span>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="标题" min-width="150" show-overflow-tooltip />
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag size="small" effect="light" :type="row.type === 2 ? 'warning' : 'primary'">{{ row.type === 2 ? '实物卡' : '充值卡' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="价格/面额" width="130">
            <template #default="{ row }">
              <div class="price-cell">
                <span>¥{{ fen(row.price) }}</span>
                <span class="sub">面额¥{{ fen(row.money) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="库存/已售" width="100">
            <template #default="{ row }">
              <div class="price-cell"><span>{{ row.stock }}</span><span class="sub">已售{{ row.sold }}</span></div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.flag === 1 ? 'success' : 'info'" effect="light">{{ row.flag === 1 ? '上架' : '下架' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openCard(row)">编辑</el-button>
              <el-button link type="danger" @click="delCard(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 分类编辑弹窗 -->
    <el-dialog v-model="cateDlg.show" :title="cateDlg.form.id ? '编辑分类' : '添加分类'" width="440px">
      <el-form label-width="90px">
        <el-form-item label="分类名称" required>
          <el-input v-model="cateDlg.form.name" placeholder="请输入分类名称" maxlength="30" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="cateDlg.form.sort" :min="0" :max="9999" />
          <div class="form-tip">数字越大越靠前</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cateDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="cateDlg.saving" @click="saveCate">确定</el-button>
      </template>
    </el-dialog>

    <!-- 卡券编辑弹窗 -->
    <el-dialog v-model="cardDlg.show" :title="cardDlg.form.id ? '编辑卡券' : '添加卡券'" width="720px" top="5vh">
      <el-form label-width="110px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="排序">
              <el-input-number v-model="cardDlg.form.sort" :min="0" :max="9999" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="状态">
              <el-radio-group v-model="cardDlg.form.flag">
                <el-radio :value="1">上架</el-radio>
                <el-radio :value="2">下架</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="卡券名称" required>
          <el-input v-model="cardDlg.form.name" placeholder="请填写卡券名称" maxlength="50" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="所属分类" required>
              <el-select v-model="cardDlg.form.cateId" placeholder="请选择所属分类" style="width: 100%">
                <el-option v-for="c in cates" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="卡券价格">
              <el-input-number v-model="cardDlg.form.price" :min="0" :precision="2" :step="1" controls-position="right" style="width: 100%" />
              <div class="form-tip">单位：元</div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="卡券库存">
              <el-input-number v-model="cardDlg.form.stock" :min="0" :step="1" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="限购数量">
              <el-input-number v-model="cardDlg.form.limitNum" :min="0" :step="1" controls-position="right" style="width: 100%" />
              <div class="form-tip">0=不限制</div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="开启转赠">
              <el-radio-group v-model="cardDlg.form.increase">
                <el-radio :value="1">开启</el-radio>
                <el-radio :value="0">关闭</el-radio>
              </el-radio-group>
              <div class="form-tip">开启后才可以转赠</div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="卡券类型">
              <el-radio-group v-model="cardDlg.form.type">
                <el-radio :value="1">充值卡</el-radio>
                <el-radio :value="2">实物卡</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="卡券面额">
              <el-input-number v-model="cardDlg.form.money" :min="0" :precision="2" controls-position="right" style="width: 100%" />
              <div class="form-tip">单位：元</div>
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="使用限制">
              <el-radio-group v-model="cardDlg.form.useType">
                <el-radio :value="0">固定时间有效</el-radio>
                <el-radio :value="1">购买当日</el-radio>
                <el-radio :value="2">购买次日</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item v-if="cardDlg.form.useType === 0" label="有效期">
          <el-date-picker v-model="useRange" type="datetimerange" range-separator="至" start-placeholder="开始时间" end-placeholder="结束时间" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="cardDlg.form.useType === 1" label="有效天数">
          <el-input-number v-model="cardDlg.form.todayAfter" :min="1" :max="365" controls-position="right" />
          <div class="form-tip">1表示购买当日有效</div>
        </el-form-item>
        <el-form-item v-if="cardDlg.form.useType === 2" label="有效天数">
          <el-input-number v-model="cardDlg.form.yesAfter" :min="1" :max="365" controls-position="right" />
          <div class="form-tip">1表示购买次日有效</div>
        </el-form-item>
        <el-form-item label="缩略图">
          <div class="img-picker">
            <el-image v-if="cardDlg.form.thumb" :src="cardDlg.form.thumb" fit="cover" class="thumb-box" :preview-src-list="[cardDlg.form.thumb]" preview-teleported />
            <div v-else class="thumb-box thumb-empty" @click="openPicker('thumb')"><el-icon><Plus /></el-icon></div>
            <div class="picker-ops">
              <el-button size="small" @click="openPicker('thumb')">选择图片</el-button>
              <el-button v-if="cardDlg.form.thumb" size="small" text type="danger" @click="cardDlg.form.thumb = ''">移除</el-button>
            </div>
          </div>
          <div class="form-tip">建议尺寸 350×350，不超过 100kb</div>
        </el-form-item>
        <el-form-item label="轮播图">
          <div class="carousel-box">
            <div v-for="(u, i) in cardDlg.form.carousel" :key="i" class="carousel-item">
              <el-image :src="u" fit="cover" style="width: 52px; height: 52px; border-radius: 6px" />
              <el-button link type="danger" @click="cardDlg.form.carousel.splice(i, 1)">移除</el-button>
            </div>
            <el-button @click="openPicker('carousel')">+ 选择图片</el-button>
          </div>
        </el-form-item>
        <el-form-item label="卡券简介">
          <el-input v-model="cardDlg.form.descs" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="分享标题">
          <el-input v-model="cardDlg.form.shareTitle" maxlength="50" />
        </el-form-item>
        <el-form-item label="卡券详情">
          <RichTextEditor v-model="cardDlg.form.detail" class="rich-editor" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cardDlg.show = false">取消</el-button>
        <el-button type="primary" :loading="cardDlg.saving" @click="saveCard">确定</el-button>
      </template>
    </el-dialog>

    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import SIcon from '../../../components/SIcon.vue';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import MaterialPicker from './design/MaterialPicker.vue';
import RichTextEditor from './design/RichTextEditor.vue';
import { customerApiCall } from '../../../api';

const activeTab = ref('cards');

const cates = ref([]);
const cateLoading = ref(false);
const cateDlg = reactive({ show: false, saving: false, form: { id: 0, name: '', sort: 0 } });

async function loadCates() {
  cateLoading.value = true;
  try { cates.value = await customerApiCall.get('/gift-card/categories'); }
  catch (e) { ElMessage.error(e); } finally { cateLoading.value = false; }
}
function openCate(row) { cateDlg.form = row ? { id: row.id, name: row.name, sort: row.sort } : { id: 0, name: '', sort: 0 }; cateDlg.show = true; }
async function saveCate() {
  const f = cateDlg.form;
  if (!f.name.trim()) return ElMessage.warning('请输入分类名称');
  cateDlg.saving = true;
  try {
    if (f.id) await customerApiCall.put(`/gift-card/categories/${f.id}`, f);
    else await customerApiCall.post('/gift-card/categories', f);
    ElMessage.success('保存成功'); cateDlg.show = false; loadCates();
  } catch (e) { ElMessage.error(e); } finally { cateDlg.saving = false; }
}
async function delCate(row) {
  try {
    await ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, '删除分类', { type: 'warning' });
    await customerApiCall.delete(`/gift-card/categories/${row.id}`);
    ElMessage.success('已删除'); loadCates();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

const cards = ref([]);
const cardLoading = ref(false);
const selection = ref([]);
const q = reactive({ cateId: null, kw: '' });
const cardDlg = reactive({ show: false, saving: false, form: emptyCard() });
const useRange = ref(null);
const picker = ref({ show: false, target: '' });

function openPicker(target) { picker.value = { show: true, target }; }
function onPickImg(url) {
  if (!url) return;
  if (picker.value.target === 'thumb') cardDlg.form.thumb = url;
  else if (picker.value.target === 'carousel') cardDlg.form.carousel.push(url);
}

function fen(v) { return ((v || 0) / 100).toFixed(2); }

function emptyCard() {
  return {
    id: 0, name: '', cateId: null, price: 0, stock: 0, limitNum: 0, increase: 0, type: 1,
    money: 0, useType: 1, useBtime: '', useEtime: '', todayAfter: 1, yesAfter: 1,
    thumb: '', carousel: [], descs: '', shareTitle: '', shareImg: '', detail: '', sort: 0, flag: 1,
  };
}

async function loadCards() {
  cardLoading.value = true;
  try {
    cards.value = await customerApiCall.get('/gift-card/cards', { params: { cateId: q.cateId || '', key: q.kw } });
  } catch (e) { ElMessage.error(e); } finally { cardLoading.value = false; }
}

function openCard(row) {
  cardDlg.form = row ? {
    ...emptyCard(), ...row, price: row.price / 100, money: row.money / 100, carousel: [...(row.carousel || [])],
  } : emptyCard();
  useRange.value = row && row.useBtime ? [row.useBtime, row.useEtime] : null;
  cardDlg.show = true;
}

function addCarousel() { cardDlg.form.carousel.push(''); }

async function saveCard() {
  const f = cardDlg.form;
  if (!f.name.trim()) return ElMessage.warning('请输入卡券名称');
  if (!f.cateId) return ElMessage.warning('请选择所属分类');
  if (f.useType === 0 && (!useRange.value || !useRange.value.length)) return ElMessage.warning('请选择固定时间有效期');
  const payload = {
    ...f,
    price: Math.round((Number(f.price) || 0) * 100),
    money: Math.round((Number(f.money) || 0) * 100),
    useBtime: f.useType === 0 && useRange.value ? useRange.value[0] : '',
    useEtime: f.useType === 0 && useRange.value ? useRange.value[1] : '',
    carousel: f.carousel.filter(Boolean),
  };
  cardDlg.saving = true;
  try {
    if (f.id) await customerApiCall.put(`/gift-card/cards/${f.id}`, payload);
    else await customerApiCall.post('/gift-card/cards', payload);
    ElMessage.success('保存成功'); cardDlg.show = false; loadCards();
  } catch (e) { ElMessage.error(e); } finally { cardDlg.saving = false; }
}

async function delCard(row) {
  try {
    await ElMessageBox.confirm(`确定删除卡券「${row.name}」吗？`, '删除卡券', { type: 'warning' });
    await customerApiCall.delete(`/gift-card/cards/${row.id}`);
    ElMessage.success('已删除'); loadCards();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

async function batchDel() {
  const ids = selection.value.map((r) => r.id);
  if (!ids.length) return;
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 张卡券吗？`, '批量删除', { type: 'warning' });
    await customerApiCall.post('/gift-card/cards/batch-delete', { ids });
    ElMessage.success('已删除'); loadCards();
  } catch (e) { if (e !== 'cancel' && e !== 'close') ElMessage.error(e); }
}

onMounted(() => { loadCates(); loadCards(); });
</script>

<style scoped>
.ticket-home { padding: 0 20px 20px; }
.panel { margin-top: 16px; }
.card { background: #fff; border-radius: 8px; padding: 20px; }
.card-tabs { display: flex; gap: 8px; padding: 4px; background: #F2F3F5; border-radius: 8px; width: fit-content; }
.ctab { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; color: #4E5969; }
.ctab.active { background: #fff; color: #165DFF; font-weight: 500; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06); }
.form-tip { font-size: 12px; color: #86909C; line-height: 1.5; margin-top: 4px; }
.no-img { font-size: 12px; color: #C9CDD4; }
.price-cell { display: flex; flex-direction: column; }
.price-cell .sub { font-size: 12px; color: #86909C; }
.carousel-box { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.carousel-item { display: flex; align-items: center; gap: 6px; }
</style>
