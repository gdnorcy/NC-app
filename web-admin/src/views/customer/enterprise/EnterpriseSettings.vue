<template>
  <div class="ent-settings">
    <div class="page-header">
      <div>
        <h2 class="page-title">企业设置</h2>
        <p class="page-desc">企业品牌信息、员工加入口令、公海回流规则</p>
      </div>
      <button class="btn-primary" :loading="saving" @click="save">保存</button>
    </div>

    <div class="form-card">
      <div class="form-section">
        <div class="section-title">企业品牌</div>
        <el-form :model="form" label-width="100px" class="ent-form">
          <el-form-item label="企业名称" required>
            <el-input v-model="form.name" maxlength="64" placeholder="企业名称" />
          </el-form-item>
          <el-form-item label="企业Logo">
            <div class="logo-row">
              <div class="logo-preview" v-if="form.logo">
                <img :src="form.logo" alt="logo" />
              </div>
              <div class="logo-preview placeholder" v-else>企</div>
              <el-input v-model="form.logo" placeholder="Logo 图片 URL" clearable class="logo-input" />
            </div>
          </el-form-item>
          <el-form-item label="行业">
            <el-input v-model="form.industry" maxlength="64" placeholder="如：企业服务" />
          </el-form-item>
          <el-form-item label="规模">
            <el-select v-model="form.scale" placeholder="企业规模" clearable style="width: 200px;">
              <el-option label="1-20人" value="1-20人" />
              <el-option label="21-50人" value="21-50人" />
              <el-option label="51-100人" value="51-100人" />
              <el-option label="100人以上" value="100人以上" />
            </el-select>
          </el-form-item>
          <el-form-item label="企业简介">
            <el-input v-model="form.description" type="textarea" :rows="3" maxlength="512" placeholder="企业简介（选填）" />
          </el-form-item>
        </el-form>
      </div>

      <el-divider />

      <div class="form-section">
        <div class="section-title">员工加入口令</div>
        <p class="section-desc">员工在 C 端入驻时可凭口令加入本企业（口令在后续 C 端接入中生效，先用于管理侧标识）</p>
        <div class="invite-row">
          <el-input :model-value="form.inviteCode || '未生成'" readonly class="invite-input" />
          <el-button @click="genInvite">重新生成</el-button>
        </div>
      </div>

      <el-divider />

      <div class="form-section">
        <div class="section-title">公海回流规则</div>
        <el-form label-width="100px">
          <el-form-item label="自动回流">
            <el-switch v-model="form.autoRecycle" />
            <span class="switch-hint">{{ form.autoRecycle ? '员工离职/停用时，名下客户自动回收至本企业公海' : '员工离职/停用时，客户由管理员手动处理' }}</span>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';

const form = ref({ name: '', logo: '', industry: '', scale: '', description: '', inviteCode: '', autoRecycle: false });
const saving = ref(false);

async function load() {
  try {
    const res = await customerApiCall.get('/enterprise/config');
    form.value = { ...res.config };
  } catch (e) { ElMessage.error(e || '加载失败'); }
}
async function save() {
  if (!form.value.name) return ElMessage.warning('请填写企业名称');
  saving.value = true;
  try {
    await customerApiCall.put('/enterprise/config', {
      name: form.value.name, logo: form.value.logo, industry: form.value.industry,
      scale: form.value.scale, description: form.value.description, autoRecycle: form.value.autoRecycle,
    });
    ElMessage.success('保存成功');
    load();
  } catch (e) { ElMessage.error(e || '保存失败'); }
  finally { saving.value = false; }
}
async function genInvite() {
  try {
    const res = await customerApiCall.post('/enterprise/invite-code');
    form.value.inviteCode = res.inviteCode;
    ElMessage.success('已生成新口令');
  } catch (e) { ElMessage.error(e || '操作失败'); }
}

onMounted(load);
</script>

<style scoped>
.ent-settings { display: flex; flex-direction: column; gap: 16px; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0; }
.page-desc { font-size: 13px; color: #86909c; margin: 4px 0 0; }
.btn-primary { background: #165dff; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-size: 14px; cursor: pointer; transition: opacity 0.2s; }
.btn-primary:hover { opacity: 0.85; }
.form-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.ent-form { max-width: 560px; }
.section-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 16px; }
.section-desc { font-size: 12px; color: #86909c; margin: -8px 0 16px; }
.logo-row { display: flex; align-items: center; gap: 12px; width: 100%; }
.logo-preview { width: 44px; height: 44px; border-radius: 8px; overflow: hidden; flex-shrink: 0; }
.logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.logo-preview.placeholder { background: rgba(22,93,255,0.08); color: #165dff; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; }
.logo-input { flex: 1; }
.invite-row { display: flex; gap: 12px; max-width: 400px; }
.invite-input { flex: 1; }
.switch-hint { margin-left: 12px; font-size: 12px; color: #86909c; }
</style>
