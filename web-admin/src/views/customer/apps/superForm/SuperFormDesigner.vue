<template>
  <div class="sf-designer">
    <!-- 顶栏（对齐 ew：深色横条 + 基础布局按钮组点亮 + 右侧图标动作） -->
    <div class="sf-topbar">
      <button class="sf-tb-btn sf-tb-back" @click="$emit('close')">← 返回</button>
      <span class="sf-title">超级表单设计器</span>
      <div class="sf-tb-group">
        <span class="sf-tb-label">基础布局：</span>
        <button class="sf-tb-btn" :class="{ on: settings.layout === 'vertical' }" @click="settings.layout = 'vertical'">上下布局</button>
        <button class="sf-tb-btn" :class="{ on: settings.layout === 'horizontal' }" @click="settings.layout = 'horizontal'">左右布局</button>
        <button class="sf-tb-btn" :class="{ on: panelMode === 'style' }" @click="openPanel('style')">样式设置</button>
      </div>
      <div class="sf-tb-right">
        <button class="sf-tb-link" :class="{ on: panelMode === 'settings' }" @click="openPanel('settings')"><span class="sf-tb-ico">⊙</span> 表单设置</button>
        <button class="sf-tb-link" @click="save(false)"><span class="sf-tb-ico">💾</span> 保存页面</button>
        <button class="sf-tb-link" @click="save(true)"><span class="sf-tb-ico">💾</span> 保存并发布</button>
      </div>
    </div>

    <div class="sf-body">
      <!-- 左：组件库（对齐 ew：灰色分组条 + 3 列彩色图标卡片网格） -->
      <div class="sf-palette">
        <div v-for="group in palette" :key="group.category" class="sf-pal-group">
          <div class="sf-pal-cat">{{ group.category }}</div>
          <div class="sf-pal-items">
            <div
              v-for="item in group.items"
              :key="item.type"
              class="sf-pal-item"
              draggable="true"
              :title="item.label + '（点击或拖入画布）'"
              @click="addComponent(item.type)"
              @dragstart="onPaletteDrag(item.type, $event)"
            >
              <span class="sf-pal-icon" :style="{ background: group.color }">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="ICONS[item.type] || ''" />
              </span>
              <span class="sf-pal-label">{{ item.label }}</span>
            </div>
            <!-- 补齐网格空位，保证边框闭合（对齐原版表格线） -->
            <div v-if="group.items.length % 3" class="sf-pal-fill" :style="{ gridColumn: 'span ' + (3 - (group.items.length % 3)) }" />
          </div>
        </div>
      </div>

      <!-- 中：手机预览 -->
      <div class="sf-canvas">
        <div class="sf-phone">
          <div class="sf-phone-status"><span>13:32</span><span>▂▄▆ ⏻</span></div>
          <div class="sf-phone-nav"><span class="sf-phone-nav-title">表单</span><span class="sf-phone-capsule">⋯ ◎</span></div>
          <div
            class="sf-phone-body"
            :class="settings.layout"
            :style="phoneStyle"
            @dragover.prevent="dragOverIdx = components.length"
            @drop="onDrop(components.length, $event)"
          >
            <div v-for="(comp, idx) in components" :key="comp.id" class="sf-comp-wrap"
                 :class="{ 'cs-line': comp.style && comp.style.styleType === 'line' }" :style="compWrapStyle(comp)">
              <div v-if="dragOverIdx === idx" class="sf-drop-line" />
              <div
                class="sf-comp"
                :class="{ active: comp.id === selectedId }"
                draggable="true"
                @click="selectComp(comp.id)"
                @dragstart="onCompDrag(comp.id, $event)"
                @dragend="resetDrag"
                @dragover.prevent.stop="dragOverIdx = idx"
                @drop.stop="onDrop(idx, $event)"
              >
                <div class="sf-comp-ops" v-if="comp.id === selectedId">
                  <span @click.stop="remove(idx)">✕</span>
                </div>
                <ComponentPreview :comp="comp" />
              </div>
            </div>
            <div v-if="dragOverIdx === components.length" class="sf-drop-line" />
            <div v-if="!components.length" class="sf-empty">请从左侧列表中选择一个组件，然后用鼠标拖动组件放置于此处.</div>
          </div>
        </div>
      </div>

      <!-- 右：属性面板（对齐 ew：组件属性 / 全局样式 / 表单设置 三模式） -->
      <div class="sf-props">
        <!-- 选中组件：内容/样式 -->
        <template v-if="panelMode === 'props' && selected">
          <div class="sf-panel-head">{{ COMPONENT_LABEL[selected.type] || '组件' }}</div>
          <div class="sf-seg">
            <div class="sf-seg-item" :class="{ on: propTab === 'content' }" @click="propTab = 'content'">内容设置</div>
            <div class="sf-seg-item" :class="{ on: propTab === 'style' }" @click="propTab = 'style'">样式设置</div>
          </div>
          <div v-if="propTab === 'content'" class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <el-form-item label="是否显示" v-if="selected.type !== 'submit' && !noPropTypes.includes(selected.type)">
                <el-radio-group v-model="selected.content.required">
                  <el-radio :value="true">显示</el-radio>
                  <el-radio :value="false">隐藏</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item label="是否必填" v-if="selected.type !== 'submit' && !noPropTypes.includes(selected.type)">
                <el-radio-group v-model="selected.content.required">
                  <el-radio :value="true">必填</el-radio>
                  <el-radio :value="false">非必填</el-radio>
                </el-radio-group>
              </el-form-item>

              <template v-if="selected.type === 'text' || selected.type === 'textarea'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="预填文字"><el-input v-model="selected.content.prefill" /></el-form-item>
                <el-form-item label="只读">
                  <el-switch v-model="selected.content.readonly" />
                  <span class="sf-hint">开启只读则仅显示"预填文字"，用户无法修改</span>
                </el-form-item>
                <el-form-item label="内容类型">
                  <el-select v-model="selected.content.contentType">
                    <el-option label="普通" value="normal" />
                    <el-option label="手机号码" value="phone" />
                    <el-option label="邮箱" value="email" />
                    <el-option label="身份证" value="idcard" />
                  </el-select>
                </el-form-item>
                <el-form-item label="同步姓名">
                  <el-switch v-model="selected.content.syncName" />
                </el-form-item>
                <el-form-item label="输入限制">
                  最少 <el-input-number v-model="selected.content.minLength" :min="0" :max="400" /> 位 ·
                  最多 <el-input-number v-model="selected.content.maxLength" :min="0" :max="400" /> 位
                </el-form-item>
                <el-form-item label="内容校验">
                  <el-switch v-model="selected.content.verifyRepeat" active-text="相同内容不可重复提交" />
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'image'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="最多上传">
                  <el-input-number v-model="selected.content.maxCount" :min="1" :max="9" />
                </el-form-item>
              </template>

              <template v-else-if="['radio', 'checkbox', 'select'].includes(selected.type)">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="选项">
                  <div v-for="(opt, oi) in selected.content.options" :key="oi" class="sf-opt-row">
                    <el-input v-model="opt.label" placeholder="选项文案" style="width: 160px" />
                    <el-button text type="danger" @click="selected.content.options.splice(oi, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.options.push({ label: '新选项', value: String(selected.content.options.length + 1) })">+ 添加选项</el-button>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'date'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="类型">
                  <el-radio-group v-model="selected.content.dateType">
                    <el-radio value="date">日期</el-radio><el-radio value="time">日期+时间</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'number'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="数值范围">最小 <el-input-number v-model="selected.content.min" :min="0" /> 最大 <el-input-number v-model="selected.content.max" :min="0" /></el-form-item>
                <el-form-item label="默认值"><el-input v-model="selected.content.defaultValue" placeholder="选填" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'time'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="类型">
                  <el-radio-group v-model="selected.content.dateType">
                    <el-radio value="date">日期</el-radio><el-radio value="time">时间</el-radio><el-radio value="datetime">日期+时间</el-radio>
                  </el-radio-group>
                </el-form-item>
              </template>

              <template v-else-if="selected.type === 'location'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="按钮文案"><el-input v-model="selected.content.tipText" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'attachment'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="最多上传"><el-input-number v-model="selected.content.maxCount" :min="1" :max="9" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'agreement'">
                <el-form-item label="协议正文"><el-input v-model="selected.content.label" type="textarea" :rows="2" /></el-form-item>
                <el-form-item label="必须勾选">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">是</el-radio><el-radio :value="false">否</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="链接文案"><el-input v-model="selected.content.linkText" /></el-form-item>
                <el-form-item label="链接地址"><el-input v-model="selected.content.linkUrl" placeholder="https://" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'rate'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="最高分值"><el-input-number v-model="selected.content.max" :min="3" :max="10" /></el-form-item>
                <el-form-item label="默认分值"><el-input-number v-model="selected.content.defaultValue" :min="0" :max="selected.content.max" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'filedownload'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="文件名称"><el-input v-model="selected.content.fileName" /></el-form-item>
                <el-form-item label="文件地址"><el-input v-model="selected.content.fileUrl" placeholder="https://" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'phoneauth'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="按钮文案"><el-input v-model="selected.content.placeholder" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'sms'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
                <el-form-item label="按钮文案"><el-input v-model="selected.content.buttonText" /></el-form-item>
                <el-form-item label="说明"><span class="sf-hint">实际下发短信验证码需接入短信服务，当前为演示交互。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'carplate'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="是否必填">
                  <el-radio-group v-model="selected.content.required">
                    <el-radio :value="true">必填</el-radio><el-radio :value="false">非必填</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.placeholder" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'title'">
                <el-form-item label="标题文字"><el-input v-model="selected.content.text" /></el-form-item>
                <el-form-item label="文字大小"><el-input-number v-model="selected.content.size" :min="12" :max="40" /> px</el-form-item>
                <el-form-item label="对齐方式">
                  <el-radio-group v-model="selected.content.align">
                    <el-radio value="left">左</el-radio><el-radio value="center">中</el-radio><el-radio value="right">右</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="文字颜色"><el-color-picker v-model="selected.content.color" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'richtext'">
                <el-form-item label="富文本"><el-input v-model="selected.content.html" type="textarea" :rows="4" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'blank'">
                <el-form-item label="高度"><el-input-number v-model="selected.content.height" :min="1" :max="200" /> px</el-form-item>
              </template>

              <template v-else-if="selected.type === 'line'">
                <el-form-item label="线条样式">
                  <el-select v-model="selected.content.style">
                    <el-option label="实线" value="solid" />
                    <el-option label="虚线" value="dashed" />
                    <el-option label="点线" value="dotted" />
                  </el-select>
                </el-form-item>
                <el-form-item label="线条颜色"><el-color-picker v-model="selected.content.color" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'swiper'">
                <el-form-item label="图片地址">
                  <div v-for="(img, si) in selected.content.images" :key="si" class="sf-opt-row">
                    <el-input v-model="selected.content.images[si]" placeholder="图片 URL" style="width: 220px" />
                    <el-button text type="danger" @click="selected.content.images.splice(si, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.images.push('')">+ 添加图片</el-button>
                </el-form-item>
                <el-form-item label="高度"><el-input-number v-model="selected.content.height" :min="60" :max="400" /> px</el-form-item>
              </template>

              <template v-else-if="selected.type === 'bigimage'">
                <el-form-item label="图片地址"><el-input v-model="selected.content.image" placeholder="图片 URL" /></el-form-item>
                <el-form-item label="跳转链接"><el-input v-model="selected.content.link" placeholder="选填，点击大图跳转" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'video'">
                <el-form-item label="视频地址"><el-input v-model="selected.content.src" placeholder="视频 URL" /></el-form-item>
                <el-form-item label="封面图"><el-input v-model="selected.content.poster" placeholder="选填" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'backdesc'">
                <el-form-item label="描述文字"><el-input v-model="selected.content.text" type="textarea" :rows="3" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'realtime'">
                <el-form-item label="模块标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="动态文案"><el-input v-model="selected.content.title" placeholder="如：已有 0 人参与" /></el-form-item>
              </template>

              <template v-else-if="selected.type === 'pagebreak'">
                <el-form-item label="说明"><span class="sf-hint">分页组件用于把表单拆成多页，填写者需逐页填写后提交。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'pay'">
                <el-form-item label="支付标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="固定金额"><el-input-number v-model="selected.content.amount" :min="0" :precision="2" /> 元</el-form-item>
                <el-form-item label="支付规格">
                  <div v-for="(sp, spi) in selected.content.specs" :key="spi" class="sf-opt-row">
                    <el-input v-model="sp.name" placeholder="规格名" style="width: 110px" />
                    <el-input-number v-model="sp.price" :min="0" :precision="2" />
                    <el-button text type="danger" @click="selected.content.specs.splice(spi, 1)">删</el-button>
                  </div>
                  <el-button size="small" @click="selected.content.specs.push({ name: '新规格', price: 0 })">+ 添加规格</el-button>
                </el-form-item>
                <el-form-item label="支付方式">
                  <el-radio-group v-model="selected.content.payType">
                    <el-radio value="wechat">微信支付</el-radio>
                    <el-radio value="alipay">支付宝</el-radio>
                  </el-radio-group>
                </el-form-item>
                <el-form-item label="说明"><span class="sf-hint">实际微信/支付宝支付将在发布后接入，当前仅记录所选规格与金额。</span></el-form-item>
              </template>

              <template v-else-if="selected.type === 'submit'">
                <el-form-item label="内容标题"><el-input v-model="selected.content.label" /></el-form-item>
                <el-form-item label="提示文字"><el-input v-model="selected.content.tipText" placeholder="提交成功后显示的提示信息" /></el-form-item>
                <el-form-item label="轻提示">
                  <el-switch v-model="selected.content.lightTip" />
                  <span class="sf-hint">默认关闭，弹出提示文字，需点击确认按钮再跳转</span>
                </el-form-item>
              </template>
            </el-form>
          </div>

          <div v-else class="sf-prop-form">
            <div class="sf-sec">组件风格</div>
            <div class="sf-style-cards">
              <div class="sf-style-card" :class="{ on: selected.style.styleType === 'box' }" @click="selected.style.styleType = 'box'">
                <div class="sf-style-demo"><span class="sd-bar" /><span class="sd-bar sd-long" /></div>
                <div class="sf-style-card-name">框风格</div>
              </div>
              <div class="sf-style-card" :class="{ on: selected.style.styleType === 'line' }" @click="selected.style.styleType = 'line'">
                <div class="sf-style-demo"><span class="sd-bar" /><span class="sd-line" /></div>
                <div class="sf-style-card-name">线风格</div>
              </div>
            </div>
            <el-form label-width="92px" size="small">
              <el-form-item label="左右边距">
                <el-slider v-model="selected.style.marginX" :min="0" :max="40" class="sf-inline-slider" />
                <el-input-number v-model="selected.style.marginX" :min="0" :max="40" size="small" style="width: 96px" /> px
              </el-form-item>
              <el-form-item label="输入框圆角"><el-input-number v-model="selected.style.radius" :min="0" :max="20" /> px</el-form-item>
              <el-form-item label="标题大小">
                <el-slider v-model="selected.style.titleSize" :min="12" :max="24" class="sf-inline-slider" />
                <el-input-number v-model="selected.style.titleSize" :min="12" :max="24" size="small" style="width: 96px" /> px
              </el-form-item>
              <el-form-item label="输入文本大小">
                <el-slider v-model="selected.style.inputSize" :min="12" :max="20" class="sf-inline-slider" />
                <el-input-number v-model="selected.style.inputSize" :min="12" :max="20" size="small" style="width: 96px" /> px
              </el-form-item>
            </el-form>
          </div>
        </template>

        <!-- 全局样式（对齐 ew：右栏面板，非弹窗） -->
        <template v-else-if="panelMode === 'style'">
          <div class="sf-panel-head">全局样式</div>
          <div class="sf-sec">基础布局</div>
          <el-radio-group v-model="settings.layout">
            <el-radio-button value="vertical">上下布局</el-radio-button>
            <el-radio-button value="horizontal">左右布局</el-radio-button>
          </el-radio-group>
          <div class="sf-sec">距离属性</div>
          <div class="sf-dist-rows">
            <div v-for="row in distRows" :key="row.key" class="sf-dist-row">
              <span class="sf-dist-label">{{ row.label }}：</span>
              <el-slider v-if="!row.noSlider" v-model="settings.globalStyle[row.key]" :min="0" :max="row.max" class="sf-dist-slider" />
              <el-input-number v-model="settings.globalStyle[row.key]" :min="0" :max="row.max" size="small" style="width: 96px" />
              <span class="sf-dist-unit">px</span>
            </div>
          </div>
          <div class="sf-sec">页面背景 <span class="sf-sec-note">（嵌入式表单不生效）</span></div>
          <div class="sf-color-row">
            <span class="sf-color-label">背景类型：</span>
            <el-radio-group v-model="settings.globalStyle.pageBgType">
              <el-radio value="color">颜色</el-radio>
              <el-radio value="imgcolor">图片+颜色</el-radio>
            </el-radio-group>
          </div>
          <div class="sf-color-row">
            <span class="sf-color-label">背景颜色：</span>
            <el-color-picker v-model="settings.globalStyle.pageBgColor" size="small" />
            <el-input v-model="settings.globalStyle.pageBgColor" size="small" style="width: 96px" />
            <el-button size="small" @click="settings.globalStyle.pageBgColor = '#F3F3F3'">重置</el-button>
          </div>
          <div v-if="settings.globalStyle.pageBgType === 'imgcolor'" class="sf-color-row">
            <span class="sf-color-label">背景图片：</span>
            <el-input v-model="settings.globalStyle.pageBgImage" size="small" style="flex: 1" placeholder="请选择图片" />
            <el-button size="small" @click="imgPickerTarget = 'pageBg'; imgPickerShow = true">选择图片</el-button>
          </div>
          <div class="sf-sec">组件颜色</div>
          <div class="sf-color-grid">
            <div v-for="row in colorRows" :key="row.key" class="sf-color-row">
              <span class="sf-color-label">{{ row.label }}：</span>
              <el-color-picker v-model="settings.globalStyle[row.key]" size="small" />
              <el-input v-model="settings.globalStyle[row.key]" size="small" style="width: 88px" />
              <el-button size="small" @click="settings.globalStyle[row.key] = row.def">重置</el-button>
            </div>
          </div>
        </template>

        <!-- 表单设置 -->
        <template v-else>
          <div class="sf-panel-head">表单设置</div>
          <div class="sf-seg">
            <div class="sf-seg-item" :class="{ on: formSettingsTab === 'basic' }" @click="formSettingsTab = 'basic'">基础设置</div>
            <div class="sf-seg-item" :class="{ on: formSettingsTab === 'logic' }" @click="formSettingsTab = 'logic'">逻辑设置</div>
          </div>
          <div v-if="formSettingsTab === 'basic'" class="sf-prop-form">
            <el-form label-width="92px" size="small">
              <el-form-item label="表单名称"><el-input v-model="settings.basic.name" /></el-form-item>
              <el-form-item label="收集时间">
                <el-date-picker v-model="settings.basic.collectStart" type="datetime" placeholder="开始" value-format="YYYY-MM-DD HH:mm" style="width: 170px" />
                <span style="margin: 0 6px">至</span>
                <el-date-picker v-model="settings.basic.collectEnd" type="datetime" placeholder="结束" value-format="YYYY-MM-DD HH:mm" style="width: 170px" />
              </el-form-item>
              <el-form-item label="允许修改"><el-switch v-model="settings.basic.allowModify" /></el-form-item>
              <div class="sf-sec">填写设置</div>
              <el-form-item label="填表人群">
                <el-select v-model="settings.basic.fillCrowd" style="width: 150px">
                  <el-option label="所有人" value="all" />
                  <el-option label="仅会员" value="member" />
                  <el-option label="员工及会员" value="staff" />
                </el-select>
                <el-checkbox v-model="settings.basic.crowdAddable" style="margin-left: 12px">填表人可增加</el-checkbox>
              </el-form-item>
              <el-form-item label="提交周期">
                <el-radio-group v-model="settings.basic.submitCycle">
                  <el-radio value="once">仅一次</el-radio>
                  <el-radio value="daily">每天一次</el-radio>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="settings.basic.submitCycle === 'daily'" label="周期范围">
                <el-date-picker v-model="settings.basic.cycleStart" type="date" placeholder="开始日期" value-format="YYYY-MM-DD" style="width: 140px" />
                <span style="margin: 0 6px">至</span>
                <el-date-picker v-model="settings.basic.cycleEnd" type="date" placeholder="结束日期" value-format="YYYY-MM-DD" style="width: 140px" />
              </el-form-item>
              <el-form-item label="次数">
                <el-input-number v-model="settings.basic.collectLimit" :min="0" />
                <span style="margin-left: 6px">次</span>
              </el-form-item>
              <div class="sf-hint sf-hint-block" style="margin: -12px 0 8px 92px">0代表不限制次数（游客填写时不受次数限制）</div>
              <el-form-item label="分享标题"><el-input v-model="settings.basic.shareTitle" placeholder="请输入分享标题" /></el-form-item>
              <el-form-item label="分享图片">
                <el-input v-model="settings.basic.shareImage" placeholder="请选择图片">
                  <template #append><el-button @click="imgPickerTarget = 'share'; imgPickerShow = true">选择图片</el-button></template>
                </el-input>
              </el-form-item>
              <div class="sf-sec">提交设置 <span class="sf-sec-note">（*注：该模块嵌入式表单不生效）</span></div>
              <el-form-item label="二次确认"><el-switch v-model="settings.submit.secondConfirm" /></el-form-item>
              <el-form-item label="跳转页面">
                <el-input v-model="settings.submit.jumpLink" placeholder="请选择链接或输入链接地址" />
                <div class="sf-hint sf-hint-block">不选则停留当前页面不进行跳转</div>
              </el-form-item>
            </el-form>
          </div>
          <div v-else class="sf-prop-form">
            <div class="sf-logic-tip">提示：请添加完所有组件之后再设置逻辑部分（分页以及提交按钮不参与逻辑部分设置）。你可以为选择类字段（单项选择、多项选择、评分、下拉选择）设定规则：填写者选择某字段的某选项后，显示该字段之后的其他字段。</div>
            <div v-for="(rule, ri) in settings.logic" :key="ri" class="sf-rule">
              <div class="sf-rule-title" @click="toggleRule(ri)">
                <span>规则 {{ ri + 1 }}</span>
                <span class="sf-rule-arrow" :class="{ open: ruleOpen(ri) }">⌄</span>
                <el-button text type="danger" @click.stop="settings.logic.splice(ri, 1)">删除</el-button>
              </div>
              <template v-if="ruleOpen(ri)">
                <div class="sf-rule-cond-label">当满足以下条件时</div>
                <div class="sf-rule-box">
                  <div v-for="(cond, ci) in rule.conditions" :key="ci" class="sf-rule-cond">
                    在
                    <el-select v-model="cond.compId" placeholder="请选择" style="width: 150px" @change="cond.option = ''">
                      <el-option v-for="c in choiceComponents" :key="c.id" :label="c.content.label" :value="c.id" />
                    </el-select>
                    <el-select v-model="cond.option" placeholder="请选择" style="width: 130px" :disabled="!cond.compId">
                      <el-option v-for="opt in optionsOf(cond.compId)" :key="opt.value" :label="opt.label" :value="opt.value" />
                    </el-select>
                    <el-button link type="danger" @click="removeCondition(rule, ci)">删除</el-button>
                  </div>
                  <el-button link type="primary" @click="addCondition(rule)">添加条件</el-button>
                </div>
                <div class="sf-rule-cond">
                  <el-radio-group v-model="rule.action">
                    <el-radio value="show">则显示字段</el-radio>
                    <el-radio value="end">则结束表单</el-radio>
                  </el-radio-group>
                </div>
                <div v-if="rule.action === 'show'" class="sf-rule-cond">
                  显示：
                  <el-select v-model="rule.showIds" multiple placeholder="选择要显示的字段" style="width: 280px">
                    <el-option v-for="c in showCandidate(rule)" :key="c.id" :label="c.content.label" :value="c.id" />
                  </el-select>
                </div>
              </template>
            </div>
            <div class="sf-rule-actions">
              <el-button type="primary" @click="addRule">+ 添加规则</el-button>
              <el-button type="primary" @click="confirmLogic">确定</el-button>
              <span class="sf-hint">请点击确认按钮完成逻辑设置部分</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <MaterialPicker v-model="imgPickerShow" @confirm="onPickImg" />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { getSuperForm, updateSuperForm } from '../../../../api/index.js';
