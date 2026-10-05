<script>
import { fetchDesignConfig, applyDesignStyle } from './utils/design.js';
import { getTid } from './utils/mallUtil.js';
import { getNavMetrics } from './utils/navMetrics.js';

export default {
  globalData: {
    channelConfig: null,
    apiBase: '',
    customerId: null,
  },
  onLaunch(options) {
    console.log('App Launch');
    // 记录租户上下文（供模板/商城/全景按租户加载）：
    // 小程序：分享/扫码进入带 tid；H5：getTid 内部直读顶层 query（/mall/?tid=1 与 /pano 对齐）
    getTid(options);
    this.initNavVars();
    this.initChannel();
    this.initDesignConfig();
  },
  onShow() {
    console.log('App Show');
  },
  onHide() {
    console.log('App Hide');
  },
  methods: {
    /**
     * 启动时预热导航度量缓存，并做一次真机调试输出。
     *
     * 注意：沉浸式页面里**渐变 hero 类的 padding** 用的是 CSS 变量
     * （`var(--pnv-status-bar)` / `var(--pnv-capsule-pad)`），因为它们写在 scoped CSS 里
     * 不能像 PageNav 那样用内联 :style 绑定。小程序端不支持运行时注入 <style>，
     * 所以 App.vue 的全局样式给出**保守 fallback 值**（20px 状态栏 / 7px 胶囊），
     * 真实机型值由 PageNav 组件（用内联样式）负责精确控制。
     * 两处并存时以 PageNav 的内联值为准。
     */
    initNavVars() {
      const m = getNavMetrics();
      console.log('[nav] 状态栏高度=' + m.statusBarHeight + 'px 导航栏高度=' + m.navBarHeight + 'px 胶囊右侧避让=' + m.capsuleRightPad + 'px');
    },
    async initChannel() {
      try {
        // 获取当前小程序的appid
        let appid = '';
        // #ifdef MP-WEIXIN
        const accountInfo = uni.getAccountInfoSync();
        appid = accountInfo.miniProgram.appId;
        // #endif

        // H5端从URL参数获取customer_id
        // #ifdef H5
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        const options = currentPage?.options || {};
        const customerId = options.customer_id || uni.getStorageSync('channel_customer_id');
        if (customerId) {
          uni.setStorageSync('channel_customer_id', customerId);
          this.globalData.customerId = customerId;
        }
        // #endif

        // 构建API基础地址
        // #ifdef MP-WEIXIN
        this.globalData.apiBase = 'http://localhost:3000'; // 开发默认本地；发布时替换为实际 HTTPS 域名
        // #endif
        // #ifdef H5
        this.globalData.apiBase = location.origin;
        // #endif

        // 调用渠道初始化接口
        if (appid) {
          const res = await uni.request({
            url: `${this.globalData.apiBase}/api/channel/init`,
            data: { appid },
          });
          if (res.data && res.data.customerId) {
            this.globalData.channelConfig = res.data;
            this.globalData.customerId = res.data.customerId;
            uni.setStorageSync('channel_config', res.data);
            // 动态设置导航栏标题
            uni.setNavigationBarTitle({ title: res.data.brandName || '零壹系统云' });
            console.log('渠道初始化成功:', res.data);
          }
        }
      } catch (e) {
        console.error('渠道初始化失败:', e);
      }
    },
    // 设计中心：登录态拉取租户发布配置（风格/导航/首页），H5 注入 CSS 变量
    async initDesignConfig() {
      if (!uni.getStorageSync('card_token')) return;
      try {
        const config = await fetchDesignConfig(false);
        if (config) {
          // #ifdef H5
          applyDesignStyle(config);
          // #endif
        }
      } catch (e) {
        console.error('设计配置加载失败:', e);
      }
    },
  },
};
</script>

<style>
/* 全局样式 */
page {
  background-color: #f5f7fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* 沉浸式导航度量（保守 fallback）
   真实机型值由 PageNav 组件用内联样式精确注入；这里给默认值，供写在 scoped CSS 里
   无法用内联样式的渐变 hero（名片详情/会员中心等）消费。
   ⚠️ 小程序端不支持运行时注入 <style>，所以这里只能是固定值；
      若要精确适配刘海机，应把这些 padding 也改成 :style 内联绑定。 */
page {
  --pnv-status-bar: 20px;
  --pnv-capsule-pad: 7px;
}

/* ===== 小程序原生 <button> 重置（关键）=====
   微信原生 button 自带三处样式，会在自定义按钮上露出破绽：
   1) ::after 有 1px solid rgba(0,0,0,.2) 边框 → 按钮上出现一条"黑线"
      （页面若自定义了 ::after 的高光层但没写 border:none，原生边框会跟着高光层一起显示）
   2) margin-left/right: auto → 在 flex 行里会吸收剩余空间，破坏 flex:1 与 gap 布局
   3) padding-left/right: 14px + line-height: 2.5555 → 文字不居中、按钮变高
   统一在此抹平，各页面的自定义样式即可只管视觉。 */
button {
  margin: 0;
  padding-left: 0;
  padding-right: 0;
  box-sizing: border-box;
}
button::after {
  border: none;
}

/* placeholder-class="ph" 的通用色（小程序端 placeholder 是独立节点，
   不继承 input 的 color，必须显式给色，否则浅色皮肤上会显示为深色） */
.ph {
  color: #9a9a9a;
}
</style>
