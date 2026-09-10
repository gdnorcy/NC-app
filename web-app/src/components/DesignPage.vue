<template>
  <view class="design-page">
    <view v-for="(c, i) in comps" :key="i" class="dp-item" :style="containerStyle(c)">
      <!-- 标题 -->
      <view v-if="c.type === 'title'" class="dp-title" :style="{ color: c.props.color, textAlign: c.props.align }">
        <text>{{ c.props.text || '标题文字' }}</text>
      </view>
      <!-- 文本 -->
      <view v-else-if="c.type === 'text'" class="dp-text" :style="{ color: c.props.color, textAlign: c.props.align, fontSize: c.props.size + 'px' }">
        <text>{{ c.props.text || '文本内容' }}</text>
      </view>
      <!-- 图片 -->
      <view v-else-if="c.type === 'image'" class="dp-image" @click="onJump(c.props.link)">
        <image v-if="c.props.url" :src="resolveUrl(c.props.url)" mode="widthFix" class="dp-image-img" />
        <view v-else class="dp-image-empty"><text>图片</text></view>
      </view>
      <!-- 按钮 -->
      <view v-else-if="c.type === 'button'" class="dp-btn" :class="{ auto: c.props.widthMode === 'auto' }" :style="dpBtnStyle(c.props)" @click="onJump(c.props.url)">
        <text>{{ c.props.text || '按钮' }}</text>
      </view>
      <!-- 分割线 -->
      <view v-else-if="c.type === 'divider'" class="dp-divider">
        <view class="dp-divider-line"></view>
        <text v-if="c.props.text" class="dp-divider-text">{{ c.props.text }}</text>
      </view>
      <!-- 公告 -->
      <view v-else-if="c.type === 'notice'" class="dp-notice" :style="dpNoticeStyle(c.props)" @click="onJump(c.props.url)">
        <text v-if="c.props.showIcon" class="dp-notice-tag">公告</text>
        <text v-if="dpNoticeList(c.props).length" class="dp-notice-text">{{ dpNoticeList(c.props)[0].text }}</text>
        <text v-else class="dp-notice-text">{{ c.props.text || '公告内容' }}</text>
      </view>
      <!-- 倒计时 -->
      <view v-else-if="c.type === 'countdown'" class="dp-countdown" :style="{ '--cd': c.props.color || '#165dff' }">
        <text class="dp-cd-title">{{ c.props.title || '限时活动' }}</text>
        <view class="dp-cd-cols">
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.days || '00' }}</text><text class="dp-cd-unit">天</text></view>
          <text class="dp-cd-colon">:</text>
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.hours || '00' }}</text><text class="dp-cd-unit">时</text></view>
          <text class="dp-cd-colon">:</text>
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.minutes || '00' }}</text><text class="dp-cd-unit">分</text></view>
          <text class="dp-cd-colon">:</text>
          <view class="dp-cd-cell"><text class="dp-cd-num">{{ c.props.seconds || '00' }}</text><text class="dp-cd-unit">秒</text></view>
        </view>
      </view>
      <!-- 表单 -->
      <view v-else-if="c.type === 'form'" class="dp-form">
        <text class="dp-form-title">{{ c.props.title || '留资表单' }}</text>
        <view class="dp-form-input"><text>{{ c.props.namePlaceholder || '请输入姓名' }}</text></view>
        <view class="dp-form-input"><text>{{ c.props.phonePlaceholder || '请输入手机号' }}</text></view>
        <view class="dp-form-btn" :style="{ background: c.props.btnColor || '#165dff' }"><text>{{ c.props.submitText || '提交' }}</text></view>
      </view>
      <!-- 视频（云菜鸟：视频样式比例 / 直接显示 / 弹出显示 / 本地视频 / 视频号视频 eweishop 复刻） -->
      <view v-else-if="c.type === 'video'" class="dp-video" :class="'dp-video-' + (c.props.ratio || '16:9').replace(':', '-')">
        <!-- 视频号视频：风格一列/两列（竖屏9:16）、多视频、背景色/图、自动播放+静音+循环、间距/高度/上圆角/下圆角 -->
        <view v-if="c.props.source === 'channels'" class="dp-video-ch" :style="chStyle(c.props)">
          <view class="dp-video-ch-inner" :class="{ 'dp-video-ch-double': c.props.style === 'double' }">
            <view
              v-for="(it, i) in chVideos(c.props)"
              :key="i"
              class="dp-video-ch-item"
              :style="chItemStyle(c.props, i)"
              @click="openChannelsVideo({ finderUserName: it.finderUserName, feedId: it.feedId, feedToken: it.feedToken, muted: it.mutedItem, loop: it.loopItem })"
            >
              <image v-if="c.props.bgType === 'image' && c.props.bgImage" :src="resolveUrl(c.props.bgImage)" mode="aspectFill" class="dp-video-ch-bg" />
              <view class="dp-video-ch-play">▶</view>
            </view>
          </view>
          <view v-if="chVideos(c.props).length > 1" class="dp-video-ch-count">共 {{ chVideos(c.props).length }} 个视频</view>
        </view>
        <!-- 本地视频 -->
        <video v-else-if="c.props.url" :src="resolveUrl(c.props.url)" :poster="resolveUrl(c.props.poster)" class="dp-video-player" :style="videoRatioStyle(c.props.ratio)" :autoplay="!!(c.props.autoplayLocal ?? c.props.autoplay)" :loop="!!(c.props.loopLocal ?? c.props.loop)" controls></video>
        <view v-else class="dp-video-empty" :style="videoRatioStyle(c.props.ratio)"><text>视频</text></view>
        <!-- 弹出显示：浮层播放 -->
        <view v-if="c.props.displayMode === 'popup' && c.props.source !== 'channels' && c.props.url" class="dp-video-popmask" @click="popVideo = c.props.url">
          <image v-if="c.props.poster" :src="resolveUrl(c.props.poster)" mode="aspectFill" class="dp-video-popcover" />
          <view class="dp-video-playbtn">▶</view>
        </view>
      </view>
      <!-- 直播列表（云菜鸟：列表样式 / 内容类型 / 排序 / 显示数量 / 下拉加载） -->
      <view v-else-if="c.type === 'live-list'" class="dp-livelist" :class="'dp-live-style-' + (c.props.listStyle || '1')">
        <view v-if="liveList.length" class="dp-live-grid">
          <view v-for="(it, i) in liveList.slice(0, Number(c.props.limit) || 6)" :key="i" class="dp-live-card" @click="openChannel('live', it)">
            <image v-if="it.cover" :src="resolveUrl(it.cover)" mode="aspectFill" class="dp-live-cover" />
            <view v-else class="dp-live-cover dp-live-cover-ph"><text>直播</text></view>
            <view class="dp-live-tag">直播中</view>
            <view class="dp-live-info">
              <text class="dp-live-title">{{ it.title || '直播标题' }}</text>
              <text class="dp-live-meta">{{ it.viewer || 0 }} 人观看</text>
            </view>
          </view>
        </view>
        <view v-else class="dp-live-empty"><text>暂无直播</text></view>
      </view>
      <!-- 图文卡片 -->
      <view v-else-if="c.type === 'image-text'" class="dp-imagetext" :class="{ overlay: c.props.textPos === 'overlay' }">
        <image v-if="c.props.url" :src="resolveUrl(c.props.url)" mode="widthFix" class="dp-it-img" @click="onJump(c.props.link)" />
        <view v-else class="dp-it-empty"><text>图文卡片</text></view>
        <view class="dp-it-body">
          <text class="dp-it-title">{{ c.props.title || '图文标题' }}</text>
          <text class="dp-it-desc">{{ c.props.desc || '描述文字' }}</text>
        </view>
      </view>
      <!-- 轮播图 -->
      <view v-else-if="c.type === 'swiper'" class="dp-swiper" :style="dpSwiperStyle(c.props)">
        <swiper v-if="(c.props.items || []).some((it) => it.url)" class="dp-swiper-box" :style="dpSwiperBoxStyle(c.props)" :interval="c.props.interval || 4000" :circular="true" :autoplay="true" :indicator-dots="c.props.indicator === 'dot'" :indicator-active-color="c.props.indicatorColor || '#165dff'">
          <swiper-item v-for="(it, i) in c.props.items.filter((x) => x.url)" :key="i">
            <image :src="resolveUrl(it.url)" mode="aspectFill" class="dp-swiper-img" @click="onJump(it.link)" />
          </swiper-item>
        </swiper>
        <view v-if="c.props.indicator === 'number' && (c.props.items || []).some((it) => it.url)" class="dp-swiper-num" :style="{ color: c.props.indicatorColor || '#165dff' }"><text>1/{{ c.props.items.filter((x) => x.url).length }}</text></view>
        <view v-if="!(c.props.items || []).some((it) => it.url)" class="dp-swiper-empty"><text>轮播图（请添加图片）</text></view>
      </view>
      <!-- 名片卡 -->
      <view v-else-if="c.type === 'my-card'" class="dp-mycard" :style="{ background: c.props.bgColor || '#F0F7FF' }" @click="onJump('/pages/card/myCard')">
        <view class="dp-mc-avatar"><text>名</text></view>
        <view class="dp-mc-body">
          <text class="dp-mc-name">{{ c.props.name || '我的名片' }}</text>
          <text class="dp-mc-sub">{{ c.props.sub || '点击查看我的名片' }}</text>
        </view>
        <text class="dp-mc-arrow">›</text>
      </view>
      <!-- 宫格导航 -->
      <view v-else-if="c.type === 'grid-nav'" class="dp-grid" :style="{ gridTemplateColumns: 'repeat(' + (c.props.columns || 4) + ',1fr)', background: c.props.bgColor || 'transparent' }">
        <view v-for="(it, i) in c.props.items || []" :key="i" class="dp-grid-item" @click="onJump(it.url)">
          <view class="dp-grid-icon-wrap" :style="dpGridIconStyle(c.props)">
            <SIcon v-if="it.icon" :name="it.icon" size="default" color="#165dff" />
            <text v-else>名</text>
            <view v-if="it.badge" class="dp-grid-badge"><text>{{ it.badge }}</text></view>
          </view>
          <text class="dp-grid-text">{{ it.text || '入口' }}</text>
          <text v-if="it.desc" class="dp-grid-desc">{{ it.desc }}</text>
        </view>
      </view>
      <!-- 数据统计 -->
      <view v-else-if="c.type === 'stats'" class="dp-stats" :style="{ '--st': c.props.color || '#165dff' }">
        <view v-if="c.props.showToday" class="dp-stats-item"><text class="dp-stats-num">{{ stats.today ?? 0 }}</text><text class="dp-stats-label">今日访客</text></view>
        <view v-if="c.props.showTotal" class="dp-stats-item"><text class="dp-stats-num">{{ stats.total ?? 0 }}</text><text class="dp-stats-label">累计访客</text></view>
        <view v-if="c.props.showExchange" class="dp-stats-item"><text class="dp-stats-num">{{ stats.exchange ?? 0 }}</text><text class="dp-stats-label">名片交换</text></view>
      </view>
      <!-- 全景方案 -->
      <view v-else-if="c.type === 'panorama'" class="dp-pano" @click="onJump(c.props.link)">
        <view class="dp-pano-icon"><text>360°</text></view>
        <view class="dp-pano-body">
          <text class="dp-pano-title">{{ c.props.title || '360 全景' }}</text>
          <text class="dp-pano-desc">{{ c.props.desc || '沉浸式全景展示' }}</text>
        </view>
        <text class="dp-pano-arrow">›</text>
      </view>
      <!-- 全景场景（动态拉取租户方案） -->
      <view v-else-if="c.type === 'pano-scenes'" class="dp-panoscenes">
        <view v-if="panoPlans[i] === undefined" class="dp-ps-loading">全景场景加载中…</view>
        <block v-else>
          <view v-if="c.props.showCategory" class="dp-ps-head">
            <text class="dp-ps-title">{{ c.props.title || '现有场景' }}</text>
            <view class="dp-ps-tags">
              <text v-for="(t, ti) in panoCategories(c.props)" :key="ti" class="dp-ps-tag">{{ t }}</text>
            </view>
          </view>
          <scroll-view v-if="c.props.layout === 'scroll'" scroll-x class="dp-ps-scroll" :show-scrollbar="false">
            <view class="dp-ps-row">
              <view v-for="(p, pi) in panoPlans[i] || []" :key="p.id" class="dp-ps-card" @click="onPanoClick(p)">
                <view class="dp-ps-imgwrap">
                  <image class="dp-ps-img" :src="resolvePanoImg(p.cover)" mode="aspectFill" />
                  <text v-if="c.props.showStatus" class="dp-ps-status" :class="p.published ? 'on' : 'off'">{{ p.published ? '已发布' : '编辑中' }}</text>
                </view>
                <text class="dp-ps-name">{{ p.name }}</text>
              </view>
            </view>
          </scroll-view>
          <view v-else class="dp-ps-grid">
            <view v-for="(p, pi) in panoPlans[i] || []" :key="p.id" class="dp-ps-card" @click="onPanoClick(p)">
              <view class="dp-ps-imgwrap">
                <image class="dp-ps-img" :src="resolvePanoImg(p.cover)" mode="aspectFill" />
                <text v-if="c.props.showStatus" class="dp-ps-status" :class="p.published ? 'on' : 'off'">{{ p.published ? '已发布' : '编辑中' }}</text>
              </view>
              <text class="dp-ps-name">{{ p.name }}</text>
            </view>
            <view v-if="!(panoPlans[i] || []).length" class="dp-ps-empty">暂无全景场景</view>
          </view>
        </block>
      </view>
      <!-- 魔方 -->
      <view v-else-if="c.type === 'cube'" class="dp-cube" :style="{ gridTemplateColumns: 'repeat(' + (c.props.cols || 3) + ',1fr)', gap: (c.props.gap ?? 4) + 'px' }">
        <view v-for="(it, i) in (c.props.items || []).slice(0, (c.props.rows || 2) * (c.props.cols || 3))" :key="i" class="dp-cube-cell" :style="{ borderRadius: (c.props.radius ?? 8) + 'px' }" @click="onJump(it.link)">
          <image v-if="it.url" :src="resolveUrl(it.url)" mode="aspectFill" class="dp-cube-img" />
        </view>
      </view>
      <!-- 视频号主页 -->
      <view v-else-if="c.type === 'channel-profile'" class="dp-channel" :style="{ background: c.props.bgColor || '#F7F8FA' }" @click="openChannel('profile', c.props)">
        <view class="dp-ch-avatar"><image v-if="c.props.avatar" :src="resolveUrl(c.props.avatar)" mode="aspectFill" class="dp-ch-avatar-img" /><text v-else>号</text></view>
        <view class="dp-ch-body">
          <text class="dp-ch-name">{{ c.props.nickname || '视频号昵称' }}</text>
          <text class="dp-ch-desc">{{ c.props.desc || '视频号简介' }}</text>
        </view>
        <view class="dp-ch-btn"><text>视频号</text></view>
      </view>
      <!-- 视频号视频 -->
      <view v-else-if="c.type === 'channel-video'" class="dp-chvideo" :style="{ background: c.props.bgColor || '#F7F8FA' }" @click="openChannel('video', c.props)">
        <view class="dp-chv-cover">
          <image v-if="c.props.cover" :src="resolveUrl(c.props.cover)" mode="aspectFill" class="dp-chv-img" />
          <view v-else class="dp-chv-empty"><text>▶</text></view>
          <view class="dp-chv-tag"><text>视频号</text></view>
        </view>
        <view class="dp-chv-body">
          <text class="dp-chv-title">{{ c.props.title || '视频标题' }}</text>
          <text class="dp-chv-desc">{{ c.props.desc || '视频描述' }}</text>
        </view>
      </view>
      <!-- 视频号直播 -->
      <view v-else-if="c.type === 'channel-live'" class="dp-chlive" :style="{ background: c.props.bgColor || '#F7F8FA' }" @click="openChannel('live', c.props)">
        <view class="dp-chl-cover">
          <image v-if="c.props.cover" :src="resolveUrl(c.props.cover)" mode="aspectFill" class="dp-chl-img" />
          <view v-else class="dp-chl-empty"><text>▶</text></view>
          <view class="dp-chl-badge"><text>● {{ c.props.statusText || '直播中' }}</text></view>
        </view>
        <view class="dp-chl-title"><text>{{ c.props.title || '直播标题' }}</text></view>
      </view>
      <!-- 富文本 -->
      <view v-else-if="c.type === 'rich-text'" class="dp-richtext">
        <rich-text :nodes="c.props.html || '<p>富文本内容</p>'" />
      </view>
      <!-- 组图橱窗 -->
      <view v-else-if="c.type === 'image-gallery'" class="dp-gallery" :style="{ gridTemplateColumns: 'repeat(' + (c.props.columns || 2) + ',1fr)', gap: '6px' }">
        <view v-for="(it, i) in c.props.items || []" :key="i" class="dp-gallery-cell" :style="{ borderRadius: (c.props.radius ?? 8) + 'px' }" @click="onJump(it.link)">
          <image v-if="it.url" :src="resolveUrl(it.url)" mode="aspectFill" class="dp-gallery-img" />
        </view>
      </view>
      <!-- 标题栏 -->
      <view v-else-if="c.type === 'title-bar'" class="dp-titlebar" :class="{ center: c.props.align === 'center', bar: c.props.titleStyle === 'bar' }" :style="{ background: c.props.bgColor || 'transparent' }">
        <view class="dp-tb-left">
          <text class="dp-tb-title" :style="{ color: c.props.color || '#1d2129' }">{{ c.props.title || '标题文字' }}</text>
          <text v-if="c.props.sub" class="dp-tb-sub">{{ c.props.sub }}</text>
        </view>
        <view v-if="c.props.showMore && c.props.moreText" class="dp-tb-more" @click="onJump(c.props.moreUrl)"><text>{{ c.props.moreText }} ›</text></view>
      </view>
      <!-- 搜索框 -->
      <view v-else-if="c.type === 'search'">
        <view class="dp-search" :class="c.props.style === 'shadow' ? 'shadow' : c.props.style === 'border' ? 'border' : ''" :style="dpSearchStyle(c.props)" @click="onSearch(c.props)">
          <text class="dp-search-ico">🔍</text>
          <text class="dp-search-ph">{{ c.props.placeholder || '搜索名片 / 内容' }}</text>
          <text v-if="c.props.showBtn" class="dp-search-btn">搜索</text>
        </view>
        <view v-if="c.props.hotWords" class="dp-search-hot">
          <text v-for="(w, wi) in dpHotWords(c.props)" :key="wi" class="dp-search-hot-item">{{ w }}</text>
        </view>
      </view>
      <!-- 选项卡 -->
      <view v-else-if="c.type === 'tabs'" class="dp-tabs" :style="{ '--tab': c.props.color || '#165dff' }">
        <view v-for="(it, i) in c.props.items || []" :key="i" class="dp-tabs-item" :class="{ active: i === 0 }" @click="onJump(it.link)"><text>{{ it.text || '选项' }}</text></view>
      </view>
      <!-- 万能表单 -->
      <view v-else-if="c.type === 'form-pro'" class="dp-form">
        <text class="dp-form-title">{{ c.props.title || '留资表单' }}</text>
        <view v-if="ensureFormData(i)" v-for="(f, fi) in c.props.fields || []" :key="fi" class="dp-fp-field">
          <picker v-if="f.type === 'date'" mode="date" @change="(e) => { ensureFormData(i); formData[i][f.label] = e.detail.value; }">
            <view class="dp-fp-select"><text>{{ (formData[i] && formData[i][f.label]) || f.placeholder || f.label }}{{ f.required ? ' *' : '' }}</text><text class="dp-fp-arrow">▾</text></view>
          </picker>
          <picker v-else-if="f.type === 'radio' || f.type === 'select'" :range="fieldOptions(f)" @change="(e) => { ensureFormData(i); formData[i][f.label] = fieldOptions(f)[Number(e.detail.value)]; }">
            <view class="dp-fp-select"><text>{{ (formData[i] && formData[i][f.label]) || f.placeholder || f.label }}{{ f.required ? ' *' : '' }}</text><text class="dp-fp-arrow">▾</text></view>
          </picker>
          <input v-else :type="f.type === 'number' ? 'number' : 'text'" :maxlength="f.type === 'phone' ? 11 : -1" :placeholder="(f.placeholder || f.label) + (f.required ? ' *' : '')" class="dp-fp-input" :value="formData[i][f.label] || ''" @input="(e) => { formData[i][f.label] = e.detail.value; }" />
        </view>
        <view class="dp-form-btn" :style="{ background: c.props.btnColor || '#165dff' }" @click="submitForm(i, c)"><text>{{ c.props.submitText || '提交' }}</text></view>
      </view>
      <!-- 客服联系 -->
      <view v-else-if="c.type === 'contact'" class="dp-contact">
        <view class="dp-contact-ico"><text>客</text></view>
        <view class="dp-contact-body">
          <text class="dp-contact-title">{{ c.props.title || '联系我们' }}</text>
          <text class="dp-contact-line">{{ c.props.phone || '电话未填写' }}</text>
          <text v-if="c.props.address" class="dp-contact-line">{{ c.props.address }}</text>
        </view>
        <view class="dp-contact-btn" :style="{ background: '#165dff' }" @click="callPhone(c.props)"><text>{{ c.props.btnText || '拨打电话' }}</text></view>
      </view>
      <!-- 悬浮按钮 -->
      <view v-else-if="c.type === 'float-btn'" class="dp-float" :style="{ background: c.props.color || '#165dff', left: c.props.position === 'left' ? '12px' : 'auto', right: c.props.position === 'right' ? '12px' : 'auto' }" @click="onFloatClick(c.props)">
        <text>{{ c.props.text || '联系我们' }}</text>
      </view>
      <!-- 文章列表 -->
      <view v-else-if="c.type === 'article-list'" class="dp-article">
        <text v-if="c.props.title" class="dp-article-title">{{ c.props.title }}</text>
        <view class="dp-article-grid" :style="{ gridTemplateColumns: 'repeat(' + (c.props.columns || 1) + ', 1fr)' }">
          <view v-for="(it, i) in c.props.items || []" :key="i" class="dp-article-item" @click="onJump(it.link)">
            <image v-if="it.image" :src="resolveUrl(it.image)" mode="aspectFill" class="dp-article-img" />
            <view v-else class="dp-article-img dp-article-img-empty"><text>图</text></view>
            <view class="dp-article-body">
              <text class="dp-article-t">{{ it.title || '文章标题' }}</text>
              <text v-if="it.desc" class="dp-article-d">{{ it.desc }}</text>
              <text v-if="c.props.showDate" class="dp-article-date">{{ it.date || '2026-01-01' }}</text>
            </view>
          </view>
        </view>
      </view>
      <!-- 网页容器 -->
      <view v-else-if="c.type === 'web-container'" class="dp-web" :style="{ height: (c.props.height || 400) + 'px' }">
        <!-- #ifdef H5 -->
        <iframe v-if="c.props.url" :src="c.props.url" class="dp-web-frame" />
        <view v-else class="dp-web-empty"><text>网页容器</text></view>
        <!-- #endif -->
        <!-- #ifndef H5 -->
        <view class="dp-web-empty" @click="onJump(c.props.url)"><text>网页容器</text><text class="dp-web-tip">小程序端暂不支持内嵌网页，点击打开链接</text></view>
        <!-- #endif -->
      </view>
      <!-- 辅助间距 -->
      <view v-else-if="c.type === 'spacer'" class="dp-spacer" :style="{ margin: (c.props.margin ?? 16) + 'px 0', borderTop: c.props.style === 'none' ? 'none' : (c.props.height || 20) + 'px ' + (c.props.style || 'solid') + ' ' + (c.props.color || '#E5E6EB') }"></view>
      <!-- 关注公众号 -->
      <view v-else-if="c.type === 'follow-official'" class="dp-follow">
        <view class="dp-follow-body">
          <text class="dp-follow-title">{{ c.props.title || '关注公众号' }}</text>
          <text v-if="c.props.desc" class="dp-follow-desc">{{ c.props.desc }}</text>
        </view>
        <image v-if="c.props.qr" :src="resolveUrl(c.props.qr)" mode="aspectFill" class="dp-follow-qr" show-menu-by-longpress />
        <view v-else class="dp-follow-qr dp-follow-qr-empty"><text>二维码</text></view>
        <view class="dp-follow-btn"><text>{{ c.props.btnText || '长按识别关注' }}</text></view>
      </view>
      <!-- 短视频瀑布流 -->
      <view v-else-if="c.type === 'video-feed'" class="dp-vfeed">
        <text v-if="c.props.title" class="dp-vfeed-title">{{ c.props.title }}</text>
        <view class="dp-vfeed-grid" :style="{ gridTemplateColumns: 'repeat(' + (c.props.columns || 2) + ', 1fr)' }">
          <view v-for="(it, i) in c.props.items || []" :key="i" class="dp-vfeed-item" @click="openFeedItem(it)">
            <view class="dp-vfeed-cover">
              <image v-if="it.cover" :src="resolveUrl(it.cover)" mode="aspectFill" class="dp-vfeed-cover-img" />
              <view v-else class="dp-vfeed-cover-empty"><text>视频</text></view>
              <view class="dp-vfeed-play"><text>▶</text></view>
            </view>
            <text class="dp-vfeed-t">{{ it.title || '视频标题' }}</text>
          </view>
        </view>
        <video v-if="feedVideo" :src="feedVideo" class="dp-vfeed-player" controls autoplay @ended="feedVideo = ''" @error="feedVideo = ''" />
      </view>
    </view>

    <!-- 视频弹出显示浮层 -->
    <view v-if="popVideo" class="dp-popmask" @click="popVideo = ''">
      <view class="dp-popbox" @click.stop>
        <video :src="popVideo" class="dp-pop-player" controls autoplay />
        <view class="dp-pop-close" @click="popVideo = ''">✕</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { cardApi, API_DOMAIN } from '../utils/cardApi.js';
