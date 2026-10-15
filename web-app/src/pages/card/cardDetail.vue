<template>
  <!-- ===== 名片详情页（全局对外展示落地页｜所有人可见） =====
       所有对外入口统一进入本页：人脉集市点卡片、扫码、微信分享、人脉库查看他人、我的名片-预览 -->
  <view class="profile-page" :style="[navVars, themeStyle, brandVars]">
<!-- PageNav -->
<PageNav title="名片详情" back overlay :sticky="false" bg="transparent" :color="navFgColor" />
    <!-- 沉浸式hero：card=卡片头式（渐变） / full=全屏大图式（头像背景+视差+计数条） -->
    <view class="hero" :class="[layoutFull ? 'hero-full' : 'hero-' + heroLayout, heroFontCls, squareCls, nameBigCls]" :style="heroStyle">
      <!-- 模板主题 overlay：纹理 + 顶部渐变条 -->
      <view v-if="!layoutFull && textureBg" class="hero-texture" :style="{ backgroundImage: textureBg }"></view>
      <view v-if="!layoutFull && barTopStyle" class="hero-bartop" :style="barTopStyle"></view>
      <!-- tp2 全屏大图式 -->
      <template v-if="layoutFull">
        <image class="hero-bg" :src="card.avatar" mode="aspectFill" :style="bgParallax" />
        <view class="hero-shade"></view>
        <view class="hero-full-info">
          <view class="hfi-name">{{ card.name || '您的姓名' }}</view>
          <view class="hfi-pos">{{ card.position || '—' }}</view>
          <view class="hfi-line"><SIcon name="building" size="small" color="#ffffff" /><text>{{ card.company || '—' }}</text></view>
          <view class="hfi-line" v-if="card.phone"><SIcon name="mobile" size="small" color="#ffffff" /><text>{{ card.phone }}</text></view>
          <view class="hfi-line" v-if="card.city"><SIcon name="location" size="small" color="#ffffff" /><text>{{ card.city }}</text></view>
        </view>
        <view class="hero-counts">
          <view class="hc-item"><text class="hc-num">{{ card.viewCount || 0 }}</text><text class="hc-lab">人气</text></view>
          <view class="hc-item"><text class="hc-num">{{ card.collectCount || 0 }}</text><text class="hc-lab">收藏</text></view>
        </view>
      </template>
      <!-- tp1-1 经典横排（cls）：头像左 · 信息右 -->
      <view class="row1" v-else-if="heroLayout === 'cls'">
        <view class="hero-avatar" :style="avatarStyle">
          <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
          <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
        </view>
        <view class="hero-id">
          <view class="nm" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
          <view class="pos" :style="subStyle">{{ card.position || '—' }}</view>
          <view class="co" :style="subStyle">{{ cityLine }}</view>
        </view>
        <view class="hero-badge" v-if="memberLevel !== 'free'" :style="{ color: heroColor, background: isLightHero ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.16)', borderColor: isLightHero ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.25)' }"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
      </view>
      <!-- tp1-2 居中展示（ctr）：大头像居中 · 信息居中 -->
      <view class="hero-ctr" v-else-if="heroLayout === 'ctr'">
        <view class="ctr-avatar" :style="avatarStyle">
          <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
          <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
        </view>
        <view class="ctr-name" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
        <view class="ctr-pos" :style="subStyle">{{ card.position || '—' }}</view>
        <view class="ctr-co" :style="subStyle">{{ cityLine }}</view>
        <view class="hero-badge ctr-badge" v-if="memberLevel !== 'free'" :style="{ color: heroColor, background: isLightHero ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.16)', borderColor: isLightHero ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.25)' }"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
      </view>
      <!-- tp1-3 杂志大字（mag）：左对齐大字 · 衬线 · 细线 -->
      <view class="hero-mag" v-else-if="heroLayout === 'mag'">
        <view class="mag-name" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
        <view class="mag-rule" :style="accentStyle"></view>
        <view class="mag-pos" :style="subStyle">{{ card.position || '—' }}</view>
        <view class="mag-co" :style="subStyle">{{ cityLine }}</view>
        <view class="hero-badge mag-badge" v-if="memberLevel !== 'free'" :style="badgeStyle"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
      </view>
      <!-- tp1-4 曜石黑金（royal）：金描边居中 · 公司右上角竖排 · 徽章姓名右侧 -->
      <view class="hero-royal" v-else-if="heroLayout === 'royal'">
        <view class="royal-top">
          <view class="royal-ava" :style="avatarStyle">
            <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
            <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
          </view>
          <view class="royal-cos" v-if="cosList.length">
            <view class="rco" v-for="(c, i) in cosList" :key="i">
              <view class="rdot"></view>
              <view class="rc-txt"><text class="rcn">{{ c.name }}</text><text class="rcp" v-if="c.position">{{ c.position }}</text></view>
            </view>
          </view>
        </view>
        <view class="royal-name" :style="nmStyle">{{ card.name || '您的姓名' }}<text class="badge-inline" v-if="memberLevel !== 'free'" :style="badgeInlineStyle"><SIcon name="crown" size="small" :color="badgeInlineAccent" />{{ memberLevelText }}</text></view>
        <view class="royal-pos" :style="subStyle">{{ card.position || '—' }}</view>
        <view class="royal-fl" :style="subStyle">{{ cityLine }}</view>
      </view>
      <!-- pano1 全幅晨光：形象照全幅 + 底部遮罩 + 信息贴底 -->
      <view class="hero-pano1" v-else-if="heroLayout === 'pano1'">
        <image class="pano-bg" :src="card.avatar" mode="aspectFill" />
        <view class="pano-mask-b"></view>
        <view class="pano-top">
          <view class="pano-ava" :style="avatarStyle">
            <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
            <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
          </view>
          <view class="hero-badge" v-if="memberLevel !== 'free'" :style="badgeStyle"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
        </view>
        <view class="pano-info">
          <view class="pano-nm" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
          <view class="pano-ps" :style="subStyle">{{ card.position || '—' }}</view>
          <view class="pano-fl" :style="subStyle">{{ cityLine }}</view>
        </view>
      </view>
      <!-- pano2 黑金尊享：形象照全幅右移 + 左侧渐变蒙版 + 多公司 -->
      <view class="hero-pano2" v-else-if="heroLayout === 'pano2'">
        <image class="pano-bg pano-bg-shift" :src="card.avatar" mode="aspectFill" />
        <view class="pano-mask-l"></view>
        <view class="pano2-info">
          <view class="pano2-nm" :style="nmStyle">{{ card.name || '您的姓名' }}<text class="badge-inline" v-if="memberLevel !== 'free'" :style="badgeInlineStyle"><SIcon name="crown" size="small" :color="badgeInlineAccent" />{{ memberLevelText }}</text></view>
          <view class="pano2-ps" :style="subStyle">{{ card.position || '—' }}</view>
          <view class="pano2-fl" :style="subStyle">{{ cityLine }}</view>
          <view class="pano2-cos" v-if="cosList.length">
            <view class="pco" v-for="(c, i) in cosList" :key="i"><view class="pdot"></view><text class="pcn">{{ c.name }}</text><text class="pcp" v-if="c.position"> · {{ c.position }}</text></view>
          </view>
        </view>
      </view>
      <!-- pano3 圆像明净：圆形大形象照居中（浅底） -->
      <view class="hero-pano3" v-else-if="heroLayout === 'pano3'">
        <view class="hero-badge" v-if="memberLevel !== 'free'" :style="badgeStyle"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
        <view class="p3-ava" :style="avatarStyle">
          <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
          <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
        </view>
        <view class="p3-nm" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
        <view class="p3-ps" :style="subStyle">{{ card.position || '—' }}</view>
        <view class="p3-fl" :style="subStyle">{{ cityLine }}</view>
      </view>
      <!-- pano4 左照右文：左侧形象照整卡 + 右侧信息 -->
      <view class="hero-pano4" v-else-if="heroLayout === 'pano4'">
        <view class="p4-hin">
          <view class="p4-ph">
            <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
            <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
          </view>
          <view class="p4-rin">
            <view class="p4-nm" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
            <view class="p4-ps" :style="subStyle">{{ card.position || '—' }}</view>
            <view class="p4-fl" :style="subStyle">{{ cityLine }}</view>
            <view class="hero-badge" v-if="memberLevel !== 'free'" :style="badgeStyle"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
          </view>
        </view>
      </view>
      <!-- pano5 杂志文艺：左文右图整卡（米白纸底） -->
      <view class="hero-pano5" v-else-if="heroLayout === 'pano5'">
        <view class="p5-rin">
          <view class="p5-nm" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
          <view class="p5-ps" :style="subStyle">{{ card.position || '—' }}</view>
          <view class="p5-fl" :style="subStyle">{{ cityLine }}</view>
          <view class="hero-badge" v-if="memberLevel !== 'free'" :style="badgeStyle"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
        </view>
        <view class="p5-ph">
          <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
          <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
        </view>
      </view>
      <!-- pano6 圆角大图·暗夜：暗底 + 中央大图圆角卡 -->
      <view class="hero-pano6" v-else-if="heroLayout === 'pano6'">
        <view class="hero-badge" v-if="memberLevel !== 'free'" :style="badgeStyle"><SIcon name="crown" size="small" :color="heroColor" /> {{ memberLevelText }}</view>
        <view class="p6-big" :style="avatarStyle">
          <image v-if="card.avatar" :src="card.avatar" class="avatar-img" mode="aspectFill" />
          <view v-else class="avatar-txt" :style="{ color: heroColor }">{{ card.name?.[0] || '名' }}</view>
        </view>
        <view class="p6-nm" :style="nmStyle">{{ card.name || '您的姓名' }}</view>
        <view class="p6-ps" :style="subStyle">{{ card.position || '—' }}</view>
        <view class="p6-fl" :style="subStyle">{{ cityLine }}</view>
      </view>
      <!-- hero 引导条：保存名片 / 关注TA（主题 guide=true 时显示） -->
      <view class="hero-guide" v-if="showGuide" :class="[isLightHero ? 'hg-light' : '', guideSolidCls]">
        <view class="hg-btn" @click="toggleCollect">{{ collected ? '已保存' : '＋ 保存名片' }}</view>
        <view class="hg-btn hg-primary" @click="followCard">关注 TA</view>
      </view>
      <!-- quickbar（快速操作四键+） -->
      <view class="quickbar" :class="isLightHero ? 'qb-light' : ''">
        <view class="qb" @click="callPhone" v-if="card.phone">
          <SIcon name="mobile" size="default" :color="heroColor" />
          <text>拨号</text>
        </view>
        <view class="qb" @click="copyWechat" v-if="card.wechat">
          <SIcon name="exchange" size="default" :color="heroColor" />
          <text>复制微信</text>
        </view>
        <view class="qb" @click="navigateTo">
          <SIcon name="location" size="default" :color="heroColor" />
          <text>导航</text>
        </view>
        <view class="qb" @click="shareCard">
          <SIcon name="channel" size="default" :color="heroColor" />
          <text>分享</text>
        </view>
        <view class="qb" @click="toggleCollect">
          <SIcon name="star" size="default" :color="collected ? '#ffd21e' : heroColor" />
          <text :style="collected ? 'color:#ffd21e' : ''">{{ collected ? '已收藏' : '收藏' }}</text>
        </view>
        <view class="qb" @click="goTemplateSelect" v-if="isMine">
          <SIcon name="template" size="default" :color="heroColor" />
          <text>换模板</text>
        </view>
      </view>
    </view>

    <!-- 任职公司列表卡（极简明净 companiesCard：hero 下方独立列表） -->
    <view class="cos-card" v-if="showCompaniesCard && cosList.length">
      <view class="cos-t">任职公司</view>
      <view class="coco" v-for="(c, i) in cosList" :key="i">
        <view class="cdot"></view>
        <view class="coco-txt"><text class="cn">{{ c.name }}</text><text class="cp" v-if="c.position">{{ c.position }}</text></view>
      </view>
    </view>

    <!-- 人气区：访客头像墙 + 浏览/收藏计数 -->
    <view class="visitor-strip" v-if="card.recentVisitors && card.recentVisitors.length || (card.viewCount || 0) > 0">
      <view class="vs-avs" v-if="card.recentVisitors && card.recentVisitors.length">
        <image v-for="(a, i) in card.recentVisitors" :key="i" class="vs-av" :src="a" mode="aspectFill" />
      </view>
      <view class="vs-count">
        <text class="vs-num">{{ card.viewCount || 0 }}</text> 人浏览
        <text class="vs-dot">·</text>
        <text class="vs-num">{{ card.collectCount || 0 }}</text> 人收藏
      </view>
    </view>

    <!-- Tab切换（demo mp-tabs） -->
    <view class="mp-tabs">
      <view class="mp-tab" :class="{ on: activeTab === 'intro' }" @click="activeTab='intro'">简介<text class="bar"></text></view>
      <view class="mp-tab" :class="{ on: activeTab === 'works' }" @click="activeTab='works'">作品<text class="bar"></text></view>
      <view class="mp-tab" :class="{ on: activeTab === 'dynamic' }" @click="activeTab='dynamic'">动态<text class="bar"></text></view>
      <view class="mp-tab" :class="{ on: activeTab === 'video' }" @click="activeTab='video'">视频<text class="bar"></text></view>
    </view>

    <!-- 简介面板 -->
    <view class="tab-panel" v-if="activeTab === 'intro'">
      <view class="sec-t">个人简介</view>
      <!-- 语音简介（阶段C：上传音频展示） -->
      <view class="voice-box" v-if="card.voiceUrl" @click="toggleVoice">
        <view class="vb-play"><SIcon :name="voicePlaying ? 'pause' : 'play'" size="default" :color="themeColor" /></view>
        <view class="vb-info">
          <view class="vb-name">{{ card.voiceName || '语音简介' }}</view>
          <view class="vb-tip">{{ voicePlaying ? '播放中…' : '点击播放' }}</view>
        </view>
        <text class="vb-dur" v-if="voiceDur">{{ voiceDur }}s</text>
      </view>
      <view class="card-row">
        <view class="intro-line" v-if="card.position">
          <SIcon name="user" size="small" color="#86909c" />
          <text class="lb">身份</text>
          <text class="vl">{{ card.position }}</text>
        </view>
        <view class="intro-line" v-if="card.bio">
          <SIcon name="doc" size="small" color="#86909c" />
          <text class="lb">简介</text>
          <text class="vl">{{ card.bio }}</text>
        </view>
        <view class="intro-line" v-if="card.businessField">
          <SIcon name="radar" size="small" color="#86909c" />
          <text class="lb">专注</text>
          <text class="vl">{{ card.businessField }}</text>
        </view>
        <view class="intro-line" v-if="needTagList.length">
          <SIcon name="exchange" size="small" color="#86909c" />
          <text class="lb">供需</text>
          <view class="skill-tags">
            <view class="skill-tag need" v-for="(tag, i) in needTagList" :key="i">{{ tag }}</view>
          </view>
        </view>
        <view class="intro-line" v-if="tagList.length">
          <SIcon name="star" size="small" color="#86909c" />
          <text class="lb">标签</text>
          <view class="skill-tags">
            <view class="skill-tag" v-for="(tag, i) in tagList" :key="i">{{ tag }}</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 作品面板 -->
    <view class="tab-panel" v-if="activeTab === 'works'">
      <view class="sec-t">我的作品<small>品牌案例</small></view>
      <view class="gall" v-if="works.length">
        <image v-for="w in works" :key="w.id" class="gall-img" :src="w.imageUrl" mode="aspectFill" @click="previewWork(w)" />
      </view>
      <view class="empty-state" v-else>
        <view class="empty-icon"><SIcon name="template" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无作品案例</view>
      </view>
    </view>

    <!-- 动态面板 -->
    <view class="tab-panel" v-if="activeTab === 'dynamic'">
      <view class="sec-t">最新动态</view>
      <view class="dyn-list" v-if="dynamics.length">
        <view class="dyn-card" v-for="d in dynamics" :key="d.id">
          <view class="dyn-head">
            <view class="dyn-av">
              <image v-if="d.authorAvatar" :src="d.authorAvatar" mode="aspectFill" />
              <view v-else>{{ (d.authorName || card.name || '名')[0] }}</view>
            </view>
            <view class="dyn-who">
              <b>{{ d.authorName || card.name }}</b>
              <text>{{ timeText(d.createdAt) }}</text>
            </view>
          </view>
          <view class="dyn-body">
            <h4 v-if="d.title">{{ d.title }}</h4>
            <p>{{ d.content }}</p>
          </view>
          <image v-if="d.images && d.images.length" class="dyn-img" :src="d.images[0]" mode="aspectFill" @click="previewDyn(d)" />
          <view class="dyn-meta">
            <text class="dyn-act" :class="{ liked: d.likedByMe }" @click.stop="toggleLike(d)">
              <SIcon name="like" size="small" :color="d.likedByMe ? themeColor : '#9a9a9a'" /> {{ d.likeCount || 0 }}
            </text>
            <text class="dyn-act" @click.stop="openComments(d)">
              <SIcon name="comment" size="small" color="#9a9a9a" /> {{ d.commentCount || 0 }}
            </text>
          </view>
        </view>
      </view>
      <view class="empty-state" v-else>
        <view class="empty-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无动态</view>
      </view>
    </view>

    <!-- 动态评论面板 -->
    <view class="cmt-mask" v-if="commentPanel.show" @click="commentPanel.show = false"></view>
    <view class="cmt-panel" v-if="commentPanel.show">
      <view class="cmt-head">
        <text>评论（{{ commentPanel.count }}）</text>
        <text class="cmt-close" @click="commentPanel.show = false">✕</text>
      </view>
      <scroll-view scroll-y class="cmt-list">
        <view v-if="commentPanel.list.length === 0" class="cmt-empty">还没有评论，快来抢沙发</view>
        <view class="cmt-item" v-for="c in commentPanel.list" :key="c.id">
          <view class="cmt-av"><image v-if="c.avatar" :src="c.avatar" mode="aspectFill" /><text v-else>{{ (c.nickname || '客')[0] }}</text></view>
          <view class="cmt-body">
            <view class="cmt-name">{{ c.nickname || '访客' }}</view>
            <view class="cmt-text">{{ c.content }}</view>
            <view class="cmt-time">{{ timeText(c.createdAt) }}</view>
          </view>
        </view>
      </scroll-view>
      <view class="cmt-input-row">
        <input class="cmt-input" v-model="commentPanel.text" placeholder="说点什么…" placeholder-class="ph" confirm-type="send" @confirm="submitComment" />
        <button class="cmt-send" :disabled="commentPanel.sending || !commentPanel.text.trim()" @click="submitComment">发送</button>
      </view>
    </view>

    <!-- 视频面板 -->
    <view class="tab-panel" v-if="activeTab === 'video'">
      <view class="sec-t">视频作品<small>对接视频号</small></view>
      <view class="vids-row" v-if="videos.length">
        <view class="vid-card" v-for="v in videos" :key="v.id" @click="openVideo">
          <image class="vid-cover" :src="v.coverUrl" mode="aspectFill" />
          <view class="vid-play"><SIcon name="dynamic" size="large" color="#ffffff" /></view>
          <view class="vid-title">{{ v.title }}</view>
          <view class="vid-dur" v-if="v.duration">{{ v.duration }}</view>
        </view>
      </view>
      <view class="empty-state" v-else-if="!card.videoChannel">
        <view class="empty-icon"><SIcon name="dynamic" size="xlarge" color="#c9cdd4" /></view>
        <view class="empty-text">暂无视频作品</view>
      </view>
      <view class="video-card" v-else @click="openVideo">
        <view class="video-cover"><SIcon name="dynamic" size="large" color="#fff" /></view>
        <view class="video-info">
          <view class="video-title">{{ card.videoChannel }}</view>
          <view class="video-desc">点击跳转视频号</view>
        </view>
      </view>
    </view>

    <!-- 访客表单（租户启用时展示；线索回流） -->
    <view class="form-entry" v-if="activeForm" @click="openForm">
      <view class="fe-icon"><SIcon name="template" size="large" :color="themeColor" /></view>
      <view class="fe-body">
        <view class="fe-title">{{ activeForm.title || '填写表单' }}</view>
        <view class="fe-desc">{{ activeForm.description || '填写信息，方便与对方进一步沟通' }}</view>
      </view>
      <view class="fe-btn">去填写</view>
    </view>

    <!-- 表单弹层 -->
    <view class="form-mask" v-if="formShow" @click="closeForm"></view>
    <view class="form-panel" v-if="formShow">
      <view class="fp-head">
        <text class="fp-title">{{ activeForm.title || '填写表单' }}</text>
        <text class="fp-close" @click="closeForm">✕</text>
      </view>
      <scroll-view scroll-y class="fp-body">
        <view class="fp-desc" v-if="activeForm.description">{{ activeForm.description }}</view>
        <view class="fp-field" v-for="f in (activeForm.fields || [])" :key="f.name">
          <view class="fp-label">{{ f.label || f.name }}<text class="fp-req" v-if="f.required"> *</text></view>
          <picker v-if="f.type === 'select'" :range="f.options || []" @change="(e) => { formData[f.name] = (f.options || [])[Number(e.detail.value)]; }">
            <view class="fp-select">{{ formData[f.name] || '请选择' }}</view>
          </picker>
          <textarea v-else-if="f.type === 'textarea'" class="fp-input fp-area" v-model="formData[f.name]" :placeholder="(f.placeholder || '请输入') + (f.required ? '（必填）' : '')" placeholder-class="ph" />
          <input v-else class="fp-input" v-model="formData[f.name]" :type="f.type === 'tel' ? 'number' : 'text'" :placeholder="(f.placeholder || '请输入') + (f.required ? '（必填）' : '')" placeholder-class="ph" />
        </view>
      </scroll-view>
      <view class="fp-foot">
        <button class="fp-cancel" @click="closeForm">取消</button>
        <button class="fp-submit" :disabled="formSending" @click="submitForm">{{ formSending ? '提交中…' : '提交' }}</button>
      </view>
    </view>

    <!-- 底部TabBar（公共组件：名片/雷达/集市/会员） -->
    <CardTabBar active="card" />
  </view>
