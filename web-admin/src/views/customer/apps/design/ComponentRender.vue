<template>
  <div class="comp-render" :style="containerStyle">
    <template v-if="comp.type === 'title'">
      <div class="r-title" :style="{ color: comp.props.color, textAlign: comp.props.align }">{{ comp.props.text || '标题文字' }}</div>
    </template>
    <template v-else-if="comp.type === 'image'">
      <div class="r-image" :class="'r-card-' + (comp.props.cardStyle || 'default')" @click.stop :style="imageBoxStyle(comp.props)">
        <!-- 高级(热区)模式：多图 + 热区框 -->
        <template v-if="comp.props.mode === 'hotzone' && comp.props.items?.length">
          <div v-for="(it, ii) in comp.props.items" :key="ii" class="r-image-item" :style="{ marginBottom: ii < comp.props.items.length - 1 ? (comp.props.gap ?? 0) + 'px' : 0, borderRadius: imageRadius(comp.props) }">
            <img v-if="it.url" :src="resolveUrl(it.url)" />
            <div v-else class="r-image-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图片组件（右侧选择素材）</div>
            <div
              v-for="(h, hi) in it.hotspots || []" :key="hi"
              class="r-image-hotspot"
              :style="{ left: h.x + '%', top: h.y + '%', width: h.w + '%', height: h.h + '%' }"
            >
              <span class="r-image-hotspot-idx">{{ hi + 1 }}</span>
            </div>
          </div>
        </template>
        <!-- 标准模式：双图（选择风格） -->
        <template v-else-if="comp.props.style === 'double' && comp.props.items?.length">
          <div class="r-image-row" :style="{ gap: (comp.props.gap ?? 0) + 'px' }">
            <div v-for="(it, ii) in comp.props.items" :key="ii" class="r-image-row-item" :style="{ borderRadius: imageRadius(comp.props) }">
              <img v-if="it.url" :src="resolveUrl(it.url)" />
              <div v-else class="r-image-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图片组件（右侧选择素材）</div>
            </div>
          </div>
        </template>
        <!-- 标准模式：单图 -->
        <template v-else>
          <div v-if="comp.props.url" class="r-image-single" :style="{ borderRadius: imageRadius(comp.props) }">
            <img :src="resolveUrl(comp.props.url)" />
          </div>
          <div v-else class="r-image-empty"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图片组件（右侧选择素材）</div>
        </template>
      </div>
    </template>
    <template v-else-if="comp.type === 'button'">
      <div class="r-btn" :style="btnStyle(comp.props)">{{ comp.props.text || '按钮' }}</div>
    </template>
    <template v-else-if="comp.type === 'divider'">
      <div class="r-divider" :style="dividerStyle(comp.props)"><span v-if="comp.props.text" :style="{ color: comp.props.color || '#86909C' }">{{ comp.props.text }}</span></div>
    </template>
    <template v-else-if="comp.type === 'notice'">
      <div class="r-notice" :style="noticeStyle(comp.props)">
        <img v-if="comp.props.iconType === 'custom' && comp.props.iconImage" :src="resolveUrl(comp.props.iconImage)" class="r-notice-ico" alt="" />
        <span v-else-if="comp.props.iconType !== 'custom'" class="r-notice-tag">公告</span>
        <span v-if="noticeList(comp.props).length" class="r-notice-text">{{ noticeList(comp.props)[0].text }}</span>
        <span v-else>{{ comp.props.text || '公告内容' }}</span>
      </div>
    </template>
    <template v-else-if="comp.type === 'countdown'">
      <div
        class="r-countdown"
        :class="'r-cd-s' + (comp.props.styleId || 1) + ' ' + rCdStyleClass(comp.props)"
        :style="cdBoxStyle(comp.props)"
      >
        <img v-if="comp.props.image" :src="resolveUrl(comp.props.image)" class="r-cd-mainimg" />
        <div class="r-cd-content" :style="cdContentStyle(comp.props)">
          <div class="r-cd-title" :style="{ color: comp.props.cdTitleColor || '#ffffff' }">{{ cdTitle(comp.props) }}</div>
          <div class="r-cd-cols">
            <template v-if="(comp.props.styleId || 1) === 1">
              <!-- 风格1：每位数字独立块 + 天/小时/分 -->
              <template v-for="(ch, ci) in cdDigits(comp.props, 'd')" :key="'d' + ci"><b class="r-cd-digit" :style="cdNumStyle(comp.props)">{{ ch }}</b></template>
              <i class="r-cd-unit" :style="cdUnitStyle(comp.props)">天</i>
              <template v-for="(ch, ci) in cdDigits(comp.props, 'h')" :key="'h' + ci"><b class="r-cd-digit" :style="cdNumStyle(comp.props)">{{ ch }}</b></template>
              <i class="r-cd-unit" :style="cdUnitStyle(comp.props)">小时</i>
              <template v-for="(ch, ci) in cdDigits(comp.props, 'm')" :key="'m' + ci"><b class="r-cd-digit" :style="cdNumStyle(comp.props)">{{ ch }}</b></template>
              <i class="r-cd-unit" :style="cdUnitStyle(comp.props)">分</i>
            </template>
            <span v-else class="r-cd-inline" :style="cdInlineStyle(comp.props)">{{ cdPart(comp.props, 'd') }}天{{ cdPart(comp.props, 'h') }}小时{{ cdPart(comp.props, 'm') }}分</span>
          </div>
          <div class="r-cd-btn" :style="cdBtnStyle(comp.props)"><b>{{ comp.props.btnText || '抢先查看' }}</b></div>
        </div>
      </div>
    </template>
    <template v-else-if="comp.type === 'countdown2'">
      <!-- 倒计时02（eweishop 复刻）：左主图+标题+数字倒计时 + 右双副图 -->
      <div class="r-cd2" :class="'r-cd2-' + (comp.props.style || 'default')" :style="cd2BoxStyle(comp.props)">
        <div class="r-cd2-left" :style="cd2MainStyle(comp.props)" @click="onJump(comp.props.mainLink)">
          <div class="r-cd2-title" :style="{ color: comp.props.mainColor || '#333333' }">{{ comp.props.mainTitle || '这里是标题' }}</div>
          <div v-if="comp.props.mainSub" class="r-cd2-subtitle" :style="{ color: comp.props.mainColor || '#333333' }">{{ comp.props.mainSub }}</div>
          <div class="r-cd2-sub">
            <template v-for="(grp, gi) in cd2Digits(comp.props)" :key="gi">
              <b v-if="gi > 0" class="r-cd2-colon" :style="{ color: comp.props.numColor || '#ffffff' }">:</b>
              <b class="r-cd2-num" :style="{ background: comp.props.numBg || '#fd9d4a', color: comp.props.numColor || '#ffffff' }">{{ grp }}</b>
            </template>
            <span class="r-cd2-end" :style="{ color: comp.props.numColor || '#ffffff' }">后结束</span>
          </div>
        </div>
        <div class="r-cd2-right">
          <div class="r-cd2-cell" :style="cd2CellStyle(comp.props, comp.props.sub1Image)" @click="onJump(comp.props.sub1Link)">
            <div class="r-cd2-cell-title" :style="{ color: comp.props.sub1Color || '#333333' }">{{ comp.props.sub1Title || '这里是标题' }}</div>
            <div class="r-cd2-cell-sub" :style="{ color: comp.props.sub1SubColor || '#666666' }">{{ comp.props.sub1Sub || '这里是副标题' }}</div>
          </div>
          <div class="r-cd2-cell" :style="cd2CellStyle(comp.props, comp.props.sub2Image)" @click="onJump(comp.props.sub2Link)">
            <div class="r-cd2-cell-title" :style="{ color: comp.props.sub2Color || '#333333' }">{{ comp.props.sub2Title || '这里是标题' }}</div>
            <div class="r-cd2-cell-sub" :style="{ color: comp.props.sub2SubColor || '#666666' }">{{ comp.props.sub2Sub || '这里是副标题' }}</div>
          </div>
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
      <div class="r-live" :class="'r-live-' + (comp.props.listStyle || '1')" :style="{ background: comp.props.bgColor || 'transparent', borderRadius: (comp.props.radius ?? 8) + 'px' }">
        <div v-if="comp.props.title" class="r-live-title-bar">{{ comp.props.title }}</div>
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
      <div class="r-imagetext" :class="{ overlay: comp.props.textPos === 'overlay', center: comp.props.align === 'center' }" :style="imageTextStyle(comp.props)">
        <img v-if="comp.props.url" :src="resolveUrl(comp.props.url)" :style="imageTextRatio(comp.props)" />
        <div v-else class="r-imagetext-empty" :style="imageTextRatio(comp.props)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg>图文卡片</div>
        <div class="r-imagetext-body" :style="imageTextBodyStyle(comp.props)">
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
      <div class="r-grid" :style="gridStyle(comp.props)">
        <div v-for="(it, i) in comp.props.items || []" :key="i" class="r-grid-item">
          <div v-if="comp.props.showIcon !== false" class="r-grid-icon-wrap" :style="gridIconStyle(comp.props)">
            <div class="r-grid-icon">{{ it.icon || 'card' }}</div>
            <span v-if="it.badge" class="r-grid-badge">{{ it.badge }}</span>
          </div>
          <div class="r-grid-text" :style="{ fontSize: (comp.props.fontSize || 12) + 'px', fontWeight: comp.props.bold ? 600 : 400 }">{{ it.text || '入口' }}</div>
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
      <div class="r-cube" :style="{ background: comp.props.bgColor || 'transparent', padding: comp.props.bgColor ? '6px' : 0 }">
        <div class="r-cube-inner" :style="{ gap: (comp.props.imgGap ?? 4) + 'px' }">
          <div
            v-for="(b, i) in cubeBlocks(comp)" :key="i"
            class="r-cube-block"
            :style="cubeBlockStyle(b)"
          >
            <div class="r-cube-cell" :style="cubeCellStyle(b)">
              <img v-if="b.url" :src="resolveUrl(b.url)" class="r-cube-img" />
              <div v-else class="r-cube-empty"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg></div>
            </div>
          </div>
        </div>
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
      <div class="r-chlive" :class="'r-card-' + (comp.props.style || 'default')" :style="channelLiveStyle(comp.props)">
        <div class="r-chl-cover">
          <div class="r-chl-empty"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14v11H5zM8 7V4h8v3M10 11l4 2.5-4 2.5z"/></svg></div>
          <span class="r-chl-badge" :style="{ background: comp.props.statusBg || '#165DFF', color: comp.props.statusColor || '#fff' }">● 直播中</span>
        </div>
        <div class="r-chl-title" :style="{ color: comp.props.titleColor || '#1D2129' }">直播标题</div>
        <div class="r-chl-time" :style="{ color: comp.props.timeColor || '#86909C' }">今天 20:00 开播</div>
        <div class="r-chl-btn" :style="{ background: comp.props.btnBg || '#165DFF', color: comp.props.btnColor || '#fff' }">预约直播</div>
      </div>
    </template>
    <!-- 富文本 -->
    <template v-else-if="comp.type === 'rich-text'">
      <div class="r-rt-box" :style="rtOuterStyle(comp.props)">
        <div class="r-richtext" v-html="comp.props.html || '<p>富文本内容</p>'" :style="richTextStyle(comp.props)"></div>
      </div>
    </template>
    <!-- 组图橱窗 -->
    <template v-else-if="comp.type === 'image-gallery'">
      <div class="r-gallery" :style="galleryStyle(comp.props)">
        <template v-for="(it, i) in comp.props.items || []" :key="i">
          <div v-if="it.url" class="r-gallery-cell" :style="{ borderRadius: (comp.props.radiusTop ?? 8) + 'px' }"><img :src="resolveUrl(it.url)" /></div>
          <div v-else class="r-gallery-cell r-gallery-empty" :style="{ borderRadius: (comp.props.radiusTop ?? 8) + 'px' }"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 17l5-6 4 5 3-3 4 4"/></svg></div>
        </template>
      </div>
    </template>
    <!-- 标题栏（ew 1:1 实测版：风格1=es-title3 / 风格2-6=es-title2 / 风格7-9=es-title） -->
    <template v-else-if="comp.type === 'title-bar'">
      <div class="r-tb-box" :style="tbOuterStyle(comp.props)">
      <div class="r-titlebar" :class="'r-tb-s' + (comp.props.styleType || 1)" :style="tbWrapStyle(comp.props)">
        <!-- 风格1：es-title3 flex 左装饰图(可换)+主标题+子标题+查看更多(箭头) -->
        <template v-if="(comp.props.styleType || 1) === 1">
          <img v-if="comp.props.imgEnabled !== false && (comp.props.img || tbDecoUrl)" class="r-tb-deco" :src="comp.props.img ? fixDecoImg(comp.props.img) : tbDecoUrl" alt="" />
          <div class="r-tb-mid">
            <span class="r-tb-title" :style="tbTextStyle(comp)">{{ comp.props.text || '标题栏' }}</span>
            <span v-if="comp.props.subEnabled !== false" class="r-tb-en" :style="{ color: comp.props.subColor || '#b7bcd2', fontSize: (comp.props.subFontSize || 12) + 'px' }">{{ comp.props.subText || 'RECOMMEND' }}</span>
          </div>
          <span v-if="comp.props.moreEnabled !== false" class="r-tb-more" :style="{ color: comp.props.moreColor || '#b0b3bf' }" @click="onJump(comp.props.moreLink)">{{ comp.props.moreText || '查看更多' }}<template v-if="comp.props.moreArrow !== false">&nbsp;›</template></span>
        </template>
        <!-- 风格2：es-title2 title5 ★标题★+底部子标题 -->
        <template v-else-if="(comp.props.styleType || 1) === 2">
          <div class="r-tb-row">
            <span class="r-tb-star">★</span>
            <span class="r-tb-title" :style="tbTextStyle(comp)">{{ comp.props.text || '标题栏' }}</span>
            <span class="r-tb-star">★</span>
          </div>
          <div v-if="comp.props.subEnabled !== false" class="r-tb-en-line" :style="{ color: comp.props.subColor || '#333', fontSize: (comp.props.subFontSize || 12) + 'px' }">{{ comp.props.subText || 'RECOMMEND' }}</div>
        </template>
        <!-- 风格3：es-title2 title4 左右气泡+标题 -->
        <template v-else-if="(comp.props.styleType || 1) === 3">
          <img class="r-tb-bub" :src="tbBubbleUrl" alt="" />
          <span class="r-tb-title" :style="tbTextStyle(comp)">{{ comp.props.text || '标题栏' }}</span>
          <img class="r-tb-bub r-tb-bub-r" :src="tbBubbleUrl" alt="" />
        </template>
        <!-- 风格4：es-title2 title1 左右图+标题+查看更多+子标题 -->
        <template v-else-if="(comp.props.styleType || 1) === 4">
          <div class="r-tb-top">
            <div class="r-tb-title-row">
              <img class="r-tb-img" :src="tbS4L" alt="" />
              <span class="r-tb-title" :style="tbTextStyle(comp)">{{ comp.props.text || '标题栏' }}</span>
              <img class="r-tb-img" :src="tbS4R" alt="" />
            </div>
            <span v-if="comp.props.moreEnabled !== false" class="r-tb-more" :style="{ color: comp.props.moreColor || '#b0b3bf' }" @click="onJump(comp.props.moreLink)">{{ comp.props.moreText || '查看更多' }}&nbsp;›</span>
          </div>
          <div v-if="comp.props.subEnabled !== false" class="r-tb-sub" :style="{ color: comp.props.subColor || '#B7BCD2', fontSize: (comp.props.subFontSize || 12) + 'px' }">{{ comp.props.subText || 'RECOMMEND' }}</div>
        </template>
        <!-- 风格5：es-title2 title2 左中右图+标题+查看更多+子标题 -->
        <template v-else-if="(comp.props.styleType || 1) === 5">
          <div class="r-tb-top">
            <div class="r-tb-title-row">
              <img class="r-tb-img" :src="tbS5L" alt="" />
              <span class="r-tb-title" :style="tbTextStyle(comp)">{{ comp.props.text || '标题栏' }}</span>
              <img class="r-tb-img" :src="tbS5R" alt="" />
              <img class="r-tb-center" :src="tbS5C" alt="" />
            </div>
            <span v-if="comp.props.moreEnabled !== false" class="r-tb-more" :style="{ color: comp.props.moreColor || '#b0b3bf' }" @click="onJump(comp.props.moreLink)">{{ comp.props.moreText || '查看更多' }}&nbsp;›</span>
          </div>
          <div v-if="comp.props.subEnabled !== false" class="r-tb-sub" :style="{ color: comp.props.subColor || '#B7BCD2', fontSize: (comp.props.subFontSize || 12) + 'px' }">{{ comp.props.subText || 'RECOMMEND' }}</div>
        </template>
        <!-- 风格6：es-title2 title3 标题+装饰图+查看更多+子标题 -->
        <template v-else-if="(comp.props.styleType || 1) === 6">
          <div class="r-tb-top">
            <div class="r-tb-title-row">
              <span class="r-tb-title" :style="tbTextStyle(comp)">{{ comp.props.text || '标题栏' }}</span>
              <img class="r-tb-img r-tb-img-l" :src="tbS6L" alt="" />
              <img class="r-tb-img r-tb-img-r" :src="tbS6R" alt="" />
            </div>
            <span v-if="comp.props.moreEnabled !== false" class="r-tb-more" :style="{ color: comp.props.moreColor || '#b0b3bf' }" @click="onJump(comp.props.moreLink)">{{ comp.props.moreText || '查看更多' }}&nbsp;›</span>
          </div>
          <div v-if="comp.props.subEnabled !== false" class="r-tb-sub" :style="{ color: comp.props.subColor || '#FFB2B2', fontSize: (comp.props.subFontSize || 12) + 'px' }">{{ comp.props.subText || 'RECOMMEND' }}</div>
        </template>
        <!-- 风格7：es-title title1 两侧短线（标题文字族） -->
        <template v-else-if="(comp.props.styleType || 1) === 7">
          <span class="r-tb-line-l"></span>
          <span class="r-tb-title" :style="tbTextStyle2(comp)">{{ tbTitleText(comp) }}</span>
          <span class="r-tb-line-r"></span>
        </template>
        <!-- 风格8：es-title title2 左侧竖线（标题文字族） -->
        <template v-else-if="(comp.props.styleType || 1) === 8">
          <span class="r-tb-outer"><span class="r-tb-title" :style="tbTextStyle2(comp)">{{ tbTitleText(comp) }}</span><span class="r-tb-inner"></span></span>
          <span class="r-tb-line"></span>
          <span class="r-tb-leftline"></span>
        </template>
        <!-- 风格9：es-title title3 底部线+菱形（标题文字族） -->
        <template v-else>
          <span class="r-tb-outer"><span class="r-tb-title" :style="tbTextStyle2(comp)">{{ tbTitleText(comp) }}</span><span class="r-tb-inner"></span></span>
          <span class="r-tb-line"></span>
          <span class="r-tb-leftline"></span>
        </template>
      </div>
      </div>
    </template>
    <!-- 搜索框 -->
    <template v-else-if="comp.type === 'search'">
      <div class="r-search" :class="comp.props.style === 'shadow' ? 'shadow' : comp.props.style === 'border' ? 'border' : ''" :style="searchStyle(comp.props)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#86909C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg>
        <span v-if="comp.props.showPlaceholder !== false" class="r-search-ph">{{ comp.props.placeholder || '搜索名片 / 内容' }}</span>
        <span v-if="comp.props.showBtn" class="r-search-btn">搜索</span>
      </div>
      <div v-if="comp.props.hotWords" class="r-search-hot">
        <span v-for="(w, wi) in hotWordsList(comp.props)" :key="wi" class="r-search-hot-item">{{ w }}</span>
      </div>
    </template>
    <!-- 选项卡 -->
    <template v-else-if="comp.type === 'tabs'">
      <div class="r-tabs" :class="{ pill: comp.props.tabStyle === 'pill' }" :style="tabsStyle(comp.props)">
        <div v-for="(it, i) in comp.props.items || []" :key="i" class="r-tabs-item" :class="{ active: i === 0 }">{{ it.text || '选项' }}</div>
      </div>
    </template>
    <!-- 万能表单 -->
    <template v-else-if="comp.type === 'form-pro'">
      <div class="r-form" :style="formStyle(comp.props)">
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
      <div class="r-float-wrap" :style="{ height: '64px' }">
        <div class="r-float" :class="'r-float-' + (comp.props.style || 'round')" :style="floatStyle(comp.props)">
          <img v-if="comp.props.iconType === 'image' && comp.props.icon" :src="resolveUrl(comp.props.icon)" />
          <span v-else>{{ comp.props.text || '联系' }}</span>
        </div>
      </div>
    </template>
    <!-- 文章列表 -->
    <template v-else-if="comp.type === 'article-list'">
      <div class="r-article" :class="'r-article-' + (comp.props.listStyle || 'row')" :style="{ background: comp.props.bgColor || 'transparent', borderRadius: (comp.props.radius ?? 8) + 'px' }">
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
      <div class="r-spacer" :style="{ height: (comp.props.height || 20) + 'px', background: comp.props.bgColor || 'transparent' }"></div>
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

