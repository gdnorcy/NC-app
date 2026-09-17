<template>
  <div class="goods-edit">
    <AppPageHeader :title="isEdit ? '编辑商品' : '添加商品'" desc="商品信息按页签分组：基础信息 / 价格设置 / 参数设置 / 内容设置 / 营销设置 / 会员设置 / 分销设置 / 高级设置">
      <div class="hd-actions">
        <el-button @click="goBack">返回列表</el-button>
      </div>
    </AppPageHeader>

    <!-- 类型 Tab（对标菜鸟云：普通商品/卡密商品/虚拟商品 三类型默认全开放，无需应用授权） -->
    <div class="type-tabs">
      <div class="type-tab" :class="{ active: topType === 1 }" @click="setType(1)">普通商品</div>
      <div class="type-tab" :class="{ active: topType === 3 }" @click="setType(3)">卡密商品</div>
      <div class="type-tab" :class="{ active: topType === 4 }" @click="setType(4)">虚拟商品</div>
    </div>

    <el-tabs v-model="tab" class="edit-tabs">
      <!-- ============ 基础信息 ============ -->
      <el-tab-pane label="基础信息" name="base">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="排序"><el-input-number v-model="g.sortOrder" :min="0" controls-position="right" /></el-form-item>
          <el-form-item label="状态">
            <el-radio-group v-model="g.status">
              <el-radio value="sell">上架</el-radio>
              <el-radio value="off">下架</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="所属分类" required>
            <el-cascader
              v-model="g.cateIds"
              :options="cateOptions"
              :props="{ value: 'id', label: 'name', children: 'children', checkStrictly: true }"
              placeholder="请选择分类（可多选）"
              clearable
              multiple
              style="width: 420px"
            />
          </el-form-item>
          <el-form-item label="商品名称" required>
            <el-input v-model="g.title" placeholder="请输入商品名称" maxlength="60" style="width: 420px" />
          </el-form-item>
          <el-form-item label="轮播图（750×750）">
            <div class="img-list">
              <div v-for="(img, i) in g.images" :key="i" class="img-item">
                <el-image :src="resolveUrl(img)" fit="cover" class="img-box" :preview-src-list="g.images.map(resolveUrl)" preview-teleported />
                <span class="img-del" @click="g.images.splice(i, 1)"><el-icon><Close /></el-icon></span>
              </div>
              <div class="img-item img-add" @click="openPicker('images')"><el-icon><Plus /></el-icon></div>
            </div>
            <div class="form-hint">建议上传 750×750 正方形图片，单张不超过 100KB</div>
          </el-form-item>
          <el-form-item label="缩略图">
            <div class="img-picker">
              <el-image v-if="g.thumb" :src="resolveUrl(g.thumb)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(g.thumb)]" preview-teleported />
              <div v-else class="thumb-box thumb-empty" @click="openPicker('thumb')"><el-icon><Plus /></el-icon></div>
              <div class="picker-ops">
                <el-button size="small" @click="openPicker('thumb')">选择图片</el-button>
                <el-button v-if="g.thumb" size="small" text type="danger" @click="g.thumb = ''">移除</el-button>
              </div>
            </div>
            <div class="form-hint">双列展示建议 400×400，单列展示建议 750×750</div>
          </el-form-item>
          <el-form-item label="取货方式">
            <el-radio-group v-model="g.pickup">
              <el-radio value="express">快递物流</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="运费方式">
            <el-radio-group v-model="g.freightMode" class="inline">
              <el-radio value="fixed">固定运费</el-radio>
              <el-radio value="template">运费模板</el-radio>
            </el-radio-group>
            <el-input-number v-if="g.freightMode === 'fixed'" v-model="g.fixedFreight" :min="0" :precision="2" controls-position="right" class="ml12" />
            <span v-if="g.freightMode === 'fixed'" class="form-hint">元</span>
            <span v-else class="form-hint">运费模板（二期开放）</span>
          </el-form-item>
          <el-form-item label="商品详情">
            <RichTextEditor v-model="g.info" class="rich-editor" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 价格设置 ============ -->
      <el-tab-pane label="价格设置" name="price">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="售卖方式">
            <el-radio-group v-model="g.saleMode">
              <el-radio value="online">线上销售</el-radio>
              <el-radio value="consult">价格面议</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="规格">
            <el-radio-group v-model="g.specMode">
              <el-radio value="single">单规格</el-radio>
              <el-radio value="multi">多规格</el-radio>
            </el-radio-group>
          </el-form-item>

          <template v-if="g.specMode === 'single'">
            <el-form-item label="库存">
              <el-input-number v-model="g.stock" :min="0" controls-position="right" />
              <span class="form-hint">库存为 0 时商品不上架</span>
            </el-form-item>
            <el-form-item label="起购数量"><el-input-number v-model="g.minBuy" :min="1" controls-position="right" /></el-form-item>
            <el-form-item label="重量（KG）"><el-input-number v-model="g.weight" :min="0" :precision="2" controls-position="right" /></el-form-item>
            <el-form-item label="售价"><el-input-number v-model="g.price" :min="0" :precision="2" controls-position="right" class="price-input" /></el-form-item>
          </template>
          <template v-else>
            <!-- 多规格：规格名 + 规格值 → 自动组合 SKU -->
            <el-form-item label="规格名">
              <el-input v-model="specName" placeholder="如：颜色" class="w240" @change="rebuildSkus" />
            </el-form-item>
            <el-form-item label="规格值">
              <el-input v-model="specValuesText" placeholder="多个值用英文逗号分隔，如：红色,蓝色" class="w420" @change="rebuildSkus" />
            </el-form-item>
            <el-form-item label="规格明细">
              <el-table :data="g.skus" size="small" border class="sku-table">
                <el-table-column label="规格" min-width="140">
                  <template #default="{ row }">
                    <span v-for="(v, k) in row.specJson" :key="k" class="sku-spec">{{ k }}：{{ v }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="售价" width="140">
                  <template #default="{ row }"><el-input-number v-model="row.price" :min="0" :precision="2" size="small" controls-position="right" class="w-full" /></template>
                </el-table-column>
                <el-table-column label="库存" width="140">
                  <template #default="{ row }"><el-input-number v-model="row.stock" :min="0" size="small" controls-position="right" class="w-full" /></template>
                </el-table-column>
              </el-table>
              <div class="form-hint">组合后的规格明细逐行填写售价与库存；主售价为第一个规格价</div>
            </el-form-item>
          </template>

          <el-form-item label="市场价"><el-input-number v-model="g.marketPrice" :min="0" :precision="2" controls-position="right" /></el-form-item>
          <el-form-item label="成本价"><el-input-number v-model="g.costPrice" :min="0" :precision="2" controls-position="right" /></el-form-item>
          <el-form-item label="货号"><el-input v-model="g.goodsNo" placeholder="商品货号/编码" class="w240" /></el-form-item>
          <el-form-item label="会员价">
            <el-radio-group v-model="g.memberPrice.mode" class="inline">
              <el-radio value="none">暂无折扣</el-radio>
              <el-radio value="default">默认设置</el-radio>
              <el-radio value="custom">单独设置</el-radio>
            </el-radio-group>
            <div v-if="g.memberPrice.mode === 'custom'" class="member-price-list">
              <div v-for="(mp, i) in g.memberPrice.list || []" :key="i" class="member-price-row">
                <el-input v-model="mp.level" placeholder="会员等级" class="w160" />
                <el-select v-model="mp.type" class="w120">
                  <el-option label="折扣(%)" value="discount" />
                  <el-option label="固定价(元)" value="fixed" />
                </el-select>
                <el-input-number v-model="mp.value" :min="0" :precision="2" controls-position="right" />
                <el-button size="small" text type="danger" @click="g.memberPrice.list.splice(i, 1)">删除</el-button>
              </div>
              <el-button size="small" @click="(g.memberPrice.list = g.memberPrice.list || []).push({ level: '', type: 'discount', value: 0 })">添加会员等级</el-button>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 参数设置 ============ -->
      <el-tab-pane label="参数设置" name="param">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="参数名称">
            <el-select v-model="paramName" placeholder="默认：商品参数" clearable filterable class="w240" @change="onParamNameChange">
              <el-option v-for="p in paramTpls" :key="p.id" :label="p.name" :value="p.name" />
            </el-select>
            <span class="form-hint">可从「商品参数」模板选择</span>
          </el-form-item>
          <el-form-item label="商品参数">
            <div class="param-rows">
              <div v-for="(p, i) in g.param" :key="i" class="param-row">
                <el-input v-model="p.name" placeholder="参数名，如：品牌" class="w200" />
                <el-input v-model="p.content" placeholder="参数值，如：华为" class="w240" />
                <el-button size="small" text type="danger" @click="g.param.splice(i, 1)">删除</el-button>
              </div>
              <el-button size="small" type="primary" plain @click="g.param.push({ name: paramName || '商品参数', content: '' })">添加参数</el-button>
            </div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 内容设置 ============ -->
      <el-tab-pane label="内容设置" name="content">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="推荐商品"><el-switch v-model="g.recommend" /><span class="form-hint">在首页/推荐位展示</span></el-form-item>
          <el-form-item label="商品单位"><el-input v-model="g.unit" placeholder="如：件、个、份" class="w180" /></el-form-item>
          <el-form-item label="浏览次数"><el-input-number v-model="g.views" :min="0" controls-position="right" /></el-form-item>
          <el-form-item label="真实销量"><el-input-number v-model="g.realSales" :min="0" controls-position="right" /></el-form-item>
          <el-form-item label="虚拟销量"><el-input-number v-model="g.fakeSales" :min="0" controls-position="right" /></el-form-item>
          <el-form-item label="虚拟人数"><el-input-number v-model="g.fakePeople" :min="0" controls-position="right" /></el-form-item>
          <el-form-item label="超级表单">
            <el-radio-group v-model="g.superForm">
              <el-radio value="default">默认</el-radio>
              <el-radio value="custom">单独</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="商品视频">
            <el-input v-model="g.video" placeholder="腾讯视频网址或本地 mp4 链接" class="w420" />
          </el-form-item>
          <el-form-item label="视频封面（1:1）">
            <div class="img-picker">
              <el-image v-if="g.videoCover" :src="resolveUrl(g.videoCover)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(g.videoCover)]" preview-teleported />
              <div v-else class="thumb-box thumb-empty" @click="openPicker('videoCover')"><el-icon><Plus /></el-icon></div>
              <el-button size="small" @click="openPicker('videoCover')">选择图片</el-button>
            </div>
          </el-form-item>
          <el-form-item label="播放设置">
            <el-radio-group v-model="g.videoPlay">
              <el-radio value="popup">弹窗</el-radio>
              <el-radio value="full">全屏</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="商品标签">
            <el-input v-model="g.tags" placeholder="多个标签用英文逗号分隔，如：新品,热卖" class="w420" />
          </el-form-item>
          <el-form-item label="商品简介"><el-input v-model="g.brief" type="textarea" :rows="2" placeholder="简短卖点描述" class="w420" maxlength="200" /></el-form-item>
          <el-form-item label="品牌标签"><el-input v-model="g.brandTag" placeholder="品牌标签（商城风格配置的品牌）" class="w240" /></el-form-item>
          <el-form-item label="标题标签"><el-input v-model="g.titleTag" placeholder="标题标签" class="w240" /></el-form-item>
          <el-form-item label="服务保障">
            <el-checkbox-group v-model="g.service">
              <el-checkbox value="正品保障">正品保障</el-checkbox>
              <el-checkbox value="七天退换">七天退换</el-checkbox>
              <el-checkbox value="极速退款">极速退款</el-checkbox>
              <el-checkbox value="免费包邮">免费包邮</el-checkbox>
              <el-checkbox value="假一赔十">假一赔十</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 营销设置 ============ -->
      <el-tab-pane label="营销设置" name="marketing">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="抵用积分"><el-input-number v-model="g.marketing.points" :min="0" controls-position="right" /><span class="form-hint">购买可抵用积分数</span></el-form-item>
          <el-form-item label="买送积分">
            <el-input v-model="g.marketing.buyPoints" placeholder="送积分数或百分比，如：10 或 5%" class="w240" />
          </el-form-item>
          <el-form-item label="买送余额"><el-input-number v-model="g.marketing.buyBalance" :min="0" :precision="2" controls-position="right" /></el-form-item>
          <el-form-item label="买送优惠券">
            <el-switch v-model="g.marketing.coupon" />
            <span class="form-hint">购买后赠送优惠券</span>
          </el-form-item>
          <el-form-item label="分享积分">
            <el-switch v-model="g.marketing.share" />
            <span class="form-hint">分享商品赠送积分</span>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 会员设置 ============ -->
      <el-tab-pane label="会员设置" name="member">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="价格展示">
            <el-radio-group v-model="g.member.priceShow">
              <el-radio value="default">默认</el-radio>
              <el-radio value="custom">独立</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="会员专享">
            <el-radio-group v-model="g.member.exclusive">
              <el-radio value="all">选择等级</el-radio>
              <el-radio value="default">默认</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 分销设置 ============ -->
      <el-tab-pane label="分销设置" name="distribution">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="分销规则">
            <el-radio-group v-model="g.distribution.rule">
              <el-radio value="off">关闭</el-radio>
              <el-radio value="default">默认</el-radio>
              <el-radio value="custom">单独</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ============ 高级设置 ============ -->
      <el-tab-pane label="高级设置" name="advanced">
        <el-form label-width="140px" label-position="left" class="edit-form">
          <el-form-item label="供应厂商"><el-input v-model="g.advanced.supplier" placeholder="供应厂商" class="w240" /></el-form-item>
          <el-form-item label="商品限购">
            <el-switch v-model="g.advanced.limitBuy" />
            <el-input-number v-if="g.advanced.limitBuy" v-model="g.advanced.limitBuyCount" :min="1" controls-position="right" class="ml12" />
            <span class="form-hint">每人限购数量</span>
          </el-form-item>
          <el-form-item label="库存扣减">
            <el-radio-group v-model="g.advanced.stockMode">
              <el-radio value="order">下单减</el-radio>
              <el-radio value="pay">付款减</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="备注说明"><el-input v-model="g.advanced.remark" type="textarea" :rows="2" class="w420" placeholder="商品备注说明" /></el-form-item>
          <el-form-item label="分享标题"><el-input v-model="g.advanced.shareTitle" placeholder="商品分享默认标题" class="w420" /></el-form-item>
          <el-form-item label="分享图（5:4）">
            <div class="img-picker">
              <el-image v-if="g.advanced.shareImg" :src="resolveUrl(g.advanced.shareImg)" fit="cover" class="thumb-box" :preview-src-list="[resolveUrl(g.advanced.shareImg)]" preview-teleported />
              <div v-else class="thumb-box thumb-empty" @click="openPicker('shareImg')"><el-icon><Plus /></el-icon></div>
              <el-button size="small" @click="openPicker('shareImg')">选择图片</el-button>
            </div>
          </el-form-item>
          <el-form-item label="购买方式">
            <el-input v-model="g.advanced.buyBtn" placeholder="自定义「立即购买」按钮名称" class="w240" />
          </el-form-item>
          <el-form-item label="购物车设置">
            <el-radio-group v-model="g.advanced.cart">
              <el-radio value="default">默认</el-radio>
              <el-radio value="custom">单独</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="推广链接">
            <el-input v-model="g.advanced.promoLinks" placeholder="抖音/快手/淘宝链接（多个用英文逗号分隔）" class="w420" />
            <div class="form-hint">按钮名称不超过 6 字，默认「添加到橱窗」</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <div class="save-bar">
      <el-button @click="goBack">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save(false)">保存</el-button>
      <el-button type="primary" plain :loading="saving" @click="save(true)">保存并返回列表</el-button>
    </div>

    <MaterialPicker v-model="picker.show" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Plus, Close } from '@element-plus/icons-vue';
