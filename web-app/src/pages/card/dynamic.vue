<template>
  <view class="dynamic-page" :style="[themeStyle, brandVars, brandInkVars]">
<!-- PageNav -->
<PageNav title="我的动态" back />
    <view class="header">
      <view class="title">我的动态</view>
      <view class="publish-btn" @click="showPublish = true">+ 发布</view>
    </view>

    <view class="dynamic-list" v-if="dynamics.length">
      <view class="dynamic-item" v-for="d in dynamics" :key="d.id">
        <view class="dynamic-header">
          <view class="dynamic-avatar">{{ user.nickname?.[0] || '我' }}</view>
          <view class="dynamic-info">
            <view class="dynamic-name">{{ user.nickname || '我' }}</view>
            <view class="dynamic-time">{{ d.createdAt?.slice(0, 16) }}</view>
          </view>
          <view class="visibility-tag">{{ d.visibility === 'public' ? '公开' : '仅自己' }}</view>
        </view>
        <view class="dynamic-content">{{ d.content }}</view>
        <view class="dynamic-images" v-if="d.images?.length">
          <image v-for="(img, i) in d.images" :key="i" :src="img" mode="aspectFill" class="dynamic-img"/>
        </view>
      </view>
    </view>

    <view class="empty-state" v-else>
      <view class="empty-icon"><SIcon name="dynamic" size="xlarge" :color="ICON_DECOR" /></view>
      <view class="empty-text">暂无动态</view>
      <view class="empty-hint">发布第一条动态吧</view>
    </view>

    <!-- 发布弹窗 -->
    <view class="modal-mask" v-if="showPublish" @click="showPublish=false">
      <view class="bottom-sheet" @click.stop>
        <view class="sheet-header">
          <text class="sheet-title">发布动态</text>
          <text class="sheet-close" @click="showPublish=false">✕</text>
        </view>
        <view class="sheet-body">
          <textarea class="publish-input" v-model="newDynamic.content" placeholder="分享你的想法..." placeholder-class="ph" :maxlength="500"/>
          <!-- 🔴 反馈 #295：动态发布原本**只能发纯文字**（表单里根本没有图片入口，
               后端 images 字段与列表渲染其实早都支持）→ 补上选图入口 + 预览 + 删除。 -->
          <view class="img-picker">
            <view class="img-grid" v-if="newDynamic.images.length">
              <view class="img-cell" v-for="(img, i) in newDynamic.images" :key="img + i">
                <image class="img-thumb" :src="img" mode="aspectFill"/>
                <view class="img-del" @click="removeImage(i)">✕</view>
              </view>
            </view>
            <view class="img-add" v-if="newDynamic.images.length < MAX_DYNAMIC_IMAGES" @click="pickImages">
              <text class="img-add-icon">＋</text>
              <text class="img-add-text">{{ newDynamic.images.length }}/{{ MAX_DYNAMIC_IMAGES }}</text>
            </view>
          </view>
          <view class="form-item">
            <view class="form-label">可见范围</view>
            <view class="visibility-options">
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'public' }" @click="newDynamic.visibility='public'">公开</view>
              <view class="visibility-option" :class="{ active: newDynamic.visibility === 'private' }" @click="newDynamic.visibility='private'">仅自己</view>
            </view>
          </view>
        </view>
        <view class="sheet-footer">
          <button class="submit-btn" @click="publish">发布</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ICON_DECOR } from '../../utils/iconColor.js';
import PageNav from '../../components/PageNav.vue';
import { ref, onMounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { trackPageView } from '../../utils/analytics.js';
import SIcon from '../../components/SIcon.vue';
import { useDesignTheme } from '../../utils/design.js';
import { useBrandOverride } from '../../utils/brand.js';

const themeStyle = useDesignTheme();
const { brandVars, brandPrimary, brandInkVars } = useBrandOverride();

const dynamics = ref([]);
const user = ref({});
const showPublish = ref(false);
// 🔴 反馈 #295：补 images 字段（原来只有 content + visibility，导致「不能加图」）
const newDynamic = ref({ content: '', images: [], visibility: 'public' });
const MAX_DYNAMIC_IMAGES = 9;

/** 选图：uni.chooseMedia 在 H5 端不保证可用，降级 chooseImage（MP 端 chooseMedia 更完整，支持压缩） */
function chooseImageSource(count, onPicked) {
  if (typeof uni.chooseMedia === 'function') {
    uni.chooseMedia({
      count,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: onPicked,
    });
    return;
  }
  uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: onPicked });
}

/** 🔴 反馈 #295：动态配图上传（先传到服务端换 URL，再随发布提交） */
async function pickImages() {
  const remain = MAX_DYNAMIC_IMAGES - newDynamic.value.images.length;
  if (remain <= 0) return;
  chooseImageSource(remain, async (res) => {
    const files = res.tempFiles || [];
    const paths = res.tempFilePaths || [];
    const list = files.length ? files : paths.map((p) => ({ tempFilePath: p }));
    if (!list.length) return;
    uni.showLoading({ title: '上传中…', mask: true });
    let ok = 0;
    try {
      for (const f of list) {
        const p = f.tempFilePath || f;
        if (!p) continue;
        const data = await cardApi.uploadDynamicImage(p, f.file);
        if (data && data.url) {
          newDynamic.value.images.push(data.url);
          ok++;
        }
      }
    } catch (e) {
      uni.showToast({ title: e.message || '图片上传失败', icon: 'none' });
    } finally {
      uni.hideLoading();
      if (ok) uni.showToast({ title: `已添加 ${ok} 张`, icon: 'none' });
    }
  });
}