import SIcon from './SIcon.vue';
const props = defineProps({
  comps: { type: Array, default: () => [] },
  stats: { type: Object, default: () => ({}) },
  tenantId: { type: Number, default: 0 },
});

// 万能表单数据（按组件下标隔离，支持同页多个表单）
const formData = reactive({});
function ensureFormData(i) {
  if (!formData[i]) formData[i] = {};
  return formData[i];
}
function fieldOptions(f) {
  const raw = f.options || '';
  const arr = String(raw).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : ['选项一', '选项二'];
}
async function submitForm(i, c) {
  const values = ensureFormData(i);
  const fields = c.props.fields || [];
  const missing = fields.find((f) => f.required && !String(values[f.label] || '').trim());
  if (missing) {
    uni.showToast({ title: `请填写${missing.label}`, icon: 'none' });
    return;
  }
  const payload = {
    tenantId: props.tenantId || 0,
    formTitle: c.props.title || '留资表单',
    fields: fields.map((f) => ({ label: f.label, value: String(values[f.label] || '').trim() })),
  };
  try {
    await cardApi.designLead(payload);
    uni.showToast({ title: '提交成功', icon: 'success' });
    values.__submitted = true;
  } catch (e) {
    uni.showToast({ title: e || '提交失败', icon: 'none' });
  }
}
function callPhone(p) {
  if (!p.phone) {
    uni.showToast({ title: '未配置电话', icon: 'none' });
    return;
  }
  uni.makePhoneCall({ phoneNumber: p.phone, fail: () => {} });
}
function onSearch(p) {
  if (!p.link) {
    uni.showToast({ title: '请先配置搜索跳转', icon: 'none' });
    return;
  }
  onJump(p.link);
}
// ===== 批1 融合组件辅助（三系统复刻） =====
function dpBtnStyle(p) {
  const s = { borderRadius: (p.radius ?? 8) + 'px' };
  if (p.btnStyle === 'outline') {
    s.color = p.strokeColor || '#165DFF';
    s.background = 'transparent';
    s.border = '1px solid ' + (p.strokeColor || '#165DFF');
  } else {
    s.color = p.textColor || '#ffffff';
    s.background = p.bgColor || '#165DFF';
  }
  if (p.widthMode !== 'auto') {
    s.width = '100%';
    s.textAlign = 'center';
  }
  return s;
}
function dpNoticeStyle(p) {
  const s = { background: p.bgColor, color: p.color, borderRadius: (p.radius ?? 0) + 'px', fontSize: (p.fontSize || 14) + 'px', marginTop: (p.marginTop || 0) + 'px', marginBottom: (p.marginBottom || 0) + 'px' };
  if (p.bold) s.fontWeight = '600';
  return s;
}
function dpNoticeList(p) {
  return (p.items || []).filter((it) => it && it.text).slice(0, 10);
}
function dpSwiperStyle(p) {
  const s = { borderRadius: (p.radius ?? 0) + 'px', marginBottom: (p.marginBottom || 0) + 'px', overflow: 'hidden' };
  if (p.heightMode === 'full') {
    s.height = '100vh';
    s.minHeight = '400px';
  } else {
    s.height = (p.height || 150) + 'px';
  }
  return s;
}
function dpSwiperBoxStyle(p) {
  const s = { height: '100%' };
  return s;
}
function dpGridIconStyle(p) {
  return {
    width: (p.iconSize || 40) + 'px',
    height: (p.iconSize || 40) + 'px',
    borderRadius: (p.shape === 'rounded' ? (p.iconRadius ?? 12) : 999) + 'px',
  };
}
function dpSearchStyle(p) {
  const s = {
    background: p.bgColor || '#F2F3F5',
    borderRadius: (p.radius ?? 16) + 'px',
    height: (p.height || 36) + 'px',
    marginTop: (p.marginTop || 0) + 'px',
    marginBottom: (p.marginBottom || 0) + 'px',
  };
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.strokeColor || '#165DFF');
  return s;
}
function dpHotWords(p) {
  return String(p.hotWordsText || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
}
function onFloatClick(p) {
  const link = p.link || '';
  if (link.indexOf('tel:') === 0) {
    uni.makePhoneCall({ phoneNumber: link.slice(4), fail: () => {} });
    return;
  }
  onJump(link);
}
// 短视频瀑布流：优先播放 mp4，否则跳转链接
const feedVideo = ref('');
const popVideo = ref('');
const liveList = ref([]);
// 云菜鸟视频样式比例：aspect-ratio 真实比例（16:9 / 4:3 / 1:1 / 9:16），容器宽度自适应
function videoRatioStyle(ratio) {
  const map = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '9:16': '9 / 16' };
  return { width: '100%', aspectRatio: map[ratio] || '16 / 9', maxHeight: '70vh' };
}
function openFeedItem(it) {
  if (it.video) {
    feedVideo.value = resolveUrl(it.video);
    return;
  }
  if (it.link) onJump(it.link);
}

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  // #ifdef H5
  // H5 端 uni-app 会把相对路径基于页面 base 解析（/card/），导致 /uploads 变 ./uploads 404，必须拼 origin
  return (u.startsWith('/') ? window.location.origin + u : window.location.origin + '/' + u);
  // #endif
  // #ifndef H5
  return u.startsWith('/') ? u : `/${u}`;
  // #endif
}
function containerStyle(c) {
  const p = c.props || {};
  const s = {};
  if (p.padding !== undefined && p.padding !== '') s.padding = `${p.padding}px`;
  if (p.radius !== undefined && p.radius !== '') s.borderRadius = `${p.radius}px`;
  if (p.bgColor) s.background = p.bgColor;
  return s;
}
// 全景场景组件：按组件下标拉取租户全景方案（避免同页多个实例重复加载）
const panoPlans = reactive({});
const panoLoaded = {};
async function loadPanoScenes(i) {
  if (panoLoaded[i]) return;
  panoLoaded[i] = true;
  try {
    const res = await cardApi.designPanoramaScenes();
    panoPlans[i] = Array.isArray(res?.plans) ? res.plans : [];
  } catch {
    panoPlans[i] = [];
  }
}
onMounted(() => {
  (props.comps || []).forEach((c, i) => {
    if (c.type === 'pano-scenes') loadPanoScenes(i);
  });
});
function panoCategories(p) {
  return String(p.categories || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}
function resolvePanoImg(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return (u.startsWith('/') ? API_DOMAIN + u : API_DOMAIN + '/' + u);
}
function onPanoClick(p) {
  if (!p.published) {
    uni.showToast({ title: '该方案尚未发布', icon: 'none' });
    return;
  }
  uni.navigateTo({ url: '/pages/viewer/viewer?planId=' + p.id, fail: () => uni.showToast({ title: '打开全景失败', icon: 'none' }) });
}

function onJump(url) {
  if (!url) return;
  if (/^https?:/.test(url)) {
    // #ifdef H5
    window.open(url, '_blank');
    // #endif
    // #ifndef H5
    uni.setClipboardData({ data: url, success: () => uni.showToast({ title: '链接已复制', icon: 'none' }) });
    // #endif
    return;
  }
  const path = url.startsWith('/') ? url : `/${url}`;
  uni.navigateTo({ url: path, fail: () => uni.showToast({ title: '页面不存在', icon: 'none' }) });
}

// 视频号视频来源：支持新版 {finderUserName, feedId} 与旧版 url "视频号ID:视频ID"
function openChannelsVideo(p) {
  const fp = { ...(p || {}) };
  const src = (p && p.url) || '';
  if (!fp.finderUserName && src.includes(':')) {
    const idx = src.indexOf(':');
    fp.finderUserName = src.slice(0, idx);
    fp.feedId = src.slice(idx + 1) || fp.feedId;
  }
  if (!fp.finderUserName) {
    uni.showToast({ title: '视频号视频需填「视频号ID:视频ID」', icon: 'none' });
    return;
  }
  openChannel('video', fp);
}

// 视频号视频（eweishop 复刻）辅助：多视频列表 / 背景 / 圆角 / 间距
function chVideos(p) {
  const vs = p.videos || [];
  // 新结构：统一「选择视频」列表（条级 相同主体/视频号id/视频id/自动播放/feed-token）
  if (vs.length) {
    return vs.map((it) => {
      const sameOwner = it.sameOwner !== undefined ? !!it.sameOwner : true;
      return {
        sameOwner,
        finderUserName: (it && it.finderUserName) || p.finderUserName || '',
        feedId: sameOwner ? (it && it.feedId) || '' : '',
        feedToken: sameOwner ? '' : (it && it.feedToken) || '',
        autoplayItem: (it && it.autoplayItem) || p.autoplay || 'auto',
        mutedItem: it.mutedItem !== undefined ? !!it.mutedItem : (p.muted !== undefined ? !!p.muted : true),
        loopItem: it.loopItem !== undefined ? !!it.loopItem : (p.loop !== undefined ? !!p.loop : false),
      };
    });
  }
  // 旧结构兼容：组件级 sameOwner + videoIds（同主体多视频）
  if (p.sameOwner !== false) {
    const ids = (p.videoIds && p.videoIds.length && p.videoIds.some((x) => x && x.feedId))
      ? p.videoIds
      : (p.feedId ? [{ feedId: p.feedId }] : []);
    return ids.map((it) => ({ sameOwner: true, finderUserName: p.finderUserName || '', feedId: (it && it.feedId) || '', feedToken: '', autoplayItem: p.autoplay || 'auto', mutedItem: p.muted !== undefined ? !!p.muted : true, loopItem: p.loop !== undefined ? !!p.loop : false }));
  }
  const list = (p.videos && p.videos.length ? p.videos : []);
  return list.map((it) => ({
    sameOwner: false,
    finderUserName: (it && it.finderUserName) || '',
    feedId: '',
    feedToken: (it && it.feedToken) || '',
    autoplayItem: (it && it.autoplayItem) || 'auto',
    mutedItem: true,
    loopItem: false,
  }));
}
function chStyle(p) {
  const s = {};
  if (p.bgType === 'color' && p.bgColor) s.background = p.bgColor;
  if (p.bgType === 'image' && p.bgImage) s.backgroundImage = `url(${resolveUrl(p.bgImage)})`;
  if (p.bgType === 'image' && p.bgImage) s.backgroundSize = 'cover';
  const v = p.vSpacing || 0;
  const h = typeof p.hMargin === 'number' ? p.hMargin : v;
  if (v || h) s.padding = `${v}px ${h}px`;
  if (p.spaceTop) s.marginTop = p.spaceTop + 'px';
  if (p.spaceBottom) s.marginBottom = p.spaceBottom + 'px';
  return s;
}
function chItemStyle(p, i) {
  const s = {};
  const rMap = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '9:16': '9 / 16' };
  if (p.height) {
    s.aspectRatio = 'auto';
    s.height = p.height + 'px';
  } else {
    // 比例配置优先（eweishop 原版：16:9/4:3/1:1/9:16）；旧数据无 chRatio 时两列兜底竖屏 9:16、一列横屏 16:9
    s.aspectRatio = rMap[p.chRatio] || (p.style === 'double' ? '9 / 16' : '16 / 9');
  }
  const list = chVideos(p);
  const r = [];
  if (p.radiusTop && i === 0) r.push('12px');
  if (p.radiusBottom && i === list.length - 1) r.push('12px');
  if (r.length) s.borderRadius = r.join(' ');
  return s;
}