</template>

<script setup>
import PageNav from '../../components/PageNav.vue';
import { ref, computed, reactive, onMounted } from 'vue';
import { onUnload, onPageScroll as registerPageScroll } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { track, trackPageView } from '../../utils/analytics.js';
import { heroGradient, brandPalette, hexLuma } from '../../utils/color.js';
import { loginEntryUrl, LOGIN_PATH } from '../../utils/loginEntry.js';
import {
  parseTheme, heroBgStyle, heroTextStyle, heroText2Style, heroAccentStyle, heroForeground,
  heroBarTopStyle, heroTextureBg, heroLayoutClass, heroRadius, heroFontClass,
} from '../../utils/templateTheme.js';
import { saveCardTabState, restoreScrollTop, h5ScrollTop } from './utils/cardTabState.js';
import SIcon from '../../components/SIcon.vue';
import CardTabBar from '../../components/CardTabBar.vue';
import { getNavMetrics, navVarsStyle } from '../../utils/navMetrics.js';
import { useDesignTheme, brandThemeOverride } from '../../utils/design.js';

const navVars = navVarsStyle();
// 小程序端不能运行时注入 <style>，系统主题色必须由根视图内联下发（否则回落 CSS 兜底色）
const themeStyle = useDesignTheme();
// SIcon 不能消费 var()（构建期烘焙 hex），需真实 hex 的图标/开关用这个。
// 品牌主色优先：与下面 brandVars 同源（取被查看名片自身的品牌色），保证同页不出现两种色。
// ⚠️ brand 声明在下方，computed 惰性求值（首次渲染时已过 setup），不存在 TDZ。
const themeColor = computed(() => (brand.value && brand.value.primary) || (themeStyle.value && themeStyle.value['--design-primary']) || '#165dff');

