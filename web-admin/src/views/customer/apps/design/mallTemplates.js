// 商城首页模板库（设计中心「模板库」入口使用）
// - 组件引用设计中心注册表类型（componentRegistry），props 缺省自动合并默认值
// - 新增行业应用（内容/直播等）可参照此文件在 DesignEditorPage 预置模板
export const MALL_HOME_PAGE = 'mall-home';
export const MALL_HOME_NAME = '商城首页';

export const mallTemplates = [
  {
    key: 't1',
    name: 'T1 标准电商',
    desc: '通用商品展示，对标菜鸟云商品首页',
    tags: ['搜索', '轮播', '公告', '分类宫格', '热销瀑布流'],
    components: [
      { type: 'search', props: { placeholder: '搜索商品', locate: 'none', showBtn: false } },
      { type: 'swiper', props: { items: [{ url: '', link: '' }, { url: '', link: '' }], height: 160, showDots: true, indicator: 'dot' } },
      { type: 'notice', props: { text: '欢迎光临本店，新品热卖中', iconType: 'system' } },
      { type: 'title-bar', props: { styleType: 1, text: '热销推荐', subText: 'HOT', moreText: '更多', moreEnabled: true } },
      { type: 'goods-group', props: { title: '热销推荐', showTitle: false, source: 'all', sortBy: 'sales', layout: 'double', limit: 10 } },
    ],
  },
  {
    key: 't2',
    name: 'T2 同城自提',
    desc: '贴合东莞同城通·门店/到店自提场景',
    tags: ['轮播', '分类宫格', '公告', '推荐双列'],
    components: [
      { type: 'swiper', props: { items: [{ url: '', link: '' }, { url: '', link: '' }], height: 160, showDots: true, indicator: 'dot' } },
      { type: 'notice', props: { text: '支持到店自提与同城配送，下单时可选门店', iconType: 'system' } },
      { type: 'title-bar', props: { styleType: 1, text: '为你推荐', subText: 'RECOMMEND', moreText: '更多', moreEnabled: true } },
      { type: 'goods-group', props: { title: '为你推荐', showTitle: false, source: 'all', sortBy: 'default', layout: 'double', limit: 10 } },
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
      { type: 'goods-swiper', props: { title: '精选好物', showTitle: false, sortBy: 'new', limit: 8 } },
      { type: 'rich-text', props: { html: '<p style="font-size:14px;">这里是品牌详情介绍，可以放置店铺公告、服务说明等内容。</p>' } },
    ],
  },
];