import {
  COMPONENT_PALETTE, COMPONENT_ICONS, createComponent, defaultSettings, COMPONENT_LABEL,
} from './components.js';
import ComponentPreview from './ComponentPreview.vue';
import MaterialPicker from '../design/MaterialPicker.vue';

const props = defineProps({ formId: [Number, String], formName: String });
const emit = defineEmits(['close']);

const palette = COMPONENT_PALETTE;
const ICONS = COMPONENT_ICONS;
const components = ref([]);
const settings = reactive(defaultSettings());
const selectedId = ref(null);
// 右栏三模式：props=组件属性 / style=全局样式 / settings=表单设置（对齐 ew）
const panelMode = ref('settings');
const propTab = ref('content');
const formSettingsTab = ref('basic');
const saving = ref(false);
const imgPickerShow = ref(false);
const imgPickerTarget = ref('share'); // share=分享图片 / pageBg=页面背景图片
function onPickImg(url) {
  if (!url) return;
  if (imgPickerTarget.value === 'pageBg') settings.globalStyle.pageBgImage = url;
  else settings.basic.shareImage = url;
}

const selected = computed(() => components.value.find((c) => c.id === selectedId.value) || null);
// 选择类字段（对齐 ew：含评分）
const choiceComponents = computed(() => components.value.filter((c) => ['radio', 'checkbox', 'select', 'rate'].includes(c.type)));
// 纯展示/特殊组件不显示「是否显示 / 是否必填」表头
const noPropTypes = ['pagebreak', 'backdesc', 'realtime', 'swiper', 'bigimage', 'title', 'richtext', 'blank', 'line', 'video', 'pay'];
// 全局样式距离属性行（对齐 ew：两个「左右边距」分别为页面级 / 组件级；圆角行无滑杆）
const distRows = [
  { key: 'marginTop', label: '顶外边距', max: 100 },
  { key: 'marginY', label: '上下边距', max: 100 },
  { key: 'marginX', label: '左右边距', max: 100 },
  { key: 'radius', label: '组件圆角', max: 40, noSlider: true },
  { key: 'compMarginX', label: '左右边距', max: 100 },
  { key: 'inputRadius', label: '输入框圆角', max: 40, noSlider: true },
];
// 组件颜色行（对齐 ew：底框边框/标题颜色/输入文本/错误提示，两列 + 重置）
const colorRows = [
  { key: 'cBorder', label: '底框边框', def: '#F5F2F2' },
  { key: 'cTitle', label: '标题颜色', def: '#000000' },
  { key: 'cInput', label: '输入文本', def: '#333333' },
  { key: 'cError', label: '错误提示', def: '#ED4F4F' },
];

