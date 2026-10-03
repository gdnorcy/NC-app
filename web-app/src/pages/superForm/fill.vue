<template>
  <view class="sf-page" :style="pageBgStyle">
    <view class="sf-form" :class="layout" :style="globalStyle">
      <view class="sf-form-name" v-if="form.name">{{ form.name }}</view>

      <template v-for="comp in currentPageComponents" :key="comp.id">
        <view class="sf-field" :class="{ 'cs-line': comp.style && comp.style.styleType === 'line', 'sf-t-image': comp.type === 'image' }" :style="fieldStyle(comp)">
          <view class="sf-label" v-if="!noTitleTypes.includes(comp.type)">
            {{ comp.content.label || '未命名' }}
            <text v-if="comp.content.required" class="sf-req">*</text>
          </view>

          <!-- 单行/多行文本 -->
          <textarea v-if="comp.type === 'textarea'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" :disabled="comp.content.readonly" />
          <input v-else-if="comp.type === 'text'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" :disabled="comp.content.readonly" />

          <!-- 数字 -->
          <input v-else-if="comp.type === 'number'" class="sf-input" type="number" v-model="values[comp.id]" :placeholder="comp.content.placeholder" :disabled="comp.content.readonly" />

          <!-- 时间 -->
          <input v-else-if="comp.type === 'time'" class="sf-input" :type="timeType(comp.content.dateType)" v-model="values[comp.id]" :disabled="comp.content.readonly" />

          <!-- 图片上传（ew picture-upload：普通/身份证/营业执照 三种模式联动）
               上下布局：rowsShow 等分正方形框（ew getImgHeight 令高=宽），边框/背景走 底框边框/背景颜色；
               左右布局：框/线风格字段行 + uploadBoxSize 小方框（图片背景/图片边框/图片圆角） -->
          <view v-else-if="comp.type === 'image'" class="sf-img-body">
            <!-- 左右布局：label 左 + 上传框右 -->
            <template v-if="layout === 'horizontal'">
              <view class="sf-image-h" :class="{ 'is-line': comp.style && comp.style.styleType === 'line' }">
                <text class="sf-image-h-label">{{ comp.content.label || '未命名' }}<text v-if="comp.content.required" class="sf-req">*</text></text>
                <view v-if="(comp.content.imageType || 'normal') === 'normal'" class="sf-h-box" @click="pickImage(comp.id)">
                  <image v-if="comp.content.sampleImg" class="sf-sample" :src="comp.content.sampleImg" mode="aspectFill" />
                  <text v-else class="sf-camera sf-camera-sm">+</text>
                </view>
                <view v-else-if="comp.content.imageType === 'idcard'" class="sf-h-box" @click="pickIdFace(comp.id, 'ward')">
                  <image class="sf-id-bg" src="/static/superform/id-front.png" mode="widthFix" />
                  <text class="sf-id-face" v-if="values[comp.id] && values[comp.id].ward">已上传</text>
                </view>
                <view v-else class="sf-h-box" @click="pickLicense(comp.id)">
                  <image class="sf-id-bg" src="/static/superform/license.png" mode="widthFix" />
                  <text class="sf-id-face" v-if="values[comp.id]">已上传</text>
                </view>
              </view>
            </template>
            <!-- 上下布局 -->
            <template v-else>
              <!-- 普通：示例图 + 多选上传（最少/最多限制） -->
              <template v-if="(comp.content.imageType || 'normal') === 'normal'">
                <view class="sf-upload sf-upload-img" :class="{ 'has-sample': comp.content.sampleImg }" @click="pickImage(comp.id)">
                  <image v-if="comp.content.sampleImg" class="sf-sample" :src="comp.content.sampleImg" mode="aspectFill" />
                  <text v-else class="sf-camera">+</text>
                </view>
                <text class="sf-upload-tip">上传图片（{{ limitText(comp.content) }}）</text>
                <view v-if="(values[comp.id] || []).length" class="sf-upload-list">
                  <text v-for="(n, i) in values[comp.id]" :key="i" class="sf-upload-item">已选 {{ i + 1 }} · {{ n }}</text>
                </view>
              </template>
              <!-- 身份证：人像面 / 国徽面 双槽 -->
              <template v-else-if="comp.content.imageType === 'idcard'">
                <view class="sf-id-row">
                  <view class="sf-id-box" @click="pickIdFace(comp.id, 'ward')">
                    <image class="sf-id-bg" src="/static/superform/id-front.png" mode="widthFix" />
                    <text class="sf-camera-circle">+</text>
                    <text class="sf-id-face" v-if="values[comp.id] && values[comp.id].ward">已上传</text>
                    <text class="sf-id-text">证件人像面</text>
                  </view>
                  <view class="sf-id-box" @click="pickIdFace(comp.id, 'back')">
                    <image class="sf-id-bg" src="/static/superform/id-beck.png" mode="widthFix" />
                    <text class="sf-camera-circle">+</text>
                    <text class="sf-id-face" v-if="values[comp.id] && values[comp.id].back">已上传</text>
                    <text class="sf-id-text">证件国徽面</text>
                  </view>
                </view>
              </template>
              <!-- 营业执照：单槽 -->
              <template v-else>
                <view class="sf-id-row">
                  <view class="sf-id-box sf-license-box" @click="pickLicense(comp.id)">
                    <image class="sf-id-bg" src="/static/superform/license.png" mode="widthFix" />
                    <text class="sf-camera-circle">+</text>
                    <text class="sf-id-face" v-if="values[comp.id]">已上传</text>
                  </view>
                </view>
              </template>
            </template>
          </view>

          <!-- 附件 -->
          <view v-else-if="comp.type === 'attachment'" class="sf-upload" @click="pickFile(comp.id)">
            <text v-if="!values[comp.id] || !values[comp.id].length">+ 上传附件（{{ comp.content.minCount ? `最少 ${comp.content.minCount} 个，` : '' }}最多 {{ comp.content.maxCount }} 个）</text>
            <text v-else>{{ values[comp.id].length }} 个文件已选</text>
          </view>

          <!-- 单项选择 -->
          <view v-else-if="comp.type === 'radio'" class="sf-opts">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt-row" :class="{ on: values[comp.id] === opt.value, line: comp.style && comp.style.styleType === 'line' }" @click="values[comp.id] = opt.value">
              <text class="sf-dot" :class="{ on: values[comp.id] === opt.value }" />{{ opt.label }}
            </view>
          </view>

          <!-- 多项选择 -->
          <view v-else-if="comp.type === 'checkbox'" class="sf-opts">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt-row" :class="{ on: (values[comp.id] || []).includes(opt.value), line: comp.style && comp.style.styleType === 'line' }" @click="toggleCheck(comp.id, opt.value)">
              <text class="sf-checkbox" :class="{ on: (values[comp.id] || []).includes(opt.value) }">✓</text>{{ opt.label }}
            </view>
            <view v-if="comp.content.allowOther" class="sf-opt-row sf-opt-other">
              <text class="sf-checkbox" :class="{ on: !!otherText[comp.id] }">✓</text>
              <input class="sf-other" v-model="otherText[comp.id]" placeholder="其他" />
            </view>
          </view>

          <!-- 下拉选择（普通 / 省市区 / 日期 三种预设） -->
          <template v-else-if="comp.type === 'select'">
            <!-- #ifdef MP-WEIXIN -->
            <picker v-if="(comp.content.presetType || 'normal') === 'normal'" class="sf-input sf-picker" mode="selector" :range="selectLabels(comp)" :value="selectIndex(comp)" :disabled="comp.content.readonly" @change="onSelectChange(comp.id, $event)">
              <view class="sf-picker-val" :class="{ ph: !values[comp.id] }">{{ selectText(comp) || '请选择' }}</view>
            </picker>
            <view v-else-if="comp.content.presetType === 'region'" class="sf-casc">
              <picker class="sf-input sf-casc-sel sf-picker" mode="selector" :range="regionProvinces" :value="rangeIndexOf(regionProvinces, casc[comp.id + '_p'])" @change="onCascChange(comp.id, 'region', 'p', $event)">
                <view class="sf-picker-val" :class="{ ph: !casc[comp.id + '_p'] }">{{ casc[comp.id + '_p'] || '请选择省' }}</view>
              </picker>
              <picker v-if="(comp.content.level || 3) >= 2 && casc[comp.id + '_p'] && regionCities(casc[comp.id + '_p']).length" class="sf-input sf-casc-sel sf-picker" mode="selector" :range="regionCities(casc[comp.id + '_p'])" :value="rangeIndexOf(regionCities(casc[comp.id + '_p']), casc[comp.id + '_c'])" @change="onCascChange(comp.id, 'region', 'c', $event)">
                <view class="sf-picker-val" :class="{ ph: !casc[comp.id + '_c'] }">{{ casc[comp.id + '_c'] || '请选择市' }}</view>
              </picker>
              <picker v-if="(comp.content.level || 3) >= 3 && casc[comp.id + '_p'] && casc[comp.id + '_c'] && regionDistricts(casc[comp.id + '_p'], casc[comp.id + '_c']).length" class="sf-input sf-casc-sel sf-picker" mode="selector" :range="regionDistricts(casc[comp.id + '_p'], casc[comp.id + '_c'])" :value="rangeIndexOf(regionDistricts(casc[comp.id + '_p'], casc[comp.id + '_c']), casc[comp.id + '_d'])" @change="onCascChange(comp.id, 'region', 'd', $event)">
                <view class="sf-picker-val" :class="{ ph: !casc[comp.id + '_d'] }">{{ casc[comp.id + '_d'] || '请选择区' }}</view>
              </picker>
            </view>
            <view v-else class="sf-casc">
              <picker class="sf-input sf-casc-sel sf-picker" mode="selector" :range="dateYears" :value="rangeIndexOf(dateYears, casc[comp.id + '_y'])" @change="onCascChange(comp.id, 'date', 'y', $event)">
                <view class="sf-picker-val" :class="{ ph: !casc[comp.id + '_y'] }">{{ casc[comp.id + '_y'] ? casc[comp.id + '_y'] + '年' : '请选择年' }}</view>
              </picker>
              <picker v-if="(comp.content.level || 3) >= 2" class="sf-input sf-casc-sel sf-picker" mode="selector" :range="monthRange" :value="rangeIndexOf(monthRange, casc[comp.id + '_m'])" @change="onCascChange(comp.id, 'date', 'm', $event)">
                <view class="sf-picker-val" :class="{ ph: !casc[comp.id + '_m'] }">{{ casc[comp.id + '_m'] ? casc[comp.id + '_m'] + '月' : '请选择月' }}</view>
              </picker>
              <picker v-if="(comp.content.level || 3) >= 3" class="sf-input sf-casc-sel sf-picker" mode="selector" :range="dateDays(casc[comp.id + '_y'], casc[comp.id + '_m'])" :value="rangeIndexOf(dateDays(casc[comp.id + '_y'], casc[comp.id + '_m']), casc[comp.id + '_d'])" @change="onCascChange(comp.id, 'date', 'd', $event)">
                <view class="sf-picker-val" :class="{ ph: !casc[comp.id + '_d'] }">{{ casc[comp.id + '_d'] ? casc[comp.id + '_d'] + '日' : '请选择日' }}</view>
              </picker>
            </view>
            <!-- #endif -->
            <!-- #ifndef MP-WEIXIN -->
            <select v-if="(comp.content.presetType || 'normal') === 'normal'" class="sf-input" v-model="values[comp.id]" :disabled="comp.content.readonly">
              <option value="" disabled>请选择</option>
              <option v-for="(opt, i) in comp.content.options" :key="i" :value="opt.value">{{ opt.label }}</option>
            </select>
            <view v-else-if="comp.content.presetType === 'region'" class="sf-casc">
              <select class="sf-input sf-casc-sel" v-model="casc[comp.id + '_p']" @change="onCascChange(comp.id, 'region', 'p', $event)">
                <option value="">请选择省</option>
                <option v-for="(p, i) in regionProvinces" :key="i" :value="p">{{ p }}</option>
              </select>
              <select v-if="(comp.content.level || 3) >= 2 && casc[comp.id + '_p'] && regionCities(casc[comp.id + '_p']).length" class="sf-input sf-casc-sel" v-model="casc[comp.id + '_c']" @change="onCascChange(comp.id, 'region', 'c', $event)">
                <option value="">请选择市</option>
                <option v-for="(c, i) in regionCities(casc[comp.id + '_p'])" :key="i" :value="c">{{ c }}</option>
              </select>
              <select v-if="(comp.content.level || 3) >= 3 && casc[comp.id + '_p'] && casc[comp.id + '_c'] && regionDistricts(casc[comp.id + '_p'], casc[comp.id + '_c']).length" class="sf-input sf-casc-sel" v-model="casc[comp.id + '_d']" @change="onCascChange(comp.id, 'region', 'd', $event)">
                <option value="">请选择区</option>
                <option v-for="(d, i) in regionDistricts(casc[comp.id + '_p'], casc[comp.id + '_c'])" :key="i" :value="d">{{ d }}</option>
              </select>
            </view>
            <view v-else class="sf-casc">
              <select class="sf-input sf-casc-sel" v-model="casc[comp.id + '_y']" @change="onCascChange(comp.id, 'date', 'y', $event)">
                <option value="">请选择年</option>
                <option v-for="y in dateYears" :key="y" :value="y">{{ y }}年</option>
              </select>
              <select v-if="(comp.content.level || 3) >= 2" class="sf-input sf-casc-sel" v-model="casc[comp.id + '_m']" @change="onCascChange(comp.id, 'date', 'm', $event)">
                <option value="">请选择月</option>
                <option v-for="m in 12" :key="m" :value="m">{{ m }}月</option>
              </select>
              <select v-if="(comp.content.level || 3) >= 3" class="sf-input sf-casc-sel" v-model="casc[comp.id + '_d']" @change="onCascChange(comp.id, 'date', 'd', $event)">
                <option value="">请选择日</option>
                <option v-for="d in dateDays(casc[comp.id + '_y'], casc[comp.id + '_m'])" :key="d" :value="d">{{ d }}日</option>
              </select>
            </view>
            <!-- #endif -->
          </template>

          <!-- 日期 -->
          <input v-else-if="comp.type === 'date'" class="sf-input" :type="comp.content.dateType === 'time' ? 'datetime-local' : 'date'" v-model="values[comp.id]" :disabled="comp.content.readonly" />

          <!-- 定位（定位点 / 点到点） -->
          <view v-else-if="comp.type === 'location'" class="sf-loc">
            <template v-if="(comp.content.contentType || 'point') === 'route'">
              <view class="sf-loc-row" @click="getLocation(comp.id, 'start')">
                <text class="sf-loc-tag">起点</text>
                <text v-if="!(values[comp.id] && values[comp.id].start)">📍 点击获取起点</text>
                <text v-else class="sf-loc-val">{{ values[comp.id].start.address }}</text>
              </view>
              <view class="sf-loc-row" @click="getLocation(comp.id, 'end')">
                <text class="sf-loc-tag">终点</text>
                <text v-if="!(values[comp.id] && values[comp.id].end)">📍 点击获取终点</text>
                <text v-else class="sf-loc-val">{{ values[comp.id].end.address }}</text>
              </view>
            </template>
            <view v-else class="sf-loc-single" @click="getLocation(comp.id)">
              <text v-if="!values[comp.id]">📍 {{ comp.content.tipText || '点击获取定位' }}</text>
              <text v-else>{{ values[comp.id].address }}</text>
            </view>
          </view>

          <!-- 协议 -->
          <view v-else-if="comp.type === 'agreement'" class="sf-agree">
            <view class="sf-agree-row" @click="openAgreement(comp.id)">
              <text class="sf-check" :class="{ on: values[comp.id] }">✓</text>
              <text class="sf-agree-text">{{ comp.content.label }}</text>
              <text v-if="comp.content.linkText" class="sf-link" @click.stop="openLink(comp.content.linkUrl)">{{ comp.content.linkText }}</text>
            </view>
          </view>

          <!-- 评分（图标/颜色/描述文字随组件样式） -->
          <view v-else-if="comp.type === 'rate'" class="sf-rate">
            <text v-if="comp.content.desc" class="sf-rate-desc">{{ comp.content.desc }}</text>
            <view class="sf-rate-icons">
              <text
                v-for="n in (comp.content.max || 3)" :key="n"
                class="sf-star"
                :class="{ on: (values[comp.id] || 0) >= n }"
                :style="{ color: (values[comp.id] || 0) >= n ? (comp.style && comp.style.activeColor || '#F7BA2A') : (comp.style && comp.style.inactiveColor || '#C6D1DE') }"
                @click="values[comp.id] = n"
              >{{ comp.style && comp.style.icon === 'heart' ? '♥' : comp.style && comp.style.icon === 'star' ? '★' : '☺' }}</text>
            </view>
          </view>

          <!-- 文件下载 -->
          <view v-else-if="comp.type === 'filedownload'" class="sf-download-wrap">
            <view class="sf-download" @click="openLink(comp.content.fileUrl)">
              📎 {{ comp.content.fileName || '文件下载' }}
            </view>
            <view v-if="comp.content.sampleFile" class="sf-download-sample" @click.stop="openLink(comp.content.sampleFile)">示例文件下载</view>
            <text v-if="comp.content.tip" class="sf-download-tip">{{ comp.content.tip }}</text>
          </view>

          <!-- 手机号授权 -->
          <view v-else-if="comp.type === 'phoneauth'" class="sf-auth" @click="authPhone(comp.id)">
            <text v-if="!values[comp.id]">{{ comp.content.placeholder || '授权手机号' }}</text>
            <text v-else>{{ values[comp.id] }}</text>
          </view>

          <!-- 短信认证 -->
          <view v-else-if="comp.type === 'sms'" class="sf-sms">
            <view class="sf-sms-row">
              <input class="sf-input sf-sms-phone" v-model="values[comp.id].phone" :placeholder="comp.content.placeholder || '请输入手机号'" />
              <view class="sf-sms-btn" @click="authSms(comp.id)">{{ comp.content.buttonText || '获取验证码' }}</view>
            </view>
            <input class="sf-input sf-sms-code" v-model="values[comp.id].code" placeholder="请输入验证码" />
          </view>

          <!-- 车牌号 -->
          <input v-else-if="comp.type === 'carplate'" class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder || '请输入车牌号'" :disabled="comp.content.readonly" />

          <!-- 标题 -->
          <!-- 标题：组件样式的主标题大小/颜色优先，回退内容配置 -->
          <view v-else-if="comp.type === 'title'" class="sf-title" :style="{ fontSize: (comp.style && comp.style.titleSize || comp.content.size || 17) + 'px', textAlign: comp.content.align || 'left', color: comp.style && comp.style.labelColor || comp.content.color || '#000000' }" @click="comp.content.link && openLink(comp.content.link)">
            <text class="sf-title-main">{{ comp.content.text }}</text>
            <view v-if="comp.content.subtitle" class="sf-title-sub">{{ comp.content.subtitle }}</view>
            <view v-if="comp.content.tip" class="sf-title-tip">{{ comp.content.tip }}</view>
          </view>

          <!-- 富文本 -->
          <view v-else-if="comp.type === 'richtext'" class="sf-richtext" v-html="comp.content.html" />

          <!-- 空白块：样式「空白高度」优先 -->
          <view v-else-if="comp.type === 'blank'" :style="{ height: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : comp.content.height || 20) + 'px' }" />

          <!-- 辅助线：样式「线条粗细 / 线条颜色」优先，回退内容配置高度/颜色 -->
          <view v-else-if="comp.type === 'line'" class="sf-line" :style="{ borderTopStyle: comp.content.style || 'solid', borderTopWidth: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : (comp.content.height || 1)) + 'px', borderTopColor: comp.style && comp.style.dividerColor || comp.content.color || '#000000' }" />

          <!-- 轮播图 -->
          <view v-else-if="comp.type === 'swiper'" class="sf-swiper" @click="comp.content.link && openLink(comp.content.link)">
            <swiper v-if="(comp.content.images || []).length" autoplay circular :style="{ height: (comp.style && comp.style.inputHeight || comp.content.height || 160) + 'px' }">
              <swiper-item v-for="(img, si) in comp.content.images" :key="si">
                <image :src="img" class="sf-swiper-img" mode="aspectFill" />
              </swiper-item>
            </swiper>
            <view v-else class="sf-swiper-empty">轮播图（{{ (comp.content.images || []).length }} 张）</view>
            <text v-if="comp.content.desc" class="sf-swiper-desc">{{ comp.content.desc }}</text>
          </view>

          <!-- 大图模块 -->
          <view v-else-if="comp.type === 'bigimage'" class="sf-bigimage" @click="openLink(comp.content.link)">
            <image v-if="comp.content.image" :src="comp.content.image" class="sf-bigimage-img" mode="widthFix" />
            <view v-else class="sf-bigimage-empty">大图模块</view>
            <text v-if="comp.content.desc" class="sf-bigimage-desc">{{ comp.content.desc }}</text>
          </view>

          <!-- 视频：直接显示 / 弹出显示 + 自动播放 -->
          <view v-else-if="comp.type === 'video'" class="sf-video">
            <template v-if="comp.content.src">
              <video v-if="(comp.content.display || 'direct') !== 'popup'" :src="comp.content.src" :poster="comp.content.poster" controls :autoplay="!!comp.content.autoplay" class="sf-video-el" />
              <view v-else class="sf-video-poster" @click="videoPopup = comp.id">
                <image v-if="comp.content.poster" :src="comp.content.poster" class="sf-video-poster-img" mode="aspectFill" />
                <view class="sf-video-play">▶</view>
              </view>
            </template>
            <view v-else class="sf-video-empty">视频模块</view>
          </view>

          <!-- 后台描述 -->
          <view v-else-if="comp.type === 'backdesc'" class="sf-backdesc">{{ comp.content.text }}</view>

          <!-- 实时动态 -->
          <view v-else-if="comp.type === 'realtime'" class="sf-realtime">
            <view class="sf-realtime-main">
              <text class="sf-realtime-label">{{ comp.content.label }}</text>
              <text class="sf-realtime-count">{{ comp.content.title || ('已有 ' + (comp.content.fakeCount || 0) + ' 人参与') }}</text>
            </view>
            <text v-if="comp.content.countdown && comp.content.countdownTime" class="sf-realtime-cd">{{ countdownText(comp.content.countdownTime) }}</text>
          </view>

          <!-- 表单支付 -->
          <view v-else-if="comp.type === 'pay'" class="sf-pay">
            <view class="sf-pay-label">{{ comp.content.label }}<text v-if="comp.content.specType !== 'multi'" class="sf-pay-amt">¥{{ comp.content.amount }}</text></view>
            <!-- 多规格：选择规格 -->
            <view v-if="comp.content.specType === 'multi'" class="sf-pay-specs">
              <view v-for="(sp, spi) in (comp.content.specs || [])" :key="spi" class="sf-pay-spec" :class="{ on: (values[comp.id] || {}).spec === sp.name }" @click="selectPay(comp.id, sp)">
                <text class="sf-pay-spec-name">{{ sp.name }}</text>
                <text class="sf-pay-spec-price">¥{{ sp.price }}</text>
              </view>
            </view>
            <view v-else class="sf-pay-tip">需支付 ¥{{ comp.content.amount }}（实际支付将在发布后接入）</view>
            <!-- 日期选择 -->
            <view v-if="comp.content.dateSelect" class="sf-pay-date">
              <text class="sf-pay-date-label">参与日期</text>
              <input class="sf-input" type="date" v-model="values[comp.id + '__date']" :disabled="comp.content.readonly" />
            </view>
            <!-- 库存展示 -->
            <view v-if="comp.content.showStock" class="sf-pay-stock" :class="{ out: comp.content.stock <= 0 }">{{ comp.content.stock > 0 ? ('剩余库存：' + comp.content.stock + ' 件') : '已售罄' }}</view>
            <!-- 能力标签（退款/核销/限购/优惠券/积分/会员折扣/分销，对齐 ew 支付能力面板） -->
            <view v-if="payTags(comp.content).length" class="sf-pay-tags">
              <text v-for="(t, ti) in payTags(comp.content)" :key="ti" class="sf-pay-tag">{{ t }}</text>
            </view>
          </view>

          <!-- 提交按钮 -->
          <button v-else-if="comp.type === 'submit'" class="sf-submit" @click="submit">{{ comp.content.label || '确认' }}</button>
        </view>
      </template>

      <!-- 分页导航：上一步/下一步（文案与禁止返回取自分页组件配置） -->
      <view v-if="hasPages" class="sf-nav">
        <view v-if="currentNav.showPrev" class="sf-prev" :class="{ disabled: currentNav.prevDisabled }" @click="prevPage">{{ currentNav.prevText }}</view>
        <view v-if="currentNav.showNext" class="sf-next" @click="nextPage">{{ currentNav.nextText }}</view>
      </view>

      <!-- 协议「看完勾选」弹层：展示协议正文，确认后视为已勾选 -->
      <view v-if="viewAgreement" class="sf-mask" @click="viewAgreement = null">
        <view class="sf-modal" @click.stop>
          <view class="sf-modal-title">{{ agreementComp && agreementComp.content.label }}</view>
          <scroll-view scroll-y class="sf-modal-body">{{ agreementComp && agreementComp.content.content }}</scroll-view>
          <view class="sf-modal-btn" @click="confirmAgreement(agreementComp.id)">已阅读并同意</view>
        </view>
      </view>

      <!-- 视频弹出显示弹层 -->
      <view v-if="videoPopup" class="sf-mask" @click="videoPopup = null">
        <view class="sf-modal sf-video-modal" @click.stop>
          <video v-if="videoComp && videoComp.content.src" :src="videoComp.content.src" :poster="videoComp.content.poster" controls autoplay class="sf-video-pop-el" />
        </view>
      </view>

      <view v-if="ended" class="sf-ended">表单已结束，感谢您的参与。</view>
      <view v-if="!currentPageComponents.length" class="sf-empty">表单暂无内容，请返回。</view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { onLoad, onUnload } from '@dcloudio/uni-app';