import { customerApiCall } from '../../../api';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import RichTextEditor from '../apps/design/RichTextEditor.vue';
import MaterialPicker from '../apps/design/MaterialPicker.vue';

const route = useRoute();
const router = useRouter();
const goodsId = computed(() => Number(route.query.id) || 0);
const isEdit = computed(() => goodsId.value > 0);

const tab = ref('base');
const topType = ref(1);
const licenses = ref([]);
const cateOptions = ref([]);
const paramTpls = ref([]);
const saving = ref(false);
const paramName = ref('商品参数');
const specName = ref('');
const specValuesText = ref('');
const picker = ref({ show: false, target: '' });

const g = reactive({
  topType: 1, type: 'normal', status: 'sell', sortOrder: 0, title: '', cateIds: [],
  images: [], thumb: '', info: '', pickup: 'express', freightMode: 'fixed', fixedFreight: 0,
  saleMode: 'online', specMode: 'single', stock: 0, minBuy: 1, weight: 0, price: 0,
  marketPrice: 0, costPrice: 0, goodsNo: '', memberPrice: { mode: 'none', list: [] },
  param: [], recommend: false, unit: '', views: 0, realSales: 0, fakeSales: 0, fakePeople: 0,
  superForm: 'default', video: '', videoCover: '', videoPlay: 'popup', tags: '', brief: '',
  brandTag: '', titleTag: '', service: [], marketing: { points: 0, buyPoints: '', buyBalance: 0, coupon: false, share: false },
  member: { priceShow: 'default', exclusive: 'default' },
  distribution: { rule: 'off' },
  advanced: { supplier: '', limitBuy: false, limitBuyCount: 1, stockMode: 'order', remark: '', shareTitle: '', shareImg: '', buyBtn: '', cart: 'default', promoLinks: '' },
  skus: [],
});

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

