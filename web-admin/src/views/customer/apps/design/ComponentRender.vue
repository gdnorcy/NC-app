<template>
  <div class="comp-render" :style="containerStyle">
    <template v-if="comp.type === 'title'">
      <div class="r-title" :style="{ color: comp.props.color, textAlign: comp.props.align }">{{ comp.props.text || '标题文字' }}</div>
    </template>
    <template v-else-if="comp.type === 'text'">
      <div class="r-text" :style="{ color: comp.props.color, textAlign: comp.props.align, fontSize: comp.props.size + 'px' }">{{ comp.props.text || '文本内容' }}</div>
    </template>
    <template v-else-if="comp.type === 'image'">
      <div class="r-image" @click.stop>
        <img v-if="comp.props.url" :src="resolveUrl(comp.props.url)" />
        <div v-else class="r-image-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图片组件（右侧选择素材）</div>
      </div>
    </template>
    <template v-else-if="comp.type === 'button'">
      <div class="r-btn" :style="btnStyle(comp.props)">{{ comp.props.text || '按钮' }}</div>
    </template>
    <template v-else-if="comp.type === 'divider'">
      <div class="r-divider"><span v-if="comp.props.text">{{ comp.props.text }}</span></div>
    </template>
    <template v-else-if="comp.type === 'notice'">
      <div class="r-notice" :style="{ background: comp.props.bgColor, color: comp.props.color, borderRadius: (comp.props.radius ?? 0) + 'px', marginTop: (comp.props.marginTop || 0) + 'px', marginBottom: (comp.props.marginBottom || 0) + 'px', fontSize: (comp.props.fontSize || 14) + 'px', fontWeight: comp.props.bold ? 600 : 400 }">
        <span v-if="comp.props.showIcon" class="r-notice-tag">公告</span>
        <span v-if="noticeList(comp.props).length" class="r-notice-text">{{ noticeList(comp.props)[0].text }}</span>
        <span v-else>{{ comp.props.text || '公告内容' }}</span>
      </div>
    </template>
    <template v-else-if="comp.type === 'countdown'">
      <div class="r-countdown" :style="{ '--cd': comp.props.color || '#165DFF' }">
        <div class="r-cd-title">{{ comp.props.title || '限时活动' }}</div>
        <div class="r-cd-cols">
          <span class="r-cd-cell"><b>{{ comp.props.days || '00' }}</b><i>天</i></span>
          <em>:</em>
          <span class="r-cd-cell"><b>{{ comp.props.hours || '00' }}</b><i>时</i></span>
          <em>:</em>
          <span class="r-cd-cell"><b>{{ comp.props.minutes || '00' }}</b><i>分</i></span>
          <em>:</em>
          <span class="r-cd-cell"><b>{{ comp.props.seconds || '00' }}</b><i>秒</i></span>
        </div>
      </div>
    </template>
    <template v-else-if="comp.type === 'form'">
      <div class="r-form">
        <div class="r-form-title">{{ comp.props.title || '留资表单' }}</div>
        <div class="r-form-input">{{ comp.props.namePlaceholder || '请输入姓名' }}</div>
        <div class="r-form-input">{{ comp.props.phonePlaceholder || '请输入手机号' }}</div>
        <div class="r-form-btn" :style="{ background: comp.props.btnColor || '#165DFF' }">{{ comp.props.submitText || '提交' }}</div>
      </div>
    </template>
    <template v-else-if="comp.type === 'video'">
      <!-- 视频号视频（eweishop 复刻）：风格一列/两列（竖屏9:16）、多视频、背景色/图、静音循环、圆角 -->
      <div v-if="comp.props.source === 'channels'" class="r-video-ch" :style="chStyle(comp.props)">
        <div class="r-video-ch-inner" :class="comp.props.style === 'double' ? 'r-video-ch-double' : ''">
          <div v-for="(it, i) in chVideos(comp.props)" :key="i" class="r-video-ch-item" :style="{ borderRadius: chRadius(comp.props, i), aspectRatio: ({ '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '9:16': '9 / 16' })[comp.props.chRatio] || (comp.props.style === 'double' ? '9 / 16' : '16 / 9'), height: comp.props.height ? comp.props.height + 'px' : undefined }">
            <div class="r-video-ch-play"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg></div>
            <span class="r-video-tag">视频号</span>
          </div>
        </div>
        <div v-if="!chVideos(comp.props).length" class="r-video-ch-empty">请填写视频号id</div>
        <div class="r-video-ch-meta">{{ (chVideos(comp.props)[0] && chVideos(comp.props)[0].autoplayItem) !== 'no' ? '自动播放' : '手动播放' }}<template v-if="chVideos(comp.props)[0] && chVideos(comp.props)[0].mutedItem"> · 静音</template><template v-if="chVideos(comp.props)[0] && chVideos(comp.props)[0].loopItem"> · 循环</template></div>
      </div>
      <!-- 本地视频 -->
      <div v-else class="r-video" :class="'r-video-' + (comp.props.ratio || '16:9').replace(':', '-')" :style="{ aspectRatio: ({ '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '9:16': '9 / 16' })[comp.props.ratio] || '16 / 9' }">
        <img v-if="comp.props.poster" :src="resolveUrl(comp.props.poster)" />
        <div v-else class="r-video-empty"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg></div>
        <span v-if="comp.props.displayMode === 'popup'" class="r-video-tag r-video-tag2">弹出</span>
      </div>
    </template>
    <!-- 直播列表 -->
    <template v-else-if="comp.type === 'live-list'">
      <div class="r-live" :class="'r-live-' + (comp.props.listStyle || '1')">
        <div v-for="(it, i) in Array.from({ length: Math.min(Number(comp.props.limit) || 3, 3) })" :key="i" class="r-live-card">
          <div class="r-live-cover">直播</div>
          <div class="r-live-info">
            <div class="r-live-title">直播标题</div>
            <div class="r-live-meta">0 人观看</div>
          </div>
        </div>
        <div v-if="!comp.props.limit" class="r-live-empty">暂无直播</div>
      </div>
    </template>
    <!-- 图文卡片 -->
    <template v-else-if="comp.type === 'image-text'">
      <div class="r-imagetext" :class="{ overlay: comp.props.textPos === 'overlay' }">
        <img v-if="comp.props.url" :src="resolveUrl(comp.props.url)" />
        <div v-else class="r-imagetext-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图文卡片</div>
        <div class="r-imagetext-body">
          <div class="r-imagetext-title">{{ comp.props.title || '图文标题' }}</div>
          <div class="r-imagetext-desc">{{ comp.props.desc || '描述文字' }}</div>
        </div>
      </div>
    </template>
    <!-- 轮播图 -->
    <template v-else-if="comp.type === 'swiper'">
      <div class="r-swiper" :style="swiperStyle(comp.props)">
        <template v-if="(comp.props.items || []).filter((it) => it.url).length">
          <img v-for="(it, i) in comp.props.items.filter((x) => x.url)" :key="i" :src="resolveUrl(it.url)" />
          <span v-if="comp.props.indicator === 'dot'" class="r-swiper-dots"><i v-for="(d, di) in comp.props.items.filter((x) => x.url)" :key="di" :style="{ background: comp.props.indicatorColor || '#165DFF' }"></i></span>
          <span v-else-if="comp.props.indicator === 'number'" class="r-swiper-num" :style="{ color: comp.props.indicatorColor || '#165DFF' }">1/{{ comp.props.items.filter((x) => x.url).length }}</span>
        </template>
        <div v-else class="r-swiper-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>轮播图（至少添加一张图片）</div>
      </div>
    </template>
    <!-- 名片卡 -->
    <template v-else-if="comp.type === 'my-card'">
      <div class="r-mycard" :style="{ background: comp.props.bgColor || '#F0F7FF' }">
        <div class="r-mycard-avatar"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#165DFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"/></svg></div>
        <div class="r-mycard-body">
          <div class="r-mycard-name">{{ comp.props.name || '我的名片' }}</div>
          <div class="r-mycard-sub">{{ comp.props.sub || '点击查看我的名片' }}</div>
        </div>
        <div class="r-mycard-arrow">›</div>
      </div>
    </template>
    <!-- 宫格导航 -->
    <template v-else-if="comp.type === 'grid-nav'">
      <div class="r-grid" :style="{ gridTemplateColumns: 'repeat(' + (comp.props.columns || 4) + ',1fr)', background: comp.props.bgColor || 'transparent' }">
        <div v-for="(it, i) in comp.props.items || []" :key="i" class="r-grid-item">
          <div class="r-grid-icon-wrap" :style="gridIconStyle(comp.props)">
            <div class="r-grid-icon">{{ it.icon || 'card' }}</div>
            <span v-if="it.badge" class="r-grid-badge">{{ it.badge }}</span>
          </div>
          <div class="r-grid-text">{{ it.text || '入口' }}</div>
          <div v-if="it.desc" class="r-grid-desc">{{ it.desc }}</div>
        </div>
      </div>
    </template>
    <!-- 数据统计 -->
    <template v-else-if="comp.type === 'stats'">
      <div class="r-stats" :style="{ '--st': comp.props.color || '#165DFF' }">
        <div v-if="comp.props.showToday" class="r-stats-item"><b>0</b><span>今日访客</span></div>
        <div v-if="comp.props.showTotal" class="r-stats-item"><b>0</b><span>累计访客</span></div>
        <div v-if="comp.props.showExchange" class="r-stats-item"><b>0</b><span>名片交换</span></div>
      </div>
    </template>
    <!-- 全景方案 -->
    <template v-else-if="comp.type === 'panorama'">
      <div class="r-pano">
        <div class="r-pano-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#165DFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 8v8c0 1.5 4 3 9 3s9-1.5 9-3V8"/></svg></div>
        <div class="r-pano-body">
          <div class="r-pano-title">{{ comp.props.title || '360 全景' }}</div>
          <div class="r-pano-desc">{{ comp.props.desc || '沉浸式全景展示' }}</div>
        </div>
        <div class="r-pano-arrow">›</div>
      </div>
    </template>
    <!-- 全景场景（动态拉取租户方案） -->
    <template v-else-if="comp.type === 'pano-scenes'">
      <div class="r-panoscenes">
        <div v-if="!panoLoaded" class="r-ps-loading">全景场景加载中…</div>
        <template v-else>
          <div v-if="comp.props.showCategory" class="r-ps-head">
            <div class="r-ps-title">{{ comp.props.title || '现有场景' }}</div>
            <div class="r-ps-tags">
              <span v-for="(t, ti) in panoCategories(comp.props)" :key="ti" class="r-ps-tag">{{ t }}</span>
            </div>
          </div>
          <div :class="comp.props.layout === 'grid' ? 'r-ps-grid' : 'r-ps-row'">
            <div v-for="p in panoPlans" :key="p.id" class="r-ps-card">
              <div class="r-ps-imgwrap">
                <img v-if="p.cover" :src="resolveUrl(p.cover)" class="r-ps-img" />
                <div v-else class="r-ps-img r-ps-img-empty"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 8v8c0 1.5 4 3 9 3s9-1.5 9-3V8"/></svg></div>
                <span v-if="comp.props.showStatus" class="r-ps-status" :class="p.published ? 'on' : 'off'">{{ p.published ? '已发布' : '编辑中' }}</span>
              </div>
              <div class="r-ps-name">{{ p.name }}</div>
            </div>
            <div v-if="!panoPlans.length" class="r-ps-empty">暂无全景场景</div>
          </div>
        </template>
      </div>
    </template>
    <!-- 魔方 -->
    <template v-else-if="comp.type === 'cube'">
      <div class="r-cube" :style="{ gridTemplateColumns: 'repeat(' + (comp.props.cols || 3) + ',1fr)', gap: (comp.props.gap ?? 4) + 'px' }">
        <template v-for="(it, i) in (comp.props.items || []).slice(0, (comp.props.rows || 2) * (comp.props.cols || 3))" :key="i">
          <div v-if="it.url" class="r-cube-cell" :style="{ borderRadius: (comp.props.radius ?? 8) + 'px' }"><img :src="resolveUrl(it.url)" /></div>
          <div v-else class="r-cube-cell r-cube-empty" :style="{ borderRadius: (comp.props.radius ?? 8) + 'px' }"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg></div>
        </template>
      </div>
    </template>
    <!-- 视频号主页 -->
    <template v-else-if="comp.type === 'channel-profile'">
      <div class="r-channel" :style="{ background: comp.props.bgColor || '#F7F8FA' }">
        <div class="r-ch-avatar"><img v-if="comp.props.avatar" :src="resolveUrl(comp.props.avatar)" /><svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"/></svg></div>
        <div class="r-ch-body">
          <div class="r-ch-name">{{ comp.props.nickname || '视频号昵称' }}</div>
          <div class="r-ch-desc">{{ comp.props.desc || '视频号简介' }}</div>
        </div>
        <div class="r-ch-btn">视频号</div>
      </div>
    </template>
    <!-- 视频号视频 -->
    <template v-else-if="comp.type === 'channel-video'">
      <div class="r-chvideo" :style="{ background: comp.props.bgColor || '#F7F8FA' }">
        <div class="r-chv-cover">
          <img v-if="comp.props.cover" :src="resolveUrl(comp.props.cover)" />
          <div v-else class="r-chv-empty"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg></div>
          <span class="r-chv-tag">视频号</span>
        </div>
        <div class="r-chv-body">
          <div class="r-chv-title">{{ comp.props.title || '视频标题' }}</div>
          <div class="r-chv-desc">{{ comp.props.desc || '视频描述' }}</div>
        </div>
      </div>
    </template>
    <!-- 视频号直播 -->
    <template v-else-if="comp.type === 'channel-live'">
      <div class="r-chlive" :style="{ background: comp.props.bgColor || '#F7F8FA' }">
        <div class="r-chl-cover">
          <img v-if="comp.props.cover" :src="resolveUrl(comp.props.cover)" />
          <div v-else class="r-chl-empty"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14v11H5zM8 7V4h8v3M10 11l4 2.5-4 2.5z"/></svg></div>
          <span class="r-chl-badge">● {{ comp.props.statusText || '直播中' }}</span>
        </div>
        <div class="r-chl-title">{{ comp.props.title || '直播标题' }}</div>
      </div>
    </template>
    <!-- 富文本 -->
    <template v-else-if="comp.type === 'rich-text'">
      <div class="r-richtext" v-html="comp.props.html || '<p>富文本内容</p>'"></div>
    </template>
    <!-- 组图橱窗 -->
    <template v-else-if="comp.type === 'image-gallery'">
      <div class="r-gallery" :style="{ gridTemplateColumns: 'repeat(' + (comp.props.columns || 2) + ',1fr)', gap: '6px' }">
        <template v-for="(it, i) in comp.props.items || []" :key="i">
          <div v-if="it.url" class="r-gallery-cell" :style="{ borderRadius: (comp.props.radius ?? 8) + 'px' }"><img :src="resolveUrl(it.url)" /></div>
          <div v-else class="r-gallery-cell r-gallery-empty" :style="{ borderRadius: (comp.props.radius ?? 8) + 'px' }"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg></div>
        </template>
      </div>
    </template>
    <!-- 标题栏 -->
    <template v-else-if="comp.type === 'title-bar'">
      <div class="r-titlebar" :class="{ center: comp.props.align === 'center', bar: comp.props.titleStyle === 'bar' }" :style="{ background: comp.props.bgColor || 'transparent' }">
        <div class="r-tb-left">
          <div class="r-tb-title" :style="{ color: comp.props.color || '#1d2129' }">{{ comp.props.title || '标题文字' }}</div>
          <div v-if="comp.props.sub" class="r-tb-sub">{{ comp.props.sub }}</div>
        </div>
        <div v-if="comp.props.showMore && comp.props.moreText" class="r-tb-more">{{ comp.props.moreText }} ›</div>
      </div>
    </template>
    <!-- 搜索框 -->
    <template v-else-if="comp.type === 'search'">
      <div class="r-search" :class="comp.props.style === 'shadow' ? 'shadow' : comp.props.style === 'border' ? 'border' : ''" :style="searchStyle(comp.props)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
        <span class="r-search-ph">{{ comp.props.placeholder || '搜索名片 / 内容' }}</span>
        <span v-if="comp.props.showBtn" class="r-search-btn">搜索</span>
      </div>
      <div v-if="comp.props.hotWords" class="r-search-hot">
        <span v-for="(w, wi) in hotWordsList(comp.props)" :key="wi" class="r-search-hot-item">{{ w }}</span>
      </div>
    </template>
    <!-- 选项卡 -->
    <template v-else-if="comp.type === 'tabs'">
      <div class="r-tabs" :style="{ '--tab': comp.props.color || '#165DFF' }">
        <div v-for="(it, i) in comp.props.items || []" :key="i" class="r-tabs-item" :class="{ active: i === 0 }">{{ it.text || '选项' }}</div>
      </div>
    </template>
    <!-- 万能表单 -->
    <template v-else-if="comp.type === 'form-pro'">
      <div class="r-form">
        <div class="r-form-title">{{ comp.props.title || '留资表单' }}</div>
        <div v-for="(f, i) in comp.props.fields || []" :key="i" class="r-form-input">{{ f.placeholder || f.label }}{{ f.required ? ' *' : '' }}</div>
        <div class="r-form-btn" :style="{ background: comp.props.btnColor || '#165DFF' }">{{ comp.props.submitText || '提交' }}</div>
      </div>
    </template>
    <!-- 客服联系 -->
    <template v-else-if="comp.type === 'contact'">
      <div class="r-contact">
        <div class="r-contact-ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#165DFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5"/></svg></div>
        <div class="r-contact-body">
          <div class="r-contact-title">{{ comp.props.title || '联系我们' }}</div>
          <div class="r-contact-line">{{ comp.props.phone || '电话未填写' }}</div>
          <div v-if="comp.props.address" class="r-contact-line">{{ comp.props.address }}</div>
        </div>
        <div class="r-contact-btn" :style="{ background: '#165DFF' }">{{ comp.props.btnText || '拨打电话' }}</div>
      </div>
    </template>
    <!-- 悬浮按钮 -->
    <template v-else-if="comp.type === 'float-btn'">
      <div class="r-float" :style="{ background: comp.props.color || '#165DFF', left: comp.props.position === 'left' ? '12px' : 'auto', right: comp.props.position === 'right' ? '12px' : 'auto' }">{{ comp.props.text || '联系我们' }}</div>
    </template>
    <!-- 文章列表 -->
    <template v-else-if="comp.type === 'article-list'">
      <div class="r-article">
        <div v-if="comp.props.title" class="r-article-title">{{ comp.props.title }}</div>
        <div class="r-article-grid" :style="{ gridTemplateColumns: 'repeat(' + (comp.props.columns || 1) + ',1fr)' }">
          <div v-for="(it, i) in comp.props.items || []" :key="i" class="r-article-item">
            <div v-if="it.image" class="r-article-img"><img :src="resolveUrl(it.image)" /></div>
            <div v-else class="r-article-img r-article-img-empty"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg></div>
            <div class="r-article-body">
              <div class="r-article-t">{{ it.title || '文章标题' }}</div>
              <div v-if="it.desc" class="r-article-d">{{ it.desc }}</div>
              <div v-if="comp.props.showDate" class="r-article-date">{{ it.date || '2026-01-01' }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <!-- 网页容器 -->
    <template v-else-if="comp.type === 'web-container'">
      <div class="r-web" :style="{ height: (comp.props.height || 400) + 'px' }">
        <iframe v-if="comp.props.url" :src="comp.props.url" class="r-web-frame" sandbox="allow-scripts allow-same-origin allow-forms" />
        <div v-else class="r-web-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 7h.01"/></svg><span>网页容器（填写地址后展示）</span></div>
      </div>
    </template>
    <!-- 辅助间距 -->
    <template v-else-if="comp.type === 'spacer'">
      <div class="r-spacer" :style="{ margin: (comp.props.margin ?? 16) + 'px 0', borderTop: comp.props.style === 'none' ? 'none' : (comp.props.height || 20) + 'px ' + (comp.props.style || 'solid') + ' ' + (comp.props.color || '#E5E6EB') }"></div>
    </template>
    <!-- 关注公众号 -->
    <template v-else-if="comp.type === 'follow-official'">
      <div class="r-follow">
        <div class="r-follow-body">
          <div class="r-follow-title">{{ comp.props.title || '关注公众号' }}</div>
          <div v-if="comp.props.desc" class="r-follow-desc">{{ comp.props.desc }}</div>
        </div>
        <div v-if="comp.props.qr" class="r-follow-qr"><img :src="resolveUrl(comp.props.qr)" /></div>
        <div v-else class="r-follow-qr r-follow-qr-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><path d="M13 13h3v3h-3zM17 13h3v3h-3z"/></svg></div>
        <div class="r-follow-btn">{{ comp.props.btnText || '长按识别关注' }}</div>
      </div>
    </template>
    <!-- 短视频瀑布流 -->
    <template v-else-if="comp.type === 'video-feed'">
      <div class="r-vfeed">
        <div v-if="comp.props.title" class="r-vfeed-title">{{ comp.props.title }}</div>
        <div class="r-vfeed-grid" :style="{ gridTemplateColumns: 'repeat(' + (comp.props.columns || 2) + ',1fr)' }">
          <div v-for="(it, i) in comp.props.items || []" :key="i" class="r-vfeed-item">
            <div v-if="it.cover" class="r-vfeed-cover"><img :src="resolveUrl(it.cover)" /><span class="r-vfeed-play"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" stroke="#fff" stroke-width="2"><path d="M8 5v14l11-7z"/></svg></span></div>
            <div v-else class="r-vfeed-cover r-vfeed-cover-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 9l5 3-5 3z"/></svg></div>
            <div class="r-vfeed-t">{{ it.title || '视频标题' }}</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { customerApiCall } from '../../../../api';
const props = defineProps({ comp: { type: Object, required: true } });

// 全景场景组件：编辑端预览拉取租户真实方案
const panoPlans = ref([]);
const panoLoaded = ref(false);
onMounted(async () => {
  if (props.comp.type !== 'pano-scenes') return;
  try {
    const res = await customerApiCall.get('/plans');
    panoPlans.value = (res.plans || []).map((p) => ({
      id: p.id,
      name: p.name,
      cover: p.coverPath || '',
      published: !!p.published,
    }));
  } catch {
    panoPlans.value = [];
  } finally {
    panoLoaded.value = true;
  }
});
function panoCategories(p) {
  return String(p.categories || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

const containerStyle = computed(() => {
  const p = props.comp.props || {};
  const s = {};
  if (p.padding !== undefined && p.padding !== '') s.padding = `${p.padding}px`;
  if (p.radius !== undefined && p.radius !== '') s.borderRadius = `${p.radius}px`;
  if (p.bgColor) s.background = p.bgColor;
  return s;
});

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

// ===== 批1 融合组件辅助（三系统复刻） =====
function btnStyle(p) {
  const s = { borderRadius: (p.radius ?? 8) + 'px' };
  if (p.btnStyle === 'outline') {
    s.color = p.strokeColor || '#165DFF';
    s.background = 'transparent';
    s.border = '1px solid ' + (p.strokeColor || '#165DFF');
  } else {
    s.color = p.textColor || '#ffffff';
    s.background = p.bgColor || '#165DFF';
  }
  if (p.widthMode === 'auto') {
    s.display = 'inline-block';
    s.padding = '0 24px';
    s.width = 'auto';
  } else {
    s.width = '100%';
    s.boxSizing = 'border-box';
    s.textAlign = 'center';
  }
  return s;
}
function noticeList(p) {
  const arr = (p.items || []).filter((it) => it && it.text);
  return arr.slice(0, 10);
}
function hotWordsList(p) {
  return String(p.hotWordsText || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}
function swiperStyle(p) {
  const s = { borderRadius: (p.radius ?? 0) + 'px', marginBottom: (p.marginBottom || 0) + 'px', overflow: 'hidden' };
  if (p.heightMode === 'full') {
    s.height = '100vh';
    s.minHeight = '400px';
  } else {
    s.height = (p.height || 150) + 'px';
  }
  return s;
}
function gridIconStyle(p) {
  const s = { width: (p.iconSize || 40) + 'px', height: (p.iconSize || 40) + 'px', borderRadius: (p.shape === 'rounded' ? (p.iconRadius ?? 12) : 999) + 'px' };
  return s;
}
function searchStyle(p) {
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

// ===== 视频号视频辅助（eweishop 复刻） =====
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
function chRadius(p, i) {
  const list = chVideos(p);
  const first = i === 0;
  const last = i === list.length - 1;
  const r = [];
  if (p.radiusTop && first) r.push('12px');
  if (p.radiusBottom && last) r.push('12px');
  return r.length ? r.join(' ') : '';
}
</script>

<style scoped>
.comp-render { pointer-events: none; }
.r-title { font-size: 22px; font-weight: 700; line-height: 1.4; }
.r-text { line-height: 1.6; }
.r-image img { width: 100%; border-radius: 8px; display: block; }
.r-image-empty { height: 88px; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; color: #86909c; font-size: 12px; background: #f7f8fa; border: 1px dashed #c9cdd4; border-radius: 8px; }
.r-btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-size: 14px; text-align: center; }
.r-divider { height: 1px; background: #e5e6eb; margin: 14px 0; position: relative; }
.r-divider span { position: absolute; left: 50%; top: -8px; transform: translateX(-50%); background: #fff; padding: 0 10px; font-size: 12px; color: #86909c; }
.r-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.r-notice-tag { flex-shrink: 0; font-weight: 600; }
.r-notice-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-countdown { padding: 14px; border-radius: 8px; background: #fff; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.r-cd-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.r-cd-cols { display: flex; align-items: center; gap: 6px; }
.r-cd-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.r-cd-cell b { font-size: 18px; font-weight: 700; color: #fff; background: var(--cd, #165dff); border-radius: 6px; padding: 2px 8px; line-height: 1.4; }
.r-cd-cell i { font-style: normal; font-size: 11px; color: #86909c; }
.r-cd-cols em { font-style: normal; color: var(--cd, #165dff); font-weight: 700; font-size: 16px; }
.r-form { padding: 14px; border-radius: 8px; border: 1px solid #f0f1f3; display: flex; flex-direction: column; gap: 10px; background: #fff; }
.r-form-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.r-form-input { height: 34px; border-radius: 6px; background: #f7f8fa; border: 1px solid #e5e6eb; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #86909c; }
.r-form-btn { height: 36px; border-radius: 8px; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.r-video { position: relative; border-radius: 8px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; }
.r-video img { width: 100%; height: 100%; object-fit: cover; }
.r-video-empty { opacity: .6; }
.r-video-tag { position: absolute; top: 6px; right: 6px; font-size: 10px; line-height: 1; color: #fff; background: rgba(0,0,0,.55); border-radius: 4px; padding: 3px 5px; }
.r-video-tag2 { right: auto; left: 6px; }
/* 直播列表预览 */
.r-live { display: flex; flex-direction: column; gap: 8px; background: #fff; padding: 10px; }
.r-live-card { display: flex; gap: 8px; align-items: center; background: #f7f8fa; border-radius: 8px; overflow: hidden; }
.r-live-cover { width: 72px; height: 48px; background: linear-gradient(135deg, #2b2b2b, #111); color: rgba(255,255,255,.6); font-size: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.r-live-title { font-size: 12px; color: #1d2129; font-weight: 500; }
.r-live-meta { font-size: 11px; color: #86909c; margin-top: 2px; }
.r-live-empty { padding: 20px 0; text-align: center; color: #86909c; font-size: 12px; }
.r-live-2 .r-live-card { flex-direction: column; align-items: stretch; }
.r-live-2 .r-live-cover { width: 100%; height: 60px; }
/* 视频号视频（eweishop 复刻） */
.r-video-ch { border-radius: 8px; overflow: hidden; box-sizing: border-box; }
.r-video-ch-inner { display: flex; flex-direction: column; gap: 8px; }
.r-video-ch-double { flex-direction: row; flex-wrap: wrap; }
.r-video-ch-double .r-video-ch-item { flex: 1 1 46%; max-width: 48%; }
/* 两列且仅 1 个视频时：占满整行宽度（竖屏全宽） */
.r-video-ch-item { position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.r-video-ch-empty { padding: 16px 0; text-align: center; color: #86909c; font-size: 12px; }
.r-video-ch-item::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 30%; background: linear-gradient(transparent, rgba(0,0,0,.5)); }
.r-video-ch-play { position: relative; z-index: 1; width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; }
.r-video-ch-meta { margin-top: 6px; font-size: 11px; color: #86909c; }
.r-video-ch .r-video-tag { top: 6px; left: 6px; }
/* 图文卡片 */
.r-imagetext { position: relative; border-radius: 8px; overflow: hidden; background: #fff; border: 1px solid #f0f1f3; }
.r-imagetext img { width: 100%; display: block; }
.r-imagetext-empty { height: 88px; display: flex; align-items: center; justify-content: center; gap: 6px; color: #86909c; font-size: 12px; background: #f7f8fa; border-bottom: 1px solid #f0f1f3; }
.r-imagetext-body { padding: 10px 12px; }
.r-imagetext-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.r-imagetext-desc { font-size: 12px; color: #86909c; margin-top: 3px; }
.r-imagetext.overlay .r-imagetext-body { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(transparent, rgba(0,0,0,.55)); color: #fff; }
.r-imagetext.overlay .r-imagetext-title { color: #fff; }
.r-imagetext.overlay .r-imagetext-desc { color: rgba(255,255,255,.85); }
/* 轮播图 */
.r-swiper { position: relative; border-radius: 8px; overflow: hidden; background: #f7f8fa; display: flex; }
.r-swiper img { width: 100%; height: 100%; object-fit: cover; }
.r-swiper-empty { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #86909c; font-size: 12px; }
.r-swiper-dots { position: absolute; bottom: 8px; left: 0; right: 0; display: flex; gap: 4px; justify-content: center; }
.r-swiper-dots i { width: 5px; height: 5px; border-radius: 50%; background: #fff; opacity: .6; }
.r-swiper-dots i:first-child { opacity: 1; }
.r-swiper-num { position: absolute; bottom: 8px; right: 10px; font-size: 11px; color: #fff; background: rgba(0,0,0,.35); padding: 1px 6px; border-radius: 8px; }
/* 名片卡 */
.r-mycard { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 8px; }
.r-mycard-avatar { width: 44px; height: 44px; border-radius: 50%; background: rgba(22,93,255,.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.r-mycard-body { flex: 1; min-width: 0; }
.r-mycard-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.r-mycard-sub { font-size: 12px; color: #86909c; margin-top: 2px; }
.r-mycard-arrow { color: #c9cdd4; font-size: 20px; }
/* 宫格导航 */
.r-grid { display: grid; gap: 4px; }
.r-grid-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 2px; }
.r-grid-icon-wrap { position: relative; display: flex; align-items: center; justify-content: center; background: rgba(22,93,255,.08); }
.r-grid-icon { color: #165dff; display: flex; align-items: center; justify-content: center; font-size: 13px; text-transform: uppercase; }
.r-grid-badge { position: absolute; top: -4px; right: -8px; background: #f53f3f; color: #fff; font-size: 10px; line-height: 1; padding: 2px 5px; border-radius: 8px; }
.r-grid-text { font-size: 12px; color: #4e5969; }
.r-grid-desc { font-size: 10px; color: #86909c; line-height: 1.4; text-align: center; }
/* 数据统计 */
.r-stats { display: flex; border-radius: 8px; background: #fff; border: 1px solid #f0f1f3; padding: 16px 8px; }
.r-stats-item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; border-right: 1px solid #f0f1f3; }
.r-stats-item:last-child { border-right: none; }
.r-stats-item b { font-size: 20px; font-weight: 700; color: var(--st, #165dff); }
.r-stats-item span { font-size: 12px; color: #86909c; }
/* 全景方案 */
.r-pano { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 8px; background: linear-gradient(135deg, #f0f7ff, #e8f3ff); }
.r-pano-icon { width: 48px; height: 48px; border-radius: 12px; background: rgba(22,93,255,.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.r-pano-body { flex: 1; min-width: 0; }
.r-pano-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.r-pano-desc { font-size: 12px; color: #86909c; margin-top: 2px; }
.r-pano-arrow { color: #165dff; font-size: 20px; }
/* 全景场景 */
.r-panoscenes { border-radius: 12px; background: #fff; padding: 14px; border: 1px solid #f0f1f3; }
.r-ps-loading { padding: 36px 0; text-align: center; color: #86909c; font-size: 12px; }
.r-ps-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.r-ps-title { font-size: 16px; font-weight: 600; color: #1d2129; }
.r-ps-tags { display: flex; align-items: center; gap: 6px; }
.r-ps-tag { font-size: 11px; color: #86909c; background: #f2f3f5; border-radius: 8px; padding: 2px 8px; }
.r-ps-row { display: flex; gap: 10px; overflow-x: auto; }
.r-ps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.r-ps-card { width: 140px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background: #fff; border: 1px solid #f0f1f3; }
.r-ps-grid .r-ps-card { width: auto; }
.r-ps-imgwrap { position: relative; }
.r-ps-img { width: 100%; height: 92px; display: block; object-fit: cover; background: #f2f3f5; }
.r-ps-img-empty { display: flex; align-items: center; justify-content: center; }
.r-ps-status { position: absolute; top: 6px; left: 6px; font-size: 10px; padding: 2px 6px; border-radius: 8px; color: #fff; }
.r-ps-status.on { background: rgba(22,93,255,.88); }
.r-ps-status.off { background: rgba(255,125,0,.88); }
.r-ps-name { font-size: 13px; color: #1d2129; padding: 8px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-ps-empty { grid-column: 1 / -1; padding: 32px 0; text-align: center; color: #86909c; font-size: 12px; }
/* 魔方 */
.r-cube { display: grid; width: 100%; }
.r-cube-cell { aspect-ratio: 1; overflow: hidden; background: #f7f8fa; }
.r-cube-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-cube-empty { display: flex; align-items: center; justify-content: center; border: 1px dashed #e5e6eb; }
/* 视频号主页 */
.r-channel { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 8px; }
.r-ch-avatar { width: 44px; height: 44px; border-radius: 50%; background: #fff; border: 1px solid #e5e6eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.r-ch-avatar img { width: 100%; height: 100%; object-fit: cover; }
.r-ch-body { flex: 1; min-width: 0; }
.r-ch-name { font-size: 15px; font-weight: 600; color: #1d2129; }
.r-ch-desc { font-size: 12px; color: #86909c; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-ch-btn { flex-shrink: 0; font-size: 12px; color: #165dff; border: 1px solid #165dff; border-radius: 20px; padding: 4px 12px; background: #fff; }
/* 视频号视频 */
.r-chvideo { border-radius: 8px; overflow: hidden; border: 1px solid #f0f1f3; }
.r-chv-cover { position: relative; aspect-ratio: 16/9; background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.r-chv-cover img { width: 100%; height: 100%; object-fit: cover; }
.r-chv-empty { opacity: .7; }
.r-chv-tag { position: absolute; left: 8px; top: 8px; background: rgba(0,0,0,.55); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.r-chv-body { padding: 10px 12px; background: #fff; }
.r-chv-title { font-size: 14px; font-weight: 600; color: #1d2129; }
.r-chv-desc { font-size: 12px; color: #86909c; margin-top: 2px; }
/* 视频号直播 */
.r-chlive { border-radius: 8px; overflow: hidden; border: 1px solid #f0f1f3; }
.r-chl-cover { position: relative; aspect-ratio: 16/9; background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.r-chl-cover img { width: 100%; height: 100%; object-fit: cover; }
.r-chl-empty { opacity: .7; }
.r-chl-badge { position: absolute; left: 8px; top: 8px; background: #f53f3f; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.r-chl-title { padding: 10px 12px; font-size: 14px; font-weight: 600; color: #1d2129; background: #fff; }
/* 富文本 */
.r-richtext { font-size: 14px; color: #1d2129; line-height: 1.7; word-break: break-word; }
.r-richtext :deep(img) { max-width: 100%; border-radius: 8px; }
/* 组图橱窗 */
.r-gallery { display: grid; width: 100%; }
.r-gallery-cell { aspect-ratio: 1; overflow: hidden; background: #f7f8fa; }
.r-gallery-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-gallery-empty { display: flex; align-items: center; justify-content: center; border: 1px dashed #e5e6eb; }
/* 标题栏 */
.r-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
.r-titlebar.center .r-tb-left { align-items: center; text-align: center; flex: 1; }
.r-titlebar.bar .r-tb-title { background: #165dff; color: #fff; padding: 4px 12px; border-radius: 6px 6px 6px 0; font-size: 14px; }
.r-tb-left { display: flex; flex-direction: column; gap: 2px; }
.r-tb-title { font-size: 17px; font-weight: 600; line-height: 1.4; }
.r-tb-sub { font-size: 12px; color: #86909c; }
.r-tb-more { flex-shrink: 0; font-size: 12px; color: #86909c; display: flex; align-items: center; }
/* 搜索框 */
.r-search { height: 38px; display: flex; align-items: center; gap: 6px; padding: 0 14px; font-size: 13px; color: #86909c; }
.r-search-ph { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-search-btn { flex-shrink: 0; color: #fff; background: #165dff; font-size: 12px; padding: 3px 12px; border-radius: 12px; }
.r-search-hot { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.r-search-hot-item { font-size: 11px; color: #86909c; background: #f7f8fa; border: 1px solid #e5e6eb; border-radius: 10px; padding: 2px 8px; }
/* 选项卡 */
.r-tabs { display: flex; gap: 8px; }
.r-tabs-item { flex: 1; text-align: center; padding: 8px 4px; font-size: 14px; color: #4e5969; border-radius: 8px; background: #f7f8fa; }
.r-tabs-item.active { color: var(--tab, #165dff); background: rgba(22,93,255,.08); font-weight: 500; }
/* 客服联系 */
.r-contact { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 8px; border: 1px solid #f0f1f3; background: #fff; }
.r-contact-ico { width: 44px; height: 44px; border-radius: 50%; background: rgba(22,93,255,.08); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.r-contact-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.r-contact-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.r-contact-line { font-size: 12px; color: #86909c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-contact-btn { flex-shrink: 0; color: #fff; font-size: 12px; border-radius: 20px; padding: 6px 14px; }
/* 悬浮按钮 */
.r-float { position: absolute; bottom: 12px; color: #fff; font-size: 13px; border-radius: 24px; padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,.15); }
.r-article-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.r-article-grid { display: grid; gap: 10px; }
.r-article-item { border: 1px solid #f0f1f3; border-radius: 8px; padding: 8px; display: flex; gap: 10px; }
.r-article-img { width: 84px; height: 60px; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.r-article-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-article-img-empty { background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.r-article-body { flex: 1; min-width: 0; }
.r-article-t { font-size: 13px; color: #1d2129; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-article-d { font-size: 11px; color: #86909c; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.r-article-date { font-size: 10px; color: #c9cdd4; margin-top: 4px; }
.r-web { border: 1px dashed #e5e6eb; border-radius: 8px; overflow: hidden; position: relative; background: #f7f8fa; }
.r-web-frame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
.r-web-empty { height: 100%; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; color: #86909c; font-size: 12px; }
.r-spacer { width: 100%; }
.r-follow { display: flex; align-items: center; gap: 10px; border: 1px solid #f0f1f3; border-radius: 8px; padding: 12px; background: #fff; }
.r-follow-body { flex: 1; min-width: 0; }
.r-follow-title { font-size: 13px; font-weight: 600; color: #1d2129; }
.r-follow-desc { font-size: 11px; color: #86909c; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.r-follow-qr { width: 48px; height: 48px; border-radius: 6px; overflow: hidden; flex-shrink: 0; }
.r-follow-qr img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-follow-qr-empty { background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.r-follow-btn { font-size: 11px; color: #165dff; border: 1px solid #165dff; border-radius: 6px; padding: 4px 10px; flex-shrink: 0; }
.r-vfeed-title { font-size: 14px; font-weight: 600; color: #1d2129; margin-bottom: 8px; }
.r-vfeed-grid { display: grid; gap: 8px; }
.r-vfeed-item { border: 1px solid #f0f1f3; border-radius: 8px; overflow: hidden; }
.r-vfeed-cover { position: relative; aspect-ratio: 3/4; background: #f7f8fa; }
.r-vfeed-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-vfeed-cover-empty { display: flex; align-items: center; justify-content: center; }
.r-vfeed-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 26px; height: 26px; border-radius: 50%; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; }
.r-vfeed-t { font-size: 11px; color: #1d2129; padding: 6px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.comp-render { position: relative; }
</style>