// 设计器手机预览应用全局样式（此前预览完全不生效）
const phoneStyle = computed(() => {
  const g = settings.globalStyle || {};
  const s = {
    marginTop: (g.marginTop || 0) + 'px',
    paddingTop: (g.marginY || 0) + 'px',
    paddingBottom: (g.marginY || 0) + 'px',
    paddingLeft: (g.marginX || 0) + 'px',
    paddingRight: (g.marginX || 0) + 'px',
    // 全局圆角（组件圆角 / 输入框圆角），供预览内组件经 CSS 变量消费
    '--g-radius': (g.radius || 0) + 'px',
    '--g-input-radius': (g.inputRadius != null ? g.inputRadius : 3) + 'px',
    // 组件颜色（对齐 ew）
    '--c-border-color': g.cBorder || '#F5F2F2',
    '--c-title-color': g.cTitle || '#000000',
    '--c-input-color': g.cInput || '#333333',
    '--c-error-color': g.cError || '#ED4F4F',
  };
  // 页面背景：颜色 / 图片+颜色
  if (g.pageBgColor) s.backgroundColor = g.pageBgColor;
  if (g.pageBgType === 'imgcolor' && g.pageBgImage) {
    s.backgroundImage = 'url("' + g.pageBgImage + '")';
    s.backgroundSize = 'cover';
    s.backgroundPosition = 'center';
  }
  return s;
});
// 组件级样式（左右边距 / 输入框圆角 / 标题与输入字号）——逐组件生效
function compWrapStyle(comp) {
  const st = comp.style || {};
  const g = settings.globalStyle || {};
  const mx = st.marginX != null ? st.marginX : (g.compMarginX || 0);
  return {
    paddingLeft: mx + 'px',
    paddingRight: mx + 'px',
    '--c-input-radius': st.radius != null ? st.radius + 'px' : 'var(--g-input-radius, 3px)',
    '--c-title-size': (st.titleSize || 14) + 'px',
    '--c-input-size': (st.inputSize || 14) + 'px',
  };
}