import tbDecoUrl from '../../../../assets/design-styles/title/title3.png';
import tbBubbleUrl from '../../../../assets/design-styles/title/bubble.png';
import tbS4L from '../../../../assets/design-styles/title/s4_l.png';
import tbS4R from '../../../../assets/design-styles/title/s4_r.png';
import tbS5L from '../../../../assets/design-styles/title/s5_l.png';
import tbS5C from '../../../../assets/design-styles/title/s5_c.png';
import tbS5R from '../../../../assets/design-styles/title/s5_r.png';
import tbS6L from '../../../../assets/design-styles/title/s6_l.png';
import tbS6R from '../../../../assets/design-styles/title/s6_r.png';
import { customerApiCall } from '../../../../api';

// 标题栏外层（ew 1:1 实测）：底部颜色=外层全宽容器背景（仅S1）
// 2026-09-11 修复：上/下边距=外层 padding、左右边距=外层左右 padding，四周边距区域均露出底部颜色（此前上下边距在内层被背景色覆盖，底部颜色不生效；左右边距缺失）
const tbOuterStyle = (p) => {
  const st = Number(p.styleType) || 1;
  const s = {};
  if (st === 1) {
    if (p.bgColorBottom) s.background = p.bgColorBottom;
    s.paddingTop = (p.marginTop || 0) + 'px';
    s.paddingBottom = (p.marginBottom || 0) + 'px';
    s.paddingLeft = (p.marginLR || 0) + 'px';
    s.paddingRight = (p.marginLR || 0) + 'px';
  }
  return s;
};
// 标题栏内层（ew 1:1 实测 2026-09-11）：组件背景=compBgColor/compBgImg(S1)/bgColor(S2-9)；圆角只在内层(S1)
// S1 上下/左右边距均在外层（露出底部颜色），内层不再 padding；S2-9 无外层背景，padding 仍在内层
const tbWrapStyle = (p) => {
  const st = Number(p.styleType) || 1;
  const s = {};
  if (st === 1) {
    s.background = p.compBgType === 'image' ? (p.compBgImg ? `url(${resolveUrl(p.compBgImg)}) center/cover no-repeat` : 'transparent') : (p.compBgColor || '#ffffff');
  } else {
    if (p.bgColor) s.background = p.bgColor;
    s.paddingTop = (p.marginTop || 0) + 'px';
    s.paddingBottom = (p.marginBottom || 0) + 'px';
    s.paddingLeft = (p.marginLR || 0) + 'px';
    s.paddingRight = (p.marginLR || 0) + 'px';
  }
  if (st === 1 && (p.radiusTop || p.radiusBottom)) {
    s.borderRadius = `${p.radiusTop || 0}px ${p.radiusTop || 0}px ${p.radiusBottom || 0}px ${p.radiusBottom || 0}px`;
  }
  return s;
};
// 主标题族（S1-6）
const tbTextStyle = (comp) => ({ color: comp.props.titleColor || '#333333', fontSize: (comp.props.titleFontSize || 16) + 'px', fontWeight: comp.props.bold ? 700 : 400, fontStyle: comp.props.italic ? 'italic' : 'normal' });
// 标题文字族（S7-9）
const tbTextStyle2 = (comp) => ({ color: comp.props.titleColor2 || '#333333', fontSize: (comp.props.titleFontSize2 || 16) + 'px', fontWeight: comp.props.bold ? 700 : 400, fontStyle: comp.props.italic ? 'italic' : 'normal' });
// 主标题族兜底标题文字族文案（存量组件无 titleText）
const tbTitleText = (comp) => comp.props.titleText || comp.props.text || '标题文字';
const props = defineProps({ comp: { type: Object, required: true }, global: { type: Object, default: null } });

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