function setType(t) {
  topType.value = t;
  g.topType = t;
  g.type = { 1: 'normal', 3: 'carmi', 4: 'virtual' }[t] || 'normal';
}

async function loadMeta() {
  try {
    const [cates, params, lic] = await Promise.all([
      customerApiCall.get('/goods/categories'),
      customerApiCall.get('/goods/params'),
      customerApiCall.get('/goods/licenses'),
    ]);
    console.log('[GoodsEdit] loadMeta ok', JSON.stringify({ cates: cates?.tree?.length, params: params?.list?.length, lic: lic?.apps }));
    cateOptions.value = cates.tree || [];
    paramTpls.value = params.list || [];
    licenses.value = lic.apps || [];
  } catch (e) { console.error('[GoodsEdit] loadMeta fail', e); }
}

async function loadGoods() {
  if (!goodsId.value) return;
  try {
    const d = await customerApiCall.get(`/goods/${goodsId.value}`);
    Object.keys(g).forEach((k) => {
      if (k === 'skus') {
        g.skus = (d.skus || []).map((s) => ({ price: s.price, stock: s.stock, specJson: JSON.parse(s.spec_json || '{}') }));
        // 多规格回显：由第一个 SKU 反推 规格名/规格值
        if (g.skus.length) {
          const first = g.skus[0].specJson || {};
          specName.value = Object.keys(first)[0] || '';
          specValuesText.value = g.skus.map((s) => (s.specJson || {})[specName.value]).filter(Boolean).join(',');
        }
      } else if (d[k] !== undefined) g[k] = d[k];
    });
    topType.value = g.topType;
    g.cateIds = (g.cateIds || []).map(Number);
    g.recommend = !!g.recommend;
    g.memberPrice = { mode: g.memberPrice.mode || 'none', list: g.memberPrice.list || [] };
    g.marketing = { points: 0, buyPoints: '', buyBalance: 0, coupon: false, share: false, ...(g.marketing || {}) };
    g.member = { priceShow: 'default', exclusive: 'default', ...(g.member || {}) };
    g.distribution = { rule: 'off', ...(g.distribution || {}) };
    g.advanced = { supplier: '', limitBuy: false, limitBuyCount: 1, stockMode: 'order', remark: '', shareTitle: '', shareImg: '', buyBtn: '', cart: 'default', promoLinks: '', ...(g.advanced || {}) };
    g.service = g.service || [];
    g.param = g.param || [];
  } catch (e) { ElMessage.error(e); }
}

