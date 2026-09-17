<template>
  <div class="goods-style">
    <AppPageHeader title="商城风格" desc="商品分类页与详情页的展示风格（1:1 复刻菜鸟云 duoproducts/cateset）">
      <div class="hd-actions">
        <el-button type="primary" :loading="saving" @click="save">确定</el-button>
      </div>
    </AppPageHeader>

    <el-tabs v-model="tab" class="style-tabs">
      <!-- 分类风格：2 个真实手机屏截图预览 -->
      <el-tab-pane label="分类风格" name="cate">
        <div class="cate-options">
          <div
            v-for="c in cateStyles"
            :key="c.value"
            class="style-card cate-card"
            :class="{ active: form.cateStyle === c.value }"
            @click="form.cateStyle = c.value"
          >
            <div class="img-phone">
              <img :src="c.img" :alt="c.label" />
              <span v-if="form.cateStyle === c.value" class="style-check">✓</span>
            </div>
            <p class="style-desc">{{ c.desc }}</p>
            <div class="style-radio">
              <el-radio :model-value="form.cateStyle === c.value" @click.stop="form.cateStyle = c.value">{{ c.label }}</el-radio>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- 详情风格：左侧手机预览（背景/价格条/分享图联动）+ 右侧参数区 -->
      <el-tab-pane label="详情风格" name="detail">
        <div class="detail-layout">
          <div class="goodsShowBox">
            <div class="goods-detail-show">
              <img class="gd-bg" :src="mainBgUrl" />
              <!-- 价格条（详情风格3无价格条） -->
              <div v-if="form.detailStyle !== 3" class="gd-price">
                <!-- 价格样式1 主题色（渐变底白字） / 价格样式2 主题色+背景图 -->
                <div v-if="form.detailStyle === 1" class="pricebg pricebg-box1" :class="{ card: form.goodsIscard === 1 }">
                  <div class="price-bg-show" :style="priceBgStyle">
                    <img v-if="form.pbgStyle === 2" class="bg-img-on" :src="priceBgImgUrl" :style="{ objectFit: form.pbgMode === 1 ? 'cover' : 'fill' }" />
                    <div class="flex-bbox">
                      <div class="flex-row">
                        <div class="item1"><span>￥</span>249.00</div>
                        <div class="item2">/件</div>
                        <div class="item3"></div>
                        <div class="item4">￥499.00/件</div>
                      </div>
                      <div class="item5">已售21件</div>
                    </div>
                    <div class="item6">🔥</div>
                  </div>
                </div>
                <div v-else class="pricebg pricebg-box2" :class="{ card: form.goodsIscard === 1 }">
                  <div class="price-bg-show" :style="priceBgStyle">
                    <img v-if="form.pbgStyle === 2" class="bg-img-on" :src="priceBgImgUrl" :style="{ objectFit: form.pbgMode === 1 ? 'cover' : 'fill' }" />
                    <img class="price-theme" :src="themeImgUrl" />
                    <img class="price-in" :src="priceInUrl" />
                  </div>
                </div>
              </div>
              <!-- 分享图（位置按 详情风格×卡片样式 联动） -->
              <img class="gd-share" :class="'share' + form.detailStyle + '_' + form.goodsIscard" :src="shareUrl" />
            </div>
          </div>

          <div class="detail-config">
            <!-- 详情风格 -->
            <div class="control-group">
              <label class="control-label">详情风格</label>
              <div class="controls">
                <el-radio-group v-model="form.detailStyle">
                  <el-radio :value="1">风格一</el-radio>
                  <el-radio :value="2">风格二</el-radio>
                  <el-radio :value="3">风格三</el-radio>
                </el-radio-group>
              </div>
            </div>
            <!-- 卡片样式 -->
            <div class="control-group">
              <label class="control-label">卡片样式</label>
              <div class="controls">
                <el-radio-group v-model="form.goodsIscard">
                  <el-radio :value="1">开启</el-radio>
                  <el-radio :value="2">关闭</el-radio>
                </el-radio-group>
              </div>
            </div>
            <!-- 分享样式 -->
            <div class="control-group">
              <label class="control-label">分享样式</label>
              <div class="controls">
                <el-radio-group v-model="form.shareStyle">
                  <el-radio :value="1">样式一</el-radio>
                  <el-radio :value="2">样式二</el-radio>
                </el-radio-group>
              </div>
            </div>
            <!-- 价格样式（详情风格3不显示） -->
            <template v-if="form.detailStyle !== 3">
              <div class="control-group">
                <label class="control-label">价格样式</label>
                <div class="controls">
                  <el-radio-group v-model="form.pbgStyle">
                    <el-radio :value="1">主题色</el-radio>
                    <el-radio :value="2">主题色+背景图</el-radio>
                  </el-radio-group>
                </div>
              </div>
              <!-- 主题色+背景图：背景图片（样式一~十三 + 自定义上传）+ 背景图样式 -->
              <div v-if="form.pbgStyle === 2" class="nested-box">
                <div class="control-group">
                  <label class="control-label">背景图片</label>
                  <div class="controls">
                    <el-radio-group v-model="form.pbgImg" class="nested-radios">
                      <el-radio v-for="i in 13" :key="i" :value="i">{{ '样式' + cnNum(i) }}</el-radio>
                      <el-radio :value="0">自定义</el-radio>
                    </el-radio-group>
                  </div>
                </div>
                <div v-if="form.pbgImg === 0" class="upload-box">
                  <el-upload :show-file-list="false" :http-request="(o) => doUpload(o, 'pbgImgCustom')" accept="image/*">
                    <img v-if="form.pbgImgCustom" :src="form.pbgImgCustom" class="upload-thumb" />
                    <div v-else class="upload-add">+ 选择图片</div>
                  </el-upload>
                  <span class="help-block">建议宽度 375px，不超过 100kb</span>
                </div>
                <div class="control-group">
                  <label class="control-label">背景图样式</label>
                  <div class="controls">
                    <el-radio-group v-model="form.pbgMode">
                      <el-radio :value="1">裁剪</el-radio>
                      <el-radio :value="2">填充</el-radio>
                    </el-radio-group>
                  </div>
                </div>
              </div>
              <!-- 详情风格2：主题样式（样式一~十三 + 自定义上传） -->
              <div v-if="form.detailStyle === 2" class="nested-box">
                <div class="control-group">
                  <label class="control-label">主题样式</label>
                  <div class="controls">
                    <el-radio-group v-model="form.pbgTheme" class="nested-radios">
                      <el-radio v-for="i in 13" :key="i" :value="i">{{ '样式' + cnNum(i) }}</el-radio>
                      <el-radio :value="0">自定义</el-radio>
                    </el-radio-group>
                  </div>
                </div>
                <div v-if="form.pbgTheme === 0" class="upload-box">
                  <el-upload :show-file-list="false" :http-request="(o) => doUpload(o, 'pbgThemeCustom')" accept="image/*">
                    <img v-if="form.pbgThemeCustom" :src="form.pbgThemeCustom" class="upload-thumb" />
                    <div v-else class="upload-add">+ 选择图片</div>
                  </el-upload>
                </div>
              </div>
            </template>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const tab = ref('cate');