import { cardApi } from '../../utils/cardApi.js';
import { componentStyleVars, isVisible } from './componentStyle.js';
import { regionProvinces, regionCities, regionDistricts, dateYears, dateDays } from './regionData.js';

const formId = ref(null);
const form = reactive({ name: '', config: { components: [], settings: {} } });
const values = reactive({});
// 级联选择（省市区 / 日期）的临时选中态，key 形如 `${compId}_p/_c/_d/_y/_m`
const casc = reactive({});
// 多选「其他选项」自由文本，key 为组件 id（与 values[id] 数组分开存储，提交时合并）
const otherText = reactive({});
// 倒计时实时刷新基准时间
const now = ref(Date.now());
let _cdTimer = null;

function compById(id) {
  return components.value.find((x) => x.id === id);
}
const ended = ref(false);
const submitting = ref(false);
const currentPage = ref(0);
// P3 弹层：协议「看完勾选」内容弹层 / 视频弹出显示弹层
const viewAgreement = ref(null);
const videoPopup = ref(null);

// 自带标题/纯展示型组件，不在渲染器中再显示通用标题
const noTitleTypes = ['submit', 'agreement', 'backdesc', 'title', 'richtext', 'blank', 'line', 'swiper', 'bigimage', 'video', 'realtime', 'pagebreak', 'filedownload', 'pay'];