function removeImage(i) {
  newDynamic.value.images.splice(i, 1);
}

onShow(() => { trackPageView('/pages/card/dynamic'); });

onMounted(async () => {
  try {
    const res = await cardApi.getDynamics();
    dynamics.value = res.dynamics || [];
    const profile = await cardApi.getProfile();
    user.value = profile.user;
  } catch (e) {}
});

async function publish() {
  if (!newDynamic.value.content) {
    uni.showToast({ title: '请输入内容', icon: 'none' });
    return;
  }
  try {
    await cardApi.createDynamic({
      content: newDynamic.value.content,
      images: newDynamic.value.images,
      visibility: newDynamic.value.visibility,
    });
    uni.showToast({ title: '发布成功', icon: 'success' });
    showPublish.value = false;
    // 🔴 重置必须把 images 一并清空，否则下次打开弹窗还挂着上次的图
    newDynamic.value = { content: '', images: [], visibility: 'public' };
    const res = await cardApi.getDynamics();
    dynamics.value = res.dynamics || [];
  } catch (e) {
    uni.showToast({ title: e.message || '发布失败', icon: 'none' });
  }
}
</script>

<style scoped>
.dynamic-page {
  min-height: 100vh;
  background: var(--bg-hover);
  padding-bottom: 40rpx;
}
.header {
  background: linear-gradient(135deg, var(--design-primary, #eb2f96), var(--design-gradient, #f759ab));
  padding: 32rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title {
  font-size: var(--fs-7);
  font-weight: 700;
  color: var(--white);
}
.publish-btn {
  background: rgba(255,255,255,0.2);
  color: var(--white);
  padding: 12rpx 28rpx;
  border-radius: 32rpx;
  font-size: var(--fs-4);
}
.dynamic-list {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.dynamic-item {
  background: var(--white);
  border-radius: 32rpx;
  padding: 28rpx 24rpx;
  box-shadow: 0 4rpx 24rpx rgba(0,0,0,0.04);
}
.dynamic-header {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}
.dynamic-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--design-primary, #eb2f96), var(--design-gradient, #f759ab));
  /* 同上：渐变圆上的首字母改走 --brand-hero-ink */
  color: var(--brand-hero-ink, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--fs-5);
  margin-right: 16rpx;
}
.dynamic-info { flex: 1; }
.dynamic-name {
  font-size: var(--fs-5);
  font-weight: 600;
  color: var(--t1);
  margin-bottom: 4rpx;
}
.dynamic-time {
  font-size: var(--fs-2);
  color: var(--border);
}
.visibility-tag {
  font-size: var(--fs-1);
  color: var(--t3);
  background: var(--bg-hover);
  padding: 6rpx 16rpx;
  border-radius: var(--radius-sm);
}
.dynamic-content {
  font-size: var(--fs-5);
  color: var(--t1);
  line-height: 1.7;
  margin-bottom: 16rpx;
}
.dynamic-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8rpx;
}
.dynamic-img {
  width: 100%;
  height: 180rpx;
  border-radius: var(--radius-sm);
}
.empty-state {
  text-align: center;
  padding: 120rpx 0;
}
.empty-icon { font-size: 80rpx; margin-bottom: 20rpx; }
.empty-text { font-size: var(--fs-5); color: var(--t2); margin-bottom: 8rpx; }
.empty-hint { font-size: var(--fs-3); color: var(--t3); }
.modal-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.55);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}
.bottom-sheet {
  width: 100%;
  background: var(--white);
  border-radius: 32rpx 32rpx 0 0;
}
.sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1px solid var(--bg-hover);
}
.sheet-title { font-size: var(--fs-6); font-weight: 600; color: var(--t1); }
.sheet-close { font-size: var(--fs-6); color: var(--t3); }
.sheet-body { padding: 32rpx; }
.publish-input {
  width: 100%;
  height: 240rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  padding: 20rpx 24rpx;
  font-size: var(--fs-5);
  box-sizing: border-box;
  margin-bottom: 24rpx;
}
.ph { color: var(--border); }
/* 🔴 反馈 #295：动态配图选择器样式 */
.img-picker { margin-bottom: 24rpx; }
.img-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-bottom: 12rpx;
}
.img-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-xs);
  overflow: hidden;
  background: var(--bg-hover);
}
.img-thumb { width: 100%; height: 100%; display: block; }
.img-del {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: var(--white);
  font-size: 22rpx;
}
.img-add {
  width: 200rpx;
  height: 200rpx;
  border-radius: var(--radius-xs);
  border: 2rpx dashed var(--border);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.img-add-icon { font-size: 56rpx; color: var(--t3); line-height: 1; }
.img-add-text { font-size: var(--fs-2); color: var(--t3); margin-top: 8rpx; }
.form-item { margin-bottom: 20rpx; }
.form-label { font-size: var(--fs-4); color: var(--t2); margin-bottom: 12rpx; }
.visibility-options {
  display: flex;
  gap: 16rpx;
}
.visibility-option {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  background: var(--bg-card);
  border-radius: var(--radius-xs);
  font-size: var(--fs-4);
  color: var(--t2);
  border: 4rpx solid transparent;
}
.visibility-option.active {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, #165dff);
  border-color: var(--design-primary, #165dff);
}
.sheet-footer { padding: 0 32rpx 72rpx; }
.submit-btn {
  background: var(--design-primary, #eb2f96);
  color: var(--white);
  border-radius: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
}
</style>