const card = ref({});
const layoutFull = computed(() => card.value?.templateLayout === 'full');
const bgParallax = ref({});
registerPageScroll((e) => {
  if (!layoutFull.value) return;
  bgParallax.value = { transform: `translateY(${e.scrollTop * 0.3}px)` };
});
const voicePlaying = ref(false);
const voiceDur = ref(0);
let voiceCtx = null;
function toggleVoice() {
  if (!card.value?.voiceUrl) return;
  if (!voiceCtx) {
    voiceCtx = uni.createInnerAudioContext();
    voiceCtx.src = card.value.voiceUrl;
    voiceCtx.onTimeUpdate(() => { voiceDur.value = Math.round(voiceCtx.duration || 0); });
    voiceCtx.onEnded(() => { voicePlaying.value = false; });
    voiceCtx.onStop(() => { voicePlaying.value = false; });
    voiceCtx.onError(() => { voicePlaying.value = false; });
  }
  if (voicePlaying.value) { voiceCtx.pause(); voicePlaying.value = false; }
  else { voiceCtx.play(); voicePlaying.value = true; }
}
onUnload(() => { if (voiceCtx) { voiceCtx.destroy(); voiceCtx = null; } });
// ===== 模板主题（新 Schema：heroLayout 版式 + 视觉；兼容旧 primary/background/radius）=====
const heroTheme = computed(() => parseTheme(card.value.templateTheme));
// hero 版式：cls 经典横排 / ctr 居中展示 / mag 杂志大字（full 全屏分支单独处理）
const heroLayout = computed(() => (layoutFull.value ? '' : heroLayoutClass(card.value.templateTheme)));
// hero 背景：模板主题优先（渐变/纯色/描边），无模板时回退租户品牌色渐变
// 沉浸式 hero 顶部避让：直接用 navMetrics 的**真实 px** 内联 padding，不走 CSS
// `calc(var(--pnv-*) …)` —— 小程序对 calc 内混用 var 的支持不稳，声明被整条丢弃会让
// 姓名/职位顶进状态栏并与 PageNav 标题叠在一起（H5 正常、真机错乱的根因之一）。
const heroPadStyle = computed(() => {
  // full 全屏大图式的内容是绝对定位贴底，避让由 .hero-full-info 自己负责，不需要 padding
  if (layoutFull.value) return {};
  const m = getNavMetrics();
  return {
    paddingTop: m.statusBarHeight + m.navBarHeight + 8 + 'px',
    paddingRight: m.capsuleRightPad + 20 + 'px',
  };
});
// 品牌 5 色（服务端 toCard 出口；无模板时各色=''，按 hero 语义回落）
const brand = computed(() => brandPalette(card.value));
// 🔴 品牌主色覆盖页面主题变量：hero 之下的页面主体（quickbar/评论区/表单按钮等
// var(--design-primary) 消费点）也跟随品牌色；未设回落设计中心系统主题色
const brandVars = computed(() => brandThemeOverride(brand.value));
// 🔴 品牌色覆盖模板配色、保留模板布局（用户要求：后台「品牌外观」设了就要生效）。
// 真实名片几乎都带 template_id → 模板主题恒非空，所以必须让品牌色盖过模板配色，
// 而非「模板优先」把品牌色盖死。布局字段（heroLayout/bgType/texture/radius/guide 等）仍取自模板。
const resolvedTheme = computed(() => {
  const t = heroTheme.value;
  const b = brand.value;
  if (!t || !b.primary) return t; // 无模板 / 未设品牌主色 → 原样（模板或兜底）
  const grad = /^#[0-9a-fA-F]{3,6}$/.test(String(b.gradient || '').trim())
    ? String(b.gradient).trim() : shadeHex(b.primary, -0.3);
  // 🔴 前景（姓名/职务/图标/徽章/分隔线/描边）唯一来源 heroForeground：
  //    按 hero 背景实际亮度判明暗 + 对配置色做对比度校验。此前「配置色照抄 + 别处另判背景」
  //    导致同一张 hero 里黑字/白图标/黄职务色混搭（2026-10-15 真机报修）。
  const fg = heroForeground(b.primary, grad, { text: b.text, text2: b.subText, accent: b.secondary });
  return {
    ...t,
    bgStart: b.primary,
    bgEnd: grad,
    bgType: grad.toLowerCase() !== b.primary.toLowerCase() ? 'gradient' : t.bgType,
    textColor: fg.text,
    text2Color: fg.text2,
    accent: fg.accent,
    borderColor: fg.border,
  };
});
// 无模板时 hero 由品牌 5 色接管，前景同样走 heroForeground（与有模板分支共享判据）。
// heroStyle / nmStyle / subStyle / accentStyle 的兜底色统一取这里，避免各处各不相同。
const brandFg = computed(() => {
  const b = brand.value;
  const grad = /^#[0-9a-fA-F]{3,6}$/.test(String(b.gradient || '').trim())
    ? String(b.gradient).trim() : (shadeHex(b.primary, -0.3) || b.primary || '#165dff');
  return heroForeground(b.primary || '#165dff', grad, { text: b.text, text2: b.subText, accent: b.secondary });
});
const heroStyle = computed(() => {
  const t = resolvedTheme.value;
  if (t) return { ...heroPadStyle.value, ...heroBgStyle(t), color: t.textColor };
  // 无模板（品牌 5 色接管 hero）：名片详情头部 = 租户品牌 5 色（后台「品牌外观」）> 装修中心主题色 > 内置默认
  const b = brand.value;
  return {
    ...heroPadStyle.value,
    background: heroGradient(b.primary, b.gradient, 'linear-gradient(155deg, var(--design-primary, #b45309), var(--design-gradient, #f59e0b))'),
    color: brandFg.value.text,
  };
});
const nmStyle = computed(() => {
  const t = resolvedTheme.value;
  if (t) return { ...heroTextStyle(t), fontWeight: t.heroLayout === 'mag' ? 500 : 700 };
  return { color: brandFg.value.text, fontWeight: 700 };
});
const subStyle = computed(() => (resolvedTheme.value ? heroText2Style(resolvedTheme.value) : { color: brandFg.value.text2 }));
const accentStyle = computed(() => (resolvedTheme.value ? heroAccentStyle(resolvedTheme.value) : { color: brandFg.value.accent }));
const avatarStyle = computed(() => (resolvedTheme.value ? { borderRadius: heroRadius(resolvedTheme.value, true) } : {}));
const barTopStyle = computed(() => (resolvedTheme.value ? heroBarTopStyle(resolvedTheme.value) : null));
const textureBg = computed(() => (resolvedTheme.value ? heroTextureBg(resolvedTheme.value) : ''));
const heroColor = computed(() => (resolvedTheme.value?.textColor || brandFg.value.text));
// 衬线字体类名（font-family 必须走 CSS 类，不能内联，见 templateTheme.js 注释）
const heroFontCls = computed(() => heroFontClass(card.value.templateTheme));
// ===== 新皮肤（11套）附加字段 =====
// 多公司列表：card.companies 优先，回退单公司 company
const cosList = computed(() => {
  const cs = card.value.companies;
  if (Array.isArray(cs) && cs.length) return cs;
  if (card.value.company) return [{ name: card.value.company, position: card.value.position || '' }];
  return [];
});
// 引导条（保存名片/关注TA）——主题 guide=true 且非 full 全屏式
const showGuide = computed(() => !layoutFull.value && heroTheme.value?.guide);
const guideSolidCls = computed(() => (heroTheme.value?.guideSolid ? 'hg-solid' : ''));
// 暗夜极光增强：方形图标 + 大姓名
const squareCls = computed(() => (heroTheme.value?.quickSquare ? 'hero-square' : ''));
const nameBigCls = computed(() => (heroTheme.value?.nameBig ? 'hero-namebig' : ''));
// 极简明净：hero 下方任职公司列表卡
const showCompaniesCard = computed(() => !layoutFull.value && heroTheme.value?.companiesCard);
// 徽章样式（复用现有内联写法）
const badgeStyle = computed(() => ({
  color: heroColor.value,
  background: isLightHero.value ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.16)',
  borderColor: isLightHero.value ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.25)',
}));
// 姓名右侧小徽章（曜石黑金/黑金尊享）
const badgeInlineAccent = computed(() => (resolvedTheme.value?.accent || '#c9a25e'));
const badgeInlineStyle = computed(() => ({
  color: badgeInlineAccent.value,
  background: isLightHero.value ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.14)',
  borderColor: resolvedTheme.value?.borderColor || badgeInlineAccent.value,
}));
// 浅色 hero（白/纸艺等）：quickbar / PageNav 标题改深色，避免白色文字不可见
// 🔴 判据必须是**背景色**亮度，不是文字色！纸艺雅致是「深色文字 #2b2723 + 浅色纸底
// #fdfcf9」，按文字色算 luma=39 会误判成深色 hero → 白字白底按钮 → 整块看不见。
const isLightHero = computed(() => {
  // full 全屏大图式是「头像图 + 深色遮罩」，无论模板怎么配都按深色处理
  if (layoutFull.value) return false;
  const t = resolvedTheme.value;
  if (!t) {
    // 无模板（品牌 5 色接管 hero）：与 heroForeground 同判据（此处过去是 hexLuma(primary)>180 的重复实现）
    return brandFg.value.light;
  }
  const c = String(t.bgStart || '').replace('#', '');
  if (c.length !== 6) return false;
  const n = parseInt(c, 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) > 180;
});
// PageNav 悬浮在 hero 之上，标题/返回箭头颜色必须跟 hero 文字色走，
// 否则浅色 hero（纸艺/白底）上白字标题完全看不见（截图症状）。
const navFgColor = computed(() => (isLightHero.value ? '#1d2129' : '#ffffff'));
const works = ref([]);
const dynamics = ref([]);
const videos = ref([]);
const activeTab = ref('intro');
const memberLevel = ref('free');
const activeForm = ref(null);
const formShow = ref(false);
const formData = ref({});
const formSending = ref(false);
const collected = ref(false);