// 纯展示 / 非输入型组件，不参与校验
const DISPLAY_TYPES = ['submit', 'filedownload', 'backdesc', 'title', 'richtext', 'blank', 'line', 'swiper', 'bigimage', 'video', 'realtime', 'pagebreak'];

const layout = computed(() => form.config.settings?.layout || 'vertical');
const globalStyle = computed(() => {
  const g = form.config.settings?.globalStyle || {};
  return {
    marginTop: (g.marginTop || 0) + 'px',
    paddingTop: (g.marginY || 0) + 'px',
    paddingBottom: (g.marginY || 0) + 'px',
    paddingLeft: (g.marginX || 0) + 'px',
    paddingRight: (g.marginX || 0) + 'px',
    // 全局圆角（组件圆角 / 输入框圆角），供各字段经 CSS 变量消费
    '--g-radius': (g.radius || 0) + 'px',
    '--g-input-radius': (g.inputRadius != null ? g.inputRadius : 3) + 'px',
    // 组件颜色（对齐 ew）
    '--c-border-color': g.cBorder || '#F5F2F2',
    '--c-title-color': g.cTitle || '#000000',
    '--c-input-color': g.cInput || '#333333',
    '--c-error-color': g.cError || '#ED4F4F',
  };
});
// 页面背景：颜色 / 图片+颜色（平铺/位置/图片样式对齐 ew 全局样式）
const pageBgStyle = computed(() => {
  const g = form.config.settings?.globalStyle || {};
  const s = {};
  if (g.pageBgColor) s.backgroundColor = g.pageBgColor;
  if (g.pageBgType === 'imgcolor' && g.pageBgImage) {
    s.backgroundImage = 'url("' + g.pageBgImage + '")';
    s.backgroundRepeat = g.bgRepeat || 'repeat-x';
    s.backgroundPosition = (g.bgPosX || 'left') + ' ' + (g.bgPosY || 'top');
    if (g.bgImgStyle === 'fill') s.backgroundSize = 'cover';
    else if (g.bgImgStyle === 'fixed') s.backgroundSize = 'contain';
    else s.backgroundSize = (g.bgImgW != null ? g.bgImgW : 20) + '% ' + (g.bgImgH != null ? g.bgImgH : 20) + '%';
  }
  return s;
});
// 组件级样式：对齐 ew 四段（组件背景 / 组件整体 / 组件风格 / 组件颜色），按类型逐组件生效
function fieldStyle(comp) {
  return componentStyleVars(comp, form.config.settings?.globalStyle || {});
}

