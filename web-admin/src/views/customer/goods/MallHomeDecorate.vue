<template>
  <div class="mall-home-decorate">
    <AppPageHeader title="商城首页装修" desc="使用页面装修引擎搭建商城首页；未套用模板时，C 端商城首页默认展示「全部商品」瀑布流">
      <template #default>
        <el-button type="primary" @click="applyTemplate(null)">空白开始</el-button>
      </template>
    </AppPageHeader>

    <!-- 模板库 -->
    <div class="mhd-templates">
      <div class="mhd-tpl-title">首页模板（一键套用后可自由编辑）</div>
      <div class="mhd-tpl-grid">
        <div v-for="tpl in mallTemplates" :key="tpl.key" class="mhd-tpl-card">
          <div class="mhd-tpl-name">{{ tpl.name }}</div>
          <div class="mhd-tpl-desc">{{ tpl.desc }}</div>
          <div class="mhd-tpl-tags">
            <span v-for="tag in tpl.tags" :key="tag" class="mhd-tpl-tag">{{ tag }}</span>
          </div>
          <el-button size="small" :loading="applying === tpl.key" @click="applyTemplate(tpl)">套用此模板</el-button>
        </div>
      </div>
    </div>

    <!-- 页面编辑器（商城作用域 mall-，页面列表只显示商城页面） -->
    <div class="mhd-editor">
      <PageEditor :key="editorKey" page-type="mall-home" page-scope="mall-" @dirty-change="onDirty" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import AppPageHeader from '../../../components/AppPageHeader.vue';
import PageEditor from '../apps/design/PageEditor.vue';
import { designCall } from '../../../api';

// ==================== 3 套商城首页模板（组件引用设计中心注册表类型，props 缺省自动合并默认值） ====================
const MALL_HOME_PAGE = 'mall-home';
const MALL_HOME_NAME = '商城首页';

const mallTemplates = [
  {
    key: 't1',
    name: 'T1 标准电商',
    desc: '通用商品展示，对标菜鸟云商品首页',
    tags: ['搜索', '轮播', '公告', '分类宫格', '热销瀑布流'],
    components: [
      { type: 'search', props: { placeholder: '搜索商品', locate: 'none', showBtn: false } },
      { type: 'swiper', props: { items: [{ url: '', link: '' }, { url: '', link: '' }], height: 160, showDots: true, indicator: 'dot' } },
      { type: 'notice', props: { text: '欢迎光临本店，新品热卖中', iconType: 'system' } },
      { type: 'goods-nav', props: { title: '商品分类', showTitle: true, columns: 4, shape: 'rounded', iconRadius: 12 } },
      { type: 'title-bar', props: { styleType: 1, text: '热销推荐', subText: 'HOT', moreText: '更多', moreEnabled: true } },
      { type: 'goods-list', props: { title: '热销推荐', showTitle: false, source: 'all', sortBy: 'sales', layout: 'double', limit: 10 } },
    ],
  },
  {
    key: 't2',
    name: 'T2 同城自提',
    desc: '贴合东莞同城通·门店/到店自提场景',
    tags: ['轮播', '分类宫格', '公告', '推荐双列'],
    components: [
      { type: 'swiper', props: { items: [{ url: '', link: '' }, { url: '', link: '' }], height: 160, showDots: true, indicator: 'dot' } },
      { type: 'goods-nav', props: { title: '商品分类', showTitle: true, columns: 4, shape: 'rounded', iconRadius: 12 } },
      { type: 'notice', props: { text: '支持到店自提与同城配送，下单时可选门店', iconType: 'system' } },
      { type: 'title-bar', props: { styleType: 1, text: '为你推荐', subText: 'RECOMMEND', moreText: '更多', moreEnabled: true } },
      { type: 'goods-list', props: { title: '为你推荐', showTitle: false, source: 'all', sortBy: 'default', layout: 'double', limit: 10 } },
    ],
  },
  {
    key: 't3',
    name: 'T3 简约品牌',
    desc: '品牌形象与内容种草',
    tags: ['搜索', 'Banner', '图文卡', '精选横滑', '富文'],
    components: [
      { type: 'search', props: { placeholder: '搜索商品', locate: 'none', showBtn: false } },
      { type: 'image', props: { mode: 'standard', style: 'single', url: '', link: '', widthMode: 'full', radiusTop: 0, radiusBottom: 0 } },
      { type: 'image-text', props: { url: '', title: '品牌故事', desc: '讲述您的品牌与产品理念', textPos: 'below', align: 'left' } },
      { type: 'title-bar', props: { styleType: 1, text: '精选好物', subText: 'SELECT', moreText: '更多', moreEnabled: true } },
      { type: 'goods-list', props: { title: '精选好物', showTitle: false, source: 'all', sortBy: 'new', layout: 'scroll', limit: 8 } },
      { type: 'rich-text', props: { html: '<p style="font-size:14px;">这里是品牌详情介绍，可以放置店铺公告、服务说明等内容。</p>' } },
    ],
  },
];

const editorKey = ref(0);
const applying = ref('');
const onDirty = () => {};

async function applyTemplate(tpl) {
  const tplName = tpl ? tpl.name : '空白页面';
  try {
    await ElMessageBox.confirm(tpl ? `套用「${tplName}」将覆盖当前商城首页草稿，确认继续？` : '将清空当前商城首页草稿，确认继续？', '套用确认', { type: 'warning' });
  } catch { return; }
  applying.value = tpl ? tpl.key : 'blank';
  try {
    // 取当前版本号作为 baseVersion，避免覆盖冲突
    let baseVersion = 1;
    try {
      const cur = await designCall.get('/design/page/detail', { params: { pageType: MALL_HOME_PAGE, published: 0 } });
      if (cur?.page?.version) baseVersion = cur.page.version;
    } catch { /* 无草稿则从 v1 开始 */ }
    const designJson = { components: tpl ? tpl.components.map((c, i) => ({ id: `tpl-${tpl.key}-${i}`, ...c })) : [], meta: {} };
    await designCall.post('/design/page/saveDraft', {
      pageType: MALL_HOME_PAGE,
      pageName: MALL_HOME_NAME,
      designJson,
      baseVersion,
    });
    ElMessage.success(`「${tplName}」已套用，可在下方编辑器继续调整`);
    editorKey.value += 1; // 强制重建 PageEditor 加载新草稿
  } catch (e) {
    if (typeof e === 'string' && e.includes('已被其他成员修改')) {
      ElMessage.warning(e + '，请刷新页面重试');
    } else ElMessage.error(e);
  } finally { applying.value = ''; }
}
</script>

<style scoped>
.mall-home-decorate { display: flex; flex-direction: column; gap: 16px; }
.mhd-templates { background: #fff; border-radius: 8px; padding: 16px 20px; }
.mhd-tpl-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 12px; }
.mhd-tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.mhd-tpl-card { border: 1px solid #e5e6eb; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.mhd-tpl-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.mhd-tpl-desc { font-size: 12px; color: #86909c; }
.mhd-tpl-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.mhd-tpl-tag { font-size: 11px; color: #165dff; background: rgba(22,93,255,.06); border-radius: 4px; padding: 2px 8px; }
.mhd-editor { background: #fff; border-radius: 8px; overflow: hidden; }
</style>