// 多规格：规格名+规格值 → 组合 SKU（笛卡尔积）
function rebuildSkus() {
  if (g.specMode !== 'multi') return;
  const name = specName.value.trim();
  const values = specValuesText.value.split(/[,，]/).map((v) => v.trim()).filter(Boolean);
  if (!name || !values.length) return;
  g.skus = values.map((v) => ({
    specJson: { [name]: v },
    price: g.price,
    stock: g.stock,
  }));
  // 多规格下主价格 = 第一个 SKU 价格
  if (g.skus.length) g.price = g.skus[0].price;
}
// 切到多规格且尚无 SKU 时自动按当前规格名/值生成
watch(() => g.specMode, (v) => {
  if (v === 'multi' && !g.skus.length) rebuildSkus();
});

function onParamNameChange(v) { if (v) paramName.value = v; }

function openPicker(target) {
  picker.value = { show: true, target };
}
function onPickImg(url) {
  if (!url) return;
  if (picker.value.target === 'images') g.images.push(url);
  else if (picker.value.target === 'thumb') g.thumb = url;
  else if (picker.value.target === 'videoCover') g.videoCover = url;
  else if (picker.value.target === 'shareImg') g.advanced.shareImg = url;
}

async function save(backToList) {
  if (!g.title.trim()) { ElMessage.warning('请输入商品名称'); tab.value = 'base'; return; }
  saving.value = true;
  try {
    const payload = JSON.parse(JSON.stringify(g));
    if (payload.specMode === 'multi') {
      payload.skus = payload.skus || [];
      if (payload.skus.length) payload.price = payload.skus[0].price;
    } else {
      payload.skus = [];
    }
    let id = goodsId.value;
    if (id) {
      await customerApiCall.put(`/goods/${id}`, payload);
      ElMessage.success('已保存');
    } else {
      const r = await customerApiCall.post('/goods', payload);
      id = r.id;
      ElMessage.success('已创建');
    }
    if (backToList) goBack();
    else router.replace(`/goods/edit?id=${id}`);
  } catch (e) { ElMessage.error(e); } finally { saving.value = false; }
}

