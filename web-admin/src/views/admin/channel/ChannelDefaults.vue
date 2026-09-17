<template>
  <div>
    <div v-if="!embedded" class="page-header">
      <el-button @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <h2 class="page-title">平台默认配置</h2>
      <el-button type="primary" @click="save" :loading="saving" style="margin-left:auto;">保存配置</el-button>
    </div>
    <div v-else style="display:flex;justify-content:flex-end;margin-bottom:16px;">
      <el-button type="primary" @click="save" :loading="saving">保存配置</el-button>
    </div>

    <el-alert type="info" :closable="false" style="margin-bottom:16px;">
      平台级默认配置用于未开通独立渠道的客户。开通独立渠道的客户使用自己的配置。
    </el-alert>

    <div class="page-card">
      <h3 style="margin-bottom:16px;">微信小程序（平台统一）</h3>
      <el-form :model="defaultsForm.mini" label-width="170px">
        <el-form-item label="平台小程序AppID">
          <el-input v-model="defaultsForm.mini.appid" placeholder="未开通独立小程序的客户共用" />
        </el-form-item>
        <el-form-item label="平台小程序路径">
          <el-input v-model="defaultsForm.mini.page" placeholder="默认首页路径，如 pages/index/index" />
        </el-form-item>
      </el-form>
    </div>

    <div class="page-card">
      <h3 style="margin-bottom:16px;">H5手机端</h3>
      <el-form :model="defaultsForm.h5" label-width="170px">
        <el-form-item label="默认访问路径">
          <el-input v-model="defaultsForm.h5.path" placeholder="如 /mobile" />
        </el-form-item>
        <el-form-item label="默认主题色">
          <el-color-picker v-model="defaultsForm.h5.primaryColor" />
        </el-form-item>
        <el-form-item label="默认分享标题">
          <el-input v-model="defaultsForm.h5.shareTitle" placeholder="留空使用客户名称" />
        </el-form-item>
      </el-form>
    </div>

    <div class="page-card">
      <h3 style="margin-bottom:16px;">微信公众号（平台统一）</h3>
      <el-form :model="defaultsForm.mp" label-width="170px">
        <el-form-item label="平台公众号AppID">
          <el-input v-model="defaultsForm.mp.appid" placeholder="未开通独立公众号的客户共用" />
        </el-form-item>
        <el-form-item label="平台公众号AppSecret">
          <el-input v-model="defaultsForm.mp.appsecret" type="password" show-password />
        </el-form-item>
      </el-form>
    </div>

    <div class="page-card">
      <h3 style="margin-bottom:16px;">PC网站</h3>
      <el-form :model="defaultsForm.pc" label-width="170px">
        <el-form-item label="默认域名">
          <el-input v-model="defaultsForm.pc.domain" placeholder="如 vr.yourdomain.com" />
        </el-form-item>
        <el-form-item label="默认模板">
          <el-select v-model="defaultsForm.pc.template" style="width:100%;">
            <el-option label="标准模板" value="standard" />
            <el-option label="极简模板" value="minimal" />
          </el-select>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { fetchChannelDefaults, updateChannelDefaults } from '../../../api';
import { ElMessage } from 'element-plus';

const props = defineProps({ embedded: { type: Boolean, default: false } });
const saving = ref(false);
const defaultsForm = reactive({
  mini: { appid: '', page: 'pages/index/index' },
  h5: { path: '/mobile', primaryColor: '#165DFF', shareTitle: '' },
  mp: { appid: '', appsecret: '' },
  pc: { domain: '', template: 'standard' },
});

onMounted(async () => {
  try {
    const res = await fetchChannelDefaults();
    if (res.defaults) {
      Object.assign(defaultsForm, res.defaults);
    }
  } catch (e) { ElMessage.error(e); }
});

async function save() {
  saving.value = true;
  try {
    await updateChannelDefaults(defaultsForm);
    ElMessage.success('平台默认配置已保存');
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}
</script>
