<template>
  <view class="sf-page" :class="rootClass" :style="pageBgStyle">
  <view class="sf-holder">
    <view class="sf-form" :class="layout" :style="globalStyle">
      <view class="sf-form-head" v-if="form.name && mode !== 'embed'">
        <view class="sf-form-name">{{ form.name }}</view>
        <view class="sf-form-tag">表单</view>
      </view>

      <template v-for="comp in currentPageComponents" :key="comp.id">
        <view class="sf-field" :class="fieldCls(comp)" :style="fieldStyle(comp)">
          <view class="sf-label" v-if="!noTitleTypes.includes(comp.type)">
            {{ comp.content.label || '未命名' }}
            <text v-if="comp.content.required" class="sf-req">*</text>
          </view>

          <!-- 单行/多行文本
               textarea 必须绑:maxlength —— 否则 uni H5 走内置默认上限 140，
               面板里设的「最多输入」(content.maxLength) 完全不生效（真实 bug：设400 只能输 140）。
               show-confirm-bar=false 关掉 uni 自带的工具条，字数统计改由下方 .sf-counter 自行渲染，
               这样三端（小程序无内置计数）表现一致。 -->
          <view v-if="comp.type === 'textarea'" class="sf-textarea-box">
            <textarea
              class="sf-input sf-textarea"
              v-model="values[comp.id]"
              :placeholder="comp.content.placeholder"
              :disabled="comp.content.readonly"
              :maxlength="comp.content.maxLength > 0 ? comp.content.maxLength : -1"
              :show-confirm-bar="false"
            />
            <text v-if="comp.content.maxLength > 0" class="sf-counter">{{ (values[comp.id] || '').length }}/{{ comp.content.maxLength }}</text>
          </view>
          <view v-else-if="comp.type === 'text'" class="sf-text" :class="{ scan: comp.content.scanCode }">
            <input class="sf-input" v-model="values[comp.id]" :placeholder="comp.content.placeholder" :disabled="comp.content.readonly" />
            <view v-if="comp.content.scanCode" class="sf-scan" :style="{ color: 'var(--c-scan-color, #666666)' }" @click="onScan(comp.id)">▦</view>
          </view>

          <!-- 数字：组件风格 = 增减类型(step) / 滑块风格(slider) -->
          <view v-else-if="comp.type === 'number'" class="sf-number">
            <template v-if="comp.style && comp.style.styleType === 'step'">
              <view class="sf-step-btn sf-step-minus" @click="stepNum(comp.id, -1)">−</view>
              <input class="sf-input" type="number" v-model="values[comp.id]" :placeholder="comp.content.placeholder" :disabled="comp.content.readonly" />
              <view class="sf-step-btn sf-step-plus" @click="stepNum(comp.id, 1)">+</view>
            </template>
            <!-- 滑块风格：此前 styleType='slider' 只切 class 却从未渲染滑块 → 整个风格是死参数。
                 无输入值时回落预填值（prefill），再回落 min —— 与设计器预览 sliderVal() 同口径。 -->
            <template v-else-if="comp.style && comp.style.styleType === 'slider'">
              <slider
                class="sf-slider-ctrl"
                :value="Number(sliderVal(comp))"
                :min="comp.content.min != null ? comp.content.min : 0"
                :max="comp.content.max != null ? comp.content.max : 100"
                :step="comp.content.step || 1"
                :disabled="comp.content.readonly"
                :activeColor="'var(--c-active-color, #0076F0)'"
                :backgroundColor="'var(--c-inactive-color, #C6D1DE)'"
                blockColor="#FFFFFF"
                @changing="onSlider($event, comp.id)"
                @change="onSlider($event, comp.id)"
              />
              <text class="sf-slider-val">{{ sliderVal(comp) }}</text>
            </template>
            <input v-else class="sf-input" type="number" v-model="values[comp.id]" :placeholder="comp.content.placeholder" :disabled="comp.content.readonly" />
          </view>

          <!-- 时间：时间点 = 单 picker；时间段 = 双 picker + ~（对标站 el-date-editor--timerange）。
               ⚠️ 必须用 uni <picker>，不能用 <input type="time">：H5 原生 input 支持 type=time，
               但**小程序端 input 不支持 type="time"/"date"**（H5 专属属性），真机不弹选择器。
               picker 在 H5/小程序两端都弹（与 select 组件同一范式）。值存 'HH:mm' / 'HH:mm~HH:mm'。 -->
          <picker v-else-if="comp.type === 'time' && comp.content.dateType !== 'timerange'" class="sf-input sf-picker" mode="time" :value="values[comp.id]" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id, $event)">
            <view class="sf-picker-val" :class="{ ph: !values[comp.id] }">{{ values[comp.id] || '请选择时间' }}</view>
          </picker>
          <view v-else-if="comp.type === 'time' && comp.content.dateType === 'timerange'" class="sf-range">
            <picker class="sf-input sf-range-cell sf-picker" mode="time" :value="rangePartOf(comp.id, 'start')" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id, $event, 'start')">
              <view class="sf-picker-val" :class="{ ph: !rangePartOf(comp.id, 'start') }">{{ rangePartOf(comp.id, 'start') || '开始时间' }}</view>
            </picker>
            <text class="sf-range-sep">~</text>
            <picker class="sf-input sf-range-cell sf-picker" mode="time" :value="rangePartOf(comp.id, 'end')" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id, $event, 'end')">
              <view class="sf-picker-val" :class="{ ph: !rangePartOf(comp.id, 'end') }">{{ rangePartOf(comp.id, 'end') || '结束时间' }}</view>
            </picker>
          </view>

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

          <!-- 单项选择（视觉由根节点 sfx-optbox/optplain/optline 决定，此处不再挂 line class） -->
          <!-- 单项选择（选项类型 content.optionType：text 文字 / image 图片 / imageText 图文）
               optType() 兜底 'text'：老数据没有该字段，若直接判=== 'image' 会全部落到空档。 -->
          <view v-else-if="comp.type === 'radio'" class="sf-opts" :class="optsCls(comp)">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt-row" :class="[optType(comp), { on: values[comp.id] === opt.value }]" @click="values[comp.id] = opt.value">
              <text class="sf-dot" :class="{ on: values[comp.id] === opt.value }" />
              <!-- 图片选项：只显示图；图文选项：图 + 文案 -->
              <!-- 图片/图文：未配图时用占位块 + 序号（空 src 会渲染破图） -->
              <template v-if="optType(comp) === 'image' || optType(comp) === 'imageText'">
                <image v-if="opt.image" class="sf-opt-img" :src="opt.image" mode="aspectFill" />
                <view v-else class="sf-opt-img sf-opt-img-ph">{{ i + 1 }}</view>
              </template>
              <text v-if="optType(comp) === 'text' || optType(comp) === 'imageText'" class="sf-opt-label">{{ opt.label }}</text>
            </view>
          </view>

          <!-- 多项选择 -->
          <view v-else-if="comp.type === 'checkbox'" class="sf-opts" :class="optsCls(comp)">
            <view v-for="(opt, i) in comp.content.options" :key="i" class="sf-opt-row" :class="[optType(comp), { on: (values[comp.id] || []).includes(opt.value) }]" @click="toggleCheck(comp.id, opt.value)">
              <text class="sf-checkbox" :class="{ on: (values[comp.id] || []).includes(opt.value) }">✓</text>
              <!-- 图片/图文：未配图时用占位块 + 序号（空 src 会渲染破图） -->
              <template v-if="optType(comp) === 'image' || optType(comp) === 'imageText'">
                <image v-if="opt.image" class="sf-opt-img" :src="opt.image" mode="aspectFill" />
                <view v-else class="sf-opt-img sf-opt-img-ph">{{ i + 1 }}</view>
              </template>
              <text v-if="optType(comp) === 'text' || optType(comp) === 'imageText'" class="sf-opt-label">{{ opt.label }}</text>
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

          <!-- 日期：对标站内容类型 = 单个日期 / 日期范围（ew-date-01）。
               单个日期走原生 input；日期范围 = 双 date input + ~ 分隔（对标站 el-date-editor daterange），
               值存 { start, end } 对象；同步生日开关在提交侧换算生日字段（syncBirthday）。
               此前 dateType='time' 语义是「日期时间」，与对标站的「日期范围」冲突 —— 范围优先判断。 -->
          <view v-else-if="comp.type === 'date' && comp.content.dateType === 'range'" class="sf-range">
            <picker class="sf-input sf-range-cell sf-picker" mode="date" :value="rangePartOf(comp.id, 'start')" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id, $event, 'start')">
              <view class="sf-picker-val" :class="{ ph: !rangePartOf(comp.id, 'start') }">{{ rangePartOf(comp.id, 'start') || '开始日期' }}</view>
            </picker>
            <text class="sf-range-sep">~</text>
            <picker class="sf-input sf-range-cell sf-picker" mode="date" :value="rangePartOf(comp.id, 'end')" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id, $event, 'end')">
              <view class="sf-picker-val" :class="{ ph: !rangePartOf(comp.id, 'end') }">{{ rangePartOf(comp.id, 'end') || '结束日期' }}</view>
            </picker>
          </view>
          <picker v-else-if="comp.type === 'date'" class="sf-input sf-picker" mode="date" :value="values[comp.id]" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id, $event)">
            <view class="sf-picker-val" :class="{ ph: !values[comp.id] }">{{ values[comp.id] || '请选择日期' }}</view>
          </picker>

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
          <!-- 车牌号：对标站 8 格分位输入（省简称 + 发牌机关 + 6 位序号），值仍是完整车牌字符串。
               对标站实测（car-number-widget 源码 + scoped CSS）：8 格独立圆角卡片（高 49px、文字居中、
               卡间留缝），卡 1/卡 2 之间有 4px 圆点分隔符（div.point，left:23%），
               最后一格为新能源位：绿框绿字 + placeholder「新能源」（rgb(0,181,0)）。
               2026-10-05（五轮）：取消「新能源车牌」类型开关，改为**固定 8 格、末格绿位可选** ——
               普通蓝牌填 7 格、末格留空；新能源绿牌填满 8 格。类型由 C 端填表人自行决定（设计器不锁类型），
               校验正则在 7/8 位间自适应放行。
               2026-10-05（四轮）：点击格子弹自定义软键盘 —— 第 1 格省份键盘，其余格字母数字键盘，
               选省后自动切到字母键盘（对标站交互）；用自定义 view 格 + 底部键盘，不弹系统键盘。 -->
          <view v-else-if="comp.type === 'carplate'" class="sf-plate-wrap">
            <view class="sf-plate">
              <view
                v-for="n in 8"
                :key="n"
                class="sf-plate-cell"
                :class="{
                  'sf-plate-cell--ne': n === 8,
                  'is-active': activePlate.id === comp.id && activePlate.index === n - 1
                }"
                @click="focusPlate(comp.id, n - 1)"
              >
                <text v-if="plateCellOf(comp.id, n - 1)">{{ plateCellOf(comp.id, n - 1) }}</text>
                <text v-else-if="n === 8" class="sf-plate-ph">新能源</text>
              </view>
              <view class="sf-plate-dot" />
            </view>

            <!-- 自定义软键盘：仅当前激活的车牌组件展示 -->
            <view v-if="activePlate.id === comp.id" class="sf-plate-kb">
              <!-- 省份键盘 -->
              <view v-if="plateKbType() === 'province'" class="sf-kb sf-kb-prov">
                <view class="sf-kb-row" v-for="(row, ri) in PROVINCE_ROWS" :key="'p' + ri">
                  <view class="sf-kb-key" v-for="p in row" :key="p" @click="pressPlateKey(p)">{{ p }}</view>
                </view>
                <view class="sf-kb-actions">
                  <view class="sf-kb-key sf-kb-back" @click="backspacePlate()">⌫</view>
                  <view class="sf-kb-key sf-kb-done" @click="closePlateKb()">完成</view>
                </view>
              </view>
              <!-- 字母数字键盘 -->
              <view v-else class="sf-kb sf-kb-alpha">
                <view class="sf-kb-row" v-for="(row, ri) in LETTER_ROWS" :key="'l' + ri">
                  <view class="sf-kb-key" v-for="k in row" :key="k" @click="pressPlateKey(k)">{{ k }}</view>
                </view>
                <view class="sf-kb-row sf-kb-digits">
                  <view class="sf-kb-key" v-for="d in PLATE_DIGITS" :key="d" @click="pressPlateKey(d)">{{ d }}</view>
                </view>
                <view class="sf-kb-actions">
                  <view class="sf-kb-key sf-kb-back" @click="backspacePlate()">⌫</view>
                  <view class="sf-kb-key sf-kb-done" @click="closePlateKb()">完成</view>
                </view>
              </view>
            </view>
          </view>

          <!-- 标题 -->
          <!-- 标题：组件样式的主标题大小/颜色优先，回退内容配置 -->
          <view v-else-if="comp.type === 'title'" class="sf-title" :style="{ fontSize: (comp.style && comp.style.titleSize || comp.content.size || 17) + 'px', textAlign: comp.content.align || 'left', color: comp.style && comp.style.labelColor || comp.content.color || '#000000' }" @click="comp.content.link && openLink(comp.content.link)">
            <text class="sf-title-main">{{ comp.content.text }}</text>
            <view v-if="comp.content.subtitle" class="sf-title-sub">{{ comp.content.subtitle }}</view>
            <view v-if="comp.content.tip" class="sf-title-tip">{{ comp.content.tip }}</view>
            <view v-if="comp.style && comp.style.lineColor" class="sf-title-line" :style="{ borderTopColor: 'var(--c-line-color, #434343)' }"></view>
          </view>

          <!-- 富文本 -->
          <view v-else-if="comp.type === 'richtext'" class="sf-richtext" v-html="comp.content.html" />

          <!-- 空白块：样式「空白高度」优先 -->
          <view v-else-if="comp.type === 'blank'" :style="{ height: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : comp.content.height || 20) + 'px' }" />

          <!-- 辅助线：样式「线条粗细 / 线条颜色」优先，回退内容配置高度/颜色 -->
          <view v-else-if="comp.type === 'line'" class="sf-line" :style="{ borderTopStyle: comp.content.style || 'solid', borderTopWidth: (comp.style && comp.style.dividerHeight != null ? comp.style.dividerHeight : (comp.content.height || 1)) + 'px', borderTopColor: comp.style && comp.style.dividerColor || comp.content.color || '#000000' }" />

          <!-- 轮播图 -->
          <view v-else-if="comp.type === 'swiper'" class="sf-swiper" @click="comp.content.link && openLink(comp.content.link)">
            <swiper v-if="(comp.content.images || []).length" :autoplay="comp.content.autoplay !== false" :circular="comp.content.circular !== false" :indicator-dots="false" :interval="swiperInterval(comp)" :duration="400" :style="{ height: (comp.style && comp.style.inputHeight || comp.content.height || 160) + 'px' }" @change="onSwiperChange(comp.id, $event)">
              <swiper-item v-for="(img, si) in comp.content.images" :key="si">
                <image :src="img" class="sf-swiper-img" mode="aspectFill" />
              </swiper-item>
            </swiper>
            <view v-else class="sf-swiper-empty">轮播图（{{ (comp.content.images || []).length }} 张）</view>
            <view v-if="(comp.content.images || []).length > 1" class="sf-swiper-dots" :style="{ bottom: (comp.style && comp.style.dotBottom != null ? comp.style.dotBottom : 8) + 'px', gap: (comp.style && comp.style.dotGap != null ? comp.style.dotGap : 6) + 'px' }">
              <view v-for="(img, di) in (comp.content.images || [])" :key="di" class="sf-dot-item" :class="{ on: (swiperCurrent[comp.id] || 0) === di }" />
            </view>
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
            <view class="sf-pay-qty">
              <text class="sf-pay-qty-label">购买数量</text>
              <view class="sf-step-btn sf-step-minus" @click="stepPay(comp.id, -1)">−</view>
              <text class="sf-pay-qty-val">{{ (values[comp.id] || {}).qty || 1 }}</text>
              <view class="sf-step-btn sf-step-plus" @click="stepPay(comp.id, 1)">+</view>
            </view>
            <!-- 日期选择（picker：小程序端 input 不支持 type=date，不弹选择器） -->
            <view v-if="comp.content.dateSelect" class="sf-pay-date">
              <text class="sf-pay-date-label">参与日期</text>
              <picker class="sf-input sf-picker" mode="date" :value="values[comp.id + '__date']" :disabled="comp.content.readonly" @change="onDateTimePick(comp.id + '__date', $event)">
                <view class="sf-picker-val" :class="{ ph: !values[comp.id + '__date'] }">{{ values[comp.id + '__date'] || '请选择日期' }}</view>
              </picker>
            </view>
            <!-- 库存展示 -->
            <view v-if="comp.content.showStock" class="sf-pay-stock" :class="{ out: comp.content.stock <= 0 }">{{ comp.content.stock > 0 ? ('剩余库存：' + comp.content.stock + ' 件') : '已售罄' }}</view>
            <!-- 能力标签（退款/核销/限购/优惠券/积分/会员折扣/分销，对齐 ew 支付能力面板） -->
            <view v-if="payTags(comp.content).length" class="sf-pay-tags">
              <text v-for="(t, ti) in payTags(comp.content)" :key="ti" class="sf-pay-tag">{{ t }}</text>
            </view>
            <view class="sf-pay-bottom">
              <text class="sf-pay-total" :style="{ color: 'var(--c-bottom-color, #000000)' }">合计 ¥{{ payTotal(comp) }}</text>
              <view class="sf-pay-buy" @click="payBuy(comp.id)">立即购买</view>
            </view>
          </view>

          <!-- 提交按钮：用 view 而非 button —— uni-button 内部元素自带 line-height（H5 约 2.55），
               宿主 class 覆盖不到，会导致 H5/小程序/装修画布三端按钮高度不一致（67px vs 45px）。
               改 view 后高度完全由 .sf-submit 控制，与装修画布预览同源同值。 -->
          <view v-else-if="comp.type === 'submit'" class="sf-submit" @click="submit">{{ comp.content.label || '确认' }}</view>
        </view>
      </template>

      <!-- 分页导航：上一步/下一步（文案与禁止返回取自分页组件配置） -->
      <view v-if="hasPages" class="sf-nav" :style="navStyle">
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
  </view>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { cardApi } from '../utils/cardApi.js';