const saving = ref(false);

// 1:1 复刻菜鸟云 duoproducts/cateset 全参数
const form = reactive({
  cateStyle: 1,        // 分类风格 1/2
  detailStyle: 1,      // 详情风格 1/2/3
  goodsIscard: 2,      // 卡片样式 1开启 2关闭
  shareStyle: 1,       // 分享样式 1/2
  pbgStyle: 1,         // 价格样式 1主题色 2主题色+背景图
  pbgImg: 1,           // 价格背景图 0自定义 1-13
  pbgMode: 1,          // 背景图样式 1裁剪 2填充
  pbgTheme: 1,         // 主题样式 0自定义 1-13
  pbgImgCustom: '',    // 自定义价格背景图
  pbgThemeCustom: '',  // 自定义主题图
});

const cateStyles = [
  { value: 1, label: '风格1', desc: '左侧一级分类、右侧二级分类', img: '/goods-style/style1.jpg' },
  { value: 2, label: '风格2', desc: '左侧一级分类、右侧二级分类及商品', img: '/goods-style/style2.jpg' },
];

// 联动素材（菜鸟云命名规律：main_bg_{详情风格}_{卡片样式}.jpg / share_{分享样式}_{卡片样式}.png）
const mainBgUrl = computed(() => `/goods-style/main_bg/main_bg_${form.detailStyle}_${form.goodsIscard}.jpg`);
const shareUrl = computed(() => `/goods-style/share/share_${form.shareStyle}_${form.goodsIscard}.png`);
// 价格背景图：样式0=自定义上传图；1-13=price_bg{详情风格}_{序号}.png（仅详情风格1/2）
const priceBgImgUrl = computed(() => {
  if (form.pbgImg === 0) return form.pbgImgCustom || '';
  return `/goods-style/price_bg/price_bg${form.detailStyle}_${form.pbgImg}.png`;
});
// 主题图（详情风格2）：样式0=自定义上传图；1-13=price_theme_{序号}.png
const priceInUrl = '/goods-style/price_show.png';
const themeImgUrl = computed(() => {
  if (form.pbgTheme === 0) return form.pbgThemeCustom || '';
  return `/goods-style/price_theme/price_theme_${form.pbgTheme}.png`;
});
// 价格条背景：主题色=渐变；主题色+背景图=背景图（白字）
const priceBgStyle = computed(() => {
  if (form.pbgStyle === 2) return { background: 'linear-gradient(90deg, #70b0ff, #4491F1)', color: '#ffffff' };
  return { background: 'linear-gradient(90deg, #70b0ff, #4491F1)', color: '#ffffff' };
});

function cnNum(n) {
  return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三'][n - 1] || n;
}

async function doUpload(options, field) {
  try {
    const fd = new FormData();
    fd.append('file', options.file);
    const res = await customerApiCall.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    form[field] = res.url;
    ElMessage.success('上传成功');
  } catch (e) {
    ElMessage.error(e);
  }
}