const components = computed(() => form.config.components || []);

// 当前弹层对应的组件对象（协议 / 视频）
const agreementComp = computed(() => components.value.find((c) => c.id === viewAgreement.value) || null);
const videoComp = computed(() => components.value.find((c) => c.id === videoPopup.value) || null);

// when 联动：对齐 ew 逻辑语义
// - 单选/多选：选择了任一（选项交集）；下拉：选择了（单值）；评分：介于 min~max
// - 规则内多条件支持 且/或（rule.operator，旧数据默认 or）；兼容旧单条件 compId/option（字符串）
function condHit(c) {
  const val = values[c.compId];
  if (val == null || val === '') return false;
  const opts = Array.isArray(c.option) ? c.option : (c.option === '' || c.option == null ? [] : [c.option]);
  const cmp = c.comparator || (Array.isArray(opts) && opts.length === 2 && opts.every((o) => o !== '' && !isNaN(Number(o))) ? 'between' : 'select_any');
  if (cmp === 'between') {
    const n = Number(val);
    const lo = Number(opts[0]);
    const hi = Number(opts[1]);
    return !isNaN(n) && !isNaN(lo) && !isNaN(hi) && n >= lo && n <= hi;
  }
  if (cmp === 'equal') return String(val) === String(opts[0]);
  // select_any：多选/单选均取交集
  const vals = Array.isArray(val) ? val.map(String) : [String(val)];
  return opts.map(String).some((o) => vals.includes(o));
}
function ruleMatched(r) {
  const conds = (r.conditions && r.conditions.length) ? r.conditions : [{ compId: r.compId, option: r.option, comparator: '' }];
  const valid = conds.filter((c) => c.compId);
  if (!valid.length) return false;
  return r.operator === 'and' ? valid.every(condHit) : valid.some(condHit);
}
const visibleComponents = computed(() => {
  const logic = form.config.settings?.logic || [];
  const targeted = new Set();
  const shown = new Set();
  logic.filter((r) => r.action === 'show').forEach((r) => {
    (r.showIds || []).forEach((id) => targeted.add(id));
    if (ruleMatched(r)) (r.showIds || []).forEach((id) => shown.add(id));
  });
  const hidden = [...targeted].filter((id) => !shown.has(id));
  // 结束表单规则
  const endRule = logic.find((r) => r.action === 'end' && ruleMatched(r));
  if (endRule) ended.value = true;
  // 显隐开关：设计器「是否显示=隐藏」(content.visible === false) 的组件在 C 端不渲染，
  // 并因此自动排除出分页、逐页校验与全量校验（hidden 与 visible 任一命中即不显示）。
  // 缺省（undefined）按显示处理，与 ew 默认一致。
  return components.value.filter((c) => !hidden.includes(c.id) && isVisible(c));
});

// 分页：按 pagebreak 把可见组件切成多页（pagebreak 本身只是分隔符，不渲染）
// 保留分页组件（作为页间分隔，承载上一步/下一步文案与禁止返回配置）
const pagesRaw = computed(() => {
  const all = visibleComponents.value;
  if (!all.length) return [{ comps: [], divider: null }];
  if (!all.some((c) => c.type === 'pagebreak')) return [{ comps: all, divider: null }];
  const result = [];
  let cur = { comps: [], divider: null };
  for (const c of all) {
    if (c.type === 'pagebreak') { cur.divider = c; result.push(cur); cur = { comps: [], divider: null }; }
    else cur.comps.push(c);
  }
  result.push(cur);
  return result;
});

const pages = computed(() => pagesRaw.value.map((p) => p.comps));

// 删除分页导致页数变少时，把当前页收敛回有效范围
watch(pages, () => {
  const max = pages.value.length - 1;
  if (currentPage.value > max) currentPage.value = Math.max(0, max);
});

const hasPages = computed(() => pages.value.length > 1);
const currentPageComponents = computed(() => pages.value[currentPage.value] || []);
// 当前页导航（上一步/下一步文案 + 禁止返回），取自相邻分页组件配置
const currentNav = computed(() => {
  const arr = pagesRaw.value;
  const p = currentPage.value;
  const n = arr.length;
  const prevDiv = p > 0 ? arr[p - 1].divider : null;
  const nextDiv = p < n - 1 ? arr[p].divider : null;
  return {
    showPrev: p > 0,
    prevText: (prevDiv && prevDiv.content.prevText) || '上一步',
    prevDisabled: !!(prevDiv && prevDiv.content.noReturn),
    showNext: p < n - 1,
    nextText: (nextDiv && nextDiv.content.nextText) || '下一页',
  };
});