function openPanel(mode) { panelMode.value = mode; }
function selectComp(id) { selectedId.value = id; panelMode.value = 'props'; }
function optionsOf(compId) {
  const c = components.value.find((x) => x.id === compId);
  if (!c) return [];
  if (c.type === 'rate') {
    const max = c.content.max || 5;
    return Array.from({ length: max }, (_, i) => ({ label: `${i + 1} 分`, value: String(i + 1) }));
  }
  return c.content?.options || [];
}
function showCandidate(rule) {
  const condIds = (rule.conditions || []).map((c) => c.compId);
  return components.value.filter((c) => !condIds.includes(c.id) && c.type !== 'submit');
}

// —— 逻辑规则：多条件（兼容旧单条件 compId/option） ——
const ruleCollapse = ref({});
function ruleOpen(i) { return ruleCollapse.value[i] !== false; }
function toggleRule(i) { ruleCollapse.value[i] = !ruleOpen(i); }
function addRule() { settings.logic.push({ conditions: [{ compId: '', option: '' }], action: 'show', showIds: [] }); }
function addCondition(rule) { rule.conditions.push({ compId: '', option: '' }); }
function removeCondition(rule, i) { if (rule.conditions.length > 1) rule.conditions.splice(i, 1); }
function confirmLogic() { ElMessage.success('逻辑设置已应用，保存页面后生效'); }

