<template>
  <div class="goods-settings">
    <AppPageHeader title="商城设置" desc="1:1 复刻菜鸟云 duoproductsset/index（支付规则 / 下单规则 / 配送 / 订单核销 / 展示 / 分享）">
      <div class="hd-actions">
        <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
      </div>
    </AppPageHeader>

    <!-- 支付规则 -->
    <div class="set-card">
      <div class="set-group-title">支付规则</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="线上支付">
          <el-radio-group v-model="cfg.onlinePay">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">商品、秒杀、拼团、预约、砍价等是否可以使用线上支付</span>
        </el-form-item>
        <el-form-item label="余额支付">
          <el-radio-group v-model="cfg.useYue">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">商品、秒杀、拼团、预约、砍价等是否可以使用余额支付</span>
        </el-form-item>
        <el-form-item label="货到付款">
          <el-radio-group v-model="cfg.cashOnDelivery">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">商品是否可以使用货到付款</span>
        </el-form-item>
        <template v-if="cfg.cashOnDelivery === 1">
          <el-form-item label="付款方式">
            <el-checkbox-group v-model="cfg.codMethods">
              <el-checkbox :value="1">付款码</el-checkbox>
              <el-checkbox :value="2">会员码</el-checkbox>
              <el-checkbox :value="3">自主付</el-checkbox>
            </el-checkbox-group>
            <span class="form-hint">货到付款时的订单付款方式</span>
          </el-form-item>
          <el-form-item label="适用区域">
            <el-cascader
              v-model="codArea"
              :options="AREA_DATA"
              :props="{ multiple: true, checkStrictly: true }"
              collapse-tags
              clearable
              style="width: 320px"
              placeholder="选择地区"
            />
            <span class="form-hint">货到付款适用区域</span>
          </el-form-item>
        </template>
        <el-form-item label="次卡时长卡">
          <el-radio-group v-model="cfg.useConsumerCard">
            <el-radio :value="1">开启抵扣</el-radio>
            <el-radio :value="0">关闭抵扣</el-radio>
          </el-radio-group>
          <span class="form-hint">若开启则商品可线上使用次卡时长卡抵扣下单</span>
        </el-form-item>
      </el-form>
    </div>

    <!-- 下单规则 -->
    <div class="set-card">
      <div class="set-group-title">下单规则</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="满额起购">
          <el-input-number v-model="cfg.fullBuy" :min="0" :precision="2" :step="1" style="width: 140px" />
          <span class="unit">元</span>
          <span class="form-hint">所选商品总价满额起购</span>
        </el-form-item>
        <el-form-item label="分销商可购">
          <el-radio-group v-model="cfg.enableFxsBuy">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">默认关闭，开启则仅分销商可购买商品</span>
        </el-form-item>
        <el-form-item v-if="cfg.enableFxsBuy === 1" label="非分销商跳转">
          <div class="link-row">
            <el-input v-model="cfg.unFxsLink" class="w320" placeholder="/pages/... 或 https://..." />
            <el-button @click="openLinkPicker('unFxsLink')">选择链接</el-button>
          </div>
          <span class="form-hint">点击查看系统链接，普通用户点击购买会跳转到该页面</span>
        </el-form-item>
        <el-form-item label="超级表单">
          <el-select v-model="cfg.useFormId" style="width: 220px">
            <el-option label="---不使用表单---" :value="0" />
            <el-option label="红包封面" :value="1" />
          </el-select>
          <span class="form-hint">选用超级表单，多个商品一起下单统一调用，单个商品下单不使用表单，请到商品相关处选择为默认设置</span>
        </el-form-item>
        <el-form-item label="成功跳转">
          <div class="link-row">
            <el-input v-model="cfg.payRedirect" class="w320" placeholder="/pages/... 或 https://..." />
            <el-button @click="openLinkPicker('payRedirect')">选择链接</el-button>
          </div>
          <span class="form-hint">选择订单支付成功后跳转页面</span>
        </el-form-item>
        <el-form-item label="失败跳转">
          <div class="link-row">
            <el-input v-model="cfg.payErrRedirect" class="w320" placeholder="/pages/... 或 https://..." />
            <el-button @click="openLinkPicker('payErrRedirect')">选择链接</el-button>
          </div>
          <span class="form-hint">选择订单支付失败后跳转页面</span>
        </el-form-item>
        <el-form-item label="备注提示">
          <el-input v-model="cfg.orderRemarks" class="w360" placeholder="订单下单页面备注框提示" />
        </el-form-item>
      </el-form>
    </div>

    <!-- 快递配送 -->
    <div class="set-card">
      <div class="set-group-title">快递配送</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="快递配送">
          <el-radio-group v-model="cfg.express">
            <el-radio :value="2">开启</el-radio>
            <el-radio :value="1">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="包邮设置">
          <el-radio-group v-model="cfg.byouType">
            <el-radio :value="1">跟随模板</el-radio>
            <el-radio :value="2">统一设置</el-radio>
          </el-radio-group>
          <span class="form-hint">商品满额包邮规则设置，统一设置为下方的满额包邮设置</span>
        </el-form-item>
        <el-form-item v-if="cfg.byouType === 2" label="满额包邮">
          <el-input-number v-model="cfg.baoyou" :min="-1" :precision="2" :step="1" style="width: 140px" />
          <span class="unit">元</span>
          <span class="form-hint">不设置或 0 表示不包邮，-1 为全场包邮</span>
        </el-form-item>
        <el-form-item label="快递名称">
          <el-radio-group v-model="cfg.kdps">
            <el-radio value="快递配送">快递配送</el-radio>
            <el-radio value="自定义">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="cfg.kdps === '自定义'" label="自定名称">
          <el-input v-model="cfg.psName" class="w300" />
        </el-form-item>
        <el-form-item label="运费规则">
          <el-radio-group v-model="cfg.freightFeeType">
            <el-radio :value="1">叠加计算</el-radio>
            <el-radio :value="2">以最高计算</el-radio>
          </el-radio-group>
          <span class="form-hint">商品下单时运费计算规则</span>
        </el-form-item>
      </el-form>
    </div>

    <!-- 同城配送 -->
    <div class="set-card">
      <div class="set-group-title">同城配送</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="同城配送">
          <el-radio-group v-model="cfg.citySend">
            <el-radio :value="2">开启</el-radio>
            <el-radio :value="1">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="cfg.citySend === 2">
          <el-form-item label="配送模板">
            <el-select v-model="cfg.citySendId" style="width: 220px">
              <el-option label="自配" :value="1" />
            </el-select>
            <span class="form-hint">开启需选择同城配送模板，去设置</span>
          </el-form-item>
          <el-form-item label="配送门店">
            <el-radio-group v-model="cfg.citySendShop">
              <el-radio :value="0">禁用</el-radio>
              <el-radio :value="1">启用</el-radio>
            </el-radio-group>
            <span class="form-hint">开启需配置门店，去设置</span>
          </el-form-item>
          <el-form-item label="配送名称">
            <el-radio-group v-model="cfg.ctps">
              <el-radio value="同城配送">同城配送</el-radio>
              <el-radio value="自定义">自定义</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="cfg.ctps === '自定义'" label="自定名称">
            <el-input v-model="cfg.ctName" class="w300" />
          </el-form-item>
        </template>
      </el-form>
    </div>

    <!-- 到店自提 -->
    <div class="set-card">
      <div class="set-group-title">到店自提</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="到店自提">
          <el-radio-group v-model="cfg.takeSelf">
            <el-radio :value="2">开启</el-radio>
            <el-radio :value="1">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="cfg.takeSelf === 2">
          <el-form-item label="自取时间">
            <el-radio-group v-model="cfg.takeTime">
              <el-radio :value="1">显示</el-radio>
              <el-radio :value="2">隐藏</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="cfg.takeTime === 1" label="自定别名">
            <el-input v-model="cfg.takeTimeName" class="w300" />
            <span class="form-hint">自取时间的自定义别名</span>
          </el-form-item>
          <el-form-item label="联系方式">
            <el-radio-group v-model="cfg.takePhone">
              <el-radio :value="1">填写</el-radio>
              <el-radio :value="2">不填</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="地址信息">
            <el-radio-group v-model="cfg.takeSelfAddress">
              <el-radio :value="1">填写</el-radio>
              <el-radio :value="0">不填</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="显示名称">
            <el-radio-group v-model="cfg.ddzq">
              <el-radio value="到店自取">到店自取</el-radio>
              <el-radio value="自定义">自定义</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="cfg.ddzq === '自定义'" label="自定名称">
            <el-input v-model="cfg.zqName" class="w300" />
          </el-form-item>
        </template>
      </el-form>
    </div>

    <!-- 订单核销 -->
    <div class="set-card">
      <div class="set-group-title">订单核销</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="支持退款">
          <el-radio-group v-model="cfg.enableOrderRefund">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关闭时间">
          <el-input-number v-model="cfg.orderCancelTime" :min="0" style="width: 140px" />
          <span class="unit">分钟</span>
          <span class="form-hint">下单后未支付订单自动关闭时间</span>
        </el-form-item>
        <el-form-item label="售后时间">
          <el-input-number v-model="cfg.supportTime" :min="0" style="width: 140px" />
          <span class="unit">天</span>
          <span class="form-hint">订单完成后可申请售后的时间</span>
        </el-form-item>
        <el-form-item label="自动收货">
          <el-input-number v-model="cfg.receiving" :min="0" style="width: 140px" />
          <span class="unit">天</span>
          <span class="form-hint">发货后自动确认收货时间</span>
        </el-form-item>
        <el-form-item label="订单有效期">
          <el-radio-group v-model="cfg.orderValidityType">
            <el-radio :value="1">固定时间</el-radio>
            <el-radio :value="2">立即生效</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="cfg.orderValidityType === 1">
          <el-form-item label="核销有效期">
            <el-date-picker
              v-model="cfg.validityStartedAt"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="开始日期"
              style="width: 160px"
            />
            <span class="unit">至</span>
            <el-date-picker
              v-model="cfg.validityEndedAt"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="结束日期"
              style="width: 160px"
            />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="有效天数">
            <el-input-number v-model="cfg.validityInterval" :min="0" style="width: 140px" />
            <span class="form-hint">当日起 N 天内有效</span>
          </el-form-item>
        </template>
      </el-form>
    </div>

    <!-- 展示 -->
    <div class="set-card">
      <div class="set-group-title">展示</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="订单轮播">
          <el-radio-group v-model="cfg.showOrderList">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">商品详情页，仅商品支持</span>
        </el-form-item>
        <el-form-item label="分销佣金">
          <el-radio-group v-model="cfg.showFxMoney">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">商品详情展示分销佣金</span>
        </el-form-item>
        <el-form-item label="价格展示">
          <el-radio-group v-model="cfg.showVipPrice">
            <el-radio :value="2">非会员不可见价格</el-radio>
            <el-radio :value="1">非会员可见最低等级会员价</el-radio>
            <el-radio :value="0">非会员不可见会员价</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="cfg.showVipPrice !== 2">
          <el-form-item label="价格文字">
            <el-input v-model="cfg.priceShowValue" class="w300" placeholder="代替价格展示的文字" />
          </el-form-item>
          <el-form-item label="按钮文字">
            <el-input v-model="cfg.priceShowName" class="w300" placeholder="代替购买按钮展示的文字" />
          </el-form-item>
          <el-form-item label="选择链接">
            <div class="link-row">
              <el-input v-model="cfg.priceShowLink" class="w320" placeholder="/pages/... 或 https://..." />
              <el-button @click="openLinkPicker('priceShowLink')">选择链接</el-button>
            </div>
          </el-form-item>
        </template>
        <el-form-item label="优惠券展示">
          <el-radio-group v-model="cfg.showCoupon">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">商品详情页展示可用优惠券</span>
        </el-form-item>
        <el-form-item label="购物车">
          <el-radio-group v-model="cfg.shoppingCart">
            <el-radio :value="1">显示</el-radio>
            <el-radio :value="0">不显示</el-radio>
          </el-radio-group>
          <span class="form-hint">商品详情页购物车功能是否展示</span>
        </el-form-item>
        <el-form-item label="客服选择">
          <el-select v-model="cfg.cusId" style="width: 220px">
            <el-option label="---不选用---" :value="0" />
            <el-option label="电话" :value="-1" />
            <el-option label="小东" :value="1" />
          </el-select>
          <span class="form-hint">除多商户外所有商品详情页微信客服选择，若不选择则使用小程序客服</span>
        </el-form-item>
        <el-form-item label="开票表单">
          <el-select v-model="cfg.invoiceFormId" style="width: 220px">
            <el-option label="---不选用---" :value="0" />
          </el-select>
          <span class="form-hint">选择应用-用户信息中创建的表单</span>
        </el-form-item>
        <el-form-item label="商品推荐">
          <el-radio-group v-model="cfg.goodsRecommend">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
          <span class="form-hint">推荐商品显示在购物车底部</span>
        </el-form-item>
        <el-form-item v-if="cfg.goodsRecommend === 1" label="关联分类">
          <el-select v-model="cfg.goodsCategories" multiple collapse-tags style="width: 360px" placeholder="选择推荐商品分类">
            <el-option v-for="c in cateOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品采集">
          <el-input v-model="cfg.nineApiKey" class="w360" placeholder="采集应用APIKEY" />
          <span class="form-hint">点击申请在我的数据接口中添加淘宝、天猫、京东商城接口</span>
        </el-form-item>
        <el-form-item label="购买评价">
          <el-radio-group v-model="cfg.isEvaluate">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="评价审核">
          <el-radio-group v-model="cfg.evaluateAudit">
            <el-radio :value="1">开启</el-radio>
            <el-radio :value="0">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
    </div>

    <!-- 分享 -->
    <div class="set-card">
      <div class="set-group-title">分享</div>
      <el-form label-width="150px" label-position="left">
        <el-form-item label="分享标题">
          <el-input v-model="cfg.shareTitle" class="w360" placeholder="商品分享默认标题" />
        </el-form-item>
        <el-form-item label="分享图">
          <div class="img-picker">
            <el-image v-if="cfg.shareImg" :src="resolveUrl(cfg.shareImg)" fit="cover" class="picker-img" :preview-src-list="[resolveUrl(cfg.shareImg)]" preview-teleported />
            <div v-else class="picker-img picker-empty" @click="pickImage"><el-icon><Plus /></el-icon></div>
            <div class="picker-ops">
              <el-button size="small" @click="pickImage">选择图片</el-button>
              <el-button v-if="cfg.shareImg" size="small" text type="danger" @click="cfg.shareImg = ''">移除</el-button>
            </div>
            <input ref="fileInput" type="file" accept="image/*" class="hide" @change="onFileChange" />
            <span class="form-hint">建议尺寸 5:4，不超过 100kb</span>
          </div>
        </el-form-item>
      </el-form>
    </div>

    <!-- 链接选择弹窗 -->
    <LinkPicker v-model="linkPickerShow" :model-link="linkPickerValue" @confirm="onLinkConfirm" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { customerApiCall, designCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import LinkPicker from '../apps/design/LinkPicker.vue';
import { AREA_DATA } from './area-data.js';

const cfg = reactive({
  // 支付规则
  onlinePay: 1, useYue: 0, cashOnDelivery: 0,
  codMethods: [], area: '', areaJson: '',
  useConsumerCard: 1,
  // 下单规则
  fullBuy: 0, enableFxsBuy: 0, unFxsLink: '', unFxsLinkType: 'page',
  useFormId: 0, payRedirect: '/pages/main_shop_order/main_shop_order', payRedirectType: 'page',
  payErrRedirect: '', payErrRedirectType: 'page', orderRemarks: '选填：建议填写和卖家商量好的内容~',
  // 快递配送
  express: 2, byouType: 2, baoyou: '', kdps: '快递配送', psName: '快递配送', freightFeeType: 1,
  // 同城配送
  citySend: 1, citySendId: 1, citySendShop: 0, ctps: '同城配送', ctName: '同城配送',
  // 到店自提
  takeSelf: 1, takeTime: 1, takeTimeName: '自取时间', takePhone: 1, takeSelfAddress: 0, ddzq: '到店自取', zqName: '到店自取',
  // 订单核销
  enableOrderRefund: 1, orderCancelTime: 30, supportTime: 15, receiving: 15,
  orderValidityType: 1, validityStartedAt: '', validityEndedAt: '', validityInterval: '',
  // 展示
  showOrderList: 1, showFxMoney: 0, showVipPrice: 0,
  priceShowValue: '', priceShowName: '点击查看', priceShowLink: '提示##非会员无法查看价格！', priceShowLinkType: 'popuptext',
  showCoupon: 1, shoppingCart: 1, cusId: 1, invoiceFormId: 0,
  goodsRecommend: '', goodsCategories: [], nineApiKey: '', isEvaluate: 1, evaluateAudit: 0,
  // 分享
  shareTitle: '', shareImg: '',
});
// 适用区域级联（areaJson 存 [{name, path}]，area 存名称串）
const codArea = ref([]);
watch(codArea, (v) => {
  const list = v || [];
  cfg.area = list.map((p) => (Array.isArray(p) ? p[p.length - 1] : p)).join(',');
  cfg.areaJson = JSON.stringify(list.map((p) => ({ name: Array.isArray(p) ? p[p.length - 1] : p, path: p })));
});
// 链接选择弹窗
const linkPickerShow = ref(false);
const linkPickerField = ref('');
const linkPickerValue = ref('');
function openLinkPicker(field) {
  linkPickerField.value = field;
  linkPickerValue.value = cfg[field] || '';
  linkPickerShow.value = true;
}
function onLinkConfirm(v) {
  cfg[linkPickerField.value] = v;
  linkPickerShow.value = false;
}

const saving = ref(false);
const fileInput = ref(null);
const cateOptions = ref([]);

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
    // 回显适用区域
    if (cfg.areaJson) {
      try {
        const arr = JSON.parse(cfg.areaJson);
        codArea.value = arr.map((x) => x.path || x.name);
      } catch (e) { codArea.value = cfg.area ? cfg.area.split(',') : []; }
    }
  } catch (e) { /* 默认值兜底 */ }
  try {
    const cats = await customerApiCall.get('/goods/categories');
    cateOptions.value = (cats || []).map((c) => ({ id: c.id, name: c.name }));
  } catch (e) { /* 分类加载失败不阻断 */ }
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
.unit { margin: 0 6px; color: #4e5969; }
.w300 { width: 300px; }
.w320 { width: 320px; }
.w360 { width: 360px; }
.link-row { display: flex; gap: 8px; align-items: center; }
.img-picker { display: flex; align-items: center; gap: 10px; }
.picker-img { width: 56px; height: 56px; border-radius: 6px; display: block; }
.picker-empty {
  border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #86909c;
}
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.hide { display: none; }
</style>