// 访客填写表单提交（线索回流）
function openForm() {
  formData.value = {};
  formShow.value = true;
}
function closeForm() {
  if (formSending.value) return;
  formShow.value = false;
}
function formValid() {
  const fields = activeForm.value?.fields || [];
  for (const f of fields) {
    if (f.required && !String(formData.value[f.name] || '').trim()) return f.label || f.name;
  }
  return '';
}
async function submitForm() {
  if (!activeForm.value || formSending.value) return;
  const miss = formValid();
  if (miss) { uni.showToast({ title: `请填写${miss}`, icon: 'none' }); return; }
  formSending.value = true;
  try {
    await cardApi.submitForm(activeForm.value.id, formData.value);
    uni.showToast({ title: '提交成功', icon: 'success' });
    closeForm();
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    formSending.value = false;
  }
}

const memberLevelText = computed(() => ({ free: '', silver: '白银', gold: '黄金', diamond: '钻石' }[memberLevel.value]));
// demo: 东莞 · 约拍·商业摄影（城市 · slogan/业务）
const cityLine = computed(() => {
  const city = card.value.city || '';
  const biz = card.value.slogan || card.value.businessField || card.value.company || '';
  return [city, biz].filter(Boolean).join(' · ') || '—';
});
// 标签：优先独立tags字段，回退业务领域拆分
const tagList = computed(() => {
  if (card.value.tags) return card.value.tags.split(/[,，、\/]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
  if (!card.value.businessField) return [];
  return card.value.businessField.split(/[/,，、]/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
});
const needTagList = computed(() => {
  try {
    const raw = card.value.needTags || '[]';
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 6) : [];
  } catch (e) { return []; }
});

onMounted(async () => {
  const pages = getCurrentPages();
  const options = pages[pages.length - 1].options || {};
  const id = options.id;
  // 推广二维码扫码进入：静默绑定上下级（首次进入永久锁定，不弹窗）
  const inviter = Number(options.inviter || '');
  if (inviter && inviter !== Number(uni.getStorageSync('card_user')?.id || 0)) {
    if (uni.getStorageSync('card_token')) {
      try {
        await cardApi.distBind(inviter, 'individual');
      } catch (e) {}
    } else {
      // 未登录先暂存，登录后由 myCard 页补绑
      const prev = uni.getStorageSync('pendingInviter');
      if (prev !== String(inviter)) uni.setStorageSync('pendingInviter', String(inviter));
    }
  }
  // 分销漏斗：带邀请链接访问即记一次曝光（访客维度去重，静默失败）
  if (inviter) {
    try {
      let vk = uni.getStorageSync('dist_vk');
      if (!vk) {
        vk = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        uni.setStorageSync('dist_vk', vk);
      }
      await cardApi.distFunnel({ eventType: 'view', inviter, visitorKey: vk });
    } catch (e) {}
  }
  if (id) {
    restoreScrollTop('cardDetail');
    try {
      const res = await cardApi.getCard(id);
      card.value = res.card;
      // 记住最近查看的名片，供底部"名片"Tab切回时使用。
      // 🔴 只记**本人**的名片：本页是对外展示页，浏览他人名片也会进这里，
      // 无条件写入会让底部"名片"Tab / 「我的名片」跳到别人名片上。
      const me = uni.getStorageSync('card_user') || {};
      if (me.id && Number(res.card.userId) === Number(me.id)) {
        uni.setStorageSync('cardLastViewId', id);
      }
      memberLevel.value = res.card.ownerMemberLevel || 'free';
      activeForm.value = res.activeForm || null;
      // 采集访客行为
      cardApi.trackVisitor({ cardId: id, actionType: 'view', page: 'profile' });
      // 行为埋点：浏览名片
      trackPageView('/pages/card/cardDetail');
      track('card_view', { cardId: Number(id), page: '/pages/card/cardDetail', extra: { name: card.value.name } });
      // 加载作品集
      try {
        const w = await cardApi.getCardWorks(id);
        works.value = w.works || [];
      } catch (e) {}
      // 阶段C：查询当前名片是否已收藏（登录用户）
      if (uni.getStorageSync('card_token')) {
        try {
          const c = await cardApi.getMyCollects(200);
          collected.value = (c.collects || []).some((x) => String(x.cardId) === String(id));
        } catch (e) {}
      }
      // 加载动态
      try {
        const d = await cardApi.getCardDynamics(id);
        dynamics.value = d.dynamics || [];
      } catch (e) {}
      // 加载视频
      try {
        const v = await cardApi.getCardVideos(id);
        videos.value = v.videos || [];
      } catch (e) {}
    } catch (e) {}
  }
});

// 离开时保存滚动位置，切Tab返回后恢复
onUnload(() => {
  saveCardTabState('cardDetail', { scrollTop: h5ScrollTop() });
});

function callPhone() {
  if (card.value.phone) uni.makePhoneCall({ phoneNumber: card.value.phone });
}
function copyWechat() {
  if (card.value.wechat) {
    uni.setClipboardData({ data: card.value.wechat, success: () => uni.showToast({ title: '微信号已复制', icon: 'success' }) });
  }
}
function navigateTo() {
  const addr = [card.value.city, card.value.businessField || card.value.company].filter(Boolean).join(' · ');
  if (!addr) {
    uni.showToast({ title: '名片未设置位置', icon: 'none' });
    return;
  }
  uni.setClipboardData({
    data: addr,
    success: () => uni.showToast({ title: '地址已复制，可粘贴到地图导航', icon: 'none' }),
  });
}
function previewWork(w) {
  if (w.imageUrl) uni.previewImage({ urls: works.value.map((x) => x.imageUrl), current: w.imageUrl });
}
function previewDyn(d) {
  if (d.images && d.images.length) uni.previewImage({ urls: d.images, current: d.images[0] });
}

// ===== 动态互动：点赞 =====
async function toggleLike(d) {
  if (!ensureLogin()) return;
  const prevLiked = d.likedByMe;
  const prevCount = d.likeCount || 0;
  d.likedByMe = !prevLiked;
  d.likeCount = Math.max(0, prevCount + (prevLiked ? -1 : 1));
  try {
    const r = await cardApi.likeDynamic(d.id);
    d.likedByMe = r.liked;
    d.likeCount = r.likeCount;
  } catch (e) {
    d.likedByMe = prevLiked;
    d.likeCount = prevCount;
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}

// ===== 动态互动：评论 =====
const commentPanel = reactive({ show: false, dynamicId: null, list: [], count: 0, text: '', sending: false });
async function openComments(d) {
  if (!ensureLogin()) return;
  commentPanel.dynamicId = d.id;
  commentPanel.count = d.commentCount || 0;
  commentPanel.show = true;
  try {
    const r = await cardApi.getComments(d.id);
    commentPanel.list = r.comments || [];
    commentPanel.count = commentPanel.list.length;
  } catch (e) {}
}
async function submitComment() {
  const text = commentPanel.text.trim();
  if (!text || commentPanel.sending) return;
  commentPanel.sending = true;
  try {
    const r = await cardApi.addComment(commentPanel.dynamicId, text);
    commentPanel.list.push(r.comment);
    commentPanel.count++;
    commentPanel.text = '';
    // 同步卡片上的评论数
    const dyn = dynamics.value.find((x) => x.id === commentPanel.dynamicId);
    if (dyn) dyn.commentCount = commentPanel.count;
    uni.showToast({ title: '评论成功', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '评论失败', icon: 'none' });
  } finally {
    commentPanel.sending = false;
  }
}
const isMine = computed(() => Number(card.value.userId) > 0 && Number(card.value.userId) === Number(uni.getStorageSync('card_user')?.id || 0));
function goTemplateSelect() {
  if (!isMine.value) return;
  uni.navigateTo({ url: `/pages/card/templateSelect?cardId=${card.value.id}` });
}
function ensureLogin() {
  if (!uni.getStorageSync('card_token')) {
    uni.showToast({ title: '请先登录', icon: 'none' });
    // 与收藏同款：loginEntryUrl 必带 manual=1 + redirect 回跳本页（登录页兼任冷启动首页）
    const id = (getCurrentPages()[getCurrentPages().length - 1].options || {}).id || '';
    uni.reLaunch({ url: loginEntryUrl(LOGIN_PATH, `/pages/card/cardDetail?id=${id}`) });
    return false;
  }
  return true;
}
function timeText(t) {
  if (!t) return '';
  const diff = (Date.now() - new Date(t.replace(' ', 'T')).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 172800) return '昨天';
  return new Date(t).toLocaleDateString('zh-CN');
}
function openVideo() {
  uni.showToast({ title: '跳转视频号', icon: 'none' });
}
async function toggleCollect() {
  const id = (getCurrentPages()[getCurrentPages().length - 1].options || {}).id;
  if (!id) return;
  if (!uni.getStorageSync('card_token')) {
    uni.showToast({ title: '请先登录后收藏', icon: 'none' });
    // 走 loginEntryUrl：必带 manual=1（登录页同时是冷启动首页，不带会被 onShow 首页联动
    // 立刻弹走，连登录按钮都点不到）+ redirect 回跳本页
    uni.reLaunch({ url: loginEntryUrl(LOGIN_PATH, `/pages/card/cardDetail?id=${id}`) });
    return;
  }
  try {
    if (collected.value) {
      await cardApi.uncollectCard(id);
      collected.value = false;
      uni.showToast({ title: '已取消收藏', icon: 'none' });
    } else {
      await cardApi.collectCard(id);
      collected.value = true;
      uni.showToast({ title: '收藏成功', icon: 'success' });
    }
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}

function shareCard() {
  uni.showToast({ title: '请点击右上角分享', icon: 'none' });
}

// 关注 TA：交换名片/建立连接（card.js POST /exchange）
async function followCard() {
  if (!card.value.id) return;
  try {
    await cardApi.exchange({ toCardId: card.value.id, sharePhone: false });
    uni.showToast({ title: '已交换名片', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  background: var(--bg-page);
  padding-bottom: 140rpx;
}

/* ===== hero（demo g4 橙色渐变）===== */
/* 沉浸式：状态栏占位按机型动态取，右侧留胶囊宽度（最小化 + 三个点） */
.hero {
  position: relative;
  /* 完整避让：状态栏 + 导航行高（PageNav overlay 悬浮 + 右侧胶囊同高区域） */
  padding: calc(var(--pnv-status-bar, 20px) + var(--pnv-nav-h, 44px) + 16rpx) 40rpx 52rpx;
  padding-right: calc(var(--pnv-capsule-pad, 7px) + 40rpx);
  color: #fff;
  background: linear-gradient(155deg, var(--design-primary, #b45309), var(--design-gradient, #f59e0b));
  overflow: hidden;
}
.row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}
.hero-avatar {
  width: 132rpx;
  height: 132rpx;
  border-radius: 36rpx;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.35);
  box-shadow: 0 12rpx 32rpx rgba(0,0,0,0.25);
  flex-shrink: 0;
  background: rgba(255,255,255,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-txt {
  font-size: 48rpx;
  font-weight: 700;
  color: #fff;
}
.hero-id {
  flex: 1;
  margin-left: 28rpx;
}
.nm {
  font-size: 40rpx;
  font-weight: 700;
}
.pos {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 6rpx;
}
.co {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  font-size: 21rpx;
  background: rgba(255,255,255,0.18);
  border: 1px solid rgba(255,255,255,0.25);
  padding: 8rpx 18rpx;
  border-radius: 999rpx;
  white-space: nowrap;
  flex-shrink: 0;
}
/* ===== 模板主题 overlay：纹理 + 顶部渐变条 ===== */
.hero-texture {
  position: absolute;
  inset: 0;
  background-size: 90rpx 90rpx, 90rpx 90rpx;
  background-position: 0 0, 45rpx 45rpx;
  opacity: 0.55;
  pointer-events: none;
  z-index: 0;
}
.hero-bartop {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 8rpx;
  z-index: 2;
}
/* ===== 居中展示（ctr）===== */
.hero-ctr {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.ctr-avatar {
  width: 148rpx;
  height: 148rpx;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255,255,255,0.4);
  box-shadow: 0 12rpx 32rpx rgba(0,0,0,0.25);
  background: rgba(255,255,255,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ctr-name {
  font-size: 42rpx;
  font-weight: 700;
  margin-top: 18rpx;
  letter-spacing: 2rpx;
}
.ctr-pos {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 8rpx;
}
.ctr-co {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
}
.ctr-badge {
  margin-top: 16rpx;
}
/* ===== 杂志大字（mag）===== */
.hero-mag {
  position: relative;
  z-index: 1;
  padding-top: 6rpx;
}
.mag-name {
  font-size: 52rpx;
  letter-spacing: 4rpx;
}
.mag-rule {
  width: 56rpx;
  height: 4rpx;
  margin: 18rpx 0;
  border-radius: 4rpx;
}
.mag-pos {
  font-size: 25rpx;
  letter-spacing: 2rpx;
  opacity: 0.88;
}
.mag-co {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
  letter-spacing: 1rpx;
}
.mag-badge {
  margin-top: 18rpx;
}
/* ===== 曜石黑金（royal）：金描边居中 · 公司右上角竖排 · 徽章姓名右侧 ===== */
.hero-royal {
  position: relative;
  z-index: 1;
}
.royal-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.royal-ava {
  width: 112rpx;
  height: 112rpx;
  overflow: hidden;
  border: 2rpx solid rgba(201,162,94,0.75);
  box-shadow: 0 10rpx 26rpx rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.royal-cos {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  align-items: flex-end;
  padding-top: 8rpx;
  max-width: 60%;
}
.rco {
  display: flex;
  align-items: flex-start;
  gap: 10rpx;
}
.rdot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: #c9a25e;
  margin-top: 12rpx;
  flex-shrink: 0;
}
.rc-txt {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.rcn {
  font-size: 23rpx;
  letter-spacing: 1rpx;
}
.rcp {
  font-size: 20rpx;
  opacity: 0.72;
  margin-top: 2rpx;
}
.royal-name {
  font-size: 46rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  margin-top: 24rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}
.badge-inline {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  border: 1rpx solid;
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
  white-space: nowrap;
}
.royal-pos {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 8rpx;
}
.royal-fl {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
}
/* ===== 形象照 hero（pano1/pano2 全幅照片固定高） ===== */
.hero-pano1,
.hero-pano2 {
  height: 640rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.pano-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}
.pano-bg-shift {
  object-position: 60% 18%;
  transform: translateX(20%);
}
.pano-mask-b {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(8,6,10,0) 32%, rgba(8,6,10,0.72) 100%);
  z-index: 1;
}
.pano-mask-l {
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, #08060a 0%, #08060a 32%, rgba(8,6,10,0.62) 46%, rgba(8,6,10,0.18) 62%, rgba(8,6,10,0) 78%);
  z-index: 1;
}
.pano-top {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 22rpx;
}
.pano-ava {
  width: 84rpx;
  height: 84rpx;
  overflow: hidden;
  border: 2rpx solid rgba(255,255,255,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pano-info,
.pano2-info {
  position: relative;
  z-index: 2;
}
.pano-nm {
  font-size: 44rpx;
  font-weight: 700;
}
.pano-ps {
  font-size: 26rpx;
  opacity: 0.9;
  margin-top: 6rpx;
}
.pano-fl {
  font-size: 24rpx;
  opacity: 0.72;
  margin-top: 8rpx;
}
.pano2-info {
  padding-right: 120rpx;
}
.pano2-nm {
  font-size: 44rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}
.pano2-ps {
  font-size: 26rpx;
  opacity: 0.9;
  margin-top: 6rpx;
}
.pano2-fl {
  font-size: 24rpx;
  opacity: 0.78;
  margin-top: 8rpx;
}
.pano2-cos {
  margin-top: 14rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.pco {
  display: flex;
  align-items: center;
  gap: 8rpx;
  font-size: 22rpx;
}
.pdot {
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: #d9bc78;
  flex-shrink: 0;
}
.pcn {
  opacity: 0.92;
}
.pcp {
  opacity: 0.68;
}
/* ===== pano3 圆像明净：圆形大形象照居中 ===== */
.hero-pano3 {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.p3-ava {
  width: 240rpx;
  height: 240rpx;
  border-radius: 50%;
  overflow: hidden;
  border: 2rpx solid rgba(var(--design-primary-rgb, 22, 93, 255), 0.25);
  box-shadow: 0 14rpx 36rpx rgba(0,0,0,0.12);
  margin-top: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.p3-nm {
  font-size: 42rpx;
  font-weight: 700;
  margin-top: 20rpx;
}
.p3-ps {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 8rpx;
}
.p3-fl {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
}
/* ===== pano4 左照右文：左侧形象照整卡 + 右侧信息 ===== */
.hero-pano4 {
  position: relative;
  z-index: 1;
}
.p4-hin {
  display: flex;
  gap: 30rpx;
  align-items: center;
}
.p4-ph {
  width: 250rpx;
  height: 330rpx;
  border-radius: 28rpx;
  overflow: hidden;
  flex-shrink: 0;
  border: 2rpx solid rgba(201,162,94,0.4);
  box-shadow: 0 12rpx 30rpx rgba(0,0,0,0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}
.p4-rin {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.p4-nm {
  font-size: 40rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.p4-ps {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 8rpx;
}
.p4-fl {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
}
.p4-rin .hero-badge {
  margin-top: 16rpx;
}
/* ===== pano5 杂志文艺：左文右图整卡 ===== */
.hero-pano5 {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 28rpx;
  align-items: flex-end;
}
.p5-rin {
  flex: 1;
  padding-bottom: 6rpx;
}
.p5-nm {
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.p5-ps {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 8rpx;
}
.p5-fl {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
}
.p5-rin .hero-badge {
  margin-top: 16rpx;
}
.p5-ph {
  width: 300rpx;
  height: 360rpx;
  border-radius: 16rpx;
  overflow: hidden;
  flex-shrink: 0;
  border: 2rpx solid rgba(138,122,92,0.35);
  box-shadow: 0 12rpx 28rpx rgba(0,0,0,0.14);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* ===== pano6 圆角大图·暗夜：暗底中央大图圆角卡 ===== */
.hero-pano6 {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.p6-big {
  width: 300rpx;
  height: 380rpx;
  border-radius: 26rpx;
  overflow: hidden;
  margin-top: 22rpx;
  border: 2rpx solid rgba(217,188,120,0.45);
  box-shadow: 0 16rpx 40rpx rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.p6-nm {
  font-size: 42rpx;
  font-weight: 700;
  margin-top: 20rpx;
}
.p6-ps {
  font-size: 25rpx;
  opacity: 0.88;
  margin-top: 8rpx;
}
.p6-fl {
  font-size: 23rpx;
  opacity: 0.72;
  margin-top: 10rpx;
}
/* ===== hero 引导条（保存名片/关注TA） ===== */
.hero-guide {
  position: relative;
  z-index: 2;
  display: flex;
  gap: 18rpx;
  margin-top: 26rpx;
}
.hg-btn {
  flex: 1;
  height: 78rpx;
  border-radius: 39rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 27rpx;
  background: rgba(255,255,255,0.16);
  border: 1rpx solid rgba(255,255,255,0.3);
}
.hg-btn.hg-primary {
  background: linear-gradient(135deg, var(--design-primary, #b45309), var(--design-gradient, #f59e0b));
  border: none;
  color: #fff;
}
.hero-guide.hg-light .hg-btn {
  background: rgba(0,0,0,0.05);
  border-color: rgba(0,0,0,0.1);
  color: #1d2129;
}
.hero-guide.hg-solid .hg-btn.hg-primary {
  background: #2b2723;
  color: #fdfcf9;
}
/* ===== 任职公司列表卡（极简明净 companiesCard） ===== */
.cos-card {
  margin: 24rpx 24rpx 0;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.06);
  padding: 26rpx 28rpx;
}
.cos-t {
  font-size: 24rpx;
  color: #8a8f99;
  margin-bottom: 18rpx;
}
.coco {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  padding: 12rpx 0;
}
.coco + .coco {
  border-top: 1rpx solid #f2f3f5;
}
.cdot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 50%;
  background: var(--design-primary, #165dff);
  margin-top: 12rpx;
  flex-shrink: 0;
}
.coco-txt {
  display: flex;
  flex-direction: column;
  gap: 2rpx;
}
.cn {
  font-size: 26rpx;
  font-weight: 600;
  color: #1d2129;
}
.cp {
  font-size: 22rpx;
  color: #8a8f99;
}
/* ===== 暗夜极光增强（mag + quickSquare/nameBig/guideSolid） ===== */
.hero-square .qb {
  border-radius: 18rpx;
  padding: 16rpx 0 14rpx;
}
.hero-namebig .mag-name {
  font-size: 60rpx;
}
.hero-namebig .mag-rule {
  width: 72rpx;
  height: 5rpx;
}
/* ===== 浅色 hero（白/纸艺）：导航标题 + quickbar 文字改深色，避免白字不可见 ===== */
.hero .quickbar.qb-light .qb {
  background: rgba(0,0,0,0.05);
  border-color: rgba(0,0,0,0.09);
  /* .qb 自身 color 是 #fff，图标走 heroColor 内联（本就正确），但 <text> 靠继承 → 必须显式改 */
  color: #1d2129;
}
.hero .quickbar.qb-light .qb text {
  color: #1d2129;
}
/* ===== 衬线字体（模板 fontFamily=serif，如「纸艺雅致」）=====
   🔴 必须走 CSS 类，**不能内联 font-family**：小程序 setStyle 对含双引号的值
   （'"Songti SC","STSong","SimSun",serif'）会让整条 style 失效 → 浅色 hero 上
   深色文字退回 CSS 的 #fff 变白字（真机复现，H5 正常）。见 utils/templateTheme.js */
.hero-serif .nm,
.hero-serif .ctr-name,
.hero-serif .mag-name,
.hero-serif .hfi-name,
.hero-serif .royal-name,
.hero-serif .pano-nm,
.hero-serif .pano2-nm,
.hero-serif .p3-nm,
.hero-serif .p4-nm,
.hero-serif .p5-nm,
.hero-serif .p6-nm {
  font-family: 'Songti SC', 'STSong', 'SimSun', serif;
}

/* ===== quickbar（demo四键）===== */
.quickbar {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
  margin-top: 36rpx;
}
.qb {
  background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 26rpx;
  padding: 18rpx 0 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  color: #fff;
  font-size: 22rpx;
}

/* ===== mp-tabs（demo）===== */
.mp-tabs {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  background: var(--bg-page);
  border-bottom: 1px solid #eeeeee;
  padding: 0 12rpx;
}
.mp-tab {
  flex: 1;
  text-align: center;
  padding: 26rpx 0 22rpx;
  font-size: 28rpx;
  color: var(--t4);
  font-weight: 500;
  position: relative;
  transition: color 0.2s;
}
.mp-tab.on {
  color: var(--design-primary, #165dff);
  font-weight: 600;
}
.bar {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 44rpx;
  height: 6rpx;
  border-radius: 6rpx;
  background: var(--design-primary, #165dff);
  transform: translateX(-50%) scaleX(0);
  transition: transform 0.28s;
}
.mp-tab.on .bar {
  transform: translateX(-50%) scaleX(1);
}

/* ===== 内容面板 ===== */
.tab-panel {
  padding-bottom: 24rpx;
}
.sec-t {
  margin: 36rpx 32rpx 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--t5);
}
.sec-t small {
  font-size: 22rpx;
  color: var(--t4);
  font-weight: 400;
}
.card-row {
  margin: 0 28rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 8rpx 24rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.intro-line {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
  padding: 22rpx 0;
  border-bottom: 1px dashed #eeeeee;
  font-size: 26rpx;
}
.intro-line:last-child {
  border-bottom: none;
}
.lb {
  color: var(--t4);
  flex-shrink: 0;
  width: 72rpx;
}
.vl {
  color: var(--t5);
  flex: 1;
  line-height: 1.6;
}
.vl.link {
  color: var(--design-primary, #165dff);
}
.skill-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 4rpx;
}
/* 供需/标签 chip：跟随租户主题 tint（与 myCard .oc-need 同款），
   收敛前是「普通标签绿底 + 供需琥珀底」两套色 —— 同屏双色相无区分度 */
.skill-tag.need, .skill-tag {
  background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.08);
  color: var(--design-primary, #165dff);
  font-size: 22rpx;
  padding: 6rpx 18rpx;
  border-radius: 24rpx;
}

/* ===== 作品网格（demo gall）===== */
.gall {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18rpx;
  margin: 0 28rpx;
}
.gall-img {
  width: 100%;
  height: 184rpx;
  object-fit: cover;
  border-radius: 24rpx;
  display: block;
}

/* ===== 空状态 ===== */
.empty-state {
  text-align: center;
  padding: 100rpx 0;
}
.empty-icon {
  margin-bottom: 20rpx;
}
.empty-text {
  font-size: 26rpx;
  color: var(--t4);
}

/* ===== 视频 ===== */
.video-card {
  margin: 0 28rpx;
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  display: flex;
  align-items: center;
  gap: 20rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.video-cover {
  width: 120rpx;
  height: 120rpx;
  background: #000;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.video-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--t5);
  margin-bottom: 8rpx;
}
.video-desc {
  font-size: 24rpx;
  color: var(--t4);
}

/* ===== 动态（demo dyn-card）===== */
.dyn-list {
  padding: 0 28rpx;
}
.dyn-card {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}
.dyn-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.dyn-av {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--t4);
  font-size: 28rpx;
  flex-shrink: 0;
}
.dyn-av image {
  width: 100%;
  height: 100%;
}
.dyn-who {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.dyn-who b {
  font-size: 27rpx;
  color: var(--t5);
}
.dyn-who span {
  font-size: 22rpx;
  color: var(--t4);
}
.dyn-body {
  margin-top: 16rpx;
}
.dyn-body h4 {
  font-size: 28rpx;
  color: var(--t5);
  margin-bottom: 8rpx;
  font-weight: 600;
}
.dyn-body p {
  font-size: 25rpx;
  color: var(--t2);
  line-height: 1.6;
}
.dyn-img {
  width: 100%;
  height: 320rpx;
  border-radius: 16rpx;
  margin-top: 16rpx;
  display: block;
}
.dyn-meta {
  display: flex;
  gap: 32rpx;
  margin-top: 16rpx;
  font-size: 23rpx;
  color: var(--t4);
}
.dyn-meta span {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

/* ===== 视频（demo vids 横滑卡片）===== */
.vids-row {
  display: flex;
  gap: 20rpx;
  padding: 4rpx 28rpx;
  overflow-x: auto;
}
.vid-card {
  flex: 0 0 300rpx;
  border-radius: 26rpx;
  overflow: hidden;
  position: relative;
  background: #000;
}
.vid-cover {
  width: 100%;
  height: 300rpx;
  object-fit: cover;
  display: block;
}
.vid-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.1);
}
.vid-title {
  position: absolute;
  left: 16rpx;
  right: 16rpx;
  bottom: 16rpx;
  color: #fff;
  font-size: 22rpx;
  line-height: 1.4;
}
.vid-dur {
  position: absolute;
  right: 10rpx;
  top: 10rpx;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 20rpx;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
}

/* ===== 动态评论面板 ===== */
.cmt-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 900; }
.cmt-panel { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-radius: 24rpx 24rpx 0 0; z-index: 901; display: flex; flex-direction: column; max-height: 60vh; }
.cmt-head { display: flex; justify-content: space-between; align-items: center; padding: 28rpx 32rpx; border-bottom: 1rpx solid #f0f0f0; font-size: 30rpx; font-weight: 600; color: var(--t1); }
.cmt-close { color: var(--t3); font-size: 32rpx; font-weight: 400; padding: 4rpx 12rpx; }
.cmt-list { flex: 1; overflow: hidden; padding: 8rpx 32rpx; }
.cmt-empty { text-align: center; color: var(--t3); font-size: 26rpx; padding: 48rpx 0; }
.cmt-item { display: flex; gap: 18rpx; padding: 20rpx 0; border-bottom: 1rpx solid var(--bg-card); }
.cmt-av { width: 64rpx; height: 64rpx; border-radius: 50%; background: linear-gradient(135deg, var(--design-primary, #165dff), var(--design-gradient, #4080ff)); color: #fff; font-size: 28rpx; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.cmt-av image { width: 100%; height: 100%; }
.cmt-body { flex: 1; min-width: 0; }
.cmt-name { font-size: 26rpx; color: var(--t2); font-weight: 500; }
.cmt-text { font-size: 28rpx; color: var(--t1); margin-top: 4rpx; word-break: break-all; }
.cmt-time { font-size: 22rpx; color: var(--border-strong); margin-top: 6rpx; }
.cmt-input-row { display: flex; gap: 16rpx; padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #f0f0f0; background: #fff; }
.cmt-input { flex: 1; height: 72rpx; background: var(--bg-card); border-radius: 36rpx; padding: 0 28rpx; font-size: 28rpx; }
.cmt-send { width: 140rpx; height: 72rpx; line-height: 72rpx; background: var(--design-primary, #165dff); color: #fff; font-size: 28rpx; border-radius: 36rpx; padding: 0; margin: 0; }
.cmt-send[disabled] { opacity: 0.5; }
.dyn-act { display: inline-flex; align-items: center; gap: 6rpx; padding: 8rpx 14rpx; border-radius: 24rpx; }
.dyn-act.liked { color: var(--design-primary, #165dff); font-weight: 600; background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.06); }


/* ===== 访客表单 ===== */
.form-entry { display: flex; align-items: center; gap: 16rpx; margin: 24rpx 24rpx 8rpx; padding: 24rpx; background: #fff; border-radius: 16rpx; box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.04); }
.fe-icon { width: 72rpx; height: 72rpx; border-radius: 14rpx; background: rgba(var(--design-primary-rgb, 22, 93, 255), 0.06); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fe-body { flex: 1; min-width: 0; }
.fe-title { font-size: 28rpx; font-weight: 600; color: var(--t1); }
.fe-desc { font-size: 22rpx; color: var(--t3); margin-top: 4rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fe-btn { flex-shrink: 0; font-size: 24rpx; color: var(--design-primary, #165dff); border: 1rpx solid var(--design-primary, #165dff); border-radius: 28rpx; padding: 8rpx 24rpx; }
.form-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 920; }
.form-panel { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-radius: 24rpx 24rpx 0 0; z-index: 921; display: flex; flex-direction: column; max-height: 72vh; }
.fp-head { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 28rpx 16rpx; border-bottom: 1rpx solid var(--bg-hover); }
.fp-title { font-size: 30rpx; font-weight: 600; color: var(--t1); }
.fp-close { font-size: 28rpx; color: var(--t3); padding: 4rpx 8rpx; }
.fp-body { flex: 1; padding: 24rpx 28rpx; box-sizing: border-box; }
.fp-desc { font-size: 24rpx; color: var(--t3); margin-bottom: 20rpx; }
.fp-field { margin-bottom: 24rpx; }
.fp-label { font-size: 26rpx; color: var(--t1); margin-bottom: 10rpx; }
.fp-req { color: var(--danger); }
.fp-input { background: var(--bg-card); border-radius: 12rpx; padding: 18rpx 20rpx; font-size: 26rpx; color: var(--t1); }
.fp-area { width: 100%; box-sizing: border-box; height: 140rpx; }
.fp-select { background: var(--bg-card); border-radius: 12rpx; padding: 18rpx 20rpx; font-size: 26rpx; color: var(--t2); }
.fp-foot { display: flex; gap: 16rpx; padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid var(--bg-hover); }
.fp-cancel { flex: 1; background: var(--bg-hover); color: var(--t2); font-size: 28rpx; border-radius: 12rpx; }
.fp-submit { flex: 1; background: var(--design-primary, #165dff); color: #fff; font-size: 28rpx; border-radius: 12rpx; }
.fp-submit[disabled] { opacity: 0.6; }

.voice-box {
  display: flex; align-items: center; gap: 18rpx;
  background: var(--bg-card); border-radius: 16rpx; padding: 22rpx 24rpx;
  margin-bottom: 16rpx;
}
.vb-info { flex: 1; min-width: 0; }
.vb-name { font-size: 28rpx; font-weight: 600; color: var(--t1); }
.vb-tip { font-size: 22rpx; color: var(--t3); margin-top: 4rpx; }
.vb-play {
  width: 72rpx; height: 72rpx; border-radius: 50%; flex-shrink: 0;
  background: var(--bg-tag); display: flex; align-items: center; justify-content: center;
}
.vb-dur { font-size: 22rpx; color: var(--t3); flex-shrink: 0; }
.visitor-strip {
  display: flex; align-items: center; justify-content: space-between;
  background: #ffffff; margin: 16rpx 32rpx 0; padding: 20rpx 24rpx;
  border-radius: 16rpx;
}
.vs-avs { display: flex; gap: 12rpx; overflow: hidden; }
.vs-av { width: 56rpx; height: 56rpx; border-radius: 50%; background: var(--bg-hover); flex-shrink: 0; }
.vs-count { font-size: 22rpx; color: var(--t3); white-space: nowrap; }
.vs-num { font-weight: 600; color: var(--t1); }
.vs-dot { margin: 0 8rpx; color: var(--border-strong); }
.hero-full { position: relative; overflow: hidden; height: 640rpx; background: #1a1a1a; }
.hero-bg { position: absolute; left: 0; top: 0; width: 100%; height: 120%; }
.hero-shade { position: absolute; left: 0; top: 0; width: 100%; height: 100%; background: linear-gradient(180deg, rgba(0,0,0,0.15), rgba(0,0,0,0.55)); }
.hero-full-info { position: absolute; left: 0; right: 0; bottom: 232rpx; padding: 0 48rpx; color: #fff; z-index: 2; }
.hfi-name { font-size: 48rpx; font-weight: 700; color: #fff; }
.hfi-pos { font-size: 26rpx; color: rgba(255,255,255,0.85); margin-top: 8rpx; }
.hfi-line { display: flex; align-items: center; gap: 10rpx; font-size: 24rpx; color: rgba(255,255,255,0.9); margin-top: 12rpx; }
.hero-counts { position: absolute; left: 0; right: 0; bottom: 0; height: 96rpx; display: flex; background: rgba(255,255,255,0.16); backdrop-filter: blur(12rpx); z-index: 2; }
.hero-full .quickbar { position: absolute; left: 0; right: 0; bottom: 104rpx; z-index: 2; margin-top: 0; }
.hero-full .quickbar .qb { color: #fff; }
.hc-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.hc-num { font-size: 30rpx; font-weight: 700; color: #fff; }
.hc-lab { font-size: 20rpx; color: rgba(255,255,255,0.8); margin-top: 2rpx; }
</style>