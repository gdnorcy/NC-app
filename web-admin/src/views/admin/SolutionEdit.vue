<template>
  <div class="page">
    <div class="page-card">
      <div class="page-header">
        <div class="header-left">
          <el-button text @click="$router.back()">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          <div>
            <h2 class="page-title">{{ isNew ? '新建解决方案' : form.name || '编辑解决方案' }}</h2>
            <p class="page-desc">基础设置 / 价格设置 / 权限设置，保存后统一生效</p>
          </div>
        </div>
        <el-button type="primary" :loading="saving" @click="saveAll">
          <el-icon style="margin-right: 4px"><Check /></el-icon>保存
        </el-button>
      </div>

      <el-tabs v-model="activeTab">
        <!-- ============ 基础设置 ============ -->
        <el-tab-pane label="基础设置" name="basic">
          <el-form :model="form" label-width="130px" class="basic-form">
            <div class="form-section-title">基本信息</div>
            <el-form-item label="解决方案" required>
              <el-input v-model="form.name" placeholder="如：智能名片系统" style="max-width: 420px" />
            </el-form-item>
            <el-form-item label="唯一标识" :required="isNew">
              <el-input v-model="form.code" placeholder="如：card（新建后不可修改）" :disabled="!isNew" style="max-width: 420px" />
              <div class="form-help">系统内部识别码，建议英文小写，创建后不可修改</div>
            </el-form-item>
            <el-form-item label="所属分类">
              <el-select v-model="form.categoryId" placeholder="选择分类" clearable style="width: 280px">
                <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="是否上架">
              <el-radio-group v-model="form.status">
                <el-radio value="on">上架</el-radio>
                <el-radio value="off">下架</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="是否热门">
              <el-radio-group v-model="form.isHot">
                <el-radio :value="true">是</el-radio>
                <el-radio :value="false">否</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="默认平台">
              <el-radio-group v-model="form.defaultPlatform" class="platform-group">
                <el-radio v-for="p in platforms" :key="p.value" :value="p.value">{{ p.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="图标">
              <div class="icon-picker">
                <div
                  v-for="ic in iconOptions"
                  :key="ic.value"
                  class="icon-option"
                  :class="{ active: form.icon === ic.value }"
                  @click="form.icon = ic.value"
                >
                  <SIcon :name="ic.value" size="default" />
                </div>
              </div>
              <div class="form-help">不选择则显示默认图标</div>
            </el-form-item>
            <el-form-item label="方案简介">
              <el-input v-model="form.description" type="textarea" :rows="3" maxlength="200" show-word-limit style="max-width: 520px" />
            </el-form-item>
            <el-form-item label="使用项目数">
              <div class="use-count">
                <el-input-number v-model="form.virtualUseCount" :min="0" :max="99999" style="width: 160px" />
                <span class="form-help" style="margin-left: 8px">虚拟数 + 实际数 = 对外展示使用项目数</span>
              </div>
            </el-form-item>

            <div class="form-section-title">方案内容</div>
            <el-form-item label="方案内容">
              <el-radio-group v-model="contentType" disabled>
                <el-radio value="system">系统</el-radio>
                <el-radio value="custom">自定义</el-radio>
                <el-radio value="empty">空</el-radio>
              </el-radio-group>
              <div class="form-help">当前版本固定为「系统」，自定义内容将在后续版本开放</div>
            </el-form-item>
            <el-form-item label="预览图">
              <el-upload
                list-type="picture-card"
                :file-list="previewFileList"
                :http-request="doUpload"
                :on-remove="onPreviewRemove"
                accept="image/*"
              >
                <el-icon><Plus /></el-icon>
              </el-upload>
              <div class="form-help">建议上传 3~6 张方案界面截图，用于应用中心卡片展示</div>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- ============ 价格设置 ============ -->
        <el-tab-pane label="价格设置" name="pricing">
          <div class="pricing-panel">
            <div class="pricing-header">
              <div class="pricing-title">价格设置</div>
              <el-button size="small" @click="addPricingRow"><el-icon style="margin-right: 4px"><Plus /></el-icon>新增规格</el-button>
            </div>
            <div class="pricing-table">
              <div class="pricing-row pricing-head">
                <span class="col-month">时长</span>
                <span class="col-price">代理价格（元）</span>
                <span class="col-price">用户价格（元）</span>
                <span class="col-price">续费价格（元）</span>
                <span class="col-op">操作</span>
              </div>
              <div v-for="(row, idx) in pricing" :key="idx" class="pricing-row">
                <span class="col-month">
                  <el-input-number v-model="row.durationMonths" :min="1" :max="120" controls-position="right" style="width: 120px" />
                  <span class="month-unit">月</span>
                </span>
                <span class="col-price"><el-input-number v-model="row.agentPrice" :min="0" :precision="2" controls-position="right" style="width: 130px" /><span class="price-unit">元</span></span>
                <span class="col-price"><el-input-number v-model="row.userPrice" :min="0" :precision="2" controls-position="right" style="width: 130px" /><span class="price-unit">元</span></span>
                <span class="col-price"><el-input-number v-model="row.renewPrice" :min="0" :precision="2" controls-position="right" style="width: 130px" /><span class="price-unit">元</span></span>
                <span class="col-op"><el-button size="small" text type="danger" @click="removePricingRow(idx)">删除</el-button></span>
              </div>
              <el-empty v-if="!pricing.length" description="暂无价格规格，点击「新增规格」添加" :image-size="60" />
            </div>
            <div class="perpetual-panel">
              <el-checkbox v-model="perpetualEnabled" @change="onPerpetualChange">启用永久价格</el-checkbox>
              <div v-if="perpetualEnabled" class="perpetual-row">
                <span class="perpetual-label">永久价格：</span>
                <span class="col-price"><el-input-number v-model="perpetual.agentPrice" :min="0" :precision="2" controls-position="right" style="width: 130px" /><span class="price-unit">元</span></span>
                <span class="perpetual-sub">代理</span>
                <span class="col-price"><el-input-number v-model="perpetual.userPrice" :min="0" :precision="2" controls-position="right" style="width: 130px" /><span class="price-unit">元</span></span>
                <span class="perpetual-sub">用户</span>
                <span class="col-price"><el-input-number v-model="perpetual.renewPrice" :min="0" :precision="2" controls-position="right" style="width: 130px" /><span class="price-unit">元</span></span>
                <span class="perpetual-sub">续费</span>
              </div>
              <div class="form-help" style="margin-top: 8px">开启后提供「永久买断」选项，时长规格与永久价格可同时存在</div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ============ 权限设置 ============ -->
        <el-tab-pane label="权限设置" name="permissions">
          <div class="perm-panel">
            <div class="perm-header">
              <div>
                <div class="perm-title">权限设置</div>
                <div class="form-help">设置解决方案对应的功能权限</div>
              </div>
              <div class="perm-mode">
                <el-radio-group v-model="allPermissions" @change="onModeChange">
                  <el-radio :value="false">自定义</el-radio>
                  <el-radio :value="true">全部</el-radio>
                </el-radio-group>
                <div class="form-help" v-if="allPermissions">选择全部则默认以后新出的功能也全部勾选</div>
              </div>
            </div>

            <template v-if="!allPermissions">
              <div class="perm-tools">
                <el-checkbox :model-value="allChecked" :indeterminate="someChecked" @change="toggleAllChecked">
                  全部勾选（勾选指当前所有功能全部勾选，不包含以后新出的功能）
                </el-checkbox>
              </div>
              <div v-for="group in permissionGroups" :key="group.module" class="perm-group">
                <div class="perm-group-title">{{ group.label }}</div>
                <div class="perm-items">
                  <el-checkbox
                    v-for="p in group.items"
                    :key="p.key"
                    v-model="p.enabled"
                  >{{ p.label }}</el-checkbox>
                </div>
              </div>
              <el-empty v-if="!permissionGroups.length" description="暂无可配置的权限点" :image-size="60" />
            </template>
            <el-alert v-else type="info" :closable="false" show-icon title="已启用「全部」模式：当前与未来新增功能权限全部开放给使用该方案的租户" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check, Plus } from '@element-plus/icons-vue';
import SIcon from '../../components/SIcon.vue';
import { fetchSolutions, createSolution, updateSolution, saveSolutionPricing, saveSolutionPermissions, fetchSolutionCategories, uploadImage } from '../../api';

const platforms = [
  { value: 'mini', label: '微信小程序' },
  { value: 'baidu', label: '百度小程序' },
  { value: 'ali', label: '支付宝小程序' },
  { value: 'qq', label: 'QQ小程序' },
  { value: 'pc', label: 'PC网站' },
  { value: 'h5', label: 'H5应用' },
  { value: 'tt', label: '字节跳动小程序' },
  { value: 'mp', label: '公众号' },
];

const iconOptions = [
  { value: 'panorama', label: '全景' },
  { value: 'card', label: '名片' },
  { value: 'devices', label: '多端' },
  { value: 'template', label: '模板' },
  { value: 'market', label: '集市' },
  { value: 'chart', label: '数据' },
  { value: 'building', label: '企业' },
  { value: 'dynamic', label: '动态' },
];

export default {
  components: { SIcon, ArrowLeft, Check, Plus },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const solutionId = computed(() => Number(route.params.id) || null);
    const isNew = computed(() => !solutionId.value);

    const categories = ref([]);
    const activeTab = ref('basic');
    const saving = ref(false);
    const contentType = ref('system');
    const previewFileList = ref([]);

    const form = reactive({
      name: '', code: '', categoryId: null, status: 'on', isHot: false,
      defaultPlatform: 'h5', icon: 'template', description: '', virtualUseCount: 0,
      previewImages: [],
    });
    const pricing = ref([]);
    const perpetualEnabled = ref(false);
    const perpetual = reactive({ agentPrice: 0, userPrice: 0, renewPrice: 0 });
    const allPermissions = ref(false);
    const permissions = ref([]);

    const permissionGroups = computed(() => {
      const map = {};
      permissions.value.forEach((p) => {
        if (!map[p.module]) map[p.module] = { module: p.module, label: p.moduleLabel || p.module, items: [] };
        map[p.module].items.push(p);
      });
      return Object.values(map);
    });
    const allChecked = computed(() => permissions.value.length > 0 && permissions.value.every((p) => p.enabled));
    const someChecked = computed(() => permissions.value.some((p) => p.enabled));

    const load = async () => {
      try {
        categories.value = (await fetchSolutionCategories()).categories || [];
        if (isNew.value) return;
        const { solutions } = await fetchSolutions();
        const s = solutions.find((x) => x.id === solutionId.value);
        if (!s) { ElMessage.error('解决方案不存在'); return; }
        Object.assign(form, {
          name: s.name, code: s.code, categoryId: s.categoryId, status: s.status, isHot: s.isHot,
          defaultPlatform: s.defaultPlatform, icon: s.icon, description: s.description,
          virtualUseCount: s.virtualUseCount, previewImages: s.previewImages || [],
        });
        pricing.value = (s.pricing || []).filter((p) => p.durationMonths > 0).map((p) => ({ ...p }));
        const permRow = (s.pricing || []).find((p) => p.durationMonths === 0);
        if (permRow) {
          perpetualEnabled.value = true;
          Object.assign(perpetual, { agentPrice: permRow.agentPrice, userPrice: permRow.userPrice, renewPrice: permRow.renewPrice });
        }
        allPermissions.value = !!s.allPermissions;
        permissions.value = (s.permissions || []).map((p) => ({ module: p.module, moduleLabel: p.module_label, key: p.key, label: p.label, enabled: !!p.enabled }));
        previewFileList.value = (s.previewImages || []).map((url, i) => ({ name: `预览${i + 1}`, url }));
      } catch (e) {
        ElMessage.error(e);
      }
    };

    // —— 价格 ——
    const addPricingRow = () => {
      pricing.value.push({ durationMonths: 12, agentPrice: 0, userPrice: 0, renewPrice: 0 });
    };
    const removePricingRow = (idx) => pricing.value.splice(idx, 1);
    const onPerpetualChange = (val) => {
      if (!val) perpetualEnabled.value = false;
    };

    // —— 权限 ——
    const onModeChange = (val) => {
      if (val) {
        permissions.value.forEach((p) => { p.enabled = true; });
      }
    };
    const toggleAllChecked = (val) => {
      permissions.value.forEach((p) => { p.enabled = !!val; });
    };

    // —— 预览图 ——
    const doUpload = async (opt) => {
      try {
        const res = await uploadImage(opt.file);
        const url = res.path || res.previewPath || res;
        form.previewImages.push(url);
        previewFileList.value.push({ name: `预览${previewFileList.value.length + 1}`, url });
        opt.onSuccess(url);
      } catch (e) {
        ElMessage.error(e);
        opt.onError(e);
      }
    };
    const onPreviewRemove = (file) => {
      form.previewImages = form.previewImages.filter((u) => u !== file.url);
    };

    // —— 保存 ——
    const saveAll = async () => {
      if (!form.name.trim()) return ElMessage.warning('请输入解决方案名称');
      if (isNew.value && !form.code.trim()) return ElMessage.warning('请输入唯一标识');
      saving.value = true;
      try {
        let id = solutionId.value;
        const baseData = {
          name: form.name, code: form.code, categoryId: form.categoryId, status: form.status,
          isHot: form.isHot, defaultPlatform: form.defaultPlatform, icon: form.icon,
          description: form.description, virtualUseCount: form.virtualUseCount, previewImages: form.previewImages,
        };
        if (isNew.value) {
          const res = await createSolution(baseData);
          id = res.solution.id;
        } else {
          await updateSolution(id, baseData);
        }
        // 价格（含永久行：durationMonths=0）
        const allPricing = pricing.value.map((p) => ({
          durationMonths: p.durationMonths, agentPrice: p.agentPrice, userPrice: p.userPrice, renewPrice: p.renewPrice,
        }));
        if (perpetualEnabled.value) {
          allPricing.push({ durationMonths: 0, agentPrice: perpetual.agentPrice, userPrice: perpetual.userPrice, renewPrice: perpetual.renewPrice });
        }
        await saveSolutionPricing(id, { pricing: allPricing });
        // 权限
        await saveSolutionPermissions(id, { permissions: permissions.value, allPermissions: allPermissions.value });
        ElMessage.success('保存成功');
        if (isNew.value) router.replace(`/solutions/${id}/edit`);
      } catch (e) {
        ElMessage.error(e);
      } finally {
        saving.value = false;
      }
    };

    onMounted(load);
    return {
      isNew, solutionId, categories, activeTab, saving, contentType, previewFileList, form,
      pricing, perpetualEnabled, perpetual, allPermissions, permissions,
      permissionGroups, allChecked, someChecked, platforms, iconOptions,
      addPricingRow, removePricingRow, onPerpetualChange, onModeChange, toggleAllChecked,
      doUpload, onPreviewRemove, saveAll,
    };
  },
};
</script>