// 视频号唤起：小程序端调微信原生 API（带 loading + 失败引导），H5/APP 端复制 ID 引导
function openChannel(kind, p) {
  // #ifdef MP-WEIXIN
  const apiMap = { profile: 'openChannelsUserProfile', video: 'openChannelsActivity', live: 'openChannelsLive' };
  const api = apiMap[kind];
  const nameMap = { profile: '视频号主页', video: '视频号视频', live: '视频号直播' };
  if (typeof wx !== 'undefined' && wx[api]) {
    uni.showLoading({ title: '打开' + (nameMap[kind] || '视频号') + '…' });
    const arg = { finderUserName: p.finderUserName };
    if (kind === 'video') {
      arg.feedId = p.feedId;
      if (p.feedToken) arg.feedToken = p.feedToken;
      if (p.muted !== undefined) arg.muted = !!p.muted;
      if (p.loop !== undefined) arg.loop = !!p.loop;
    }
    wx[api]({
      ...arg,
      success: () => uni.hideLoading(),
      fail: (err) => {
        uni.hideLoading();
        const msg = err && err.errMsg && err.errMsg.indexOf('not exist') > -1
          ? '视频号不存在，请检查视频号ID是否正确'
          : '打开失败，请确认小程序已关联视频号';
        uni.showModal({ title: '提示', content: msg, showCancel: false });
      },
      complete: () => uni.hideLoading(),
    });
    return;
  }
  // #endif
  // #ifndef MP-WEIXIN
  const copyText = kind === 'video' ? `${p.finderUserName} ${p.feedId}` : (p.finderUserName || '');
  uni.setClipboardData({
    data: copyText,
    success: () => uni.showModal({ title: '提示', content: '已复制，请在微信中搜索该视频号查看', showCancel: false }),
  });
  // #endif
}
</script>