import { componentStyleVars, isVisible, styleVariant, optType as optTypeOf, isImgOptionType } from '../utils/sfComponentStyle.js';
import { regionProvinces, regionCities, regionDistricts, dateYears, dateDays } from '../utils/sfRegionData.js';
import { PLATE_PROVINCES, PLATE_LETTERS, PLATE_DIGITS, plateKeyType, provinceRows, letterRows } from '../utils/plateKeyboard.js';

/**
 * 超级表单渲染器（C 端唯一实现）
 * - mode='page'：独立填表页模式，自带页面背景与表单名（/pages/superForm/fill）
 * - mode='embed'：装修组件内嵌模式，不占满屏、不重复显示表单名（DesignPage.vue 内使用）
 *
 * 设计要点：表单逻辑（29 组件渲染 / 条件显隐 / 分页 / 校验 / 支付 / 弹层）只此一份，
 * 独立填表页与装修内嵌共用，杜绝两套实现不同步。
 */
const props = defineProps({
  // 表单 id（mode 内部自行拉取）
  formId: { type: [String, Number], default: '' },
  // 直接给定config（装修组件场景：外层已拉过表单，避免二次请求）
  config: { type: Object, default: null },
  // 表单名（内嵌模式由外层展示，这里仅用于 page 模式标题）
  name: { type: String, default: '' },
  mode: { type: String, default: 'page' },
});
const emit = defineEmits(['loaded', 'submit-success', 'submit-error']);

