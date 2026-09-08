<template>
  <div class="page-card">
    <h3 style="margin-bottom:16px;">微信第三方平台</h3>
    <el-alert type="info" :closable="false" style="margin-bottom:16px;">
      第三方平台用于代开发客户的微信小程序/公众号：客户授权后，平台代为管理与发布。
    </el-alert>
    <el-form :model="form" label-width="150px">
      <el-form-item label="第三方平台AppID">
        <el-input v-model="form.component_appid" placeholder="wx开头的AppID" />
      </el-form-item>
      <el-form-item label="第三方平台AppSecret">
        <el-input v-model="form.component_appsecret" type="password" show-password placeholder="AppSecret" />
      </el-form-item>
      <el-form-item label="消息校验Token">
        <el-input v-model="form.message_token" placeholder="与微信开放平台配置一致" />
      </el-form-item>
      <el-form-item label="消息加解密Key">
        <el-input v-model="form.encoding_aes_key" placeholder="43位EncodingAESKey" />
      </el-form-item>
      <el-form-item label="授权事件接收URL">
        <el-input :value="callbackUrl" readonly>
          <template #append><el-button text @click="copy(callbackUrl)">复制</el-button></template>
        </el-input>
      </el-form-item>
      <el-form-item label="消息接收URL">
        <el-input :value="messageUrl" readonly>
          <template #append><el-button text @click="copy(messageUrl)">复制</el-button></template>
        </el-input>
      </el-form-item>
      <el-form-item label="平台状态">
        <el-tag :type="componentConfig.hasVerifyTicket ? 'success' : 'warning'">
          {{ componentConfig.hasVerifyTicket ? '正常（已收到 verify_ticket）' : '待配置（等待微信推送 verify_ticket）' }}
        </el-tag>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="save" :loading="saving">保存配置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { fetchChannelComponent, updateChannelComponent } from '../../../api';
import { ElMessage } from 'element-plus';

const saving = ref(false);
const componentConfig = ref({});
const form = reactive({ component_appid: '', component_appsecret: '', message_token: '', encoding_aes_key: '' });

const callbackUrl = `${location.origin}/api/channel/wx-callback`;
const messageUrl = `${location.origin}/api/channel/wx-message/$APPID$`;

onMounted(async () => {
  try {
    const res = await fetchChannelComponent();
    componentConfig.value = res.config || {};
    Object.assign(form, {
      component_appid: componentConfig.value.component_appid || '',
      component_appsecret: componentConfig.value.component_appsecret || '',
      message_token: componentConfig.value.message_token || '',
      encoding_aes_key: componentConfig.value.encoding_aes_key || '',
    });
  } catch (e) { ElMessage.error(e); }
});

async function save() {
  saving.value = true;
  try {
    await updateChannelComponent(form);
    ElMessage.success('保存成功');
    const res = await fetchChannelComponent();
    componentConfig.value = res.config || {};
  } catch (e) { ElMessage.error(e); }
  finally { saving.value = false; }
}

function copy(text) {
  navigator.clipboard.writeText(text);
  ElMessage.success('已复制');
}
</script>