function goBack() {
  router.push('/goods?m=list&top=goods');
}

onMounted(async () => {
  await loadMeta();
  await loadGoods();
});
</script>

<style scoped>
.hd-actions { display: flex; gap: 8px; }
.type-tabs { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.type-tab {
  padding: 8px 18px; border-radius: 8px; font-size: 14px; color: #4e5969;
  background: #f7f8fa; border: 1px solid #e5e6eb; cursor: pointer; transition: all 0.2s;
}
.type-tab.active { background: #e8f3ff; color: #165dff; border-color: rgba(22, 93, 255, 0.3); font-weight: 500; }
.type-hint { font-size: 12px; color: #86909c; }
.edit-tabs { background: #fff; border-radius: 8px; padding: 8px 16px; }
.edit-form { max-width: 760px; padding: 8px 0 20px; }
.form-hint { font-size: 12px; color: #86909c; margin-left: 10px; line-height: 1.5; }
.ml12 { margin-left: 12px; }
.inline { display: inline-flex; }
.w180 { width: 180px; }
.w240 { width: 240px; }
.w420 { width: 420px; }
.w-full { width: 100%; }
.price-input { width: 180px; }
.img-list { display: flex; flex-wrap: wrap; gap: 8px; }
.img-item { position: relative; }
.img-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.img-add {
  width: 72px; height: 72px; border: 1px dashed #c9cdd4; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; color: #86909c; cursor: pointer; background: #f7f8fa;
}
.img-add:hover { color: #165dff; border-color: #165dff; }
.img-del {
  position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; border-radius: 50%;
  background: #f53f3f; color: #fff; display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 12px;
}
.img-picker { display: flex; align-items: center; gap: 10px; }
.thumb-box { width: 72px; height: 72px; border-radius: 6px; display: block; border: 1px solid #e5e6eb; }
.thumb-empty {
  border: 1px dashed #c9cdd4; background: #f7f8fa; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: #86909c;
}
.picker-ops { display: flex; flex-direction: column; gap: 4px; }
.rich-editor { width: 100%; }
.sku-table { width: 620px; }
.sku-spec { margin-right: 10px; }
.member-price-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; width: 100%; }
.member-price-row { display: flex; gap: 8px; align-items: center; }
.param-rows { display: flex; flex-direction: column; gap: 8px; }
.param-row { display: flex; gap: 8px; align-items: center; }
.save-bar {
  display: flex; justify-content: flex-end; gap: 12px;
  background: #fff; border-radius: 8px; padding: 14px 20px; margin-top: 16px;
}
</style>