async function load() {
  try {
    const res = await customerApiCall.get('/goods/category-style');
    Object.assign(form, {
      cateStyle: res.cateStyle || 1,
      detailStyle: res.detailStyle || 1,
      goodsIscard: res.goodsIscard ?? 2,
      shareStyle: res.shareStyle || 1,
      pbgStyle: res.pbgStyle || 1,
      pbgImg: res.pbgImg || 1,
      pbgMode: res.pbgMode || 1,
      pbgTheme: res.pbgTheme || 1,
      pbgImgCustom: res.pbgImgCustom || '',
      pbgThemeCustom: res.pbgThemeCustom || '',
    });
  } catch (e) { /* 忽略 */ }
}

async function save() {
  saving.value = true;
  try {
    await customerApiCall.put('/goods/category-style', { ...form });
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(e);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.style-tabs { background: #fff; border-radius: 8px; padding: 8px 20px 20px; }
.goods-style :deep(.el-tabs__item) { font-size: 14px; }

/* —— 分类风格 —— */
.cate-options { display: flex; gap: 24px; flex-wrap: wrap; padding-top: 12px; }
.style-card { position: relative; width: 240px; border: 2px solid #E5E6EB; border-radius: 8px; overflow: hidden; cursor: pointer; background: #fff; transition: all 0.2s; }
.style-card:hover { border-color: #A9C4FF; }
.style-card.active { border-color: #165DFF; }
.img-phone { position: relative; width: 100%; aspect-ratio: 213 / 376; background: #F7F8FA; }
.img-phone img { width: 100%; height: 100%; object-fit: cover; display: block; }
.style-check { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border-radius: 50%; background: #165DFF; color: #fff; font-size: 13px; line-height: 22px; text-align: center; }
.style-desc { margin: 10px 12px 0; font-size: 13px; color: #4E5969; text-align: center; }
.style-radio { padding: 6px 0 10px; text-align: center; }
.style-radio :deep(.el-radio__label) { font-size: 13px; }

/* —— 详情风格 —— */
.detail-layout { display: flex; gap: 28px; align-items: flex-start; padding-top: 12px; flex-wrap: wrap; }
.goodsShowBox { width: 250px; }
.goods-detail-show { position: relative; width: 100%; border-radius: 5px; box-shadow: 0 0 23px 2px #ededed; overflow: hidden; }
.gd-bg { width: 250px; display: block; }
.gd-price, .gd-share { width: 100%; position: absolute; left: 0; }
.gd-price { top: 250px; }
.gd-share { top: 453px; }
.gd-share.share1_1 { top: 453px; } .gd-share.share1_2 { top: 446px; }
.gd-share.share2_1 { top: 483px; } .gd-share.share2_2 { top: 474px; }
.gd-share.share3_1 { top: 443px; } .gd-share.share3_2 { top: 437px; }

.pricebg { position: relative; }
.pricebg.card { padding: 7px 7px 0 7px; }
.pricebg-box1.card .price-bg-show { border-radius: 5px 5px 0 0; }
.pricebg-box2.card .price-bg-show { border-radius: 13px; }
.pricebg-box1 .price-bg-show { height: 36px; }
.pricebg-box2 .price-bg-show { height: 97px; }
.price-bg-show { width: 100%; overflow: hidden; position: relative; }
.bg-img-on { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
.price-theme { position: absolute; top: 8px; left: 8px; height: 12px; width: auto; }
.price-in { position: absolute; bottom: 3px; width: 100%; height: 67px; }

.flex-bbox { height: 100%; padding: 4px 9px; font-size: 9px; color: #fff; display: flex; align-items: baseline; position: relative; }
.flex-row { display: flex; align-items: baseline; }
.item1 { font-weight: bold; font-size: 18px; }
.item1 span { font-size: 11px; }
.item2 { margin-left: 3px; font-size: 8px; }
.item3 { margin: 0 6px; width: 1px; height: 8px; background: #fff; }
.item4 { font-size: 9px; text-decoration: line-through; opacity: 0.8; }
.item5 { font-size: 9px; opacity: 0.8; margin-left: 8px; }
.item6 { position: absolute; top: 2px; right: 24%; font-size: 20px; opacity: 0.15; }

/* —— 右侧参数区 —— */
.detail-config { flex: 1; min-width: 480px; }
.control-group { margin-bottom: 16px; display: flex; }
.control-label { width: 90px; font-size: 14px; color: #1D2129; line-height: 32px; flex-shrink: 0; }
.controls { flex: 1; line-height: 32px; }
.controls :deep(.el-radio) { margin-right: 16px; }
.nested-box { border: 1px solid #F2F3F5; border-radius: 8px; padding: 14px; margin-bottom: 16px; background: #FAFBFC; }
.nested-radios :deep(.el-radio) { margin-right: 10px; margin-bottom: 4px; }
.upload-box { margin: 4px 0 12px 90px; display: flex; align-items: center; gap: 10px; }
.upload-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid #E5E6EB; }
.upload-add { width: 60px; height: 60px; border: 1px dashed #C9CDD4; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #86909C; cursor: pointer; }
.help-block { font-size: 12px; color: #86909C; }
</style>