<style scoped>
.page { padding: 20px; }
.page-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.header-left { display: flex; align-items: center; gap: 8px; }
.page-title { font-size: 18px; font-weight: 600; color: #1D2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909C; margin: 4px 0 0; }
.form-section-title { font-size: 14px; font-weight: 600; color: #1D2129; padding: 12px 0 8px; border-bottom: 1px solid #F2F3F5; margin-bottom: 16px; }
.basic-form :deep(.el-form-item) { margin-bottom: 18px; }
.form-help { font-size: 12px; color: #86909C; line-height: 1.5; margin-top: 4px; }
.platform-group { display: flex; flex-wrap: wrap; }
.platform-group :deep(.el-radio) { margin-right: 16px; margin-bottom: 8px; }
.icon-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.icon-option { width: 40px; height: 40px; border: 1px solid #E5E6EB; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #4E5969; transition: all 0.2s; }
.icon-option:hover { border-color: #165DFF; color: #165DFF; }
.icon-option.active { border-color: #165DFF; background: #E8F3FF; color: #165DFF; }
.use-count { display: flex; align-items: center; }

/* 价格 */
.pricing-panel { max-width: 860px; }
.pricing-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.pricing-title { font-size: 15px; font-weight: 600; color: #1D2129; }
.pricing-table { border: 1px solid #E5E6EB; border-radius: 8px; overflow: hidden; }
.pricing-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #F2F3F5; }
.pricing-row:last-child { border-bottom: none; }
.pricing-head { background: #F7F8FA; font-size: 12px; color: #4E5969; font-weight: 500; }
.col-month { flex: 0 0 190px; display: flex; align-items: center; gap: 6px; }
.col-price { flex: 1 1 0; display: flex; align-items: center; gap: 6px; min-width: 0; }
.col-op { flex: 0 0 60px; text-align: right; }
.month-unit, .price-unit { font-size: 12px; color: #86909C; }
.perpetual-panel { margin-top: 16px; padding: 14px 16px; background: #F7F8FA; border-radius: 8px; }
.perpetual-row { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.perpetual-label { font-size: 13px; font-weight: 500; color: #1D2129; }
.perpetual-sub { font-size: 12px; color: #4E5969; }

/* 权限 */
.perm-panel { max-width: 900px; }
.perm-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; }
.perm-title { font-size: 15px; font-weight: 600; color: #1D2129; }
.perm-mode { text-align: right; }
.perm-tools { padding: 10px 12px; background: #F7F8FA; border-radius: 8px; margin-bottom: 16px; }
.perm-group { margin-bottom: 18px; }
.perm-group-title { font-size: 13px; font-weight: 600; color: #1D2129; padding-bottom: 8px; border-bottom: 1px solid #F2F3F5; margin-bottom: 10px; }
.perm-items { display: flex; flex-wrap: wrap; gap: 4px 24px; }
.perm-items :deep(.el-checkbox) { margin-right: 0; }
</style>
