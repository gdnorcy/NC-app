<script>
export default {
  globalData: {
    channelConfig: null,
    apiBase: '',
    customerId: null,
  },
  onLaunch() {
    console.log('App Launch');
    this.initChannel();
  },
  onShow() {
    console.log('App Show');
  },
  onHide() {
    console.log('App Hide');
  },
  methods: {
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
        this.globalData.apiBase = 'https://your-api-domain.com'; // 发布时替换为实际域名
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
            uni.setNavigationBarTitle({ title: res.data.brandName || '360全景' });
            console.log('渠道初始化成功:', res.data);
          }
        }
      } catch (e) {
        console.error('渠道初始化失败:', e);
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
</style>
