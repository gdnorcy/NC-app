<template>
  <div class="settings-page">
    <div class="page-header">
      <h2 class="page-title">我的账号</h2>
      <p class="page-desc">个人自助：管理您的登录手机号、密码，并查看当前角色与权限（成员资料由管理员在「成员与权限」中维护）</p>
    </div>

    <div class="card-grid">
      <div class="card">
        <div class="card-title">个人信息</div>
        <el-form :model="profile" label-width="100px" size="default">
          <el-form-item label="账号">
            <el-input v-model="profile.username" disabled />
          </el-form-item>
          <el-form-item label="手机号">
            <el-input v-model="profile.phone" placeholder="请输入手机号" />
            <div class="field-tip">修改后将同步更新该账号的登录手机号</div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveProfile" :loading="savingProfile">保存修改</el-button>
          </el-form-item>
        </el-form>
      </div>

      <div class="card">
        <div class="card-title">修改密码</div>
        <el-form :model="pwdForm" label-width="100px" size="default">
          <el-form-item label="当前密码">
            <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码" />
          </el-form-item>
          <el-form-item label="确认密码">
            <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="changePwd" :loading="changingPwd">确认修改</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">我的角色与权限</div>
      <el-form label-width="100px" size="default">
        <el-form-item label="当前角色">
          <template v-if="me.isTenantAdmin">
            <el-tag type="danger" size="small" effect="light" class="tag-gap">租户管理员</el-tag>
          </template>
          <el-tag v-for="r in me.roles" :key="r.id" size="small" effect="light" class="tag-gap">{{ r.name }}</el-tag>
          <span v-if="!me.roles || !me.roles.length" class="no-tag">未分配角色</span>
        </el-form-item>
        <el-form-item label="权限点">
          <template v-if="me.isTenantAdmin">
            <span class="no-tag">管理员默认拥有全部权限</span>
          </template>
          <template v-else>
            <el-tag v-for="p in me.perms" :key="p.app_code + ':' + p.menu_key" type="info" size="small" effect="plain" class="tag-gap">{{ permLabel(p) }}</el-tag>
            <span v-if="!me.perms || !me.perms.length" class="no-tag">暂无额外权限点</span>
          </template>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { customerApiCall } from '../../../api';
import { ElMessage } from 'element-plus';

const profile = reactive({ username: '', phone: '' });
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const savingProfile = ref(false);
const changingPwd = ref(false);
const me = reactive({ roles: [], perms: [], isTenantAdmin: false });

// 权限点文案（app 前缀 + menu_key）：仅展示用，找不到对应文案时显示原始 key
const PERM_LABELS = {
  'system:set-members': '系统设置 · 成员管理',
};
function permLabel(p) {
  return PERM_LABELS[`${p.app_code}:${p.menu_key}`] || `${p.app_code}:${p.menu_key}`;
}

onMounted(async () => {
  try {
    const data = await customerApiCall.get('/profile');
    Object.assign(profile, data.user || {});
  } catch (e) {}
  try {
    const res = await customerApiCall.get('/members/me');
    Object.assign(me, res.member ? { roles: res.roles || [], perms: res.perms || [], isTenantAdmin: res.isTenantAdmin } : {});
  } catch (e) {}
});

async function saveProfile() {
  savingProfile.value = true;
  try {
    await customerApiCall.put('/profile', profile);
    ElMessage.success('保存成功');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    savingProfile.value = false;
  }
}

async function changePwd() {
  if (!pwdForm.oldPassword) { ElMessage.warning('请输入当前密码'); return; }
  if (!pwdForm.newPassword) { ElMessage.warning('请输入新密码'); return; }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) { ElMessage.error('两次密码不一致'); return; }
  if (pwdForm.newPassword.length < 6) { ElMessage.warning('新密码至少6位'); return; }
  changingPwd.value = true;
  try {
    await customerApiCall.post('/change-password', pwdForm);
    ElMessage.success('修改成功');
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirmPassword = '';
  } catch (e) {
    ElMessage.error(e.message || '修改失败');
  } finally {
    changingPwd.value = false;
  }
}
</script>

<style scoped>
.settings-page { padding: 0; }
.page-header { margin-bottom: 16px; }
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; margin: 0 0 4px; }
.page-desc { font-size: 13px; color: #86909c; margin: 0; }
.card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.card-title { font-size: 15px; font-weight: 600; color: #1d2129; margin-bottom: 16px; }
.card-desc { font-size: 13px; color: #86909c; margin: 0 0 16px; }
.field-tip { font-size: 12px; color: #86909c; line-height: 1.5; }
.tag-gap { margin-right: 6px; }
.no-tag { color: #86909c; font-size: 13px; }
</style>
