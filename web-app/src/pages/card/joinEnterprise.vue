<template>
  <view class="je-page" :style="[themeStyle, brandVars]">
    <!-- 🔴 员工凭企业口令自助加入企业：企业口令（ENT######）从 2026-09 起就能在后台生成/展示，
         但一直没有兑换入口，员工加入只能靠管理员从「未认证个人」池添加。本页补齐自助加入。 -->
    <PageNav title="加入企业" back />

    <view class="je-body">
      <view class="je-card">
        <view class="je-title">输入企业口令</view>
        <view class="je-desc">
          企业口令由企业管理员在后台「企业设置」中生成并提供（ENT 开头的 9 位字符）。
          加入后你的名片将归属该企业，身份成为「企业员工」。
        </view>
        <input
          class="je-input"
          v-model="code"
          placeholder="请输入企业口令，如 ENT123456"
          placeholder-class="je-ph"
          maxlength="12"
          :disabled="busy"
          @confirm="submit"
        />
        <view class="je-btn" :class="{ 'is-busy': busy }" @click="submit">
          {{ busy ? '加入中…' : '加入企业' }}
        </view>
      </view>

      <view class="je-tips">
        <view class="je-tip-item">· 口令无效？请向企业管理员确认后重试</view>
        <view class="je-tip-item">· 已加入其他企业时，需先请原企业管理员将你移出</view>
        <view class="je-tip-item">· 加入后如需退出，同样由企业管理员操作</view>
      </view>
    </view>

    <!-- 🔴 #312-18c：未登录先弹原地登录浮层，登录成功后自动继续「加入」动作 -->
    <LoginGateModal :show="showLoginGate" @close="cancelLogin" @success="onLoginGateSuccess" />
  </view>
</template>

<script setup>
import { ref } from 'vue';
import PageNav from '../../components/PageNav.vue';
import LoginGateModal from '../../components/LoginGateModal.vue';
import { useInlineLogin } from '../../utils/loginGate.js';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';
import { cardApi } from '../../utils/cardApi.js';

const { showLoginGate, requireLogin, cancelLogin, onLoginGateSuccess } = useInlineLogin();
const themeStyle = useDesignTheme();
const { brandVars } = useBrandOverride();

const code = ref('');
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  const v = String(code.value || '').trim().toUpperCase();
  if (!v) {
    uni.showToast({ title: '请输入企业口令', icon: 'none' });
    return;
  }
  // 未登录先原地登录，成功后自动继续（不用再点一次「加入企业」）
  if (!(await requireLogin())) return;
  busy.value = true;
  try {
    const res = await cardApi.joinEnterprise(v);
    uni.showToast({ title: `已加入${(res && res.enterprise && res.enterprise.name) || '企业'}`, icon: 'success' });
    code.value = '';
    setTimeout(() => uni.navigateBack(), 900);
  } catch (e) {
    uni.showToast({ title: String((e && e.message) || e || '加入失败'), icon: 'none' });
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.je-page { min-height: 100vh; background: var(--bg-page); }
.je-body { padding: 32rpx 32rpx 80rpx; }
.je-card {
  background: var(--white);
  border-radius: var(--radius-lg);
  padding: 48rpx 36rpx 40rpx;
}
.je-title { font-size: var(--fs-6); font-weight: 600; color: var(--t1); margin-bottom: 16rpx; }
.je-desc { font-size: var(--fs-3); color: var(--t3); line-height: 1.6; margin-bottom: 36rpx; }
.je-input {
  height: 92rpx;
  border: 2rpx solid var(--border-strong);
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: var(--fs-5);
  color: var(--t1);
  letter-spacing: 2rpx;
  margin-bottom: 32rpx;
}
.je-ph { color: var(--t4); letter-spacing: 0; }
.je-btn {
  height: 88rpx;
  line-height: 88rpx;
  text-align: center;
  border-radius: 44rpx;
  background: var(--design-primary);
  color: var(--white);
  font-size: var(--fs-5);
  font-weight: 600;
}
.je-btn.is-busy { opacity: 0.65; }
.je-tips { margin-top: 32rpx; padding: 0 8rpx; }
.je-tip-item { font-size: var(--fs-2); color: var(--t4); line-height: 1.9; }
</style>