// ---- 倒计时（eweishop 1:1 复刻）：动态时间计算 + 风格/样式 + 颜色设置 ----
function cdPart(p, k) {
  const v = countdownRemain(p);
  const map = { d: v.days, h: v.hours, m: v.minutes };
  return String(map[k] || 0).padStart(2, '0');
}
function cdDigits(p, k) {
  return cdPart(p, k).split('');
}
function cdTitle(p) {
  const now = Date.now();
  const start = p.startTime ? new Date(String(p.startTime).replace(' ', 'T')).getTime() : 0;
  const end = p.endTime ? new Date(String(p.endTime).replace(' ', 'T')).getTime() : 0;
  if (start && now < start) return '距活动开始还有';
  if (end && now < end) return '距活动结束还有';
  if (end && now >= end) return '活动已结束';
  return '距活动开始还有';
}
function rCdStyleClass(p) {
  if (p.style === 'border') return 'r-cd-border';
  if (p.style === 'shadow') return 'r-cd-shadow';
  return 'r-cd-plain';
}
function countdownRemain(p) {
  const now = Date.now();
  const start = p.startTime ? new Date(String(p.startTime).replace(' ', 'T')).getTime() : 0;
  const end = p.endTime ? new Date(String(p.endTime).replace(' ', 'T')).getTime() : 0;
  // 旧数据兼容：未配置起止时间时按原 days/hours/minutes/seconds 静态显示
  if (!start && !end) return { days: Number(p.days) || 0, hours: Number(p.hours) || 0, minutes: Number(p.minutes) || 0, seconds: Number(p.seconds) || 0 };
  let diff = 0;
  if (start && now < start) diff = start - now; // 未开始：距开始
  else if (end && now < end) diff = end - now; // 进行中：距结束
  return splitMs(diff);
}
function splitMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.floor(total / 86400), hours: Math.floor((total % 86400) / 3600), minutes: Math.floor((total % 3600) / 60), seconds: total % 60 };
}
function cdNumStyle(p) {
  const s = {};
  if (p.cdNumBg) s.background = p.cdNumBg;
  if (p.cdNumColor) s.color = p.cdNumColor;
  return s;
}
function cdUnitStyle(p) {
  return { color: p.cdNumColor || '#1d2129' };
}
function cdInlineStyle(p) {
  const s = {};
  if (p.cdNumColor) s.color = p.cdNumColor;
  if (p.style === 'shadow') s.textShadow = '0 2px 6px rgba(0,0,0,0.25)';
  if (p.style === 'border') s.webkitTextStroke = '1px rgba(255,255,255,0.6)';
  return s;
}
function cdBoxStyle(p) {
  const s = {};
  if (p.bgColor) s.background = p.bgColor;
  const rt = p.radiusTop || 0;
  const rb = p.radiusBottom || 0;
  if (rt || rb) s.borderRadius = rt + 'px ' + rt + 'px ' + rb + 'px ' + rb + 'px';
  return s;
}
function cdContentStyle(p) {
  const s = {};
  if (p.cdBgType === 'image') {
    if (p.cdBgImage) s.backgroundImage = `url(${JSON.stringify(resolveUrl(p.cdBgImage)).slice(1, -1)})`;
    s.backgroundSize = '100% 100%';
    s.backgroundPosition = '50% 50%';
    s.backgroundRepeat = 'no-repeat';
  } else if (p.cdBgColor) {
    s.background = p.cdBgColor;
  }
  return s;
}
function cdBtnStyle(p) {
  const s = {};
  if (p.cdBtnBg) s.background = p.cdBtnBg;
  if (p.cdBtnText) s.color = p.cdBtnText;
  return s;
}