onLoad((opts) => {
  formId.value = opts?.formId || opts?.id;
  if (formId.value) load();
  _cdTimer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onUnload(() => { if (_cdTimer) clearInterval(_cdTimer); });

async function load() {
  try {
    const res = await cardApi.getSuperForm(formId.value);
    form.name = res.name;
    form.config = res.config || { components: [], settings: {} };
    currentPage.value = 0;
    // 无规格的支付项预置金额，便于提交时记录
    components.value.forEach((c) => {
      const ct = c.content || {};
      // 预填 / 默认值（对齐 ew 预填文字 / 数字默认值；只读字段用户无法修改，仍按预填值展示）
      if (c.type === 'text' || c.type === 'textarea') {
        if (ct.prefill) values[c.id] = ct.prefill;
      } else if (c.type === 'number') {
        if (ct.defaultValue !== '' && ct.defaultValue != null) values[c.id] = ct.defaultValue;
      } else if (c.type === 'date') {
        // 单项日期支持预填文字；日期范围为数组，预填需另行处理，此处跳过
        if (ct.dateType !== 'range' && ct.prefill) values[c.id] = ct.prefill;
      }
      if (c.type === 'pay' && (!c.content.specs || !c.content.specs.length)) {
        values[c.id] = { amount: c.content.amount || 0 };
      }
      // 短信认证预置 {phone, code}，供 v-model 绑定
      if (c.type === 'sms' && !values[c.id]) {
        values[c.id] = { phone: '', code: '' };
      }
      // 级联选择（省市区 / 日期）回显：将已存值拆回级联态
      if (c.type === 'select' && c.content && c.content.presetType && c.content.presetType !== 'normal' && values[c.id]) {
        const sep = c.content.presetType === 'region' ? ' / ' : '-';
        const parts = String(values[c.id]).split(sep);
        if (c.content.presetType === 'region') {
          casc[c.id + '_p'] = parts[0] || '';
          casc[c.id + '_c'] = parts[1] || '';
          casc[c.id + '_d'] = parts[2] || '';
        } else {
          casc[c.id + '_y'] = parts[0] || '';
          casc[c.id + '_m'] = parts[1] || '';
          casc[c.id + '_d'] = parts[2] || '';
        }
      }
    });
  } catch (e) {
    uni.showToast({ title: '表单加载失败', icon: 'none' });
  }
}

function toggleCheck(id, val) {
  if (!Array.isArray(values[id])) values[id] = [];
  const arr = values[id];
  const ct = (compById(id)?.content) || {};
  const i = arr.indexOf(val);
  if (i >= 0) {
    arr.splice(i, 1);
  } else {
    arr.push(val);
    // 排他项（如「以上都不是」）：选中排他项则清空其余；选中其余则移除排他项
    if (ct.exclusive && ct.exclusiveValue) {
      if (val === ct.exclusiveValue) {
        values[id] = [ct.exclusiveValue];
      } else {
        const ex = arr.indexOf(ct.exclusiveValue);
        if (ex >= 0) arr.splice(ex, 1);
      }
    }
  }
}

function pickImage(id) {
  const c = components.value.find((x) => x.id === id);
  const max = (c?.content?.maxCount || 0) || 9;
  // P1 简化：记录文件名（真实上传在后续迭代补全）
  uni.chooseImage({
    count: max,
    success: (r) => { values[id] = r.tempFiles.map((f) => f.name); },
  });
}

// 身份证：人像面(ward) / 国徽面(back) 各传一张 —— ew 用 {ward, back} 结构
function pickIdFace(id, face) {
  uni.chooseImage({
    count: 1,
    success: (r) => {
      const v = values[id];
      values[id] = { ward: '', back: '', ...(typeof v === 'object' && v && !Array.isArray(v) ? v : {}), [face]: r.tempFiles[0].name };
    },
  });
}

// 营业执照：单张
function pickLicense(id) {
  uni.chooseImage({
    count: 1,
    success: (r) => { values[id] = r.tempFiles[0].name; },
  });
}

// 数量限制文案（ew：0 = 不限制）
function limitText(ct) {
  const min = ct.minCount || 0;
  const max = ct.maxCount || 0;
  if (min && max) return `最少 ${min} 张，最多 ${max} 张`;
  if (max) return `最多 ${max} 张`;
  return '数量不限';
}

function timeType(dt) {
  if (dt === 'time') return 'time';
  if (dt === 'datetime') return 'datetime-local';
  return 'date';
}

// 级联选择变更：上级变更时清空下级，并即时拼装完整文本写入 values[comp.id]
// 兼容 H5 原生 select（$event 为值）与小程序 picker（$event.detail.value 为索引）
function onCascChange(id, kind, level, ev) {
  const c = compById(id);
  const lvl = (c?.content?.level) || 3;
  let val = ev;
  if (ev && typeof ev === 'object' && ev.detail && ev.detail.value !== undefined) {
    const idx = ev.detail.value;
    let arr = [];
    if (kind === 'region') {
      if (level === 'p') arr = regionProvinces;
      else if (level === 'c') arr = regionCities(casc[id + '_p'] || '');
      else arr = regionDistricts(casc[id + '_p'] || '', casc[id + '_c'] || '');
    } else {
      if (level === 'y') arr = dateYears;
      else if (level === 'm') arr = monthRange;
      else arr = dateDays(casc[id + '_y'], casc[id + '_m']);
    }
    val = arr[idx];
  }
  if (kind === 'region') {
    if (level === 'p') { casc[id + '_p'] = val; casc[id + '_c'] = ''; casc[id + '_d'] = ''; }
    if (level === 'c') { casc[id + '_c'] = val; casc[id + '_d'] = ''; }
    if (level === 'd') { casc[id + '_d'] = val; }
    const parts = [casc[id + '_p']];
    if (lvl >= 2 && casc[id + '_c']) parts.push(casc[id + '_c']);
    if (lvl >= 3 && casc[id + '_d']) parts.push(casc[id + '_d']);
    values[id] = parts.filter(Boolean).join(' / ');
  } else {
    if (level === 'y') { casc[id + '_y'] = val; casc[id + '_m'] = ''; casc[id + '_d'] = ''; }
    if (level === 'm') { casc[id + '_m'] = val; casc[id + '_d'] = ''; }
    if (level === 'd') { casc[id + '_d'] = val; }
    const parts = [casc[id + '_y'], lvl >= 2 ? casc[id + '_m'] : '', lvl >= 3 ? casc[id + '_d'] : '']
      .filter(Boolean);
    values[id] = parts.length ? parts.join('-') : '';
  }
}

// 小程序 picker：普通下拉的展示文本与索引
function selectLabels(comp) {
  return (comp.content.options || []).map((o) => o.label);
}
function selectIndex(comp) {
  const opts = comp.content.options || [];
  const i = opts.findIndex((o) => o.value === values[comp.id]);
  return i >= 0 ? i : 0;
}
function selectText(comp) {
  const hit = (comp.content.options || []).find((o) => o.value === values[comp.id]);
  return hit ? hit.label : '';
}
function onSelectChange(id, ev) {
  const c = compById(id);
  const opts = c?.content?.options || [];
  const idx = ev && ev.detail && ev.detail.value !== undefined ? ev.detail.value : ev;
  values[id] = opts[idx] ? opts[idx].value : '';
}
function rangeIndexOf(arr, v) {
  const i = (arr || []).indexOf(v);
  return i >= 0 ? i : 0;
}
const monthRange = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function extOf(name) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function pickFile(id) {
  const c = compById(id);
  const max = (c?.content?.maxCount || 0) || 9;
  const accept = c?.content?.accept || [];
  const maxSizeKB = c?.content?.maxSize || 0;
  const handler = (files) => {
    const mapped = (files || []).map((f) => ({ name: f.name, size: f.size || 0 }));
    // 上传类型（扩展名白名单）
    if (accept.length) {
      const bad = mapped.filter((f) => !accept.includes(extOf(f.name)));
      if (bad.length) {
        uni.showToast({ title: '不支持的文件类型：' + bad.map((b) => b.name).join('、'), icon: 'none' });
        return;
      }
    }
    // 大小限制 KB
    if (maxSizeKB) {
      const big = mapped.filter((f) => f.size && f.size > maxSizeKB * 1024);
      if (big.length) {
        uni.showToast({ title: '文件超过大小限制（≤' + maxSizeKB + 'KB）', icon: 'none' });
        return;
      }
    }
    values[id] = mapped.map((f) => f.name);
  };
  // H5 端用 input file；小程序端走 chooseMessageFile（chooseMessageFile 含 size）
  uni.chooseMessageFile
    ? uni.chooseMessageFile({ count: max, success: (r) => handler(r.tempFiles) })
    : uni.chooseImage({ count: max, success: (r) => handler(r.tempFiles) });
}

function compMax(id) {
  const c = components.value.find((x) => x.id === id);
  return c?.content?.maxCount || 9;
}

function getLocation(id, mode) {
  uni.getLocation({
    type: 'gcj02',
    success: (res) => {
      const pt = { address: `${res.latitude.toFixed(4)}, ${res.longitude.toFixed(4)}`, lat: res.latitude, lng: res.longitude };
      if (mode === 'start' || mode === 'end') {
        const v = values[id] && typeof values[id] === 'object' && !Array.isArray(values[id]) ? values[id] : {};
        values[id] = { ...v, [mode]: pt };
      } else {
        values[id] = pt;
      }
    },
    fail: () => uni.showToast({ title: '获取定位失败', icon: 'none' }),
  });
}

function authPhone(id) {
  // 真实环境下走微信授权拿手机号；此处简化为填入测试号
  uni.showModal({
    title: '手机号授权',
    editable: true,
    placeholderText: '请输入手机号',
    success: (r) => { if (r.confirm && r.content) values[id] = r.content; },
  });
}

function authSms(id) {
  // 演示交互：校验手机号格式后模拟下发验证码（真实环境接入短信服务）
  const v = values[id] || (values[id] = { phone: '', code: '' });
  const phone = (v.phone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
    return;
  }
  uni.showToast({ title: '验证码已发送（演示）', icon: 'none' });
}

function toggleAgree(id) {
  values[id] = !values[id];
}

// 协议：直接勾选直接切换；看完勾选弹出正文，确认后勾选
function openAgreement(id) {
  const c = compById(id);
  if (!c) return;
  if (c.content.showMode === 'view') {
    if (values[id]) { toggleAgree(id); return; }
    viewAgreement.value = id;
  } else {
    toggleAgree(id);
  }
}
function confirmAgreement(id) {
  values[id] = true;
  viewAgreement.value = null;
}

function openLink(url) {
  if (!url) return;
  // 小程序/ H5 统一用 webview 或外链打开
  if (url.startsWith('http')) {
    // H5 直接打开；小程序端应跳 web-view 页，此处兜底
    window?.open ? window.open(url, '_blank') : uni.navigateTo({ url: '/pages/webview?src=' + encodeURIComponent(url) });
  } else {
    uni.navigateTo({ url });
  }
}

function selectPay(id, sp) {
  values[id] = { spec: sp.name, amount: sp.price };
}

function countdownText(target) {
  const end = new Date(String(target).replace(/-/g, '/')).getTime();
  if (isNaN(end)) return '时间未设置';
  const diff = end - now.value;
  if (diff <= 0) return '已结束';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `剩 ${d}天${h}时${m}分${s}秒`;
}

function payTags(ct) {
  const tags = [];
  if (ct.refundType === 'anytime') tags.push('随时退款');
  else if (ct.refundType === 'condition') tags.push('条件退款');
  if (ct.verify) tags.push('需核销');
  if (ct.limitBuy > 0) tags.push('限购' + ct.limitBuy + '件/人');
  if (ct.coupon) tags.push('可用优惠券');
  if (ct.points) tags.push('积分抵扣');
  if (ct.memberDiscount) tags.push('会员折扣');
  if (ct.distribute) tags.push('分销佣金');
  return tags;
}

function prevPage() {
  if (currentNav.value.prevDisabled) return;
  if (currentPage.value > 0) currentPage.value--;
  if (uni.pageScrollTo) uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

// 校验指定组件列表，返回第一条错误文案或 null
function validateList(list) {
  for (const c of list) {
    if (DISPLAY_TYPES.includes(c.type)) continue;
    const v = values[c.id];
    const ct = c.content;

    // 协议：必须勾选
    if (c.type === 'agreement') {
      if (ct.required && !v) return '请先勾选：' + (ct.label || '协议');
      continue;
    }

    // 短信认证：手机号必填 + 格式校验
    if (c.type === 'sms') {
      const phone = (v && typeof v === 'object' && v.phone) ? v.phone : (typeof v === 'string' ? v : '');
      if (ct.required && !phone) return (ct.label || '短信认证') + '为必填项';
      if (phone && !/^1[3-9]\d{9}$/.test(String(phone).trim())) return (ct.label || '短信认证') + '手机号格式不正确';
      continue;
    }
    // 评分：必填需 >0
    if (c.type === 'rate') {
      if (ct.required && !(Number(v) > 0)) return (ct.label || '评分') + '为必填项';
      continue;
    }

    // 支付：多规格必须选择 / 售罄拦截 / 开启日期选择则必选
    if (c.type === 'pay') {
      if (ct.specType === 'multi' && ct.specs && ct.specs.length) {
        if (!v || !v.spec) return (ct.label || '支付项') + '请选择规格';
      }
      if (ct.showStock && ct.stock <= 0) return (ct.label || '支付项') + '已售罄';
      if (ct.dateSelect && !values[c.id + '__date']) return (ct.label || '支付项') + '请选择参与日期';
      continue;
    }

    // 图片上传：普通=数组（最少/最多张数），身份证=两面都要，营业执照=单张
    if (c.type === 'image') {
      const imgType = ct.imageType || 'normal';
      if (imgType === 'idcard') {
        if (ct.required && (!v || !v.ward || !v.back)) return (ct.label || '上传身份证照片') + '请上传证件人像面与国徽面';
        continue;
      }
      if (imgType === 'license') {
        if (ct.required && !v) return (ct.label || '上传营业执照') + '为必填项';
        continue;
      }
      const arr = Array.isArray(v) ? v : [];
      const min = ct.minCount || 0;
      const max = ct.maxCount || 0;
      if (ct.required && !arr.length) return (ct.label || '图片上传') + '为必填项';
      if (min && arr.length < min) return (ct.label || '图片上传') + `最少上传 ${min} 张`;
      if (max && arr.length > max) return (ct.label || '图片上传') + `最多上传 ${max} 张`;
      continue;
    }

    // 附件：最少/最多个数（ew insertLimit）
    if (c.type === 'attachment') {
      const arr = Array.isArray(v) ? v : [];
      const amin = ct.minCount || 0;
      const amax = ct.maxCount || 0;
      if (ct.required && !arr.length) return (ct.label || '附件') + '为必填项';
      if (amin && arr.length < amin) return (ct.label || '附件') + `最少上传 ${amin} 个`;
      if (amax && arr.length > amax) return (ct.label || '附件') + `最多上传 ${amax} 个`;
      // 扩展名白名单（防御性：pickFile 已拦截，这里兜底）
      const accept = ct.accept || [];
      if (accept.length) {
        const bad = arr.filter((n) => !accept.includes(extOf(n)));
        if (bad.length) return (ct.label || '附件') + '包含不支持的文件类型';
      }
      continue;
    }

    // 定位：定位点 / 点到点（路线）两种模式
    if (c.type === 'location') {
      if (ct.contentType === 'route') {
        const lv = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
        if (ct.required && (!lv.start || !lv.start.address)) return (ct.label || '定位') + '请选择起点';
        if (ct.required && (!lv.end || !lv.end.address)) return (ct.label || '定位') + '请选择终点';
      } else {
        if (ct.required && (!v || !v.address)) return (ct.label || '定位') + '为必选项';
      }
      continue;
    }

    if (ct.required) {
      const empty = v == null || v === '' || (Array.isArray(v) ? v.length === 0 : (typeof v === 'object' && !v.address ? true : String(v).trim() === ''));
      if (empty) return (ct.label || '该项') + '为必填项';
    }
    if (c.type === 'text' && v) {
      const s = String(v).trim();
      if (ct.minLength && s.length < ct.minLength) return ct.label + `至少 ${ct.minLength} 位`;
      if (ct.maxLength && s.length > ct.maxLength) return ct.label + `最多 ${ct.maxLength} 位`;
      if (ct.contentType === 'phone' && !/^1[3-9]\d{9}$/.test(s)) return ct.label + '格式不正确（手机号）';
      if (ct.contentType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return ct.label + '格式不正确（邮箱）';
      if (ct.contentType === 'idcard' && !/(^\d{15}$)|(^\d{17}[\dXx]$)/.test(s)) return ct.label + '格式不正确（身份证）';
      if (Array.isArray(ct.inputType) && ct.inputType.length > 0) {
        const rules = [];
        if (ct.inputType.includes('chinese')) rules.push('\\u4e00-\\u9fa5');
        if (ct.inputType.includes('english')) rules.push('a-zA-Z');
        if (ct.inputType.includes('number')) rules.push('0-9');
        if (ct.inputType.includes('symbol')) rules.push('\\p{P}\\p{S}');
        const re = new RegExp('^[' + rules.join('') + ']+$', 'u');
        if (!re.test(s)) return ct.label + '包含不允许的字符';
      }
    }
    if (c.type === 'textarea' && v) {
      const s = String(v).trim();
      if (ct.minLength && s.length < ct.minLength) return ct.label + `至少 ${ct.minLength} 位`;
      if (ct.maxLength && s.length > ct.maxLength) return ct.label + `最多 ${ct.maxLength} 位`;
    }
    if (c.type === 'number' && v !== '' && v != null) {
      const n = Number(v);
      if (ct.min != null && n < ct.min) return (ct.label || '数字') + `不能小于 ${ct.min}`;
      if (ct.max != null && n > ct.max) return (ct.label || '数字') + `不能大于 ${ct.max}`;
      if (ct.step != null && ct.step > 1 && n % ct.step !== 0) return (ct.label || '数字') + `需为 ${ct.step} 的倍数`;
    }
    if (c.type === 'radio' && ct.required && !v) return (ct.label || '单项选择') + '为必选项';
    if (c.type === 'select' && ct.required && !v) return (ct.label || '下拉选择') + '为必选项';
    if (c.type === 'checkbox' && Array.isArray(v)) {
      const hasOther = !!otherText[c.id];
      // 排他项与其他项互斥（拾取逻辑已清空对立面，这里兜底校验）
      if (ct.exclusive && ct.exclusiveValue && v.includes(ct.exclusiveValue) && v.length > 1) {
        return (ct.label || '多项选择') + '排他项不可与其他项同时选择';
      }
      const eff = v.length + (hasOther ? 1 : 0);
      if (ct.required && eff === 0) return (ct.label || '多项选择') + '为必选项';
      if (ct.minSelect && eff < ct.minSelect) return (ct.label || '多项选择') + `至少选择 ${ct.minSelect} 项`;
      if (ct.maxSelect && eff > ct.maxSelect) return (ct.label || '多项选择') + `最多选择 ${ct.maxSelect} 项`;
    }
    if (c.type === 'location' && ct.required && v && typeof v === 'object' && !v.address) return (ct.label || '定位') + '为必选项';
    if (c.type === 'date' && v) {
      const s = String(v);
      if (ct.dateType === 'range' && !Array.isArray(v)) return (ct.label || '日期') + '请选择日期范围';
    }
    if (c.type === 'time' && v) {
      if (ct.dateType === 'timerange' && !Array.isArray(v)) return (ct.label || '时间') + '请选择时间段';
    }
    if (c.type === 'carplate' && v) {
      const re = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]$/;
      if (!re.test(String(v).trim().toUpperCase())) return (ct.label || '车牌号') + '格式不正确';
    }
  }
  return null;
}

// 提交时校验全部可见组件（跨页）
function validate() {
  return validateList(visibleComponents.value);
}

// 翻页时只校验当前页
function validatePage(i) {
  return validateList(pages.value[i] || []);
}

function nextPage() {
  const err = validatePage(currentPage.value);
  if (err) { uni.showToast({ title: err, icon: 'none' }); return; }
  if (currentPage.value < pages.value.length - 1) currentPage.value++;
  if (uni.pageScrollTo) uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

async function submit() {
  if (submitting.value) return;
  const err = validate();
  if (err) { uni.showToast({ title: err, icon: 'none' }); return; }
  const settings = form.config.settings || {};
  if (!settings.submit || settings.submit.secondConfirm !== false) {
    const ok = await uni.showModal({ title: '提示', content: (settings.basic?.tipText) || '确认提交？' });
    if (!ok.confirm) return;
  }
  submitting.value = true;
  try {
    const payload = JSON.parse(JSON.stringify(values));
    // 多选「其他选项」自由文本并入提交值（与已选常规选项一同保存）
    components.value.forEach((c) => {
      if (c.type === 'checkbox' && c.content && c.content.allowOther && otherText[c.id]) {
        const arr = Array.isArray(payload[c.id]) ? payload[c.id] : [];
        if (!arr.includes(otherText[c.id])) arr.push(otherText[c.id]);
        payload[c.id] = arr;
      }
    });
    await cardApi.submitSuperForm(formId.value, payload);
    const submitComp = components.value.find((c) => c.type === 'submit');
    const jump = (submitComp && submitComp.content.jumpLink) || settings.submit?.jumpLink;
    if (jump) { uni.redirectTo({ url: jump }); return; }
    uni.showToast({ title: '提交成功', icon: 'success' });
  } catch (e) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style>
.sf-page { background: #f2f3f5; min-height: 100vh; padding: 16px; box-sizing: border-box; }
.sf-form { background: #fff; border-radius: 12px; }
.sf-form.horizontal { display: flex; flex-wrap: wrap; gap: 12px; }
.sf-form.horizontal .sf-field { flex: 1 1 45%; }
.sf-form-name { font-size: 18px; font-weight: 600; padding: 16px 16px 4px; }
/* 所有组件样式均消费「组件样式 → CSS 变量」（ew 四段：背景/整体/风格/颜色），与设计器预览同一套语义 */
.sf-field { padding: 12px 16px; }
.sf-label { font-size: var(--c-title-size, 14px); color: var(--c-title-color, #000000); margin-bottom: 8px; }
.sf-req { color: var(--c-error-color, #ED4F4F); margin-left: 2px; }
.sf-input { width: 100%; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); box-sizing: border-box; background: var(--c-input-bg, #F7F9FA); color: var(--c-input-color, #333333); }
/* 小程序 picker 下拉（view 模拟，等高分毫不差） */
.sf-picker { display: flex; align-items: center; padding: 0; }
.sf-picker-val { width: 100%; padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); box-sizing: border-box; color: var(--c-input-color, #333333); }
.sf-picker-val.ph { color: #999999; }
textarea.sf-input { min-height: var(--c-input-height, 84px); }
.sf-upload { min-width: var(--c-upload-size, 45px); min-height: var(--c-upload-size, 45px); display: flex; align-items: center; justify-content: center; border: 1px dashed var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 10px var(--c-input-pad-x, 10px); text-align: center; color: var(--c-prompt-color, #999999); font-size: var(--c-prompt-size, 13px); background: var(--c-input-bg, #F7F9FA); box-sizing: border-box; }
/* 图片上传：普通（示例图）/ 身份证（双面）/ 营业执照（单槽），对齐 ew picture-upload-widget */
/* 组件风格「左右边距」→ 内容区水平内边距（ew 作用于 form-item-box） */
.sf-img-body { padding: 0 var(--c-input-pad-x, 10px); box-sizing: border-box; }
/* 上下布局普通模式：rowsShow 等分正方形框（ew 实测 calc(100%/N - 15px)，高=宽） */
.sf-upload-img { width: calc(100% / var(--c-img-rows, 2) - 15px); aspect-ratio: 1; min-width: 0; min-height: 0; padding: 0; border: 1px var(--c-img-border-style, solid) var(--c-border-color, #F5F2F2); }
.sf-upload-img .sf-sample { width: 100%; height: 100%; }
.sf-upload-img .sf-camera { color: #CED3D6; font-size: 27px; }
.sf-upload.has-sample { padding: 0; overflow: hidden; }
.sf-sample { width: var(--c-upload-size, 45px); height: var(--c-upload-size, 45px); display: block; }
.sf-camera { color: #ADBAC6; font-size: 30px; line-height: 1; }
/* 左右布局：框/线风格字段行 + uploadBoxSize 小方框（ew leftBoxStyle：imgBg/imgBorder/imgRadius） */
.sf-image-h { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 3px); background: var(--c-input-bg, #F7F9FA); box-sizing: border-box; }
.sf-image-h.is-line { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
.sf-image-h-label { flex: 1; font-size: var(--c-title-size, 16px); color: var(--c-title-color, #000000); }
.sf-h-box { width: var(--c-upload-size, 45px); height: var(--c-upload-size, 45px); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; box-sizing: border-box; position: relative; border: 1px var(--c-img-border-style, solid) var(--c-img-border, #CED3D6); background: var(--c-img-bg, #FFFFFF); border-radius: var(--c-img-radius, 3px); }
.sf-h-box .sf-sample { width: 100%; height: 100%; }
.sf-camera-sm { color: #CED3D6; font-size: 21px; }
/* 左右布局下图片组件的通用标题隐藏（label 已并入字段行左侧） */
.sf-form.horizontal .sf-t-image > .sf-label { display: none; }
.sf-upload-tip { display: block; font-size: var(--c-prompt-size, 12px); color: var(--c-prompt-color, #999999); margin-top: 6px; }
.sf-upload-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.sf-upload-item { font-size: 12px; color: var(--c-input-color, #333333); }
.sf-id-row { display: flex; gap: 15px; flex-wrap: wrap; }
/* ew boxStyle（id/license 槽与普通框共用）：边框=底框边框(直线/虚线)、背景=背景颜色、圆角=底框圆角 */
.sf-id-box { width: 165px; padding: 15px 26px; position: relative; text-align: center; border-radius: var(--c-input-radius, 3px); background: var(--c-input-bg, #F7F9FA); border: 1px var(--c-img-border-style, solid) var(--c-border-color, #F5F2F2); box-sizing: border-box; }
.sf-license-box { width: 155px; padding: 23px 17px 12px; }
.sf-id-bg { width: 100%; display: block; }
.sf-camera-circle { position: absolute; width: 57px; height: 57px; line-height: 57px; text-align: center; background: rgba(0, 0, 0, 0.16); border-radius: 50%; top: 15px; left: 54px; color: #FFFFFF; font-size: 27px; }
.sf-license-box .sf-camera-circle { top: 30px; left: 32px; }
.sf-id-face { position: absolute; right: 6px; top: 6px; font-size: 11px; color: #4385FF; background: rgba(255, 255, 255, 0.85); border-radius: 3px; padding: 1px 5px; z-index: 1; }
.sf-id-text { display: block; font-size: 13px; font-weight: 500; color: #666666; line-height: 20px; }
/* 线风格：输入类控件去边框，仅保留底线（对齐 ew 组件风格） */
.cs-line .sf-input,
.cs-line .sf-loc,
.cs-line .sf-auth,
.cs-line .sf-download,
.cs-line .sf-upload { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
.sf-opts { display: flex; flex-direction: column; gap: 0; }
.sf-opt-row { display: flex; align-items: center; gap: 8px; font-size: var(--c-input-size, 14px); color: var(--c-option-color, #333333); padding: 8px 0; }
.sf-opt-row.line { border-bottom: 1px solid var(--c-border-color, #dcdfe6); }
.sf-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; position: relative; flex-shrink: 0; box-sizing: border-box; }
.sf-dot.on { border-color: var(--c-active-color, #2667EC); }
.sf-dot.on::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--c-active-color, #2667EC); }
.sf-checkbox { width: 18px; height: 18px; border-radius: 3px; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; text-align: center; line-height: 18px; font-size: 12px; color: #fff; flex-shrink: 0; box-sizing: border-box; }
.sf-checkbox.on { background: var(--c-active-color, #2667EC); border-color: var(--c-active-color, #2667EC); }
.sf-opt-other { align-items: center; }
.sf-other { flex: 1; border: 1px solid var(--c-border-color, #dcdfe6); border-radius: var(--c-input-radius, 3px); padding: 6px 8px; font-size: var(--c-input-size, 14px); background: #fff; box-sizing: border-box; }
.sf-submit { width: 100%; border: 1px solid var(--c-border-color, #0076F0); border-radius: var(--c-input-radius, 22px); padding: 12px; background: var(--c-input-bg, #0076F0); color: var(--c-title-color, #FFFFFF); font-size: 16px; margin-top: 6px; }
.sf-ended { text-align: center; color: #909399; padding: 30px; }
.sf-empty { text-align: center; color: #c0c4cc; padding: 30px; }
.sf-loc { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-icon-color, #000000); background: var(--c-input-bg, #F7F9FA); text-align: center; }
.sf-agree { display: flex; align-items: flex-start; gap: 8px; font-size: var(--c-input-size, 13px); color: var(--c-input-color, #333333); flex-wrap: wrap; }
.sf-check { width: 18px; height: 18px; border: 1px solid var(--c-inactive-border, #F5F2F2); border-radius: 4px; text-align: center; line-height: 18px; color: #fff; flex-shrink: 0; }
.sf-check.on { background: var(--c-check-color, #4385FF); border-color: var(--c-check-color, #4385FF); }
.sf-agree-text { flex: 1; }
.sf-link { color: var(--c-input-color, #2667EC); }
.sf-rate { display: flex; flex-direction: column; gap: 4px; }
.sf-rate-desc { color: var(--c-desc-color, #999999); font-size: 12px; }
.sf-rate-icons { display: flex; gap: 4px; }
.sf-star { font-size: 26px; color: var(--c-inactive-color, #C6D1DE); }
.sf-star.on { color: var(--c-active-color, #F7BA2A); }
.sf-download { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-file-size, 14px); color: var(--c-file-title, #333333); background: var(--c-input-bg, #F7F9FA); text-align: center; }
.sf-download::after { content: ' 下载'; color: var(--c-down-color, #4385FF); }
.sf-auth { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-empower-color, #4385FF); text-align: center; background: var(--c-input-bg, #F7F9FA); }
.sf-sms { display: flex; flex-direction: column; gap: 8px; }
.sf-sms-row { display: flex; gap: 8px; align-items: stretch; }
.sf-sms-phone { flex: 1; }
.sf-sms-code { width: 100%; }
.sf-sms-btn { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 6px); padding: 0 14px; font-size: 13px; color: var(--c-msg-color, #4385FF); background: #fff; display: flex; align-items: center; white-space: nowrap; flex-shrink: 0; }
.sf-title { font-weight: 600; padding: 4px var(--c-input-pad-x, 10px); font-size: var(--c-title-size, 17px); color: var(--c-title-color, #000000); }
.sf-richtext { font-size: 14px; color: #303133; line-height: 1.6; }
.sf-line { border-top-width: var(--c-divider-height, 1px); border-top-color: var(--c-divider-color, #000000); margin: 4px 0; }
.sf-swiper { width: 100%; border-radius: var(--c-img-radius, 0px); overflow: hidden; }
.sf-swiper-img { width: 100%; height: 100%; display: block; }
.sf-swiper-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 6px); padding: 24px; text-align: center; color: #909399; font-size: 13px; }
.sf-bigimage { width: 100%; border-radius: var(--c-img-radius, 8px); overflow: hidden; }
.sf-bigimage-img { width: 100%; display: block; }
.sf-bigimage-empty { background: #f5f6f8; border: 1px dashed #dcdfe6; border-radius: var(--c-img-radius, 6px); padding: 30px; text-align: center; color: #909399; font-size: 13px; }
.sf-video { width: 100%; border-radius: var(--c-input-radius, 8px); overflow: hidden; }
.sf-video-el { width: 100%; display: block; }
.sf-video-empty { background: #000; color: #fff; text-align: center; padding: 30px; font-size: 13px; }
.sf-backdesc { font-size: var(--c-title-size, 14px); color: var(--c-input-color, #333333); line-height: 1.6; }
.sf-realtime { display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--c-title-color, #000000); background: var(--c-input-bg, #F7F9FA); border-radius: var(--c-input-radius, 10px); padding: 10px 12px; }
.sf-realtime-label { font-weight: 600; }
.sf-realtime-count { color: var(--c-active-color, #2667EC); }
.sf-next { width: 100%; border: 1px solid var(--c-next-border, #0076F0); border-radius: var(--c-input-radius, 19px); padding: 12px; background: var(--c-next-bg, #0076F0); color: var(--c-next-color, #FFFFFF); font-size: 16px; text-align: center; margin-top: 6px; }
.sf-pay { border: 1px solid var(--c-border-color, #F7F9FA); border-radius: var(--c-input-radius, 3px); padding: var(--c-model-margin-y, 10px); background: var(--c-input-bg, #F7F9FA); }
.sf-pay-label { font-size: var(--c-title-size, 16px); color: var(--c-title-color, #000000); font-weight: 600; margin-bottom: 8px; }
.sf-pay-amt { color: var(--c-price-color, #FF1C1C); margin-left: 6px; }
.sf-pay-specs { display: flex; flex-direction: column; gap: 8px; }
.sf-pay-spec { display: flex; justify-content: space-between; border: 1px solid var(--c-border-color, #F7F9FA); border-radius: var(--c-input-radius, 3px); padding: 10px 12px; font-size: 14px; color: var(--c-spec-color, #000000); }
.sf-pay-spec.on { border-color: var(--c-active-color, #2667EC); background: var(--c-input-bg, #F7F9FA); }
.sf-pay-spec-price { color: var(--c-price-color, #FF1C1C); font-weight: 600; }
.sf-pay-tip { font-size: 12px; color: var(--c-count-color, #79797B); }
.sf-realtime-main { display: flex; flex-direction: column; gap: 2px; }
.sf-realtime-cd { color: var(--c-active-color, #2667EC); font-size: 13px; font-weight: 600; }
.sf-pay-date { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.sf-pay-date-label { font-size: 13px; color: var(--c-input-color, #333); }
.sf-pay-date .sf-input { flex: 1; }
.sf-pay-stock { font-size: 12px; color: var(--c-count-color, #79797B); margin-top: 6px; }
.sf-pay-stock.out { color: var(--c-error-color, #ED4F4F); }
.sf-pay-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.sf-pay-tag { font-size: 11px; color: var(--c-active-color, #2667EC); background: rgba(38, 103, 236, 0.08); border-radius: 4px; padding: 2px 6px; }
.sf-nav { display: flex; gap: 12px; margin-top: 6px; }
.sf-prev { flex: 1; border: 1px solid var(--c-next-border, #dcdfe6); border-radius: var(--c-input-radius, 19px); padding: 12px; background: #fff; color: var(--c-title-color, #303133); font-size: 16px; text-align: center; }
.sf-prev.disabled { opacity: 0.5; pointer-events: none; }

/* ===== P3 装修/协议/文件 组件样式 ===== */
.sf-agree-row { display: flex; align-items: flex-start; gap: 8px; font-size: var(--c-input-size, 13px); color: var(--c-input-color, #333333); flex-wrap: wrap; }
.sf-agree-row .sf-check { margin-top: 1px; }
.sf-title-main { display: block; font-weight: 600; }
.sf-title-sub { display: block; font-size: 13px; color: #909399; margin-top: 4px; font-weight: 400; }
.sf-title-tip { display: block; font-size: 12px; color: var(--c-desc-color, #999999); margin-top: 4px; }
.sf-swiper-desc { display: block; font-size: 12px; color: var(--c-desc-color, #999999); margin-top: 6px; }
.sf-bigimage-desc { display: block; font-size: 12px; color: var(--c-desc-color, #999999); margin-top: 6px; }
.sf-download-wrap { display: flex; flex-direction: column; gap: 6px; }
.sf-download-sample { font-size: 12px; color: var(--c-down-color, #4385FF); text-align: center; }
.sf-download-tip { display: block; font-size: 12px; color: var(--c-desc-color, #999999); }
.sf-video-poster { position: relative; width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: var(--c-input-radius, 8px); overflow: hidden; }
.sf-video-poster-img { width: 100%; height: 100%; }
.sf-video-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; line-height: 48px; text-align: center; background: rgba(0, 0, 0, 0.5); border-radius: 50%; color: #fff; font-size: 20px; }
/* 弹层（协议正文 / 视频弹出） */
.sf-mask { position: fixed; left: 0; top: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.55); z-index: 999; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
.sf-modal { width: 100%; max-width: 480px; max-height: 76vh; background: #fff; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
.sf-modal-title { font-size: 16px; font-weight: 600; padding: 16px; border-bottom: 1px solid #f0f0f0; }
.sf-modal-body { flex: 1; padding: 16px; font-size: 14px; line-height: 1.7; color: #303133; white-space: pre-wrap; }
.sf-modal-btn { padding: 14px; text-align: center; color: #fff; background: var(--c-active-color, #2667EC); font-size: 15px; }
.sf-video-modal { background: transparent; max-width: 560px; }
.sf-video-pop-el { width: 100%; border-radius: 8px; }
</style>