function setLayout(v) { settings.layout = v; }
function addComponent(type) {
  components.value.push(createComponent(type));
  selectedId.value = components.value[components.value.length - 1].id;
  panelMode.value = 'props'; // 添加后右栏自动切到该组件属性（对齐 ew）
}
function remove(idx) {
  const id = components.value[idx].id;
  components.value.splice(idx, 1);
  if (selectedId.value === id) {
    selectedId.value = null;
    if (panelMode.value === 'props') panelMode.value = 'settings';
  }
}

// ——— 真·拖拽：组件库拖入画布 / 画布内重排 ———
const dragType = ref(null); // 从组件库拖入的类型
const dragId = ref(null);   // 画布内拖动的组件 id
const dragOverIdx = ref(-1); // 当前悬停插入位置

function onPaletteDrag(type, ev) {
  dragType.value = type;
  dragId.value = null;
  ev.dataTransfer.effectAllowed = 'copy';
  ev.dataTransfer.setData('text/plain', type);
}
function onCompDrag(id, ev) {
  dragId.value = id;
  dragType.value = null;
  ev.dataTransfer.effectAllowed = 'move';
  ev.dataTransfer.setData('text/plain', id);
}
function onDrop(targetIdx, ev) {
  ev.preventDefault();
  if (dragType.value) {
    const comp = createComponent(dragType.value);
    const i = Math.min(targetIdx, components.value.length);
    components.value.splice(i, 0, comp);
    selectedId.value = comp.id;
    panelMode.value = 'props';
  } else if (dragId.value) {
    const from = components.value.findIndex((c) => c.id === dragId.value);
    if (from === -1) return resetDrag();
    const [moved] = components.value.splice(from, 1);
    let to = targetIdx;
    if (from < targetIdx) to = targetIdx - 1;
    components.value.splice(to, 0, moved);
  }
  resetDrag();
}
function resetDrag() {
  dragType.value = null;
  dragId.value = null;
  dragOverIdx.value = -1;
}