// ===== 倒计时02（eweishop 复刻：左图文+数字倒计时 + 右双图） =====
function cd2Val(p) {
  let h = 0, m = 0, sec = 0;
  if (p.endTime) {
    const end = new Date(p.endTime.replace(/-/g, '/')).getTime();
    const start = p.startTime ? new Date(p.startTime.replace(/-/g, '/')).getTime() : Date.now();
    let diff = Math.max(0, Math.floor((end - start) / 1000));
    h = Math.floor(diff / 3600); m = Math.floor((diff % 3600) / 60); sec = diff % 60;
  } else {
    h = 3; m = 11; sec = 19;
  }
  return {
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(sec).padStart(2, '0'),
  };
}
function cd2Digits(p) {
  const v = cd2Val(p);
  return [v.h, v.m, v.s];
}
function cd2BoxStyle(p) {
  const s = {};
  if (p.bgColor) s.background = p.bgColor;
  const rt = p.radiusTop || 0, rb = p.radiusBottom || 0;
  if (rt || rb) s.borderRadius = rt + 'px ' + rt + 'px ' + rb + 'px ' + rb + 'px';
  return s;
}
function cd2ImgEffect(p) {
  const s = {};
  if (p.style === 'shadow') s.boxShadow = 'rgba(226,231,244,0.7) 0 0 10px';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#ededed');
  return s;
}
function cd2MainStyle(p) {
  const s = { backgroundSize: 'cover', backgroundPosition: 'center', ...cd2ImgEffect(p) };
  if (p.mainImage) s.backgroundImage = `url(${JSON.stringify(resolveUrl(p.mainImage)).slice(1, -1)})`;
  return s;
}
function cd2CellStyle(p, img) {
  const s = { backgroundSize: 'cover', backgroundPosition: 'center', ...cd2ImgEffect(p) };
  if (img) s.backgroundImage = `url(${JSON.stringify(resolveUrl(img)).slice(1, -1)})`;
  return s;
}

