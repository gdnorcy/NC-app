<template>
  <div class="goods-settings">
    <AppPageHeader title="商城设置" desc="订单规则 / 样式规则 / 价格展示 / 优惠券 / 购物车 / 客服 / 开票 / 其他规则 / 分享设置">
      <div class="hd-actions">
        <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
      </div>
    </AppPageHeader>

    <div class="set-card">
      <div class="set-group-title">订单规则</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="支付规则">
          <el-radio-group v-model="cfg.payRule">
            <el-radio value="0">线下支付</el-radio>
            <el-radio value="1">线上支付</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="下单规则">
          <el-radio-group v-model="cfg.orderRule">
            <el-radio value="0">直接下单</el-radio>
            <el-radio value="1">需审核</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="核销规则">
          <el-radio-group v-model="cfg.verifyRule">
            <el-radio value="0">无需核销</el-radio>
            <el-radio value="1">需核销码</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </div>

    <div class="set-card">
      <div class="set-group-title">样式规则</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="订单轮播">
          <el-switch v-model="cfg.orderCarousel" />
          <span class="form-hint">首页展示最近成交订单轮播</span>
        </el-form-item>
        <el-form-item label="分销佣金">
          <el-switch v-model="cfg.distCommission" />
          <span class="form-hint">商品详情展示分销佣金</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="set-card">
      <div class="set-group-title">展示规则</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="价格展示">
          <el-switch v-model="cfg.priceShow" />
          <span class="form-hint">商品列表/详情展示价格</span>
        </el-form-item>
        <el-form-item label="优惠券展示">
          <el-switch v-model="cfg.couponShow" />
          <span class="form-hint">商品详情展示可用优惠券</span>
        </el-form-item>
        <el-form-item label="购物车显示">
          <el-switch v-model="cfg.cartShow" />
          <span class="form-hint">展示购物车入口</span>
        </el-form-item>
        <el-form-item label="商品推荐">
          <el-switch v-model="cfg.goodsRecommend" />
          <span class="form-hint">详情页展示推荐商品</span>
        </el-form-item>
        <el-form-item label="购买评价">
          <el-switch v-model="cfg.buyReview" />
          <span class="form-hint">购买后允许评价</span>
        </el-form-item>
        <el-form-item label="评价审核">
          <el-switch v-model="cfg.reviewAudit" />
          <span class="form-hint">评价需审核后展示</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="set-card">
      <div class="set-group-title">客服设置</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="客服方式">
          <el-radio-group v-model="cfg.customerService">
            <el-radio value="none">不启用</el-radio>
            <el-radio value="phone">电话</el-radio>
            <el-radio value="wechat">微信</el-radio>
            <el-radio value="url">链接</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="cfg.customerService === 'phone'" label="客服电话">
          <el-input v-model="cfg.customerPhone" placeholder="请输入客服电话" class="w300" />
        </el-form-item>
        <el-form-item v-else-if="cfg.customerService === 'wechat'" label="微信号">
          <el-input v-model="cfg.customerWechat" placeholder="请输入微信号" class="w300" />
        </el-form-item>
        <el-form-item v-else-if="cfg.customerService === 'url'" label="客服链接">
          <el-input v-model="cfg.customerUrl" placeholder="请输入客服链接" class="w360" />
        </el-form-item>
      </el-form>
    </div>

    <div class="set-card">
      <div class="set-group-title">开票规则</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="支持开票">
          <el-switch v-model="cfg.invoiceRule" />
          <span class="form-hint">订单支持申请开票</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="set-card">
      <div class="set-group-title">其他规则</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="商品采集 APIKEY">
          <el-input v-model="cfg.collectApiKey" placeholder="第三方商品采集接口密钥" class="w360" />
        </el-form-item>
      </el-form>
    </div>

    <div class="set-card">
      <div class="set-group-title">分享设置</div>
      <el-form label-width="140px" label-position="left">
        <el-form-item label="分享标题">
          <el-input v-model="cfg.shareTitle" placeholder="商品分享默认标题" class="w360" />
        </el-form-item>
        <el-form-item label="分享图（5:4）">
          <div class="img-picker">
            <el-image v-if="cfg.shareImg" :src="resolveUrl(cfg.shareImg)" fit="cover" class="picker-img" :preview-src-list="[resolveUrl(cfg.shareImg)]" preview-teleported />
            <div v-else class="picker-img picker-empty" @click="pickImage"><el-icon><Plus /></el-icon></div>
            <div class="picker-ops">
              <el-button size="small" @click="pickImage">选择图片</el-button>
              <el-button v-if="cfg.shareImg" size="small" text type="danger" @click="cfg.shareImg = ''">移除</el-button>
            </div>
            <input ref="fileInput" type="file" accept="image/*" class="hide" @change="onFileChange" />
          </div>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { customerApiCall, designCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';

const cfg = reactive({
  payRule: '1',
  orderRule: '0',
  verifyRule: '0',
  orderCarousel: true,
  distCommission: false,
  priceShow: true,
  couponShow: true,
  cartShow: true,
  goodsRecommend: true,
  buyReview: true,
  reviewAudit: false,
  customerService: 'none',
  customerPhone: '',
  customerWechat: '',
  customerUrl: '',
  invoiceRule: false,
  collectApiKey: '',
  shareTitle: '',
  shareImg: '',
});
const saving = ref(false);
const fileInput = ref(null);

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

async function load() {
  try {
    const data = await customerApiCall.get('/goods/settings');
    Object.keys(cfg).forEach((k) => {
      if (data[k] !== undefined) cfg[k] = data[k];
    });
  } catch (e) { /* 默认值兜底 */ }
}

async function save() {
  saving.value = true;
  try {
    await customerApiCall.put('/goods/settings', { ...cfg });
    ElMessage.success('商城设置已保存');
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

function pickImage() { fileInput.value?.click(); }
async function onFileChange(e) {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const fd = new FormData();
    fd.append('file', f);
    const data = await designCall.post('/material/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    cfg.shareImg = data.file_url || data.url || '';
    ElMessage.success('图片已上传');
  } catch (err) { ElMessage.error(`上传失败：${err}`); }
}

onMounted(load);
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.set-card { border: 1px solid #e5e6eb; border-radius: 8px; padding: 16px 20px 4px; margin-bottom: 16px; }
.set-group-title {
  font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 12px;
  padding-bottom: 8px; border-bottom: 1px solid #f2f3f5;
}
.form-hint { font-size: 12px; color: #86909c; margin-left: 10px; }
.w300 { width: 300px; }
.w360 { width: 360px; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.picker-img { width: 56px; height: 56px; border-radius: 6px; display: block; }
.picker-empty {
  border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #86909c;
}
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.hide { display: none; }
</style>