async function load() {
  try {
    const f = await getSuperForm(props.formId);
    const cfg = f.config || {};
    const def = defaultSettings();
    components.value = Array.isArray(cfg.components) ? cfg.components : [];
    Object.assign(settings, def, cfg.settings || {});
    // 分组深合并，避免旧数据缺字段时面板绑定 undefined
    settings.basic = { ...def.basic, ...(cfg.settings?.basic || {}) };
    settings.submit = { ...def.submit, ...(cfg.settings?.submit || {}) };
    settings.globalStyle = { ...def.globalStyle, ...(cfg.settings?.globalStyle || {}) };
    // 逻辑规则统一为多条件结构（旧数据 compId/option → conditions[0]）
    settings.logic = (Array.isArray(cfg.settings?.logic) ? cfg.settings.logic : []).map((r) => ({
      ...r,
      action: r.action || 'show',
      showIds: r.showIds || [],
      conditions: (r.conditions && r.conditions.length) ? r.conditions : [{ compId: r.compId || '', option: r.option || '' }],
    }));
  } catch (e) { ElMessage.error(e.message || '加载失败'); }
}

async function save(publish) {
  saving.value = true;
  // 首条件回写 compId/option，兼容旧版 C 端渲染
  const logicCompat = settings.logic.map((r) => ({
    ...r,
    compId: r.conditions?.[0]?.compId || '',
    option: r.conditions?.[0]?.option || '',
  }));
  const payload = {
    name: settings.basic.name || '未命名表单',
    status: publish ? 'published' : undefined,
    config: { components: components.value, settings: JSON.parse(JSON.stringify({ ...settings, logic: logicCompat })) },
  };
  try {
    await updateSuperForm(props.formId, payload);
    ElMessage.success(publish ? '已保存并发布' : '已保存草稿');
    if (publish) emit('close');
  } catch (e) { ElMessage.error(e.message || '保存失败'); }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.sf-designer { height: 100%; display: flex; flex-direction: column; background: #f5f6f8; }
/* —— 顶栏：对齐 ew 深色横条 —— */
.sf-topbar { display: flex; align-items: center; gap: 14px; padding: 0 16px; height: 48px; background: #2a2e33; flex-shrink: 0; }
.sf-title { font-weight: 600; color: #fff; }
.sf-tb-group { display: flex; gap: 8px; align-items: center; }
.sf-tb-label { color: #fff; font-size: 13px; }
.sf-tb-btn { border: none; background: #45494f; color: #fff; font-size: 13px; padding: 6px 14px; border-radius: 4px; cursor: pointer; transition: background .15s; }
.sf-tb-btn:hover { background: #53575e; }
.sf-tb-btn.on, .sf-tb-btn.on:hover { background: #409eff; }
.sf-tb-back { background: transparent; }
.sf-tb-right { margin-left: auto; display: flex; gap: 20px; align-items: center; }
.sf-tb-link { border: none; background: transparent; color: #fff; font-size: 13px; cursor: pointer; padding: 14px 2px; border-bottom: 2px solid transparent; }
.sf-tb-link:hover { color: #c9d4ff; }
.sf-tb-link.on { color: #409eff; border-bottom-color: #409eff; }
.sf-tb-ico { font-size: 12px; margin-right: 2px; }
.sf-body { flex: 1; display: grid; grid-template-columns: 252px 1fr 360px; min-height: 0; }
/* —— 组件库：对齐 ew 原版（灰色分组条 + 3 列图标卡片 + 表格线网格） —— */
.sf-palette { background: #fff; border-right: 1px solid #ebedf0; overflow: auto; padding: 0; }
.sf-pal-group { margin-bottom: 0; }
.sf-pal-cat { background: #f5f6f8; border-bottom: 1px solid #ebedf0; padding: 9px 12px; font-size: 13px; color: #333; font-weight: 500; position: sticky; top: 0; z-index: 1; }
.sf-pal-items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #f0f1f3; }
.sf-pal-item { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 8px; padding: 14px 4px 12px; cursor: pointer; background: #fff; user-select: none; transition: background .15s; }
.sf-pal-item:hover { background: #f7fbf9; }
.sf-pal-item:hover .sf-pal-label { color: #165dff; }
.sf-pal-fill { background: #fff; }
.sf-pal-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0, 0, 0, .12); flex-shrink: 0; }
.sf-pal-icon svg { width: 19px; height: 19px; display: block; }
.sf-pal-label { font-size: 12px; color: #333; line-height: 1.2; text-align: center; }
.sf-canvas { overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 24px; }
.sf-phone { width: 375px; min-height: 640px; background: #f2f3f5; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,.08); display: flex; flex-direction: column; overflow: hidden; }
/* 状态栏（黑）+ 标题栏（白，含小程序胶囊），对齐 ew 手机预览 */
.sf-phone-status { height: 24px; background: #000; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 0 14px; font-size: 11px; flex-shrink: 0; }
.sf-phone-nav { height: 36px; background: #fff; display: flex; align-items: center; justify-content: center; position: relative; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; }
.sf-phone-nav-title { font-size: 14px; font-weight: 500; color: #303133; }
.sf-phone-capsule { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: #606266; border: 1px solid #e8e8e8; border-radius: 10px; padding: 1px 8px; background: #fafafa; }
.sf-phone-body { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 14px; align-content: flex-start; background: #f2f3f5; }
.sf-phone-body.horizontal { flex-direction: row; flex-wrap: wrap; align-content: flex-start; align-items: flex-start; }
/* 左右布局：每个字段约占半行（对齐 C 端 .sf-field 的 flex:1 1 45%） */
.sf-phone-body.horizontal .sf-comp-wrap { flex: 1 1 45%; box-sizing: border-box; min-width: 0; }
/* 线风格：输入类控件去边框，仅保留底线（对齐 ew 组件风格） */
.sf-comp-wrap.cs-line :deep(.cmpv-input),
.sf-comp-wrap.cs-line :deep(.cmpv-select),
.sf-comp-wrap.cs-line :deep(.cmpv-loc),
.sf-comp-wrap.cs-line :deep(.cmpv-auth),
.sf-comp-wrap.cs-line :deep(.cmpv-download),
.sf-comp-wrap.cs-line :deep(.cmpv-upload) { border: none; border-bottom: 1px solid var(--c-border-color, #dcdfe6); border-radius: 0; background: transparent; }
.sf-comp-wrap { position: relative; }
.sf-drop-line { height: 0; border-top: 2px solid #409eff; margin: 3px 2px; }
.sf-comp { position: relative; border: 1px solid transparent; border-radius: 8px; padding: 8px; cursor: grab; }
.sf-comp:active { cursor: grabbing; }
.sf-comp.active { border-color: #409eff; }
.sf-comp-ops { position: absolute; top: -12px; right: 6px; display: flex; gap: 6px; background: #409eff; color: #fff; border-radius: 4px; padding: 2px 6px; font-size: 12px; z-index: 2; }
.sf-comp-ops span { cursor: pointer; }
.sf-empty { color: #c0c4cc; font-size: 13px; text-align: center; margin-top: 60px; }
.sf-props { background: #fff; border-left: 1px solid #ebeef5; overflow: auto; padding: 14px; }
.sf-prop-form { margin-top: 8px; }
.sf-hint { color: #909399; font-size: 12px; margin-left: 6px; }
.sf-hint-block { margin-left: 0; margin-top: 4px; display: block; }
/* —— 右栏面板（对齐 ew：蓝条标题 + 大块分段 tab + 灰色分区条） —— */
.sf-panel-head { font-size: 16px; font-weight: 600; color: #303133; padding: 2px 0 8px 10px; border-left: 3px solid #409eff; margin-bottom: 12px; }
.sf-seg { display: flex; border-radius: 6px; overflow: hidden; margin-bottom: 14px; }
.sf-seg-item { flex: 1; text-align: center; padding: 10px 0; font-size: 14px; color: #606266; cursor: pointer; background: #f5f7fa; user-select: none; }
.sf-seg-item + .sf-seg-item { border-left: 1px solid #fff; }
.sf-seg-item.on { background: #409eff; color: #fff; }
.sf-sec { background: #f5f6f8; border-radius: 4px; padding: 8px 12px; font-size: 13px; color: #303133; font-weight: 500; margin: 12px 0; }
.sf-sec-note { font-weight: 400; color: #909399; font-size: 12px; }
.sf-dist-rows { padding: 2px 0; }
.sf-dist-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.sf-dist-label { width: 84px; font-size: 13px; color: #606266; text-align: right; flex-shrink: 0; }
.sf-dist-slider { flex: 1; }
.sf-dist-unit { font-size: 12px; color: #909399; }
.sf-inline-slider { flex: 1; margin-right: 10px; }
/* —— 颜色属性行（对齐 ew：色板 + 色值输入 + 重置） —— */
.sf-color-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; }
.sf-color-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.sf-color-label { width: 74px; font-size: 13px; color: #606266; text-align: right; flex-shrink: 0; }
/* —— 组件风格卡片（对齐 ew 框/线风格示意卡） —— */
.sf-style-cards { display: flex; gap: 12px; margin-bottom: 4px; }
.sf-style-card { width: 96px; border: 1px solid #dcdfe6; border-radius: 8px; padding: 10px; text-align: center; cursor: pointer; background: #fff; }
.sf-style-card.on { border-color: #409eff; box-shadow: 0 0 0 1px #409eff inset; }
.sf-style-demo { height: 44px; border-radius: 4px; border: 1px solid #ebeef5; display: flex; flex-direction: column; gap: 5px; align-items: flex-start; padding: 8px; }
.sd-bar { display: block; width: 40%; height: 6px; border-radius: 2px; background: #d9e4ff; }
.sd-long { width: 80%; }
.sd-line { display: block; width: 100%; height: 1px; background: #c0c4cc; margin-top: 8px; }
.sf-style-card-name { font-size: 12px; color: #606266; margin-top: 6px; }
/* —— 逻辑规则 —— */
.sf-logic-tip { font-size: 12px; color: #909399; margin-bottom: 10px; line-height: 1.7; }
.sf-rule { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.sf-rule-title { font-weight: 600; display: flex; align-items: center; gap: 4px; margin-bottom: 8px; cursor: pointer; }
.sf-rule-title .el-button { margin-left: auto; }
.sf-rule-arrow { display: inline-block; color: #909399; transition: transform .2s; }
.sf-rule-arrow.open { transform: rotate(180deg); }
.sf-rule-cond-label { font-size: 13px; color: #303133; margin: 4px 0 8px; }
.sf-rule-box { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
.sf-rule-cond { display: flex; align-items: center; gap: 8px; margin: 6px 0; font-size: 13px; color: #606266; flex-wrap: wrap; }
.sf-rule-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.sf-opt-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
</style>