const containerStyle = computed(() => {
  const p = props.comp.props || {};
  const g = props.global || {};
  const cardGap = g.cardGap ?? 12;
  const cardRadius = g.cardRadius ?? 8;
  const s = {};
  // 有「左右边距」参数、属性面板不注入「内边距」滑块的组件：忽略容器 p.padding（防止存量冗余 padding 造成左右隐藏间隔）
  const HIDDEN_PADDING_TYPES = ['image', 'countdown', 'countdown2', 'image-text', 'cube', 'title-bar'];
  if (p.padding !== undefined && p.padding !== '' && !HIDDEN_PADDING_TYPES.includes(props.comp.type)) s.padding = `${p.padding}px`;
  const r = p.radius ?? cardRadius;
  if (r !== '') s.borderRadius = `${r}px`;
  if (p.bgColor) s.background = p.bgColor;
  // 边距统一收敛到容器（标题栏特例：padding 露底部颜色，见 tbOuterStyle）
  if (props.comp.type !== 'title-bar') {
    s.marginTop = `${p.marginTop ?? 0}px`;
    s.marginBottom = `${p.marginBottom ?? cardGap}px`;
    s.marginLeft = `${p.marginLR ?? p.marginLeft ?? 0}px`;
    s.marginRight = `${p.marginLR ?? p.marginRight ?? 0}px`;
  }
  return s;
});

function resolveUrl(u) {
  if (!u) return '';
  if (/^https?:|^data:|^blob:/.test(u)) return u;
  return u.startsWith('/') ? u : `/${u}`;
}

// 魔方区块绝对定位（312 基准等比）
function cubeBlockStyle(b) {
  return {
    left: (b.x / 312 * 100) + '%',
    top: (b.y / 312 * 100) + '%',
    width: (b.w / 312 * 100) + '%',
    height: (b.h / 312 * 100) + '%',
  };
}
// 魔方每格独立配置：间隔=四周留白（叠加在 imgGap 上）、圆角=该格圆角（存量缺省 4px）
function cubeCellStyle(b) {
  const gap = b.gap ?? 0;
  return {
    position: 'absolute',
    top: gap + 'px',
    right: gap + 'px',
    bottom: gap + 'px',
    left: gap + 'px',
    borderRadius: (b.radius ?? 4) + 'px',
    background: '#f7f8fa',
    overflow: 'hidden',
  };
}
// 魔方存量兼容：blocks 为空时回退旧 items/rows/cols
function cubeBlocks(comp) {
  const p = comp.props || {};
  if (Array.isArray(p.blocks) && p.blocks.length) return p.blocks;
  const items = p.items || [];
  if (!items.length) return [];
  const cols = p.cols || 3;
  const rows = p.rows || 2;
  const cw = 312 / cols;
  const ch = 312 / rows;
  return items.map((it, i) => ({
    x: Math.round((i % cols) * cw),
    y: Math.round(Math.floor(i / cols) * ch),
    w: Math.round(cw),
    h: Math.round(ch),
    url: it.url || '',
    link: it.link || '',
  }));
}

// 标题栏装饰图：兼容 C 端旧数据路径(/static/...)与上传图，空值由调用方兜底默认图
function fixDecoImg(u) {
  if (!u) return '';
  if (u.startsWith('/static/')) return '/admin-assets' + u;
  return resolveUrl(u);
}