const form = reactive({ name: props.name || '', config: { components: [], settings: {} } });
const values = reactive({});
// 级联选择（省市区 / 日期）的临时选中态，key 形如 `${compId}_p/_c/_d/_y/_m`
const casc = reactive({});
// 轮播当前页（per-swiper 指示点高亮 + 切换速度联动）
const swiperCurrent = reactive({});
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
  // 内嵌模式不带整屏内外边距（由宿主页面的组件间距负责），其余视觉变量照用
  const box = props.mode === 'embed' ? { marginTop: 0, paddingTop: 0, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 } : null;
  return {
    // 全局圆角（组件圆角 / 输入框圆角），供各字段经 CSS 变量消费
    '--g-radius': (g.radius || 0) + 'px',
    '--g-input-radius': (g.inputRadius != null ? g.inputRadius : 3) + 'px',
    // 组件颜色（对齐 ew）
    '--c-border-color': g.cBorder || '#F5F2F2',
    '--c-title-color': g.cTitle || '#000000',
    '--c-input-color': g.cInput || '#333333',
    '--c-error-color': g.cError || '#ED4F4F',
    ...(box || {
      marginTop: (g.marginTop || 0) + 'px',
      paddingTop: (g.marginY || 0) + 'px',
      paddingBottom: (g.marginY || 0) + 'px',
      paddingLeft: (g.marginX || 0) + 'px',
      paddingRight: (g.marginX || 0) + 'px',
    }),
  };
});
// 页面背景：颜色 / 图片+颜色（平铺/位置/图片样式对齐 ew 全局样式）
// embed 模式不套用页面背景 —— 表单的「页面底色」是给独立填表页整屏用的，
// 内嵌到店铺/首页时若照搬会盖掉宿主页面的底色与装修风格。
const pageBgStyle = computed(() => {
  if (props.mode === 'embed') return {};
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
  return componentStyleVars(comp, form.config.settings?.globalStyle || {}, layout.value);
}

/**
 * 选择类的「选项类型」（文字 / 图片 / 图文）→ 渲染端值。
 * 此前该字段虽是面板上的三选一，但**两端渲染器都不消费**（纯死参数，切了没反应），
 * 且老数据里根本没有 `content.optionType`（=undefined）。故统一兜底为 'text'。
 */
function optType(comp) {
  return optTypeOf(comp);
}

/**
 * 选项区 class：区分「文字选项」与「图片/图文选项」，后者再区分
 * 纵向列表（list，对标站默认）/ 网格排列（grid）。
 * 排布与每行格子数由 --c-opt-img-layout / --c-opt-img-per-row 两个 CSS 变量驱动
 * （由 componentStyleVars 从 style.optImgLayout / optImgPerRow 发射）。
 */
function optsCls(comp) {
  if (optType(comp) === 'text') return {};
  const grid = comp.style && comp.style.optImgLayout === 'grid';
  return { 'opts-img': true, 'opts-img-grid': !!grid };
}
/**
 * 「组件风格」风格卡 → 容器 class（sfv-box / sfv-plain / sfv-line / sfx-opt* …）。
 * 此前只有 `styleType === 'line'` 判线风格，其余值（box1/box2/s2/s3/slider…）全部落到默认分支
 * → 三个风格卡里除「线风格」外点击毫无变化（用户反馈「三个风格无效」）。
 * 现统一走 sfComponentStyle.styleVariant()：原始值域 9 个（box/box1/box2/line/s1/s2/s3/step/slider）
 * 跨组件会撞名，映射表收敛成语义 class，三端只认语义。
 */
function fieldCls(comp) {
  return Object.assign(
    {
      'sf-t-image': comp.type === 'image',
      // 「上下布局 / 左右布局」由表单级 settings.layout 统一驱动（唯一切换入口：
      // 顶栏「基础布局」/ 全局样式→基础布局）。不读组件私有字段，避免两套开关打架。
      'sf-layout-left': layout.value === 'horizontal',
    },
    styleVariant(comp)
  );
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

const rootClass = computed(() => (props.mode === 'embed' ? 'sf-embed' : 'sf-page-mode'));

// 分页导航配色：把分页组件的样式（上一步/下一步 背景·文字·边框）注入导航作用域，
// 否则 .sf-prev/.sf-next 拿不到 --c-prev-*/--c-next-*，设计器里调了颜色真机却无效。
const navStyle = computed(() => {
  const pb = components.value.find((c) => c.type === 'pagebreak');
  const s = (pb && pb.style) || {};
  return {
    '--c-prev-bg': s.prevBg || '#EDF1F3',
    '--c-prev-color': s.prevLabelColor || '#333333',
    '--c-prev-border': s.prevBorderColor || '#EDF1F3',
    '--c-next-bg': s.nextBg || '#0076F0',
    '--c-next-color': s.nextLabelColor || '#FFFFFF',
    '--c-next-border': s.nextBorderColor || '#0076F0',
  };
});

// 有 config 直接用；否则按 formId 拉取（避免装修组件内二次请求）
onMounted(() => {
  if (props.config) {
    form.name = props.name || '';
    form.config = props.config;
    initValues();
    emit('loaded', form.config);
  } else if (props.formId) {
    load();
  }
  _cdTimer = setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => { if (_cdTimer) clearInterval(_cdTimer); });

async function load() {
  try {
    const res = await cardApi.getSuperForm(props.formId);
    form.name = res.name;
    form.config = res.config || { components: [], settings: {} };
    currentPage.value = 0;
    initValues();
    emit('loaded', form.config);

  } catch (e) {
    uni.showToast({ title: '表单加载失败', icon: 'none' });
  }
}

/** 组件默认值预置（预填文字 / 数字默认值 / 支付金额 / 短信对象 / 级联回显），config 直传与远程拉取两条路径共用 */
function initValues() {
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
        values[c.id] = { amount: c.content.amount || 0, qty: 1 };
      } else if (c.type === 'pay') {
        values[c.id] = { qty: 1 };
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

// 注：原 timeType(dt)→input[type] 映射已移除。时间/日期改用 uni <picker>（小程序端 input 不支持
// type=date/time，真机不弹选择器）；面板只提供 time/timerange/date/range，均一一对应 picker mode。

/** 日期范围 / 时间段的分位读写：值存 'start~end' 字符串（提交侧无需特判，
 *  一个字符串天然兼容旧数据；对象形态会让 payload 出现结构差异）。 */
function rangePartOf(id, part) {
  const v = values[id];
  if (typeof v !== 'string') return '';
  const [s, e] = v.split('~');
  return part === 'start' ? (s || '') : (e || '');
}
function setRangePart(id, part, ev) {
  const val = (ev && ev.detail && ev.detail.value !== undefined) ? ev.detail.value : (ev.target ? ev.target.value : '');
  const cur = typeof values[id] === 'string' ? values[id].split('~') : ['', ''];
  const next = part === 'start' ? [val, cur[1] || ''] : [cur[0] || '', val];
  values[id] = next.join('~');
}
/** 日期/时间 picker 变更：part 为空=单值写 values[id]；part='start'/'end' 写范围（'起~止'）。 */
function onDateTimePick(id, ev, part) {
  const v = ev && ev.detail && ev.detail.value != null ? String(ev.detail.value) : '';
  if (!v) return;
  if (part) setRangePart(id, part, { detail: { value: v } });
  else values[id] = v;
}

/** 车牌号分位读写：值 = 完整车牌字符串（8 格各 1 字符）。 */
function plateCellOf(id, idx) {
  const v = values[id];
  return (typeof v === 'string' && v[idx]) || '';
}
function setPlateCell(id, idx, ev) {
  const val = (ev && ev.detail && ev.detail.value !== undefined) ? String(ev.detail.value) : String(ev.target ? ev.target.value : '');
  const cur = (typeof values[id] === 'string' ? values[id] : '').padEnd(8, ' ').split('');
  cur[idx] = val.slice(-1);
  values[id] = cur.join('').replace(/\s+$/, '');
}

/** 车牌软键盘状态：当前激活的车牌组件 id 与格索引（null/-1 表示未激活）。 */
const activePlate = reactive({ id: null, index: -1 });
// 静态键位布局（一次计算，模板复用）
const PROVINCE_ROWS = provinceRows();
const LETTER_ROWS = letterRows();

// 末格（绿色「新能源」位）空值时在模板内联显示占位（见上方 n === 8 分支）
// 当前键盘类型：第 1 格省份键盘，其余字母数字键盘
function plateKbType() {
  if (!activePlate.id) return null;
  return plateKeyType(activePlate.index);
}
function focusPlate(id, idx) {
  const c = compById(id);
  if (!c || c.content.readonly) return;
  activePlate.id = id;
  activePlate.index = idx;
}
function closePlateKb() {
  activePlate.id = null;
  activePlate.index = -1;
}
function pressPlateKey(ch) {
  const id = activePlate.id;
  if (!id) return;
  const idx = activePlate.index;
  setPlateCell(id, idx, { detail: { value: ch } });
  if (idx < 7) activePlate.index = idx + 1; // 自动前进；选省后（index 0→1）键盘自动切字母
}
function backspacePlate() {
  const id = activePlate.id;
  if (!id) return;
  const idx = activePlate.index;
  const cur = (typeof values[id] === 'string' ? values[id] : '').split('');
  if (cur[idx]) {
    cur[idx] = '';
    values[id] = cur.join('').replace(/\s+$/, '');
  } else if (idx > 0) {
    activePlate.index = idx - 1;
  }
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
  values[id] = { spec: sp.name, amount: sp.price, qty: (values[id] && values[id].qty) || 1 };
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

// 数字步进器：按 step 增减并夹在 min/max 区间
function stepNum(id, dir) {
  const c = compById(id);
  const step = (c && c.content && c.content.step) || 1;
  const min = c && c.content && c.content.min;
  const max = c && c.content && c.content.max;
  let v = Number(values[id]) || 0;
  v += dir * step;
  if (min != null && !isNaN(Number(min)) && v < Number(min)) v = Number(min);
  if (max != null && !isNaN(Number(max)) && v > Number(max)) v = Number(max);
  values[id] = v;
}

// 数字「滑块风格」：H5/小程序 slider 事件统一取 detail.value
function onSlider(e, id) {
  const v = e && e.detail != null ? e.detail.value : (e && e.target ? e.target.value : null);
  if (v != null) values[id] = v;
}

// 滑块当前值：已输入 > 预填值(prefill) > min（与设计器预览 sliderVal 同一口径）
function sliderVal(comp) {
  const v = values[comp.id];
  if (v != null && v !== '') return v;
  if (comp.content.prefill != null && comp.content.prefill !== '') return comp.content.prefill;
  return comp.content.min != null ? comp.content.min : 0;
}

// 支付数量步进器：夹在 >=1
function stepPay(id, dir) {
  const v = values[id] || { qty: 1 };
  v.qty = Math.max(1, (v.qty || 1) + dir);
  values[id] = { ...v };
}

// 支付合计 = 单价 × 数量（多规格取已选规格价）
function payTotal(comp) {
  const v = values[comp.id] || {};
  const unit = comp.content.specType === 'multi' ? (v.amount || 0) : (comp.content.amount || 0);
  return (Number(unit) * (v.qty || 1)).toFixed(2);
}

// 立即购买：触发整表提交（支付落地在发布后接入）
function payBuy(id) {
  submit();
}

// 轮播：切换回调 + 自动播放间隔（switchSpeed 秒 → 毫秒）
function onSwiperChange(id, e) {
  swiperCurrent[id] = e.detail.current;
}
function swiperInterval(comp) {
  return (comp.style && comp.style.switchSpeed ? comp.style.switchSpeed : 3) * 1000;
}

// 文本扫码：调起 uni 扫码并回填（H5/小程序均支持）
function onScan(id) {
  if (uni.scanCode) {
    uni.scanCode({
      success: (r) => { values[id] = r.result; },
      fail: () => {},
    });
  } else {
    uni.showToast({ title: '当前环境不支持扫码', icon: 'none' });
  }
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
    await cardApi.submitSuperForm(props.formId, payload);
    const submitComp = components.value.find((c) => c.type === 'submit');
    const jump = (submitComp && submitComp.content.jumpLink) || settings.submit?.jumpLink;
    emit('submit-success', { jump });
    if (jump) { uni.redirectTo({ url: jump }); return; }
    uni.showToast({ title: '提交成功', icon: 'success' });
  } catch (e) {
    emit('submit-error', e);
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>


<style>
/* padding 0：页面左右留白改由每个组件的「左右外边距」(outMarginX, 内联 margin) 单独控制，
   ew 侧同样是组件级参数（outLeftRightMargin）。若此处保留 16px padding 会与之叠加成 26px。 */
.sf-page { background: #f2f3f5; min-height: 100vh; padding: 0; box-sizing: border-box; }
.sf-form { background: transparent; }
/* 「组件即卡片」：卡片自身白底由 componentStyleVars 内联 backgroundColor 提供，
   卡间灰缝由 componentStyleVars 内联 marginTop(=顶外边距) 让页面底色(#f2f3f5)透出。
   此前此处写死 margin-bottom:10px 会架空「顶外边距」参数（设 0 仍留 10px 缝），已移除。 */
.sf-form.horizontal { display: flex; flex-wrap: wrap; gap: 12px; }
.sf-form.horizontal .sf-field { flex: 1 1 45%; }
/* 表单头部：标题在左 + 红色「表单」tag 在右。
   tag 尺寸/配色按对标图逐像素量取：底 #FFF1ED、字 #F2624E、整体 30×16px（10px 字号 + 2×5px 横向内距）。 */
/* margin-bottom: 0 —— 头部与首卡的间距统一由首卡的「顶外边距」提供（对标图实测 10px），
   否则 8 + 10 = 18px 比对标图多 8px，且首卡设 0 时头部下方会留 8px 空隙。
   横向 10px 与卡片对齐（对标图：标题区 y1..44 满宽，卡片自 x25 起；此处按卡片外边距内缩）。 */
.sf-form-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 10px 4px; }
.sf-form-name { font-size: 18px; font-weight: 600; color: #1D2129; }
.sf-form-tag { flex-shrink: 0; font-size: 10px; line-height: 1.2; color: #F2624E; background: #FFF1ED; border-radius: 3px; padding: 2px 5px; }
/* 所有组件样式均消费「组件样式 → CSS 变量」（ew 四段：背景/整体/风格/颜色），与设计器预览同一套语义 */
/* margin 不设：卡片间距完全由 componentStyleVars 内联 marginTop(顶外边距) 控制 */
/* margin/padding 横向不设：卡片左右内距完全由 componentStyleVars 内联 marginX 决定
   （默认值 16px 已下沉到 COMMON_WHOLE.marginX，此处归 0 避免与内联叠加/抢权重） */
.sf-field { padding: 12px 0; }
.sf-label { font-size: var(--c-title-size, 14px); color: var(--c-title-color, #000000); margin-bottom: 8px; }
.sf-req { color: var(--c-error-color, #ED4F4F); margin-left: 2px; }
.sf-input { width: 100%; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); box-sizing: border-box; background: var(--c-input-bg, #F7F9FA); color: var(--c-input-color, #333333); }
/* 小程序 picker 下拉（view 模拟，等高分毫不差） */
.sf-picker { display: flex; align-items: center; padding: 0; }
.sf-picker-val { width: 100%; padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); box-sizing: border-box; color: var(--c-input-color, #333333); }
.sf-picker-val.ph { color: #999999; }
/* 多行文本：外层 relative 供右下角字数统计定位；高度走 --c-input-height（与预览端同源）。
   ⚠️ 计数必须自绘而非依赖 uni H5 <textarea> 的内置 confirm-bar：
   小程序端没有内置计数，且内置上限固定 140（不读 content.maxLength）。 */
.sf-textarea-box { position: relative; }
.sf-textarea { min-height: var(--c-input-height, 84px); width: 100%; box-sizing: border-box; display: block; }
.sf-counter { position: absolute; right: var(--c-input-pad-x, 10px); bottom: 6px; font-size: var(--c-prompt-size, 12px); color: var(--c-count-color, #909399); line-height: 1; pointer-events: none; }
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
/* 「组件风格」语义 class（值→语义的映射见 sfComponentStyle.styleVariant）：
     sfv-box   描边 + 浅底（= 基础样式，也是无风格时的默认）
     sfv-plain 白底 + **极淡描边**（弱框，边界仍可见）
   三端（C 端 .sf-field / 预览 .cmpv / 画布 .r-sf-real-comp）共用同一套 class 名与语义。
   ⚠️ 覆盖清单必须与「有风格卡的组件的实际容器 class」一一对齐，漏一个该组件的风格卡就是死参数
   （已漏过 pay / realtime / sf-opts / sf-image-h / sf-id-box，2026-10-04 审计补齐）。
   ⚠️ **box2 不能做成「白底+无边框」**：本项目是「组件即卡片」，卡片自身就是白底(#FFF)，
   白底无框的输入框落在白卡片上= 边框消失、底色无差 → 用户判为「风格二无效」
   （2026-10-04 实测：class 与background 均已生效，纯视觉被卡片底色吃掉）。
   现改为白底 + 1px 极淡描边(#EBEEF5) + 保留输入框圆角，与 box1（浅灰底 + 清晰描边 #F5F2F2）
   形成「弱框 / 强框」两级层次，两档都清晰可辨、且都严格区别于线风格。 */
.sfv-box .sf-input,
.sfv-box .sf-loc,
.sfv-box .sf-auth,
.sfv-box .sf-download,
.sfv-box .sf-upload,
.sfv-box .sf-pay,
.sfv-box .sf-realtime,
.sfv-box .sf-image-h,
.sfv-box .sf-id-box,
.sfv-box .sf-opts { background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.sfv-plain .sf-input,
.sfv-plain .sf-loc,
.sfv-plain .sf-auth,
.sfv-plain .sf-download,
.sfv-plain .sf-upload,
.sfv-plain .sf-pay,
.sfv-plain .sf-realtime,
.sfv-plain .sf-image-h,
.sfv-plain .sf-id-box,
.sfv-plain .sf-opts { background: #FFFFFF; border: 1px solid var(--c-plain-border, #EBEEF5); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.sfv-plain .sf-label,
.sfv-plain .sf-req { color: var(--c-title-color, #000000); }
/* 线风格：输入类控件去边框，仅保留底线（对齐 ew 组件风格） */
.sfv-line .sf-input,
.sfv-line .sf-loc,
.sfv-line .sf-auth,
.sfv-line .sf-download,
.sfv-line .sf-upload,
.sfv-line .sf-pay,
.sfv-line .sf-realtime,
.sfv-line .sf-image-h,
.sfv-line .sf-id-box,
.sfv-line .sf-opts { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
/* 线风格下多行文本不该被压成单行高度：去掉底线方向的内距塌陷 */
.sfv-line .sf-image-h.is-line { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); }
/* 选项区基础样式（框风格给描边+圆角+底色，消费 --c-input-radius）；线风格去框只留行间底线。
   与设计器预览 .cmpv-opt-box 同构。 */
.sf-opts { display: flex; flex-direction: column; gap: 0; border: 1px solid var(--c-inactive-border, #dcdfe6); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); background: var(--c-input-bg, #F7F9FA); }
/* 图片/图文选项的排布。
   ── 对标站实况（CSSOM 抓 .static-radio）：**纵向大图列表**，不是横向网格 ──
     .static-radio .el-radio { display:block; width:100%; margin-bottom:20px; }
     .static-radio .static-radio-image { height:95px; max-width:200px; }
   即图片固定高 95px、宽度自适应，一行一个选项。
   我方此前做成 flex:1 1 0 等分网格 —— 方向性错误：6 个选项挤一行、每格仅约 48px，
   且「选项图片大小」只抬到 min-width，参数形同虚设。

   现支持两种（--c-opt-img-layout，缺省 list = 对标站行为）：
   list 纵向列表：图片 height:var(--c-opt-img-h,95px)，max-width 200px，宽度自适应
   grid 网格排列：每行 --c-opt-img-per-row 个（2~5），图片边长 --c-option-img-size */
.sf-opts.opts-img { flex-direction: column; }
.sf-opts.opts-img .sf-opt-row { align-items: center; gap: 10px; }
/* 列表模式：图文选项图在左、勾选与文字在右（对标站 .static-radio 的行内结构）
   未配图的占位块是 <view>，无内在宽度，必须给显式宽高，否则塌成细线。
   ⚠️ 本条必须排在下面 `.sf-opt-img { width:auto }` 之后 —— 两者特异性相同
   （4 个 class），同序时后者胜；写在前面会被 width:auto 覆盖成 6px 细线。 */
.sf-opts.opts-img .sf-opt-row .sf-opt-img { height: var(--c-opt-img-h, 95px); width: auto; max-width: 200px; max-height: none; }
.sf-opts.opts-img .sf-opt-row .sf-opt-img-ph { width: var(--c-opt-img-ph-w, 130px); flex-shrink: 0; }
.sf-opts.opts-img .sf-opt-row.image,
.sf-opts.opts-img .sf-opt-row.imageText { flex-direction: row; align-items: center; gap: 10px; padding: 10px 0; }
.sf-opts.opts-img .sf-opt-row.imageText .sf-opt-label { flex: 1; min-width: 0; }
/* 图片档：只有图 + 勾选，文字左对齐在图右侧（对标站 label 在图之后） */
.sf-opts.opts-img .sf-opt-row.image { padding: 10px 0; }

/* 网格模式：容器改 grid，每行格子数由 --c-opt-img-per-row 决定 */
.sf-opts.opts-img.opts-img-grid { display: grid; grid-template-columns: repeat(var(--c-opt-img-per-row, 3), minmax(0, 1fr)); gap: 8px; }
.sf-opts.opts-img.opts-img-grid .sf-opt-row,
.sf-opts.opts-img.opts-img-grid .sf-opt-row.image,
.sf-opts.opts-img.opts-img-grid .sf-opt-row.imageText { flex-direction: column; gap: 4px; padding: 4px 0; align-items: center; text-align: center; }
/* 网格模式图片边长由「选项图片大小」控制（--c-option-img-size，缺省 64px）。
   注意不能写 width:100% —— 那会被格子宽度覆盖、把图片撑满格，
   「选项图片大小」就退化成死参数（与之前横向等分网格同一个坑）。
   max-width:100% 保证格子比设定值窄时不溢出。 */
.sf-opts.opts-img.opts-img-grid .sf-opt-row .sf-opt-img,
.sf-opts.opts-img.opts-img-grid .sf-opt-row .sf-opt-img-ph { width: var(--c-option-img-size, 64px); max-width: 100%; height: auto; aspect-ratio: 1; max-height: none; }
.sf-opts.opts-img.opts-img-grid .sf-opt-row .sf-opt-label { text-align: center; }
.sf-opts.opts-img .sf-opt-row + .sf-opt-row { border-top: none; }
/* 日期范围 / 时间段：双输入 + ~ 分隔（对标站 el-date-editor--*range 形态） */
.sf-range { display: flex; align-items: center; gap: 8px; }
.sf-range .sf-range-cell { flex: 1; min-width: 0; }
.sf-range .sf-range-sep { color: var(--c-prompt-color, #999999); flex-shrink: 0; }
/* 车牌号：8 格分位输入（对标站 car-number-widget）。
   对标站实测：**每格是独立圆角卡片**（高 49px、文字居中、卡间留缝 2.5%），
   不是相连格子 —— 卡片样式（浅底+描边+圆角）由格子自己承担，容器透明，
   卡 1/卡 2 之间有 4px 圆点分隔符（left:23%），最后一格新能源位绿框绿字。 */
.sf-plate { position: relative; display: flex; gap: 2.5%; }
.sf-plate .sf-plate-cell { width: 0; flex: 1; min-width: 0; height: 49px; text-align: center; font-size: var(--c-input-size, 14px); padding: 0; background: transparent; border: none; border-radius: 0; overflow: hidden; box-sizing: border-box; }
.sfv-box .sf-plate .sf-plate-cell { background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.sfv-line .sf-plate .sf-plate-cell { background: transparent; border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; }
/* 最后一格 = 新能源位：对标站固定绿框绿字（scoped CSS !important，与所选配色无关） */
.sf-plate .sf-plate-cell--ne { border-color: rgb(0, 181, 0) !important; color: rgb(0, 181, 0) !important; }
/* 分隔圆点：对标站 .point 4×4px 圆形，绝对定位 left:23%（卡 2 右侧缝内），颜色 = 输入文字色 */
.sf-plate-dot { position: absolute; left: 23%; top: 50%; width: 4px; height: 4px; margin-top: -2px; border-radius: 50%; background: var(--c-input-color, #333333); }
/* 激活格高亮（点击弹键盘时） */
.sf-plate .sf-plate-cell { display: flex; align-items: center; justify-content: center; cursor: pointer; transition: border-color .15s, box-shadow .15s; user-select: none; }
.sf-plate .sf-plate-cell.is-active { border-color: var(--c-active-color, #0076F0) !important; box-shadow: 0 0 0 2px rgba(0, 118, 240, 0.15); }
.sf-plate-ph { color: rgb(0, 181, 0); }

/* 车牌自定义软键盘（对标站：点格子弹键盘，不弹系统键盘） */
.sf-plate-kb { margin-top: 10px; background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, 3px); padding: 8px; }
.sf-kb-row { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px; justify-content: center; }
.sf-kb-row.sf-kb-digits .sf-kb-key { flex: 1 1 0; min-width: 0; }
.sf-kb-key { min-width: 30px; height: 38px; padding: 0 6px; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid var(--c-border-color, #EBEEF5); border-radius: 4px; font-size: 15px; color: var(--c-input-color, #333333); box-sizing: border-box; }
.sf-kb-prov .sf-kb-key { flex: 1 1 28px; }
.sf-kb-key:active { background: var(--c-active-color, #0076F0); color: #fff; border-color: var(--c-active-color, #0076F0); }
.sf-kb-actions { display: flex; gap: 8px; margin-top: 4px; }
.sf-kb-actions .sf-kb-key { flex: 1; font-size: 14px; }
.sf-kb-done { background: var(--c-active-color, #0076F0); color: #fff; border-color: var(--c-active-color, #0076F0); }
/* 选择类的三种风格作用在**选项区**（s1/s2/s3），与输入类的 box/line 语义不同：
     sfx-optbox   描边 + 浅底（整块一个框，行间有分隔线）
     sfx-optplain 纯白底、去框，每个选项独立成卡（行间距拉开）
     sfx-optline  去框，仅行间底线（最轻） */
.sfx-optbox .sf-opts { background: var(--c-input-bg, #F7F9FA); border: 1px solid var(--c-inactive-border, #dcdfe6); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.sfx-optbox .sf-opt-row + .sf-opt-row { border-top: 1px solid var(--c-inactive-border, #dcdfe6); }
.sfx-optplain .sf-opts { background: transparent; border: none; border-radius: 0; gap: var(--c-input-pad-x, 10px); }
.sfx-optplain .sf-opt-row { background: #FFFFFF; border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 3px)); }
.sfx-optline .sf-opts { background: transparent; border: none; border-radius: 0; }
.sfx-optline .sf-opt-row + .sf-opt-row { border-top: 1px solid var(--c-border-color, #dcdfe6); }
/* 选项行消费「组件风格」的 --c-input-pad-x（左右边距）：此前写死 `padding: 8px 0`，
   导致选择类的左右边距是死参数（变量已注入但无元素消费，实测 paddingLeft 恒 0px）。 */
.sf-opt-row { display: flex; align-items: center; gap: 8px; font-size: var(--c-input-size, 14px); color: var(--c-option-color, #333333); padding: 8px var(--c-input-pad-x, 10px); }
/* 「选项类型」三态（content.optionType：文字/图片/图文）。
   text    圆点/勾选框 + 文案（基础样式）
   image   仅图片，横向等分排列（每项一个方形图）
   imageText 图 + 文案，横向等分（每项一列：图上文下）
   尺寸走 --c-option-img-size（默认 40px），可在面板「组件风格」里调。 */
.sf-opt-row.image { flex-direction: column; gap: 4px; padding: var(--c-input-pad-x, 10px) 4px; }
.sf-opt-row.imageText { flex-direction: column; gap: 4px; padding: var(--c-input-pad-x, 10px) 4px; }
/* 注：圆点/勾选框在模板里已是第一个子元素，column 布局下自然落在图上方。
   此前给它们加了 order:-1，会被推到选项行**之外**（浮在选项区顶部），故已移除。 */
.sf-opt-img { width: var(--c-option-img-size, 40px); height: var(--c-option-img-size, 40px); border-radius: var(--c-option-img-radius, 3px); background: var(--c-input-bg, #F7F9FA); flex-shrink: 0; }
/* 未配图的选项：灰色占位块 + 序号（空 src 的 <image> 会渲染破图） */
.sf-opt-img-ph { display: flex; align-items: center; justify-content: center; font-size: 13px; color: #a8abb2; background: #f0f1f3; }
.sf-opt-label { flex: 1; min-width: 0; }
.sf-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; position: relative; flex-shrink: 0; box-sizing: border-box; }
.sf-dot.on { border-color: var(--c-active-color, #2667EC); }
.sf-dot.on::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--c-active-color, #2667EC); }
.sf-checkbox { width: 18px; height: 18px; border-radius: 3px; border: 1px solid var(--c-inactive-border, #dcdfe6); background: #fff; text-align: center; line-height: 18px; font-size: 12px; color: #fff; flex-shrink: 0; box-sizing: border-box; }
.sf-checkbox.on { background: var(--c-active-color, #2667EC); border-color: var(--c-active-color, #2667EC); }
.sf-opt-other { align-items: center; }
.sf-other { flex: 1; border: 1px solid var(--c-border-color, #dcdfe6); border-radius: var(--c-input-radius, 3px); padding: 6px 8px; font-size: var(--c-input-size, 14px); background: #fff; box-sizing: border-box; }

/* ── 对标站 CSSOM 实测补齐（2026-10-04 精读） ──────────────────────────
   1) 风格3 = 胶囊按钮，选中态填 --c-active-color 蓝底白字：
      .top-box3-radio .el-radio.is-checked .el-radio__label {
        background: var(--active-color); border-color: var(--active-color); color: #fff; }
      我方此前三档选中态都只改圆点/勾选框颜色，选项胶囊本身不变色 → 风格3 视觉缺失。
      用 sfx-optfill 标记（仅 styleVariant 在 styleType==='s3' 时挂）。
   2) 风格2 选中态文字**保持 --c-option-color 不变**（对标站原本如此）。 */
.sfx-optfill .sf-opt-row { border-radius: var(--c-input-radius, 3px); }
.sfx-optfill .sf-opt-row.on { background: var(--c-active-color, #2667EC); border-color: var(--c-active-color, #2667EC); }
.sfx-optfill .sf-opt-row.on .sf-opt-label { color: #FFFFFF; }
.sfx-optfill .sf-opt-row.on .sf-dot { border-color: #FFFFFF; background: #FFFFFF; }
.sfx-optfill .sf-opt-row.on .sf-dot::after { background: var(--c-active-color, #2667EC); }
.sfx-optfill .sf-opt-row.on .sf-checkbox { border-color: #FFFFFF; background: #FFFFFF; color: var(--c-active-color, #2667EC); }

/* 「选项文字对齐」（对标站 --align-items，默认 left）。 */
.sf-opts { text-align: var(--c-opt-align, left); }
.sf-opt-label { text-align: inherit; }

/* ── 组件级「上下布局 / 左右布局」（对标站 field-wrapper-radio-top / -left） ──
   上下布局：标题独占一行（默认结构即为如此，不额外处理）
   左右布局：标题与内容同行，标题固定 90px（对标站 label width:90px; content margin-left:90px） */
.sf-field.sf-layout-left { display: flex; align-items: flex-start; }
.sf-field.sf-layout-left > .sf-label { width: 90px; flex-shrink: 0; line-height: 20px; padding-top: 2px; }
.sf-field.sf-layout-left > .sf-opts,
.sf-field.sf-layout-left > .sf-input,
.sf-field.sf-layout-left > .sf-text,
.sf-field.sf-layout-left > .sf-textarea-box,
.sf-field.sf-layout-left > .sf-number,
.sf-field.sf-layout-left > .sf-casc,
.sf-field.sf-layout-left > .sf-upload { flex: 1; min-width: 0; margin-left: 90px; }
/* 左右布局时标题垂直居中于首行（对标站 .field-wrapper-label-left .el-form-item__label { top: 18px }） */
.sf-field.sf-layout-left.sfx-optbox > .sf-label,
.sf-field.sf-layout-left.sfx-optplain > .sf-label,
.sf-field.sf-layout-left.sfx-optline > .sf-label { padding-top: 10px; }
/* 用 view 渲染提交按钮（见模板注释），因此 button 的两个默认样式必须自己补回来：
   ① text-align:center（view 默认居左，不补文字会靠左）② line-height 显式写死（uni-button 内部
   自带 2.55，用 button 标签时覆盖不到、且 H5/小程序不一致）。显式 1.2 + box-sizing 后高度恒为
   padding*2 + 19.2 + 边框，与装修画布预览同源同值。 */
/* L 档（docs/规范/08-装修中心按钮规范.md，对齐微信官方 WeUI default）：
   96rpx(48px) 高 / 34rpx(17px) 字号。原为 padding 12px + font 16px（≈45px 高），低于官方
   7-9mm 热区要求（≈44px，375 基准）。
   - 高度由 height 锁定而非 padding 撑，配合 flex 居中：padding 撑高会随字号漂移，且 border
     在 border-box 下会挤压内容区导致文字不居中。
   - 圆角保持设计器配置 --c-input-radius（默认 22px 胶囊），不强行改成规范的方角 8px ——
     见规范决策点 3「默认 L 档，允许设计器覆盖」；表单按钮样式属表单范畴，改默认值会波及
     所有存量表单。
   - 改高度/字号必须同步改 ComponentRender.vue 的 .r-sf-btn 与 sfBtnStyle()。 */
.sf-submit { width: 100%; box-sizing: border-box; border: 1px solid var(--c-border-color, #0076F0); border-radius: var(--c-input-radius, 24px); padding: 0 24rpx; background: var(--c-input-bg, #0076F0); color: var(--c-title-color, #FFFFFF); height: 96rpx; font-size: 34rpx; display: flex; align-items: center; justify-content: center; line-height: 1.2; text-align: center; margin-top: 6px; }
.sf-ended { text-align: center; color: #909399; padding: 30px; }
.sf-empty { text-align: center; color: #c0c4cc; padding: 30px; }
.sf-loc { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-icon-color, #000000); background: var(--c-input-bg, #F7F9FA); text-align: center; }
.sf-agree { display: flex; align-items: flex-start; gap: 8px; font-size: var(--c-input-size, 13px); color: var(--c-input-color, #333333); flex-wrap: wrap; }
.sf-check { width: 18px; height: 18px; border: 1px solid var(--c-inactive-border, #F5F2F2); border-radius: 4px; text-align: center; line-height: 18px; color: #fff; flex-shrink: 0; }
.sf-check.on { background: var(--c-check-color, #4385FF); border-color: var(--c-check-color, #4385FF); }
.sf-agree-text { flex: 1; }
.sf-link { color: var(--c-agree-btn, #2667EC); }
.sf-rate { display: flex; flex-direction: column; gap: 4px; }
.sf-rate-desc { color: var(--c-desc-color, #999999); font-size: 12px; }
.sf-rate-icons { display: flex; gap: 4px; }
.sf-star { font-size: 26px; color: var(--c-inactive-color, #C6D1DE); }
.sf-star.on { color: var(--c-active-color, #F7BA2A); }
.sf-download { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-file-size, 14px); color: var(--c-file-title, #333333); background: var(--c-input-bg, #F7F9FA); text-align: center; }
.sf-download::after { content: ' 下载'; color: var(--c-down-color, #4385FF); }
.sf-auth { border: 1px solid var(--c-border-color, #F5F2F2); border-radius: var(--c-input-radius, var(--g-input-radius, 6px)); padding: 10px var(--c-input-pad-x, 10px); font-size: var(--c-input-size, 14px); color: var(--c-empower-color, #4385FF); text-align: center; background: var(--c-input-bg, #F7F9FA); }
.sf-sms { display: flex; flex-direction: column; gap: 8px; }
.sf-sms-row { display: flex; gap: var(--c-inner-margin, 8px); align-items: stretch; }
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
/* 数字步进器（styleType=step）：operateBg/operateRadius/operateBorder 驱动按钮 */
.sf-number { display: flex; align-items: stretch; gap: 8px; }
.sf-number .sf-input { flex: 1; }
.sf-slider { display: flex; align-items: center; gap: 12px; }
.sf-slider-ctrl { flex: 1; margin: 0; }
.sf-slider-val { min-width: 40px; text-align: right; font-size: var(--c-input-size, 14px); color: var(--c-title-color, #000000); font-weight: 600; }
.sf-step-btn { width: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; line-height: 1; background: var(--c-operate-bg, #FFFFFF); color: var(--c-title-color, #333333); border: 1px solid var(--c-operate-border, #dcdfe6); border-radius: var(--c-operate-radius, 3px); user-select: none; }
.sf-step-btn:active { opacity: 0.8; }
/* 文本扫码图标：scanCodeIcon 驱动颜色 */
.sf-text { position: relative; display: flex; align-items: center; }
.sf-text.scan .sf-input { padding-right: 38px; }
.sf-scan { position: absolute; right: 10px; font-size: 22px; line-height: 1; }
/* 支付数量步进器 + 底部合计栏：operate 系列与 bottomColor 驱动 */
.sf-pay-qty { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.sf-pay-qty-label { font-size: 13px; color: var(--c-input-color, #333333); }
.sf-pay-qty-val { min-width: 28px; text-align: center; font-size: 15px; font-weight: 600; color: var(--c-title-color, #000000); }
.sf-pay-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--c-border-color, #F7F9FA); }
.sf-pay-total { font-size: 16px; font-weight: 600; }
.sf-pay-buy { background: var(--c-active-color, #2667EC); color: #fff; padding: 8px 18px; border-radius: var(--c-input-radius, 19px); font-size: 14px; }
/* 轮播自定义指示点：dotGap/dotBottom 驱动间距与底边距，activeColor 驱动高亮 */
.sf-swiper-dots { position: absolute; left: 0; right: 0; display: flex; justify-content: center; align-items: center; pointer-events: none; }
.sf-dot-item { width: 8px; height: 8px; border-radius: 50%; background: rgba(255, 255, 255, 0.55); transition: all .2s; }
.sf-dot-item.on { background: var(--c-active-color, #2667EC); width: 18px; border-radius: 4px; }
/* 标题分隔线：lineColor 驱动 */
.sf-title-line { border-top: 1px solid var(--c-line-color, #434343); margin-top: 8px; }
.sf-nav { display: flex; gap: 12px; margin-top: 6px; }
.sf-prev { flex: 1; border: 1px solid var(--c-prev-border, #dcdfe6); border-radius: var(--c-input-radius, 19px); padding: 12px; background: var(--c-prev-bg, #fff); color: var(--c-prev-color, #303133); font-size: 16px; text-align: center; }
.sf-prev.disabled { opacity: 0.5; pointer-events: none; }

/* ===== P3 装修/协议/文件 组件样式 ===== */
.sf-agree-row { display: flex; align-items: flex-start; gap: 8px; font-size: var(--c-input-size, 13px); color: var(--c-input-color, #333333); flex-wrap: wrap; }
.sf-agree-row .sf-check { margin-top: 1px; }
.sf-title-main { display: block; font-weight: 600; }
.sf-title-sub { display: block; font-size: var(--c-subtitle-size, 13px); color: var(--c-subtitle-color, #909399); margin-top: 4px; font-weight: 400; }
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

/* ---- 内嵌模式（装修组件内）覆盖 ----
   page 模式：整页灰底 + 16px 外边距，组件自成一卡
   embed 模式：不吃整屏页面底色/边距，组件仍是独立白卡、卡间透出宿主页底色
   （卡片白底由各组件 inline backgroundColor 提供，容器不再着色）。 */
.sf-page.sf-embed { background: transparent; min-height: 0; padding: 0; }
.sf-page.sf-embed .sf-holder { background: transparent; padding: 0; }
.sf-page.sf-embed .sf-form { background: transparent; padding: 0; }
/* 内嵌模式：卡片外边距交由宿主页面负责（否则会与宿主 padding 叠加出现双倍留白） */
.sf-page.sf-embed .sf-field { margin-left: 0; margin-right: 0; }
</style>
