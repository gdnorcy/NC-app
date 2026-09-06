<template>
  <div>
    <div class="page-header">
      <el-button @click="$router.back()"><el-icon><ArrowLeft /></el-icon>返回</el-button>
      <h2 class="page-title">{{ channelInfo.name }}</h2>
    </div>

    <div class="page-card">
      <el-alert :title="channelInfo.alert" type="info" :closable="false" style="margin-bottom:20px;" />

      <el-form :model="form" label-width="120px">
        <el-form-item label="品牌名称">
          <el-input v-model="form.brandName" placeholder="留空使用客户名称" />
        </el-form-item>
        <el-form-item label="主题色">
          <el-color-picker v-model="form.primaryColor" />
        </el-form-item>
        <el-form-item label="自定义域名" v-if="channelInfo.hasDomain">
          <el-input v-model="form.customDomain" placeholder="如 vr.example.com" />
          <div style="font-size:12px;color:#909399;margin-top:4px;">配置后需将域名CNAME解析到平台地址</div>
        </el-form-item>
        <el-form-item label="访问路径" v-if="channelType === 'h5'">
          <el-input v-model="form.page" placeholder="默认 /mobile" />
        </el-form-item>
        <el-form-item label="分享标题" v-if="channelType === 'h5'">
          <el-input v-model="form.shareTitle" placeholder="留空使用品牌名称" />
        </el-form-item>
        <el-form-item label="模板选择" v-if="channelType === 'pc'">
          <el-select v-model="form.template" style="width:100%;">
            <el-option label="标准模板" value="standard" />
            <el-option label="极简模板" value="minimal" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用渠道">
          <el-switch v-model="form.enabled" />
          <span style="margin-left:12px;font-size:12px;color:#909399;">{{ form.enabled ? '已启用，用户可访问' : '已禁用，用户无法访问' }}</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="save" :loading="saving">保存配置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 访问链接 -->
    <div class="page-card" v-if="form.enabled">
      <h3 style="margin-bottom:16px;">访问入口</h3>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <el-input :value="accessUrl" readonly style="flex:1;min-width:300px;" />
        <el-button @click="copyLink">复制链接</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { fetchCustomerChannels, updateCustomerChannel } from '../../../api';
import { ElMessage } from 'element-plus';

const route = useRoute();
const channelType = computed(() => route.query.type || 'h5');
const saving = ref(false);

const channelInfo = computed(() => {
  const map = {
    h5: { name: 'H5手机端', icon: '📱', hasDomain: true, alert: 'H5渠道适用于手机浏览器访问，支持自定义域名和分享配置。' },
    mp: { name: '微信公众号', icon: '📢', hasDomain: false, alert: '公众号渠道通过菜单或自动回复链接跳转H5页面，需在微信公众平台配置菜单。' },
    pc: { name: 'PC网站', icon: '💻', hasDomain: true, alert: 'PC渠道适用于桌面浏览器访问，支持自定义域名和模板选择。' },
  };
  return map[channelType.value] || map.h5;
});

const form = reactive({
  brandName: '', primaryColor: '#165DFF', customDomain: '',
  page: '', shareTitle: '', template: 'standard', enabled: false,
});

const accessUrl = computed(() => {
  const domain = form.customDomain || location.origin;
  const customerId = localStorage.getItem('customer_id') || '';
  if (channelType.value === 'h5') return `${domain}/mobile?customer_id=${customerId}`;
  if (channelType.value === 'pc') return `${domain}/?customer_id=${customerId}`;
  if (channelType.value === 'mp') return `${domain}/mobile?customer_id=${customerId}&from=mp`;
  return domain;
});

onMounted(async () => {
  try {
    const res = await fetchCustomerChannels();
    const found = (res.channels || []).find(c => c.channel_type === channelType.value);
    if (found) {
      form.brandName = found.brand_name || '';
      form.primaryColor = found.primary_color || '#165DFF';
      form.customDomain = found.custom_domain || '';
      form.page = found.page || '';
      form.enabled = !!found.enabled;
    }
  } catch (e) {}
});

async function save() {
  saving.value = true;
  try {
    await updateCustomerChannel(channelType.value, form);
    ElMessage.success('配置已保存');
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}

function copyLink() {
  navigator.clipboard.writeText(accessUrl.value);
  ElMessage.success('链接已复制');
}
</script>