// 管理端画布不实际跳转，仅阻止冒泡
function onJump() {}

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
  const s = { overflow: 'hidden' };
  s.borderRadius = (p.radiusTop ?? 0) + 'px ' + (p.radiusTop ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px';
  if (p.immersive) s.borderRadius = '0';
  if (p.heightMode === 'full') {
    s.height = '100vh';
    s.minHeight = '400px';
  } else {
    s.height = (p.height || 150) + 'px';
  }
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function gridStyle(p) {
  const s = { gridTemplateColumns: 'repeat(' + (p.columns || 4) + ',1fr)', background: p.bgColor || 'transparent' };
  s.borderRadius = (p.radiusTop || 0) + 'px ' + (p.radiusTop || 0) + 'px ' + (p.radiusBottom || 0) + 'px ' + (p.radiusBottom || 0) + 'px';
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function floatStyle(p) {
  const s = { background: p.color || '#165DFF' };
  const d = (p.distance ?? 12) + 'px';
  const pos = p.position || 'bottom-right';
  if (pos === 'top-left') { s.top = d; s.left = d; }
  else if (pos === 'top-right') { s.top = d; s.right = d; }
  else if (pos === 'bottom-left') { s.bottom = d; s.left = d; }
  else { s.bottom = d; s.right = d; }
  return s;
}
function channelLiveStyle(p) {
  const s = { background: p.bgColor || '#F7F8FA' };
  s.borderRadius = (p.radiusTop ?? 0) + 'px ' + (p.radiusTop ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px';
  if (p.componentBg) s.background = p.componentBg;
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function gridIconStyle(p) {
  const s = { width: (p.iconSize || 40) + 'px', height: (p.iconSize || 40) + 'px', borderRadius: (p.shape === 'rounded' ? (p.iconRadius ?? 12) : 999) + 'px' };
  return s;
}
function noticeStyle(p) {
  const s = { background: p.bgColor, color: p.color, fontSize: (p.fontSize || 14) + 'px' };
  s.borderRadius = (p.radiusTop ?? 0) + 'px ' + (p.radiusTop ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px';
  if (p.bold) s.fontWeight = '600';
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function searchStyle(p) {
  const s = {
    background: p.bgColor || '#F2F3F5',
    borderRadius: (p.radiusTop ?? 16) + 'px ' + (p.radiusTop ?? 16) + 'px ' + (p.radiusBottom ?? 16) + 'px ' + (p.radiusBottom ?? 16) + 'px',
    height: (p.height || 36) + 'px',
  };
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.strokeColor || '#165DFF');
  return s;
}
// ===== 批2 图文类融合组件辅助 =====
function imageBoxStyle(p) {
  const s = { borderRadius: (p.radius ?? 0) + 'px' };
  if (p.widthMode === 'auto') s.display = 'inline-block';
  if (p.bgColor) s.background = p.bgColor;
  return s;
}
function imageRadius(p) {
  if (p.radiusTop || p.radiusBottom) return (p.radiusTop || 0) + 'px ' + (p.radiusTop || 0) + 'px ' + (p.radiusBottom || 0) + 'px ' + (p.radiusBottom || 0) + 'px';
  return (p.radius ?? 0) + 'px';
}
function dividerStyle(p) {
  const st = p.lineStyle === 'dashed' ? 'dashed' : p.lineStyle === 'dotted' ? 'dotted' : 'solid';
  return {
    borderTop: (p.thickness ?? 1) + 'px ' + st + ' ' + (p.color || '#E5E6EB'),
  };
}
function imageTextStyle(p) {
  const s = {};
  s.borderRadius = (p.radiusTop || 0) + 'px ' + (p.radiusTop || 0) + 'px ' + (p.radiusBottom || 0) + 'px ' + (p.radiusBottom || 0) + 'px';
  if (p.bgColor) s.background = p.bgColor;
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function imageTextRatio(p) {
  const map = { '1:1': '100%', '4:3': '75%', '3:4': '133.33%', '16:9': '56.25%' };
  return { aspectRatio: map[p.ratio] || '100%', objectFit: 'cover', width: '100%' };
}
// 图文卡片内容区（内容边距独立控制：p.contentPadding ?? 全局卡片边距；与「左右边距」解耦，旧数据无该字段时沿用全局）
function imageTextBodyStyle(p) {
  const g = props.global || {};
  const cardPadding = g.cardPadding ?? 12;
  return { padding: `${p.contentPadding ?? cardPadding}px` };
}
// 富文本外层（ew 1:1）：底部背景=外层底色；边距统一由容器（comp-render）控制
function rtOuterStyle(p) {
  const s = {};
  if (p.bottomBg) s.background = p.bottomBg;
  return s;
}
// 富文本内层（ew 1:1）：组件背景、圆角只在内层；左右边距统一由容器控制
function richTextStyle(p) {
  const s = {
    background: p.compBgColor || 'transparent',
    borderRadius: (p.radiusTop ?? 0) + 'px ' + (p.radiusTop ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px ' + (p.radiusBottom ?? 0) + 'px',
  };
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function tabsStyle(p) {
  const s = { '--tab': p.color || '#165DFF', background: p.bgColor || '#fff' };
  s.borderRadius = (p.radiusTop ?? 8) + 'px ' + (p.radiusTop ?? 8) + 'px ' + (p.radiusBottom ?? 8) + 'px ' + (p.radiusBottom ?? 8) + 'px';
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function formStyle(p) {
  const s = { background: p.bgColor || 'transparent' };
  s.borderRadius = (p.radiusTop ?? 8) + 'px ' + (p.radiusTop ?? 8) + 'px ' + (p.radiusBottom ?? 8) + 'px ' + (p.radiusBottom ?? 8) + 'px';
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
  return s;
}
function galleryStyle(p) {
  const s = {
    gridTemplateColumns: 'repeat(' + (p.columns || 2) + ',1fr)',
    gap: (p.gap ?? 8) + 'px',
  };
  if (p.style === 'shadow') s.boxShadow = '0 2px 8px rgba(31,35,41,0.1)';
  if (p.style === 'border') s.border = '1px solid ' + (p.borderColor || '#E5E6EB');
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
.r-card-shadow { box-shadow: 0 2px 8px rgba(31,35,41,0.1); }
.r-card-border { border: 1px solid #E5E6EB; }
.comp-render { pointer-events: none; }
.r-title { font-size: 22px; font-weight: 700; line-height: 1.4; }
.r-text { line-height: 1.6; }
.r-image img { width: 100%; border-radius: 8px; display: block; }
.r-image-single { overflow: hidden; }
.r-image-single img { border-radius: 0; }
.r-image-row { display: flex; width: 100%; }
.r-image-row-item { flex: 1; min-width: 0; overflow: hidden; }
.r-image-row .r-image-empty { border-radius: 0; }
.r-image-item { position: relative; }
.r-image-item img { width: 100%; display: block; }
.r-image-item .r-image-empty { border-radius: 8px; }
.r-image-hotspot { position: absolute; border: 1.5px solid #165DFF; background: rgba(22, 93, 255, 0.18); box-sizing: border-box; pointer-events: none; }
.r-image-hotspot-idx { position: absolute; top: 0; left: 0; background: #165DFF; color: #fff; font-size: 10px; line-height: 14px; padding: 0 4px; border-radius: 0 0 4px 0; }
.r-image-empty { height: 88px; display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; color: #86909c; font-size: 12px; background: #f7f8fa; border: 1px dashed #c9cdd4; border-radius: 8px; }
.r-btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-size: 14px; text-align: center; }
.r-divider { height: 0; margin: 14px 0; position: relative; }
.r-divider span { position: absolute; left: 50%; top: -9px; transform: translateX(-50%); background: #fff; padding: 0 10px; font-size: 12px; white-space: nowrap; }
.r-notice { padding: 10px 14px; border-radius: 8px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.r-notice-ico { width: 18px; height: 18px; object-fit: contain; flex: none; }
.r-notice-tag { flex-shrink: 0; font-weight: 600; }
.r-notice-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.r-countdown { background: transparent; display: flex; flex-direction: column; position: relative; overflow: hidden; }
.r-cd-mainimg { display: block; width: 100%; height: auto; }
.r-cd-content { position: relative; padding: 9px 62px 9px 14px; }
.r-cd-title { font-size: 14px; font-weight: 600; color: #ffffff; }
.r-cd-cols { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 5px; }
.r-cd-digit { font-size: 13px; font-weight: 700; color: #FC5917; background: #ffffff; border-radius: 3px; padding: 2px 4px; line-height: 1.4; min-width: 16px; text-align: center; font-style: normal; }
.r-cd-unit { font-style: normal; font-size: 12px; color: #ffffff; margin: 0 3px 0 1px; }
.r-cd-inline { font-size: 15px; font-weight: 600; color: #FC5917; }
.r-cd-plain .r-cd-digit { box-shadow: none; border: none; }
.r-cd-shadow .r-cd-digit { box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18); }
.r-cd-border .r-cd-digit { box-shadow: none; border: 1px solid rgba(252, 89, 23, 0.45); }
.r-cd-btn { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #FC5917; font-size: 12px; line-height: 1.2; width: 48px; height: 48px; border-radius: 50%; background: #FEEC22; display: flex; align-items: center; justify-content: center; text-align: center; }
.r-cd-btn b { max-width: 26px; word-break: break-all; font-weight: 400; }

/* 倒计时02（eweishop 复刻） */
.r-cd2 { display: flex; gap: 6px; overflow: hidden; background: transparent; aspect-ratio: 375 / 188; }
.r-cd2-left { flex: 1; position: relative; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding: 12px 10px; box-sizing: border-box; background-size: cover; background-position: center; cursor: pointer; min-height: 0; overflow: hidden; border-radius: inherit; }
.r-cd2-title { font-size: 13px; font-weight: 700; color: #333333; line-height: 1.2; word-break: break-all; }
.r-cd2-subtitle { font-size: 12px; color: #333333; line-height: 1.3; word-break: break-all; }
.r-cd2-sub { display: flex; align-items: center; gap: 3px; flex-wrap: nowrap; white-space: nowrap; }
.r-cd2-num { min-width: 15px; height: 15px; border-radius: 50%; background: #fd9d4a; color: #ffffff; font-size: 19px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; padding: 0 3px; overflow: hidden; }
.r-cd2-colon { font-size: 14px; font-weight: 400; color: #ffffff; }
.r-cd2-end { font-size: 11px; color: #ffffff; margin-left: 2px; flex-shrink: 0; white-space: nowrap; }
.r-cd2-right { flex: 1; display: flex; flex-direction: column; gap: 5px; min-height: 0; }
.r-cd2-cell { flex: 1; position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px; padding: 3px; box-sizing: border-box; background-size: cover; background-position: center; cursor: pointer; min-height: 0; overflow: hidden; border-radius: inherit; }
.r-cd2-cell-title { font-size: 13px; font-weight: 700; color: #333333; line-height: 1.3; word-break: break-all; text-align: center; }
.r-cd2-cell-sub { font-size: 12px; color: #666666; line-height: 1.3; word-break: break-all; text-align: center; }
/* 样式效果由图片块（left/cell）承担：投影=rgba(226,231,244,.7) 0 0 10px；描边=1px borderColor(#ededed) */
.r-live-title-bar { font-size: 15px; font-weight: 600; color: #1d2129; padding: 2px 0 8px; }
.r-article-title { font-size: 15px; font-weight: 600; color: #1d2129; padding: 2px 0 8px; }
.r-article-row .r-article-item { display: flex; gap: 10px; align-items: flex-start; }
.r-article-row .r-article-img { width: 96px; height: 64px; flex-shrink: 0; }
.r-article-card .r-article-item { display: flex; flex-direction: column; gap: 6px; }
.r-article-card .r-article-img { width: 100%; height: 0; padding-bottom: 66%; position: relative; }
.r-article-card .r-article-img img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.r-article-card .r-article-img-empty { position: absolute; inset: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
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
.r-imagetext-body { box-sizing: border-box; }
.r-imagetext-title { font-size: 15px; font-weight: 600; color: #1d2129; }
.r-imagetext-desc { font-size: 12px; color: #86909c; margin-top: 3px; }
.r-imagetext.overlay .r-imagetext-body { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(transparent, rgba(0,0,0,.55)); color: #fff; }
.r-imagetext.overlay .r-imagetext-title { color: #fff; }
.r-imagetext.overlay .r-imagetext-desc { color: rgba(255,255,255,.85); }
.r-imagetext.center .r-imagetext-body { align-items: center; text-align: center; }
.r-gallery-empty { display: flex; align-items: center; justify-content: center; border: 1px dashed #e5e6eb; min-height: 72px; }
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
.r-cube { width: 100%; box-sizing: border-box; border-radius: 8px; }
.r-cube-inner { position: relative; width: 100%; aspect-ratio: 1 / 1; }
.r-cube-block { position: absolute; }
.r-cube-cell { position: absolute; }
.r-cube-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.r-cube-empty { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border: 1px dashed #e5e6eb; box-sizing: border-box; }
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
.r-titlebar { position: relative; display: flex; align-items: center; box-sizing: border-box; }
.r-tb-title { line-height: 1.4; font-size: 16px; }
.r-tb-more { font-size: 11px; color: #B0B3BF; margin-left: auto; white-space: nowrap; flex-shrink: 0; }
.r-tb-more .r-tb-more-ico { margin-left: 4px; }
/* 风格1 es-title3：内容左右内边距（ew：图片/文字不贴边） */
.r-tb-s1 { min-height: 60px; align-items: center; padding: 0 12px; }
.r-tb-s1 .r-tb-deco { width: 40px; height: 40px; object-fit: contain; margin-right: 8px; flex: none; }
.r-tb-s1 .r-tb-mid { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.r-tb-s1 .r-tb-title { padding: 0 10px; text-align: center; }
.r-tb-s1 .r-tb-en { font-size: 12px; color: #B7BCD2; text-align: center; width: 100%; letter-spacing: 7px; }
.r-tb-s1 .r-tb-more { margin-left: 8px; }
/* 风格2 es-title2 title5 */
.r-tb-s2 { min-height: 60px; flex-direction: column; justify-content: center; }
.r-tb-s2 .r-tb-row { display: flex; align-items: center; justify-content: center; }
.r-tb-s2 .r-tb-star { color: #333; font-size: 14px; }
.r-tb-s2 .r-tb-title { padding: 0; }
.r-tb-s2 .r-tb-en-line { font-size: 12px; color: #333; text-align: center; width: 100%; letter-spacing: 0; margin-top: 0; }
/* 风格3 es-title2 title4 */
.r-tb-s3 { min-height: 60px; justify-content: center; }
.r-tb-s3 .r-tb-bub { width: 38.5px; height: auto; margin: 0 6px; flex: none; }
.r-tb-s3 .r-tb-bub-r { transform: rotateY(180deg); }
.r-tb-s3 .r-tb-title { padding: 0 8px; }
/* 风格4-6 es-title2 */
.r-tb-s4, .r-tb-s5, .r-tb-s6 { min-height: 60px; flex-direction: column; justify-content: center; }
.r-tb-s4 .r-tb-top, .r-tb-s5 .r-tb-top, .r-tb-s6 .r-tb-top { display: flex; align-items: center; width: 100%; }
.r-tb-s4 .r-tb-title-row, .r-tb-s5 .r-tb-title-row { display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; position: relative; }
.r-tb-s6 .r-tb-title-row { display: flex; align-items: center; flex: 1; min-width: 0; position: relative; padding-left: 17px; justify-content: flex-start; }
.r-tb-img { width: 20px; height: auto; object-fit: contain; flex: none; }
.r-tb-s5 .r-tb-img { width: 18.5px; }
.r-tb-center { position: absolute; bottom: 0; width: 99px; height: auto; right: -30px; object-fit: contain; }
.r-tb-s6 .r-tb-img-l { width: 30.5px; position: absolute; bottom: -30px; left: -14px; }
.r-tb-s6 .r-tb-img-r { width: 17.5px; position: absolute; top: -7px; left: 70px; }
.r-tb-s4 .r-tb-title, .r-tb-s5 .r-tb-title, .r-tb-s6 .r-tb-title { padding: 0 8px; z-index: 1; position: relative; }
.r-tb-s4 .r-tb-sub, .r-tb-s5 .r-tb-sub { font-size: 12px; text-align: center; width: 100%; letter-spacing: 7px; line-height: 1.5; }
.r-tb-s6 .r-tb-sub { font-size: 12px; width: 100%; letter-spacing: 0; line-height: 1.5; padding-left: 8px; position: relative; }
/* 风格7 es-title title1 */
.r-tb-s7 { justify-content: center; }
.r-tb-s7 .r-tb-line-l { position: absolute; left: 0; top: 50%; width: 30px; height: 1px; background: #333; margin-left: -30px; }
.r-tb-s7 .r-tb-line-r { position: absolute; right: 0; top: 50%; width: 30px; height: 1px; background: #333; margin-right: -30px; }
.r-tb-s7 .r-tb-title { position: relative; z-index: 2; padding: 0 10px; }
/* 风格8 es-title title2 */
.r-tb-s8 { position: relative; }
.r-tb-s8 .r-tb-outer { position: relative; display: inline-block; }
.r-tb-s8 .r-tb-title { text-align: left; display: block; position: relative; z-index: 2; margin-left: 10px; padding-right: 10px; }
.r-tb-s8 .r-tb-inner, .r-tb-s8 .r-tb-line { display: none; }
.r-tb-s8 .r-tb-leftline { position: absolute; content: ''; top: 3px; left: 0; bottom: 3px; width: 2px; background: #333; }
/* 风格9 es-title title3 */
.r-tb-s9 { position: relative; height: 32px; justify-content: center; }
.r-tb-s9 .r-tb-outer { height: 28px; position: relative; width: 100%; z-index: 2; display: inline-block; text-align: center; }
.r-tb-s9 .r-tb-title { position: relative; z-index: 2; padding: 0 10px; }
.r-tb-s9 .r-tb-inner { position: absolute; content: ''; bottom: 0; left: 0; width: 100%; height: 1px; background: #333; }
.r-tb-s9 .r-tb-line { position: absolute; display: inline-block; border-width: 6px; border-style: solid; border-right-color: #333; border-bottom-color: #333; border-left-color: transparent; border-top-color: transparent; left: 50%; top: 22px; margin-left: -6px; transform: rotate(45deg); }
.r-tb-s9 .r-tb-leftline { display: none; }
/* 视频号直播 */
.r-chlive { border-radius: 8px; overflow: hidden; border: 1px solid #f0f1f3; }
.r-chl-cover { position: relative; aspect-ratio: 16/9; background: #f7f8fa; display: flex; align-items: center; justify-content: center; }
.r-chl-cover img { width: 100%; height: 100%; object-fit: cover; }
.r-chl-empty { opacity: .7; }
.r-chl-badge { position: absolute; left: 8px; top: 8px; background: #f53f3f; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 4px; }
.r-chl-title { padding: 10px 12px; font-size: 14px; font-weight: 600; color: #1d2129; background: #fff; }
/* 富文本 */
.r-richtext { font-size: 14px; color: #1d2129; line-height: 1.7; word-break: break-word; }
/* 富文本内容重置：段落去左右 margin/padding（左右贴边），保留行距与段落间距，与 C 端一致 */
.r-richtext :deep(p) { margin: 0 0 0.5em; padding: 0; }
/* 末段不留底部间距：p 的 margin-bottom 溢出容器背景外，会导致下边距=0 时组件下方仍有空隙 */
.r-richtext :deep(*:last-child) { margin-bottom: 0; }
.r-richtext :deep(img) { max-width: 100%; border-radius: 8px; }
/* 组图橱窗 */
.r-gallery { display: grid; width: 100%; }
.r-gallery-cell { aspect-ratio: 1; overflow: hidden; background: #f7f8fa; }
.r-gallery-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
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
.r-float-wrap { position: relative; width: 100%; box-sizing: border-box; }
.r-float { position: absolute; color: #fff; font-size: 13px; border-radius: 24px; padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,.15); display: flex; align-items: center; justify-content: center; }
.r-float img { width: 22px; height: 22px; object-fit: contain; }
.r-float-square { border-radius: 10px; padding: 8px 14px; }
.r-titlebar { display: flex; align-items: center; }
.r-tb-title { font-size: 16px; line-height: 1.4; }
.r-tb-sub { font-size: 12px; color: #86909C; margin-left: 8px; }
.r-tb-more { font-size: 12px; color: #86909C; margin-left: auto; }
.r-tb-line { flex: 1; height: 2px; background: currentColor; margin-left: 10px; opacity: .2; }
.r-tb-rule { width: 4px; height: 18px; background: #165DFF; margin-right: 8px; border-radius: 2px; }
.r-tb-ico { width: 20px; height: 20px; border-radius: 4px; margin-right: 8px; }
.r-tb-ico-grad { background: linear-gradient(135deg, #165DFF, #8BC8EA); }
.r-tb-square { width: 12px; height: 12px; background: #1D2129; margin-right: 8px; }
.r-tb-heart { color: #F53F3F; margin-right: 6px; font-size: 14px; }
.r-tb-en { font-size: 10px; color: #86909C; margin-left: 8px; letter-spacing: 1px; }
.r-tb-s9 { background: #1D2129 !important; }
.r-tb-s9 .r-tb-title, .r-tb-s9 .r-tb-en, .r-tb-s9 .r-tb-more { color: #fff !important; }
.r-chl-time { font-size: 12px; margin-top: 4px; }
.r-chl-btn { display: inline-block; margin-top: 8px; font-size: 12px; padding: 4px 14px; border-radius: 14px; }
.r-float-round { border-radius: 50%; width: 52px; height: 52px; padding: 0; }
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
