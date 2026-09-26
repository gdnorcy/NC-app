<template>
  <div>
    <AppPageHeader title="门店管理" desc="1:1 nshop 创建门店三步（门店信息 / 业绩结算 / 权益分配），配额制创建">
      <template #default>
        <el-button type="primary" @click="openCreate">+ 创建门店</el-button>
        <el-button @click="ElMessage.info('批量导入门店（P1 排期，当前版本暂未开放）')">+ 批量导入门店</el-button>
      </template>
    </AppPageHeader>

    <el-card class="quota-tip" v-if="quota.remaining >= 0">
      <span>门店剩余可创建数量 <b>{{ quota.remaining }}</b>，当前已创建数量 <b>{{ quota.used }}</b></span>
      <el-button type="primary" link @click="$emit('go', 'buy')">立即购买数量</el-button>
    </el-card>

    <el-card>
      <!-- 筛选区（1:1 nshop：名称/类型/分组/标签/状态） -->
      <el-form inline class="filter-bar">
        <el-form-item label="门店名称"><el-input v-model="query.name" placeholder="请输入门店名称" clearable style="width:180px" @keyup.enter="load(1)" /></el-form-item>
        <el-form-item label="门店类型">
          <el-select v-model="query.type" placeholder="全部" clearable style="width:140px">
            <el-option label="直营店" value="直营店" />
            <el-option label="加盟店" value="加盟店" />
            <el-option label="联营店" value="联营店" />
          </el-select>
        </el-form-item>
        <el-form-item label="门店分组">
          <el-select v-model="query.categoryId" placeholder="全部" clearable style="width:150px">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="门店状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width:120px">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load(1)">搜索</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="list" size="default">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="门店" min-width="200">
          <template #default="{ row }">
            <div class="store-cell">
              <el-image v-if="row.logo" :src="resolveUrl(row.logo)" fit="cover" class="store-logo" />
              <div v-else class="store-logo store-logo-empty">{{ row.name.slice(0, 1) }}</div>
              <div>
                <div class="store-name">{{ row.name }}<el-tag v-if="row.type !== '直营店'" size="small" style="margin-left:6px">{{ row.type }}</el-tag></div>
                <div class="store-meta">{{ row.province }}{{ row.city }}{{ row.district }} {{ row.address }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="负责人" width="110">
          <template #default="{ row }">{{ row.owner_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="联系电话" width="130">
          <template #default="{ row }">{{ row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="门店分组" width="110">
          <template #default="{ row }">{{ row.categoryName || '-' }}</template>
        </el-table-column>
        <el-table-column label="门店标签" min-width="140">
          <template #default="{ row }">
            <template v-if="row.tags && row.tags.length">
              <el-tag v-for="t in row.tags" :key="t.id" size="small" style="margin-right:4px">{{ t.name }}</el-tag>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-switch :model-value="row.status === 1" @change="toggleStatus(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="建店时间" width="160" />
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="openGoods(row)">门店商品</el-button>
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination v-if="total > pageSize" class="pager" layout="prev, pager, next, total" :total="total" :page-size="pageSize" :current-page="page" @current-change="load" />
      <el-empty v-if="!loading && !list.length" description="暂无门店，点击右上角「创建门店」" :image-size="80" />
    </el-card>

    <!-- 门店商品配置（商城二期：门店价/门店库存/本店上下架） -->
    <StoreGoodsDrawer v-model:visible="goodsDrawer.show" :store-id="goodsDrawer.storeId" :store-name="goodsDrawer.storeName" />

    <!-- 创建/编辑门店：三步（门店信息 / 业绩结算 / 权益分配，1:1 nshop） -->
    <el-dialog v-model="dialog.show" :title="dialog.id ? '编辑门店' : '创建门店'" width="880px" top="4vh" destroy-on-close>
      <el-steps :active="step" finish-status="success" align-center class="steps">
        <el-step title="门店信息" />
        <el-step title="业绩结算" />
        <el-step title="权益分配" />
      </el-steps>

      <!-- 第一步：门店信息 -->
      <el-form v-show="step === 0" ref="form0" :model="form" :rules="rules0" label-width="140px" class="store-form">
        <el-form-item label="门店名称" prop="name"><el-input v-model="form.name" maxlength="20" show-word-limit placeholder="请输入门店名称（必填）" /></el-form-item>
        <el-form-item label="门店类型">
          <el-radio-group v-model="form.type">
            <el-radio value="直营店">直营店</el-radio>
            <el-radio value="加盟店">加盟店</el-radio>
            <el-radio value="联营店">联营店</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="门店LOGO">
          <div class="img-picker">
            <el-image v-if="form.logo" :src="resolveUrl(form.logo)" fit="cover" class="picker-img" :preview-src-list="[resolveUrl(form.logo)]" preview-teleported />
            <div v-else class="picker-img picker-empty" @click="openPicker('logo')"><el-icon><Plus /></el-icon></div>
            <div class="picker-tip">200×200 方形图（必填）</div>
          </div>
        </el-form-item>
        <el-form-item label="门店编号"><el-input v-model="form.number" maxlength="20" placeholder="请输入门店编号" /></el-form-item>
        <el-form-item label="门店分组">
          <el-select v-model="form.categoryId" placeholder="请选择门店分组" clearable style="width:100%">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="门店标签">
          <el-select v-model="form.tagIds" multiple placeholder="请选择门店标签" clearable style="width:100%">
            <el-option-group v-for="g in tagGroups" :key="g.id" :label="g.name">
              <el-option v-for="t in g.tags" :key="t.id" :label="t.name" :value="t.id" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="联系电话" prop="phone"><el-input v-model="form.phone" placeholder="请输入联系电话（必填）" /></el-form-item>
        <el-form-item label="所属区域" prop="region">
          <el-cascader v-model="region" :options="areaOptions" placeholder="省 / 市 / 区县（必选）" style="width:100%" clearable />
        </el-form-item>
        <el-form-item label="详细地址" prop="address"><el-input v-model="form.address" placeholder="请输入详细地址（必填）" /></el-form-item>
        <el-form-item label="营业时间">
          <el-radio-group v-model="form.businessTimeType">
            <el-radio value="all_day">全天</el-radio>
            <el-radio value="custom">自定义</el-radio>
          </el-radio-group>
          <el-input v-if="form.businessTimeType === 'custom'" v-model="form.businessTime" placeholder="如：09:00-18:00" style="width:200px;margin-top:6px" />
        </el-form-item>
        <el-form-item label="营业资质">
          <div class="license-row">
            <el-image v-for="(img, i) in form.licenseImgs" :key="i" :src="resolveUrl(img)" fit="cover" class="license-img" :preview-src-list="form.licenseImgs.map(resolveUrl)" preview-teleported @click.prevent />
            <div v-if="form.licenseImgs.length < 10" class="license-img license-add" @click="openPicker('license')"><el-icon><Plus /></el-icon></div>
            <span class="picker-tip">≤10 张，建议 210×150</span>
          </div>
        </el-form-item>
        <el-form-item label="营业资质显示">
          <el-radio-group v-model="form.licenseShow">
            <el-radio :value="1">显示</el-radio>
            <el-radio :value="0">隐藏</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="其他备注"><el-input v-model="form.remark" type="textarea" :rows="2" placeholder="请输入备注信息" /></el-form-item>
        <el-form-item label="门店状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">启用</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-divider content-position="left">负责人信息（门店超管 · 统一账号体系）</el-divider>
        <el-form-item label="负责人来源" prop="ownerMode">
          <el-radio-group v-model="form.ownerMode">
            <el-radio value="new">新建负责人账号</el-radio>
            <el-radio value="existing">选择已有成员</el-radio>
          </el-radio-group>
          <p class="field-tip">负责人将获得「门店管理员」角色，使用登录账号进入后台</p>
        </el-form-item>
        <template v-if="form.ownerMode === 'new'">
          <el-form-item label="负责人姓名" prop="ownerName"><el-input v-model="form.ownerName" maxlength="20" placeholder="请输入负责人姓名" /></el-form-item>
          <el-form-item label="登录账号" prop="ownerPhone"><el-input v-model="form.ownerPhone" placeholder="手机号（即登录账号）" /></el-form-item>
          <el-form-item label="登录密码" prop="ownerPassword"><el-input v-model="form.ownerPassword" placeholder="至少 6 位" show-password /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="选择成员" prop="ownerMemberId">
            <el-select v-model="form.ownerMemberId" filterable placeholder="从本租户成员中选择负责人" style="width: 100%">
              <el-option v-for="m in memberOptions" :key="m.id" :label="`${m.name || m.username}（${m.username}${m.phone ? ' / ' + m.phone : ''}）`" :value="m.id" />
            </el-select>
            <p class="field-tip">未找到目标成员？可先到「系统设置 → 成员管理」添加</p>
          </el-form-item>
        </template>
      </el-form>

      <!-- 第二步：业绩结算 -->
      <el-form v-show="step === 1" label-width="140px" class="store-form">
        <el-form-item label="结算时间">
          <el-radio-group v-model="form.settleType">
            <el-radio value="immediate">订单完成后立即结算</el-radio>
            <el-radio value="days">订单完成后
              <el-input-number v-model="form.settleDays" :min="1" :max="90" size="small" style="width:90px" /> 天结算
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="提现抽成">
          <el-radio-group v-model="form.withdrawRatioType">
            <el-radio value="system">跟随系统设置</el-radio>
            <el-radio value="custom">自定义
              <el-input-number v-model="form.withdrawRatio" :min="0" :max="100" size="small" style="width:90px" /> %
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="门店提现">
          <el-radio-group v-model="form.withdrawEnabled">
            <el-radio :value="1">支持</el-radio>
            <el-radio :value="0">不支持</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <!-- 第三步：权益分配 -->
      <el-form v-show="step === 2" label-width="150px" class="store-form">
        <el-form-item label="商品售价">
          <el-radio-group v-model="form.priceMode">
            <el-radio value="unified">总部统一价格</el-radio>
            <el-radio value="custom">门店自定义售价</el-radio>
          </el-radio-group>
          <div class="form-tip">门店不能修改商品售卖价</div>
        </el-form-item>
        <el-form-item label="商品库存">
          <el-radio-group v-model="form.stockMode">
            <el-radio value="unified">总部统一库存</el-radio>
            <el-radio value="independent">门店独立库存</el-radio>
          </el-radio-group>
          <div class="form-tip">门店增加库存时总部库存会对应扣除</div>
        </el-form-item>
        <el-form-item label="商品下架">
          <el-radio-group v-model="form.shelfMode">
            <el-radio value="unified">总部统一状态</el-radio>
            <el-radio value="store">支持门店下架</el-radio>
          </el-radio-group>
          <div class="form-tip">商品状态跟随总部</div>
        </el-form-item>
        <el-form-item label="后台确认付款">
          <el-radio-group v-model="form.confirmPayEnabled">
            <el-radio :value="1">支持</el-radio>
            <el-radio :value="0">不支持</el-radio>
          </el-radio-group>
          <div class="form-tip">门店端订单管理不显示确认付款按钮</div>
        </el-form-item>
        <el-form-item label="门店配送设置">
          <el-radio-group v-model="form.deliveryMode">
            <el-radio value="head">总部为门店配置</el-radio>
            <el-radio value="store">门店独立配置</el-radio>
          </el-radio-group>
          <div class="form-tip">同城配送需总部在门店管理-操作中设置；快递配送读取总部设置的商品快递运费</div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button v-if="step > 0" @click="step--">上一步</el-button>
        <el-button v-if="step < 2" type="primary" @click="nextStep">下一步</el-button>
        <el-button v-else type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button @click="dialog.show = false">取消</el-button>
      </template>
    </el-dialog>

    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import MaterialPicker from '../apps/design/MaterialPicker.vue';
import StoreGoodsDrawer from './StoreGoodsDrawer.vue';
import { AREA_DATA_FULL } from '../goods/area-data-full.js';

const props = defineProps({ openCreate: { type: Number, default: 0 } });

defineEmits(['go']);

const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const loading = ref(false);
const categories = ref([]);
const tagGroups = ref([]);
const quota = ref({ quota: 50, used: 0, remaining: 50 });
const query = reactive({ name: '', type: '', categoryId: '', status: '' });
const dialog = ref({ show: false, id: null });
const step = ref(0);
const saving = ref(false);
const goodsDrawer = ref({ show: false, storeId: 0, storeName: '' });
const picker = ref({ show: false, target: '' });

// 省市区三级数据（全国区划，格式 [ {label,value,children} ]）
const areaOptions = AREA_DATA_FULL;
const region = ref([]);

const emptyForm = () => ({
  id: null, name: '', type: '直营店', logo: '', number: '', categoryId: null, tagIds: [],
  phone: '', address: '', businessTimeType: 'all_day', businessTime: '', licenseImgs: [], licenseShow: 1,
  remark: '', status: 1, ownerMode: 'new', ownerName: '', ownerPhone: '', ownerPassword: '', ownerMemberId: null,
  settleType: 'immediate', settleDays: 0, withdrawRatioType: 'system', withdrawRatio: 0, withdrawEnabled: 1,
  priceMode: 'unified', stockMode: 'unified', shelfMode: 'unified', confirmPayEnabled: 1, deliveryMode: 'head',
});
const form = reactive(emptyForm());
const memberOptions = ref([]);

const rules0 = {
  name: [{ required: true, message: '请输入门店名称', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
  region: [{ required: true, message: '请选择所属区域（省/市/区县）', trigger: 'change' }],
  address: [{ required: true, message: '请输入详细地址', trigger: 'blur' }],
  ownerName: [{ required: true, message: '请输入负责人姓名', trigger: 'blur' }],
  ownerPhone: [{ required: true, message: '请输入负责人手机号', trigger: 'blur' }],
  ownerPassword: [{ required: true, message: '请输入登录密码', trigger: 'blur' }],
  ownerMemberId: [{ required: true, message: '请选择负责人成员', trigger: 'change' }],
};

function resolveUrl(u) { return u || ''; }

async function load(p) {
  if (p) page.value = p;
  loading.value = true;
  try {
    const r = await customerApiCall.get('/store', { params: { ...query, page: page.value, pageSize } });
    list.value = r.list || [];
    total.value = r.total || 0;
  } catch (e) {
    ElMessage.error(e || '门店列表加载失败');
  } finally {
    loading.value = false;
  }
}
function reset() { Object.assign(query, { name: '', type: '', categoryId: '', status: '' }); load(1); }

async function loadRefs() {
  try {
    const [c, t, q, m] = await Promise.all([
      customerApiCall.get('/store/categories'),
      customerApiCall.get('/store/tag-groups'),
      customerApiCall.get('/store/quota'),
      customerApiCall.get('/members').catch(() => ({ members: [] })),
    ]);
    categories.value = c.list || [];
    tagGroups.value = t.list || [];
    quota.value = q || quota.value;
    memberOptions.value = (m.members || []).map((x) => ({ id: x.id, name: x.name || x.username, username: x.username, phone: x.phone }));
  } catch (e) { /* 下拉数据失败不阻断列表 */ }
}

function openGoods(row) { goodsDrawer.value = { show: true, storeId: row.id, storeName: row.name }; }

function openCreate() {
  Object.assign(form, emptyForm());
  region.value = [];
  dialog.value = { show: true, id: null };
  step.value = 0;
}
function openEdit(row) {
  Object.assign(form, {
    id: row.id, name: row.name, type: row.type, logo: row.logo, number: row.number,
    categoryId: row.category_id, tagIds: (row.tags || []).map((t) => t.id),
    phone: row.phone, address: row.address, businessTimeType: row.business_time_type, businessTime: row.business_time,
    licenseImgs: row.licenseImgs || [], licenseShow: row.license_show, remark: row.remark, status: row.status,
    ownerMode: row.owner_member_id ? 'existing' : 'new',
    ownerName: row.owner_name, ownerPhone: row.owner_account || '', ownerPassword: '', ownerMemberId: row.owner_member_id || null,
    settleType: row.settle_type, settleDays: row.settle_days, withdrawRatioType: row.withdraw_ratio_type,
    withdrawRatio: row.withdraw_ratio, withdrawEnabled: row.withdraw_enabled, priceMode: row.price_mode,
    stockMode: row.stock_mode, shelfMode: row.shelf_mode, confirmPayEnabled: row.confirm_pay_enabled, deliveryMode: row.delivery_mode,
  });
  region.value = [row.province, row.city, row.district].filter(Boolean);
  dialog.value = { show: true, id: row.id };
  step.value = 0;
}

async function nextStep() {
  if (step.value === 0) {
    if (!form.name) return ElMessage.warning('请输入门店名称');
    if (!form.phone) return ElMessage.warning('请输入联系电话');
    if (!region.value.length) return ElMessage.warning('请选择所属区域（省/市/区县）');
    if (!form.address) return ElMessage.warning('请输入详细地址');
    if (form.ownerMode === 'new') {
      if (!form.ownerName) return ElMessage.warning('请输入负责人姓名');
      if (!/^1\d{10}$/.test(form.ownerPhone || '')) return ElMessage.warning('请输入正确的负责人手机号');
      if (!form.ownerPassword || form.ownerPassword.length < 6) return ElMessage.warning('负责人登录密码至少 6 位');
    } else if (!form.ownerMemberId) {
      return ElMessage.warning('请选择负责人成员');
    }
  }
  step.value++;
}

async function save() {
  if (!form.name) return ElMessage.warning('请输入门店名称');
  if (!form.logo) return ElMessage.warning('请上传门店LOGO（200×200 方形图，必填）');
  if (!form.phone) return ElMessage.warning('请输入联系电话');
  if (!region.value.length) return ElMessage.warning('请选择所属区域（省/市/区县）');
  if (!form.address) return ElMessage.warning('请输入详细地址');
  if (form.ownerMode === 'new') {
    if (!form.ownerName) return ElMessage.warning('请输入负责人姓名');
    if (!/^1\d{10}$/.test(form.ownerPhone || '')) return ElMessage.warning('请输入正确的负责人手机号');
    if (!form.ownerPassword || form.ownerPassword.length < 6) return ElMessage.warning('负责人登录密码至少 6 位');
  } else if (!form.ownerMemberId) {
    return ElMessage.warning('请选择负责人成员');
  }
  saving.value = true;
  const payload = {
    ...form,
    province: region.value[0] || '', city: region.value[1] || '', district: region.value[2] || '',
    ownerAccount: undefined, ownerPassword: undefined,
  };
  delete payload.id;
  try {
    if (dialog.value.id) {
      await customerApiCall.put(`/store/${dialog.value.id}`, payload);
      ElMessage.success('门店已更新');
    } else {
      await customerApiCall.post('/store', payload);
      ElMessage.success('门店创建成功');
    }
    dialog.value.show = false;
    load();
    loadRefs();
  } catch (e) {
    ElMessage.error(e || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row) {
  try {
    await customerApiCall.put(`/store/${row.id}/status`, { status: row.status !== 1 });
    row.status = row.status === 1 ? 0 : 1;
    ElMessage.success(row.status ? '门店已启用' : '门店已禁用');
  } catch (e) {
    ElMessage.error(e || '操作失败');
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除门店「${row.name}」？删除后不可恢复`, '删除确认', { type: 'warning' });
    await customerApiCall.delete(`/store/${row.id}`);
    ElMessage.success('已删除');
    load();
    loadRefs();
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') ElMessage.error(e || '删除失败');
  }
}

function openPicker(target) { picker.value = { show: true, target }; }
function onPickImg(url) {
  if (picker.value.target === 'logo') form.logo = url;
  else if (picker.value.target === 'license') form.licenseImgs.push(url);
  else if (picker.value.target === 'edit-license') form.licenseImgs[picker.value.targetIdx] = url;
}

onMounted(() => { load(); loadRefs(); });
// 父级联动信号（门店统计「创建门店」→ 打开创建弹窗）；模块级记录已处理信号，防 Tab 重建误触发
let lastHandledCreate = 0;
watch(() => props.openCreate, (v) => {
  if (v && v !== lastHandledCreate) { lastHandledCreate = v; openCreate(); }
}, { immediate: true });
</script>

<style scoped>
.quota-tip { margin-bottom: 16px; font-size: 14px; color: #4e5969; }
.filter-bar { margin-bottom: 8px; }
.store-cell { display: flex; align-items: center; gap: 10px; }
.store-logo { width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0; }
.store-logo-empty { background: rgba(22, 93, 255, 0.08); color: #165dff; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.store-name { font-size: 14px; color: #1d2129; font-weight: 500; }
.store-meta { font-size: 12px; color: #86909c; margin-top: 2px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.steps { margin-bottom: 24px; }
.store-form { min-height: 380px; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.picker-img { width: 80px; height: 80px; border-radius: 8px; border: 1px dashed #dcdfe6; flex-shrink: 0; }
.picker-empty { display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer; }
.picker-tip { font-size: 12px; color: #86909c; }
.license-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.license-img { width: 70px; height: 50px; border-radius: 6px; border: 1px dashed #dcdfe6; object-fit: cover; }
.license-add { display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer; }
.form-tip { font-size: 12px; color: #86909c; width: 100%; margin-top: 4px; }
</style>