<style scoped>
.design-page { width: 100%; box-sizing: border-box; }
.dp-item { box-sizing: border-box; }
.dp-title { font-size: 22px; font-weight: 700; line-height: 1.4; }
.dp-text { line-height: 1.6; }
.dp-image { width: 100%; }
.dp-image-img { width: 100%; display: block; border-radius: 8px; }
.dp-image-empty { height: 120px; background: #f7f8fa; border: 1px dashed #c9cdd4; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 13px; }
.dp-btn { display: inline-block; padding: 10px 24px; font-size: 14px; text-align: center; box-sizing: border-box; }
.dp-btn.auto { width: auto; }
.dp-divider { position: relative; height: 1px; background: #e5e6eb; margin: 14px 0; display: flex; align-items: center; justify-content: center; }
.dp-divider-line { height: 1px; width: 100%; }
.dp-divider-text { position: absolute; background: #fff; padding: 0 10px; font-size: 12px; color: #86909c; }
.dp-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.dp-notice-tag { font-weight: 600; flex-shrink: 0; }
.dp-notice-text { flex: 1; }
.dp-countdown { padding: 14px; border-radius: 8px; background: #fff; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.dp-cd-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.dp-cd-cols { display: flex; align-items: center; gap: 6px; }
.dp-cd-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dp-cd-num { font-size: 18px; font-weight: 700; color: #fff; background: var(--cd, #165dff); border-radius: 6px; padding: 2px 8px; line-height: 1.4; }
.dp-cd-unit { font-size: 11px; color: #86909c; }
.dp-cd-colon { color: var(--cd, #165dff); font-weight: 700; font-size: 16px; }
.dp-form { padding: 14px; border-radius: 8px; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.dp-form-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.dp-form-input { height: 34px; border-radius: 6px; background: #f7f8fa; border: 1px solid #e5e6eb; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #86909c; }
.dp-form-btn { height: 36px; border-radius: 8px; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.dp-video { border-radius: 8px; overflow: hidden; background: #000; position: relative; }
.dp-video-player { width: 100%; height: 200px; display: block; }
.dp-video-empty { height: 120px; background: #000; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.5); font-size: 13px; }
/* 视频号视频（eweishop 复刻）：一列/两列并排、多视频、背景、圆角 */
.dp-video-ch { border-radius: 8px; overflow: hidden; box-sizing: border-box; }
.dp-video-ch-inner { display: flex; flex-direction: column; gap: 8px; }
.dp-video-ch-double { flex-direction: row; flex-wrap: wrap; }
.dp-video-ch-double .dp-video-ch-item { flex: 1 1 46%; max-width: 48%; }
/* 两列且仅 1 个视频时：占满整行宽度（竖屏全宽） */
.dp-video-ch-item { position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.dp-video-ch-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.dp-video-ch-play { position: relative; z-index: 1; width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,.45); color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; }
.dp-video-ch-count { padding: 8px 4px 2px; font-size: 11px; color: #86909c; }
/* 弹出显示遮罩 */
.dp-video-popmask { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 3; }
.dp-video-popcover { position: absolute; inset: 0; width: 100%; height: 100%; }
.dp-video-playbtn { width: 52px; height: 52px; border-radius: 50%; background: rgba(255,255,255,.92); color: #1d2129; font-size: 18px; display: flex; align-items: center; justify-content: center; }
/* 视频弹出播放浮层 */
.dp-popmask { position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,.72); display: flex; align-items: center; justify-content: center; }
.dp-popbox { width: 86%; position: relative; }
.dp-pop-player { width: 100%; height: 420rpx; border-radius: 8px; }
.dp-pop-close { position: absolute; top: -34px; right: 0; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.25); color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
/* 直播列表（云菜鸟样式一/二/三） */
.dp-livelist { border-radius: 8px; overflow: hidden; background: #fff; }
.dp-live-grid { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.dp-live-card { position: relative; border-radius: 8px; overflow: hidden; background: #f7f8fa; }
.dp-live-cover { width: 100%; height: 150px; display: block; background: #000; }
.dp-live-cover-ph { display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,.5); font-size: 13px; background: linear-gradient(135deg, #2b2b2b, #111); }
.dp-live-tag { position: absolute; top: 8px; left: 8px; font-size: 10px; color: #fff; background: #f53f3f; border-radius: 4px; padding: 2px 6px; line-height: 1.4; }
.dp-live-info { padding: 8px 10px; }
.dp-live-title { display: block; font-size: 13px; color: #1d2129; font-weight: 500; }
.dp-live-meta { display: block; margin-top: 4px; font-size: 11px; color: #86909c; }
.dp-live-style-2 .dp-live-card { display: flex; align-items: center; }
.dp-live-style-2 .dp-live-cover { width: 132px; height: 88px; flex-shrink: 0; }
.dp-live-style-2 .dp-live-info { flex: 1; }
.dp-live-style-3 .dp-live-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dp-live-style-3 .dp-live-cover { height: 96px; }
.dp-live-empty { padding: 36px 0; text-align: center; color: #86909c; font-size: 12px; }
/* 图文卡片 */
.dp-imagetext { position: relative; border-radius: 8px; overflow: hidden; background: #fff; border: 1px solid #f0f1f3; }
.dp-it-img { width: 100%; display: block; }
.dp-it-empty { height: 90px; background: #f7f8fa; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 12px; }
.dp-it-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
.dp-it-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.dp-it-desc { font-size: 12px; color: #86909c; }
.dp-imagetext.overlay .dp-it-body { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(transparent, rgba(0,0,0,.55)); }
.dp-imagetext.overlay .dp-it-title { color: #fff; }
.dp-imagetext.overlay .dp-it-desc { color: rgba(255,255,255,.85); }
/* 轮播图 */
.dp-swiper { border-radius: 8px; overflow: hidden; background: #f7f8fa; position: relative; }
.dp-swiper-box { width: 100%; height: 100%; }
.dp-swiper-img { width: 100%; height: 100%; }
.dp-swiper-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 12px; }
.dp-swiper-num { position: absolute; right: 12px; bottom: 10px; background: rgba(0,0,0,.35); color: #fff; font-size: 11px; padding: 1px 8px; border-radius: 8px; z-index: 5; }
.dp-swiper-num text { color: inherit; }
/* 名片卡 */
.dp-mycard { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 8px; }
.dp-mc-avatar { width: 44px; height: 44px; border-radius: 50%; background: #165dff; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 600; flex-shrink: 0; }
.dp-mc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dp-mc-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.dp-mc-sub { font-size: 12px; color: #86909c; }
.dp-mc-arrow { color: #c9cdd4; font-size: 20px; }
/* 宫格导航 */
.dp-grid { display: grid; gap: 4px; }
.dp-grid-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 2px; }
.dp-grid-icon-wrap { position: relative; background: rgba(22,93,255,.08); display: flex; align-items: center; justify-content: center; }
.dp-grid-icon { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.dp-grid-badge { position: absolute; top: -4px; right: -8px; background: #f53f3f; color: #fff; font-size: 10px; line-height: 1; padding: 2px 5px; border-radius: 8px; }
.dp-grid-text { font-size: 12px; color: #4e5969; }
.dp-grid-desc { font-size: 10px; color: #86909c; line-height: 1.4; text-align: center; }
/* 数据统计 */
.dp-stats { display: flex; border-radius: 8px; background: #fff; border: 1px solid #f0f1f3; padding: 16px 8px; }
.dp-stats-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; border-right: 1px solid #f0f1f3; }
.dp-stats-item:last-child { border-right: none; }
.dp-stats-num { font-size: 20px; font-weight: 700; color: var(--st, #165dff); }
.dp-stats-label { font-size: 12px; color: #86909c; }
/* 全景方案 */
.dp-pano { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 8px; background: linear-gradient(135deg, #f0f7ff, #e8f3ff); }
.dp-pano-icon { width: 48px; height: 48px; border-radius: 12px; background: rgba(22,93,255,.1); color: #165dff; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.dp-pano-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dp-pano-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.dp-pano-desc { font-size: 12px; color: #86909c; }
.dp-pano-arrow { color: #165dff; font-size: 20px; }
/* 全景场景 */
.dp-panoscenes { border-radius: 12px; background: #fff; padding: 14px; }
.dp-ps-loading { padding: 36px 0; text-align: center; color: #86909c; font-size: 12px; }
.dp-ps-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.dp-ps-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.dp-ps-tags { display: flex; align-items: center; gap: 6px; }
.dp-ps-tag { font-size: 11px; color: #86909c; background: #f2f3f5; border-radius: 8px; padding: 2px 8px; }
.dp-ps-scroll { width: 100%; white-space: nowrap; }
.dp-ps-row { display: inline-flex; gap: 10px; padding-right: 4px; }
.dp-ps-card { width: 140px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background: #fff; border: 1px solid #f0f1f3; }
.dp-ps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dp-ps-grid .dp-ps-card { width: auto; }
.dp-ps-imgwrap { position: relative; }
.dp-ps-img { width: 100%; height: 92px; display: block; background: #f2f3f5; }
.dp-ps-status { position: absolute; top: 6px; left: 6px; font-size: 10px; padding: 2px 6px; border-radius: 8px; color: #fff; }
.dp-ps-status.on { background: rgba(22,93,255,.88); }
.dp-ps-status.off { background: rgba(255,125,0,.88); }
.dp-ps-name { display: block; font-size: 13px; color: #1d2129; padding: 8px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-ps-empty { grid-column: 1 / -1; padding: 32px 0; text-align: center; color: #86909c; font-size: 12px; }
/* 魔方 */
.dp-cube { display: grid; width: 100%; }
.dp-cube-cell { aspect-ratio: 1; overflow: hidden; background: #f7f8fa; }
.dp-cube-img { width: 100%; height: 100%; }
/* 视频号主页 */
.dp-channel { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 8px; }
.dp-ch-avatar { width: 44px; height: 44px; border-radius: 50%; background: #fff; border: 1px solid #e5e6eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; font-size: 16px; color: #86909c; }
.dp-ch-avatar-img { width: 100%; height: 100%; }
.dp-ch-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dp-ch-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.dp-ch-desc { font-size: 12px; color: #86909c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-ch-btn { flex-shrink: 0; font-size: 12px; color: #165dff; border: 1px solid #165dff; border-radius: 20px; padding: 4px 12px; background: #fff; }
/* 视频号视频 */
.dp-chvideo { border-radius: 8px; overflow: hidden; border: 1px solid #f0f1f3; }
.dp-chv-cover { position: relative; aspect-ratio: 16/9; background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.dp-chv-img { width: 100%; height: 100%; }
.dp-chv-empty { color: #86909c; font-size: 24px; }
.dp-chv-tag { position: absolute; left: 8px; top: 8px; background: rgba(0,0,0,.55); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.dp-chv-body { padding: 10px 12px; background: #fff; display: flex; flex-direction: column; gap: 2px; }
.dp-chv-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.dp-chv-desc { font-size: 12px; color: #86909c; }
/* 视频号直播 */
.dp-chlive { border-radius: 8px; overflow: hidden; border: 1px solid #f0f1f3; }
.dp-chl-cover { position: relative; aspect-ratio: 16/9; background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.dp-chl-img { width: 100%; height: 100%; }
.dp-chl-empty { color: #86909c; font-size: 24px; }
.dp-chl-badge { position: absolute; left: 8px; top: 8px; background: #f53f3f; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.dp-chl-title { padding: 10px 12px; font-size: 14px; font-weight: 600; color: #1d2129; background: #fff; }
/* 富文本 */
.dp-richtext { font-size: 14px; color: #1d2129; line-height: 1.7; word-break: break-word; }
/* 组图橱窗 */
.dp-gallery { display: grid; width: 100%; }
.dp-gallery-cell { aspect-ratio: 1; overflow: hidden; background: #f7f8fa; }
.dp-gallery-img { width: 100%; height: 100%; }
/* 标题栏 */
.dp-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
.dp-titlebar.center .dp-tb-left { flex: 1; align-items: center; text-align: center; }
.dp-titlebar.bar .dp-tb-title { background: #165dff; color: #fff; padding: 4px 12px; border-radius: 6px 6px 6px 0; font-size: 14px; }
.dp-tb-left { display: flex; flex-direction: column; gap: 2px; }
.dp-tb-title { font-size: 17px; font-weight: 600; line-height: 1.4; }
.dp-tb-sub { font-size: 12px; color: #86909c; }
.dp-tb-more { flex-shrink: 0; font-size: 12px; color: #86909c; }
/* 搜索框 */
.dp-search { height: 38px; display: flex; align-items: center; gap: 6px; padding: 0 14px; font-size: 13px; color: #86909c; box-sizing: border-box; }
.dp-search-ico { font-size: 13px; }
.dp-search-ph { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dp-search-btn { flex-shrink: 0; color: #fff; background: #165dff; font-size: 12px; padding: 3px 12px; border-radius: 12px; }
.dp-search-hot { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.dp-search-hot-item { font-size: 11px; color: #86909c; background: #f7f8fa; border: 1px solid #e5e6eb; border-radius: 10px; padding: 2px 8px; }
/* 选项卡 */
.dp-tabs { display: flex; gap: 8px; }
.dp-tabs-item { flex: 1; text-align: center; padding: 8px 4px; font-size: 14px; color: #4e5969; border-radius: 8px; background: #f7f8fa; }
.dp-tabs-item.active { color: var(--tab, #165dff); background: rgba(22,93,255,.08); font-weight: 500; }
/* 万能表单 */
.dp-fp-field { margin-bottom: 10px; }
.dp-fp-input { height: 34px; border-radius: 6px; background: #f7f8fa; border: 1px solid #e5e6eb; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: #1d2129; }
.dp-fp-select { height: 34px; border-radius: 6px; background: #f7f8fa; border: 1px solid #e5e6eb; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; font-size: 13px; color: #86909c; }
.dp-fp-arrow { color: #86909c; }
/* 客服联系 */
.dp-contact { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 8px; border: 1px solid #f0f1f3; background: #fff; }
.dp-contact-ico { width: 44px; height: 44px; border-radius: 50%; background: rgba(22,93,255,.08); color: #165dff; font-size: 17px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.dp-contact-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dp-contact-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.dp-contact-line { font-size: 12px; color: #86909c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-contact-btn { flex-shrink: 0; color: #fff; font-size: 12px; border-radius: 20px; padding: 6px 14px; }
/* 悬浮按钮 */
.dp-float { position: fixed; bottom: 32px; z-index: 99; color: #fff; font-size: 13px; border-radius: 24px; padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
.dp-article { padding: 2px 0; }
.dp-article-title { font-size: 15px; font-weight: 600; color: #1d2129; display: block; margin-bottom: 10px; }
.dp-article-grid { display: grid; gap: 10px; }
.dp-article-item { border: 1px solid #f0f1f3; border-radius: 10px; padding: 10px; display: flex; gap: 10px; background: #fff; }
.dp-article-img { width: 92px; height: 66px; border-radius: 8px; flex-shrink: 0; overflow: hidden; }
.dp-article-img-empty { background: #f7f8fa; display: flex; align-items: center; justify-content: center; color: #c9cdd4; font-size: 12px; }
.dp-article-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.dp-article-t { font-size: 14px; color: #1d2129; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-article-d { font-size: 12px; color: #86909c; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dp-article-date { font-size: 11px; color: #c9cdd4; margin-top: auto; padding-top: 4px; }
.dp-web { border-radius: 8px; overflow: hidden; background: #f7f8fa; }
.dp-web-frame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.dp-web-empty { height: 100%; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; color: #86909c; font-size: 13px; }
.dp-web-tip { font-size: 11px; color: #c9cdd4; }
.dp-spacer { width: 100%; }
.dp-follow { display: flex; align-items: center; gap: 10px; border: 1px solid #f0f1f3; border-radius: 10px; padding: 12px; background: #fff; }
.dp-follow-body { flex: 1; min-width: 0; }
.dp-follow-title { font-size: 14px; font-weight: 600; color: #1d2129; display: block; }
.dp-follow-desc { font-size: 12px; color: #86909c; margin-top: 3px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-follow-qr { width: 56px; height: 56px; border-radius: 8px; flex-shrink: 0; }
.dp-follow-qr-empty { background: #f7f8fa; display: flex; align-items: center; justify-content: center; color: #c9cdd4; font-size: 11px; }
.dp-follow-btn { font-size: 12px; color: #165dff; border: 1px solid #165dff; border-radius: 8px; padding: 6px 12px; flex-shrink: 0; }
.dp-vfeed-title { font-size: 15px; font-weight: 600; color: #1d2129; display: block; margin-bottom: 10px; }
.dp-vfeed-grid { display: grid; gap: 8px; }
.dp-vfeed-item { border: 1px solid #f0f1f3; border-radius: 10px; overflow: hidden; background: #fff; }
.dp-vfeed-cover { position: relative; aspect-ratio: 3/4; background: #f7f8fa; }
.dp-vfeed-cover-img { width: 100%; height: 100%; }
.dp-vfeed-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #c9cdd4; font-size: 12px; }
.dp-vfeed-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 30px; height: 30px; border-radius: 50%; background: rgba(0,0,0,.45); color: #fff; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.dp-vfeed-t { font-size: 12px; color: #1d2129; padding: 7px 8px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-vfeed-player { position: fixed; left: 0; right: 0; top: 50%; transform: translateY(-50%); width: 100%; height: 220px; z-index: 999; background: #000; }
</style>
